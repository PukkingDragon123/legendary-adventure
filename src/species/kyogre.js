/* ------------------------------------------------------------------
   Kyogre — the Sea Basin Pokémon, as a posable 3D model rendered to
   pixel art by the shared Creature renderer (src/creature.js).
   Model units: 175 = 1 m, Kyogre is ~790 long (4.5 m); the game draws
   it at scale ~0.55. x = forward, y = up, z = near side at yaw 0;
   y = 0 is the lowest belly point (fins hang below it).
   Fins, claws, dorsal and tail streamers are thin ellipsoid "shells"
   clipped to 2D outlines (curvature shading + an edge-on fallback);
   red lines, eyes and white patches are decals baked into grids in the
   rest pose, so they stick to the skin while the model animates.
------------------------------------------------------------------- */
const Kyogre = (() => {
  const { chain, T, R, code } = Creature;
  // prims are built as { kind, part, grp, c, L, mat } literals (same hidden class as Mudkip's),
  // which keeps the shared renderer's optimised code valid across species
  const ell = (f, r, o) => ({ kind: 'ell', part: o.part, grp: o.grp, c: f.t, L: M3.mul(f.L, M3.diag(r[0], r[1], r[2])), mat: o.mat });

  // material ids
  const BODY = 1, BELLY = 2, RED = 3, PALE = 4, CLAW = 5, FIN = 6, FINU = 7, MOUTH = 8, TONGUE = 9;
  const EYEY = 10, EYEK = 11, EYEW = 12, TAILF = 13;
  const MAT = { BODY, BELLY, RED, PALE, CLAW, FIN, FINU, MOUTH, TONGUE, EYEY, EYEK, EYEW, TAILF };

  const BLUE = ['#0e2b6b', '#16479a', '#1f66c2', '#3f8ce0', '#78b8f4'];
  const PAL = Creature.palette({
    [BODY]:   { r: BLUE, od: '#081a48', ol: '#12378a', ln: '#0f3078' },
    [FIN]:    { r: ['#0a2052', '#0e2b6b', '#16479a', '#1f66c2', '#4a94e2'], od: '#081a48', ol: '#12378a', ln: '#0f3078' },
    [TAILF]:  { r: BLUE, od: '#081a48', ol: '#12378a', ln: '#0f3078' },
    [BELLY]:  { r: ['#1a4690', '#255cae', '#3679cc', '#5a9ce6', '#b8dcff'], od: '#0a2052', ol: '#1a4592', ln: '#173f88' },
    [FINU]:   { r: ['#081a48', '#0b2458', '#0f2f72', '#16469a', '#2462b8'], od: '#061238', ol: '#0e2a6c', ln: '#0d2a6a' },
    [RED]:    { r: ['#7c0f25', '#b51b35', '#e3334a', '#ff6166', '#ffaea4'], od: '#4c0716', ol: '#8a1428', ln: '#7a1024' },
    [PALE]:   { r: ['#6a8cb6', '#95b4d6', '#c4daee', '#e5f0fa', '#ffffff'], od: '#27487a', ol: '#5379aa', ln: '#567cae' },
    [CLAW]:   { r: ['#7b8fac', '#a4b5cc', '#d0dbea', '#edf3fa', '#ffffff'], od: '#34476a', ol: '#62789a', ln: '#5d7398' },
    [MOUTH]:  { r: ['#3a0a1e', '#56122a', '#74203a', '#94304a', '#b8485e'], od: '#240512', ol: '#3a0a1e', ln: '#3a0a1e' },
    [TONGUE]: { r: ['#8a2a44', '#b03c58', '#d0566e', '#e87888', '#f8a6ae'], od: '#4a0a1e', ol: '#6a1a30', ln: '#6a1a30' },
    [EYEY]:   { r: ['#e0a414', '#f2bf24', '#ffd83e', '#ffe985', '#fff6c8'], od: '#6a3a06', ol: '#8a5a10', ln: '#8a5a10' },
    [EYEK]:   { r: ['#12060c', '#1a0a12', '#221019', '#2a1420', '#34192a'], od: '#12060c', ol: '#12060c', ln: '#12060c' },
    [EYEW]:   { r: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], od: '#8aa0c0', ol: '#8aa0c0', ln: '#8aa0c0' },
  });
  const GLOSSY = { [BODY]: 1, [FIN]: 1, [TAILF]: 1, [BELLY]: 1, [PALE]: 1, [CLAW]: 1, [RED]: 0, [FINU]: 0 };
  // brighter ramp for the `glow` pose (Primal-style energy in the lines)
  const GLOW = ['#ff2440', '#ff3c52', '#ff5a66', '#ff8f8a', '#ffd6cc'].map(PX.hex);

  /* ---------- 2D grid helpers (baked once at load, O(1) lookups) ---------- */
  function grid(u0, v0, u1, v1, res, Type = Uint8Array, init = 0) {
    const gw = Math.ceil((u1 - u0) / res), gh = Math.ceil((v1 - v0) / res);
    const a = new Type(gw * gh);
    if (init) a.fill(init);
    return { u0, v0, res, gw, gh, a };
  }
  function at(g, u, v, def) {
    const x = Math.floor((u - g.u0) / g.res), y = Math.floor((v - g.v0) / g.res);
    return x < 0 || y < 0 || x >= g.gw || y >= g.gh ? def : g.a[y * g.gw + x];
  }
  // scanline polygon fill (even-odd)
  function fill(g, poly, val) {
    const n = poly.length;
    for (let y = 0; y < g.gh; y++) {
      const vy = g.v0 + (y + 0.5) * g.res;
      const xs = [];
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = poly[i][1], yj = poly[j][1];
        if (yi > vy !== yj > vy) xs.push(poly[i][0] + ((vy - yi) * (poly[j][0] - poly[i][0])) / (yj - yi));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil((xs[k] - g.u0) / g.res - 0.5));
        const xb = Math.min(g.gw - 1, Math.floor((xs[k + 1] - g.u0) / g.res - 0.5));
        for (let x = xa; x <= xb; x++) g.a[y * g.gw + x] = val;
      }
    }
  }
  // distance-to-polyline field, updated only within maxD of each segment
  function stroke(g, pts, maxD) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - maxD - g.u0) / g.res)), x1 = Math.min(g.gw - 1, Math.ceil((Math.max(ax, bx) + maxD - g.u0) / g.res));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - maxD - g.v0) / g.res)), y1 = Math.min(g.gh - 1, Math.ceil((Math.max(ay, by) + maxD - g.v0) / g.res));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d = Shape2D.segDist(g.u0 + (x + 0.5) * g.res, g.v0 + (y + 0.5) * g.res, ax, ay, bx, by);
          const i = y * g.gw + x;
          if (d < g.a[i]) g.a[i] = d;
        }
    }
  }
  const ellipsePts = (cx, cy, rx, ry, rot = 0, n = 40) => {
    const c = Math.cos(rot), s = Math.sin(rot), out = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  };
  const smooth = (pts, closed = false, seg = 6) => Shape2D.catmull(pts, closed, seg);
  // ribbon outline around a spine with linearly varying width and an optional notched tip
  function ribbon(spine, w0, w1, notch) {
    const S = smooth(spine, false, 8), n = S.length, L = [], Rr = [];
    for (let i = 0; i < n; i++) {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const w = (w0 + ((w1 - w0) * i) / (n - 1)) / 2;
      L.push([S[i][0] - ty * w, S[i][1] + tx * w]);
      Rr.push([S[i][0] + ty * w, S[i][1] - tx * w]);
    }
    const out = L.slice();
    if (notch) {
      const e = S[n - 1], p = S[n - 2];
      let tx = e[0] - p[0], ty = e[1] - p[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const a = L[n - 1], b = Rr[n - 1];
      out.push([a[0] + tx * notch.a, a[1] + ty * notch.a]);
      out.push([e[0] - tx * notch.d, e[1] - ty * notch.d]);
      out.push([b[0] + tx * notch.b, b[1] + ty * notch.b]);
    }
    return out.concat(Rr.reverse());
  }
  const bbox = (poly) => Shape2D.bbox(poly, 0);
  // emboss: +1 near the edge facing direction d, -1 near the opposite edge
  const bevel = (g, u, v, dx, dy) => (!at(g, u + dx, v + dy, 0) ? 1 : !at(g, u - dx, v - dy, 0) ? -1 : 0);
  // Pack a shape into one Uint16 grid: bit 0 inside, bits 1-2 bevel+1, bits 3-15 line distance*8,
  // so a fin pixel costs a single array read (cheap even before the JIT warms up).
  function pack(inG, lnG, bdx, bdy, bevelG) {
    const g = { u0: inG.u0, v0: inG.v0, res: inG.res, ir: 1 / inG.res, gw: inG.gw, gh: inG.gh, a: new Uint16Array(inG.gw * inG.gh) };
    for (let y = 0; y < g.gh; y++)
      for (let x = 0; x < g.gw; x++) {
        const i = y * g.gw + x;
        if (!inG.a[i]) continue;
        const bv = bevel(bevelG || inG, g.u0 + (x + 0.5) * g.res, g.v0 + (y + 0.5) * g.res, bdx, bdy);
        const d = lnG ? Math.min(8191, Math.round(lnG.a[i] * 8)) : 8191;
        g.a[i] = 1 | ((bv + 1) << 1) | (d << 3);
      }
    return g;
  }
  const pk = (g, u, v) => {
    const x = Math.floor((u - g.u0) * g.ir), y = Math.floor((v - g.v0) * g.ir);
    return x < 0 || y < 0 || x >= g.gw || y >= g.gh ? 0 : g.a[y * g.gw + x];
  };

  /* ---------- body decals, drawn in the rest-pose side view (x, y) ---------- */
  // lower jaw region seen from the side (the head is cut away here; the jaw prim shows)
  const LIP = [[404, 70], [380, 71], [350, 70], [318, 68], [284, 66], [252, 63], [226, 60], [212, 58]];
  const JAW_REGION = LIP.concat([[204, 50], [200, 30], [198, -40], [420, -40], [420, 70]]);
  const SIDE = grid(-220, -60, 430, 320, 1, Float32Array, 99);
  const JAWG = grid(-220, -60, 430, 320, 1);
  fill(JAWG, JAW_REGION, 1);
  const LIP_LINE = LIP.concat([[206, 56], [201, 46], [199, 32]]);
  const LIPG = grid(-220, -60, 430, 320, 1, Float32Array, 99);
  stroke(LIPG, smooth(LIP_LINE, false, 6), 12);
  const SG = SIDE, SIDEA = SIDE.a, LIPA = LIPG.a, JAWA = JAWG.a;
  // flank chevron, hook and the ridge behind the head
  stroke(SIDE, smooth([[8, 190], [44, 150], [92, 108], [84, 72], [72, 34]], false, 6), 10);
  stroke(SIDE, smooth([[26, 146], [-4, 152], [-36, 150], [-44, 118], [-46, 92]], false, 6), 10);
  // volumes (x,y,z centre, radii, z-rotation) for white patches and slits; mirrored in z
  const PATCHES = [
    { c: [258, 136, 72], r: [72, 30, 36], rot: -0.26 },
    { c: [176, 124, 86], r: [24, 13, 30], rot: -0.2 },
  ];
  const SLITS = [
    { c: [46, 72, 104], r: [6, 26, 30], rot: -0.48 },
    { c: [16, 88, 100], r: [5.5, 21, 30], rot: -0.48 },
  ];
  for (const V of PATCHES.concat(SLITS)) { V.co = Math.cos(V.rot); V.si = Math.sin(V.rot); V.ix = 1 / V.r[0]; V.iy = 1 / V.r[1]; V.iz = 1 / V.r[2]; }
  const inVol = (V, X, Y, Z) => {
    const dz = (Math.abs(Z) - V.c[2]) * V.iz;
    if (dz > 1 || dz < -1) return false;
    const dx = X - V.c[0], dy = Y - V.c[1];
    const lx = (dx * V.co + dy * V.si) * V.ix, ly = (dy * V.co - dx * V.si) * V.iy;
    return lx * lx + ly * ly + dz * dz < 1;
  };
  // eye (side-view ellipse decal on the head; both sides)
  const EYE = { x: 318, y: 80, ax: 20, ay: 12 };
  const HEAD = { c: [186, 92, 0], r: [208, 114, 116], tilt: -0.1 };

  /* ---------- pectoral fin: outline + line pattern in fin space (u root->tip, v across) ---------- */
  const FIN_OUT = smooth([[0, 40], [50, 62], [110, 96], [170, 118], [220, 124], [250, 102], [266, 56], [270, 0], [264, -54], [248, -102], [214, -124], [164, -118], [104, -92], [50, -60], [0, -42], [-30, 0]], true, 8);
  const FIN_IN = grid(-40, -140, 290, 140, 1);
  fill(FIN_IN, FIN_OUT, 1);
  const FIN_LN = grid(-40, -140, 290, 140, 1, Float32Array, 99);
  stroke(FIN_LN, ellipsePts(108, -2, 56, 48), 10);
  for (const l of [
    [[138, 38], [160, 58], [200, 72], [242, 94]],
    [[162, 16], [212, 26], [262, 32]],
    [[162, -20], [212, -28], [262, -32]],
    [[138, -44], [160, -64], [200, -76], [242, -96]],
    [[208, 25], [216, -27]],
  ]) stroke(FIN_LN, l, 10);
  const FIN_PK = pack(FIN_IN, FIN_LN, 0, 7);
  const FIN_E = { cu: 145, cv: 0, ru: 200, rv: 150, rw: 14 };
  const CLAWS = [
    { u: 238, v: 96, a: 0.46 },
    { u: 262, v: 34, a: 0.15 },
    { u: 262, v: -34, a: -0.15 },
    { u: 240, v: -98, a: -0.46 },
  ];
  const CLAW_OUT = smooth([[-24, 15], [12, 17.5], [26, 15.5], [31, 6], [31, -6], [26, -15.5], [12, -17.5], [-24, -15]], true, 6);
  const CLAW_G = grid(-28, -20, 35, 20, 0.5);
  fill(CLAW_G, CLAW_OUT, 1);
  const CLAW_PK = pack(CLAW_G, null, 0, 4.5);
  const CLAW_E = { ru: 45, rv: 26, rw: 8.5 };

  /* ---------- dorsal fin (side view, x back.., y up), thin axis = z ---------- */
  const DORSAL_OUT = smooth([[168, 150], [150, 196], [118, 232], [78, 262], [62, 266], [66, 240], [70, 212], [62, 186], [40, 150]], true, 8);
  const DORSAL_G = grid(20, 130, 190, 280, 1);
  fill(DORSAL_G, DORSAL_OUT, 1);
  const DORSAL_LN = grid(20, 130, 190, 280, 1, Float32Array, 99);
  stroke(DORSAL_LN, smooth([[164, 176], [148, 200], [118, 232], [82, 258]], false, 6), 10);
  const DORSAL_PK = pack(DORSAL_G, DORSAL_LN, -4, 3);
  const DORSAL_E = { cx: 104, cy: 205, rx: 96, ry: 78, rz: 9 };

  /* ---------- tail streamers (fin space: u back, v up) ---------- */
  function shellOf(poly, rw) {
    const b = bbox(poly);
    const g = grid(b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2, 1);
    fill(g, poly, 1);
    return { g, poly, cu: (b[0] + b[2]) / 2, cv: (b[1] + b[3]) / 2, ru: ((b[2] - b[0]) / 2) * 1.42 + 2, rv: ((b[3] - b[1]) / 2) * 1.42 + 2, rw };
  }
  // union outline of a segmented streamer, used for seamless bevels
  function unionOf(...parts) {
    const bb = parts.map((p) => bbox(p.poly));
    const g = grid(Math.min(...bb.map((b) => b[0])) - 8, Math.min(...bb.map((b) => b[1])) - 8, Math.max(...bb.map((b) => b[2])) + 8, Math.max(...bb.map((b) => b[3])) + 8, 1);
    for (const p of parts) fill(g, p.poly, 1);
    for (const p of parts) p.full = g;
  }
  // upper (hooked) fins: rising part + backward part; lower streamers: root + tip
  const UP_A = shellOf(ribbon([[0, -22], [4, 18], [18, 52], [44, 78]], 64, 52), 8);
  const UP_B = shellOf(ribbon([[36, 74], [80, 89], [126, 95], [164, 97]], 52, 36, { a: 24, d: 14, b: 7 }), 7);
  const LO_A = shellOf(ribbon([[-24, 0], [40, -2], [125, -6]], 56, 42), 8);
  const LO_B = shellOf(ribbon([[115, -6], [182, -8], [244, -6]], 42, 33, { a: 26, d: 15, b: 9 }), 7);
  unionOf(UP_A, UP_B);
  unionOf(LO_A, LO_B);
  for (const E of [UP_A, UP_B, LO_A, LO_B]) E.pk = pack(E.g, null, -2.2, 5, E.full);

  const DEFAULT = { fin: 0, tail: 0, mouth: 0, eyes: 'open', glow: 0, headPitch: 0, roll: 0, side: 1 };
  let LWH = 2.8, LW8 = 22.4; // half line width (model units, and *8 for packed grids), set per render

  const MZ = M3.diag(1, 1, -1);
  const mirrorF = (f) => ({ L: M3.mul(MZ, f.L), t: M3.v(MZ, f.t) });
  const pivot = (p, M) => chain(T(p[0], p[1], p[2]), R(M), T(-p[0], -p[1], -p[2]));
  // ellipsoid with explicit local axes (columns u, w, v scaled by radii) in a parent frame
  const shell = (parent, center, u, w, v, r, o) => {
    const L = M3.mul(parent.L, M3.cols(V3.scale(u, r[0]), V3.scale(w, r[1]), V3.scale(v, r[2])));
    return { kind: 'ell', part: o.part, grp: o.grp, c: V3.add(parent.t, M3.v(parent.L, center)), L, mat: o.mat };
  };
  // Clipped thin "shell": test(s0,s1,s2) gives the material of the nearest surface point or 0.
  // The renderer only shades the nearest hit, so when that point is clipped away we march the
  // view ray's chord through the ellipsoid (direction from the renderer's prim.Li) and accept the
  // first sample inside the outline: edge-on fins keep their true silhouette. Face-on the chord
  // keeps the same (u, v), so nothing changes there.
  const clipped = (prim, test, edge, thin, R) => {
    let li = null, cw = 1, dx = 0, dy = 0, dz = 0, dt = 0;
    prim.mat = (s) => {
      const m = test(s[0], s[1], s[2]);
      if (m) return m;
      const Li = prim.Li;
      if (Li !== li) {
        // once per render: view direction in local space, and |cos| between view and fin normal
        li = Li;
        const t3 = thin * 3;
        cw = Math.abs(Li[t3 + 2]) / Math.hypot(Li[t3], Li[t3 + 1], Li[t3 + 2]);
        const il = 1 / Math.hypot(Li[2], Li[5], Li[8]);
        dx = Li[2] * il; dy = Li[5] * il; dz = Li[8] * il;
        dt = thin === 0 ? dx : thin === 1 ? dy : dz;
      }
      if (cw > 0.5) return 0; // within 60 degrees of face-on: the surface clip is already right
      const k = 2 * (s[0] * dx + s[1] * dy + s[2] * dz);
      // samples ~3 units apart along the chord's travel across the fin plane
      const n = Math.min(8, Math.floor((k * Math.sqrt(Math.max(0, 1 - dt * dt)) * R) / 3));
      for (let j = 1; j <= n; j++) {
        const t = (k * j) / (n + 1);
        const e = edge(s[0] - t * dx, s[1] - t * dy, s[2] - t * dz);
        if (e) return e;
      }
      return 0;
    };
    return prim;
  };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [];
    const root = pivot([0, 100, 0], M3.rx(P.roll));

    // --- skin: shared decal logic in rest-pose coordinates
    const eyeK = P.eyes;
    const cRED = code(RED), cRED2 = code(RED, -2), cEYEK = code(EYEK), cEYEY = code(EYEY), cEYEW = code(EYEW);
    const cPALE = code(PALE), cBELLY = code(BELLY), cBODY = code(BODY), cCORE = code(RED, 1);
    const glow = P.glow > 0.25;
    const eyeMat = (X, Y) => {
      const ex = (X - EYE.x) / EYE.ax, ey = (Y - EYE.y) / EYE.ay;
      const e2 = ex * ex + ey * ey;
      if (eyeK === 'angry' && ex > -1.15 && ex < 1.05 && ey > 0.5 - 0.62 * ex && ey < 1.35 - 0.62 * ex && e2 < 2.2) return cRED2;
      if (e2 >= 1) return 0;
      if (eyeK === 'closed') return Math.abs(ey - (-0.02 - 0.32 * (1 - ex * ex))) < 0.2 && Math.abs(ex) < 0.86 ? cEYEK : cRED;
      if (eyeK === 'angry') {
        const cut = 0.28 - 0.62 * ex;
        if (ey > cut + 0.36) return cRED2;
        if (ey > cut) return cEYEK;
      }
      const ix = (X - (EYE.x + 3)) / 8.5, iy = (Y - EYE.y) / 8.5;
      if (ix * ix + iy * iy < 1) {
        if ((X - (EYE.x + 1.5)) ** 2 + (Y - (EYE.y + 3.5)) ** 2 < 5.5) return cEYEW;
        const px = (X - (EYE.x + 4.5)) / 4.6, py = (Y - (EYE.y - 0.5)) / 5.2;
        return px * px + py * py < 1 ? cEYEK : cEYEY;
      }
      return cRED;
    };
    // shared skin decals in rest-pose coordinates; vols = the white volumes this ellipsoid can touch
    const skin = (X, Y, Z, ny, az, head, vols, gi) => {
      if (az > 0.1 && gi >= 0) {
        if (head) {
          if (az > 0.3 && X > EYE.x - 26 && X < EYE.x + 26 && Y > EYE.y - 14 && Y < EYE.y + 22) {
            const e = eyeMat(X, Y);
            if (e) return e;
          }
          const dl = LIPA[gi];
          if (dl < 2 * LWH) return glow && dl > 0.4 * LWH && dl < 1.3 * LWH ? cCORE : cRED;
        }
        const d = SIDEA[gi];
        if (d < LWH) return glow && d < 0.45 * LWH ? cCORE : cRED;
      }
      for (let i = 0; i < vols.length; i++) if (inVol(vols[i], X, Y, Z)) return cPALE;
      return ny < -0.55 ? cBELLY : cBODY;
    };
    // body ellipsoid: rest centre c, radii r, optional rest tilt about z (radians)
    const bodyEll = (frame, c, r, part, head, tilt = 0) => {
      const [cx, cy, cz] = c, [rx, ry, rz] = r;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const rm = Math.max(rx, ry);
      const vols = PATCHES.concat(SLITS).filter((V) => Math.abs(V.c[0] - cx) < rm + V.r[0] + 10 && Math.abs(V.c[1] - cy) < rm + V.r[1] + 10);
      const f = chain(frame, T(cx, cy, cz), R(M3.rz(tilt)));
      return ell(f, r, {
        part, grp: 1,
        mat: (s) => {
          const lx = rx * s[0], ly = ry * s[1];
          const X = cx + lx * ct - ly * st, Y = cy + lx * st + ly * ct;
          const gx = Math.floor(X - SG.u0), gy = Math.floor(Y - SG.v0);
          const gi = gx >= 0 && gy >= 0 && gx < SG.gw && gy < SG.gh ? gy * SG.gw + gx : -1;
          if (head && gi >= 0 && JAWA[gi]) return 0;
          const ax = s[0] / rx, ay = s[1] / ry, nz = s[2] / rz;
          const ny = ax * st + ay * ct, nx = ax * ct - ay * st;
          const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          return skin(X, Y, cz + rz * s[2], ny * il, Math.abs(nz) * il, head, vols, gi);
        },
      });
    };

    // --- head group (pitches about the neck): the big front ellipsoid carries the head
    const mouthK = Math.max(0, Math.min(1, P.mouth || 0));
    const headF = chain(root, pivot([150, 96, 0], M3.rz(P.headPitch)));
    const headPrim = bodyEll(headF, HEAD.c, HEAD.r, 1, true, HEAD.tilt);
    prims.push(headPrim);
    // lower jaw hinged behind the mouth corner
    const jawF = chain(headF, pivot([208, 70, 0], M3.rz(-0.34 * mouthK)));
    prims.push(ell(chain(jawF, T(292, 50, 0)), [106, 48, 78], {
      part: 3, grp: 2,
      mat: (s) => (s[1] < -0.72 ? code(PALE, -1) : code(PALE)),
    }));
    // mouth interior (only needed while the jaw is open)
    if (mouthK > 0.02) prims.push(ell(chain(headF, T(290, 62, 0)), [96, 26, 70], {
      part: 4, grp: 3,
      mat: (s) => (s[1] < 0.1 && Math.abs(s[2]) < 0.6 && s[0] > -0.5 ? code(TONGUE) : code(MOUTH)),
    }));

    // --- body (static mid, rear chain waves with the tail phase)
    const ph = P.tail;
    prims.push(bodyEll(root, [40, 104, 0], [140, 84, 102], 5, false));
    const rearF = chain(root, pivot([-30, 112, 0], M3.rz(0.05 * Math.sin(ph))));
    prims.push(bodyEll(rearF, [-70, 114, 0], [84, 44, 50], 7, false));
    const stockF = chain(rearF, pivot([-110, 114, 0], M3.rz(0.08 * Math.sin(ph - 0.7))));
    prims.push(bodyEll(stockF, [-122, 114, 0], [52, 26, 28], 8, false));

    // --- dorsal fin
    {
      const E = DORSAL_E;
      const cEdge = code(FIN, -1);
      const DB = [code(FIN, -1), code(FIN, 0), code(FIN, 1)];
      prims.push(clipped(ell(chain(root, T(E.cx, E.cy, 0)), [E.rx, E.ry, E.rz], { part: 9, grp: 4, mat: null }), (a, b, c) => {
        const v = pk(DORSAL_PK, E.cx + E.rx * a, E.cy + E.ry * b);
        if (!v) return 0;
        const d = v >> 3;
        if (d < LW8) return glow && d < 0.45 * LW8 ? cCORE : cRED;
        const bv = ((v >> 1) & 3) - (c > -0.3 && c < 0.3 ? 1 : 0);
        return DB[bv < 0 ? 0 : bv];
      }, (a, b) => (pk(DORSAL_PK, E.cx + E.rx * a, E.cy + E.ry * b) ? cEdge : 0), 2, E.rx));
    }

    // --- pectoral fins (near, far = mirror); sweep: fin=+1 up/forward, -1 down/back
    const sw = Math.max(-1, Math.min(1, P.fin));
    const R0 = M3.mul(M3.ry(0.72), M3.mul(M3.rz(0.38), M3.rx(-0.95)));
    // k = extra tuck for the fin on the far side of the camera (side cheat), so it never spikes out
    const finFrame = (k) => {
      const lift = -0.55 * sw * (sw < 0 ? 1 - 0.85 * k : 1) - 0.2 * k;
      const sc = 1 - 0.42 * k;
      return { L: M3.mul(M3.mul(M3.ry(0.3 * sw - 0.45 * k), M3.rx(lift)), M3.mul(R0, M3.diag(sc, sc, sc))), t: [185, 48, 78 - 14 * k] };
    };
    const finParts = [];
    for (const sd of [1, -1]) {
      let f = finFrame(Math.max(0, -sd * (P.side ?? 1)) * (1 - 0.7 * Math.max(0, sw)));
      if (sd < 0) f = mirrorF(f);
      const fr = chain(root, f);
      const u = [-1, 0, 0], v = [0, 1, 0], w = [0, 0, 1];
      const E = FIN_E;
      const gid = sd > 0 ? 5 : 6;
      const cFinEdge = code(FIN, -1);
      const FB = [code(FIN, -1), code(FIN, 0), code(FIN, 1)], cFINU = code(FINU);
      prims.push(clipped(shell(fr, V3.add(V3.scale(u, E.cu), V3.scale(v, E.cv)), u, w, v, [E.ru, E.rw, E.rv], { part: 10 + (sd < 0 ? 1 : 0), grp: gid, mat: null }), (a, b, c) => {
        const pv = pk(FIN_PK, E.cu + E.ru * a, E.cv + E.rv * c);
        if (!pv) return 0;
        if (b < 0) return cFINU;
        const d = pv >> 3;
        if (d < LW8) return glow && d < 0.45 * LW8 ? cCORE : cRED;
        return FB[(pv >> 1) & 3];
      }, (a, b, c) => (pk(FIN_PK, E.cu + E.ru * a, E.cv + E.rv * c) ? cFinEdge : 0), 1, E.ru));
      // claws
      CLAWS.forEach((c, k) => {
        const ca = Math.cos(c.a), sa = Math.sin(c.a);
        const cu = V3.add(V3.scale(u, ca), V3.scale(v, sa));
        const cv = V3.add(V3.scale(u, -sa), V3.scale(v, ca));
        const ctr = V3.add(V3.add(V3.scale(u, c.u), V3.scale(v, c.v)), V3.add(V3.scale(cu, 16), V3.scale(w, -3)));
        const cClawEdge = code(CLAW, -1), CB = [code(CLAW, -1), code(CLAW, 0), code(CLAW, 1)];
        prims.push(clipped(shell(fr, ctr, cu, w, cv, [CLAW_E.ru, CLAW_E.rw, CLAW_E.rv], { part: 12 + k + (sd < 0 ? 4 : 0), grp: 7 + (sd < 0 ? 1 : 0), mat: null }), (a, b, c) => {
          const pv = pk(CLAW_PK, CLAW_E.ru * a, CLAW_E.rv * c);
          if (!pv) return 0;
          return b < 0 ? cClawEdge : CB[(pv >> 1) & 3];
        }, (a, b, c) => (pk(CLAW_PK, CLAW_E.ru * a, CLAW_E.rv * c) ? cClawEdge : 0), 1, CLAW_E.ru));
      });
      finParts.push(fr);
    }

    // --- tail streamers: vertical fan of four ribbons (upper hooked pair, lower pair)
    const tailFin = (parentF, rootP, pitch, splay, segs, gid, partBase) => {
      const base = chain(parentF, T(...rootP), R(M3.ry(splay)), R(M3.rz(pitch)));
      let fr = chain(base, R(M3.rz(0.1 * Math.sin(ph - 1.4))));
      segs.forEach((sg, k) => {
        if (k > 0) fr = chain(fr, pivot([sg.j[0], sg.j[1], 0], M3.rz(0.14 * Math.sin(ph - 2.1 - k * 0.5))));
        const E = sg.e;
        // fin space: u back (-x), v up (+y), w = z
        const cTailEdge = code(TAILF), TB = [code(TAILF, -1), code(TAILF, 0), code(TAILF, 1)];
        prims.push(clipped(shell(fr, [-E.cu, E.cv, 0], [-1, 0, 0], [0, 0, 1], [0, 1, 0], [E.ru, E.rw, E.rv], { part: partBase + k, grp: gid, mat: null }), (a, b, c) => {
          const pv = pk(E.pk, E.cu + E.ru * a, E.cv + E.rv * c);
          return pv ? TB[(pv >> 1) & 3] : 0;
        }, (a, b, c) => (pk(E.pk, E.cu + E.ru * a, E.cv + E.rv * c) ? cTailEdge : 0), 1, E.ru));
      });
      return fr;
    };
    const upSeg = [{ e: UP_A }, { e: UP_B, j: [-40, 76] }];
    const loSeg = [{ e: LO_A }, { e: LO_B, j: [-120, -6] }];
    tailFin(stockF, [-100, 134, 8], 0.1, 0.2, upSeg, 9, 20);
    tailFin(stockF, [-106, 132, -8], -0.12, -0.2, upSeg, 10, 22);
    const loN = tailFin(stockF, [-150, 114, 6], 0.03, 0.18, loSeg, 11, 24);
    tailFin(stockF, [-150, 110, -6], 0.22, -0.18, loSeg, 12, 26);

    // --- anchors
    const eyeS = (() => {
      const t = HEAD.tilt, dx = EYE.x - HEAD.c[0], dy = EYE.y - HEAD.c[1];
      const lx = dx * Math.cos(t) + dy * Math.sin(t), ly = -dx * Math.sin(t) + dy * Math.cos(t);
      const s0 = lx / HEAD.r[0], s1 = ly / HEAD.r[1];
      return [s0, s1, Math.sqrt(Math.max(0, 1 - s0 * s0 - s1 * s1))];
    })();
    const anchors = {
      eye: { p: V3.add(headPrim.c, M3.v(headPrim.L, eyeS)), s: eyeS },
      mouth: V3.scale(V3.add(V3.add(headF.t, M3.v(headF.L, [394, 70, 0])), V3.add(jawF.t, M3.v(jawF.L, [392, 66, 0]))), 0.5),
      finTipN: V3.add(finParts[0].t, M3.v(finParts[0].L, [-280, 0, 0])),
      finTipF: V3.add(finParts[1].t, M3.v(finParts[1].L, [-280, 0, 0])),
      tail: V3.add(loN.t, M3.v(loN.L, [-250, -6, 0])),
      head: V3.add(headF.t, M3.v(headF.L, [300, 110, 0])),
    };
    return {
      autoSide: !pose || pose.side === undefined,
      prims, anchors, pose: P, headPrim, stamps: [], dots: [],
      pri: { 1: 1, 2: 2, 3: 0, 4: 2, 5: 3, 6: 3, 7: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 0,
    };
  }

  // Render into a tight buffer around the model's projected bounds (same bbox maths as the
  // renderer, so the pixels are identical), then place it in the full sprite buffer. The shared
  // renderer's full-buffer passes then only touch pixels near Kyogre, not the whole big buffer.
  function render(model, opt) {
    // `side` mirrors the camera cheats; when the caller did not pass it, derive it from the yaw
    // exactly like the game does (side = clamp(3 cos yaw, -1, 1)) and rebuild if it differs
    if (model.autoSide) {
      const sd = Math.max(-1, Math.min(1, 3 * Math.cos(opt.yaw ?? 1.05)));
      if (Math.abs(sd - model.pose.side) > 1e-6) model = build(Object.assign({}, model.pose, { side: sd }));
    }
    const sc = opt.scale || 1;
    LWH = 0.5 * Math.max(5.4, 1.7 / sc) * (1 + 0.3 * Math.min(1, model.pose.glow || 0));
    LW8 = LWH * 8;
    let pal = opt.pal || PAL;
    const g = Math.min(1, model.pose.glow || 0);
    if (g > 0) {
      const e = pal[RED];
      pal = Object.assign({}, pal, { [RED]: { r: e.r.map((c, i) => PX.mix(c, GLOW[i], g)), od: PX.mix(e.od, GLOW[0], g * 0.5), ol: PX.mix(e.ol, GLOW[1], g * 0.6), ln: PX.mix(e.ln, GLOW[0], g * 0.5) } });
    }
    const { yaw = 1.05, pitch = 0.16, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(sc, sc, sc)));
    // nearest primitives first: hidden pixels then fail the depth test before any mat() call
    // (draw order only affects overdraw, not the image)
    const zs = new Map();
    for (const p of model.prims) zs.set(p, V[6] * p.c[0] + V[7] * p.c[1] + V[8] * p.c[2]);
    model.prims.sort((a, b) => zs.get(b) - zs.get(a));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
      x0 = Math.min(x0, ox + cv[0] - rx); x1 = Math.max(x1, ox + cv[0] + rx);
      y0 = Math.min(y0, oy - cv[1] - ry); y1 = Math.max(y1, oy - cv[1] + ry);
    }
    const X0 = Math.max(0, Math.floor(x0) - 3), Y0 = Math.max(0, Math.floor(y0) - 3);
    const X1 = Math.min(W - 1, Math.ceil(x1) + 3), Y1 = Math.min(H - 1, Math.ceil(y1) + 3);
    if (X1 < X0 || Y1 < Y0) return Creature.render(model, Object.assign({}, opt, { pal }));
    const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { pal, W: w, H: h, ox: ox - X0, oy: oy - Y0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const src = y * w, dst = (y + Y0) * W + X0;
      buf.d.set(r.buf.d.subarray(src, src + w), dst);
      depth.set(r.depth.subarray(src, src + w), dst);
      part.set(r.part.subarray(src, src + w), dst);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + X0, a[1] + Y0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  // Pokédex 4.5 m = the model's length (~790 units); its body is ~1.2 m tall without fins
  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 4.5, lengthM: 4.5, bw: 880, bh: 650, oy: 0.575 } };
})();
