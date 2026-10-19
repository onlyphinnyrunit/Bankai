// Media helpers: link parsing / embedding, file storage, object URLs.
import { blobGet, blobPut, idbAvailable } from './db.js';
import { uid } from './store.js';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function ytStart(u) {
  const t = u.searchParams.get('t') || u.searchParams.get('start');
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
}

/**
 * Turns a pasted URL into something we can show.
 * Returns { ok, url, provider, label, embed, thumb, vertical, kind } or { ok:false, error }.
 * Only providers known to allow embedding get an iframe; everything else
 * becomes a link card with an "Open video" button.
 */
export function parseLink(input) {
  let raw = (input || '').trim();
  if (!raw) return { ok: false, error: 'Paste a link first.' };
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let u;
  try { u = new URL(raw); } catch { return { ok: false, error: "That doesn't look like a link." }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Only web links (https://) are supported.' };
  const host = u.hostname.replace(/^(www|m|music)\./, '').toLowerCase();
  const base = { ok: true, url: u.href, host };

  // YouTube
  if (['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) {
    let id = null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') id = parts[0];
    else if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
    if (id && YT_ID.test(id)) {
      const start = ytStart(u);
      const shorts = parts[0] === 'shorts';
      return {
        ...base, provider: 'youtube', label: 'YouTube', kind: 'video', vertical: shorts,
        embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&modestbranding=1${start ? '&start=' + start : ''}`,
        autoplayParam: '&autoplay=1',
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }
    return { ...base, provider: 'link', label: 'YouTube', kind: 'link' };
  }
  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:\/video)?\/(\d{5,12})(?:\/|$)/);
    if (m) return { ...base, provider: 'vimeo', label: 'Vimeo', kind: 'video', embed: `https://player.vimeo.com/video/${m[1]}?dnt=1&playsinline=1`, autoplayParam: '&autoplay=1' };
    return { ...base, provider: 'link', label: 'Vimeo', kind: 'link' };
  }
  // TikTok: full /video/<id> links embed; short vm./vt. links can't be resolved in the browser.
  if (host.endsWith('tiktok.com')) {
    const m = u.pathname.match(/\/(?:video|photo)\/(\d{8,25})/);
    if (m && u.pathname.includes('/video/')) return { ...base, provider: 'tiktok', label: 'TikTok', kind: 'video', vertical: true, embed: `https://www.tiktok.com/player/v1/${m[1]}?music_info=0&description=0&rel=0`, autoplayParam: '&autoplay=1' };
    return { ...base, provider: 'link', label: 'TikTok', kind: 'link', hint: 'Short TikTok links and photo posts can’t be played inside Bankai. Open it in TikTok, tap Share › Copy link from a browser, or use the “Open” button.' };
  }
  // Instagram posts / reels
  if (host === 'instagram.com') {
    const m = u.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/);
    if (m) {
      const kind = m[1] === 'reels' ? 'reel' : m[1];
      return { ...base, provider: 'instagram', label: 'Instagram', kind: 'video', vertical: true, embed: `https://www.instagram.com/${kind}/${m[2]}/embed/` };
    }
    return { ...base, provider: 'link', label: 'Instagram', kind: 'link' };
  }
  // Direct video / image files
  if (/\.(mp4|webm|m4v|mov)$/i.test(u.pathname)) return { ...base, provider: 'file', label: 'Video', kind: 'directvideo' };
  if (/\.(jpe?g|png|gif|webp|avif)$/i.test(u.pathname)) return { ...base, provider: 'image', label: 'Image', kind: 'directimage' };
  return { ...base, provider: 'link', label: host, kind: 'link' };
}

// ---------- files ----------
export const MAX_VIDEO_MB = 300;

async function compressImage(file) {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (!('createImageBitmap' in window)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const max = 1800;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900 * 1024) { bmp.close?.(); return file; }
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. HEIC in browsers that can't decode it: keep original
  }
}

/** Stores an uploaded file and returns a media record. */
export async function storeFile(file) {
  if (!idbAvailable) throw new Error('This browser is blocking file storage (private mode?).');
  const isImage = file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) throw new Error(`${file.name}: only photos and videos can be added.`);
  if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_VIDEO_MB} MB. Trim it, or upload it to YouTube and paste the link.`);
  const data = isImage ? await compressImage(file) : file;
  const blobId = uid();
  await blobPut(blobId, { blob: data, type: data.type || file.type, name: file.name, size: data.size, at: Date.now() });
  return { id: uid(), type: isImage ? 'image' : 'video', blobId, name: file.name.slice(0, 200), size: data.size, mime: data.type || file.type, caption: '' };
}

const urlCache = new Map();
/** Resolves a stored blob to an object URL (cached). Returns null if missing. */
export async function blobUrl(blobId) {
  if (urlCache.has(blobId)) return urlCache.get(blobId);
  const rec = await blobGet(blobId).catch(() => null);
  if (!rec || !rec.blob) { urlCache.set(blobId, null); return null; }
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(blobId, url);
  return url;
}
export function forgetBlobUrl(blobId) {
  const u = urlCache.get(blobId);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(blobId);
}
export function resetBlobUrls() { for (const id of [...urlCache.keys()]) forgetBlobUrl(id); }

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
