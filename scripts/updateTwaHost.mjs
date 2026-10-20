import fs from 'fs';
import path from 'path';

const rawArg = process.argv[2];
if (!rawArg) {
  console.error('Usage: node scripts/updateTwaHost.mjs <hostname>');
  console.error('Example: node scripts/updateTwaHost.mjs headstrong.vercel.app');
  process.exit(1);
}

// Strip protocol and trailing slashes if passed
const host = rawArg.replace(/^https?:\/\//, '').replace(/\/+$/, '');

const twaPath = path.resolve(process.cwd(), 'twa-manifest.json');
if (!fs.existsSync(twaPath)) {
  console.error(`Error: ${twaPath} not found`);
  process.exit(1);
}

const twa = JSON.parse(fs.readFileSync(twaPath, 'utf8'));

console.log(`Updating TWA host from "${twa.host}" to "${host}"...`);

twa.host = host;
twa.iconUrl = `https://${host}/pwa-512x512.png`;
twa.maskableIconUrl = `https://${host}/maskable-icon-512x512.png`;
twa.monochromeIconUrl = `https://${host}/headstrong-icon.svg`;
twa.webManifestUrl = `https://${host}/manifest.webmanifest`;
twa.fullScopeUrl = `https://${host}/`;

if (Array.isArray(twa.shortcuts)) {
  twa.shortcuts = twa.shortcuts.map((sc) => ({
    ...sc,
    chosenIconUrl: `https://${host}/pwa-192x192.png`,
  }));
}

fs.writeFileSync(twaPath, JSON.stringify(twa, null, 2) + '\n', 'utf8');

console.log(`✓ Successfully updated twa-manifest.json for host: https://${host}`);
