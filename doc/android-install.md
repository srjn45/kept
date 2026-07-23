# Android install (EAS Build → sideload)

How to produce an installable Android build of Kept and put it on a
real device. This is the **Phase 8** delivery path from the
[master plan](master-plan.md) §8: a LAN/sideloaded APK, not a Play Store
release.

> **Data stays on your device.** Kept is local-first (on-device
> SQLite, PIN lock, no backend). Building and sideloading changes nothing about
> that — the APK ships no analytics or network calls.

---

## Prerequisites

- An [Expo / EAS](https://expo.dev) account, logged in on the machine that
  triggers the build:
  ```bash
  cd apps/mobile
  npx eas-cli@latest whoami   # should print your account, e.g. srjn45
  # if not logged in:
  npx eas-cli@latest login
  ```
- The app is already linked to an EAS project — `apps/mobile/app.json` carries
  `expo.extra.eas.projectId` and `expo.owner`. You do **not** need to re-run
  `eas init`.
- The build config lives in [`apps/mobile/eas.json`](../apps/mobile/eas.json).
  The **`preview`** profile is the one to use for sideloading: it builds an
  **APK** (`android.buildType: "apk"`) with `distribution: "internal"`, so EAS
  hands you a directly-installable file rather than a Play-Store `.aab`.

---

## 1. Trigger a build

From `apps/mobile`:

```bash
npx eas-cli@latest build --platform android --profile preview
```

- First run only: EAS will offer to generate a new Android **Keystore** for you
  (answer yes). It is stored server-side under your EAS account and reused for
  every later build — you don't manage it by hand, and it never touches this
  repo.
- The build runs in Expo's cloud and typically takes **10–20 minutes**.
- Add `--non-interactive --wait` to script it in CI-like flows (blocks until the
  build finishes); drop `--wait` to return immediately and check status later.

When it finishes, the CLI prints:

- a **build details page** URL on `expo.dev`
  (`https://expo.dev/accounts/<owner>/projects/expense-manager/builds/<id>`), and
- a direct **APK download** link, plus a **QR code** you can scan straight from
  an Android phone.

You can always find past builds later on the project's
**Builds** page: <https://expo.dev/accounts/srjn45/projects/expense-manager/builds>
(build download links are regenerated there; they are ephemeral, so fetch a
fresh one from the build page rather than reusing an old URL).

---

## 2. Get the APK onto the phone

Pick whichever is convenient:

- **QR code / link (easiest):** on the Android device, open the build details
  page or scan the QR code the CLI printed, then tap the download link. The
  phone's browser downloads the `.apk`.
- **Download on a computer, transfer over LAN:** download the `.apk` from the
  build page, then move it to the phone via USB, `adb push`, a shared folder, or
  any file-transfer app on the same network.
- **adb (developer machine):**
  ```bash
  adb install path/to/kept.apk
  ```
  `adb install` skips the manual steps below entirely.

---

## 3. Sideload (install from unknown sources)

Android blocks installing APKs from outside the Play Store until you allow it
**for the specific app doing the install** (your browser or file manager):

1. Open the downloaded `.apk` (from the browser's Downloads, or a file
   manager).
2. Android will warn that this source isn't allowed to install apps. Tap
   **Settings** on that prompt → enable **Allow from this source** (a.k.a.
   "Install unknown apps") for that browser / file app.
   - Manual path: **Settings → Apps → Special app access → Install unknown
     apps** → pick the app → toggle **Allow**.
3. Go back and tap **Install**.
4. Open **Kept**. On first launch it asks you to **create a PIN** —
   that's the local lock; there is no account or sign-in.

You can turn "Allow from this source" back off afterwards if you prefer; it's
only needed at install time.

---

## Updating

Installing a newer APK over an existing one upgrades in place and keeps your
data, **as long as the signing keystore is the same** — which it is, because EAS
reuses the keystore it generated for your account. (Switching to a
locally/differently-signed APK would force an uninstall first, wiping the local
database — so **export a JSON backup from Settings first** if you ever change
signing.)

---

## Out of scope (future)

- **iOS / TestFlight / App Store** — needs an Apple Developer account; not set up
  yet (master plan §8, accepted risk). No `ios.bundleIdentifier` or iOS build
  profile is configured.
- **Play Store submission** — the `production` profile in `eas.json` builds a
  release artifact, but store listing/submission (`eas submit`) is not wired up.
