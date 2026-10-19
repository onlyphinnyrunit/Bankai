// App state, persistence and data rules.
import { kvGet, kvSet, blobKeys, blobDelete, initDb } from './db.js';
import { TEMPLATES, TEMPLATE_EXERCISES } from './templates.js';

export const DEFAULT_CATEGORIES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Cardio', 'Full body', 'Mobility'];

const STATE_KEY = 'state';
const SCHEMA = 1;

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function freshState() {
  return {
    schema: SCHEMA,
    onboarded: false,
    exercises: {},
    plans: [],
    sessions: [],
    checks: {},
    activeSession: null,
    aiz: { messages: [] },
    settings: {
      name: '',
      theme: 'dark',
      accent: 'violet',
      units: 'lb',
      defaultRest: 60,
      autoRest: true,
      logDetails: false,
      categories: DEFAULT_CATEGORIES.slice(),
    },
  };
}

export let state = freshState();

// ---------- sanitizing (used for loaded data and imported backups) ----------
const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));
const numOrNull = (v, min = 0, max = 100000) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
};
const idOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const httpUrl = (v) => {
  if (typeof v !== 'string') return '';
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; }
};

function cleanMedia(m) {
  if (!m || typeof m !== 'object') return null;
  const type = ['link', 'image', 'video'].includes(m.type) ? m.type : null;
  if (!type) return null;
  const out = { id: idOk(m.id) ? m.id : uid(), type, caption: str(m.caption, 300) };
  if (type === 'link') { out.url = httpUrl(m.url); if (!out.url) return null; }
  else { out.blobId = idOk(m.blobId) ? m.blobId : null; out.name = str(m.name, 200); out.size = numOrNull(m.size, 0, 1e12); out.mime = str(m.mime, 100); if (!out.blobId) return null; }
  return out;
}

function cleanExercise(e, id) {
  return {
    id,
    name: str(e.name, 120),
    category: str(e.category, 60),
    instructions: str(e.instructions, 8000),
    notes: str(e.notes, 8000),
    media: Array.isArray(e.media) ? e.media.map(cleanMedia).filter(Boolean).slice(0, 60) : [],
    createdAt: numOrNull(e.createdAt, 0, 1e14) || Date.now(),
  };
}

function cleanTarget(t) {
  return {
    sets: numOrNull(t.sets, 0, 99),
    reps: str(t.reps, 20),
    dur: numOrNull(t.dur, 0, 36000),
    rest: numOrNull(t.rest, 0, 3600),
    note: str(t.note, 500),
  };
}

