# App Store Connect Subscription Setup Checklist

This repo expects the following iOS subscription setup:

## Product IDs

- Monthly subscription product ID: `monthly`
- Yearly subscription product ID: `yearly`

## RevenueCat Mapping

- Entitlement ID: `TadLock Pro`
- Offering ID: `default`

## App Store Connect

Create two auto-renewable subscriptions under the app:

1. `monthly`
2. `yearly`

For each product:

- set a clear display name;
- add App Review screenshot/content as required;
- complete pricing;
- complete localization;
- mark the subscription ready for review.

## RevenueCat

In RevenueCat:

- add both App Store products (`monthly` and `yearly`);
- ensure both products are attached to the `default` offering;
- ensure the `TadLock Pro` entitlement is granted by both products.

## Before Submission

- confirm the submitted iOS build is attached to both subscriptions in App Store Connect;
- confirm both products appear in RevenueCat offering `default`;
- confirm restore purchases works with a real iOS build;
- confirm the reviewer account has an active entitlement or can purchase successfully during review.
