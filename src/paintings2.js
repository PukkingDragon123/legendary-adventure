/* ------------------------------------------------------------------
   Paintings II — dawn, surf, dusk and night on the same shore.
------------------------------------------------------------------- */
(() => {
  const { hex, Buf, bayer4, bayer8, hash2, vnoise, fbm, rng, mix, rgbOf, pack } = PX;
  const { clamp, lerp, mixc, star } = Scenery;
  const W = Paintings.W, H = Paintings.H;

  /* ---------------- shared helpers ---------------- */
  const SIN = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) SIN[i] = Math.sin((i / 4096) * Math.PI * 2);
  // palette grader: i = ramp index (0 deep .. 4 highlight), -1 = lit outline/line, -2 = dark outline
  function grader(o) {
    const sh = o.shadow && [hex(o.shadow[0]), o.shadow[1]];
    const li = o.light && [hex(o.light[0]), o.light[1]];
    const all = o.all && [hex(o.all[0]), o.all[1]];
    const dim = o.dim || 0;
    return (c, i) => {
      let r = c;
      if (all) r = mix(r, all[0], all[1]);
      if (sh && i <= 1) r = mix(r, sh[0], sh[1] * (i <= 0 ? 1 : 0.65));
      if (li && i >= 3) r = mix(r, li[0], li[1] * (i === 4 ? 1 : 0.7));
      if (dim) { const [a, b, d] = rgbOf(r); r = pack(a * (1 - dim), b * (1 - dim), d * (1 - dim)); }
      return r;
    };
  }
  // thin stratus streak lit from below: pal = [top, mid, lit, hot]
  function streak(seed, len, th, pal) {
    const b = new Buf(len, th + 3);
    for (let x = 0; x < len; x++) {
      const u = x / (len - 1);
      const env = Math.pow(Math.sin(Math.PI * u), 0.55);
      const thick = Math.max(1, Math.round(th * env * (0.65 + 0.6 * fbm(x * 0.07, 1, seed, 2))));
      const top = Math.round((th - thick) * 0.55 + (fbm(x * 0.04, 3, seed, 2) - 0.5) * 3) + 1;
      for (let j = 0; j < thick; j++) {
        const v = thick === 1 ? 0.6 : j / (thick - 1);
        b.set(x, top + j, v > 0.8 ? pal[3] : v > 0.5 ? pal[2] : v > 0.22 ? pal[1] : pal[0]);
      }
    }
    return b;
  }
  function sunDisc(buf, cx, cy, r, cols, hz, t, flat = 1) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      if (y >= hz) continue;
      const wob = hz - y < 5 ? Math.round(Math.sin(y * 1.7 + t * 4) * 1.2) : 0;
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        const d = Math.hypot(x + 0.5 - cx - wob, (y + 0.5 - cy) / flat) / r;
        if (d > 1) continue;
        buf.set(x, y, d > 0.84 ? cols[0] : d > 0.5 ? cols[1] : cols[2]);
      }
    }
  }
  // sparkling reflection column under a low sun or moon
  function glitter(fb, t, cx, y0, y1, w0, w1, cols, seed, test, dens = 0.5) {
    for (let y = y0; y < y1; y++) {
      const p = (y - y0) / (y1 - y0);
      const half = lerp(w0, w1, p);
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        const u = (x - cx) / half;
        const h = hash2(x, y, seed);
        if (h > (1 - u * u) * dens) continue;
        const tw = Math.sin(t * (1.6 + h * 5) + h * 50 + y * 0.9);
        if (tw < 0.15) continue;
        if (test && !test(x, y)) continue;
        const c = tw > 0.75 && Math.abs(u) < 0.55 ? cols[0] : cols[1];
        fb.set(x, y, c);
        if (p > 0.35 && tw > 0.6) fb.set(x + 1, y, cols[1]);
      }
    }
  }
  // shadow of a sprite projected along the light onto the ground (kx, ky per pixel of height)
  const shadowMask = new Uint8Array(W * H);
  function projShadow(fb, s, x0, y0, gy, kx, ky, dark, test, maxLen = 999) {
    shadowMask.fill(0);
    const w = s.buf.w, h = s.buf.h, d = s.buf.d;
    for (let sy = 0; sy < h; sy++) {
      const hgt = gy - (y0 + sy);
      if (hgt < -1 || hgt > maxLen) continue;
      const hh = Math.max(0, hgt);
      for (let sx = 0; sx < w; sx++) {
        if (!d[sy * w + sx]) continue;
        const tx = Math.round(x0 + sx + hh * kx), ty = Math.round(gy + hh * ky);
        for (const [ax, ay] of [[tx, ty], [tx + (kx > 0 ? 1 : -1), ty]]) {
          if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
          const i = ay * W + ax;
          if (shadowMask[i]) continue;
          if (test && !test(ax, ay)) continue;
          shadowMask[i] = 1;
          fb.d[i] = dark(fb.d[i]);
        }
      }
    }
  }
  function birdV(fb, x, y, ph, c) {
    x = Math.round(x); y = Math.round(y);
    const up = Math.sin(ph) > 0 ? 1 : 0;
    fb.set(x, y, c);
    fb.set(x - 1, y - 1 + up, c); fb.set(x - 2, y - 1 - up * 0 + up, c); fb.set(x - 3, y - (up ? 0 : 2), c);
    fb.set(x + 1, y - 1 + up, c); fb.set(x + 2, y - 1 + up, c); fb.set(x + 3, y - (up ? 0 : 2), c);
  }
  function pixText(fb, s, x, y, c, scale = 1) {
    const F = { z: ['xxxx', '..x.', '.x..', 'xxxx'], Z: ['xxxxx', '...x.', '..x..', '.x...', 'xxxxx'] };
    let cx = Math.round(x);
    for (const ch of s) {
      const g = F[ch];
      if (!g) { cx += 3 * scale; continue; }
      for (let r = 0; r < g.length; r++)
        for (let k = 0; k < g[r].length; k++)
          if (g[r][k] === 'x') for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) fb.set(cx + k * scale + a, Math.round(y) + r * scale + b, c);
      cx += (g[0].length + 1) * scale;
    }
  }
  const sparkBurst = (parts, x, y, n, c, c2, spread = 26, layer = 1) => {
    for (let i = 0; i < n; i++) parts.add({ type: 'spark', x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.8, size: 1 + Math.floor(Math.random() * 3), life: 0.45 + Math.random() * 0.35, c, c2, layer });
  };

  /* ================================================================
     I · FIRST LIGHT (dawn) — nosing the ball along the wet sand
     ================================================================ */
  function dawn() {
    const hz = 98;
    const pal = Beach.H({
      sky: [[0, '#4d6ab4'], [0.2, '#6881c4'], [0.4, '#9197cf'], [0.57, '#bea0cb'], [0.72, '#e6aeae'], [0.86, '#fcc59a'], [1, '#ffdcaa']],
      sea: [[0, '#cfa7b6'], [0.05, '#8078b2'], [0.3, '#6671ae'], [0.62, '#6483b8'], [1, '#779fc4']],
      horizon: '#f8caa8',
      shallow: ['#779fc4', '#8db0ca', '#a7c2ce', '#c4d1d0', '#e0dbcd'],
      face: '#6b86bb',
      foam: ['#fff4e8', '#f0dbe0', '#c1b1cf'],
      sand: ['#a4878d', '#c6a5a1', '#dcbeb1', '#eed5c5'],
      sandWet: ['#83717e', '#97838d', '#ab959b', '#c3aca9'],
      sheen: '#ffd5ae',
      prop: {
        starfish: { d: '#86424a', r: '#d9786a', l: '#f7a98a' },
        shell: { d: '#8f6f78', r: '#e8c4bc', l: '#fff0e8' },
        conch: { d: '#7f5d62', r: '#d8ab98', l: '#f6dccc' },
        pebble: { d: '#5d5664', r: '#8e8696', l: '#b8afbf' },
      },
      head: {
        rock: ['#4e4970', '#625b86', '#7e74a2'], grass: ['#5d6a74', '#7c887e'],
        tower: ['#9d8fa6', '#d6c8d2', '#f2e2e4'], stripe: ['#7e3446', '#b24c58', '#d86c68'],
        iron: '#352f45', glass: '#ffe19a', roof: '#8e3642', lampOn: ['#ffe8a0', '#fffbe0'],
      },
      cloud: ['#8d83bf', '#c79fc7', '#ffc59c', '#fff0cc'],
      glint: ['#fff3cc', '#ffc99e'],
      grass: ['#48525e', '#5f6c6c', '#7b8878', '#a4a88c'],
      shadow: '#54467c',
      sun: ['#ffc98a', '#ffe7b6', '#fffaea'],
    });
    const beach = Beach.create({
      W, H, hz, pal, seed: 31, sandTop: 150, skyBand: 0.22, seaBand: 0.45,
      sun: { x: 252, y: hz, r: 175, k: 0.55, sx: 1.55, sy: 1, p: 1.5 },
      shore: (x) => 178 + (x - 192) * 0.018 + Math.sin(x * 0.015 + 2) * 3,
      wave: { period: 8.2, reach: 14, far: 134, skew: 0.003, dry: 1.4 },
      props: [
        { kind: 'shell', x: 70, y: 206 }, { kind: 'starfish', x: 318, y: 204 }, { kind: 'pebble', x: 148, y: 210 },
        { kind: 'conch', x: 214, y: 208 }, { kind: 'pebble', x: 266, y: 211 }, { kind: 'shell', x: 356, y: 209 },
      ],
    });
    const bg = beach.bg;
    // morning mist hugging the horizon
    for (let y = hz - 14; y < hz + 10; y++)
      for (let x = 0; x < W; x++) {
        const k = 1 - Math.abs(y - hz) / 14;
        if (bayer8(x, y) < k * 0.55 * (0.6 + 0.4 * fbm(x * 0.02, y * 0.2, 4, 2))) bg.d[y * W + x] = mixc(bg.d[y * W + x], hex('#ffe4d2'), 0.3);
      }
    const lamp = Scenery.headland(bg, { x: 300, y: hz, w: 86, pal: pal.head, seed: 5 });
    const streaks = [
      { b: streak(3, 170, 10, pal.cloud), x: 10, y: 16, sp: 1.2 }, { b: streak(9, 110, 7, pal.cloud), x: 210, y: 32, sp: 0.9 },
      { b: streak(14, 200, 11, pal.cloud), x: 120, y: 50, sp: 0.7 }, { b: streak(22, 90, 6, pal.cloud), x: 30, y: 68, sp: 0.5 },
      { b: streak(27, 130, 6, pal.cloud), x: 262, y: 78, sp: 0.4 }, { b: streak(33, 60, 4, pal.cloud), x: 330, y: 12, sp: 1 },
    ];
    const glints = Scenery.makeGlints(8, 90, 0, W, hz + 2, 160);
    const vignette = Beach.makeVignette(W, H, 0.5, hex('#2a1c46'));
    const parts = new Scenery.Particles();
    const mkPal = Mudkip.gradePalette(grader({ shadow: ['#6a5c9c', 0.32], light: ['#ffd9b4', 0.3], all: ['#c9a6c8', 0.1] }));
    const rimPal = Mudkip.gradePalette(grader({ all: ['#ffe2b0', 0.45] }));
    const light = { dir: [-0.25, 0.75, 0.6], th: [-0.3, 0.1, 0.8], spec: 0.99, rim: { dir: [0.5, 0.86], k: 0.38, pal: rimPal } };
    const ballLight = { dir: [-0.25, 0.75, 0.6], rim: { dir: [0.5, 0.86], k: 0.4 } };
    const ballPal = Ball.grade(grader({ shadow: ['#6a5c9c', 0.3], light: ['#ffe2b8', 0.25] }));
    const mk = new MudkipActor({ x: 120, gy: 193, yaw: 1.25, pal: mkPal, light, scale: 1.18 });
    const ball = new BallActor({ x: 164, y: 193 - 12, R: 12, light: ballLight, pal: ballPal });
    ball.axis = [0.12, 0.2, 1];
    const S = { t: 0, mode: 'walk', dir: 1, vh: 0, vx: 0, phase: 0, pause: 0, happy: 0, heart: 0, lastStep: 0, prints: [] };
    const GM = 820;
    const sounds = [];
    const emit = (name, o = {}) => sounds.push(Object.assign({ name }, o));
    const dark = PX.cmap((c) => mix(c, pal.shadow, 0.3));
    const subT = PX.cmap((c) => mix(c, pal.shallow[1], 0.45));
    const reflT = PX.cmap((c) => mix(c, pal.shallow[1], 0.52));
    const printCol = PX.cmap((c) => mix(c, hex('#4a3c58'), 0.42));
    let noseOff = 17;

    function step(dt) {
      S.t += dt;
      const t = S.t;
      beach.update(t, dt);
      mk.sq.step(dt); mk.fin.step(dt); mk.tail.step(dt);
      S.happy = Math.max(0, S.happy - dt);
      S.heart = Math.max(0, S.heart - dt);
      // ball rolls and slows
      ball.vx *= Math.exp(-1.25 * dt);
      if (Math.abs(ball.vx) < 1) ball.vx = 0;
      ball.x += ball.vx * dt;
      ball.x = clamp(ball.x, 30, 354);
      ball.rot = M3.mul(Ball.axisAngle([0.12, 0.25, 1], (-ball.vx / ball.R) * dt), ball.rot);
      ball.y = mk.gy - ball.R + 1;
      // mudkip
      const d = S.dir;
      if (S.mode === 'hop' || S.mode === 'jump') {
        S.vh -= GM * dt;
        mk.h += S.vh * dt;
        mk.x += S.vx * dt;
        if (mk.h <= 0 && S.vh < 0) {
          mk.h = 0;
          mk.sq.kick(6); mk.fin.kick(-4);
          const wet = beach.isWater(Math.round(mk.x), mk.gy + 1);
          if (wet) { splash(parts, mk.x, mk.gy, { power: 0.6, n: 12, crown: 8, test: beach.isWater, c2: hex('#d9c8e4'), ring: hex('#fff0e6') }); emit('splash', { small: true }); }
          else for (let i = 0; i < 8; i++) parts.add({ type: 'drop', x: mk.x + (Math.random() - 0.5) * 18, y: mk.gy, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 40, g: 300, life: 0.6, c: pal.sand[3], size: 1, layer: 1, floor: mk.gy + 3 });
          if (S.mode === 'hop') { S.dir = -S.dir; S.mode = 'pause'; S.pause = 0.7; S.happy = 0.7; emit('cry'); }
          else S.mode = 'walk';
        }
      } else if (S.mode === 'pause') {
        S.pause -= dt;
        if (S.pause <= 0) S.mode = 'walk';
      } else {
        const target = ball.x - d * (ball.R + noseOff);
        const gap = (target - mk.x) * d; // >0: ball still ahead of the nose
        if ((d > 0 && ball.x > 292) || (d < 0 && ball.x < 92)) {
          if (Math.abs(ball.vx) < 8 && gap < 4) {
            S.mode = 'hop'; S.vh = 205; S.vx = d * ((ball.R * 2 + noseOff + 16) / (2 * 205 / GM));
            mk.sq.kick(-5); mk.tail.kick(4);
            emit('jump');
          }
        }
        if (S.mode === 'walk') {
          let v = 0;
          if (gap > 0.5) v = d * Math.min(26, gap * 3 + 8);
          else if (Math.abs(ball.vx) < 14 && !((d > 0 && ball.x > 292) || (d < 0 && ball.x < 92))) {
            ball.vx = d * (40 + Math.random() * 14);
            mk.fin.kick(2); S.happy = 0.25;
            emit('boing', { soft: true });
          }
          mk.x += v * dt;
          const prev = S.phase;
          S.phase += Math.abs(v) * dt * 0.3;
          if (Math.floor(prev / Math.PI) !== Math.floor(S.phase / Math.PI)) {
            const side = Math.floor(S.phase / Math.PI) % 2 ? 1 : -1;
            S.prints.push({ x: Math.round(mk.x + d * 6), y: mk.gy + (side > 0 ? 2 : -1), t });
            S.prints.push({ x: Math.round(mk.x - d * 9), y: mk.gy + (side > 0 ? -1 : 2), t });
            if (beach.isWater(Math.round(mk.x), mk.gy + 1)) emit('plip');
          }
        }
      }
      // prints fade & wash away
      S.prints = S.prints.filter((p) => t - p.t < 14 && !(beach.edge[clamp(p.x, 0, W - 1)] > p.y + 1));
      const yawT = S.dir > 0 ? 1.25 : Math.PI - 1.25;
      mk.yaw += clamp(yawT - mk.yaw, -dt * 4.5, dt * 4.5);
      const walking = S.mode === 'walk' && S.phase % (Math.PI * 2) !== 0;
      const air = S.mode === 'hop' || S.mode === 'jump';
      const blink = S.happy <= 0 && mk.blink(t, dt);
      const ph = S.phase;
      mk.sprite({
        squash: clamp(mk.sq.x * 0.5 + (walking ? Math.cos(ph * 2) * 0.025 : Math.sin(t * 2.4) * 0.012), -0.16, 0.26),
        headPitch: air ? 0.25 : S.mode === 'pause' ? 0.12 : -0.13 + Math.sin(ph * 2) * 0.03,
        lean: air ? 0.1 : 0,
        legF: air ? -0.45 : Math.sin(ph) * 0.5,
        legB: air ? 0.5 : -Math.sin(ph) * 0.5,
        mouth: S.happy > 0 ? 1 : 0.5,
        eyes: S.happy > 0 ? 'happy' : blink ? 'blink' : 'open',
        finSway: clamp(0.04 + mk.fin.x * 0.3, -0.25, 0.4),
        tailLift: clamp(mk.tail.x * 0.3, -0.2, 0.35),
        tailWag: Math.sin(t * (S.happy > 0 ? 15 : 6)) * 0.2,
        gill: Math.sin(t * 4) * 0.05,
      });
      if (mk.last) { const m = mk.last.anchors.mouth; noseOff = Math.abs(m[0] - mk.OX) - 2; }
      parts.update(dt);
      return sounds.splice(0);
    }

    function draw(fb) {
      const t = S.t;
      fb.copyFrom(bg);
      sunDisc(fb, 252, hz + 3, 15, pal.sun, hz, t);
      for (const c of streaks) {
        const span = W + c.b.w;
        const x = ((c.x + t * c.sp) % span + span) % span - c.b.w;
        fb.blit(c.b, x, c.y, { test: (px, py) => py < hz });
      }
      // lamp blink
      if (lamp && (t % 4) < 0.5) {
        fb.set(lamp.lampX, lamp.lampY, pal.head.lampOn[1]);
        Scenery.glow(fb, lamp.lampX + 0.5, lamp.lampY + 0.5, 7, hex('#fff2c0'), 0.8, (x, y) => y < hz);
      }
      for (let g = 0; g < 3; g++) {
        const span = W + 60;
        const gx = W + 30 - ((t * 11 + g * 9) % span);
        birdV(fb, gx + g * 7, 50 + g * 4 + Math.sin(t + g) * 2, t * 6 + g, hex('#5e5184'));
      }
      Scenery.drawGlints(fb, glints, t, pal.glint[0], pal.glint[1], (x, y) => y > hz && y < beach.edge[clamp(x, 0, W - 1)] - 26);
      glitter(fb, t, 252, hz + 1, 172, 6, 44, pal.glint, 5, (x, y) => beach.isWater(x, y) || y < 150);
      beach.drawShore(fb, t);
      // sunrise glow on the freshly wet sand
      for (let x = 232; x < 274; x++) {
        const wv = Math.floor(beach.wet[x]), e = Math.floor(beach.edge[x]);
        for (let y = e; y < wv; y++) if (hash2(x, y >> 1, 9) < 0.35 - Math.abs(x - 252) / 70) fb.set(x, y, pal.sheen);
      }
      // footprints
      for (const p of S.prints) {
        const age = t - p.t;
        if (age > 9 && bayer4(p.x, p.y) < (age - 9) / 5) continue;
        for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, -1], [2, -1], [1, 1]]) {
          const x = p.x + dx, y = p.y + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          fb.d[y * W + x] = printCol(fb.d[y * W + x]);
        }
      }
      // long morning shadows fall toward us (sun behind the scene)
      const [ox, oy] = mk.origin();
      projShadow(fb, mk.last, ox, oy, mk.gy + 1, -0.28, 0.2, dark, null, 80);
      ball.render();
      projShadow(fb, ball.sprite, Math.round(ball.x) - ball.sprite.cx, Math.round(ball.y) - ball.sprite.cy, mk.gy + 1, -0.28, 0.2, dark);
      const inWater = beach.isWater(Math.round(mk.x), mk.gy + 1);
      if (inWater) mk.reflect(fb, mk.gy + 1, t, { tint: reflT, test: beach.isWater, fadeLen: 34 });
      parts.draw(fb, 0, t);
      const hopping = S.mode === 'hop';
      if (hopping) ball.draw(fb);
      mk.draw(fb, { waterY: inWater && mk.h < 3 ? mk.gy - 1 : null, sub: subT });
      if (inWater && mk.h < 2) {
        for (let dx = -15; dx <= 15; dx++) if (hash2(dx + Math.floor(t * 6), 0, 5) > 0.35) fb.set(Math.round(mk.x) + dx, mk.gy + Math.round((dx / 15) ** 2 * 2), pal.foam[0]);
      }
      if (!hopping) ball.draw(fb);
      parts.draw(fb, 1, t);
      if (S.heart > 0) Paintings.drawHeart(fb, mk.anchor('finTip')[0] + 6, mk.anchor('finTip')[1] - 6 - (1.2 - S.heart) * 12, S.heart);
      // foreground dune grass & driftwood
      Paintings.drawGrass(fb, t, 18, 216, 16, pal.grass);
      Paintings.drawGrass(fb, t, 370, 216, 12, pal.grass);
      for (let x = 30; x < 78; x++) {
        const y = 212 - Math.round((x - 30) * 0.12);
        fb.set(x, y, hex('#7a6166')); fb.set(x, y + 1, hex('#5a4652')); fb.set(x, y - 1, hex('#a88c8a'));
      }
      vignette(fb);
    }

    function tap(x, y) {
      if (Math.hypot(x - ball.x, y - ball.y) < ball.R + 5) {
        ball.vx = (x < ball.x ? 1 : -1) * 70;
        S.dir = Math.sign(ball.vx) || 1;
        sparkBurst(parts, ball.x, ball.y, 6, hex('#fff7e0'), hex('#ffc99e'));
        emit('boing', { soft: true });
        return 'ball';
      }
      const s = mk.last, [ox, oy] = mk.origin();
      const sx = Math.round(x - ox), sy = Math.round(y - oy);
      if (s && sx >= 0 && sy >= 0 && sx < s.buf.w && sy < s.buf.h && s.buf.d[sy * s.buf.w + sx]) {
        if (S.mode !== 'hop' && S.mode !== 'jump') { S.mode = 'jump'; S.vh = 170; S.vx = 0; }
        S.happy = 1; S.heart = 1.2; mk.fin.kick(4); mk.tail.kick(5);
        emit('cry');
        return 'mudkip';
      }
      if (beach.isWater(Math.round(x), Math.round(y))) {
        splash(parts, x, y, { power: 0.5, n: 10, crown: 8, test: beach.isWater, c2: hex('#d9c8e4') });
        emit('splash', { small: true });
        return 'water';
      }
      sparkBurst(parts, x, y, 5, hex('#fff7e0'), hex('#ffc99e'), 16);
      emit('twinkle');
      return 'other';
    }
    return {
      meta: {
        id: 'dawn', no: 'I', title: 'First Light', time: '06:12', place: 'Route 109 shore', poster: 5.2, period: 8.2,
        blurb: 'The sun lifts out of a lavender sea. Mudkip trots the waterline nosing the ball ahead of it, and each wave rubs out another row of pawprints.',
        medium: 'Animated pixels on canvas', size: '384 × 216 px',
        hint: 'Tap the ball to roll it · tap Mudkip · tap the water',
        alt: 'Pixel painting at sunrise: a half-risen sun over a lavender sea, Mudkip walking along the wet sand pushing a striped beach ball with its nose, pawprints behind it.',
      },
      W, H, step, draw, tap,
      warm(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) step(1 / 30); sounds.length = 0; },
    };
  }


  /* ================================================================
     IV · GOLDEN HOUR (dusk) — the balancing act
     ================================================================ */
  function dusk() {
    const hz = 102;
    const pal = Beach.H({
      sky: [[0, '#27285c'], [0.18, '#3d3476'], [0.36, '#673d8a'], [0.52, '#9c4680'], [0.67, '#d35a6c'], [0.8, '#f0835a'], [0.91, '#ffb05a'], [1, '#ffd98c']],
      sea: [[0, '#f59c6c'], [0.04, '#8d4f7e'], [0.24, '#5c3f7c'], [0.55, '#3d3a72'], [1, '#35456e']],
      horizon: '#ffc585',
      shallow: ['#35456e', '#4c5384', '#7a6592', '#b27a8d', '#e59884'],
      face: '#453f78',
      foam: ['#ffe9cf', '#f6b8a0', '#ad829c'],
      sand: ['#7a5162', '#a3666c', '#ca8670', '#e8a577'],
      sandWet: ['#573c5d', '#704966', '#8b566a', '#b36e6e'],
      sheen: '#ffbd78',
      prop: {
        starfish: { d: '#6e2a3e', r: '#d0645a', l: '#ff9a6e' },
        shell: { d: '#7a4a5a', r: '#e6a894', l: '#ffd8bc' },
        conch: { d: '#6a4050', r: '#d09080', l: '#f8c8a8' },
        pebble: { d: '#4a3a52', r: '#7a6278', l: '#a0839a' },
      },
      head: {
        rock: ['#2c1f3e', '#382849', '#4a3155'], grass: ['#3a2a4a', '#5a3a52'],
        tower: ['#5a4060', '#8a6078', '#b88090'], stripe: ['#5a2438', '#7a3044', '#9a4050'],
        iron: '#241a30', glass: '#ffd070', roof: '#5a2438', lampOn: ['#ffe28a', '#fff6d0'],
      },
      cloud: ['#553a7c', '#9a4a86', '#f27c64', '#ffc47a'],
      bigCloud: ['#6b3a7a', '#a8507e', '#f08c6a', '#ffd48c'],
      glint: ['#fff0b8', '#ffb46a'],
      palm: {
        trunk: ['#1c1226', '#241832', '#2e1d3a', '#56304a'], trunkLine: '#140c1e',
        nut: ['#140c1e', '#1e1428', '#2a1a32'],
        leaf: ['#170f22', '#1f152c', '#281a36', '#4c2a46'], spine: '#5a3450', outline: '#120a1a',
      },
      shadow: '#2e2450',
      sun: ['#ffae52', '#ffd878', '#fff4cc'],
    });
    const beach = Beach.create({
      W, H, hz, pal, seed: 41, sandTop: 150, skyBand: 0.22, seaBand: 0.45,
      sun: { x: 142, y: hz, r: 235, k: 0.62, sx: 1.6, sy: 1, p: 1.5 },
      shore: (x) => 170 + (x - 192) * 0.03 + Math.sin(x * 0.02) * 3,
      wave: { period: 7.4, reach: 14, far: 132, skew: 0.004, dry: 1.8 },
      props: [{ kind: 'shell', x: 96, y: 204 }, { kind: 'starfish', x: 336, y: 207 }, { kind: 'pebble', x: 186, y: 210 }, { kind: 'conch', x: 60, y: 196 }],
    });
    const bg = beach.bg;
    const lamp = Scenery.headland(bg, { x: 296, y: hz, w: 90, pal: pal.head, seed: 5 });
    const streaks = [
      { b: streak(5, 190, 9, pal.cloud), x: 0, y: 24, sp: 0.9 }, { b: streak(11, 120, 7, pal.cloud), x: 220, y: 44, sp: 0.6 },
      { b: streak(17, 160, 8, pal.cloud), x: 60, y: 70, sp: 0.45 }, { b: streak(23, 80, 5, pal.cloud), x: 280, y: 84, sp: 0.35 },
      { b: streak(29, 100, 5, pal.cloud), x: 150, y: 10, sp: 1.1 },
    ];
    streaks.push({ b: streak(37, 140, 10, pal.cloud), x: 250, y: 30, sp: 0.55 }, { b: streak(43, 90, 7, pal.cloud), x: 330, y: 60, sp: 0.4 });
    const glints = Scenery.makeGlints(12, 70, 0, W, hz + 2, 150);
    const vignette = Beach.makeVignette(W, H, 0.62, hex('#1a0c28'));
    const palmA = Scenery.makePalm({ pal: pal.palm, w: 130, h: 240, bx: 30, by: 244, kx: 14, ky: 150, cx: 52, cy: 44, fronds: 10, seed: 7, wBase: 13 });
    const palmB = Scenery.makePalm({ pal: pal.palm, w: 110, h: 200, bx: 70, by: 204, kx: 62, ky: 150, cx: 84, cy: 92, fronds: 8, seed: 19, wBase: 9, wTop: 5 });
    const parts = new Scenery.Particles();
    const mkPal = Mudkip.gradePalette(grader({ shadow: ['#34286a', 0.5], light: ['#ff9c7a', 0.22], all: ['#8e4f86', 0.3] }));
    const rimPal = Mudkip.gradePalette(grader({ all: ['#ffae52', 0.62], light: ['#fff2b8', 0.55] }));
    const light = { dir: [-0.35, 0.5, 0.78], th: [0.12, 0.55, 0.96], spec: 0.998, rim: { dir: [-0.95, 0.3], k: 0.17, pal: rimPal, base: 3 } };
    const ballPal = Ball.grade(grader({ shadow: ['#3e2f74', 0.4], all: ['#b0608a', 0.18] }));
    const ballRim = Ball.grade(grader({ all: ['#ffb45a', 0.5] }));
    const mk = new MudkipActor({ x: 262, gy: 190, yaw: Math.PI - 1.12, pal: mkPal, light, scale: 1.28 });
    const ball = new BallActor({ x: 250, y: 80, R: 12, light: { dir: [-0.15, 0.55, 0.8], rim: { dir: [-0.93, 0.36], k: 0.3 } }, pal: ballPal });
    const S = { t: 0, mode: 'balance', vy: 0, toss: 4, happy: 0, heart: 0, spin: 0, catchT: 0, wob: 0 };
    const G = 260;
    const sounds = [];
    const emit = (name, o = {}) => sounds.push(Object.assign({ name }, o));
    const dark = PX.cmap((c) => mix(c, pal.shadow, 0.42));
    const firstStar = { x: 58, y: 16 };

    function step(dt) {
      S.t += dt;
      const t = S.t;
      beach.update(t, dt);
      mk.sq.step(dt); mk.fin.step(dt); mk.tail.step(dt);
      S.happy = Math.max(0, S.happy - dt);
      S.heart = Math.max(0, S.heart - dt);
      // spin trick
      let yaw = Math.PI - 1.12;
      if (S.spin > 0) { S.spin = Math.max(0, S.spin - dt); yaw += (1 - S.spin / 1.3) * Math.PI * 2; }
      mk.yaw = yaw;
      const blink = S.happy <= 0 && mk.blink(t, dt);
      const up = S.mode === 'toss' && ball.vy < 0;
      mk.sprite({
        squash: clamp(mk.sq.x * 0.5 + Math.sin(t * 2.2) * 0.012, -0.15, 0.25),
        headPitch: S.mode === 'toss' ? clamp(0.18 + (mk.gy - 70 - ball.y) * 0.004, 0, 0.42) : 0.14 + Math.sin(t * 1.3) * 0.03,
        headRoll: S.mode === 'balance' ? Math.sin(t * 1.9) * 0.05 : 0,
        lean: 0.05,
        legF: 0, legB: 0,
        mouth: S.happy > 0 ? 1 : 0.55,
        eyes: S.happy > 0 ? 'happy' : blink ? 'blink' : 'open',
        finSway: clamp(0.02 + mk.fin.x * 0.3, -0.2, 0.35),
        tailLift: clamp(mk.tail.x * 0.3, -0.2, 0.3),
        tailWag: Math.sin(t * 4) * 0.18,
        gill: Math.sin(t * 3.4) * 0.05,
      });
      const ft = mk.anchor('finTip');
      if (S.mode === 'balance') {
        S.wob = Math.sin(t * 1.9 + 0.6) * 1.6;
        ball.x = ft[0] + S.wob;
        ball.y = ft[1] - ball.R + 3;
        ball.axis = [0.05, 1, 0.1];
        ball.w = 3.2;
        S.toss -= dt;
        if (S.toss <= 0) {
          S.mode = 'toss'; ball.vy = -Math.sqrt(2 * G * (30 + Math.random() * 14)); ball.vx = (Math.random() - 0.5) * 8;
          mk.fin.kick(5); mk.sq.kick(-3);
          emit('boing', { soft: true });
        }
      } else {
        ball.vy += G * dt;
        ball.x += ball.vx * dt;
        ball.x += (ft[0] - ball.x) * Math.min(1, dt * 2.5);
        ball.y += ball.vy * dt;
        ball.axis = [0.4, 0.3, 1]; ball.w = 7;
        const cy = ft[1] - ball.R + 3;
        if (ball.vy > 0 && ball.y >= cy) {
          ball.y = cy; S.mode = 'balance'; S.toss = 4.5 + Math.random() * 2.5; S.happy = 0.5;
          mk.sq.kick(3); mk.fin.kick(-3);
          sparkBurst(parts, ball.x, ball.y + ball.R, 5, hex('#fff4c8'), hex('#ffb46a'), 18);
          emit('plip');
        }
      }
      ball.spin(dt);
      parts.update(dt);
      return sounds.splice(0);
    }

    function draw(fb) {
      const t = S.t;
      fb.copyFrom(bg);
      // first star of the evening
      const tw = Math.sin(t * 2.3) * 0.5 + 0.5;
      star(fb, firstStar.x, firstStar.y, tw > 0.6 ? 2 : 1, hex('#fff6e0'), hex('#c8a8e8'));
      sunDisc(fb, 142, hz + 6, 24, pal.sun, hz, t, 0.9);
      // clouds cross in front of the sun
      for (const c of streaks) {
        const span = W + c.b.w;
        const x = ((c.x + t * c.sp) % span + span) % span - c.b.w;
        fb.blit(c.b, x, c.y, { test: (px, py) => py < hz });
      }
      // lighthouse lamp + faint beam
      if (lamp) {
        const a = t * 0.9, dx = Math.sin(a);
        const flare = Math.cos(a) > 0.93;
        Scenery.glow(fb, lamp.lampX + 0.5, lamp.lampY + 0.5, flare ? 16 : 8, hex('#fff0c0'), flare ? 0.9 : 0.6, (x, y) => y < hz + 2);
        beam(fb, lamp.lampX, lamp.lampY, dx, 120, hex('#ffe8b8'), 0.22, hz);
      }
      for (let g = 0; g < 4; g++) {
        const span = W + 80;
        const gx = ((t * (9 + g) + g * 40) % span) - 40;
        birdV(fb, gx, 62 + Math.sin(t * 0.8 + g * 2) * 3 + g * 5, t * 5 + g * 1.7, hex('#2c1c3c'));
      }
      Scenery.drawGlints(fb, glints, t, pal.glint[0], pal.glint[1], (x, y) => y > hz && y < beach.edge[clamp(x, 0, W - 1)] - 28);
      glitter(fb, t, 142, hz + 1, 178, 12, 70, pal.glint, 7, (x, y) => beach.isWater(x, y) || y < 150, 0.62);
      beach.drawShore(fb, t);
      // sunset streak on the wet sand
      for (let x = 100; x < 186; x++) {
        const wv = Math.floor(beach.wet[x]), e = Math.floor(beach.edge[x]);
        for (let y = e; y < wv; y++) if (hash2(x, y >> 1, 3) < 0.45 - Math.abs(x - 142) / 90) fb.set(x, y, pal.sheen);
      }
      // long shadows stretch away from the sun, toward us and to the right
      const [ox, oy] = mk.origin();
      projShadow(fb, mk.last, ox, oy, mk.gy + 1, 1.25, 0.2, dark);
      ball.render();
      projShadow(fb, ball.sprite, Math.round(ball.x) - ball.sprite.cx, Math.round(ball.y) - ball.sprite.cy, mk.gy + 1, 1.25, 0.2, dark);
      parts.draw(fb, 0, t);
      mk.draw(fb);
      // warm rim on the ball's sun side
      const bs = ball.sprite;
      fb.blit(bs.buf, Math.round(ball.x) - bs.cx, Math.round(ball.y) - bs.cy);
      rimBall(fb, ball, hex('#ffcf7a'));
      parts.draw(fb, 1, t);
      if (S.heart > 0) Paintings.drawHeart(fb, ball.x + 14, ball.y - 8 - (1.2 - S.heart) * 12, S.heart);
      fb.blit(palmB[Math.floor(t * 2.6 + 3) % palmB.length], -10, 12);
      fb.blit(palmA[Math.floor(t * 2.2) % palmA.length], -18, -28);
      vignette(fb);
    }
    function rimBall(fb, b, c) {
      const R = b.R, cx = Math.round(b.x), cy = Math.round(b.y);
      for (let a = 2.2; a < 4.3; a += 0.05) {
        const x = Math.round(cx + Math.cos(a) * (R - 0.5)), y = Math.round(cy + Math.sin(a) * (R - 0.5));
        fb.set(x, y, c);
      }
    }
    function tap(x, y) {
      if (Math.hypot(x - ball.x, y - ball.y) < ball.R + 6) {
        if (S.mode === 'balance') { S.mode = 'toss'; ball.vy = -Math.sqrt(2 * G * 70); ball.vx = 0; mk.fin.kick(6); }
        else ball.vy -= 90;
        sparkBurst(parts, ball.x, ball.y, 6, hex('#fff4c8'), hex('#ffb46a'));
        emit('boing', { soft: true });
        return 'ball';
      }
      const s = mk.last, [ox, oy] = mk.origin();
      const sx = Math.round(x - ox), sy = Math.round(y - oy);
      if (s && sx >= 0 && sy >= 0 && sx < s.buf.w && sy < s.buf.h && s.buf.d[sy * s.buf.w + sx]) {
        if (S.spin <= 0) S.spin = 1.3;
        S.happy = 1.4; S.heart = 1.2; mk.tail.kick(5);
        emit('cry');
        return 'mudkip';
      }
      if (beach.isWater(Math.round(x), Math.round(y))) {
        splash(parts, x, y, { power: 0.5, n: 10, crown: 8, test: beach.isWater, c: hex('#fff0d8'), c2: hex('#f6a088'), ring: hex('#ffd8b8') });
        emit('splash', { small: true });
        return 'water';
      }
      sparkBurst(parts, x, y, 6, hex('#fff4c8'), hex('#ffb46a'), 18);
      emit('twinkle');
      return 'other';
    }
    return {
      meta: {
        id: 'dusk', no: 'IV', title: 'Golden Hour', time: '18:47', place: 'Route 109 shore', poster: 2.4, period: 7.4,
        blurb: 'The sun sinks behind the palms and paints everything orange. Mudkip balances the ball on the tip of its head fin, rim-lit, its shadow reaching across the sand.',
        medium: 'Animated pixels on canvas', size: '384 × 216 px',
        hint: 'Tap the ball to toss it · tap Mudkip for a spin · tap the water',
        alt: 'Pixel painting at sunset: a huge orange sun on the horizon, palm silhouettes on the left, Mudkip standing on the sand balancing a beach ball on its head fin, rim-lit gold with a long shadow.',
      },
      W, H, step, draw, tap,
      warm(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) step(1 / 30); sounds.length = 0; },
    };
  }

  // rotating lighthouse beam: dx = sin(angle), dithered lighten wedge
  function beam(fb, lx, ly, dx, len, color, strength, hz) {
    const L = Math.abs(dx) * len + 6;
    const dir = Math.sign(dx) || 1;
    for (let k = 2; k < L; k++) {
      const x = lx + dir * k;
      const half = 1 + k * 0.07;
      const f = (1 - k / L) * strength;
      for (let y = Math.floor(ly - half); y <= ly + half * 0.6; y++) {
        if (y >= hz + 2 || x < 0 || x >= W || y < 0) continue;
        if (bayer4(x, y) < f * (1 - Math.abs(y - ly) / (half + 1))) {
          const i = y * W + x;
          fb.d[i] = mixc(fb.d[i], color, 0.35);
        }
      }
    }
  }

  /* ================================================================
     V · MOONLIT LULLABY (night) — asleep against the ball
     ================================================================ */
  function night() {
    const hz = 100;
    const pal = Beach.H({
      sky: [[0, '#04071a'], [0.3, '#081030'], [0.58, '#0e1a44'], [0.84, '#18285a'], [1, '#253c72']],
      sea: [[0, '#3c5a96'], [0.04, '#17264f'], [0.28, '#0f1b41'], [0.6, '#0f1d42'], [1, '#14284c']],
      horizon: '#4a6aa8',
      shallow: ['#14284c', '#183157', '#1c3a61', '#22456b', '#2a4f72'],
      face: '#12234a',
      foam: ['#c8fff6', '#5ff2e0', '#279fb2'],
      sand: ['#2a3048', '#373f5a', '#454e6e', '#566182'],
      sandWet: ['#1d2238', '#262d46', '#303954', '#3e4a6c'],
      sheen: '#7c95cc',
      prop: {
        starfish: { d: '#2c2440', r: '#6a4e70', l: '#8e6c90' },
        shell: { d: '#34384e', r: '#7a8098', l: '#a4aac0' },
        conch: { d: '#30344a', r: '#6e7490', l: '#9aa0b8' },
        pebble: { d: '#20243a', r: '#40465e', l: '#5a6078' },
      },
      head: {
        rock: ['#0c1024', '#12182e', '#1a2240'], grass: ['#141c30', '#1e2a40'],
        tower: ['#39405e', '#5a6280', '#8088a8'], stripe: ['#3a2438', '#4e2e44', '#643a52'],
        iron: '#0a0c18', glass: '#ffe08a', roof: '#3a2438', lampOn: ['#ffe9a0', '#fffbe8'],
      },
      cloud: ['#0c1330', '#18244a', '#3a4c80', '#9aaee0'],
      glint: ['#eef4ff', '#8ea8dc'],
      palm: {
        trunk: ['#070a18', '#0b1020', '#10162a', '#2a3a5e'], trunkLine: '#05070f',
        nut: ['#05070f', '#0a0e1c', '#141a2e'],
        leaf: ['#060914', '#0a0f1e', '#0f1628', '#2c3e66'], spine: '#34466e', outline: '#04060e',
      },
      shadow: '#050818',
      moon: ['#c9c2a2', '#ece5c6', '#fbf8e6'],
    });
    const beach = Beach.create({
      W, H, hz, pal, seed: 51, sandTop: 150, skyBand: 0.26, seaBand: 0.45,
      sun: { x: 306, y: 34, r: 120, k: 0.3, p: 1.8 },
      shore: (x) => 170 + (x - 192) * -0.02 + Math.sin(x * 0.02 + 1) * 3,
      wave: { period: 7.8, reach: 13, far: 130, skew: 0.004, dry: 1.3 },
      props: [{ kind: 'shell', x: 262, y: 206 }, { kind: 'starfish', x: 84, y: 208 }, { kind: 'pebble', x: 320, y: 210 }],
    });
    const bg = beach.bg;
    // milky way band + stars (baked); twinkling ones animated
    const r = rng(77);
    const stars = [];
    for (let y = 0; y < hz - 3; y++)
      for (let x = 0; x < W; x++) {
        const band = Math.exp(-Math.pow((y - (x * 0.32 - 20)) / 22, 2));
        const n = fbm(x * 0.05, y * 0.08, 9, 3);
        if (band > 0.12 && bayer8(x, y) < band * n * 0.7) bg.d[y * W + x] = mixc(bg.d[y * W + x], hex('#34448a'), 0.4);
        const h = hash2(x, y, 5);
        if (h < 0.0045 + band * 0.012) bg.d[y * W + x] = h < 0.0015 ? hex('#ffffff') : hex('#8fa0d8');
      }
    for (let i = 0; i < 46; i++) stars.push({ x: Math.floor(r() * W), y: Math.floor(r() * (hz - 12)), ph: r() * 6.28, sp: 0.8 + r() * 2.2, big: r() < 0.22, c: [hex('#ffffff'), hex('#cfe0ff'), hex('#fff0c8')][Math.floor(r() * 3)] });
    // moon with craters + halo
    const MX = 306, MY = 34, MR = 12;
    Scenery.glow(bg, MX + 0.5, MY + 0.5, 46, hex('#8ea6e0'), 0.35, (x, y) => y < hz, null, 3, 0.2);
    for (let y = MY - MR; y <= MY + MR; y++)
      for (let x = MX - MR; x <= MX + MR; x++) {
        const dx = x + 0.5 - MX, dy = y + 0.5 - MY, d = Math.hypot(dx, dy) / MR;
        if (d > 1) continue;
        let tn = d > 0.85 ? 0 : dx + dy * 0.6 < -3 ? 2 : 1;
        const cr = [[-3, -2, 3], [4, 3, 2.4], [1, -5, 1.6], [-4, 5, 1.8], [5, -3, 1.2]];
        for (const [cx, cy, rr] of cr) if (Math.hypot(dx - cx, dy - cy) < rr) tn = Math.max(0, tn - 1);
        bg.set(x, y, pal.moon[tn]);
      }
    const lamp = Scenery.headland(bg, { x: 294, y: hz, w: 90, pal: pal.head, seed: 5, lampOn: true });
    const clouds = [{ b: streak(61, 150, 8, pal.cloud), x: 120, y: 30, sp: 1.6 }, { b: streak(67, 100, 6, pal.cloud), x: 10, y: 60, sp: 1.1 }, { b: streak(71, 80, 5, pal.cloud), x: 260, y: 74, sp: 0.8 }];
    const vignette = Beach.makeVignette(W, H, 0.7, hex('#02030c'));
    const palm = Scenery.makePalm({ pal: pal.palm, w: 130, h: 240, bx: 104, by: 244, kx: 110, ky: 150, cx: 82, cy: 50, fronds: 10, seed: 23, wBase: 13 });
    const parts = new Scenery.Particles();
    const mkPal = Mudkip.gradePalette(grader({ all: ['#23397a', 0.46], shadow: ['#0c1236', 0.5], light: ['#cfe0ff', 0.3] }));
    const rimPal = Mudkip.gradePalette(grader({ all: ['#46e6d6', 0.55], light: ['#d8fff8', 0.5] }));
    const light = { dir: [0.55, 0.7, 0.45], th: [0.05, 0.4, 0.9], spec: 0.995, rim: { dir: [-0.55, 0.83], k: 0.3, pal: rimPal, base: 2 } };
    const ballPal = Ball.grade(grader({ all: ['#23397a', 0.5], shadow: ['#0c1236', 0.4], light: ['#cfe0ff', 0.2] }));
    const mk = new MudkipActor({ x: 200, gy: 194, yaw: Math.PI / 2 + 0.34, pal: mkPal, light, scale: 1.3 });
    const ball = new BallActor({ x: 160, y: 194 - 13, R: 13, light: { dir: [0.55, 0.7, 0.45], rim: { dir: [-0.55, 0.83], k: 0.35 } }, pal: ballPal });
    ball.rot = M3.mul(M3.rz(0.4), M3.rx(0.5));
    const S = { t: 0, stir: 0, heart: 0, zT: 0.4, shoot: 5 + Math.random() * 4, meteors: [] };
    const flies = [];
    for (let i = 0; i < 12; i++) flies.push({ x: 40 + r() * 300, y: 118 + r() * 70, ph: r() * 6.28, sp: 0.3 + r() * 0.5, a: 6 + r() * 14 });
    const sounds = [];
    const emit = (name, o = {}) => sounds.push(Object.assign({ name }, o));
    const dark = PX.cmap((c) => mix(c, pal.shadow, 0.45));
    const glowC = hex('#3fd6c8');

    function step(dt) {
      S.t += dt;
      const t = S.t;
      beach.update(t, dt);
      mk.sq.step(dt); mk.fin.step(dt); mk.tail.step(dt);
      S.heart = Math.max(0, S.heart - dt);
      const stirring = S.stir > 0;
      S.stir = Math.max(0, S.stir - dt);
      const br = Math.sin(t * 1.6);
      const yawn = stirring && S.stir > 1.1 && S.stir < 2.1;
      mk.sprite({
        squash: 0.17 + br * 0.022 + mk.sq.x * 0.4,
        bodyDip: 3,
        headPitch: stirring ? 0.05 : -0.1 + br * 0.02,
        headRoll: stirring ? 0.05 : 0.24,
        headYaw: stirring ? 0 : 0.12,
        legF: 0.95, legB: -1.05,
        mouth: yawn ? 0.9 : 0,
        eyes: stirring ? (S.stir > 2.1 || S.stir < 0.5 ? 'blink' : 'open') : 'sleep',
        finSway: clamp(0.14 + mk.fin.x * 0.3, -0.2, 0.4),
        tailLift: -0.28 + mk.tail.x * 0.2, tailWag: 0.5,
        gill: Math.sin(t * 1.6) * 0.06,
        lean: -0.04,
      });
      // Zzz
      S.zT -= dt;
      if (S.zT <= 0 && !stirring) {
        S.zT = 1.7;
        const ft = mk.anchor('finTip');
        parts.add({ type: 'z', x: ft[0] - 16, y: ft[1] + 4, vx: -6, vy: -9, life: 3.2, layer: 1, draw: (fb, p, k) => {
          if (k > 0.7 && bayer4(Math.round(p.x), Math.round(p.y)) < (k - 0.7) / 0.3) return;
          pixText(fb, k < 0.35 ? 'z' : 'Z', p.x + Math.sin(k * 6) * 2, p.y, hex('#cfe6ff'), 1);
        } });
        emit('snore');
      }
      // shooting stars
      S.shoot -= dt;
      if (S.shoot <= 0) { S.shoot = 8 + Math.random() * 7; spawnMeteor(); }
      for (const m of S.meteors) m.age += dt;
      S.meteors = S.meteors.filter((m) => m.age < m.life);
      parts.update(dt);
      return sounds.splice(0);
    }
    function spawnMeteor(x, y) {
      S.meteors.push({ x: x ?? 60 + Math.random() * 260, y: y ?? 6 + Math.random() * 30, vx: -(90 + Math.random() * 60), vy: 40 + Math.random() * 20, age: 0, life: 0.9 });
    }
    function draw(fb) {
      const t = S.t;
      fb.copyFrom(bg);
      for (const s of stars) {
        const tw = Math.sin(t * s.sp + s.ph);
        if (tw < -0.5) continue;
        if (s.big && tw > 0.55) star(fb, s.x, s.y, 2, s.c, hex('#5a6aa8'));
        else fb.set(s.x, s.y, tw > 0.2 ? s.c : hex('#6a7ab8'));
      }
      for (const m of S.meteors) {
        const k = m.age / m.life;
        const x = m.x + m.vx * m.age, y = m.y + m.vy * m.age;
        for (let j = 0; j < 14; j++) {
          const px = Math.round(x - m.vx * j * 0.006), py = Math.round(y - m.vy * j * 0.006);
          if (py >= hz || bayer4(px, py) < k * 0.8 + j * 0.05) continue;
          fb.set(px, py, j < 2 ? hex('#ffffff') : j < 6 ? hex('#cfe0ff') : hex('#6f84c8'));
        }
      }
      for (const c of clouds) {
        const span = W + c.b.w;
        const x = ((c.x + t * c.sp) % span + span) % span - c.b.w;
        fb.blit(c.b, x, c.y, { test: (px, py) => py < hz });
      }
      // lighthouse: lamp flare + sweeping beam
      if (lamp) {
        const a = t * 0.85, dx = Math.sin(a), toward = Math.cos(a);
        beam(fb, lamp.lampX, lamp.lampY, dx, 190, hex('#fff2c8'), 0.55, hz);
        Scenery.glow(fb, lamp.lampX + 0.5, lamp.lampY + 0.5, toward > 0.9 ? 22 : 9, hex('#fff2c0'), toward > 0.9 ? 1 : 0.7, (x, y) => y < hz + 3);
      }
      glitter(fb, t, MX, hz + 1, 176, 5, 40, pal.glint, 13, (x, y) => beach.isWater(x, y) || y < 150, 0.55);
      beach.drawShore(fb, t, { glowFoam: pal.foam });
      // bioluminescent glow spilling from the foam
      for (let x = 0; x < W; x++) {
        const e = Math.floor(beach.edge[x]);
        const inf = beach.waveInfo()[x];
        const strength = inf.p > 0.36 && inf.p < 0.7 ? 1 : 0.45;
        for (let j = -9; j <= 5; j++) {
          const y = e + j;
          if (y < 0 || y >= H) continue;
          const k = (1 - Math.abs(j + 2) / 9) * strength * 0.55;
          if (k > 0 && bayer4(x, y) < k) { const i = y * W + x; fb.d[i] = mixc(fb.d[i], glowC, 0.3); }
        }
        if (inf.br !== null) {
          const by = Math.round(inf.br);
          for (let j = -3; j <= 3; j++) if (bayer4(x, by + j) < 0.4 - Math.abs(j) * 0.1) { const i = (by + j) * W + x; if (by + j < H) fb.d[i] = mixc(fb.d[i], glowC, 0.3); }
        }
      }
      // moonlight on the wet sand
      for (let x = 286; x < 326; x++) {
        const wv = Math.floor(beach.wet[x]), e = Math.floor(beach.edge[x]);
        for (let y = e; y < wv; y++) if (hash2(x, y >> 1, 7) < 0.3 - Math.abs(x - MX) / 70) fb.set(x, y, pal.sheen);
      }
      const [ox, oy] = mk.origin();
      projShadow(fb, mk.last, ox, oy, mk.gy + 1, -0.4, 0.16, dark, null, 60);
      ball.render();
      projShadow(fb, ball.sprite, Math.round(ball.x) - ball.sprite.cx, Math.round(ball.y) - ball.sprite.cy, mk.gy + 1, -0.4, 0.16, dark);
      parts.draw(fb, 0, t);
      ball.draw(fb);
      mk.draw(fb);
      // fireflies drifting over the sand
      for (const f of flies) {
        const x = f.x + Math.sin(t * f.sp + f.ph) * f.a, y = f.y + Math.sin(t * f.sp * 1.7 + f.ph * 2) * 5;
        const on = Math.sin(t * 2.2 + f.ph * 3) > -0.2;
        if (!on) continue;
        Scenery.glow(fb, x + 0.5, y + 0.5, 4, hex('#d8f080'), 0.9);
        fb.set(Math.round(x), Math.round(y), hex('#fbffc8'));
      }
      parts.draw(fb, 1, t);
      if (S.heart > 0) Paintings.drawHeart(fb, mk.anchor('finTip')[0] + 6, mk.anchor('finTip')[1] - 6 - (1.2 - S.heart) * 12, S.heart);
      fb.blit(palm[Math.floor(t * 1.6) % palm.length], 270, -30);
      vignette(fb);
    }
    function tap(x, y) {
      const s = mk.last, [ox, oy] = mk.origin();
      const sx = Math.round(x - ox), sy = Math.round(y - oy);
      if (s && sx >= 0 && sy >= 0 && sx < s.buf.w && sy < s.buf.h && s.buf.d[sy * s.buf.w + sx]) {
        S.stir = 2.8; S.heart = 1.2; mk.fin.kick(3); mk.sq.kick(-1.5);
        emit('cry');
        return 'mudkip';
      }
      if (Math.hypot(x - ball.x, y - ball.y) < ball.R + 5) {
        ball.rot = M3.mul(Ball.axisAngle([0, 0, 1], 0.7), ball.rot);
        sparkBurst(parts, ball.x, ball.y, 5, hex('#ffffff'), hex('#8fe8ff'));
        emit('twinkle');
        return 'ball';
      }
      if (y < hz) { spawnMeteor(x + 30, y - 6); sparkBurst(parts, x, y, 4, hex('#ffffff'), hex('#9fb4ff'), 14); emit('twinkle'); return 'sky'; }
      if (beach.isWater(Math.round(x), Math.round(y))) {
        splash(parts, x, y, { power: 0.55, n: 12, crown: 10, test: beach.isWater, c: hex('#d8fff8'), c2: hex('#46e6d6'), ring: hex('#5ff2e0') });
        emit('splash', { small: true });
        return 'water';
      }
      sparkBurst(parts, x, y, 5, hex('#fbffc8'), hex('#d8f080'), 16);
      emit('twinkle');
      return 'other';
    }
    return {
      meta: {
        id: 'night', no: 'V', title: 'Moonlit Lullaby', time: '23:10', place: 'Route 109 shore', poster: 3.2, period: 7.8,
        blurb: 'Tired out, Mudkip sleeps curled against the ball. The breaking waves glow blue-green, the lighthouse beam sweeps the bay and now and then a star falls.',
        medium: 'Animated pixels on canvas', size: '384 × 216 px',
        hint: 'Tap Mudkip to stir it · tap the sky for a falling star · tap the glowing water',
        alt: 'Pixel painting at night: a full moon and stars over a dark sea with glowing blue-green waves, a lighthouse beam, and Mudkip asleep on the sand leaning on its beach ball.',
      },
      W, H, step, draw, tap,
      warm(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) step(1 / 30); sounds.length = 0; },
    };
  }

  /* ================================================================
     III · SWELL SEASON (afternoon) — swimming, flicks and a leap
     ================================================================ */
  function surf() {
    const hz = 80;
    const pal = Beach.H({
      sky: [[0, '#3a7bcd'], [0.3, '#4a8fda'], [0.6, '#6aa9e6'], [0.85, '#95c6f0'], [1, '#c6e3f6']],
      sea: [[0, '#8fbfe6'], [0.02, '#255aa3'], [0.16, '#2867b2'], [0.45, '#2c7cc0'], [0.78, '#3190c9'], [1, '#369fcc']],
      horizon: '#b4d8f2',
      shallow: ['#369fcc', '#3fb3d4', '#5ac6d6', '#8ddcd8', '#bcead8'],
      foam: ['#ffffff', '#dff4fa', '#a6d7e8'],
      sand: ['#c49a60', '#ddbb82', '#edd4a0', '#f7e7c2'], sandWet: ['#9c7a50', '#b59262', '#c6a576', '#d9c09a'],
      cloud: ['#9dbbdc', '#c5daee', '#e9f3fc', '#ffffff'],
      head: {
        rock: ['#445a70', '#5c738b', '#809bb0'], grass: ['#3d8a45', '#6ab85c'],
        tower: ['#b7b0a7', '#eeeae3', '#ffffff'], stripe: ['#94302b', '#d2443a', '#ee675a'],
        iron: '#343a46', glass: '#9fd9f2', roof: '#b3352e', lampOn: ['#ffe58a', '#fff8d2'],
      },
      rock: ['#1f2c3c', '#2f4054', '#46596e', '#6a8196', '#9ab0c0'],
      shadow: '#1d3a6a',
    });
    const beach = Beach.create({ W, H, hz, pal, seed: 61, sandTop: H, sun: { x: 370, y: -40, r: 200, k: 0.42, p: 1.5 }, skyBand: 0.2, seaBand: 0.5, shore: () => H + 60, wave: { reach: 0 } });
    const bg = beach.bg;
    const lamp = Scenery.headland(bg, { x: 268, y: hz, w: 118, pal: pal.head, seed: 9 });
    // foreground rocks (bottom right), baked into their own layer
    const rocks = new Buf(W, H);
    const boulders = [[330, 208, 30, 20], [364, 196, 26, 24], [300, 214, 18, 12], [384, 214, 22, 16], [352, 214, 16, 10]];
    for (const [cx, cy, rx, ry] of boulders)
      for (let y = Math.floor(cy - ry); y < Math.min(H, cy + ry); y++)
        for (let x = Math.floor(cx - rx); x < Math.min(W, cx + rx); x++) {
          const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
          const d = u * u + v * v + (fbm(x * 0.2, y * 0.2, 4, 2) - 0.5) * 0.35;
          if (d > 1 || x < 0) continue;
          const lit = -u * 0.5 - v * 0.85;
          let tn = lit > 0.55 ? 4 : lit > 0.15 ? 3 : lit > -0.3 ? 2 : 1;
          if (d > 0.86) tn = 0;
          if (hash2(x, y, 3) < 0.08 && tn > 1) tn -= 1;
          rocks.set(x, y, pal.rock[tn]);
        }
    const clouds = [
      { buf: Scenery.makeCloud(71, 120, 40, pal.cloud, { upper: 3 }), x: 20, y: 10, sp: 1.6 },
      { buf: Scenery.makeCloud(77, 70, 24, pal.cloud), x: 190, y: 26, sp: 1.1 },
      { buf: Scenery.makeCloud(83, 44, 15, pal.cloud, { upper: 1, puffs: 4 }), x: 300, y: 12, sp: 0.8 },
    ];
    const vignette = Beach.makeVignette(W, H, 0.5, hex('#10224a'));
    const parts = new Scenery.Particles();
    const light = { dir: [0.45, 0.75, 0.5] };
    const mk = new MudkipActor({ x: 150, gy: 170, yaw: 1.2, pal: Mudkip.BASE_PAL, light, scale: 1.24, bh: 150, oy: 0.72 });
    const ball = new BallActor({ x: 200, y: 140, R: 12, light });
    const A0 = 1.7, EXP = 0.6, OM = 1.9;
    const phiRow = new Float32Array(H + 1);
    for (let y = 0; y <= H; y++) phiRow[y] = y > hz ? A0 * Math.pow(y - hz, EXP) : 0;
    const phi = (x, y, t) => A0 * Math.pow(Math.max(0, y - hz), EXP) - OM * t + 0.45 * Math.sin(x * 0.028 + y * 0.03 - t * 0.6) + 0.3 * Math.sin(x * 0.067 - y * 0.02 + t * 0.4);
    const amp = (y) => 0.4 + 3.4 * clamp((y - hz) / (H - hz), 0, 1);
    const surfAt = (x, y, t) => y - Math.sin(phi(x, y, t)) * amp(y);
    const DEPTH = 150;
    const toneDark = PX.cmap((c) => mix(c, hex('#15427f'), 0.34));
    const toneLight = PX.cmap((c) => mix(c, hex('#95d2f0'), 0.26));
    const crestC = hex('#e3f7ff');
    const under = PX.cmap((c) => mix(c, hex('#1d5a98'), 0.62));
    const under2 = PX.cmap((c) => mix(c, hex('#1a4f8c'), 0.78));
    const S = { t: 0, mode: 'swim', dir: 1, flicks: 0, sink: 19, u: 0, leap: null, ballMode: 'float', vx: 0, happy: 0, heart: 0, wakeT: 0, spray: 2.5, recover: 0, exitDone: false, entryDone: false, diveT: 0 };
    const G = 260;
    const sounds = [];
    const emit = (name, o = {}) => sounds.push(Object.assign({ name }, o));
    const inSea = (x, y) => y > hz && !rocks.get(x, y);

    function launchBall(vx, vy) { S.ballMode = 'air'; ball.vx = vx; ball.vy = vy; ball.axis = V3.norm([Math.random() - 0.5, 0.5, 1]); ball.w = -Math.sign(vx) * (6 + Math.random() * 4); }

    function step(dt) {
      S.t += dt;
      const t = S.t;
      mk.sq.step(dt); mk.fin.step(dt); mk.tail.step(dt);
      S.happy = Math.max(0, S.happy - dt);
      S.heart = Math.max(0, S.heart - dt);
      // ---- ball
      const bs = surfAt(ball.x, DEPTH + 2, t);
      if (S.ballMode === 'air') {
        ball.vy += G * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < 60 || ball.x > 316) ball.vx = -ball.vx;
        if (ball.vy > 0 && ball.y >= bs - ball.R * 0.5) {
          S.ballMode = 'float'; ball.vx *= 0.25;
          splash(parts, ball.x, bs + 1, { power: 0.7, n: 14, crown: 10, test: inSea });
          emit('splash');
        }
      } else {
        ball.vx *= Math.exp(-1.4 * dt);
        ball.x += ball.vx * dt;
        ball.y = bs - ball.R * 0.5;
        ball.w *= Math.exp(-1.2 * dt);
      }
      ball.spin(dt);
      // ---- mudkip
      const surfY = surfAt(mk.x, DEPTH, t);
      const noseOff = 20;
      if (S.mode === 'swim') {
        S.sink += (19 - S.sink) * Math.min(1, dt * 4);
        if (S.ballMode === 'float') {
          const wantDir = ball.x > 290 ? -1 : ball.x < 90 ? 1 : S.dir;
          if (wantDir !== S.dir && Math.abs(ball.x - mk.x) > 26) S.dir = wantDir;
          const target = ball.x - S.dir * noseOff;
          const gap = target - mk.x;
          if (Math.abs(gap) > 3) {
            if (Math.sign(gap) !== S.dir && Math.abs(gap) > 30) S.dir = Math.sign(gap);
            S.vx += (Math.sign(gap) * Math.min(38, Math.abs(gap) * 2.5) - S.vx) * Math.min(1, dt * 3);
          } else {
            S.vx *= 0.8;
            // flick!
            S.flicks++;
            const dir = ball.x > 250 ? -1 : ball.x < 130 ? 1 : S.dir;
            launchBall(dir * (46 + Math.random() * 22), -(150 + Math.random() * 30));
            S.dir = dir;
            mk.fin.kick(6); mk.sq.kick(-3); S.happy = 0.35;
            splash(parts, ball.x, surfY + 1, { power: 0.45, n: 8, crown: 6, test: inSea });
            emit('boing');
            if (S.flicks % 3 === 0) { S.mode = 'dive'; S.diveT = 0; }
          }
        } else S.vx *= Math.exp(-2 * dt);
        mk.x += S.vx * dt;
      } else if (S.mode === 'dive') {
        S.diveT += dt;
        S.sink = lerp(19, 56, Math.min(1, S.diveT / 0.45));
        if (Math.random() < dt * 30) parts.add({ type: 'drop', x: mk.x + (Math.random() - 0.5) * 16, y: surfY - 1, vx: 0, vy: -10, g: 0, life: 0.35, c: pal.foam[1], size: 1, layer: 1 });
        if (S.diveT > 0.45 && S.ballMode === 'float') {
          const x1 = ball.x - S.dir * 10;
          S.mode = 'leap'; S.u = 0; S.exitDone = false; S.entryDone = false;
          S.leap = { x0: mk.x, x1, dur: 0.85 };
          emit('jump');
        }
      } else if (S.mode === 'leap') {
        S.u += dt / S.leap.dur;
        const u = Math.min(1, S.u);
        mk.x = lerp(S.leap.x0, S.leap.x1, u);
        const y0 = 56, y1 = 30, apex = -42;
        const yc = 2 * apex - (y0 + y1) / 2;
        S.sink = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * yc + u * u * y1;
        if (!S.exitDone && S.sink < 12) { S.exitDone = true; splash(parts, mk.x, surfY + 1, { power: 1, test: inSea }); emit('splash'); }
        if (!S.entryDone && u > 0.55 && S.sink > 12) {
          S.entryDone = true;
          splash(parts, mk.x + S.dir * 6, surfY + 1, { power: 1.35, test: inSea });
          emit('splash', { big: true });
          if (S.ballMode === 'float' && Math.abs(ball.x - mk.x) < 40) launchBall(S.dir * 24, -175);
        }
        if (u >= 1) { S.mode = 'swim'; S.vx = S.dir * 10; S.happy = 0.8; mk.sq.kick(3); }
      }
      mk.gy = surfY + S.sink;
      // wake while swimming
      S.wakeT -= dt;
      if (S.mode === 'swim' && Math.abs(S.vx) > 6 && S.wakeT <= 0) {
        S.wakeT = 0.07;
        for (const side of [-1, 1]) parts.add({ type: 'wake', x: mk.x - S.dir * 8, y: surfY + side * 1.2, vx: -S.dir * 14, vy: side * 7, life: 1.3, layer: 0, draw: (fb, p, k) => {
          const x = Math.round(p.x), y = Math.round(p.y);
          if (bayer4(x, y) < k) return;
          if (inSea(x, y)) { fb.set(x, y, pal.foam[k < 0.3 ? 0 : 1]); if (k < 0.5) fb.set(x - Math.sign(p.vx), y, pal.foam[2]); }
        } });
      }
      // waves bursting on the rocks
      S.spray -= dt;
      if (S.spray <= 0) {
        S.spray = 4.6 + Math.random() * 2;
        for (const [rx, ry, pw] of [[336, 190, 1.2], [364, 174, 1.4], [306, 204, 0.8]]) {
          for (let i = 0; i < 26 * pw; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.62) * 1.5;
            const sp = (120 + Math.random() * 140) * pw;
            parts.add({ type: 'drop', x: rx + (Math.random() - 0.5) * 22, y: ry, vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp, g: 380, life: 1.6, c: pal.foam[0], c2: pal.foam[1], size: Math.random() < 0.6 ? 2 : 1, layer: 2 });
          }
          parts.add({ type: 'crown', x: rx, y: ry + 2, w: 18 * pw, h: 26 * pw, life: 0.7, c: pal.foam[0], c2: pal.foam[1], layer: 2, seed: Math.floor(Math.random() * 99) });
        }
        emit('wave');
      }
      // pose
      const air = S.mode === 'leap' && S.sink < 8;
      const u = S.mode === 'leap' ? Math.min(1, S.u) : 0;
      const yawT = S.dir > 0 ? 1.2 : Math.PI - 1.2;
      mk.yaw += clamp(yawT - mk.yaw, -dt * 4, dt * 4);
      const blink = S.happy <= 0 && mk.blink(t, dt);
      const pad = Math.sin(t * 10);
      mk.sprite({
        squash: clamp(mk.sq.x * 0.5, -0.15, 0.2),
        lean: S.mode === 'leap' ? lerp(0.75, -0.85, u) : 0.06,
        headPitch: S.mode === 'leap' ? 0.1 : 0.12,
        legF: S.mode === 'leap' ? -0.7 : pad * 0.6,
        legB: S.mode === 'leap' ? 0.8 : -pad * 0.6,
        mouth: S.happy > 0 || air ? 1 : 0.6,
        eyes: S.happy > 0 || air ? 'happy' : blink ? 'blink' : 'open',
        finSway: clamp(0.04 + mk.fin.x * 0.3 + (S.mode === 'leap' ? 0.1 : 0), -0.25, 0.4),
        tailLift: S.mode === 'leap' ? 0.3 : clamp(mk.tail.x * 0.3, -0.2, 0.3),
        tailWag: Math.sin(t * 9) * 0.35,
        gill: Math.sin(t * 6) * 0.07,
      });
      parts.update(dt);
      return sounds.splice(0);
    }

    function drawSea(fb, t) {
      const d = fb.d;
      const fs = (v) => SIN[((v * 651.8986) | 0) & 4095];
      for (let y = hz + 1; y < H; y++) {
        const p = (y - hz) / (H - hz);
        const pr = phiRow[y];
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const ph = pr - OM * t + 0.45 * fs(x * 0.028 + y * 0.03 - t * 0.6) + 0.3 * fs(x * 0.067 - y * 0.02 + t * 0.4);
          let m = ph % 6.2832; if (m < 0) m += 6.2832;
          const crest = Math.floor(ph / 6.2832);
          const hgt = fs(ph);
          const seg = vnoise(x * 0.045 + crest * 3.7, crest * 1.3, 11);
          if (hgt > (p < 0.25 ? 0.975 : 0.935)) {
            d[i] = p > 0.22 && seg > 0.46 ? (hash2(x, crest, 3) < 0.85 ? crestC : pal.foam[1]) : toneLight(d[i]);
            continue;
          }
          if (m > 1.75 && m < 2.9 && p > 0.05) d[i] = seg > 0.3 || bayer4(x, y) < 0.5 ? toneDark(d[i]) : d[i];
          else if (m > 0.2 && m < 1.4 && p > 0.12 && bayer4(x, y) < 0.6) d[i] = toneLight(d[i]);
          // spilling foam just in front of broken crests
          if (p > 0.45 && m > 1.57 && m < 2.05 && seg > 0.55 && vnoise(x * 0.16, y * 0.6 + crest * 7, 5) > 0.58) d[i] = pal.foam[(x + y) & 1 ? 0 : 2];
          // sun sparkles on the back slopes
          if (m > 0.4 && m < 1.3 && hash2(x, y, Math.floor(t * 3)) < 0.004 + p * 0.004) d[i] = hex('#ffffff');
        }
      }
    }

    function drawMudkip(fb, t) {
      const s = mk.last, [x0, y0] = mk.origin();
      const w = s.buf.w, h = s.buf.h, sd = s.buf.d;
      for (let sy = 0; sy < h; sy++) {
        const Y = y0 + sy;
        if (Y < 0 || Y >= H) continue;
        for (let sx = 0; sx < w; sx++) {
          const c = sd[sy * w + sx];
          if (!c) continue;
          const X = x0 + sx;
          const sY = surfAt(X, DEPTH, t);
          let col = c, xx = X;
          if (Y > sY + 0.5) {
            const deep = Y - sY;
            xx = X + Math.round(Math.sin(Y * 0.7 + t * 5) * 0.8);
            if (bayer4(xx, Y) < clamp((deep - 8) / 40, 0, 0.9)) continue;
            col = deep > 10 ? under2(c) : under(c);
          }
          if (xx < 0 || xx >= W || rocks.get(xx, Y)) continue;
          fb.d[Y * W + xx] = col;
        }
      }
      // foam collar where Mudkip breaks the surface
      if (S.sink > -30 && S.sink < 40) {
        for (let sx = 0; sx < w; sx++) {
          const X = x0 + sx;
          const sY = Math.round(surfAt(X, DEPTH, t));
          const sy = sY - y0;
          if (sy < 0 || sy >= h) continue;
          if (sd[sy * w + sx] || sd[Math.max(0, sy - 1) * w + sx]) {
            if (hash2(X, Math.floor(t * 8), 2) < 0.8) fb.set(X, sY, pal.foam[0]);
            if (hash2(X, Math.floor(t * 8), 4) < 0.5) fb.set(X, sY + 1, pal.foam[2]);
          }
        }
      }
    }

    function drawBall(fb, t) {
      const s = ball.render();
      const x0 = Math.round(ball.x) - s.cx, y0 = Math.round(ball.y) - s.cy;
      for (let sy = 0; sy < s.buf.h; sy++)
        for (let sx = 0; sx < s.buf.w; sx++) {
          const c = s.buf.d[sy * s.buf.w + sx];
          if (!c) continue;
          const X = x0 + sx, Y = y0 + sy;
          const sY = surfAt(X, DEPTH + 2, t);
          fb.set(X, Y, Y > sY + 0.5 ? (Y - sY > 5 ? under2(c) : under(c)) : c);
        }
      if (S.ballMode === 'float') for (let dx = -ball.R; dx <= ball.R; dx++) {
        const X = Math.round(ball.x) + dx, sY = Math.round(surfAt(X, DEPTH + 2, t));
        if (hash2(X, Math.floor(t * 6), 1) < 0.7) fb.set(X, sY, pal.foam[Math.abs(dx) > ball.R - 3 ? 1 : 0]);
      }
    }

    function draw(fb) {
      const t = S.t;
      fb.copyFrom(bg);
      for (const c of clouds) {
        const span = W + c.buf.w;
        const x = ((c.x + t * c.sp) % span + span) % span - c.buf.w;
        fb.blit(c.buf, x, c.y, { test: (px, py) => py < hz });
      }
      for (let g = 0; g < 3; g++) {
        const span = W + 80;
        const gx = ((t * (16 + g * 4) + g * 130) % span) - 40;
        Scenery.gull(fb, gx, 30 + g * 12 + Math.sin(t + g) * 4, t * (7 + g), hex('#ffffff'), hex('#8aa0bb'));
      }
      drawSea(fb, t);
      parts.draw(fb, 0, t);
      if (S.mode === 'leap' && S.sink < 0) { drawBall(fb, t); drawMudkip(fb, t); }
      else { drawMudkip(fb, t); drawBall(fb, t); }
      parts.draw(fb, 1, t);
      fb.blit(rocks, 0, 0);
      // wet sheen on the rocks right after a burst
      parts.draw(fb, 2, t);
      if (S.heart > 0) Paintings.drawHeart(fb, mk.anchor('finTip')[0] + 6, mk.anchor('finTip')[1] - 6 - (1.2 - S.heart) * 12, S.heart);
      vignette(fb);
    }

    function tap(x, y) {
      if (Math.hypot(x - ball.x, y - ball.y) < ball.R + 6) {
        launchBall((x < ball.x ? 1 : -1) * 50, -200);
        sparkBurst(parts, ball.x, ball.y, 6, hex('#ffffff'), hex('#ffe9a0'));
        emit('boing', { soft: true });
        return 'ball';
      }
      const s = mk.last, [ox, oy] = mk.origin();
      const sx = Math.round(x - ox), sy = Math.round(y - oy);
      if (s && sx >= 0 && sy >= 0 && sx < s.buf.w && sy < s.buf.h && s.buf.d[sy * s.buf.w + sx] && S.mode === 'swim') {
        S.mode = 'dive'; S.diveT = 0; S.heart = 1.2;
        if (S.ballMode !== 'float') { S.ballMode = 'float'; }
        emit('cry');
        return 'mudkip';
      }
      if (inSea(Math.round(x), Math.round(y))) {
        splash(parts, x, y, { power: 0.6, n: 12, crown: 10, test: inSea });
        emit('splash', { small: true });
        return 'water';
      }
      sparkBurst(parts, x, y, 5, hex('#ffffff'), hex('#fff3c0'), 16);
      emit('twinkle');
      return 'other';
    }
    return {
      meta: {
        id: 'surf', no: 'III', title: 'Swell Season', time: '15:30', place: 'Off Route 109', poster: 4.4, period: 5.5,
        blurb: 'Out past the breakers the swell rolls in steadily. Mudkip swims after the ball, flicks it with its fin, and every third throw dives and leaps clear of the water after it.',
        medium: 'Animated pixels on canvas', size: '384 × 216 px',
        hint: 'Tap the ball to throw it · tap Mudkip to make it leap · tap the sea',
        alt: 'Pixel painting of open water in the afternoon: rolling blue swells with foam, Mudkip swimming with only its head and fins above the surface next to a floating beach ball, waves bursting white on rocks at the lower right.',
      },
      W, H, step, draw, tap,
      warm(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) step(1 / 30); sounds.length = 0; },
    };
  }

  Object.assign(Paintings, { dawn, surf, dusk, night, _h: { grader, streak, sunDisc, glitter, projShadow, birdV, pixText, sparkBurst, beam } });
})();
