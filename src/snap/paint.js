/* ------------------------------------------------------------------
   Paint — procedural pixel-art painters that write material indices
   (see Pal) into indexed sprites. Shapes get pillow shading from a
   distance field (light from the upper left), ordered dithering between
   ramp steps, sel-out outlines and hand-placed-looking detail.
------------------------------------------------------------------- */
class ISpr {
  constructor(w, h) { this.w = w | 0; this.h = h | 0; this.d = new Uint8Array(this.w * this.h); this.ax = 0; this.ay = 0; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
  set(x, y, i) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = i; }
  setIf(x, y, i) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x]) this.d[y * this.w + x] = i; }
  under(x, y, i) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && !this.d[y * this.w + x]) this.d[y * this.w + x] = i; }
  rect(x, y, w, h, i) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, i); }
  // paste another indexed sprite (0 = transparent)
  paste(s, x, y, flip = false) {
    for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
      const v = s.d[yy * s.w + (flip ? s.w - 1 - xx : xx)];
      if (v) this.set(x + xx, y + yy, v);
    }
  }
  clone() { const c = new ISpr(this.w, this.h); c.d.set(this.d); c.ax = this.ax; c.ay = this.ay; return c; }
  bbox() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    return { x0, y0, x1, y1 };
  }
  // crop to content, keeping the anchor
  trim(pad = 0) {
    const b = this.bbox();
    if (b.x1 < 0) return this;
    const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad), x1 = Math.min(this.w - 1, b.x1 + pad), y1 = Math.min(this.h - 1, b.y1 + pad);
    const c = new ISpr(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = 0; y < c.h; y++) c.d.set(this.d.subarray((y + y0) * this.w + x0, (y + y0) * this.w + x0 + c.w), y * c.w);
    c.ax = this.ax - x0; c.ay = this.ay - y0;
    return c;
  }
}

