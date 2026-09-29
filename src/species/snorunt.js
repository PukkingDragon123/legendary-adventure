/* ------------------------------------------------------------------
   Snorunt — the Snow Hat Pokémon (0.7 m ≈ 122 units tall at scale 1).
   A little black snow sprite wearing a big golden-yellow straw hood:
   a smooth onion-dome hood with a pointed top that bends back a little
   and four rounded points flaring out around its hem, a round black face
   in the hood's opening with two big glowing icy-blue oval eyes, a round
   black body under the hood (the black "lower cloak"), tiny black arm
   nubs poking out between the hem points and two small black feet.
   Model space: x = forward, y = up, z = near side at yaw 0, ground at y = 0.

   Pose params:
     walk    radians  waddle phase (feet step in turn, body bobs and rocks,
                      the hood's points swing); 0 = standing still
     shiver  -1..1    signed cold tremble: the body shakes sideways by shiver,
                      hunches down and hugs its arms in by |shiver| (the game
                      oscillates it quickly, e.g. sin(t·50)·0.8)
     mouth   0..1     small mouth opening on the black face
     eyes    'open' (default) | 'blink' | 'happy' | 'closed' | 'angry'
     side    -1..1    ≈ 3·cos(yaw), passed by the game (unused)
   Anchors: top (hood tip), head, mouth, eyeN, eyeF, body, handN, handF,
            footN, footF.

   The hood is a stack of thin ellipsoid "beads" (a surface of revolution);
   each bead is shaded with the ideal surface normal of the hood (see
   shadeCode), so the hood reads as one smooth cone instead of rings.
------------------------------------------------------------------- */
const Snorunt = (() => {
  const { chain, T, R, F, code, sph } = Creature;

  // material ids
  const HOOD = 1, LINING = 2, BLACK = 3, EYE = 4, MOUTH = 5;
  const MAT = { HOOD, LINING, BLACK, EYE, MOUTH };
  const PAL = Creature.palette({
    [HOOD]:   { r: ['#a86c16', '#d0962a', '#eec244', '#f9dc78', '#fff4c4'], od: '#563406', ol: '#946212', ln: '#86580e' },
    [LINING]: { r: ['#6e440a', '#8e5c12', '#b07a1c', '#c8922a', '#dcac44'], od: '#3e2604', ol: '#704608', ln: '#603c08' },
    [BLACK]:  { r: ['#0b0c13', '#14151f', '#1f212e', '#2d3042', '#43485e'], od: '#050509', ol: '#16182a', ln: '#050508' },
    [EYE]:    { r: ['#3a96c4', '#5ebce6', '#98e2fa', '#d2f6ff', '#ffffff'], od: '#12405c', ol: '#2a6688', ln: '#2a6688' },
    [MOUTH]:  { r: ['#521020', '#741a2e', '#962a40', '#b84458', '#d46a78'], od: '#2a0610', ol: '#521020', ln: '#3a0a18' },
  });
  const GLOSSY = {}; // the hood's highlight comes from shadeCode (ideal normal)

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pt = (f, p) => V3.add(f.t, M3.v(f.L, p));

  /* ---------- smooth shading with ideal normals ----------
     A prim is built in a "shading frame" Fs with local axes A (columns) and radii r;
     Q = diag(1/r)·Aᵀ maps shading-frame directions into the prim's unit-sphere space, so
     prim.Lv·Q maps them to view space. shadeCode returns the material code whose tone bias
     lands on the tone (and highlight) the ideal normal n would get. */
  let LD = V3.norm([-0.5, 0.72, 0.5]), TH = [-0.2, 0.18, 0.74], HH = V3.norm(V3.add(LD, [0, 0, 1])), SPEC = 0.975;
  const toneOf = (d) => (d < TH[0] ? 0 : d < TH[1] ? 1 : d < TH[2] ? 2 : 3);
  function shadeCode(prim, Q, s, n0, n1, n2, m, gloss, extra) {
    const Lv = prim.Lv, Li = prim.Li;
    const q0 = Q[0] * n0 + Q[1] * n1 + Q[2] * n2, q1 = Q[3] * n0 + Q[4] * n1 + Q[5] * n2, q2 = Q[6] * n0 + Q[7] * n1 + Q[8] * n2;
    let ix = Lv[0] * q0 + Lv[1] * q1 + Lv[2] * q2, iy = Lv[3] * q0 + Lv[4] * q1 + Lv[5] * q2, iz = Lv[6] * q0 + Lv[7] * q1 + Lv[8] * q2;
    let l = Math.hypot(ix, iy, iz) || 1;
    ix /= l; iy /= l; iz /= l;
    const ax = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], ay = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], az = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
    l = Math.hypot(ax, ay, az) || 1;
    let tI = toneOf(ix * LD[0] + iy * LD[1] + iz * LD[2]) + extra;
    if (gloss && tI >= 2 && ix * HH[0] + iy * HH[1] + iz * HH[2] > SPEC) tI = 4;
    return code(m, clamp(tI - toneOf((ax * LD[0] + ay * LD[1] + az * LD[2]) / l), -2, 5));
  }
  // ellipsoid in frame f with local axes A (3 unit columns), centre c and radii r; mat(s, X, Y, Z, prim, Q)
  // receives the hit on the unit sphere and the hit point in f's coordinates
  function shell(f, c, A, r, part, grp, mat) {
    const Lc = M3.cols(A[0], A[1], A[2]);
    const prim = { kind: 'ell', part, grp, c: pt(f, c), L: M3.mul(f.L, M3.mul(Lc, M3.diag(r[0], r[1], r[2]))), mat: null };
    const Q = [A[0][0] / r[0], A[0][1] / r[0], A[0][2] / r[0], A[1][0] / r[1], A[1][1] / r[1], A[1][2] / r[1], A[2][0] / r[2], A[2][1] / r[2], A[2][2] / r[2]];
    const a00 = A[0][0] * r[0], a01 = A[0][1] * r[0], a02 = A[0][2] * r[0], a10 = A[1][0] * r[1], a11 = A[1][1] * r[1], a12 = A[1][2] * r[1], a20 = A[2][0] * r[2], a21 = A[2][1] * r[2], a22 = A[2][2] * r[2];
    prim.mat = (s) => mat(s, c[0] + a00 * s[0] + a10 * s[1] + a20 * s[2], c[1] + a01 * s[0] + a11 * s[1] + a21 * s[2], c[2] + a02 * s[0] + a12 * s[1] + a22 * s[2], prim, Q);
    return prim;
  }
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  /* ---------- hood profile: radius by height (surface of revolution about the hood's y axis) ---------- */
  const PROF = [[40, 42.6], [45, 43], [50, 42.8], [58, 41.8], [66, 39.9], [74, 37.1], [82, 33.3], [90, 28.5], [98, 22.8], [105, 17.1], [111, 11.6], [116, 6.8], [119.5, 3.4], [121.5, 1.2]];
  const PR = (() => {
    const out = new Float32Array(260); // r at y = 0..129.5 in 0.5 steps
    const S = Shape2D.catmull(PROF, false, 10);
    for (let i = 0; i < out.length; i++) {
      const y = i * 0.5;
      let r = 0;
      if (y <= S[0][0]) r = S[0][1];
      else for (let k = 0; k < S.length - 1; k++) if (y >= S[k][0] && y <= S[k + 1][0]) { r = S[k][1] + ((S[k + 1][1] - S[k][1]) * (y - S[k][0])) / (S[k + 1][0] - S[k][0] || 1); break; }
      out[i] = Math.max(0, r);
    }
    return out;
  })();
  const rAt = (y) => PR[clamp(Math.round(y * 2), 0, PR.length - 1)];
  const slopeAt = (y) => (rAt(y + 1.5) - rAt(y - 1.5)) / 3; // dr/dy
  const Y_HEM = 47, Y_TOP = 122;
  // backward bend of the hood's upper part (x offset of the axis by height)
  const bendAt = (y, b) => (y > 70 ? -b * ((y - 70) / 52) ** 2 : 0);

  // head layout (hood-local coordinates, before K)
  const HEAD_C = [0, 66, 0], HEAD_R = [36, 32, 36];
  // face opening: a tunnel along +x through the hood (oval in y-z)
  const FACE_Y = 69, FACE_H = 22, FACE_W = 27.5;

  // eyes: tangent frames on the head ellipsoid (unit-sphere space)
  const EC = sph(0.39, 0.12);
  const ETY = V3.norm(V3.sub([0, 1, 0], V3.scale(EC, EC[1])));
  const ETX = V3.cross(ETY, EC); // toward the face centre on the near side
  let curScale = 1;

  // hem points: azimuths (radians from +x toward +z) and tooth outline (U across, V down the tooth, both -1..1)
  const TEETH = [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
  const TOOTH = { yc: 40, ru: 24, rv: 14.5, rw: 6, rho: 40, flare: 0.36 };
  const toothHW = (V) => { const t = clamp((V + 1) / 1.93, 0, 1); return 0.98 * Math.pow(Math.max(0, 1 - Math.pow(t, 1.7)), 0.62); };

  const K = 1; // overall size: ~122 units from the soles to the hood tip
  const DEFAULT = { walk: 0, shiver: 0, mouth: 0, eyes: 'open', side: 1 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const wk = +P.walk || 0, walking = wk !== 0;
    const shv = clamp(+P.shiver || 0, -1, 1), sa = Math.abs(shv);
    const mouth = clamp(+P.mouth || 0, 0, 1);
    const kind = ['open', 'blink', 'happy', 'closed', 'angry'].includes(P.eyes) ? P.eyes : 'open';
    const bob = walking ? 2.4 * Math.abs(Math.sin(wk)) : 0;
    const rock = walking ? 0.07 * Math.sin(wk) : 0;
    const prims = [], anchors = {};
    const cBLACK = code(BLACK);
    const mBLACK = () => cBLACK;

    const root = F(M3.diag(K, K, K), [0, 0, 0]);
    // whole body: waddle rock about the forward axis, shiver shake + hunch
    const body = chain(root, T(0, bob - 3 * sa, 2.4 * shv), R(M3.rx(rock + 0.05 * shv)));

    /* --- feet: two small black ovals, stepping in turn --- */
    for (const sd of [1, -1]) {
      const ph = wk + (sd > 0 ? 0 : Math.PI);
      const lift = walking ? 3.2 * Math.max(0, Math.sin(ph)) : 0;
      const fwd = walking ? 4 * Math.cos(ph) : 0;
      const f = chain(root, T(5 + fwd, 5.5 + lift + 0.5 * bob, sd * 13 + 1.2 * shv), R(M3.rz(walking ? -0.25 * Math.max(0, Math.sin(ph)) : 0)));
      const id = sd > 0 ? 2 : 3;
      prims.push(shell(f, [0, 0, 0], I3, [11, 6, 9], id, id, mBLACK));
      anchors[sd > 0 ? 'footN' : 'footF'] = pt(f, [0, -6, 0]);
    }

    /* --- round black body under the hood --- */
    const bodyC = [1, 34, 0];
    prims.push(shell(body, bodyC, I3, [28, 27, 28], 1, 1, mBLACK));
    anchors.body = pt(body, bodyC);

    /* --- little black arm nubs between the hem points --- */
    for (const sd of [1, -1]) {
      const sw = walking ? 0.3 * Math.sin(wk + (sd > 0 ? Math.PI : 0)) : 0;
      const hug = sa;
      const a = chain(body, T(2 + 6 * hug, 43, sd * (30 - 5 * hug)), R(M3.ry(sd * 0.9 * hug)), R(M3.rz(sw)), R(M3.rx(-sd * (0.95 - 0.4 * hug))), T(0, -6, 0));
      const id = sd > 0 ? 4 : 5;
      prims.push(shell(a, [0, 0, 0], I3, [6.5, 9.5, 6], id, id, mBLACK));
      anchors[sd > 0 ? 'handN' : 'handF'] = pt(a, [0, -9, 0]);
    }

    /* --- head: black, inside the hood (only the face shows through the opening) --- */
    const headF = chain(body, R(M3.rx(-0.6 * rock)));
    const eyeMat = (s) => {
      const sd = s[2] >= 0 ? 1 : -1;
      const m0 = s[0], m1 = s[1], m2 = s[2] * sd;
      if (m0 * EC[0] + m1 * EC[1] + m2 * EC[2] < 0.8) return 0;
      const dx = m0 - EC[0], dy = m1 - EC[1], dz = m2 - EC[2];
      const ex = dx * ETX[0] + dy * ETX[1] + dz * ETX[2], ey = dx * ETY[0] + dy * ETY[1] + dz * ETY[2];
      const px = 1 / (curScale * K * HEAD_R[1]); // one pixel in unit-sphere units
      const th = Math.max(0.045, 0.9 * px);
      const AX = 0.18, AY = 0.25;
      const q = (ex / AX) ** 2 + (ey / AY) ** 2;
      if (kind === 'blink') return Math.abs(ey + 0.03) < th && Math.abs(ex) < AX * 0.95 ? code(EYE, 1) : 0;
      if (kind === 'closed' || kind === 'happy') {
        const k = 1 - (ex / AX) ** 2;
        const yc = kind === 'happy' ? -0.07 + 0.15 * k : 0.05 - 0.14 * k;
        return Math.abs(ex) < AX * 0.95 && Math.abs(ey - yc) < th ? code(EYE, 1) : 0;
      }
      if (q >= 1) return 0;
      if (kind === 'angry' && ey > 0.06 - 0.8 * ex) return 0; // lid slanting down toward the middle
      // glint, bright upper part, deeper lower rim
      if (((ex + 0.05) / Math.max(0.055, 1.6 * px)) ** 2 + ((ey - 0.09) / Math.max(0.065, 1.8 * px)) ** 2 < 1) return code(EYE, 2);
      if (q > 0.55 && ey < -0.03) return code(EYE, -1);
      return code(EYE, ey > 0.03 ? 1 : 0);
    };
    const headPrim = shell(chain(headF, T(...HEAD_C)), [0, 0, 0], I3, HEAD_R, 6, 6, (s) => {
      const e = eyeMat(s);
      if (e) return e;
      // mouth: a small oval under the eyes
      if (mouth > 0.05 && s[0] > 0.6) {
        const mu = s[2] / 0.13, mv = (s[1] + 0.3) / (0.03 + 0.1 * mouth);
        if (mu * mu + mv * mv < 1) return code(MOUTH, mv > 0.35 ? -1 : 0);
      }
      return cBLACK;
    });
    prims.push(headPrim);

    /* --- hood: stacked beads following the profile, open in front for the face --- */
    const bend = 7 + 2 * rock;
    const hoodF = headF;
    const inFace = (X, Y, Z) => X > 6 && (Z / FACE_W) ** 2 + ((Y - FACE_Y) / FACE_H) ** 2 < 1;
    const beadMat = (s, X, Y, Z, prim, Q) => {
      if (Y < Y_HEM || inFace(X, Y, Z)) return 0;
      const bx = bendAt(Y, bend);
      const rx = X - bx, rl = Math.hypot(rx, Z) || 1;
      // rim just inside the face opening: a darker lip
      const lip = X > 4 && (Z / (FACE_W + 3)) ** 2 + ((Y - FACE_Y) / (FACE_H + 3)) ** 2 < 1;
      return shadeCode(prim, Q, s, rx / rl, -slopeAt(Y), Z / rl, HOOD, !lip, lip ? -1 : 0);
    };
    for (let y = Y_HEM + 1; y < Y_TOP; y += 2.6) {
      const r = rAt(y);
      if (r < 0.6) break;
      const h = Math.min(5.5, 2 + r * 0.35);
      prims.push(shell(hoodF, [bendAt(y, bend), y, 0], I3, [r, h, r], 7, 7, beadMat));
    }
    anchors.top = pt(hoodF, [bendAt(Y_TOP, bend), Y_TOP, 0]);

    /* --- hem points: thin curved shells continuing the hood, flaring out; darker lining inside --- */
    const swing = walking ? 0.1 * Math.sin(wk - 0.6) : 0;
    TEETH.forEach((a0, k) => {
      const a = a0 + (k & 1 ? -1 : 1) * 0.06 * shv;
      const ca = Math.cos(a), sn = Math.sin(a);
      const fl = TOOTH.flare + 0.12 * sa + (a0 > 0 ? swing : -swing);
      const du = [-sn, 0, ca];                           // across the tooth (around the hood)
      const dv = V3.norm([ca * fl, -1, sn * fl]);        // down the tooth, flaring out
      const dw = V3.norm(V3.cross(du, dv));              // outward
      const w = V3.dot(dw, [ca, 0, sn]) < 0 ? V3.scale(dw, -1) : dw;
      const c = [ca * TOOTH.rho, TOOTH.yc, sn * TOOTH.rho];
      const { ru, rv } = TOOTH;
      prims.push(shell(hoodF, c, [du, dv, w], [ru, rv, TOOTH.rw], 8 + k, 8 + k, (s, X, Y, Z, prim, Q) => {
        if (Y > Y_HEM + 1.5) return 0;
        if (Math.abs(s[0]) > toothHW(s[1])) return 0;
        const rl = Math.hypot(X, Z) || 1;
        const t = clamp((Y_HEM - Y) / 18, 0, 1);
        const kk = -slopeAt(Y_HEM) + (fl - -slopeAt(Y_HEM)) * t;
        if (s[2] < 0) return shadeCode(prim, Q, s, -X / rl, -kk, -Z / rl, LINING, false, 0);
        return shadeCode(prim, Q, s, X / rl, kk, Z / rl, HOOD, true, 0);
      }));
    });

    /* --- eye + mouth anchors --- */
    const headW = chain(headF, T(...HEAD_C));
    for (const sd of [1, -1]) {
      const s = [EC[0], EC[1], sd * EC[2]];
      anchors[sd > 0 ? 'eyeN' : 'eyeF'] = pt(headW, [HEAD_R[0] * s[0], HEAD_R[1] * s[1], HEAD_R[2] * s[2]]);
    }
    anchors.head = headW.t;
    anchors.mouth = pt(headW, [HEAD_R[0] * 0.95, -HEAD_R[1] * 0.3, 0]);

    return {
      prims, stamps: [], dots: [], anchors, pose: P,
      pri: { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 1, 7: 3, 8: 2, 9: 2, 10: 2, 11: 2 },
      glossy: GLOSSY, baseMat: BLACK, shadowSteps: 14,
    };
  }

  function render(model, opt) {
    curScale = opt.scale || 1;
    const lg = opt.light || { dir: [-0.5, 0.72, 0.5] };
    LD = V3.norm(lg.dir); TH = lg.th || [-0.2, 0.18, 0.74]; SPEC = lg.spec ?? 0.975; HH = V3.norm(V3.add(LD, [0, 0, 1]));
    return Creature.render(model, opt);
  }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.7, bw: 150, bh: 160, oy: 0.86 } };
})();
