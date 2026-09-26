/* ------------------------------------------------------------------
   Pix — hand-built 2D pixel sprites. Every Pokémon is a handful of
   flat shapes painted at native size with 3-tone cel shading and
   crisp 1px outlines, so it reads like classic handheld sprite art.
------------------------------------------------------------------- */
const Pix = (() => {
  const { hex, Buf, bayer4 } = PX;
  const LX = -0.5, LY = -0.62, LZ = 0.6;

  class Painter {
    constructor(w, h, mats) {
      this.w = w; this.h = h; this.ix = {};
      mats.forEach((k, i) => { this.ix[k] = i + 1; });
      this.m = new Uint8Array(w * h); this.t = new Uint8Array(w * h);
    }
    // test(px, py) -> null outside, or [nx, ny] (-1..1) for shading
    shape(test, x0, y0, x1, y1, mat, o = {}) {
      const { w, h, m, t } = this;
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
      x1 = Math.min(w - 1, Math.ceil(x1)); y1 = Math.min(h - 1, Math.ceil(y1));
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw <= 0 || bh <= 0) return this;
      const mi = this.ix[mat] || 0, inside = o.inside && o.inside.map((k) => this.ix[k]);
      const ins = new Uint8Array(bw * bh), tn = new Uint8Array(bw * bh);
      const hi = o.hi ?? 0.84, mid = o.mid ?? 0.3;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const r = test(x0 + x + 0.5, y0 + y + 0.5);
        if (!r) continue;
        if (inside && !inside.includes(m[(y0 + y) * w + x0 + x])) continue;
        ins[y * bw + x] = 1;
        if (o.tone !== undefined) { tn[y * bw + x] = o.tone; continue; }
        const nx = r[0], ny = r[1], nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lam = LX * nx + LY * ny + LZ * nz;
        tn[y * bw + x] = lam > hi ? 3 : lam > mid ? 2 : 1;
      }
      const ol = o.ol ?? true;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        if (!ins[y * bw + x]) continue;
        const i = (y0 + y) * w + x0 + x;
        let edge = false;
        if (ol) {
          const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
          for (const [a, b] of nb) {
            const inn = a >= 0 && b >= 0 && a < bw && b < bh && ins[b * bw + a];
            if (inn) continue;
            if (ol === 'out') {
              const gx = x0 + a, gy = y0 + b;
              if (gx < 0 || gy < 0 || gx >= w || gy >= h || !m[gy * w + gx]) { edge = true; break; }
            } else { edge = true; break; }
          }
        }
        m[i] = mi; t[i] = edge ? 0 : tn[y * bw + x];
      }
      return this;
    }
    el(cx, cy, rx, ry, mat, o = {}) {
      const a = o.rot || 0, c = Math.cos(a), s = Math.sin(a), R = Math.max(rx, ry) + 1;
      return this.shape((px, py) => {
        const dx = px - cx, dy = py - cy, u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
        if (u * u + v * v > 1) return null;
        return [u * c - v * s, u * s + v * c];
      }, cx - R, cy - R, cx + R, cy + R, mat, o);
    }
    poly(pts, mat, o = {}) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2 * 1.3 + 0.5, hh = (y1 - y0) / 2 * 1.3 + 0.5;
      return this.shape((px, py) => (inPoly(pts, px, py) ? [(px - cx) / hw, (py - cy) / hh] : null), x0, y0, x1, y1, mat, o);
    }
    // union of ellipses [cx,cy,rx,ry] and polygons [[x,y],...] outlined as one silhouette
    blob(parts, mat, o = {}) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const tests = parts.map((p) => {
        if (typeof p[0] === 'number') {
          const [cx, cy, rx, ry] = p;
          x0 = Math.min(x0, cx - rx); x1 = Math.max(x1, cx + rx); y0 = Math.min(y0, cy - ry); y1 = Math.max(y1, cy + ry);
          return (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
        }
        for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        return (px, py) => inPoly(p, px, py);
      });
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2 + 0.5, hh = (y1 - y0) / 2 + 0.5;
      return this.shape((px, py) => (tests.some((f) => f(px, py)) ? [(px - cx) / hw, (py - cy) / hh] : null), x0, y0, x1, y1, mat, o);
    }
    dot(x, y, mat, tone = 2) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
      const i = y * this.w + x; this.m[i] = this.ix[mat]; this.t[i] = tone; return this;
    }
    line(x0, y0, x1, y1, mat, tone = 2, th = 1) {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
        for (let a = 0; a < th; a++) for (let b = 0; b < th; b++) this.dot(x + a - (th >> 1), y + b - (th >> 1), mat, tone);
      }
      return this;
    }
    toBuf(ramps) {
      const b = new Buf(this.w, this.h);
      for (let i = 0; i < this.m.length; i++) if (this.m[i]) b.d[i] = ramps[this.m[i] - 1][this.t[i]];
      return b;
    }
  }
  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* ----------------------------- species ----------------------------- */
  // ramps: [outline, shade, base, highlight]
  const R = {
    black: ['#141420', '#141420', '#1c1c2a', '#1c1c2a'],
    white: ['#6d7a92', '#dfe6f0', '#ffffff', '#ffffff'],
    mouth: ['#4a1420', '#6a1e2a', '#8a2a36', '#c05060'],
    tongue: ['#6a1e2a', '#e0607a', '#f08aa0', '#f08aa0'],
  };
  const eyes3 = (P, x, y, rx, ry, kind, far) => {
    if (kind === 'closed' || kind === 'sleep') { P.line(x - rx - 0.5, y + 1, x + rx + 0.5, y + 1, 'eye', 2); return; }
    if (kind === 'happy') { P.line(x - rx - 0.5, y + 1, x, y - 1, 'eye', 2); P.line(x, y - 1, x + rx + 0.5, y + 1, 'eye', 2); return; }
    if (kind === 'dizzy') { P.line(x - rx, y - ry, x + rx, y + ry, 'eye', 2); P.line(x - rx, y + ry, x + rx, y - ry, 'eye', 2); return; }
    P.el(x, y, rx, ry, 'eye', { tone: 2, ol: false });
    P.dot(x - (far ? 0 : 1), y - Math.max(1, Math.round(ry) - 1), 'shine', 2);
    if (kind === 'angry') P.line(x - rx - 1, y - ry - 1, x + rx, y - ry + 1, 'eye', 2);
  };

  const SP = {
    spheal: {
      w: 46, h: 43, ax: 22, ay: 42,
      pal: { body: ['#1b3c70', '#3d7cc2', '#5aa6e6', '#9ad6fa'], spot: ['#6cb6ee', '#a8dcfa', '#c8ecff', '#e6f7ff'], cream: ['#a88450', '#e6cb92', '#f6e2b2', '#fff4d6'], eye: R.black, shine: R.white, nose: ['#2a2230', '#2a2230', '#3a3040', '#3a3040'], mouth: R.mouth },
      draw(P, o) {
        const cl = o.clap || 0, op = o.mouth || 0, sq = o.squash || 0;
        const cy = 22 + sq * 6, ry = 18 - sq * 6, rx = 19 + sq * 4;
        P.el(4, 33, 5, 2.5, 'body', { rot: -0.8 });
        P.el(12, 38, 5, 2.5, 'body', { rot: 0.2, tone: 1 });
        P.el(22, cy + 2, rx, ry, 'body');
        P.el(10, cy - 6, 2.4, 2, 'spot', { inside: ['body'], ol: false, tone: 2 });
        P.el(15, cy - 12, 2, 1.6, 'spot', { inside: ['body'], ol: false, tone: 2 });
        P.el(7, cy + 2, 1.6, 1.6, 'spot', { inside: ['body'], ol: false, tone: 2 });
        P.el(20, cy - 15, 1.6, 1.3, 'spot', { inside: ['body'], ol: false, tone: 3 });
        P.el(28, cy + 11, 12, 9 - sq * 2, 'cream', { inside: ['body'], ol: false });
        eyes3(P, 32, cy - 2, 2.2, 3, o.eyes, false);
        eyes3(P, 22.5, cy - 3, 1.7, 2.7, o.eyes, true);
        P.el(29, cy + 5, 2, 1.4, 'nose', { tone: 2, ol: false });
        if (op > 0.1) P.el(29, cy + 9, 2.4, 1 + op * 2, 'mouth', { tone: 2, ol: false });
        else { P.dot(27, cy + 8, 'nose'); P.dot(28, cy + 9, 'nose'); P.dot(29, cy + 8, 'nose'); P.dot(30, cy + 9, 'nose'); P.dot(31, cy + 8, 'nose'); }
        P.el(33 + cl * 3, cy + 16 - cl * 12, 6, 2.8, 'body', { rot: 0.5 - cl * 1.9 });
      },
    },
    sealeo: {
      w: 64, h: 60, ax: 31, ay: 59,
      pal: { body: ['#1f4a82', '#5a92d2', '#7cb6ea', '#b4dcfa'], cream: ['#8a8a86', '#dcd8c4', '#f2eedc', '#fffdf0'], white: ['#6d7a92', '#d8e2ee', '#ffffff', '#ffffff'], eye: R.black, shine: R.white, nose: R.black, mouth: R.mouth },
      draw(P, o) {
        const hp = o.headPitch || 0, cl = o.clap || 0, op = o.mouth || 0;
        const hx = 40 - hp * 2, hy = 22 - hp * 3;
        P.el(9, 55, 7, 3, 'body', { rot: -0.25 }); P.el(7, 50, 6, 2.5, 'body', { rot: -0.7 });
        P.el(24, 54, 7, 3.5, 'body', { rot: 0.2, tone: 1 });
        P.el(27, 42, 20, 16, 'body');
        P.el(34, 34, 12, 11, 'body', { ol: 'out' });
        P.el(32, 46, 12, 11, 'cream', { inside: ['body'], ol: false });
        P.el(hx, hy, 14, 13, 'body');
        P.el(hx + 8 + hp, hy + 5 - hp, 7.5, 5.5, 'white', { ol: 'out' });
        P.el(hx + 4 + hp, hy + 8 - hp, 5, 2.6, 'white', { rot: 0.35, ol: 'out' });
        P.el(hx + 13 + hp, hy + 8 - hp, 5, 2.6, 'white', { rot: -0.35, ol: 'out' });
        P.el(hx + 11 + hp, hy + 1 - hp, 2.6, 2, 'nose', { tone: 2, ol: false });
        if (op > 0.1) P.el(hx + 9 + hp, hy + 10 - hp, 2.6, 1 + op * 2, 'mouth', { tone: 2, ol: false });
        eyes3(P, hx + 8, hy - 6, 1.8, 2.6, o.eyes, false);
        eyes3(P, hx, hy - 6, 1.5, 2.4, o.eyes, true);
        P.el(39 + cl * 4, 52 - cl * 12, 9, 3.8, 'body', { rot: 0.45 - cl * 1.5 });
      },
    },
    walrein: {
      w: 86, h: 74, ax: 42, ay: 73,
      pal: { body: ['#16305e', '#2f5aa0', '#4474bf', '#7aa6e0'], cream: ['#7a6c50', '#cdbb90', '#e6d6ae', '#f6ecd0'], mane: ['#5f6f8c', '#cfdcec', '#f4f8fc', '#ffffff'], tusk: ['#7a6a4a', '#e6dcc0', '#fbf6e6', '#ffffff'], eye: R.black, shine: R.white, nose: R.black, mouth: R.mouth },
      draw(P, o) {
        const op = o.mouth || 0, hp = o.headPitch || 0;
        const hy = 26 - hp * 3;
        P.el(10, 66, 9, 4, 'body', { rot: -0.3 }); P.el(9, 59, 8, 3, 'body', { rot: -0.7 });
        P.el(44, 68, 9, 4, 'body', { rot: 0.2, tone: 1 });
        P.el(40, 48, 34, 24, 'body');
        P.el(42, 57, 24, 14, 'cream', { inside: ['body'], ol: false });
        P.el(60, hy, 17, 15, 'body');
        P.blob([[55, 40, 20, 10], [38, 40, 5, 5], [45, 46, 6, 5], [55, 49, 6, 5], [65, 47, 6, 5], [73, 41, 5, 5]], 'mane');
        P.poly([[71, hy + 10], [74, hy + 10], [73, hy + 30], [70, hy + 27]], 'tusk', { tone: 1 });
        if (op > 0.1) P.el(69, hy + 14, 4, 1 + op * 3, 'mouth', { tone: 2, ol: false });
        P.poly([[64, hy + 10], [67, hy + 10], [65, hy + 31], [62, hy + 28]], 'tusk');
        P.el(68, hy + 7, 9, 6.5, 'mane', { ol: 'out' });
        P.el(71, hy + 2, 3.2, 2.4, 'nose', { tone: 2, ol: false });
        eyes3(P, 66, hy - 6, 1.6, 2, o.eyes, false);
        eyes3(P, 57, hy - 6, 1.4, 1.8, o.eyes, true);
        if (o.eyes !== 'happy') { P.line(63, hy - 10, 69, hy - 9, 'nose', 2); P.line(55, hy - 10, 59, hy - 9, 'nose', 2); }
        P.el(62, 66, 11, 5, 'body', { rot: 0.35 - (o.flip || 0) * 1.2 });
      },
    },
    corphish: {
      w: 44, h: 40, ax: 22, ay: 39,
      pal: { red: ['#6a1410', '#c03a28', '#e45a3a', '#ff9a70'], cream: ['#9a7648', '#e8c890', '#f8e2b4', '#fff6dc'], white: R.white, eye: R.black, shine: R.white, mouth: R.mouth },
      draw(P, o) {
        const wk = o.walk || 0, sq = o.squash || 0;
        const by = 26 + sq * 2;
        for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
          const lift = Math.max(0, Math.sin(wk + i * 2.1 + (s > 0 ? Math.PI : 0))) * 3;
          const bx = 22 + s * (4 + i * 2);
          P.line(bx, by + 3, bx + s * (4 + i), 37 - lift, 'red', 1, 2);
        }
        P.poly([[22, 7], [24.5, 16], [19.5, 16]], 'red');
        P.poly([[14, 11], [20, 17], [17, 19]], 'red');
        P.poly([[30, 11], [24, 17], [27, 19]], 'red');
        P.el(22, by, 9.5, 8 - sq * 2, 'red');
        P.el(22, by + 4, 6, 3.5, 'cream', { inside: ['red'], ol: false });
        for (const s of [-1, 1]) {
          const arm = s < 0 ? (o.armL ?? 0) : (o.armR ?? 0), op = s < 0 ? (o.clawL || 0) : (o.clawR || 0);
          const cx = 22 + s * 15, cy = 13 - arm * 5;
          P.line(22 + s * 8, by - 1, cx - s * 1, cy + 4, 'red', 1, 2);
          P.el(cx - s * 0.5, cy + 3.5, 4.8, 2.6, 'cream', { rot: s * (0.35 + op * 0.45) });
          P.el(cx, cy - op * 2, 5.8, 4, 'red', { rot: -s * (0.25 + op * 0.5) });
        }
        const ex = o.look || 0;
        for (const s of [-1, 1]) {
          P.el(22 + s * 4.5, by - 6, 3.2, 3.6, 'white');
          if (o.eyes === 'closed') P.line(22 + s * 4.5 - 2, by - 6, 22 + s * 4.5 + 2, by - 6, 'eye');
          else if (o.eyes === 'happy') { P.line(22 + s * 4.5 - 2, by - 5, 22 + s * 4.5, by - 7, 'eye'); P.line(22 + s * 4.5, by - 7, 22 + s * 4.5 + 2, by - 5, 'eye'); }
          else {
            P.el(22 + s * 4.5 - s * 0.8 + ex, by - 5.5, 1.3, 1.8, 'eye', { tone: 2, ol: false });
            if (o.eyes === 'angry') P.line(22 + s * 1.5, by - 8, 22 + s * 7.5, by - 11, 'red', 0);
          }
        }
        if (o.mouth > 0.1) P.el(22, by + 1, 2, 1 + o.mouth, 'mouth', { tone: 2, ol: false });
        else P.line(20, by + 1, 24, by + 1, 'red', 0);
      },
    },
    luvdisc: {
      w: 32, h: 30, ax: 15, ay: 15,
      pal: { pink: ['#8a2a50', '#e0608e', '#f58cb0', '#ffc4d8'], lips: ['#a84a6a', '#f4b8c8', '#ffd6e0', '#ffffff'], blush: ['#e05a88', '#ff7aa4', '#ff7aa4', '#ff7aa4'], eye: ['#10183a', '#10183a', '#1c2a60', '#1c2a60'], shine: R.white },
      draw(P, o) {
        const k = o.kiss || 0;
        P.blob([[9, 9, 7, 7], [9, 20, 7, 7], [[6, 2.6], [12, 2.2], [28, 14.5], [12, 26.8], [6, 26.4]]], 'pink');
        P.el(11, 21, 3.5, 2, 'pink', { rot: 0.6, tone: 3, ol: false });
        eyes3(P, 19, 11, 1.8, 2.4, o.eyes, false);
        P.el(19.5, 16, 2 + (o.blush || 0), 1.2, 'blush', { tone: 2, ol: false });
        P.el(27 + k, 15, 2.2 + k, 1.8 + k * 0.5, 'lips');
      },
    },
    pelipper: {
      w: 64, h: 50, ax: 30, ay: 25,
      pal: { white: ['#5d6a84', '#d6e0ec', '#ffffff', '#ffffff'], blue: ['#15306a', '#2c5aa8', '#3f7ad0', '#6ea2e8'], bill: ['#8a5a10', '#e8b030', '#f8d448', '#fff0a0'], orange: ['#7a3a10', '#e07a28', '#f89a3a', '#ffc070'], eye: R.black, shine: R.white, mouth: R.mouth },
      draw(P, o) {
        const f = o.flap || 0, pc = o.pouch || 0, perch = o.perch;
        const wing = (dx, dy, tone) => {
          if (perch) { P.el(25 + dx, 26 + dy, 12, 5, 'white', { rot: 0.12, tone }); P.el(15 + dx, 28 + dy, 5, 3, 'blue', { rot: 0.12, inside: ['white'], ol: false }); return; }
          const a = Math.PI + 0.85 * f, c = Math.cos(a), s = Math.sin(a), sx = 28 + dx, sy = 22 + dy;
          P.el(sx + c * 11, sy + s * 11, 12, 4.5, 'white', { rot: a, tone });
          P.el(sx + c * 19, sy + s * 19, 5.5, 3.6, 'blue', { rot: a, inside: ['white'], ol: false });
        };
        wing(3, -2, 1);
        P.poly([[18, 23], [9, 21], [10, 28], [18, 28]], 'white');
        P.el(12, 25, 3, 3, 'blue', { inside: ['white'], ol: false });
        if (perch) { P.line(25, 31, 24, 38, 'orange', 1, 2); P.line(30, 31, 30, 38, 'orange', 1, 2); P.el(24, 39, 3, 1.5, 'orange', { tone: 2 }); P.el(31, 39, 3, 1.5, 'orange', { tone: 2 }); }
        else P.el(21, 31, 3, 1.5, 'orange');
        P.el(27, 25, 11, 7.5, 'white');
        P.el(35, 18, 7, 6.5, 'white');
        P.el(46, 25 + pc, 11 + pc, 6 + pc * 2, 'bill', { rot: 0.08 });
        P.poly([[37, 15], [58, 18.5], [57, 21], [38, 21]], 'bill');
        P.el(57.5, 20.5, 1.8, 1.8, 'orange');
        P.line(39, 21, 56, 21, 'orange', 1);
        eyes3(P, 36, 14, 1.4, 1.6, o.eyes, false);
        wing(0, 0, undefined);
      },
    },
    wingull: {
      w: 36, h: 16, ax: 18, ay: 8,
      pal: { white: ['#5d6a84', '#dde6f0', '#ffffff', '#ffffff'], wing: ['#2c4a78', '#5a7eb0', '#7ea0cc', '#a8c4e6'], bill: ['#8a5a10', '#e8b030', '#f8d448', '#fff0a0'], eye: R.black, shine: R.white },
      draw(P, o) {
        const f = o.flap || 0;
        for (const s of [-1, 1]) {
          P.line(18 + s * 3, 8, 18 + s * 9, 7 - f * 3, 'wing', 2, 2);
          P.line(18 + s * 9, 7 - f * 3, 18 + s * 16, 9 - f * 6, 'wing', 1, 2);
        }
        P.el(18, 9, 5, 3, 'white');
        P.el(21, 7, 3, 2.6, 'white');
        P.poly([[23, 6.5], [28, 7.5], [23, 8.5]], 'bill', { tone: 2 });
        P.dot(22, 6, 'eye');
      },
    },
    chinchou: {
      w: 34, h: 32, ax: 17, ay: 30,
      pal: { blue: ['#122a6a', '#2a58b8', '#3a6ed8', '#78a8f4'], belly: ['#3a6ed8', '#8ab8f0', '#a8d0fa', '#d0e8ff'], fin: ['#2a5098', '#7ab0e0', '#9ed0f4', '#c8ecff'], glow: ['#8a6a10', '#f0c830', '#fff070', '#ffffff'], stalk: ['#101830', '#101830', '#101830', '#101830'], white: R.white, eye: R.black, shine: R.white, mouth: R.mouth },
      draw(P, o) {
        const w = o.sway || 0;
        P.line(13, 12, 9 + w, 7, 'stalk', 2); P.line(9 + w, 7, 6 + w * 1.5, 5, 'stalk', 2);
        P.line(21, 12, 25 + w, 7, 'stalk', 2); P.line(25 + w, 7, 28 + w * 1.5, 5, 'stalk', 2);
        P.el(5 + w * 1.5, 4, 3, 3, 'glow'); P.el(29 + w * 1.5, 4, 3, 3, 'glow');
        P.el(5, 21, 4, 2.5, 'fin', { rot: 0.5 }); P.el(29, 21, 4, 2.5, 'fin', { rot: -0.5 });
        P.el(17, 28, 5, 2.5, 'fin');
        P.el(17, 19, 10.5, 8.5, 'blue');
        P.el(17, 23, 7, 4, 'belly', { inside: ['blue'], ol: false });
        for (const s of [-1, 1]) {
          P.el(17 + s * 4.5, 17.5, 3.2, 3.4, 'white');
          if (o.eyes === 'closed' || o.eyes === 'happy') P.line(17 + s * 4.5 - 2, 18, 17 + s * 4.5 + 2, 18, 'eye');
          else P.el(17 + s * 4.3, 18, 1.5, 2, 'eye', { tone: 2, ol: false });
        }
        P.line(15, 23, 19, 23, 'blue', 0);
      },
    },
    dialga: {
      w: 40, h: 38, ax: 19, ay: 37,
      pal: { steel: ['#141c3c', '#2e3e78', '#44589e', '#7088c8'], silver: ['#3a4a6a', '#9aaccc', '#c4d2ea', '#eef4ff'], gem: ['#1e5a8a', '#6ec6f0', '#a8e6ff', '#ffffff'], cyan: ['#6ee0ff', '#6ee0ff', '#8ef0ff', '#c8ffff'], eye: ['#4a0a18', '#7a1020', '#c8283c', '#c8283c'], shine: R.white, mouth: R.mouth },
      draw(P, o) {
        const wk = o.walk || 0, op = o.mouth || 0, hy = -(o.hop || 0) * 0;
        const lf = Math.sin(wk) * 1.5;
        P.el(6, 26, 5, 3, 'steel', { rot: -0.5 + (o.wag || 0) * 0.3 });
        P.el(11, 32 + lf, 3, 3.5, 'steel', { tone: 1 }); P.el(22, 32 - lf, 3, 3.5, 'steel', { tone: 1 });
        P.poly([[8, 22], [2, 9], [14, 19]], 'silver');
        P.poly([[13, 21], [11, 8], [19, 19]], 'silver');
        P.line(3, 10, 8, 21, 'cyan', 2); P.line(11.5, 9, 14, 20, 'cyan', 2);
        P.el(16, 26, 10, 7, 'steel');
        P.line(9, 26, 19, 25, 'cyan', 2);
        P.el(13.5, 33 - lf, 3, 3, 'steel'); P.el(24.5, 33 + lf, 3, 3, 'steel');
        P.dot(15, 35 - lf, 'silver', 3); P.dot(26, 35 + lf, 'silver', 3);
        P.el(24.5, 25, 5, 6, 'silver');
        P.poly([[25.5, 19.5], [29, 24], [25.5, 28.5], [22, 24]], 'gem', { hi: 0.55 + (o.gem || 0) * -0.4 });
        P.dot(24.5, 22, 'shine', 2);
        P.poly([[22, 7 + hy], [30, 6 + hy], [18, 0], [13, 2]], 'silver');
        P.line(15, 2, 27, 6, 'cyan', 2);
        P.el(27, 13 + hy, 9, 8, 'steel');
        P.el(31.5, 17 + hy, 5.5, 3 + op * 1.5, 'silver', { ol: 'out' });
        if (op > 0.1) P.el(33, 17.5 + hy, 3, 0.8 + op * 1.6, 'mouth', { tone: 2, ol: false });
        P.el(33, 7 + hy, 3, 2, 'silver');
        if (o.eyes === 'closed' || o.eyes === 'happy') P.line(28, 12, 32, 11 + (o.eyes === 'happy' ? -1 : 1), 'eye', 0);
        else { P.el(30, 11.5 + hy, 2, 2.6, 'eye', { tone: 2, ol: false }); P.dot(29.5, 10 + hy, 'shine', 2); P.dot(31, 13 + hy, 'shine', 1); }
        P.line(23, 10 + hy, 27, 11 + hy, 'cyan', 2);
      },
    },
    kyogre: {
      w: 142, h: 82, ax: 71, ay: 41,
      pal: { blue: ['#0c2458', '#1f4ea0', '#2d64c0', '#5a8ee0'], belly: ['#2d64c0', '#8ab4ea', '#b0d0f6', '#dcecff'], red: ['#6a0a14', '#d02838', '#f04858', '#ff8a90'], white: R.white, eye: ['#4a3a08', '#e8c028', '#f8e060', '#fff8c0'], pupil: R.black, mouth: ['#0a1430', '#0a1430', '#0a1430', '#0a1430'] },
      draw(P, o) {
        const tl = o.tail || 0, fn = o.fin || 0, op = o.mouth || 0;
        P.poly([[34, 38], [6, 20 + tl * 6], [14, 40], [6, 60 + tl * 6]], 'blue');
        P.el(84, 60, 20, 6, 'blue', { rot: 0.35 + fn * 0.2, tone: 1 });
        P.el(76, 40, 47, 20, 'blue');
        P.el(80, 52, 40, 9, 'belly', { inside: ['blue'], ol: false });
        P.line(46, 30, 70, 25, 'red', 2); P.line(70, 25, 104, 25, 'red', 2); P.line(104, 25, 114, 30, 'red', 2);
        P.el(60, 36, 4, 4, 'red', { ol: true }); P.el(60, 36, 2, 2, 'blue', { tone: 2, ol: false });
        P.line(40, 44, 58, 46, 'red', 2);
        P.el(66, 62 + fn * 3, 25, 8, 'blue', { rot: 0.22 + fn * 0.15 });
        P.line(52, 60 + fn * 3, 80, 64 + fn * 3, 'red', 2);
        for (let i = 0; i < 4; i++) P.el(46 + i * 3.5, 64 + fn * 3 + i * 1.6, 2, 2.6, 'white', { rot: 0.4 });
        P.el(106, 33, 3, 2.2, 'eye', { ol: true }); P.dot(107, 33, 'pupil');
        P.line(101, 29, 110, 30, 'red', 2);
        P.line(106, 45, 120, 42 - op * 2, 'mouth', 0);
        if (op > 0.1) P.el(113, 45, 6, op * 3, 'mouth', { tone: 0, ol: false });
      },
    },
    wailord: {
      w: 132, h: 58, ax: 66, ay: 40,
      pal: { blue: ['#123a78', '#2a64b4', '#3c7ed0', '#78b0f0'], cream: ['#8a8470', '#dcd6bc', '#f2ecd4', '#fffcec'], eye: R.black, shine: R.white, mouth: ['#0a1430', '#0a1430', '#0a1430', '#0a1430'] },
      draw(P, o) {
        P.poly([[12, 30], [0, 16 + (o.tail || 0) * 4], [4, 30], [0, 44]], 'blue');
        P.el(68, 34, 62, 23, 'blue');
        P.el(70, 50, 58, 12, 'cream', { inside: ['blue'], ol: false });
        P.el(100, 45, 12, 4, 'blue', { rot: 0.4, tone: 1 });
        for (const [x, y] of [[40, 22], [58, 16], [78, 14], [50, 30], [28, 30]]) P.el(x, y, 2.5, 1.8, 'cream', { inside: ['blue'], ol: false, tone: 3 });
        eyes3(P, 112, 26, 1.8, 2.2, o.eyes, false);
        P.line(106, 38, 118, 37, 'mouth', 0); P.line(118, 37, 127, 33, 'mouth', 0);
      },
    },
    rock: {
      w: 36, h: 24, ax: 18, ay: 23,
      pal: { rock: ['#3a3440', '#6e6874', '#8e8894', '#b8b2bc'], moss: ['#3a5a30', '#6a9a48', '#8aba5a', '#b0d878'] },
      draw(P, o) {
        const v = o.v || 0;
        if (v === 0) { P.el(17, 16, 15, 8, 'rock'); P.el(26, 13, 8, 7, 'rock'); }
        else if (v === 1) { P.el(14, 17, 11, 7, 'rock'); P.el(24, 19, 8, 5, 'rock'); }
        else { P.el(18, 14, 12, 10, 'rock'); P.el(9, 20, 6, 4, 'rock'); }
        P.el(15, 11, 5, 2, 'moss', { inside: ['rock'], ol: false });
      },
    },
    orb: {
      w: 16, h: 18, ax: 8, ay: 9,
      pal: { gem: ['#3a6aa0', '#9ad0f0', '#d4f0ff', '#ffffff'], core: ['#5a9ad0', '#b8e4ff', '#e8f8ff', '#ffffff'] },
      draw(P) {
        P.poly([[8, 0.5], [15, 7], [8, 17.5], [1, 7]], 'gem', { hi: 0.5 });
        P.line(1.5, 7, 14.5, 7, 'gem', 0); P.line(8, 1, 5, 7, 'core', 3); P.line(8, 1, 11, 7, 'core', 2);
        P.line(5, 7, 8, 17, 'gem', 1); P.line(11, 7, 8, 17, 'core', 2);
      },
    },
    nut: {
      w: 10, h: 10, ax: 5, ay: 5,
      pal: { nut: ['#2a180c', '#5a3818', '#7a4e24', '#a6743e'], flesh: ['#a89a80', '#f0ead8', '#ffffff', '#ffffff'], dot: ['#1a100a', '#1a100a', '#1a100a', '#1a100a'] },
      draw(P, o) {
        if (o.half) { P.poly([[1, 4], [9, 4], [8, 7], [5, 8.5], [2, 7]], 'nut'); P.el(5, 4.5, 3.4, 1.2, 'flesh', { ol: false }); return; }
        P.el(5, 5, 4, 3.8, 'nut'); P.dot(4, 3, 'dot'); P.dot(6, 3, 'dot'); P.dot(5, 5, 'dot');
      },
    },
    ball: {
      w: 16, h: 16, ax: 8, ay: 8,
      pal: { white: R.white, red: ['#6a1410', '#d0302a', '#f04a3a', '#ff8a70'], blue: ['#122a6a', '#2a58c0', '#3a74e0', '#7aa8f8'] },
      draw(P) {
        P.el(8, 8, 7, 7, 'white');
        P.poly([[8, 8], [1, 3], [5, 0.5], [9, 0.5]], 'red', { inside: ['white'], ol: false });
        P.poly([[8, 8], [15, 5], [15, 11], [12, 15]], 'blue', { inside: ['white'], ol: false });
        P.poly([[8, 8], [4, 15.5], [1, 12]], 'red', { inside: ['white'], ol: false });
      },
    },
  };

  /* --------------------------- cache & draw --------------------------- */
  const packed = {};
  function ramps(name) {
    if (!packed[name]) { const sp = SP[name]; packed[name] = { keys: Object.keys(sp.pal), r: Object.values(sp.pal).map((a) => a.map(hex)) }; }
    return packed[name];
  }
  const cache = new Map();
  // tint: {key, fn(c)} scene grading applied to the palette
  function get(name, pose = {}, tint = null) {
    const key = name + JSON.stringify(pose) + (tint ? tint.key : '');
    let b = cache.get(key);
    if (b) { cache.delete(key); cache.set(key, b); return b; }
    const sp = SP[name], rp = ramps(name);
    const P = new Painter(sp.w, sp.h, rp.keys);
    sp.draw(P, pose);
    const rr = tint ? rp.r.map((a) => a.map(tint.fn)) : rp.r;
    b = P.toBuf(rr); b.ax = sp.ax; b.ay = sp.ay;
    cache.set(key, b);
    if (cache.size > 900) cache.delete(cache.keys().next().value);
    return b;
  }
  // Draw with anchor at (x, y). o: flip, sx, sy, rot, a (0..1 dithered), map(c, x, y)
  function draw(fb, b, x, y, o = {}) {
    const sx = o.sx || 1, sy = o.sy || 1, rot = o.rot || 0, flip = o.flip ? -1 : 1, a = o.a ?? 1;
    if (a <= 0) return;
    const ax = o.ax ?? b.ax, ay = o.ay ?? b.ay;
    b = { w: b.w, h: b.h, d: b.d, ax, ay };
    const c = Math.cos(rot), s = Math.sin(rot);
    const hw = Math.max(b.ax, b.w - b.ax) * sx, hh = Math.max(b.ay, b.h - b.ay) * sy;
    const R0 = rot ? Math.hypot(hw, hh) + 1 : 0;
    const x0 = Math.floor(x - (rot ? R0 : hw) - 1), x1 = Math.ceil(x + (rot ? R0 : hw) + 1);
    const y0 = Math.floor(y - (rot ? R0 : b.ay * sy) - 1), y1 = Math.ceil(y + (rot ? R0 : (b.h - b.ay) * sy) + 1);
    const W = fb.w, H = fb.h, d = fb.d, bd = b.d, map = o.map;
    const X = Math.round(x), Y = Math.round(y);
    for (let py = Math.max(o.top ?? 0, y0); py <= Math.min(H - 1, y1, o.clip ?? 1e9); py++) {
      for (let px = Math.max(0, x0); px <= Math.min(W - 1, x1); px++) {
        let dx = px + 0.5 - X, dy = py + 0.5 - Y;
        if (rot) { const u = dx * c + dy * s; dy = -dx * s + dy * c; dx = u; }
        const u = Math.floor((dx * flip) / sx + b.ax), v = Math.floor(dy / sy + b.ay);
        if (u < 0 || v < 0 || u >= b.w || v >= b.h) continue;
        let col = bd[v * b.w + u];
        if (!col) continue;
        if (a < 1 && bayer4(px, py) >= a) continue;
        if (map) col = map(col, px, py);
        d[py * W + px] = col;
      }
    }
  }
  // loose bounding-box hit test for the sprite as last drawn at (x, y)
  function hit(b, x, y, flip, px, py, pad = 3) {
    if (!b) return false;
    const left = x - (flip ? b.w - b.ax : b.ax), top = y - b.ay;
    return px >= left - pad && px <= left + b.w + pad && py >= top - pad && py <= top + b.h + pad;
  }
  return { SP, Painter, get, draw, hit };
})();
