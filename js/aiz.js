// Aiz chat screen + safe application of Aiz's suggestions.
import {
  state, save, uid, getPlan, getExercise, newPlan, newExercise, addItemToPlan, findExerciseByName,
  todaysPlans, completedSessions, deletePlan, plansUsing, deleteExercise,
} from './store.js';
import { h, icon, toast, confirmDialog } from './ui.js';
import { respond, MAX_INPUT } from './aiz-brain.js';
import { EXERCISES } from './aiz-kb.js';
import { go } from './app.js';

let mem = {}; // short-term conversation memory (resets on reload or Clear chat)

function on(root, signal, type, sel, fn) {
  root.addEventListener(type, (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(t, e); }, { signal });
}

// ---------- context handed to the on-device brain ----------
function buildContext() {
  const name = (e) => e?.name?.trim() || 'Untitled exercise';
  const plans = state.plans.map((p) => ({
    id: p.id, name: p.name?.trim() || 'Untitled workout', group: p.group, days: p.days,
    items: p.items.map((it) => ({ exerciseId: it.exerciseId, name: name(getExercise(it.exerciseId)), sets: it.sets, reps: it.reps, dur: it.dur, rest: it.rest, note: it.note })),
  }));
  const now = new Date();
  const tIds = new Set(todaysPlans(now).map((p) => p.id));
  return {
    now, units: state.settings.units, name: state.settings.name,
    plans, todayPlans: plans.filter((p) => tIds.has(p.id)),
    exercises: Object.values(state.exercises).map((e) => ({ id: e.id, name: e.name, instructions: e.instructions })),
    sessions: completedSessions(),
    activePlanName: state.activeSession?.planName || '',
  };
}

// ---------- strict validation of suggestions (never trust stored or generated data) ----------
const S = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const N = (v, min, max) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, Math.round(n))); };
function cleanItem(it) {
  const name = S(it?.name, 120);
  if (!name) return null;
  return { exerciseId: typeof it.exerciseId === 'string' ? it.exerciseId.slice(0, 64) : null, name, sets: N(it.sets, 1, 20), reps: S(it.reps, 20), dur: N(it.dur, 1, 3600), rest: N(it.rest, 0, 600), note: S(it.note, 200) };
}
export function validateAction(a) {
  if (!a || typeof a !== 'object') return null;
  if (a.type === 'create_plans') {
    const plans = (Array.isArray(a.plans) ? a.plans : []).slice(0, 7).map((p) => ({
      name: S(p?.name, 80) || 'Workout', desc: S(p?.desc, 200),
      days: [...new Set((Array.isArray(p?.days) ? p.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))],
      items: (Array.isArray(p?.items) ? p.items : []).slice(0, 30).map(cleanItem).filter(Boolean),
    })).filter((p) => p.items.length);
    return plans.length ? { type: a.type, group: S(a.group, 80), plans, summary: S(a.summary, 200) } : null;
  }
  if (a.type === 'update_plan') {
    const items = (Array.isArray(a.items) ? a.items : []).slice(0, 30).map(cleanItem).filter(Boolean);
    return typeof a.planId === 'string' && items.length ? { type: a.type, planId: a.planId, planName: S(a.planName, 80), items, summary: S(a.summary, 300) } : null;
  }
  if (a.type === 'set_instructions') {
    const text = S(a.text, 2000);
    return typeof a.exerciseId === 'string' && text ? { type: a.type, exerciseId: a.exerciseId, name: S(a.name, 120), text, summary: S(a.summary, 200) } : null;
  }
  return null;
}

function kbCues(name) {
  const n = (name || '').trim().toLowerCase();
  const kb = Object.values(EXERCISES).find((e) => e.name.toLowerCase() === n);
  return kb ? kb.cues.join('\n') : '';
}
function exerciseFor(it, created) {
  if (it.exerciseId && getExercise(it.exerciseId)) return getExercise(it.exerciseId);
  const found = findExerciseByName(it.name);
  if (found) return found;
  const ex = newExercise({ name: it.name, instructions: kbCues(it.name) });
  created.push(ex.id);
  return ex;
}
const target = (it) => ({ sets: it.sets, reps: it.reps, dur: it.dur, rest: it.rest, note: it.note });

