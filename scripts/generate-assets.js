import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });

function createIco(color) {
  const width = 16, height = 16;
  const bmpDataSize = width * height * 4 + width * height / 8;
  const bmpHeaderSize = 40;
  const dataOffset = 6 + 16;

  const buf = Buffer.alloc(dataOffset + bmpHeaderSize + bmpDataSize);
  let offset = 0;

  buf.writeUInt16LE(0, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;

  buf.writeUInt8(width, offset); offset += 1;
  buf.writeUInt8(height, offset); offset += 1;
  buf.writeUInt8(0, offset); offset += 1;
  buf.writeUInt8(0, offset); offset += 1;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(32, offset); offset += 2;
  buf.writeUInt32LE(bmpHeaderSize + bmpDataSize, offset); offset += 4;
  buf.writeUInt32LE(dataOffset, offset); offset += 4;

  buf.writeUInt32LE(bmpHeaderSize, offset); offset += 4;
  buf.writeInt32LE(width, offset); offset += 4;
  buf.writeInt32LE(height * 2, offset); offset += 4;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(32, offset); offset += 2;
  buf.writeUInt32LE(0, offset); offset += 4;
  buf.writeUInt32LE(bmpDataSize, offset); offset += 4;
  buf.writeInt32LE(0, offset); offset += 4;
  buf.writeInt32LE(0, offset); offset += 4;
  buf.writeUInt32LE(0, offset); offset += 4;
  buf.writeUInt32LE(0, offset); offset += 4;

  const cx = 7.5, cy = 7.5, r = 6;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        buf.writeUInt8(color.b, offset);
        buf.writeUInt8(color.g, offset + 1);
        buf.writeUInt8(color.r, offset + 2);
        buf.writeUInt8(255, offset + 3);
      } else {
        buf.writeUInt32LE(0, offset);
      }
      offset += 4;
    }
  }

  const andMaskSize = width * height / 8;
  for (let i = 0; i < andMaskSize; i++) {
    buf.writeUInt8(0, offset); offset++;
  }

  return buf;
}

function createAlertWav() {
  const sampleRate = 44100;
  const duration = 1.5;
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2;
  const headerSize = 44;

  const buf = Buffer.alloc(headerSize + dataSize);
  let offset = 0;

  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset); offset += 4;
  buf.writeUInt16LE(2, offset); offset += 2;
  buf.writeUInt16LE(16, offset); offset += 2;
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = Math.floor(t / 0.3) % 2 === 0 ? 800 : 600;
    const amplitude = 0.8 * 32767;
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * freq * t));
    buf.writeInt16LE(sample, offset);
    offset += 2;
  }

  return buf;
}

writeFileSync(join(assetsDir, 'icon.ico'), createIco({ r: 46, g: 204, b: 113 }));
writeFileSync(join(assetsDir, 'icon-alert.ico'), createIco({ r: 231, g: 76, b: 60 }));
writeFileSync(join(assetsDir, 'alert.wav'), createAlertWav());

// Generate PNG icons for macOS (22×22 tray icons)

// CRC32 for PNG chunks
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPng(color, size = 22) {
  const width = size, height = size;
  const cx = (width - 1) / 2, cy = (height - 1) / 2, r = (Math.min(width, height) - 2) / 2;

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        rawData[px] = color.r;
        rawData[px + 1] = color.g;
        rawData[px + 2] = color.b;
        rawData[px + 3] = 255;
      }
    }
  }

  const compressed = deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type);
    const crcInput = Buffer.concat([typeB, data]);
    const crc = crc32(crcInput);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc >>> 0);
    return Buffer.concat([len, typeB, data, crcB]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

writeFileSync(join(assetsDir, 'icon.png'), createPng({ r: 46, g: 204, b: 113 }));
writeFileSync(join(assetsDir, 'icon-alert.png'), createPng({ r: 231, g: 76, b: 60 }));

console.log('Assets generated in', assetsDir);
