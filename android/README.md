# DON'T DIE for Android TV

A fullscreen landscape app for NVIDIA Shield. It opens a picker for DON'T DIE and SPOOKY FOREST, both bundled offline, and forwards the controller into the page. Back pauses, and a second Back within 2 seconds quits.

## What you need

- JDK 17 or 21
- Android SDK with platform 36 and build-tools 36.0.0
- `ANDROID_HOME` pointing at that SDK

No keystore is checked in. The release APK is signed with the debug keystore that Android creates under `~/.android/debug.keystore`.

## Build

From this directory:

```sh
export ANDROID_HOME="$HOME/android-sdk"
./gradlew :app:test :app:assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../DontDie.apk
```

The build copies `../index.html` and `../forest/` into the APK, then you copy the finished file to `DontDie.apk` at the repository root. Version 1.1 (versionCode 2) is 1.9 MB (2,030,936 bytes). It is signed with the same debug certificate as version 1, so it installs over the existing app.

Check the TV launcher bits:

```sh
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging ../DontDie.apk
```

You should see `android.software.leanback` not required, touchscreen not required, a `leanback-launchable-activity`, and a banner.

## Controller

The page is opened with `?native=1`, which sets `window.__nativePad`. The game then ignores `navigator.getGamepads()` and reads `window.__nativeButtons` and `window.__nativeAxis` instead, so a press is not applied twice.

| Control | Action |
| --- | --- |
| Left stick or D-pad left/right | Run |
| A or D-pad up | Jump. A also starts the game |
| B or Y | Laser |
| X | Talk |
| R1 or R2 | Fly while held |
| Start or D-pad center | Start, restart, or pause |
| Select | Hide or show the on-screen buttons |
| Back | Pause. Press Back again within 2 seconds to quit |
| Home | Leaves the app, handled by Android |

B is `KEYCODE_BUTTON_B`. It is consumed by the activity, so the WebView cannot treat it as Back.
