// Bankai — app shell, router and views.
import {
  state, loadState, save, flush, onSaved, uid, getPlan, getExercise, plansUsing, exerciseList,
  todaysPlans, completedSessions, isChecked, setChecked, checkedCount, newExercise, newPlan,
  addItemToPlan, deleteExercise, deletePlan, duplicatePlan, gcBlobs, loadTemplate, templateStatus,
  TEMPLATES, dayKey, startOfWeek,
} from './store.js';
import { h, icon, toast, sheet, confirmDialog, promptDialog, fmtTarget, fmtDur, fmtDays, fmtElapsed, DAY_ORDER, DAY_SHORT, DAY_LETTER } from './ui.js';
import { parseLink, storeFile, fmtBytes, forgetBlobUrl } from './media.js';
import { mediaThumb, mediaMain, activateEmbed, hydrateMedia } from './mediaview.js';
import { viewWorkout, viewSummary, startWorkout } from './workout.js';
import { exportBackup, importBackupFile } from './backup.js';

const main = document.getElementById('main');
let cleanupView = null;
let lastPath = null;

export const go = (path) => { if (location.hash === '#' + path) render(); else location.hash = path; };
export const rerender = () => render({ keepScroll: true });

// ---------- theme ----------
const ACCENTS = { violet: '#9333EA', magenta: '#C026D3', sky: '#8AB4FF', mint: '#5EE6C8', amber: '#FFB547' };
const mq = matchMedia('(prefers-color-scheme: light)');
export function applyTheme() {
  const s = state.settings;
  const t = s.theme === 'system' ? (mq.matches ? 'light' : 'dark') : s.theme;
  document.documentElement.dataset.theme = t;
  if (s.accent === 'violet') delete document.documentElement.dataset.accent; else document.documentElement.dataset.accent = s.accent;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'light' ? '#F4F5F7' : '#000000');
  try { localStorage.setItem('bankai-theme', s.theme); localStorage.setItem('bankai-accent', s.accent === 'violet' ? '' : s.accent); } catch { /* ignore */ }
}
mq.addEventListener?.('change', () => { if (state.settings.theme === 'system') applyTheme(); });

// ---------- router ----------
const routes = [
  [/^\/$/, viewHome],
  [/^\/welcome$/, viewWelcome],
  [/^\/plans$/, viewPlans],
  [/^\/plan\/([\w-]+)$/, viewPlan],
  [/^\/plan\/([\w-]+)\/edit$/, viewPlanEdit],
  [/^\/library$/, viewLibrary],
  [/^\/ex\/([\w-]+)$/, viewExercise],
  [/^\/ex\/([\w-]+)\/edit$/, viewExerciseEdit],
  [/^\/progress$/, viewProgress],
  [/^\/history\/([\w-]+)$/, viewSession],
  [/^\/workout$/, viewWorkout],
  [/^\/summary\/([\w-]+)$/, viewSummary],
  [/^\/settings$/, viewSettings],
];

function parseHash() {
  const raw = decodeURIComponent(location.hash.slice(1)) || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', q: new URLSearchParams(qs || '') };
}

export function render({ keepScroll = false } = {}) {
  const { path, q } = parseHash();
  if (!state.onboarded && path !== '/welcome' && path !== '/settings') { location.replace('#/welcome'); return; }
  if (cleanupView) { try { cleanupView(); } catch (e) { console.error(e); } cleanupView = null; }
  let view = null;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { view = fn({ params: m.slice(1), q }); break; }
  }
  if (!view) { location.replace('#/'); return; }
  if (view.redirect) { location.replace('#' + view.redirect); return; }
  const scrollY = window.scrollY;
  const ctrl = new AbortController();
  main.innerHTML = view.html;
  document.body.classList.toggle('no-tabs', !!view.noTabs);
  document.querySelectorAll('#tabbar a').forEach((a) => { if (a.dataset.tab === view.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = view.title ? `${view.title} · Bankai` : 'Bankai';
  const cleanup = view.mount?.(main, ctrl.signal);
  cleanupView = () => { ctrl.abort(); if (typeof cleanup === 'function') cleanup(); };
  hydrateMedia(main);
  const samePage = path === lastPath;
  if (keepScroll || samePage) window.scrollTo(0, scrollY); else window.scrollTo(0, 0);
  if (!samePage && !keepScroll) main.querySelector('h1')?.focus({ preventScroll: true });
  lastPath = path;
}

/** Delegated event helper: on(root, signal, 'click', '[data-act]', fn) */
function on(root, signal, type, sel, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(t, e);
  }, { signal });
}

function savedPill(root, signal) {
  const pill = root.querySelector('.saved-pill');
  if (!pill) return;
  let tm;
  const off = onSaved((err) => {
    pill.innerHTML = err ? `${icon('alert')}Not saved` : `${icon('check')}Saved`;
    pill.style.opacity = '1';
    clearTimeout(tm);
    tm = setTimeout(() => { pill.style.opacity = '0.55'; }, 1200);
  });
  signal.addEventListener('abort', off);
}

const firstMedia = (ex) => ex?.media?.[0];
const thumbHtml = (ex) => `<span class="thumb">${mediaThumb(firstMedia(ex))}</span>`;
const exName = (ex) => ex?.name?.trim() || 'Untitled exercise';
const planName = (p) => p?.name?.trim() || 'Untitled workout';

