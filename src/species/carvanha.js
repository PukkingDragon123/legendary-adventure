/* ------------------------------------------------------------------
   Carvanha — the Savage Pokémon (0.8 m ≈ 140 units tall at scale 1,
   crests and ventral fin included). A posable 3D model rendered
   straight to pixel art by the shared Creature pipeline
   (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0; y = 0 is
   the bottom of the belly (the ventral fin hangs below it).

   Design (official art / HOME model): a round piranha. The body is one
   ball split along a jagged jaw line: a dark navy-blue upper head and a
   big crimson lower jaw whose rim is a ring of upward triangular spikes;
   the one at the front and one on each side, in front of the eyes, are
   sharp white fangs. Angry eyes on
   the sides — a black almond socket under a slanted navy brow, white
   sclera, a red iris ring and a black pupil toward the front. A yellow
   four-point star on each side of the red chin (where the art has it).
   Yellow jagged fins: two lightning-bolt crests on the head (the front
   one leaning forward, the rear one back, each with a second, smaller
   point on its trailing edge), a jagged ventral
   fin, long blade-like pectoral fins at the jaw line and a tall scalloped
   tail fin with a red spine along its leading edge.
   Build: the upper head and the lower jaw are the same ellipsoid cut
   along the zig-zag (each keeps its own side); the lower jaw is hinged at
   the back so it swings open onto a dark throat, a tongue and two hidden
   upper fangs.

   Pose parameters (all optional):
     swim   radians   swimming phase (period 2π): tail sweep, fin flutter,
                      a slight body rock
     bite   0..1      jaw opens wide
     fins   −1..1     pectoral fins tucked back (−1) .. flared out (1);
                      the crests lift a little with it
     eyes   'open' (angry) | 'happy' | 'closed' | 'blink'
     lunge  0..1      attack stretch: the body lengthens and leans into
                      the bite, fins and crests sweep back; negative values
                      (down to −1) coil it back before a charge (shorter,
                      nose up, fins braced)
     side   −1..1     ≈ cos(yaw), passed in by the game: the crests and the
                      tail turn a little toward the camera so they read in
                      3/4 views
   Anchors: top (rear crest tip), head (head centre), mouth (front of the
   gape), jaw (lower jaw tip), eyeN, eyeF, body (body centre), tail (tail
   fin tip), finN, finF (pectoral fin tips), belly.
------------------------------------------------------------------- */
const Carvanha = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const NAVY = 1, RED = 2, FANG = 3, STAR = 4, FIN = 5, SOCKET = 6, SCLERA = 7, IRIS = 8, THROAT = 9, TONGUE = 10, SPINE = 11;
  const MAT = { NAVY, RED, FANG, STAR, FIN, SOCKET, SCLERA, IRIS, THROAT, TONGUE, SPINE };
  const PAL = Creature.palette({
    [NAVY]:   { r: ['#0e2452', '#16366e', '#214b94', '#3466b6', '#6a98da'], od: '#07142e', ol: '#13306a', ln: '#10285a' },
    [RED]:    { r: ['#7a1430', '#a41e40', '#cc3254', '#e45c74', '#f89eaa'], od: '#460818', ol: '#7a1430', ln: '#701232' },
    [SPINE]:  { r: ['#7a1430', '#a41e40', '#cc3254', '#e45c74', '#f89eaa'], od: '#460818', ol: '#7a1430', ln: '#701232' },
    [FANG]:   { r: ['#9ca0b8', '#c8cbda', '#eef0f6', '#ffffff', '#ffffff'], od: '#3a3c58', ol: '#6a6c88', ln: '#5c5e7c' },
    [STAR]:   { r: ['#c89a30', '#e2b846', '#f6d45e', '#fce690', '#fff6c8'], od: '#6a4a0c', ol: '#a07a1e', ln: '#9a741c' },
    [FIN]:    { r: ['#c29a30', '#dcb844', '#f2d25a', '#fae48c', '#fff4c6'], od: '#6e5010', ol: '#a68224', ln: '#aa8628' },
    [SOCKET]: { r: ['#07080e', '#0a0c14', '#0e1018', '#14161f', '#1c1f2a'], od: '#040508', ol: '#07080e', ln: '#07080e' },
    [SCLERA]: { r: ['#b8bccc', '#dcdfe8', '#f6f7fa', '#ffffff', '#ffffff'], od: '#07080e', ol: '#07080e', ln: '#07080e' },
    [IRIS]:   { r: ['#8a1030', '#b01c40', '#d8304e', '#ee5c70', '#ff9aa6'], od: '#07080e', ol: '#07080e', ln: '#07080e' },
    [THROAT]: { r: ['#2a0610', '#3a0a18', '#4e1022', '#62182e', '#78223a'], od: '#18020a', ol: '#2a0610', ln: '#2a0610' },
    [TONGUE]: { r: ['#8a2a40', '#a83a52', '#c45268', '#da6e80', '#ec96a2'], od: '#4a0e1e', ol: '#6e1a2e', ln: '#6e1a2e' },
  });
  const GLOSSY = { [NAVY]: 1, [RED]: 1 };
  const C_NAVY = code(NAVY), C_RED = code(RED), C_FANG = code(FANG, 1), C_STAR = code(STAR), C_FIN = code(FIN), C_SPINE = code(SPINE);
  const C_SOCKET = code(SOCKET), C_SCLERA = code(SCLERA, 1), C_IRIS = code(IRIS, 1), C_PUPIL = code(SOCKET), C_THROAT = code(THROAT), C_TONGUE = code(TONGUE);
  const M_THROAT = () => C_THROAT, M_TONGUE = () => C_TONGUE, M_SPINE = () => C_SPINE;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  const PL = (f, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c: f.t, L: M3.mul(f.L, L), shape, thick });
  function segAxes(p0, p1) {
    const d = sub(p1, p0), l = len3(d) || 1e-3, Y = sc(d, 1 / l);
    let X = cross(Y, [0, 0, 1]);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    return { X, Y, Z: cross(X, Y), l };
  }
  const rod = (p0, p1, r, part, grp, mat) => { const a = segAxes(p0, p1); return E(sc(add(p0, p1), 0.5), M3.cols(sc(a.X, r), sc(a.Y, a.l / 2 + r * 0.7), sc(a.Z, r)), part, grp, mat); };
  // straight-edged polygon plate (keeps the fin spikes sharp)
  const polyShape = (pts, m) => {
    const bb = Shape2D.bbox(pts, 0.5);
    return bakeShape({ bb, test: (u, v) => (Shape2D.inPoly(u, v, pts) ? m : 0) });
  };

  /* ---------- body and jaw line ---------- */
  const RX = 43, RY = 35, RZ = 37;
  const SPH = 0.4;                                   // spike height (unit-sphere v)
  // spike spacing (azimuth) and which spikes are white fangs (the front one and one in front of each
  // eye); at small scales the zig-zag is coarser so it stays a clean line of teeth
  let DZ = 0.31, FANGS = [0, 3];
  // jaw line at azimuth az: the red lower jaw lies below vb (spike tips at az = k·DZ, k = 0 at the front)
  function jawAt(az) {
    const a = Math.abs(az);
    const base = -0.24 + 0.14 * (a / Math.PI);
    const t = a / DZ, k = Math.round(t);
    const f = Math.max(0, 1 - Math.abs(t - k) * 2);
    return { vb: base + SPH * f, base, k };
  }

  /* ---------- eyes (decals on the upper head) ---------- */
  const EYE_AZ = 1.06, EYE_V = 0.2;
  const SA = 14.4, SB = 10.6, TILT = 0.5;            // socket half-axes (units) and slant (back end up)
  let curScale = 1;
  const EYES = [1, -1].map((sd) => {
    const e = Creature.sph(sd * EYE_AZ, EYE_V);
    const h = nrm([e[2], 0, -e[0]]);
    return { e, u: sd > 0 ? h : sc(h, -1), v: nrm([-e[1] * e[0], 1 - e[1] * e[1], -e[1] * e[2]]), sd };
  });
  const CT = Math.cos(TILT), ST = Math.sin(TILT);
  function eyeCode(s, kind) {
    const px = 1 / curScale;
    for (const q of EYES) {
      if (s[2] * q.sd < 0.2) continue;
      const d0 = s[0] - q.e[0], d1 = s[1] - q.e[1], d2 = s[2] - q.e[2];
      const a = (d0 * q.u[0] + d1 * q.u[1] + d2 * q.u[2]) * RZ, b = (d0 * q.v[0] + d1 * q.v[1] + d2 * q.v[2]) * RY;   // a: + toward the front, b: up
      if (Math.abs(a) > 18 || Math.abs(b) > 15) continue;
      const sa = Math.max(SA, 3.4 * px), sb = Math.max(SB, 2.7 * px);
      const al = -a * CT + b * ST, ac = a * ST + b * CT;          // along the socket (toward the back-top), across
      if ((al / sa) ** 2 + (ac / sb) ** 2 >= 1) continue;
      const brow = sb * 0.55 - 0.42 * a;                           // slanted angry brow: navy above it
      if (b > brow) return C_NAVY;
      if (kind === 'open') {
        const ir = Math.max(5.2, 1.3 * px), pr = Math.max(2, 0.55 * px);
        const ia = a - sa * 0.22, ib = b + sb * 0.1;               // iris centre: toward the front, a bit low
        const r2 = ia * ia + ib * ib;
        if (r2 < pr * pr) return C_PUPIL;
        if (r2 < ir * ir) return C_IRIS;
        const wa = al + sa * 0.08, wc = ac - sb * 0.05;
        if ((wa / (sa * 0.8)) ** 2 + (wc / (sb * 0.62)) ** 2 < 1) return C_SCLERA;
        return C_SOCKET;
      }
      // happy ^ / closed: a black arc in a navy lid
      const lw = Math.max(0.8, 0.6 * px), x = al / sa;
      const yc = kind === 'happy' ? (-0.25 + 0.5 * (1 - x * x)) * sb : (0.05 - 0.3 * (1 - x * x)) * sb;
      return Math.abs(ac - yc) < lw ? C_SOCKET : C_NAVY;
    }
    return 0;
  }

  /* ---------- star on the chin (each side) ---------- */
  const STAR_AZ = 0.6, STAR_V = -0.62, STAR_A = 12, STAR_B = 12.5;
  const STARS = [1, -1].map((sd) => {
    const e = Creature.sph(sd * STAR_AZ, STAR_V);
    const h = nrm([e[2], 0, -e[0]]);
    return { e, u: sd > 0 ? h : sc(h, -1), v: nrm([-e[1] * e[0], 1 - e[1] * e[1], -e[1] * e[2]]), sd };
  });
  function starHit(s) {
    for (const q of STARS) {
      if (s[2] * q.sd < -0.15) continue;
      const d0 = s[0] - q.e[0], d1 = s[1] - q.e[1], d2 = s[2] - q.e[2];
      const a = (d0 * q.u[0] + d1 * q.u[1] + d2 * q.u[2]) * RZ, b = (d0 * q.v[0] + d1 * q.v[1] + d2 * q.v[2]) * RY;
      // four-point star, turned a little (one point up, leaning forward)
      const ra = a * 0.97 - b * 0.24, rb = a * 0.24 + b * 0.97;
      if (Math.sqrt(Math.abs(ra) / STAR_A) + Math.sqrt(Math.abs(rb) / STAR_B) < 1) return true;
    }
    return false;
  }

  /* ---------- fins (plates) ---------- */
  // crests: u = forward, v = up; lightning-bolt blades leaning forward with a second point behind
  // (broad blades: a tall main spike with a smaller second spike on its trailing edge)
  const CREST_F = polyShape([[11, -10], [10, 0], [10, 22], [13, 45], [0, 22], [-8, 34], [-11, 14], [-12, 0], [-12, -10]].map(([u, v]) => [u * 1.25, v * 1.08]), C_FIN);
  const CREST_R = polyShape([[11, -10], [10, 0], [5, 20], [-3, 44], [-7, 23], [-17, 34], [-16, 14], [-14, 0], [-14, -10]].map(([u, v]) => [u * 1.2, v * 0.9]), C_FIN);
  // ventral: u = forward, v = up (hangs down)
  const VENTRAL = polyShape([[-11, 6], [10, 6], [8, -8], [4, -20], [0, -36], [-3, -22], [-11, -28], [-11, -13], [-13, -2]], C_FIN);
  // pectoral: u = back along the blade, v = across
  const PECT = polyShape([[-3, -6.5], [12, -6.5], [27, -4], [42, -0.6], [28, 3.6], [13, 6.2], [-3, 6.8]], C_FIN);
  // tail: u = backward, v = up; the spine runs down the leading edge (u ≈ 0), scalloped trailing edge
  // upper fang (u across, v down the fang), shown when the jaw opens
  const UFANG = polyShape([[-2.8, -1.5], [2.8, -1.5], [0.4, 9.5]], C_FANG);
  const TAIL = polyShape([[0, 58], [6, 60], [15, 48], [9, 38], [21, 30], [14, 20], [24, 9], [16, -1], [22, -14], [13, -22], [16, -34], [6, -46], [0, -48], [-3, -38], [-3, 48]], C_FIN);

  const DEFAULT = { swim: 0, bite: 0, fins: 0, eyes: 'open', lunge: 0, side: 1 };
  const PRI = {};
  for (let i = 1; i < 32; i++) PRI[i] = 0;
  // upper head 1, lower jaw 2, throat 3, tongue 4, upper fangs 5, crests 6/7, ventral 8, pectorals 9/10, tail 11, spine 12
  Object.assign(PRI, { 1: 1, 2: 1, 3: -1, 4: 0, 5: 2, 6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 1, 12: 2 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const ph = +P.swim || 0, sw = Math.sin(ph), cw = Math.cos(ph);
    const bite = clamp(+P.bite || 0, 0, 1), fins = clamp(+P.fins || 0, -1, 1), lg = clamp(+P.lunge || 0, -1, 1);
    const side = clamp(P.side === undefined ? 1 : +P.side, -1, 1);
    const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'closed' || P.eyes === 'blink' || P.eyes === 'sleep' ? 'closed' : 'open';

    // body frame (centre of the ball): lunge stretches it and leans it into the bite, the swim rocks it
    const body = chain(T(0, RY, 0), R(M3.rz(-0.12 * lg + 0.04 * cw)), R(M3.rx(0.05 * sw)), R(M3.diag(1 + 0.22 * lg, 1 - 0.07 * lg, 1 - 0.07 * lg)));
    // --- upper head: navy above the jaw line, with the eyes
    prims.push(ellF(body, [RX, RY, RZ], 1, 1, (s) => {
      const az = Math.atan2(s[2], s[0]);
      if (s[1] < jawAt(az).vb) return 0;
      if (s[1] > -0.2 && Math.abs(s[2]) > 0.45) { const e = eyeCode(s, kind); if (e) return e; }
      return C_NAVY;
    }));
    // --- lower jaw: hinged at the back of the mouth
    const open = bite * 0.62 + Math.max(0, lg) * 0.12;
    const HX = -RX * 0.62, HY = -RY * 0.12;
    const jaw = chain(body, T(HX, HY, 0), R(M3.rz(-open)), T(-HX, -HY, 0));
    prims.push(ellF(jaw, [RX, RY, RZ], 2, 2, (s) => {
      const az = Math.atan2(s[2], s[0]);
      const j = jawAt(az);
      if (s[1] > j.vb) return 0;
      if (s[1] > j.base && Math.abs(az) < Math.PI * 0.62 && FANGS.includes(j.k)) return C_FANG;
      if (s[0] > -0.2 && s[1] < -0.12 && starHit(s)) return C_STAR;
      return C_RED;
    }));
    // --- mouth inside: throat (upper), tongue on the jaw floor, two upper fangs that show when it opens
    if (open > 0.02) {
      prims.push(ellF(chain(body, T(RX * 0.05, -RY * 0.18, 0)), [RX * 0.84, RY * 0.3, RZ * 0.8], 3, 3, M_THROAT));
      prims.push(ellF(chain(jaw, T(RX * 0.08, -RY * 0.36, 0)), [RX * 0.74, RY * 0.2, RZ * 0.68], 4, 4, M_TONGUE));
      for (const sd of [1, -1]) {
        const az = sd * 0.47, s0 = Creature.sph(az, jawAt(az).base + 0.06);
        const n = nrm([s0[0] / RX, 0, s0[2] / RZ]);
        const p = sub([RX * s0[0], RY * s0[1], RZ * s0[2]], sc(n, 2));
        const across = nrm(cross([0, 1, 0], n));
        prims.push(PL(chain(body, T(...p)), M3.cols(across, [0, -1, 0], n), 5, 5, UFANG, 1.4));
      }
    }
    anchors.head = body.t;
    anchors.body = body.t;
    anchors.mouth = inF(body, [RX * 0.93, RY * (-0.26 - 0.3 * open), 0]);
    anchors.jaw = inF(jaw, [RX * 0.9, -RY * 0.36, 0]);
    anchors.belly = inF(jaw, [0, -RY, 0]);
    for (const q of EYES) anchors[q.sd > 0 ? 'eyeN' : 'eyeF'] = inF(body, [RX * q.e[0], RY * q.e[1], RZ * q.e[2]]);

    // --- crests on the head: lean back with the lunge, lift with the fins, turn toward the camera
    const cl = -0.3 * lg + 0.08 * fins - 0.03 * sw;
    const turn = 0.35 * side;
    // (splayed a little, so they also read from the front)
    const cf = chain(body, T(24, RY * 0.68, 1.5), R(M3.ry(turn + 0.22)), R(M3.rz(cl - 0.08)));
    prims.push(PL(cf, M3.I(), 6, 6, CREST_F, 1.8));
    const cr = chain(body, T(3, RY * 0.98, -1.5), R(M3.ry(turn - 0.22)), R(M3.rz(cl * 1.2)));
    prims.push(PL(cr, M3.I(), 7, 7, CREST_R, 1.8));
    anchors.top = inF(cr, [-3.6, 39.6, 0]);
    // --- ventral fin under the belly (on the jaw)
    const vf = chain(jaw, T(-3, -RY + 3, 0), R(M3.ry(turn * 0.6)), R(M3.rz(0.12 + 0.2 * lg)));
    prims.push(PL(vf, M3.I(), 8, 8, VENTRAL, 1.8));

    // --- pectoral fins: long blades at the jaw line, swept back; flare / tuck with `fins`
    for (const sd of [1, -1]) {
      const s0 = Creature.sph(sd * 1.95, -0.2);
      const root = [RX * s0[0] * 0.92, RY * s0[1], RZ * s0[2] * 0.92];
      const out = 0.42 + 0.3 * fins - 0.25 * lg + 0.18 * Math.sin(ph * 2 + sd);
      const d = nrm([-Math.cos(out), -0.12, sd * Math.sin(out)]);
      const Z = nrm(cross(d, [0, 1, 0])), Y = cross(Z, d);
      const pf = chain(body, T(...root));
      prims.push(PL(pf, M3.mul(M3.cols(d, Y, Z), M3.rx(sd * 0.35)), sd > 0 ? 9 : 10, sd > 0 ? 9 : 10, PECT, 1.6));
      anchors[sd > 0 ? 'finN' : 'finF'] = inF(pf, sc(d, 41));
    }

    // --- tail fin with its red spine (sweeps with the swim)
    const tf = chain(body, T(-RX + 3, -RY * 0.04, 0), R(M3.ry(0.42 * sw + 0.3 * side)), T(-7, 0, 0), R(M3.rz(0.1 * lg)));
    prims.push(PL(tf, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1]), 11, 11, TAIL, 2));
    const sp = [[1, 57], [2.2, 30], [2, 2], [1.5, -24], [-0.5, -47]].map(([u, v]) => inF(tf, [u, v, 0]));
    for (let i = 0; i < sp.length - 1; i++) prims.push(rod(sp[i], sp[i + 1], 2.3 - i * 0.2, 12, 12, M_SPINE));
    anchors.tail = inF(tf, [-20, 6, 0]);

    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: NAVY, shadowSteps: 14, shadowDepth: 24 };
  }

  // drop tiny detached islands (a spike tip or fin edge seen edge-on can leave lone outlined pixels)
  function despeckle(d, depth, part, w, h) {
    const seen = new Uint8Array(w * h), stack = [], comp = [];
    for (let i0 = 0; i0 < w * h; i0++) {
      if (!d[i0] || seen[i0]) continue;
      stack.length = 0; comp.length = 0; stack.push(i0); seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop(); comp.push(i);
        const x = i % w;
        if (x > 0 && d[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < w - 1 && d[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (i >= w && d[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
        if (i < w * (h - 1) && d[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      }
      if (comp.length < 9) for (const i of comp) { d[i] = 0; depth[i] = -1e9; part[i] = 0; }
    }
  }

  // ray-cast only the prims' screen box (the full-buffer passes dominate), then place it in the W×H buffer
  function cropRender(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of model.prims) {
      const cv = M3.v(V, p.c), Lv = M3.mul(V, p.L);
      if (p.kind === 'ell') {
        const rx = Math.hypot(Lv[0], Lv[1], Lv[2]), ry = Math.hypot(Lv[3], Lv[4], Lv[5]);
        x0 = Math.min(x0, cv[0] - rx); x1 = Math.max(x1, cv[0] + rx); y0 = Math.min(y0, -cv[1] - ry); y1 = Math.max(y1, -cv[1] + ry);
      } else {
        const [a, b, c, d] = p.shape.bb;
        for (const u of [a, c]) for (const v of [b, d]) for (const w of [-p.thick, p.thick]) {
          const qx = cv[0] + Lv[0] * u + Lv[1] * v + Lv[2] * w, qy = cv[1] + Lv[3] * u + Lv[4] * v + Lv[5] * w;
          x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, -qy); y1 = Math.max(y1, -qy);
        }
      }
    }
    const bx0 = Math.max(0, Math.floor(ox + x0) - 3), bx1 = Math.min(W - 1, Math.ceil(ox + x1) + 3);
    const by0 = Math.max(0, Math.floor(oy + y0) - 3), by1 = Math.min(H - 1, Math.ceil(oy + y1) + 3);
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.85 * W * H) return Creature.render(model, opt);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
    despeckle(r.buf.d, r.depth, r.part, w, h);
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s0 = y * w, d0 = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s0, s0 + w), d0);
      depth.set(r.depth.subarray(s0, s0 + w), d0);
      part.set(r.part.subarray(s0, s0 + w), d0);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    if (curScale < 0.55) { DZ = 0.46; FANGS = [0, 2]; } else { DZ = 0.31; FANGS = [0, 3]; }
    return cropRender(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.8, bw: 180, bh: 170, oy: 0.715 } };
})();
