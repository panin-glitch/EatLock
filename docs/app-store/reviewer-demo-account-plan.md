# Reviewer Demo Account Plan

## What this is

Apple App Review needs a working way to access account-gated features in the production build. For TadLock, that means a reviewer account that can sign in, has access to TadLock Pro, and can reach the meal scan flow without needing private setup from Apple.

## Recommended Setup

- Create a dedicated review account you control, not a personal everyday account.
- Recommended email format: `review@your-domain.com` or another inbox you can access.
- Give this account an active TadLock Pro entitlement before submission.
- Preload the account with at least one completed meal session so reviewers can see history and streak-related UI immediately.

## Minimum Reviewer Account Requirements

- Email: `<fill in before submission>`
- Password: `<fill in before submission>`
- Account state: confirmed and able to sign in without extra email verification during review
- Subscription state: active TadLock Pro entitlement
- Test data: at least one completed meal session and one account profile record

## What Reviewers Should Be Able to Test

- Sign in successfully.
- Open the TadLock Pro paywall.
- Confirm that purchase and restore flows are present.
- Access the meal scan flow with an active subscription.
- Edit nutrition macros after scan.
- Complete a meal session and view the summary screen.

## Notes

- Do not rely on Expo Go or a `__DEV__` bypass for App Review.
- Keep TadLock backend services live during review.
- If the reviewer account uses a subscription purchased outside the review flow, mention that clearly in the App Review notes.
