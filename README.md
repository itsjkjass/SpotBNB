# SpotBnB

A parking-spot marketplace app: sellers list a parking spot, buyers search a map and book/pay for it.
Built with React Native (Expo) + Firebase + Stripe Connect, targeting Google Play (Android first).

## Stack

- **App**: React Native (Expo SDK 57, TypeScript), React Navigation (bottom tabs + stacks)
- **Backend**: Firebase (Auth, Firestore, Storage, Cloud Functions v2, Cloud Scheduler)
- **Payments**: Stripe Connect (Express accounts) — destination charges with an application fee, so
  SpotBnB takes a cut (12% by default, `functions/src/config.ts`) and the seller gets the rest paid
  out directly by Stripe.
- **Maps**: Google Maps Platform (Maps SDK for Android/iOS, Geocoding API)
- **Push**: Expo push notifications (Firestore triggers call the Expo push API)

## Project layout

```
App.tsx                  Root component: StripeProvider + AuthProvider + navigation
app.config.ts            Expo config (reads env vars for Maps key, Stripe merchant id, EAS project id)
src/
  screens/                Auth, Search (map), SpotDetail, CreateListing, MyListings, Bookings, Profile
  navigation/              Stack/tab navigators
  services/                Firebase, auth, spots, bookings, reviews, Stripe Connect client calls
  hooks/                   useAuth (auth/profile context), usePushNotifications
  types/models.ts          Shared TypeScript types (User, ParkingSpot, Booking, Review)
functions/                 Firebase Cloud Functions (TypeScript)
  src/callable/            createBooking, cancelBooking, Stripe Connect onboarding
  src/http/stripeWebhook.ts Confirms/cancels bookings from Stripe payment events
  src/triggers/            Push notifications on booking create/status change
  src/scheduled/           Marks bookings "completed" once their end time passes
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
eas.json                  Android build profiles (dev/preview/production) for EAS Build
```

All booking pricing, availability checks, and Stripe charges happen **server-side** in Cloud
Functions — the client only ever calls `createBooking`/`cancelBooking`, so buyers/sellers can't
manipulate price or double-book a spot.

## What you need to provide (accounts & keys)

Copy `.env.example` to `.env` and fill these in as you create each account:

| # | What | Where to get it | Goes in |
|---|------|------------------|---------|
| 1 | Firebase project | [Firebase console](https://console.firebase.google.com) → Add project. Enable **Authentication** (Email/Password), **Firestore**, **Storage**, and upgrade to the **Blaze** (pay-as-you-go) plan — required for Cloud Functions to call external APIs like Stripe. | `EXPO_PUBLIC_FIREBASE_*` (Project settings → General → Your apps → Web app) |
| 2 | Google Maps Platform API key | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials. Enable **Maps SDK for Android**, **Maps SDK for iOS**, and **Geocoding API** on the same GCP project as your Firebase project. | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` |
| 3 | Stripe account | [Stripe dashboard](https://dashboard.stripe.com) → enable **Connect** (Settings → Connect → get started, choose Express accounts). Use test keys first. | `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (client) + secret key (Cloud Functions only, see below) |
| 4 | Stripe webhook | After deploying functions once, take the `stripeWebhook` function URL and add it as an endpoint in Stripe dashboard → Developers → Webhooks, listening for `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`. | Webhook signing secret → Cloud Functions secret (see below) |
| 5 | Expo/EAS account | [expo.dev](https://expo.dev) → free account, then `eas init` in this repo. | `EXPO_PUBLIC_EAS_PROJECT_ID` |
| 6 | Google Play Console account | [play.google.com/console](https://play.google.com/console) — one-time $25 registration fee. Needed to create the app listing and upload builds. | Used later for `eas submit`, not an env var |
| 7 | Play Store service account (for automated submission, optional) | Play Console → Setup → API access → create a service account in Google Cloud, grant it "Release manager" access. | `play-store-service-account.json` (gitignored, referenced by `eas.json`) |

Secrets that must **never** go in `.env` (client-bundled) — set these as Firebase Functions secrets instead:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

## Local setup

```bash
npm install
cp .env.example .env   # fill in the values from the table above
npx expo start
```

The Android package name is `com.spotbnb.app` (set in `app.config.ts`) — change it there if you want a different one before your first Play Store upload, since it can't be changed later.

## Deploying the backend

```bash
firebase login
firebase use --add          # select/create your Firebase project
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

## Building for Google Play

```bash
npm install -g eas-cli
eas login
eas init                              # links this project to your Expo account, fills EXPO_PUBLIC_EAS_PROJECT_ID
eas build --platform android --profile production   # produces a .aab
eas submit --platform android --profile production  # uploads it to Play Console (needs step 7 above)
```

Before your first submission, in Play Console you'll also need: app icon (512x512), feature graphic (1024x500), at least 2 phone screenshots, a short/full description, a content rating questionnaire, and a **privacy policy URL** (required because the app accesses location, camera, and processes payments).

## Notes / things to decide as you go

- Platform fee percentage lives in `functions/src/config.ts` (`PLATFORM_FEE_PERCENT`).
- Currency is hardcoded to CAD throughout (`currency: "cad"` in types and Cloud Functions) since this targets the Canadian market.
- Stripe Connect accounts are created as **Express** (Stripe-hosted onboarding, simplest for individual sellers). Switching to **Standard** or **Custom** would need changes in `functions/src/callable/connect.ts`.
- iOS isn't wired up for Play Store obviously, but the same Expo project can build for iOS later (`eas build --platform ios`) once you have an Apple Developer account.
