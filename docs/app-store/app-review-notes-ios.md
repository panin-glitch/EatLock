# App Review Notes for iOS

## App Review Settings

- Sign-in required: `Yes`
- Reviewer account email: `yeetmanrecovery@gmail.com`
- Reviewer account password: enter the current TadLock password manually in App Store Connect

## Suggested Review Notes

Thank you for reviewing TadLock.

Test account:

- Email: `yeetmanrecovery@gmail.com`
- Password: `<enter manually in App Store Connect>`

Important notes:

- TadLock uses live backend services during review.
- TadLock Pro subscriptions are required for premium meal-scan access. The reviewer account above already has an active TadLock Pro entitlement so premium features can be tested immediately.
- The current iOS build does not enforce device-level app blocking. Any focus or app-selection UI on iOS should be treated as informational only and is not marketed as device-level blocking in App Store metadata.
- The submitted iOS build is focused on meal scan, nutrition editing, meal-session timing, streak progress, and subscription flows.
- If App Review needs to test purchase restoration, the app includes Restore Purchases in Settings and Profile.

## In-App Purchase Notes

- Subscription products expected in App Store Connect:
  - `monthly`
  - `yearly`
- RevenueCat entitlement:
  - `TadLock Pro`
- RevenueCat offering:
  - `default`

## Pre-Submission Checklist

- Enter the current TadLock password manually in App Store Connect.
- Confirm the reviewer account is already active and confirmed.
- Confirm monthly and yearly subscriptions are attached to this build in App Store Connect.
- Confirm Privacy Policy URL and Terms URL are public and accessible.
