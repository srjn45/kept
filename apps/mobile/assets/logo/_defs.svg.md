# Kept logo — vector source

Editable source of truth for the app icon set. Edit these SVGs, then
regenerate the PNGs with:

```bash
node apps/mobile/assets/logo/render.cjs
```

## The mark

An upward **chevron** — reads as growth / a rising chart / the app's roofline.
Two geometries are used:

- **`icon`** (primary, full-bleed — the OS applies a gentle squircle mask):
  apex `(512,384)`, feet `(300,632)` & `(724,632)`, stroke `132`.
- **`safe`** (Android adaptive foreground / monochrome — must survive a circular
  crop): apex `(512,394)`, feet `(322,618)` & `(702,618)`, stroke `120`. Content
  stays inside the central ~62% safe zone.

## Brand colors

- Gradient `#3A9BF5 → #208AEF → #1370CC` (brand blue `#208AEF`).
- Chevron `#FFFFFF → #D6E9FF` (with a soft shadow for depth on the primary icon).
- Faint blueprint grid + tick marks echo the original identity.

## Files

| SVG                   | Renders to                                               | Notes                      |
| --------------------- | -------------------------------------------------------- | -------------------------- |
| `logo-icon.svg`       | `images/icon.png`, `images/favicon.png`, `docs/assets/*` | primary, opaque            |
| `logo-background.svg` | `images/android-icon-background.png`                     | gradient only              |
| `logo-foreground.svg` | `images/android-icon-foreground.png`                     | chevron, transparent       |
| `logo-monochrome.svg` | `images/android-icon-monochrome.png`                     | flat white, transparent    |
| `logo-splash.svg`     | `images/splash-icon.png`                                 | white chevron, transparent |
