# 📱 Building the MusicMood Android app

The Android app is the same React app wrapped by **Capacitor 8**. `android/` is a thin Android
shell; `src/` is shared with the website. A build compiles the web app, copies it into
`android/`, and lets Gradle package it as an `.apk`.

* App id: `uk.co.musicmood` (final; never change it after the first Play upload)
* Version: read from `package.json` (e.g. `0.8.8j` → versionName `0.8.8j`, versionCode `80810`; it only ever goes up)
* Output: `android/app/build/outputs/apk/debug/MusicMood-<version>-debug.apk` (signed builds: see *Signed builds*)

---

## Quick start (Linux / Claude cloud session)

```bash
npm ci                    # once per checkout
npm run android:setup     # once per machine: Android SDK, licences, local.properties, .env.android
npm run android:apk       # every build
```

`android:setup` installs the SDK into `$HOME/android-sdk` (override with `ANDROID_HOME=...`).
It needs **Java 21** and about **650 MB** of disk.

**Claude cloud sessions:** start the session on the **"musicmood"** environment. Its network
allows the hosts the build downloads from: `dl.google.com`, `maven.google.com`,
`services.gradle.org`, `downloads.gradle.org`, `plugins.gradle.org`,
`plugins-artifacts.gradle.org`, `repo.maven.apache.org`. The Default environment blocks them
(errors look like `403 ... agent proxy: no rule ... allows this host`). The first build also
downloads Gradle itself (~200 MB) and takes a few minutes; later builds take under a minute.

### What the commands do

| Command | Does |
| :--- | :--- |
| `npm run android:setup` | `scripts/setup-android-sdk.sh`: downloads the Android command-line tools, accepts licences, installs `platform-tools`, `platforms;android-36`, `build-tools;36.0.0` and `35.0.0`, writes `android/local.properties` (`sdk.dir=...`), and creates `.env.android` from `.env.android.example` if missing. Safe to run again. |
| `npm run build:android` | `vite build --mode android` (reads `.env.android`) + `cap sync android` (copies `dist/` into the shell). |
| `npm run android:apk` | `build:android`, then `cd android && ./gradlew assembleDebug`. |
| `npm run android:open` | Opens `android/` in Android Studio (desktop only). |

---

## Windows (owner's PC, with Android Studio)