/** Applies a validated action. Returns { ok, message, undo } — never throws. */
function applyAction(raw) {
  const a = validateAction(raw);
  if (!a) return { ok: false, message: 'That suggestion couldn’t be read, so nothing was changed.' };
  try {
    if (a.type === 'create_plans') {
      const createdEx = [];
      const createdPlans = a.plans.map((p) => {
        const plan = newPlan({ name: p.name, group: a.group, desc: p.desc, days: p.days });
        for (const it of p.items) addItemToPlan(plan, exerciseFor(it, createdEx).id, target(it));
        return plan.id;
      });
      save();
      return {
        ok: true, message: `Added ${createdPlans.length} workout${createdPlans.length === 1 ? '' : 's'} to your plans`,
        undo: () => {
          createdPlans.forEach((id) => deletePlan(id));
          createdEx.forEach((id) => { if (!plansUsing(id).length) deleteExercise(id); });
        },
      };
    }
    if (a.type === 'update_plan') {
      const plan = getPlan(a.planId);
      if (!plan) return { ok: false, message: `“${a.planName || 'That workout'}” no longer exists, so nothing was changed.` };
      const before = JSON.parse(JSON.stringify(plan.items));
      const createdEx = [];
      const unused = [...plan.items];
      plan.items = a.items.map((it) => {
        const ex = exerciseFor(it, createdEx);
        const k = unused.findIndex((u) => u.exerciseId === ex.id);
        const id = k >= 0 ? unused.splice(k, 1)[0].id : uid();
        return { id, exerciseId: ex.id, ...target(it) };
      });
      save();
      return {
        ok: true, message: `Updated ${plan.name || 'workout'}`,
        undo: () => {
          const p = getPlan(a.planId); if (!p) return;
          p.items = before.filter((i) => getExercise(i.exerciseId)); save();
          createdEx.forEach((id) => { if (!plansUsing(id).length) deleteExercise(id); });
        },
      };
    }
    if (a.type === 'set_instructions') {
      const ex = getExercise(a.exerciseId);
      if (!ex) return { ok: false, message: 'That exercise no longer exists, so nothing was changed.' };
      const before = ex.instructions;
      ex.instructions = before.trim() ? `${before.trim()}\n${a.text}` : a.text;
      save();
      return { ok: true, message: `Saved technique cues to ${ex.name}`, undo: () => { const e = getExercise(a.exerciseId); if (e) { e.instructions = before; save(); } } };
    }
  } catch (e) {
    console.error('Aiz apply failed', e);
  }
  return { ok: false, message: 'Something went wrong, so nothing was changed.' };
}

