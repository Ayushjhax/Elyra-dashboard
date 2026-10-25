import type { ExpoConfig } from "expo/config";
import packageJson from "./package.json";

/* ---------------------------------------------------------------------------
   The Android app's native configuration.

   Values come from CLAUDE.md ("The Android dApp"). The package name can
   never change after the first dApp Store release.

   SURFACE is the one colour here. Expo's config loader cannot import the
   brand tokens (TypeScript outside this folder), so it is written out and
   src/theme/tokens.test.ts holds it equal to --surface-base.

   Native folders (android/, ios/) are generated from this file and are not
   committed — configure native behaviour here or in a config plugin.
--------------------------------------------------------------------------- */

/* The versionName; the versionCode is EAS's (eas.json: remote, auto-incremented). */
const version = packageJson.version;

/** --surface-base, the forest every native surface starts on. */
export const SURFACE = "#101710";
/** --accent; config plugins run outside Metro's shared token resolver. */
export const NOTIFICATION_ACCENT = "#D2DC76";

const config: ExpoConfig = {
  name: "Elyra",
  slug: "elyra",
  version,
  scheme: "elyra",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  backgroundColor: SURFACE,
  icon: "./assets/images/icon.png",
  android: {
    package: "xyz.getelyra.app",
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    adaptiveIcon: {
      backgroundColor: SURFACE,
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    /* No Android backup of app data: the session, the wallet adapter's
       authorization and the preferences stay on this phone. */
    allowBackup: false,
    /* Android App Links: a referral link opens the app rather than the
       browser, once the website's /.well-known/assetlinks.json names this
       package and its signing key (served from ANDROID_CERT_SHA256). The
       elyra:// scheme is registered from `scheme` above. */
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "getelyra.xyz", pathPrefix: "/r/" },
          { scheme: "https", host: "www.getelyra.xyz", pathPrefix: "/r/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    /* Only what the app uses: INTERNET, POST_NOTIFICATIONS, CAMERA (scan a
       recipient's QR), RECORD_AUDIO (dictation, from expo-audio) and
       USE_BIOMETRIC (the check before every signature). Each runtime one is
       asked for in context.

       Libraries add a few more that the app does use, kept on purpose:
         ACCESS_NETWORK_STATE, WAKE_LOCK, c2dm RECEIVE — Firebase Cloud
           Messaging, for push;
         USE_FINGERPRINT — the biometric check on Android 7–8 (minSdk 24);
           without it those phones would sign with no prompt;
         VIBRATE — expo-haptics;
         MODIFY_AUDIO_SETTINGS — expo-audio's setAudioModeAsync for
           dictation;
         DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION — AndroidX's own,
           signature-level, never granted to another app.
       Everything below is blocked: features Elyra doesn't use. */
    permissions: [
      "android.permission.USE_BIOMETRIC",
      "android.permission.CAMERA",
      "android.permission.POST_NOTIFICATIONS",
    ],
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      /* expo-audio's background playback (turned off below). */
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.FOREGROUND_SERVICE_MICROPHONE",
      /* expo-notifications: re-scheduling local notifications after a
         reboot, and launcher badge counts — Elyra schedules none and sets
         no badge. */
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.READ_APP_BADGE",
      "com.anddoes.launcher.permission.UPDATE_COUNT",
      "com.htc.launcher.permission.READ_SETTINGS",
      "com.htc.launcher.permission.UPDATE_SHORTCUT",
      "com.huawei.android.launcher.permission.CHANGE_BADGE",
      "com.huawei.android.launcher.permission.READ_SETTINGS",
      "com.huawei.android.launcher.permission.WRITE_SETTINGS",
      "com.majeur.launcher.permission.UPDATE_BADGE",
      "com.oppo.launcher.permission.READ_SETTINGS",
      "com.oppo.launcher.permission.WRITE_SETTINGS",
      "com.sec.android.provider.badge.permission.READ",
      "com.sec.android.provider.badge.permission.WRITE",
      "com.sonyericsson.home.permission.BROADCAST_BADGE",
      "com.sonymobile.home.permission.PROVIDER_INSERT_BADGE",
      "me.everything.badger.permission.BADGE_COUNT_READ",
      "me.everything.badger.permission.BADGE_COUNT_WRITE",
      /* Google Play's install referrer — Elyra isn't distributed by Play. */
      "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE",
      /* React Native's and the development client's local-network
         discovery, for Metro; release builds never use it. */
      "android.permission.ACCESS_LOCAL_NETWORK",
      "android.permission.CHANGE_WIFI_MULTICAST_STATE",
    ],
  },
  ios: {
    bundleIdentifier: "xyz.getelyra.app",
  },
  plugins: [
    [
      "expo-notifications",
      {
        icon: "./assets/images/notification-icon.png",
        color: NOTIFICATION_ACCENT,
        defaultChannel: "system-v2",
      },
    ],
    "expo-localization",
    "expo-router",
    "expo-dev-client",
    [
      "expo-splash-screen",
      {
        backgroundColor: SURFACE,
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "expo-font",
    /* Release build shape: arm64-v8a only — every Solana Mobile phone and
       every Android phone sold for years. Hermes is the default engine.
       R8 minification and resource shrinking stay off: they can strip
       classes Privy, Mobile Wallet Adapter and Sentry load by reflection,
       and the bundle (Hermes bytecode) is untouched by them anyway. */
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["arm64-v8a"],
        },
      },
    ],
    "expo-secure-store",
    /* Crash reporting (src/lib/crash): the native SDK is always built in,
       and reports only when EXPO_PUBLIC_SENTRY_DSN is set. Source maps are
       uploaded only when SENTRY_AUTH_TOKEN is (an EAS secret), so a build
       without one still succeeds. */
    [
      "@sentry/react-native/expo",
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        url: "https://sentry.io/",
        disableAutoUpload: !process.env.SENTRY_AUTH_TOKEN,
      },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Elyra asks for Face ID before your wallet signs anything.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Elyra uses the camera to scan a wallet address's QR code.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    /* The microphone is for dictating a question to Ask Elyra, asked for on
       the first press of the microphone. The recording goes to the API to be
       written out and is not kept. */
    [
      "expo-audio",
      {
        microphonePermission:
          "Elyra uses the microphone to write out a question you dictate to Ask Elyra.",
        recordAudioAndroid: true,
        /* Elyra never plays audio, in the background or at all. */
        enableBackgroundPlayback: false,
      },
    ],
    /* The system photo picker needs no storage permission on Android; the
       library is opened only to attach an image to a question. */
    [
      "expo-image-picker",
      {
        photosPermission:
          "Elyra opens your photos only to attach an image to a question you ask.",
        cameraPermission:
          "Elyra uses the camera to scan a wallet address's QR code.",
        microphonePermission:
          "Elyra uses the microphone to write out a question you dictate to Ask Elyra.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "df86cf17-1eaa-438b-a29e-0b8f2e61a462",
    },
  },
};

export default config;
