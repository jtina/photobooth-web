# MiKi Booth

A photo booth web app made for the iPad. Add it to the iPad home screen and it
opens full screen like a native app. It is plain HTML/JS with no build tools.

**Flow:** Start → Photo Strip or Multi-Frame → frame color or theme (and
front/rear camera) → 8 photos, each with a countdown from 10 (about 7 seconds, adjustable in Settings) → pick your photos →
stickers and filters (when no theme is used) → print options → the photo strip
and a 4× sped-up countdown video are uploaded to Supabase and shown as QR codes.
On that last screen, press and hold the photo strip (**Save to Photos**) or the
video (**Save Video** in the share sheet) to save them straight onto the iPad.

## Deploying to GitHub Pages

1. In this repo go to **Settings → Pages** and set **Source** to
   **GitHub Actions** (one-time setup).
2. Push to `main`. The **Deploy to GitHub Pages** workflow publishes the app
   (you can also run it by hand from the **Actions** tab).
3. The app is then at `https://<your-username>.github.io/photobooth-web/`.

## Adding to the iPad home screen

1. Open the Pages link in **Safari** on the iPad.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open it from the home screen and allow camera access when asked.

Tip: for a kiosk, use **Settings → Accessibility → Guided Access** to lock the
iPad to the app.

## Setting up Supabase (uploads + QR codes)

The booth works without this, but there are no QR codes until it is set up.

1. **Create a project** at https://supabase.com (the free plan is fine).
2. **Turn on anonymous sign-ins** (the booth signs in without an account):
   **Authentication → Sign In / Providers → Allow anonymous sign-ins** → on → Save.
3. **Create the storage bucket:** **Storage → New bucket**
   - Name: `photobooth`
   - **Public bucket:** on (so the QR links open without signing in)
   - Optional: restrict file types to `image/jpeg, video/mp4, video/webm`
     and set a size limit of 50 MB.
4. **Allow the booth to upload:** open **SQL Editor**, paste this and click **Run**:

   ```sql
   create policy "Booth can upload"
   on storage.objects for insert
   to authenticated
   with check (bucket_id = 'photobooth');
   ```

   (Anonymous sign-ins count as `authenticated`. Nobody can change or delete
   files, and only people with a QR link can view one.)
5. **Copy your keys:** **Project Settings → API Keys** (and **Data API** for the
   URL). You need the **Project URL** and the **publishable key**
   (`sb_publishable_...`). Never use the secret / `service_role` key here.
6. **Paste them into `js/config.js`:**

   ```js
   export const SUPABASE = {
     url: 'https://abcdefghijklmnop.supabase.co',
     publishableKey: 'sb_publishable_...',
     bucket: 'photobooth',
   };
   ```

7. Commit and push. Take a test session; both QR codes should appear on the
   last screen, and the files show up under **Storage → photobooth**, one folder
   per session.

Notes:
- The publishable key is meant to be public, so it is fine in this public repo.
  What protects your project is the policy in step 4.
- Free Supabase projects pause after about a week without activity. Open the
  dashboard and click **Restore** before an event if it has been idle.
- The free plan includes 1 GB of storage. Delete old session folders from
  **Storage** when it fills up.
- If uploads fail, the message under the video on the last screen says why
  (for example, a missing policy or anonymous sign-ins being off).

## Settings

Tap the cog in the top-right corner of the start screen and enter the PIN
(**2468**, set in `js/settings.js`). Settings are saved on that device:

- **Restart countdown:** on/off for the automatic 30-second restart at the end.
  When off, the end screen shows a plain **Restart** button.
- **Print page:** on/off for the print options page and the “Printing....”
  message. When off, the booth goes straight from the photos to the QR codes.
- **Photo countdown:** how long the 10 → 1 countdown before each photo takes
  (3–15 seconds; default 7).
- **Start screen photo:** choose or paste your own start screen, or go back to
  the default. Tapping anywhere on the start screen begins a session.

Settings, themes and stickers are saved on the device and stay after closing
the app, restarting the iPad, or deploying an update. Each place the app is
opened keeps its own copy, though: on the iPad, **Safari and the home-screen
app do not share saved data**, so set things up inside the home-screen app.
Likewise your PC's browser and `localhost` keep separate copies.

To make your preferred settings the starting point everywhere (e.g. on a new
iPad), change `DEFAULT_SETTINGS` in `js/config.js` and push.

## Stickers and themes

These are added on the device and saved there (they are not uploaded):

- **Stickers:** on the sticker screen tap **Add Stickers** to pick images from
  Photos, or copy an image and tap **Paste**. Tap **×** to remove one.
  Transparent PNGs work best.
- **Themes (frame artwork):** for a Photo Strip or any Multi-Frame layout, on the
  frame screen open **Theme** and tap
  **Add Theme** (or copy the artwork and tap **Paste Theme**). Then set the
  **Number of photos**, drag each numbered box to move it, drag its corners to
  resize it (arrow pad and zoom for fine adjustments), choose whether photos go
  **Behind frame** (PNG with see-through windows, found automatically) or
  **On top of frame**, and tap **Save Theme**. Tap **Edit** under a theme to
  adjust it later.
- On a keyboard, **Ctrl+V / ⌘V** also pastes a sticker or a new theme.
- To give every device the same stickers, put files in `assets/stickers/` and
  push; the deploy lists them automatically.

Keep your original sticker and theme images in Photos: Safari can clear a
site's saved data if it goes unused for a long time (much less likely for apps
opened from the home screen).

## Running locally

Browsers block the camera on pages opened by double-clicking, so use a small
local web server.

**Windows (PowerShell):** install Python from https://www.python.org/downloads/
(tick **Add python.exe to PATH**), then:

```powershell
cd C:\path\to\photobooth-web
py -m http.server 8000
```

**Mac / Linux:**

```sh
cd photobooth-web
python3 -m http.server 8000
```

Open http://localhost:8000 and allow camera access (`Ctrl+C` stops the server).
With Node.js instead of Python: `npx serve -l 8000`.

The camera only works on `localhost` or HTTPS, so to test on the iPad use the
GitHub Pages link rather than your PC's network address.

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css` | App shell and styles (iPad-landscape layout scaled to fit any screen) |
| `js/app.js` | Screens and navigation |
| `js/config.js` | Supabase settings, multi-frame layouts, colors |
| `js/media.js` | Camera, per-photo countdown clips, final 4× video |
| `js/render.js` | Filters and the final photo strip renderer |
| `js/settings.js` | Settings behind the PIN (saved on the device) |
| `js/upload.js` | Supabase anonymous sign-in and uploads |
| `js/theme-store.js` | Themes: artwork, photo windows, auto-detection |
| `js/sticker-store.js` | Stickers added on the device |
| `js/clipboard.js` | Pasting images |
| `js/db.js` | On-device storage (IndexedDB) |
| `sw.js`, `manifest.webmanifest` | Offline cache and home-screen install |
| `build.sh` | Used by the deploy: builds the sticker list and the site |
| `vendor/` | [supabase-js](https://github.com/supabase/supabase-js) 2.117.3 and [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4 (both MIT) |
