# Bankai

Your personal workout hub. Plans, exercise videos and photos, a distraction-free workout mode with rest timers, and progress history. It installs on a phone like a normal app.

Everything a person adds stays **on their own device**, with no accounts and no server. If you share the link with friends, each person gets their own private, empty Bankai.

---

## 1. Put it online (GitHub Pages, free)

Bankai is a plain static website: no build step, no database, nothing to configure.

1. On github.com, create a new **public** repository named `bankai`.
2. Upload every file and folder from this project (`index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `js/`, `icons/`) to the repository root.
3. Go to **Settings › Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: main**, folder **/(root)**, then click **Save**.
4. After a minute or two, the site is live at `https://<your-username>.github.io/bankai/`.

That link is what you open on your phone and send to friends.

**Updating later:** change the files in the repo. Also bump `VERSION` at the top of `sw.js` (for example `bankai-v1.0.1`) so installed copies pick up the new version. Users then see an "Update" prompt.

## 2. Add it to your home screen

- **iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**, then **Add**.
- **Android (Chrome):** open the link, tap **⋮**, then **Install app** (or **Add to Home screen**).

> **iPhone tip:** install it first, then add your stuff *inside the installed app*. On iOS the home-screen app keeps its own storage, separate from Safari.

## 3. Using it

- **First launch:** tick a starter plan (Beginner Home Plan or PPL × U/L Split) or start empty.
- **Schedule a workout:** Plans → open a workout → ✏️ → tap the days it should run (Mo, Tu, …). It then shows as *Today's workout* on Home.
- **Add a video:** open an exercise → ✏️ → **Paste link** → paste a YouTube link → **Add video**. YouTube, Vimeo, TikTok (full video links) and Instagram posts play inside the app. Any other link becomes an **Open video** button.
- **Add photos or video files:** exercise → ✏️ → **Photos** or **Video file**, then pick from your camera roll. Captions, reorder (↑ ↓) and remove (🗑) are on each item.
- **Quick Add (Home):** the Workout / Exercise / Photo / Video buttons do the same without digging. Pick the file or link first, then choose the exercise it belongs to.
- **Edit a workout:** add exercises from the library, set sets, reps, time and rest, reorder, duplicate, or remove. Removing only takes it out of that workout; it stays in your library.
- **Tutorial:** a 15-step tour runs the first time you open Home (Next / Back / Skip). Replay it from **Settings → Help → Replay tutorial**.
- **Aiz (workout assistant):** the ✦ tab. Ask how to do an exercise, ask a training question, or say "make me a 4 day gym plan for muscle". Aiz can also adjust a workout ("make Push shorter", "add face pulls to Pull"). It never changes anything until you tap **Add to my plans** / **Apply change**, and there's an **Undo**.
- **Workout mode:** tap **Start workout**. Tap the numbered boxes as you finish sets; the rest timer starts on its own. **Log weight & reps** is optional. Pause (⏸) to finish, save or discard. History shows under **Progress**.

## 4. Backup & restore

Settings → **Backup & restore**

- **Back up everything** creates one `.json` file with your plans, history, photos and videos. On a phone, the share sheet opens so you can save it to Files, Google Drive or email.
- **Back up without photos & videos** makes a small file (links are kept).
- **Restore from a backup file** replaces what's on the device with the backup. Use this to move to a new phone.

Back up now and then. Clearing browser data, uninstalling, or losing the phone erases what's stored on it.

## 5. Run it on your computer (optional)

From this folder: `python3 -m http.server 8000`, then open http://localhost:8000.

## About Aiz

Aiz runs entirely on the phone. It's free, private (chats never leave the device) and works offline. It uses Bankai's built-in fitness knowledge (`js/aiz-kb.js`) and a rule-based engine (`js/aiz-brain.js`), not a paid AI service.

Safety rules always run first:
- **Crisis messages** get 988 and emergency info.
- **Disordered-eating signs** get support resources, and Aiz stops giving food or weight advice.
- **Emergency symptoms** (chest pain, fainting…) get "stop and call 911".
- **Pain or injury:** Aiz won't diagnose; it says to see a doctor or physical therapist.
- **Steroids and other drugs:** refused.
- **Crash dieting:** redirected to safe habits.
- **Health conditions:** check with your doctor first.
- **Off-topic requests:** politely declined.

Its plan suggestions are re-checked before they're applied.

## Limitations

- **Aiz isn't a full AI chatbot.** It understands common workout questions and requests well. Unusual phrasing may get an "I'm not sure" reply with suggestions.

- **No sync between devices.** Data lives on one device; move it with backup/restore.
- **iPhone storage:** Safari can clear site data that hasn't been opened for several weeks. Installing to the home screen and the **Protect from auto-cleanup** option in Settings reduce this. Keep backups anyway.
- **Video files** are limited to 300 MB each and take real storage space. For long videos, uploading to YouTube and pasting the link is lighter.
- **Very large backups** (several GB of video) may be too big for a phone to restore in one go.
- **Embedded videos need internet.** The app itself, your plans and your uploaded files work offline.
- **TikTok short links** (`vm.tiktok.com/…`) and photo posts can't play inside the app; they open in TikTok instead.
- **Timers while the phone is locked:** the countdown stays accurate, but the beep and vibration only play while Bankai is on screen. The screen is kept awake during a workout where the browser allows it.
- **Fonts** load from Google Fonts on first launch, then are cached for offline use.

## Files

| File | What it does |
|---|---|
| `index.html` | App shell |
| `styles.css` | All styling (true-black theme, Bankai violet) |
| `js/app.js` | Screens: home, plans, library, exercise, editor, progress, settings |
| `js/workout.js` | Workout mode, timers, summary |
| `js/store.js` | Data model, saving, validation |
| `js/db.js` | On-device storage (IndexedDB) |
| `js/media.js`, `js/mediaview.js` | Links, embeds, photo/video files |
| `js/backup.js` | Backup, restore, erase |
| `js/templates.js` | The two starter plans |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Install as an app |