1. Install **Android Studio**. Its SDK location is shown in *Settings → Languages & Frameworks →
   Android SDK* (on the owner's PC: `D:\Android`).
2. Create `android\local.properties` with one line (double backslashes):
   `sdk.dir=D\:\\Android`
3. Copy `.env.android.example` to `.env.android`.
4. Build from a terminal in the project folder:
   ```bash
   npm run build:android
   ```
   then
   ```bash
   cd android && gradlew.bat assembleDebug
   ```
   Or `npm run android:open` and use *Build → Build App Bundle(s) / APK(s) → Build APK(s)*.

---

## Installing a test build

* **Emulator:** drag the `.apk` onto the emulator window, or
  `adb install -r android/app/build/outputs/apk/debug/MusicMood-<version>-debug.apk`
  (Windows: `D:\Android\platform-tools\adb.exe`).
* **Phone:** copy the file over, open it, allow "install unknown apps" for that one app.
  Not on company-managed phones.
* Debug builds install over each other. Builds made before v0.8.8g used the placeholder id
  `com.musicmood.app` and install as a separate app: uninstall that one.
* Google sign-in needs `VITE_GOOGLE_WEB_CLIENT_ID` in `.env.android` and an APK signed with the key whose
  SHA-1 is registered in Google Cloud (see *Native Google sign-in* below). Otherwise use **Continue as Guest**.

### Emulator troubleshooting (Windows)

* "The emulator process ... has terminated": run it by hand to see the reason,
  `"D:\Android\emulator\emulator.exe" -list-avds`, then `... -avd <name>`.
* "Not enough disk space": virtual phones live in `C:\Users\<you>\.android\avd`. Free space on
  `C:`, or set the user environment variable `ANDROID_AVD_HOME=D:\Android\avd` and create the
  virtual phone again.
* Use a virtual phone whose Android version is installed (e.g. `Medium_Phone_API_37.0`); old
  leftovers fail to start.

---

## App icon

Sources are `branding/icon-background.svg`, `icon-foreground.svg` and `icon-full.svg` (the "Midnight" cut gem). After editing them,
run `node scripts/generateAndroidIcons.mjs` (needs Playwright) to rewrite every `mipmap-*` icon and
`branding/play-store-icon-512.png`, the file to upload as the Play Store icon.

---

## Native Google sign-in (v0.8.9)

The app shows Android's own Google account chooser (Credential Manager) and hands the resulting ID token to
`supabase.auth.signInWithIdToken` (or `linkIdentity` when the listener is a guest, so favourites are kept).
Code: `src/services/nativeGoogleSignIn.js` + `signInWithGoogle` in `src/services/auth.js`. YouTube playlist
import still needs the website (it uses the browser OAuth flow).

Google Cloud (same project as the website's OAuth app):

| Client | Used for | Needs |
| :--- | :--- | :--- |
| **Web** (already exists, the one Supabase uses) | Its ID goes into the app as `VITE_GOOGLE_WEB_CLIENT_ID`. The ID token's audience is this client, so Supabase needs no change. | nothing new |
| **Android** | Lets Google confirm the app is genuine. Never appears in code. | package `uk.co.musicmood` + SHA-1 of the signing key |

Register **one Android client per signing key**. Registered so far: the upload key
(`32:7F:E6:15:CF:71:17:FC:E5:44:3C:A5:8A:26:65:0B:C6:A0:8A:C9`). **Before the first Play release** add a second Android
client (same package) with the **Play App Signing** SHA-1 from Play Console → *App integrity*; Google re-signs
store installs with that key, and sign-in fails with it unregistered. Debug builds made without the upload key use
Android's debug key, whose SHA-1 is not registered: either build with the upload key (below) or add the debug SHA-1.

Local `.env.android`:

```
VITE_API_BASE_URL=https://musicmood.co.uk
VITE_GOOGLE_WEB_CLIENT_ID=<web client id>.apps.googleusercontent.com
```

---

## Signed builds (upload key)

`android/app/build.gradle` signs **debug and release** builds with the upload key when these environment variables
exist. The key never enters the repository. Without them, debug builds use Android's debug key and
`assembleRelease` / `bundleRelease` stop with an error (an unsigned file can't reach Play by accident).

| Variable | Value |
| :--- | :--- |
| `ANDROID_KEYSTORE_FILE` | path to the `.jks` file |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | `musicmood` (default) |
| `ANDROID_KEY_PASSWORD` | only if different from the store password |

Output: `android/app/build/outputs/apk/release/MusicMood-<version>-release.apk` and
`.../bundle/release/MusicMood-<version>-release.aab` (the file Play wants).

### GitHub Actions: `Android signed build` (manual)

Actions tab → *Android signed build* → *Run workflow* → type the tag (e.g. `v0.8.9`) → download
`musicmood-android-signed` from the run page. It reads these **repository secrets** (Settings → Secrets and variables
→ Actions → New repository secret):

| Secret | Value |
| :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64 encoded (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\upload.jks")) \| Set-Clipboard`) |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | `musicmood` |
| `ANDROID_KEY_PASSWORD` | optional: only if the key password differs from the store password |
| `GOOGLE_WEB_CLIENT_ID` | the Web OAuth client ID (public, stored here so the workflow can write `.env.android`) |

The workflow fails early if the keystore's SHA-1 is not the registered one, and again if the finished APK is signed
with a different key. Keep the keystore and its password backed up off GitHub: losing the upload key means asking Google
to reset it.

---

## Not set up yet (see ROADMAP.md, Phase 4)

* Play Console upload, Play App Signing SHA-1 for Google sign-in, and the minimum-version check.

When an Android release is shipped, record it in the *Android release log* in
`RELEASE_MANAGEMENT.md`.
