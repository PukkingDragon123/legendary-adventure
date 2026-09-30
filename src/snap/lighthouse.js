/* ------------------------------------------------------------------
   Lighthouse — the great red-and-white tower on Coral Cove's islet.
   Walk up to the door and press E (or tap it) to go inside:
    · Entrance hall: the keeper (a Wobbuffet in a sailor cap), oil
      barrels, crates, the log lectern.
    · A spiral staircase you really climb (sloped platforms; hop onto
      each flight), windows looking out to sea.
    · Keeper's room: bed, stove, desk and shelves of old logbooks.
    · Lamp room: the giant Fresnel lens. Relight it! Then step out onto
      the gallery for a panoramic sweep over the whole cove.
   Quest "Beacon Keeper": the storm scattered three logbook pages around
   the tower and blew out the lamp. Find the pages, relight the lamp,
   report back. Reward: the Beacon Keeper banner, pearls and points.
------------------------------------------------------------------- */
const Lighthouse = (() => {
  const { clamp, lerp, hash, hex, mix } = U;
  const pickR = (ramp, t, x, y) => { const n = ramp.length, v = clamp(t, 0, 0.999) * n; return ramp[clamp(Math.floor(v) + ((v % 1) > U.bayer4(x, y) ? 1 : 0), 0, n - 1)]; };
  const S = { near: null, fade: null, pans: [], lit: false, keeper: null, told: false };
  const B = Areas.beach;
  const DX = 3998; // door x on the islet

  /* ================= interior geometry ================= */
  const W = 640, H = 1080, G0 = 1000;
  // a flight: flat x0..xa at ya, slope to (xb, yb), flat to x1
  function flight(x0, xa, ya, xb, yb, x1, kind = 'stair') {
    const lo = Math.min(xa, xb), hi = Math.max(xa, xb), yl = xa < xb ? ya : yb, yh = xa < xb ? yb : ya;
    return { x0, x1, y: Math.min(ya, yb), kind, fy: (x) => (x <= lo ? yl : x >= hi ? yh : lerp(yl, yh, (x - lo) / (hi - lo))) };
  }
  const floor = (x0, x1, y) => ({ x0, x1, y, kind: 'floor' });
  const PL = {
    f1: flight(150, 190, 974, 540, 880, W),
    f2: flight(0, 110, 760, 520, 854, 596),
    fl1: floor(44, W, 734),
    f3: flight(80, 130, 708, 560, 610, W),
    f4: flight(0, 110, 490, 530, 584, 596),
    fl2: floor(44, W, 464),
  };
  const PAGES = [{ id: 'lh.page1', x: 566, y: G0 }, { id: 'lh.page2', x: 40, y: 760 }, { id: 'lh.page3', x: 604, y: 610 }];
  const LENS = 330, GDOOR = 606, EXIT = 44;

  const def = {
    id: 'lighthouse', name: 'Coral Cove Lighthouse', sub: 'The Keeper\'s Tower', music: 'crossing', seed: 41, noSeason: true, cave: true, noSky: true,
    W, H, sea: null, refY: G0, h0: 110, cy0: 700, ph: 0, band: 10, waves: 0,
    camY: [210, 1072], frameY: 0.68, start: 70,
    intro: { x: 330, y: 560, dur: 2.8 },
    ground: [[0, G0], [W, G0]], water: [],
    plats: Object.values(PL),
    mats: {
      ink: ['#0e0c16', '#1a1624'],
      stone: ['#2c2834', '#3e3846', '#544c58', '#6c626a', '#877a7e', '#a49492'],
      plaster: ['#7a6c60', '#978674', '#b4a08a', '#cdb99e', '#e2d2b4'],
      wood: ['#2a180e', '#442a18', '#643e22', '#865a30', '#aa7842', '#cc9a5c'],
      iron: ['#161a26', '#2c3242', '#4a5268', '#727c96', '#a8b2c8'],
      brass: ['#6a4c14', '#a07824', '#d4a83e', '#f8e08a'],
      sky: ['#4a7ec0', '#6aa0dc', '#92c2ee', '#c2e0f8'],
      sea: ['#173e70', '#24589a', '#3a78ba', '#8ac0e8'],
      redT: ['#5a1018', '#8a2230', '#b8363e', '#e0605e'],
      glass: ['#4a6e84', '#6e98ac', '#a0c8d8', '#d4eef6'],
      lamp: { c: ['#ffb040', '#ffd878', '#fff2b8', '#ffffff'], emit: true },
      warm: { c: ['#e8702a', '#ffb04a', '#ffe08a'], emit: true },
      paper: ['#a8946a', '#d0bc8e', '#f2e6c2'],
      bookR: ['#4a1418', '#7a2a2a', '#a8463a'], bookB: ['#1a2e4a', '#2c4a72', '#4a6e9a'], bookG: ['#1e3a22', '#325a30', '#50804a'],
      rug: ['#4a1628', '#7a2436', '#a8423e', '#d89a56'],
      cloth: ['#243462', '#34509a', '#5a7cc8', '#9ab4ea'],
      rope: ['#6a4c2a', '#9c7a48', '#ccae78'],
      moss: ['#2a4a2c', '#3e6a38'],
    },
  };
  def.weather = () => ({ rain: 0, fog: 0 });
  def.ambient = () => [{ kind: 'mote', rate: 1.4, c: hex('#ffe8c0'), life: 7, sway: 6, bob: 3, vy: -2 }];

  /* ================= interior painting ================= */
  function interior(M) {
    const s = new ISpr(W, H);
    const cyl = (x) => 0.32 + 0.4 * Math.cos(((x - 320) / 320) * 1.25);
    // back wall
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v;
      if (y >= G0) { const fx = (x + (Math.floor((y - G0) / 10) % 2) * 14) % 28, fy = (y - G0) % 10; v = fx === 0 || fy === 0 ? M.stone[0] : pickR(M.stone, 0.5 - (y - G0) / 160 + hash(Math.floor((x + (Math.floor((y - G0) / 10) % 2) * 14) / 28), Math.floor((y - G0) / 10), 3) * 0.25, x, y); }
      else if (x < 14 || x > 626) v = pickR(M.stone, 0.12 + (x < 14 ? x / 60 : (640 - x) / 60), x, y);
      else if (y < 250) v = pickR(M.iron, 0.14 + (y > 236 ? 0.1 : 0), x, y);
      else if (y < 318) {
        // the lantern dome: red iron plates with radial ribs
        const a = Math.atan2(y - 330, x - 320), rib = Math.abs(((a * 9) % 1 + 1) % 1 - 0.5) < 0.04;
        v = rib ? M.iron[1] : pickR(M.redT, cyl(x) + (y - 250) / 200 - 0.1, x, y);
      } else if (y < 448) v = M.iron[1]; // behind the lantern glazing (panes painted below)
      else if (y < 478) v = pickR(M.iron, 0.3 + cyl(x) * 0.4, x, y);
      else if (y > 612 && y < 734) {
        // keeper's room: plaster above a wooden wainscot
        if (y > 700) v = (x % 18 === 0 || y === 701) ? M.wood[1] : pickR(M.wood, cyl(x) + 0.1, x, y);
        else v = pickR(M.plaster, cyl(x) + 0.15 + (hash(x >> 2, y >> 2, 7) - 0.5) * 0.12, x, y);
      } else {
        const row = Math.floor(y / 8), off = (row % 2) * 9, bx = Math.floor((x + off) / 18);
        const mortar = y % 8 === 0 || (x + off) % 18 === 0;
        v = mortar ? M.stone[1] : pickR(M.stone, cyl(x) + (hash(bx, row, 5) - 0.5) * 0.3 + (y > 900 ? -0.06 : 0), x, y);
      }
      s.d[y * W + x] = v;
    }
    const R = (x, y, w, h, c) => s.rect(x, y, w, h, c);
    // lantern glazing: panes of sky and sea between iron mullions
    for (let y = 322; y < 446; y++) for (let x = 20; x < 620; x++) {
      const m = (x - 20) % 50, bar = m < 3 || y === 384 || y === 385;
      if (bar) { s.set(x, y, m === 1 ? M.iron[3] : M.iron[1]); continue; }
      const hz = 404 + Math.round(Math.sin(x * 0.01) * 2);
      s.set(x, y, y < hz ? pickR(M.sky, 0.95 - (y - 322) / 100, x, y) : pickR(M.sea, 0.7 - (y - hz) / 60 + (hash(x >> 1, y, 9) > 0.93 ? 0.4 : 0), x, y));
    }
    for (let x = 20; x < 620; x++) { s.set(x, 321, M.iron[0]); s.set(x, 446, M.iron[0]); s.set(x, 447, M.iron[3]); }
    // arched windows down the tower
    function win(cx, top, w, h) {
      const hw = w / 2;
      for (let y = top - 4; y < top + h + 4; y++) for (let x = cx - hw - 4; x <= cx + hw + 4; x++) {
        const dy = y - (top + hw), ax = x - cx, inArch = (r) => (y >= top + hw ? Math.abs(ax) <= r : ax * ax + dy * dy <= r * r) && y < top + h + (r - hw);
        if (inArch(hw)) {
          const hz = top + Math.round(h * 0.62);
          const mull = Math.abs(ax) < 1 || y === top + Math.round(h * 0.45);
          s.set(x, y, mull ? M.iron[1] : y < hz ? pickR(M.sky, 0.95 - (y - top) / h, x, y) : pickR(M.sea, 0.75 - (y - hz) / 20 + (hash(x, y, 4) > 0.9 ? 0.35 : 0), x, y));
        } else if (inArch(hw + 2)) s.set(x, y, M.stone[0]);
        else if (inArch(hw + 4)) s.set(x, y, M.stone[5]);
      }
      R(cx - hw - 5, top + h + 2, w + 10, 3, M.wood[4]); R(cx - hw - 5, top + h + 5, w + 10, 1, M.wood[1]);
    }
    for (const [x, y, w, h] of [[250, 896, 24, 44], [560, 800, 20, 40], [420, 912, 20, 36], [90, 640, 22, 40], [330, 620, 26, 50], [220, 520, 20, 40], [490, 500, 20, 40]]) win(x, y, w, h);
    // the central column the staircase winds around
    for (let y = 470; y < G0; y++) for (let x = 306; x < 334; x++) { const u = (x - 306) / 28; s.set(x, y, (y % 24 === 0) ? M.stone[1] : pickR(M.stone, 0.75 - Math.abs(u - 0.35) * 1.4, x, y)); }
    // floors: planks on heavy beams
    function slab(p) {
      for (let x = Math.max(14, p.x0 - 2); x <= Math.min(626, p.x1 + 2); x++) for (let y = p.y; y < p.y + 16; y++) {
        const k = y - p.y;
        s.set(x, y, k === 0 ? M.wood[5] : k < 3 ? (x % 26 === 0 ? M.wood[1] : M.wood[4]) : k < 5 ? M.wood[1] : (x % 42 < 8 && k < 14) ? pickR(M.wood, 0.55, x, y) : k < 8 ? M.wood[2] : k === 15 ? M.ink[0] : M.wood[1]);
      }
    }
    slab(PL.fl1); slab(PL.fl2);
    // stairs: treads, risers and a stringer
    function stairs(p) {
      for (let x = Math.max(14, p.x0); x <= Math.min(626, p.x1); x++) {
        const st = Math.floor(x / 16) * 16, top = Math.round(Math.min(p.fy(st), p.fy(st + 15)));
        const y0 = Math.round(p.fy(x));
        for (let y = top; y < y0 + 14; y++) {
          const k = y - top;
          let v = k === 0 ? M.wood[5] : k === 1 ? M.wood[4] : (x - st === 0 || x - st === 15) && y < y0 + 2 ? M.wood[1] : y < y0 + 3 ? M.wood[3] : y < y0 + 11 ? (y === y0 + 3 ? M.wood[1] : M.wood[2]) : M.wood[0];
          s.set(x, y, v);
        }
        s.set(x, y0 + 14, M.ink[0]);
      }
      // wall brackets under the landings
      for (const bx of [Math.max(16, p.x0 + 6), Math.min(614, p.x1 - 12)]) { const y = Math.round(p.fy(bx)) + 14; for (let k = 0; k < 10; k++) for (let q = 0; q < 10 - k; q++) s.set(bx + (bx < 320 ? q : -q + 6), y + k, q === 10 - k - 1 ? M.iron[0] : M.iron[2]); }
    }
    for (const k of ['f1', 'f2', 'f3', 'f4']) stairs(PL[k]);

    /* ---- entrance hall ---- */
    // the door (open to the bright day)
    for (let y = 944; y < G0; y++) for (let x = 20; x < 70; x++) {
      const ax = x - 45, dy = y - 966, arch = (r) => (y >= 966 ? Math.abs(ax) <= r : ax * ax + dy * dy <= r * r);
      if (arch(18)) s.set(x, y, y < 984 ? pickR(M.sky, 1 - (y - 948) / 60, x, y) : pickR(M.sea, 0.7, x, y));
      else if (arch(21)) s.set(x, y, M.wood[1]);
      else if (arch(24)) s.set(x, y, M.stone[5]);
    }
    for (let y = 950; y < G0; y++) for (let x = 64; x < 72; x++) s.set(x, y, x === 71 ? M.ink[0] : (y % 10 === 0) ? M.iron[1] : M.wood[3]); // door leaf, swung open
    // doormat
    for (let x = 30; x < 64; x++) { s.set(x, G0, M.rug[1]); s.set(x, G0 + 1, M.rug[3]); }
    // oil barrels, crates and a coil of rope under the stairs
    function barrel(x) { for (let y = G0 - 22; y < G0; y++) for (let q = -8; q <= 8; q++) { const bulge = Math.round(Math.sin(((y - (G0 - 22)) / 22) * Math.PI) * 1.5); if (Math.abs(q) > 7 + bulge) continue; s.set(x + q, y, (y === G0 - 18 || y === G0 - 5) ? M.iron[2] : Math.abs(q) >= 7 + bulge ? M.ink[0] : pickR(M.redT, 0.75 - (q + 8) / 22, x + q, y)); } }
    barrel(236); barrel(254); barrel(470);
    function crate(x, y, w, h) { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const e = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1; s.set(x + xx, y + yy, e ? M.ink[0] : (xx === yy || xx === w - 1 - yy) ? M.wood[2] : pickR(M.wood, 0.6 + (yy < 3 ? 0.2 : 0), x + xx, y + yy)); } }
    crate(380, G0 - 20, 24, 20); crate(404, G0 - 16, 18, 16); crate(388, G0 - 34, 16, 14); crate(520, G0 - 18, 22, 18);
    for (let a = 0; a < 3; a++) for (let q = -10; q <= 10; q++) s.set(300 + q, G0 - 2 - a * 3, (q + a) % 3 ? M.rope[2] : M.rope[0]);
    // the log lectern with an open book
    for (let y = G0 - 20; y < G0; y++) { s.set(128, y, M.wood[1]); s.set(129, y, M.wood[3]); }
    for (let y = 0; y < 5; y++) for (let x = -9; x <= 9; x++) s.set(129 + x, G0 - 22 - y + Math.round(x * 0.15), y === 0 ? M.wood[1] : x === 0 ? M.paper[0] : M.paper[2 - (y > 3 ? 1 : 0)]);
    // a raincoat on a peg and a lifebuoy
    for (let y = 930; y < 962; y++) for (let x = 90; x < 104; x++) if (Math.abs(x - 97) < 3 + (y - 930) * 0.14) s.set(x, y, pickR(M.brass, 0.8 - (x - 90) / 20, x, y));
    s.rect(96, 928, 3, 3, M.iron[1]);
    for (let a = 0; a < 6.3; a += 0.02) for (let r = 8; r < 13; r++) { const x = Math.round(180 + Math.cos(a) * r), y = Math.round(930 + Math.sin(a) * r); s.set(x, y, Math.floor((a + 0.4) / 0.785) % 2 ? M.redT[2] : M.plaster[4]); }

    /* ---- keeper's room ---- */
    // rug
    for (let x = 170; x < 300; x++) { s.set(x, 734, M.rug[x % 6 < 3 ? 1 : 2]); s.set(x, 735, M.rug[0]); }
    // bed with a blue blanket
    for (let y = 712; y < 734; y++) for (let x = 470; x < 566; x++) {
      const post = x < 474 || x > 561;
      if (post) { if (y > 704 - (x < 474 ? 8 : 0)) s.set(x, y, M.wood[x % 2 ? 2 : 3]); continue; }
      s.set(x, y, y < 716 ? (x < 490 ? M.paper[2] : M.cloth[3]) : y < 726 ? pickR(M.cloth, 0.85 - (y - 716) / 14 + ((x >> 3) % 2 ? 0.1 : 0), x, y) : M.wood[2]);
    }
    for (let y = 696; y < 712; y++) for (let x = 470; x < 474; x++) s.set(x, y, M.wood[3]);
    // stove with a pipe to the ceiling (glowing grate)
    for (let y = 702; y < 734; y++) for (let x = 384; x < 412; x++) s.set(x, y, x === 384 || x === 411 || y === 702 ? M.ink[0] : (y > 716 && y < 726 && x > 390 && x < 406) ? (x % 3 ? M.warm[(y + x) % 2 ? 1 : 0] : M.iron[0]) : pickR(M.iron, 0.4 - (x - 384) / 60, x, y));
    for (let y = 624; y < 702; y++) for (let x = 394; x < 402; x++) s.set(x, y, y % 20 === 0 ? M.iron[3] : M.iron[x < 397 ? 2 : 1]);
    // desk with an open logbook, a candle and an inkpot
    for (let y = 714; y < 734; y++) for (const lx of [184, 238]) s.set(lx, y, M.wood[2]);
    for (let x = 180; x < 244; x++) { s.set(x, 712, M.wood[5]); s.set(x, 713, M.wood[3]); s.set(x, 714, M.wood[1]); }
    for (let x = 196; x < 222; x++) for (let y = 707; y < 712; y++) s.set(x, y, x === 209 ? M.paper[0] : (y === 709 && x % 3) ? M.ink[1] : M.paper[2]);
    for (let y = 702; y < 712; y++) s.set(230, y, M.paper[2]); s.set(230, 700, M.warm[2]); s.set(230, 701, M.warm[1]);
    s.rect(188, 708, 4, 4, M.ink[0]);
    // bookshelves full of logbooks (years of them)
    function shelf(x0, y0, w, rows) {
      for (let r = 0; r < rows; r++) {
        const by = y0 + r * 18;
        for (let x = x0; x < x0 + w; x++) { s.set(x, by + 16, M.wood[4]); s.set(x, by + 17, M.wood[1]); }
        let x = x0 + 2;
        while (x < x0 + w - 4) {
          const bw = 3 + Math.floor(hash(x, r, 11) * 3), bh = 11 + Math.floor(hash(x, r, 12) * 5), ramp = [M.bookR, M.bookB, M.bookG, M.paper][Math.floor(hash(x, r, 13) * 4)];
          for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) s.set(x + xx, by + 16 - 1 - yy, xx === bw - 1 ? M.ink[0] : yy === bh - 4 ? M.brass[2] : ramp[xx === 0 ? 2 : 1]);
          x += bw + (hash(x, r, 14) > 0.85 ? 3 : 0);
        }
      }
      for (let y = y0 - 2; y < y0 + rows * 18; y++) { s.set(x0 - 2, y, M.wood[2]); s.set(x0 + w + 1, y, M.wood[2]); }
    }
    shelf(254, 648, 44, 3); shelf(120, 668, 40, 2);
    // a ship's wheel and a sea chart on the wall
    for (let a = 0; a < 6.3; a += 0.01) { for (let r = 11; r < 13; r++) s.set(Math.round(520 + Math.cos(a) * r), Math.round(660 + Math.sin(a) * r), M.wood[3]); }
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; for (let r = 0; r < 17; r++) s.set(Math.round(520 + Math.cos(a) * r), Math.round(660 + Math.sin(a) * r), r > 13 ? M.wood[4] : M.wood[2]); }
    s.rect(518, 658, 5, 5, M.brass[2]);
    for (let y = 640; y < 676; y++) for (let x = 424; x < 462; x++) s.set(x, y, x === 424 || x === 461 || y === 640 || y === 675 ? M.wood[1] : (hash(x >> 2, y >> 2, 21) > 0.6 ? M.bookG[2] : M.paper[2 - ((x + y) % 7 === 0 ? 1 : 0)]));
    s.rect(440, 652, 3, 3, M.redT[2]);

    /* ---- lamp room ---- */
    // brass rail around the lens well, a sign by the gallery door, an oil can
    for (let y = 400; y < 464; y++) for (let x = 590; x < 622; x++) {
      const ax = x - 606, dy = y - 414, arch = (r) => (y >= 414 ? Math.abs(ax) <= r : ax * ax + dy * dy <= r * r);
      if (arch(12)) s.set(x, y, y < 440 ? pickR(M.sky, 1 - (y - 402) / 50, x, y) : pickR(M.sea, 0.65, x, y));
      else if (arch(15)) s.set(x, y, M.iron[3]);
    }
    for (let y = 384; y < 396; y++) for (let x = 552; x < 584; x++) s.set(x, y, x === 552 || x === 583 || y === 384 || y === 395 ? M.wood[1] : M.wood[4]);
    for (let k = 0; k < 5; k++) { s.set(568 + k, 389 + (k === 4 ? 0 : 0), M.ink[0]); } s.set(572, 388, M.ink[0]); s.set(572, 390, M.ink[0]); s.set(571, 387, M.ink[0]); s.set(571, 391, M.ink[0]);
    for (let y = 396; y < 464; y++) s.set(567, y, M.wood[1]);
    for (let y = 452; y < 464; y++) for (let x = 120; x < 130; x++) s.set(x, y, x === 120 || x === 129 ? M.ink[0] : M.brass[y < 455 ? 3 : 1]);
    return s;
  }
  // banisters in front of Mudkip: a handrail and thin balusters along every flight and floor edge
  function rails(M) {
    const s = new ISpr(W, H);
    function along(p, rise = 18) {
      for (let x = Math.max(16, p.x0 + 2); x <= Math.min(624, p.x1 - 2); x++) {
        const y = Math.round(p.fy ? p.fy(x) : p.y) - rise;
        s.set(x, y, M.brass[3]); s.set(x, y + 1, M.brass[1]);
        if (x % 12 === 0) for (let k = 2; k < rise; k++) s.set(x, y + k, k === rise - 1 ? M.wood[1] : M.wood[3]);
      }
    }
    for (const k of ['f1', 'f2', 'f3', 'f4']) along(PL[k]);
    return s;
  }
  function lens(M, lit) {
    const w = 72, h = 128, s = new ISpr(w, h), cx = 36;
    // pedestal
    for (let y = 104; y < h; y++) { const hw = y < 110 ? 16 : 11 + (y - 110) * 0.5; for (let x = -hw; x <= hw; x++) s.set(cx + x, y, pickR(M.iron, 0.75 - (x + hw) / (2 * hw) * 0.6, x, y)); }
    // beehive lens: prism rings bulging out at the belt
    for (let y = 8; y < 104; y++) {
      const k = (y - 8) / 96, hw = Math.round(14 + Math.sin(k * Math.PI) * 20);
      for (let x = -hw; x <= hw; x++) {
        const u = (x + hw) / (2 * hw + 1), ring = (y % 7), frame = Math.abs(x) === hw || x === 0 || Math.abs(Math.abs(x) - Math.round(hw * 0.55)) < 1 || y === 55 || y === 56;
        let v;
        if (frame) v = M.brass[x === 0 ? 3 : 1];
        else if (lit) v = pickR(M.lamp.c ? M.lamp : M.lamp, (ring < 2 ? 0.95 : 0.55) - Math.abs(y - 56) / 140 - Math.abs(u - 0.4) * 0.3, x, y);
        else v = pickR(M.glass, (ring < 2 ? 0.95 : 0.55) - Math.abs(u - 0.35) * 0.7, x, y);
        s.set(cx + x, y, v);
      }
    }
    // bullseye at the belt
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const d = x * x + y * y; if (d <= 81) s.set(cx + x, 56 + y, d > 64 ? M.brass[2] : lit ? M.lamp[d < 20 ? 3 : 2] : M.glass[d < 20 ? 3 : 2]); }
    // cap
    for (let y = 0; y < 9; y++) { const hw = 3 + y * 1.3; for (let x = -hw; x <= hw; x++) s.set(cx + x, y, pickR(M.brass, 0.9 - (x + hw) / (2 * hw + 1) * 0.6, x, y)); }
    Paint.outline(s, M.ink[0]);
    s.ax = cx; s.ay = h - 1;
    return s;
  }
  function page(M) { const s = new ISpr(9, 7); for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) s.set(x, y + (x > 4 ? 1 : 0), y === 2 || y === 4 ? (x % 3 ? M.ink[1] : M.paper[2]) : M.paper[x === 0 ? 1 : 2]); Paint.outline(s, M.ink[0]); s.ax = 4; s.ay = 6; return s; }

  def.build = (A) => {
    const M = A.M;
    // World.load copies the platforms: keep handles on the live copies
    A.P = {}; Object.keys(PL).forEach((k, i) => { A.P[k] = World.plats[i]; });
    A.put(interior(M), 0, -6, { y: 6, noOcc: true });
    A.lens = A.put([lens(M, S.lit = Save.found('lh.lamp'))], LENS, -2, { y: PL.fl2.y + 3 });
    A.lensSpr = [lens(M, false), lens(M, true)];
    A.lens.frames = [A.lensSpr[S.lit ? 1 : 0]];
    A.put(rails(M), 0, 2, { y: -2, noOcc: true });
    A.pages = PAGES.map((p) => { const pr = A.put(page(M), p.x, -1, { y: p.y + 1 }); pr.hidden = Save.found(p.id); return Object.assign({}, p, { pr }); });
    // lights: the stove, the candle, the doorway, and the great lens
    A.glows.push({ x: 398, y: 720, r: 40, c: hex('#ff9a40'), a: 0.6, flicker: true });
    A.glows.push({ x: 230, y: 700, r: 26, c: hex('#ffd080'), a: 0.6, flicker: true });
    A.glows.push({ x: 45, y: 972, r: 50, c: hex('#e0f0ff'), a: 0.35, flicker: false });
    A.lensGlow = { x: LENS, y: PL.fl2.y - 70, r: 150, c: hex('#fff0a0'), a: S.lit ? 0.9 : 0, flicker: false };
    A.glows.push(A.lensGlow);
    for (const [x, y] of [[250, 918], [330, 645], [490, 520], [560, 820]]) A.glows.push({ x, y, r: 34, c: hex('#bfe4ff'), a: 0.25, flicker: false });
    A.addHot({ x0: 20, x1: 70, y0: 944, y1: G0, x: EXIT, reach: 30, tap: () => exitTower() });
    A.addHot({ x0: LENS - 36, x1: LENS + 36, y0: PL.fl2.y - 128, y1: PL.fl2.y, x: LENS, reach: 50, tap: () => { if (onLevel(PL.fl2)) relight(); else HUD.toast('The great lamp is at the very top of the tower. Climb the stairs!', { life: 2.4 }); } });
    A.addHot({ x0: 592, x1: 622, y0: 400, y1: 464, x: GDOOR, reach: 30, tap: () => { if (onLevel(PL.fl2)) toGallery(); } });
    // the page drawn in the frame bright when found
    void mix;
  };
  // the dark stone that rims the view on screens wider than the tower
  def.drawBack = (A, fb) => { fb.d.fill(0xff0c0a14); };
  const live = (p) => { const A = Game.area; if (!A || !A.P) return p; const k = Object.keys(PL).find((q) => PL[q] === p); return A.P[k] || p; };
  const onLevel = (p) => { const mk = Game.mudkip; return mk && mk.plat === live(p) && mk.mode === 'land'; };

  def.spawn = (A, G) => {
    S.keeper = null;
    if (typeof Eco !== 'undefined') {
      const m = Eco.add(G, 'wobbuffet', 104, { minX: 88, maxX: 128, range: 20 });
      if (m) { m.lhKeeper = true; m.forceAwake = 1e9; m.scale *= 0.62; if (m.resize) m.resize(); m.acc3 = { hat: 'sailor' }; S.keeper = m; }
    }
    if (Save.discover('lighthouse.found')) { Save.addPoints(150); setTimeout(() => HUD.toast('Discovered: the Coral Cove Lighthouse! (+150)', { life: 2.6, col: 0xff7ae0a0 }), 1200); }
  };
  def.update = (A, dt, t, G) => {
    const mk = G.mudkip; if (!mk) return;
    S.near = null;
    if (mk.mode === 'land' && !mk.plat && mk.x < EXIT + 18) S.near = { x: EXIT, y: 944, label: 'Go outside', fn: exitTower };
    else if (onLevel(PL.fl2) && Math.abs(mk.x - LENS) < 44 && !S.lit) S.near = { x: LENS, y: PL.fl2.y - 132, label: 'Relight the lamp', fn: relight };
    else if (onLevel(PL.fl2) && mk.x > GDOOR - 20) S.near = { x: GDOOR, y: 396, label: 'Step onto the gallery', fn: toGallery };
    else if (S.keeper && S.keeper.alive && Math.abs(mk.x - S.keeper.x) < 30 && !mk.plat) S.near = { x: S.keeper.x, y: S.keeper.y - 40, label: 'Talk', fn: () => keeperTalk(S.keeper) };
    // logbook pages: walk over them
    for (const p of A.pages) {
      if (p.pr.hidden) continue;
      if (Math.random() < dt * 3) FX.sparkles(p.x, p.y - 4, 1, 8);
      if (Math.abs(mk.x - p.x) < 12 && Math.abs(mk.y - p.y) < 18) {
        p.pr.hidden = true; Save.discover(p.id); Game.sfx('chest', p.x, 0.6); FX.sparkles(p.x, p.y - 6, 14, 18);
        const n = pagesFound();
        HUD.toast('A lost logbook page! (' + n + ' / 3)' + (n === 3 ? ' Bring them to the keeper.' : ''), { life: 2.6, col: 0xffffe8a0 });
      }
    }
    if (!S.topTold && onLevel(PL.fl2)) { S.topTold = true; if (Save.discover('lighthouse.top')) { Save.addPoints(200); HUD.toast('You climbed all the way to the lamp room! (+200)', { life: 2.6, col: 0xff7ae0a0 }); } }
    if (!onLevel(PL.fl2)) S.topTold = false;
    A.lensGlow.a = S.lit ? 0.75 + Math.sin(t * 2) * 0.1 : 0;
  };
  // a slow rotating beam sweeping the lamp room when the lens is lit
  def.post = (A, fb, cx, cy, t) => {
    if (!S.lit) return;
    const X = LENS - cx, Y = PL.fl2.y - 72 - cy, d = fb.d, Wd = fb.w, Hd = fb.h;
    const a = t * 0.9, sw = Math.cos(a);
    if (Y < -200 || Y > Hd + 200) return;
    for (let y = Math.max(0, Y - 60); y < Math.min(Hd, Y + 50); y++) for (let x = 0; x < Wd; x++) {
      const dx = x - X, wx = x + cx; if (wx < 16 || wx > 624) continue;
      const k = sw * dx > 0 ? Math.abs(dx) : 0; if (!k) continue;
      const spread = 8 + k * 0.12, off = Math.abs(y - Y);
      if (off > spread) continue;
      const kk = (1 - off / spread) * Math.min(1, k / 40) * Math.abs(sw) * 0.35;
      d[y * Wd + x] = U.screen(d[y * Wd + x], 0xfffff0b0, kk);
    }
  };
  def.photoBonus = (A, crop, subs) => (S.lit && subs.some((s) => s.sp === 'wobbuffet') ? { pts: 300, name: 'The keeper at work' } : null);
  Areas.lighthouse = def;

  /* ================= quest ================= */
  const pagesFound = () => PAGES.filter((p) => Save.found(p.id)).length;
  if (typeof Rewards !== 'undefined' && !Rewards.C['banner.keeper']) Rewards.C['banner.keeper'] = { slot: 'banner', name: 'Beacon Keeper', desc: 'You relit the Coral Cove lighthouse.', cols: ['#b8363e', '#fff2b8'] };
  function keeperTalk(m) {
    const n = pagesFound(), lit = Save.found('lh.lamp');
    const nm = 'Keeper Wobbuffet';
    if (Save.found('lh.done')) { Talk.open([U.pick(['Wobbuffet! The lamp burns bright. Ships sail safe into Coral Cove again!', 'Wooo... bbuffet. (It salutes you proudly.)', 'Up on the gallery you can see the whole cove. Best view in Hoenn!'])], { who: m, name: nm }); return; }
    if (!Save.found('lh.quest')) {
      Talk.open([
        'Wobbu-WOBBUFFET! Ahem. Welcome to the Coral Cove Lighthouse. I\'m the keeper.',
        'Last night\'s storm blew out the great lamp, and the wind scattered three pages of my logbook all over the tower!',
        { text: 'My old legs can\'t manage the stairs today... Could you find the pages and relight the lamp at the very top?', choices: ['Leave it to me!', 'Maybe later'] },
      ], { who: m, name: nm, done: (c) => { if (c === 0) { Save.discover('lh.quest'); HUD.toast('Quest: Beacon Keeper — find 3 logbook pages, relight the lamp!', { life: 3, col: 0xffffe8a0 }); } } });
      return;
    }
    if (n < 3 || !lit) {
      Talk.open([(n < 3 ? 'Pages found: ' + n + ' of 3. One blew under the stairs, I think... and one up by the windows. ' : 'All three pages! Wonderful! ') + (lit ? 'And the lamp shines again!' : 'The lamp is still dark — climb up the spiral stairs to the lamp room!')], { who: m, name: nm });
      return;
    }
    Talk.open([
      'Wobbuffet!! My pages! And the lamp is shining again — I saw it sweep across the water!',
      'Here, take these. And from now on you\'re an honorary keeper of this tower.',
    ], { who: m, name: nm, done: () => {
      Save.discover('lh.done'); Save.addPoints(500); Save.addItem('pearl', 3);
      const g = Rewards.grant('banner.keeper');
      HUD.toast('Quest complete! +500 pts, +3 Pearls' + (g ? ', banner: ' + g.label : ''), { life: 3.4, col: 0xff7ae0a0 });
      Game.sfx('chest', m.x, 0.9); FX.confetti && FX.confetti(m.x, m.y - 30, 30);
    } });
  }
  if (typeof Talk !== 'undefined' && Talk.hooks) Talk.hooks.push((m) => { if (!m.lhKeeper) return false; keeperTalk(m); return true; });
  function relight() {
    const A = Game.area; if (!A || !A.lensSpr) return;
    if (S.lit) { HUD.toast('The great lens turns slowly, throwing its beam far out to sea.', { life: 2.4 }); return; }
    S.lit = true; A.lens.frames = [A.lensSpr[1]];
    Game.sfx('timewave', LENS, 0.8); Game.shake(2); FX.sparkles(LENS, PL.fl2.y - 60, 30, 40);
    if (Save.discover('lh.lamp')) { Save.addPoints(300); Save.addItem('stardust', 1); }
    HUD.toast('The great lamp blazes back to life! (+300) Now step out onto the gallery...', { life: 3.2, col: 0xffffe8a0 });
  }

  /* ================= transitions ================= */
  function fadeTo(fn) {
    if (S.fade) return;
    S.fade = { t0: performance.now(), fn, did: false };
    Game.sfx('select', null, 0.5);
    if (Game.mudkip) { Game.mudkip.keyDir = 0; Game.mudkip.stop && Game.mudkip.stop(); }
  }
  function enterTower() { fadeTo(() => { Game.enterArea('lighthouse', { x: 72 }); }); }
  function exitTower() { fadeTo(() => { Game.enterArea('beach', { x: DX + 16, noIntro: true }); }); }
  function place(p, x) {
    const mk = Game.mudkip; mk.x = x; mk.mode = 'land'; mk.plat = p; mk.air = 0; mk.vair = 0; mk.y = World.platY(p, x); mk.target = null;
    Game.cam.x = mk.x - Game.VW / 2; Game.cam.y = mk.y - Game.VH * 0.6;
  }
  function toGallery() {
    fadeTo(() => {
      Game.enterArea('beach', { x: DX + 16, noIntro: true });
      const A = Game.area; if (!A.gallery) return;
      place(A.gallery, DX + 8);
      const gy = A.gallery.y;
      if (Save.discover('lighthouse.gallery')) { Save.addPoints(250); }
      HUD.toast('From the gallery: all of Coral Cove spread out below!', { life: 3.4, col: 0xffffe8a0 });
      S.pans = [{ x: 2600, y: gy + 170, dur: 2.4, hold: 1.4, zoom: 1.06 }, { x: 1300, y: gy + 180, dur: 2.2, hold: 1.8, zoom: 1.1 }, { x: 5200, y: gy + 150, dur: 3.2, hold: 1.6, zoom: 1.06 }];
      S.panWait = 0.8;
    });
  }
  function fromGallery() { fadeTo(() => { Game.enterArea('lighthouse', { x: GDOOR - 14, noIntro: true }); place(live(PL.fl2), GDOOR - 14); }); }

  /* ================= the exterior on the islet ================= */
  function tower(M) {
    const w = 132, h = 392, AY = 326, s = new ISpr(w, h), cx = 66;
    const cyl = (u) => 0.95 - Math.abs(u - 0.3) * 1.25;
    // finial and weather vane
    for (let y = 0; y < 8; y++) s.set(cx, y, M.metal[3]);
    for (let x = -5; x <= 6; x++) s.set(cx + x, 3, M.metal[2]); s.set(cx + 6, 2, M.metal[2]); s.set(cx + 6, 4, M.metal[2]);
    for (let y = 8; y < 13; y++) for (let x = -2; x <= 2; x++) if (x * x + (y - 10) * (y - 10) < 6) s.set(cx + x, y, M.gold[x < 0 ? 2 : 1]);
    // dome
    for (let y = 12; y < 34; y++) { const hw = Math.round(3 + Math.sqrt((y - 12) / 22) * 25); for (let x = -hw; x <= hw; x++) { const u = (x + hw) / (2 * hw + 1); s.set(cx + x, y, (x % 8 === 0) ? M.lhR[0] : pickR(M.lhR, cyl(u), x, y)); } }
    for (let x = -30; x <= 30; x++) { s.set(cx + x, 34, M.ink[0]); s.set(cx + x, 35, M.metal[2]); }
    // lantern room: glazing with mullions, the lens glowing within
    for (let y = 36; y < 72; y++) for (let x = -24; x <= 24; x++) {
      const mull = (x + 24) % 8 === 0 || y === 53;
      const lensK = Math.abs(x) < 10 - Math.abs(y - 54) * 0.3 ? 1 : 0;
      s.set(cx + x, y, mull ? M.metal[1] : lensK ? M.lhLight[1] : M.lhLight[0]);
    }
    // gallery deck + railing
    for (let x = -44; x <= 44; x++) { s.set(cx + x, 72, M.metal[3]); s.set(cx + x, 73, M.metal[2]); s.set(cx + x, 74, M.metal[1]); s.set(cx + x, 75, M.ink[0]); }
    for (let x = -44; x <= 44; x++) { s.set(cx + x, 58, M.metal[3]); s.set(cx + x, 59, M.metal[1]); s.set(cx + x, 65, M.metal[2]); if (x % 5 === 0 || Math.abs(x) === 44) for (let y = 60; y < 72; y++) s.set(cx + x, y, M.metal[x % 10 === 0 ? 1 : 2]); }
    // corbels under the gallery
    for (let y = 76; y < 92; y++) { const hw = Math.round(42 - (y - 76) * 0.8); for (let x = -hw; x <= hw; x++) s.set(cx + x, y, (x + 64) % 9 < 2 && y > 78 ? M.ink[1] : pickR(M.lhW, cyl((x + hw) / (2 * hw + 1)) - 0.25, x, y)); }
    // the tower: red and white bands, tapering, masonry courses
    for (let y = 92; y < AY; y++) {
      const k = (y - 92) / (AY - 92), hw = Math.round(29 + k * 19), band = Math.floor((y - 92) / 39) % 2;
      for (let x = -hw; x <= hw; x++) {
        const u = (x + hw) / (2 * hw + 1);
        let t = cyl(u) + (y % 7 === 0 ? -0.18 : 0) + ((Math.floor(y / 7) % 2 ? x + 3 : x) % 11 === 0 && y % 7 ? -0.1 : 0);
        s.set(cx + x, y, Math.abs(x) === hw ? M.ink[0] : pickR(band ? M.lhR : M.lhW, t, x, y));
      }
      if ((y - 92) % 39 === 0) for (let x = -hw; x <= hw; x++) s.set(cx + x, y, M.ink[1]);
    }
    // windows spiralling up (warm where the keeper lives)
    for (const [dx, wy, warm] of [[-12, 118, 0], [10, 160, 0], [-14, 204, 1], [12, 246, 0], [-8, 280, 1]]) {
      for (let y = 0; y < 13; y++) for (let x = -4; x <= 4; x++) {
        const arch = y < 4 ? x * x + (y - 4) * (y - 4) <= 16 : true;
        if (!arch) continue;
        const e = Math.abs(x) === 4 || y === 12 || (y < 4 && x * x + (y - 4) * (y - 4) > 9);
        s.set(cx + dx + x, wy + y, e ? M.ink[0] : warm ? M.win[y < 6 ? 1 : 0] : (x === 0 || y === 7) ? M.metal[1] : M.metal[y < 5 ? 2 : 0]);
      }
      for (let x = -5; x <= 5; x++) s.set(cx + dx + x, wy + 13, M.tWhite ? M.tWhite[1] : M.lhW[2]);
    }
    // the door: stone surround, a lamp above, a plaque
    for (let y = AY - 40; y < AY; y++) for (let x = -14; x <= 14; x++) {
      const dy = y - (AY - 28), arch = (r) => (y >= AY - 28 ? Math.abs(x) <= r : x * x + dy * dy <= r * r);
      if (arch(9)) s.set(cx + x, y, x === 0 || y === AY - 16 ? M.wood[0] : (y - (AY - 40)) % 6 === 0 ? M.wood[1] : pickR(M.wood, 0.75 - (x + 9) / 24, x, y));
      else if (arch(13)) s.set(cx + x, y, pickR(M.rock, 0.85 - (x + 13) / 40 + ((x + y) % 5 === 0 ? -0.15 : 0), x, y));
    }
    s.rect(cx + 4, AY - 15, 2, 2, M.gold[2]);
    for (let y = AY - 48; y < AY - 43; y++) for (let x = -3; x <= 3; x++) s.set(cx + x, y, Math.abs(x) === 3 ? M.metal[1] : M.lamp[1]);
    for (let x = -8; x <= 8; x++) for (let y = AY - 56; y < AY - 51; y++) s.set(cx + x, y, Math.abs(x) === 8 || y === AY - 56 || y === AY - 52 ? M.wood[1] : M.gold[1]);
    // steps and the rocky foundation (reaching down into the waves)
    for (let y = AY; y < h; y++) {
      const k = (y - AY) / (h - AY), hw = Math.round(52 + k * 14 + Math.sin(y * 0.7) * 1.5);
      for (let x = -hw; x <= hw; x++) {
        const u = (x + hw) / (2 * hw + 1), row = Math.floor((y - AY) / 9), bx = Math.floor((x + (row % 2) * 7 + 70) / 14);
        const mortar = (y - AY) % 9 === 0 || (x + (row % 2) * 7 + 70) % 14 === 0;
        s.set(cx + x, y, mortar ? M.rockU[0] : hash(bx, row, 3) > 0.8 && y > AY + 20 ? M.moss[1] : pickR(M.rock, 0.95 - u * 0.7 - k * 0.3 + (hash(bx, row, 2) - 0.5) * 0.2, x, y));
      }
    }
    for (let y = AY; y < AY + 6; y++) for (let x = -18; x <= 18; x++) s.set(cx + x, y, y === AY ? M.rock[5] : pickR(M.rock, 0.8 - (x + 18) / 50, x, y));
    Paint.outline(s, M.ink[0]);
    s.ax = cx; s.ay = AY;
    s.lampY = 54; s.galY = 72;
    return s;
  }
  if (B) {
    const b0 = B.build;
    B.build = (A) => {
      b0(A);
      const M = A.M, spr = tower(M), p = A.lighthouse;
      const gy = World.groundAt(DX);
      if (p) { p.frames = [spr]; p.x = DX; p.y = gy + 1; }
      else A.lighthouse = A.put(spr, DX, -4, { y: gy + 1 });
      A.lhX = DX; A.lhY = gy + 1 - (spr.ay - spr.lampY);
      // the old telescope hotspot becomes the door
      A.hot = A.hot.filter((h) => h.x !== 3962);
      for (const g of A.glows) if (g.x === 3962) { g.x = DX; g.y = A.lhY; g.r = 90; }
      A.glows.push({ x: DX, y: gy - 46, r: 26, c: hex('#ffe0a0'), a: 0.5, flicker: true });
      A.addHot({ x0: DX - 10, x1: DX + 10, y0: gy - 40, y1: gy, x: DX, reach: 24, tap: () => { const mk = Game.mudkip; if (mk && !mk.plat) enterTower(); } });
      // the gallery: a walkable ring high up the tower
      A.gallery = { x0: DX - 42, x1: DX + 42, y: gy + 1 - (spr.ay - spr.galY), kind: 'gallery' };
      World.plats.push(A.gallery);
    };
    const u0 = B.update;
    B.update = (A, dt, t, G) => {
      if (u0) u0(A, dt, t, G);
      const mk = G.mudkip; S.near = null; if (!mk) return;
      const gy = World.groundAt(DX);
      if (A.gallery && mk.plat === A.gallery && Math.abs(mk.x - DX) < 20) S.near = { x: DX, y: A.gallery.y - 30, label: 'Go inside', fn: fromGallery };
      else if (mk.mode === 'land' && !mk.plat && Math.abs(mk.x - DX) < 16 && Math.abs(mk.y - gy) < 12) S.near = { x: DX, y: gy - 50, label: 'Enter the lighthouse', fn: enterTower };
      // the panoramic sweep from the gallery
      if (S.pans.length && Game.mode === 'explore') {
        if (S.panWait > 0) S.panWait -= dt;
        else if (!Game.cine.shot) { const q = S.pans.shift(); Game.cine.pan(q.x, q.y, q); }
      }
    };
  }

  /* ================= input + prompt + fade ================= */
  window.addEventListener('keydown', (e) => {
    if ((e.key !== 'e' && e.key !== 'E') || e.repeat) return;
    if (!S.near || S.fade || Game.mode !== 'explore' || (typeof Talk !== 'undefined' && Talk.busy())) return;
    if (!Game.area || (Game.areaId !== 'beach' && Game.areaId !== 'lighthouse')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    S.near.fn();
  }, true);
  if (typeof Harvest !== 'undefined') {
    const dp = Harvest.drawPrompt;
    Harvest.drawPrompt = (fb, t) => {
      dp(fb, t);
      const n = S.near;
      if (n && !Harvest.near && !S.fade && Game.mode === 'explore' && (Game.areaId === 'beach' || Game.areaId === 'lighthouse')) {
        const [x, y] = Talk.toUI(n.x, n.y);
        const X = Math.round(x), Y = Math.round(y) + Math.round(Math.sin(t * 5) * 1.5);
        const touch = typeof Pad !== 'undefined' && Pad.touch;
        UI.disc(fb, X, Y + 1, 7, 0xff0a0e1a); UI.disc(fb, X, Y, 7, 0xff1b2240); UI.disc(fb, X, Y, 6, 0xffffffff);
        Font.draw(fb, touch ? '!' : 'E', X, Y - 4, 0xff1b2240, { font: 'small', align: 'center' });
        Font.draw(fb, (touch ? 'Tap: ' : '') + n.label, X, Y + 9, 0xffffffff, { font: 'small', align: 'center', outline: 0xff1b2240 });
        HUD.btn('lh', X - 50, Y - 10, 100, 30, () => { if (S.near && !S.fade) S.near.fn(); });
      }
      if (S.fade) {
        const F = S.fade, k = (performance.now() - F.t0) / 380;
        if (k >= 1 && !F.did) { F.did = true; try { F.fn(); } catch (err) { console.error(err); } }
        const a = k < 1 ? k : Math.max(0, 2 - k);
        if (k >= 2.2) S.fade = null;
        const kk = Math.round(clamp(a, 0, 1) * 256), d = fb.d;
        if (kk) for (let i = 0; i < d.length; i++) d[i] = U.mixk(d[i], 0xff06040a, kk);
      }
    };
  }
  return Object.assign(S, { PL, PAGES, enterTower, exitTower, toGallery, fromGallery, relight, keeperTalk });
})();
