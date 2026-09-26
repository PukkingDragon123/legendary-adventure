/* ------------------------------------------------------------------
   Paintings — five views of one beach, each a small living scene.
   Every factory returns { meta, W, H, step(dt), draw(fb), tap(x,y) }.
------------------------------------------------------------------- */
const Paintings = (() => {
  const { hex, Buf, bayer4, bayer8, hash2, vnoise, fbm, rng, mix } = PX;
  const { clamp, lerp, mixc, star } = Scenery;
  const W = 384, H = 216;

  // Mudkip palette grading helpers
  const gradeMudkip = (fn) => Mudkip.gradePalette(fn);
  const gradeBall = (fn) => Ball.grade(fn);
  const tintFn = (mulHex, addHex, k = 1) => {
    const m = PX.rgbOf(hex(mulHex)), a = PX.rgbOf(hex(addHex || '#000000'));
    return (c) => {
      const r = PX.rgbOf(c);
      return PX.pack(
        clamp(lerp(r[0], (r[0] * m[0]) / 255 + a[0], k), 0, 255),
        clamp(lerp(r[1], (r[1] * m[1]) / 255 + a[1], k), 0, 255),
        clamp(lerp(r[2], (r[2] * m[2]) / 255 + a[2], k), 0, 255)
      );
    };
  };

  /* ================================================================
     1 · HIGH NOON — the header rally (centerpiece)
     ================================================================ */
  function noon(opts = {}) {
    const pal = Beach.H({
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
    });
    const light = { dir: [-0.5, 0.72, 0.5] };
    const beach = Beach.create({
      W, H, hz: 88, pal, seed: 21, sandTop: 150,
      sun: { x: 10, y: -30, r: 190, k: 0.5, p: 1.4 }, skyBand: 0.2,
      shore: (x) => 191 + (x - 192) * 0.03 + Math.sin(x * 0.018 + 1) * 3,
      wave: { period: 6.6, reach: 17, far: 128, skew: 0.0035 },
      props: [
        { kind: 'starfish', x: 292, y: 203 }, { kind: 'shell', x: 238, y: 207 }, { kind: 'conch', x: 330, y: 199 },
        { kind: 'pebble', x: 118, y: 209 }, { kind: 'shell', x: 160, y: 211 }, { kind: 'pebble', x: 350, y: 208 },
      ],
    });
    const bg = beach.bg;
    // sun glow in the upper-left corner, sky only
    // far island (left) with tiny palms
    for (let x = 30; x < 92; x++) {
      const u = (x - 30) / 62;
      const hh = Math.round(Math.sin(u * Math.PI) * 5 + (u > 0.3 && u < 0.5 ? 1 : 0));
      for (let y = 88 - hh; y < 88; y++) bg.set(x, y, y === 88 - hh ? pal.island[1] : pal.island[0]);
    }
    for (const px of [48, 55, 71]) {
      for (let k = 0; k < 6; k++) bg.set(px + (k > 3 ? 1 : 0), 83 - k, pal.island[0]);
      for (const [dx, dy] of [[-2, 0], [-1, -1], [1, -1], [2, 0], [3, 1], [-3, 1]]) bg.set(px + 1 + dx, 77 + dy, pal.island[0]);
    }
    const lamp = Scenery.headland(bg, { x: 306, y: 88, w: 80, pal: pal.head, seed: 5 });

    const clouds = [
      { buf: Scenery.makeCloud(3, 104, 34, pal.cloud), x: 150, y: 14, sp: 2.2 },
      { buf: Scenery.makeCloud(8, 62, 22, pal.cloud, { upper: 1 }), x: 16, y: 40, sp: 1.5 },
      { buf: Scenery.makeCloud(14, 46, 16, pal.cloud, { upper: 1, puffs: 4 }), x: 300, y: 30, sp: 1.1 },
      { buf: Scenery.makeCloud(21, 74, 24, pal.cloud), x: 250, y: 58, sp: 0.8 },
      { buf: Scenery.makeCloud(33, 38, 13, pal.cloud, { upper: 0, puffs: 4 }), x: 90, y: 66, sp: 0.6 },
    ];
    const glints = Scenery.makeGlints(4, 150, 0, W, 90, 170);
    const palmFrames = Scenery.makePalm({ pal: pal.palm, w: 130, h: 230, bx: 26, by: 232, kx: 6, ky: 150, cx: 56, cy: 40, fronds: 10, seed: 12 });
    const vignette = Beach.makeVignette(W, H, 0.55, hex('#14224a'));
    const parts = new Scenery.Particles();

    const mk = new MudkipActor({ x: 196, gy: 179, yaw: 1.2, pal: Mudkip.BASE_PAL, light, scale: 1.3 });
    const ball = new BallActor({ x: 200, y: 20, R: 14, light });
    ball.vx = 0; ball.vy = 30;

    const G = 190, GM = 950, HJ = 16;
    const tUp = Math.sqrt((2 * HJ) / GM), vJ = GM * tUp;
    const S = {
      t: 0, mode: 'ground', vh: 0, vx: 0, crouch: 0, happy: 0, hits: 0, floating: false,
      facing: 1, idleRipple: 0.6, heart: 0,
    };
    let contactOff = null; // [dx, dy] from mudkip ground point to ball centre at the moment of contact

    const dark = PX.cmap((c) => mix(c, pal.shadow, 0.32));
    const darkW = PX.cmap((c) => mix(c, pal.shadow, 0.2));
    const subT = PX.cmap((c) => mix(c, pal.shallow[1], 0.42));
    const reflT = PX.cmap((c) => mix(c, pal.shallow[0], 0.5));
    const sounds = [];
    const emit = (name, o = {}) => sounds.push(Object.assign({ name }, o));

    function contactPose(face) {
      return { squash: -0.08, headPitch: 0.42, lean: 0.12, legF: -0.5, legB: 0.55, mouth: 1, eyes: 'happy', finSway: 0.1 };
    }
    function computeContact() {
      const save = mk.yaw;
      const s = mk.sprite(contactPose());
      const ft = s.anchors.finTip;
      mk.yaw = save;
      return [ft[0] - mk.OX, ft[1] - mk.OY - ball.R + 3];
    }
    const yContact = () => mk.gy - HJ + contactOff[1];
    // time for the ball to fall to the contact height
    function timeToContact() {
      const yc = yContact();
      const disc = ball.vy * ball.vy + 2 * G * (yc - ball.y);
      if (disc < 0) return Infinity;
      const tau = (-ball.vy + Math.sqrt(disc)) / G;
      return tau;
    }
    function launch(rise) {
      const target = clamp(mk.x + (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 46), 118, 280);
      const t = mk.x > 250 ? Math.min(target, mk.x - 30) : mk.x < 140 ? Math.max(target, mk.x + 30) : target;
      const D = 2 * Math.sqrt((2 * rise) / G);
      ball.vy = -Math.sqrt(2 * G * rise);
      ball.vx = (t - mk.x) / D;
      ball.axis = V3.norm([Math.random() - 0.5, 0.4 + Math.random() * 0.4, 1]);
      ball.w = (ball.vx >= 0 ? -1 : 1) * (5 + Math.random() * 4);
    }

    function step(dt) {
      S.t += dt;
      const t = S.t;
      beach.update(t, dt);
      if (!contactOff) contactOff = computeContact();

      // ---- ball
      ball.squashT = Math.max(0, ball.squashT - dt);
      if (S.floating) {
        ball.vy = 0;
        ball.vx *= Math.pow(0.4, dt);
        ball.x += ball.vx * dt;
        ball.y = mk.gy - 6 + Math.sin(t * 2.6) * 1.2;
        ball.w *= Math.pow(0.3, dt);
      } else {
        ball.vy += G * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x < 104) { ball.x = 104; ball.vx = Math.abs(ball.vx); }
        if (ball.x > 300) { ball.x = 300; ball.vx = -Math.abs(ball.vx); }
        // missed? splash into the shallows and float
        if (ball.y > mk.gy - 6 && ball.vy > 0) {
          ball.y = mk.gy - 6;
          S.floating = true;
          splash(parts, ball.x, mk.gy, { power: 0.9, test: beach.isWater });
          emit('splash', { big: true });
        }
      }
      ball.spin(dt);

      // ---- mudkip
      mk.sq.step(dt);
      mk.fin.step(dt);
      mk.tail.step(dt);
      S.happy = Math.max(0, S.happy - dt);
      S.heart = Math.max(0, S.heart - dt);
      const tau = S.floating ? Infinity : timeToContact();
      const targetX = S.floating ? ball.x - S.facing * 10 : ball.x + ball.vx * tau - contactOff[0] * S.facing;

      if (S.mode === 'air' || S.mode === 'hop') {
        S.vh -= GM * dt;
        mk.h += S.vh * dt;
        mk.x += S.vx * dt;
        if (mk.h <= 0 && S.vh < 0) {
          const hard = S.mode === 'air';
          mk.h = 0;
          S.mode = 'ground';
          if (hard) {
            mk.sq.kick(7);
            mk.fin.kick(-5);
            splash(parts, mk.x, mk.gy, { power: 1.2, test: beach.isWater });
            emit('splash');
          } else {
            mk.sq.kick(2.6);
            parts.add({ type: 'ripple', x: mk.x, y: mk.gy + 1, r0: 4, r1: 13, flat: 0.34, life: 0.6, c: pal.foam[1], test: beach.isWater });
            for (let i = 0; i < 4; i++) parts.add({ type: 'drop', x: mk.x + (Math.random() - 0.5) * 14, y: mk.gy - 1, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 40, g: 400, life: 1, c: pal.foam[0], size: 1, layer: 1, floor: mk.gy + 1 });
            emit('plip');
          }
        }
      } else {
        // grounded decisions
        if (S.floating && Math.abs(targetX - mk.x) < 5) {
          // nose the floating ball back into the air
          S.floating = false;
          ball.y = mk.gy - 10;
          launch(60);
          S.mode = 'hop'; S.vh = 120; S.vx = 0;
          S.happy = 0.4;
          mk.fin.kick(3);
          splash(parts, ball.x, mk.gy, { power: 0.5, test: beach.isWater });
          emit('boing', { soft: true });
        } else if (!S.floating && tau <= tUp + 0.001) {
          S.mode = 'air'; S.vh = vJ; S.vx = clamp((targetX - mk.x) / Math.max(tUp, 0.05), -140, 140);
          S.crouch = 0;
          mk.sq.kick(-4); mk.tail.kick(4); mk.fin.kick(-2.5);
          emit('jump');
        } else if (!S.floating && tau <= tUp + 0.16) {
          S.crouch = Math.min(1, S.crouch + dt * 9);
        } else if (Math.abs(targetX - mk.x) > 3 && (S.floating || tau > tUp + 0.46)) {
          S.mode = 'hop'; S.vh = 108; S.vx = clamp((targetX - mk.x) / 0.23, -70, 70);
          S.crouch = 0;
        } else S.crouch = Math.max(0, S.crouch - dt * 6);
        // idle ripples at the feet
        S.idleRipple -= dt;
        if (S.idleRipple <= 0) {
          S.idleRipple = 1.1 + Math.random() * 0.6;
          parts.add({ type: 'ripple', x: mk.x + 2, y: mk.gy + 1, r0: 12, r1: 20, flat: 0.3, life: 1.2, c: pal.foam[1], test: beach.isWater });
        }
      }
      // contact!
      if (!S.floating && S.mode === 'air' && ball.vy > 0 && mk.last) {
        const ft = mk.anchor('finTip');
        const cy = ft[1] - ball.R + 3;
        if (ball.y >= cy - 1 && Math.abs(ball.x - ft[0]) < ball.R + 8) {
          ball.y = cy;
          ball.x += (ft[0] - ball.x) * 0.6;
          S.hits++;
          launch(S.hits % 5 === 0 ? 112 : 50 + Math.random() * 14);
          ball.squashT = 0.16;
          S.happy = 0.45;
          mk.fin.kick(7);
          mk.tail.kick(3);
          const bx = ball.x, by = ball.y + ball.R - 2;
          parts.add({ type: 'spark', x: bx, y: by, size: 5, life: 0.28, c: hex('#ffffff'), c2: hex('#fff1a8'), layer: 1 });
          for (let i = 0; i < 7; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
            parts.add({ type: 'drop', x: bx, y: by + 2, vx: Math.cos(a) * (40 + Math.random() * 50), vy: Math.sin(a) * (60 + Math.random() * 60), g: 380, life: 1.4, c: pal.foam[0], c2: pal.foam[1], size: 1 + (Math.random() < 0.3 ? 1 : 0), layer: 1, floor: mk.gy + 1 + Math.random() * 3, onFloor: (p) => parts.add({ type: 'ripple', x: p.x, y: p.floor, r0: 0.5, r1: 3, flat: 0.4, life: 0.4, c: pal.foam[1], test: beach.isWater }) });
          }
          for (let i = 0; i < 5; i++) parts.add({ type: 'spark', x: bx + (Math.random() - 0.5) * 26, y: by - Math.random() * 18, size: 1 + Math.floor(Math.random() * 2), life: 0.4 + Math.random() * 0.3, c: hex('#ffffff'), c2: hex('#bfe8ff'), layer: 1 });
          emit('boing', { big: S.hits % 5 === 0 });
        }
      }

      // facing: toward where we are heading / the ball
      const dir = Math.abs(targetX - mk.x) > 4 ? Math.sign(targetX - mk.x) : Math.abs(ball.x - mk.x) > 16 ? Math.sign(ball.x - mk.x) : S.facing;
      S.facing = dir || S.facing;
      const yawT = S.facing > 0 ? 1.2 : Math.PI - 1.2;
      mk.yaw += clamp(yawT - mk.yaw, -dt * 5.5, dt * 5.5);

      // pose
      const air = S.mode === 'air';
      const rising = air && S.vh > 0;
      const headX = mk.x, headY = mk.gy - mk.h - 58;
      const look = Math.atan2(headY - ball.y, Math.abs(ball.x - headX) + 8);
      let headPitch = clamp(look * 0.55, -0.1, 0.46);
      const nearHit = !S.floating && tau < 0.12;
      const happy = S.happy > 0 || nearHit;
      const blink = !happy && mk.blink(t, dt);
      const pose = {
        squash: clamp(mk.sq.x * 0.5 + S.crouch * 0.2 + Math.sin(t * 3.1) * 0.012, -0.18, 0.3),
        headPitch: air ? (rising ? 0.42 : 0.18) : headPitch - S.crouch * 0.18,
        lean: air ? (rising ? 0.12 : -0.04) : 0,
        legF: air ? (rising ? -0.5 : 0.3) : S.mode === 'hop' ? -0.2 : 0,
        legB: air ? (rising ? 0.55 : -0.3) : S.mode === 'hop' ? 0.25 : 0,
        bodyDip: S.crouch * 1.5,
        mouth: happy ? 1 : air ? 0.8 : 0.65,
        eyes: happy ? 'happy' : blink ? 'blink' : 'open',
        finSway: clamp(0.04 + mk.fin.x * 0.3, -0.25, 0.4),
        tailLift: clamp(mk.tail.x * 0.3, -0.2, 0.35),
        tailWag: Math.sin(t * (S.happy > 0 ? 16 : 7)) * (air ? 0.1 : 0.22),
        gill: Math.sin(t * 5.3) * 0.05,
      };
      mk.sprite(pose);
      parts.update(dt);
      return sounds.splice(0);
    }

    function draw(fb) {
      const t = S.t;
      fb.copyFrom(bg);
      // clouds (sky only), drifting right
      for (const c of clouds) {
        const span = W + c.buf.w;
        const x = ((c.x + t * c.sp) % span + span) % span - c.buf.w;
        fb.blit(c.buf, x, c.y, { test: (px, py) => py < 88 });
      }
      // gulls
      for (let g = 0; g < 2; g++) {
        const span = W + 80;
        const gx = ((t * (14 + g * 5) + g * 170) % span) - 40;
        const gy = 34 + g * 16 + Math.sin(t * 0.8 + g) * 4;
        Scenery.gull(fb, gx, gy, t * (7 + g) + g, hex('#ffffff'), hex('#8aa0bb'));
      }
      // sailboat drifting on the horizon
      {
        const bx = 150 + ((t * 1.4) % 140);
        const by = 87;
        fb.set(bx, by, hex('#e9f1f8')); fb.set(bx + 1, by, hex('#e9f1f8')); fb.set(bx + 2, by, hex('#c9d6e3'));
        for (let k = 1; k <= 4; k++) for (let j = 0; j < Math.ceil(k / 2); j++) fb.set(bx + 1 - j, by - k, hex('#ffffff'));
        fb.set(bx + 1, by - 5, hex('#b24a3a'));
      }
      // sea glints
      Scenery.drawGlints(fb, glints, t, pal.glintHi, pal.glintMid, (x, y) => y > 89 && y < beach.edge[Math.max(0, Math.min(W - 1, x))] - 30);
      // swell lines far out
      for (let y = 92; y < 150; y++) {
        const p = (y - 88) / 62;
        const ph = Math.sin(y * (0.9 - p * 0.5) - t * 1.6);
        if (ph < 0.965) continue;
        for (let x = 0; x < W; x++) {
          if (vnoise(x * 0.05 + t * 0.2, y * 0.3, 2) < 0.52) continue;
          const i = y * W + x;
          fb.d[i] = mixc(fb.d[i], pal.glintMid, 0.35);
        }
      }
      beach.drawShore(fb, t);
      // shadows
      const shX = mk.x + 3, shY = mk.gy + 1;
      const k = clamp(1 - mk.h / 70, 0.3, 1);
      dropShadow(fb, shX, shY, 21 * k, 5 * k, beach.isWater(Math.round(shX), Math.round(shY)) ? darkW : dark, 0.95);
      {
        const hgt = Math.max(0, mk.gy - ball.y);
        const kk = clamp(1 - hgt / 240, 0.25, 1);
        dropShadow(fb, ball.x + 2, mk.gy + 2, ball.R * 0.95 * kk, 3 * kk, darkW, 0.9 * kk);
      }
      // reflections in the shallows
      mk.reflect(fb, mk.gy + 1, t, { tint: reflT, test: beach.isWater, gap: 0, fadeLen: 44 });
      if (mk.gy - ball.y < 60) ball.reflect(fb, mk.gy + 1, t, { tint: reflT, test: beach.isWater, fadeLen: 30 });
      parts.draw(fb, 0, t);
      // Mudkip (feet submerged while grounded in water)
      const inWater = beach.isWater(Math.round(mk.x), mk.gy + 1);
      mk.draw(fb, { waterY: inWater && mk.h < 3 ? mk.gy - 2 + Math.round(mk.h) : null, sub: subT });
      if (inWater && mk.h < 2) {
        // foam collar round the ankles
        const fx = Math.round(mk.x), fy = mk.gy - 1;
        for (let dx = -19; dx <= 19; dx++) {
          const ww = Math.abs(dx) / 19;
          if (hash2(dx + Math.floor(t * 6), 0, 3) < 0.35) continue;
          fb.set(fx + dx, fy + Math.round(ww * ww * 2), ww > 0.8 ? pal.foam[1] : pal.foam[0]);
        }
      }
      ball.render();
      ball.draw(fb);
      if (S.floating) {
        for (let dx = -ball.R; dx <= ball.R; dx++) if (hash2(dx, Math.floor(t * 5), 1) > 0.3) fb.set(Math.round(ball.x) + dx, Math.round(mk.gy - 1 + Math.abs(dx) * 0.08), pal.foam[0]);
      }
      parts.draw(fb, 1, t);
      if (S.heart > 0) drawHeart(fb, mk.anchor('finTip')[0] + 6, mk.anchor('finTip')[1] - 6 - (1.2 - S.heart) * 12, S.heart);
      // palm tree (foreground left) + grass
      fb.blit(palmFrames[Math.floor(t * 3.2) % palmFrames.length], -8, -6);
      drawGrass(fb, t, 336, 216, 20, pal.palm.leaf);
      drawGrass(fb, t, 80, 216, 8, pal.palm.leaf);
      vignette(fb);
    }

    function tap(x, y) {
      // ball?
      if (Math.hypot(x - ball.x, y - ball.y) < ball.R + 5) {
        if (S.floating) { S.floating = false; ball.y -= 6; }
        ball.vy = -Math.sqrt(2 * G * (90 + Math.random() * 25));
        ball.vx = clamp(ball.vx + (Math.random() - 0.5) * 40, -60, 60);
        ball.w *= -1.4;
        ball.squashT = 0.16;
        for (let i = 0; i < 6; i++) parts.add({ type: 'spark', x: ball.x + (Math.random() - 0.5) * 30, y: ball.y + (Math.random() - 0.5) * 30, size: 1 + Math.floor(Math.random() * 3), life: 0.5, c: hex('#ffffff'), c2: hex('#ffe9a0'), layer: 1 });
        S.happy = 0.3;
        emit('boing', { soft: true });
        return 'ball';
      }
      // mudkip?
      const s = mk.last;
      if (s) {
        const [ox, oy] = mk.origin();
        const sx = Math.round(x - ox), sy = Math.round(y - oy);
        if (sx >= 0 && sy >= 0 && sx < s.buf.w && sy < s.buf.h && s.buf.d[sy * s.buf.w + sx]) {
          if (S.mode === 'ground') { S.mode = 'hop'; S.vh = 150; S.vx = 0; }
          S.happy = 0.9; S.heart = 1.2;
          mk.fin.kick(4); mk.tail.kick(5);
          emit('cry');
          return 'mudkip';
        }
      }
      if (beach.isWater(Math.round(x), Math.round(y))) {
        splash(parts, x, y, { power: 0.55, n: 12, test: beach.isWater });
        emit('splash', { small: true });
        return 'water';
      }
      for (let i = 0; i < 5; i++) parts.add({ type: 'spark', x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 12, size: 1 + Math.floor(Math.random() * 2), life: 0.5 + Math.random() * 0.3, c: hex('#ffffff'), c2: hex('#fff3c0'), layer: 1 });
      emit('twinkle');
      return 'other';
    }

    return {
      meta: NOON_META, W, H, step, draw, tap, _dbg: () => ({ S, mk, ball, contactOff }),
      warm(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) step(1 / 30); sounds.length = 0; },
    };
  }

  function drawHeart(fb, x, y, k) {
    const spr = ['.rr.rr.', 'rllrrrr', 'rlrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
    const cols = { r: hex('#ff5a7a'), l: hex('#ffd0da') };
    x = Math.round(x) - 3; y = Math.round(y);
    for (let r = 0; r < spr.length; r++)
      for (let c = 0; c < 7; c++) {
        const ch = spr[r][c];
        if (ch === '.') continue;
        if (k < 0.3 && bayer4(x + c, y + r) > k / 0.3) continue;
        fb.set(x + c, y + r, cols[ch]);
      }
  }

  function drawGrass(fb, t, x0, y0, n, leaf) {
    const r = rng(x0 * 7 + 3);
    for (let i = 0; i < n; i++) {
      const bx = x0 + (r() - 0.5) * 34, len = 8 + r() * 12, lean = (r() - 0.5) * 0.9;
      const sw = Math.sin(t * 1.7 + bx * 0.3) * 0.12;
      let px = bx, py = y0;
      const segs = Math.ceil(len);
      for (let k = 0; k < segs; k++) {
        const u = k / segs;
        const a = -Math.PI / 2 + (lean + sw) * u * 1.6;
        px += Math.cos(a);
        py += Math.sin(a);
        fb.set(Math.round(px), Math.round(py), u < 0.3 ? leaf[1] : u < 0.75 ? leaf[2] : leaf[3]);
      }
    }
  }

  const NOON_META = {
    id: 'noon', no: 'II', title: 'High Noon Header', time: '12:04', place: 'Route 109 shore', poster: 3.5, period: 6.6,
    alt: 'Pixel painting: Mudkip leaps in ankle-deep turquoise water to head a striped beach ball under a bright noon sky, a palm tree on the left and a red-and-white lighthouse on the far headland.',
    blurb: 'Sun straight overhead, water ankle-deep. Mudkip keeps the beach ball airborne with its head fin and lands every hop with a splash.',
    medium: 'Animated pixels on canvas', size: '384 × 216 px',
    hint: 'Tap the ball to boost it · tap Mudkip · tap the water',
  };

  return { noon, W, H, gradeMudkip, gradeBall, tintFn, drawHeart, drawGrass };
})();
