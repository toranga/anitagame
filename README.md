# anitagame

# DON'T DIE

A platformer designed by a kid. The caped kid is the hero.

Her other game is [SPOOKY FOREST](forest/index.html). You play as the Hero, collecting lanterns in a 3D forest. The red monster is friendly by day and scary at night.

![DON'T DIE poster](poster.jpg)

## How to play

Open `index.html` in a browser. On a phone, turn it sideways and tap to start.

## Controls

**Desktop**

- Run with the arrow keys or A / D
- Jump with Space, Up, or W
- Fly by holding F or Shift (limited by a meter)
- Laser with Z or J
- Talk with X
- Enter starts or restarts
- P pauses
- M toggles sound
- H hides or shows the on-screen buttons

**Phone**

On-screen arrow buttons on the left. JUMP, FLY, ZAP, and TALK on the right. A **Hide buttons** / **Show buttons** control sits in the corner. Tap it to tuck the buttons away, or press H. The choice is remembered on this device.

## Controller

A standard gamepad works alongside the keyboard and the on-screen buttons, including the NVIDIA Shield TV controller.

- Run: left stick (past a small deadzone) or D-pad left/right
- Jump: A, or D-pad up. A also starts or restarts from the title and end screens
- Laser: B or Y
- Talk: X
- Fly: hold RB or RT (the flight meter still limits it)
- Start: start or restart, and pause during play
- Back/Select: hide or show the on-screen buttons
- Sound stays on M, or the on-screen sound button when those buttons are visible

On the title screen, a connected controller changes the prompt to "Press A to start". Connecting a controller also hides the on-screen buttons until you touch the screen. If you use Hide buttons / Show buttons, Back, or H, that choice wins and is saved for next time.

## Play on NVIDIA Shield

The browser on Android TV turns the D-pad into a mouse and treats B as Back. The native app sends those buttons to the game instead. It is landscape, fullscreen, and works offline. The download is 2.0 MB (2,053,945 bytes), versionCode 6.

1. On the Shield, install the free **Downloader** app by AFTVnews from the Play Store.
2. Allow Downloader to install unknown apps when Android asks (or in Settings, Apps, Downloader, Install unknown apps).
3. In Downloader, enter `https://toranga.github.io/anitagame/DontDie.apk` and download it.
4. Install the APK. If you already have the app, this build is an update (versionCode 6) signed with the same debug key. The app offers it from Check for updates once `version.json` is published.
5. Launch **Anita's Games**, then choose DON'T DIE or SPOOKY FOREST. The app also checks `version.json` on this site and can download a newer APK from the game picker (**Check for updates**).

To publish another Android build: bump `versionCode` in `android/app/build.gradle.kts`, run the release build, copy the APK to `DontDie.apk`, and set the same `versionCode`, `versionName`, and notes in `version.json`.

Pair the controller under Settings, Remotes & accessories. In DON'T DIE, A or START plays and B fires the laser. In SPOOKY FOREST, stick up walks forward and stick right walks right. The right stick looks around (right turns right, up looks up) and R3 recenters. Options can invert camera X or Y. A jumps, X hides or talks, B or RB swings the lasso, and LT or L3 sprints. D-pad moves the title highlight and A starts. Press Back to pause; press Back again within 2 seconds to quit. Hold Select for two seconds to show the stick values, including the right stick.

The page at https://toranga.github.io/anitagame/ is the same game in a browser, for a keyboard, a phone, or a computer.

## Gameplay

You have 3 hearts. Find 5 diamonds. Jump on pink blobs, and zap blue blobs with the laser. Collect all 5 diamonds to open the gate to the cat monster boss (16 laser hits). The win screen says "YOU DIDN'T DIE!".
