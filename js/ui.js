// Small UI toolkit: escaping, icons, toasts, sheets, confirm dialogs.

export function h(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chev: '<path d="M9 18l6-6-6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  play: '<polygon points="7 4 20 12 7 20"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="3"/><path d="M16 10l6-3v10l-6-3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
};

export function icon(name, cls = '') {
  const fill = name === 'play' ? ' class="fill ' + cls + '" fill="currentColor" stroke="none"' : (cls ? ` class="${cls}"` : '');
  return `<svg aria-hidden="true" viewBox="0 0 24 24"${fill}>${P[name] || ''}</svg>`;
}

// ---------- toasts ----------
export function toast(msg, opts = {}) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  if (opts.action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opts.action;
    b.onclick = () => { el.remove(); opts.onAction?.(); };
    el.appendChild(b);
  }
  box.appendChild(el);
  while (box.children.length > 2) box.firstElementChild.remove(); // never stack more than two
  setTimeout(() => el.remove(), opts.ms || 3200);
}

// ---------- sheets ----------
/**
 * Opens a bottom sheet. `render(body, close)` fills it.
 * Returns a promise resolved with the value passed to close().
 */
export function sheet({ title, render, center = false, onClose }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'sheet' + (center ? ' center' : '');
    d.setAttribute('aria-label', title || 'Dialog');
    d.innerHTML = `<div class="sheet-head"><h2>${h(title || '')}</h2><button type="button" class="icon-btn plain" data-close aria-label="Close">${icon('x')}</button></div><div class="sheet-body"></div>`;
    document.body.appendChild(d);
    let result;
    const close = (v) => { result = v; if (d.open) d.close(); };
    d.addEventListener('close', () => { onClose?.(result); d.remove(); resolve(result); });
    d.addEventListener('click', (e) => {
      if (e.target === d) close(); // backdrop tap
      if (e.target.closest('[data-close]')) close();
    });
    render(d.querySelector('.sheet-body'), close, d);
    d.showModal();
    const first = d.querySelector('[autofocus]');
    if (first) first.focus(); else d.querySelector('.sheet-body')?.focus?.();
  });
}

export function confirmDialog({ title, body = '', ok = 'OK', cancel = 'Cancel', danger = false }) {
  return sheet({
    title, center: true,
    render(b, close) {
      b.innerHTML = `${body ? `<p class="muted">${h(body)}</p>` : ''}<div class="sheet-actions"><button type="button" class="btn" data-v="0">${h(cancel)}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-v="1">${h(ok)}</button></div>`;
      b.querySelectorAll('[data-v]').forEach((x) => x.addEventListener('click', () => close(x.dataset.v === '1')));
    },
  }).then((v) => !!v);
}

export function promptDialog({ title, label = '', value = '', ok = 'Save', placeholder = '' }) {
  return sheet({
    title, center: true,
    render(b, close) {
      b.innerHTML = `<label class="field"><span>${h(label)}</span><input class="input" autofocus value="${h(value)}" placeholder="${h(placeholder)}" maxlength="80"></label><div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-ok>${h(ok)}</button></div>`;
      const inp = b.querySelector('input');
      const done = () => close(inp.value.trim());
      b.querySelector('[data-ok]').addEventListener('click', done);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    },
  });
}

// ---------- formatting ----------
export function fmtDur(sec) {
  if (sec == null || sec === '') return '';
  sec = Math.round(Number(sec));
  if (sec < 60) return `${sec} sec`;
  if (sec % 60 === 0) return `${sec / 60} min`;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
export function fmtTarget(t, { withRest = false } = {}) {
  const parts = [];
  if (t.sets && t.reps) parts.push(`${t.sets} × ${t.reps}`);
  else if (t.sets && t.dur) parts.push(`${t.sets} × ${fmtDur(t.dur)}`);
  else if (t.sets) parts.push(`${t.sets} ${t.sets === 1 ? 'set' : 'sets'}`);
  else if (t.reps) parts.push(`${t.reps} reps`);
  if (t.dur && !t.sets) parts.push(fmtDur(t.dur));
  if (withRest && t.rest) parts.push(`rest ${fmtDur(t.rest)}`);
  return parts.join(' · ');
}
export function fmtElapsed(ms) {
  if (ms < 60000) return `${Math.max(0, Math.round(ms / 1000))} sec`;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export function fmtDays(days) {
  if (!days?.length) return '';
  if (days.length === 7) return 'Every day';
  return DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(' · ');
}
