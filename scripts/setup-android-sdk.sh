#!/usr/bin/env bash
# Installs the Android SDK pieces needed to build the MusicMood app on Linux
# (including Claude cloud sessions on the "musicmood" environment, which allows
# dl.google.com, maven.google.com and the Gradle hosts). Safe to run again.
#
#   npm run android:setup          (or: bash scripts/setup-android-sdk.sh)
#   ANDROID_HOME=/path/to/sdk npm run android:setup   to choose the folder
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
CLT_ZIP="commandlinetools-linux-11076708_latest.zip"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

command -v java >/dev/null || { echo "Java 21 is required (java not found)."; exit 1; }

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Downloading Android command-line tools to $ANDROID_HOME ..."
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  tmp="$(mktemp -d)"
  curl -sSfL -o "$tmp/clt.zip" "https://dl.google.com/android/repository/$CLT_ZIP"
  unzip -q "$tmp/clt.zip" -d "$tmp"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi

SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
echo "Accepting licences and installing platform 36 + build tools ..."
yes | "$SDKM" --licenses >/dev/null 2>&1 || true
"$SDKM" "platform-tools" "platforms;android-36" "build-tools;36.0.0" "build-tools;35.0.0" >/dev/null

# Tell Gradle where the SDK is (android/local.properties is git-ignored).
echo "sdk.dir=$ANDROID_HOME" > "$REPO_ROOT/android/local.properties"

# The app needs to know which server to call (.env.android is git-ignored).
if [ ! -f "$REPO_ROOT/.env.android" ]; then
  cp "$REPO_ROOT/.env.android.example" "$REPO_ROOT/.env.android"
  echo "Created .env.android from .env.android.example"
fi

echo "Android SDK ready in $ANDROID_HOME. Build with: npm run android:apk"
