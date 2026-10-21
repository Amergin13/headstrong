# Treise — Google Play Store & Android TWA Release Runbook

This guide outlines the exact end-to-end engineering, cryptographic signing, and Google Play Console compliance procedures required to publish **Treise** (`com.treise.app`) as a native Android App Bundle (`.aab`) using Google's official **Bubblewrap / Trusted Web Activity (TWA)** pipeline.

---

## 1. Automated Pre-Flight Verification

Before building the Android App Bundle or deploying a web release, run the full verification pipeline:

```bash
npm run verify:all
```

This command executes three mandatory gates:
1. **`npm run test:engine`** ([`src/engine/__tests__/verifyEngine.ts`](src/engine/__tests__/verifyEngine.ts)): Runs 77 unit and end-to-end assertions across all exercise science formulas, OOUX cross-implement progression, 7-day bodyweight EMA, DOTS polynomial, 6-pillar international standards, Readiness Z-score, WCI, Vitality 7th pillar, Israetel/Schoenfeld hypertrophy landmarks, and full data export/erase/restore lifecycle.
2. **`npm run build`**: Runs strict TypeScript compilation (`tsc -b`), Vite production bundling with vendor code-splitting, and `vite-plugin-pwa` Workbox service worker generation (`dist/sw.js` + `dist/manifest.webmanifest`).
3. **`npm run verify:playstore`** ([`scripts/verifyPlayStoreReady.mjs`](scripts/verifyPlayStoreReady.mjs)): Inspects binary PNG `IHDR` headers (`192x192`, `512x512`, `maskable 512x512`, `180x180`, `540x960` screenshots, `1024x500` feature graphic), validates `dist/manifest.webmanifest` against Chrome WebAPK & Bubblewrap requirements, validates `dist/.well-known/assetlinks.json` and `twa-manifest.json` (`targetSdkVersion: 35`), and audits Google Play User Data Policy & Health Apps compliance.

> **Regenerating Binary Graphics:** If you ever need to regenerate the Play Store icons, maskable icons, screenshots, or feature graphic from source, run:
> ```bash
> npm run generate:assets
> ```

---

## 2. Production HTTPS Deployment

Trusted Web Activities require the web app and `/.well-known/assetlinks.json` to be served over HTTPS with valid TLS certificates.

1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Deploy the `dist/` directory to your production host (e.g., Vercel) at your canonical domain (configured as `https://treise.vercel.app` in [`twa-manifest.json`](twa-manifest.json)).
3. Verify the following endpoints return `HTTP 200 OK` over HTTPS:
   - `https://treise.vercel.app/manifest.webmanifest`
   - `https://treise.vercel.app/.well-known/assetlinks.json`
   - `https://treise.vercel.app/privacy.html`
   - `https://treise.vercel.app/terms.html`

---

## 3. Building the Signed Android App Bundle (`.aab`) via Bubblewrap

### 3.1 Install Bubblewrap CLI
Requires Node.js 18+ and Java Development Kit (JDK 17) + Android SDK command-line tools (Bubblewrap will offer to download JDK and Android SDK automatically on first run):

```bash
npm install -g @bubblewrap/cli
```

### 3.2 Generate Your Upload Keystore (First Time Only)
Generate an Android upload keystore in the project root (keep `android.keystore` out of version control):

```bash
keytool -genkeypair -v \
  -keystore android.keystore \
  -alias headstrong-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### 3.3 Build the `.aab` & `.apk`
Using the repository's pre-configured [`twa-manifest.json`](twa-manifest.json):

```bash
bubblewrap build
```

This produces:
- **`app-release-bundle.aab`**: Upload this file directly to Google Play Console (Production / Closed Testing / Internal Testing track).
- **`app-release-signed.apk`**: Install directly onto a physical Pixel / Android device via `adb install app-release-signed.apk` for local hardware testing.

---

## 4. Configuring Digital Asset Links (`assetlinks.json`)

For Chrome on Android to hide the URL address bar and render Treise in full-screen standalone mode (`#060709` status & navigation bars), the SHA-256 certificate fingerprint in [`public/.well-known/assetlinks.json`](public/.well-known/assetlinks.json) **must** match Google Play App Signing.

