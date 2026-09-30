/* ------------------------------------------------------------------
   Rayquaza — the Sky High Pokémon (7.0 m long ≈ 1225 units at scale 1).
   A posable 3D model rendered straight to pixel art by the shared
   Creature pipeline (src/creature.js, dev/CREATURE_GUIDE.md).
   Model space: x = forward (the head end), y = up, z = near side at
   yaw 0. It flies horizontally: y = 0 is a reference line ~150 units
   below the spine (nothing touches the ground).

   Design (official art): a very long green serpentine dragon. Yellow ring
   markings run along both sides of its body; three pairs of wing-like
   fins with red tips stick up and back along the body, a pair of small
   clawed arms hangs under the front. Long head with a red-lined mouth,
   yellow eyes, two long flat horns swept back from the crown and a
   shorter pair from the back of the jaw, each with a yellow stripe.
   The tail tapers to a pointed, red-tipped fin.

   Built from a spine (like milotic.js): a travelling wave → Catmull-Rom →
   ellipsoid beads with smooth tube shading; rings are decals in (arc
   length, around) coordinates so they ride along with the wave.

   Pose params:
     wave    radians  serpentine undulation phase: a vertical wave travels
                      from the head to the tail (growing toward the tail),
                      with a smaller sideways sway; fins and tail flex with it
     length  0..1     body length (1 = full 7 m; 0 = ~55%, e.g. partly hidden)
     roar    0..1     head thrown up, jaw open (at least 0.8·roar), arms
                      spread, fins raised
     glow    0..1     the yellow ring markings glow (bright yellow-white)
     mouth   0..1     jaw open
     eyes    'open' (default) | 'happy' | 'blink' | 'closed'
     side    −1..1    ≈ 3·cos(yaw), passed by the game (unused)
   Anchors: top (horn tips), head, mouth, eyeN, eyeF, body (mid spine),
            neck, handN, handF, tail (tail-fin tip), tailBase.
------------------------------------------------------------------- */
const Rayquaza = (() => {
  const { code } = Creature;

  // ---- materials
  const GREEN = 1, RING = 2, RED = 3, EYE = 4, PUPIL = 5, MOUTH = 6, TONGUE = 7, CLAW = 8, DARK = 9, FIN = 10;
  const MAT = { GREEN, RING, RED, EYE, PUPIL, MOUTH, TONGUE, CLAW, DARK, FIN };
  const PAL = Creature.palette({
    [GREEN]:  { r: ['#1a4a34', '#2a6c4a', '#3d8a5f', '#62a67e', '#94c8aa'], od: '#0a261a', ol: '#1c4c38', ln: '#123e2a' },
    [FIN]:    { r: ['#1c3a2e', '#2a5040', '#3a6452', '#52806a', '#80a896'], od: '#0a1e16', ol: '#1c3a2e', ln: '#10281e' },
    [RING]:   { r: ['#b88410', '#dcaa1a', '#f8d030', '#ffe67c', '#fff6c4'], od: '#5e3c06', ol: '#8a6010', ln: '#6e4a08' },
    [RED]:    { r: ['#7a1a26', '#a42a36', '#c84a50', '#e67272', '#ffa8a0'], od: '#44060e', ol: '#7a121e', ln: '#621019' },
    [EYE]:    { r: ['#c89a10', '#e8bc20', '#ffd83a', '#ffe98a', '#fff6c8'], od: '#6a3a06', ol: '#8a5a10', ln: '#6a3a06' },
    [PUPIL]:  { r: ['#060a08', '#0a100c', '#0e1610', '#141c16', '#1c261e'], od: '#060a08', ol: '#060a08', ln: '#060a08' },
    [MOUTH]:  { r: ['#3a0a16', '#561222', '#741e30', '#922e40', '#b04454'], od: '#24050e', ol: '#3a0a16', ln: '#3a0a16' },
    [TONGUE]: { r: ['#8a2a40', '#b03c54', '#d0566a', '#e87886', '#f8a6ae'], od: '#4a0a1e', ol: '#6a1a30', ln: '#6a1a30' },
    [CLAW]:   { r: ['#8e9a8a', '#b8c4b2', '#dde6d6', '#f2f8ee', '#ffffff'], od: '#34402e', ol: '#5e6a58', ln: '#5e6a58' },
    [DARK]:   { r: ['#082414', '#0c301a', '#103c20', '#164826', '#1c542e'], od: '#06180e', ol: '#0a2414', ln: '#06180e' },
  });
  const GLOSSY = { [EYE]: 1 };
  const GLOW = ['#ffd84a', '#ffe878', '#fff4a8', '#fffad8', '#ffffff'].map(PX.hex);

  const C_GREEN = code(GREEN), C_RING = code(RING), C_RED = code(RED), C_EYE = code(EYE), C_PUPIL = code(PUPIL);
  const C_MOUTH = code(MOUTH), C_TONGUE = code(TONGUE), C_CLAW = code(CLAW), C_DARK = code(DARK), C_FIN = code(FIN);
  const M_GREEN = () => C_GREEN, M_CLAW = () => C_CLAW;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const add = V3.add, sub = V3.sub, sc = V3.scale, nrm = V3.norm, dot = V3.dot, cross = V3.cross;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const PL = (c, L, part, grp, shape, thick) => ({ kind: 'plate', part, grp, c, L, shape, thick });
  const inB = (b, p) => add(b.o, add(add(sc(b.X, p[0]), sc(b.Y, p[1])), sc(b.Z, p[2])));
  const ellB = (b, p, r, part, grp, mat) => E(inB(b, p), M3.cols(sc(b.X, r[0]), sc(b.Y, r[1]), sc(b.Z, r[2])), part, grp, mat);
  function seg(p0, p1, r, part, grp, mat, up = [0, 1, 0]) {
    const d = sub(p1, p0), l = len3(d) || 1e-3;
    const X = sc(d, 1 / l);
    let Y = sub(up, sc(X, dot(up, X)));
    if (len3(Y) < 1e-3) Y = cross([0, 0, 1], X);
    Y = nrm(Y);
    return E(sc(add(p0, p1), 0.5), M3.mul(M3.cols(X, Y, cross(X, Y)), M3.diag(l / 2 + r * 0.5, r, r)), part, grp, mat);
  }
  const cr = (a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1, 2].map((k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3));
  };
  // rotate v about unit axis a by t
  const rot = (v, a, t) => { const c = Math.cos(t), s = Math.sin(t); return add(add(sc(v, c), sc(cross(a, v), s)), sc(a, dot(a, v) * (1 - c))); };

  let curScale = 1;
  let LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74];
  const tone = (d) => (d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] + 0.13 ? 2 : 3); // soft renderer thresholds
  // smooth tube shading: shade a bead with the ideal radial normal (see milotic.js)
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

  /* ---------- body layout (arc length from the neck, full length) ---------- */
  const LBODY = 1040; // spine length at length = 1 (head adds ~185 in front)
  // radius profile along u = s / L
  const RAD = [[0, 40], [0.06, 48], [0.2, 54], [0.45, 50], [0.7, 38], [0.88, 22], [1, 9]];
  const radAt = (u) => { for (let i = 1; i < RAD.length; i++) if (u <= RAD[i][0]) { const a = RAD[i - 1], b = RAD[i]; return lerp(a[1], b[1], (u - a[0]) / (b[0] - a[0])); } return RAD[RAD.length - 1][1]; };
  const RING_PER = 118, RING_FROM = 70; // yellow ring spacing along the body (units of arc length)

  /* ---------- plates ---------- */
  // wing fin (u = back along the body, v = outward/up from the root): red tip
  const WING = bakeShape(Shape2D.poly([[-34, 0], [34, 0], [58, 30], [74, 88], [70, 94], [4, 92], [-4, 86], [-26, 30]], C_FIN, 2, (u, v) => (v > 80 || u > 56 + (v - 30) * 0.25 || (v > 30 && u < -24 + (v - 30) * 0.3) ? C_RED : C_FIN)));
  // head horns: long flat blades with a yellow stripe
  const HORN = bakeShape(Shape2D.poly([[-6, -12], [40, -15], [100, -11], [150, -5], [182, 0], [150, 6], [100, 13], [40, 16], [-6, 13]], C_FIN, 8, (u, v) => (u > 12 && u < 160 && Math.abs(v - 1.5) < 4.2 - u * 0.012 ? C_RING : C_FIN)));
  const HORN_S = bakeShape(Shape2D.poly([[-6, -9], [30, -11], [70, -6], [100, 0], [70, 5], [30, 10], [-6, 9]], C_FIN, 8, (u, v) => (u > 8 && u < 84 && Math.abs(v) < 2.8 ? C_RING : C_FIN)));
  // tail fin: a pointed, arrowhead-like blade with a red tip
  const TAILF = bakeShape(Shape2D.poly([[-10, 0], [30, 26], [70, 34], [110, 22], [150, 0], [110, -22], [70, -34], [30, -26]], C_FIN, 8, (u, v) => (u > 118 || Math.abs(v) > 26 - Math.max(0, u - 70) * 0.2 ? C_RED : Math.abs(v) < 4 && u > 20 && u < 108 ? C_RING : C_FIN)));

  /* ---------- head decals ---------- */
  const HR = [70, 44, 46];
  const EC = nrm([0.42, 0.38, 0.82]);
  const ETY = nrm(sub([0, 1, 0], sc(EC, EC[1])));
  const ETX = cross(ETY, EC);
  const lw = (r, base) => Math.max(base, 0.62 / (curScale * r));
  function headMat(kind) {
    return (s) => {
      const m = s[2] < 0 ? [s[0], s[1], -s[2]] : s;
      if (m[0] * EC[0] + m[1] * EC[1] + m[2] * EC[2] > 0.6) {
        const d = sub(m, EC), ex = dot(d, ETX), ey = dot(d, ETY);
        const w = lw(HR[1], 0.035);
        const e2 = (ex / 0.26) ** 2 + (ey / 0.17) ** 2;
        if (kind === 'closed' || kind === 'happy') {
          const k = 1 - (ex / 0.24) ** 2;
          const yc = kind === 'happy' ? -0.07 + 0.1 * k : 0.02 - 0.07 * k;
          if (Math.abs(ex) < 0.24 && Math.abs(ey - yc) < w) return C_DARK;
        } else if (e2 < 1) {
          if (kind === 'blink' && ey > -0.03) return ey < -0.03 + w * 1.4 ? C_DARK : C_GREEN;
          if (e2 > 0.64) return C_DARK;
          const px = (ex - 0.05) / 0.07, py = ey / 0.12;
          return px * px + py * py < 1 ? C_PUPIL : C_EYE;
        }
        // yellow mark streaming back from the eye
        if (ex < -0.2 && ex > -0.62 && Math.abs(ey - 0.02 - 0.15 * (ex + 0.2)) < 0.05) return C_RING;
      }
      return C_GREEN;
    };
  }
  // upper snout: red mouth line along its lower edge, two nostrils
  function snoutMat(mo) {
    return (s) => {
      if (s[1] < -0.45 && s[0] > -0.7) return s[1] < -0.62 || mo < 0.05 ? C_RED : C_GREEN;
      if (s[0] > 0.86 && s[1] > 0.05 && s[1] < 0.35 && Math.abs(Math.abs(s[2]) - 0.3) < 0.13) return C_DARK;
      // yellow marking along the top of the snout
      if (s[1] > 0.55 && Math.abs(s[2]) < 0.22 && s[0] > -0.4 && s[0] < 0.7) return C_RING;
      return C_GREEN;
    };
  }
  const jawMat = (s) => (s[1] > 0.5 ? (s[0] > -0.3 && Math.abs(s[2]) < 0.7 ? C_TONGUE : C_RED) : s[1] > 0.3 ? C_RED : C_GREEN);

  const DEFAULT = { wave: 0, length: 1, roar: 0, glow: 0, mouth: 0, eyes: 'open', side: 1 };
  // 1 body, 2 head, 3 jaw, 4 mouth, 5/6 arms, 7..12 wings, 13-16 horns, 17 tail fin
  const PRI = { 1: 0, 2: 2, 3: 2, 4: 1, 5: 3, 6: 1, 7: 3, 8: 1, 9: 3, 10: 1, 11: 3, 12: 1, 13: 3, 14: 1, 15: 3, 16: 1, 17: 1 };
  const Y0 = 150; // spine height above the reference line

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {};
    const ph = +P.wave || 0;
    const ln = lerp(0.55, 1, clamp(P.length ?? 1, 0, 1));
    const ro = clamp(+P.roar || 0, 0, 1);
    const mo = clamp(Math.max(+P.mouth || 0, 0.8 * ro), 0, 1);
    const kind = ['open', 'happy', 'blink', 'closed'].includes(P.eyes) ? P.eyes : 'open';
    const L = LBODY * ln;
    const X0 = L / 2 - 30; // neck position (the model is centred on its length)

    // --- spine: travelling wave (vertical, growing toward the tail) + a gentle sideways sway
    const N = 13, ctrl = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const k = 2 * Math.PI * 1.35 * u;
      const A = 16 + 62 * u;
      const y = Y0 + A * Math.sin(ph - k) - 8 * Math.sin(ph) + 40 * ro * (1 - u) * (1 - u);
      const z = (6 + 26 * u) * Math.sin(ph * 0.5 - k * 0.5 + 1);
      ctrl.push([X0 - u * L, y, z]);
    }
    const dense = [];
    for (let i = 0; i < N - 1; i++) {
      const a = ctrl[Math.max(0, i - 1)], b = ctrl[i], c = ctrl[i + 1], d = ctrl[Math.min(N - 1, i + 2)];
      for (let k = 0; k < 8; k++) dense.push({ p: cr(a, b, c, d, k / 8) });
    }
    dense.push({ p: ctrl[N - 1] });
    let arc = 0;
    dense.forEach((q, i) => { if (i) arc += len3(sub(q.p, dense[i - 1].p)); q.s = arc; });
    const Ls = arc;
    const at = (s) => {
      s = clamp(s, 0, Ls);
      let lo = 0, hi = dense.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dense[m].s <= s) lo = m; else hi = m; }
      const a = dense[lo], b = dense[hi], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
      return lerp3(a.p, b.p, t);
    };
    // frame at arc length s: X = backward tangent (toward the tail), Y = up-ish, Z = side
    const frameAt = (s) => {
      const p = at(s), X = nrm(sub(at(s + 6), at(s - 6)));
      const Y = nrm(sub([0, 1, 0], sc(X, X[1])));
      return { o: p, X, Y, Z: cross(X, Y) };
    };

    // --- body beads with ring decals
    const nB = Math.round(14 + 12 * ln);
    for (let j = 0; j < nB; j++) {
      const s0 = (j / nB) * Ls, s1 = ((j + 1) / nB) * Ls;
      const A = at(s0), Bp = at(s1);
      const u = (s0 + s1) / 2 / Ls;
      const r = radAt(u) * (ln < 1 ? lerp(0.92, 1, ln) : 1);
      const X = nrm(sub(Bp, A));
      const Y = nrm(sub([0, 1, 0], sc(X, X[1])));
      const Z = cross(X, Y);
      const hl = len3(sub(Bp, A)) / 2 + r * 0.7;
      const smid = (s0 + s1) / 2;
      const prim = E(sc(add(A, Bp), 0.5), M3.mul(M3.cols(X, Y, Z), M3.diag(hl, r, r)), 1, 1, null);
      const rr = r * 0.5, wv = Math.max(r * 0.065, 0.75 / curScale);
      prim.mat = (s) => {
        let m = GREEN;
        const al = smid + s[0] * hl;
        if (Math.abs(s[2]) > 0.25 && al > RING_FROM - rr - wv && al < Ls - 40) {
          // nearest ring centre along the body; the ring sits on the side, a little above the middle
          const k = Math.round((al - RING_FROM) / RING_PER);
          const da = al - (RING_FROM + k * RING_PER);
          const dv = (Math.atan2(s[1], Math.abs(s[2])) - 0.12) * r;
          const d = Math.hypot(da / 1.7, dv);
          if (k >= 0 && Math.abs(d - rr) < wv) m = RING;
          else if (k >= 0 && d > rr && Math.abs(dv) < wv * 0.9) m = RING;
        }
        // thin black joint lines round the body half way between the rings
        if (m === GREEN && al > RING_FROM && al < Ls - 60) {
          const dj = al - (RING_FROM + RING_PER / 2 + Math.round((al - RING_FROM - RING_PER / 2) / RING_PER) * RING_PER);
          if (Math.abs(dj) < Math.max(r * 0.035, 0.55 / curScale)) m = DARK;
        }
        return tube(prim, s, m);
      };
      prims.push(prim);
    }
    const tailEnd = frameAt(Ls);
    anchors.tailBase = tailEnd.o;
    anchors.body = at(Ls * 0.42);

    // --- tail fin: vertical pointed blade continuing the spine
    {
      const b = tailEnd;
      const flex = 0.25 * Math.sin(ph - 2 * Math.PI * 1.35 - 0.6);
      const U = nrm(add(b.X, sc(b.Y, flex)));
      const V = nrm(sub(b.Y, sc(U, dot(b.Y, U))));
      const o = sub(b.o, sc(U, 8));
      const k = 0.85 * lerp(0.85, 1, ln);
      prims.push(PL(o, M3.cols(sc(U, k), sc(V, k), cross(U, V)), 17, 17, TAILF, 5));
      anchors.tail = add(o, sc(U, 150 * k));
    }

    // --- wing fins: three pairs along the body, up and back, red tips
    const WINGS = [{ u: 0.16, k: 1.0 }, { u: 0.43, k: 0.86 }, { u: 0.68, k: 0.7 }];
    WINGS.forEach((wg, i) => {
      const b = frameAt(wg.u * Ls);
      const r = radAt(wg.u);
      const flap = 0.18 * Math.sin(ph - 2 * Math.PI * 1.35 * wg.u + 1.2) + 0.35 * ro;
      for (const sd of [1, -1]) {
        const out = nrm(add(sc(b.Y, 0.78 + 0.2 * flap), sc(b.Z, sd * (0.62 - 0.2 * flap))));
        const U = b.X;
        const V = nrm(sub(out, sc(U, dot(out, U))));
        const o = add(add(b.o, sc(V, r * 0.7)), sc(b.Z, sd * r * 0.25));
        const id = 7 + i * 2 + (sd > 0 ? 0 : 1);
        prims.push(PL(o, M3.cols(sc(U, wg.k), sc(V, wg.k), cross(U, V)), id, id, WING, 6));
      }
    });

    // --- arms: small, under the front of the body, three claws
    {
      const b = frameAt(0.09 * Ls);
      const r = radAt(0.09);
      for (const sd of [1, -1]) {
        const id = sd > 0 ? 5 : 6;
        const sh = add(add(b.o, sc(b.Z, sd * r * 0.72)), sc(b.Y, -r * 0.45));
        const d1 = nrm(add(add(sc(b.Y, -0.8 + 0.5 * ro), sc(b.X, -0.35 - 0.3 * ro)), sc(b.Z, sd * (0.35 + 0.4 * ro))));
        const el = add(sh, sc(d1, 34));
        const d2 = nrm(add(add(sc(b.Y, -0.3 + 0.6 * ro), sc(b.X, -0.9)), sc(b.Z, sd * 0.15)));
        const wr = add(el, sc(d2, 30));
        prims.push(seg(sh, el, 12, id, id, M_GREEN));
        prims.push(seg(el, wr, 10, id, id, M_GREEN));
        prims.push(E(wr, M3.diag(11, 10, 11), id, id, M_GREEN));
        for (const k of [-1, 0, 1]) {
          const cd = nrm(add(add(d2, sc(b.Y, -0.4)), sc(b.Z, k * 0.45)));
          prims.push(seg(add(wr, sc(cd, 8)), add(wr, sc(cd, 24)), 3.6, id, id, M_CLAW));
        }
        anchors[sd > 0 ? 'handN' : 'handF'] = add(wr, sc(d2, 16));
      }
    }

    // --- head: follows the neck direction, pitched up by roar
    const nb = frameAt(0);
    const fwd0 = sc(nb.X, -1);
    const pitchAxis = nrm(cross([0, 1, 0], fwd0)); // rotating about it by +t pitches the snout up
    const hp = 0.12 + 0.55 * ro + 0.06 * Math.sin(ph + 0.8);
    const HX = nrm(rot(fwd0, pitchAxis, -hp)), HZ0 = nrm(cross(HX, [0, 1, 0]));
    const HZ = HZ0; // near side (+z)
    const HY = nrm(cross(HZ, HX));
    const hb = { o: add(nb.o, add(sc(HX, 58), sc(HY, 8))), X: HX, Y: HY, Z: HZ };
    // neck bridge
    prims.push(seg(at(34), inB(hb, [-30, -6, 0]), 40, 1, 1, M_GREEN));
    const headPrim = ellB(hb, [0, 0, 0], HR, 2, 2, headMat(kind));
    prims.push(headPrim);
    prims.push(ellB(hb, [76, -9, 0], [70, 27, 34], 2, 2, snoutMat(mo)));
    // lower jaw hinged under the eye
    const ja = -0.5 * mo;
    const jX = rot(HX, HZ, ja), jY = rot(HY, HZ, ja);
    const jb = { o: inB(hb, [8, -22, 0]), X: jX, Y: jY, Z: HZ };
    prims.push(ellB(jb, [62, -4, 0], [68, 15, 29], 3, 3, jawMat));
    if (mo > 0.04) prims.push(ellB(hb, [58, -26, 0], [56, 10 + 16 * mo, 24], 4, 4, (s) => (s[1] < -0.2 && Math.abs(s[2]) < 0.6 ? C_TONGUE : C_MOUTH)));
    anchors.head = hb.o;
    anchors.neck = nb.o;
    anchors.mouth = inB(hb, [134, -26, 0]);
    anchors.eyeN = inB(hb, [HR[0] * EC[0], HR[1] * EC[1], HR[2] * EC[2]]);
    anchors.eyeF = inB(hb, [HR[0] * EC[0], HR[1] * EC[1], -HR[2] * EC[2]]);
    // horns: long pair from the crown, shorter pair from the back of the jaw, swept back
    let top = [0, -1e9, 0];
    const sway = 0.08 * Math.sin(ph - 0.6);
    for (const sd of [1, -1]) {
      for (const [id, shp, root, dir, k] of [
        [13, HORN, [-22, 32, sd * 20], [-1, 0.8 + sway + 0.45 * ro, sd * 0.4], 1.45],
        [15, HORN_S, [-22, -18, sd * 30], [-1, -0.06 + sway + 0.45 * ro, sd * 0.5], 1],
      ]) {
        const U = nrm(add(add(sc(HX, dir[0]), sc(HY, dir[1])), sc(HZ, dir[2])));
        const V0 = nrm(sub(HY, sc(U, dot(HY, U))));
        const V = nrm(add(V0, sc(HZ, sd * 0.25)));
        const o = inB(hb, root);
        const gid = id + (sd > 0 ? 0 : 1);
        prims.push(PL(o, M3.cols(sc(U, k), sc(V, k), cross(U, V)), gid, gid, shp, 5));
        if (shp === HORN) { const tp = add(o, sc(U, 180 * 1.45)); if (tp[1] > top[1]) top = tp; }
      }
    }
    anchors.top = top;
    return { prims, stamps: [], dots: [], anchors, pose: P, headPrim, pri: PRI, glossy: GLOSSY, baseMat: GREEN, shadowSteps: 0 };
  }

  /* ---------- render: glow palette, then ray-cast only the silhouette box (nearest prims first) ---------- */
  function render(model, opt) {
    curScale = opt.scale || 1;
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74];
    let pal = opt.pal || PAL;
    const g = clamp(model.pose.glow || 0, 0, 1);
    if (g > 0) {
      const e = pal[RING];
      pal = Object.assign({}, pal, { [RING]: { r: e.r.map((c, i) => PX.mix(c, GLOW[i], g)), od: PX.mix(e.od, GLOW[0], g * 0.4), ol: PX.mix(e.ol, GLOW[1], g * 0.7), ln: PX.mix(e.ln, GLOW[0], g * 0.5) } });
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 7.0, lengthM: 7.0, bw: 1480, bh: 620, oy: 0.777 } };
})();
