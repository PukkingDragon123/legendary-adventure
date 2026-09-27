/* ------------------------------------------------------------------
   Chinchou — the Angler Pokémon (0.5 m ≈ 88 units tall at scale 1,
   antennae included). A posable 3D model rendered straight to pixel
   art by the shared Creature pipeline (src/creature.js,
   dev/CREATURE_GUIDE.md).
   Model space: x = forward, y = up, z = near side at yaw 0; y = 0 is
   the bottom of the body (the lures hang a little lower).

   Design (official art / HOME model): a round, slightly egg-shaped blue
   anglerfish body; two big yellow disc eyes, each with a black "+"
   cross, set wide on the front of the face with a thin dark rim; a tiny
   pink mouth low between them; two thin blue antennae rising from the
   top of the head, arching out to either side and hanging down into
   big yellow teardrop lures (the stalk turns yellow just above them);
   small translucent white-blue pectoral fins like little wings, a small
   blue tail fin and a stubby ventral fin under the belly.

   Pose parameters (all optional):
     swim   radians   swimming phase (period 2π): tail wag, fin flutter,
                      a gentle body rock and the lures swinging behind
     glow   0..1      antenna lights (0 = plain yellow lures, 1 = glowing
                      white-hot; the glow ignores the time-of-day grading)
     fins   −1..1     pectoral fins (−1 folded down/back, 1 raised)
     mouth  0..1      mouth opens into a little "o"
     eyes   'open' | 'happy' | 'closed' | 'blink' | 'sleep'
     side   −1..1     ≈ cos(yaw), passed in by the game (unused, accepted)
   Anchors: top (antenna arch top), head (face centre), mouth, eyeN, eyeF,
   body (body centre), lureN, lureF (lure centres, near / far side),
   finN, finF (pectoral fin tips), tail (tail fin tip).
------------------------------------------------------------------- */
const Chinchou = (() => {
  const { chain, T, R, code } = Creature;

  // ---- materials
  const BODY = 1, EYE = 2, PUPIL = 3, LURE = 4, GLOW = 5, FIN = 6, MOUTH = 7, STALK = 8, LID = 9;
  const MAT = { BODY, EYE, PUPIL, LURE, GLOW, FIN, MOUTH, STALK, LID };
  const PAL = Creature.palette({
    [BODY]:  { r: ['#2c4c9e', '#3f69c4', '#5b8fe0', '#86b5f2', '#c6e2ff'], od: '#15275e', ol: '#2d4c9e', ln: '#2c4a98' },
    [LID]:   { r: ['#2c4c9e', '#3f69c4', '#5b8fe0', '#86b5f2', '#c6e2ff'], od: '#15275e', ol: '#2d4c9e', ln: '#1a2450' },
    [STALK]: { r: ['#3a5cb0', '#4c78cc', '#6698e4', '#8cbaf4', '#c6e2ff'], od: '#223f88', ol: '#3a5eb2', ln: '#2c4a98' },
    [EYE]:   { r: ['#c0a430', '#dcc444', '#f4e062', '#fbee98', '#fffbd6'], od: '#1c2448', ol: '#2a3260', ln: '#1c2448' },
    [PUPIL]: { r: ['#0e1020', '#121628', '#171c30', '#1e2438', '#262e44'], od: '#0a0c16', ol: '#0a0c16', ln: '#0a0c16' },
    [LURE]:  { r: ['#c8a232', '#e2c046', '#f4dc66', '#fbec9c', '#fff8d8'], od: '#6e5010', ol: '#a48020', ln: '#a48020' },
    [GLOW]:  { r: ['#ffe68a', '#fff0b0', '#fff8d8', '#fffdf2', '#ffffff'], od: '#c89a28', ol: '#ecc44c', ln: '#ecc44c' },
    [FIN]:   { r: ['#90a8d4', '#b2c6ea', '#d6e4f8', '#eef5ff', '#ffffff'], od: '#40589a', ol: '#6c86c0', ln: '#9ab0d8' },
    [MOUTH]: { r: ['#6e1e32', '#8c2c42', '#b04458', '#c85e6e', '#de8088'], od: '#3e0c1a', ol: '#5e1a2a', ln: '#5e1a2a' },
  });
  const GLOSSY = { [BODY]: 1, [EYE]: 1, [LURE]: 1 };
  const C_BODY = code(BODY), C_EYE = code(EYE), C_EYE_L = code(EYE, 1), C_PUPIL = code(PUPIL), C_LURE = code(LURE), C_LURE_L = code(LURE, 1);
  const C_FIN = code(FIN), C_MOUTH = code(MOUTH), C_STALK = code(STALK), C_LID = code(LID), C_LID_D = code(LID, -1);
  const M_LURE = () => C_LURE, M_STALK = () => C_STALK;

  // ---- helpers
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sub = V3.sub, sc = V3.scale, cross = V3.cross, nrm = V3.norm;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const E = (c, L, part, grp, mat) => ({ kind: 'ell', part, grp, c, L, mat });
  const ellF = (f, r, part, grp, mat) => E(f.t, M3.mul(f.L, M3.diag(r[0], r[1], r[2])), part, grp, mat);
  // local axes of a segment p0 → p1 (y along it)
  function segAxes(p0, p1) {
    const d = sub(p1, p0), l = len3(d) || 1e-3, Y = sc(d, 1 / l);
    let X = cross(Y, [0, 0, 1]);
    if (len3(X) < 1e-3) X = cross(Y, [1, 0, 0]);
    X = nrm(X);
    return { X, Y, Z: cross(X, Y), l };
  }
  const segL = (a, r, ext) => M3.cols(sc(a.X, r), sc(a.Y, a.l / 2 + ext), sc(a.Z, r));
  // rotate v about unit axis k by angle t (Rodrigues)
  const rot = (v, k, t) => {
    const c = Math.cos(t), s = Math.sin(t), d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2], x = cross(k, v);
    return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
  };

  /* ---------- body and face ---------- */
  const RX = 34, RY = 25.5, RZ = 31;        // body radii (51 tall, a flattened egg)
  const EYE_AZ = 0.6, EYE_V = -0.12, EYE_R = 11.4;
  const MOUTH_V = -0.4;
  let curScale = 1;

  // eye lens (local frame: x across, y up, z = outward normal): yellow disc with a black "+".
  // The cross bars are snapped to the pixel grid (exactly n px thick), so they never break up.
  function eyeMat(kind, ref) {
    return (s) => {
      const x = s[0], y = s[1];
      if (kind === 'open') {
        const p = ref.p, Lv = p.Lv, cv = p.cv;
        const n = Math.max(1, Math.round(0.24 * EYE_R * curScale));
        const vx = cv[0] + Lv[0] * x + Lv[1] * y + Lv[2] * s[2], vy = cv[1] + Lv[3] * x + Lv[4] * y + Lv[5] * s[2];
        const cx = n & 1 ? Math.floor(cv[0]) + 0.5 : Math.round(cv[0]), cy = n & 1 ? Math.floor(cv[1]) + 0.5 : Math.round(cv[1]);
        if ((Math.abs(vx - cx) < n / 2 && Math.abs(y) < 0.66) || (Math.abs(vy - cy) < n / 2 && Math.abs(x) < 0.66)) return C_PUPIL;
        return curScale >= 0.9 && (x + 0.4) ** 2 + (y - 0.42) ** 2 < 0.03 ? C_EYE_L : C_EYE;
      }
      // happy ^ / closed ‿ / sleep: a blue lid over the eye with a dark arc
      const lw = Math.max(0.1, 0.6 / (curScale * EYE_R));
      if (Math.abs(x) < 0.8) {
        const k = 1 - (x / 0.8) ** 2;
        const yc = kind === 'happy' ? -0.2 + 0.5 * k : kind === 'sleep' ? 0.12 - 0.3 * k : 0.04 - 0.36 * k;
        if (Math.abs(y - yc) < lw) return C_PUPIL;
      }
      return y < -0.55 ? C_LID_D : C_LID;
    };
  }

  /* ---------- fins and tail (plates) ---------- */
  // pectoral: u = out along the fin, v = across (toward the trailing edge)
  const PEC_PTS = [[-1, -3.4], [5, -4.8], [11, -5.4], [16.5, -4.2], [20, -1], [19.6, 3], [15.5, 6], [9, 7.2], [3, 5.6], [-1, 3.4]].map(([u, v]) => [u * 1.25, v * 1.2]);
  const PEC_G = bakeShape(Shape2D.poly(PEC_PTS, C_FIN, 8));
  const PEC_RAYS = [[[1, -1.6], [20.5, -2.4]], [[1, 1.6], [18.5, 4.6]]].map((pl) => ({ pts: pl.map(([u, v]) => [u, v, 0]), mat: FIN, useLn: true }));
  // tail: u = backward, v = up; a small two-lobed fin
  const TAIL_G = bakeShape(Shape2D.poly([[-2, -3.6], [4, -4.8], [8.5, -9], [12.4, -8.8], [11.2, -3.8], [9.8, 0], [11.8, 4.8], [10.2, 8], [5, 5], [-2, 3.6]], C_BODY, 8));
  // ventral fin: u = backward, v = down
  const VEN_G = bakeShape(Shape2D.poly([[-4, -1], [3, -1.4], [7.5, 1.2], [8.6, 5], [5, 5.8], [0.5, 3.8], [-4, 2]], C_BODY, 8));

  /* ---------- antennae ---------- */
  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]];
  };
  const N_ST = 11, STALK_R = 0.85, YEL_FROM = 0.86;
  const LURE_R = 11, LURE_L = 12, LURE_OFF = 17;   // bulb radius across / along, offset from the stalk end

  const DEFAULT = { swim: 0, glow: 0, fins: 0, mouth: 0, eyes: 'open', side: 1 };
  const PRI = {};
  for (let i = 1; i < 32; i++) PRI[i] = 0;
  // body 1, eye lenses 2/3, fins 4/5, tail 6, ventral 7, stalks 8/9, lures 10/11
  Object.assign(PRI, { 1: 0, 2: 3, 3: 3, 4: 2, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2, 11: 2 });

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const prims = [], anchors = {}, stalks = [];
    const ph = +P.swim || 0, sw = Math.sin(ph), cw = Math.cos(ph);
    const kind = P.eyes === 'happy' ? 'happy' : P.eyes === 'sleep' ? 'sleep' : P.eyes === 'closed' || P.eyes === 'blink' ? 'closed' : 'open';
    const mo = clamp(+P.mouth || 0, 0, 1);

    // body frame: centre of the body ellipsoid, nose a touch down, rocking gently with the swim
    const body = chain(T(0, RY + 0.8 * sw, 0), R(M3.rz(-0.07 + 0.05 * cw)));
    const mouthR = [2.1 + 1.6 * mo, 2.2 + 2.3 * mo];
    const bodyPrim = ellF(body, [RX, RY, RZ], 1, 1, (s) => {
      // small mouth low on the front, between the eyes (pixel minimum so it survives small scales)
      if (s[0] > 0.6) {
        const px = 1 / curScale;
        const du = (s[2] * RZ) / Math.max(mouthR[0], 0.6 * px), dv = ((s[1] - MOUTH_V) * RY) / Math.max(mouthR[1], 0.6 * px);
        if (du * du + dv * dv < 1) return C_MOUTH;
      }
      return C_BODY;
    });
    prims.push(bodyPrim);
    anchors.body = body.t;
    anchors.head = inF(body, [RX * 0.8, 0, 0]);
    anchors.mouth = inF(body, [RX * Math.sqrt(1 - MOUTH_V * MOUTH_V), RY * MOUTH_V, 0]);

    // --- eyes: slightly protruding yellow lenses on the front of the face
    for (const sd of [1, -1]) {
      const s0 = Creature.sph(sd * EYE_AZ, EYE_V);
      const pS = [RX * s0[0], RY * s0[1], RZ * s0[2]];
      const n = nrm([s0[0] / RX, s0[1] / RY, s0[2] / RZ]);
      const u = nrm(cross([0, 1, 0], n)), v = cross(n, u);
      const L = M3.mul(body.L, M3.cols(sc(u, EYE_R), sc(v, EYE_R), sc(n, 2.6)));
      const ref = {};
      ref.p = E(inF(body, add(pS, sc(n, -1.3))), L, sd > 0 ? 2 : 3, sd > 0 ? 2 : 3, eyeMat(kind, ref));
      prims.push(ref.p);
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = inF(body, add(pS, sc(n, 1.3)));
    }

    // --- pectoral fins: little wings behind the eyes, face turned forward-up; flap about the body axis
    const fl = clamp(+P.fins || 0, -1, 1) * 0.55 + 0.3 * Math.sin(2 * ph);
    for (const sd of [1, -1]) {
      const s0 = Creature.sph(sd * 1.5, -0.12);
      const root = [RX * s0[0] * 0.9, RY * s0[1], RZ * s0[2] * 0.9];
      const u0 = nrm([-0.4, 0.06, sd * 0.92]);
      const v0 = nrm(cross(u0, [0, sd, 0]));                 // trailing edge (back)
      const tilt = 0.85;                                     // turn the fin's face toward the front
      const flap = -sd * (0.28 + fl);
      const uF = rot(u0, [1, 0, 0], flap), vF = rot(rot(v0, u0, sd * tilt), [1, 0, 0], flap);
      const L = M3.mul(body.L, M3.cols(uF, vF, cross(uF, vF)));
      prims.push({ kind: 'plate', part: sd > 0 ? 4 : 5, grp: sd > 0 ? 4 : 5, c: inF(body, root), L, shape: PEC_G, thick: 1.2, lines: PEC_RAYS });
      anchors[sd > 0 ? 'finN' : 'finF'] = inF(body, add(root, sc(uF, 24)));
    }

    // --- tail fin (wags with the swim) and a stubby ventral fin
    const tail = chain(body, T(-RX + 6, -13, 0), R(M3.rz(-0.7)), R(M3.ry(0.5 * sw)), R(M3.diag(1.45, 1.35, 1)));
    prims.push({ kind: 'plate', part: 6, grp: 6, c: tail.t, L: M3.mul(tail.L, M3.cols([-1, 0, 0], [0, 1, 0], [0, 0, -1])), shape: TAIL_G, thick: 1.4 });
    anchors.tail = inF(tail, [-12 * 1.45, 0, 0]);
    const ven = chain(body, T(4, -RY + 2.4, 0), R(M3.rz(0.2)));
    prims.push({ kind: 'plate', part: 7, grp: 7, c: ven.t, L: M3.mul(ven.L, M3.cols([-1, 0, 0], [0, -1, 0], [0, 0, 1])), shape: VEN_G, thick: 1.4 });

    // --- antennae: rise from the top of the head, arch out to each side and hang into the lures
    let top = 0;
    const lag = Math.sin(ph - 1.2), lag2 = Math.cos(ph - 1.2);
    for (const sd of [1, -1]) {
      const id = sd > 0 ? 8 : 9, lid = sd > 0 ? 10 : 11;
      const lx = 9 - 5 * lag;                                // lures swing back / forward behind the stroke
      const p0 = [-7, RY - 1.5, sd * 4];
      const p1 = [-8, RY + 38, sd * 14];
      const p2 = [lx - 2, RY + 34, sd * 58];
      const p3 = [lx, -2 + 1.2 * lag2, sd * 61];
      const pts = [];
      for (let i = 0; i <= N_ST; i++) pts.push(inF(body, bez(p0, p1, p2, p3, i / N_ST)));
      for (let i = 0; i < N_ST; i++) {
        const a = segAxes(pts[i], pts[i + 1]);
        const q = E(sc(add(pts[i], pts[i + 1]), 0.5), segL(a, STALK_R, 0.7), id, id, (i + 0.5) / N_ST > YEL_FROM ? M_LURE : M_STALK);
        prims.push(q);
        stalks.push({ q, a });
        top = Math.max(top, pts[i][1] + STALK_R);
      }
      // lure: a round bulb with a pointed top, hanging along the stalk's last direction
      const end = pts[N_ST];
      const lf = segAxes(end, add(end, nrm(sub(end, pts[N_ST - 2]))));
      const bulbC = add(end, sc(lf.Y, LURE_OFF));
      // (local y points down the drop: its lower half is a paler, glowing core)
      prims.push(E(bulbC, M3.cols(sc(lf.X, LURE_R), sc(lf.Y, LURE_L), sc(lf.Z, LURE_R)), lid, lid, (s) => (s[1] > 0.15 ? C_LURE_L : C_LURE)));
      // the drop's tapering top: a long ellipsoid sunk into the bulb, its tip at the stalk end
      prims.push(E(add(end, sc(lf.Y, 14)), M3.cols(sc(lf.X, 8.1), sc(lf.Y, 15), sc(lf.Z, 8.1)), lid, lid, M_LURE));
      prims.push(E(add(end, sc(lf.Y, 2.8)), M3.cols(sc(lf.X, 3.6), sc(lf.Y, 6.5), sc(lf.Z, 3.6)), lid, lid, M_LURE));
      anchors[sd > 0 ? 'lureN' : 'lureF'] = bulbC;
    }
    anchors.top = [anchors.body[0] - 7, top, 0];
    return { prims, stamps: [], dots: [], anchors, pose: P, stalks, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 12, shadowDepth: 18 };
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
    // thin stalks keep at least ~1.2 px of width at small scales
    const r = Math.max(STALK_R, 0.62 / curScale);
    for (const st of model.stalks || []) st.q.L = segL(st.a, r, 0.7);
    let pal = opt.pal || PAL;
    const g = clamp(model.pose.glow || 0, 0, 1);
    const small = curScale < 0.62;
    if (g > 0 || small) {
      pal = Object.assign({}, pal);
      // emissive: mix the (graded) lure ramp toward the ungraded glow ramp
      if (g > 0) { const e = pal[LURE], G = PAL[GLOW]; pal[LURE] = { r: e.r.map((c, i) => PX.mix(c, G.r[i], g)), od: PX.mix(e.od, G.od, g), ol: PX.mix(e.ol, G.ol, g), ln: PX.mix(e.ln, G.ln, g) }; }
      // tiny eyes: a soft gold rim instead of the dark ring, so the cross reads
      if (small) pal[EYE] = Object.assign({}, pal[EYE], { ln: pal[EYE].r[0] });
      opt = Object.assign({}, opt, { pal });
    }
    return cropRender(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.5, bw: 164, bh: 110, oy: 0.775 } };
})();
