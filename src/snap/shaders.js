/* ------------------------------------------------------------------
   Shaders — a "shader pack" over the finished pixel frame:
    · god rays: light streams from the sun (or moon) through every gap
      where the sky still shows — between trees, clouds, rooftops
    · reflections: ponds, puddles, rivers and the sea mirror the world
      above them, wobbling with the ripples, with a glittering sun path
    · drifting cloud shadows across the land on sunny days
    · a soft lens flare when you look toward the sun
    · filmic colour grading per time of day: gentle contrast curve,
      highlight roll-off, richer colour and split toning (warm lights,
      cool shadows; golden afternoons, pink dawns, blue moonlit nights)
   Heavy passes switch off by themselves when the device struggles.
------------------------------------------------------------------- */
const Shaders = (() => {
  const { clamp, mix, bayer4, hash } = U;
  const Q = { on: true, lw: 0, lh: 0, occ: null, out: null, lut: null, lutKey: '' };
  const GRADE = {
    dawn: { con: 1.07, sat: 1.1, sh: [-4, 0, 12], hi: [14, 6, -2], ray: 0.62, rc: '#ffc8a0', cs: 0.06, fl: 0.7 },
    noon: { con: 1.1, sat: 1.14, sh: [-6, 0, 9], hi: [9, 6, -4], ray: 0.34, rc: '#fff4d8', cs: 0.14, fl: 0.9 },
    afternoon: { con: 1.1, sat: 1.12, sh: [-4, -2, 10], hi: [16, 8, -8], ray: 0.5, rc: '#ffe0a0', cs: 0.13, fl: 1 },
    dusk: { con: 1.12, sat: 1.14, sh: [-2, -6, 14], hi: [20, 5, -10], ray: 0.7, rc: '#ffa870', cs: 0.05, fl: 0.9 },
    night: { con: 1.08, sat: 0.97, sh: [-4, 0, 14], hi: [0, 8, 16], ray: 0.22, rc: '#a8c4ff', cs: 0, fl: 0 },
  };
  const CAVE = { con: 1.12, sat: 1.12, sh: [0, -3, 12], hi: [8, 5, 0] };
  const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (qs && qs.has('noshaders')) Q.on = false;
  // smooth (bilinear) value from the stage's noise table
  function nb(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, N = Stage.noiseAt; const a = N(ix, iy), b = N(ix + 1, iy), c = N(ix, iy + 1), e = N(ix + 1, iy + 1); return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy; }
  const lum = (c) => ((c & 255) * 77 + ((c >>> 8) & 255) * 150 + ((c >>> 16) & 255) * 29) >> 8;

  /* ---------- reflections + sun glitter on marked water ---------- */
  function reflect(fb, t) {
    const S = Stage.S; if (!S.wmUsed || !S.wm) return;
    const W = fb.w, H = fb.h, d = fb.d, wm = S.wm, wc = S.wc;
    const night = S.hour === 'night', sp = S.sunPos, kH = night ? 0.7 : 1;
    const glit = sp && sp.vis > 0.3 && S.hour !== 'night', gx = sp ? sp.x : 0, tq = Math.floor(t * 5);
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (!wm[y * W + x]) { y++; continue; }
        const y0 = y; while (y < H && wm[y * W + x]) y++;
        const len = y - y0;
        for (let yy = y0; yy < y; yy++) {
          const i = yy * W + x;
          if (d[i] !== wc[i]) continue; // something stands in front of the water here
          const dy = yy - y0, src = y0 - 1 - Math.floor(dy * 0.92);
          if (src < 0) break;
          const wob = Math.round(Math.sin(t * 1.7 + yy * 0.8 + x * 0.03) * (0.5 + dy * 0.05));
          const xs = x + wob < 0 ? 0 : x + wob >= W ? W - 1 : x + wob;
          const fres = (0.5 * Math.pow(Math.max(0, 1 - dy / (len + 10)), 1.2) + 0.1) * kH;
          let c = mix(wc[i], d[src * W + xs], fres);
          if (glit) { const g = Math.exp(-Math.abs(x - gx) / (6 + dy * 0.7)); if (g > 0.05 && hash(x >> 1, yy, tq) > 1 - g * 0.35) c = U.screen(c, 0xffffffff, 0.85); }
          d[i] = c;
        }
      }
    }
    wm.fill(0); S.wmUsed = false;
  }
  /* ---------- drifting cloud shadows ---------- */
  function clouds(fb, cx, cy, t, L) {
    const S = Stage.S; if (!L.cs || !S.skyOn || Weather.W.rain > 0.5) return;
    const W = fb.w, H = fb.h, d = fb.d, sky = S.skyBuf, yEnd = S.skyEnd, hz = Math.max(0, S.skyHz);
    const drift = (typeof Wind !== 'undefined' ? Wind.off * 3 : t * 4), k = L.cs * (1 - Weather.W.rain);
    const SH = 0xff40281a;
    for (let y = hz; y < H; y++) {
      const wy = (y + cy) * 0.14, row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (y < yEnd && d[i] === sky[i]) continue;
        const n = nb((x + cx + drift) * 0.07, wy);
        if (n < 0.56) continue;
        const a = Math.min(1, (n - 0.56) * 9) * k;
        if (a > bayer4(x, y) * 0.06) d[i] = mix(d[i], SH, a);
      }
    }
  }
  /* ---------- god rays ---------- */
  function rays(fb, t, L) {
    const S = Stage.S, sp = S.sunPos;
    if (!S.skyOn || !sp || sp.vis < 0.2 || !L.ray) return null;
    const W = fb.w, H = fb.h, d = fb.d, sky = S.skyBuf, yEnd = S.skyEnd;
    if (sp.x < -W * 0.7 || sp.x > W * 1.7 || sp.y < -H * 0.8 || sp.y > H * 1.1) return null;
    const lw = (W >> 2) + 2, lh = (H >> 2) + 2;
    if (Q.lw !== lw || Q.lh !== lh) { Q.lw = lw; Q.lh = lh; Q.occ = new Float32Array(lw * lh); Q.out = new Float32Array(lw * lh); }
    const occ = Q.occ, out = Q.out, R = W * 0.2;
    let seen = 0, near = 0;
    for (let ly = 0; ly < lh; ly++) {
      const y = Math.min(H - 1, ly * 4 + 1);
      for (let lx = 0; lx < lw; lx++) {
        const x = Math.min(W - 1, lx * 4 + 1), i = y * W + x, j = ly * lw + lx;
        let v = 0;
        if (y < yEnd) {
          const a = d[i] === sky[i] ? 1 : 0, b = x + 2 < W && d[i + 2] === sky[i + 2] ? 1 : 0;
          if (a + b) { const l = lum(sky[i]) / 255; v = (a + b) * 0.5 * l * l * l; }
        }
        const dd = Math.hypot(x - sp.x, y - sp.y);
        if (v > 0) { v *= Math.exp(-dd / R); if (dd < sp.r * 2) { v = Math.max(v, 1.4); near++; } seen++; }
        occ[j] = v;
      }
    }
    if (!seen) return null;
    // radial blur toward the light
    const N = 22, sx = sp.x / 4, sy = sp.y / 4, dens = 0.9, decay = 0.95;
    for (let ly = 0; ly < lh; ly++) for (let lx = 0; lx < lw; lx++) {
      let px = lx, py = ly, sum = 0, wgt = 1;
      const dx = ((sx - lx) * dens) / N, dy = ((sy - ly) * dens) / N;
      for (let k = 0; k < N; k++) {
        px += dx; py += dy;
        const ix = px | 0, iy = py | 0;
        if (ix >= 0 && iy >= 0 && ix < lw && iy < lh) sum += occ[iy * lw + ix] * wgt;
        wgt *= decay;
      }
      out[ly * lw + lx] = sum / N;
    }
    // composite (bilinear up-sample, screen blend in the light's colour)
    const rc = U.hex(L.rc), str = L.ray * sp.vis * (1 - Weather.W.rain * 0.6) * (1 + Weather.W.fog * 0.9) * 1.25;
    for (let y = 0; y < H; y++) {
      const fy = y / 4, iy = Math.min(lh - 2, fy | 0), ty = fy - iy, row = y * W;
      for (let x = 0; x < W; x++) {
        const fx = x / 4, ix = Math.min(lw - 2, fx | 0), tx = fx - ix, j = iy * lw + ix;
        const v = ((out[j] * (1 - tx) + out[j + 1] * tx) * (1 - ty) + (out[j + lw] * (1 - tx) + out[j + lw + 1] * tx) * ty) * str;
        if (v < 0.012) continue;
        const i = row + x; d[i] = U.screen(d[i], rc, v > 0.42 ? 0.42 : v);
      }
    }
    return near;
  }
  /* ---------- lens flare ---------- */
  function flare(fb, L, near) {
    const sp = Stage.S.sunPos; if (!sp || sp.kind !== 'sun' || !L.fl || !near) return;
    const W = fb.w, H = fb.h, d = fb.d;
    if (sp.x < 0 || sp.x >= W || sp.y < 0 || sp.y >= H) return;
    const k = Math.min(1, near / 3) * L.fl * sp.vis, cxm = W / 2, cym = H / 2;
    const G = [[0.55, 3, '#ffe8b0', 0.18], [0.95, 7, '#8affd8', 0.08], [1.35, 12, '#b89aff', 0.07], [1.7, 4, '#ffffff', 0.14], [2.1, 18, '#ffb070', 0.05]];
    for (const [f, r, col, a] of G) {
      const gx = sp.x + (cxm - sp.x) * f, gy = sp.y + (cym - sp.y) * f, c = U.hex(col);
      for (let y = Math.max(0, Math.floor(gy - r)); y < Math.min(H, gy + r); y++) for (let x = Math.max(0, Math.floor(gx - r)); x < Math.min(W, gx + r); x++) {
        const q = Math.hypot(x - gx, y - gy) / r; if (q >= 1) continue;
        const i = y * W + x; d[i] = U.screen(d[i], c, a * k * (q > 0.8 ? 1.4 : 1 - q * 0.5));
      }
    }
    // anamorphic streak
    const sy = Math.round(sp.y), sc = U.hex('#dff0ff');
    for (let x = 0; x < W; x++) { const a = Math.max(0, 1 - Math.abs(x - sp.x) / (W * 0.45)) ** 2 * 0.3 * k; if (a < 0.01) continue; for (const [dy, m] of [[0, 1], [-1, 0.45], [1, 0.45]]) { const y = sy + dy; if (y >= 0 && y < H) { const i = y * W + x; d[i] = U.screen(d[i], sc, a * m); } } }
  }
  /* ---------- filmic grade ---------- */
  function buildLut(G) {
    const lut = new Uint8Array(768), tone = new Int16Array(768);
    for (let v = 0; v < 256; v++) {
      let y = 0.5 + (v / 255 - 0.5) * G.con;
      if (y > 0.82) y = 0.82 + (y - 0.82) * 0.62; // soft shoulder: highlights roll off instead of clipping
      if (y < 0.06) y = 0.06 * Math.pow(Math.max(0, y) / 0.06, 1.15); // toe
      const o = Math.round(clamp(y, 0, 1) * 255);
      lut[v] = o; lut[256 + v] = o; lut[512 + v] = o;
      const l = v / 255, ws = (1 - l) * (1 - l), wh = l * l;
      for (let c = 0; c < 3; c++) tone[c * 256 + v] = Math.round(G.sh[c] * ws + G.hi[c] * wh);
    }
    return { lut, tone, sat: Math.round(G.sat * 256) };
  }
  function grade(fb) {
    if (!Q.on) return;
    const A = Game.area; if (!A) return;
    const hr = Stage.S.hour, cave = A.def.noSky || A.def.cave;
    const key = cave ? 'cave|' + hr : hr;
    if (Q.lutKey !== key) { const g = cave ? Object.assign({}, CAVE, hr === 'night' ? { sh: [-2, -2, 16] } : {}) : GRADE[hr] || GRADE.noon; Q.lut = buildLut(g); Q.lutKey = key; }
    const { lut, tone, sat } = Q.lut, d = fb.d, n = d.length;
    for (let i = 0; i < n; i++) {
      const c = d[i];
      let r = lut[c & 255], g = lut[256 + ((c >>> 8) & 255)], b = lut[512 + ((c >>> 16) & 255)];
      const l = (r * 77 + g * 150 + b * 29) >> 8;
      r = l + (((r - l) * sat) >> 8) + tone[l]; g = l + (((g - l) * sat) >> 8) + tone[256 + l]; b = l + (((b - l) * sat) >> 8) + tone[512 + l];
      d[i] = 0xff000000 | ((b < 0 ? 0 : b > 255 ? 255 : b) << 16) | ((g < 0 ? 0 : g > 255 ? 255 : g) << 8) | (r < 0 ? 0 : r > 255 ? 255 : r);
    }
  }
  /* ---------- the pass, after the scene and before bloom ---------- */
  function apply(fb, cx, cy, t) {
    const S = Stage.S;
    if (!Q.on || !Game.area) { S.skyOn = false; if (S.wm && S.wmUsed) { S.wm.fill(0); S.wmUsed = false; } return; }
    const L = Game.area.def.noSky ? { ray: 0, cs: 0, fl: 0 } : GRADE[S.hour] || GRADE.noon;
    reflect(fb, t);
    if (!Game.lowFx) {
      clouds(fb, cx, cy, t, L);
      const near = rays(fb, t, L);
      flare(fb, L, near);
    }
    S.skyOn = false;
  }
  return Object.assign(Q, { apply, grade, GRADE });
})();
