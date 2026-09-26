/* ------------------------------------------------------------------
   Poster — offline frames for the GIF thumbnail (a Poké Ball opens and
   Mudkip pops out) and the banner (shiny Mudkip + three Mudkip dancing).
   Uses the game's own world + creature renderers, deterministic.
------------------------------------------------------------------- */
const Poster = (() => {
  const { clamp, lerp, mixc } = Scenery;
  const { hex, bayer4 } = PX;
  const TAU = Math.PI * 2;
  const P = Times.compile('noon');
  const C = { k: hex('#1b2240'), w: hex('#ffffff'), r: hex('#ee3b45'), r2: hex('#b8202e'), r3: hex('#ff8a8a'), g: hex('#c9d3e3'), g2: hex('#9aa6c0'), in: hex('#5a1020'), y: hex('#ffd83a'), o: hex('#ff9a2a'), cy: hex('#9ff3ff') };
  const ease = (t) => t * t * (3 - 2 * t);
  const rng = PX.rng;

  // background: the game's own beach (flattened under the stage), rendered once per size
  function background(W, H, cx, cy, groundY, extra) {
    const fb = new PX.Buf(W, H);
    const occ = new Uint8Array(W * H);
    const g = World.ground, save = g.slice();
    for (let x = Math.max(0, cx - 4); x < Math.min(g.length, cx + W + 4); x++) g[x] = groundY + Math.sin(x * 0.02) * 1.5;
    WorldRender.drawSky(fb, cx, cy, P, 12);
    // sun with halo, a couple of clouds
    const sx = Math.round(W * 0.12), sy = Math.round(H * 0.16);
    Scenery.glow(fb, sx + 0.5, sy + 0.5, Math.round(H * 0.45), P.sun.glow, 0.5, null, null, 4, 0.2);
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const d = Math.hypot(x + 0.5, y + 0.5) / 9; if (d <= 1) fb.set(sx + x, sy + y, P.sun.cols[d > 0.84 ? 0 : d > 0.5 ? 1 : 2]); }
    const cl1 = Scenery.makeCloud(3, 70, 24, P.cloud, { upper: 2, L: P.cloudLit }), cl2 = Scenery.makeCloud(14, 46, 16, P.cloud, { upper: 1, L: P.cloudLit });
    fb.blit(cl1, Math.round(W * 0.56), Math.round(H * 0.08)); fb.blit(cl2, Math.round(W * 0.3), Math.round(H * 0.2));
    if (W > 300) { const cl3 = Scenery.makeCloud(41, 90, 28, P.cloud, { upper: 2, L: P.cloudLit }); fb.blit(cl3, Math.round(W * 0.8), Math.round(H * 0.12)); }
    WorldRender.drawBackdrop(fb, cx, cy, P, 12);
    WorldRender.drawTerrain(fb, cx, cy, P, 12, occ, WorldRender.swashState(2));
    g.set(save);
    if (extra) extra(fb, occ);
    return fb;
  }
  function frame(fb) {
    const W = fb.w, H = fb.h, k = C.k, l = hex('#8fd0ff');
    for (let x = 0; x < W; x++) { fb.set(x, 0, k); fb.set(x, 1, k); fb.set(x, H - 1, k); fb.set(x, H - 2, k); fb.set(x, 2, l); fb.set(x, H - 3, l); }
    for (let y = 0; y < H; y++) { fb.set(0, y, k); fb.set(1, y, k); fb.set(W - 1, y, k); fb.set(W - 2, y, k); if (y > 1 && y < H - 2) { fb.set(2, y, l); fb.set(W - 3, y, l); } }
    for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [W - 1, 0, -1, 1], [0, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) {
      fb.set(cx, cy, 0); fb.set(cx + dx, cy, 0); fb.set(cx, cy + dy, 0); fb.set(cx + dx, cy + dy, k); fb.set(cx + 2 * dx, cy, k); fb.set(cx, cy + 2 * dy, k);
    }
  }

  function mudkip(pose, yaw, scale = 1, shiny = false) {
    const g = P.gradePal(shiny ? Life.SHINY : Mudkip.PAL, shiny ? 'poster-shiny' : 'poster-mudkip');
    const W = Math.ceil(120 * scale), H = Math.ceil(120 * scale);
    const pz = Object.assign({ mouth: 0.6, eyes: 'open' }, pose, { side: clamp(3 * Math.cos(yaw), -1, 1) });
    return Mudkip.render(Mudkip.build(pz), { yaw, pitch: 0.16, scale, W, H, ox: Math.floor(W / 2), oy: Math.floor(H * 0.86), pal: g.pal, light: g.light });
  }
  // blit a creature render with its origin at (x, y); optional colour map (silhouettes)
  function put(fb, r, x, y, map = null, fade = 0) {
    const X = Math.round(x) - r.ox, Y = Math.round(y) - r.oy;
    const W = r.buf.w, d = r.buf.d;
    for (let yy = 0; yy < r.buf.h; yy++)
      for (let xx = 0; xx < W; xx++) {
        const c = d[yy * W + xx];
        if (!c) continue;
        const tx = X + xx, ty = Y + yy;
        if (fade > 0 && bayer4(tx, ty) < fade) continue;
        fb.set(tx, ty, map ? map(c, xx, yy) : c);
      }
  }
  function shadow(fb, x, y, rx, k = 0.8) {
    for (let yy = -3; yy <= 3; yy++)
      for (let xx = -rx; xx <= rx; xx++) {
        const u = xx / rx, v = yy / 3, d = u * u + v * v;
        if (d > 1 || bayer4(x + xx, y + yy) > (1 - d) * k * 1.4) continue;
        const i = (y + yy) * fb.w + x + xx;
        if (i >= 0 && i < fb.d.length) fb.d[i] = mixc(fb.d[i], P.shadowTint, 0.35);
      }
  }

  /* ---- Poké Ball: two halves, the top one hinged at the back ---- */
  function pokeball(fb, cx, cy, R, open = 0, tilt = 0, glow = 0, beam = null) {
    // bottom half (with the inside visible when open)
    const hx = cx - R * Math.cos(tilt), hy = cy - R * Math.sin(tilt) * 0; // hinge on the back-left
    const cs = Math.cos(tilt), sn = Math.sin(tilt);
    for (let y = -R - 2; y <= R + 2; y++)
      for (let x = -R - 2; x <= R + 2; x++) {
        // local coords of the (tilted) ball
        const lx = x * cs + y * sn, ly = -x * sn + y * cs;
        const d = Math.hypot(lx, ly);
        if (d > R + 0.5 || ly < 0) continue;
        let col;
        if (d > R - 1.2) col = C.k;
        else if (ly < 1.6) col = C.k;
        else col = lx - ly * 0.6 > R * 0.55 ? C.g2 : lx - ly > R * 0.1 ? C.g : C.w;
        if (open > 0.05 && ly < 3.2 && d < R - 1.6) col = C.in;
        fb.set(cx + x, cy + y, col);
      }
    // top half, rotated open around the hinge at local (-R, 0)
    const a = -open * 1.9;
    const ca = Math.cos(a), sa = Math.sin(a);
    const hxL = -R, hyL = 0;
    for (let y = -2 * R - 4; y <= R + 4; y++)
      for (let x = -2 * R - 4; x <= 2 * R + 4; x++) {
        let lx = x * cs + y * sn, ly = -x * sn + y * cs;
        // undo the lid rotation about the hinge
        const px = lx - hxL, py = ly - hyL;
        const ux = px * ca + py * sa + hxL, uy = -px * sa + py * ca + hyL;
        const d = Math.hypot(ux, uy);
        if (d > R + 0.5 || uy > 0) continue;
        let col;
        if (d > R - 1.2) col = C.k;
        else if (uy > -1.6) col = C.k;
        else col = ux + uy < -R * 0.85 ? C.r3 : ux - uy > R * 1.05 ? C.r2 : C.r;
        if (Math.hypot(ux + R * 0.38, uy + R * 0.52) < 1.3) col = C.w;
        fb.set(cx + x, cy + y, col);
      }
    // centre button (on the bottom half's rim when closed)
    if (open < 0.05) {
      const bx = cx + Math.round(R * 0 * cs), by = cy;
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y);
        if (d > 4.3) continue;
        fb.set(bx + x, by + y, d > 3.2 ? C.k : d > 2.2 ? (glow > 0 ? mixc(C.w, glow > 0 ? (beam === 'red' ? C.r : C.cy) : C.w, glow) : C.w) : glow > 0.3 ? (beam === 'red' ? C.r3 : C.cy) : C.g);
      }
    }
  }

  function star(fb, x, y, s, c = C.w, c2 = C.y) { Scenery.star(fb, Math.round(x), Math.round(y), s, c, c2); }
  function heart(fb, x, y) {
    const H = ['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
    const cols = { r: hex('#ff4a6a'), w: hex('#ffffff') };
    // bubble
    const bw = 13, bh = 11;
    for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
      if ((xx === 0 || xx === bw - 1) && (yy === 0 || yy === bh - 1)) continue;
      fb.set(x + xx, y + yy, xx === 0 || yy === 0 || xx === bw - 1 || yy === bh - 1 ? C.k : C.w);
    }
    for (let k = 0; k < 3; k++) { fb.set(x + 3 + k, y + bh - 1 + k, k === 2 ? C.k : C.w); fb.set(x + 2 + k, y + bh - 1 + k, C.k); fb.set(x + 4 + k, y + bh - 1 + k, C.k); }
    H.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch !== '.') fb.set(x + 3 + xx, y + 2 + yy, cols[ch]); }));
  }

  /* ================= thumbnail: 160x160, 60 frames @ 20 fps ================= */
  let thumbBG = null;
  const TW = 160, TH = 160, TN = 60;
  function thumb(f) {
    const camY = 398, groundY = 532;
    if (!thumbBG) thumbBG = background(TW, TH, 600, camY, groundY);
    const fb = new PX.Buf(TW, TH);
    fb.d.set(thumbBG.d);
    const s = f / 20;
    const gY = groundY - camY; // ground line in the frame
    const R = 13, BX = 50, BY = gY - R + 1;
    let open = 0, tilt = 0, glow = 0, beam = null;
    // ball wobble & opening
    if (s < 0.9) tilt = Math.sin(s * 16) * 0.28 * Math.sin(Math.min(1, s / 0.9) * Math.PI);
    else if (s < 1.05) glow = (s - 0.9) / 0.15;
    else if (s < 1.25) open = ease((s - 1.05) / 0.2);
    else if (s < 1.6) open = 1;
    else if (s < 1.75) open = 1 - ease((s - 1.6) / 0.15);
    if (s > 2.45 && s < 2.62) { glow = (s - 2.45) / 0.17; beam = 'red'; }
    if (s >= 2.62 && s < 2.72) { open = Math.sin(((s - 2.62) / 0.1) * Math.PI) * 0.35; beam = 'red'; }
    if (s >= 2.72) tilt = Math.sin((s - 2.72) * 22) * 0.18 * (1 - (s - 2.72) / 0.28);
    shadow(fb, BX, gY + 1, 10);
    // light burst from the open ball: rays + a soft glow
    if (s > 1.02 && s < 1.55) {
      const k = (s - 1.02) / 0.53;
      Scenery.glow(fb, BX + 0.5, BY - 4.5, 16 + k * 26, C.w, 0.8 * (1 - k), null, null, 3, 0.3);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.2;
        const r0 = 8 + k * 16, r1 = 16 + k * 44 * (i % 2 ? 0.7 : 1);
        for (let j = r0; j < r1; j++) {
          const x = Math.round(BX + Math.cos(a) * j), y = Math.round(BY - 5 + Math.sin(a) * j);
          if (bayer4(x, y) < k * 1.1 - 0.2) continue;
          fb.set(x, y, j > r1 - 3 ? C.cy : C.w);
        }
      }
    }
    // Mudkip
    const MX = 106, MY = gY + 2;
    let mk = null;
    if (s >= 1.1 && s < 1.6) {
      const k = (s - 1.1) / 0.5;
      const sc = lerp(0.3, 1.3, ease(Math.min(1, k * 1.2)));
      const x = lerp(BX, MX, ease(k)), y = lerp(BY - 4, MY, k) - Math.sin(k * Math.PI) * 46;
      const r = mudkip({ eyes: 'happy', mouth: 1, legF: -0.5, legB: 0.5, finSway: -0.2 }, 1.2, sc);
      const white = k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.35);
      put(fb, r, x, y, white > 0 ? (c) => mixc(c, C.w, white) : null);
      if (Math.floor(f / 2) % 2 === 0) for (let i = 0; i < 4; i++) star(fb, x + Math.cos(i * 1.7 + s * 9) * 22 * sc, y - 30 * sc + Math.sin(i * 2.3 + s * 7) * 18 * sc, 1 + (i & 1));
    } else if (s >= 1.6 && s < 2.62) {
      const u = s - 1.6;
      let hop = 0, sq = 0, eyes = 'happy', mouth = 1;
      if (u < 0.15) sq = Math.sin((u / 0.15) * Math.PI) * 0.18;
      else if (u < 0.5) hop = Math.sin(((u - 0.15) / 0.35) * Math.PI) * 16;
      else if (u < 0.6) sq = Math.sin(((u - 0.5) / 0.1) * Math.PI) * 0.12;
      else if (u < 0.9) hop = Math.sin(((u - 0.6) / 0.3) * Math.PI) * 12;
      else eyes = s > 2.45 ? 'open' : 'happy';
      shadow(fb, MX, gY + 1, Math.round(20 - hop * 0.3));
      const r = mudkip({ eyes, mouth, squash: sq, legF: hop > 0 ? -0.5 : 0, legB: hop > 0 ? 0.5 : 0, headRoll: Math.sin(u * 12) * 0.08, tailWag: Math.sin(u * 16) * 0.35, finSway: 0.04 - hop * 0.004 }, 1.9, 1.3);
      let map = null;
      if (s > 2.45) { const k = (s - 2.45) / 0.17; map = (c) => mixc(c, C.r, Math.min(1, k * 1.2)); }
      put(fb, r, MX, MY - hop, map);
      if (u > 0.2 && u < 0.85) heart(fb, MX + 12, MY - hop - 112);
      if (u < 0.3) for (let i = 0; i < 6; i++) star(fb, MX + Math.cos(i * 1.05) * (20 + u * 60), MY - 30 + Math.sin(i * 1.05) * (14 + u * 40), 1 + (i % 2));
      // red recall beam
      if (s > 2.45) for (let j = 0; j < 30; j++) { const k = j / 30; const x = Math.round(lerp(BX, MX, k)), y = Math.round(lerp(BY, MY - 30, k) + Math.sin(k * 12 + s * 40) * 2); if ((j + f) % 3) { fb.set(x, y, C.r); fb.set(x, y + 1, C.r3); } }
    } else if (s >= 2.62 && s < 2.72) {
      const k = (s - 2.62) / 0.1;
      const r = mudkip({ eyes: 'happy', mouth: 1 }, 1.9, lerp(1.3, 0.25, k));
      put(fb, r, lerp(MX, BX, k), lerp(MY, BY, k), () => (k > 0.5 ? C.r3 : C.r));
    }
    pokeball(fb, BX, BY, R, open, tilt, glow, beam);
    // wobble lines
    if (s < 0.9 && Math.abs(tilt) > 0.12) for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) { fb.set(BX + sd * (R + 4 + j), BY - 9 + j * 2, C.w); fb.set(BX + sd * (R + 4 + j), BY - 3 + j * 2, C.w); }
    frame(fb);
    return fb;
  }

  /* ================= banner: 480x160, 32 frames @ 16 fps ================= */
  let banBG = null;
  const BW = 480, BH = 160, BN = 32;
  function banner(f) {
    const camX = 520, camY = 392, groundY = 534;
    if (!banBG) {
      banBG = background(BW, BH, camX, camY, groundY, (fb) => {
        // beach props at both ends: umbrella + towel on the left, sandcastle on the right
        const pal = Props.palette(P);
        const um = Props.makeUmbrella(), tw = Props.makeTowel(), cs = Props.makeSandcastle();
        const gy = groundY - camY + 3;
        Props.blit(fb, tw, -20, gy - 6, pal);
        Props.blit(fb, um, 50 - 75, gy - um.h + 4, pal);
        Props.blit(fb, cs, BW - 58, gy - cs.h + 3, pal);
        for (const [x, st] of [[96, 1], [410, 0], [236, 1]]) {
          const pts = st ? [[0, -3], [-1, -1], [1, -1], [-3, -1], [3, -1], [-1, 0], [0, 0], [1, 0], [-2, 1], [2, 1], [-2, 2], [2, 2]] : [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [-1, 0], [0, 0], [1, 0], [0, 1]];
          for (const [dx, dy] of pts) fb.set(x + dx, gy + 6 + dy, pal[st ? Props.I.STAR : Props.I.SHELL]);
        }
      });
    }
    const fb = new PX.Buf(BW, BH);
    fb.d.set(banBG.d);
    const gY = groundY - camY + 3;
    const beat = (f / BN) * 4; // 4 beats per loop
    const bi = Math.floor(beat), u = beat - bi;
    const xs = [132, 204, 276, 348];
    const confC = [hex('#ff4a6a'), hex('#ffd83a'), hex('#5ab8ff'), hex('#c080ff'), hex('#ff9a2a'), hex('#6aff8a')];
    // confetti (looping)
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      const x0 = r() * BW, sp = 30 + r() * 30, ph = r();
      const y = ((ph * BH + (f / BN) * BH * 2) % (BH + 20)) - 10;
      const x = x0 + Math.sin((f / BN) * TAU * 2 + i) * 4;
      if (y > gY + 6) continue;
      const c = confC[i % confC.length];
      fb.set(Math.round(x), Math.round(y), c);
      if ((i + f) % 2) fb.set(Math.round(x) + 1, Math.round(y), c); else fb.set(Math.round(x), Math.round(y) + 1, c);
    }
    for (let k = 0; k < 4; k++) {
      const shiny = k === 1;
      // everyone hops on the beat and turns to the other side mid-air
      const hop = Math.sin(u * Math.PI) * 18;
      const from = bi % 2 === 0 ? 1.05 : Math.PI - 1.05, to = bi % 2 === 0 ? Math.PI - 1.05 : 1.05;
      const yaw = u < 0.2 ? from : u > 0.8 ? to : lerp(from, to, ease((u - 0.2) / 0.6));
      const sq = u < 0.08 ? Math.sin((u / 0.08) * Math.PI) * 0.14 : 0;
      const pose = { eyes: 'happy', mouth: 1, squash: sq, legF: hop > 3 ? -0.5 : 0, legB: hop > 3 ? 0.5 : 0, headRoll: Math.sin((beat + k * 0.25) * Math.PI) * 0.14, tailWag: Math.sin((beat * 2 + k * 0.5) * Math.PI) * 0.45, finSway: 0.04 - hop * 0.004 };
      shadow(fb, xs[k], gY + 1, Math.round(19 - hop * 0.35));
      put(fb, mudkip(pose, yaw, 1.18, shiny), xs[k], gY + 1 - hop);
      if (shiny) { const tw = f % 8; star(fb, xs[k] - 22, gY - 70 - hop, tw < 4 ? 2 : 1); star(fb, xs[k] + 24, gY - 46 - hop, tw < 4 ? 1 : 2); star(fb, xs[k] + 6, gY - 92 - hop, tw >= 4 ? 2 : 1); }
    }
    // music notes drifting up
    const NOTE = ['...kk', '..kkk', '..k.k', '..k..', '.kk..', 'kkk..', '.k...'];
    for (let i = 0; i < 6; i++) {
      const ph = ((f / BN) + i / 6) % 1;
      const x = 110 + i * 52 + Math.sin(ph * TAU + i) * 8, y = gY - 84 - ph * 56;
      if (ph > 0.85) continue;
      NOTE.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch !== '.') fb.set(Math.round(x) + xx, Math.round(y) + yy, i % 2 ? C.w : C.k); }));
    }
    frame(fb);
    return fb;
  }

  function toURL(fb) {
    const c = document.createElement('canvas');
    fb.toCanvas(c);
    return c.toDataURL('image/png');
  }
  return { thumb, banner, toURL, TN, BN, TW, TH, BW, BH };
})();
