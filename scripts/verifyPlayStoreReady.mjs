import fs from 'fs';
import path from 'path';

function assert(condition, msg) {
  if (!condition) {
    throw new Error(`[PLAY STORE AUDIT FAILED] ${msg}`);
  }
  console.log(`✓ ${msg}`);
}

function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) {
      throw new Error(`${filePath} is not a valid PNG file`);
    }
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, bytes: buf.length };
}

console.log('=== GOOGLE PLAY STORE & END-TO-END PWA/TWA READINESS AUDIT ===\n');

const distDir = path.resolve(process.cwd(), 'dist');
assert(fs.existsSync(distDir), 'Production dist/ directory exists');

// 1. Core Built Files
console.log('[1. Production Build & Service Worker Artifacts]');
const requiredDistFiles = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'privacy.html',
  'terms.html',
  '.well-known/assetlinks.json',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'maskable-icon-512x512.png',
  'apple-touch-icon.png',
  'screenshot-mobile-1.png',
  'screenshot-mobile-2.png',
  'play-store-feature-graphic.png',
];

for (const rel of requiredDistFiles) {
  const full = path.join(distDir, rel);
  assert(fs.existsSync(full), `dist/${rel} exists (${fs.statSync(full).size} bytes)`);
}

// 2. Binary PNG IHDR Header & Dimension Verification
console.log('\n[2. Binary PNG IHDR Header & Pixel Dimension Verification]');
const icon192 = readPngDimensions(path.join(distDir, 'pwa-192x192.png'));
assert(
  icon192.width === 192 && icon192.height === 192 && icon192.bytes > 500,
  `pwa-192x192.png is valid 192x192 RGBA PNG (${icon192.bytes} bytes)`
);

const icon512 = readPngDimensions(path.join(distDir, 'pwa-512x512.png'));
assert(
  icon512.width === 512 && icon512.height === 512 && icon512.bytes > 1000,
  `pwa-512x512.png is valid 512x512 RGBA PNG (${icon512.bytes} bytes)`
);

const maskable512 = readPngDimensions(path.join(distDir, 'maskable-icon-512x512.png'));
assert(
  maskable512.width === 512 && maskable512.height === 512 && maskable512.bytes > 1000,
  `maskable-icon-512x512.png is valid 512x512 Adaptive Maskable PNG (${maskable512.bytes} bytes)`
);

const apple180 = readPngDimensions(path.join(distDir, 'apple-touch-icon.png'));
assert(
  apple180.width === 180 && apple180.height === 180,
  `apple-touch-icon.png is valid 180x180 PNG (${apple180.bytes} bytes)`
);

const screen1 = readPngDimensions(path.join(distDir, 'screenshot-mobile-1.png'));
assert(
  screen1.width === 540 && screen1.height === 960,
  `screenshot-mobile-1.png is valid 540x960 9:16 mobile screenshot (${screen1.bytes} bytes)`
);

const featureGraphic = readPngDimensions(path.join(distDir, 'play-store-feature-graphic.png'));
assert(
  featureGraphic.width === 1024 && featureGraphic.height === 500,
  `play-store-feature-graphic.png is valid 1024x500 Google Play Store feature graphic (${featureGraphic.bytes} bytes)`
);

// 3. Web App Manifest Specification
console.log('\n[3. Web App Manifest (Chrome Richer Install UI & Play Store TWA)]');
const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.webmanifest'), 'utf8'));
assert(manifest.short_name === 'Treise', `short_name is "Treise" (<= 12 chars)`);
assert(manifest.display === 'standalone', `display mode is "standalone"`);
assert(manifest.theme_color === '#060709', `theme_color matches Obsidian #060709`);
assert(manifest.background_color === '#060709', `background_color matches Obsidian #060709`);
assert(
  manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any'),
  'Has dedicated 192x192 purpose="any" icon'
);
assert(
  manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'),
  'Has dedicated 512x512 purpose="any" icon'
);
assert(
  manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'),
  'Has dedicated 512x512 purpose="maskable" adaptive icon'
);
assert(
  Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2,
  `Includes ${manifest.screenshots.length} Rich Install UI screenshots`
);
assert(
  Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3,
  `Includes ${manifest.shortcuts.length} Android Home Screen App Shortcuts`
);

