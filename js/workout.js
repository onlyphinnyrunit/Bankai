// Workout mode: distraction-free session runner, rest/duration timers, summary.
import { state, save, flush, uid, getPlan, getExercise, setChecked, dayKey } from './store.js';
import { h, icon, toast, sheet, confirmDialog, fmtTarget, fmtDur, fmtClock, fmtElapsed } from './ui.js';
import { mediaThumb, mediaMain, activateEmbed, hydrateMedia } from './mediaview.js';
import { go, rerender } from './app.js';

function on(root, signal, type, sel, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(t, e);
  }, { signal });
}

// ---------- session lifecycle ----------
export function startWorkout(planId) {
  const p = getPlan(planId);
  if (!p || !p.items.length) { toast('Add exercises to this workout first'); return; }
  if (state.activeSession) finishSession(state.activeSession, { silent: true });
  const items = p.items.map((it) => {
    const ex = getExercise(it.exerciseId);
    const n = Math.max(1, Math.min(it.sets || 1, 30));
    return {
      itemId: it.id, exerciseId: it.exerciseId, name: ex?.name?.trim() || 'Untitled exercise',
      target: { sets: it.sets, reps: it.reps, dur: it.dur, rest: it.rest, note: it.note },
      sets: [...Array(n)].map(() => ({ done: false, weight: '', reps: '' })), done: false,
    };
  });
  state.activeSession = {
    id: uid(), planId: p.id, planName: p.name?.trim() || 'Workout', startedAt: Date.now(), endedAt: null,
    activeMs: 0, pausedAt: null, pausedMs: 0, index: 0, items, rest: null, dtimer: null, note: '',
  };
  save(true);
  go('/workout');
}

function elapsedMs(s, now = Date.now()) {
  const pausedNow = s.pausedAt ? now - s.pausedAt : 0;
  return Math.max(0, (s.endedAt || now) - s.startedAt - s.pausedMs - pausedNow);
}

function finishSession(s, { silent = false } = {}) {
  const now = Date.now();
  if (s.pausedAt) { s.pausedMs += now - s.pausedAt; s.pausedAt = null; }
  s.endedAt = now;
  s.activeMs = elapsedMs(s, now);
  s.rest = null; s.dtimer = null;
  for (const it of s.items) if (!it.done && it.sets.length && it.sets.every((x) => x.done)) it.done = true;
  const touched = s.items.some((it) => it.done || it.sets.some((x) => x.done));
  const day = dayKey(new Date(now));
  if (touched) {
    state.sessions.push(s);
    if (getPlan(s.planId)) for (const it of s.items) if (it.done) setChecked(s.planId, it.itemId, true, day);
  }
  state.activeSession = null;
  save(true);
  if (!silent && !touched) toast('Workout ended — nothing was logged, so it wasn’t saved to history', { ms: 5000 });
  return touched;
}

// ---------- alerts ----------
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* no audio */ }
}
function alertDone() {
  try { navigator.vibrate?.([220, 120, 220]); } catch { /* ignore */ }
  try {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [0, 0.22].forEach((d) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(audioCtx.destination); o.start(t + d); o.stop(t + d + 0.2);
    });
  } catch { /* ignore */ }
}

// timer = { total, endAt (running), left (paused), idx }
const timeLeft = (t, now = Date.now()) => (!t ? 0 : t.endAt ? Math.max(0, (t.endAt - now) / 1000) : t.left ?? t.total);
const running = (t) => !!(t && t.endAt);

function lastTime(exerciseId, u) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const it = state.sessions[i].items.find((x) => x.exerciseId === exerciseId);
    if (!it) continue;
    const logged = it.sets.filter((x) => x.done && (x.weight || x.reps));
    if (logged.length) return logged.map((x) => `${x.weight ? x.weight + ' ' + u : ''}${x.weight && x.reps ? ' × ' : ''}${x.reps ? x.reps : ''}`).join(', ');
    const n = it.sets.filter((x) => x.done).length;
    if (n) return `${n} set${n === 1 ? '' : 's'} done`;
  }
  return '';
}

