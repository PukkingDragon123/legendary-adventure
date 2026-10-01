/* ------------------------------------------------------------------
   Rotom Dex — Rotom living inside a Pokédex (0.3 m). Not a wild
   species: this is the flying companion drawn by src/snap/rotom.js
   (no Dex entry, no accessories, never a photo subject).
   Model space: x = forward (the screen faces +x, so yaw ≈ π/2 shows the
   front), y = up, z = near side at yaw 0, ground at y = 0.

   Design (official art / 3D model): a salmon-red rounded body shaped like
   a squat house — narrow at the bottom, widest at two pointed upper
   corners (two little holes on each), a roof rising to a tall cone
   antenna. A white screen shows Rotom's light-blue face: big white-rimmed
   blue eyes on a dark bridge, a toothy grin and the magnifier-handle tail
   running to the lower corner. Two flat lightning-bolt arms zig-zag out
   to big flat panels with oval buttons; two stubby round feet.

   Pose params:
     float   radians  bob phase (body rises/falls a little, feet dangle)
     armN / armF      arm raise angle (radians, + = up) of the near (+z) and far arm
     armL / armR      aliases: L = screen-left from the front = near arm, R = far arm
     tilt    radians  roll in the screen plane (+ = leans to screen right)
     lean    radians  pitch (+ = top tips toward the camera / forward)
     squash  −1..1    + squashed (poke), − stretched (zip)
     mouth   0..1     open amount;  smile: 'grin'|'open'|'o'|'frown'|'wavy'|'flat'
     lid     0..1     upper eyelid closure (smooth blinks)
     eyes    'open'|'happy'|'blink'|'x'|'angry'|'dizzy'|'sad'|'wow'
     lookX / lookY −1..1  iris offset (screen right / up)
     screen  ''|'heart'|'!'|'?'|'note'|'sweat'|'zzz'|'static'  icon on the screen
     glow    0..1     antenna tip sparks (yellow)
   Spin/yaw is the renderer's.
   Anchors: top (antenna tip), head (screen centre), handN, handF, body, feet.
------------------------------------------------------------------- */
const RotomDex = (() => {
  const { chain, T, R, S, code } = Creature;
  const BODY = 1, SCREEN = 2, FACE = 3, BRIDGE = 4, EYEW = 5, IRIS = 6, IRISD = 7, INK = 8, TEETH = 9, MOUTH = 10, HOLE = 11, BTN = 12, PINK = 13, YEL = 14, FACED = 15, SCRD = 16;
  const MAT = { BODY, SCREEN, FACE, BRIDGE, EYEW, IRIS, IRISD, INK, TEETH, MOUTH, HOLE, BTN, PINK, YEL, FACED, SCRD };
  const flat = (c, od = '#1a1c2a') => ({ r: [c, c, c, c, c], od, ol: od, ln: od });
  const PAL = Creature.palette({
    [BODY]:   { r: ['#9a3a38', '#c24f49', '#e2685b', '#f28a78', '#ffbba6'], od: '#521618', ol: '#84282a', ln: '#7c2629' },
    [BTN]:    { r: ['#7c2a2a', '#9c3634', '#b8443f', '#cc564e', '#e0786c'], od: '#521618', ol: '#84282a', ln: '#6a2022' },
    [SCREEN]: { r: ['#d8e2ec', '#e8eff5', '#f4f8fb', '#fbfdfe', '#ffffff'], od: '#2a3040', ol: '#3a4254', ln: '#4a5266' },
    [SCRD]:   flat('#c9d6e4', '#2a3040'),
    [FACE]:   { r: ['#62aee0', '#74bdea', '#86caf2', '#9ad6f7', '#b6e4fb'], od: '#1a3a66', ol: '#2a5a8a', ln: '#2a5a8a' },
    [FACED]:  flat('#4f97d2', '#1a3a66'),
    [BRIDGE]: { r: ['#3a3d48', '#454854', '#515462', '#5e6170', '#6c707e'], od: '#1c1e26', ol: '#2e303a', ln: '#24262f' },
    [EYEW]:   flat('#ffffff'),
    [IRIS]:   flat('#3a86e8', '#0c1a4a'),
    [IRISD]:  flat('#2458c0', '#0c1a4a'),
    [INK]:    flat('#1a1c2a'),
    [TEETH]:  flat('#ffffff'),
    [MOUTH]:  flat('#4a1a36'),
    [HOLE]:   flat('#6a1e22', '#521618'),
    [PINK]:   flat('#ff5a94', '#7a1a3a'),
    [YEL]:    flat('#ffd83a', '#7a5a10'),
  });
  const GLOSSY = { [BODY]: 1, [BTN]: 1 };
  const C = Object.fromEntries(Object.entries(MAT).map(([k, v]) => [k, code(v)]));
  const C_BODY_L = code(BODY, 1);

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const add = V3.add, sc = V3.scale;
  const inF = (f, p) => add(f.t, M3.v(f.L, p));
  const segD = Shape2D.segDist;
  let curScale = 1;
  const px = (n) => n / Math.max(0.2, curScale);        // n screen pixels in model units
  const lw = (u) => Math.max(u, px(0.95));              // a line at least ~1px wide

  /* ---------- body silhouette (front view: w = |horizontal|, y = up, body-centre units) ---------- */
  const SIL = Shape2D.catmull([[0, -17.5], [12.5, -17.5], [16.4, -15], [17.2, -4], [18.6, 5], [23.6, 10.8], [25.4, 14.4], [22.4, 16.6], [13, 19.6], [5, 22.2], [0, 23]], false, 6);
  const SILP = SIL.concat(SIL.slice(1, -1).reverse().map(([w, y]) => [-w, y]));
  const SILG = bakeShape({ bb: [-25, -21, 25, 26], test: (u, v) => (Shape2D.inPoly(u, v, SILP) ? 1 : 0) });
  const HOLES = [[17.6, 12.4], [20.4, 11.4], [22.1, 14]];
  const BR = [12, 34, 34]; // body ellipsoid radii (x depth, y, z)
  function bodyMat(s) {
    const x = BR[0] * s[0], y = BR[1] * s[1], z = BR[2] * s[2];
    if (!SILG.test(z, y)) return 0;
    if (x > 2) { const w = Math.abs(z); for (const [hw, hy] of HOLES) if ((w - hw) ** 2 + (y - hy) ** 2 < lw(0.9) ** 2) return C.HOLE; }
    return C.BODY;
  }

  /* ---------- the screen plate: face, eyes, bridge, mouth, icons (u = screen right, v = up) ---------- */
  const SR = { u0: -12, u1: 12, v0: -14, v1: 6.8, r: 2 };
  const EYE = [[-6.4, 8.2], [6.4, 8.2]], ERX = 5.9, ERY = 7.0;
  const inRect = (u, v) => {
    if (u < SR.u0 || u > SR.u1 || v < SR.v0 || v > SR.v1) return false;
    const cx = clamp(u, SR.u0 + SR.r, SR.u1 - SR.r), cy = clamp(v, SR.v0 + SR.r, SR.v1 - SR.r);
    return (u - cx) ** 2 + (v - cy) ** 2 <= SR.r * SR.r;
  };
  const ICON = [8.3, 1.2];
  function icon(kind, u, v) {
    const x = u - ICON[0], y = v - ICON[1];
    if (kind === 'heart') { const a = x / 3.2, b = y / 3.2 - 0.25; return (a * a + b * b - 0.3) ** 3 - a * a * b * b * b < 0 ? C.PINK : 0; }
    if (kind === '!') return (Math.abs(x) < 1.1 && y > -0.8 && y < 4) || Math.hypot(x, y + 2.6) < 1.1 ? C.PINK : 0;
    if (kind === '?') { const r = Math.hypot(x, y - 2), a = Math.atan2(y - 2, x); if (Math.abs(r - 1.9) < 0.8 && (a > -1.2 || a < -2.6)) return C.FACED; if (Math.abs(x) < 0.8 && y > -1.2 && y < 0.6) return C.FACED; return Math.hypot(x, y + 2.9) < 0.9 ? C.FACED : 0; }
    if (kind === 'note') { if (Math.hypot((x + 1.2) / 1.5, (y + 2) / 1.1) < 1) return C.INK; if (Math.abs(x - 0.2) < 0.55 && y > -2 && y < 3.6) return C.INK; return y > 2.4 && y < 3.8 && x > 0 && x < 2.6 - (3.8 - y) * 0.4 ? C.INK : 0; }
    if (kind === 'sweat') { const a = x / 1.9, b = (y + 0.6) / 2.1; return (b < 0 ? a * a + b * b < 1 : Math.abs(a) < 1 - b * 0.8 && b < 1.25) ? C.FACED : 0; }
    if (kind === 'zzz') { const zz = (ox, oy, s) => { const X = x - ox, Y = y - oy; if (Math.abs(X) > s || Math.abs(Y) > s) return false; return Math.abs(Y - s) < 0.55 || Math.abs(Y + s) < 0.55 || Math.abs(Y + X) < 0.6; }; return zz(-1, -1.6, 1.6) || zz(1.6, 2.2, 1.1) ? C.FACED : 0; }
    return 0;
  }
  function screenShape(P, t) {
    const eyes = P.eyes, mo = clamp(+P.mouth || 0, 0, 1), sm = P.smile || 'grin', lx = clamp(+P.lookX || 0, -1, 1), ly = clamp(+P.lookY || 0, -1, 1);
    const scr = P.screen || '';
    return {
      bb: [-14, -15.5, 14, 16.5],
      test(u, v) {
        const L = lw(0.7);
        // eyes (over everything): tall white ovals tilted outward, set into the dark visor band
        for (let k = 0; k < 2; k++) {
          const [ex, ey] = EYE[k], side = k ? 1 : -1;
          const rdx = u - ex, rdy = v - ey, ca = Math.cos(0.22 * side), sa = Math.sin(0.22 * side);
          const dx = rdx * ca - rdy * sa, dy = rdx * sa + rdy * ca;          // eye-local (tilt: tops lean outward)
          const d = Math.hypot(dx / ERX, dy / ERY);
          if (d > 1 + L / ERX + 0.03) continue;
          if (d > 1) return d > 1 + L / ERX ? C.BRIDGE : C.INK;              // dark rim (part of the visor)
          if (d > 1 - L / ERX) return C.INK;
          if (eyes === 'happy') {
            // ^ smiling arcs: lower lid pushed up, shown as a dark visor below a white arch
            const c = -1.2 + (1 - (dx / ERX) ** 2) * 3.4;
            if (dy < c - L) return C.SCRD; if (dy < c) return C.INK;
            return C.EYEW;
          }
          if (eyes === 'x') { const ax = Math.abs(dx), ay = Math.abs(dy); return Math.abs(ax - ay) < lw(0.85) && ax < 3 ? C.INK : C.EYEW; }
          if (eyes === 'dizzy') { const a = Math.atan2(dy, dx * side) + Math.PI, r = d * 7.2; const ph = ((r - a * 1.1) / (2 * Math.PI)) % 1; return r < 6.5 && Math.abs(ph - 0.5) < 0.2 ? C.INK : C.EYEW; }
          // upper lid (blink / sleepy / angry / sad): the visor colour coming down over the eye
          let lid = eyes === 'blink' ? 1 : clamp(+P.lid || 0, 0, 1);
          if (lid > 0.9) { const c = -0.6 - (1 - (dx / ERX) ** 2) * 1.6; return Math.abs(dy - c) < lw(0.8) ? C.INK : C.SCRD; }
          let lidY = ERY - lid * ERY * 1.85;
          if (eyes === 'angry') lidY = Math.min(lidY, 1.6 + dx * side * 0.75);
          if (eyes === 'sad') lidY = Math.min(lidY, 2.6 - dx * side * 0.5);
          if (dy > lidY) return C.SCRD;
          if (dy > lidY - L) return C.INK;
          // iris + pupil + glint (gaze offset kept inside the white)
          const wow = eyes === 'wow', irx = wow ? 2.2 : 2.9, iry = wow ? 2.6 : 3.5;
          const ix = lx * (ERX - irx - 0.6), iy = ly * (ERY - iry - 0.6) - (eyes === 'sad' ? 1 : 0);
          const id = Math.hypot((dx - ix) / irx, (dy - iy) / iry);
          if (id <= 1) {
            const gx = dx - ix + irx * 0.34, gy = dy - iy - iry * 0.4;
            if (Math.hypot(gx, gy) < Math.max(irx * 0.34, px(0.8))) return C.EYEW;
            if (id < (wow ? 0.38 : 0.48)) return C.INK;
            return id > 0.78 ? C.IRISD : C.IRIS;
          }
          return C.EYEW;
        }
        // the dark visor band joining the eyes, across the top of the screen
        const inScr = inRect(u, v);
        if (Math.abs(u) < 4 && v > EYE[0][1] - 1.5 && v < EYE[0][1] + 3.2) return C.BRIDGE;
        if (!inScr) return 0;
        // screen edge: a thin darker bezel
        if (!inRect(u + (u > 0 ? 1 : -1) * L, v) || !inRect(u, v + (v > 0 ? 1 : -1) * L)) return C.SCRD;
        if (scr === 'static' && (Math.floor(v * 1.3 + Math.sin(u * 7.1) * 0.7) & 1)) return (Math.floor(u * 3.7 + v * 5.3) & 3) ? C.SCRD : C.SCREEN;
        // mouth (on the face)
        const mx = -1.2, my = 1.4;
        {
          const X = u - mx, Y = v - my;
          if (sm === 'o' || (sm === 'open' && mo > 0.2)) {
            const rw = sm === 'o' ? 1.8 + mo : 3 + mo * 1.2, rh = sm === 'o' ? 2 + mo * 1.2 : 1.6 + mo * 2.4;
            const e = Math.hypot(X / rw, (Y + rh * 0.4) / rh);
            if (e < 1) return e > 1 - L / rh ? C.INK : Y + rh * 0.4 < -rh * 0.5 ? C.PINK : C.MOUTH;
          } else if (sm === 'frown' || sm === 'wavy' || sm === 'flat') {
            const W = 3.4; if (Math.abs(X) < W) { const c = sm === 'frown' ? -1.4 + (1 - (X / W) ** 2) * 1.4 : sm === 'wavy' ? Math.sin(X * 2.1) * 0.6 - 0.6 : -0.6; if (Math.abs(Y - c) < lw(0.55)) return C.INK; }
          } else {
            // the grin: flat top, round bottom, a row of teeth
            const W = 5.2 + mo * 0.4, Hh = 3 + mo * 2.2, kx = X / W;
            if (Math.abs(kx) <= 1) {
              const top = 0.7 + kx * kx * 0.5, bot = top - Hh * Math.sqrt(Math.max(0, 1 - kx * kx));
              if (Y <= top && Y >= bot) {
                if (Y > top - L || Y < bot + L || Math.abs(kx) > 1 - L / W) return C.INK;
                if (mo > 0.25 && Y < top - 1.6) return Y < bot + 1.3 ? C.PINK : C.MOUTH;
                return Math.abs(((X + 20) % 1.9) - 0.95) < lw(0.3) * 0.5 && curScale > 1.2 ? C.SCRD : C.TEETH;
              }
            }
          }
        }
        // Rotom's light-blue face with its magnifier-handle tail running to the lower right corner
        const fr = Math.hypot((u + 1.4) / 9.6, (v - 1.6) / 9.2);
        const tail = segD(u, v, 3.5, -5.5, 12.6, -14) < 2.4;
        if (fr < 1 || tail) {
          if (scr && scr !== 'static') { const ic = icon(scr, u, v); if (ic) return ic; }
          return (fr > 1 - lw(0.5) / 9 && !tail) || (tail && fr >= 1 && segD(u, v, 3.5, -5.5, 12.6, -14) > 2.4 - lw(0.5)) ? C.FACED : C.FACE;
        }
        if (scr && scr !== 'static') { const ic = icon(scr, u, v); if (ic) return ic; }
        return C.SCREEN;
      },
    };
  }

  /* ---------- arms: flat lightning bolts ending in big panels (u = outward, v = up, from the shoulder) ---------- */
  const BOLT = [[-2, 0], [8, 0.8], [5.4, 6.8], [13.5, 7.6]];
  // a rounded parallelogram: corners chamfered then smoothed a little
  const roundPoly = (pts, r) => { const o = []; const n = pts.length; for (let i = 0; i < n; i++) { const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]; const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]); o.push([p[0] + (a[0] - p[0]) * r / da, p[1] + (a[1] - p[1]) * r / da], [p[0] + (b[0] - p[0]) * r / db, p[1] + (b[1] - p[1]) * r / db]); } return Shape2D.catmull(o, true, 3); };
  const PANEL = roundPoly([[12.5, 11], [32, 8.2], [30.4, -8.6], [11.2, -5.6]], 2.6);
  const BTN_C = [21.4, 1.2], BTN_R = [5.2, 3.1];
  const BOLTG = bakeShape({ bb: [-4, -3, 16, 10], test: (u, v) => { for (let i = 0; i < 3; i++) if (segD(u, v, ...BOLT[i], ...BOLT[i + 1]) < 1.9) return C.BODY; return 0; } });
  const PANELG = bakeShape({ bb: [9, -11, 34, 13], test: (u, v) => {
    if (!Shape2D.inPoly(u, v, PANEL)) return 0;
    return Shape2D.polyDist ? (Shape2D.polyDist(u, v, PANEL) < 1.1 && v > 0 ? C_BODY_L : C.BODY) : C.BODY;
  } });

  const DEFAULT = { float: 0, armN: 0, armF: 0, tilt: 0, lean: 0, squash: 0, mouth: 0, smile: 'grin', eyes: 'open', lookX: 0, lookY: 0, lid: 0, screen: '', glow: 0 };
  // 1 body + antenna, 2 screen, 3/4 arm bolts, 5/6 panels, 7/8 buttons, 9/10 feet, 11 sparks
  const PRI = { 1: 1, 2: 3, 3: 2, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3, 9: 0, 10: 0, 11: 4 };

  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    if (pose && pose.armL !== undefined) P.armN = pose.armL;
    if (pose && pose.armR !== undefined) P.armF = pose.armR;
    const prims = [], anchors = {};
    const fl = +P.float || 0, bob = Math.sin(fl) * 1.6, sq = clamp(+P.squash || 0, -1, 1);
    const root = chain(T(0, 24 + bob, 0), R(M3.rx(+P.tilt || 0)), R(M3.rz(-(+P.lean || 0))), S(1 + sq * 0.14, 1 - sq * 0.2, 1 + sq * 0.14));
    const put = (q) => { q.c = inF(root, q.c); q.L = M3.mul(root.L, q.L); prims.push(q); return q; };
    const E = (c, r, part, mat) => put({ kind: 'ell', part, grp: part, c, L: M3.diag(r[0], r[1], r[2]), mat });
    // front frame: a = screen right (−z), v = up, n = out of the screen (+x)
    const A = [0, 0, -1], V = [0, 1, 0], N = [1, 0, 0];

    /* body + antenna (one group: seamless) */
    E([0, 0, 0], BR, 1, bodyMat);
    const AN = 26;
    for (let i = 0; i < AN; i++) {
      const t = i / (AN - 1), y = 19 + t * 33 - (1 - t) * 3, r = 6.4 * (1 - t) ** 0.9 + 1.1;
      const spark = P.glow > 0.3 && t > 0.8;
      E([-0.4 * t, y, 0], [r * 0.85, 8 * (1 - t) + 1.6, r], 1, spark ? () => C.YEL : () => C.BODY);
    }
    anchors.top = inF(root, [0, 53.5, 0]);
    anchors.body = inF(root, [0, 0, 0]);

    /* screen */
    put({ kind: 'plate', part: 2, grp: 2, c: [12.5, -1.5, 0], L: M3.cols(A, V, N), shape: screenShape(P), thick: 1.2 });
    anchors.head = inF(root, [12.6, 0, 0]);

    /* arms */
    for (const sd of [1, -1]) {
      const near = sd > 0, th = +(near ? P.armN : P.armF) || 0;
      const out = [0, 0, sd], ct = Math.cos(th), st = Math.sin(th);
      const U = add(sc(out, ct), sc(V, st)), Vv = add(sc(out, -st), sc(V, ct));
      // mirrored so that +v stays up: u runs outward on both sides
      const sh = [0.5, -4.5, sd * 16.4];
      const Lb = M3.cols(U, Vv, N);
      put({ kind: 'plate', part: near ? 3 : 4, grp: near ? 3 : 4, c: sh, L: Lb, shape: BOLTG, thick: 3 });
      // panel: slightly turned toward the camera
      const Np = V3.norm(add(N, sc(U, -0.22))), Up = V3.norm(V3.sub(U, sc(Np, V3.dot(U, Np))));
      const Lp = M3.cols(Up, Vv, Np);
      put({ kind: 'plate', part: near ? 5 : 6, grp: near ? 5 : 6, c: sh, L: Lp, shape: PANELG, thick: 3 });
      const bc = add(add(sh, add(sc(Up, BTN_C[0]), sc(Vv, BTN_C[1]))), sc(Np, 0.9));
      put({ kind: 'ell', part: near ? 7 : 8, grp: near ? 7 : 8, c: bc, L: M3.cols(sc(Up, BTN_R[0]), sc(Vv, BTN_R[1]), sc(Np, 1.5)), mat: (s) => (s[1] > 0.35 ? code(BTN, 1) : C.BTN) });
      anchors[near ? 'handN' : 'handF'] = inF(root, add(sh, add(sc(Up, 20), sc(Vv, 0))));
    }

    /* stubby feet (dangle a little with the bob) */
    for (const sd of [1, -1]) {
      const sw = Math.sin(fl + (sd > 0 ? 0.6 : 0)) * 0.8;
      E([1.2, -19.4 - bob * 0.4 + sw, sd * 7.4], [5.6, 4.6, 5], sd > 0 ? 9 : 10, () => C.BODY);
    }
    anchors.feet = inF(root, [1, -24, 0]);
    return { prims, stamps: [], dots: [], anchors, pose: P, pri: PRI, glossy: GLOSSY, baseMat: BODY, shadowSteps: 12 };
  }

  function render(model, opt) { curScale = opt.scale || 1; return Creature.render(model, opt); }

  return { build, render, PAL, MAT, DEFAULT, meta: { heightM: 0.3, bw: 132, bh: 104, oy: 0.95 } };
})();
