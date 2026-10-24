# Store screenshots

**Status: not captured.** Capture them from the **release APK** with a
**demo account holding a small real balance** — never mocked numbers, and
never the owner's own wallet (the screenshots are public).

## Requirements (Listing Page Guidelines, read 2026-10-24)

- 4 to 8 screenshots (or videos), JPG, PNG, GIF or WebP, **≤ 3 MB each**.
- The first one sets the shape; **every other must match it**. Use portrait
  **9:16**.
- At least **1080 px** in width and height → capture at **1080×1920**.

## The set (in this order)

1. **Portfolio** — total value, 24h change, positions summary.
2. **Ask Elyra** — a finished answer with its sources visible (ask "How is
   my portfolio split?" or "Why is SOL moving today?").
3. **Asset screen (SOL)** — price header, chart, pivots.
4. **Alerts & automation** — one or two armed price rules.
5. **Research → Prediction markets** or **Research → Reports**.
6. **Swap review** — a small quote (e.g. 1 USDC → SOL), *before* signing.
7. **Notifications inbox** (optional).
8. **Account** (optional) — shows connections are read-only.

## How to capture (Seeker, or any phone ≥ 1080 px wide)

```sh
ADB=~/Library/Android/sdk/platform-tools/adb
# Release build signed with any key is fine for screenshots; the content is identical.
$ADB install -r elyra-release.apk
# A 9:16 display at 360dp wide (480 dpi): screencaps come out 1080×1920.
$ADB shell wm size 1080x1920
$ADB shell wm density 480
# Clean status bar: Developer options → System UI demo mode, or:
$ADB shell settings put global sysui_demo_allowed 1
$ADB shell am broadcast -a com.android.systemui.demo -e command enter
$ADB shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
$ADB shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
$ADB shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false

# For each screen:
$ADB exec-out screencap -p > docs/store/screenshots/01-portfolio.png

# Afterwards:
$ADB shell am broadcast -a com.android.systemui.demo -e command exit
$ADB shell wm size reset && $ADB shell wm density reset
```

Check each file is 1080×1920 and under 3 MB
(`sips -g pixelWidth -g pixelHeight docs/store/screenshots/*.png`; convert to
JPG quality 90 if a PNG is over 3 MB).

Before uploading, look at every screenshot for: a full wallet address, an
email, a real balance you don't want public, a notification from another
app, or a development-build element (the floating gear, a red warning
banner). Release builds have neither of the last two.
