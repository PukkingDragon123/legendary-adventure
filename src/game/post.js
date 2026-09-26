/* ------------------------------------------------------------------
   Post — screen-space lighting passes over the finished frame:
   bloom (bright pixels bleed soft light), the dock lamp's glow and
   its shimmering reflection at dusk and night, and a cool underwater
   colour wash when the camera dips below the surface.
------------------------------------------------------------------- */
const Post = (() => {
  let bw = 0, bh = 0, acc = null, tmp = null;
  const DS = 4;
  function bloom(fb, strength, thresh) {
    const W = fb.w, H = fb.h, d = fb.d;
    const w = Math.ceil(W / DS), h = Math.ceil(H / DS);
    if (w !== bw || h !== bh) { bw = w; bh = h; acc = new Float32Array(w * h * 3); tmp = new Float32Array(w * h * 3); }
    acc.fill(0);
    for (let y = 0; y < H; y += 2) {
      const row = y * W, by = ((y / DS) | 0) * w;
      for (let x = 0; x < W; x += 2) {
        const c = d[row + x], r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
        const l = r * 0.3 + g * 0.55 + b * 0.15;
        if (l < thresh) continue;
        const k = (l - thresh) / (255 - thresh), j = (by + ((x / DS) | 0)) * 3;
        acc[j] += r * k; acc[j + 1] += g * k; acc[j + 2] += b * k;
      }
    }
    // two box-blur passes on the small buffer
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = -2; k <= 2; k++) { const xx = Math.min(w - 1, Math.max(0, x + k)), j = (y * w + xx) * 3; r += acc[j]; g += acc[j + 1]; b += acc[j + 2]; }
        const j = (y * w + x) * 3; tmp[j] = r / 5; tmp[j + 1] = g / 5; tmp[j + 2] = b / 5;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = -2; k <= 2; k++) { const yy = Math.min(h - 1, Math.max(0, y + k)), j = (yy * w + x) * 3; r += tmp[j]; g += tmp[j + 1]; b += tmp[j + 2]; }
        const j = (y * w + x) * 3; acc[j] = r / 5; acc[j + 1] = g / 5; acc[j + 2] = b / 5;
      }
    }
    const s = strength / 4;
    for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
      const x1c = Math.min(w - 1, bx + 1), y1c = Math.min(h - 1, by + 1);
      const j00 = (by * w + bx) * 3, j01 = (by * w + x1c) * 3, j10 = (y1c * w + bx) * 3, j11 = (y1c * w + x1c) * 3;
      const mx = Math.max(acc[j00] + acc[j00 + 1], acc[j01] + acc[j01 + 1], acc[j10] + acc[j10 + 1], acc[j11] + acc[j11 + 1]);
      if (mx * s < 3) continue;
      const X0 = bx * DS + (DS >> 1), Y0 = by * DS + (DS >> 1);
      for (let yy = 0; yy < DS; yy++) {
        const y = Y0 + yy;
        if (y >= H) break;
        const ty = yy / DS, row = y * W;
        for (let xx = 0; xx < DS; xx++) {
          const x = X0 + xx;
          if (x >= W) break;
          const tx = xx / DS, a00 = (1 - tx) * (1 - ty), a01 = tx * (1 - ty), a10 = (1 - tx) * ty, a11 = tx * ty;
          const r = (acc[j00] * a00 + acc[j01] * a01 + acc[j10] * a10 + acc[j11] * a11) * s;
          const g = (acc[j00 + 1] * a00 + acc[j01 + 1] * a01 + acc[j10 + 1] * a10 + acc[j11 + 1] * a11) * s;
          const b = (acc[j00 + 2] * a00 + acc[j01 + 2] * a01 + acc[j10 + 2] * a10 + acc[j11 + 2] * a11) * s;
          const i = row + x, c = d[i];
          d[i] = (0xff000000 | Math.min(255, (((c >> 16) & 255) + b) | 0) << 16 | Math.min(255, (((c >> 8) & 255) + g) | 0) << 8 | Math.min(255, ((c & 255) + r) | 0)) >>> 0;
        }
      }
    }
  }
  function glow(fb, x, y, r, col, a) {
    const cr = col & 255, cg = (col >> 8) & 255, cb = (col >> 16) & 255, W = fb.w, d = fb.d;
    for (let yy = Math.max(0, Math.floor(y - r)); yy < Math.min(fb.h, y + r); yy++) for (let xx = Math.max(0, Math.floor(x - r)); xx < Math.min(W, x + r); xx++) {
      const q = Math.hypot(xx - x, yy - y) / r;
      if (q >= 1) continue;
      const f = (1 - q) * (1 - q) * a, i = yy * W + xx, c = d[i];
      d[i] = (0xff000000 | Math.min(255, ((c >> 16) & 255) + cb * f) << 16 | Math.min(255, ((c >> 8) & 255) + cg * f) << 8 | Math.min(255, (c & 255) + cr * f)) >>> 0;
    }
  }
  function apply(fb, P, cx, cy, t, G) {
    const h = P.key, night = h === 'night' ? 1 : h === 'dusk' ? 0.6 : 0;
    // dock lamp: warm halo, and a broken column of light on the water below it
    const lamp = Scene.S.pier && Scene.S.pier.lamp;
    if (lamp && night > 0) {
      const lx = lamp[0] - cx, ly = lamp[1] - cy;
      if (lx > -120 && lx < fb.w + 120) {
        glow(fb, lx, ly, 70, PX.hex('#ffc860'), 0.55 * night);
        glow(fb, lx, ly, 14, PX.hex('#fff4c0'), 0.9 * night);
        const sy0 = World.SEA - cy;
        for (let k = 0; k < 90; k++) {
          const y = Math.round(sy0 + k), x = Math.round(lx + Math.sin(k * 0.5 + t * 3) * (2 + k * 0.08));
          if (y < 0 || y >= fb.h || x < 1 || x >= fb.w - 1 || (k + Math.floor(t * 6)) % 3 === 0) continue;
          glow(fb, x, y, 3, PX.hex('#ffd878'), (1 - k / 90) * 0.7 * night);
        }
      }
    }
    // bloom: stronger at dusk/night so lights, glints and the sun really glow
    bloom(fb, night ? 0.9 : 0.42, night ? 150 : 228);
    // underwater camera: a gentle cool wash and light shafts dancing across the view
    const under = G.cam.y + fb.h * 0.5 - World.SEA;
    if (under > 40) {
      const k = Math.min(1, (under - 40) / 200) * 0.12, d = fb.d;
      for (let i = 0; i < d.length; i += 1) {
        const c = d[i];
        d[i] = (0xff000000 | Math.min(255, (((c >> 16) & 255) * (1 + k)) | 0) << 16 | Math.min(255, (((c >> 8) & 255) * (1 + k * 0.4)) | 0) << 8 | (((c & 255) * (1 - k)) | 0)) >>> 0;
      }
    }
  }
  return { apply, glow, bloom };
})();