// ---------- rendering ----------
function md(text) {
  const inline = (s) => h(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])_(.+?)_(?=[\s.,)]|$)/g, '$1<em>$2</em>');
  const out = [];
  let list = null;
  for (const line of String(text || '').split('\n')) {
    const ul = line.match(/^\s*[•\-]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { if (list) out.push(`</${list.tag}>`); list = { tag }; out.push(`<${tag}>`); }
      out.push(`<li>${inline(ul ? ul[1] : ol[2])}</li>`);
      continue;
    }
    if (list) { out.push(`</${list.tag}>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list.tag}>`);
  return out.join('');
}

function actionCard(m, a, i) {
  const v = validateAction(a);
  if (!v) return '';
  const label = v.type === 'create_plans' ? 'Add to my plans' : v.type === 'update_plan' ? 'Apply change' : 'Save cues';
  const title = v.type === 'create_plans' ? `New: ${v.group || 'Aiz plan'}` : v.type === 'update_plan' ? `Change: ${v.planName}` : `Technique cues: ${v.name}`;
  const detail = v.type === 'create_plans' ? v.plans.map((p) => `${h(p.name)} · ${p.items.length}`).join(' &nbsp;·&nbsp; ') : h(v.summary);
  const st = a.status;
  const foot = st === 'applied' ? `<span class="tag accent">${icon('check')}Done</span>${v.type === 'set_instructions' ? `<a class="link-btn" href="#/ex/${h(v.exerciseId)}">Open exercise</a>` : v.type === 'update_plan' ? `<a class="link-btn" href="#/plan/${h(v.planId)}">Open workout</a>` : '<a class="link-btn" href="#/plans">View plans</a>'}`
    : st === 'dismissed' ? '<span class="tag">Dismissed</span>'
    : `<button type="button" class="btn primary sm" data-apply="${h(m.id)}:${i}">${icon('check')}${label}</button><button type="button" class="btn sm ghost" data-dismiss="${h(m.id)}:${i}">Not now</button>`;
  return `<div class="aiz-action"><div class="eyebrow accent">${icon('spark')}${h(title)}</div><div class="small muted">${detail}</div><div class="row" style="flex-wrap:wrap;gap:8px">${foot}</div></div>`;
}

function bubble(m, isLast) {
  if (m.role === 'user') return `<div class="aiz-msg me"><div class="aiz-bubble">${h(m.text)}</div></div>`;
  return `<div class="aiz-msg"><span class="aiz-av" aria-hidden="true">${icon('spark')}</span><div class="aiz-col"><div class="aiz-bubble">${md(m.text)}</div>
    ${(m.actions || []).map((a, i) => actionCard(m, a, i)).join('')}
    ${isLast && m.chips?.length ? `<div class="aiz-chips">${m.chips.map((c) => `<button type="button" class="chip" data-chip="${h(c)}">${h(c)}</button>`).join('')}</div>` : ''}</div></div>`;
}

const INTRO = { id: 'intro', role: 'aiz', text: 'Hi! I’m **Aiz**, your workout assistant. Ask me how to do an exercise, have me build or adjust a plan, or ask any training question.\nI run right on your phone — free, private and offline.', chips: ['Make me a 3 day beginner plan', 'How do I do a squat?', 'What’s my workout today?', 'How long should I rest?'], actions: [] };

export function viewAiz({ q }) {
  const msgs = state.aiz.messages;
  const all = msgs.length ? msgs : [INTRO];
  const prefill = (q.get('q') || '').slice(0, MAX_INPUT);
  return {
    tab: 'aiz', title: 'Aiz',
    html: `<div class="aiz">
      <header class="aiz-head"><span class="aiz-av lg" aria-hidden="true">${icon('spark')}</span><div class="grow"><h1 class="title-lg" tabindex="-1">Aiz</h1><span class="small muted">Workout assistant · free · works offline</span></div>
        ${msgs.length ? `<button type="button" class="btn sm ghost" data-act="clear">${icon('reset')}Clear</button>` : ''}</header>
      <div class="aiz-log" role="log" aria-live="polite" aria-label="Conversation with Aiz">${all.map((m, i) => bubble(m, i === all.length - 1)).join('')}</div>
      <form class="aiz-compose" data-form>
        <label class="sr" for="aiz-in">Message Aiz</label>
        <textarea id="aiz-in" class="input" rows="1" maxlength="${MAX_INPUT}" placeholder="Ask Aiz about workouts…" enterkeyhint="send" autocomplete="off">${h(prefill)}</textarea>
        <button type="submit" class="icon-btn send" aria-label="Send">${icon('send')}</button>
      </form>
      <p class="aiz-note">Aiz gives general fitness info, not medical advice. Your chats stay on this device.</p>
    </div>`,
    mount(root, signal) {
      const log = root.querySelector('.aiz-log');
      const inp = root.querySelector('#aiz-in');
      const scrollEnd = (smooth) => requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
      const grow = () => { inp.style.height = 'auto'; inp.style.height = Math.min(140, inp.scrollHeight) + 'px'; };
      inp.addEventListener('input', grow, { signal });
      scrollEnd(false);
      let busy = false;

      const redraw = () => {
        const list = state.aiz.messages.length ? state.aiz.messages : [INTRO];
        log.innerHTML = list.map((m, i) => bubble(m, i === list.length - 1)).join('');
      };

      const send = (text) => {
        const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT);
        if (!clean || busy) return;
        busy = true;
        state.aiz.messages.push({ id: uid(), role: 'user', text: clean, at: Date.now(), chips: [], actions: [] });
        inp.value = ''; grow();
        redraw();
        log.insertAdjacentHTML('beforeend', '<div class="aiz-msg" data-typing><span class="aiz-av" aria-hidden="true">' + icon('spark') + '</span><div class="aiz-bubble typing" aria-label="Aiz is typing"><i></i><i></i><i></i></div></div>');
        scrollEnd(true);
        setTimeout(() => {
          let r;
          try { r = respond(clean, buildContext(), mem); }
          catch (e) { console.error('Aiz error', e); r = { text: 'Sorry — I hit a snag answering that. Try asking another way.', actions: [], chips: [] }; }
          const actions = (r.actions || []).map(validateAction).filter(Boolean).map((a) => ({ ...a, status: 'pending' }));
          state.aiz.messages.push({ id: uid(), role: 'aiz', text: String(r.text || '').slice(0, 4000), at: Date.now(), chips: (r.chips || []).slice(0, 6), actions });
          if (state.aiz.messages.length > 60) state.aiz.messages.splice(0, state.aiz.messages.length - 60);
          save();
          busy = false;
          redraw();
          scrollEnd(true);
        }, 350);
      };

      root.querySelector('[data-form]').addEventListener('submit', (e) => { e.preventDefault(); send(inp.value); }, { signal });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(inp.value); } }, { signal });
      on(root, signal, 'click', '[data-chip]', (el) => send(el.dataset.chip));

      const findAct = (key) => {
        const [mid, idx] = key.split(':');
        const m = state.aiz.messages.find((x) => x.id === mid);
        return m ? m.actions?.[Number(idx)] : null;
      };
      on(root, signal, 'click', '[data-apply]', (el) => {
        const a = findAct(el.dataset.apply);
        if (!a || a.status !== 'pending') return; // already applied or dismissed: no double-apply
        const res = applyAction(a);
        if (res.ok) {
          a.status = 'applied'; save(); redraw();
          toast(res.message, { action: 'Undo', ms: 7000, onAction: () => { res.undo?.(); a.status = 'pending'; save(); redraw(); toast('Undone'); } });
        } else toast(res.message, { ms: 5000 });
      });
      on(root, signal, 'click', '[data-dismiss]', (el) => { const a = findAct(el.dataset.dismiss); if (a) { a.status = 'dismissed'; save(); redraw(); } });
      on(root, signal, 'click', '[data-act="clear"]', async () => {
        if (!await confirmDialog({ title: 'Clear chat with Aiz?', body: 'Your messages with Aiz are deleted from this device. Plans you added stay.', ok: 'Clear', danger: true })) return;
        state.aiz.messages = []; mem = {}; save(); go('/aiz');
      });

      if (prefill) { history.replaceState(null, '', '#/aiz'); send(prefill); }
      else if (matchMedia('(pointer: fine)').matches) inp.focus({ preventScroll: true });
    },
  };
}
