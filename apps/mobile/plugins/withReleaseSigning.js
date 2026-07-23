// Expo config plugin: wire the Android release build to our Play *upload* keystore.
//
// The android/ folder is generated (CNG) and gitignored, so signing config can't
// live there durably. This plugin re-injects it on every `expo prebuild`.
//
// Secrets are NOT stored here or anywhere in the repo. They come from Gradle
// properties (put them in ~/.gradle/gradle.properties, outside the repo):
//   KEPT_UPLOAD_STORE_FILE=/abs/path/to/kept-upload.jks
//   KEPT_UPLOAD_STORE_PASSWORD=...
//   KEPT_UPLOAD_KEY_ALIAS=kept-upload
//   KEPT_UPLOAD_KEY_PASSWORD=...
//
// When those properties are absent (e.g. a fresh clone with no key), the release
// build falls back to debug signing exactly like the stock Expo template, so
// `prebuild` and debug builds keep working for anyone.

const { withAppBuildGradle } = require('@expo/config-plugins')

const MARKER = 'KEPT_UPLOAD_STORE_FILE'

const RELEASE_SIGNING_CONFIG = `        release {
            if (project.hasProperty('KEPT_UPLOAD_STORE_FILE')) {
                storeFile file(project.property('KEPT_UPLOAD_STORE_FILE'))
                storePassword project.property('KEPT_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('KEPT_UPLOAD_KEY_ALIAS')
                keyPassword project.property('KEPT_UPLOAD_KEY_PASSWORD')
            }
        }`

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy build.gradle')
    }
    let gradle = config.modResults.contents

    if (gradle.includes(MARKER)) {
      return config // already patched (idempotent)
    }

    // 1. Add a `release` signingConfig right after the existing `debug` one.
    const beforeSigning = gradle
    gradle = gradle.replace(
      /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\}\s*)\}/,
      `$1${RELEASE_SIGNING_CONFIG}\n    }`
    )
    if (gradle === beforeSigning) {
      throw new Error(
        'withReleaseSigning: could not find signingConfigs { debug { ... } } to extend'
      )
    }

    // 2. Point the release buildType at signingConfigs.release when the key exists,
    //    otherwise keep debug signing (stock fallback).
    const beforeBuildTypes = gradle
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig project.hasProperty('KEPT_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
    )
    if (gradle === beforeBuildTypes) {
      throw new Error(
        'withReleaseSigning: could not find release buildType signingConfig to redirect'
      )
    }

    config.modResults.contents = gradle
    return config
  })
}
