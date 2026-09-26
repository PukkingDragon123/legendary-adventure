/* ------------------------------------------------------------------
   U — shared helpers for Mudkip Snap: math, seeded randomness, easing,
   fast integer colour maths on packed 0xAABBGGRR pixels.
------------------------------------------------------------------- */
const U = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const approach = (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  function rng(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const hash = PX.hash2;
  const vnoise = PX.vnoise;
  const fbm = (x, y, s = 0, oct = 4) => { let a = 0, f = 1, amp = 0.5, n = 0; for (let i = 0; i < oct; i++) { a += amp * vnoise(x * f, y * f, s + i * 17); n += amp; f *= 2; amp *= 0.5; } return a / n; };
  const bayer4 = PX.bayer4, bayer8 = PX.bayer8;

  /* ---- colour: packed ABGR (ImageData byte order) ---- */
  const R = (c) => c & 255, G = (c) => (c >>> 8) & 255, B = (c) => (c >>> 16) & 255;
  const pack = (r, g, b) => (0xff000000 | ((b < 0 ? 0 : b > 255 ? 255 : b | 0) << 16) | ((g < 0 ? 0 : g > 255 ? 255 : g | 0) << 8) | (r < 0 ? 0 : r > 255 ? 255 : r | 0)) >>> 0;
  // integer blend a→b by t in 0..1 (no allocation, safe in hot loops)
  function mix(a, b, t) {
    const k = (t * 256) | 0, j = 256 - k;
    return (0xff000000 | ((((a >>> 16) & 255) * j + ((b >>> 16) & 255) * k) >> 8) << 16 | ((((a >>> 8) & 255) * j + ((b >>> 8) & 255) * k) >> 8) << 8 | (((a & 255) * j + (b & 255) * k) >> 8)) >>> 0;
  }
  // blend with an integer weight 0..256
  function mixk(a, b, k) {
    const j = 256 - k;
    return (0xff000000 | ((((a >>> 16) & 255) * j + ((b >>> 16) & 255) * k) >> 8) << 16 | ((((a >>> 8) & 255) * j + ((b >>> 8) & 255) * k) >> 8) << 8 | (((a & 255) * j + (b & 255) * k) >> 8)) >>> 0;
  }
  const scale = (c, f) => pack(R(c) * f, G(c) * f, B(c) * f);
  const add = (c, r, g, b) => pack(R(c) + r, G(c) + g, B(c) + b);
  const addc = (a, b, k = 1) => pack(R(a) + R(b) * k, G(a) + G(b) * k, B(a) + B(b) * k);
  const screen = (a, b, k = 1) => pack(R(a) + (255 - R(a)) * (R(b) / 255) * k, G(a) + (255 - G(a)) * (G(b) / 255) * k, B(a) + (255 - B(a)) * (B(b) / 255) * k);
  const lum = (c) => (R(c) * 0.299 + G(c) * 0.587 + B(c) * 0.114) / 255;
  const hex = PX.hex;
  const css = (c) => `rgb(${R(c)},${G(c)},${B(c)})`;
  function hsl(h, s, l) { const [r, g, b] = PX.hsl2rgb(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1)); return pack(r, g, b); }
  function toHsl(c) { return PX.rgb2hsl(R(c), G(c), B(c)); }
  // shift hue/sat/light of a packed colour
  function tweak(c, dh = 0, ds = 1, dl = 0) { const [h, s, l] = toHsl(c); return hsl(h + dh, s * ds, l + dl); }

  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inQuad: (t) => t * t,
  };

  // monotone cubic interpolation table over integer x (for terrain profiles)
  function profile(pts, W) {
    const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const d = new Array(n - 1), m = new Array(n);
    for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    const out = new Float32Array(W + 1);
    let k = 0;
    for (let x = 0; x <= W; x++) {
      while (k < n - 2 && x > xs[k + 1]) k++;
      const h = xs[k + 1] - xs[k], t = clamp((x - xs[k]) / h, 0, 1);
      const t2 = t * t, t3 = t2 * t;
      out[x] = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
    }
    return out;
  }

  // tiny event hub
  const hub = new Map();
  const on = (ev, fn) => { if (!hub.has(ev)) hub.set(ev, []); hub.get(ev).push(fn); };
  const emit = (ev, a, b) => { const l = hub.get(ev); if (l) for (const f of l) { try { f(a, b); } catch (e) { console.error(e); } } };

  // simple persistent-safe storage
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  return { TAU, clamp, lerp, smooth, rnd, rndi, pick, chance, approach, wrapA, rng, hash, vnoise, fbm, bayer4, bayer8, R, G, B, pack, mix, mixk, scale, add, addc, screen, lum, hex, css, hsl, toHsl, tweak, ease, profile, on, emit, store };
})();
