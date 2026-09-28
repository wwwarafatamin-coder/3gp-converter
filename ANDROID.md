# Building the Android app (APK)

The Android app is a thin native shell around your published website. The video conversion still happens inside the phone's web engine, but saving files uses native Android storage through Capacitor plugins.

## Option A: Build without Android Studio (easiest — uses GitHub)

You don't need Android Studio or even Node.js on your computer. A free GitHub account builds the APK for you in the cloud. The project already includes the build recipe at `.github/workflows/build-apk.yml`.

### Step 1: Get the source code onto GitHub

1. Create a free account at https://github.com if you don't have one.
2. Unzip `3gp-converter-source.zip` on your computer or phone.
3. Go to https://github.com/new and create a new repository (any name, e.g. `3gp-converter`). Keep it **Public** (private also works, Actions are free either way).
4. On the new repository page, click **"uploading an existing file"** and drag in **everything** from the unzipped folder (all files and folders, including `.github` — it may be hidden, so enable "show hidden files" when selecting).
5. Click **Commit changes** and wait for the upload to finish.

### Step 2: Run the build

1. In your repository, open the **Actions** tab. If it asks, click **"I understand my workflows, go ahead and enable them"**.
2. Click **Build Android APK** in the left list, then the green **Run workflow** button, then **Run workflow** again.
3. Wait about 10–20 minutes. The yellow dot turns into a green check.

### Step 3: Download and install the APK

1. Open the finished run in the Actions tab and scroll to the **Artifacts** section.
2. Download **3gp-converter-apk** — it contains `app-debug.apk`.
3. Move the APK to your phone (or download it directly on the phone) and tap it to install. Allow "install from unknown sources" if asked.

### If the build fails

- Open the failed run in the Actions tab and read the red error step.
- The most common failure is Gradle not being able to download the video engine. Fix it in the code: open `plugins/native-ffmpeg/android/build.gradle`, comment out the `com.arthenica:ffmpeg-kit-full:6.0-2` line and uncomment the JitPack line just below it, commit the change, and run the workflow again.
- Every time you push a change, the workflow rebuilds the APK automatically.

## Option B: Build on your own computer (needs Android Studio)

### What you need before you start

1. A computer with **Android Studio** installed.
   - Download from: https://developer.android.com/studio
2. **Node.js** installed on the same computer.
   - Download from: https://nodejs.org (LTS version is recommended)
3. The project folder downloaded or cloned to your computer.
4. The website must be **published** in Lovable first, because the app loads `https://gp-magic-maker.lovable.app`.

---

## Step 1: Publish the website

1. In Lovable, click the **Publish** button (top right on desktop).
2. Wait until the publish finishes and the live URL is ready.
3. Confirm the site opens at:
   ```
   https://gp-magic-maker.lovable.app
   ```
   The Android app reads this URL from `capacitor.config.ts`, so the site must be live before the app can work.

---

## Step 2: Install project dependencies

Open a terminal in the project folder (the same folder that contains `package.json` and `capacitor.config.ts`) and run:

```bash
npm install
```

This downloads all the JavaScript packages, including Capacitor and its Android/filesystem/share plugins.

Wait until the command finishes. You should see a `node_modules` folder appear inside the project.

Now install the fast conversion plugin that lives inside this project:

```bash
npm install ./plugins/native-ffmpeg
```

This is the piece that makes the app convert with the phone's own video engine
instead of the slower in-browser one. Without it the app still works, it just
falls back to the browser engine.

---

## Step 3: Add the Android platform

In the same terminal, run:

```bash
npx cap add android
```

What this does:
- Creates an `android/` folder in your project.
- Generates a ready-to-build Android Studio project.
- Uses the settings from `capacitor.config.ts` (app ID `com.gp3gp.converter`, app name `3GP Converter`).

You only need to run this once. If you already ran it before, skip this step.

---

## Step 4: Sync Capacitor with the Android project

Run:

```bash
npx cap sync android
```

What this does:
- Copies your web files into the Android project.
- Installs the native Android plugins (`@capacitor/filesystem`, `@capacitor/share`, etc.).
- Updates Gradle dependencies.

