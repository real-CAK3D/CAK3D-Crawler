// Draws the app icon (the spider on a web that turns into a sheet of notepaper) with no image dependencies and writes the PNGs
// the web app and the Android build need. Shapes are rendered with distance-based antialiasing.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [17, 20, 19], SILK = [196, 207, 220], INK = [24, 28, 27], PAPER = [244, 241, 231], FOLD = [212, 205, 188], RULE = [138, 166, 204], PENCIL = [120, 126, 132], MARGIN = [214, 120, 120];

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
};

// the paper: the left half of the icon, with a folded top-left corner
const PAPER_POLY = [[0.21, 0.13], [0.5, 0.13], [0.5, 0.87], [0.13, 0.87], [0.13, 0.21]];
const inPaper = (x, y) => x >= 0.13 && x <= 0.5 && y >= 0.13 && y <= 0.87 && !(x < 0.21 && y < 0.21 && (0.21 - x) > (y - 0.13));
// the drawing, in unit coordinates (0..1), center at 0.5
function shapes({ web }) {
  const s = [];
  if (web) {
    // left half: a sheet of notepaper, where the web carries on as faint pencil lines; right half: silk
    s.push({ poly: PAPER_POLY, c: PAPER, a: 1 });
    s.push({ poly: [[0.21, 0.13], [0.21, 0.21], [0.13, 0.21]], c: FOLD, a: 1 });
    for (let y = 0.27; y < 0.86; y += 0.068) s.push({ seg: [0.13, y, 0.5, y], r: 0.0028, c: RULE, a: 0.7 });
    s.push({ seg: [0.2, 0.21, 0.2, 0.87], r: 0.0028, c: MARGIN, a: 0.75 });
    const ring = r => Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2 + Math.PI / 8; return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]; });
    const leftSide = (x) => x > 0.5, onPaper = (x, y) => inPaper(x, y);
    for (const [clip, c, a, r0] of [[leftSide, SILK, 0.55, 0.0045], [onPaper, PENCIL, 0.45, 0.0032]]) {
      for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2 + Math.PI / 8; s.push({ seg: [0.5, 0.5, 0.5 + Math.cos(an) * 0.47, 0.5 + Math.sin(an) * 0.47], r: r0, c, a, clip }); }
      for (const r of [0.17, 0.29, 0.41]) { const p = ring(r); for (let i = 0; i < 8; i++) { const q = p[(i + 1) % 8]; s.push({ seg: [p[i][0], p[i][1], q[0], q[1]], r: r0, c, a, clip }); } }
    }
  }
  // the cobweb weaver, the app's default spider, built from the app's own measurements (drawClassicBody and
  // buildLegs in src/arachnotes.html). App units point forward along x; here the head points up.
  const S = 0.0076, P = (f, l) => [0.5 + l * S, 0.51 - f * S], body = [];
  const FWD = [30, 13, -7, -24], LAT = [30, 37, 37, 31], HIPF = [5, 2, -1, -4];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const hip = [HIPF[i], side * 5], foot = [FWD[i], side * LAT[i]];
    const dx = foot[0] - hip[0], dy = foot[1] - hip[1], d = Math.hypot(dx, dy), L1 = d * 0.66, L2 = d * 0.7;
    const cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const ang = Math.atan2(dy, dx) - side * Math.acos(cosA); // the knee bends outward, as in the app
    const knee = [hip[0] + Math.cos(ang) * L1, hip[1] + Math.sin(ang) * L1];
    body.push({ seg: [...P(...hip), ...P(...knee)], r: 1.8 * S, c: INK, a: 1 });
    body.push({ seg: [...P(...knee), ...P(...foot)], r: 1.2 * S, c: INK, a: 1 });
    body.push({ circ: [...P(...foot), 1.6 * S], c: INK, a: 1 });
  }
  body.push({ ell: [...P(-14, 0), 8.5 * S, 12 * S], c: INK, a: 1 });  // abdomen
  body.push({ ell: [...P(2, 0), 6 * S, 7.5 * S], c: INK, a: 1 });     // head
  for (const x of [-9, -14, -19]) for (const side of [-1, 1])        // the three chevrons down its back
    body.push({ seg: [...P(x - 3, side * 4), ...P(x, 0)], r: 0.75 * S, c: SILK, a: 0.55 });
  for (const side of [-1, 1]) {                                       // palps
    body.push({ seg: [...P(8, side * 2.5), ...P(12, side * 4.5)], r: 0.8 * S, c: INK, a: 1 });
    body.push({ seg: [...P(12, side * 4.5), ...P(14, side * 3)], r: 0.8 * S, c: INK, a: 1 });
  }
  for (const [f, l, r] of [[7, -1.8, 1.25], [7, 1.8, 1.25], [5.5, -3.4, 0.8], [5.5, 3.4, 0.8]]) body.push({ circ: [...P(f, l), r * S], c: SILK, a: 1 }); // eyes
  // a light outline first (every body shape, a little bigger), then the dark spider on top
  const grow = 1.0 * S, solid = body.filter(b => b.c === INK);
  for (const b of solid) s.push(b.seg ? { seg: b.seg, r: b.r + grow, c: SILK, a: 1 } : b.ell ? { ell: [b.ell[0], b.ell[1], b.ell[2] + grow, b.ell[3] + grow], c: SILK, a: 1 } : { circ: [b.circ[0], b.circ[1], b.circ[2] + grow], c: SILK, a: 1 });
  s.push(...body);
  return s;
}