1. In **Google Play Console**, navigate to **Test and release > Setup > App signing**.
2. Copy the **SHA-256 certificate fingerprint** under **App signing key certificate** (and optionally your **Upload key certificate** for local APK testing).
3. Add both SHA-256 fingerprints to [`public/.well-known/assetlinks.json`](public/.well-known/assetlinks.json):
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.treise.app",
         "sha256_cert_fingerprints": [
           "YOUR_PLAY_APP_SIGNING_SHA256_FINGERPRINT",
           "YOUR_LOCAL_UPLOAD_KEY_SHA256_FINGERPRINT"
         ]
       }
     }
   ]
   ```
4. Re-run `npm run build` and redeploy `dist/`.
5. Verify verification on a connected Android device:
   ```bash
   adb shell pm get-app-links com.treise.app
   ```

---

## 5. Google Play Console Policy Declarations Cheat Sheet

### 5.1 Privacy Policy URL
- **URL:** `https://treise.vercel.app/privacy.html` (bundled in [`public/privacy.html`](public/privacy.html) and accessible offline inside the app under **Program > Data Safety, Privacy & Legal**).

### 5.2 Data Safety Section Answers
- **Does your app collect or share any of the required user data types?**
  - **No** (All workout logs, bodyweight history, and OAuth tokens are stored exclusively on-device in local browser storage (`localStorage` / `sessionStorage`). No developer backend servers collect or receive user data).
- **Is all of the user data collected by your app encrypted in transit?**
  - **Yes** (Optional direct browser-to-Fitbit Web API requests use HTTPS TLS 1.3 and OAuth 2.0 PKCE).
- **Do you provide a way for users to request that their data is deleted?**
  - **Yes** (Users can permanently erase all local data & revoke Fitbit tokens anytime inside **Program > Data Safety, Privacy & Legal > Delete All Data**).

### 5.3 Health Apps Declaration
- **Categories to select:**
  - [x] *Activity and Fitness* (Strength training log, estimated 1RM, volume landmarks, readiness score).
- **Categories NOT selected (Medical Exclusion):**
  - [ ] Do **not** select *Medical Device*, *Clinical Decision Support*, or *Disease Diagnosis/Treatment*. Treise includes an explicit Non-Medical & Exercise Safety Disclaimer in both [`public/privacy.html`](public/privacy.html) and the **Program** tab.

### 5.4 Store Listing Graphic Assets (Pre-Generated in `public/`)
| Asset Type | File Path | Dimensions | Format |
| :--- | :--- | :---: | :---: |
| **App Icon (Play Store)** | [`public/pwa-512x512.png`](public/pwa-512x512.png) | `512 × 512 px` | 32-bit RGBA PNG |
| **Adaptive / Maskable Icon** | [`public/maskable-icon-512x512.png`](public/maskable-icon-512x512.png) | `512 × 512 px` | 32-bit RGBA PNG |
| **PWA Standard Icon** | [`public/pwa-192x192.png`](public/pwa-192x192.png) | `192 × 192 px` | 32-bit RGBA PNG |
| **Feature Graphic** | [`public/play-store-feature-graphic.png`](public/play-store-feature-graphic.png) | `1024 × 500 px` | 32-bit RGBA PNG |
| **Phone Screenshot 1** | [`public/screenshot-mobile-1.png`](public/screenshot-mobile-1.png) | `540 × 960 px` (9:16) | 32-bit RGBA PNG |
| **Phone Screenshot 2** | [`public/screenshot-mobile-2.png`](public/screenshot-mobile-2.png) | `540 × 960 px` (9:16) | 32-bit RGBA PNG |
