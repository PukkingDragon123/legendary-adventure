/* ------------------------------------------------------------------
   Regice — the Iceberg Pokémon (1.8 m ≈ 315 units tall at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a golem built of pale-blue ice crystals. The
   body (head and torso in one) is a tall hexagonal crystal prism with a
   bevelled base and a faceted pyramid top; on its upper front, seven
   braille dots in a plus (a row of five crossed by a column of three)
   serve as its eyes and light up yellow when it wakes. Each arm is a big
   hexagonal crystal hanging from the shoulder, pointed at the top, with
   four stubby crystal fingers; a thinner crystal juts up and back behind
   each shoulder. It stands on a wide flat hexagonal ice slab with two
   downward-pointing crystal spikes for legs.
   Build: every crystal is a convex hull of hexagonal rings made of flat
   facet plates (flat-shaded by the renderer); dots are small discs.

   Pose params:
     walk    radians  stiff waddle phase: the body rocks side to side with
                      sin(walk), feet lift in turn, arms barely swing; 0 = still
     glow    0..1     the seven dots glow (brighter, near white-yellow)
     awake   0..1     0 dormant (dark dots, slightly dimmer ice), 1 active
                      (yellow dots)
     arms    0..1     arms raised forward and up (Ice Beam pose)
     eyes    'open' (default) | 'happy' | 'blink' | 'closed' — blink/closed dim
                      the dots (it has no other eyes)
     mouth   0..1     accepted for the shared API; Regice has no mouth (unused)
     side    −1..1    ≈ 3·cos(yaw), passed by the game (unused)
   Anchors: top (crest), head (the dot face), mouth (= face centre, where the
            Ice Beam comes from), eyeN/eyeF (outer dots), body, handN, handF,
            footN, footF.
------------------------------------------------------------------- */
const Regice = (() => {
  const { code } = Creature;

  // ---- materials
  const ICE = 1, ICED = 2, DOT = 3, DOTD = 4, EDGE = 5;
  const MAT = { ICE, ICED, DOT, DOTD, EDGE };
  const PAL = Creature.palette({
    [ICE]:  { r: ['#5a92b4', '#80b9d7', '#a8d5ec', '#cdeaf8', '#f2fbff'], od: '#1f4a6e', ol: '#3c6f96', ln: '#4a7ea6' },
    [ICED]: { r: ['#5089ac', '#74aed0', '#98cae6', '#bee2f4', '#e6f6fe'], od: '#1f4a6e', ol: '#3c6f96', ln: '#4a7ea6' },
    [EDGE]: { r: ['#86b8dc', '#aad4ee', '#d4f0fc', '#eefaff', '#ffffff'], od: '#1f4a6e', ol: '#3c6f96', ln: '#4a7ea6' },
    [DOT]:  { r: ['#b8860e', '#e2b01e', '#f8d23a', '#ffe886', '#fff8d4'], od: '#6a4406', ol: '#8e6210', ln: '#7a520a' },
    [DOTD]: { r: ['#1c2a3a', '#243548', '#2c4056', '#364c64', '#405872'], od: '#101a26', ol: '#1c2a3a', ln: '#1c2a3a' },
  });
  const GLOSSY = {};
  const LIT = ['#ffe070', '#fff09a', '#fff8c8', '#ffffee', '#ffffff'].map(PX.hex);
  const C_ICE = code(ICE), C_ICED = code(ICED), C_DOT = code(DOT);

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, dot = V3.dot, cross = V3.cross;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);

  /* ---------- flat facets (convex polygon plates from 3D vertices) ---------- */
  const PAD = 0.5;
  function convexShape(pts, m) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const P = area < 0 ? pts.slice().reverse() : pts;
    const n = P.length, EQ = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
      const nx = -ey / l, ny = ex / l;
      EQ[i * 3] = nx; EQ[i * 3 + 1] = ny; EQ[i * 3 + 2] = PAD - (nx * a[0] + ny * a[1]);
    }
    return {
      bb: Shape2D.bbox(P, PAD + 0.3),
      test(u, v) {
        for (let i = 0; i < n * 3; i += 3) if (EQ[i] * u + EQ[i + 1] * v + EQ[i + 2] < 0) return 0;
        return m;
      },
    };
  }
  function facet(vs, part, m) {
    // drop repeated vertices (pointed ends)
    const q = [];
    for (const v of vs) if (!q.length || len3(sub(v, q[q.length - 1])) > 1e-3) q.push(v);
    if (q.length > 2 && len3(sub(q[0], q[q.length - 1])) < 1e-3) q.pop();
    if (q.length < 3) return null;
    const o = q[0], e1 = sub(q[1], o), e2 = sub(q[q.length - 1], o);
    const nz = nrm(cross(e1, e2)), u = nrm(e1), v = cross(nz, u);
    const pts = q.map((p) => { const d = sub(p, o); return [dot(d, u), dot(d, v)]; });
    return { kind: 'plate', part, grp: part, c: o, L: M3.cols(u, v, nz), shape: convexShape(pts, m), thick: 1.2 };
  }
  // a hexagonal ring: centre c, axes U (to the first flat side) and V, radii a (along U) and b (along V)
  function ring(c, U, V, a, b, n = 6, ph = Math.PI / 6) {
    const r = [];
    for (let k = 0; k < n; k++) { const t = ph + (k * 2 * Math.PI) / n; r.push(add(c, add(sc(U, a * Math.cos(t)), sc(V, b * Math.sin(t))))); }
    return r;
  }
  // convex crystal: consecutive rings joined by quads, the end rings capped
  function hull(out, rings, part, mats) {
    const n = rings[0].length;
    for (let j = 0; j + 1 < rings.length; j++)
      for (let k = 0; k < n; k++) {
        const f = facet([rings[j][k], rings[j][(k + 1) % n], rings[j + 1][(k + 1) % n], rings[j + 1][k]], part, mats[(k + j) % mats.length]);
        if (f) out.push(f);
      }
    for (const r of [rings[0], rings[rings.length - 1]]) { const f = facet(r, part, C_ICE); if (f) out.push(f); }
  }
  // a crystal along axis d from p (profile: [t, radius] pairs)
  function crystal(out, p, d, prof, part, mats, up = [0, 1, 0], squash = 1, ph) {
    d = nrm(d);
    let U = sub(up, sc(d, dot(up, d)));
    if (len3(U) < 1e-3) U = cross(d, [0, 0, 1]);
    U = nrm(U); const V = cross(d, U);
    hull(out, prof.map(([t, r]) => ring(add(p, sc(d, t)), U, V, r * squash, r, 6, ph)), part, mats);
  }
  function disc(c, n, r, part, m) {
    let U = cross(n, [0, 1, 0]);
    if (len3(U) < 1e-3) U = [1, 0, 0];
    U = nrm(U); const V = cross(n, U);
    const pts = []; for (let k = 0; k < 10; k++) { const t = (k * Math.PI) / 5; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
    return { kind: 'plate', part, grp: part, c, L: M3.cols(U, V, n), shape: convexShape(pts, m), thick: 1.2 };
  }

  const MI = [C_ICE, C_ICED];            // alternate side tones: reads as separate crystal faces
  const DEFAULT = { walk: 0, glow: 0, awake: 1, arms: 0, eyes: 'open', mouth: 0, side: 1 };
  // 1 body, 2 slab, 3/4 arms, 5/6 legs, 7/8 back crystals, 9 dots
  const PRI = { 1: 1, 2: 0, 3: 2, 4: 1, 5: 0, 6: 0, 7: 0, 8: 0, 9: 3 };

  // body profile (y, radius along x (front/back), radius along z)
  const BODY = [[92, 50, 56], [112, 62, 68], [246, 64, 70], [272, 52, 58], [304, 14, 16], [310, 4, 5]];
  const FRONT = 63.2; // distance of the flat front face from the axis (y 112..246)

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const am = clamp(+P.arms || 0, 0, 1), sam = am * am * (3 - 2 * am);
    const roll = walking ? 0.08 * Math.sin(wk) : 0;
    const bob = walking ? 3 * Math.abs(Math.sin(wk)) : 0;
    const BL = M3.mul(M3.ry(walking ? 0.05 * Math.sin(wk) : 0), M3.rx(roll));
    const Bp = (p) => add([0, bob, 0], M3.v(BL, p));
    const Bd = (d) => M3.v(BL, d);
    const X = Bd([1, 0, 0]), Y = Bd([0, 1, 0]), Z = Bd([0, 0, 1]);

    /* --- body: a tall hexagonal crystal with a flat face to the front --- */
    hull(prims, BODY.map(([y, a, b]) => ring(Bp([0, y, 0]), X, Z, a / Math.cos(Math.PI / 6), b / Math.cos(Math.PI / 6), 6, Math.PI / 6)), 1, [C_ICE, C_ICED, C_ICED, C_ICE, C_ICED, C_ICED]);
    anchors.body = Bp([0, 180, 0]);
    anchors.top = Bp([0, 310, 0]);

    /* --- braille: a plus of seven dots on the upper front face --- */
    const DY = 224, DS = 16, DR = 6.6;
    const dots = [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [0, -1]];
    for (const [u, v] of dots) {
      // the outer dots of the row wrap onto the angled side faces
      const au = Math.abs(u);
      let c, n;
      if (au < 2) { c = [FRONT + 0.8, DY + v * DS, u * DS]; n = [1, 0, 0]; }
      else {
        const th = Math.sign(u) * Math.PI / 3, e = [FRONT, DY, Math.sign(u) * 38.5];
        n = [Math.cos(th), 0, Math.sin(th)];
        const along = [-Math.sin(th), 0, Math.cos(th)];
        c = add(add(e, sc(along, 10)), sc(n, 0.8));
      }
      prims.push(disc(Bp(c), Bd(n), DR, 9, C_DOT));
    }
    anchors.head = Bp([FRONT, DY, 0]);
    anchors.mouth = anchors.head;
    anchors.eyeN = Bp([FRONT, DY, DS]); anchors.eyeF = Bp([FRONT, DY, -DS]);

    /* --- slab and spike legs --- */
    hull(prims, [[44, 70, 96], [58, 74, 102], [80, 70, 96]].map(([y, a, b]) => ring(Bp([0, y, 0]), X, Z, a, b, 6, 0)), 2, MI);
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 5 : 6;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const lift = walking ? 6 * Math.max(0, Math.sin(ph)) : 0;
      const base = Bp([4, 50 + lift, sd * 56]);
      crystal(prims, base, Bd([0.05, -1, sd * 0.1]), [[0, 22], [20, 20], [50 + lift * 0.3, 0]], id, MI, [1, 0, 0]);
      anchors[sd > 0 ? 'footN' : 'footF'] = add(base, Bd([2, -50, sd * 5]));
    }

    /* --- arms: big crystals from the shoulders, four stubby fingers --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 3 : 4;
      const ph = wk + (sd > 0 ? Math.PI : 0);
      const sw = walking ? 0.08 * Math.sin(ph) : 0;
      const sh = Bp([4, 238, sd * 88]);
      const ang = lerp(0.12 + sw, 1.6, sam);
      const out = lerp(0.55, 0.18, sam);
      const d = nrm(Bd([Math.sin(ang), -Math.cos(ang), sd * out]));
      crystal(prims, sh, d, [[-34, 0], [-6, 36], [118, 38], [138, 26]], id, [C_ICED, C_ICE], Bd([0, 0, sd]), 0.92);
      const wr = add(sh, sc(d, 136));
      let Uh = nrm(sub(Bd([0, 0, sd]), sc(d, dot(Bd([0, 0, sd]), d)))); const Vh = cross(d, Uh);
      // fingers: three along the bottom, a thumb to the front
      const fing = [[0.55, -0.55, 1], [0.95, 0.05, 1], [0.5, 0.65, 0.9], [-0.45, 1, 0.8]];
      for (const [a, b, l] of fing) {
        const o = add(wr, add(sc(Uh, a * 18), sc(Vh, b * 18 * sd)));
        const fd = nrm(add(sc(d, 1), add(sc(Uh, a * 0.5), sc(Vh, b * 0.45 * sd))));
        crystal(prims, o, fd, [[-6, 12], [22 * l, 12], [33 * l, 5]], id, MI, Uh);
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = add(wr, sc(d, 34));
      // back crystal behind the shoulder, pointing up and out
      crystal(prims, Bp([-34, 232, sd * 58]), Bd([-0.35, 0.75, sd * 0.62]), [[0, 20], [62, 20], [84, 0]], sd > 0 ? 7 : 8, MI, Bd([1, 0, 0]));
    }
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: ICE, shadowSteps: 12, shadowDepth: 40 };
  }

  function render(model, opt) {
    const P = model.pose;
    const aw = clamp(P.awake ?? 1, 0, 1);
    const dim = P.eyes === 'closed' ? 1 : P.eyes === 'blink' ? 0.7 : 0;
    const on = aw * (1 - dim);
    let pal = opt.pal || PAL;
    // dots: dormant dark → active yellow → glowing white-yellow
    const g = clamp(P.glow || 0, 0, 1) * on;
    const D = pal[DOT], K = pal[DOTD];
    const ramp = (i) => PX.mix(PX.mix(K.r[i], D.r[i], on), LIT[i], g);
    const dotPal = { r: [0, 1, 2, 3, 4].map((i) => ramp(Math.min(4, i + 1 + (g > 0.5 ? 1 : 0)))), od: PX.mix(K.od, D.od, on), ol: PX.mix(K.ol, PX.mix(D.ol, LIT[0], g), on), ln: PX.mix(K.ln, D.ln, on) };
    pal = Object.assign({}, pal, { [DOT]: dotPal });
    if (aw < 1) {
      const dull = (e) => ({ r: e.r.map((c) => PX.mix(c, e.r[0], (1 - aw) * 0.25)), od: e.od, ol: e.ol, ln: e.ln });
      pal = Object.assign({}, pal, { [ICE]: dull(pal[ICE]), [ICED]: dull(pal[ICED]), [EDGE]: dull(pal[EDGE]) });
    }
    return Creature.render(model, Object.assign({}, opt, { pal }));
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 1.8, bw: 480, bh: 380, oy: 0.9 } };
})();