// ================= HOME =================
function viewHome() {
  const s = state.settings;
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const active = state.activeSession;
  const tPlans = todaysPlans(now);
  const done = completedSessions();
  const todayKey = dayKey(now);
  const doneTodayIds = new Set(done.filter((x) => dayKey(new Date(x.endedAt)) === todayKey).map((x) => x.planId));

  let todayCard;
  if (tPlans.length) {
    const p = tPlans.find((x) => !doneTodayIds.has(x.id)) || tPlans[0];
    const n = p.items.length;
    const isDone = doneTodayIds.has(p.id);
    const c = isDone ? n : checkedCount(p);
    const isActive = active && active.planId === p.id;
    const others = tPlans.filter((x) => x !== p);
    todayCard = `<section class="card pad-lg today" aria-labelledby="today-h">
      <div class="row between"><span class="eyebrow accent" id="today-h">Today’s workout</span><span class="small muted">${isDone ? 'Completed' : `${c} / ${n} done`}</span></div>
      <a href="#/plan/${p.id}" style="color:inherit;text-decoration:none" class="stack-sm" aria-label="Open ${h(planName(p))}">
        <span class="name">${h(planName(p))}</span>
        <span class="muted small">${n} exercise${n === 1 ? '' : 's'}${p.group ? ' · ' + h(p.group) : ''}${p.desc ? ' · ' + h(p.desc) : ''}</span>
      </a>
      <div class="bar" role="progressbar" aria-label="Today’s progress" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${c}"><i style="width:${n ? Math.round((c / n) * 100) : 0}%"></i></div>
      <button type="button" class="btn primary big block" data-act="start" data-id="${p.id}">${icon('play')}${isActive ? 'Resume workout' : isDone ? 'Do it again' : 'Start workout'}</button>
      ${others.length ? `<div class="small muted">Also today: ${others.map((o) => `<a href="#/plan/${o.id}">${h(planName(o))}</a>`).join(', ')}</div>` : ''}
    </section>`;
  } else if (!state.plans.length) {
    todayCard = `<section class="empty"><strong>No workouts yet</strong><span>Create your first workout, or load a starter plan.</span>
      <div class="row"><button type="button" class="btn primary" data-act="new-plan">${icon('plus')}Create workout</button><button type="button" class="btn" data-act="templates">Starter plans</button></div></section>`;
  } else {
    todayCard = `<section class="card pad-lg today" aria-labelledby="today-h">
      <span class="eyebrow accent" id="today-h">Today’s workout</span>
      <span class="name">Nothing scheduled</span>
      <span class="muted small">Rest day — or pick any workout. Set workout days when you edit a plan.</span>
      <button type="button" class="btn primary big block" data-act="pick-start">${icon('play')}Choose a workout</button>
    </section>`;
  }

  const resume = active ? `<div class="banner"><div class="grow"><strong>Workout in progress</strong><span class="small muted">${h(active.planName)} · exercise ${Math.min(active.index + 1, active.items.length)} of ${active.items.length}</span></div><a class="btn primary sm" href="#/workout">Resume</a></div>` : '';

  const tiles = state.plans.slice(0, 12).map((p) => `<a class="plan-tile" href="#/plan/${p.id}">
      <span class="eyebrow">${h(fmtDays(p.days) || p.group || 'Any day')}</span>
      <span class="stack-sm" style="gap:2px"><span class="nm">${h(planName(p))}</span><span class="small muted">${p.items.length} exercise${p.items.length === 1 ? '' : 's'}</span></span></a>`).join('');

  // this week
  const wk = startOfWeek(now);
  const weekDays = [...Array(7)].map((_, i) => { const d = new Date(wk); d.setDate(wk.getDate() + i); return d; });
  const doneDays = new Set(done.map((x) => dayKey(new Date(x.endedAt))));
  const weekCount = done.filter((x) => x.endedAt >= wk.getTime()).length;
  const week = weekDays.map((d) => {
    const on = doneDays.has(dayKey(d));
    const isToday = dayKey(d) === todayKey;
    return `<div class="d${isToday ? ' today' : ''}"><div class="dot${on ? ' on' : ''}" aria-hidden="true">${on ? icon('check') : ''}</div><span>${DAY_LETTER[d.getDay()]}</span><span class="sr">${DAY_SHORT[d.getDay()]}: ${on ? 'workout done' : 'no workout'}</span></div>`;
  }).join('');
  const exCount = Object.keys(state.exercises).length;

  return {
    tab: 'home', title: 'Home',
    html: `<div class="stack">
      <header class="home-head"><div><div class="eyebrow">${h(dateStr)}</div><h1 class="greet" tabindex="-1">${s.name ? 'Hi, ' + h(s.name) : 'Bankai'}</h1></div>
        <div class="row"><a class="icon-btn" href="#/settings" aria-label="Settings">${icon('gear')}</a></div></header>
      ${resume}
      ${todayCard}
      <section aria-label="Quick add" class="quick">
        <button type="button" data-act="new-plan">${icon('plus')}Workout</button>
        <button type="button" data-act="new-ex">${icon('dumbbell')}Exercise</button>
        <button type="button" data-act="qa-photo">${icon('image')}Photo</button>
        <button type="button" data-act="qa-video">${icon('video')}Video</button>
        <input type="file" id="qa-photo" accept="image/*" multiple hidden>
      </section>
      ${state.plans.length ? `<section class="stack-sm" aria-labelledby="plans-h">
        <div class="section-head"><h2 id="plans-h">My plans</h2><a href="#/plans">See all</a></div>
        <div class="hscroll">${tiles}<button type="button" class="plan-tile new" data-act="new-plan">${icon('plus')}New workout</button></div>
      </section>` : ''}
      <section class="stack-sm" aria-labelledby="lib-h">
        <div class="section-head"><h2 id="lib-h">Exercise library</h2><a href="#/library">${exCount} exercise${exCount === 1 ? '' : 's'}</a></div>
        <form class="search" role="search" data-form="search"><label class="sr" for="home-q">Search exercises</label>${icon('search')}<input id="home-q" class="input" type="search" placeholder="Search exercises" enterkeyhint="search" autocomplete="off"></form>
      </section>
      <section class="card stack-sm" aria-labelledby="week-h">
        <div class="section-head"><h2 id="week-h" style="font-size:17px">This week</h2><a href="#/progress">${weekCount} workout${weekCount === 1 ? '' : 's'}</a></div>
        <div class="week">${week}</div>
      </section>
    </div>`,
    mount(root, signal) {
      on(root, signal, 'click', '[data-act]', async (el) => {
        const a = el.dataset.act;
        if (a === 'start') startOrResume(el.dataset.id);
        if (a === 'pick-start') { const p = await pickPlan('Start which workout?'); if (p) startOrResume(p.id); }
        if (a === 'new-plan') createPlanFlow();
        if (a === 'new-ex') createExerciseFlow();
        if (a === 'templates') templatesSheet();
        if (a === 'qa-photo') root.querySelector('#qa-photo').click();
        if (a === 'qa-video') quickVideo();
      });
      root.querySelector('#qa-photo').addEventListener('change', async (e) => {
        const files = [...e.target.files]; e.target.value = '';
        if (!files.length) return;
        const ex = await pickExercise({ title: 'Add photos to…' });
        if (!ex) return;
        if (await addFilesTo(ex, files)) go(`/ex/${ex.id}`);
      }, { signal });
      root.querySelector('[data-form="search"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = root.querySelector('#home-q').value.trim();
        go('/library' + (v ? '?q=' + encodeURIComponent(v) : ''));
      }, { signal });
    },
  };
}

async function startOrResume(planId) {
  const a = state.activeSession;
  if (a && a.planId === planId) { go('/workout'); return; }
  if (a) {
    const ok = await confirmDialog({ title: 'Workout in progress', body: `You’re in the middle of ${a.planName}. Start a new workout instead? The current one will be saved to history as-is.`, ok: 'Start new' });
    if (!ok) return;
  }
  startWorkout(planId);
}

function createPlanFlow(fields = {}) {
  const p = newPlan(fields);
  go(`/plan/${p.id}/edit?new=1`);
}
function createExerciseFlow() {
  const e = newExercise();
  go(`/ex/${e.id}/edit?new=1`);
}

async function quickVideo() {
  const choice = await sheet({
    title: 'Add a video',
    render(b, close) {
      b.innerHTML = `<p class="muted">Paste a YouTube (or other) link, or pick a video saved on this device.</p>
        <button type="button" class="btn primary big block" data-c="link">${icon('link')}Paste a link</button>
        <button type="button" class="btn big block" data-c="file">${icon('video')}Choose video file</button>
        <input type="file" accept="video/*" hidden>`;
      const inp = b.querySelector('input');
      b.querySelector('[data-c="link"]').onclick = () => close({ kind: 'link' });
      b.querySelector('[data-c="file"]').onclick = () => inp.click();
      inp.onchange = () => close({ kind: 'file', files: [...inp.files] });
    },
  });
  if (!choice) return;
  if (choice.kind === 'link') {
    const media = await linkSheet();
    if (!media) return;
    const ex = await pickExercise({ title: 'Add video to…' });
    if (!ex) return;
    ex.media.push(media); save();
    toast('Video added');
    go(`/ex/${ex.id}`);
  } else if (choice.files?.length) {
    const ex = await pickExercise({ title: 'Add video to…' });
    if (!ex) return;
    if (await addFilesTo(ex, choice.files)) go(`/ex/${ex.id}`);
  }
}

async function addFilesTo(ex, files) {
  let added = 0;
  toast(files.length > 1 ? `Saving ${files.length} files…` : 'Saving…', { ms: 1500 });
  for (const f of files) {
    try { ex.media.push(await storeFile(f)); added++; }
    catch (err) { toast(err.message || 'Couldn’t save that file', { ms: 5000 }); }
  }
  if (added) { save(); requestPersist(); toast(`${added} file${added === 1 ? '' : 's'} added to ${exName(ex)}`); }
  return added > 0;
}

function requestPersist() {
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}

// ================= PICKERS =================
function pickPlan(title) {
  return sheet({
    title,
    render(b, close) {
      if (!state.plans.length) { b.innerHTML = '<p class="muted">No workouts yet.</p>'; return; }
      b.innerHTML = `<div class="pick-list">${state.plans.map((p) => `<button type="button" class="item" data-id="${p.id}"><span class="grow"><span class="ttl" style="display:block">${h(planName(p))}</span><span class="sub">${p.items.length} exercises${p.group ? ' · ' + h(p.group) : ''}</span></span>${icon('chev', 'chev')}</button>`).join('')}</div>`;
      b.querySelectorAll('[data-id]').forEach((x) => x.addEventListener('click', () => close(getPlan(x.dataset.id))));
    },
  });
}

/** Search the library and pick (or create) an exercise. */
export function pickExercise({ title = 'Choose exercise', allowCreate = true, multi = false } = {}) {
  return sheet({
    title,
    render(b, close) {
      const picked = new Set();
      b.innerHTML = `<div class="search">${icon('search')}<input class="input" type="search" placeholder="Search or type a new name" aria-label="Search exercises" autocomplete="off"></div>
        <div class="pick-list" data-list></div>${multi ? '<div class="sheet-actions"><button type="button" class="btn primary" data-done disabled>Add selected</button></div>' : ''}`;
      const inp = b.querySelector('input');
      const list = b.querySelector('[data-list]');
      const draw = () => {
        const q = inp.value.trim().toLowerCase();
        const exs = exerciseList().filter((e) => !q || e.name.toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q));
        const exact = exs.some((e) => e.name.toLowerCase() === q);
        list.innerHTML = (allowCreate ? `<button type="button" class="item" data-new><span class="thumb">${icon('plus')}</span><span class="grow"><span class="ttl" style="display:block">${q && !exact ? `Create “${h(inp.value.trim())}”` : 'New exercise'}</span><span class="sub">Add to your library</span></span></button>` : '')
          + exs.slice(0, 80).map((e) => `<button type="button" class="item" data-id="${e.id}" aria-pressed="${picked.has(e.id)}">${thumbHtml(e)}<span class="grow"><span class="ttl" style="display:block">${h(exName(e))}</span><span class="sub">${h(e.category || 'No category')}</span></span>${multi ? (picked.has(e.id) ? icon('check', 'chev') : '') : icon('chev', 'chev')}</button>`).join('')
          + (!exs.length && q ? '<p class="muted small">No matches.</p>' : '');
        hydrateMedia(list);
      };
      draw();
      inp.addEventListener('input', draw);
      list.addEventListener('click', (e) => {
        const n = e.target.closest('[data-new]');
        if (n) {
          const name = inp.value.trim();
          const ex = newExercise({ name: exerciseList().some((x) => x.name.toLowerCase() === name.toLowerCase()) ? '' : name });
          close(multi ? [ex] : ex);
          return;
        }
        const it = e.target.closest('[data-id]');
        if (!it) return;
        if (!multi) { close(getExercise(it.dataset.id)); return; }
        if (picked.has(it.dataset.id)) picked.delete(it.dataset.id); else picked.add(it.dataset.id);
        b.querySelector('[data-done]').disabled = !picked.size;
        b.querySelector('[data-done]').textContent = picked.size ? `Add ${picked.size} selected` : 'Add selected';
        draw();
      });
      if (multi) b.querySelector('[data-done]').addEventListener('click', () => close([...picked].map(getExercise)));
      setTimeout(() => inp.focus(), 50);
    },
  });
}

