const fs = require('fs');
const zlib = require('zlib');

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, renderPixel) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // non-interlaced
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with filter byte 0 at start of each line
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderPixel(x, y, width, height);
      rawData[pos++] = r;
      rawData[pos++] = g;
      rawData[pos++] = b;
      rawData[pos++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate an elegant app icon
function renderIcon(x, y, w, h) {
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Background: dark midnight indigo rounded container
  // Rounded corner mask
  const cornerRadius = 0.22;
  const qx = Math.max(0, Math.abs(nx) - (1 - cornerRadius));
  const qy = Math.max(0, Math.abs(ny) - (1 - cornerRadius));
  const cornerDist = Math.sqrt(qx * qx + qy * qy);
  if (cornerDist > cornerRadius) {
    return [0, 0, 0, 0]; // Transparent outside squircle
  }

  // Base background gradient: dark indigo-black
  let r = 15 - ny * 5;
  let g = 23 - ny * 7;
  let b = 42 - ny * 10;

  // Outer five elements colored ring: radius around 0.65 to 0.75
  if (dist >= 0.62 && dist <= 0.74) {
    const angle = Math.atan2(ny, nx) + Math.PI; // 0 to 2*PI
    // 5 segments: Wood(green), Fire(red), Earth(amber), Metal(white/gray), Water(blue)
    const seg = Math.floor((angle / (2 * Math.PI)) * 5);
    const colors = [
      [16, 185, 129], // 목 (Green)
      [239, 68, 68],  // 화 (Red)
      [245, 158, 11], // 토 (Amber)
      [226, 232, 240],// 금 (Silver)
      [59, 130, 246]  // 수 (Blue)
    ];
    const c = colors[seg % 5];
    const edge = Math.sin(((dist - 0.62) / 0.12) * Math.PI);
    r = Math.round(r * (1 - edge) + c[0] * edge);
    g = Math.round(g * (1 - edge) + c[1] * edge);
    b = Math.round(b * (1 - edge) + c[2] * edge);
  }

  // Center Yin-Yang / Taegeuk core
  if (dist < 0.45) {
    // Taegeuk pattern
    const inUpper = ny < 0;
    // Top small circle (center (0, -0.225), radius 0.225)
    const dTop = Math.sqrt(nx * nx + (ny + 0.225) * (ny + 0.225));
    // Bottom small circle (center (0, 0.225), radius 0.225)
    const dBottom = Math.sqrt(nx * nx + (ny - 0.225) * (ny - 0.225));
    
    let isYang = false;
    if (dTop < 0.225) {
      isYang = true;
    } else if (dBottom < 0.225) {
      isYang = false;
    } else {
      isYang = nx > 0;
    }

    if (isYang) {
      // Yang (Red/Crimson flame)
      r = 235; g = 60; b = 75;
    } else {
      // Yin (Deep Cobalt ocean)
      r = 30; g = 90; b = 220;
    }

    // Small dot in top (blue dot in red upper part)
    if (dTop < 0.075) {
      r = 30; g = 90; b = 220;
    }
    // Small dot in bottom (red dot in blue lower part)
    if (dBottom < 0.075) {
      r = 235; g = 60; b = 75;
    }

    // Soft antialias edge around dist 0.45
    if (dist > 0.43) {
      const alpha = (0.45 - dist) / 0.02;
      r = Math.round(r * alpha + 15 * (1 - alpha));
      g = Math.round(g * alpha + 23 * (1 - alpha));
      b = Math.round(b * alpha + 42 * (1 - alpha));
    }
  }

  return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)), 255];
}

console.log('Generating icon-192.png...');
const icon192 = createPng(192, 192, renderIcon);
fs.writeFileSync('icon-192.png', icon192);

console.log('Generating icon-512.png...');
const icon512 = createPng(512, 512, renderIcon);
fs.writeFileSync('icon-512.png', icon512);

// Generate crisp SVG icons as well
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)" />
  
  <!-- Five Elements Ring -->
  <circle cx="256" cy="256" r="185" fill="none" stroke="#1e293b" stroke-width="24" opacity="0.6" />
  <!-- 목 (Green) -->
  <path d="M 256 71 A 185 185 0 0 1 432 199" fill="none" stroke="#10b981" stroke-width="16" stroke-linecap="round" />
  <!-- 화 (Red) -->
  <path d="M 432 199 A 185 185 0 0 1 365 405" fill="none" stroke="#f43f5e" stroke-width="16" stroke-linecap="round" />
  <!-- 토 (Amber) -->
  <path d="M 365 405 A 185 185 0 0 1 147 405" fill="none" stroke="#f59e0b" stroke-width="16" stroke-linecap="round" />
  <!-- 금 (Silver) -->
  <path d="M 147 405 A 185 185 0 0 1 80 199" fill="none" stroke="#e2e8f0" stroke-width="16" stroke-linecap="round" />
  <!-- 수 (Blue) -->
  <path d="M 80 199 A 185 185 0 0 1 256 71" fill="none" stroke="#3b82f6" stroke-width="16" stroke-linecap="round" />
  
  <!-- Central Taegeuk Symbol -->
  <g transform="translate(256, 256)">
    <!-- Red Yang (top & right) -->
    <path d="M 0 -110 A 110 110 0 0 1 0 110 A 55 55 0 0 1 0 0 A 55 55 0 0 0 0 -110 Z" fill="#ef4444" />
    <!-- Blue Yin (bottom & left) -->
    <path d="M 0 110 A 110 110 0 0 1 0 -110 A 55 55 0 0 1 0 0 A 55 55 0 0 0 0 110 Z" fill="#3b82f6" />
    <!-- Inner dots -->
    <circle cx="0" cy="-55" r="18" fill="#3b82f6" />
    <circle cx="0" cy="55" r="18" fill="#ef4444" />
  </g>
</svg>`;

fs.writeFileSync('icon.svg', svgContent);
fs.writeFileSync('favicon.svg', svgContent);
console.log('Icons generated successfully.');
