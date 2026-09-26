/* ------------------------------------------------------------------
   Depth — the multi-plane camera that makes the side-on world feel
   3D. Between the horizon and the path a real perspective plane
   carries the far beaches, the lagoon and the island toward the
   horizon, with palms, rocks, boats and a second dock arm standing
   on it. Below the path the ground is sand (or seabed) stretching
   toward the viewer, and big blurred foreground pieces slide past in
   front. Zooming in exaggerates the depth, so the camera dollies.
------------------------------------------------------------------- */
const Depth = (() => {
  const { hex, mix, hash2, fbm, bayer4 } = PX;
  const SEA = World.SEA;
  let K = 1, hs = 0;
  const lerp = (a, b, t) => a + (b - a) * t;
  // integer colour blend, t in 0..1 (no allocations in the hot loops)
  const mixi = (a, b, t) => { const t8 = (t * 256) | 0, it = 256 - t8; return (0xff000000 | ((((a & 0xff00ff) * it + (b & 0xff00ff) * t8) >>> 8) & 0xff00ff) | ((((a & 0xff00) * it + (b & 0xff00) * t8) >>> 8) & 0xff00)) >>> 0; };
  function setup(cx, cy, VW, VH) {
    K = Math.max(0.8, 1 + (Game.zoom - (Game.zMin || 2)) * 0.22);
    hs = World.HORIZON + Math.round(WorldRender.tilt()) - cy;
  }
  // project a point standing on the world at depth z (lane = 1, farther > 1, nearer < 1)
  function proj(wx, wy, z, cx, cy, VW) {
    const zz = 1 + (z - 1) * K, iz = 1 / zz, lx = wx - cx, ly = wy - cy;
    return [lx * iz + (VW / 2) * (1 - iz), ly + (hs - ly) * (1 - iz), iz];
  }
  const LAND = new Uint8Array((World.W >> 1) + 2);
  for (let i = 0; i < LAND.length; i++) LAND[i] = World.groundAt(Math.min(World.W, i * 2)) < SEA - 1 ? 1 : 0;
  const isLand = (wx) => wx < 0 || (wx <= World.W && LAND[wx >> 1] === 1);
  const NOISE = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) NOISE[i] = fbm(i * 0.02, 3, 3, 2);
  // the coast bends as it recedes, so beaches curve away like a bay
  const bend = (zz) => Math.sin(zz * 0.45) * 60 + (zz - 1) * 22;

  /* ---------------- far plane: horizon -> path ---------------- */
  function drawPlane(fb, cx, cy, P, t) {
    const VW = fb.w, VH = fb.h, d = fb.d;
    const ref = SEA - cy;
    if (hs >= ref - 2) return;
    const y0 = Math.max(0, Math.ceil(hs) + 1), y1 = Math.min(VH, ref);
    const sd = P.sand, wc = P.waterC, sunX = Math.round(P.sun.px * VW);
    const skyAt = (y) => P.skyRow[Math.max(0, Math.min(P.skyRow.length - 1, y + cy))].a;
    const haze = P.farC[P.farC.length - 1] || wc[0];
    const shal = P.shallow ? P.shallow[2] : hex('#5ad8d0'), white = hex('#ffffff');
    for (let y = y0; y < y1; y++) {
      const iz0 = 1 - (y - ref) / (hs - ref);      // 0 at the horizon, 1 at the path
      const iz = iz0 / K + (1 - 1 / K) * iz0 * iz0;
      const zz = 1 / Math.max(0.02, iz), row = y * VW;
      const fog = Math.pow(1 - iz0, 2.2), F = (c) => (fog > 0.02 ? mix(c, haze, fog) : c);
      const refl = skyAt(Math.round(hs - (y - hs) * 1.3));
      const wBase = mix(mix(wc[0], wc[Math.min(1, wc.length - 1)], iz0), refl, 0.25 + 0.45 * (1 - iz0));
      // this row's palette, already fogged
      const cS = [F(sd[2]), F(sd[1]), F(sd[3]), F(mix(sd[3], P.sandWet[2], 0.6))], cW = [F(wBase), F(mix(wBase, shal, 0.35)), F(mix(wBase, white, 0.28)), F(mix(wBase, white, 0.7))];
      const streak = Math.sin(zz * 5.5 - t * 1.6) > 0.9, rimD = 26 / iz, shD = 60 / iz, bz = bend(zz), fz = Math.floor(zz * 14), sunW = 30 * (1 - iz0) + 4;
      const a0 = cx - (VW / 2) * (1 - iz) / iz + bz, step = 1 / iz;
      let wx = a0;
      for (let x = 0; x < VW; x++, wx += step) {
        let c;
        if (isLand(wx)) {
          const g = hash2(Math.floor(wx * iz * 0.6), fz, 5);
          c = !isLand(wx + rimD) || !isLand(wx - rimD) ? cS[3] : g < 0.3 ? cS[0] : g > 0.93 ? cS[1] : cS[2];
        } else {
          c = isLand(wx + shD) || isLand(wx - shD) ? cW[1] : cW[0];
          if (streak && hash2(Math.floor(wx * iz * 0.2), fz, 2) > 0.4) c = cW[2];
          if (Math.abs(x - sunX) < sunW && hash2(x, Math.floor(y + t * 8), 9) > 0.93) c = cW[3];
        }
        d[row + x] = c;
      }
    }
  }

  /* ---------------- things standing on the far plane ---------------- */
  let built = {};
  function assets(P) {
    if (built[P.key]) return built[P.key];
    const pal = Props.palette(P);
    const toBuf = (spr) => { const b = new PX.Buf(spr.w, spr.h); for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) { const v = spr.get(x, y); if (v) b.d[y * spr.w + x] = pal[v]; } return b; };
    // each distant palm: trunk and crown merged into one buffer, anchored at the trunk base
    const palms = [260, 190, 140, 100].map((h, i) => {
      const m = Props.makePalm({ h, lean: [0.1, -0.12, 0.15, -0.05][i], seed: 40 + i });
      const tr = m.trunk, cr = m.frames[0], ox = Math.round(m.crownX - m.ccx), oy = Math.round(m.crownY - m.ccy);
      const x0 = Math.min(0, ox), y0 = Math.min(0, oy), x1 = Math.max(tr.w, ox + cr.w), y1 = Math.max(tr.h, oy + cr.h);
      const b = new PX.Buf(x1 - x0, y1 - y0);
      const put = (spr, dx, dy) => { for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) { const v = spr.get(x, y); if (v) b.d[(y + dy - y0) * b.w + x + dx - x0] = pal[v]; } };
      put(tr, 0, 0); put(cr, ox, oy);
      b.ax = m.bx - x0; b.ay = m.by - y0;
      return b;
    });
    const rocks = [[60, 36], [40, 24], [26, 16]].map(([w, h], i) => toBuf(Props.makeRock(w, h, 60 + i, { moss: true })));
    built[P.key] = { palms, rocks, pal };
    return built[P.key];
  }
  // placements on the plane: (world x, depth z)
  const FAR = [];
  (() => {
    let s = 7;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 11; i++) FAR.push({ k: 'palm', x: 40 + r() * 900, z: 1.25 + r() * 2.4, v: Math.floor(r() * 4) });
    for (let i = 0; i < 5; i++) FAR.push({ k: 'palm', x: 2440 + r() * 480, z: 1.3 + r() * 2.2, v: Math.floor(r() * 4) });
    for (let i = 0; i < 12; i++) FAR.push({ k: 'rock', x: 300 + r() * 2700, z: 1.2 + r() * 2.5, v: Math.floor(r() * 3) });
    for (let i = 0; i < 4; i++) FAR.push({ k: 'boat', x: 1150 + r() * 1100, z: 1.6 + r() * 2.5, v: i });
  })();
  function blitScaled(fb, b, X, Y, s, fog, fogC) {
    // nearest-neighbour scale of a pixel sprite anchored at (ax, ay) — bottom centre by default
    const w = Math.max(1, Math.round(b.w * s)), h = Math.max(1, Math.round(b.h * s));
    const x0 = Math.round(X - (b.ax ?? b.w / 2) * s), y0 = Math.round(Y - (b.ay ?? b.h) * s);
    const W = fb.w, H = fb.h, d = fb.d;
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
      const sy = Math.min(b.h - 1, Math.floor((y - y0) / s));
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
        const c = b.d[sy * b.w + Math.min(b.w - 1, Math.floor((x - x0) / s))];
        if (c) d[y * W + x] = fog > 0.02 ? mix(c, fogC, fog) : c;
      }
    }
  }
  function drawFar(fb, cx, cy, P, t) {
    const VW = fb.w, VH = fb.h, A = assets(P);
    if (hs >= SEA - cy - 2) return;
    const haze = P.farC[P.farC.length - 1] || P.waterC[0];
    const list = FAR.map((o) => ({ o, zz: 1 + (o.z - 1) * K })).sort((a, b) => b.zz - a.zz);
    for (const { o, zz } of list) {
      const wx = o.x + bend(zz);
      const [X, Y, iz] = proj(wx, SEA - 2, o.z, cx, cy, VW);
      if (X < -120 || X > VW + 120 || Y < hs) continue;
      if (o.k !== 'boat' && !isLand(wx)) continue;
      if (o.k === 'boat' && isLand(wx)) continue;
      const fog = Math.pow(1 - iz, 2) * 0.8;
      if (o.k === 'palm') {
        blitScaled(fb, A.palms[o.v], X, Y, iz * 0.8, fog, haze);
      } else if (o.k === 'rock') blitScaled(fb, A.rocks[o.v], X, Y + 2 * iz, iz, fog, haze);
      else drawBoat(fb, X, Y + Math.sin(t * 1.2 + o.v) * iz, iz, o.v, fog, haze);
    }
    drawDockArm(fb, cx, cy, P, t, haze);
  }
  function drawBoat(fb, X, Y, s, v, fog, haze) {
    const hull = [hex('#b43a2a'), hex('#f2ece0'), hex('#2e5a8e'), hex('#f0c040')][v % 4], W = Math.round(46 * s), H = Math.round(9 * s) + 1;
    for (let x = -W / 2; x < W / 2; x++) {
      const u = x / (W / 2), top = Math.round(Y - H - (u > 0.6 ? (u - 0.6) * 10 * s : 0)), bot = Math.round(Y - H * 0.2 * (1 - u * u));
      for (let y = top; y <= bot; y++) { const c = y === top ? hex('#fff8ea') : y > bot - 2 ? mix(hull, hex('#000000'), 0.3) : hull; setF(fb, X + x, y, c, fog, haze); }
    }
    if (v % 2 === 0) { // a little cabin and mast
      for (let y = 0; y < 8 * s; y++) for (let x = -6 * s; x < 6 * s; x++) setF(fb, X + x, Y - H - y, hex('#ffffff'), fog, haze);
      for (let y = 0; y < 26 * s; y++) setF(fb, X - 2 * s, Y - H - y, hex('#5a4a3a'), fog, haze);
    }
  }
  function setF(fb, x, y, c, fog, haze) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) fb.d[y * fb.w + x] = fog > 0.02 ? mix(c, haze, fog) : c; }
  // a second dock arm running off into the distance, like the reference picture
  function drawDockArm(fb, cx, cy, P, t, haze) {
    const VW = fb.w, pal = Props.palette(P), wood = [pal[Props.I.WOOD], pal[Props.I.WOOD + 1], pal[Props.I.WOOD + 2], pal[Props.I.WOOD + 3]], ink = pal[Props.I.INK];
    const X0 = World.PIER.x1 - 40, deck = World.PIER.deck;
    const pts = [];
    for (let i = 0; i < 12; i++) { const z = 1.12 * Math.pow(1.22, i); pts.push({ z, p: proj(X0 + i * 18, deck, z, cx, cy, VW), b: proj(X0 + i * 18, SEA + 2, z, cx, cy, VW), top: proj(X0 + i * 18, deck - 40, z, cx, cy, VW) }); }
    for (let i = pts.length - 2; i >= 0; i--) {
      const a = pts[i], b = pts[i + 1], fog = Math.pow(1 - a.p[2], 2) * 0.75;
      // deck span
      const th = Math.max(1, 10 * a.p[2]);
      for (let k = 0; k <= 1; k += 1 / Math.max(2, Math.abs(a.p[0] - b.p[0]) + 2)) {
        const x = lerp(b.p[0], a.p[0], k), y = lerp(b.p[1], a.p[1], k), tk = lerp(10 * b.p[2], th, k);
        for (let j = 0; j < tk; j++) setF(fb, x, y + j, j < 2 ? wood[3] : j < tk * 0.6 ? wood[2] : wood[1], fog, haze);
      }
      // post and chain
      const w = Math.max(1, Math.round(6 * a.p[2]));
      for (let y = Math.round(a.top[1]); y < a.b[1]; y++) for (let k = -w; k <= w; k++) setF(fb, a.p[0] + k, y, k < 0 ? wood[3] : wood[1], fog, haze);
      const ct = b.top, ca = a.top;
      for (let k = 0; k <= 1; k += 0.04) { const x = lerp(ca[0], ct[0], k), y = lerp(ca[1], ct[1], k) + Math.sin(k * Math.PI) * 8 * a.p[2] + 6 * a.p[2]; setF(fb, x, y, ink, fog, haze); }
    }
  }

  /* ---------------- near plane: below the path ---------------- */
  function drawNear(fb, cx, cy, P, t, occ) {
    const VW = fb.w, VH = fb.h, d = fb.d, sd = P.sand, sw = P.sandWet, sb = P.seabed;
    for (let x = 0; x < VW; x++) {
      const wx = cx + x;
      if (wx < 0 || wx > World.W) continue;
      const g = World.groundAt(wx), under = g > SEA + 2;
      const top = Math.ceil(g) - cy + 6;
      const ref = g - cy, span = Math.max(40, ref - hs);
      const wetK = Math.max(0, Math.min(1, (wx - (World.shoreX - 140)) / 140));
      const R = wetK > 0.5 ? sw : sd, deepK = g > SEA + 560;
      // fade the hard edge where the sand in front meets the water
      const ds = wx - World.shoreX, shoreK = under ? Math.max(0, 0.6 - ds / 100) : Math.max(0, Math.min(0.45, (ds + 70) / 70 * 0.45)), waterC = P.waterC[0];
      const dark = under ? sb[0] : P.cut[0];
      for (let y = Math.max(0, top); y < VH; y++) {
        const iz = 1 + (y - ref) / span * 1.4, zz = 1 / iz;       // nearer toward the bottom
        const u = (x - VW / 2) * zz + cx + VW / 2;
        const ph = zz * 70 + NOISE[(Math.floor(u * 0.4) & 4095)] * 5;
        const rip = Math.sin(ph) > 0.55, grain = hash2(Math.floor(u * 0.7), Math.floor(zz * 60), 3);
        let c;
        if (under) {
          c = rip ? sb[3] : grain < 0.12 ? sb[1] : sb[2];
          if (grain > 0.99) c = SHELL;
          if (deepK) c = dark;
          else if (shoreK > 0) c = mixi(c, R[2], shoreK);
        } else {
          c = rip ? R[3] : grain < 0.2 ? R[1] : R[2];
          if (grain > 0.992) c = SHELL;
          if (shoreK > 0) c = mixi(c, waterC, shoreK);
        }
        // closer = darker and softer (depth of field)
        const dk = Math.min(under ? 0.25 : 0.4, (iz - 1) * 0.3);
        if (dk > 0.03 && bayer4(x, y) < dk * 1.4) c = mixi(c, dark, 0.35);
        const i = y * VW + x;
        d[i] = c; occ[i] = 1;
      }
    }
  }
  const SHELL = hex('#f4e8e0');

  /* ---------------- surface sheen: looking down into clear water ---------------- */
  function drawSheen(fb, cx, cy, P, t) {
    const VW = fb.w, VH = fb.h, d = fb.d;
    const under = cy + VH * 0.5 > SEA + 40;
    if (under) return;
    for (let x = 0; x < VW; x++) {
      const wx = cx + x, g = World.groundAt(Math.max(0, Math.min(World.W, wx)));
      const s0 = Math.floor(WorldRender.surfaceAt(wx, t)) - cy;
      if (g <= s0 + cy) continue;
      for (let k = 1; k < 26; k++) {
        const y = s0 + k;
        if (y < 0 || y >= VH) continue;
        const a = (1 - k / 26) * 0.5, refl = P.skyRow[Math.max(0, Math.min(P.skyRow.length - 1, s0 + cy - k * 3))].a;
        let c = mixi(d[y * VW + x], refl, a);
        if (Math.sin(k * 1.9 + wx * 0.05 - t * 2) > 0.94) c = mixi(c, 0xffffffff, 0.4 * (1 - k / 26));
        d[y * VW + x] = c;
      }
    }
  }

  /* ---------------- foreground: big blurred pieces sliding past ---------------- */
  let fore = {};
  function foreAssets(P) {
    if (fore[P.key]) return fore[P.key];
    const pal = Props.palette(P);
    const blurBuf = (spr, scale) => {
      const w = spr.w * scale, h = spr.h * scale, b = new PX.Buf(w, h), tmp = new Uint32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = spr.get(Math.floor(x / scale), Math.floor(y / scale)); if (v) tmp[y * w + x] = mix(pal[v], hex('#101828'), 0.35); }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = tmp[y * w + x]; if (!c) continue;
        let n = 0, r = 0, g = 0, bb = 0;
        for (let k = -2; k <= 2; k++) for (let j = -2; j <= 2; j++) { const q = tmp[Math.min(h - 1, Math.max(0, y + k)) * w + Math.min(w - 1, Math.max(0, x + j))]; if (q) { n++; r += q & 255; g += (q >> 8) & 255; bb += (q >> 16) & 255; } }
        b.d[y * w + x] = (0xff000000 | ((bb / n) << 16) | ((g / n) << 8) | (r / n)) >>> 0;
      }
      return b;
    };
    fore[P.key] = {
      rock: blurBuf(Props.makeRock(70, 40, 91, { moss: true }), 2),
      rock2: blurBuf(Props.makeRock(46, 28, 92, { moss: false }), 2),
      coral: blurBuf(Props.makeCoral('fan', 93, 0.9, { base: Props.I.CORF }), 2),
      coral2: blurBuf(Props.makeCoral('branch', 94, 0.8, { base: Props.I.CORE }), 2),
    };
    return fore[P.key];
  }
  const FORE = [];
  (() => { let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let x = 60; x < World.W; x += 260 + r() * 380) FORE.push({ x, v: Math.floor(r() * 4) }); })();
  function drawFore(fb, cx, cy, P, t) {
    const VW = fb.w, VH = fb.h, A = foreAssets(P), z = 0.45;
    for (const o of FORE) {
      const g = World.groundAt(Math.max(0, Math.min(World.W, o.x))), under = g > SEA + 2;
      const [X, Y] = proj(o.x, g + 70, z, cx, cy, VW);
      if (X < -200 || X > VW + 200 || Y < VH * 0.6) continue;
      const b = under ? (o.v % 2 ? A.coral : A.coral2) : (o.v % 2 ? A.rock : A.rock2);
      blitScaled(fb, b, X, Math.max(Y, VH + 12), 1, 0, 0);
    }
  }
  return { setup, proj, drawPlane, drawFar, drawNear, drawSheen, drawFore, K: () => K };
})();
