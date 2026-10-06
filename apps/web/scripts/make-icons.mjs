// 임시 PWA 아이콘 생성기 (의존성 없음). 디자이너 아이콘이 나오면 public/ 의 파일만 교체하면 된다.
// 실행: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0xa0, 0x47, 0x1d]; // 테라코타 (임시 주요 색)
const FG = [0xff, 0xfb, 0xf5]; // 아이보리

// CRC32 (PNG 청크용)
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// 발자국 모양: 큰 발바닥 1개 + 발가락 4개 (가운데 안전 영역 안에 그려 maskable 에도 사용)
function isPaw(x, y) {
  const inEllipse = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  return (
    inEllipse(0.5, 0.6, 0.15, 0.12) ||
    inEllipse(0.33, 0.43, 0.055, 0.075) ||
    inEllipse(0.44, 0.36, 0.055, 0.075) ||
    inEllipse(0.56, 0.36, 0.055, 0.075) ||
    inEllipse(0.67, 0.43, 0.055, 0.075)
  );
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const c = isPaw((x + 0.5) / size, (y + 0.5) / size) ? FG : BG;
      row.set(c, 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('pwa-192x192.png', out), png(192));
writeFileSync(new URL('pwa-512x512.png', out), png(512));
writeFileSync(new URL('apple-touch-icon.png', out), png(180));
writeFileSync(
  new URL('favicon.svg', out),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#A0471D"/><g fill="#FFFBF5"><ellipse cx="50" cy="60" rx="15" ry="12"/><ellipse cx="33" cy="43" rx="5.5" ry="7.5"/><ellipse cx="44" cy="36" rx="5.5" ry="7.5"/><ellipse cx="56" cy="36" rx="5.5" ry="7.5"/><ellipse cx="67" cy="43" rx="5.5" ry="7.5"/></g></svg>\n`,
);
console.log('아이콘 생성 완료: public/pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png, favicon.svg');
