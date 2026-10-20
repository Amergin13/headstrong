import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Pure Node.js PNG encoder (zero external binary dependencies)
 * Generates valid 8-bit/color RGBA non-interlaced PNGs with CRC32 & zlib deflate
 */
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type 6 = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const rawScanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    rawScanlines[rowStart] = 0; // Filter type 0 (None)
    rgbaBuffer.copy(rawScanlines, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 6 });

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Renders the Treise brand emblem (Obsidian #060709 background,
 * Phosphor Green #00F59B barbell/pulse crest, Cyan #06B6D4 telemetry ring)
 */
function renderAppIcon(size, isMaskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const safeScale = isMaskable ? 0.76 : 0.92;
  const ringRadius = (size * 0.36) * safeScale;
  const ringThickness = Math.max(2, size * 0.045 * safeScale);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Base Obsidian #060709 with subtle radial emerald/cyan glow
      const glow = Math.max(0, 1 - dist / (size * 0.6));
      let r = Math.round(6 + glow * 8);
      let g = Math.round(7 + glow * 28);
      let b = Math.round(9 + glow * 24);
      let a = 255;

      // Outer Telemetry Ring (Phosphor Green #00F59B -> Cyan #06B6D4 gradient)
      if (Math.abs(dist - ringRadius) <= ringThickness / 2) {
        const t = (x / size + y / size) / 2;
        r = Math.round(0 * (1 - t) + 6 * t);
        g = Math.round(245 * (1 - t) + 182 * t);
        b = Math.round(155 * (1 - t) + 212 * t);
      }

      // Stylized Barbell & Strength Pillar Icon in Center
      const nx = dx / (size * 0.22 * safeScale);
      const ny = dy / (size * 0.22 * safeScale);

      // Horizontal bar
      const isBar = Math.abs(ny) < 0.13 && Math.abs(nx) < 0.85;
      // Left & right inner plates
      const isInnerPlate =
        (Math.abs(nx - 0.55) < 0.12 || Math.abs(nx + 0.55) < 0.12) &&
        Math.abs(ny) < 0.55;
      // Left & right outer plates
      const isOuterPlate =
        (Math.abs(nx - 0.78) < 0.10 || Math.abs(nx + 0.78) < 0.10) &&
        Math.abs(ny) < 0.38;

      if (isBar || isInnerPlate || isOuterPlate) {
        r = 0;
        g = 245;
        b = 155;
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }

  return encodePng(size, size, buf);
}

/**
 * Renders a Play Store / Rich Install UI Screenshot (1080x1920) or Feature Graphic (1024x500)
 */
function renderMarketingGraphic(width, height, variant = 1) {
  const buf = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Obsidian background #060709
      let r = 6;
      let g = 7;
      let b = 9;

      // Top ambient radial glow
      const dx = x - width * 0.5;
      const dy = y - height * 0.28;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const glow = Math.max(0, 1 - dist / (width * 0.65));

      if (variant === 1) {
        r += Math.round(glow * 4);
        g += Math.round(glow * 42);
        b += Math.round(glow * 30);
      } else {
        r += Math.round(glow * 6);
        g += Math.round(glow * 32);
        b += Math.round(glow * 46);
      }

      // Draw sleek UI card frames
      const inCard1 =
        x > width * 0.08 &&
        x < width * 0.92 &&
        y > height * 0.14 &&
        y < height * 0.42;
      const inCard2 =
        x > width * 0.08 &&
        x < width * 0.92 &&
        y > height * 0.46 &&
        y < height * 0.86;

      if (inCard1 || inCard2) {
        r = 16;
        g = 20;
        b = 29;

        // Card accent bar at top
        if (
          (inCard1 && y < height * 0.15) ||
          (inCard2 && y < height * 0.47)
        ) {
          r = variant === 1 ? 0 : 6;
          g = variant === 1 ? 245 : 182;
          b = variant === 1 ? 155 : 212;
        }
      }

      buf[idx] = Math.min(255, r);
      buf[idx + 1] = Math.min(255, g);
      buf[idx + 2] = Math.min(255, b);
      buf[idx + 3] = 255;
    }
  }

  return encodePng(width, height, buf);
}

const publicDir = path.resolve(process.cwd(), 'public');

console.log('Generating Google Play Store & PWA PNG assets...');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), renderAppIcon(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), renderAppIcon(512, false));
fs.writeFileSync(path.join(publicDir, 'maskable-icon-512x512.png'), renderAppIcon(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderAppIcon(180, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), renderAppIcon(64, false));
fs.writeFileSync(
  path.join(publicDir, 'screenshot-mobile-1.png'),
  renderMarketingGraphic(540, 960, 1)
);
fs.writeFileSync(
  path.join(publicDir, 'screenshot-mobile-2.png'),
  renderMarketingGraphic(540, 960, 2)
);
fs.writeFileSync(
  path.join(publicDir, 'play-store-feature-graphic.png'),
  renderMarketingGraphic(1024, 500, 1)
);
console.log('All PNG assets generated successfully!');