Run this command again whenever:
- You install or remove Capacitor plugins.
- You change `capacitor.config.ts`.
- You add new native plugin permissions.

---

## Step 5: Open the project in Android Studio

Run:

```bash
npx cap open android
```

This opens Android Studio with the generated Android project. The first time, Android Studio may download Gradle and other tools — this can take several minutes depending on your internet speed.

If Android Studio asks you to **Upgrade Gradle** or **Sync project**, accept it and let it finish.

---

## Step 6: Build the APK

Once Android Studio finishes loading:

1. At the top of Android Studio, make sure a device or emulator is selected, or select **"No device / Build only"**.
2. Click the menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Wait for the build to finish. You will see a message at the bottom:
   ```
   Build Analyzer detected... / Build completed successfully
   ```
4. Android Studio will show a popup with the APK location. Click **locate** or find it here:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

This `app-debug.apk` is your installable Android app.

---

## Step 7: Install the APK on your phone

### Option A: Direct copy

1. Connect your phone to the computer with a USB cable.
2. Copy `app-debug.apk` to your phone's Downloads folder.
3. On your phone, open the file manager, tap the APK, and install it.
4. If you see a warning about "unknown sources", allow installation from your file manager.

### Option B: Use Android Studio

1. Enable **Developer options** and **USB debugging** on your phone.
2. Connect the phone to the computer.
3. In Android Studio, select your phone from the device dropdown.
4. Click the green **Run** button (▶). Android Studio will install and launch the app.

---

## Step 8: Run the app

When you open the app:

1. It loads your published website from `https://gp-magic-maker.lovable.app`.
2. Pick a video and convert it.
3. Tap **"Save as 3gp"**.
4. The app will:
   - Save the file into your phone's **Documents** folder.
   - Open the Android share sheet so you can send it to another app or move it.

---

## After you change the website

You do **not** need to rebuild the APK every time you edit the website.

1. Publish the updated site in Lovable.
2. Close and reopen the Android app.
3. The app will load the new published version automatically.

Only re-run:

```bash
npx cap sync android
```

when:
- You change `capacitor.config.ts`.
- You add, remove, or update Capacitor plugins.
- You change native Android permissions or settings.

---

## Important notes

- The app needs an internet connection on launch because it loads the published website.
- Conversion happens on the phone itself — the video is not uploaded anywhere.
- In the app, picking a video opens Android's own picker and conversion runs on the
  phone's built-in video engine, which is much faster than the browser version.
  You'll see "fast phone engine active" under the Convert button when this is on.
- In the app, "Save as 3gp" puts the file in **Movies/3GP Converter**, so it shows
  up in your gallery and file manager. In a browser it downloads as before.
- The first launch may take a moment while the website loads.

---

## Troubleshooting

### Android Studio says "Gradle sync failed"

1. Make sure you ran `npx cap sync android` after `npm install`.
2. In Android Studio, click **File → Sync Project with Gradle Files**.
3. If it still fails, delete the `android/` folder and repeat Steps 3–5.

### App shows a white screen

1. Check that the website is published and reachable in a normal browser.
2. Make sure the URL in `capacitor.config.ts` matches your published URL.
3. Check that your phone has internet.

### "Save as 3gp" does nothing

1. Make sure you ran `npx cap sync android` after the native save code was added.
2. Check that the app has storage permission (Android may ask when saving).
3. Rebuild the APK after any native-code change.

### Build fails with plugin errors

Run:

```bash
npx cap sync android
npx cap open android
```

Then try building again.

### "fast phone engine active" never appears

1. Make sure you ran `npm install ./plugins/native-ffmpeg`, then
   `npx cap sync android`, then rebuilt the APK.
2. In Android Studio check **Build → Make Project** for errors.

### Gradle can't download the video engine

Open `plugins/native-ffmpeg/android/build.gradle`, comment out the
`com.arthenica:ffmpeg-kit-full:6.0-2` line and uncomment the JitPack line just
below it, then sync Gradle again. The app keeps working either way — without the
engine it simply falls back to the slower browser conversion.
