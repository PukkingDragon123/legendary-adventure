/* ------------------------------------------------------------------
   Fun scenes — five new little stages for the Time Gallery, painted
   like the cove paintings and acted by the 3D-rendered Pokémon:
   a Mudkip party, Spheal volleyball, Wailord's spout launch, a
   Luvdisc love reef and a Pelipper sky ride.
   Each returns { meta, W, H, step(dt), draw(fb), tap(x, y) }.
------------------------------------------------------------------- */
const Fun = (() => {
  const { hex, mix, hash2, bayer4, fbm, rgbOf, pack, toHex } = PX;
  const W = 384, H = 216, TAU = Math.PI * 2;
  const R = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const NOON = {
      sky: [[0, '#2966c8'], [0.18, '#3176d4'], [0.36, '#3d88df'], [0.54, '#4f9ce8'], [0.7, '#66afef'], [0.85, '#86c4f4'], [1, '#b3dcf8']],
    sea: [[0, '#1d58a8'], [0.12, '#2063b4'], [0.34, '#2472c0'], [0.6, '#2a88cb'], [1, '#34a4d6']],
    horizon: '#9fd0f0',
    cloud: ['#9fbfe0', '#c6dcf0', '#e9f3fc', '#ffffff'],
    sunGlow: '#fff6da',
    glintHi: '#ffffff', glintMid: '#b9e6fb',
    shallow: ['#34a4d6', '#3fb9d9', '#5ccdd8', '#8fe0d7', '#bcecd6'],
    caustic: '#cdf7ef',
    face: '#2f93cf',
    foam: ['#ffffff', '#e0f5fa', '#a9dce9'],
    sand: ['#c49a60', '#ddbb82', '#edd4a0', '#f7e7c2'],
    sandWet: ['#9c7a50', '#b59262', '#c6a576', '#d9c09a'],
    sheen: '#d9dfd6',
    prop: {
      starfish: { d: '#a2402c', r: '#ee7f52', l: '#ffb07a' },
      shell: { d: '#b07a6a', r: '#f2c2b0', l: '#fff0e6' },
      conch: { d: '#9a6a4c', r: '#e8b48e', l: '#fbe0c8' },
      pebble: { d: '#6f6a70', r: '#a39ea2', l: '#cfcacb' },
    },
    head: {
      rock: ['#4a5d73', '#62788f', '#86a0b5'], grass: ['#3f8a45', '#6cb85c'],
      tower: ['#b9b2a9', '#efebe4', '#ffffff'], stripe: ['#96302b', '#d4443a', '#f0675a'],
      iron: '#343a46', glass: '#9fd9f2', roof: '#b3352e', lampOn: ['#ffe58a', '#fff8d2'],
    },
    island: ['#5d8fa9', '#76a6bb'],
    palm: {
      trunk: ['#5b3a22', '#7c522f', '#9e6c40', '#c28b57'], trunkLine: '#44291a',
      nut: ['#4d321c', '#74502e', '#a07448'],
      leaf: ['#1a5a2c', '#2c8434', '#43a23f', '#79c95a'], spine: '#9ccf62', outline: '#113a22',
    },
    shadow: '#2b3a6a',
  };
  const sfx = (n, v = 1) => Game.sfx(n, null, v);
  const lights = {};
  const lit = (h) => lights[h] || (lights[h] = Times.compile(h));
  // recolour every '#rrggbb' in a palette tree
  function mapCols(o, fn) {
    if (typeof o === 'string') return o[0] === '#' ? toHex(fn(hex(o))) : o;
    if (Array.isArray(o)) return o.map((v) => mapCols(v, fn));
    if (o && typeof o === 'object') { const r = {}; for (const k in o) r[k] = mapCols(o[k], fn); return r; }
    return o;
  }
  const grade = (m, a) => (c) => { const p = rgbOf(c); return pack(clamp(p[0] * m[0] + a[0], 0, 255), clamp(p[1] * m[1] + a[1], 0, 255), clamp(p[2] * m[2] + a[2], 0, 255)); };
  function addGlow(fb, x, y, r, col, k) {
    const c = rgbOf(col);
    for (let py = Math.max(0, Math.floor(y - r)); py < Math.min(H, y + r); py++) for (let px = Math.max(0, Math.floor(x - r)); px < Math.min(W, x + r); px++) {
      const d = Math.hypot(px - x, py - y) / r;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d) * k;
      if (f < 0.03 || bayer4(px, py) > f * 3) continue;
      const i = py * W + px, p = rgbOf(fb.d[i]);
      fb.d[i] = pack(Math.min(255, p[0] + c[0] * f), Math.min(255, p[1] + c[1] * f), Math.min(255, p[2] + c[2] * f));
    }
  }
  // a painted beach stage shared by the scenes
  function stage(o = {}) {
    const raw = Object.assign({}, NOON, o.pal || {});
    const pal = Beach.H(o.grade ? mapCols(raw, o.grade) : raw);
    const hz = o.hz ?? 92;
    const beach = Beach.create({
      W, H, hz, pal, seed: o.seed ?? 11, sandTop: o.sandTop ?? 150,
      sun: o.sun ?? { x: 320, y: -30, r: 180, k: 0.45, p: 1.4 }, skyBand: 0.2,
      shore: o.shore ?? ((x) => 182 + Math.sin(x * 0.02 + 1) * 3 + (x - 192) * 0.02),
      wave: o.wave ?? { period: 6.4, reach: 14, far: 124, skew: 0.003 }, props: o.props ?? [],
    });
    if (o.head) Scenery.headland(beach.bg, { x: o.headX ?? 306, y: hz, w: 80, pal: pal.head, seed: 5 });
    const clouds = (o.clouds ?? [[150, 12, 96, 30, 2], [16, 34, 60, 20, 1.4], [292, 26, 50, 16, 1]]).map(([x, y, w, h, sp], i) => ({ buf: Scenery.makeCloud(3 + i * 7, w, h, pal.cloud, { upper: i % 2 }), x, y, sp }));
    const glints = Scenery.makeGlints(o.seed ?? 4, 120, 0, W, hz + 2, hz + 70);
    const palm = o.palm ? Scenery.makePalm({ pal: pal.palm, w: 130, h: 230, bx: 26, by: 232, kx: 6, ky: 150, cx: 56, cy: 40, fronds: 10, seed: 12 }) : null;
    const vig = Beach.makeVignette(W, H, 0.55, hex(o.vig || '#14224a'));
    return {
      pal, beach, hz, vig,
      step(t, dt) { beach.update(t, dt); },
      back(fb, t) {
        fb.copyFrom(beach.bg);
        for (const c of clouds) { const span = W + c.buf.w, x = ((c.x + t * c.sp) % span + span) % span - c.buf.w; fb.blit(c.buf, x, c.y, { test: (px, py) => py < hz }); }
        Scenery.drawGlints(fb, glints, t, pal.glintHi, pal.glintMid, (x, y) => y > hz + 1 && y < beach.edge[clamp(x, 0, W - 1)] - 24);
        beach.drawShore(fb, t);
      },
      front(fb, t) {
        if (palm) fb.blit(palm[Math.floor(t * 3.2) % palm.length], -8, -6);
        for (let L = 1; L <= 4; L++) FX.draw(fb, 0, 0, L, t);
        vig(fb);
      },
    };
  }
  function crit(sp, o) { return new Critters.Critter(sp, Object.assign({ qPose: 0.05, shadow: false }, o)); }
  function mud(x, y, o = {}) { return crit(Mudkip, Object.assign({ kind: o.shiny ? 'mudkip-shiny' : 'mudkip', pal: o.shiny ? Life.SHINY : Mudkip.PAL, x, y, yaw: 1.1, scale: 0.62, qYaw: 0.05 }, o)); }
  function put(fb, c, P, sh) {
    c.sprite(P);
    if (sh !== undefined) Critters.shadow(fb, 0, 0, c.x, sh, Math.max(6, c.width() * 0.32), 3, 0.7);
    c.draw(fb, 0, 0, null);
  }
  const face = (c, d) => { c.yaw = d > 0 ? 1.1 : Math.PI - 1.1; };
  const head = (c) => [c.x, c.top() + 4];
  function mk(meta, st, P, o) {
    return Object.assign({ meta, W, H, t: 0, warm(sec) { for (let i = 0; i < sec * 30; i++) this.step(1 / 30); } }, o);
  }

  /* ============================ Mudkip Party ============================ */
  function party() {
    const st = stage({ hz: 96, head: true, palm: true, vig: '#1c0a34', grade: grade([0.78, 0.6, 0.86], [42, 10, 44]), sun: { x: 196, y: 96, r: 150, k: 0.7, p: 1.2 } });
    const P = lit('dusk');
    const GY = 204;
    const dancers = [mud(132, GY), mud(166, GY + 3, { shiny: true }), mud(236, GY + 3), mud(270, GY)];
    dancers.forEach((d, i) => { d.h = 0; d.vh = 0; d.ph = i * 0.5; face(d, i < 2 ? 1 : -1); });
    const sph = crit(Spheal, { kind: 'spheal', x: 330, y: GY + 4, yaw: Math.PI - 1.1, scale: 0.32, qFields: { clap: 0.25, roll: 0.3 } });
    const crab = crit(Corphish, { kind: 'corphish', x: 70, y: GY + 6, yaw: 1.3, scale: 0.36, qFields: { walk: 0.52, clawN: 0.5, clawF: 0.5 } });
    const bulbs = [];
    for (let i = 0; i < 13; i++) { const u = i / 12; bulbs.push({ u, c: hex(['#ff6a8a', '#ffd84a', '#6ae0ff', '#9aff7a', '#d08aff'][i % 5]), boost: 0 }); }
    const flame = [hex('#fff4b0'), hex('#ffd24a'), hex('#ff8a2a'), hex('#e0402a')];
    let confT = 2, beatN = -1;
    const S = mk({ id: 'party', hour: 'dusk' }, st, P, {
      step(dt) {
        this.t += dt; const t = this.t;
        st.step(t, dt);
        const beat = Math.floor(t * 2);
        if (beat !== beatN) { beatN = beat; if (beat % 2 === 0) sfx('pat', 0.35); }
        dancers.forEach((d, i) => {
          const b = t * 2 + (i % 2) * 0.5, ph = b % 1;
          if (d.vh || d.h > 0) { d.vh -= 600 * dt; d.h = Math.max(0, d.h + d.vh * dt); if (d.h === 0) d.vh = 0; }
          const hop = Math.max(0, Math.sin(ph * Math.PI)) * 9;
          if (Math.floor(b) % 4 === 0 && ph < dt * 2.5) face(d, Math.random() < 0.5 ? 1 : -1);
          d.y0 = d.y0 ?? d.y; d.y = d.y0 - hop - d.h;
          d.pose = { eyes: 'happy', mouth: 1, legF: Math.sin(b * TAU) * 0.6, legB: -Math.sin(b * TAU) * 0.6, tailWag: Math.sin(b * TAU * 2) * 0.5, squash: hop < 1 ? 0.08 : -0.05, headPitch: Math.sin(b * TAU) * 0.1 };
        });
        sph.pose = { clap: Math.abs(Math.sin(t * 7)), eyes: 'happy', mouth: 0.8 };
        crab.pose = { clawN: Math.sin(t * 8) > 0 ? 1 : 0, clawF: Math.sin(t * 8) > 0 ? 0 : 1, armN: 0.8, armF: 0.8, eyes: 'happy', walk: 0 };
        for (const b of bulbs) b.boost = Math.max(0, b.boost - dt);
        if ((confT -= dt) < 0) { confT = R(3.5, 6); FX.confetti(R(120, 280), 120, 30); sfx('pop', 0.4); }
        if (Math.random() < dt * 1.5) FX.floatIcon('note', R(120, 290), R(150, 175));
        if (Math.random() < dt * 20) FX.add({ type: 'spark', x: 200 + R(-5, 5), y: 196 - R(0, 10), vy: -R(20, 50), size: 1, life: R(0.4, 0.9), c: flame[0], c2: flame[2], layer: 3 });
        return [];
      },
      draw(fb) {
        const t = this.t;
        st.back(fb, t);
        // lantern string
        const pts = bulbs.map((b) => [8 + b.u * 368, 30 + Math.sin(b.u * Math.PI) * 22 + Math.sin(t * 1.4 + b.u * 6) * 1.5]);
        for (let i = 0; i < pts.length - 1; i++) fb.line(Math.round(pts[i][0]), Math.round(pts[i][1]), Math.round(pts[i + 1][0]), Math.round(pts[i + 1][1]), hex('#2a1a30'));
        bulbs.forEach((b, i) => {
          const [x, y] = pts[i], on = 0.55 + Math.sin(t * 3 + i) * 0.15 + b.boost;
          addGlow(fb, x, y + 4, 12 + b.boost * 10, b.c, on * 0.6);
          fb.ellipse(Math.round(x), Math.round(y + 4), 2, 3, b.c); fb.set(Math.round(x) - 1, Math.round(y + 3), hex('#ffffff'));
        });
        // campfire glow on the sand, logs and flames
        addGlow(fb, 200, 196, 70, hex('#ff9a3a'), 0.35 + Math.sin(t * 9) * 0.04);
        for (const d of [...dancers].sort((a, b) => a.y0 - b.y0)) if (d.y0 < GY + 2) put(fb, d, P, d.y0 + 1);
        fb.line(188, 205, 212, 199, hex('#4a2a18')); fb.line(188, 199, 212, 205, hex('#5a3420')); fb.line(189, 206, 211, 200, hex('#2a160c'));
        for (let i = 0; i < 26; i++) {
          const a = hash2(i, 1), k = ((t * 1.6 + a) % 1), x = 200 + (hash2(i, 2) - 0.5) * 14 * (1 - k) + Math.sin(t * 7 + i) * 1.5, y = 201 - k * 22;
          fb.ellipse(Math.round(x), Math.round(y), Math.max(1, Math.round(3 * (1 - k))), Math.max(1, Math.round(4 * (1 - k))), flame[Math.min(3, Math.floor(k * 4))]);
        }
        for (const d of [...dancers].sort((a, b) => a.y0 - b.y0)) if (d.y0 >= GY + 2) put(fb, d, P, d.y0 + 1);
        put(fb, sph, P, sph.y + 1); put(fb, crab, P, crab.y + 1);
        st.front(fb, t);
      },
      tap(x, y) {
        for (const d of dancers) if (d.hit(x, y, 3)) { d.vh = 230; sfx('mud'); FX.floatIcon('heart', d.x, d.top()); FX.sparkles(d.x, d.top(), 6, 20); return; }
        if (sph.hit(x, y, 3)) { sfx('spheal'); sfx('clap', 0.6); FX.floatIcon('heart', sph.x, sph.top()); return; }
        if (crab.hit(x, y, 3)) { sfx('crab'); FX.floatIcon('note', crab.x, crab.top()); return; }
        if (Math.hypot(x - 200, y - 195) < 16) { sfx('crack'); for (let i = 0; i < 24; i++) FX.add({ type: 'spark', x: 200 + R(-8, 8), y: 196, vx: R(-40, 40), vy: -R(60, 140), g: 120, size: 2, life: R(0.6, 1.2), c: flame[0], c2: flame[2], layer: 3 }); return; }
        for (const b of bulbs) { const bx = 8 + b.u * 368, by = 34 + Math.sin(b.u * Math.PI) * 22; if (Math.hypot(x - bx, y - by) < 8) { b.boost = 1; sfx('chime', 0.5); FX.sparkles(bx, by, 6, 12); return; } }
        if (y < 110) { // firework
          const cols = [hex('#ff6a8a'), hex('#ffd84a'), hex('#6ae0ff'), hex('#b08aff')], c = cols[Math.floor(Math.random() * 4)];
          for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU, s = R(60, 90); FX.add({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 50, size: 2, life: R(0.8, 1.3), c: hex('#ffffff'), c2: c, layer: 3 }); }
          sfx('pop'); sfx('twinkle', 0.6); return;
        }
        FX.floatIcon('note', x, y); sfx('pat', 0.5);
      },
    });
    return S;
  }

  /* ========================== Spheal Volleyball ========================== */
  function volley() {
    const st = stage({ hz: 90, head: true, props: [{ kind: 'starfish', x: 60, y: 206 }, { kind: 'shell', x: 330, y: 210 }] });
    const P = lit('noon');
    const GY = 204, G = 260, NET = 192;
    const players = [mud(96, GY), mud(146, GY + 4, { shiny: true }), crit(Corphish, { kind: 'corphish', x: 244, y: GY + 4, yaw: 1.3, scale: 0.4, qFields: { walk: 0.52, clawN: 0.5, clawF: 0.5, armN: 0.25, armF: 0.25 } }), crit(Sealeo, { kind: 'sealeo', x: 300, y: GY, yaw: Math.PI - 1.05, scale: 0.3, qFields: { headPitch: 0.1, clap: 0.25, mouth: 0.25 } })];
    players.forEach((p, i) => { p.side = i < 2 ? -1 : 1; p.home = p.x; p.h = 0; p.vh = 0; p.gy = p.y; face(p, -p.side); if (p.kind === 'corphish') p.yaw = 1.3; });
    const ball = crit(Spheal, { kind: 'spheal', x: 110, y: 120, yaw: 1.1, scale: 0.24, qFields: { roll: 0.3, mouth: 0.25 } });
    const B = { x: 110, y: 90, vx: 0, vy: 0, roll: 0, live: true, wait: 0, last: null, happy: 0 };
    const score = [0, 0];
    const hitH = (p) => p.gy - (p.kind === 'sealeo' ? 58 : p.kind === 'corphish' ? 40 : 44);
    function sendTo(side, speed = 1) {
      const tx = side < 0 ? R(80, 160) : R(230, 310), T = 1.5 / speed, ty = GY - 44;
      B.vx = (tx - B.x) / T; B.vy = (ty - B.y - 0.5 * G * T * T) / T; B.tx = tx;
    }
    function serve() { const side = Math.random() < 0.5 ? -1 : 1; B.x = side < 0 ? 110 : 280; B.y = 120; B.vx = 0; B.vy = -160; B.live = true; B.tx = B.x; }
    serve();
    const S = mk({ id: 'volley', hour: 'noon' }, st, P, {
      step(dt) {
        this.t += dt; const t = this.t;
        st.step(t, dt);
        if (B.wait > 0) { B.wait -= dt; if (B.wait <= 0) serve(); }
        if (B.live) {
          B.vy += G * dt; B.x += B.vx * dt; B.y += B.vy * dt; B.roll += (B.vx * dt) / 12 + dt * 3;
          if (B.x > NET - 10 && B.x < NET + 10 && B.y > 150 && B.y < 176) { B.vx = -B.vx * 0.5; B.x += Math.sign(B.vx) * 4; sfx('boing', 0.5); }
          const side = B.x < NET ? -1 : 1;
          if (B.vy > 0) for (const p of players) {
            if (p.side !== side || p === B.last && players.filter((q) => q.side === side).length > 1 && Math.random() < 0.3) continue;
            if (Math.abs(p.x - B.x) < 16 && B.y > hitH(p) - 10 && B.y < hitH(p) + 6) {
              p.vh = 160; B.last = p; FX.bonk(B.x, B.y + 6, 8); sfx('boing', 0.8); if (Math.random() < 0.5) sfx('spheal', 0.7);
              B.happy = 0.5; sendTo(-side, Math.random() < 0.2 ? 1.5 : 1); break;
            }
          }
          if (B.y >= GY - 8) {
            B.y = GY - 8; B.live = false; B.wait = 1.6; B.vx *= 0.3; B.vy = 0;
            score[side < 0 ? 1 : 0]++; FX.poof(B.x, GY, st.pal.sand[3], st.pal.sand[2], 8, 5); sfx('thud'); FX.confetti(side < 0 ? 280 : 110, 150, 18);
            for (const p of players) if (p.side !== side) p.vh = 200;
          }
        }
        for (const p of players) {
          const target = B.live && (B.x < NET ? -1 : 1) === p.side ? B.tx + (players.filter((q) => q.side === p.side).indexOf(p) ? 6 : -6) : p.home;
          const mine = players.filter((q) => q.side === p.side).reduce((a, q) => (Math.abs(q.x - B.tx) < Math.abs(a.x - B.tx) ? q : a));
          const goal = mine === p ? target : p.home, dx = goal - p.x, sp = 70 * dt;
          const mv = Math.abs(dx) > 1 ? Math.sign(dx) * Math.min(Math.abs(dx), sp) : 0;
          p.x = clamp(p.x + mv, p.side < 0 ? 40 : NET + 14, p.side < 0 ? NET - 14 : 350);
          if (p.vh || p.h > 0) { p.vh -= 700 * dt; p.h = Math.max(0, p.h + p.vh * dt); if (p.h === 0) p.vh = 0; }
          p.y = p.gy - p.h;
          const w = t * 12, walking = Math.abs(mv) > 0.01;
          if (p.kind === 'mudkip' || p.kind === 'mudkip-shiny') p.pose = { eyes: p.h > 0 ? 'happy' : 'open', mouth: p.h > 0 ? 1 : 0.5, legF: walking ? Math.sin(w) * 0.6 : 0, legB: walking ? -Math.sin(w) * 0.6 : 0, headPitch: p.h > 0 ? -0.3 : 0, squash: p.h > 0 ? -0.06 : 0 };
          else if (p.kind === 'corphish') p.pose = { walk: walking ? w : 0, clawN: p.h > 0 ? 1 : 0, clawF: p.h > 0 ? 1 : 0, armN: p.h > 0 ? 1 : 0.3, armF: p.h > 0 ? 1 : 0.3, eyes: p.h > 0 ? 'happy' : 'open' };
          else p.pose = { headPitch: p.h > 0 ? 0.4 : 0.1, clap: p.h > 0 ? 1 : 0, mouth: p.h > 0 ? 1 : 0, eyes: 'open' };
        }
        if (B.happy > 0) B.happy -= dt;
        ball.x = B.x; ball.y = B.y + 18; ball.pose = { roll: B.live ? B.roll : 0, eyes: B.happy > 0 ? 'happy' : B.live ? 'closed' : 'open', mouth: B.happy > 0 ? 1 : 0 };
        return [];
      },
      draw(fb) {
        const t = this.t;
        st.back(fb, t);
        // score shells on the sand by each side
        for (let s = 0; s < 2; s++) for (let i = 0; i < Math.min(score[s], 8); i++) Beach.stamp(fb, Beach.SPRITES.shell, (s ? 356 : 16) + (s ? -1 : 1) * (i % 4) * 7, 190 + Math.floor(i / 4) * 6, Beach.H({ d: '#b07a6a', r: '#f2c2b0', l: '#fff0e6' }));
        const back = players.filter((p) => p.gy < GY + 2);
        for (const p of back) put(fb, p, P, p.gy + 1);
        // net: two posts and a mesh band seen at a slight angle
        const post = hex('#6a4a2a'), mesh = hex('#f4f0e6'), meshD = hex('#b8b2a4');
        fb.line(178, 208, 178, 150, post); fb.line(179, 208, 179, 150, post); fb.line(206, 200, 206, 144, post); fb.line(207, 200, 207, 144, post);
        for (let x = 179; x <= 206; x++) { const u = (x - 179) / 27, top = Math.round(152 - u * 6); for (let y = top; y < top + 22; y++) if ((x + y) % 4 === 0 || (x - y) % 4 === 0) fb.set(x, y, meshD); fb.set(x, top, mesh); fb.set(x, top + 1, mesh); }
        Critters.shadow(fb, 0, 0, B.x, GY + 2, 9 * clamp(1 - (GY - B.y) / 200, 0.4, 1), 2.5, 0.6);
        const front = players.filter((p) => p.gy >= GY + 2);
        for (const p of front) put(fb, p, P, p.gy + 1);
        put(fb, ball, P);
        st.front(fb, t);
      },
      tap(x, y) {
        if (B.live && Math.hypot(x - B.x, y - B.y) < 22) { const side = B.x < NET ? -1 : 1; sendTo(-side, 1.8); B.vy = Math.max(B.vy, 40); FX.bonk(B.x, B.y, 10); sfx('bonk'); sfx('spheal'); B.happy = 0.6; return; }
        for (const p of players) if (p.hit(x, y, 3)) { p.vh = 220; sfx(p.kind === 'corphish' ? 'crab' : p.kind === 'sealeo' ? 'bark' : 'mud'); FX.floatIcon('heart', p.x, p.top()); return; }
        if (!B.live) { B.wait = 0.01; return; }
        FX.poof(x, y, st.pal.sand[3], st.pal.sand[2], 3, 3); sfx('dust', 0.5);
      },
    });
    return S;
  }

  /* ========================== Wailord Launch ========================== */
  function launch() {
    const st = stage({ hz: 84, head: true, headX: 20, shore: () => 260, sun: { x: 300, y: -10, r: 190, k: 0.5, p: 1.3 }, grade: grade([1.02, 0.96, 0.9], [12, 6, 0]), clouds: [[40, 10, 90, 28, 1.6], [230, 30, 70, 22, 1.1], [320, 8, 44, 14, 0.8]] });
    const P = lit('afternoon');
    const WL = 150;
    const wail = crit(Wailord, { kind: 'wailord', x: 140, y: WL + 40, yaw: 0.3, scale: 0.075, qPose: 0.25, qFields: { tail: 0.34, fin: 0.34, blow: 0.5 } });
    const kip = mud(150, 120, { scale: 0.55, qYaw: 0.35 });
    const M = { mode: 'ride', t: 0, x: 150, y: 0, vx: 0, vy: 0, spin: 0 };
    const pel = crit(Pelipper, { kind: 'pelipper', x: -60, y: 50, yaw: 1.0, scale: 0.17, qFields: { flap: 0.25, spread: 0.25 } });
    let spoutT = 0, pelX = -80, rain = 0;
    const water = st.beach.bg;
    function blow() { if (M.mode !== 'ride') return; spoutT = 1.4; M.mode = 'fly'; M.vx = R(40, 80); M.vy = -300; sfx('spout'); sfx('whale', 0.6); }
    const S = mk({ id: 'launch', hour: 'afternoon' }, st, P, {
      step(dt) {
        this.t += dt; const t = this.t;
        st.step(t, dt);
        wail.y = WL + 40 + Math.sin(t * 0.8) * 2;
        wail.pose = { tail: Math.sin(t * 1.2), fin: Math.sin(t * 0.9), blow: spoutT > 0 ? 1 : 0, eyes: spoutT > 0 ? 'happy' : 'open', mouth: 0.3 };
        const top = wail.spr ? wail.top() + 10 : WL - 20;
        if (spoutT > 0) {
          spoutT -= dt; rain = 1;
          for (let i = 0; i < 6; i++) FX.add({ type: 'spark', x: wail.x + 30 + R(-3, 3), y: top, vx: R(-20, 20), vy: -R(180, 260), g: 240, size: 2, life: R(0.8, 1.3), c: hex('#ffffff'), c2: hex('#9fe0ff'), layer: 3 });
        }
        rain = Math.max(0, rain - dt * 0.3);
        M.t += dt;
        if (M.mode === 'ride') { M.x = wail.x + 28; M.y = top + 2; M.spin = 0; kip.pose = { eyes: 'happy', mouth: 1, tailWag: Math.sin(t * 6) * 0.4 }; if (M.t > 3.5 && Math.random() < dt) blow(); }
        else if (M.mode === 'fly') {
          M.vy += 330 * dt; M.x += M.vx * dt; M.y += M.vy * dt; M.spin += dt * 9;
          kip.pose = { eyes: 'happy', mouth: 1, legF: -0.6, legB: 0.6, squash: -0.08 };
          if (M.y > WL + 4 && M.vy > 0) { M.mode = 'swim'; M.t = 0; FX.splashAt(M.x, WL, { power: 1.4, n: 26 }); sfx('splash'); M.spin = 0; }
        } else if (M.mode === 'swim') {
          M.y = WL + 6 + Math.sin(t * 3) * 1; const dx = wail.x + 28 - M.x; M.x += Math.sign(dx) * Math.min(Math.abs(dx), 34 * dt);
          kip.pose = { eyes: 'open', mouth: 0.5, legF: Math.sin(t * 10) * 0.6, legB: -Math.sin(t * 10) * 0.6 };
          if (Math.random() < dt * 4) FX.splashAt(M.x - 8, WL + 1, { power: 0.2, n: 2 });
          if (Math.abs(dx) < 30) { M.mode = 'climb'; M.t = 0; M.vy = -200; }
        } else if (M.mode === 'climb') {
          M.vy += 500 * dt; M.y += M.vy * dt; M.x += (wail.x + 28 - M.x) * dt * 4;
          if (M.vy > 0 && M.y >= top + 2) { M.mode = 'ride'; M.t = 0; sfx('mud', 0.8); FX.floatIcon('heart', M.x, M.y - 40); }
        }
        kip.x = M.x; kip.y = M.y; kip.yaw = M.spin ? 1.1 + M.spin : M.vx < 0 && M.mode === 'swim' ? Math.PI - 1.1 : 1.1;
        pelX += 40 * dt; if (pelX > 460) pelX = -120;
        pel.x = pelX; pel.y = 62 + Math.sin(t) * 5; pel.pose = { flap: Math.sin(t * 8), spread: 1, eyes: 'open' };
        return [];
      },
      draw(fb) {
        const t = this.t;
        st.back(fb, t);
        put(fb, pel, P);
        put(fb, wail, P);
        // the sea closes over the whale's lower half
        const b = wail.bounds();
        for (let y = WL; y < Math.min(H, b.y1); y++) for (let x = Math.max(0, b.x0); x < Math.min(W, b.x1); x++) { const i = y * W + x; fb.d[i] = mix(fb.d[i], water.d[i], clamp(0.55 + (y - WL) * 0.03, 0, 0.92)); }
        for (let x = b.x0; x < b.x1; x++) if (hash2(x, Math.floor(t * 5)) > 0.4) fb.set(x, WL + (hash2(x, 3) > 0.7 ? 1 : 0), hex('#ffffff'));
        if (rain > 0.05) { // a little rainbow in the spout mist
          const cols = ['#ff6a6a', '#ffb84a', '#fff06a', '#7aff8a', '#6ac8ff', '#9a7aff'];
          const cx = wail.x + 30, cy = WL - 20;
          for (let a = -2.6; a < -0.5; a += 0.01) cols.forEach((c, j) => { const r = 60 - j * 2, x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r); if (x >= 0 && y >= 0 && x < W && y < H && bayer4(x, y) < rain * 0.6) fb.d[y * W + x] = mix(fb.d[y * W + x], hex(c), 0.5); });
        }
        put(fb, kip, P);
        if (M.mode === 'swim') { const bb = kip.bounds(); for (let y = WL + 2; y < Math.min(H, bb.y1); y++) for (let x = Math.max(0, bb.x0); x < Math.min(W, bb.x1); x++) { const i = y * W + x; fb.d[i] = mix(fb.d[i], water.d[i], 0.75); } }
        st.front(fb, t);
      },
      tap(x, y) {
        if (M.mode === 'fly' && kip.hit(x, y, 6)) { M.vy = -260; sfx('twinkle'); FX.sparkles(M.x, M.y - 20, 10, 24); return; }
        if (kip.hit(x, y, 3)) { sfx('mud'); FX.floatIcon('heart', M.x, M.y - 40); return; }
        const b = wail.bounds();
        if (x > b.x0 && x < b.x1 && y > b.y0 && y < WL + 6) { if (M.mode === 'ride') blow(); else { sfx('whale', 0.8); FX.floatIcon('heart', wail.x + 40, b.y0); } return; }
        if (pel.hit(x, y, 4)) { sfx('squawk'); FX.floatIcon('note', pel.x, pel.top()); return; }
        if (y > WL) { FX.splashAt(x, y, { power: 0.5, n: 10 }); sfx('plop', 0.7); }
      },
    });
    return S;
  }

  /* ========================== Luvdisc Love Reef ========================== */
  function reef() {
    const P = lit('noon');
    const bg = new PX.Buf(W, H);
    const top = hex('#62cce2'), midc = hex('#2a8cbc'), bot = hex('#12407a'), hazeC = hex('#3e9cc6');
    const floorY = (x) => 190 + Math.sin(x * 0.025) * 4 + Math.sin(x * 0.07 + 1) * 2;
    const sand = [hex('#a8905e'), hex('#c8ac74'), hex('#dcc48c'), hex('#efdcaa')];
    for (let x = 0; x < W; x++) {
      const h1 = 128 + fbm(x * 0.018, 3) * 44, h2 = 156 + fbm(x * 0.03 + 9, 3) * 34, fy = floorY(x);
      for (let y = 0; y < H; y++) {
        const t = clamp(y / H + (bayer4(x, y) - 0.5) * 0.06, 0, 1);
        let c = t < 0.5 ? mix(top, midc, t * 2) : mix(midc, bot, (t - 0.5) * 2);
        if (y > h1) c = mix(c, hex('#1e5c86'), 0.45);
        if (y > h2) c = mix(c, hex('#17506e'), 0.6);
        if (y >= fy) { const d = y - fy; c = d < 1 ? sand[3] : Math.sin(x * 0.22 + y * 1.4) > 0.8 ? sand[2] : d > 14 ? sand[0] : sand[1]; }
        bg.d[y * W + x] = c;
      }
    }
    // corals and rocks
    const coral = [['#e0507a', '#ff7aa0', '#ffc0d0'], ['#e08a2a', '#ffae4a', '#ffe0a0'], ['#8a4ac8', '#a86ae0', '#d0a8ff'], ['#2e8a4a', '#4ab860', '#8ae08a']].map((a) => a.map(hex));
    const rock = [hex('#2e5a74'), hex('#3f7890'), hex('#6aa2b4')];
    for (const [cx, rw] of [[30, 40], [320, 52], [180, 26]]) { const fy = floorY(cx); bg.ellipse(cx, Math.round(fy), rw, 14, rock[0]); bg.ellipse(cx - 3, Math.round(fy) - 3, rw - 4, 10, rock[1]); bg.ellipse(cx - 8, Math.round(fy) - 7, rw * 0.4, 4, rock[2]); }
    for (let i = 0; i < 16; i++) {
      const x = Math.round(hash2(i, 5) * W), fy = Math.round(floorY(x)) - 2, c = coral[i % 4], hgt = 8 + Math.round(hash2(i, 6) * 14);
      for (let k = 0; k < 4; k++) { const bx = x + (k - 1.5) * 3; bg.line(Math.round(bx), fy, Math.round(bx + (k - 1.5) * 2), fy - hgt + k * 2, c[0]); bg.ellipse(Math.round(bx + (k - 1.5) * 2), fy - hgt + k * 2, 2, 2, c[1]); bg.set(Math.round(bx + (k - 1.5) * 2) - 1, fy - hgt + k * 2 - 1, c[2]); }
    }
    const kelp = [[14, 0], [62, 1.3], [250, 2.1], [276, 0.7], [370, 1.7]].map(([x, ph]) => ({ x, ph, n: 28 + Math.floor(ph * 6) }));
    const kelpC = [hex('#1a4a30'), hex('#2e8a4a'), hex('#4ab860')], rayC = hex('#c8f4ff'), causC = hex('#fff6c8');
    const kip = mud(190, 120, { scale: 0.55, haze: 0.18, hazeC });
    const M = { x: 190, y: 120, tx: 200, ty: 110, loop: 0, happy: 0 };
    const fish = [];
    for (let i = 0; i < 6; i++) { const f = crit(Luvdisc, { kind: 'luvdisc', x: 250, y: 80, yaw: 0.3, scale: 0.26, qPose: 0.25, qYaw: 0.08, qFields: { wiggle: 0.25, tilt: 0.1, kiss: 0.5, blush: 0.5 }, haze: 0.12, hazeC }); f.i = i; f.kiss = 0; fish.push(f); }
    const ky = crit(Kyogre, { kind: 'kyogre', x: -200, y: 80, yaw: 0.25, scale: 0.18, qPose: 0.25, qYaw: 0.1, qFields: { tail: TAU / 8, fin: 0.25, glow: 0.5 }, haze: 0.5, hazeC });
    const crab = crit(Corphish, { kind: 'corphish', x: 110, y: floorY(110) + 6, yaw: 1.3, scale: 0.3, qFields: { walk: 0.52, clawN: 0.5, clawF: 0.5 } });
    let U = 0, kyX = -220, kyGlow = 0;
    const S = mk({ id: 'reef', hour: 'noon' }, null, P, {
      step(dt) {
        this.t += dt; const t = this.t;
       
        U += dt * 0.5;
        const dx = M.tx - M.x, dy = M.ty - M.y, d = Math.hypot(dx, dy);
        if (d < 6) { M.tx = R(90, 300); M.ty = R(60, 150); } else { M.x += dx / d * 20 * dt; M.y += dy / d * 14 * dt; }
        if (M.loop > 0) M.loop -= dt; if (M.happy > 0) M.happy -= dt;
        kip.x = M.x; kip.y = M.y - (M.loop > 0 ? Math.sin(M.loop / 0.9 * Math.PI) * 22 : 0);
        kip.yaw = M.loop > 0 ? 1.1 + (0.9 - M.loop) * 7 : dx >= 0 ? 1.1 : Math.PI - 1.1;
        kip.pose = { eyes: M.happy > 0 ? 'happy' : 'open', mouth: M.happy > 0 ? 1 : 0.5, legF: Math.sin(t * 7) * 0.6, legB: -Math.sin(t * 7) * 0.6, tailWag: Math.sin(t * 7) * 0.5 };
        for (const f of fish) {
          const u = U + f.i * (TAU / 6);
          const hx = 16 * Math.sin(u) ** 3, hy = -(13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u));
          const tx = M.x + hx * 2.6, ty = M.y - 36 + hy * 2.2;
          const vx = (tx - f.x) * Math.min(1, dt * 3), vy = (ty - f.y) * Math.min(1, dt * 3);
          f.x += vx; f.y += vy;
          if (Math.abs(vx) > 0.05) f.yaw = vx > 0 ? 0.3 : Math.PI - 0.3;
          if (f.kiss > 0) f.kiss -= dt;
          f.pose = { wiggle: Math.sin(t * 8 + f.i), kiss: f.kiss > 0 ? 1 : 0, blush: f.kiss > 0 ? 1 : 0, tilt: clamp(-vy * 0.6, -0.4, 0.4), eyes: f.kiss > 0 ? 'happy' : 'open' };
        }
        if (Math.random() < dt * 0.4) { const f = fish[Math.floor(Math.random() * 6)]; f.kiss = 1; FX.floatIcon('heart', f.x, f.y - 20); M.happy = 0.8; sfx('kiss', 0.4); }
        kyX += 22 * dt; if (kyX > 600) kyX = -300; if (kyGlow > 0) kyGlow -= dt;
        ky.x = kyX; ky.y = 76 + Math.sin(t * 0.5) * 4; ky.pose = { tail: t * 2.4, fin: Math.sin(t * 1.2), glow: kyGlow > 0 ? 1 : 0, mouth: 0 };
        crab.pose = { walk: 0, clawN: Math.sin(t * 2) > 0.9 ? 1 : 0, clawF: Math.sin(t * 2 + 1) > 0.9 ? 1 : 0, eyes: 'open' };
        if (Math.random() < dt * 2) FX.bubbles(R(20, 360), floorY(200) - 4, 1, 4);
        if (Math.random() < dt * 0.8) FX.bubbles(M.x + 10, M.y - 30, 1, 4);
        return [];
      },
      draw(fb) {
        const t = this.t, d = fb.d;
        fb.copyFrom(bg);
        for (let y = 0; y < 160; y++) { const fall = 1 - y / 170; for (let x = 0; x < W; x++) { const u = x + y * 0.5, v = Math.sin(u * 0.08 + t * 0.35) * Math.sin(u * 0.021 - t * 0.12); if (v > 0.25 && bayer4(x, y) < (v - 0.25) * fall * 0.9) { const i = y * W + x; d[i] = mix(d[i], rayC, 0.28); } } }
        for (let x = 0; x < W; x++) {
          const w = Math.round(2 + Math.sin(x * 0.15 + t * 2) + Math.sin(x * 0.06 - t * 1.3));
          for (let y = 0; y < w; y++) d[y * W + x] = mix(d[y * W + x], rayC, 0.5);
          d[w * W + x] = hex('#e6fbff');
          const fy = Math.ceil(floorY(x));
          for (let y = fy; y < Math.min(H, fy + 16); y++) if (Math.sin(x * 0.35 + t * 2 + Math.sin(y * 0.6 + t)) * Math.sin(y * 0.9 - t * 1.4 + x * 0.05) > 0.72) d[y * W + x] = mix(d[y * W + x], causC, 0.4);
        }
        put(fb, ky, P);
        if (kyGlow > 0) addGlow(fb, ky.x, ky.y - 30, 60, hex('#ff5a6a'), kyGlow * 0.5);
        for (const k of kelp) {
          const fy = floorY(k.x); let px = k.x, py = fy;
          for (let i = 0; i < k.n; i++) {
            const nx = k.x + Math.sin(t * 1.1 + i * 0.22 + k.ph) * i * 0.35, ny = fy - i * 4;
            fb.line(Math.round(px), Math.round(py), Math.round(nx), Math.round(ny), kelpC[1]);
            fb.set(Math.round(nx) + 1, Math.round(ny), kelpC[0]); fb.set(Math.round(nx) - 1, Math.round(ny), kelpC[2]);
            if (i % 3 === 1) { const s = i % 2 ? 1 : -1; fb.set(Math.round(nx) + s * 2, Math.round(ny) - 1, kelpC[2]); fb.set(Math.round(nx) + s * 3, Math.round(ny) - 2, kelpC[2]); }
            px = nx; py = ny;
          }
        }
        put(fb, crab, P, crab.y + 1);
        const back = fish.filter((f) => Math.sin(U + f.i * (TAU / 6)) < 0), front = fish.filter((f) => !back.includes(f));
        for (const f of back) put(fb, f, P);
        put(fb, kip, P);
        for (const f of front) put(fb, f, P);
        for (let L = 1; L <= 4; L++) FX.draw(fb, 0, 0, L, t);
        for (let i = 0; i < 40; i++) { const x = ((i * 97 + t * (3 + (i % 4))) % W + W) % W, y = ((i * 53 + Math.sin(t * 0.5 + i) * 6) % 180 + 180) % 180; if (i % 3) fb.set(Math.round(x), Math.round(y), hex('#bfe8f0')); }
      },
      tap(x, y) {
        for (const f of fish) if (f.hit(x, y, 4)) { f.kiss = 1.2; sfx('kiss'); FX.floatIcon('heart', f.x, f.y - 20); FX.floatIcon('heart', f.x + 8, f.y - 28); return; }
        if (kip.hit(x, y, 3)) { M.loop = 0.9; M.happy = 1.2; sfx('mud'); FX.bubbles(M.x, M.y - 20, 8, 4); FX.floatIcon('heart', M.x, M.y - 50); return; }
        if (ky.hit(x, y, 4)) { kyGlow = 1.4; sfx('rumble'); FX.bubbles(ky.x, ky.y - 20, 10, 4); return; }
        if (crab.hit(x, y, 3)) { sfx('crab'); FX.bubbles(crab.x, crab.top(), 5, 4); return; }
        FX.bubbles(x, y, 6, 4); sfx('bubble', 0.7);
      },
    });
    return S;
  }

  /* ========================== Pelipper Sky Ride ========================== */
  function sky() {
    const P = lit('dusk');
    const bg = new PX.Buf(W, H);
    const stops = ['#2a1a5a', '#5a2a7a', '#b04a7a', '#f07a5a', '#ffb45a', '#ffe0a0'].map(hex);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = clamp(y / 170 + (bayer4(x, y) - 0.5) * 0.05, 0, 0.999) * (stops.length - 1), i = Math.floor(t);
      bg.d[y * W + x] = mix(stops[i], stops[Math.min(stops.length - 1, i + 1)], t - i);
    }
    for (let i = 0; i < 60; i++) { const x = Math.floor(hash2(i, 1) * W), y = Math.floor(hash2(i, 2) * 70); if (hash2(i, 3) > 0.4) bg.set(x, y, hex('#ffffff')); }
    const sunX = 280, sunY = 150;
    const cloudPal = ['#b0587a', '#e0809a', '#ffb8b0', '#fff0e0'].map(hex);
    const layers = [0.25, 0.6, 1.2].map((sp, L) => ({ sp, items: Array.from({ length: 5 + L * 2 }, (_, i) => ({ buf: Scenery.makeCloud(10 + L * 20 + i, 40 + L * 30 + (i % 3) * 14, 14 + L * 8, cloudPal, { upper: 1 }), x: i * (W / (4 + L * 2)) + hash2(i, L) * 40, y: 120 + L * 26 + (i % 2) * 6 })) }));
    const pel = crit(Pelipper, { kind: 'pelipper', x: 170, y: 110, yaw: 1.25, scale: 0.27, qYaw: 0.3, qFields: { flap: 0.2, spread: 0.25, pitch: 0.1 } });
    const kip = mud(160, 90, { scale: 0.36, qYaw: 0.35 });
    let roll = 0, hop = 0, hv = 0;
    const gulls = [0, 1, 2].map((i) => ({ x: i * 130, y: 50 + i * 20, ph: i }));
    const S = mk({ id: 'sky', hour: 'dusk' }, null, P, {
      step(dt) {
        this.t += dt; const t = this.t;
       
        for (const L of layers) for (const c of L.items) { c.x -= L.sp * 30 * dt; if (c.x < -c.buf.w) c.x += W + c.buf.w + 20; }
        for (const g of gulls) { g.x -= 12 * dt; if (g.x < -20) g.x = W + 20; }
        if (roll > 0) roll = Math.max(0, roll - dt);
        if (hv || hop > 0) { hv -= 500 * dt; hop = Math.max(0, hop + hv * dt); if (hop === 0) hv = 0; }
        pel.x = 170 + Math.sin(t * 0.4) * 20; pel.y = 112 + Math.sin(t * 1.1) * 8;
        pel.yaw = roll > 0 ? 1.25 + (1 - roll) * TAU : 1.25;
        pel.pose = { flap: Math.sin(t * 6), spread: 1, pitch: Math.cos(t * 1.1) * 0.15, eyes: roll > 0 ? 'happy' : 'open' };
        kip.x = pel.x - 8; kip.y = (pel.spr ? pel.top() + 16 : pel.y - 30) - hop; kip.yaw = roll > 0 ? pel.yaw : 1.1;
        kip.pose = { eyes: 'happy', mouth: 1, tailWag: Math.sin(t * 5) * 0.4, headPitch: -0.1 };
        if (Math.random() < dt * 6) FX.add({ type: 'speed', x: W + 4, y: R(20, 200), dx: -1, dy: 0, len: R(8, 20), life: 0.5, c: hex('#fff0e0'), layer: 1, vx: -400 });
        return [];
      },
      draw(fb) {
        const t = this.t;
        fb.copyFrom(bg);
        addGlow(fb, sunX, sunY, 90, hex('#ffd07a'), 0.5);
        fb.ellipse(sunX, sunY, 22, 22, hex('#ffe8a0')); fb.ellipse(sunX - 3, sunY - 3, 17, 17, hex('#fff6d0'));
        // rainbow far away
        const cols = ['#ff6a6a', '#ffb84a', '#fff06a', '#7aff8a', '#6ac8ff', '#9a7aff'];
        for (let a = -2.9; a < -0.3; a += 0.006) cols.forEach((c, j) => { const r = 150 - j * 3, x = Math.round(90 + Math.cos(a) * r), y = Math.round(190 + Math.sin(a) * r); if (x >= 0 && y >= 0 && x < W && y < H && bayer4(x, y) < 0.35) fb.d[y * W + x] = mix(fb.d[y * W + x], hex(c), 0.45); });
        for (const L of layers.slice(0, 2)) for (const c of L.items) fb.blit(c.buf, Math.round(c.x), c.y);
        for (const g of gulls) Scenery.gull(fb, g.x, g.y + Math.sin(t + g.ph) * 4, t * 7 + g.ph, hex('#fff0e8'), hex('#8a6a9a'));
        put(fb, pel, P);
        put(fb, kip, P);
        for (const c of layers[2].items) fb.blit(c.buf, Math.round(c.x), c.y);
        for (let L = 1; L <= 4; L++) FX.draw(fb, 0, 0, L, t);
      },
      tap(x, y) {
        if (kip.hit(x, y, 3)) { hv = 170; sfx('mud'); FX.floatIcon('heart', kip.x, kip.top()); return; }
        if (pel.hit(x, y, 4)) { if (roll <= 0) { roll = 1; sfx('squawk'); sfx('whoosh', 0.6); FX.sparkles(pel.x, pel.y - 30, 10, 40); } return; }
        if (Math.hypot(x - sunX, y - sunY) < 24) { FX.sparkles(sunX, sunY, 12, 40, hex('#ffffff'), hex('#ffd84a')); sfx('chime', 0.6); return; }
        FX.poof(x, y, hex('#fff0e0'), hex('#ffb8b0'), 5, 5); sfx('whoosh', 0.4);
      },
    });
    return S;
  }

  return { party, volley, launch, reef, sky };
})();