function render(size, { bg = true, web = true, scale = 1 }) {
  const px = Buffer.alloc(size * size * 4);
  if (bg) for (let i = 0; i < size * size; i++) { px[i * 4] = BG[0]; px[i * 4 + 1] = BG[1]; px[i * 4 + 2] = BG[2]; px[i * 4 + 3] = 255; }
  const T = v => 0.5 + (v - 0.5) * scale;
  for (const sh of shapes({ web })) {
    let x0, y0, x1, y1, dist;
    if (sh.seg) {
      const [ax, ay, bx, by] = sh.seg.map(T), r = sh.r * scale;
      x0 = Math.min(ax, bx) - r; x1 = Math.max(ax, bx) + r; y0 = Math.min(ay, by) - r; y1 = Math.max(ay, by) + r;
      dist = (x, y) => segDist(x, y, ax, ay, bx, by) - r;
    } else if (sh.ell) {
      const cx = T(sh.ell[0]), cy = T(sh.ell[1]), rx = sh.ell[2] * scale, ry = sh.ell[3] * scale;
      x0 = cx - rx; x1 = cx + rx; y0 = cy - ry; y1 = cy + ry;
      dist = (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
    } else if (sh.poly) {
      const pts = sh.poly.map(([x, y]) => [T(x), T(y)]);
      x0 = Math.min(...pts.map(p => p[0])); x1 = Math.max(...pts.map(p => p[0])); y0 = Math.min(...pts.map(p => p[1])); y1 = Math.max(...pts.map(p => p[1]));
      dist = (x, y) => {
        let inside = false, d = Infinity;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
          d = Math.min(d, segDist(x, y, xi, yi, xj, yj));
        }
        return inside ? -d : d;
      };
    } else {
      const cx = T(sh.circ[0]), cy = T(sh.circ[1]), r = sh.circ[2] * scale;
      x0 = cx - r; x1 = cx + r; y0 = cy - r; y1 = cy + r;
      dist = (x, y) => Math.hypot(x - cx, y - cy) - r;
    }
    const X0 = Math.max(0, Math.floor(x0 * size) - 2), X1 = Math.min(size - 1, Math.ceil(x1 * size) + 2);
    const Y0 = Math.max(0, Math.floor(y0 * size) - 2), Y1 = Math.min(size - 1, Math.ceil(y1 * size) + 2);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const cov = Math.max(0, Math.min(1, 0.5 - dist((x + 0.5) / size, (y + 0.5) / size) * size)) * sh.a;
      if (!cov) continue;
      if (sh.clip) { const ux = 0.5 + ((x + 0.5) / size - 0.5) / (scale || 1), uy = 0.5 + ((y + 0.5) / size - 0.5) / (scale || 1); if (!sh.clip(ux, uy)) continue; }
      const i = (y * size + x) * 4, da = px[i + 3] / 255, oa = cov + da * (1 - cov);
      for (let k = 0; k < 3; k++) px[i + k] = Math.round((sh.c[k] * cov + px[i + k] * da * (1 - cov)) / (oa || 1));
      px[i + 3] = Math.round(oa * 255);
    }
  }
  return png(size, px);
}

mkdirSync("assets", { recursive: true });
mkdirSync("web/icons", { recursive: true });
const jobs = [
  ["web/icons/icon-192.png", 192, {}],
  ["web/icons/icon-512.png", 512, {}],
  ["web/icons/icon-maskable-512.png", 512, { scale: 0.72 }],
  ["assets/icon-only.png", 1024, {}],
  ["assets/icon-foreground.png", 1024, { bg: false, scale: 0.6 }],
  ["assets/icon-background.png", 1024, { web: false, scale: 0 }],
  ["assets/splash.png", 2732, { scale: 0.28 }],
  ["assets/splash-dark.png", 2732, { scale: 0.28 }]
];
for (const [file, size, opt] of jobs) { writeFileSync(file, render(size, opt)); console.log("wrote", file); }
