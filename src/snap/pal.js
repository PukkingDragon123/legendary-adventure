/* ------------------------------------------------------------------
   Pal — palette-indexed scenery. Every background, prop and terrain
   pixel is a material shade index (1..255). A compiled palette maps
   indices to colours for the current hour, weather and layer haze, so
   day/night changes are instant and smooth (palettes cross-fade) and
   water / waterfalls shimmer by palette cycling.
------------------------------------------------------------------- */
const Pal = (() => {
  const { clamp, lerp, mix, pack, R, G, B, hex } = U;
  const HOURS = ['dawn', 'noon', 'afternoon', 'dusk', 'night'];

  // how each hour grades scenery colours
  const LOOK = {
    dawn: { mul: '#f4dde4', sat: 0.88, amb: ['#9a86c8', 0.14], sh: ['#5a4a92', 0.34], hi: ['#ffd6b4', 0.3], haze: '#e8b9bd', light: [-0.6, -0.5], sun: { kind: 'sun', x: 0.8, y: 0.62, r: 20, c: ['#ffc98a', '#ffe7b6', '#fffaea'], glow: '#ffd2b0' },
      sky: [[0, '#4d6ab4'], [0.25, '#7486c8'], [0.5, '#a89ad0'], [0.7, '#e2aab4'], [0.86, '#fcc59a'], [1, '#ffdcaa']], cloud: ['#8d83bf', '#c79fc7', '#ffc59c', '#fff0cc'], stars: 0.15 },
    noon: { mul: '#ffffff', sat: 1, amb: null, sh: ['#2c3c7a', 0.06], hi: null, haze: '#bfe4f8', light: [-0.5, -0.75], sun: { kind: 'sun', x: 0.2, y: 0.12, r: 16, c: ['#fff2b0', '#fffbe0', '#ffffff'], glow: '#fff6da' },
      sky: [[0, '#2966c8'], [0.2, '#3176d4'], [0.42, '#3d88df'], [0.62, '#58a3ea'], [0.8, '#7fc0f3'], [1, '#bde2f8']], cloud: ['#9fbfe0', '#c6dcf0', '#e9f3fc', '#ffffff'], stars: 0 },
    afternoon: { mul: '#fff2dc', sat: 1.02, amb: ['#ffd8a0', 0.06], sh: ['#3a3a78', 0.14], hi: ['#fff0c0', 0.16], haze: '#f2dcb8', light: [0.6, -0.6], sun: { kind: 'sun', x: 0.76, y: 0.34, r: 18, c: ['#ffd27a', '#ffeab0', '#fffbe8'], glow: '#ffe2a6' },
      sky: [[0, '#3a74c4'], [0.3, '#4f8ad2'], [0.58, '#78a8de'], [0.8, '#b4c8e0'], [0.92, '#e8d4b4'], [1, '#ffd89a']], cloud: ['#a8a8c8', '#d6d0dc', '#fbeede', '#fffaf0'], stars: 0 },
    dusk: { mul: '#f6c2a4', sat: 0.95, amb: ['#8e4f86', 0.2], sh: ['#34286a', 0.46], hi: ['#ffa468', 0.34], haze: '#e98a7a', light: [-0.9, -0.25], sun: { kind: 'sun', x: 0.3, y: 0.78, r: 26, c: ['#ffae52', '#ffd878', '#fff4cc'], glow: '#ffc07a' },
      sky: [[0, '#27285c'], [0.2, '#3d3476'], [0.4, '#673d8a'], [0.56, '#9c4680'], [0.7, '#d35a6c'], [0.82, '#f0835a'], [0.92, '#ffb05a'], [1, '#ffd98c']], cloud: ['#553a7c', '#9a4a86', '#f27c64', '#ffc47a'], stars: 0.35 },
    night: { mul: '#6278b8', sat: 0.72, amb: ['#16265c', 0.34], sh: ['#070c2a', 0.44], hi: ['#a8c4ff', 0.22], haze: '#1c2e5e', light: [0.55, -0.7], sun: { kind: 'moon', x: 0.72, y: 0.16, r: 12, c: ['#c9c2a2', '#ece5c6', '#fbf8e6'], glow: '#8ea6e0' },
      sky: [[0, '#04071a'], [0.35, '#081232'], [0.62, '#0f1c48'], [0.86, '#1a2c5e'], [1, '#27407a']], cloud: ['#0c1330', '#18244a', '#34467a', '#8a9ed0'], stars: 1 },
  };
  for (const k in LOOK) {
    const L = LOOK[k];
    L.mulC = hex(L.mul); L.hazeC = hex(L.haze);
    L.ambC = L.amb && [hex(L.amb[0]), L.amb[1]]; L.shC = L.sh && [hex(L.sh[0]), L.sh[1]]; L.hiC = L.hi && [hex(L.hi[0]), L.hi[1]];
    L.cloudC = L.cloud.map(hex);
  }

  function sat(c, s) {
    if (s === 1) return c;
    const r = R(c), g = G(c), b = B(c), l = r * 0.299 + g * 0.587 + b * 0.114;
    return pack(l + (r - l) * s, l + (g - l) * s, l + (b - l) * s);
  }
  /**
   * Grade one base colour. rp = position on its ramp (0 darkest .. 1 lightest).
   * w = weather {rain 0..1, fog 0..1}; em = emissive (lamps, crystals: keep glowing at night)
   */
  function grade(c, rp, L, w, em, haze, hazeC) {
    let r = c;
    if (!em) {
      const m = L.mulC;
      r = pack((R(r) * R(m)) / 255, (G(r) * G(m)) / 255, (B(r) * B(m)) / 255);
      r = sat(r, L.sat);
      if (L.shC && rp < 0.4) r = mix(r, L.shC[0], L.shC[1] * (1 - rp / 0.4));
      if (L.hiC && rp > 0.6) r = mix(r, L.hiC[0], L.hiC[1] * ((rp - 0.6) / 0.4));
      if (L.ambC) r = mix(r, L.ambC[0], L.ambC[1]);
      if (w && w.rain > 0) { r = sat(r, 1 - 0.35 * w.rain); r = mix(r, 0xff6a6258 >>> 0, 0.18 * w.rain); }
    } else if (L === LOOK.night || L === LOOK.dusk) {
      r = pack(R(r) * 1.05, G(r) * 1.05, B(r) * 1.05);
    }
    if (haze > 0) r = mix(r, hazeC, clamp(haze, 0, 1));
    if (w && w.fog > 0 && !em) r = mix(r, hazeC, w.fog * 0.3);
    return r;
  }

  /* ---- an area's material table: names → index ramps ---- */
  class Table {
    constructor(defs) {
      this.defs = defs; this.base = new Uint32Array(256); this.rp = new Float32Array(256); this.em = new Uint8Array(256);
      this.cyc = []; // palette-cycling groups
      let i = 1;
      for (const name in defs) {
        const d = Array.isArray(defs[name]) ? { c: defs[name] } : defs[name];
        const ids = [];
        d.c.forEach((col, k) => {
          if (i > 255) throw new Error('palette full');
          this.base[i] = hex(col); this.rp[i] = d.c.length > 1 ? k / (d.c.length - 1) : 0.5; this.em[i] = d.emit ? 1 : 0;
          ids.push(i++);
        });
        this[name] = ids;
        if (d.cycle) this.cyc.push(ids);
      }
      this.n = i;
      this.cache = new Map();
    }
    // compile for an hour/weather/haze → Uint32Array(256)
    compile(hour, haze = 0, w = null, hazeOverride = null) {
      const key = hour + '|' + haze.toFixed(3) + '|' + (w ? w.rain.toFixed(2) + ',' + w.fog.toFixed(2) : '') + '|' + (hazeOverride || '');
      let out = this.cache.get(key);
      if (out) return out;
      const L = LOOK[hour];
      const hz = hazeOverride !== null ? hazeOverride : L.hazeC;
      out = new Uint32Array(256);
      for (let i = 1; i < this.n; i++) out[i] = grade(this.base[i], this.rp[i], L, w, this.em[i], haze, hz);
      if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, out);
      return out;
    }
  }

  // cross-fade two compiled palettes into out
  function blend(a, b, t, out) {
    const k = Math.round(clamp(t, 0, 1) * 256);
    for (let i = 1; i < 256; i++) out[i] = U.mixk(a[i], b[i], k);
    return out;
  }
  // rotate the colours of cycling groups (water shimmer, waterfalls)
  function cycle(tab, pal, t, rate = 6) {
    for (const ids of tab.cyc) {
      const n = ids.length, s = Math.floor(t * rate) % n;
      const tmp = ids.map((id) => pal[id]);
      for (let k = 0; k < n; k++) pal[ids[k]] = tmp[(k + s) % n];
    }
  }

  // sky gradient rows for an hour (optionally tinted by weather / area)
  function skyRows(hour, n, o = {}) {
    const L = LOOK[hour], st = o.sky || L.sky;
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      let k = 0;
      while (k < st.length - 2 && t > st[k + 1][0]) k++;
      const f = clamp((t - st[k][0]) / (st[k + 1][0] - st[k][0] || 1), 0, 1);
      let a = hex(st[k][1]), b = hex(st[k + 1][1]);
      if (o.rain > 0) { a = mix(sat(a, 1 - 0.6 * o.rain), 0xff8a8278 >>> 0, 0.35 * o.rain); b = mix(sat(b, 1 - 0.6 * o.rain), 0xffa09a90 >>> 0, 0.35 * o.rain); }
      if (o.tint) { a = mix(a, o.tint[0], o.tint[1]); b = mix(b, o.tint[0], o.tint[1]); }
      rows[i] = { a, b, f: U.smooth(0.15, 0.85, f) };
    }
    return rows;
  }
  return { HOURS, LOOK, Table, grade, blend, cycle, skyRows, sat };
})();
