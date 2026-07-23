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

## Build locally (no EAS)

EAS is optional — Play only cares about a signed `.aab`. You can build one on your
machine with no build quota. Requires JDK 21 and the Android SDK (platform + build-tools
for the Expo SDK's `compileSdk`; SDK 57 → android-36).

### Upload keystore (one-time)

The `android/` folder is generated (CNG) and gitignored, so signing lives in a config
plugin (`apps/mobile/plugins/withReleaseSigning.js`) that re-injects it on every prebuild.
Secrets stay **out of the repo** — the plugin reads them from Gradle properties.

1. Generate the *upload* keystore once (kept outside the repo):

   ```bash
   keytool -genkeypair -v -keystore ~/keystores/kept-upload.jks \
     -alias kept-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Put the credentials in `~/.gradle/gradle.properties` (global, never committed):

   ```properties
   KEPT_UPLOAD_STORE_FILE=/home/<you>/keystores/kept-upload.jks
   KEPT_UPLOAD_STORE_PASSWORD=...
   KEPT_UPLOAD_KEY_ALIAS=kept-upload
   KEPT_UPLOAD_KEY_PASSWORD=...
   ```

> **Back up the `.jks` and its password** (password manager + offline copy). This is the
> *upload* key; if lost you can request an upload-key reset from Google, but the keystore
> and password are the only way to keep signing new uploads yourself. Never commit either.

### Build

```bash
cd apps/mobile
export ANDROID_HOME=$HOME/Android/Sdk
npx expo prebuild --platform android --clean
cd android && ./gradlew :app:bundleRelease --no-daemon
# → android/app/build/outputs/bundle/release/app-release.aab
```

`versionCode`/`versionName` come from `app.json`; bump them manually per release. Upload
the `.aab` in the Console (first upload is manual either way — see below).

### Verify before uploading

```bash
BT=bundletool.jar   # com.android.tools.build:bundletool
AAB=android/app/build/outputs/bundle/release/app-release.aab
java -jar $BT dump manifest --bundle $AAB --xpath /manifest/@package                 # com.srjn45.kept
java -jar $BT dump manifest --bundle $AAB --xpath /manifest/uses-permission/@android:name  # no INTERNET/storage
unzip -p $AAB META-INF/*.RSA | keytool -printcert | grep SHA256   # matches your upload key
```

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
