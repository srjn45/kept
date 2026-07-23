# Releasing Kept

How to cut a new public release. As of `.github/workflows/release-mobile.yml`,
pushing a `vX.Y.Z` tag automates the build/download/publish/verify steps — you
only need to bump the version (step 1) and tag it (step 3).

The promotional site's **Download for Android** buttons link to a fixed URL
that GitHub redirects to the newest release:

```
https://github.com/srjn45/kept/releases/latest/download/kept.apk
```

> ⚠️ **The asset MUST be named `kept.apk` on every release.** GitHub's
> `releases/latest/download/<name>` redirect only works if `<name>` is identical
> across releases. A versioned filename (e.g. `expense-manager-1.1.0.apk`) breaks
> the website button. Keep the version in the release **tag/title**, not the file.

Prerequisites and the sideload walkthrough live in
[`doc/android-install.md`](doc/android-install.md).

---

## 1. Bump the version

Set the same version in both files:

- `apps/mobile/app.json` → `expo.version`
- `apps/mobile/package.json` → `version`

Commit on a branch and merge to `main` before building, so the release is cut
from `main`.

## 2. (Only if the icon/branding changed) regenerate the icon set

The app icon is generated from vector sources in `apps/mobile/assets/logo/`:

```bash
node apps/mobile/assets/logo/render.cjs
```

This rewrites `apps/mobile/assets/images/*.png` (icon, adaptive
foreground/background/monochrome, splash, favicon) and the website images under
`docs/assets/`. Commit those too. Skip this step for a normal release.

## 3. Tag and push

Once the version bump (and any icon regen) is merged to `main`:

```bash
git tag v1.1.0
git push origin v1.1.0
```

Pushing the tag triggers `.github/workflows/release-mobile.yml`, which:

1. Runs the same lint/typecheck/test/format checks as Mobile CI (`verify` job)
   — the release is aborted if these fail.
2. Confirms the tag (`v1.1.0`) matches `apps/mobile/app.json`'s `expo.version`
   — aborts with a clear error if you forgot to bump it.
3. Builds the Android APK on EAS (`preview` profile, reuses the EAS-managed
   keystore, so updates install in place without wiping data).
4. Downloads the finished build's artifact and publishes it as a GitHub
   Release (`gh release create ... --generate-notes`), attached as the fixed
   `kept.apk` name.
5. Verifies the public download redirect resolves.

Watch it at `https://github.com/srjn45/kept/actions`. Requires an
`EXPO_TOKEN` repo secret (`npx eas-cli token:create`, then
`gh secret set EXPO_TOKEN`) — without it, the EAS build step fails auth.

### Manual fallback

If the workflow is unavailable or you need to cut a release by hand:

```bash
cd apps/mobile
npx eas-cli@latest build --platform android --profile preview

# newest finished Android build's APK url
URL=$(npx eas-cli@latest build:list --platform android --limit 1 --non-interactive --json \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['artifacts']['applicationArchiveUrl'])")
curl -sL "$URL" -o kept.apk

gh release create v1.1.0 ./kept.apk#kept.apk \
  --repo srjn45/kept \
  --target main \
  --title "Kept v1.1.0" \
  --generate-notes
```

The `#kept.apk` suffix sets the uploaded asset's display name — keep
it constant even if your local file is named differently.

## 4. Verify

```bash
curl -sL -o /dev/null -w '%{http_code} %{content_type}\n' \
  https://github.com/srjn45/kept/releases/latest/download/kept.apk
# expect: 200 application/vnd.android.package-archive
```

The website updates automatically — its button points at the redirect above, so
there's no site change to deploy for a new release.

---

## iOS / Play Store

Out of scope for now (no Apple Developer account; Play Store submission not
wired up). See `doc/android-install.md` → *Out of scope (future)* and the master
plan §8.
