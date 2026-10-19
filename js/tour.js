// Quick tutorial: spotlights one button at a time with a short explanation.
import { state, save } from './store.js';

const STEPS = [
  { sel: null, title: 'Welcome to Bankai', text: 'Here’s a quick tour of the buttons you’ll use most. Tap Next to continue, or Skip to jump straight in.' },
  { sel: '.today', title: 'Today’s workout', text: 'Shows the workout scheduled for today. To schedule one, edit a workout and tap the days it should run.' },
  { sel: '.today .btn.primary', title: 'Start a workout', text: 'Opens workout mode: tick off sets, use the rest timer, move to the next exercise, then save it to your history.' },
  { sel: '.quick [data-act="new-plan"]', title: 'New workout', text: 'Create a workout like “Push day” or “Monday” and add exercises to it.' },
  { sel: '.quick [data-act="new-ex"]', title: 'New exercise', text: 'Add an exercise to your library. Each one can have its own videos, photos, technique cues and notes.' },
  { sel: '.quick [data-act="qa-photo"]', title: 'Add a photo', text: 'Pick photos from your phone and attach them to an exercise — handy for form reference or machine setup.' },
  { sel: '.quick [data-act="qa-video"]', title: 'Add a video', text: 'Paste a YouTube link or choose a video file, then pick which exercise it belongs to. It plays right inside Bankai.' },
  { sel: '[aria-labelledby="plans-h"]', title: 'My plans', text: 'Your workouts. Tap one to see its exercises, tick them off, or edit it. Swipe sideways to see more.' },
  { sel: '[aria-labelledby="lib-h"]', title: 'Exercise library', text: 'Search every exercise along with its videos, photos and notes.' },
  { sel: '[aria-labelledby="week-h"]', title: 'This week', text: 'A dot fills in for each day you finish a workout. Try to keep the streak going.' },
  { sel: '.home-head a[href="#/settings"]', title: 'Settings', text: 'Theme, units, rest timer and Backup & restore. Back up now and then — your data lives only on this device.' },
  { sel: '#tabbar [data-tab="plans"]', title: 'Plans', text: 'Browse, create, duplicate and edit all your workouts, grouped by program.' },
  { sel: '#tabbar [data-tab="library"]', title: 'Library', text: 'Every exercise in one place, with filters by muscle group.' },
  { sel: '#tabbar [data-tab="progress"]', title: 'Progress', text: 'Your workout history, weekly chart and every set you’ve logged.' },
  { sel: '#tabbar [data-tab="aiz"]', title: 'Meet Aiz', text: 'Your workout assistant. Ask how to do an exercise, or have Aiz build or adjust a plan for you. Free and works offline.' },
];

let active = null;

export function tourActive() { return !!active; }

export function startTour() {
  if (active) return;
  const main = document.getElementById('main');
  if (!main) return;
  // Always all 15 steps. A step whose button isn't on screen is shown centred instead of being dropped.
  const steps = STEPS.slice();

  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `<div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-tip" role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-d">
      <div class="tour-top"><span class="tour-count" data-count></span><button type="button" class="tour-skip" data-skip>Skip tutorial</button></div>
      <div class="tour-bar" aria-hidden="true"><i data-bar></i></div>
      <h2 id="tour-t" class="tour-title"></h2>
      <p id="tour-d" class="tour-text"></p>
      <div class="tour-actions"><button type="button" class="btn sm" data-back>Back</button><button type="button" class="btn primary sm" data-next>Next</button></div>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('touring');
  const hole = root.querySelector('.tour-hole');
  const tip = root.querySelector('.tour-tip');
  let i = 0;

  const place = () => {
    const s = steps[i];
    const el = s.sel ? document.querySelector(s.sel) : null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = Math.min(340, vw - 24);
    tip.style.width = tw + 'px';
    if (!el) {
      hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;outline:none`;
      tip.style.left = (vw - tw) / 2 + 'px';
      tip.style.top = Math.max(16, vh / 2 - tip.offsetHeight / 2) + 'px';
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 6;
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;opacity:1`;
    const th = tip.offsetHeight;
    const below = r.bottom + pad + 12;
    const above = r.top - pad - 12 - th;
    let top = below + th <= vh - 12 ? below : above >= 12 ? above : Math.max(12, vh - th - 12);
    let left = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), vw - tw - 12);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };

  const show = () => {
    const s = steps[i];
    const el = s.sel ? document.querySelector(s.sel) : null;
    if (el && !el.closest('#tabbar')) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 260) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    root.querySelector('[data-count]').textContent = `${i + 1} / ${steps.length}`;
    root.querySelector('[data-bar]').style.width = `${((i + 1) / steps.length) * 100}%`;
    root.querySelector('#tour-t').textContent = s.title;
    root.querySelector('#tour-d').textContent = s.text;
    root.querySelector('[data-back]').hidden = i === 0;
    const next = root.querySelector('[data-next]');
    next.textContent = i === steps.length - 1 ? 'Done' : 'Next';
    requestAnimationFrame(() => { place(); next.focus({ preventScroll: true }); });
  };

  const end = (completed) => {
    if (!active) return;
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('hashchange', onNav);
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    document.body.classList.remove('touring');
    active = null;
    state.settings.tourDone = true;
    save();
    if (completed) window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const onNav = () => end(false);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); end(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); root.querySelector('[data-next]').click(); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); root.querySelector('[data-back]').click(); }
    else if (e.key === 'Tab') { // keep focus inside the tip
      const f = [...tip.querySelectorAll('button:not([hidden])')];
      const k = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };

  root.querySelector('[data-next]').addEventListener('click', () => { if (i < steps.length - 1) { i++; show(); } else end(true); });
  root.querySelector('[data-back]').addEventListener('click', () => { if (i > 0) { i--; show(); } });
  root.querySelector('[data-skip]').addEventListener('click', () => end(false));
  // Taps outside the tip are blocked so nothing changes underneath the tour.
  root.addEventListener('click', (e) => { if (!tip.contains(e.target)) e.stopPropagation(); });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  window.addEventListener('hashchange', onNav);
  document.addEventListener('keydown', onKey, true);
  active = { end };
  show();
}

export function maybeStartTour() {
  if (state.onboarded && !state.settings.tourDone && !active && (location.hash === '' || location.hash === '#/' || location.hash === '#')) {
    setTimeout(() => { if ((location.hash === '' || location.hash === '#/' || location.hash === '#') && !document.querySelector('dialog[open]')) startTour(); }, 450);
  }
}
