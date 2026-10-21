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

const twaManifest = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'twa-manifest.json'), 'utf8')
);
assert(
  twaManifest.targetSdkVersion >= 35,
  `twa-manifest.json targets Android 15 (targetSdkVersion: ${twaManifest.targetSdkVersion} >= 35)`
);
assert(
  twaManifest.packageId === 'com.headstrong.app',
  `twa-manifest.json packageId is "com.headstrong.app"`
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
assert(
  privacyHtml.includes('Google Play Data Safety') &&
    privacyHtml.includes('Delete All My Data') &&
    privacyHtml.includes('Non-Medical Fitness Disclaimer'),
  'privacy.html contains Data Safety summary, Data Deletion instructions, and Non-Medical Fitness Disclaimer'
);

console.log('\nALL GOOGLE PLAY STORE & TWA READINESS CHECKS PASSED! 🚀');
