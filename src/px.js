/* ------------------------------------------------------------------
   PX — tiny pixel-art framebuffer toolkit.
   Colors are packed as 0xAABBGGRR so a Uint32Array view can be handed
   straight to ImageData.
------------------------------------------------------------------- */
const PX = (() => {
  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
  };
  const rgbOf = (c) => [c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff];
  const pack = (r, g, b) =>
    (0xff000000 | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
  const mix = (c1, c2, t) => {
    const a = rgbOf(c1), b = rgbOf(c2);
    return pack(
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    );
  };
  const mul = (c, m) => {
    const a = rgbOf(c), k = rgbOf(m);
    return pack((a[0] * k[0]) / 255, (a[1] * k[1]) / 255, (a[2] * k[2]) / 255);
  };
  const toHex = (c) => '#' + rgbOf(c).map((v) => v.toString(16).padStart(2, '0')).join('');
  const lum = (c) => {
    const a = rgbOf(c);
    return (a[0] * 0.299 + a[1] * 0.587 + a[2] * 0.114) / 255;
  };

  // 4x4 and 8x8 ordered-dither thresholds in [0,1)
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer4 = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
  const B8 = (() => {
    const m = new Array(64);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        let v = 0, xc = x ^ y, yc = y;
        for (let bit = 0; bit < 3; bit++) {
          v = (v << 2) | (((xc >> (2 - bit)) & 1) << 1) | ((yc >> (2 - bit)) & 1);
        }
        m[y * 8 + x] = v;
      }
    return m;
  })();
  const bayer8 = (x, y) => (B8[((y & 7) << 3) | (x & 7)] + 0.5) / 64;

  // deterministic hash noise
  const hash2 = (x, y, s = 0) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const vnoise = (x, y, s = 0) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
    const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, s = 0, oct = 4) => {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += vnoise(x * f, y * f, s + i * 17) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };

  // seeded RNG (mulberry32)
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  class Buf {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.d = new Uint32Array(w * h);
    }
    clear(c = 0) { this.d.fill(c); return this; }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
      return this.d[y * this.w + x];
    }
    set(x, y, c) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      this.d[y * this.w + x] = c;
    }
    rect(x, y, w, h, c) {
      const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
      const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
      for (let j = y0; j < y1; j++) this.d.fill(c, j * this.w + x0, j * this.w + x1);
    }
    hline(x0, x1, y, c) {
      if (y < 0 || y >= this.h) return;
      const a = Math.max(0, Math.min(x0, x1) | 0), b = Math.min(this.w - 1, Math.max(x0, x1) | 0);
      for (let x = a; x <= b; x++) this.d[y * this.w + x] = c;
    }
    line(x0, y0, x1, y1, c, test) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        if (!test || test(x0, y0)) this.set(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    // filled ellipse, pixel-centre sampled
    ellipse(cx, cy, rx, ry, c, test) {
      const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
      const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
          if (u * u + v * v <= 1 && (!test || test(x, y))) this.set(x, y, c);
        }
    }
    // ellipse outline ring (1px)
    ring(cx, cy, rx, ry, c, test) {
      const n = Math.max(12, Math.ceil((rx + ry) * 3.2));
      let px = null, py = null;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * rx - 0.5), y = Math.round(cy + Math.sin(a) * ry - 0.5);
        if (x !== px || y !== py) {
          if (!test || test(x, y, a)) this.set(x, y, c);
          px = x; py = y;
        }
      }
    }
    // blit another buffer (0 = transparent)
    blit(src, dx, dy, opts = {}) {
      const { flipX = false, flipY = false, map = null, test = null } = opts;
      dx = Math.round(dx); dy = Math.round(dy);
      for (let y = 0; y < src.h; y++) {
        const ty = dy + y;
        if (ty < 0 || ty >= this.h) continue;
        const sy = flipY ? src.h - 1 - y : y;
        for (let x = 0; x < src.w; x++) {
          const tx = dx + x;
          if (tx < 0 || tx >= this.w) continue;
          const sx = flipX ? src.w - 1 - x : x;
          let c = src.d[sy * src.w + sx];
          if (!c) continue;
          if (test && !test(tx, ty)) continue;
          if (map) c = map(c, tx, ty);
          if (c) this.d[ty * this.w + tx] = c;
        }
      }
    }
    copyFrom(src) { this.d.set(src.d); return this; }
    toCanvas(cv) {
      cv.width = this.w;
      cv.height = this.h;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(this.w, this.h);
      new Uint32Array(img.data.buffer).set(this.d);
      ctx.putImageData(img, 0, 0);
      return cv;
    }
  }

  // Memoised colour transform: each distinct input colour is computed once.
  const cmap = (fn) => {
    const cache = new Map();
    return (c) => {
      let r = cache.get(c);
      if (r === undefined) { r = fn(c); cache.set(c, r); }
      return r;
    };
  };

  // Snap any colour to the nearest entry of a palette (squared RGB distance, luma weighted)
  const nearest = (pal) => cmap((c) => {
    const [r, g, b] = rgbOf(c);
    let best = pal[0], bd = Infinity;
    for (const p of pal) {
      const [pr, pg, pb] = rgbOf(p);
      const d = (r - pr) ** 2 * 0.3 + (g - pg) ** 2 * 0.59 + (b - pb) ** 2 * 0.11;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  });

  // shift a colour's hue/sat/light for grading
  const rgb2hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  };
  const hsl2rgb = (h, s, l) => {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  };

  return { hex, rgbOf, pack, mix, mul, toHex, lum, bayer4, bayer8, hash2, vnoise, fbm, rng, Buf, cmap, nearest, rgb2hsl, hsl2rgb };
})();
