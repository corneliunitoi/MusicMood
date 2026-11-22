# 📱 Building the MusicMood Android app

The Android app is the same React app wrapped by **Capacitor 8**. `android/` is a thin Android
shell; `src/` is shared with the website. A build compiles the web app, copies it into
`android/`, and lets Gradle package it as an `.apk`.

* App id: `uk.co.musicmood` (final; never change it after the first Play upload)
* Version: read from `package.json` (e.g. `0.8.8j` → versionName `0.8.8j`, versionCode `80810`; it only ever goes up)
* Output: `android/app/build/outputs/apk/debug/MusicMood-<version>-debug.apk`

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
* Google sign-in does not work in the app yet (native sign-in is on the roadmap); use
  **Continue as Guest**.

### Emulator troubleshooting (Windows)

* "The emulator process ... has terminated": run it by hand to see the reason,
  `"D:\Android\emulator\emulator.exe" -list-avds`, then `... -avd <name>`.
* "Not enough disk space": virtual phones live in `C:\Users\<you>\.android\avd`. Free space on
  `C:`, or set the user environment variable `ANDROID_AVD_HOME=D:\Android\avd` and create the
  virtual phone again.
* Use a virtual phone whose Android version is installed (e.g. `Medium_Phone_API_37.0`); old
  leftovers fail to start.

---

## Not set up yet (see ROADMAP.md, Phase 4)

* **Release (signed) builds** for Google Play (`bundleRelease`, an upload key stored as a
  repository secret, Play App Signing) and a GitHub workflow that builds them from release tags.
* **Native Google sign-in** (Credential Manager + `supabase.auth.signInWithIdToken`).

When an Android release is shipped, record it in the *Android release log* in
`RELEASE_MANAGEMENT.md`.
