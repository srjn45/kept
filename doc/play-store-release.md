# Play Store release runbook

How to build and ship a signed Android App Bundle (AAB) to Google Play with EAS.
Assumes the Play Console developer account is verified and the app entry exists.

## One-time setup

### 1. Privacy policy URL

Google requires a hosted privacy policy, even though the app collects nothing.
It lives with the promo site and is published via GitHub Pages:

```
https://srjn45.github.io/kept/privacy.html
```

Paste that into **Play Console → App content → Privacy policy**.

### 2. Google Play service account (for `eas submit`)

`eas submit` uploads builds through the Play Developer API, which needs a service-account key.

1. Play Console → **Setup → API access** → link/create a Google Cloud project.
2. In Google Cloud, create a **service account**, then create a **JSON key** for it.
3. Back in Play Console → **API access**, grant that service account access with at least
   the **Release to testing tracks** / **Release apps to production** permissions.
4. Save the downloaded JSON as `apps/mobile/google-service-account.json`.

> This file is **gitignored** — never commit it. Anyone with it can publish to your listing.

### 3. First upload must be manual

Play won't accept API uploads until at least one AAB has been uploaded by hand and
Play App Signing is enabled. Build the bundle (below), then upload the `.aab` once in
**Play Console → Testing → Internal testing → Create release**, opting into
**Play App Signing** when prompted. After that, `eas submit` works.

## Build

Produce a store-signed AAB (uses the `production` profile in `eas.json`):

```bash
cd apps/mobile
eas build --platform android --profile production
```

`autoIncrement` bumps the Android `versionCode` automatically. Keep `app.json`'s
`expo.version` in sync with `package.json` `version` (the repo enforces this).

## Submit

After the manual first upload, later releases can go straight to Play:

```bash
cd apps/mobile
eas submit --platform android --profile production --latest
```

The `submit.production.android` config targets the **`internal`** track with
`releaseStatus: "draft"` — nothing goes live automatically. Promote the draft in the
Console when ready.

### Track progression

- **internal** — instant, up to 100 testers. Best for smoke-testing the exact AAB. Set as
  the default here.
- **closed** — required for a **new personal developer account**: you must run a closed test
  with **≥12 testers for ≥14 continuous days** before you can apply for production access.
  Change `track` to `"closed"` (and create the closed track + tester list in the Console)
  once you're past internal smoke-testing.
- **production** — public. Change `track` to `"production"` after production access is granted.

## Console checklist (done in the browser, needs the verified account)

- [ ] Privacy policy URL (above)
- [ ] Data safety form — declare **no data collected / no data shared**
- [ ] Content rating (IARC questionnaire)
- [ ] App access (no login required)
- [ ] Ads declaration — **no ads**
- [ ] Target audience & content
- [ ] Store listing — title, short + full description, 512×512 icon, 1024×500 feature
      graphic, ≥2 phone screenshots
- [ ] Pricing & distribution — free, select countries