function fmtClockLong(ms) {
  const sec = Math.floor(ms / 1000);
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

// ================= WORKOUT VIEW =================
let showLog = null; // per-session toggle for weight/reps boxes

export function viewWorkout() {
  const s = state.activeSession;
  if (!s) return { redirect: '/' };
  if (s.index >= s.items.length) s.index = s.items.length - 1;
  const it = s.items[s.index];
  const ex = getExercise(it.exerciseId);
  const u = state.settings.units;
  const logging = showLog ?? state.settings.logDetails;
  const n = s.items.length;
  const doneCount = s.items.filter((x) => x.done).length;
  const t = it.target;
  const restSec = t.rest ?? state.settings.defaultRest;
  const last = lastTime(it.exerciseId, u);
  const media = ex?.media || [];
  const cues = (ex?.instructions || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const isLast = s.index === n - 1;
  const setLabel = (i) => [`Set ${i + 1}`, t.reps ? `${t.reps} reps` : t.dur ? fmtDur(t.dur) : ''].filter(Boolean).join(' · ');

  const rows = it.sets.map((x, i) => `<div class="set-row${logging ? ' logging' : ''}">
      <button type="button" class="set-btn" data-set="${i}" aria-pressed="${x.done}" aria-label="${h(setLabel(i))}${x.done ? ', done' : ''}">${x.done ? icon('check') : i + 1}</button>
      ${logging ? `<input class="input" data-w="${i}" inputmode="decimal" maxlength="12" placeholder="${u}" value="${h(x.weight)}" aria-label="Set ${i + 1} weight in ${u}">
        <input class="input" data-r="${i}" inputmode="numeric" maxlength="12" placeholder="${h(t.reps || 'reps')}" value="${h(x.reps)}" aria-label="Set ${i + 1} reps">`
        : `<span class="set-label">${h(setLabel(i))}</span>`}
    </div>`).join('');

  const dtimer = t.dur ? `<div class="timer-card${running(s.dtimer) ? ' live' : ''}" data-dt>
      <div><div class="lbl">Timer</div><div class="time" data-dt-time aria-live="off">${fmtClock(s.dtimer ? timeLeft(s.dtimer) : t.dur)}</div></div>
      <div class="acts"><button type="button" class="icon-btn" data-act="dt-toggle" aria-label="${running(s.dtimer) ? 'Pause timer' : 'Start timer'}">${icon(running(s.dtimer) ? 'pause' : 'play')}</button>
      <button type="button" class="icon-btn" data-act="dt-reset" aria-label="Reset timer">${icon('reset')}</button></div></div>` : '';

  const restCard = `<div class="timer-card${running(s.rest) ? ' live' : ''}" data-rest>
      <div><div class="lbl">Rest</div><div class="time" data-rest-time aria-live="off">${fmtClock(s.rest ? timeLeft(s.rest) : restSec)}</div></div>
      <div class="acts">
        <button type="button" class="icon-btn sm" data-act="rest-minus" aria-label="15 seconds less">−15</button>
        <button type="button" class="icon-btn sm" data-act="rest-plus" aria-label="15 seconds more">+15</button>
        <button type="button" class="icon-btn" data-act="rest-toggle" aria-label="${running(s.rest) ? 'Pause rest timer' : 'Start rest timer'}">${icon(running(s.rest) ? 'pause' : 'play')}</button>
        <button type="button" class="icon-btn" data-act="rest-reset" aria-label="Reset rest timer">${icon('reset')}</button>
      </div></div>`;

  const paused = s.pausedAt ? `<div class="paused-overlay" role="dialog" aria-modal="true" aria-labelledby="pz-h"><div class="card">
      <h2 id="pz-h" class="title-lg">Paused</h2><p class="muted small">${h(s.planName)} · ${doneCount} of ${n} exercises done</p>
      <button type="button" class="btn primary big block" data-act="resume" autofocus>${icon('play')}Resume</button>
      <button type="button" class="btn block" data-act="end">${icon('flag')}Finish & save</button>
      <button type="button" class="btn ghost block" data-act="discard" style="color:var(--danger)">Discard workout</button></div></div>` : '';

  return {
    tab: '', noTabs: true, title: 'Workout',
    html: `<div class="stack wk">
      <div class="wk-top">
        <button type="button" class="icon-btn" data-act="pause" aria-label="Pause or finish workout">${icon('pause')}</button>
        <div class="grow"><div class="lbl"><span>Exercise ${s.index + 1} of ${n}</span><span data-elapsed>${fmtClockLong(elapsedMs(s))}</span></div>
          <div class="bar" role="progressbar" aria-label="Workout progress" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${doneCount}"><i style="width:${Math.round((doneCount / n) * 100)}%"></i></div></div>
        <button type="button" class="icon-btn" data-act="list" aria-label="All exercises">${icon('more')}</button>
      </div>
      ${media.length ? `<div class="stack-sm"><div data-main>${mediaMain(media[0])}</div>${media.length > 1 ? `<div class="thumbs" role="group" aria-label="Media">${media.map((m, i) => `<button type="button" data-sel="${i}" aria-pressed="${i === 0}" aria-label="Show media ${i + 1}">${mediaThumb(m)}</button>`).join('')}</div>` : ''}</div>` : ''}
      <div class="stack-sm" style="gap:6px">
        <span class="eyebrow accent">${h(s.planName)}</span>
        <h1 class="wk-name" tabindex="-1">${h(it.name)}${it.done ? ` <span class="tag accent" style="vertical-align:middle">${icon('check')}Done</span>` : ''}</h1>
        <span class="muted">${h([fmtTarget(t), t.note].filter(Boolean).join(' · ') || 'No target set')}</span>
        ${last ? `<span class="small muted">Last time: ${h(last)}</span>` : ''}
      </div>
      ${dtimer}
      <section class="stack-sm" aria-label="Sets">
        ${logging ? `<div class="set-row logging small muted" aria-hidden="true" style="font-weight:700"><span></span><span style="text-align:center">Weight (${u})</span><span style="text-align:center">Reps</span></div>` : ''}
        <div class="sets">${rows}</div>
        <div class="row" style="flex-wrap:wrap;gap:8px">
          <button type="button" class="btn sm" data-act="addset">${icon('plus')}Set</button>
          ${it.sets.length > 1 ? `<button type="button" class="btn sm" data-act="rmset">Remove last set</button>` : ''}
          <button type="button" class="btn sm ghost" data-act="toggle-log" aria-pressed="${logging}">${logging ? 'Hide weight & reps' : 'Log weight & reps'}</button>
        </div>
      </section>
      ${restCard}
      ${cues.length || ex?.notes ? `<details class="help card"><summary>Technique & notes</summary><div class="stack-sm">${cues.map((c, i) => `<div class="cue"><b>${i + 1}</b><span>${h(c)}</span></div>`).join('')}${ex?.notes ? `<div class="small pre muted">${h(ex.notes)}</div>` : ''}</div></details>` : ''}
      <div class="sticky-foot wk-nav">
        <button type="button" class="icon-btn" data-act="prev" aria-label="Previous exercise" ${s.index === 0 ? 'disabled' : ''}>${icon('back')}</button>
        <button type="button" class="btn primary big" data-act="next">${isLast ? `${icon('flag')}Finish workout` : `Next exercise ${icon('chev')}`}</button>
      </div>
      ${paused}
    </div>`,
    mount(root, signal) {
      root.addEventListener('pointerdown', unlockAudio, { signal, once: true });
      // keep the screen awake during the workout
      let lock = null;
      const getLock = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !state.activeSession?.pausedAt) lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ } };
      getLock();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { getLock(); tick(); } }, { signal });

      const restEl = root.querySelector('[data-rest-time]');
      const dtEl = root.querySelector('[data-dt-time]');
      const elEl = root.querySelector('[data-elapsed]');
      function tick() {
        const cur = state.activeSession;
        if (!cur) return;
        elEl.textContent = fmtClockLong(elapsedMs(cur));
        if (cur.rest) {
          const left = timeLeft(cur.rest);
          restEl.textContent = fmtClock(left);
          if (running(cur.rest) && left <= 0) { cur.rest = null; save(); alertDone(); toast('Rest over — next set'); rerender(); return; }
        }
        if (dtEl && cur.dtimer) {
          const left = timeLeft(cur.dtimer);
          dtEl.textContent = fmtClock(left);
          if (running(cur.dtimer) && left <= 0) {
            const item = cur.items[cur.index];
            const idx = item.sets.findIndex((x) => !x.done);
            if (idx >= 0) item.sets[idx].done = true;
            if (item.sets.every((x) => x.done)) item.done = true;
            cur.dtimer = null; save(); alertDone(); toast('Time! Set done');
            rerender(); return;
          }
        }
      }
      const iv = setInterval(tick, 250);

      const startRest = (sec) => { s.rest = { total: sec, endAt: Date.now() + sec * 1000, left: null, idx: s.index }; };
      const go2 = (i) => { s.index = Math.max(0, Math.min(n - 1, i)); s.dtimer = null; save(); window.scrollTo(0, 0); rerender(); };

      on(root, signal, 'click', '[data-sel]', (el) => {
        const mainEl = root.querySelector('[data-main]');
        mainEl.innerHTML = mediaMain(media[Number(el.dataset.sel)]);
        hydrateMedia(mainEl);
        root.querySelectorAll('[data-sel]').forEach((x) => x.setAttribute('aria-pressed', x === el));
      });
      on(root, signal, 'click', '[data-act="embed"]', (el) => activateEmbed(el));

      on(root, signal, 'click', '[data-set]', (el) => {
        unlockAudio();
        const i = Number(el.dataset.set);
        const set = it.sets[i];
        set.done = !set.done;
        if (set.done && !set.reps && t.reps && /^\d+$/.test(t.reps) && logging) set.reps = t.reps;
        const wasDone = it.done;
        it.done = it.sets.every((x) => x.done);
        if (set.done && state.settings.autoRest && restSec > 0) startRest(restSec);
        save();
        if (it.done && !wasDone) toast(isLast ? 'Last exercise done — tap Finish' : `${it.name} done`);
        rerender();
      });
      on(root, signal, 'input', '[data-w]', (el) => { it.sets[Number(el.dataset.w)].weight = el.value.slice(0, 12); save(); });
      on(root, signal, 'input', '[data-r]', (el) => { it.sets[Number(el.dataset.r)].reps = el.value.slice(0, 12); save(); });

      on(root, signal, 'click', '[data-act]', async (el) => {
        const a = el.dataset.act;
        unlockAudio();
        if (a === 'addset') { it.sets.push({ done: false, weight: '', reps: '' }); it.done = false; save(); rerender(); }
        if (a === 'rmset' && it.sets.length > 1) { it.sets.pop(); it.done = it.sets.every((x) => x.done); save(); rerender(); }
        if (a === 'toggle-log') { showLog = !logging; rerender(); }
        if (a === 'rest-toggle') {
          if (running(s.rest)) s.rest = { ...s.rest, left: timeLeft(s.rest), endAt: null };
          else if (s.rest && s.rest.left > 0) s.rest = { ...s.rest, endAt: Date.now() + s.rest.left * 1000, left: null };
          else startRest(restSec);
          save(); rerender();
        }
        if (a === 'rest-reset') { s.rest = null; save(); rerender(); }
        if (a === 'rest-plus' || a === 'rest-minus') {
          const d = a === 'rest-plus' ? 15 : -15;
          if (!s.rest) s.rest = { total: restSec, endAt: null, left: restSec, idx: s.index };
          if (running(s.rest)) s.rest.endAt = Math.max(Date.now() + 1000, s.rest.endAt + d * 1000);
          else s.rest.left = Math.max(5, (s.rest.left ?? s.rest.total) + d);
          save(); tick();
        }
        if (a === 'dt-toggle') {
          if (running(s.dtimer)) s.dtimer = { ...s.dtimer, left: timeLeft(s.dtimer), endAt: null };
          else { const left = s.dtimer?.left > 0 ? s.dtimer.left : t.dur; s.dtimer = { total: t.dur, endAt: Date.now() + left * 1000, left: null, idx: s.index }; }
          save(); rerender();
        }
        if (a === 'dt-reset') { s.dtimer = null; save(); rerender(); }
        if (a === 'prev') go2(s.index - 1);
        if (a === 'next') {
          if (!isLast) { go2(s.index + 1); return; }
          const left = s.items.filter((x) => !x.done).length;
          if (left && !await confirmDialog({ title: 'Finish workout?', body: `${left} exercise${left === 1 ? ' isn’t' : 's aren’t'} marked done. They’ll be saved as skipped.`, ok: 'Finish' })) return;
          endIt();
        }
        if (a === 'list') {
          const pick = await sheet({
            title: 'Exercises',
            render(b, close) {
              b.innerHTML = `<div class="pick-list">${s.items.map((x, i) => `<button type="button" class="item" data-i="${i}" ${i === s.index ? 'aria-current="true"' : ''}><span class="num">${x.done ? icon('check') : i + 1}</span><span class="grow"><span class="ttl" style="display:block">${h(x.name)}</span><span class="sub">${h(fmtTarget(x.target) || '')}${i === s.index ? ' · current' : ''}</span></span></button>`).join('')}</div>`;
              b.querySelectorAll('[data-i]').forEach((x) => x.addEventListener('click', () => close(Number(x.dataset.i))));
            },
          });
          if (Number.isInteger(pick)) go2(pick);
        }
        if (a === 'pause') {
          s.pausedAt = Date.now();
          if (running(s.rest)) s.rest = { ...s.rest, left: timeLeft(s.rest), endAt: null };
          if (running(s.dtimer)) s.dtimer = { ...s.dtimer, left: timeLeft(s.dtimer), endAt: null };
          save(); try { await lock?.release(); } catch { /* ignore */ } rerender();
        }
        if (a === 'resume') { s.pausedMs += Date.now() - s.pausedAt; s.pausedAt = null; save(); rerender(); }
        if (a === 'end') endIt();
        if (a === 'discard') {
          if (!await confirmDialog({ title: 'Discard this workout?', body: 'Nothing from this session is saved to your history.', ok: 'Discard', danger: true })) return;
          state.activeSession = null; save(true); toast('Workout discarded'); go('/');
        }
      });

      function endIt() {
        const id = s.id;
        const saved = finishSession(s);
        showLog = null;
        flush();
        go(saved ? `/summary/${id}` : '/');
      }

      root.querySelector('[data-act="resume"]')?.focus();
      return () => { clearInterval(iv); try { lock?.release(); } catch { /* ignore */ } };
    },
  };
}