function cleanPlan(p) {
  return {
    id: idOk(p.id) ? p.id : uid(),
    name: str(p.name, 80),
    group: str(p.group, 80),
    desc: str(p.desc, 400),
    days: Array.isArray(p.days) ? [...new Set(p.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [],
    items: Array.isArray(p.items) ? p.items.filter((i) => i && idOk(i.exerciseId)).map((i) => ({ id: idOk(i.id) ? i.id : uid(), exerciseId: i.exerciseId, ...cleanTarget(i) })).slice(0, 200) : [],
  };
}

function cleanSessionItem(i) {
  return {
    itemId: str(i.itemId, 64),
    exerciseId: str(i.exerciseId, 64),
    name: str(i.name, 120),
    target: cleanTarget(i.target || {}),
    sets: Array.isArray(i.sets) ? i.sets.slice(0, 99).map((x) => ({ done: !!(x && x.done), weight: str(x && x.weight, 12), reps: str(x && x.reps, 12) })) : [],
    done: !!i.done,
  };
}

function cleanTimer(t) {
  if (!t || typeof t !== 'object') return null;
  return { total: numOrNull(t.total, 0, 36000) || 0, endAt: numOrNull(t.endAt, 0, 1e14), left: numOrNull(t.left, 0, 36000), idx: numOrNull(t.idx, 0, 999) ?? 0 };
}

function cleanSession(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    id: idOk(s.id) ? s.id : uid(),
    planId: str(s.planId, 64),
    planName: str(s.planName, 80),
    startedAt: numOrNull(s.startedAt, 0, 1e14) || Date.now(),
    endedAt: numOrNull(s.endedAt, 0, 1e14),
    activeMs: numOrNull(s.activeMs, 0, 1e10) || 0,
    pausedAt: numOrNull(s.pausedAt, 0, 1e14),
    pausedMs: numOrNull(s.pausedMs, 0, 1e10) || 0,
    index: numOrNull(s.index, 0, 999) || 0,
    items: Array.isArray(s.items) ? s.items.map(cleanSessionItem) : [],
    rest: cleanTimer(s.rest),
    dtimer: cleanTimer(s.dtimer),
    note: str(s.note, 2000),
  };
}

export function sanitizeState(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object') return base;
  base.onboarded = !!raw.onboarded;
  const exs = raw.exercises && typeof raw.exercises === 'object' ? raw.exercises : {};
  for (const [id, e] of Object.entries(exs)) if (idOk(id) && e && typeof e === 'object') base.exercises[id] = cleanExercise(e, id);
  base.plans = Array.isArray(raw.plans) ? raw.plans.filter((p) => p && typeof p === 'object').map(cleanPlan) : [];
  // drop plan items whose exercise no longer exists
  for (const p of base.plans) p.items = p.items.filter((i) => base.exercises[i.exerciseId]);
  base.sessions = Array.isArray(raw.sessions) ? raw.sessions.map(cleanSession).filter(Boolean).slice(-5000) : [];
  base.activeSession = raw.activeSession ? cleanSession(raw.activeSession) : null;
  const msgs = raw.aiz && Array.isArray(raw.aiz.messages) ? raw.aiz.messages : [];
  base.aiz.messages = msgs.filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'aiz')).slice(-60).map((m) => ({
    id: idOk(m.id) ? m.id : uid(),
    role: m.role,
    text: str(m.text, 4000),
    at: numOrNull(m.at, 0, 1e14) || Date.now(),
    chips: Array.isArray(m.chips) ? m.chips.slice(0, 6).map((c) => str(c, 80)).filter(Boolean) : [],
    // actions are re-validated by aiz.js before anything is applied
    actions: Array.isArray(m.actions) ? m.actions.slice(0, 3).filter((a) => a && typeof a === 'object' && ['create_plans', 'update_plan', 'set_instructions'].includes(a.type)).map((a) => JSON.parse(JSON.stringify(a))) : [],
  }));
  if (raw.checks && typeof raw.checks === 'object') {
    for (const [day, plans] of Object.entries(raw.checks)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !plans || typeof plans !== 'object') continue;
      base.checks[day] = {};
      for (const [pid, ids] of Object.entries(plans)) if (Array.isArray(ids)) base.checks[day][str(pid, 64)] = ids.filter(idOk);
    }
  }
  const st = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const s = base.settings;
  s.name = str(st.name, 40);
  s.theme = ['dark', 'light', 'system'].includes(st.theme) ? st.theme : 'dark';
  s.accent = ['violet', 'magenta', 'sky', 'mint', 'amber'].includes(st.accent) ? st.accent : 'violet';
  s.units = st.units === 'kg' ? 'kg' : 'lb';
  s.defaultRest = numOrNull(st.defaultRest, 0, 3600) ?? 60;
  s.autoRest = st.autoRest !== false;
  s.logDetails = !!st.logDetails;
  s.tourDone = !!st.tourDone;
  if (Array.isArray(st.categories)) {
    const cats = [...new Set(st.categories.map((c) => str(c, 60).trim()).filter(Boolean))];
    if (cats.length) s.categories = cats.slice(0, 100);
  }
  return base;
}

// ---------- persistence ----------
let saveTimer = null;
let saving = Promise.resolve();
const saveListeners = new Set();
export function onSaved(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); }

export async function loadState() {
  await initDb();
  let raw;
  try { raw = await kvGet(STATE_KEY); } catch (e) { console.error(e); }
  state = sanitizeState(raw);
  pruneChecks();
  return state;
}

export function replaceState(next) { state = next; }

export function save(immediate = false) {
  clearTimeout(saveTimer);
  const doSave = () => {
    const snapshot = JSON.parse(JSON.stringify(state));
    saving = saving.then(() => kvSet(STATE_KEY, snapshot)).then(() => {
      saveListeners.forEach((fn) => fn(null));
    }).catch((e) => {
      console.error('Save failed', e);
      saveListeners.forEach((fn) => fn(e));
    });
    return saving;
  };
  if (immediate) return doSave();
  saveTimer = setTimeout(doSave, 200);
  return saving;
}

export function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; return save(true); } return saving; }

// ---------- dates ----------
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function startOfWeek(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - diff);
  return x;
}
function pruneChecks() {
  const cutoff = Date.now() - 21 * 864e5;
  for (const k of Object.keys(state.checks)) if (new Date(k + 'T00:00:00').getTime() < cutoff) delete state.checks[k];
}

