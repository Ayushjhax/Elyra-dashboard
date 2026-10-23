import type { ExpoConfig } from "expo/config";

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

const version = "1.0.0";

/** --surface-base, the forest every native surface starts on. */
export const SURFACE = "#101710";

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
    adaptiveIcon: {
      backgroundColor: SURFACE,
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    /* Only what the app uses. Biometrics gate every signature (the plugin
       below declares it); the camera scans a recipient's QR code, asked for
       only when Scan is pressed. Notifications and the microphone
       (dictation) are added by the prompts that need them, each asked for in
       context. */
    permissions: ["android.permission.USE_BIOMETRIC", "android.permission.CAMERA"],
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  ios: {
    bundleIdentifier: "xyz.getelyra.app",
  },
  plugins: [
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
    "expo-secure-store",
    [
      "expo-local-authentication",
      { faceIDPermission: "Elyra asks for Face ID before your wallet signs anything." },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Elyra uses the camera to scan a wallet address's QR code.",
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
        microphonePermission: "Elyra uses the microphone to write out a question you dictate to Ask Elyra.",
        recordAudioAndroid: true,
      },
    ],
    /* The system photo picker needs no storage permission on Android; the
       library is opened only to attach an image to a question. */
    [
      "expo-image-picker",
      {
        photosPermission: "Elyra opens your photos only to attach an image to a question you ask.",
        cameraPermission: "Elyra uses the camera to scan a wallet address's QR code.",
        microphonePermission: "Elyra uses the microphone to write out a question you dictate to Ask Elyra.",
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
