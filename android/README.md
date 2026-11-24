# DON'T DIE for Android TV

A fullscreen landscape app for NVIDIA Shield. It opens a picker for DON'T DIE and SPOOKY FOREST, both bundled offline, and forwards the controller into the page. Back pauses, and a second Back within 2 seconds quits.

## What you need

- JDK 17 or 21
- Android SDK with platform 36 and build-tools 36.0.0
- `ANDROID_HOME` pointing at that SDK

The signing key is checked in on purpose at `keystore/anitagames.jks`. This is a kids' hobby app, so the key is public and every build can sign the same way. Alias `anitagames`, store password `anitagames`, key password `anitagames`. Both the debug and release build types use it. Version 1.8 (versionCode 10) is the first build with this key. The previous APK used the machine debug key, so the Shield needs one uninstall before this one will install.

## Build

From this directory:

```sh
export ANDROID_HOME="$HOME/android-sdk"
./gradlew :app:test :app:assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../DontDie.apk
```

The build copies `../index.html`, `../menu-input.js`, and `../forest/` into the APK, then you copy the finished file to `DontDie.apk` at the repository root. Version 1.8 (versionCode 10) is 3.2 MB (3,168,782 bytes). Its certificate SHA-256 is `5d25d7521b7d38ba9861aff843f61063b4cd0d63f64b5c22e09b7b9439b38308`.

To release an update:

1. Bump `versionCode` (and `versionName`) in `app/build.gradle.kts`.
2. Build the release APK and copy it to `DontDie.apk` at the repository root.
3. Set the same `versionCode`, `versionName`, APK URL, and notes in `version.json` at the repository root.

The app fetches `https://toranga.github.io/anitagame/version.json` on launch and from **Check for updates**. A higher `versionCode` offers Update now / Later, downloads the APK, and opens the installer.

Check the TV launcher bits:

```sh
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging ../DontDie.apk
```

You should see `android.software.leanback` not required, touchscreen not required, a `leanback-launchable-activity`, and a banner.

## Controller

The page is opened with `?native=1`, which sets `window.__nativePad`. The game then ignores `navigator.getGamepads()` and reads the values the activity writes each frame: both sticks (`__nativeAxis` / `__nativeAxisY` and `__nativeRightX` / `__nativeRightY`, from `AXIS_X`/`AXIS_Y` and `AXIS_Z`/`AXIS_RZ`), both triggers (`__nativeL2` / `__nativeR2`), and `__nativeButtons`.

| Control | DON'T DIE | SPOOKY FOREST |
| --- | --- | --- |
| Left stick or D-pad | Run | Move relative to the camera. Up walks forward |
| Right stick | | Orbit the camera. Right turns right, up looks up. R3 recenters |
| A | Jump, and start the game | Jump. A also starts from the title |
| B | Laser | Swing the lasso |
| X | Talk | Hide, talk, or pick up |
| Y | Laser | First person |
| RB | Fly while held | Swing the lasso |
| LT or L3 | | Sprint |
| RT | Fly while held | |
| Start | Opens the pause menu: Resume, Restart, Back to game menu, Quit | Same, plus Options |
| Select | Hide or show the on-screen buttons | Hide or show the on-screen buttons |
| Back | Pause. Press Back again within 2 seconds to quit | Pause. Press Back again within 2 seconds to quit |
| Home | Leaves the app, handled by Android | Leaves the app, handled by Android |

B is `KEYCODE_BUTTON_B`. It is consumed by the activity, so the WebView cannot treat it as Back.
