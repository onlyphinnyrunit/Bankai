// Rendering of exercise media (photos, videos, links) shared by all views.
import { h, icon } from './ui.js';
import { parseLink, blobUrl } from './media.js';

export function linkInfo(m) {
  return m.type === 'link' ? parseLink(m.url) : null;
}

/** Small square preview used in lists and thumbnail strips. */
export function mediaThumb(m) {
  if (!m) return icon('dumbbell');
  if (m.type === 'image') return `<img data-blob="${h(m.blobId)}" alt="">`;
  if (m.type === 'video') return `<video data-blob="${h(m.blobId)}" data-thumb muted playsinline preload="metadata"></video><span class="badge">${icon('play')}</span>`;
  const info = linkInfo(m);
  if (info?.thumb) return `<img src="${h(info.thumb)}" alt="" data-fallback="link" referrerpolicy="no-referrer"><span class="badge">${icon('play')}</span>`;
  if (info?.kind === 'directimage') return `<img src="${h(info.url)}" alt="" data-fallback="link" referrerpolicy="no-referrer">`;
  return info?.kind === 'link' ? icon('link') : icon('video');
}

function openLink(url, label = 'Open original') {
  return `<a class="btn sm" href="${h(url)}" target="_blank" rel="noopener noreferrer">${icon('external')}${h(label)}</a>`;
}

/** Large viewer for a single media item. */
export function mediaMain(m) {
  if (!m) return '';
  const cap = m.caption ? `<div class="media-cap pre">${h(m.caption)}</div>` : '';
  if (m.type === 'image') {
    return `<figure class="media-main" style="margin:0"><img class="photo" data-blob="${h(m.blobId)}" alt="${h(m.caption || 'Exercise photo')}">${cap}</figure>`;
  }
  if (m.type === 'video') {
    return `<figure class="media-main" style="margin:0"><div class="ratio"><video data-blob="${h(m.blobId)}" controls playsinline preload="metadata"></video></div>${cap}</figure>`;
  }
  const info = linkInfo(m);
  if (!info || !info.ok) return `<div class="media-main"><div class="missing">${icon('alert')}<span>This link can’t be read.</span></div>${cap}</div>`;
  const foot = `<div class="media-cap row between"><span class="grow pre">${h(m.caption || '')}</span>${openLink(info.url, info.provider === 'link' ? 'Open video' : 'Open')}</div>`;
  if (info.embed) {
    const poster = info.thumb ? `<img src="${h(info.thumb)}" alt="" referrerpolicy="no-referrer" data-fallback="hide">` : '';
    return `<div class="media-main"><div class="ratio${info.vertical ? ' tall' : ''}"><span class="provider">${h(info.label)}</span>
      <button type="button" class="poster-btn" data-act="embed" data-embed="${h(info.embed + (info.autoplayParam || ''))}" aria-label="Play ${h(info.label)} video">${poster}<span class="play">${icon('play')}</span></button></div>${foot}</div>`;
  }
  if (info.kind === 'directvideo') {
    return `<div class="media-main"><div class="ratio"><video src="${h(info.url)}" controls playsinline preload="metadata" data-fallback="link"></video></div>${foot}</div>`;
  }
  if (info.kind === 'directimage') {
    return `<div class="media-main"><img class="photo" src="${h(info.url)}" alt="${h(m.caption || 'Exercise image')}" referrerpolicy="no-referrer" data-fallback="link">${foot}</div>`;
  }
  return `<div class="media-main"><div class="link-card"><span class="eyebrow">${h(info.label)} link</span><span class="host">${h(info.url.length > 70 ? info.url.slice(0, 70) + '…' : info.url)}</span>
    <span class="muted small">${h(info.hint || 'This site doesn’t allow its videos to play inside other apps. It opens in a new tab.')}</span>${openLink(info.url, 'Open video')}</div>${m.caption ? cap : ''}</div>`;
}

/** Replace a play poster with the real embed (only loads third-party players on tap). */
export function activateEmbed(btn) {
  const src = btn.dataset.embed;
  try { const u = new URL(src); if (!['www.youtube-nocookie.com', 'player.vimeo.com', 'www.tiktok.com', 'www.instagram.com'].includes(u.hostname)) return; } catch { return; }
  const f = document.createElement('iframe');
  f.src = src;
  f.title = 'Exercise video';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  btn.replaceWith(f);
}

const MISSING = `<div class="missing">${icon('alert')}<span>File missing on this device.<br>Re-add it in Edit, or restore a full backup.</span></div>`;

/** Fills in object URLs for stored files inside root. */
export async function hydrateMedia(root) {
  const els = root.querySelectorAll('[data-blob]:not([data-hydrated])');
  await Promise.all([...els].map(async (el) => {
    el.dataset.hydrated = '1';
    const url = await blobUrl(el.dataset.blob);
    if (!url) {
      if (el.closest('.thumb, .thumbs button')) { el.replaceWith(Object.assign(document.createElement('span'), { innerHTML: icon('alert') })); return; }
      const holder = el.closest('.ratio') || el;
      holder.outerHTML = MISSING;
      return;
    }
    el.src = el.hasAttribute('data-thumb') ? url + '#t=0.1' : url;
  }));
}

// Broken remote images / videos: degrade gracefully instead of showing a broken icon.
document.addEventListener('error', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement) || !el.dataset || !el.dataset.fallback) return;
  if (el.dataset.fallback === 'hide') { el.remove(); return; }
  const thumbHost = el.closest('.thumb, .thumbs button');
  if (thumbHost) { el.replaceWith(Object.assign(document.createElement('span'), { innerHTML: icon('link') })); return; }
  const holder = el.closest('.ratio') || el;
  const div = document.createElement('div');
  div.className = 'missing';
  div.innerHTML = `${icon('alert')}<span>Couldn’t load this here. Use “Open” to view it.</span>`;
  holder.replaceWith(div);
}, true);
