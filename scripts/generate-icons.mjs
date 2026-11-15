import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Pure Node.js deterministic PNG icon generator (no native canvas deps needed).
 * Draws a crisp Liquid Glass blue-and-white RS Setups emblem onto an RGBA buffer
 * and encodes a valid RGBA PNG file.
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function blendPixel(buf, idx, r, g, b, a) {
  const alpha = Math.max(0, Math.min(1, a));
  const inv = 1 - alpha;
  buf[idx] = Math.round(buf[idx] * inv + r * alpha);
  buf[idx + 1] = Math.round(buf[idx + 1] * inv + g * alpha);
  buf[idx + 2] = Math.round(buf[idx + 2] * inv + b * alpha);
  buf[idx + 3] = Math.round(Math.min(255, buf[idx + 3] + 255 * alpha * (1 - buf[idx + 3] / 255)));
}

function insideRoundedRect(x, y, rx, ry, rw, rh, rad) {
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
  const cx = Math.max(rx + rad, Math.min(rx + rw - rad, x));
  const cy = Math.max(ry + rad, Math.min(ry + rh - rad, y));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

function renderIcon(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 512;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const t = (x + y) / (2 * size);
      // Deep navy -> Fermaxo blue -> cerulean gradient
      const r = Math.round(10 * (1 - t) + 29 * t);
      const g = Math.round(37 * (1 - t) + 111 * t);
      const b = Math.round(88 * (1 - t) + 232 * t);
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;

      // Subtle Liquid Glass inner bezel
      const pad = (maskable ? 86 : 48) * scale;
      const rad = (maskable ? 64 : 84) * scale;
      if (insideRoundedRect(x, y, pad, pad, size - pad * 2, size - pad * 2, rad)) {
        blendPixel(buf, idx, 255, 255, 255, 0.14);
      }
      // Top glass specular sheen
      const sheenDist = (y - pad) / (size * 0.45);
      if (sheenDist >= 0 && sheenDist <= 1 && insideRoundedRect(x, y, pad, pad, size - pad * 2, size - pad * 2, rad)) {
        blendPixel(buf, idx, 255, 255, 255, 0.16 * (1 - sheenDist));
      }

      // Draw crisp geometric "RS" monogram inside safe zone
      const nx = (x / size - 0.5) / (maskable ? 0.68 : 0.85) + 0.5;
      const ny = (y / size - 0.5) / (maskable ? 0.68 : 0.85) + 0.5;

      // Left pillar of R
      const inRStem = nx >= 0.23 && nx <= 0.31 && ny >= 0.31 && ny <= 0.69;
      // Top bowl of R
      const inRTop = nx >= 0.23 && nx <= 0.46 && ny >= 0.31 && ny <= 0.39;
      const inRMid = nx >= 0.23 && nx <= 0.46 && ny >= 0.47 && ny <= 0.55;
      const inRRight = nx >= 0.41 && nx <= 0.49 && ny >= 0.34 && ny <= 0.52;
      // Diagonal leg of R
      const legY = 0.52 + (nx - 0.34) * 1.15;
      const inRLeg = nx >= 0.33 && nx <= 0.50 && Math.abs(ny - legY) <= 0.048 && ny >= 0.52 && ny <= 0.69;

      if (inRStem || inRTop || inRMid || inRRight || inRLeg) {
        blendPixel(buf, idx, 255, 255, 255, 0.98);
      }

      // Stylized S speed bar on right
      const inSTop = nx >= 0.56 && nx <= 0.77 && ny >= 0.31 && ny <= 0.39;
      const inSLeft = nx >= 0.55 && nx <= 0.63 && ny >= 0.35 && ny <= 0.50;
      const inSMid = nx >= 0.56 && nx <= 0.76 && ny >= 0.46 && ny <= 0.54;
      const inSRight = nx >= 0.69 && nx <= 0.77 && ny >= 0.50 && ny <= 0.65;
      const inSBot = nx >= 0.55 && nx <= 0.76 && ny >= 0.61 && ny <= 0.69;

      if (inSTop || inSLeft || inSMid || inSRight || inSBot) {
        blendPixel(buf, idx, 214, 234, 255, 0.98);
      }
    }
  }

  return encodePng(size, size, buf);
}

const publicDir = path.resolve(process.cwd(), 'public');
const iconsDir = path.join(publicDir, 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderIcon(180, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), renderIcon(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), renderIcon(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), renderIcon(512, true));
fs.writeFileSync(path.join(iconsDir, 'ios-1024x1024.png'), renderIcon(1024, false));

console.log('Generated PNG icons in public/ and public/icons/');