/** Paste-a-link sheet with a live preview. Resolves to a media record or undefined. */
export function linkSheet() {
  return sheet({
    title: 'Add a video link',
    render(b, close) {
      b.innerHTML = `<label class="field"><span>Link</span><input class="input" type="url" inputmode="url" placeholder="https://youtube.com/watch?v=…" autocomplete="off" data-url></label>
        <button type="button" class="btn sm" data-paste style="align-self:flex-start">${icon('copy')}Paste from clipboard</button>
        <div data-preview></div>
        <label class="field"><span>Caption (optional)</span><input class="input" data-cap maxlength="300" placeholder="e.g. Side view, slow tempo"></label>
        <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-add disabled>Add video</button></div>`;
      const url = b.querySelector('[data-url]');
      const prev = b.querySelector('[data-preview]');
      const add = b.querySelector('[data-add]');
      let info = null;
      const update = () => {
        const v = url.value.trim();
        if (!v) { prev.innerHTML = ''; add.disabled = true; return; }
        info = parseLink(v);
        if (!info.ok) { prev.innerHTML = `<p class="small" style="color:var(--danger)">${h(info.error)}</p>`; add.disabled = true; return; }
        prev.innerHTML = `<p class="small muted">${info.embed ? `Preview — this ${h(info.label)} video will play inside Bankai.` : info.kind === 'directvideo' || info.kind === 'directimage' ? 'Preview' : `This link will open in ${h(info.label)} (it can’t play inside the app).`}</p>` + mediaMain({ type: 'link', url: info.url, caption: '' });
        add.disabled = false;
      };
      url.addEventListener('input', update);
      prev.addEventListener('click', (e) => { const btn = e.target.closest('[data-act="embed"]'); if (btn) activateEmbed(btn); });
      const paste = b.querySelector('[data-paste]');
      if (!navigator.clipboard?.readText) paste.remove();
      else paste.addEventListener('click', async () => { try { url.value = (await navigator.clipboard.readText()).trim(); update(); } catch { toast('Clipboard blocked — long-press the box and tap Paste.'); } });
      add.addEventListener('click', () => { if (info?.ok) close({ id: uid(), type: 'link', url: info.url, caption: b.querySelector('[data-cap]').value.trim() }); });
      setTimeout(() => url.focus(), 50);
    },
  });
}

function templatesSheet() {
  return sheet({
    title: 'Starter plans',
    render(b, close) {
      const draw = () => {
        b.innerHTML = `<p class="muted small">Adds the workouts and their exercises to your library. You can edit everything afterwards.</p>` + TEMPLATES.map((t) => {
          const loaded = templateStatus(t);
          return `<div class="card stack-sm"><strong>${h(t.name)}</strong><span class="small muted">${h(t.blurb)}</span><span class="small muted">${t.plans.map((p) => h(p.name)).join(' · ')}</span>
            <button type="button" class="btn ${loaded ? '' : 'primary'} sm" data-t="${t.id}" ${loaded ? 'disabled' : ''}>${loaded ? `${icon('check')}Added` : `${icon('plus')}Add ${t.plans.length} workouts`}</button></div>`;
        }).join('');
        b.querySelectorAll('[data-t]').forEach((x) => x.addEventListener('click', () => {
          const n = loadTemplate(x.dataset.t);
          toast(n ? `Added ${n} workouts` : 'Already added');
          draw();
          rerender();
        }));
      };
      draw();
    },
  });
}