// ---------- lookups ----------
export const getPlan = (id) => state.plans.find((p) => p.id === id);
export const getExercise = (id) => state.exercises[id];
export function plansUsing(exId) { return state.plans.filter((p) => p.items.some((i) => i.exerciseId === exId)); }
export function exerciseList() {
  return Object.values(state.exercises).sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
}
export function findExerciseByName(name) {
  const n = (name || '').trim().toLowerCase();
  return Object.values(state.exercises).find((e) => (e.name || '').trim().toLowerCase() === n);
}
export function todaysPlans(date = new Date()) {
  const d = date.getDay();
  return state.plans.filter((p) => p.days.includes(d) && p.items.length);
}
export function completedSessions() { return state.sessions.filter((s) => s.endedAt); }

// ---------- checks (today's checklist per plan) ----------
export function isChecked(planId, itemId, day = dayKey()) {
  return !!state.checks[day]?.[planId]?.includes(itemId);
}
export function setChecked(planId, itemId, on, day = dayKey()) {
  const d = (state.checks[day] ||= {});
  const list = (d[planId] ||= []);
  const i = list.indexOf(itemId);
  if (on && i < 0) list.push(itemId);
  if (!on && i >= 0) list.splice(i, 1);
  save();
}
export function checkedCount(plan, day = dayKey()) {
  const list = state.checks[day]?.[plan.id] || [];
  return plan.items.filter((i) => list.includes(i.id)).length;
}

// ---------- mutations ----------
export function newExercise(fields = {}) {
  const id = uid();
  state.exercises[id] = cleanExercise({ name: '', category: '', instructions: '', notes: '', media: [], ...fields }, id);
  save();
  return state.exercises[id];
}

export function newPlan(fields = {}) {
  const p = cleanPlan({ id: uid(), name: '', group: '', desc: '', days: [], items: [], ...fields });
  state.plans.push(p);
  save();
  return p;
}

export function addItemToPlan(plan, exerciseId, target = {}) {
  const item = { id: uid(), exerciseId, ...cleanTarget(target) };
  plan.items.push(item);
  save();
  return item;
}

export function deleteExercise(id) {
  const ex = state.exercises[id];
  if (!ex) return;
  for (const p of state.plans) p.items = p.items.filter((i) => i.exerciseId !== id);
  delete state.exercises[id];
  save();
  gcBlobs();
}

export function deletePlan(id) {
  state.plans = state.plans.filter((p) => p.id !== id);
  save();
}

export function duplicatePlan(plan) {
  const copy = cleanPlan(JSON.parse(JSON.stringify(plan)));
  copy.id = uid();
  copy.name = (plan.name || 'Workout') + ' (copy)';
  copy.items = copy.items.map((i) => ({ ...i, id: uid() }));
  const idx = state.plans.indexOf(plan);
  state.plans.splice(idx + 1, 0, copy);
  save();
  return copy;
}

// Remove stored files no exercise references anymore.
export async function gcBlobs() {
  try {
    const used = new Set();
    for (const e of Object.values(state.exercises)) for (const m of e.media) if (m.blobId) used.add(m.blobId);
    const keys = await blobKeys();
    for (const k of keys) if (!used.has(k)) await blobDelete(k);
  } catch (e) { console.warn('gc failed', e); }
}

// ---------- templates ----------
export function templateStatus(tpl) {
  return tpl.plans.every((p) => state.plans.some((x) => x.group === tpl.name && x.name === p.name));
}

export function loadTemplate(tplId) {
  const tpl = TEMPLATES.find((t) => t.id === tplId);
  if (!tpl) return 0;
  let added = 0;
  const exIds = {};
  for (const tp of tpl.plans) {
    if (state.plans.some((x) => x.group === tpl.name && x.name === tp.name)) continue;
    const plan = cleanPlan({ id: uid(), name: tp.name, group: tpl.name, desc: tp.desc || '', days: tp.days || [], items: [] });
    for (const it of tp.items) {
      const def = TEMPLATE_EXERCISES[it.ex];
      if (!exIds[it.ex]) {
        const existing = findExerciseByName(def.name);
        exIds[it.ex] = existing ? existing.id : newExercise({ name: def.name, category: def.category, instructions: def.instructions || '' }).id;
        if (def.category && !state.settings.categories.includes(def.category)) state.settings.categories.push(def.category);
      }
      plan.items.push({ id: uid(), exerciseId: exIds[it.ex], ...cleanTarget({ sets: it.sets ?? null, reps: it.reps || '', dur: it.dur ?? null, rest: null, note: it.note || '' }) });
    }
    state.plans.push(plan);
    added++;
  }
  save();
  return added;
}

export { TEMPLATES };
