# Notifications — Seeker verification (23 October 2026)

Device: Solana Mobile Seeker, Android 16 (API 36), `xyz.getelyra.app` development APK. Account: signed in with a funded portfolio. Screenshots taken during testing are under `/tmp/elyra-notifications-verification/` and are intentionally outside the repository.

## Configuration

- Firebase project `elyra-mobile` has the Android app `xyz.getelyra.app`. `google-services.json` was downloaded to `~/Documents/Elyra-credentials/google-services.json` and uploaded to EAS as a Secret File variable `GOOGLE_SERVICES_JSON` for development, preview and production.
- The user confirmed the FCM V1 service-account key is assigned to this package in EAS credentials and the five-minute cron is active.
- Migration `0016_app_notification_accounts.sql` is applied; the table was queried successfully. No Firebase JSON is tracked by git.
- Native build includes POST_NOTIFICATIONS, the monochrome icon, brand accent, Expo notifications, and Firebase Google Services processing.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Launch without a permission prompt | Passed | Android's POST_NOTIFICATIONS remained ungranted with no USER_SET flag; app opened and inbox displayed its empty state. |
| Inbox without push permission | Passed | Authenticated native inbox created one row in `app_notification_accounts` while permission was ungranted; the bell opened the empty state. |
| First alert contextual pre-prompt | Passed | SOL alert at $104.556 was saved from the asset sheet above $104.5308 at creation; pre-prompt appeared after Set alert. |
| Android permission denial | Pending device check | |
| Permission grant and token registration | Pending device check | |
| Test endpoint, inbox and push | Pending device check | |
| Price crossing delivered by five-minute cron | Pending market crossing | The alert remains armed until SOL reaches $104.556 on a cron tick. |
| Background, foreground and killed-app tap | Pending device check | |

Automated: 1,316 web tests and 89 mobile tests passed before the on-device permission correction; targeted notification tests and typecheck passed afterward. Full mobile lint currently also scans a concurrent, untracked `mobile/src/app/settings.tsx` change with a `react-hooks/set-state-in-effect` error unrelated to notifications.

The first on-device pass caught two Expo 58 specifics and prompted code fixes: Android reports an initially ungranted permission as denied while it can still be requested, and the literal channel sound `default` is interpreted as a custom resource. The native channel IDs were advanced to v2 so previously created channels on the test device do not retain that sound. Recheck the pending rows with the updated APK.
