/* ------------------------------------------------------------------
   Memories — cinematic scenes unlocked by big discoveries. Each one
   is a timeline of shots drawn full screen in pixel art: procedural
   dimensions (a tunnel of clocks, the lightless abyss, a sea of
   clouds under a wishing star, the edge of space, folded space),
   the legendary Pokémon rendered big from their 3D models, camera
   pans and shakes, flashes, particles and letterboxed dialogue with a
   typewriter (and the odd choice). Replay them from the Bag.
     I   The Heart of Time   — Dialga   (meet Dialga)
     II  The Deep Blue       — Kyogre   (wake Kyogre)
     III The Wishing Star    — Jirachi  (make a wish at Starfall Cave)
     IV  Sky Fall            — Deoxys   (Deoxys arrives)
     V   Palkia's Pocket     — Palkia   (meet Palkia)
------------------------------------------------------------------- */
const Memories = (() => {
  const { clamp, lerp, rnd, hex } = U;
  const TAU = Math.PI * 2;
  const INK = 0xff1b2240, WHITE = 0xffffffff, BLACK = 0xff000000;
  const M = { cur: null, queue: [] };
  const saved = () => Save.data.mem || (Save.data.mem = {});
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const outC = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const sp = (n) => { try { return (0, eval)(n); } catch (e) { return null; } };

  /* ================= drawing helpers (UI canvas) ================= */
  function vgrad(fb, stops, y0 = 0, y1 = fb.h) {
    const W = fb.w, d = fb.d, cols = stops.map((s) => [s[0], hex(s[1])]);
    for (let y = Math.max(0, y0); y < Math.min(fb.h, y1); y++) {
      const k = (y - y0) / Math.max(1, y1 - y0);
      let i = 0; while (i < cols.length - 2 && k > cols[i + 1][0]) i++;
      const f = clamp((k - cols[i][0]) / ((cols[i + 1][0] - cols[i][0]) || 1), 0, 1);
      const row = y * W;
      for (let x = 0; x < W; x++) d[row + x] = U.mix(cols[i][1], cols[i + 1][1], clamp(f + (U.bayer4(x, y) - 0.5) * 0.12, 0, 1));
    }
  }
  const put = (fb, x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) fb.d[y * fb.w + x] = c; };
  const add = (fb, x, y, c, a) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) { const i = y * fb.w + x; fb.d[i] = U.screen(fb.d[i], c, clamp(a, 0, 1)); } };
  const mixp = (fb, x, y, c, a) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) { const i = y * fb.w + x; fb.d[i] = U.mix(fb.d[i], c, clamp(a, 0, 1)); } };
  function glow(fb, x, y, r, c, a) { const R = Math.ceil(r); for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) { const d = Math.hypot(xx, yy) / r; if (d > 1) continue; add(fb, x + xx, y + yy, c, a * (1 - d) * (1 - d)); } }
  function disc(fb, x, y, r, c) { const R = Math.ceil(r); for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) if (xx * xx + yy * yy <= r * r) put(fb, x + xx, y + yy, c); }
  function ring(fb, x, y, r, c, th = 1, a = 1) { const R = Math.ceil(r + th); for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) { const d = Math.hypot(xx, yy); if (d <= r + th / 2 && d >= r - th / 2) a >= 1 ? put(fb, x + xx, y + yy, c) : add(fb, x + xx, y + yy, c, a); } }
  function line(fb, x0, y0, x1, y1, c, a = 1) { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1; for (let i = 0; i <= n; i++) { const k = i / n; const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k; a >= 1 ? put(fb, x, y, c) : add(fb, x, y, c, a); } }
  function stars(fb, seed, n, t, o = {}) {
    const W = fb.w, H = fb.h;
    for (let i = 0; i < n; i++) {
      const h1 = U.hash(i, seed, 1), h2 = U.hash(i, seed, 2), h3 = U.hash(i, seed, 3);
      let x = (h1 * W * 1.4 + (o.vx || 0) * t * (0.3 + h3)) % (W * 1.4) - W * 0.2, y = (h2 * H * 1.2 + (o.vy || 0) * t * (0.3 + h3)) % (H * 1.2) - H * 0.1;
      if (x < 0) x += W * 1.4; if (y < 0) y += H * 1.2;
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + h3 * 3) + i);
      const c = h3 > 0.85 ? hex('#ffe0a0') : h3 > 0.7 ? hex('#a0c8ff') : WHITE;
      if (h3 > 0.93) { glow(fb, x, y, 3, c, 0.5 * tw); put(fb, x, y, WHITE); put(fb, x - 1, y, c); put(fb, x + 1, y, c); put(fb, x, y - 1, c); put(fb, x, y + 1, c); }
      else add(fb, x, y, c, (o.a ?? 0.8) * (0.3 + 0.7 * tw));
    }
  }
  // soft cloud puffs along a line
  function clouds(fb, y, seed, t, cols0, o = {}) {
    const W = fb.w, cols = cols0.map(hex);
    for (let i = 0; i < (o.n || 14); i++) {
      const h = U.hash(i, seed, 5), r = (o.r || 26) * (0.6 + h * 0.8);
      const x = ((i / (o.n || 14)) * (W + 120) + t * (o.v ?? 6) * (0.5 + h)) % (W + 120) - 60, yy = y + (U.hash(i, seed, 6) - 0.5) * (o.jit ?? 16);
      for (let py = -r; py <= r * 0.5; py++) for (let px = -r * 1.4; px <= r * 1.4; px++) {
        const d = (px / 1.4) ** 2 + py * py; if (d > r * r) continue;
        const lit = clamp(-(py / r) * 0.8 + 0.4 - (px / r) * 0.1, 0, 1);
        const c = cols[clamp(Math.floor(lit * cols.length + (U.bayer4(px | 0, py | 0) - 0.5) * 0.6), 0, cols.length - 1)];
        put(fb, x + px, yy + py, c);
      }
    }
  }
  // blit a rendered sprite: centre (cx, cy), scale k (nearest); o: { tint, tk, sil, a (dither alpha), flip, rim, bright }
  function blit(fb, s, cx, cy, k = 1, o = {}) {
    if (!s) return;
    const W = fb.w, H = fb.h, w = Math.round(s.w * k), h = Math.round(s.h * k);
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    const rot = o.rot || 0, ca = Math.cos(rot), sa = Math.sin(rot);
    const R = rot ? Math.ceil(Math.hypot(w, h) / 2) + 1 : 0;
    const X0 = rot ? Math.round(cx) - R : x0, Y0 = rot ? Math.round(cy) - R : y0, X1 = rot ? Math.round(cx) + R : x0 + w, Y1 = rot ? Math.round(cy) + R : y0 + h;
    for (let Y = Math.max(0, Y0); Y < Math.min(H, Y1); Y++) for (let X = Math.max(0, X0); X < Math.min(W, X1); X++) {
      let u, v;
      if (rot) { const dx = X - cx, dy = Y - cy; u = (dx * ca + dy * sa) / k + s.w / 2; v = (-dx * sa + dy * ca) / k + s.h / 2; }
      else { u = (X - x0) / k; v = (Y - y0) / k; }
      u = Math.floor(u); v = Math.floor(v);
      if (u < 0 || v < 0 || u >= s.w || v >= s.h) continue;
      let c = s.d[v * s.w + (o.flip ? s.w - 1 - u : u)]; if (!c) continue;
      if (o.a !== undefined && o.a < 1 && U.bayer4(X, Y) >= o.a) continue;
      if (o.sil !== undefined) {
        c = o.sil;
        if (o.rim) { const e = (u > 0 && !s.d[v * s.w + (o.flip ? s.w - u : u - 1)]) || (v > 0 && !s.d[(v - 1) * s.w + (o.flip ? s.w - 1 - u : u)]); if (e) c = o.rim; }
      } else if (o.tint) c = U.mix(c, o.tint, o.tk ?? 0.4);
      if (o.bright) c = U.screen(c, WHITE, o.bright);
      fb.d[Y * W + X] = c;
    }
  }
  function text(fb, s, x, y, c, o = {}) { Font.draw(fb, s, x, y, c, Object.assign({ font: 'body' }, o)); }

  /* ================= the cast: legendary sprites rendered big from their models ================= */
  function makeCast(list) {
    const out = {};
    const P = Times.compile('noon');
    for (const [id, o] of Object.entries(list)) {
      const S = sp(o.sp); if (!S) continue;
      const c = new Critters.Critter(S, { kind: 'mem-' + id, scale: o.scale, yaw: o.yaw ?? 1.2, pitch: o.pitch ?? 0.12, pal: o.pal || S.PAL, qPose: 0.01 });
      c.noHD = true; c.pose = Object.assign({}, o.pose || {});
      if (o.sp === 'Mudkip') Object.assign(c.pose, Save.look(), { neck: null, hold: null });
      out[id] = { c, P };
    }
    return out;
  }
  function pumpCast(cast, force) { let ok = true; for (const k in cast) { const e = cast[k]; if (!e.c.spr) { e.c.sprite(e.P, force); if (!e.c.spr) ok = false; } } return ok; }
  const S_ = (C, id) => (C.cast[id] ? C.cast[id].c.spr : null);

  /* ================= particles ================= */
  function part(C, p) { C.fx.push(Object.assign({ t: 0, life: 1, vx: 0, vy: 0, g: 0, s: 1, c: WHITE, a: 1 }, p)); }
  function stepFx(C, dt) { for (const p of C.fx) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; } C.fx = C.fx.filter((p) => p.t < p.life); }
  function drawFx(fb, C) {
    for (const p of C.fx) {
      const k = p.t / p.life, a = p.a * (1 - k);
      if (p.kind === 'streak') { line(fb, p.x, p.y, p.x - p.vx * 0.05, p.y - p.vy * 0.05, p.c, a); continue; }
      if (p.kind === 'bubble') { ring(fb, Math.round(p.x), Math.round(p.y), p.s, p.c, 1, 0.7 * a); put(fb, p.x - p.s * 0.4, p.y - p.s * 0.4, WHITE); continue; }
      if (p.kind === 'glow') { glow(fb, p.x, p.y, p.s, p.c, a); continue; }
      if (p.s <= 1) add(fb, p.x, p.y, p.c, a); else disc(fb, Math.round(p.x), Math.round(p.y), p.s * (1 - k * 0.5), p.c);
    }
  }

  /* ================= scenes ================= */
  const MK = { sp: 'Mudkip', scale: 1.15, pose: { eyes: 'open', mouth: 0.3 } };
  const mkPoses = {
    mk: MK, mkHappy: { sp: 'Mudkip', scale: 1.15, pose: { eyes: 'happy', mouth: 1 } }, mkShock: { sp: 'Mudkip', scale: 1.15, pose: { eyes: 'open', mouth: 1, headPitch: -0.25, finSway: -0.25, squash: -0.05 } },
    mkUp: { sp: 'Mudkip', scale: 1.15, pose: { eyes: 'open', mouth: 0.6, headPitch: -0.42 } }, mkDizzy: { sp: 'Mudkip', scale: 1.15, pose: { eyes: 'blink', mouth: 0.3, headRoll: 0.25 } },
    mkTilt: { sp: 'Mudkip', scale: 1.15, yaw: Math.PI / 2 - 0.2, pose: { eyes: 'open', mouth: 0.4, headRoll: 0.3 } },
  };
  const SCENES = {
    /* ---------------- I · Dialga ---------------- */
    dialga: {
      no: 'I', title: 'The Heart of Time', who: 'Dialga', trigger: 'dialga.met', reward: 'pts:1000',
      cast: Object.assign({ dia: { sp: 'Dialga', scale: 1.9, yaw: 1.35, pose: { eyes: 'open', gem: 1, mouth: 0 } }, diaRoar: { sp: 'Dialga', scale: 1.9, yaw: 1.35, pose: { eyes: 'open', gem: 1, roar: 1, headPitch: -0.2 } } }, mkPoses),
      shots: [
        { d: 3.2, title: true, draw: (fb, k, t, C) => { vgrad(fb, [[0, '#04030c'], [1, '#0c0a24']]); for (let i = 0; i < 3; i++) ring(fb, fb.w / 2, fb.h / 2, 30 + i * 26 + k * 20, hex('#5a4ad0'), 1, 0.4 * (1 - k)); }, sfx: [[0.2, 'tick'], [1.2, 'tick'], [2.2, 'tick']] },
        { d: 4.2, say: ['', '(Mudkip is falling... through a tunnel of clocks?!)'], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#07061a'], [0.5, '#1a1250'], [1, '#07061a']]);
          const cx = fb.w / 2, cy = fb.h / 2;
          for (let i = 0; i < 9; i++) {
            const z = ((i / 9 + t * 0.35) % 1), r = 8 + z * z * fb.w * 0.9, a = z * (1 - z) * 3.2;
            ring(fb, cx, cy, r, hex(i % 2 ? '#c8a040' : '#7ad0ff'), Math.max(1, z * 4), a);
            for (let n = 0; n < 12; n++) { const an = n / 12 * TAU + t * (i % 2 ? 0.6 : -0.4); line(fb, cx + Math.cos(an) * r, cy + Math.sin(an) * r, cx + Math.cos(an) * (r - 4 - z * 10), cy + Math.sin(an) * (r - 4 - z * 10), hex('#fff0b0'), a); }
          }
          if (Math.random() < 0.6) { const an = Math.random() * TAU; part(C, { kind: 'streak', x: cx + Math.cos(an) * 10, y: cy + Math.sin(an) * 10, vx: Math.cos(an) * 420, vy: Math.sin(an) * 420, life: 0.6, c: hex('#b0e8ff') }); }
          drawFx(fb, C);
          blit(fb, S_(C, 'mkShock'), cx + Math.sin(t * 2) * 6, cy + Math.cos(t * 1.6) * 4, 0.55 + k * 0.25, { rot: t * 3.2 });
        } },
        { d: 3.6, say: ['Mudkip', 'Mud...? Kip...?'], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#0a0826'], [0.6, '#241a5a'], [1, '#3a2a6a']]);
          stars(fb, 3, 90, t, { vx: 3, a: 0.6 });
          // drifting gears in the distance
          for (let i = 0; i < 5; i++) { const gx = (i * 137 + t * 6) % (fb.w + 80) - 40, gy = 40 + (i * 53) % (fb.h * 0.5), r = 10 + (i * 7) % 14; ring(fb, gx, gy, r, hex('#6a5aa8'), 2, 0.5); for (let n = 0; n < 10; n++) { const an = n / 10 * TAU + t * (i % 2 ? 0.5 : -0.5); put(fb, gx + Math.cos(an) * (r + 2), gy + Math.sin(an) * (r + 2), hex('#8a7ac8')); } }
          floatIsland(fb, fb.w / 2, fb.h * 0.72, fb.w * 0.34, t);
          const land = outC(k * 3), sq = k < 0.34 ? 0 : Math.max(0, 1 - (k - 0.34) * 5);
          blit(fb, S_(C, k < 0.5 ? 'mkDizzy' : 'mk'), fb.w / 2, lerp(-40, fb.h * 0.72 - 32, land) + sq * 3, 0.55);
          if (k > 0.34 && k < 0.4) C.shake = 3;
        } },
        { d: 5.2, shake: [2.2, 5], draw: (fb, k, t, C) => {
          const pan = ease(clamp(k * 1.4, 0, 1));
          vgrad(fb, [[0, '#050418'], [0.5, '#1a1250'], [1, '#2a1e5e']]);
          stars(fb, 5, 110, t, { vx: 2, a: 0.7 });
          const cy = lerp(fb.h * 1.1, fb.h * 0.45, pan), cx = fb.w / 2;
          // the great clock
          const R = Math.min(fb.w, fb.h) * 0.42;
          for (let r = R; r > R - 5; r--) ring(fb, cx, cy, r, hex('#c8a040'), 1, 0.8);
          ring(fb, cx, cy, R - 12, hex('#7ad0ff'), 1, 0.5);
          for (let n = 0; n < 12; n++) { const an = n / 12 * TAU; line(fb, cx + Math.cos(an) * (R - 8), cy + Math.sin(an) * (R - 8), cx + Math.cos(an) * (R - 18), cy + Math.sin(an) * (R - 18), hex('#fff0b0')); }
          const h1 = -t * 2.4, h2 = -t * 0.4;
          line(fb, cx, cy, cx + Math.cos(h1) * R * 0.8, cy + Math.sin(h1) * R * 0.8, hex('#fff0b0'));
          line(fb, cx, cy, cx + Math.cos(h2) * R * 0.5, cy + Math.sin(h2) * R * 0.5, hex('#fff0b0'));
          // Dialga rises behind it, a silhouette with a burning heart
          const rise = ease(clamp((k - 0.35) / 0.5, 0, 1));
          const ds = S_(C, 'dia');
          if (ds) { blit(fb, ds, cx, lerp(fb.h + ds.h, cy + 10, rise), 1, { sil: hex('#0a0820'), rim: hex('#6a8aff') }); if (rise > 0.6) { glow(fb, cx - 4, cy + 10 + ds.h * 0.05, 10 + Math.sin(t * 6) * 3, hex('#5ae0ff'), 0.9); } if (k > 0.82) { const e = (k - 0.82) / 0.18; glow(fb, cx + ds.w * 0.12, cy - ds.h * 0.3, 6, hex('#ff3a3a'), e); } }
          if (k > 0.85 && !C.roared) { C.roared = 1; Game.sfx('dialga', null, 1); C.shake = 6; C.flash = 0.4; }
        } },
        { d: 5, say: ['Dialga', '...Small one. You have been playing with my time.'], draw: (fb, k, t, C) => { dialgaStage(fb, t, C, 'dia', 0); } },
        { d: 4.4, say: ['Mudkip', 'Kip...? (Sorry?)'], draw: (fb, k, t, C) => { dialgaStage(fb, t, C, 'dia', 1); blit(fb, S_(C, 'mkShock'), fb.w * 0.24, fb.h * 0.7 + Math.sin(t * 20) * 0.6, 0.62); glow(fb, fb.w * 0.24 + 16, fb.h * 0.52, 3, hex('#8ad0ff'), 0.8); } },
        { d: 5.4, say: ['Dialga', 'Do not be afraid. I have watched you wait... for the perfect moment.'], draw: (fb, k, t, C) => { dialgaStage(fb, t, C, 'dia', 0); } },
        { d: 5.6, say: ['Dialga', 'Every photo you take is a moment I let you keep. Treasure them.'], draw: (fb, k, t, C) => {
          // time stops: everything drains to blue and a drop of water hangs in the air
          dialgaStage(fb, t * (1 - k), C, 'diaRoar', 0);
          for (let i = 0; i < fb.d.length; i += 1) { const c = fb.d[i], l = U.lum ? U.lum(c) : ((c & 255) + ((c >> 8) & 255) + ((c >> 16) & 255)) / 3; fb.d[i] = U.mix(c, U.pack(l * 0.5, l * 0.7, l * 1.1), k * 0.8); }
          blit(fb, S_(C, 'mkUp'), fb.w * 0.24, fb.h * 0.7, 0.62);
          const dx = fb.w * 0.5, dy = fb.h * 0.35; disc(fb, dx, dy, 3, hex('#9fe8ff')); put(fb, dx - 1, dy - 1, WHITE); ring(fb, dx, dy, 6 + Math.sin(t * 2) * 1, hex('#ffffff'), 1, 0.4);
        } },
        { d: 3.2, flashAt: 0.4, draw: (fb, k, t, C) => { dialgaStage(fb, t, C, 'diaRoar', 0); glow(fb, fb.w / 2, fb.h * 0.45, 40 + k * 300, hex('#9ff0ff'), k * 1.5); if (k > 0.35 && !C.boom) { C.boom = 1; C.flash = 1; Game.sfx('timewave', null, 1); } } },
      ],
    },
    /* ---------------- II · Kyogre ---------------- */
    kyogre: {
      no: 'II', title: 'The Deep Blue', who: 'Kyogre', trigger: 'kyogre.woke', reward: 'fun.ring',
      cast: Object.assign({ kyo: { sp: 'Kyogre', scale: 0.5, yaw: 0.25, pose: { eyes: 'open', glow: 1, fin: 0.3 } }, kyoOpen: { sp: 'Kyogre', scale: 0.5, yaw: 0.25, pose: { eyes: 'open', glow: 1, mouth: 1, fin: -0.3 } } }, mkPoses),
      shots: [
        { d: 3.2, title: true, draw: (fb, k, t) => { vgrad(fb, [[0, '#020818'], [1, '#051a36']]); }, sfx: [[0.3, 'bubble'], [1.6, 'bubble']] },
        { d: 5, say: ['', '(Deeper... and deeper... The light fades away.)'], draw: (fb, k, t, C) => {
          const dep = k;
          vgrad(fb, [[0, U.css ? '#1a6ab0' : '#1a6ab0'], [1, '#062044']]);
          for (let i = 0; i < fb.d.length; i++) fb.d[i] = U.mix(fb.d[i], 0xff080402, dep * 0.8);
          // god rays from far above
          for (let r = 0; r < 5; r++) for (let y = 0; y < fb.h; y++) { const x = fb.w * (0.2 + r * 0.16) + y * 0.35 + Math.sin(t * 0.4 + r) * 10; for (let w = -3; w <= 3; w++) add(fb, x + w, y, hex('#9fe0ff'), 0.12 * (1 - dep) * (1 - y / fb.h)); }
          if (Math.random() < 0.5) part(C, { kind: 'bubble', x: fb.w * 0.5 + rnd(-20, 20), y: fb.h * 0.6, vy: -40 - rnd(0, 30), vx: rnd(-5, 5), life: 2.5, s: 1 + Math.random() * 2, c: hex('#bfefff') });
          drawFx(fb, C);
          blit(fb, S_(C, 'mk'), fb.w / 2, fb.h * 0.55 + Math.sin(t * 1.5) * 4, 0.5, { tint: hex('#1a3a6a'), tk: 0.3 + dep * 0.4 });
          text(fb, Math.round(20 + dep * 1480) + ' m', fb.w - 12, fb.h * 0.2, hex('#8ad0ff'), { font: 'small', align: 'right' });
        } },
        { d: 4.2, say: ['Mudkip', '...Mud? (It is so dark.)'], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#010308'], [1, '#020a18']]);
          for (let i = 0; i < 70; i++) { const x = (U.hash(i, 9, 1) * fb.w + Math.sin(t * 0.3 + i) * 8), y = (U.hash(i, 9, 2) * fb.h + t * 4 * (0.3 + U.hash(i, 9, 3))) % fb.h; add(fb, x, y, U.hash(i, 9, 3) > 0.5 ? hex('#3affd0') : hex('#5a8aff'), 0.4 + 0.4 * Math.sin(t * 2 + i)); }
          blit(fb, S_(C, 'mkShock'), fb.w / 2, fb.h * 0.6, 0.5, { tint: hex('#020612'), tk: 0.75 });
          glow(fb, fb.w / 2 + 10, fb.h * 0.5, 2, WHITE, 0.9);
        } },
        { d: 4.6, shake: [0.4, 3], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#010308'], [1, '#020a18']]);
          // two enormous red eyes open in the dark
          const o = outC(k * 2), cx = fb.w / 2, cy = fb.h * 0.42;
          for (const sx of [-1, 1]) { const ex = cx + sx * fb.w * 0.2, ey = cy; for (let y = -8; y <= 8; y++) for (let x = -22; x <= 22; x++) { if ((x / 22) ** 2 + (y / (8 * o + 0.01)) ** 2 > 1) continue; put(fb, ex + x, ey + y, (x / 22) ** 2 + (y / (8 * o + 0.01)) ** 2 > 0.5 ? hex('#ff2a3a') : hex('#ffd0a0')); } glow(fb, ex, ey, 30, hex('#ff2a3a'), 0.6 * o); }
          if (k > 0.2 && !C.rum) { C.rum = 1; Game.sfx('rumble', null, 1); }
        } },
        { d: 5.6, say: ['Kyogre', 'The sea remembers every splash you ever made, little Mudkip.'], draw: (fb, k, t, C) => { kyogreStage(fb, t, C, 'kyo', k); } },
        { d: 5.2, say: ['Kyogre', 'Swim well. Listen to the waves. They sing about you.'], draw: (fb, k, t, C) => { kyogreStage(fb, t, C, 'kyoOpen', 1); blit(fb, S_(C, 'mkHappy'), fb.w * 0.86, fb.h * 0.74 + Math.sin(t * 2) * 3, 0.5, { tint: hex('#0a2a5a'), tk: 0.35 }); } },
        { d: 3.4, draw: (fb, k, t, C) => {
          kyogreStage(fb, t, C, 'kyoOpen', 1);
          for (let i = 0; i < 12; i++) part(C, { kind: 'bubble', x: rnd(0, fb.w), y: fb.h + 5, vy: -rnd(160, 320), vx: rnd(-20, 20), life: 1.6, s: 1 + Math.random() * 4, c: hex('#e0faff') });
          drawFx(fb, C);
          if (k > 0.6 && !C.boom) { C.boom = 1; C.flash = 1; Game.sfx('splash', null, 1); }
        } },
      ],
    },
    /* ---------------- III · Jirachi ---------------- */
    jirachi: {
      no: 'III', title: 'The Wishing Star', who: 'Jirachi', trigger: 'falls.wish', reward: 'pts:1500',
      cast: Object.assign({ jir: { sp: 'Jirachi', scale: 1.7, yaw: 1.45, pose: { eyes: 'closed', float: 1, tags: 0.3, arms: 0.2 } }, jirAwake: { sp: 'Jirachi', scale: 1.7, yaw: 1.45, pose: { eyes: 'happy', float: 1, tags: -0.3, arms: 1, mouth: 1 } } }, mkPoses),
      shots: [
        { d: 3.2, title: true, draw: (fb, k, t) => { vgrad(fb, [[0, '#050418'], [1, '#141040']]); stars(fb, 21, 60, t, { a: 0.5 * k }); }, sfx: [[0.4, 'sparkle'], [1.8, 'sparkle']] },
        { d: 5, say: ['', '(Above a sea of clouds, under a thousand stars...)'], draw: (fb, k, t, C) => { wishSky(fb, t, C); blit(fb, S_(C, 'mkUp'), fb.w * 0.3, fb.h * 0.74, 0.55); } },
        { d: 5.4, say: ['Jirachi', 'Yaaawn... You woke me up! I only wake once every thousand years...'], draw: (fb, k, t, C) => { wishSky(fb, t, C); const y = lerp(-60, fb.h * 0.4, outC(k * 2)); blit(fb, S_(C, k < 0.5 ? 'jir' : 'jirAwake'), fb.w * 0.62, y + Math.sin(t * 2) * 3, 1); tagsFx(fb, fb.w * 0.62, y - 30, t); blit(fb, S_(C, 'mkShock'), fb.w * 0.3, fb.h * 0.74, 0.55); } },
        { d: 5, say: ['Jirachi', '...so it had better be a GOOD wish! What do you wish for?'], choices: ['The perfect photo!', 'Lots more friends!'], draw: (fb, k, t, C) => { wishSky(fb, t, C); blit(fb, S_(C, 'jirAwake'), fb.w * 0.62, fb.h * 0.4 + Math.sin(t * 2) * 3, 1); tagsFx(fb, fb.w * 0.62, fb.h * 0.4 - 30, t); blit(fb, S_(C, 'mkTilt'), fb.w * 0.3, fb.h * 0.74, 0.55); } },
        { d: 5.2, say: ['Jirachi', '{wish}'], draw: (fb, k, t, C) => {
          wishSky(fb, t, C);
          const cx = fb.w * 0.62, cy = fb.h * 0.4;
          for (let i = 0; i < 40; i++) { const a = i / 40 * TAU + t * 1.5, r = (1 - k) * 120 + 10 + Math.sin(i) * 6; glow(fb, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, 3, hex('#fff0a0'), 0.7); }
          blit(fb, S_(C, 'jirAwake'), cx, cy + Math.sin(t * 2) * 3, 1, { bright: 0.2 + 0.2 * Math.sin(t * 8) });
          blit(fb, S_(C, 'mkHappy'), fb.w * 0.3, fb.h * 0.74, 0.55);
          if (!C.chime) { C.chime = 1; Game.sfx('evolve', null, 0.7); }
        } },
        { d: 5, say: ['', '(The stars draw a little Mudkip in the sky... and Jirachi falls asleep mid-air.)'], draw: (fb, k, t, C) => {
          wishSky(fb, t, C);
          const pts = [[0, 0], [14, -6], [26, -2], [34, 8], [30, 20], [14, 24], [0, 18], [-6, 8], [4, -18], [10, -30], [16, -18]], cx = fb.w * 0.5, cy = fb.h * 0.3, n = Math.floor(k * pts.length * 1.3);
          for (let i = 0; i < Math.min(pts.length, n); i++) { const [x, y] = pts[i]; glow(fb, cx + x * 2, cy + y * 2, 4, hex('#fff0c0'), 0.8); put(fb, cx + x * 2, cy + y * 2, WHITE); if (i) line(fb, cx + pts[i - 1][0] * 2, cy + pts[i - 1][1] * 2, cx + x * 2, cy + y * 2, hex('#c0d8ff'), 0.6); }
          blit(fb, S_(C, 'jir'), fb.w * 0.75, fb.h * 0.52 + Math.sin(t * 1.2) * 5, 0.8, { rot: Math.sin(t) * 0.2 });
          text(fb, 'z', fb.w * 0.8 + Math.sin(t * 2) * 3, fb.h * 0.35 - (t * 8) % 20, WHITE, { font: 'title' });
          blit(fb, S_(C, 'mkHappy'), fb.w * 0.3, fb.h * 0.74, 0.55);
        } },
      ],
    },
    /* ---------------- IV · Deoxys ---------------- */
    deoxys: {
      no: 'IV', title: 'Sky Fall', who: 'Deoxys', trigger: 'falls.deoxys', reward: 'shoes.sneakers',
      cast: Object.assign({ deo: { sp: 'Deoxys', scale: 0.85, yaw: 1.5, pose: { eyes: 'open', fly: 1 } }, deoA: { sp: 'Deoxys', scale: 0.85, yaw: 1.5, pose: { eyes: 'open', form: 'attack', morph: 1, fly: 1 } }, deoS: { sp: 'Deoxys', scale: 0.85, yaw: 1.5, pose: { eyes: 'open', form: 'speed', morph: 1, fly: 1, lean: 0.4 } }, deoTilt: { sp: 'Deoxys', scale: 0.85, yaw: 1.5, pose: { eyes: 'open', fly: 1, lean: -0.25 } } }, mkPoses),
      shots: [
        { d: 3.2, title: true, draw: (fb, k, t) => { vgrad(fb, [[0, '#000000'], [1, '#0a0418']]); stars(fb, 41, 80, t, { a: 0.4 }); } },
        { d: 5, say: ['', '(At the edge of space, where the sky turns black...)'], draw: (fb, k, t, C) => { spaceEdge(fb, t, C, k); } },
        { d: 4.6, shake: [0.55, 4], draw: (fb, k, t, C) => {
          spaceEdge(fb, t, C, 1);
          const mx = lerp(fb.w * 1.1, fb.w * 0.5, ease(clamp(k * 1.6, 0, 1))), my = lerp(-20, fb.h * 0.45, ease(clamp(k * 1.6, 0, 1)));
          for (let i = 0; i < 30; i++) glow(fb, mx + i * 4, my - i * 2.6, 7 - i * 0.2, hex('#ff8a3a'), 0.3);
          glow(fb, mx, my, 10, hex('#fff0c0'), 1);
          if (k > 0.6) { const e = (k - 0.6) / 0.4; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; line(fb, mx, my, mx + Math.cos(a) * e * 160, my + Math.sin(a) * e * 160, hex('#ffd0f0'), 1 - e); } if (!C.boom) { C.boom = 1; C.flash = 0.8; Game.sfx('crack', null, 1); } }
        } },
        { d: 5.2, say: ['', '(A strange shape takes form in the light... and changes... and changes again.)'], draw: (fb, k, t, C) => {
          spaceEdge(fb, t, C, 1);
          const forms = ['deo', 'deoA', 'deoS', 'deo'], f = forms[Math.min(3, Math.floor(k * 4))], ph = (k * 4) % 1;
          if (ph < 0.08 && C.lastF !== f) { C.lastF = f; C.flash = 0.35; Game.sfx('portal', null, 0.6); }
          blit(fb, S_(C, f), fb.w / 2, fb.h * 0.48 + Math.sin(t * 2) * 4, 1, { bright: ph < 0.1 ? 0.6 : 0 });
          for (let i = 0; i < 6; i++) { const a = t * 2 + i; glow(fb, fb.w / 2 + Math.cos(a) * 60, fb.h * 0.48 + Math.sin(a * 1.3) * 40, 3, hex('#a0f0ff'), 0.5); }
        } },
        { d: 5, say: ['Deoxys', '................'], draw: (fb, k, t, C) => { spaceEdge(fb, t, C, 1); blit(fb, S_(C, k < 0.5 ? 'deo' : 'deoTilt'), fb.w * 0.66, fb.h * 0.46 + Math.sin(t * 2) * 3, 1); bubbleMk(fb, C, fb.w * 0.26, fb.h * 0.6, t, k < 0.4 ? 'mk' : 'mkTilt'); } },
        { d: 4.6, say: ['Mudkip', 'Kip?'], draw: (fb, k, t, C) => { spaceEdge(fb, t, C, 1); blit(fb, S_(C, 'deoTilt'), fb.w * 0.66, fb.h * 0.46 + Math.sin(t * 2) * 3, 1); bubbleMk(fb, C, fb.w * 0.26, fb.h * 0.6, t, 'mkTilt'); } },
        { d: 5, say: ['Deoxys', '...Kip?'], draw: (fb, k, t, C) => { spaceEdge(fb, t, C, 1); blit(fb, S_(C, 'deoTilt'), fb.w * 0.66, fb.h * 0.46 + Math.sin(t * 2) * 3, 1, { rot: 0.25 }); bubbleMk(fb, C, fb.w * 0.26, fb.h * 0.6, t, 'mkHappy'); if (!C.kip) { C.kip = 1; Game.sfx('chirp', null, 0.8); } } },
        { d: 3.6, draw: (fb, k, t, C) => {
          spaceEdge(fb, t, C, 1);
          const x = lerp(fb.w * 0.66, fb.w * 1.4, ease(k)), y = lerp(fb.h * 0.46, -fb.h * 0.3, ease(k));
          for (let i = 0; i < 12; i++) blit(fb, S_(C, 'deoS'), lerp(fb.w * 0.66, x, i / 12), lerp(fb.h * 0.46, y, i / 12), 1, { a: 0.1 + i * 0.05, tint: hex('#ff8a3a'), tk: 0.6 });
          bubbleMk(fb, C, fb.w * 0.26, fb.h * 0.6, t, 'mkShock');
          if (k > 0.7 && !C.boom2) { C.boom2 = 1; C.flash = 1; Game.sfx('whoosh', null, 1); }
        } },
      ],
    },
    /* ---------------- V · Palkia ---------------- */
    palkia: {
      no: 'V', title: "Palkia's Pocket", who: 'Palkia', trigger: 'palkia.met', reward: 'pts:1500',
      cast: Object.assign({ pal: { sp: 'Palkia', scale: 1.7, yaw: 1.35, pose: { eyes: 'open' } }, palRoar: { sp: 'Palkia', scale: 1.7, yaw: 1.35, pose: { eyes: 'open', roar: 1, headPitch: -0.2 } } }, mkPoses),
      shots: [
        { d: 3.2, title: true, draw: (fb, k, t) => { vgrad(fb, [[0, '#12061a'], [1, '#2a0e30']]); } },
        { d: 4.6, say: ['', '(The world splits into pieces and drifts apart...)'], draw: (fb, k, t, C) => { shards(fb, t, C, ease(k)); } },
        { d: 5, say: ['Palkia', 'Welcome to my pocket, tiny traveller.'], draw: (fb, k, t, C) => { pocketSky(fb, t, C); const y = lerp(fb.h * 1.2, fb.h * 0.46, outC(k * 1.6)); blit(fb, S_(C, 'pal'), fb.w * 0.62, y, 1); glow(fb, fb.w * 0.62 - 20, y - 20, 8, hex('#ffc8f0'), 0.6 + 0.3 * Math.sin(t * 4)); blit(fb, S_(C, 'mkShock'), fb.w * 0.25, fb.h * 0.74, 0.55); } },
        { d: 5.2, say: ['Palkia', 'Space is enormous. Your world is small. That is what makes it precious.'], draw: (fb, k, t, C) => { pocketSky(fb, t, C); blit(fb, S_(C, 'pal'), fb.w * 0.62, fb.h * 0.46 + Math.sin(t * 1.5) * 3, 1); blit(fb, S_(C, 'mk'), fb.w * 0.25, fb.h * 0.74, 0.55); } },
        { d: 4.8, shake: [0.2, 4], say: ['Mudkip', 'Mud-kiiiiiiiiiip!'], draw: (fb, k, t, C) => {
          // space stretches, and so does Mudkip
          pocketSky(fb, t, C);
          blit(fb, S_(C, 'palRoar'), fb.w * 0.62, fb.h * 0.46, 1);
          const st = 1 + Math.sin(k * Math.PI) * 1.2, s = S_(C, 'mkShock');
          if (s) { const w = s.w * 0.55, h = s.h * 0.55 * st, x0 = fb.w * 0.25 - w / 2, y0 = fb.h * 0.74 - h / 2; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = s.d[Math.floor(y / h * s.h) * s.w + Math.floor(x / w * s.w)]; if (c) put(fb, x0 + x + Math.sin(y * 0.2 + t * 9) * 3, y0 + y, c); } }
          if (!C.roar) { C.roar = 1; Game.sfx('roar', null, 0.8); }
        } },
        { d: 3.4, draw: (fb, k, t, C) => { shards(fb, t, C, 1 - ease(k)); if (k > 0.8 && !C.boom) { C.boom = 1; C.flash = 1; Game.sfx('portal', null, 1); } } },
      ],
    },

    /* ---------------- VI · Groudon ---------------- */
    groudon: {
      no: 'VI', title: 'The Land Awakens', who: 'Groudon', trigger: 'groudon.woke', reward: 'pts:1500', delay: 7000,
      cast: Object.assign({ gro: { sp: 'Groudon', scale: 0.44, yaw: 1.2, pose: { eyes: 'open', glow: 1 } }, groRoar: { sp: 'Groudon', scale: 0.44, yaw: 1.2, pose: { eyes: 'open', glow: 1, roar: 1, mouth: 1 } } }, mkPoses),
      shots: [
        { d: 3, title: true, draw: (fb, k, t) => { vgrad(fb, [[0, '#1a0404'], [1, '#3a0a04']]); }, sfx: [[0.3, 'rumble']] },
        { d: 4.6, say: ['', '(The ground is warm... and beating, like a giant heart.)'], shake: [0.5, 2], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#2a0806'], [0.6, '#6a1a08'], [1, '#c8400c']]);
          for (let x = 0; x < fb.w; x++) { const y = fb.h * 0.72 + Math.sin(x * 0.05 + t) * 3; for (let yy = Math.round(y); yy < fb.h; yy++) put(fb, x, yy, U.mix(hex('#ffb030'), hex('#c8200a'), clamp((yy - y) / 30 + Math.sin(x * 0.2 + t * 3) * 0.2, 0, 1))); }
          if (Math.random() < 0.6) part(C, { kind: 'spark', x: rnd(0, fb.w), y: fb.h * 0.72, vy: -rnd(30, 80), vx: rnd(-10, 10), life: 1.6, c: hex('#ffd060') });
          drawFx(fb, C);
          blit(fb, S_(C, 'mkShock'), fb.w * 0.3, fb.h * 0.62, 0.5, { tint: hex('#401008'), tk: 0.3 });
        } },
        { d: 5.4, shake: [1.2, 6], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#300a06'], [0.55, '#8a2a0a'], [1, '#ff7a1a']]);
          const rise = ease(clamp(k * 1.3, 0, 1)), gs = S_(C, 'gro');
          if (gs) { const y = lerp(fb.h + gs.h * 0.5, fb.h * 0.5, rise); blit(fb, gs, fb.w * 0.58, y, 1, { tint: hex('#401008'), tk: 0.25 * (1 - rise) }); for (let i = 0; i < 5; i++) glow(fb, fb.w * 0.58 + (i - 2) * gs.w * 0.14, y + Math.sin(i) * gs.h * 0.2, 8 + Math.sin(t * 5 + i) * 2, hex('#ffe070'), 0.5 * rise); }
          for (let x = 0; x < fb.w; x++) { const y = fb.h * 0.8 + Math.sin(x * 0.05 + t) * 3; for (let yy = Math.round(y); yy < fb.h; yy++) put(fb, x, yy, U.mix(hex('#ffc040'), hex('#c8200a'), clamp((yy - y) / 20, 0, 1))); }
          if (k > 0.75 && !C.roar) { C.roar = 1; Game.sfx('roar', null, 1); C.flash = 0.5; C.shake = 6; }
        } },
        { d: 5.4, say: ['Groudon', 'Who dares wake the land? ...Oh. A tiny one. With a camera.'], draw: (fb, k, t, C) => { groStage(fb, t, C, 'gro'); } },
        { d: 5.4, say: ['Groudon', 'Kyogre and I fought over the whole world once. It was very silly.'], draw: (fb, k, t, C) => { groStage(fb, t, C, 'gro'); blit(fb, S_(C, 'mkTilt'), fb.w * 0.2, fb.h * 0.74, 0.5); } },
        { d: 5, say: ['Groudon', 'Now the sun shines where I walk. Take your picture, little one!'], draw: (fb, k, t, C) => { groStage(fb, t, C, 'groRoar'); blit(fb, S_(C, 'mkHappy'), fb.w * 0.2, fb.h * 0.74 + Math.abs(Math.sin(t * 5)) * -4, 0.5); glow(fb, fb.w * 0.8, fb.h * 0.15, 30 + k * 40, hex('#fff0a0'), 0.8); } },
        { d: 3, flashAt: 0.45, draw: (fb, k, t, C) => { groStage(fb, t, C, 'groRoar'); glow(fb, fb.w / 2, fb.h * 0.4, 30 + k * 300, hex('#fff0b0'), k * 1.5); if (k > 0.4 && !C.boom) { C.boom = 1; C.flash = 1; Game.sfx('timewave', null, 1); } } },
      ],
    },
    /* ---------------- VII · Regice ---------------- */
    regice: {
      no: 'VII', title: 'The Iceberg Giant', who: 'Regice', trigger: 'regice.woke', reward: 'pts:1500', delay: 6000,
      cast: Object.assign({ reg: { sp: 'Regice', scale: 0.75, yaw: Math.PI / 2 - 0.15, pose: { awake: 1, glow: 1 } }, regArms: { sp: 'Regice', scale: 0.75, yaw: Math.PI / 2 - 0.15, pose: { awake: 1, glow: 1, arms: 1 } } }, mkPoses),
      shots: [
        { d: 3, title: true, draw: (fb) => { vgrad(fb, [[0, '#020818'], [1, '#0a2244']]); }, sfx: [[0.4, 'icering']] },
        { d: 5, say: ['', '(Seven dots... glowing in the ice, one after another.)'], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#040c20'], [1, '#102a4a']]);
          const cx = fb.w / 2, cy = fb.h * 0.45, n = Math.floor(k * 8);
          const D = [[-24, 0], [0, 0], [24, 0], [-12, 22], [12, 22], [0, -24], [0, 44]];
          D.forEach(([dx, dy], i) => { if (i < n) { disc(fb, cx + dx, cy + dy, 5, hex('#bfe8ff')); glow(fb, cx + dx, cy + dy, 16, hex('#6ad0ff'), 0.6); } else disc(fb, cx + dx, cy + dy, 5, hex('#1a2a4a')); });
          if (n !== C.n) { C.n = n; if (n > 0) Game.sfx('icering', null, 0.6); }
        } },
        { d: 5.4, shake: [1, 4], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#06142a'], [0.7, '#1a4a6a'], [1, '#bfe8ff']]);
          for (let i = 0; i < 80; i++) { const x = (U.hash(i, 3, 1) * fb.w + t * 20 * (0.5 + U.hash(i, 3, 2))) % fb.w, y = (U.hash(i, 3, 3) * fb.h + t * 30) % fb.h; put(fb, x, y, WHITE); }
          const rs = S_(C, 'reg'), a = ease(clamp(k * 1.4, 0, 1));
          if (rs) blit(fb, rs, fb.w / 2, fb.h * 0.52, lerp(0.6, 1, a), { tint: hex('#0a1a30'), tk: 0.6 * (1 - a) });
          if (k > 0.7 && !C.b) { C.b = 1; Game.sfx('freeze', null, 1); C.flash = 0.6; }
        } },
        { d: 5.2, say: ['Regice', '...  ...  ... (Its dots blink a message: FRIEND.)'], draw: (fb, k, t, C) => { iceStage(fb, t, C, 'reg'); blit(fb, S_(C, 'mkUp'), fb.w * 0.2, fb.h * 0.74, 0.5); } },
        { d: 5, say: ['Mudkip', 'Mud... kip! (It says we are friends!)'], draw: (fb, k, t, C) => { iceStage(fb, t, C, 'regArms'); blit(fb, S_(C, 'mkHappy'), fb.w * 0.2, fb.h * 0.74 - Math.abs(Math.sin(t * 5)) * 4, 0.5); } },
        { d: 3, flashAt: 0.4, draw: (fb, k, t, C) => { iceStage(fb, t, C, 'regArms'); glow(fb, fb.w / 2, fb.h * 0.45, 30 + k * 280, hex('#dff8ff'), k * 1.5); if (k > 0.4 && !C.boom) { C.boom = 1; C.flash = 1; Game.sfx('icering', null, 1); } } },
      ],
    },
    /* ---------------- VIII · The Eon duo ---------------- */
    eon: {
      no: 'VIII', title: 'Wings of Light', who: 'Latias & Latios', trigger: 'quest.latios', reward: 'pts:2000', delay: 3000,
      cast: Object.assign({ lat: { sp: 'Latias', scale: 1, yaw: 0.35, pose: { fly: 1, eyes: 'happy' } }, los: { sp: 'Latios', scale: 1, yaw: 0.35, pose: { fly: 1 } } }, mkPoses),
      shots: [
        { d: 3, title: true, draw: (fb) => { vgrad(fb, [[0, '#1a1040'], [1, '#e86a8a']]); }, sfx: [[0.4, 'whoosh']] },
        { d: 6, say: ['Latias', 'Hold on tight! We will show you the whole of Hoenn!'], draw: (fb, k, t, C) => {
          vgrad(fb, [[0, '#2a1a5a'], [0.5, '#c85a8a'], [0.8, '#ffb070'], [1, '#ffe0a0']]);
          for (let i = 0; i < 6; i++) { const y = fb.h * (0.2 + i * 0.13), x = fb.w - ((t * (80 + i * 30) + i * 90) % (fb.w + 120)) + 60; for (let yy = -5; yy <= 5; yy++) for (let xx = -26; xx <= 26; xx++) if ((xx / 26) ** 2 + (yy / 5) ** 2 < 1) add(fb, x + xx, y + yy, WHITE, 0.3); }
          const la = S_(C, 'lat'), lo = S_(C, 'los'), y0 = fb.h * 0.45;
          blit(fb, lo, fb.w * 0.4 + Math.sin(t * 1.3) * 10, y0 + 22 + Math.cos(t * 1.1) * 8, 0.8);
          blit(fb, la, fb.w * 0.58 + Math.sin(t * 1.1) * 10, y0 - 8 + Math.sin(t * 1.4) * 8, 0.8);
          blit(fb, S_(C, 'mkHappy'), fb.w * 0.58 + Math.sin(t * 1.1) * 10, y0 - 26 + Math.sin(t * 1.4) * 8, 0.4);
          for (let i = 0; i < 3; i++) part(C, { kind: 'spark', x: fb.w * 0.5 + rnd(-40, 40), y: y0 + rnd(-10, 30), vx: -rnd(80, 160), life: 0.8, c: i % 2 ? hex('#ffb0c8') : hex('#a8c8ff') });
          drawFx(fb, C);
        } },
        { d: 5, say: ['Latios', 'Thank you for bringing my sister to me, photographer.'], draw: (fb, k, t, C) => { vgrad(fb, [[0, '#0a1030'], [1, '#2a3a7a']]); stars(fb, 9, 90, t, { vx: 6, a: 0.8 }); blit(fb, S_(C, 'los'), fb.w * 0.5, fb.h * 0.45 + Math.sin(t) * 6, 0.9); } },
        { d: 3, flashAt: 0.4, draw: (fb, k, t, C) => { vgrad(fb, [[0, '#2a1a5a'], [1, '#ffb0c8']]); glow(fb, fb.w / 2, fb.h * 0.45, 30 + k * 280, hex('#ffe8f4'), k * 1.5); if (k > 0.4 && !C.boom) { C.boom = 1; C.flash = 1; Game.sfx('twinkle', null, 1); } } },
      ],
    },
  };

  /* ---- scene pieces ---- */
  function floatIsland(fb, cx, cy, w, t) {
    for (let y = 0; y < w * 0.5; y++) { const hw = w * 0.5 * Math.pow(1 - y / (w * 0.5), 0.7); for (let x = -hw; x <= hw; x++) { const n = U.hash(Math.round(x / 3), Math.round(y / 3), 4); put(fb, cx + x, cy + y, y < 3 ? hex('#8a7ac8') : n > 0.6 ? hex('#3a2e62') : hex('#2a2048')); } }
    for (let x = -w * 0.5; x <= w * 0.5; x++) put(fb, cx + x, cy, hex('#b0a0e8'));
    // broken pillars
    for (const px of [-0.35, 0.3]) { const X = cx + px * w, h = 26 + px * 20; for (let y = 0; y < h; y++) for (let x = -3; x <= 3; x++) put(fb, X + x, cy - y, x === -3 ? hex('#c8c0f0') : x === 3 ? hex('#4a3e7a') : hex('#8a7ec0')); for (let x = -5; x <= 5; x++) put(fb, X + x, cy - h, hex('#d0c8f8')); }
  }
  function dialgaStage(fb, t, C, pose, near) {
    vgrad(fb, [[0, '#050418'], [0.55, '#1c145a'], [1, '#2e2266']]);
    stars(fb, 5, 110, t, { vx: 2, a: 0.6 });
    const cx = fb.w * 0.58, cy = fb.h * 0.46, R = Math.min(fb.w, fb.h) * 0.46;
    for (let r = R; r > R - 4; r--) ring(fb, cx, cy, r, hex('#c8a040'), 1, 0.5);
    for (let n = 0; n < 12; n++) { const an = n / 12 * TAU - t * 0.1; line(fb, cx + Math.cos(an) * (R - 6), cy + Math.sin(an) * (R - 6), cx + Math.cos(an) * (R - 14), cy + Math.sin(an) * (R - 14), hex('#fff0b0'), 0.6); }
    floatIsland(fb, fb.w * 0.5, fb.h * 0.8, fb.w * 0.9, t);
    const ds = S_(C, pose);
    if (ds) { blit(fb, ds, cx, fb.h * 0.8 - ds.h * 0.5 + Math.sin(t * 1.2) * 2, 1, { tint: hex('#3a2a8a'), tk: 0.18 }); glow(fb, cx - ds.w * 0.02, fb.h * 0.8 - ds.h * 0.46, 8 + Math.sin(t * 5) * 2, hex('#5ae0ff'), 0.5); }
    for (let i = 0; i < 2; i++) if (Math.random() < 0.4) part(C, { x: rnd(0, fb.w), y: fb.h + 2, vy: -rnd(20, 60), life: 3, c: hex('#9ff0ff'), s: 1 });
    drawFx(fb, C);
  }
  function groStage(fb, t, C, pose) {
    vgrad(fb, [[0, '#3a0c06'], [0.55, '#9a3a10'], [1, '#ffa040']]);
    const gs = S_(C, pose);
    if (gs) { const x = fb.w * 0.6, y = fb.h * 0.5 + Math.sin(t * 0.8) * 3; blit(fb, gs, x, y, 1); for (let i = 0; i < 5; i++) glow(fb, x + (i - 2) * gs.w * 0.14, y + Math.sin(i) * gs.h * 0.2, 7 + Math.sin(t * 5 + i) * 2, hex('#ffe070'), 0.45); }
    for (let x = 0; x < fb.w; x++) { const y = fb.h * 0.82 + Math.sin(x * 0.05 + t) * 3; for (let yy = Math.round(y); yy < fb.h; yy++) put(fb, x, yy, U.mix(hex('#ffc040'), hex('#c8200a'), clamp((yy - y) / 20, 0, 1))); }
    if (Math.random() < 0.5) part(C, { kind: 'spark', x: rnd(0, fb.w), y: fb.h * 0.82, vy: -rnd(30, 90), life: 1.4, c: hex('#ffd060') });
    drawFx(fb, C);
  }
  function iceStage(fb, t, C, pose) {
    vgrad(fb, [[0, '#06142a'], [0.7, '#1a4a6a'], [1, '#8ad0f0']]);
    for (let i = 0; i < 60; i++) { const x = (U.hash(i, 5, 1) * fb.w + t * 12 * (0.5 + U.hash(i, 5, 2))) % fb.w, y = (U.hash(i, 5, 3) * fb.h + t * 24) % fb.h; put(fb, x, y, WHITE); }
    const rs = S_(C, pose);
    if (rs) { blit(fb, rs, fb.w * 0.6, fb.h * 0.52, 1); glow(fb, fb.w * 0.6, fb.h * 0.42, 22 + Math.sin(t * 3) * 4, hex('#6ad0ff'), 0.5); }
  }
  function kyogreStage(fb, t, C, pose, k) {
    vgrad(fb, [[0, '#02081a'], [1, '#041430']]);
    for (let i = 0; i < 60; i++) { const x = (U.hash(i, 7, 1) * fb.w + Math.sin(t * 0.4 + i) * 10), y = (U.hash(i, 7, 2) * fb.h - t * 6 * (0.3 + U.hash(i, 7, 3)) + fb.h * 4) % fb.h; add(fb, x, y, hex('#5ae0ff'), 0.35); }
    const ks = S_(C, pose);
    if (ks) {
      const x = lerp(fb.w * 1.2, fb.w * 0.48, outC(Math.min(1, k * 1.5 + (pose === 'kyoOpen' ? 1 : 0)))), y = fb.h * 0.5 + Math.sin(t * 0.8) * 5;
      blit(fb, ks, x, y, 1, { tint: hex('#061a3a'), tk: 0.45 });
      // its glowing markings pulse
      glow(fb, x - ks.w * 0.15, y - ks.h * 0.05, 14 + Math.sin(t * 3) * 3, hex('#ff3a4a'), 0.35);
      glow(fb, x + ks.w * 0.2, y + ks.h * 0.05, 12 + Math.sin(t * 3 + 1) * 3, hex('#3ae0ff'), 0.3);
    }
    if (Math.random() < 0.3) part(C, { kind: 'bubble', x: rnd(0, fb.w), y: fb.h + 4, vy: -rnd(20, 50), life: 4, s: 1 + Math.random() * 2, c: hex('#bfefff') });
    drawFx(fb, C);
  }
  function wishSky(fb, t, C) {
    vgrad(fb, [[0, '#060420'], [0.45, '#1a1650'], [0.7, '#4a2e7a'], [1, '#e8a0b8']]);
    stars(fb, 17, 160, t, { vx: 1.5, a: 0.9 });
    // aurora ribbons
    for (let r = 0; r < 2; r++) for (let x = 0; x < fb.w; x++) { const y0 = fb.h * (0.18 + r * 0.1) + Math.sin(x * 0.02 + t * 0.4 + r) * 14; for (let y = 0; y < 26; y++) add(fb, x, y0 + y, r ? hex('#ff7ad0') : hex('#5affc0'), 0.12 * Math.sin((y / 26) * Math.PI) * (0.6 + 0.4 * Math.sin(x * 0.05 + t))); }
    // a huge crescent moon
    const mx = fb.w * 0.84, my = fb.h * 0.2, mr = fb.h * 0.13;
    glow(fb, mx, my, mr * 2.2, hex('#fff0c0'), 0.2);
    for (let y = -mr; y <= mr; y++) for (let x = -mr; x <= mr; x++) { if (x * x + y * y > mr * mr) continue; if ((x + mr * 0.45) ** 2 + (y - mr * 0.2) ** 2 < (mr * 0.85) ** 2) continue; put(fb, mx + x, my + y, U.bayer4(x | 0, y | 0) > 0.8 ? hex('#fff8e0') : hex('#ffeeb8')); }
    if (Math.random() < 0.04) { const x = rnd(0, fb.w * 0.7), y = rnd(0, fb.h * 0.3); part(C, { kind: 'streak', x, y, vx: 300, vy: 120, life: 0.6, c: WHITE }); }
    drawFx(fb, C);
    clouds(fb, fb.h * 0.84, 3, t, ['#6a4a8a', '#a06aa8', '#e0a0c0', '#ffd8e0'], { n: 16, r: 30, v: 5 });
    clouds(fb, fb.h * 0.97, 5, t, ['#8a5a9a', '#c080b0', '#f0b8d0', '#fff0f4'], { n: 12, r: 36, v: 9 });
  }
  function tagsFx(fb, x, y, t) { for (let i = 0; i < 3; i++) { const a = -0.6 + i * 0.6 + Math.sin(t * 2 + i) * 0.15; for (let j = 0; j < 14; j++) put(fb, x + Math.sin(a) * j + i * 4 - 4, y - 10 - Math.cos(a) * j * 0.3 + j, j < 3 ? hex('#fff8c0') : hex('#80c8ff')); } }
  function spaceEdge(fb, t, C, k) {
    vgrad(fb, [[0, '#000000'], [0.6, '#050314'], [1, '#0a0620']]);
    stars(fb, 41, 180, t, { vx: 1, a: 0.9 });
    // the planet below with its thin blue atmosphere
    const R = fb.w * 1.2, cx = fb.w * 0.5, cy = fb.h + R - fb.h * 0.22;
    for (let y = Math.floor(cy - R - 6); y < fb.h; y++) for (let x = 0; x < fb.w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < R) { const n = U.fbm(x * 0.02 + t * 0.01, y * 0.04, 5, 3); put(fb, x, y, n > 0.55 ? hex('#f4f8ff') : n > 0.45 ? hex('#4ab860') : hex('#1a5ab0')); }
      else if (d < R + 6) add(fb, x, y, hex('#5ac8ff'), (1 - (d - R) / 6) * 0.8);
    }
    for (let x = 0; x < fb.w; x++) { const y0 = fb.h * 0.12 + Math.sin(x * 0.015 + t * 0.3) * 18; for (let y = 0; y < 40; y++) add(fb, x, y0 + y, hex('#3aff9a'), 0.1 * Math.sin((y / 40) * Math.PI)); }
    drawFx(fb, C);
  }
  function bubbleMk(fb, C, x, y, t, pose) {
    blit(fb, S_(C, pose), x, y + Math.sin(t * 1.4) * 4, 0.5);
    ring(fb, Math.round(x), Math.round(y + Math.sin(t * 1.4) * 4), 34, hex('#c8f0ff'), 1, 0.7);
    add(fb, x - 18, y - 20, WHITE, 0.9); add(fb, x - 17, y - 21, WHITE, 0.7);
  }
  function pocketSky(fb, t, C) {
    vgrad(fb, [[0, '#1a0628'], [0.5, '#4a1a5a'], [1, '#e89ac8']]);
    stars(fb, 61, 120, t, { a: 0.7 });
    // a pink spiral galaxy
    const gx = fb.w * 0.3, gy = fb.h * 0.28;
    for (let i = 0; i < 600; i++) { const a = i * 0.08 + t * 0.1, r = i * 0.12; for (const arm of [0, Math.PI]) add(fb, gx + Math.cos(a + arm) * r * 1.4, gy + Math.sin(a + arm) * r * 0.6, i % 3 ? hex('#ffc0f0') : hex('#a0c0ff'), 0.4 * (1 - i / 600)); }
    glow(fb, gx, gy, 12, hex('#fff0ff'), 0.8);
    // floating islands of the places Mudkip has been
    for (let i = 0; i < 4; i++) { const x = fb.w * (0.12 + i * 0.26), y = fb.h * (0.55 + (i % 2) * 0.12) + Math.sin(t + i) * 4, w = 28; for (let yy = 0; yy < 10; yy++) for (let xx = -w; xx <= w; xx++) { if (Math.abs(xx) > w * (1 - yy / 10)) continue; put(fb, x + xx, y + yy, yy < 2 ? hex(['#dfb476', '#56a042', '#8ccc60', '#7ac0ff'][i]) : hex('#5a3a4a')); } }
    drawFx(fb, C);
  }
  // the current world frame, cut into shards that drift apart (k = 0 whole .. 1 scattered)
  function shards(fb, t, C, k) {
    vgrad(fb, [[0, '#1a0628'], [1, '#4a1a5a']]);
    stars(fb, 61, 90, t, { a: 0.6 });
    const src = Game.fb(); if (!src) return;
    const N = 5, sw = fb.w / N, sh = fb.h / 3;
    for (let j = 0; j < 3; j++) for (let i = 0; i < N; i++) {
      const h = U.hash(i, j, 77), ox = (h - 0.5) * 120 * k, oy = (U.hash(i, j, 78) - 0.5) * 90 * k, rot = (h - 0.5) * 0.8 * k;
      const cx0 = (i + 0.5) * sw, cy0 = (j + 0.5) * sh, ca = Math.cos(rot), sa = Math.sin(rot);
      for (let y = -sh / 2; y < sh / 2; y++) for (let x = -sw / 2; x < sw / 2; x++) {
        const X = cx0 + ox + x * ca - y * sa, Y = cy0 + oy + x * sa + y * ca;
        const u = Math.floor(((cx0 + x) / fb.w) * src.w), v = Math.floor(((cy0 + y) / fb.h) * src.h);
        if (u < 0 || v < 0 || u >= src.w || v >= src.h) continue;
        let c = src.d[v * src.w + u];
        if (Math.abs(x) > sw / 2 - 1.5 || Math.abs(y) > sh / 2 - 1.5) c = U.mix(c, hex('#ffc0f0'), 0.8 * k);
        put(fb, X, Y, c);
      }
    }
  }

  /* ================= running a memory ================= */
  function play(id, replay = false) {
    const sc = SCENES[id]; if (!sc) return false;
    if (Game.mode !== 'explore' && Game.mode !== 'camera') { if (!M.queue.includes(id)) M.queue.push(id); return false; }
    if (Game.mode === 'camera') Photo.close();
    M.cur = { id, sc, i: 0, t: 0, T: 0, cast: makeCast(sc.cast), fx: [], ch: 0, choice: 0, chosen: null, flash: 0, shake: 0, loaded: false, replay, sfxDone: {} };
    M.prevMode = Game.mode; Game.mode = 'memory'; Game.frozenFrame = false;
    if (typeof Pad !== 'undefined') Pad.reset();
    if (typeof Moves !== 'undefined') Moves.closeWheel();
    Game.sfx('portal', null, 0.7);
    return true;
  }
  const shot = () => (M.cur ? M.cur.sc.shots[M.cur.i] : null);
  function lineOf(C, sh) {
    if (!sh || !sh.say) return null;
    let s = sh.say[1];
    if (s === '{wish}') s = C.chosen === 1 ? 'More friends? Easy! Everyone you meet will want to play with you! ...And here, have some berries!' : 'The perfect photo? Then may every moment you snap shine like a star!';
    return s;
  }
  function next() {
    const C = M.cur; const sh = shot();
    if (sh && sh.choices && C.chosen === null) return;
    C.i++; C.t = 0; C.ch = 0; C.fx.length = 0;
    if (C.i >= C.sc.shots.length) finish();
    else Game.sfx('page', null, 0.3);
  }
  function finish() {
    const C = M.cur; if (!C) return;
    const first = !saved()[C.id];
    saved()[C.id] = Date.now(); Save.save();
    M.cur = null; Game.mode = 'explore'; Game.frozenFrame = false;
    if (first && !C.replay) {
      if (C.sc.reward) { const r = Rewards.grant(C.sc.reward); if (r) { Quests.Q.pops.push({ t: 0, life: 4.2, text: 'Memory ' + C.sc.no + ': ' + C.sc.title, reward: r }); Quests.Q.unseenN++; if (typeof Style !== 'undefined') Style.markNew(C.sc.reward); } }
      if (C.id === 'jirachi' && C.chosen === 1) Save.addItem('berry', 10);
      HUD.toast('Memory saved to your Bag.', { life: 2.6, col: 0xffff9ae0 });
    }
    Game.sfx('chime', null, 0.8);
  }
  function update(dt) {
    const C = M.cur;
    if (!C) { if (M.queue.length && Game.mode === 'explore' && !(typeof Talk !== 'undefined' && Talk.busy()) && !(Game.cine && Game.cine.shot) && !Photo.card) play(M.queue.shift()); return; }
    C.T += dt;
    if (!C.loaded) { const ok = pumpCast(C.cast, C.T > 2.5); if (ok || C.T > 3) { if (!ok) pumpCast(C.cast, true); C.loaded = true; } return; }
    const sh = shot(); if (!sh) return;
    C.t += dt;
    const L = lineOf(C, sh);
    if (L) C.ch = Math.min(L.length, C.ch + dt * 36);
    if (sh.sfx) for (const [at, name] of sh.sfx) { const key = C.i + '|' + at; if (C.t >= at && !C.sfxDone[key]) { C.sfxDone[key] = 1; Game.sfx(name, null, 0.6); } }
    if (sh.shake && C.t >= sh.shake[0] && C.t < sh.shake[0] + 0.05) C.shake = sh.shake[1];
    stepFx(C, dt);
    C.flash = Math.max(0, C.flash - dt * 1.6); C.shake = Math.max(0, C.shake - dt * 6);
    const done = C.t >= sh.d && (!L || C.ch >= L.length) && !(sh.choices && C.chosen === null);
    if (done && (!L || C.t >= sh.d + 0.8)) next();
  }
  function draw(fb, t) {
    const C = M.cur; if (!C) return;
    const W = fb.w, H = fb.h;
    if (!C.loaded) { fb.d.fill(BLACK); const n = Math.floor(C.T * 3) % 4; text(fb, '.'.repeat(n), W / 2, H / 2 - 4, 0xff8a8aa8, { font: 'title', align: 'center' }); return; }
    const sh = shot(); if (!sh) return;
    const k = clamp(C.t / sh.d, 0, 1);
    fb.d.fill(BLACK);
    sh.draw(fb, k, C.t, C);
    // camera shake: shift the whole frame
    if (C.shake > 0.1) { const dx = Math.round((Math.random() - 0.5) * C.shake * 2), dy = Math.round((Math.random() - 0.5) * C.shake * 2); const src = fb.d.slice(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = clamp(x + dx, 0, W - 1), sy = clamp(y + dy, 0, H - 1); fb.d[y * W + x] = src[sy * W + sx]; } }
    // letterbox
    const bar = Math.round(H * 0.11);
    UI.rect(fb, 0, 0, W, bar, BLACK); UI.rect(fb, 0, H - bar - (sh.say ? 16 : 0), W, bar + (sh.say ? 16 : 0), BLACK);
    // title card
    if (sh.title) {
      const a = Math.min(1, C.t / 0.8, (sh.d - C.t) / 0.6);
      if (a > 0) {
        const col = U.mix(BLACK, 0xffffe0f0, a);
        text(fb, 'MEMORY ' + C.sc.no, W / 2, H / 2 - 26, U.mix(BLACK, 0xffffa8e0, a), { font: 'small', align: 'center' });
        text(fb, C.sc.title, W / 2, H / 2 - 12, col, { font: 'title', align: 'center', sc: W > 420 ? 2 : 1 });
        for (let x = -60; x <= 60; x++) mixp(fb, W / 2 + x, H / 2 + 16, 0xffffc8f0, a * (1 - Math.abs(x) / 60));
      }
    }
    // dialogue
    const L = lineOf(C, sh);
    if (L) {
      const y = H - bar - 12;
      if (sh.say[0]) text(fb, sh.say[0].toUpperCase(), 14, y, 0xffffc84a, { font: 'small' });
      const lines = Font.wrap(L.slice(0, Math.floor(C.ch)), 'body', W - 28);
      lines.slice(0, 2).forEach((l, i) => text(fb, l, 14, y + 10 + i * 12, WHITE, { font: 'body' }));
      if (sh.choices && C.ch >= L.length) {
        C.rects = [];
        let x = W - 14;
        for (let i = sh.choices.length - 1; i >= 0; i--) {
          const lab = sh.choices[i], bw = Font.measure(lab, 'small') + 16, sel = C.choice === i;
          x -= bw;
          UI.panel(fb, x, y - 4, bw, 14, { r: 4, ol: 0xffffc8f0, fill: sel ? 0xffc04a9a : 0xff2a1a3a });
          text(fb, lab, x + bw / 2, y - 1, WHITE, { font: 'small', align: 'center' });
          C.rects.push({ x, y: y - 6, w: bw, h: 18, i });
          x -= 6;
        }
      } else if (C.ch >= L.length && Math.sin(t * 7) > 0) { const ax = W - 16, ay = H - 16; for (let j = 0; j < 4; j++) UI.hline(fb, ax - 3 + j, ax + 3 - j, ay + j, WHITE); }
    }
    text(fb, (typeof Pad !== 'undefined' && Pad.touch ? 'Tap' : 'Space') + ': next   Esc: skip', W - 6, 4, 0xff6a6a88, { font: 'small', align: 'right' });
    if (C.flash > 0) for (let i = 0; i < fb.d.length; i++) fb.d[i] = U.mix(fb.d[i], WHITE, Math.min(1, C.flash));
  }
  function choose(i) { const C = M.cur; C.chosen = i; C.choice = i; Game.sfx('select'); next(); }
  function down(ux, uy) {
    const C = M.cur; if (!C || !C.loaded) return true;
    const sh = shot(), L = lineOf(C, sh);
    if (sh.choices && L && C.ch >= L.length) { for (const r of C.rects || []) if (ux >= r.x && uy >= r.y && ux < r.x + r.w && uy < r.y + r.h) { choose(r.i); return true; } return true; }
    if (L && C.ch < L.length) { C.ch = L.length; return true; }
    next();
    return true;
  }
  function key(k) {
    const C = M.cur; if (!C) return;
    if (k === 'Escape') { if (shot() && shot().choices && C.chosen === null) C.chosen = 0; finish(); return; }
    const sh = shot(), L = lineOf(C, sh);
    if (sh && sh.choices && L && C.ch >= L.length) {
      if (k === 'ArrowLeft' || k === 'a' || k === 'ArrowRight' || k === 'd') { C.choice = 1 - C.choice; Game.sfx('blip', null, 0.5); return; }
      if (k === ' ' || k === 'Enter' || k === 'x') { choose(C.choice); return; }
      return;
    }
    if (k === ' ' || k === 'Enter' || k === 'x') down(-1, -1);
  }
  // discoveries trigger memories (once)
  const origDiscover = Save.discover;
  Save.discover = function (id) {
    const r = origDiscover.call(Save, id);
    if (r) for (const [mid, sc] of Object.entries(SCENES)) if (sc.trigger === id && !saved()[mid]) setTimeout(() => { if (!M.queue.includes(mid)) M.queue.push(mid); }, sc.delay ?? 5000);
    return r;
  };
  const list = () => Object.entries(SCENES).map(([id, s]) => ({ id, no: s.no, title: s.title, who: s.who, seen: !!saved()[id] }));
  return Object.assign(M, { SCENES, play, update, draw, down, key, list, wheel() {}, finish });
})();
