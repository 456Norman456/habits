// Рисует иконки приложения (огонёк) в PNG без внешних библиотек.  node tools/make-icons.js
const fs = require("fs"), path = require("path"), zlib = require("zlib");

function bez(p0, p1, p2, p3, steps, out){
  for (let i = 1; i <= steps; i++){
    const t = i / steps, u = 1 - t;
    out.push([
      u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
      u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
    ]);
  }
}
function shape(start, curves){
  const pts = [start]; let cur = start;
  for (const c of curves){ bez(cur, c[0], c[1], c[2], 40, pts); cur = c[2]; }
  return pts;
}
const outer = shape([.5,.12], [
  [[.62,.30],[.78,.40],[.76,.62]],
  [[.75,.80],[.63,.90],[.5,.90]],
  [[.37,.90],[.25,.80],[.24,.63]],
  [[.23,.50],[.32,.42],[.36,.33]],
  [[.38,.42],[.42,.47],[.46,.48]],
  [[.44,.36],[.46,.22],[.5,.12]]
]);
const inner = shape([.5,.52], [
  [[.57,.61],[.64,.67],[.63,.75]],
  [[.62,.83],[.56,.87],[.5,.87]],
  [[.44,.87],[.38,.83],[.37,.75]],
  [[.37,.67],[.45,.61],[.5,.52]]
]);
function inside(pts, x, y){
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const BG = [21,21,26], OUT = [255,138,61], IN = [255,196,120];

function render(size, scale){
  const ss = 4, px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++){
      // координаты в системе фигуры, с масштабом вокруг центра и небольшим сдвигом вниз
      const u = ((x + (sx + .5) / ss) / size - .5) / scale + .5;
      const v = ((y + (sy + .5) / ss) / size - .5) / scale + .5 - .01;
      const c = inside(inner, u, v) ? IN : inside(outer, u, v) ? OUT : BG;
      r += c[0]; g += c[1]; b += c[2];
    }
    const n = ss * ss, o = (y * size + x) * 4;
    px[o] = r / n; px[o+1] = g / n; px[o+2] = b / n; px[o+3] = 255;
  }
  return png(size, size, px);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf){ let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba){
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++){ raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const root = path.join(__dirname, "..");
fs.writeFileSync(path.join(root, "icon-192.png"), render(192, .95));
fs.writeFileSync(path.join(root, "icon-512.png"), render(512, .95));
fs.writeFileSync(path.join(root, "icon-maskable-512.png"), render(512, .78));
fs.writeFileSync(path.join(root, "apple-touch-icon.png"), render(180, .9));
console.log("ok");
