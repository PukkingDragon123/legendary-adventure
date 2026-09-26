/* ------------------------------------------------------------------
   Wailord — the Float Whale Pokémon. A posable 3D model rendered
   straight to pixel art by the shared Creature renderer.
   Model space: x = forward, y = up, z = near side at yaw 0, ground
   (bottom of the belly) at y = 0. 175 units = 1 m, ~2540 long.
------------------------------------------------------------------- */
const Wailord = (() => {
  const { ell, plate, chain, T, R, F, sph, code } = Creature;

  // material ids
  const BODY = 1, BELLY = 2, FIN = 3, MOUTH = 4, TONGUE = 5;
  const MAT = { BODY, BELLY, FIN, MOUTH, TONGUE };

  const PAL = Creature.palette({
    [BODY]:   { r: ['#1d4f93', '#2b6cb6', '#3f8fd8', '#6bb4ee', '#c4e6ff'], od: '#0f2a5c', ol: '#1d4a8c', ln: '#1c4788' },
    [FIN]:    { r: ['#1d4f93', '#2b6cb6', '#3f8fd8', '#6bb4ee', '#c4e6ff'], od: '#0f2a5c', ol: '#1d4a8c', ln: '#1f4f92' },
    [BELLY]:  { r: ['#8f8b8e', '#b3afb0', '#d6d3d1', '#ebe9e7', '#f9f8f6'], od: '#45404a', ol: '#6f6a70', ln: '#7b767b' },
    [MOUTH]:  { r: ['#3e0c1a', '#5c1426', '#7e2234', '#9c3446', '#b84c5a'], od: '#2a0610', ol: '#420c1a', ln: '#420c1a' },
    [TONGUE]: { r: ['#a43c52', '#c45468', '#de7282', '#ee94a0', '#f8b8c0'], od: '#5c1426', ol: '#7e2234', ln: '#8c2c40' },
  });
  const GLOSSY = { [BODY]: 1 };

  const DEFAULT = { tail: 0, fin: 0, mouth: 0, eyes: 'open', blow: 0, roll: 0, side: 1 };

  /* ---------- helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const MIRZ = M3.diag(1, 1, -1);
  const mirror = (f) => F(M3.mul(MIRZ, f.L), M3.v(MIRZ, f.t));
  const P2W = (f, p) => V3.add(f.t, M3.v(f.L, p));

  /* ---------- body layout (model units) ---------- */
  const MAIN = { c: [140, 690, 0], r: [1110, 690, 590], a: 0.22 };
  const REAR = { c: [-640, 560, 0], r: [650, 470, 440], a: 0.1 };
  const STOCK = { c: [-1070, 520, 0], r: [330, 180, 160], a: 0.08 };
  // belly boundary: a plane through the rear axis point AX, rising toward the front with slope BS
  const AX = [-1120, 430], BS = 0.19;
  const bellyAt = (x, y) => y < AX[1] + (x - AX[0]) * BS;
  // grooves: planes through the same axis with smaller slopes (they converge at the rear, like the ref)
  const GROOVE_S = [0.148, 0.108, 0.07, 0.034, 0.0, -0.034];

  // intersection of a vertical-extruded plane y = AX1 + (x - AX0)*s with an ellipsoid (rotation about z only),
  // returned as closed loops in the ellipsoid's unit-sphere coordinates
  function grooveLoop(E, s, n = 96) {
    const ca = Math.cos(E.a), sa = Math.sin(E.a);
    // point on plane: p(t) = [AX0 + t, AX1 + t*s, z]; local q = Rz(-a) (p - c) / r
    const px = AX[0] - E.c[0], py = AX[1] - E.c[1];
    // q.x = ( ca*(px+t) + sa*(py+t*s) ) / rx ; q.y = ( -sa*(px+t) + ca*(py+t*s) ) / ry
    const ax = (ca + sa * s) / E.r[0], bx = (ca * px + sa * py) / E.r[0];
    const ay = (-sa + ca * s) / E.r[1], by = (-sa * px + ca * py) / E.r[1];
    // qx^2 + qy^2 = A t^2 + 2 B t + C ; need <= 1 - (z/rz)^2
    const A = ax * ax + ay * ay, B = ax * bx + ay * by, C = bx * bx + by * by;
    const disc = B * B - A * (C - 1);
    if (disc <= 0) return null;
    const tc = -B / A, tr = Math.sqrt(disc) / A;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI * 2;
      const t = tc + tr * Math.cos(th);
      const rem = Math.max(0, 1 - (A * t * t + 2 * B * t + C));
      const qz = Math.sqrt(rem) * Math.sin(th) >= 0 ? Math.sqrt(rem) : -Math.sqrt(rem);
      const qzz = Math.sin(th) >= 0 ? Math.sqrt(rem) : -Math.sqrt(rem);
      pts.push([ax * t + bx, ay * t + by, qzz, t + AX[0]]);
    }
    return pts;
  }

  /* ---------- fins and flukes (plates) ---------- */
  const DORSAL = bakeShape(Shape2D.poly([[-110, -20], [-60, 20], [20, 60], [120, 92], [190, 96], [150, 60], [70, 18], [10, -20]], code(FIN)), 2);
  const DORSAL_LINES = [
    { pts: [[-40, 0, 0], [40, 36, 0], [150, 80, 0]], mat: FIN, useLn: true },
    { pts: [[-10, -8, 0], [60, 20, 0], [140, 58, 0]], mat: FIN, useLn: true },
  ];
  const PECT = bakeShape(Shape2D.poly([[-20, -30], [40, -40], [150, -70], [250, -110], [230, -60], [140, -10], [40, 25], [-20, 30]], code(FIN)), 2);
  const FLUKE_UP = bakeShape(Shape2D.poly([[-40, -60], [60, -20], [200, 60], [330, 130], [250, 40], [150, -40], [60, -110]], code(FIN)), 2);
  const FLUKE_LO = bakeShape(Shape2D.poly([[-30, 40], [60, 10], [160, -50], [240, -110], [150, -10], [70, 70]], code(BELLY)), 2);

  let curScale = 1;

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const bl = clamp(P.blow, 0, 1), mo = clamp(P.mouth, 0, 1);
    const prims = [];
    // squash before spouting, anchored at the belly; roll about the long axis
    const root = chain(F(M3.diag(1 + 0.05 * bl, 1 - 0.1 * bl, 1 + 0.05 * bl), [0, 0, 0]), T(0, 600, 0), R(M3.rx(P.roll || 0)), T(0, -600, 0));
    const mouthA = mo * 0.14;
    const bodyMat = (E) => {
      const ca = Math.cos(E.a), sa = Math.sin(E.a);
      return (s) => {
        const lx = s[0] * E.r[0], ly = s[1] * E.r[1];
        const x = E.c[0] + ca * lx - sa * ly, y = E.c[1] + sa * lx + ca * ly;
        const yb = AX[1] + (x - AX[0]) * BS;
        if (y < yb) {
          // open mouth: a dark wedge below the jaw line at the front
          if (mo > 0.02 && x > 560) {
            const k = (x - 560) / 700;
            if (y > yb - mouthA * 900 * k * Math.min(1, k * 3)) return code(y < yb - mouthA * 600 * k ? TONGUE : MOUTH);
          }
          return code(BELLY);
        }
        // blowhole on top of the head
        const bx = (x - 380) / 60, bz = (s[2] * E.r[2]) / 34;
        if (y > 1200 && bx * bx + bz * bz < 1) return code(BODY, -2);
        return code(BODY);
      };
    };
    const mk = (E) => chain(root, T(...E.c), R(M3.rz(E.a)));
    const mainF = mk(MAIN), rearF = mk(REAR), stockF = mk(STOCK);
    const mainP = ell(mainF, MAIN.r, { part: 1, grp: 1, mat: bodyMat(MAIN) });
    const rearP = ell(rearF, REAR.r, { part: 1, grp: 1, mat: bodyMat(REAR) });
    const stockP = ell(stockF, STOCK.r, { part: 1, grp: 1, mat: bodyMat(STOCK) });
    prims.push(mainP, rearP, stockP);
    mainP.grooves = GROOVES.main; rearP.grooves = GROOVES.rear; stockP.grooves = GROOVES.stock;

    // dorsal fins (two, in a row on the back)
    for (const d of [{ x: -260, s: 1 }, { x: -720, s: 0.8 }]) {
      const top = topAt(d.x);
      const f = chain(root, T(d.x, top - 40, 0), R(M3.rz(-0.05)), F(M3.diag(d.s, d.s, 1), [0, 0, 0]));
      prims.push(plate(f, DORSAL, { part: 2, grp: 2, thick: 14, lines: DORSAL_LINES }));
    }
    // pectoral fins (flap with P.fin); cheated toward the camera by P.side
    for (const k of [1, -1]) {
      let f = chain(T(560, 520, 470), R(M3.rx(-(0.5 + 0.45 * P.fin))), R(M3.ry(-0.35)));
      if (k < 0) f = mirror(f);
      prims.push(plate(chain(root, f), PECT, { part: k > 0 ? 3 : 4, grp: k > 0 ? 3 : 4, thick: 14 }));
    }
    // tail flukes (upper blue, lower grey), swinging up/down with P.tail
    const tailF = chain(root, T(-1300, 520, 0), R(M3.rz(0.32 * P.tail)));
    prims.push(plate(chain(tailF, R(M3.rz(0.0))), FLUKE_UP, { part: 5, grp: 5, thick: 16 }, [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]));
    prims.push(plate(tailF, FLUKE_LO, { part: 5, grp: 5, thick: 16 }, [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]));

    // eye (stamp on the main body)
    const eyeS = EYE_S;
    const eyeAt = { p: P2W(mainF, M3.v(M3.diag(...MAIN.r), eyeS)), s: eyeS, prim: mainP };
    const anchors = {
      blowhole: P2W(mainF, M3.v(M3.diag(...MAIN.r), BLOW_S)),
      mouth: P2W(root, [1230, AX[1] + (1230 - AX[0]) * BS, 0]),
      eye: eyeAt.p,
      tail: P2W(tailF, [-260, 60, 0]),
      top: P2W(mainF, M3.v(M3.diag(...MAIN.r), TOP_S)),
      body: mainF.t,
    };
    return {
      prims, anchors, pose: P, dots: [],
      stamps: [{ at: eyeAt, set: EYES[0], colors: EYEC, kind: P.eyes, minFacing: 0.15 }],
      pri: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1 },
      glossy: GLOSSY, baseMat: BODY, shadowSteps: 12, shadowDepth: 26,
    };
  }

  // body top height at x (for placing the dorsal fins)
  function topAt(x) {
    let best = 0;
    for (const E of [MAIN, REAR]) {
      const ca = Math.cos(E.a), sa = Math.sin(E.a);
      for (let i = 0; i <= 200; i++) {
        const th = (i / 200) * Math.PI;
        const lx = Math.cos(th) * E.r[0], ly = Math.sin(th) * E.r[1];
        const X = E.c[0] + ca * lx - sa * ly, Y = E.c[1] + sa * lx + ca * ly;
        if (Math.abs(X - x) < 12) best = Math.max(best, Y);
      }
    }
    return best;
  }
  // unit-sphere direction on MAIN for a model-space surface point near (x, y) on the near side
  function mainDir(x, y, zSign = 1) {
    const ca = Math.cos(MAIN.a), sa = Math.sin(MAIN.a);
    const dx = x - MAIN.c[0], dy = y - MAIN.c[1];
    const qx = (ca * dx + sa * dy) / MAIN.r[0], qy = (-sa * dx + ca * dy) / MAIN.r[1];
    const qz = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy)) * zSign;
    return V3.norm([qx, qy, qz]);
  }
  const EYE_S = mainDir(760, 870);
  const BLOW_S = mainDir(380, 1350);
  const TOP_S = [0, 1, 0];

  /* ---------- grooves: loops per ellipsoid, clipped to the belly, to where that ellipsoid is outermost,
     and ending before the convergence point ---------- */
  const inside = (E, x, y, z) => {
    const ca = Math.cos(E.a), sa = Math.sin(E.a), dx = x - E.c[0], dy = y - E.c[1];
    const qx = (ca * dx + sa * dy) / E.r[0], qy = (-sa * dx + ca * dy) / E.r[1], qz = z / E.r[2];
    return qx * qx + qy * qy + qz * qz < 0.995;
  };
  const GROOVES = { main: [], rear: [], stock: [] };
  for (const [key, E, others] of [['main', MAIN, [REAR, STOCK]], ['rear', REAR, [MAIN, STOCK]], ['stock', STOCK, [MAIN, REAR]]]) {
    GROOVE_S.forEach((s, gi) => {
      const loop = grooveLoop(E, s);
      if (!loop) return;
      const ca = Math.cos(E.a), sa = Math.sin(E.a);
      let cur = [];
      const flush = () => { if (cur.length > 1) GROOVES[key].push(cur); cur = []; };
      for (const q of loop) {
        const lx = q[0] * E.r[0], ly = q[1] * E.r[1];
        const x = E.c[0] + ca * lx - sa * ly, y = E.c[1] + sa * lx + ca * ly, z = q[2] * E.r[2];
        const ok = x > AX[0] + 260 + gi * 60 && !others.some((O) => inside(O, x, y, z));
        if (ok) cur.push([q[0], q[1], q[2]]); else flush();
      }
      flush();
    });
  }

  /* ---------- eyes: pixel stamps sized for the render scale ---------- */
  const EYEC = { k: '#0c1220', w: '#ffffff', b: '#26406e' };
  const EYES = [
    { open: ['kk', 'kk'], happy: ['.k.', 'k.k'], closed: ['kk'] },                                   // tiny (far away)
    { open: ['.k.', 'kwk', 'kkk', '.k.'], happy: ['.k.', 'k.k'], closed: ['k.k', '.k.'] },            // small
    { open: ['.kk.', 'kwkk', 'kkkk', 'kkbk', '.kk.'], happy: ['.kk.', 'k..k'], closed: ['k..k', '.kk.'] },
    { open: ['..kk..', '.kwwk.', 'kwwkkk', 'kkkkkk', 'kkkkbk', '.kkbk.', '..kk..'], happy: ['..kk..', '.k..k.', 'k....k'], closed: ['k....k', '.kkkk.'] },
  ];

  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82 } = opt;
    curScale = scale;
    const set = scale < 0.16 ? EYES[0] : scale < 0.3 ? EYES[1] : scale < 0.6 ? EYES[2] : EYES[3];
    for (const st of model.stamps) st.set = set;
    // grooves: keep only the parts of each loop facing the camera
    const M = M3.mul(M3.rx(pitch), M3.ry(-yaw));
    const cam = [M[6], M[7], M[8]];
    for (const p of model.prims) {
      if (!p.grooves) continue;
      const Li = M3.inv(p.L);
      const lines = [];
      for (const g of p.grooves) {
        let cur = [];
        for (const q of g) {
          const n = [Li[0] * q[0] + Li[3] * q[1] + Li[6] * q[2], Li[1] * q[0] + Li[4] * q[1] + Li[7] * q[2], Li[2] * q[0] + Li[5] * q[1] + Li[8] * q[2]];
          const f = (n[0] * cam[0] + n[1] * cam[1] + n[2] * cam[2]) / Math.hypot(n[0], n[1], n[2]);
          if (f > 0.08) cur.push(q); else { if (cur.length > 1) lines.push({ pts: cur, mat: BELLY, useLn: true }); cur = []; }
        }
        if (cur.length > 1) lines.push({ pts: cur, mat: BELLY, useLn: true });
      }
      p.lines = lines;
    }
    // ray-cast only the creature's screen box, then paste into the full buffer
    const V = M3.mul(M, M3.diag(scale, scale, scale));
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
    if (bx1 - bx0 < 4 || by1 - by0 < 4 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > 0.8 * W * H) return Creature.render(model, opt);
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    const r = Creature.render(model, Object.assign({}, opt, { W: w, H: h, ox: ox - bx0, oy: oy - by0 }));
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

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 14.5, bw: 2800, bh: 1800, oy: 0.88 } };
})();
