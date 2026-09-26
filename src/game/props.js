/* ------------------------------------------------------------------
   Props — palette-indexed sprites (so a change of hour only swaps the
   palette) plus a few procedurally animated things (kelp, grass).
------------------------------------------------------------------- */
const Props = (() => {
  const { hash2, vnoise, fbm, rng, bayer4, mix, hex } = PX;
  const { clamp, lerp } = Scenery;

  /* ---- indexed sprite ---- */
  class ISprite {
    constructor(w, h) { this.w = w; this.h = h; this.idx = new Uint8Array(w * h); }
    set(x, y, v) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.idx[y * this.w + x] = v; }
    get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.idx[y * this.w + x] : 0; }
    outline(ol, only = null) {
      const src = this.idx.slice(), w = this.w, h = this.h;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (src[i]) continue;
          const n = [x > 0 ? src[i - 1] : 0, x < w - 1 ? src[i + 1] : 0, y > 0 ? src[i - w] : 0, y < h - 1 ? src[i + w] : 0];
          const hit = n.find((v) => v && (!only || only(v)));
          if (hit) this.idx[i] = typeof ol === 'function' ? ol(hit) : ol;
        }
      return this;
    }
  }
  // blit with palette lookup; optional occupancy mark
  function blit(fb, s, x, y, pal, occ = null, occV = 2, flip = false) {
    x = Math.round(x); y = Math.round(y);
    const W = fb.w, H = fb.h, d = fb.d;
    const x0 = Math.max(0, -x), x1 = Math.min(s.w, W - x), y0 = Math.max(0, -y), y1 = Math.min(s.h, H - y);
    for (let sy = y0; sy < y1; sy++) {
      const row = sy * s.w, trow = (y + sy) * W + x;
      for (let sx = x0; sx < x1; sx++) {
        const v = s.idx[row + (flip ? s.w - 1 - sx : sx)];
        if (!v) continue;
        d[trow + sx] = pal[v];
        if (occ) occ[trow + sx] = occV;
      }
    }
  }
  function hit(s, lx, ly) { return s.get(Math.round(lx), Math.round(ly)) !== 0; }

  /* ---- palette indices ---- */
  const I = {
    TRUNK: 1, LEAF: 5, SPINE: 9, POL: 10, NUT: 11, ROCK: 14, ROL: 19, WOOD: 20, WOL: 24, SAND: 25, SOL: 29,
    CORA: 30, CORB: 34, CORC: 38, KELP: 42, KOL: 46, RED: 47, WHITE: 51, GOLD: 52, CHEST: 56, MOSS: 60, BARN: 61, SHELL: 62, STAR: 63,
    ROPE: 64, INK: 65, GLASS: 66, FLAG: 67, POL2: 68, CORAL_OL: 69, LAMP: 70,
    CORD: 71, CORE: 75, CORF: 79, CORG: 83, SPONGE: 87, ANEM: 91, TIP: 95, ABYSS: 96,
  };
  const palCache = {};
  function palette(P) {
    if (palCache[P.key]) return palCache[P.key];
    const p = new Uint32Array(128);
    const g = P.grader || ((c) => c);
    const put = (base, arr) => arr.forEach((c, k) => { p[base + k] = c; });
    put(I.TRUNK, P.palm.trunk); put(I.LEAF, P.palm.leaf); p[I.SPINE] = P.palm.spine; p[I.POL] = P.palm.outline; put(I.NUT, P.palm.nut);
    put(I.ROCK, P.rock); p[I.ROL] = mix(P.rock[0], hex('#000010'), 0.45);
    put(I.WOOD, P.wood); p[I.WOL] = mix(P.wood[0], hex('#000000'), 0.4);
    put(I.SAND, P.sand); p[I.SOL] = mix(P.sand[0], hex('#201000'), 0.45);
    const cor = P.coral;
    const ramp = (c) => [mix(c, hex('#1a0a30'), 0.45), mix(c, hex('#1a0a30'), 0.2), c, mix(c, hex('#ffffff'), 0.35)];
    put(I.CORA, ramp(cor[0])); put(I.CORB, ramp(cor[2])); put(I.CORC, ramp(cor[3]));
    const kelp = [mix(P.palm.leaf[0], hex('#3a2a10'), 0.3), mix(P.palm.leaf[1], hex('#5a4a10'), 0.25), mix(P.palm.leaf[2], hex('#7a6a20'), 0.2), mix(P.palm.leaf[3], hex('#b0a040'), 0.2)];
    put(I.KELP, kelp); p[I.KOL] = mix(kelp[0], hex('#000000'), 0.35);
    put(I.RED, [g(hex('#8e2230'), 0), g(hex('#c63c3c'), 1), g(hex('#e85a4a'), 2), g(hex('#ff8a6a'), 3)]);
    p[I.WHITE] = g(hex('#f4f2ea'), 3);
    put(I.GOLD, [g(hex('#8a5a10'), 0), g(hex('#c89020'), 1), g(hex('#f0c040'), 2), g(hex('#fff0a0'), 3)]);
    put(I.CHEST, [g(hex('#3a2010'), 0), g(hex('#5e3618'), 1), g(hex('#8a5424'), 2), g(hex('#b07838'), 3)]);
    p[I.MOSS] = mix(P.grass[1], P.rock[2], 0.3); p[I.BARN] = mix(P.rock[4], hex('#ffffff'), 0.3);
    p[I.SHELL] = g(hex('#f2b8a8'), 2); p[I.STAR] = g(hex('#f07a4a'), 2);
    p[I.ROPE] = mix(P.wood[3], P.sand[3], 0.5); p[I.INK] = mix(P.rock[0], hex('#000000'), 0.5); p[I.GLASS] = g(hex('#9fd9f2'), 3);
    p[I.FLAG] = g(hex('#e84a4a'), 2); p[I.POL2] = mix(P.palm.outline, P.palm.leaf[0], 0.5); p[I.CORAL_OL] = mix(cor[0], hex('#100420'), 0.6);
    p[I.LAMP] = hex('#ffe9a0');
    // extra reef colours (yellow, teal, red, violet), sponge orange and anemone pink, graded to the hour
    const gr = (hx) => { const c = g(hex(hx), 2); return ramp(mix(c, cor[1], 0.15)); };
    put(I.CORD, gr('#ffd24a')); put(I.CORE, gr('#3ad0c0')); put(I.CORF, gr('#ff5a4a')); put(I.CORG, gr('#8a6aff')); put(I.SPONGE, gr('#ff9a3a')); put(I.ANEM, gr('#ff8ad0'));
    p[I.TIP] = g(hex('#fff4e0'), 3);
    put(I.ABYSS, [hex('#05070e'), hex('#0a0e1a'), hex('#121a2a'), hex('#1c2638')]);
    palCache[P.key] = p;
    return p;
  }

  /* ---- palm tree (trunk sprite + swaying crown frames) ---- */
  function makePalm(o) {
    const { h = 440, lean = 0, seed = 3 } = o;
    const r = rng(seed);
    const W = 420, Hh = h + 200;
    const bx = W / 2, by = Hh - 6;
    const cx = bx + lean * h * 0.9, cy = by - h;
    const kx = bx + lean * h * 0.15 - lean * 40, ky = by - h * 0.55;
    const q = (s) => {
      const a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
      return [a * bx + b * kx + c * cx, a * by + b * ky + c * cy];
    };
    const trunk = new ISprite(W, Hh);
    const steps = 900;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const [x0, y0] = q(s), [x1, y1] = q(Math.min(1, s + 0.002));
      const tx = x1 - x0, ty = y1 - y0, tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const ww = lerp(22, 12, Math.pow(s, 0.7)) / 2 + (s < 0.05 ? (0.05 - s) * 90 : 0);
      const ringF = (s * h) / 11;
      const ring = ringF - Math.floor(ringF);
      for (let k = -ww; k <= ww; k += 0.35) {
        const side = k / ww;
        let tone = side < -0.55 ? 3 : side < 0.05 ? 2 : side < 0.6 ? 1 : 0;
        if (ring < 0.18) tone = Math.max(0, tone - 1);
        else if (ring > 0.82 && side < 0.3) tone = Math.min(3, tone + 1);
        // diamond bark pattern
        if (Math.abs(((ringF * 2 + side * 1.4) % 1) - 0.5) < 0.08 && tone > 0) tone -= 1;
        trunk.set(x0 + nx * k, y0 + ny * k, I.TRUNK + tone);
      }
    }
    trunk.outline(I.POL);
    // crown frames
    const CW = 360, CH = 250, ccx = CW / 2, ccy = 70;
    const fr = [];
    const nF = 11;
    for (let i = 0; i < nF; i++) {
      const u = i / (nF - 1);
      const a = -Math.PI / 2 + (u - 0.5) * 4.3 + (r() - 0.5) * 0.25;
      fr.push({ a, len: 120 + r() * 40, droop: 0.55 + r() * 0.4, ph: r() * 6.28, back: Math.abs(Math.cos(a)) < 0.4 });
    }
    fr.sort((A, B) => (A.back === B.back ? 0 : A.back ? -1 : 1));
    const frames = [];
    for (let f = 0; f < 6; f++) {
      const sway = Math.sin((f / 6) * Math.PI * 2);
      const cs = new ISprite(CW, CH);
      for (const F of fr) {
        const sw = sway * 0.045 + Math.sin(F.ph + f * 1.05) * 0.02;
        const dx = Math.cos(F.a + sw), dy = Math.sin(F.a + sw);
        const N = 90;
        const pts = [];
        for (let k = 0; k <= N; k++) {
          const s = k / N, dd = F.len * s;
          pts.push([ccx + dx * dd, ccy + dy * dd * 0.66 + F.droop * F.len * s * s * 0.72 + sway * s * s * 3]);
        }
        for (let k = 2; k <= N; k++) {
          const s = k / N;
          const [x, y] = pts[k], [px, py] = pts[k - 1];
          const tx = x - px, ty = y - py, tl = Math.hypot(tx, ty) || 1;
          const ll = Math.sin(Math.PI * Math.min(1, s * 1.05)) * 30 + 5;
          for (const sd of [-1, 1]) {
            let lx = (-ty / tl) * sd - (tx / tl) * 0.75, ly = (tx / tl) * sd - (ty / tl) * 0.75 + 1.0;
            const ln = Math.hypot(lx, ly); lx /= ln; ly /= ln;
            const upper = ly < 0.15;
            const segs = Math.ceil(ll);
            const wid = s < 0.85 ? 2 : 1;
            for (let j = 0; j <= segs; j++) {
              const uu = j / segs;
              const X = x + lx * ll * uu, Y = y + ly * ll * uu + uu * uu * 5;
              let tone = upper ? (uu < 0.5 ? 3 : 2) : uu < 0.3 ? 2 : uu < 0.7 ? 1 : 0;
              if ((k & 3) === 0 && tone > 0) tone -= 1;
              for (let w2 = 0; w2 < (uu < 0.7 ? wid : 1); w2++) cs.set(X + w2 * (sd > 0 ? 0 : 0), Y + w2, I.LEAF + tone);
            }
          }
        }
        for (let k = 0; k < N; k++) {
          const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
          const c = k < N * 0.75 ? I.SPINE : I.LEAF + 3;
          cs.set(x0, y0 - 1, c); cs.set((x0 + x1) / 2, (y0 + y1) / 2 - 1, c);
        }
      }
      cs.outline(I.POL);
      frames.push(cs);
    }
    // coconut slots around the crown centre (in world offsets from the trunk base)
    const nuts = [[-12, 12], [10, 14], [-1, 20], [18, 6], [-20, 4]].map(([dx, dy]) => ({ dx: cx - bx + dx, dy: cy - by + dy + 4 }));
    return { trunk, frames, bx, by, crownX: cx, crownY: cy, ccx, ccy, nuts, W, H: Hh };
  }

  /* ---- boulder ---- */
  function makeRock(w, h, seed, opts = {}) {
    const W = w + 4, Hh = h + 4;
    const s = new ISprite(W, Hh);
    const cx = W / 2, cy = Hh - 2;
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - cx) / (w / 2), v = (cy - (y + 0.5)) / h;
        if (v < 0) continue;
        const n = (fbm(x * 0.07, y * 0.07, seed, 3) - 0.5) * 0.55;
        const dd = u * u + v * v * 1.0 + n;
        if (dd > 1) continue;
        const lit = -u * 0.55 + v * 0.9 + (fbm(x * 0.15, y * 0.15, seed + 5, 2) - 0.5) * 0.5;
        let tn = lit > 0.85 ? 4 : lit > 0.45 ? 3 : lit > 0.05 ? 2 : lit > -0.35 ? 1 : 0;
        if (dd > 0.9 && tn > 1) tn -= 1;
        // cracks
        if (Math.abs(vnoise(x * 0.09, y * 0.09, seed + 9) - 0.5) < 0.018 && tn > 0) tn = 0;
        s.set(x, y, (opts.dark ? I.ABYSS : I.ROCK) + tn);
      }
    // moss / algae on top, barnacles near the base
    if (opts.moss) for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) {
      if (!s.get(x, y)) continue;
      if (!s.get(x, y - 2) && hash2(x, y, seed) < 0.7) s.set(x, y, I.MOSS);
      break;
    }
    if (opts.barnacles) for (let k = 0; k < w * 0.4; k++) {
      const x = Math.floor(hash2(k, seed, 1) * W), y = Math.floor(Hh - 3 - hash2(k, seed, 2) * h * 0.5);
      if (s.get(x, y) && s.get(x + 1, y)) { s.set(x, y, I.BARN); if (hash2(k, 3, seed) < 0.5) s.set(x + 1, y, I.BARN); }
    }
    s.outline(I.ROL);
    return s;
  }

  /* ---- dock: a low harbour jetty — tiled plank deck, fat round posts rising above it
     with iron chains slung between them, cross-bracing below, steps down to the water and
     a lamp post (its globe glows at dusk and night, see Scene.lampAt) ---- */
  function makePier() {
    const { x0, x1, deck, posts } = World.PIER;
    const W = x1 - x0 + 40, top = deck - 70, bottom = World.SEA + 220;
    const Hh = bottom - top;
    const s = new ISprite(W, Hh);
    const X = (wx) => wx - x0 + 20, Y = (wy) => wy - top;
    const wood = (x, y, tn) => s.set(x, y, I.WOOD + Math.max(0, Math.min(3, tn)));
    // diagonal cross-bracing between the posts, under the deck
    for (let i = 0; i < posts.length - 1; i++) {
      if (World.groundAt(posts[i]) < World.SEA + 20) continue; // bracing only out over the water
      const a = X(posts[i]), b = X(posts[i + 1]), yA = Y(deck + 14), yB = Y(World.SEA + 30);
      for (let k = 0; k <= b - a; k++) { const u = k / (b - a); s.set(a + k, Math.round(yA + (yB - yA) * u), I.WOOD); s.set(a + k, Math.round(yB + (yA - yB) * u), I.WOOD + 1); }
    }
    // posts: round logs with a lit left edge, growth rings, dark caps
    for (const px of posts) {
      const gy = Math.min(World.groundAt(px) + (World.groundAt(px) < World.SEA ? 3 : 8), bottom);
      for (let y = Y(deck - 40); y < Y(gy); y++)
        for (let k = -6; k <= 6; k++) {
          let tn = k < -3 ? 3 : k < 0 ? 2 : k < 4 ? 1 : 0;
          if ((y * 5 + k * 3) % 23 === 0) tn -= 1;
          if (y % 38 < 2) tn = 0;
          wood(X(px) + k, y, tn);
        }
      for (let k = -6; k <= 6; k++) { wood(X(px) + k, Y(deck - 41), 3); wood(X(px) + k, Y(deck - 40), k < 0 ? 3 : 2); }
      for (let k = -5; k <= 5; k++) s.set(X(px) + k, Y(deck - 42), I.WOOD + 2);
    }
    // deck: a tiled top face (planks seen at a low angle) above a thick front beam
    for (let x = 0; x < W; x++) {
      for (let y = Y(deck); y < Y(deck + 5); y++) {
        const row = y - Y(deck), off = row % 2 ? 9 : 0, seam = (x + off) % 18 === 0;
        let tn = row === 0 ? 3 : 2;
        if (seam) tn = 0; else if (((x + off) * 13 + row * 7) % 31 === 0) tn = 1;
        wood(x, y, tn);
      }
      for (let y = Y(deck + 5); y < Y(deck + 14); y++) {
        const plank = x % 26 === 0, bolt = x % 26 === 4 && (y === Y(deck + 7) || y === Y(deck + 11));
        const tn = y === Y(deck + 5) ? 1 : y < Y(deck + 9) ? 2 : 1;
        s.set(x, y, bolt ? I.INK : plank ? I.WOOD : I.WOOD + tn);
      }
      s.set(x, Y(deck + 14), I.WOOD);
    }
    // iron chains slung between post tops
    for (let i = 0; i < posts.length - 1; i++) {
      const a = X(posts[i]) + 6, b = X(posts[i + 1]) - 6;
      for (let x = a; x <= b; x++) {
        const u = (x - a) / (b - a), y = Math.round(Y(deck - 34) + Math.sin(u * Math.PI) * 16), ph = (x - a) % 6;
        if (ph < 3) { s.set(x, y - 1, I.INK); s.set(x, y + 1, I.INK); if (ph !== 1) s.set(x, y, I.INK); }
        else s.set(x, y, I.INK);
      }
    }
    // steps down to the water at the far end
    for (let k = 0; k < 4; k++) for (let x = 0; x < 14; x++) for (let y = 0; y < 3; y++) wood(X(x1) + 6 + x + k * 4, Y(deck + 16 + k * 9) + y, y === 0 ? 3 : 1);
    // lamp post with a glass globe
    const lx = X(x0 + 245);
    for (let y = Y(deck - 58); y < Y(deck); y++) { s.set(lx, y, I.INK); s.set(lx + 1, y, I.INK); }
    for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) if (xx * xx + yy * yy <= 25) s.set(lx + xx, Y(deck - 64) + yy, xx * xx + yy * yy > 16 ? I.INK : (xx < -1 && yy < -1 ? I.WHITE : I.LAMP));
    // a mooring bollard and a crate
    for (let y = Y(deck - 10); y < Y(deck); y++) for (let k = -3; k <= 3; k++) s.set(X(x0 + 150) + k, y, I.INK);
    for (let y = Y(deck - 16); y < Y(deck); y++) for (let k = 0; k < 18; k++) s.set(X(x0 + 560) + k, y, I.CHEST + ((k % 6 === 0 || y === Y(deck - 16)) ? 0 : k < 6 ? 3 : 2));
    s.outline(I.WOL);
    return { s, x: x0 - 20, y: top, lamp: [x0 + 245, deck - 64] };
  }

  /* ---- corals ---- */
  function makeCoral(kind, seed, size = 1, o = {}) {
    const r = rng(seed);
    const W = Math.round(90 * size), Hh = Math.round(80 * size);
    const s = new ISprite(W, Hh);
    const bases = { fan: I.CORC, brain: I.CORB, branch: I.CORA };
    const base = o.base ?? bases[kind] ?? I.CORA;
    if (kind === 'tube') {
      // a cluster of hollow tubes with bright rims
      const n = 3 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const x0 = Math.round(W / 2 + (k - (n - 1) / 2) * 7 * size + (r() - 0.5) * 4), h = Math.round((24 + r() * 34) * size), w = Math.max(2, Math.round((3 + r() * 2) * size));
        for (let y = Hh - 2; y > Hh - 2 - h; y--) for (let x = -w; x <= w; x++) s.set(x0 + x, y, base + (x < -w / 2 ? 3 : x < w / 3 ? 2 : 1));
        for (let x = -w; x <= w; x++) { s.set(x0 + x, Hh - 2 - h, I.TIP); if (Math.abs(x) < w) s.set(x0 + x, Hh - 1 - h, base); }
      }
      s.outline(I.CORAL_OL); return s;
    }
    if (kind === 'anemone') {
      // round foot with a crown of fat wavy tentacles
      const cx = W / 2, top = Hh - 10 * size;
      for (let y = Math.round(top); y < Hh - 1; y++) for (let x = Math.round(cx - 9 * size); x < cx + 9 * size; x++) s.set(x, y, base + (x < cx - 3 ? 2 : 1));
      const n = 11;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI * (0.1 + 0.8 * k / (n - 1)), len = (14 + r() * 8) * size;
        for (let j = 0; j < len; j++) {
          const X = cx + Math.cos(a) * j + Math.sin(j * 0.4 + k) * 1.5, Y = top + Math.sin(a) * j;
          s.set(X, Y, base + (j > len - 2 ? 3 : 2)); s.set(X + 1, Y, base + 1);
        }
        s.set(cx + Math.cos(a) * len, top + Math.sin(a) * len, I.TIP);
      }
      s.outline(I.CORAL_OL); return s;
    }
    if (kind === 'table') {
      // flat plate coral on a short stalk
      const cx = W / 2, stem = Math.round(14 * size), pw = Math.round(34 * size), py = Hh - 2 - stem;
      for (let y = py; y < Hh - 1; y++) for (let x = -2; x <= 2; x++) s.set(cx + x, y, base + 1);
      for (let x = -pw; x <= pw; x++) { const th = Math.max(1, Math.round((1 - Math.abs(x / pw)) * 4)); for (let y = 0; y < th; y++) s.set(cx + x, py - y + Math.round((x / pw) ** 2 * 3), base + (y === th - 1 ? 3 : 2 - (x > pw / 2 ? 1 : 0))); }
      s.outline(I.CORAL_OL); return s;
    }
    if (kind === 'sponge') {
      // barrel sponge: a tall cup with ridges and a dark mouth
      const cx = W / 2, h = Math.round(40 * size), w0 = 8 * size;
      for (let y = 0; y < h; y++) { const w = w0 + y * 0.12 * size; for (let x = -w; x <= w; x++) { const ridge = Math.sin(y * 0.8) > 0.6; s.set(cx + x, Hh - 2 - y, base + (x < -w / 2 ? 3 : ridge ? 1 : 2)); } }
      const wt = w0 + h * 0.12 * size;
      for (let x = -wt + 2; x <= wt - 2; x++) s.set(cx + x, Hh - 1 - h, I.INK);
      s.outline(I.CORAL_OL); return s;
    }
    if (kind === 'branch' || kind === 'fan' || kind === 'stag') {
      const grow = (x, y, a, len, wdt, depth) => {
        for (let k = 0; k < len; k++) {
          const X = x + Math.cos(a) * k, Y = y + Math.sin(a) * k;
          for (let w2 = -wdt; w2 <= wdt; w2++) {
            const tone = w2 < 0 ? 3 : w2 === 0 ? 2 : 1;
            s.set(X + w2, Y, base + tone);
          }
        }
        if (depth <= 0) { s.set(x + Math.cos(a) * len, y + Math.sin(a) * len - 1, base + 3); return; }
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        const n = kind === 'fan' ? 3 : 2;
        if (kind === 'stag' && depth > 0) wdt = Math.max(wdt, 1);
        for (let i = 0; i < n; i++) grow(ex, ey, a + (i - (n - 1) / 2) * (kind === 'fan' ? 0.45 : 0.6) + (r() - 0.5) * 0.3, len * (0.62 + r() * 0.2), Math.max(0, wdt - 1), depth - 1);
      };
      const d0 = kind === 'fan' ? 4 : 4;
      grow(W / 2, Hh - 2, -Math.PI / 2 + (r() - 0.5) * 0.2, 22 * size, 2, d0);
    } else {
      // brain / mound coral with grooves
      const cx = W / 2, cy = Hh - 2, rw = W * 0.42, rh = Hh * 0.55;
      for (let y = 0; y < Hh; y++)
        for (let x = 0; x < W; x++) {
          const u = (x - cx) / rw, v = (cy - y) / rh;
          if (v < 0 || u * u + v * v > 1) continue;
          const groove = Math.sin(x * 0.55 + Math.sin(y * 0.4) * 2) > 0.6;
          const lit = -u * 0.5 + v * 0.8;
          let tn = lit > 0.6 ? 3 : lit > 0.1 ? 2 : lit > -0.4 ? 1 : 0;
          if (groove) tn = Math.max(0, tn - 1);
          s.set(x, y, base + tn);
        }
    }
    s.outline(I.CORAL_OL);
    return s;
  }

  /* ---- sandcastle with flag ---- */
  function makeSandcastle() {
    const W = 76, Hh = 74;
    const s = new ISprite(W, Hh);
    const tower = (x0, w, h, crenel) => {
      for (let y = Hh - h; y < Hh; y++)
        for (let x = x0; x < x0 + w; x++) {
          const side = (x - x0) / w;
          const tone = side < 0.3 ? 3 : side < 0.65 ? 2 : 1;
          const drip = y > Hh - h + 6 && (x * 13 + y) % 17 === 0;
          s.set(x, y, I.SAND + (drip ? Math.max(0, tone - 1) : tone));
        }
      if (crenel) for (let x = x0; x < x0 + w; x += 4) for (let y = Hh - h - 3; y < Hh - h; y++) { s.set(x, y, I.SAND + 2); s.set(x + 1, y, I.SAND + 2); }
    };
    tower(6, 64, 22, true);
    tower(14, 16, 40, true); tower(46, 16, 40, true);
    tower(28, 20, 54, true);
    // door & windows
    for (let y = Hh - 12; y < Hh; y++) for (let x = 34; x < 42; x++) s.set(x, y, I.SAND);
    for (const [x, y] of [[20, 44], [52, 44], [36, 26]]) { s.set(x, y, I.SAND); s.set(x + 1, y, I.SAND); s.set(x, y + 1, I.SAND); s.set(x + 1, y + 1, I.SAND); }
    // flag
    for (let y = 2; y < 22; y++) s.set(38, y, I.WOOD + 1);
    for (let y = 2; y < 9; y++) for (let x = 39; x < 39 + (9 - y) + 3; x++) s.set(x, y, I.FLAG);
    s.outline(I.SOL);
    return s;
  }

  /* ---- striped umbrella + towel ---- */
  function makeUmbrella() {
    const W = 150, Hh = 150;
    const s = new ISprite(W, Hh);
    const cx = 75, top = 20;
    for (let y = 30; y < Hh - 2; y++) { s.set(cx, y, I.WOOD + 2); s.set(cx + 1, y, I.WOOD + 1); }
    for (let y = 0; y < 34; y++)
      for (let x = 0; x < W; x++) {
        const u = (x - cx) / 72, v = (y - (top + 14)) / 30;
        if (u * u + v * v > 1 || v > 0.05 + (1 - Math.abs(u)) * 0.0) continue;
        if (y > top + 14 - Math.abs(Math.sin(u * 9)) * 3 && Math.abs(u) > 0.02) continue;
        const stripe = Math.floor((Math.atan2(v, u) + Math.PI) / (Math.PI / 7)) % 2;
        const shade = v > -0.3 ? 0 : v > -0.7 ? 1 : 2;
        s.set(x, y, stripe ? I.RED + 2 - Math.min(2, shade) + (shade === 0 ? 0 : 0) : I.WHITE);
        if (!stripe && shade === 0) s.set(x, y, I.WHITE);
      }
    s.set(cx, top - 1, I.WOOD + 3); s.set(cx, top - 2, I.WOOD + 3);
    s.outline(I.INK);
    return s;
  }
  function makeTowel() {
    const W = 110, Hh = 10;
    const s = new ISprite(W, Hh);
    for (let y = 2; y < Hh - 1; y++) for (let x = 2; x < W - 2; x++) s.set(x, y, ((x / 10) | 0) % 2 ? I.WHITE : I.RED + (y < 5 ? 3 : 2));
    s.outline(I.INK);
    return s;
  }

  /* ---- treasure chest ---- */
  function makeChest(open) {
    const W = 64, Hh = 52;
    const s = new ISprite(W, Hh);
    const body = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s.set(x, y, I.CHEST + ((y - y0) < 3 ? 3 : (x % 11) === 0 ? 1 : 2)); };
    body(6, 26, 58, 48);
    for (let x = 6; x < 58; x++) { s.set(x, 26, I.GOLD + 3); s.set(x, 37, I.GOLD + 1); }
    for (let y = 26; y < 48; y++) { s.set(6, y, I.GOLD + 2); s.set(57, y, I.GOLD + 1); s.set(31, y, I.GOLD + 2); s.set(32, y, I.GOLD + 1); }
    if (!open) {
      for (let y = 12; y < 26; y++) for (let x = 6; x < 58; x++) {
        const u = (x - 32) / 26, v = (26 - y) / 14;
        if (u * u * 0.25 + v * v > 1) continue;
        s.set(x, y, I.CHEST + (v > 0.7 ? 3 : 2));
      }
      for (let y = 30; y < 36; y++) for (let x = 29; x < 35; x++) s.set(x, y, I.GOLD + 2);
    } else {
      for (let y = 0; y < 16; y++) for (let x = 8; x < 56; x++) if ((x + y) % 9 !== 0) s.set(x, y + 4, I.CHEST + (y < 3 ? 3 : 1));
      for (let x = 10; x < 54; x++) s.set(x, 26, I.GOLD + 3);
      // pearl & coins
      for (let a = 0; a < 6.28; a += 0.2) s.set(32 + Math.cos(a) * 4, 22 + Math.sin(a) * 4, I.WHITE);
      for (let x = 14; x < 50; x += 3) s.set(x, 25, I.GOLD + 3);
    }
    s.outline(I.INK);
    return s;
  }

  /* ---- animated kelp strand ---- */
  function drawKelp(fb, cx, cy, x, baseY, len, seed, t, pal, occ) {
    const W = fb.w, H = fb.h;
    const r = rng(seed);
    const ph = r() * 6.28, amp = 6 + r() * 6;
    let px = x, py = baseY;
    for (let k = 0; k < len; k++) {
      const u = k / len;
      const ox = Math.sin(t * 1.3 + ph + u * 3.5) * amp * u + Math.sin(t * 0.6 + ph) * 2 * u;
      const X = Math.round(x + ox) - cx, Y = Math.round(baseY - k) - cy;
      const w = Math.round(lerp(3.5, 1.5, u) + (Math.sin(k * 0.45 + ph) > 0.6 ? 1.5 : 0));
      if (Y < 0 || Y >= H) continue;
      for (let j = -w; j <= w; j++) {
        const sx = X + j;
        if (sx < 0 || sx >= W) continue;
        const tone = j === -w || j === w ? -1 : j < 0 ? 3 : j === 0 ? 2 : 1;
        fb.d[Y * W + sx] = tone < 0 ? pal[I.KOL] : pal[I.KELP + tone];
        if (occ) occ[Y * W + sx] = 3;
      }
    }
  }
  /* ---- dune grass tuft ---- */
  function drawGrass(fb, cx, cy, x, baseY, n, seed, t, P) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const bx = x + (r() - 0.5) * 30, len = 14 + r() * 20, lean = (r() - 0.5) * 0.9;
      const sw = Math.sin(t * 1.6 + bx * 0.3) * 0.14;
      let px = bx, py = baseY;
      const segs = Math.ceil(len);
      for (let k = 0; k < segs; k++) {
        const u = k / segs;
        const a = -Math.PI / 2 + (lean + sw) * u * 1.6;
        px += Math.cos(a); py += Math.sin(a);
        fb.set(Math.round(px) - cx, Math.round(py) - cy, u < 0.3 ? P.grass[1] : u < 0.75 ? P.grass[2] : P.grass[3]);
      }
    }
  }

  return { ISprite, I, palette, blit, hit, makePalm, makeRock, makePier, makeCoral, makeSandcastle, makeUmbrella, makeTowel, makeChest, drawKelp, drawGrass };
})();
