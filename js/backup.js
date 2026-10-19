// Backup / restore to a single .json file, and full erase.
import { state, sanitizeState, replaceState, save, flush, gcBlobs } from './store.js';
import { blobGet, blobPut, blobKeys, blobClear, idbAvailable } from './db.js';
import { resetBlobUrls, fmtBytes } from './media.js';
import { confirmDialog } from './ui.js';

const FORMAT = 'bankai-backup';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error || new Error('Could not read a stored file'));
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Builds the backup file and hands it to the user. Returns a status message. */
export async function exportBackup(withMedia) {
  await flush();
  await gcBlobs();
  const snapshot = JSON.parse(JSON.stringify(state));
  // Built in parts so large videos never have to sit in one giant string.
  const parts = [`{"format":"${FORMAT}","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"withMedia":${!!withMedia},"state":`, JSON.stringify(snapshot), ',"blobs":{'];
  let count = 0;
  if (withMedia && idbAvailable) {
    const keys = await blobKeys();
    for (const k of keys) {
      const rec = await blobGet(k);
      if (!rec?.blob) continue;
      const b64 = await blobToBase64(rec.blob);
      parts.push(`${count ? ',' : ''}${JSON.stringify(k)}:${JSON.stringify({ type: rec.type || rec.blob.type, name: rec.name || '', data: b64 })}`);
      count++;
    }
  }
  parts.push('}}');
  const file = new File(parts, `bankai-backup-${stamp()}${withMedia ? '' : '-no-media'}.json`, { type: 'application/json' });
  const size = fmtBytes(file.size);

  // Phones: the share sheet lets you save straight to Files, Drive, email…
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Bankai backup' });
      return `Backup ready (${size}) — save it somewhere safe`;
    } catch (e) {
      if (e && e.name === 'AbortError') return 'Backup cancelled';
      // fall through to a normal download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return `Backup downloaded (${size}${withMedia ? `, ${count} file${count === 1 ? '' : 's'}` : ''})`;
}

/** Reads a backup file, confirms, and replaces local data. Returns a message, or '' if cancelled. */
export async function importBackupFile(file) {
  if (!file) return '';
  if (file.size > 2 * 1024 * 1024 * 1024) throw new Error('That file is too large to restore on this device.');
  let raw;
  try { raw = JSON.parse(await file.text()); }
  catch { throw new Error('That isn’t a Bankai backup file (it couldn’t be read).'); }
  if (!raw || raw.format !== FORMAT || !raw.state) throw new Error('That isn’t a Bankai backup file.');

  const next = sanitizeState(raw.state);
  const blobs = raw.blobs && typeof raw.blobs === 'object' ? raw.blobs : {};
  const nPlans = next.plans.length, nEx = Object.keys(next.exercises).length, nSes = next.sessions.filter((s) => s.endedAt).length;
  const nFiles = Object.keys(blobs).length;
  const when = raw.exportedAt ? new Date(raw.exportedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown date';
  const ok = await confirmDialog({
    title: 'Restore this backup?',
    body: `From ${when}: ${nPlans} workouts, ${nEx} exercises, ${nSes} logged sessions${raw.withMedia ? `, ${nFiles} photos/videos` : ' (no photos/videos in this file)'}. This replaces everything currently in Bankai on this device.`,
    ok: 'Replace & restore', danger: true,
  });
  if (!ok) return '';

  let restoredFiles = 0;
  if (idbAvailable) {
    if (raw.withMedia) {
      await blobClear();
      for (const [k, v] of Object.entries(blobs)) {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(k) || !v || typeof v.data !== 'string') continue;
        const type = typeof v.type === 'string' && /^(image|video)\/[\w.+-]+$/.test(v.type) ? v.type : '';
        if (!type) continue;
        try {
          const blob = base64ToBlob(v.data, type);
          await blobPut(k, { blob, type, name: String(v.name || '').slice(0, 200), size: blob.size, at: Date.now() });
          restoredFiles++;
        } catch (e) { console.warn('skip file', k, e); }
      }
    }
  }
  next.onboarded = true;
  resetBlobUrls();
  replaceState(next);
  await save(true);
  if (raw.withMedia) await gcBlobs();
  return `Restored ${nPlans} workouts and ${nEx} exercises${raw.withMedia ? ` with ${restoredFiles} files` : ''}`;
}

export async function eraseAll() {
  await blobClear();
  resetBlobUrls();
  replaceState(sanitizeState(null));
  await save(true);
  try { localStorage.removeItem('bankai-theme'); localStorage.removeItem('bankai-accent'); } catch { /* ignore */ }
}