const Paint = (() => {
  const { clamp, lerp, hash, vnoise, fbm, bayer4, bayer8, rng, TAU } = U;
  const LX = -0.62, LY = -0.78; // light direction (screen space, toward the light)

  /* ---------- blitting indexed sprites into a colour framebuffer ---------- */
  // fb: {w,h,d:Uint32Array}; pal: Uint32Array(256). o: flip, occ (Uint8Array) + occV, idb (Uint16Array, writes 0), dither fade 0..1
  function blit(fb, s, X, Y, pal, o = {}) {
    X |= 0; Y |= 0;
    const W = fb.w, H = fb.h, d = fb.d, sd = s.d, sw = s.w;
    const x0 = Math.max(0, -X), x1 = Math.min(sw, W - X), y0 = Math.max(0, -Y), y1 = Math.min(s.h, H - Y);
    if (x0 >= x1 || y0 >= y1) return;
    const flip = o.flip, occ = o.occ, occV = o.occV || 1, idb = o.idb, fade = o.fade || 0;
    for (let sy = y0; sy < y1; sy++) {
      const row = sy * sw, trow = (Y + sy) * W + X;
      for (let sx = x0; sx < x1; sx++) {
        const v = sd[row + (flip ? sw - 1 - sx : sx)];
        if (!v) continue;
        if (fade && bayer4(X + sx, Y + sy) < fade) continue;
        const i = trow + sx;
        d[i] = pal[v];
        if (occ) occ[i] = occV;
        if (idb) idb[i] = 0;
      }
    }
  }
  // blit with a vertical skew per row (wind sway): off(y01) → px
  function blitSway(fb, s, X, Y, pal, sway, o = {}) {
    X |= 0; Y |= 0;
    const W = fb.w, H = fb.h, d = fb.d, sd = s.d, sw = s.w, idb = o.idb;
    for (let sy = 0; sy < s.h; sy++) {
      const ty = Y + sy;
      if (ty < 0 || ty >= H) continue;
      const k = 1 - sy / s.h;
      const dx = Math.round(sway * k * k);
      const row = sy * sw, trow = ty * W;
      for (let sx = 0; sx < sw; sx++) {
        const v = sd[row + (o.flip ? sw - 1 - sx : sx)];
        if (!v) continue;
        const tx = X + sx + dx;
        if (tx < 0 || tx >= W) continue;
        d[trow + tx] = pal[v];
        if (idb) idb[trow + tx] = 0;
      }
    }
  }

  /* ---------- shape fields ---------- */
  // mask → distance-to-edge field (chamfer 3-4), normalised
  function field(mask, w, h) {
    const INF = 1e9, dd = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) dd[i] = mask[i] ? INF : 0;
    const a = 1, b = 1.41;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!dd[i]) continue;
      let v = dd[i];
      if (x > 0) v = Math.min(v, dd[i - 1] + a); else v = Math.min(v, a);
      if (y > 0) v = Math.min(v, dd[i - w] + a); else v = Math.min(v, a);
      if (x > 0 && y > 0) v = Math.min(v, dd[i - w - 1] + b);
      if (x < w - 1 && y > 0) v = Math.min(v, dd[i - w + 1] + b);
      dd[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; if (!dd[i]) continue;
      let v = dd[i];
      if (x < w - 1) v = Math.min(v, dd[i + 1] + a); else v = Math.min(v, a);
      if (y < h - 1) v = Math.min(v, dd[i + w] + a); else v = Math.min(v, a);
      if (x < w - 1 && y < h - 1) v = Math.min(v, dd[i + w + 1] + b);
      if (x > 0 && y < h - 1) v = Math.min(v, dd[i + w - 1] + b);
      dd[i] = v;
    }
    return dd;
  }
  /**
   * Pillow-shade a mask into ramp indices.
   * ramp: indices dark→light. o: {depth (px of bevel), amb, noise, seed, rim (index for lit rim), dither}
   */
  function shade(spr, mask, ramp, o = {}) {
    const w = spr.w, h = spr.h, f = field(mask, w, h);
    const dep = o.depth || 5, n = ramp.length, amb = o.amb ?? 0.25, nz = o.noise ?? 0.12, seed = o.seed || 0;
    const lx = o.lx ?? LX, ly = o.ly ?? LY;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const hC = Math.min(f[i], dep) / dep;
      const hx = (Math.min(x < w - 1 ? f[i + 1] : 0, dep) - Math.min(x > 0 ? f[i - 1] : 0, dep)) / dep;
      const hy = (Math.min(y < h - 1 ? f[i + w] : 0, dep) - Math.min(y > 0 ? f[i - w] : 0, dep)) / dep;
      // surface normal of the pillow (flat top once deeper than dep)
      const nx = -hx * (1.2 - hC), ny = -hy * (1.2 - hC), nzz = 0.55 + hC * 0.45;
      const l = Math.hypot(nx, ny, nzz) || 1;
      let lit = (nx * lx + ny * ly + nzz * 0.62) / l;
      lit = amb + (1 - amb) * clamp(lit, 0, 1);
      if (o.grad) lit += o.grad(x / w, y / h);
      lit += (fbm(x * 0.35, y * 0.35, seed, 3) - 0.5) * nz * 2;
      let t = clamp(lit, 0, 0.999) * n;
      const th = o.dither === false ? 0.5 : bayer4(x, y);
      let k = Math.floor(t + (t % 1 > th ? 1 : 0) - (t % 1));
      k = clamp(Math.floor(t) + ((t % 1) > th ? 1 : 0), 0, n - 1);
      spr.d[i] = ramp[k];
    }
    return f;
  }
  // 1px sel-out outline: pixels outside next to the shape; darker toward bottom-right
  function outline(spr, dark, lite = dark, o = {}) {
    const w = spr.w, h = spr.h, src = spr.d.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      const L = x > 0 && src[y * w + x - 1], Rr = x < w - 1 && src[y * w + x + 1], T = y > 0 && src[(y - 1) * w + x], Bm = y < h - 1 && src[(y + 1) * w + x];
      if (!(L || Rr || T || Bm)) continue;
      if (o.skipBottom && T && !L && !Rr && !Bm) continue;
      spr.d[y * w + x] = (Rr || Bm) && !(L && !Rr) ? lite : dark;
      if (T && !L && !Rr) spr.d[y * w + x] = dark;
    }
  }
  // inner edge line (darken the shape's own boundary on the shadow side)
  function rimDark(spr, idx, sideOnly = true) {
    const w = spr.w, h = spr.h, src = spr.d.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!src[i]) continue;
      const R2 = x < w - 1 ? src[i + 1] : 0, B2 = y < h - 1 ? src[i + w] : 0;
      if (!R2 || !B2) spr.d[i] = idx;
      else if (!sideOnly) { const L2 = x > 0 ? src[i - 1] : 0, T2 = y > 0 ? src[i - w] : 0; if (!L2 || !T2) spr.d[i] = idx; }
    }
  }
  function mask(w, h, fn) { const m = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = fn(x, y) ? 1 : 0; return m; }
  function blobMask(w, h, cx, cy, rx, ry, seed, rough = 0.18, freq = 3) {
    return mask(w, h, (x, y) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
      const r = 1 + (vnoise(Math.cos(a) * freq + 5, Math.sin(a) * freq + 5, seed) - 0.5) * rough * 2 + (vnoise(Math.cos(a) * freq * 3, Math.sin(a) * freq * 3, seed + 9) - 0.5) * rough * 0.7;
      return dx * dx + dy * dy < r * r;
    });
  }

  /* ================= PROPS ================= */
  // boulder / stone: o.flat (bottom cut), o.moss (ramp), o.cracks, o.wet (bottom darker)
  function rock(M, w, h, seed, o = {}) {
    const s = new ISpr(w + 2, h + 2);
    const R0 = o.ramp || M.rock;
    const mk = blobMask(s.w, s.h, s.w / 2, s.h * (o.flat === false ? 0.5 : 0.6), w / 2, (o.flat === false ? h / 2 : h * 0.62), seed, o.rough ?? 0.16, o.freq ?? 2.6);
    if (o.flat !== false) for (let y = Math.floor(s.h - 2); y < s.h; y++) for (let x = 0; x < s.w; x++) mk[y * s.w + x] = 0;
    shade(s, mk, R0, { depth: Math.max(3, Math.min(w, h) * 0.32), seed, noise: 0.18, amb: 0.18 });
    const r = rng(seed);
    // cracks
    const nc = o.cracks ?? Math.floor(w / 14);
    for (let c = 0; c < nc; c++) {
      let x = s.w * (0.25 + r() * 0.5), y = s.h * (0.2 + r() * 0.5), a = Math.PI * (0.3 + r() * 0.4);
      for (let k = 0; k < 3 + r() * (h / 4); k++) { if (s.get(x | 0, y | 0)) s.set(x | 0, y | 0, R0[0]); x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.9; }
    }
    // speckles + highlights
    for (let k = 0; k < w * h * 0.03; k++) { const x = (r() * s.w) | 0, y = (r() * s.h) | 0, v = s.get(x, y); if (v) s.set(x, y, R0[Math.min(R0.length - 1, R0.indexOf(v) + (r() < 0.5 ? 1 : -1))] || v); }
    if (o.moss) {
      const f = field(mk, s.w, s.h);
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x; if (!mk[i]) continue;
        const top = y > 0 ? !mk[i - s.w] : true;
        const up = (y < s.h * 0.45 ? 1 : 0) * (vnoise(x * 0.3, y * 0.3, seed + 3) > 0.42 ? 1 : 0);
        if ((top || (up && f[i] < 3)) && vnoise(x * 0.25, 0, seed) > 0.3) s.d[i] = o.moss[top ? 2 : 1];
        else if (up && vnoise(x * 0.4, y * 0.4, seed + 5) > 0.62) s.d[i] = o.moss[bayer4(x, y) > 0.5 ? 1 : 0];
      }
    }
    if (o.wet) for (let y = Math.floor(s.h * 0.72); y < s.h; y++) for (let x = 0; x < s.w; x++) { const v = s.get(x, y); if (v && bayer4(x, y) < (y / s.h - 0.72) * 3) s.set(x, y, R0[Math.max(0, R0.indexOf(v) - 1)] || v); }
    outline(s, o.ol || M.ink[0], o.ol2 || o.ol || M.ink[0]);
    s.ax = Math.floor(s.w / 2); s.ay = s.h - 2;
    return s;
  }

  // leafy clump canopy made of many shaded balls. ramp: leaf ramp dark→light
  function foliage(s, balls, ramp, seed, o = {}) {
    const w = s.w, h = s.h;
    const r = rng(seed);
    const n = ramp.length;
    // union mask for silhouette jaggies
    for (const b of balls) {
      const [cx, cy, rad] = b;
      const x0 = Math.max(0, Math.floor(cx - rad - 2)), x1 = Math.min(w - 1, Math.ceil(cx + rad + 2)), y0 = Math.max(0, Math.floor(cy - rad - 2)), y1 = Math.min(h - 1, Math.ceil(cy + rad + 2));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        const edge = rad * (0.9 + 0.2 * vnoise(Math.atan2(dy, dx) * 2.2 + cx, 0.5, seed + (cx | 0)));
        const leafy = vnoise(x * 0.9, y * 0.9, seed + 11) * 2.2;
        if (d > edge + leafy - 1) continue;
        // ball-local sphere normal
        const nz = Math.sqrt(Math.max(0, 1 - (d / (edge + 1)) ** 2));
        let lit = (-dx / rad) * (o.lx ?? LX) * -1 * -1;
        lit = ((dx / rad) * (o.lx ?? LX) + (dy / rad) * (o.ly ?? LY)) * 0.8 + nz * 0.55 + (o.bias || 0);
        lit += (1 - (cy / h)) * (o.topLight ?? 0.25) - 0.1;
        lit += (vnoise(x * 0.6, y * 0.6, seed + 21) - 0.5) * 0.5; // leaf texture
        const t = clamp(lit * 0.72 + 0.18, 0, 0.999) * n;
        const k = clamp(Math.floor(t) + ((t % 1) > bayer4(x, y) ? 1 : 0), 0, n - 1);
        const i = y * w + x;
        // later (upper/front) balls paint over earlier ones; keep a dark seam between clumps
        if (s.d[i] && d > edge - 1.2 && k > 1) { s.d[i] = ramp[Math.max(0, k - 2)]; continue; }
        s.d[i] = ramp[k];
      }
    }
    // tiny highlight flecks on the lit side
    for (let k = 0; k < balls.length * 3; k++) {
      const b = balls[(r() * balls.length) | 0];
      const x = b[0] - b[2] * 0.35 + (r() - 0.5) * b[2] * 0.6, y = b[1] - b[2] * 0.4 + (r() - 0.5) * b[2] * 0.4;
      if (s.get(x | 0, y | 0)) { s.set(x | 0, y | 0, ramp[n - 1]); if (r() < 0.5) s.set((x | 0) + 1, y | 0, ramp[n - 1]); }
    }
  }

  // broadleaf tree: trunk + branches + clump crown. o: {trunkRamp, leafRamp, ol, crownW, crownH, roots, vines}
  function tree(M, H, seed, o = {}) {
    const r = rng(seed);
    const CW = o.crownW || H * 0.9, CH = o.crownH || H * 0.62;
    const w = Math.ceil(Math.max(CW + 16, H * 0.5)), h = Math.ceil(H + 6);
    const s = new ISpr(w, h);
    const TR = o.trunkRamp || M.bark, LR = o.leafRamp || M.leaf;
    const bx = w / 2, by = h - 3;
    const tw = o.trunkW || Math.max(4, H * 0.07);
    const lean = (r() - 0.5) * 0.25;
    // trunk mask with flare + roots
    const tm = new Uint8Array(w * h);
    const topY = by - H + CH * 0.55;
    for (let y = Math.floor(topY); y <= by; y++) {
      const t = (by - y) / (by - topY);
      const cx = bx + lean * (by - y) + Math.sin(t * 3 + seed) * 1.5;
      let half = tw * (1 - t * 0.45) + (t < 0.12 ? (0.12 - t) * tw * 7 : 0);
      if (o.roots && t < 0.2) half += (0.2 - t) * tw * 6;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) if (x >= 0 && x < w) tm[y * w + x] = 1;
    }
    // branches
    const nb = 2 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) {
      const t0 = 0.45 + r() * 0.35, y0 = by - (by - topY) * t0, dir = k % 2 ? 1 : -1;
      let x = bx + lean * (by - y0), y = y0, a = -Math.PI / 2 + dir * (0.5 + r() * 0.5);
      const len = H * (0.18 + r() * 0.15);
      for (let j = 0; j < len; j++) {
        const th = Math.max(1, tw * 0.45 * (1 - j / len));
        for (let yy = -th; yy <= th; yy++) for (let xx = -th; xx <= th; xx++) { const X = Math.round(x + xx), Y = Math.round(y + yy); if (X >= 0 && Y >= 0 && X < w && Y < h) tm[Y * w + X] = 1; }
        x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.12;
      }
    }
    shade(s, tm, TR, { depth: tw * 0.9, seed, noise: 0.2, lx: -0.9, ly: -0.1 });
    // bark lines
    for (let k = 0; k < tw * 1.5; k++) {
      let x = bx + (r() - 0.5) * tw * 1.4, y = by - r() * (by - topY) * 0.8;
      for (let j = 0; j < 4 + r() * 8; j++) { if (tm[(y | 0) * w + (x | 0)]) s.set(x, y, TR[0]); y -= 1; x += (r() - 0.5) * 0.6; }
    }
    // crown clumps
    const balls = [];
    const cx0 = bx + lean * H * 0.6, cy0 = by - H + CH * 0.5;
    const nball = Math.round(8 + CW * CH / 180);
    for (let k = 0; k < nball; k++) {
      const a = r() * TAU, rr = Math.sqrt(r());
      const x = cx0 + Math.cos(a) * rr * CW * 0.42, y = cy0 + Math.sin(a) * rr * CH * 0.4 + CH * 0.05;
      balls.push([x, y, CH * (0.16 + r() * 0.12)]);
    }
    balls.sort((a, b) => a[1] - b[1] || b[0] - a[0]);
    balls.reverse(); // back (lower) clumps first... draw top ones last
    balls.sort((a, b) => b[1] - a[1]);
    foliage(s, balls, LR, seed, { topLight: 0.35 });
    if (o.fruit) for (let k = 0; k < (o.fruitN || 6); k++) { const b = balls[(r() * balls.length) | 0]; const x = b[0] + (r() - 0.5) * b[2], y = b[1] + b[2] * 0.3 * r(); if (s.get(x | 0, y | 0)) { s.set(x, y, o.fruit[1]); s.set(x + 1, y, o.fruit[2]); s.set(x, y + 1, o.fruit[0]); s.set(x + 1, y + 1, o.fruit[1]); } }
    if (o.vines) for (let k = 0; k < 5; k++) { const b = balls[(r() * balls.length) | 0]; let x = b[0] + (r() - 0.5) * b[2], y = b[1] + b[2] * 0.5; const L = 6 + r() * H * 0.3; for (let j = 0; j < L; j++) { s.under(x, y, LR[j % 3 === 0 ? 1 : 0]); if (r() < 0.2) s.under(x + 1, y, LR[2]); y++; x += Math.sin(j * 0.3 + k) * 0.3; } }
    outline(s, o.ol || M.ink[0], o.ol2 || o.ol || M.ink[0]);
    s.ax = Math.round(bx); s.ay = by;
    return s.trim(1);
  }

  // palm tree (frames = sway) → [ISpr...]
  function palm(M, H, seed, o = {}) {
    const r = rng(seed);
    const frames = [];
    const lean = o.lean ?? (r() - 0.5) * 0.7;
    const fronds = o.fronds || 7;
    const fr = [];
    for (let k = 0; k < fronds; k++) fr.push({ a: -Math.PI / 2 + (k / (fronds - 1) - 0.5) * Math.PI * 1.35 + (r() - 0.5) * 0.2, L: H * (0.34 + r() * 0.12), droop: 0.9 + r() * 0.4 });
    for (let f = 0; f < 3; f++) {
      const w = Math.ceil(H * 1.2), h = Math.ceil(H + 10);
      const s = new ISpr(w, h);
      const bx = w / 2, by = h - 3;
      // trunk: curved segments with rings
      const TR = M.palmTrunk;
      let tx = bx, ty = by;
      const top = [0, 0];
      const pts = [];
      for (let k = 0; k <= H * 0.8; k++) {
        const t = k / (H * 0.8);
        tx = bx + lean * H * 0.5 * t * t + Math.sin(t * 2 + seed) * 2 + (f - 1) * t * t * 1.2;
        ty = by - k;
        pts.push([tx, ty, t]);
      }
      top[0] = tx; top[1] = ty;
      for (const [x, y, t] of pts) {
        const half = Math.max(2, (H * 0.05) * (1 - t * 0.4) + (t < 0.08 ? (0.08 - t) * 30 : 0));
        for (let xx = -half; xx <= half; xx++) {
          const u = xx / half;
          const ring = (Math.floor(y + t * 3) % 5 === 0) ? 1 : 0;
          const k = clamp(Math.floor((1 - (u + 0.35) * 0.9) * TR.length * 0.7 + 1) - ring, 0, TR.length - 1);
          s.set(x + xx, y, TR[k]);
        }
      }
      // coconuts
      if (o.nuts !== false) for (let k = 0; k < 3; k++) { const nx = top[0] + (k - 1) * 4, ny = top[1] + 4 + (k % 2); for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy <= 5) s.set(nx + xx, ny + yy, M.nut[xx + yy < -1 ? 2 : xx + yy > 1 ? 0 : 1]); }
      // fronds: arching leaves with leaflets
      const LR = M.palmLeaf;
      for (const q of fr) {
        const sway = Math.sin(f * 2.1 + q.a * 3) * 0.06;
        for (let j = 0; j < q.L; j++) {
          const t = j / q.L;
          const ang = q.a + sway + t * t * q.droop * Math.sign(Math.cos(q.a) || 0.01) * 1.1;
          const x = top[0] + Math.cos(q.a + sway) * j, y = top[1] + Math.sin(q.a + sway) * j * 0.55 + t * t * q.L * q.droop * 0.75;
          s.set(x, y, LR[1]);
          // leaflets hanging down from the spine
          const ll = Math.round((1 - Math.abs(t - 0.35)) * 6 * (1 - t * 0.5));
          for (let k = 1; k <= ll; k++) {
            const lx = x + Math.cos(ang + 1.9) * k * 0.4, ly = y + k * 0.9;
            s.set(lx, ly, LR[k < 2 ? 3 : k < 4 ? 2 : 1]);
            if (j % 2 === 0) s.set(lx + 1, ly, LR[k < 3 ? 2 : 0]);
          }
          for (let k = 1; k <= ll * 0.6; k++) s.set(x - Math.cos(ang + 1.9) * k * 0.3, y - k * 0.5, LR[k < 2 ? 3 : 2]);
        }
      }
      outline(s, M.ink[1] || M.ink[0], M.ink[1] || M.ink[0]);
      s.ax = Math.round(bx); s.ay = by;
      frames.push(s);
    }
    return frames;
  }

  // grass tuft frames (3-frame sway). o.flowers: [ramp...]
  function tuft(M, w, h, seed, o = {}) {
    const r = rng(seed), frames = [];
    const blades = [];
    const n = Math.max(3, Math.round(w * (o.density || 0.8)));
    for (let k = 0; k < n; k++) blades.push({ x: r() * w, h: h * (0.45 + r() * 0.55), c: (r() * 3) | 0, bend: (r() - 0.5) * 1.2 });
    const GR = o.ramp || M.grass;
    for (let f = 0; f < 3; f++) {
      const s = new ISpr(w + 6, h + 2);
      for (const b of blades) {
        const sway = (f - 1) * 1.1;
        for (let j = 0; j < b.h; j++) {
          const t = j / b.h;
          const x = b.x + 3 + (b.bend + sway) * t * t * 2.2, y = h + 1 - j;
          s.set(x, y, GR[clamp(Math.floor(t * (GR.length - 1) + (b.c - 1) * 0.5 + 0.3), 0, GR.length - 1)]);
        }
      }
      if (o.flowers) for (let k = 0; k < (o.nf || 2); k++) { const b = blades[(r() * blades.length) | 0], fx = b.x + 3 + (b.bend + (f - 1) * 1.1) * 2.2, fy = h + 1 - b.h; const FR = o.flowers[k % o.flowers.length]; s.set(fx, fy, FR[1]); s.set(fx - 1, fy, FR[0]); s.set(fx + 1, fy, FR[0]); s.set(fx, fy - 1, FR[0]); s.set(fx, fy + 1, FR[0]); s.set(fx, fy, M.flowerC ? M.flowerC[0] : FR[1]); }
      s.ax = 3 + Math.round(w / 2); s.ay = h + 1;
      frames.push(s);
    }
    return frames;
  }

  // fern: fan of fronds
  function fern(M, size, seed, o = {}) {
    const r = rng(seed), w = Math.ceil(size * 2.2), h = Math.ceil(size * 1.2);
    const s = new ISpr(w, h), LR = o.ramp || M.leaf;
    const bx = w / 2, by = h - 1;
    const n = 5 + (r() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.4;
      const L = size * (0.7 + r() * 0.35);
      for (let j = 0; j < L; j++) {
        const t = j / L;
        const x = bx + Math.cos(a) * j, y = by + Math.sin(a) * j * 0.8 + t * t * L * 0.5;
        s.set(x, y, LR[1]);
        const ll = Math.round(Math.sin(t * Math.PI) * 3.2);
        for (let q = 1; q <= ll; q++) { s.set(x + Math.cos(a - 1.3) * q, y + Math.sin(a - 1.3) * q + q * 0.3, LR[q === 1 ? 3 : 2]); s.set(x + Math.cos(a + 1.3) * q, y + Math.sin(a + 1.3) * q + q * 0.3, LR[q === 1 ? 2 : 1]); }
      }
    }
    outline(s, o.ol || M.ink[1] || M.ink[0]);
    s.ax = Math.round(bx); s.ay = by;
    return s.trim(1);
  }

  // bush: low foliage blob with optional berries/flowers
  function bush(M, w, h, seed, o = {}) {
    const r = rng(seed), s = new ISpr(w + 4, h + 3);
    const balls = [];
    const n = 4 + Math.round(w / 8);
    for (let k = 0; k < n; k++) balls.push([2 + w * (0.15 + 0.7 * (k / (n - 1))) + (r() - 0.5) * 4, h + 1 - h * (0.35 + r() * 0.25), h * (0.32 + r() * 0.18)]);
    for (let k = 0; k < n / 2; k++) balls.push([2 + w * (0.25 + r() * 0.5), h + 1 - h * (0.55 + r() * 0.2), h * (0.3 + r() * 0.12)]);
    balls.sort((a, b) => b[1] - a[1]);
    foliage(s, balls, o.ramp || M.leaf, seed, { topLight: 0.3 });
    if (o.dots) for (let k = 0; k < (o.nd || 6); k++) { const x = 2 + r() * w, y = h * (0.2 + r() * 0.6); if (s.get(x | 0, y | 0)) { s.set(x, y, o.dots[1]); s.set(x + 1, y, o.dots[0]); s.set(x, y - 1, o.dots[2] || o.dots[1]); } }
    outline(s, o.ol || M.ink[0], o.ol2 || o.ol || M.ink[0]);
    s.ax = Math.round(s.w / 2); s.ay = h + 1;
    return s.trim(1);
  }

  // tiny details --------------------------------------------------------
  const MINI = {
    shell1: ['..a..', '.aba.', 'abcba', 'bcccb', '.ddd.'],
    shell2: ['.aab', 'abbc', 'bccd', '.cdd'],
    shell3: ['.ab.', 'abcb', 'bccd', 'bcd.', '.d..'],
    conch: ['..ab', '.abc', 'abcc', 'bccd', 'cdd.'],
    star: ['..a..', '.aba.', 'abcba', '.b.b.', 'b...b'],
    pebble: ['.ab.', 'abbc', 'bccd'],
    pebble2: ['ab', 'bc'],
    twig: ['a....', '.ab..', '..bb.', '....c'],
    leaf: ['.ab', 'abc', 'bc.'],
    flower: ['.a.', 'aba', '.a.'],
    clover: ['a.a', '.b.', 'a.a'],
    crab: ['a...a', '.aba.', 'abbba', '.a.a.'],
    mush: ['.aaa.', 'abbba', '..c..', '..c..'],
  };
  // stamp a mini sprite with a ramp (a..d → ramp[3..0])
  function mini(s, key, x, y, ramp, flip = false) {
    const m = MINI[key], H = m.length, W = m[0].length;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = m[r][flip ? W - 1 - c : c];
      if (ch === '.') continue;
      const k = { a: 3, b: 2, c: 1, d: 0 }[ch];
      s.set(x + c, y + r, ramp[Math.min(ramp.length - 1, k)] ?? ramp[0]);
    }
  }
  function miniSpr(key, ramp, flip = false) {
    const m = MINI[key], s = new ISpr(m[0].length, m.length);
    mini(s, key, 0, 0, ramp, flip); s.ax = Math.floor(s.w / 2); s.ay = s.h - 1;
    return s;
  }

  /* ================= BACKGROUNDS ================= */
  // mountain / hill range strip. o: {ramp, snow, base (y of foot), amp, freq, seed, rim}
  function ridge(s, M, o) {
    const w = s.w, h = s.h, rmp = o.ramp, n = rmp.length;
    const base = o.base ?? h, amp = o.amp ?? h * 0.6, seed = o.seed || 0, fq = o.freq || 0.004;
    const top = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let v = fbm(x * fq, 0.5, seed, 5);
      v = Math.pow(v, o.pow || 1.4);
      if (o.peaks) { let p = 0; for (const pk of o.peaks) p = Math.max(p, Math.max(0, 1 - Math.abs(x - pk[0]) / pk[1]) * pk[2]); v = Math.max(v * 0.8, p); }
      top[x] = base - v * amp;
    }
    for (let x = 0; x < w; x++) {
      const sl = (top[Math.min(w - 1, x + 2)] - top[Math.max(0, x - 2)]) / 4; // >0 going down to the right
      for (let y = Math.max(0, Math.floor(top[x])); y < h; y++) {
        const dep = y - top[x];
        // lit side = slope rising to the left (facing the upper-left light)
        let lit = 0.55 + clamp(sl * 1.4, -0.45, 0.45) - dep / (amp * 1.6) * 0.5;
        lit += (fbm(x * 0.05, y * 0.05, seed + 7, 3) - 0.5) * 0.35;
        // gullies
        lit -= Math.max(0, fbm(x * 0.03, y * 0.012, seed + 13, 3) - 0.62) * 1.2;
        const t = clamp(lit, 0, 0.999) * n;
        let k = clamp(Math.floor(t) + ((t % 1) > bayer4(x, y) ? 1 : 0), 0, n - 1);
        let idx = rmp[k];
        if (o.snow && dep < (o.snowD || 10) + fbm(x * 0.08, 0, seed + 3) * 10 && top[x] < base - amp * (o.snowLine ?? 0.55)) idx = o.snow[clamp(k, 0, o.snow.length - 1)];
        if (o.fade && y > h - o.fade.h) { const f = (y - (h - o.fade.h)) / o.fade.h; if (bayer4(x, y) < f) idx = o.fade.idx; }
        s.set(x, y, idx);
      }
      if (o.rim && top[x] >= 0 && sl < 0.2) s.set(x, Math.floor(top[x]), o.rim);
    }
    return top;
  }
  // lumpy tree-line silhouette (forest canopy seen far away)
  function treeline(s, o) {
    const w = s.w, h = s.h, rmp = o.ramp, n = rmp.length, seed = o.seed || 0;
    const base = o.base ?? h * 0.5, size = o.size || 8;
    const top = new Float32Array(w).fill(1e9);
    // crowns: overlapping bumps
    const r = rng(seed);
    let x = -size;
    const crowns = [];
    while (x < w + size) { const rad = size * (0.6 + r() * 0.8); crowns.push([x, base - rad * (0.4 + r() * 0.9) - (o.jag ? r() * o.jag : 0), rad]); x += rad * (0.7 + r() * 0.5); }
    for (const [cx, cy, rad] of crowns) for (let xx = Math.floor(cx - rad); xx <= cx + rad; xx++) { if (xx < 0 || xx >= w) continue; const t = Math.sqrt(Math.max(0, 1 - ((xx - cx) / rad) ** 2)); top[xx] = Math.min(top[xx], cy - t * rad * 0.8); }
    for (let xx = 0; xx < w; xx++) {
      for (let y = Math.max(0, Math.floor(top[xx])); y < h; y++) {
        const d = y - top[xx];
        // each crown lit at its upper-left
        let lit = 0.35 + (d < 3 ? 0.35 : 0) - d / (h * 1.2);
        lit += (vnoise(xx * 0.3, y * 0.3, seed + 3) - 0.5) * 0.45;
        const cr = crowns.find((c) => Math.abs(c[0] - xx) < c[2]);
        if (cr) lit += (cr[0] - xx) / cr[2] * 0.25;
        const t = clamp(lit, 0, 0.999) * n;
        const k = clamp(Math.floor(t) + ((t % 1) > bayer4(xx, y) ? 1 : 0), 0, n - 1);
        s.set(xx, y, rmp[k]);
      }
    }
    return top;
  }
  // cumulus cloud (indices 1..4 = shadow..lit), returns ISpr
  function cloud(w, h, seed, o = {}) {
    const s = new ISpr(w, h), r = rng(seed);
    const balls = [];
    const n = Math.round(4 + w / 14);
    for (let k = 0; k < n; k++) { const t = k / (n - 1); balls.push([w * (0.12 + t * 0.76) + (r() - 0.5) * 6, h * 0.7 - Math.sin(t * Math.PI) * h * (0.25 + r() * 0.2), h * (0.2 + Math.sin(t * Math.PI) * 0.22 + r() * 0.08)]); }
    for (let k = 0; k < n / 2; k++) balls.push([w * (0.25 + r() * 0.5), h * 0.45 - r() * h * 0.2, h * (0.18 + r() * 0.15)]);
    for (const [cx, cy, rad] of balls) for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > rad) continue;
      if (y > h * 0.78 + vnoise(x * 0.2, 0, seed) * 3) continue; // flat base
      const nz = Math.sqrt(1 - (d / rad) ** 2);
      const lit = (-dx / rad) * 0.35 + (-dy / rad) * 0.55 + nz * 0.35 + (o.lit ?? 0);
      const t = clamp(lit + 0.35, 0, 0.999) * 4;
      const k = clamp(Math.floor(t) + ((t % 1) > bayer4(x, y) ? 1 : 0), 0, 3);
      const i = y * w + x;
      if (s.d[i] < k + 1 || d < rad - 1.5) s.d[i] = k + 1;
    }
    // base shading
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (s.d[i] && y > h * 0.6 && s.d[i] > 1 && bayer4(x, y) < (y / h - 0.6) * 2.5) s.d[i] -= 1; }
    return s;
  }

  // broad-leaf clump (foreground occluders read well even when depth-blurred)
  // kind: 'grass' (long tapered blades) | 'leaf' (round leaves on stems) | 'frond' (fern-like fronds)
  function clump(ramp, w, h, seed, kind = 'grass', o = {}) {
    const r = rng(seed), s = new ISpr(w, h), n = ramp.length;
    const cx = w / 2, by = h - 1;
    const count = o.n ?? (kind === 'leaf' ? 7 : 9);
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (k / Math.max(1, count - 1) - 0.5) * (o.spread ?? 1.9) + (r() - 0.5) * 0.25;
      const L = h * (0.55 + r() * 0.45), W0 = (o.thick ?? (kind === 'grass' ? w * 0.07 : w * 0.05)) * (0.7 + r() * 0.5);
      const bend = (r() - 0.5) * 0.9 + Math.cos(a) * 0.6;
      if (kind === 'leaf') {
        // stem then a round leaf
        let x = cx + (r() - 0.5) * w * 0.2, y = by;
        const ex = cx + Math.cos(a) * L * 0.7, ey = by + Math.sin(a) * L * 0.8;
        for (let j = 0; j <= 30; j++) { const t = j / 30; s.set(lerp(x, ex, t), lerp(y, ey, t) - Math.sin(t * Math.PI) * 6, ramp[1]); }
        const lr = w * (0.12 + r() * 0.06);
        for (let yy = -lr; yy <= lr; yy++) for (let xx = -lr * 1.2; xx <= lr * 1.2; xx++) {
          const d = (xx / (lr * 1.2)) ** 2 + (yy / lr) ** 2; if (d > 1) continue;
          const lit = 0.55 - xx / (lr * 3) - yy / (lr * 3) + (Math.abs(xx) < 1 ? -0.25 : 0);
          const v = clamp(lit, 0, 0.999) * n; s.set(ex + xx, ey + yy, ramp[clamp(Math.floor(v) + ((v % 1) > bayer4(xx | 0, yy | 0) ? 1 : 0), 0, n - 1)]);
        }
        continue;
      }
      // tapered blade: walk along a curve, paint a width profile, lighter on the upper edge
      const steps = Math.ceil(L);
      for (let j = 0; j < steps; j++) {
        const t = j / steps;
        const ang = a + bend * t * t;
        const x = cx + Math.cos(a) * j * 0.35 + Math.sin(t * 1.3) * bend * 8 + (Math.cos(ang) * j * 0.65);
        const y = by + Math.sin(a) * j * 0.9 + t * t * L * 0.12 * Math.abs(bend);
        const half = Math.max(0.5, W0 * (1 - t) * (kind === 'frond' ? 0.6 : 1));
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        for (let q = -half; q <= half; q += 0.5) {
          const u = (q + half) / (2 * half);
          let lit = 0.35 + u * 0.45 + (1 - t) * 0.1 - (Math.abs(q) < 0.6 ? 0.2 : 0);
          const v = clamp(lit, 0, 0.999) * n;
          s.set(x + nx * q, y + ny * q, ramp[clamp(Math.floor(v) + ((v % 1) > bayer4(j, q | 0) ? 1 : 0), 0, n - 1)]);
        }
        if (kind === 'frond' && j % 3 === 0) for (let q = 1; q < half * 3; q++) { s.set(x + nx * (half + q), y + ny * (half + q) + q * 0.4, ramp[2]); s.set(x - nx * (half + q), y - ny * (half + q) + q * 0.4, ramp[1]); }
      }
    }
    s.ax = Math.round(cx); s.ay = by;
    return s;
  }

  // decorate the tips of a clump/tuft: flowers, seed heads or berries (small clusters at the highest pixels)
  function tips(s, ramp, n, seed, size = 1.4) {
    const r = rng(seed), m = ramp.length;
    for (let k = 0; k < n; k++) {
      const x = Math.floor(r() * s.w); let y = 0;
      while (y < s.h && !s.get(x, y)) y++;
      if (y >= s.h - 3) continue;
      const rr = size * (0.7 + r() * 0.6);
      for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++) {
        if (xx * xx + yy * yy > rr * rr + 0.5) continue;
        s.set(Math.round(x + xx), Math.round(y + yy), ramp[clamp(Math.round((m - 1) * (0.75 - yy / (rr * 3) - xx / (rr * 4))), 0, m - 1)]);
      }
      if (m > 2) s.set(x, y, ramp[m - 1]);
    }
    return s;
  }
  // an outline in the darkest ramp colour so foreground shapes read crisply
  function edge(s, c) {
    const out = s.clone ? s.clone() : s;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (!s.get(x, y) && (s.get(x - 1, y) || s.get(x + 1, y) || s.get(x, y - 1) || s.get(x, y + 1))) out.set(x, y, c);
    return out;
  }
  return { tips, edge, clump, blit, blitSway, field, shade, outline, rimDark, mask, blobMask, rock, foliage, tree, palm, tuft, fern, bush, mini, miniSpr, MINI, ridge, treeline, cloud };
})();
