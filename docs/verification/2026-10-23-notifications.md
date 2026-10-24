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
| Android permission denial | Passed | Elyra showed the pre-prompt, Android showed Allow / Don’t allow, and Don’t allow changed the app status to “Off in system settings.” The inbox continued to load. |
| Permission grant and token registration | Passed | Android settings granted POST_NOTIFICATIONS; the rebuilt APK showed “Push is on,” POST /api/devices returned 200, and one enabled device row was present. |
| Test endpoint, inbox and push | Passed | The in-app test returned “Added to your inbox. Push accepted for 1 device.” The bell showed 1 unread; opening the item marked it read. A subsequent push was visibly posted by Android on the system-v2 channel. Mark all read changed the unread count to zero; pull to refresh updated the list. |
| Background notification tap | Passed | Tapping a system notification with the app in the background opened Notifications and marked that exact item read. |
| Killed-app notification tap | Passed in standalone APK | The app process had no PID before delivery. Android posted the push; tapping it launched Elyra, opened Notifications and marked that exact item read. The Expo development-client APK had returned null from getLastNotificationResponseAsync in this case, so this check used a standalone APK. |
| Foreground push | Passed in standalone APK | The received push appeared as Elyra’s in-app banner and in the inbox, with no Android system notification for that delivery. Screenshot: `/tmp/elyra-notifications-verification/foreground-banner-visible.png`. |
| Price crossing delivered by five-minute cron | Not verified | The SOL alert at $104.556 remained armed at the last database check; the latest Pyth price was below it. The old Binance/Pyth mismatch is corrected in [PR #2](https://github.com/Ayushjhax/Elyra-dashboard/pull/2), merged into `main`. Vercel reported successful builds and the new test route returned 405 to GET on `elyra-dashboard-x1jo.vercel.app`, but public DNS for the documented `api.getelyra.xyz` returned NXDOMAIN. The Vault URL and a real cron crossing still need confirmation. |

Automated: 1,328 web tests passed after the Pyth delivery correction. Afterward, 22 mobile notification tests, mobile TypeScript, full mobile lint, root TypeScript and scoped root lint passed.

The first on-device pass caught two Expo 58 specifics and prompted code fixes: Android reports an initially ungranted permission as denied while it can still be requested, and the literal channel sound `default` is interpreted as a custom resource. The native channel IDs were advanced to v2 so previously created channels on the test device do not retain that sound. The updated development APK was installed and verified for permission, token registration, test delivery and background taps. The standalone local-API APK was used to verify the cold tap and foreground banner because the Expo development launcher handles cold starts differently. Its local cleartext allowance was used only during verification and was restored afterward. Six manually inserted Seeker test rows were removed; the one official test-endpoint row remains read in the inbox.

The user requested a stop to further deployment actions after PR #2 had already been merged. No further deployment or DNS changes were made.
