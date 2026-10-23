# Android push setup

Elyra uses Firebase Cloud Messaging through Expo Push Service. The Android
package is **xyz.getelyra.app** and the linked EAS project ID is
**df86cf17-1eaa-438b-a29e-0b8f2e61a462**.

## 1. Create Firebase and its Android app

1. Open [Firebase Console](https://console.firebase.google.com/), select **Create
   a project**, name it **Elyra**, and finish project creation. Analytics is optional.
2. Open **Project settings → General → Your apps → Add app → Android**.
3. Enter **xyz.getelyra.app** as the package name. The app nickname can be Elyra.
   Register the app. A SHA certificate fingerprint is not required for this push setup.
4. Download **google-services.json**. Keep it outside the repository, for example
   `~/Documents/Elyra-credentials/google-services.json`.
5. The Firebase setup wizard may show native Gradle instructions. Expo's config
   plugins handle the native files; do not hand-edit the generated Android project.

Source: [Firebase Android setup](https://firebase.google.com/docs/android/setup).

## 2. Supply google-services.json as an EAS file variable

1. Open Elyra's project on [Expo](https://expo.dev/), then **Project settings →
   Environment variables → Add variable**.
2. Name it **GOOGLE_SERVICES_JSON** and choose **File**. Upload the downloaded
   `google-services.json`; choose **Secret** visibility.
3. Apply it to **development**, **preview**, and **production** (or use the
   corresponding Firebase project separately for each environment).
4. `mobile/app.config.ts` reads `process.env.GOOGLE_SERVICES_JSON` as
   `android.googleServicesFile`. EAS supplies the uploaded file's path during
   a build. `mobile/eas.json` selects the matching environment for each profile.
5. For a local native build, set the path in your terminal:

   ```bash
   cd mobile
   export GOOGLE_SERVICES_JSON="$HOME/Documents/Elyra-credentials/google-services.json"
   pnpm exec expo prebuild --platform android --no-install
   pnpm exec expo run:android --device
   ```

The file is ignored by git. Do not prefix this variable with `EXPO_PUBLIC_`.
Never place a service-account private key in this variable.

Source: [EAS file environment variables](https://docs.expo.dev/eas/environment-variables/manage/).

## 3. Upload the FCM V1 service-account key to EAS

This is a **different JSON file** from `google-services.json`.

1. In the same Firebase project, open **Project settings → Service accounts**.
2. Select **Generate new private key**, confirm, and store the JSON outside
   the repository alongside your other credentials.
3. In the terminal:

   ```bash
   cd mobile
   npx eas-cli@latest credentials --platform android
   ```

4. Select the Elyra app / relevant build profile. Choose **Google Service
   Account → Manage your Google Service Account Key for Push Notifications
   (FCM V1) → Set up a Google Service Account Key → Upload a new service
   account key**. Select the private-key JSON you just downloaded.
5. Alternatively, in Expo's **Project settings → Credentials**, select Android
   and **xyz.getelyra.app**, then **Service credentials → FCM V1 service account
   key → Add → Upload new key → Save**.
6. If using an existing service account instead, give it the **Firebase Cloud
   Messaging API Admin** role in the same Google Cloud project, and enable
   the Firebase Cloud Messaging API if that console reports it disabled.
7. Keep the private key in EAS credentials. It is never an app environment
   variable, never bundled, and never committed.

Source: [Expo's FCM V1 credential guide](https://docs.expo.dev/push-notifications/fcm-credentials/).

## 4. Build and install

```bash
cd mobile
npx eas-cli@latest build --platform android --profile development
```

Install the APK on the Seeker. Adding expo-notifications and expo-localization
requires a new native build; an OTA update or Expo Go is insufficient.

The icon is a white transparent PNG and Android uses Elyra's accent colour.
Channels: Price alerts and Liquidation warnings are high importance; Market
moves, Prediction markets and System use default importance; Daily summary is
low importance. Users can change channel settings in Android.

## 5. Backend and scheduled delivery

1. Apply `supabase/migrations/0016_app_notification_accounts.sql` in the Supabase
   SQL editor. This keeps inbox delivery independent of a push token or permission.
2. Deploy the API changes together with the app. Push payloads include the
   verified account ID so notifications cannot be opened under a different login. Older pushes without it are opened only when their notification ID is found in the authenticated inbox; their destination comes from that saved row.
3. Set up the five-minute job and Vault secrets described in
   [the scheduler instructions](../../supabase/SCHEDULER.md). Vercel Hobby's daily
   fallback is not the five-minute delivery schedule.
4. If enhanced Expo Push security is enabled, set the API's **EXPO_ACCESS_TOKEN**
   to the matching Expo access token on the server. It never belongs in the app.

## 6. Real-device checks

- Launch: permission is not requested.
- Set the first price alert or enable a notification type: read the pre-prompt,
  then Continue to Android's permission dialog. Deny once and confirm that the
  inbox works and the fix button opens system settings. Then grant permission.
- In **Account → Notifications**, confirm **Push is on**, then **Send a test
  notification**. The endpoint adds an inbox row and pushes only to the caller's
  registered devices. It allows one test per minute.
- With the app foregrounded, the test appears as an in-app banner; no system
  notification is displayed. Tapping it opens the inbox and marks it read.
- Put the app in the background, send another test from a second authenticated
  session, and tap the Android notification.
- Swipe the app out of recents (do not Android Force stop, which blocks push
  until the next manual launch), send a test, and tap it. The app waits for
  authentication and inbox ownership before navigating.
- Set an alert just above the current market price, keep Price alerts on, and
  wait for a real crossing and the next five-minute cron tick. Inspect
  `cron.job_run_details` and `net._http_response` as described in SCHEDULER.md.
  Record the inbox row and push receipt; setting a level does not guarantee
  the market will cross it during the test.

Sources: [Android notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission),
[Expo notification handling](https://docs.expo.dev/push-notifications/receiving-notifications/).