// ================= PLANS =================
function viewPlans() {
  const groups = new Map();
  for (const p of state.plans) {
    const g = p.group?.trim() || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  const sections = [...groups.entries()].map(([g, ps]) => `<section class="stack-sm">${g ? `<h2 class="group-title">${h(g)}</h2>` : (groups.size > 1 ? '<h2 class="group-title">Other</h2>' : '')}
    <div class="plans-grid">${ps.map((p) => `<a class="plan-card" href="#/plan/${p.id}">
      <span class="row between"><span class="nm">${h(planName(p))}</span>${icon('chev', 'chev')}</span>
      ${p.desc ? `<span class="small muted clamp-2">${h(p.desc)}</span>` : ''}
      <span class="row" style="flex-wrap:wrap;gap:6px"><span class="tag">${p.items.length} exercise${p.items.length === 1 ? '' : 's'}</span>${p.days.length ? `<span class="tag accent">${h(fmtDays(p.days))}</span>` : ''}</span>
    </a>`).join('')}</div></section>`).join('');
  return {
    tab: 'plans', title: 'Plans',
    html: `<div class="stack">
      <div class="row between"><h1 class="title-xl" tabindex="-1">Plans</h1><button type="button" class="btn primary sm" data-act="new">${icon('plus')}New</button></div>
      ${state.plans.length ? sections : `<div class="empty"><strong>No workouts yet</strong><span>A workout is a list of exercises — like “Push” or “Monday”.</span></div>`}
      <button type="button" class="btn block" data-act="templates">Starter plans</button>
    </div>`,
    mount(root, signal) {
      on(root, signal, 'click', '[data-act]', (el) => {
        if (el.dataset.act === 'new') createPlanFlow();
        if (el.dataset.act === 'templates') templatesSheet();
      });
    },
  };
}

function viewPlan({ params: [id] }) {
  const p = getPlan(id);
  if (!p) return { redirect: '/plans' };
  const done = checkedCount(p);
  const rows = p.items.map((it) => {
    const ex = getExercise(it.exerciseId);
    const c = isChecked(p.id, it.id);
    const meta = [fmtTarget(it, { withRest: true }), it.note].filter(Boolean).join(' · ');
    return `<div class="item${c ? ' done' : ''}" data-item="${it.id}">
      <input type="checkbox" class="check" ${c ? 'checked' : ''} aria-label="Done: ${h(exName(ex))}" data-check="${it.id}">
      <a class="item-link" href="#/ex/${ex.id}?p=${p.id}&i=${it.id}">${thumbHtml(ex)}<span class="grow"><span class="ttl" style="display:block">${h(exName(ex))}</span><span class="sub">${h(meta || 'No targets set')}</span></span>${icon('chev', 'chev')}</a>
    </div>`;
  }).join('');
  return {
    tab: 'plans', title: planName(p),
    html: `<div class="stack">
      <div class="topbar"><a class="icon-btn" href="#/plans" aria-label="Back to plans">${icon('back')}</a><span class="t">${h(p.group || 'Workout')}</span><a class="icon-btn" href="#/plan/${p.id}/edit" aria-label="Edit workout">${icon('edit')}</a></div>
      <div class="page-title"><h1 class="title-xl" tabindex="-1">${h(planName(p))}</h1>
        ${p.desc ? `<p class="muted">${h(p.desc)}</p>` : ''}
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px"><span class="tag">${p.items.length} exercise${p.items.length === 1 ? '' : 's'}</span>${p.days.length ? `<span class="tag accent">${icon('calendar')}${h(fmtDays(p.days))}</span>` : '<span class="tag">No days set</span>'}</div></div>
      ${p.items.length ? `<button type="button" class="btn primary big block" data-act="start">${icon('play')}${state.activeSession?.planId === p.id ? 'Resume workout' : 'Start workout'}</button>` : ''}
      <section class="stack-sm" aria-labelledby="ex-h">
        <div class="section-head"><h2 id="ex-h">Exercises</h2>${p.items.length ? `<span class="small muted" data-count>${done} / ${p.items.length} done today</span>` : ''}</div>
        ${p.items.length ? `<div class="list">${rows}</div>` : `<div class="empty"><strong>No exercises yet</strong><a class="btn primary" href="#/plan/${p.id}/edit">${icon('plus')}Add exercises</a></div>`}
      </section>
      <div class="row" style="flex-wrap:wrap"><a class="btn sm" href="#/plan/${p.id}/edit">${icon('edit')}Edit</a><button type="button" class="btn sm" data-act="dup">${icon('copy')}Duplicate</button>${done ? `<button type="button" class="btn sm" data-act="clear">${icon('reset')}Clear ticks</button>` : ''}</div>
    </div>`,
    mount(root, signal) {
      on(root, signal, 'change', '[data-check]', (el) => {
        setChecked(p.id, el.dataset.check, el.checked);
        el.closest('.item').classList.toggle('done', el.checked);
        const cnt = root.querySelector('[data-count]');
        if (cnt) cnt.textContent = `${checkedCount(p)} / ${p.items.length} done today`;
        if (el.checked && checkedCount(p) === p.items.length) toast('All done for today — nice work');
      });
      on(root, signal, 'click', '[data-act]', (el) => {
        const a = el.dataset.act;
        if (a === 'start') startOrResume(p.id);
        if (a === 'dup') { const c = duplicatePlan(p); toast('Workout duplicated'); go(`/plan/${c.id}/edit`); }
        if (a === 'clear') { for (const it of p.items) setChecked(p.id, it.id, false); rerender(); }
      });
    },
  };
}

function targetSheet(item, ex) {
  return sheet({
    title: exName(ex),
    render(b, close) {
      const mins = item.dur ? Math.floor(item.dur / 60) : '';
      const secs = item.dur ? item.dur % 60 : '';
      b.innerHTML = `<p class="small muted">Leave anything blank that doesn’t apply.</p>
        <div class="grid-2"><label class="field"><span>Sets</span><input class="input" data-f="sets" type="number" inputmode="numeric" min="0" max="99" value="${item.sets ?? ''}"></label>
        <label class="field"><span>Reps</span><input class="input" data-f="reps" inputmode="text" maxlength="20" placeholder="e.g. 10 or 8–12" value="${h(item.reps)}"></label></div>
        <div class="field"><span class="label">Time (for holds, cardio)</span><div class="grid-2"><label class="field"><input class="input" data-f="mins" type="number" inputmode="numeric" min="0" max="600" placeholder="min" value="${mins}" aria-label="Minutes"></label><label class="field"><input class="input" data-f="secs" type="number" inputmode="numeric" min="0" max="59" placeholder="sec" value="${secs}" aria-label="Seconds"></label></div></div>
        <div class="field"><span class="label">Rest between sets</span><div class="chips" data-rest>${[30, 60, 90, 120, 180].map((v) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${item.rest === v}">${fmtDur(v)}</button>`).join('')}</div>
          <input class="input" data-f="rest" type="number" inputmode="numeric" min="0" max="3600" placeholder="or seconds, e.g. 75" value="${item.rest ?? ''}" aria-label="Rest seconds"></div>
        <label class="field"><span>Note for this workout</span><input class="input" data-f="note" maxlength="500" placeholder="e.g. Wide grip" value="${h(item.note)}"></label>
        <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-save>Save</button></div>`;
      const f = (k) => b.querySelector(`[data-f="${k}"]`);
      b.querySelector('[data-rest]').addEventListener('click', (e) => {
        const c = e.target.closest('[data-v]'); if (!c) return;
        f('rest').value = c.dataset.v;
        b.querySelectorAll('[data-rest] .chip').forEach((x) => x.setAttribute('aria-pressed', x === c));
      });
      f('rest').addEventListener('input', () => b.querySelectorAll('[data-rest] .chip').forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === f('rest').value)));
      b.querySelector('[data-save]').addEventListener('click', () => {
        const num = (v, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };
        const m = num(f('mins').value, 600) || 0, s = num(f('secs').value, 59) || 0;
        item.sets = num(f('sets').value, 99) || null;
        item.reps = f('reps').value.trim().slice(0, 20);
        item.dur = m * 60 + s || null;
        item.rest = num(f('rest').value, 3600);
        item.note = f('note').value.trim().slice(0, 500);
        save();
        close(true);
      });
    },
  });
}

function viewPlanEdit({ params: [id], q }) {
  const p = getPlan(id);
  if (!p) return { redirect: '/plans' };
  const isNew = q.get('new') === '1';
  const groups = [...new Set(state.plans.map((x) => x.group).filter(Boolean))];
  const itemsHtml = () => p.items.length ? p.items.map((it, i) => {
    const ex = getExercise(it.exerciseId);
    return `<div class="edit-row" data-row="${it.id}">
      <div class="acts" style="flex-direction:column"><button type="button" class="icon-btn sm plain" data-act="up" data-id="${it.id}" aria-label="Move ${h(exName(ex))} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button type="button" class="icon-btn sm plain" data-act="down" data-id="${it.id}" aria-label="Move ${h(exName(ex))} down" ${i === p.items.length - 1 ? 'disabled' : ''}>${icon('down')}</button></div>
      <button type="button" class="grow" data-act="target" data-id="${it.id}" style="background:none;border:0;text-align:left;padding:6px 0;min-height:52px">
        <span class="ttl" style="display:block">${i + 1}. ${h(exName(ex))}</span><span class="small muted">${h([fmtTarget(it, { withRest: true }), it.note].filter(Boolean).join(' · ') || 'Tap to set sets, reps, time, rest')}</span></button>
      <button type="button" class="icon-btn sm plain" data-act="more" data-id="${it.id}" aria-label="More options for ${h(exName(ex))}">${icon('more')}</button>
    </div>`;
  }).join('') : '<div class="empty"><span>No exercises yet. Add some from your library or create new ones.</span></div>';

  return {
    tab: 'plans', title: 'Edit workout',
    html: `<div class="stack">
      <div class="topbar"><a class="icon-btn" href="#/plan/${p.id}" aria-label="Done, back to workout">${icon('back')}</a><span class="t">${isNew ? 'New workout' : 'Edit workout'}</span><span class="saved-pill" aria-live="polite" style="opacity:.55">${icon('check')}Autosaves</span></div>
      <h1 class="sr" tabindex="-1">Edit workout</h1>
      <label class="field"><span>Workout name</span><input class="input" data-f="name" maxlength="80" placeholder="e.g. Push day" value="${h(p.name)}" ${isNew ? 'autofocus' : ''}></label>
      <div class="grid-2">
        <label class="field"><span>Program / group</span><input class="input" data-f="group" maxlength="80" list="groups" placeholder="e.g. PPL" value="${h(p.group)}"><datalist id="groups">${groups.map((g) => `<option value="${h(g)}">`).join('')}</datalist></label>
        <label class="field"><span>Focus</span><input class="input" data-f="desc" maxlength="400" placeholder="e.g. Chest, triceps" value="${h(p.desc)}"></label>
      </div>
      <div class="field"><span class="label" id="days-l">Workout days (shows on Home)</span><div class="day-toggles" role="group" aria-labelledby="days-l">${DAY_ORDER.map((d) => `<button type="button" class="chip" data-day="${d}" aria-pressed="${p.days.includes(d)}" aria-label="${DAY_SHORT[d]}">${DAY_SHORT[d].slice(0, 2)}</button>`).join('')}</div></div>
      <section class="stack-sm"><div class="section-head"><h2>Exercises</h2><span class="small muted" data-n>${p.items.length}</span></div>
        <div class="list" data-items>${itemsHtml()}</div>
        <button type="button" class="btn block" data-act="add">${icon('plus')}Add exercises</button>
      </section>
      <button type="button" class="btn danger block" data-act="delete">${icon('trash')}Delete workout</button>
      <div class="sticky-foot"><a class="btn primary big block" href="#/plan/${p.id}">Done</a></div>
    </div>`,
    mount(root, signal) {
      savedPill(root, signal);
      const redraw = () => { root.querySelector('[data-items]').innerHTML = itemsHtml(); root.querySelector('[data-n]').textContent = p.items.length; };
      on(root, signal, 'input', '[data-f]', (el) => { p[el.dataset.f] = el.value; save(); });
      on(root, signal, 'click', '[data-day]', (el) => {
        const d = Number(el.dataset.day);
        p.days = p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d];
        el.setAttribute('aria-pressed', p.days.includes(d));
        save();
      });
      on(root, signal, 'click', '[data-act]', async (el) => {
        const a = el.dataset.act;
        const idx = p.items.findIndex((x) => x.id === el.dataset.id);
        const it = p.items[idx];
        if (a === 'up' && idx > 0) { [p.items[idx - 1], p.items[idx]] = [p.items[idx], p.items[idx - 1]]; save(); redraw(); root.querySelector(`[data-act="up"][data-id="${it.id}"]`)?.focus(); }
        if (a === 'down' && idx < p.items.length - 1) { [p.items[idx + 1], p.items[idx]] = [p.items[idx], p.items[idx + 1]]; save(); redraw(); root.querySelector(`[data-act="down"][data-id="${it.id}"]`)?.focus(); }
        if (a === 'target') { if (await targetSheet(it, getExercise(it.exerciseId))) redraw(); }
        if (a === 'more') {
          const ex = getExercise(it.exerciseId);
          const c = await sheet({
            title: exName(ex),
            render(b, close) {
              b.innerHTML = `<div class="pick-list">
                <button type="button" class="item" data-c="target">${icon('edit')}<span class="grow ttl">Sets, reps, time & rest</span></button>
                <button type="button" class="item" data-c="ex">${icon('video')}<span class="grow ttl">Videos, photos & instructions</span></button>
                <button type="button" class="item" data-c="dup">${icon('copy')}<span class="grow ttl">Duplicate in this workout</span></button>
                <button type="button" class="item" data-c="remove" style="color:var(--danger)">${icon('trash')}<span class="grow ttl">Remove from this workout</span></button></div>
                <p class="small muted">Removing only takes it out of this workout. It stays in your library.</p>`;
              b.querySelectorAll('[data-c]').forEach((x) => x.addEventListener('click', () => close(x.dataset.c)));
            },
          });
          if (c === 'target') { if (await targetSheet(it, ex)) redraw(); }
          if (c === 'ex') go(`/ex/${ex.id}/edit`);
          if (c === 'dup') { p.items.splice(idx + 1, 0, { ...it, id: uid() }); save(); redraw(); toast('Duplicated'); }
          if (c === 'remove') {
            const removed = p.items.splice(idx, 1)[0]; save(); redraw();
            toast(`Removed ${exName(ex)}`, { action: 'Undo', onAction: () => { p.items.splice(idx, 0, removed); save(); redraw(); }, ms: 5000 });
          }
        }
        if (a === 'add') {
          const exs = await pickExercise({ title: 'Add exercises', multi: true });
          if (!exs?.length) return;
          for (const ex of exs) addItemToPlan(p, ex.id);
          redraw();
          const fresh = exs.find((e) => !e.name);
          if (fresh) { toast('New exercise created — name it and add media'); go(`/ex/${fresh.id}/edit?new=1&back=${encodeURIComponent('/plan/' + p.id + '/edit')}`); }
          else toast(`Added ${exs.length} exercise${exs.length === 1 ? '' : 's'}. Tap one to set targets.`);
        }
        if (a === 'delete') {
          const ok = await confirmDialog({ title: `Delete “${planName(p)}”?`, body: 'The workout is removed. Your exercises stay in the library, and past history is kept.', ok: 'Delete', danger: true });
          if (!ok) return;
          deletePlan(p.id); toast('Workout deleted'); go('/plans');
        }
      });
      return () => {
        // Leaving a brand-new, untouched workout: clean it up.
        if (getPlan(p.id) && !p.name.trim() && !p.items.length && isNew) deletePlan(p.id);
        else if (getPlan(p.id) && !p.name.trim()) { p.name = 'Untitled workout'; save(); }
      };
    },
  };
}

// ================= LIBRARY =================
function viewLibrary({ q }) {
  let query = q.get('q') || '';
  let cat = q.get('cat') || '';
  const usedCats = [...new Set(Object.values(state.exercises).map((e) => e.category).filter(Boolean))].sort();
  const listHtml = () => {
    const ql = query.trim().toLowerCase();
    const exs = exerciseList().filter((e) => (!cat || e.category === cat) && (!ql || e.name.toLowerCase().includes(ql) || e.notes.toLowerCase().includes(ql) || e.instructions.toLowerCase().includes(ql) || (e.category || '').toLowerCase().includes(ql)));
    if (!exs.length) return Object.keys(state.exercises).length ? `<div class="empty"><strong>No matches</strong><button type="button" class="btn" data-act="new" data-name="${h(query.trim())}">${icon('plus')}Create “${h(query.trim() || 'new exercise')}”</button></div>` : `<div class="empty"><strong>Your library is empty</strong><span>Exercises hold your videos, photos and notes. Add one, or load a starter plan.</span></div>`;
    return exs.map((e) => {
      const n = plansUsing(e.id).length;
      return `<a class="item" href="#/ex/${e.id}">${thumbHtml(e)}<span class="grow"><span class="ttl" style="display:block">${h(exName(e))}</span><span class="sub">${h(e.category || 'No category')}${n ? ` · in ${n} workout${n === 1 ? '' : 's'}` : ''}${e.media.length ? ` · ${e.media.length} media` : ''}</span></span>${icon('chev', 'chev')}</a>`;
    }).join('');
  };
  return {
    tab: 'library', title: 'Library',
    html: `<div class="stack">
      <div class="row between"><h1 class="title-xl" tabindex="-1">Library</h1><button type="button" class="btn primary sm" data-act="new">${icon('plus')}New</button></div>
      <div class="search" role="search">${icon('search')}<input class="input" type="search" placeholder="Search exercises, notes…" aria-label="Search exercises" value="${h(query)}" data-q autocomplete="off" enterkeyhint="search"></div>
      ${usedCats.length ? `<div class="chips scroll" role="group" aria-label="Filter by category"><button type="button" class="chip" data-cat="" aria-pressed="${!cat}">All</button>${usedCats.map((c) => `<button type="button" class="chip" data-cat="${h(c)}" aria-pressed="${cat === c}">${h(c)}</button>`).join('')}</div>` : ''}
      <div class="list" data-list>${listHtml()}</div>
    </div>`,
    mount(root, signal) {
      const list = root.querySelector('[data-list]');
      const redraw = () => { list.innerHTML = listHtml(); hydrateMedia(list); history.replaceState(null, '', '#/library' + (query || cat ? '?' + new URLSearchParams({ ...(query ? { q: query } : {}), ...(cat ? { cat } : {}) }) : '')); };
      root.querySelector('[data-q]').addEventListener('input', (e) => { query = e.target.value; redraw(); }, { signal });
      on(root, signal, 'click', '[data-cat]', (el) => { cat = el.dataset.cat; root.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', x === el)); redraw(); });
      on(root, signal, 'click', '[data-act="new"]', (el) => { const e = newExercise({ name: el.dataset.name || '', category: cat || '' }); go(`/ex/${e.id}/edit?new=1`); });
    },
  };
}

// ================= EXERCISE =================
function viewExercise({ params: [id], q }) {
  const ex = getExercise(id);
  if (!ex) return { redirect: '/library' };
  const p = q.get('p') ? getPlan(q.get('p')) : null;
  const it = p ? p.items.find((x) => x.id === q.get('i')) : null;
  const ctx = p && it;
  let sel = 0;
  const backHref = ctx ? `#/plan/${p.id}` : '#/library';
  const used = plansUsing(ex.id);
  const thumbs = () => ex.media.length > 1 ? `<div class="thumbs" role="group" aria-label="Media">${ex.media.map((m, i) => `<button type="button" data-sel="${i}" aria-pressed="${i === sel}" aria-label="Show ${m.type === 'link' ? 'video link' : m.type} ${i + 1}">${mediaThumb(m)}</button>`).join('')}<a class="add" href="#/ex/${ex.id}/edit" aria-label="Add media" style="width:64px;height:64px;border-radius:14px;border:1px dashed var(--line-2);display:flex;align-items:center;justify-content:center;color:var(--muted);flex-shrink:0">${icon('plus')}</a></div>` : '';
  const stats = [];
  if (ctx) {
    if (it.sets) stats.push(['Sets', it.sets]);
    if (it.reps) stats.push(['Reps', it.reps]);
    if (it.dur) stats.push(['Time', fmtDur(it.dur)]);
    if (it.rest) stats.push(['Rest', fmtDur(it.rest)]);
  }
  const cues = ex.instructions.split('\n').map((x) => x.trim()).filter(Boolean);
  const idx = ctx ? p.items.indexOf(it) : -1;
  const next = ctx ? p.items[idx + 1] : null;
  const checked = ctx && isChecked(p.id, it.id);
  return {
    tab: ctx ? 'plans' : 'library', title: exName(ex),
    html: `<div class="stack">
      <div class="topbar"><a class="icon-btn" href="${backHref}" aria-label="Back">${icon('back')}</a><span class="t">${ctx ? `${h(planName(p))} · ${idx + 1} of ${p.items.length}` : 'Library'}</span><a class="icon-btn" href="#/ex/${ex.id}/edit${ctx ? '?back=' + encodeURIComponent(`/ex/${ex.id}?p=${p.id}&i=${it.id}`) : ''}" aria-label="Edit exercise">${icon('edit')}</a></div>
      ${ex.media.length ? `<div class="stack-sm"><div data-main>${mediaMain(ex.media[0])}</div>${thumbs()}</div>` : `<div class="empty"><strong>No video or photos yet</strong><span>Paste a YouTube link or add photos of your form.</span><a class="btn primary" href="#/ex/${ex.id}/edit">${icon('plus')}Add media</a></div>`}
      <div class="page-title"><h1 class="title-xl" tabindex="-1">${h(exName(ex))}</h1>
        <div class="row" style="flex-wrap:wrap;gap:6px">${ex.category ? `<span class="tag">${h(ex.category)}</span>` : ''}${used.length ? `<span class="small muted">In ${used.map((x) => h(planName(x))).join(', ')}</span>` : ''}</div></div>
      ${ctx ? (stats.length ? `<div class="stat-grid" style="grid-template-columns:repeat(${Math.min(stats.length, 4)},minmax(0,1fr))">${stats.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${h(v)}</b></div>`).join('')}</div>` : `<button type="button" class="btn block" data-act="target">${icon('edit')}Set sets, reps, time & rest</button>`) + (it.note ? `<div class="notes-box small"><span class="eyebrow">Note</span><div class="pre">${h(it.note)}</div></div>` : '') : ''}
      ${cues.length ? `<section class="stack-sm"><h2 class="eyebrow">Technique</h2>${cues.map((c, i) => `<div class="cue"><b>${i + 1}</b><span>${h(c)}</span></div>`).join('')}</section>` : ''}
      <label class="field"><span>My notes</span><textarea class="input" data-notes placeholder="Weights that worked, how it felt, form reminders…" maxlength="8000">${h(ex.notes)}</textarea></label>
      ${ctx ? `<div class="sticky-foot"><label class="done-toggle"><input type="checkbox" class="check" data-done ${checked ? 'checked' : ''}>Done today</label>${next ? `<a class="btn primary big" style="flex:1.4" href="#/ex/${next.exerciseId}?p=${p.id}&i=${next.id}">Next ${icon('chev')}</a>` : `<a class="btn primary big" style="flex:1.4" href="#/plan/${p.id}">Finish</a>`}</div>` : ''}
    </div>`,
    mount(root, signal) {
      on(root, signal, 'click', '[data-sel]', (el) => {
        sel = Number(el.dataset.sel);
        const mainEl = root.querySelector('[data-main]');
        mainEl.innerHTML = mediaMain(ex.media[sel]);
        hydrateMedia(mainEl);
        root.querySelectorAll('[data-sel]').forEach((x) => x.setAttribute('aria-pressed', x === el));
      });
      on(root, signal, 'click', '[data-act="embed"]', (el) => activateEmbed(el));
      on(root, signal, 'click', '[data-act="target"]', async () => { if (await targetSheet(it, ex)) rerender(); });
      const notes = root.querySelector('[data-notes]');
      notes.addEventListener('input', () => { ex.notes = notes.value; save(); }, { signal });
      root.querySelector('[data-done]')?.addEventListener('change', (e) => { setChecked(p.id, it.id, e.target.checked); if (e.target.checked) toast(`${exName(ex)} done`); }, { signal });
    },
  };
}

function viewExerciseEdit({ params: [id], q }) {
  const ex = getExercise(id);
  if (!ex) return { redirect: '/library' };
  const isNew = q.get('new') === '1';
  const back = q.get('back') && /^\/[\w\-/?=&]*$/.test(q.get('back')) ? q.get('back') : `/ex/${ex.id}`;
  const cats = [...new Set([...state.settings.categories, ex.category].filter(Boolean))];
  const mediaList = () => ex.media.length ? ex.media.map((m, i) => {
    const info = m.type === 'link' ? parseLink(m.url) : null;
    const label = m.type === 'link' ? `${info?.label || 'Link'}${info?.embed ? '' : ' · opens externally'}` : `${m.type === 'image' ? 'Photo' : 'Video'}${m.size ? ' · ' + fmtBytes(m.size) : ''} · on this device`;
    return `<div class="media-edit" data-m="${m.id}">
      <span class="thumb">${mediaThumb(m)}</span>
      <div class="grow"><span class="small muted">${i + 1}. ${h(label)}</span>
        <input class="input" data-cap="${m.id}" maxlength="300" placeholder="Caption (optional)" value="${h(m.caption)}" aria-label="Caption for media ${i + 1}">
        <div class="row" style="gap:4px"><button type="button" class="icon-btn sm" data-mact="up" data-id="${m.id}" aria-label="Move earlier" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button type="button" class="icon-btn sm" data-mact="down" data-id="${m.id}" aria-label="Move later" ${i === ex.media.length - 1 ? 'disabled' : ''}>${icon('down')}</button><span class="grow"></span><button type="button" class="icon-btn sm danger" data-mact="remove" data-id="${m.id}" aria-label="Remove media ${i + 1}">${icon('trash')}</button></div>
      </div></div>`;
  }).join('') : '<p class="small muted">Nothing yet. The first item is the one shown by default.</p>';
  return {
    tab: 'library', title: 'Edit exercise',
    html: `<div class="stack">
      <div class="topbar"><a class="icon-btn" href="#${h(back)}" aria-label="Done">${icon('back')}</a><span class="t">${isNew ? 'New exercise' : 'Edit exercise'}</span><span class="saved-pill" aria-live="polite" style="opacity:.55">${icon('check')}Autosaves</span></div>
      <h1 class="sr" tabindex="-1">Edit exercise</h1>
      <label class="field"><span>Exercise name</span><input class="input" data-f="name" maxlength="120" placeholder="e.g. Incline chest press" value="${h(ex.name)}" ${isNew ? 'autofocus' : ''}></label>
      <label class="field"><span>Category</span><select class="input" data-cat><option value="">None</option>${cats.map((c) => `<option ${c === ex.category ? 'selected' : ''}>${h(c)}</option>`).join('')}<option value="__new">+ New category…</option></select></label>
      <section class="stack-sm" aria-labelledby="media-h"><div class="section-head"><h2 id="media-h">Videos & photos</h2></div>
        <div class="grid-3">
          <button type="button" class="btn" data-act="link" style="flex-direction:column;min-height:72px;gap:4px;font-size:13px">${icon('link')}Paste link</button>
          <button type="button" class="btn" data-act="photo" style="flex-direction:column;min-height:72px;gap:4px;font-size:13px">${icon('image')}Photos</button>
          <button type="button" class="btn" data-act="video" style="flex-direction:column;min-height:72px;gap:4px;font-size:13px">${icon('video')}Video file</button>
        </div>
        <input type="file" accept="image/*" multiple hidden data-file="photo"><input type="file" accept="video/*" multiple hidden data-file="video">
        <div class="list" data-media>${mediaList()}</div>
      </section>
      <label class="field"><span>Technique & instructions</span><textarea class="input" data-f="instructions" maxlength="8000" placeholder="One cue per line, e.g.&#10;Shoulder blades back&#10;Control the lowering">${h(ex.instructions)}</textarea></label>
      <label class="field"><span>My notes</span><textarea class="input" data-f="notes" maxlength="8000" placeholder="Anything you want to remember">${h(ex.notes)}</textarea></label>
      <button type="button" class="btn danger block" data-act="delete">${icon('trash')}Delete exercise</button>
      <div class="sticky-foot"><a class="btn primary big block" href="#${h(back)}">Done</a></div>
    </div>`,
    mount(root, signal) {
      savedPill(root, signal);
      const mbox = root.querySelector('[data-media]');
      const redraw = () => { mbox.innerHTML = mediaList(); hydrateMedia(mbox); };
      on(root, signal, 'input', '[data-f]', (el) => { ex[el.dataset.f] = el.value; save(); });
      on(root, signal, 'input', '[data-cap]', (el) => { const m = ex.media.find((x) => x.id === el.dataset.cap); if (m) { m.caption = el.value.slice(0, 300); save(); } });
      root.querySelector('[data-cat]').addEventListener('change', async (e) => {
        if (e.target.value === '__new') {
          const name = await promptDialog({ title: 'New category', label: 'Category name', placeholder: 'e.g. Forearms' });
          if (name) {
            if (!state.settings.categories.includes(name)) state.settings.categories.push(name);
            ex.category = name; save(); rerender();
          } else e.target.value = ex.category;
          return;
        }
        ex.category = e.target.value; save();
      }, { signal });
      root.querySelectorAll('[data-file]').forEach((inp) => inp.addEventListener('change', async () => {
        const files = [...inp.files]; inp.value = '';
        if (files.length && await addFilesTo(ex, files)) redraw();
      }, { signal }));
      on(root, signal, 'click', '[data-act]', async (el) => {
        const a = el.dataset.act;
        if (a === 'photo') root.querySelector('[data-file="photo"]').click();
        if (a === 'video') root.querySelector('[data-file="video"]').click();
        if (a === 'link') { const m = await linkSheet(); if (m) { ex.media.push(m); save(); redraw(); toast('Video link added'); } }
        if (a === 'delete') {
          const used = plansUsing(ex.id);
          const ok = await confirmDialog({ title: `Delete “${exName(ex)}”?`, body: used.length ? `It will also be removed from: ${used.map(planName).join(', ')}. Its photos and videos are deleted from this device.` : 'Its photos and videos are deleted from this device.', ok: 'Delete', danger: true });
          if (!ok) return;
          ex.media.forEach((m) => m.blobId && forgetBlobUrl(m.blobId));
          deleteExercise(ex.id); toast('Exercise deleted'); go('/library');
        }
      });
      on(root, signal, 'click', '[data-mact]', async (el) => {
        const i = ex.media.findIndex((m) => m.id === el.dataset.id);
        if (i < 0) return;
        const a = el.dataset.mact;
        if (a === 'up' && i > 0) [ex.media[i - 1], ex.media[i]] = [ex.media[i], ex.media[i - 1]];
        if (a === 'down' && i < ex.media.length - 1) [ex.media[i + 1], ex.media[i]] = [ex.media[i], ex.media[i + 1]];
        if (a === 'remove') {
          const ok = await confirmDialog({ title: 'Remove this media?', body: ex.media[i].type === 'link' ? 'The link is removed from this exercise.' : 'The file is deleted from this device.', ok: 'Remove', danger: true });
          if (!ok) return;
          const [m] = ex.media.splice(i, 1);
          if (m.blobId) { forgetBlobUrl(m.blobId); gcBlobs(); }
        }
        save(); redraw();
      });
      return () => {
        if (!getExercise(ex.id)) return;
        const empty = !ex.name.trim() && !ex.media.length && !ex.instructions.trim() && !ex.notes.trim();
        if (empty && isNew && !plansUsing(ex.id).length) deleteExercise(ex.id);
        else if (!ex.name.trim()) { ex.name = 'Untitled exercise'; save(); }
      };
    },
  };
}

// ================= PROGRESS =================
function viewProgress() {
  const done = completedSessions().slice().sort((a, b) => b.endedAt - a.endedAt);
  const now = new Date();
  const wk = startOfWeek(now).getTime();
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const weeks = [...Array(8)].map((_, i) => {
    const s = startOfWeek(now); s.setDate(s.getDate() - 7 * (7 - i));
    const e = new Date(s); e.setDate(s.getDate() + 7);
    return { s, n: done.filter((x) => x.endedAt >= s.getTime() && x.endedAt < e.getTime()).length };
  });
  const max = Math.max(1, ...weeks.map((w) => w.n));
  const totalSets = done.reduce((a, s) => a + s.items.reduce((b, i) => b + i.sets.filter((x) => x.done).length, 0), 0);
  let lastMonth = '';
  const hist = done.slice(0, 200).map((s) => {
    const d = new Date(s.endedAt);
    const m = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const head = m !== lastMonth ? `<h2 class="group-title">${h(m)}</h2>` : '';
    lastMonth = m;
    const sets = s.items.reduce((b, i) => b + i.sets.filter((x) => x.done).length, 0);
    return `${head}<a class="item" href="#/history/${s.id}"><span class="thumb" style="flex-direction:column;font-family:var(--font-display);color:var(--text)"><b style="font-size:17px;line-height:1">${d.getDate()}</b><span style="font-size:10px;color:var(--muted)">${DAY_SHORT[d.getDay()]}</span></span><span class="grow"><span class="ttl" style="display:block">${h(s.planName)}</span><span class="sub">${fmtElapsed(s.activeMs)} · ${sets} set${sets === 1 ? '' : 's'} · ${s.items.filter((i) => i.done).length}/${s.items.length} exercises</span></span>${icon('chev', 'chev')}</a>`;
  }).join('');
  return {
    tab: 'progress', title: 'Progress',
    html: `<div class="stack">
      <h1 class="title-xl" tabindex="-1">Progress</h1>
      <div class="stat-grid"><div class="stat"><span>This week</span><b>${done.filter((x) => x.endedAt >= wk).length}</b></div><div class="stat"><span>This month</span><b>${done.filter((x) => x.endedAt >= month).length}</b></div><div class="stat"><span>All time</span><b>${done.length}</b></div></div>
      <section class="card stack-sm" aria-labelledby="w8"><div class="section-head"><h2 id="w8" style="font-size:17px">Workouts per week</h2><span class="small muted">${totalSets} sets logged</span></div>
        <div class="bars" role="img" aria-label="Workouts per week for the last 8 weeks: ${weeks.map((w) => w.n).join(', ')}">${weeks.map((w, i) => `<div class="b${i === 7 ? ' cur' : ''}"><em>${w.n || ''}</em><i style="height:${Math.round((w.n / max) * 80)}%"></i><span>${w.s.getMonth() + 1}/${w.s.getDate()}</span></div>`).join('')}</div></section>
      <section class="stack-sm" aria-labelledby="hist-h"><h2 id="hist-h" style="font-size:19px">History</h2>
        ${done.length ? `<div class="list">${hist}</div>` : `<div class="empty"><strong>No workouts logged yet</strong><span>Finish a workout in workout mode and it shows up here.</span></div>`}</section>
    </div>`,
  };
}

function viewSession({ params: [id] }) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return { redirect: '/progress' };
  const u = state.settings.units;
  const d = new Date(s.endedAt || s.startedAt);
  return {
    tab: 'progress', title: s.planName,
    html: `<div class="stack">
      <div class="topbar"><a class="icon-btn" href="#/progress" aria-label="Back">${icon('back')}</a><span class="t">Workout log</span><span style="width:44px"></span></div>
      <div class="page-title"><h1 class="title-xl" tabindex="-1">${h(s.planName)}</h1><p class="muted">${h(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))} · ${h(new Date(s.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))}</p></div>
      <div class="stat-grid"><div class="stat"><span>Time</span><b>${fmtElapsed(s.activeMs)}</b></div><div class="stat"><span>Exercises</span><b>${s.items.filter((i) => i.done).length}/${s.items.length}</b></div><div class="stat"><span>Sets</span><b>${s.items.reduce((b, i) => b + i.sets.filter((x) => x.done).length, 0)}</b></div></div>
      ${s.items.map((it) => {
        const logged = it.sets.some((x) => x.weight || x.reps);
        return `<section class="card stack-sm"><div class="row between"><strong>${h(it.name)}</strong>${it.done ? `<span class="tag accent">${icon('check')}Done</span>` : '<span class="tag">Skipped</span>'}</div><span class="small muted">${h(fmtTarget(it.target) || 'No target')}</span>
          ${logged ? `<table class="log-table"><thead><tr><th>Set</th><th>Weight (${u})</th><th>Reps</th><th>Done</th></tr></thead><tbody>${it.sets.map((x, i) => `<tr><td>${i + 1}</td><td>${h(x.weight || '—')}</td><td>${h(x.reps || '—')}</td><td>${x.done ? '✓' : ''}</td></tr>`).join('')}</tbody></table>` : `<span class="small">${it.sets.filter((x) => x.done).length} of ${it.sets.length} sets done</span>`}</section>`;
      }).join('')}
      <button type="button" class="btn danger block" data-act="del">${icon('trash')}Delete this log</button>
    </div>`,
    mount(root, signal) {
      on(root, signal, 'click', '[data-act="del"]', async () => {
        if (!await confirmDialog({ title: 'Delete this workout log?', body: 'It is removed from your history and stats.', ok: 'Delete', danger: true })) return;
        state.sessions = state.sessions.filter((x) => x.id !== s.id); save(); toast('Log deleted'); go('/progress');
      });
    },
  };
}

// ================= SETTINGS =================
function viewSettings() {
  const s = state.settings;
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-set="${key}" data-v="${v}" aria-pressed="${String(s[key]) === String(v)}">${l}</button>`).join('')}</div>`;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return {
    tab: '', title: 'Settings',
    html: `<div class="stack">
      <div class="topbar"><a class="icon-btn" href="#/" aria-label="Back to home">${icon('back')}</a><span class="t">Settings</span><span class="saved-pill" style="opacity:.55">${icon('check')}Autosaves</span></div>
      <h1 class="title-xl" tabindex="-1">Settings</h1>
      <section class="card stack-sm"><h2 class="eyebrow">You</h2><label class="field"><span>Your name (for the greeting)</span><input class="input" data-name maxlength="40" value="${h(s.name)}" placeholder="Optional" autocomplete="given-name"></label></section>
      <section class="card stack-sm"><h2 class="eyebrow">Appearance</h2>${seg('theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'Auto']])}
        <div class="swatches" role="group" aria-label="Accent color">${Object.entries(ACCENTS).map(([k, c]) => `<button type="button" class="swatch" data-accent="${k}" style="background:${c}" aria-pressed="${s.accent === k}" aria-label="${k} accent"></button>`).join('')}</div></section>
      <section class="card stack-sm"><h2 class="eyebrow">Workout mode</h2>
        <span class="label">Weight units</span>${seg('units', [['lb', 'lb'], ['kg', 'kg']])}
        <span class="label">Default rest timer</span>${seg('defaultRest', [[30, '30s'], [60, '60s'], [90, '90s'], [120, '2m']])}
        <label class="row" style="min-height:44px"><input type="checkbox" class="check" data-toggle="autoRest" ${s.autoRest ? 'checked' : ''}><span class="grow">Start rest timer when I tick a set</span></label>
        <label class="row" style="min-height:44px"><input type="checkbox" class="check" data-toggle="logDetails" ${s.logDetails ? 'checked' : ''}><span class="grow">Show weight & reps boxes for every set</span></label></section>
      <section class="card stack-sm"><h2 class="eyebrow">Categories</h2><div class="chips">${s.categories.map((c) => `<button type="button" class="chip" data-catedit="${h(c)}" aria-label="Edit category ${h(c)}">${h(c)}</button>`).join('')}<button type="button" class="chip" data-act="addcat">${icon('plus')}Add</button></div></section>
      <section class="card stack-sm"><h2 class="eyebrow">Starter plans</h2><span class="small muted">Load the Beginner Home Plan or the PPL × U/L split into your plans.</span><button type="button" class="btn" data-act="templates">Open starter plans</button></section>
      <section class="card stack-sm" aria-labelledby="bk"><h2 class="eyebrow" id="bk">Backup & restore</h2>
        <p class="small">Everything in Bankai — plans, history, and your photos & videos — is saved <strong>only on this device</strong>, in this browser. Nothing is uploaded. Clearing browser data, uninstalling, or switching phones loses it unless you have a backup. YouTube and other links are stored as links.</p>
        <div class="kv"><span>Storage used</span><span data-usage>…</span></div><div class="kv"><span>Protected from auto-cleanup</span><span data-persist>…</span></div>
        <button type="button" class="btn primary" data-act="backup-full">${icon('download')}Back up everything</button>
        <button type="button" class="btn" data-act="backup-data">${icon('download')}Back up without photos & videos</button>
        <button type="button" class="btn" data-act="restore">${icon('upload')}Restore from a backup file</button>
        <input type="file" accept="application/json,.json" hidden data-restore>
        <p class="small muted">Restoring replaces what’s on this device. Backups are plain .json files — keep them in Google Drive, iCloud or email them to yourself.</p></section>
      <section class="card stack-sm"><h2 class="eyebrow">Install on your phone</h2>
        ${standalone ? '<p class="small">Bankai is installed — you’re using the app version.</p>' : ''}
        <details class="help"><summary>iPhone / iPad (Safari)</summary><ol><li>Open Bankai in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol></details>
        <details class="help"><summary>Android (Chrome)</summary><ol><li>Open Bankai in <strong>Chrome</strong>.</li><li>Tap <strong>⋮</strong> (top right).</li><li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li></ol></details>
        <p class="small muted">Once installed it opens full-screen and works offline. Embedded videos still need internet.</p></section>
      <section class="card stack-sm"><h2 class="eyebrow">Danger zone</h2><button type="button" class="btn danger" data-act="erase">${icon('trash')}Erase all Bankai data on this device</button></section>
      <p class="small muted" style="text-align:center">Bankai · v1.0 · Your data never leaves this device unless you export it.</p>
    </div>`,
    mount(root, signal) {
      savedPill(root, signal);
      (async () => {
        try {
          const est = await navigator.storage?.estimate?.();
          root.querySelector('[data-usage]').textContent = est ? `${fmtBytes(est.usage || 0)}${est.quota ? ' of ~' + fmtBytes(est.quota) : ''}` : 'Unknown';
          const p = await navigator.storage?.persisted?.();
          const el = root.querySelector('[data-persist]');
          if (p) el.textContent = 'Yes';
          else { el.innerHTML = '<button type="button" class="link-btn" data-act="persist">Turn on</button>'; }
        } catch { /* ignore */ }
      })();
      root.querySelector('[data-name]').addEventListener('input', (e) => { s.name = e.target.value.slice(0, 40); save(); }, { signal });
      on(root, signal, 'click', '[data-set]', (el) => {
        const k = el.dataset.set;
        s[k] = k === 'defaultRest' ? Number(el.dataset.v) : el.dataset.v;
        root.querySelectorAll(`[data-set="${k}"]`).forEach((x) => x.setAttribute('aria-pressed', x === el));
        save(); if (k === 'theme') applyTheme();
      });
      on(root, signal, 'click', '[data-accent]', (el) => { s.accent = el.dataset.accent; root.querySelectorAll('[data-accent]').forEach((x) => x.setAttribute('aria-pressed', x === el)); save(); applyTheme(); });
      on(root, signal, 'change', '[data-toggle]', (el) => { s[el.dataset.toggle] = el.checked; save(); });
      on(root, signal, 'click', '[data-catedit]', async (el) => {
        const old = el.dataset.catedit;
        const c = await sheet({ title: old, center: true, render(b, close) {
          b.innerHTML = `<label class="field"><span>Rename</span><input class="input" value="${h(old)}" maxlength="60"></label><div class="sheet-actions"><button type="button" class="btn danger" data-d>Delete</button><button type="button" class="btn primary" data-s>Save</button></div><p class="small muted">Exercises keep working if you delete a category; they just show “No category”.</p>`;
          b.querySelector('[data-s]').onclick = () => close({ rename: b.querySelector('input').value.trim() });
          b.querySelector('[data-d]').onclick = () => close({ del: true });
        } });
        if (!c) return;
        if (c.del) { s.categories = s.categories.filter((x) => x !== old); for (const e of Object.values(state.exercises)) if (e.category === old) e.category = ''; }
        else if (c.rename && c.rename !== old) { s.categories = s.categories.map((x) => (x === old ? c.rename : x)); for (const e of Object.values(state.exercises)) if (e.category === old) e.category = c.rename; }
        save(); rerender();
      });
      on(root, signal, 'click', '[data-act]', async (el) => {
        const a = el.dataset.act;
        if (a === 'addcat') { const n = await promptDialog({ title: 'New category', label: 'Name', placeholder: 'e.g. Forearms' }); if (n && !s.categories.includes(n)) { s.categories.push(n); save(); rerender(); } }
        if (a === 'templates') templatesSheet();
        if (a === 'persist') { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Storage protected' : 'Your browser decides this automatically. Installing Bankai to your home screen usually helps.', { ms: 5000 }); rerender(); }
        if (a === 'backup-full' || a === 'backup-data') {
          el.disabled = true;
          try { await flush(); const r = await exportBackup(a === 'backup-full'); toast(r); } catch (e) { toast('Backup failed: ' + e.message, { ms: 6000 }); }
          el.disabled = false;
        }
        if (a === 'restore') root.querySelector('[data-restore]').click();
        if (a === 'erase') {
          if (!await confirmDialog({ title: 'Erase everything?', body: 'All workouts, exercises, history, photos and videos in Bankai on this device are permanently deleted. Back up first if you might want them.', ok: 'Erase everything', danger: true })) return;
          if (!await confirmDialog({ title: 'Are you sure?', body: 'This can’t be undone.', ok: 'Yes, erase', danger: true })) return;
          const { eraseAll } = await import('./backup.js');
          await eraseAll(); applyTheme(); toast('All data erased'); go('/welcome');
        }
      });
      root.querySelector('[data-restore]').addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try { const msg = await importBackupFile(f); if (msg) { applyTheme(); toast(msg, { ms: 5000 }); go('/'); } }
        catch (err) { toast(err.message || 'That file couldn’t be restored', { ms: 6000 }); }
      }, { signal });
    },
  };
}

// ================= WELCOME =================
function viewWelcome() {
  if (state.onboarded) return { redirect: '/' };
  return {
    tab: '', noTabs: true, title: 'Welcome',
    html: `<div class="welcome">
      <img class="logo" src="icons/icon-192.png" alt="" width="76" height="76">
      <div class="stack-sm"><h1 class="title-xl" style="font-size:36px" tabindex="-1">Bankai</h1><p class="muted" style="font-size:17px">Your workouts, demo videos and progress — in one place on your phone.</p></div>
      <section class="stack-sm" aria-labelledby="tpl-h"><h2 class="eyebrow" id="tpl-h">Start with a plan? (optional)</h2>
        ${TEMPLATES.map((t) => `<label class="tpl"><input type="checkbox" class="check" data-tpl="${t.id}"><span class="stack-sm" style="gap:4px"><strong>${h(t.name)}</strong><span class="small muted">${h(t.blurb)}</span></span></label>`).join('')}
      </section>
      <div class="stack-sm"><button type="button" class="btn primary big block" data-act="go">Get started</button>
        <button type="button" class="btn ghost block" data-act="restore">${icon('upload')}Restore from a backup</button><input type="file" accept="application/json,.json" hidden data-restore></div>
      <p class="small muted">Everything you add is stored privately on this device. No account needed.</p>
    </div>`,
    mount(root, signal) {
      on(root, signal, 'click', '[data-act]', (el) => {
        if (el.dataset.act === 'go') {
          root.querySelectorAll('[data-tpl]:checked').forEach((c) => loadTemplate(c.dataset.tpl));
          state.onboarded = true; save(true); requestPersist();
          go('/');
        }
        if (el.dataset.act === 'restore') root.querySelector('[data-restore]').click();
      });
      root.querySelector('[data-restore]').addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try { const msg = await importBackupFile(f); if (msg) { state.onboarded = true; save(true); applyTheme(); toast(msg, { ms: 5000 }); go('/'); } }
        catch (err) { toast(err.message || 'That file couldn’t be restored', { ms: 6000 }); }
      }, { signal });
    },
  };
}

// ================= BOOT =================
async function boot() {
  try {
    await loadState();
  } catch (e) {
    main.innerHTML = `<div class="empty"><strong>Bankai couldn’t open its storage</strong><span>${h(e.message)}</span></div>`;
    return;
  }
  applyTheme();
  window.addEventListener('hashchange', () => render());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', () => flush());
  render();
  gcBlobs();
  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version of Bankai is ready', { action: 'Update', ms: 15000, onAction: () => nw.postMessage('skipWaiting') });
        }
      });
    });
  }).catch((e) => console.warn('SW registration failed', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; flush().then(() => location.reload()); } });
}

boot();
