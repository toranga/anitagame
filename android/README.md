# DON'T DIE for Android TV

A fullscreen landscape app for NVIDIA Shield. It loads the same `index.html` as the website, bundled inside the APK, and forwards the controller into the game. The D-pad runs and jumps. B fires the laser and does not go back.

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

The game HTML is copied from `../index.html` at build time, so the APK stays in step with the website. Copy the finished APK to `DontDie.apk` at the repository root. The current sideload build is 1.8 MB (1,837,731 bytes).

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
