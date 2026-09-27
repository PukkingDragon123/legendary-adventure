/* ------------------------------------------------------------------
   WorldMap — an interactive 3D map of the region, voxel-rendered like
   a tiny pixel diorama: drag to spin, drag up/down to tilt, pinch or
   wheel to zoom. Pins show each area's completion; locked places hide
   under clouds; dotted routes link them. Tap a pin, then travel.
------------------------------------------------------------------- */
const WorldMap = (() => {
  const { clamp, lerp, hex, mix, fbm, vnoise, hash } = U;
  const N = 256;
  const M = { on: false, t: 0, yaw: 0.6, pitch: 0.55, dist: 1, tgtYaw: 0.6, sel: null, ptrs: new Map(), pinch: null, drag: null, built: false, anim: 0, closing: 0, travel: null };
  // locations in map space (0..N)
  const LOC = {
    beach: { x: 118, y: 190, label: 'Coral Cove' },
    forest: { x: 176, y: 128, label: 'Weather Woods' },
    canopy: { x: 150, y: 84, label: 'Treetop Town' },
    falls: { x: 86, y: 70, label: 'Starfall Cave' },
    stage: { x: 204, y: 186, label: 'Seaside Stage' },
  };
  const ROUTES = [['beach', 'forest'], ['forest', 'canopy'], ['canopy', 'falls'], ['forest', 'stage'], ['beach', 'stage']];
  let HM = null, CM = null, WATER = null;
  function build() {
    HM = new Float32Array(N * N); CM = new Uint32Array(N * N); WATER = new Uint8Array(N * N);
    const C = (h) => hex(h);
    const deep = C('#1a3a8a'), sea = C('#2a64c8'), shallow = C('#3aa8d8'), sand = C('#e8d098'), grass = C('#5ab04c'), grass2 = C('#3e8e3e'), forest = C('#2a6a34'), forest2 = C('#1f5028'), rock = C('#8a7a6a'), rock2 = C('#6a5e54'), snow = C('#f4f8ff'), lava = C('#ff6a2a'), ash = C('#9a9090');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N - 0.5, v = y / N - 0.5;
      // main island + a few islets
      let isl = 1 - Math.hypot(u * 1.25, v * 1.45) * 2.1;
      isl = Math.max(isl, 0.55 - Math.hypot(u - 0.36, v - 0.3) * 7, 0.45 - Math.hypot(u + 0.34, v - 0.36) * 8, 0.4 - Math.hypot(u - 0.4, v + 0.36) * 9);
      let h = isl * 0.9 + (fbm(x * 0.022, y * 0.022, 5, 5) - 0.5) * 0.7;
      // mountains to the north-west, a volcano in the middle
      h += Math.max(0, 1 - Math.hypot(x - 86, y - 70) / 60) * 0.9;
      const dv = Math.hypot(x - 128, y - 110);
      h += Math.max(0, 1 - dv / 34) * 0.9 - (dv < 7 ? (7 - dv) * 0.05 : 0);
      h = Math.max(-0.4, h);
      HM[y * N + x] = h;
    }
    // colour + light
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, h = HM[i];
      let c;
      const n = hash(x, y, 3);
      if (h < 0.02) { WATER[i] = 1; c = h < -0.2 ? deep : h < -0.04 ? sea : shallow; }
      else if (h < 0.08) c = sand;
      else if (h < 0.35) c = n > 0.5 ? grass : grass2;
      else if (h < 0.7) c = vnoise(x * 0.3, y * 0.3, 9) > 0.45 ? (n > 0.5 ? forest : forest2) : grass2;
      else if (h < 1.05) c = n > 0.5 ? rock : rock2;
      else c = snow;
      // the volcano's ash slopes and glowing crater
      const dv = Math.hypot(x - 128, y - 110);
      if (dv < 30 && h > 0.5) c = mix(c, ash, 0.6);
      if (dv < 6 && h > 0.9) c = lava;
      // rainforest east of the volcano: extra lush
      if (Math.hypot(x - 176, y - 128) < 26 && h > 0.08 && h < 0.8) c = n > 0.4 ? C('#1c5a2a') : C('#2e7a36');
      // fine texture: grass tufts / canopy blobs (bright top-left, dark bottom-right), rocky speckle
      if (!WATER[i]) {
        const f = vnoise(x * 0.9, y * 0.9, 13);
        if (h >= 0.08 && h < 0.8) {
          const tree = vnoise(x * 0.45, y * 0.45, 17);
          if (tree > 0.62) { const top = hash(x, y, 21) > 0.5; c = mix(c, top ? C('#7acc5a') : C('#123a1c'), top ? 0.35 : 0.45); }
          else c = mix(c, f > 0.5 ? C('#8ad06a') : C('#245a2a'), Math.abs(f - 0.5) * 0.5);
        } else if (h >= 0.7) c = mix(c, f > 0.5 ? 0xffffffff : 0xff203040, Math.abs(f - 0.5) * 0.35);
        else c = mix(c, f > 0.5 ? C('#fff2c8') : C('#c8a870'), Math.abs(f - 0.5) * 0.6);
      } else {
        // coral patches in the shallows
        if (h > -0.04 && vnoise(x * 0.4, y * 0.4, 23) > 0.66) c = mix(c, C('#f08aa0'), 0.35);
      }
      // slope lighting (light from the north-west)
      const hx = HM[i] - HM[y * N + Math.max(0, x - 1)], hy = HM[i] - HM[Math.max(0, y - 1) * N + x];
      if (!WATER[i]) { const l = clamp(0.85 + (hx + hy) * 5, 0.55, 1.25); c = U.pack(U.R(c) * l, U.G(c) * l, U.B(c) * l); }
      CM[i] = c;
    }
    // white surf ring along every coast
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const i = y * N + x; if (WATER[i] && (!WATER[i - 1] || !WATER[i + 1] || !WATER[i - N] || !WATER[i + N])) CM[i] = mix(CM[i], 0xffffffff, 0.6); }
    // towns / landmarks as tiny coloured roofs
    const roof = (x, y, col) => { for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) { const i = (y + yy) * N + x + xx; CM[i] = (Math.abs(xx) + Math.abs(yy)) < 2 ? col : mix(col, 0xff000000, 0.3); HM[i] = Math.max(HM[i], 0.1) + 0.02; } };
    roof(120, 186, C('#ff5a4a')); roof(206, 184, C('#ffd23a')); roof(172, 124, C('#f4f4f4')); roof(152, 82, C('#b8864a'));
    // dotted routes baked into the colour map
    for (const [a, b] of ROUTES) {
      const A = LOC[a], B = LOC[b];
      for (let k = 0; k <= 200; k++) { const t = k / 200, x = Math.round(lerp(A.x, B.x, t) + Math.sin(t * 7) * 3), y = Math.round(lerp(A.y, B.y, t) + Math.cos(t * 5) * 3); const i = y * N + x; if (!WATER[i] && k % 6 < 4) CM[i] = C('#f0dca0'); }
    }
    M.built = true;
  }
  function open() {
    if (Game.mode === 'camera') Photo.close();
    if (!M.built) build();
    Game.mode = 'map'; M.on = true; M.t = 0; M.anim = 0; M.closing = 0; M.sel = Game.areaId; M.travel = null;
    SFX.dexOpen();
  }
  function close() { if (M.closing) return; M.closing = 0.001; SFX.back(); }
  function update(dt) {
    M.t += dt; M.anim = Math.min(1, M.anim + dt * 2.5);
    if (M.closing) { M.closing += dt; if (M.closing > 0.4) { M.on = false; Game.mode = 'explore'; M.closing = 0; } }
    if (!M.drag) M.yaw += dt * 0.05;
    if (M.travel) { M.travel.t += dt; if (M.travel.t > 1.1 && !M.travel.done) { M.travel.done = true; Game.enterArea(M.travel.id); } if (M.travel.t > 1.6) { M.on = false; Game.mode = 'explore'; M.travel = null; } }
  }
  /* ---------- voxel render ---------- */
  function render(fb, X0, Y0, W, H, t) {
    const d = fb.d, FW = fb.w;
    const cy0 = N / 2, cx0 = N / 2;
    const dist = 150 * M.dist, camH = 60 + M.pitch * 130;
    const cx = cx0 - Math.sin(M.yaw) * dist, cy = cy0 + Math.cos(M.yaw) * dist;
    const horizon = Y0 + H * (0.15 + (1 - M.pitch) * 0.2);
    const scaleH = H * 0.9;
    const ybuf = new Int32Array(W).fill(Y0 + H);
    const sky0 = hex('#2966c8'), sky1 = hex('#cde8f8'), cloudC = 0xfffcfaf6, cloudS = hex('#c8d8ec');
    const sunX = X0 + W * (0.5 + Math.sin(M.yaw * 1.0 + 1.2) * 0.6), sunY = Y0 + (horizon - Y0) * 0.35;
    for (let y = Y0; y < Y0 + H; y++) {
      const k = clamp((y - Y0) / (horizon - Y0 + 30), 0, 1);
      const base = mix(sky0, sky1, k * k);
      for (let x = X0; x < X0 + W; x++) {
        let c = base;
        const ds = Math.hypot(x - sunX, (y - sunY) * 1.3);
        if (ds < 40) c = mix(c, 0xffe8fcff, (1 - ds / 40) * 0.6);
        if (ds < 6) c = 0xfff0ffff;
        if (y < horizon + 2) {
          // two cloud bands that slide as the map spins
          const u = (x - X0) / W + M.yaw * 0.35 + t * 0.004, vy = (y - Y0) / Math.max(1, horizon - Y0);
          const cl = vnoise(u * 7, vy * 5, 31) * 0.65 + vnoise(u * 19, vy * 11, 32) * 0.35;
          const band = Math.max(0, 1 - Math.abs(vy - 0.55) * 3.2);
          const v = cl * band;
          if (v > 0.48) c = v > 0.56 ? cloudC : mix(base, cloudS, 0.7);
        }
        d[y * FW + x] = c;
      }
    }
    const sinY = Math.sin(M.yaw), cosY = Math.cos(M.yaw);
    const fov = 0.9;
    const shimmer = Math.floor(t * 3);
    for (let z = 4; z < 330; z += z < 90 ? 0.8 : z < 200 ? 1.4 : 2.2) {
      // left/right points of this depth slice
      const plx = -fov * z, prx = fov * z;
      const lx = cx + sinY * z + cosY * plx, ly = cy - cosY * z + sinY * plx;
      const rx = cx + sinY * z + cosY * prx, ry = cy - cosY * z + sinY * prx;
      const dx = (rx - lx) / W, dy = (ry - ly) / W;
      let px = lx, py = ly;
      const fog = clamp((z - 110) / 220, 0, 0.92);
      for (let sx = 0; sx < W; sx++, px += dx, py += dy) {
        const mx = Math.floor(px), my = Math.floor(py);
        let h, c;
        if (mx < 0 || my < 0 || mx >= N || my >= N) { h = -0.1; c = hex('#1a4aa0'); }
        else {
          const i = my * N + mx;
          h = HM[i]; c = CM[i];
          if (WATER[i]) { h = 0.02; if (hash(mx, my, shimmer) > 0.97) c = 0xffffffff; }
          // locked areas are shrouded in cloud
          for (const id in LOC) if (!Save.unlocked(id)) { const L = LOC[id]; const dd = Math.hypot(mx - L.x, my - L.y); if (dd < 20) { const k = clamp(1.3 - dd / 20 + (vnoise(mx * 0.2 + t * 0.2, my * 0.2, 5) - 0.5), 0, 1); c = mix(c, 0xfff4f4fa, k * 0.85); h = Math.max(h, 0.35 * k); } }
        }
        const sy = Math.floor((camH - h * 60) / z * scaleH * 0.12 + horizon);
        const X = X0 + sx;
        if (sy < ybuf[sx]) {
          const cc = fog > 0 ? mix(c, sky1, fog) : c;
          for (let y = Math.max(Y0, sy); y < ybuf[sx]; y++) d[y * FW + X] = cc;
          ybuf[sx] = Math.max(Y0, sy);
        }
      }
    }
    return { cx, cy, camH, horizon, scaleH, sinY, cosY, fov, W, X0 };
  }
  function project(P, mx, my, h) {
    // world → screen for pins
    const rx = mx - P.cx, ry = my - P.cy;
    const z = rx * P.sinY - ry * P.cosY;
    const side = rx * P.cosY + ry * P.sinY;
    if (z < 4) return null;
    const sx = P.X0 + P.W / 2 + (side / (P.fov * z)) * (P.W / 2);
    const sy = (P.camH - h * 60) / z * P.scaleH * 0.12 + P.horizon;
    return [sx, sy, z];
  }
  function draw(fb, t) {
    const S = UI.skin(), W = fb.w, H = fb.h;
    const k = M.closing ? 1 - M.closing / 0.4 : U.ease.outBack(M.anim);
    UI.rectA(fb, 0, 0, W, H, 0xff0a0e20, 0.6 * Math.min(1, M.anim * 2));
    const DW = Math.min(W - 10, 460), DH = Math.min(H - 10, 310);
    const ox = Math.round((W - DW) / 2), oy = Math.round((H - DH) / 2 + (1 - k) * 60);
    UI.body(fb, ox, oy, DW, DH, S, { r: 7, screws: true });
    const V = { x: ox + 8, y: oy + 24, w: DW - 16, h: DH - 32 };
    UI.screen(fb, V.x - 2, V.y - 2, V.w + 4, V.h + 4, { fill: 0xff000000, rim: S.ink, glare: false });
    const P = render(fb, V.x, V.y, V.w, V.h, t);
    Font.draw(fb, 'HOENN PHOTO MAP', ox + 12, oy + 9, S.trim, { font: 'small' });
    Font.draw(fb, 'drag to spin · pinch to zoom', ox + DW / 2, oy + 9, U.mix(S.trim, S.body, 0.4), { font: 'small', align: 'center' });
    UI.panel(fb, ox + DW - 22, oy + 5, 16, 14, { r: 3, ol: S.ink, fill: S.btn }); Font.icon(fb, 'cross', ox + DW - 16, oy + 9, 1);
    HUD.btn('mapx', ox + DW - 24, oy + 3, 20, 18, () => close());
    // pins
    const pins = [];
    for (const id in LOC) {
      const L = LOC[id];
      const h = HM[Math.round(L.y) * N + Math.round(L.x)] + 0.25;
      const p = project(P, L.x, L.y, Math.max(0.05, h));
      if (!p || p[0] < V.x || p[0] > V.x + V.w || p[1] < V.y || p[1] > V.y + V.h) continue;
      pins.push({ id, p, L });
    }
    pins.sort((a, b) => b.p[2] - a.p[2]);
    for (const { id, p } of pins) {
      const un = Save.unlocked(id), here = Game.areaId === id, sel = M.sel === id;
      const x = Math.round(p[0]), y = Math.round(p[1] - 14 - Math.sin(t * 3 + x) * 2 * (sel ? 1 : 0.3));
      UI.line(fb, x, y + 8, x, Math.round(p[1]), 0xff1b2240);
      const pct = completion(id);
      // completion ring
      for (let a = 0; a < 40; a++) { const ang = (a / 40) * Math.PI * 2 - Math.PI / 2; const col = a / 40 < pct ? 0xff5aff7a : 0xff3a4058; UI.put(fb, Math.round(x + Math.cos(ang) * 9), Math.round(y + Math.sin(ang) * 9), col); }
      UI.orb(fb, x, y, 7, un ? (here ? 0xff4ab8ff : S.body) : 0xff6a7088, { ol: 0xff1b2240 });
      Font.icon(fb, un ? (here ? 'cam' : 'pb') : 'lock', x - (un ? (here ? 4 : 3) : 2), y - 3, 1);
      const lbl = un ? LOC[id].label : '???';
      Font.draw(fb, lbl, x, y - 20, 0xffffffff, { font: 'small', align: 'center', outline: 0xff1b2240 });
      HUD.btn('pin-' + id, x - 12, y - 24, 24, 34, () => { M.sel = id; SFX.select(); });
    }
    // secrets: a faint rift in the sky once Palkia or Dialga has appeared
    if (Save.found('palkia.met') || Save.found('dialga.met')) {
      const p = project(P, 60, 190, 2.2);
      if (p) { const x = Math.round(p[0]), y = Math.round(p[1]); for (let a = 0; a < 30; a++) UI.put(fb, x + Math.round(Math.sin(a * 0.7 + t) * 6), y + a - 15, a % 2 ? 0xffff9ae8 : 0xff9ad8ff); Font.draw(fb, 'Rift', x, y - 22, 0xffffc8f0, { font: 'small', align: 'center', outline: 0xff1b2240 }); }
    }
    // info card for the selected pin
    if (M.sel && DexData.AREAS[M.sel]) {
      const a = DexData.AREAS[M.sel], un = Save.unlocked(M.sel);
      const cw = Math.min(200, V.w - 20), ch = 74, cx = V.x + 8, cyy = V.y + V.h - ch - 6;
      UI.panel(fb, cx, cyy, cw, ch, { r: 4, ol: S.ink, fill: 0xfff4f6fb });
      Font.draw(fb, un ? a.name : '??? (locked)', cx + 6, cyy + 7, 0xff1b2240, { font: 'title' });
      Font.draw(fb, a.sub, cx + 6, cyy + 24, 0xff5a6080, { font: 'small' });
      Font.draw(fb, un ? a.blurb : (M.sel === 'stage' ? 'Gather Meloetta\'s band to open the stage.' : 'Earn ' + a.need + ' research stamps to open (' + Quests.stamps() + ' so far).'), cx + 6, cyy + 34, 0xff1b2240, { font: 'small', maxW: cw - 12, lh: 9 });
      const sp = DexData.ORDER.filter((k) => (DexData.S[k].area || []).includes(M.sel));
      Font.draw(fb, 'Pokémon ' + sp.filter((k) => Save.data.seen[k]).length + '/' + sp.length + '   ' + Math.round(completion(M.sel) * 100) + '%', cx + 6, cyy + ch - 11, 0xff1b2240, { font: 'small' });
      if (un && M.sel !== Game.areaId) {
        const bx = cx + cw - 58, by = cyy + ch - 20;
        UI.panel(fb, bx, by, 52, 16, { r: 3, ol: S.ink, fill: S.accent });
        Font.draw(fb, 'Travel', bx + 26, by + 5, 0xffffffff, { font: 'small', align: 'center' });
        HUD.btn('travel', bx, by, 52, 16, () => { if (!Areas[M.sel]) { HUD.toast('This place is still being built — coming in a future update!', { life: 2.6 }); SFX.error(); return; } M.travel = { id: M.sel, t: 0 }; SFX.unlock(); });
      }
    }
    // travel transition: a Poké Ball wipe
    if (M.travel) {
      const tt = M.travel.t, r = tt < 1.1 ? tt / 1.1 : 1 - (tt - 1.1) / 0.5;
      const R = Math.round(Math.hypot(W, H) * clamp(r, 0, 1));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - W / 2, y - H / 2) < R) fb.d[y * W + x] = y < H / 2 ? 0xffee3b45 : 0xfff4f7fb;
      if (r > 0.9) { UI.rect(fb, 0, H / 2 - 2, W, 4, 0xff1b2240); UI.disc(fb, W / 2, H / 2, 14, 0xff1b2240); UI.disc(fb, W / 2, H / 2, 10, 0xfff4f7fb); }
    }
    // background drag area (spin / tilt)
    HUD.btn('mapdrag', V.x, V.y, V.w, V.h, null, { drag: (ux, uy, ph) => { if (ph === 'down') M.drag = { x: ux, y: uy, yaw: M.yaw, pitch: M.pitch }; else if (ph === 'move' && M.drag) { M.yaw = M.drag.yaw - (ux - M.drag.x) * 0.012; M.pitch = clamp(M.drag.pitch + (uy - M.drag.y) * 0.006, 0.1, 1); } else M.drag = null; } });
    // put the drag area underneath the pins (buttons are hit-tested last-first)
    const dragB = HUD.btns.pop(); HUD.btns.unshift(dragB);
  }
  function completion(id) {
    const sp = DexData.ORDER.filter((k) => (DexData.S[k].area || []).includes(id));
    if (!sp.length) return 0;
    let got = 0, tot = 0;
    for (const k of sp) { const d = DexData.S[k]; tot += Object.keys(d.beh).length; got += Object.keys(Save.data.beh[k] || {}).length; }
    return tot ? got / tot : 0;
  }
  function down() {} function move() {} function up() {}
  function wheel(dy) { M.dist = clamp(M.dist * Math.exp(dy * 0.001), 0.55, 1.6); }
  function key(k) { if (k === 'Escape' || k === 'm') close(); if (k === 'ArrowLeft') M.yaw -= 0.2; if (k === 'ArrowRight') M.yaw += 0.2; if (k === 'ArrowUp') M.pitch = clamp(M.pitch + 0.1, 0.1, 1); if (k === 'ArrowDown') M.pitch = clamp(M.pitch - 0.1, 0.1, 1); }
  return Object.assign(M, { open, close, update, draw, down, move, up, wheel, key, LOC });
})();
