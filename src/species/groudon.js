/* ------------------------------------------------------------------
   Groudon — the Continent Pokémon (3.5 m ≈ 612 units tall at scale 1,
   shoulder plates included). Kyogre's land counterpart: a posable 3D
   model rendered straight to pixel art by the shared Creature pipeline
   (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art): a huge crimson-red bipedal dinosaur standing
   hunched forward on massive thighs, a long thick tail dragging behind.
   Small head with a heavy brow, yellow eyes, a broad jaw with a grey
   underside. Grey rock plates: big spiked shoulder slabs rising behind
   the head, a grey chest/belly, spikes at the end of the tail. Short
   thick arms with white claws, three white claws on each foot. Black
   "lava" lines run over the arms, thighs, flanks, belly and tail; with
   `glow` they burn yellow-orange (the Primal look).

   Pose params:
     walk    radians  walk-cycle phase (thighs swing with sin(walk), body bobs
                      and rolls, tail sways, arms counter-swing); 0 = standing
     roar    0..1     roar: head thrown up, torso rears back, arms spread,
                      jaw opens (at least 0.7·roar)
     glow    0..1     the black lines glow yellow-orange
     sleep   0..1     curled resting: legs folded, body lowered and pitched
                      forward, head resting low, tail curled round the near side
     mouth   0..1     jaw open
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     side    −1..1    ≈ 3·cos(yaw), passed by the game (unused)
   Anchors: top (shoulder-plate peak), head, mouth, eyeN, eyeF, body, belly,
            handN, handF, footN, footF, tail (tail root), tailTip.
------------------------------------------------------------------- */
const Groudon = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const RED = 1, GREY = 2, LINE = 3, CLAW = 4, EYE = 5, PUPIL = 6, MOUTH = 7, TONGUE = 8, TOOTH = 9, PLATE = 10;
  const MAT = { RED, GREY, LINE, CLAW, EYE, PUPIL, MOUTH, TONGUE, TOOTH, PLATE };
  const PAL = Creature.palette({
    [RED]:    { r: ['#6a1410', '#9e2618', '#ca3c22', '#ea643e', '#ffa07c'], od: '#3e0a08', ol: '#7a1a12', ln: '#5e120e' },
    [GREY]:   { r: ['#4e4442', '#6e6260', '#8e8280', '#b0a6a2', '#d4ccc6'], od: '#2e2a30', ol: '#5a565c', ln: '#4a464c' },
    [PLATE]:  { r: ['#5e120e', '#8e2216', '#bc361e', '#e05838', '#fa9070'], od: '#300806', ol: '#6a160e', ln: '#200806' },
    [LINE]:   { r: ['#170e12', '#1e1418', '#261a1e', '#302226', '#3c2a30'], od: '#10080c', ol: '#1e1418', ln: '#10080c' },
    [CLAW]:   { r: ['#8e8a88', '#bcb8b4', '#e2e0da', '#f6f4f0', '#ffffff'], od: '#3e3a3a', ol: '#6a6664', ln: '#6a6664' },
    [EYE]:    { r: ['#c8920e', '#e8b41c', '#ffd23a', '#ffe684', '#fff6c8'], od: '#6a3a06', ol: '#8a5a10', ln: '#6a3a06' },
    [PUPIL]:  { r: ['#0c0608', '#120a0c', '#180e10', '#201216', '#28181c'], od: '#0c0608', ol: '#0c0608', ln: '#0c0608' },
    [MOUTH]:  { r: ['#3a0a16', '#561222', '#741e30', '#922e40', '#b04454'], od: '#24050e', ol: '#3a0a16', ln: '#3a0a16' },
    [TONGUE]: { r: ['#8a2a40', '#b03c54', '#d0566a', '#e87886', '#f8a6ae'], od: '#4a0a1e', ol: '#6a1a30', ln: '#6a1a30' },
    [TOOTH]:  { r: ['#a8a4a0', '#d2d0cc', '#f0eeea', '#ffffff', '#ffffff'], od: '#5a5656', ol: '#7a7676', ln: '#7a7676' },
  });
  const GLOSSY = { [CLAW]: 1, [EYE]: 1 };
  const GLOW = ['#e86a14', '#ff9420', '#ffc038', '#ffe272', '#fff8c4'].map(PX.hex);

  const C = (m, b = 0) => code(m, b);
  const C_RED = C(RED), C_GREY = C(GREY), C_LINE = C(LINE), C_CLAW = C(CLAW), C_EYE = C(EYE), C_PUPIL = C(PUPIL);
  const C_MOUTH = C(MOUTH), C_TONGUE = C(TONGUE), C_TOOTH = C(TOOTH), C_PLATE = C(PLATE), C_PLATE_D = C(PLATE, -1), C_PLATE_L = C(PLATE, 1);

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, dot = V3.dot, cross = V3.cross;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const dirF = (f, d) => nrm(M3.v(f.L, d));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // ellipsoid from p0 to p1 (local x along the segment), cross radii ry (toward `up`) and rz
  function seg(p0, p1, ry, rz, part, grp, mat, up = [0, 1, 0], over = 0.6) {
    const d = sub(p1, p0), l = len3(d) || 1e-3;
    const X = sc(d, 1 / l);
    let Y = sub(up, sc(X, dot(up, X)));
    if (len3(Y) < 1e-3) Y = cross([0, 0, 1], X);
    Y = nrm(Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, cross(X, Y)), M3.diag(l / 2 + Math.min(ry, rz) * over, ry, rz)), part, grp, mat);
  }
  const cr = (a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1, 2].map((k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3));
  };

  let curScale = 1;

  /* ---------- white spikes: faceted cones (flat plates) ---------- */
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
    return { bb: Shape2D.bbox(P, PAD + 0.3), test(u, v) { for (let i = 0; i < n * 3; i += 3) if (EQ[i] * u + EQ[i + 1] * v + EQ[i + 2] < 0) return 0; return m; } };
  }
  function tri(a, b, c, part, m) {
    const e1 = sub(b, a), e2 = sub(c, a), nz = nrm(cross(e1, e2)), u = nrm(e1), v = cross(nz, u);
    const pts = [a, b, c].map((p) => { const d = sub(p, a); return [dot(d, u), dot(d, v)]; });
    return { kind: 'plate', part, grp: part, c: a, L: M3.cols(u, v, nz), shape: convexShape(pts, m), thick: 1.4 };
  }
  // cone from base centre b along direction d (length l, base radius r), 7 facets + a round base cap
  function cone(out, b, d, l, r, part, curve = 0) {
    d = nrm(d);
    let U = cross(d, [0, 1, 0]); if (len3(U) < 1e-3) U = [1, 0, 0]; U = nrm(U); const V = cross(d, U);
    const tip = add(b, sc(d, l)), n = 7, ring = [];
    for (let k = 0; k < n; k++) { const a = (k * 2 * Math.PI) / n; ring.push(add(b, add(sc(U, r * Math.cos(a)), sc(V, r * Math.sin(a))))); }
    // a slightly curved spike: bend the tip half way
    const mid = add(b, sc(d, l * 0.5));
    for (let k = 0; k < n; k++) {
      const a = ring[k], c = ring[(k + 1) % n];
      if (curve) {
        const am = add(add(sc(a, 0.5), sc(mid, 0.5)), [0, 0, 0]), cm = add(sc(c, 0.5), sc(mid, 0.5));
        out.push(tri(a, c, cm, part, C_CLAW)); out.push(tri(a, cm, am, part, C_CLAW)); out.push(tri(am, cm, add(tip, sc(V, curve)), part, C_CLAW));
      } else out.push(tri(a, c, tip, part, C_CLAW));
    }
    out.push(E(b, M3.mul(M3.cols(U, V, d), M3.diag(r, r, r * 0.3)), part, part, M_CLAW_F));
    return tip;
  }
  // half line width in unit-sphere units for an ellipsoid of radius r (at least ~1 px)
  const lw = (r, base) => Math.max(base, 0.62 / (curScale * r));

  /* ---------- smooth tube shading for the tail beads (ideal radial normal, see milotic.js) ---------- */
  let LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74];
  const tone = (d) => (d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] ? 2 : 3);
  function tube(prim, s, m) {
    const Lv = prim.Lv, Li = prim.Li;
    let ix = Lv[1] * s[1] + Lv[2] * s[2], iy = Lv[4] * s[1] + Lv[5] * s[2], iz = Lv[7] * s[1] + Lv[8] * s[2];
    let l = Math.hypot(ix, iy, iz) || 1;
    const dI = (ix * LD[0] + iy * LD[1] + iz * LD[2]) / l;
    const ax = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], ay = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], az = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
    l = Math.hypot(ax, ay, az) || 1;
    const dA = (ax * LD[0] + ay * LD[1] + az * LD[2]) / l;
    return code(m, clamp(tone(dI) - tone(dA), -2, 3));
  }

  /* ---------- torso decals (torso local unit sphere: x forward, y up, z side) ---------- */
  const TOR = [150, 182, 150];
  function torsoMat(s) {
    const x = s[0], y = s[1], z = s[2], az = Math.abs(z);
    const w = lw(TOR[1], 0.022);
    // grey chest / belly: the front, narrowing toward the sides and the throat
    const bel = x - (0.34 + 0.55 * z * z + 0.25 * Math.max(0, y - 0.35));
    if (bel > 0) {
      if (bel < w * 1.3) return C_LINE; // black rim of the belly
      // two black cracks across the belly
      if (Math.abs(y + 0.1 - 0.12 * az) < w || Math.abs(y + 0.48 - 0.1 * az) < w) return C_LINE;
      return C_GREY;
    }
    // flank line: from under the shoulder plate sweeping down and forward to the hip
    if (az > 0.3) {
      const yc = 0.35 - 1.25 * (x + 0.35);
      if (Math.abs(y - yc) < w && y > -0.7 && y < 0.55) return C_LINE;
      const yc2 = -0.05 - 1.1 * (x + 0.75);
      if (Math.abs(y - yc2) < w && y > -0.6 && y < 0.3 && x < -0.2) return C_LINE;
    }
    return C_RED;
  }

  /* ---------- head decals ---------- */
  const HR = [86, 56, 60];
  const EC = nrm([0.72, 0.36, 0.6]); // eye centre direction on the head sphere (near side)
  const ETY = nrm(sub([0, 1, 0], sc(EC, EC[1])));
  const ETX = cross(ETY, EC); // toward the snout
  function headMat(kind) {
    return (s) => {
      const m = s[2] < 0 ? [s[0], s[1], -s[2]] : s;
      const w = lw(HR[1], 0.03);
      if (m[0] * EC[0] + m[1] * EC[1] + m[2] * EC[2] > 0.6) {
        const d = sub(m, EC);
        const ex = dot(d, ETX), ey = dot(d, ETY);
        // heavy black brow over the eye, slanting down toward the snout (the stern look)
        const by = 0.14 - 0.22 * ex;
        if (ex > -0.24 && ex < 0.2 && ey > by - w * 0.4 && ey < by + w * 2.2) return C_LINE;
        const e2 = (ex / 0.2) ** 2 + ((ey + 0.01) / 0.125) ** 2;
        if (kind === 'closed' || kind === 'happy') {
          const k = 1 - (ex / 0.16) ** 2;
          const yc = kind === 'happy' ? -0.05 + 0.08 * k : 0.01 - 0.05 * k;
          if (Math.abs(ex) < 0.16 && Math.abs(ey - yc) < w) return C_LINE;
        } else if (e2 < 1) {
          if (kind === 'blink' && ey > -0.03) return ey < -0.03 + w * 1.4 ? C_LINE : C_RED;
          if (e2 > 0.66) return C_LINE; // dark rim
          const px = (ex - 0.035) / 0.065, py = (ey + 0.005) / 0.09;
          return px * px + py * py < 1 ? C_PUPIL : C_EYE;
        }
      }
      // grey underside of the head (throat)
      if (s[1] < -0.62 && s[0] < 0.4) return C_GREY;
      return C_RED;
    };
  }
  // upper snout: red with a mouth line along its lower edge
  const SNR = [62, 36, 44];
  function snoutMat(mo) {
    return (s) => {
      if (s[1] < -0.55 && s[0] > -0.6) {
        if (mo > 0.05 && s[0] > -0.2 && Math.abs(s[2]) < 0.75 && s[1] < -0.7) {
          // upper teeth
          const k = Math.abs(s[2]) * 6;
          if (s[1] > -0.92 && (k % 1) < 0.5) return C_TOOTH;
        }
        return s[1] < -0.72 ? C_LINE : C_RED;
      }
      // two small nostrils
      if (s[0] > 0.9 && s[1] > 0.1 && s[1] < 0.3 && Math.abs(Math.abs(s[2]) - 0.25) < 0.1) return C_LINE;
      return C_RED;
    };
  }
  const JAWR = [70, 26, 46];
  const jawMat = (s) => (s[1] > 0.55 && s[0] > -0.1 && Math.abs(s[2]) < 0.8 ? C_TONGUE : s[1] > 0.25 && Math.abs(s[2]) > 0.55 ? C_RED : C_GREY);

  /* ---------- limb decals ---------- */
  // thighs: a black line ring that dips down on the outside (the "knee" chevron)
  const THR = [92, 112, 82];
  function thighMat(s) {
    const w = lw(THR[1], 0.03);
    const yc = -0.1 + 0.38 * Math.abs(s[0]) - 0.18 * Math.max(0, s[2]);
    if (Math.abs(s[1] - yc) < w && Math.abs(s[2]) > 0.2) return C_LINE;
    if (s[0] > 0.55 && s[1] < -0.2) return C_RED;
    return C_RED;
  }
  const armMat = (r) => (s) => {
    const w = lw(r, 0.05);
    return Math.abs(s[0] - 0.42) < w && s[1] > -0.9 ? C_LINE : C_RED;
  };
  const M_RED = () => C_RED, M_CLAW = () => C_CLAW, M_GREY = () => C_GREY;
  function M_CLAW_F() { return C_CLAW; }

  /* ---------- rock plates (flat, chunky; u = along, v = up) ---------- */
  // big shoulder slab: three blunt spikes pointing up and back
  const SHOULDER = bakeShape(Shape2D.poly([[70, 0], [96, 40], [88, 84], [64, 118], [44, 98], [22, 150], [-2, 110], [-30, 142], [-44, 92], [-72, 104], [-70, 52], [-50, 10], [-10, -12], [40, -12]], C_PLATE, 6, (u, v) => (v > 20 + 0.25 * u && (u + v * 0.35) % 42 < 5 ? C_PLATE_D : C_PLATE)));
  const SMALLPL = bakeShape(Shape2D.poly([[34, 0], [40, 30], [16, 62], [0, 40], [-22, 58], [-34, 20], [-20, -6], [10, -8]], C_PLATE, 6));
  const TAILSP = bakeShape(Shape2D.poly([[26, 0], [18, 30], [-2, 58], [-16, 50], [-10, 24], [-24, 0], [0, -6]], C_PLATE, 6, (u, v) => (v > 44 - 0.4 * u ? C_LINE : C_PLATE)));

  const DEFAULT = { walk: 0, roar: 0, glow: 0, sleep: 0, mouth: 0, eyes: 'open', side: 1 };
  // 1 torso, 2 head, 3 jaw, 4 mouth, 5/6 arms, 7/8 legs, 9 tail, 10.. plates
  const SIZE = 0.945;
  const PRI = { 1: 0, 2: 2, 3: 2, 4: 1, 5: 3, 6: 1, 7: 2, 8: 1, 9: 0, 10: 3, 11: 1, 12: 2, 13: 3 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const wk = +P.walk || 0, walking = wk !== 0;
    const sl = clamp(+P.sleep || 0, 0, 1), ro = clamp(+P.roar || 0, 0, 1) * (1 - sl);
    const mo = clamp(Math.max(+P.mouth || 0, 0.75 * ro), 0, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const ssl = sl * sl * (3 - 2 * sl);

    // ---- body frame at the hip centre
    const bob = walking ? 6 * Math.abs(Math.cos(wk)) : 0;
    const roll = walking ? 0.045 * Math.sin(wk) : 0;
    const hipY = lerp(212, 92, ssl) - bob;
    const lean = lerp(-0.78, -0.95, ssl) + 0.45 * ro;
    const B = chain(T(lerp(0, 40, ssl), hipY, 0), R(M3.rx(roll)), R(M3.rz(lean)));

    /* --- torso --- */
    const tf = chain(B, T(18, 150, 0));
    prims.push(ellF(tf, TOR, 1, 1, torsoMat));
    // hip mass (keeps the lower body heavy)
    prims.push(ellF(chain(B, T(-18, 30, 0)), [122, 100, 128], 1, 1, (s) => (s[0] > 0.55 && s[1] > -0.3 ? C_GREY : C_RED)));
    anchors.body = inF(B, [18, 150, 0]);
    anchors.belly = inF(tf, [TOR[0] * 0.95, -20, 0]);

    /* --- head: on a short neck at the top front of the torso --- */
    const neck = inF(B, [100, 292, 0]);
    const hp = lerp(0.1, -0.1, ssl) - lean * 0.55 + 0.55 * ro + (walking ? 0.03 * Math.sin(wk * 2) : 0);
    const H = chain(T(...neck), R(M3.rz(lean + hp)), T(64, 26, 0));
    const headPrim = ellF(H, HR, 2, 2, headMat(kind));
    prims.push(headPrim);
    prims.push(seg(inF(B, [60, 250, 0]), inF(H, [-30, -8, 0]), 62, 70, 2, 2, M_RED));
    const snF = chain(H, T(52, -6, 0));
    prims.push(ellF(snF, SNR, 2, 2, snoutMat(mo)));
    // lower jaw hinged under the eye
    const jawF = chain(H, T(10, -26, 0), R(M3.rz(-0.55 * mo)), T(44, -10, 0));
    prims.push(ellF(jawF, JAWR, 3, 3, jawMat));
    if (mo > 0.04) prims.push(ellF(chain(H, T(48, -30, 0)), [58, 22 + 18 * mo, 38], 4, 4, (s) => (s[1] < -0.2 && Math.abs(s[2]) < 0.6 ? C_TONGUE : C_MOUTH)));
    // grey horn-plates at the back of the head
    for (const [x, y, l, r] of [[34, 44, 58, 11], [8, 50, 74, 12], [-22, 50, 84, 12], [-50, 42, 80, 11]])
      for (const sd of [1, -1]) prims.push(seg(inF(H, [x, y - 10, sd * 26]), inF(H, [x - l * 0.55, y + l * 0.62, sd * 32]), r, 9, 2, 2, (q) => (q[1] < -0.2 ? C_LINE : C_RED), [1, 0, 0], 0.3));
    anchors.head = H.t;
    anchors.mouth = inF(H, [96, -34, 0]);
    const eyeP = (sd) => inF(H, [HR[0] * EC[0], HR[1] * EC[1], sd * HR[2] * EC[2]]);
    anchors.eyeN = eyeP(1); anchors.eyeF = eyeP(-1);

    /* --- shoulder armour: red domes cut by black lines, a row of white spikes along each side of the back --- */
    let top = [0, -1e9, 0];
    const armMatS = (s) => {
      const w = lw(80, 0.03);
      // plate seams: a ring round the dome and two cross seams
      if (Math.abs(s[1] - 0.15 + 0.2 * s[0]) < w || Math.abs(s[0] - 0.35) < w * 1.2 || Math.abs(s[0] + 0.3) < w * 1.2) return C_LINE;
      return C_RED;
    };
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 10 : 11;
      const dF = chain(B, T(10, 262, sd * 92), R(M3.rx(-sd * 0.35)), R(M3.rz(0.1)));
      prims.push(ellF(dF, [128, 64, 70], id, id, armMatS));
      // back spikes: four cones pointing up, out and back
      for (const [x, h, l] of [[74, 292, 92], [20, 316, 120], [-36, 316, 124], [-92, 292, 100]]) {
        const bp = inF(B, [x, h - 6, sd * 108]);
        const tip = cone(prims, bp, dirF(B, [-0.45, 0.8, sd * 0.5]), l, 21, id);
        if (tip[1] > top[1]) top = tip;
      }
    }
    anchors.top = top;

    /* --- arms: short and thick, held forward; white claws --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 5 : 6;
      const ph = wk + (sd > 0 ? Math.PI : 0);
      const sw = walking ? 0.22 * Math.sin(ph) : 0;
      const sh = inF(B, [76, 205, sd * 132]);
      const pitchA = 0.75 + sw - 0.65 * ro + 0.5 * ssl;
      const out = 0.35 + 0.55 * ro;
      const d1 = nrm([Math.sin(pitchA) * 0.8, -Math.cos(pitchA), sd * out]);
      const el = add(sh, sc(d1, 72));
      const d2 = nrm(add(d1, [0.7, 0.35 + 0.4 * ro, 0]));
      const wr = add(el, sc(d2, 62));
      prims.push(seg(sh, el, 46, 44, id, id, M_RED));
      prims.push(seg(el, wr, 38, 36, id, id, armMat(38)));
      cone(prims, add(el, [-8, 0, sd * 26]), [-0.55, -0.2, sd * 0.8], 66, 17, id);
      prims.push(E(wr, M3.diag(34, 32, 34), id, id, M_RED));
      for (const k of [-1, 0, 1]) {
        const cd = nrm(add(d2, [0.2, -0.25, sd * 0.3 * k + sd * 0.05]));
        const c0 = add(wr, add(sc(cd, 22), [0, 0, sd * 0 + k * 16]));
        prims.push(seg(c0, add(c0, sc(nrm(add(cd, [0, -0.45, 0])), 30)), 8, 8, id, id, M_CLAW, [0, 1, 0], 0.5));
      }
      anchors[sd > 0 ? 'handN' : 'handF'] = add(wr, sc(d2, 40));
    }

    /* --- legs: massive thighs, short shins, feet with three white claws --- */
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 7 : 8;
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const fwd = walking ? 42 * Math.sin(ph) : 0;
      const lift = walking ? 22 * Math.max(0, Math.cos(ph)) : 0;
      const hip = add(inF(B, [-4, 10, 0]), [0, 0, sd * 104]);
      const ft = lerp3([28 + fwd, lift, sd * 120], [110, 0, sd * 150], ssl);
      const kneeP = lerp3(add(sc(add(hip, ft), 0.5), [26, 0, sd * 12]), add(hip, [96, -30, sd * 40]), ssl);
      const thF = { L: M3.mul(M3.cols(nrm(sub(kneeP, hip)), [0, 0, 0], [0, 0, 0]), M3.I()), t: hip };
      void thF;
      prims.push(seg(add(hip, [0, 28, 0]), kneeP, THR[1] * 0.78, THR[2], id, id, thighMat, [1, 0, 0], 0.5));
      prims.push(seg(kneeP, add(ft, [0, 30, 0]), 50, 50, id, id, M_RED));
      cone(prims, add(kneeP, [20, 20, sd * 50]), [0.55, 0.3, sd * 0.8], 72, 18, id);
      const foot = chain(T(ft[0] + 22, ft[1] + 22, ft[2]), R(M3.ry(-sd * 0.12)));
      prims.push(ellF(foot, [66, 26, 52], id, id, M_RED));
      for (const k of [-1, 0, 1]) {
        const c0 = inF(foot, [50, -2, k * 30]);
        prims.push(seg(c0, inF(foot, [84, -16, k * 36]), 11, 11, id, id, M_CLAW, [0, 1, 0], 0.5));
      }
      anchors[sd > 0 ? 'footN' : 'footF'] = inF(foot, [0, -24, 0]);
    }

    /* --- tail: a thick tapering tube on a spline, dragging on the ground; grey spikes near the tip --- */
    const ctrl0 = [[-96, 150, 0, 106], [-210, 120, 0, 94], [-330, 104, 0, 76], [-440, 118, 0, 58], [-520, 150, 0, 42], [-570, 180, 0, 26]];
    const ctrl = ctrl0.map((q, i) => {
      let p = [q[0], q[1], q[2]];
      const t = i / (ctrl0.length - 1);
      // curl round the near side when sleeping
      const a = ssl * t * 1.5 + (walking ? 0.1 * t * Math.sin(wk - 1 - t) : 0);
      const cx = -96, dx = p[0] - cx;
      p = [cx + dx * Math.cos(a), p[1], -dx * Math.sin(a)];
      if (ssl > 0) p[1] = lerp(p[1], q[3] * 0.85, ssl * Math.min(1, t * 2));
      p[1] += (1 - ssl) * (hipY - 212) * (1 - t);
      return { p: [p[0] + lerp(0, 40, ssl), p[1], p[2]], r: q[3] };
    });
    // attach the root to the body
    ctrl[0].p = inF(B, [-100, -20 + 12, 0]);
    const dense = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const a = ctrl[Math.max(0, i - 1)], b = ctrl[i], c = ctrl[i + 1], d = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let k = 0; k < 10; k++) { const t = k / 10; dense.push({ p: cr(a.p, b.p, c.p, d.p, t), r: lerp(b.r, c.r, t) }); }
    }
    dense.push({ p: ctrl[ctrl.length - 1].p, r: ctrl[ctrl.length - 1].r });
    let arc = 0;
    for (let i = 0; i < dense.length; i++) {
      if (i > 0) arc += len3(sub(dense[i].p, dense[i - 1].p));
      dense[i].s = arc;
    }
    const Ltail = arc;
    const nBead = 12;
    let tailTip = dense[dense.length - 1].p;
    for (let j = 0; j < nBead; j++) {
      const s0 = (j / nBead) * Ltail, s1 = ((j + 1) / nBead) * Ltail;
      const at = (s) => { let i = 1; while (i < dense.length - 1 && dense[i].s < s) i++; const a = dense[i - 1], b = dense[i]; const t = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0; return { p: lerp3(a.p, b.p, t), r: lerp(a.r, b.r, t) }; };
      const A = at(s0), Bq = at(s1);
      const r = (A.r + Bq.r) / 2;
      const X = nrm(sub(Bq.p, A.p));
      let Y = sub([0, 1, 0], sc(X, dot([0, 1, 0], X)));
      Y = nrm(Y);
      const Z = cross(X, Y);
      const hl = len3(sub(Bq.p, A.p)) / 2 + r * 0.45;
      const smid = (s0 + s1) / 2;
      const info = {};
      const prim = E(sc(add(A.p, Bq.p), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(hl, r, r)), 9, 9, null);
      prim.mat = (s) => {
        // black chevron lines on the tail's sides, grey underside toward the tip
        const al = smid + s[0] * hl;
        const w = Math.max(0.05, 0.6 / (curScale * r));
        const side = Math.abs(s[2]);
        let m = RED;
        const per = 120, f = ((al + 40 * (1 - Math.abs(s[1]))) % per) / per;
        if (side > 0.35 && al > 40 && al < Ltail - 60 && (f < w * r / per * 2.2)) m = LINE;
        else if (s[1] < -0.55) m = GREY;
        return tube(prim, s, m);
      };
      void info;
      prims.push(prim);
      if (j === nBead - 1) tailTip = add(Bq.p, sc(X, r));
    }
    // red fins stacked on top toward the tip, white spikes jutting from the sides
    for (const [fr, h] of [[0.6, 1.2], [0.7, 1.15], [0.8, 1.05], [0.9, 0.9]]) {
      const i = Math.floor(fr * (dense.length - 1));
      const a = dense[i], b = dense[Math.min(dense.length - 1, i + 1)];
      const X = nrm(sub(b.p, a.p));
      let Y = nrm(sub([0, 1, 0], sc(X, X[1])));
      const Z = cross(X, Y);
      const base = add(a.p, sc(Y, a.r * 0.7));
      prims.push(PL(base, M3.cols(sc(X, -h * 1.4), sc(Y, h * 1.4), Z), 12, 12, TAILSP, 14));
    }
    for (const fr of [0.3, 0.48, 0.66]) {
      const i = Math.floor(fr * (dense.length - 1));
      const a = dense[i], b = dense[Math.min(dense.length - 1, i + 1)];
      const X = nrm(sub(b.p, a.p));
      for (const sd of [1, -1]) {
        const Z = nrm(cross(X, [0, 1, 0])), o = sc(Z, -sd);
        cone(prims, add(a.p, sc(o, a.r * 0.8)), add(add(o, sc(X, 0.55)), [0, -0.15, 0]), 34 + a.r * 0.45, 13, 13);
      }
    }
    anchors.tail = ctrl[0].p;
    anchors.tailTip = tailTip;

    // keep everything above the ground (the folded sleeping pose), then scale to the Pokédex height
    let minY = Infinity;
    for (const q of prims) if (q.kind === 'ell') minY = Math.min(minY, q.c[1] - Math.hypot(q.L[3], q.L[4], q.L[5]) * 0.8);
    const lift = Math.max(0, -minY);
    for (const q of prims) { q.c = sc(add(q.c, [0, lift, 0]), SIZE); q.L = q.L.map((v) => v * SIZE); }
    for (const k in anchors) anchors[k] = sc(add(anchors[k], [0, lift, 0]), SIZE);
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: RED, shadowSteps: 0 };
  }

  /* ---------- render: glow palette, then ray-cast only the silhouette box (nearest prims first) ---------- */
  function render(model, opt) {
    curScale = opt.scale || 1;
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74];
    let pal = opt.pal || PAL;
    const g = clamp(model.pose.glow || 0, 0, 1);
    if (g > 0) {
      const e = pal[LINE];
      pal = Object.assign({}, pal, { [LINE]: { r: e.r.map((c, i) => PX.mix(c, GLOW[Math.min(4, i + 1)], g)), od: PX.mix(e.od, GLOW[0], g * 0.7), ol: PX.mix(e.ol, GLOW[1], g * 0.8), ln: PX.mix(e.ln, GLOW[0], g * 0.6) } });
    }
    const o2 = Object.assign({}, opt, { pal });
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = o2;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    const zs = new Map();
    for (const p of model.prims) zs.set(p, V[6] * p.c[0] + V[7] * p.c[1] + V[8] * p.c[2]);
    model.prims.sort((a, b) => zs.get(b) - zs.get(a));
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
    if (bx1 - bx0 < 4 || by1 - by0 < 4) return Creature.render(model, o2);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, o2, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
    const buf = new PX.Buf(W, H), depth = new Float32Array(W * H).fill(-1e9), part = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
      const s = y * w, d = (y + by0) * W + bx0;
      buf.d.set(r.buf.d.subarray(s, s + w), d);
      depth.set(r.depth.subarray(s, s + w), d);
      part.set(r.part.subarray(s, s + w), d);
    }
    const anchors = {};
    for (const k in r.anchors) { const a = r.anchors[k]; anchors[k] = [a[0] + bx0, a[1] + by0, a[2]]; }
    return { buf, depth, part, W, H, ox, oy, anchors };
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 3.5, bw: 1420, bh: 740, oy: 0.9 } };
})();