// 4. Digital Asset Links & Bubblewrap TWA Manifest
console.log('\n[4. Android Trusted Web Activity (TWA) & Digital Asset Links]');
const assetLinks = JSON.parse(
  fs.readFileSync(path.join(distDir, '.well-known/assetlinks.json'), 'utf8')
);
assert(
  assetLinks.some(al => al?.target?.package_name === 'com.headstrong.app'),
  'assetlinks.json binds package_name "com.headstrong.app"'
);
assert(
  assetLinks[0]?.relation?.includes('delegate_permission/common.handle_all_urls'),
  'assetlinks.json grants delegate_permission/common.handle_all_urls'
);
assert(
  assetLinks.some(
    (al) => al?.target?.package_name === 'com.headstrong.app' && al?.relation?.includes('delegate_permission/common.use_as_origin')
  ),
  'assetlinks.json grants delegate_permission/common.use_as_origin (Health Connect message channel)'
);
const headstrongAssetLink = assetLinks.find((al) => al?.target?.package_name === 'com.headstrong.app');
assert(
  headstrongAssetLink?.target?.sha256_cert_fingerprints?.includes(
    '96:C5:04:2F:F2:B6:0C:85:4B:38:91:86:E0:47:96:8D:95:96:86:16:25:C4:8E:1C:9A:51:42:FA:10:93:99:BD'
  ) &&
    headstrongAssetLink?.target?.sha256_cert_fingerprints?.includes(
      '85:EC:5C:62:89:E8:6C:14:77:8A:34:C0:A4:76:1A:7A:AE:68:9E:49:91:99:07:05:98:B1:43:AF:7A:6D:EC:D5'
    ) &&
    headstrongAssetLink?.target?.sha256_cert_fingerprints?.includes(
      'CD:A0:FA:8B:DE:45:50:1E:A7:BF:E4:C6:9C:B5:F8:F5:A2:81:5E:84:02:D1:C1:BA:57:83:DA:8E:BF:64:55:30'
    ),
  'assetlinks.json includes both Google Play Console App Signing SHA-256 and Upload Key SHA-256 fingerprints'
);
const androidStringsXml = fs.readFileSync(
  path.resolve(process.cwd(), 'app/src/main/res/values/strings.xml'),
  'utf8'
);
assert(
  androidStringsXml.includes('delegate_permission/common.handle_all_urls') &&
    androidStringsXml.includes('delegate_permission/common.use_as_origin'),
  'Android strings.xml assetStatements declares both handle_all_urls and use_as_origin'
);
const androidManifest = fs.readFileSync(path.resolve(process.cwd(), 'app/src/main/AndroidManifest.xml'), 'utf8');
assert(
  androidManifest.includes('android.permission.health.READ_EXERCISE') &&
    androidManifest.includes('android.permission.health.READ_STEPS') &&
    androidManifest.includes('ACTION_SHOW_PERMISSIONS_RATIONALE') &&
    androidManifest.includes('VIEW_PERMISSION_USAGE') &&
    androidManifest.includes('androidx.browser.customtabs.PostMessageService') &&
    !/android\.permission\.health\.(WRITE|READ_(?!(EXERCISE|STEPS)"))/.test(androidManifest),
  'Android app asks only for READ_EXERCISE and READ_STEPS and has the Health Connect privacy screens'
);
assert(
  /BLUETOOTH_SCAN"\s+android:usesPermissionFlags="neverForLocation"/.test(androidManifest) &&
    /ACCESS_FINE_LOCATION"\s+android:maxSdkVersion="30"/.test(androidManifest) &&
    !androidManifest.includes('ACCESS_BACKGROUND_LOCATION'),
  'Scale Bluetooth never asks for location on Android 12+ and never for background location'
);
const appGradle = fs.readFileSync(path.resolve(process.cwd(), 'app/build.gradle'), 'utf8');
assert(!/storePassword\s+"[^"]+"|keyPassword\s+"[^"]+"/.test(appGradle), 'No signing passwords written in app/build.gradle');

const twaManifest = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'twa-manifest.json'), 'utf8')
);
assert(
  twaManifest.targetSdkVersion >= 36,
  `twa-manifest.json targets Android 16 (targetSdkVersion: ${twaManifest.targetSdkVersion} >= 36)`
);
assert(
  twaManifest.packageId === 'com.headstrong.app',
  `twa-manifest.json packageId is "com.headstrong.app"`
);
const gradleVersionCode = Number((appGradle.match(/versionCode\s+(\d+)/) || [])[1]);
const gradleVersionName = (appGradle.match(/versionName\s+"([^"]+)"/) || [])[1];
assert(
  gradleVersionCode === twaManifest.appVersionCode &&
    gradleVersionName === twaManifest.appVersionName &&
    gradleVersionCode >= 16,
  `app/build.gradle and twa-manifest.json version match (${gradleVersionName}, versionCode ${gradleVersionCode})`
);
const shortcutsXml = fs.readFileSync(
  path.resolve(process.cwd(), 'app/src/main/res/xml/shortcuts.xml'),
  'utf8'
);
assert(
  shortcutsXml.includes('https://treise.vercel.app/?tab=train') &&
    shortcutsXml.includes('https://treise.vercel.app/?tab=program&amp;action=watch-sync') &&
    shortcutsXml.includes('https://treise.vercel.app/?tab=analytics&amp;action=log-weight'),
  'Android shortcuts.xml uses full https://treise.vercel.app URLs for all 3 launcher shortcuts'
);
const aabPath = path.resolve(process.cwd(), 'app-release-bundle.aab');
const apkPath = path.resolve(process.cwd(), 'app-release-signed.apk');
assert(
  fs.existsSync(aabPath) && fs.statSync(aabPath).size > 500_000,
  `Signed Play Store bundle app-release-bundle.aab exists (${fs.existsSync(aabPath) ? fs.statSync(aabPath).size : 0} bytes)`
);
assert(
  fs.existsSync(apkPath) && fs.statSync(apkPath).size > 500_000,
  `Signed release APK app-release-signed.apk exists (${fs.existsSync(apkPath) ? fs.statSync(apkPath).size : 0} bytes)`
);

