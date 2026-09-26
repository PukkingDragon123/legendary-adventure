/* ------------------------------------------------------------------
   Scenery — the beach, painted one pixel at a time.
   Everything draws into a PX.Buf; static layers are baked once per
   painting, animated layers are redrawn every frame.
------------------------------------------------------------------- */
const Scenery = (() => {
  const { hex, mix, bayer4, bayer8, hash2, vnoise, fbm, rng, Buf } = PX;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;

  // memoised colour mixing (two-level cache: target colour -> source*33+step)
  const mixCache = new Map();
  const mixc = (a, b, t) => {
    const q = Math.round(t * 32);
    let inner = mixCache.get(b);
    if (!inner) { inner = new Map(); mixCache.set(b, inner); }
    const key = a * 33 + q;
    let r = inner.get(key);
    if (r === undefined) { r = mix(a, b, q / 32); inner.set(key, r); }
    return r;
  };

  /* ---------- gradients ---------- */
  // stops: [[t,color],...]; band = portion of each segment that is dithered (1 = full smooth)
  function vgrad(buf, y0, y1, stops, band = 0.55, x0 = 0, x1 = buf.w) {
    for (let y = Math.max(0, y0); y < Math.min(buf.h, y1); y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [ta, ca] = stops[k], [tb, cb] = stops[k + 1];
      let f = clamp((t - ta) / (tb - ta || 1), 0, 1);
      f = smooth(0.5 - band / 2, 0.5 + band / 2, f);
      const row = y * buf.w;
      for (let x = x0; x < x1; x++) buf.d[row + x] = bayer8(x, y) < f ? cb : ca;
    }
  }

  // Sky with a sun halo in one banded field: t = height (0 top..1 horizon) pushed toward the
  // horizon colours near the sun, then quantised through the stops with thin dither seams.
  function skyField(buf, y0, y1, stops, sun, band = 0.3) {
    for (let y = Math.max(0, y0); y < Math.min(buf.h, y1); y++)
      for (let x = 0; x < buf.w; x++) {
        let t = (y - y0) / Math.max(1, y1 - y0);
        if (sun) {
          const d = Math.hypot((x - sun.x) / (sun.sx || 1), (y - sun.y) / (sun.sy || 1));
          t += sun.k * Math.pow(Math.max(0, 1 - d / sun.r), sun.p || 1.6);
        }
        t = clamp(t, 0, 1);
        let k = 0;
        while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
        const [ta, ca] = stops[k], [tb, cb] = stops[k + 1];
        let f = clamp((t - ta) / (tb - ta || 1), 0, 1);
        f = smooth(0.5 - band / 2, 0.5 + band / 2, f);
        buf.d[y * buf.w + x] = bayer8(x, y) < f ? cb : ca;
      }
  }

  // banded radial glow toward `color`: solid rings with narrow dithered seams
  function glow(buf, cx, cy, r, color, strength = 0.6, test = null, ry = null, levels = 3, band = 0.3) {
    ry = ry || r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(buf.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(buf.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        if (test && !test(x, y)) continue;
        const f = (1 - d) * levels;
        let q = Math.floor(f);
        const fr = f - q;
        const th = smooth(0.5 - band / 2, 0.5 + band / 2, fr);
        if (bayer8(x, y) < th) q += 1;
        if (q <= 0) continue;
        const i = y * buf.w + x;
        buf.d[i] = mixc(buf.d[i], color, Math.min(1, (q / levels) * strength));
      }
  }

  /* ---------- clouds ---------- */
  function makeCloud(seed, w, h, pal, opts = {}) {
    const r = rng(seed);
    const puffs = [];
    const n = opts.puffs || 5 + Math.floor(r() * 3);
    const base = h - 2;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const mid = 1 - Math.abs(u - 0.5) * 1.3;
      const rad = h * (0.26 + 0.2 * mid + r() * 0.1);
      puffs.push({ x: w * (0.14 + 0.72 * u) + (r() - 0.5) * 4, y: base - rad * 0.72 - mid * h * 0.12, r: rad });
    }
    // a couple of upper puffs
    const up = opts.upper ?? 2;
    for (let i = 0; i < up; i++) {
      const rad = h * (0.24 + r() * 0.12);
      puffs.push({ x: w * (0.3 + r() * 0.4), y: base - h * 0.5 - rad * 0.3, r: rad });
    }
    const buf = new Buf(w, h);
    const flat = base - (opts.flat ?? 1);
    const L = opts.L || [-0.62, -0.78];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (y > flat) continue;
        let best = null, bs = -1;
        for (const p of puffs) {
          const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y;
          const v = 1 - Math.sqrt(dx * dx + dy * dy) / p.r;
          if (v <= 0) continue;
          const sc = v + (p.y / h) * 0.6;
          if (sc > bs) { bs = sc; best = p; }
        }
        if (!best) continue;
        const nx = (x + 0.5 - best.x) / best.r, ny = (y + 0.5 - best.y) / best.r;
        const lit = nx * L[0] + ny * L[1];
        const vert = (y - (flat - h * 0.95)) / (h * 0.95);
        let val = lit * 0.75 - vert * 0.55 + 0.35 + (bayer4(x, y) - 0.5) * 0.18;
        const t = val > 0.62 ? 3 : val > 0.2 ? 2 : val > -0.18 ? 1 : 0;
        buf.d[y * w + x] = pal[t];
      }
    // soft bottom edge: darker line along the flat base
    for (let x = 0; x < w; x++) {
      const i = Math.floor(flat) * w + x;
      if (buf.d[i]) buf.d[i] = pal[0];
    }
    return buf;
  }

  /* ---------- sea sparkles & glints ---------- */
  function makeGlints(seed, count, x0, x1, y0, y1) {
    const r = rng(seed);
    const g = [];
    for (let i = 0; i < count; i++) {
      const y = y0 + Math.pow(r(), 1.35) * (y1 - y0);
      const p = (y - y0) / (y1 - y0);
      g.push({
        x: x0 + r() * (x1 - x0), y: Math.floor(y), len: Math.max(1, Math.round(1 + p * 6 * r())),
        ph: r() * 6.28, sp: 0.8 + r() * 1.6, drift: (r() - 0.5) * 3,
      });
    }
    return g;
  }
  function drawGlints(buf, glints, t, cHi, cMid, test, x0 = 0, x1 = buf.w) {
    const span = x1 - x0;
    for (const g of glints) {
      const b = Math.sin(t * g.sp + g.ph);
      if (b < 0.25) continue;
      let x = g.x + g.drift * t;
      x = x0 + (((x - x0) % span) + span) % span;
      const len = b > 0.7 ? g.len : Math.max(1, g.len - 2);
      const col = b > 0.7 ? cHi : cMid;
      const xs = Math.round(x - len / 2);
      for (let k = 0; k < len; k++) {
        const px = xs + k;
        if (test && !test(px, g.y)) continue;
        buf.set(px, g.y, col);
      }
    }
  }

  /* 4-point twinkle star */
  function star(buf, x, y, size, c, c2) {
    x = Math.round(x); y = Math.round(y);
    buf.set(x, y, c);
    for (let k = 1; k <= size; k++) {
      const col = k === size && c2 ? c2 : c;
      buf.set(x + k, y, col); buf.set(x - k, y, col);
      buf.set(x, y + k, col); buf.set(x, y - k, col);
    }
    if (size >= 3 && c2) {
      buf.set(x + 1, y + 1, c2); buf.set(x - 1, y - 1, c2); buf.set(x + 1, y - 1, c2); buf.set(x - 1, y + 1, c2);
    }
  }

  /* ---------- palm tree ---------- */
  // Pre-renders `frames` sway poses. Coordinates are relative to the buffer.
  function makePalm(o) {
    const { pal, w = 120, h = 210, bx, by, kx, ky, cx, cy, fronds = 9, seed = 3, frames = 12, wBase = 12, wTop = 7, outline = true } = o;
    const out = [];
    for (let f = 0; f < frames; f++) {
      const sway = Math.sin((f / frames) * Math.PI * 2);
      const buf = new Buf(w, h);
      const r = rng(seed);
      const q = (s) => {
        const a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
        return [a * bx + b * kx + c * (cx + sway * 1.2), a * by + b * ky + c * cy];
      };
      // trunk
      const steps = 220;
      for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        const [x0, y0] = q(s);
        const [x1, y1] = q(Math.min(1, s + 0.005));
        const tx = x1 - x0, ty = y1 - y0, tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        const ww = lerp(wBase, wTop, s) / 2;
        const ring = (s * 30) % 1;
        for (let k = -ww; k <= ww; k += 0.4) {
          const px = Math.round(x0 + nx * k), py = Math.round(y0 + ny * k);
          const side = k / ww;
          let tone = side < -0.5 ? 3 : side < 0.1 ? 2 : side < 0.6 ? 1 : 0;
          if (ring < 0.16) tone = Math.max(0, tone - 1);
          else if (ring > 0.8 && tone < 3 && side < 0.3) tone += 1;
          buf.set(px, py, pal.trunk[tone]);
        }
      }
      const [ccx, ccy] = q(1);
      // fronds: filled leaf masses (leaflets hanging from an arched spine)
      const list = [];
      for (let i = 0; i < fronds; i++) {
        const u = i / (fronds - 1);
        const a = -Math.PI / 2 + (u - 0.5) * 4.1 + (r() - 0.5) * 0.3;
        list.push({ a, len: 36 + r() * 14, droop: 0.6 + r() * 0.35, ph: r() * 6.28, back: Math.abs(Math.cos(a)) < 0.35 });
      }
      list.sort((A, B) => (A.back === B.back ? 0 : A.back ? -1 : 1));
      for (const fr of list) {
        const sw = sway * 0.05 + Math.sin(fr.ph + f * 0.52) * 0.025;
        const dx = Math.cos(fr.a + sw), dy = Math.sin(fr.a + sw);
        const N = 44;
        const pts = [];
        for (let k = 0; k <= N; k++) {
          const s = k / N;
          const d = fr.len * s;
          pts.push([ccx + dx * d, ccy + dy * d * 0.72 + fr.droop * fr.len * s * s * 0.75]);
        }
        for (let k = 1; k <= N; k++) {
          const s = k / N;
          const [x, y] = pts[k], [px0, py0] = pts[k - 1];
          const tx = x - px0, ty = y - py0, tl = Math.hypot(tx, ty) || 1;
          const ll = Math.sin(Math.PI * Math.min(1, s * 1.08)) * 10 + 2;
          for (const sd of [-1, 1]) {
            let lx = (-ty / tl) * sd - (tx / tl) * 0.7, ly = (tx / tl) * sd - (ty / tl) * 0.7 + 0.9;
            const ln = Math.hypot(lx, ly);
            lx /= ln; ly /= ln;
            const upper = ly < 0.1;
            const segs = Math.ceil(ll);
            for (let j = 0; j <= segs; j++) {
              const uu = j / segs;
              const X = Math.round(x + lx * ll * uu + (uu * uu * 1.5 * (sd * 0.2)));
              const Y = Math.round(y + ly * ll * uu + uu * uu * 2.2);
              let tone = upper ? (uu < 0.45 ? 3 : 2) : uu < 0.3 ? 2 : uu < 0.75 ? 1 : 0;
              if ((k & 1) && tone > 0 && !upper) tone -= 1;
              buf.set(X, Y, pal.leaf[tone]);
            }
          }
        }
        for (let k = 0; k < N; k++) buf.line(pts[k][0], pts[k][1] - 0.5, pts[k + 1][0], pts[k + 1][1] - 0.5, k < N * 0.7 ? pal.spine : pal.leaf[3]);
      }
      // coconuts
      for (const [ox, oy] of [[-3.5, 3], [2.5, 4], [-0.5, 6]]) {
        buf.ellipse(ccx + ox, ccy + oy, 2.8, 2.8, pal.nut[0]);
        buf.ellipse(ccx + ox - 0.6, ccy + oy - 0.7, 1.7, 1.7, pal.nut[1]);
        buf.set(Math.round(ccx + ox - 1.2), Math.round(ccy + oy - 1.4), pal.nut[2]);
      }
      if (outline) {
        const src = buf.d.slice();
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (src[i]) continue;
            const n = (x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w]);
            if (n) buf.d[i] = pal.outline || pal.leaf[0];
          }
      }
      out.push(buf);
    }
    return out;
  }

  /* ---------- lighthouse on a headland ---------- */
  function headland(buf, o) {
    const { x, y, w, pal, seed = 11, lighthouse = true, lampOn = false } = o;
    const r = rng(seed);
    // rock silhouette: rounded hill with ledges
    const top = [];
    for (let i = 0; i <= w; i++) {
      const u = i / w;
      const hgt = Math.sin(Math.min(1, u * 1.25) * Math.PI) * 13 + fbm(i * 0.15, 0, seed, 3) * 5;
      top.push(Math.round(y - Math.max(0, hgt)));
    }
    for (let i = 0; i <= w; i++) {
      const X = x + i;
      for (let Y = top[i]; Y < y; Y++) {
        const depth = Y - top[i];
        const n = hash2(X, Y, seed);
        let c = depth < 2 ? pal.grass[1] : depth < 3 ? pal.grass[0] : pal.rock[n > 0.8 ? 2 : Y > y - 3 ? 0 : 1];
        if (depth >= 3 && ((X + Y * 2) % 9 === 0)) c = pal.rock[0];
        buf.set(X, Y, c);
      }
    }
    if (!lighthouse) return null;
    const lx = x + Math.round(w * 0.46), ly = top[Math.round(w * 0.46)] + 1;
    const hgt = 22;
    for (let k = 0; k < hgt; k++) {
      const hw = lerp(3.4, 2.2, k / hgt);
      const Y = ly - k;
      const band = Math.floor(k / 5) % 2 === 1;
      for (let dx = -Math.ceil(hw); dx <= Math.ceil(hw); dx++) {
        if (Math.abs(dx) > hw) continue;
        const side = dx / hw;
        const base = band ? pal.stripe : pal.tower;
        buf.set(lx + dx, Y, side > 0.45 ? base[0] : side < -0.4 ? base[2] : base[1]);
      }
    }
    // gallery + lantern
    const gy = ly - hgt;
    buf.hline(lx - 4, lx + 4, gy, pal.iron);
    for (let dx = -2; dx <= 2; dx++) for (let dy = 1; dy <= 3; dy++) buf.set(lx + dx, gy - dy, lampOn ? pal.lampOn[dy === 2 && Math.abs(dx) < 2 ? 1 : 0] : pal.glass);
    buf.hline(lx - 3, lx + 3, gy - 4, pal.iron);
    buf.hline(lx - 2, lx + 2, gy - 5, pal.roof);
    buf.set(lx, gy - 6, pal.roof);
    return { lampX: lx, lampY: gy - 2 };
  }

  /* ---------- gull ---------- */
  function gull(buf, x, y, phase, col, colD) {
    x = Math.round(x); y = Math.round(y);
    const f = Math.sin(phase);
    const lift = f > 0.3 ? -1 : f < -0.3 ? 1 : 0;
    buf.set(x, y, col);
    buf.set(x + 1, y, col);
    // wings
    buf.set(x - 1, y + lift * 0 - (lift < 0 ? 1 : 0), col);
    buf.set(x - 2, y - (lift < 0 ? 2 : lift > 0 ? -1 : 1), col);
    buf.set(x - 3, y - (lift < 0 ? 2 : lift > 0 ? -1 : 1), colD);
    buf.set(x + 2, y - (lift < 0 ? 1 : 0), col);
    buf.set(x + 3, y - (lift < 0 ? 2 : lift > 0 ? -1 : 1), col);
    buf.set(x + 4, y - (lift < 0 ? 2 : lift > 0 ? -1 : 1), colD);
  }

  /* ---------- particles ---------- */
  class Particles {
    constructor() { this.list = []; }
    add(p) { this.list.push(Object.assign({ age: 0, life: 1, vx: 0, vy: 0, g: 0 }, p)); }
    update(dt) {
      const out = [];
      for (const p of this.list) {
        p.age += dt;
        if (p.age >= p.life) { if (p.onDie) p.onDie(p); continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.floor !== undefined && p.vy > 0 && p.y >= p.floor) {
          if (p.onFloor) p.onFloor(p);
          continue;
        }
        out.push(p);
      }
      this.list = out;
    }
    draw(buf, layer, t) {
      for (const p of this.list) {
        if ((p.layer || 0) !== layer) continue;
        const k = p.age / p.life;
        if (p.draw) { p.draw(buf, p, k, t); continue; }
        switch (p.type) {
          case 'drop': {
            const x = Math.round(p.x), y = Math.round(p.y);
            buf.set(x, y, p.c);
            if (p.size > 1) { buf.set(x, y - 1, p.c2 || p.c); if (p.size > 2) buf.set(x + 1, y, p.c2 || p.c); }
            break;
          }
          case 'ripple': {
            const rx = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k));
            const ry = rx * (p.flat || 0.3);
            const fade = k;
            buf.ring(p.x, p.y, rx, ry, p.c, (x, y, a) => {
              if (p.test && !p.test(x, y)) return false;
              if (fade > 0.35 && bayer4(x, y) < (fade - 0.35) * 1.6) return false;
              if (Math.sin(a) < -0.2 && fade > 0.15) return (x + y) % 2 === 0; // far side fainter
              return true;
            });
            break;
          }
          case 'spark': {
            const tw = Math.sin(k * Math.PI);
            const s = Math.round(tw * p.size);
            if (s <= 0) buf.set(Math.round(p.x), Math.round(p.y), p.c2 || p.c);
            else star(buf, p.x, p.y, s, p.c, p.c2);
            break;
          }
          case 'crown': {
            const h = p.h * Math.pow(Math.sin(Math.min(1, k * 1.1) * Math.PI), 0.8);
            const w = p.w * (0.72 + k * 0.6);
            const wc = Math.ceil(w);
            for (let dx = -wc; dx <= wc; dx++) {
              const u = Math.abs(dx) / w;
              if (u > 1) continue;
              const hx = h * Math.pow(u, 2.1) * (0.7 + 0.6 * hash2(dx + 64, p.seed, 3));
              const th = Math.round(hx);
              const xx = Math.round(p.x + dx);
              for (let j = 0; j <= th; j++) {
                const yy = Math.round(p.y - j);
                if (k > 0.45 && bayer4(xx, yy) < (k - 0.45) * 1.9) continue;
                buf.set(xx, yy, j >= th - 1 || u > 0.92 ? p.c2 : p.c);
              }
            }
            break;
          }
          case 'patch': {
            const rx = p.rx * (1 + k * 0.35), ry = p.ry * (1 + k * 0.35);
            const x0 = Math.floor(p.x - rx), x1 = Math.ceil(p.x + rx), y0 = Math.floor(p.y - ry), y1 = Math.ceil(p.y + ry);
            for (let yy = y0; yy <= y1; yy++)
              for (let xx = x0; xx <= x1; xx++) {
                const u = (xx + 0.5 - p.x) / rx, v = (yy + 0.5 - p.y) / ry;
                const d = u * u + v * v;
                if (d > 1) continue;
                if (p.test && !p.test(xx, yy)) continue;
                const nz = vnoise(xx * 0.55, yy * 1.1, p.seed);
                if (nz < 0.38 + k * 0.55 + d * 0.15) continue;
                buf.set(xx, yy, d > 0.6 ? p.c2 : p.c);
              }
            break;
          }
          case 'foam': {
            if (bayer4(Math.round(p.x), Math.round(p.y)) < k) break;
            buf.set(Math.round(p.x), Math.round(p.y), p.c);
            break;
          }
        }
      }
    }
  }

  return { vgrad, skyField, glow, makeCloud, makeGlints, drawGlints, star, makePalm, headland, gull, Particles, clamp, smooth, lerp, mixc };
})();