// ================= SUMMARY =================
export function viewSummary({ params: [id] }) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return { redirect: '/progress' };
  const sets = s.items.reduce((b, i) => b + i.sets.filter((x) => x.done).length, 0);
  const done = s.items.filter((i) => i.done).length;
  return {
    tab: '', noTabs: true, title: 'Workout complete',
    html: `<div class="stack">
      <div class="summary-hero"><div class="ring">${icon('check')}</div><h1 class="title-xl" tabindex="-1">Workout complete</h1>
        <p class="muted">${h(s.planName)} · ${h(new Date(s.endedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))}</p></div>
      <div class="stat-grid"><div class="stat"><span>Time</span><b>${fmtElapsed(s.activeMs)}</b></div><div class="stat"><span>Exercises</span><b>${done}/${s.items.length}</b></div><div class="stat"><span>Sets</span><b>${sets}</b></div></div>
      <div class="list">${s.items.map((it) => `<div class="item"><span class="num">${it.done ? icon('check') : '–'}</span><span class="grow"><span class="ttl" style="display:block">${h(it.name)}</span><span class="sub">${it.sets.filter((x) => x.done).length}/${it.sets.length} sets${it.sets.some((x) => x.weight) ? ' · ' + h(it.sets.filter((x) => x.weight).map((x) => x.weight + (x.reps ? '×' + x.reps : '')).join(', ')) : ''}</span></span>${it.done ? '' : '<span class="tag">Skipped</span>'}</div>`).join('')}</div>
      <label class="field"><span>How did it go? (optional)</span><textarea class="input" data-note maxlength="2000" placeholder="Energy, pain, what to change next time…">${h(s.note)}</textarea></label>
      <div class="stack-sm"><a class="btn primary big block" href="#/">Done</a><a class="btn block" href="#/history/${s.id}">View full log</a></div>
    </div>`,
    mount(root, signal) {
      root.querySelector('[data-note]').addEventListener('input', (e) => { s.note = e.target.value.slice(0, 2000); save(); }, { signal });
    },
  };
}