// 5. Google Play Policy & Accessibility Checks
console.log('\n[5. Google Play User Data Policy, Health Disclaimer & WCAG Checks]');
const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assert(
  !indexHtml.includes('user-scalable=no'),
  'index.html allows pinch-to-zoom (passes WCAG 1.4.4 & Lighthouse Accessibility)'
);
assert(
  indexHtml.includes('name="description"'),
  'index.html includes meta description tag'
);

const privacyHtml = fs.readFileSync(path.join(distDir, 'privacy.html'), 'utf8');
const privacySubdirHtml = fs.readFileSync(path.join(distDir, 'privacy/index.html'), 'utf8');
assert(
  privacyHtml.includes('Google Play Data Safety') &&
    privacyHtml.includes('Delete All Data') &&
    privacyHtml.includes('Non-Medical Fitness Disclaimer'),
  'privacy.html contains Data Safety summary, Data Deletion instructions, and Non-Medical Fitness Disclaimer'
);
assert(
  privacyHtml === privacySubdirHtml,
  'privacy/index.html is in exact sync with privacy.html'
);
const termsHtml = fs.readFileSync(path.join(distDir, 'terms.html'), 'utf8');
const termsSubdirHtml = fs.readFileSync(path.join(distDir, 'terms/index.html'), 'utf8');
assert(
  termsHtml === termsSubdirHtml,
  'terms/index.html is in exact sync with terms.html'
);

console.log('\nALL GOOGLE PLAY STORE & TWA READINESS CHECKS PASSED! 🚀');
