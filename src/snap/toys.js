/* ------------------------------------------------------------------
   Toys — things Mudkip can play with in the world: springy things to
   bounce on (with a flip at the top), a hammock to nap in, a bell to
   ring, a sandcastle to build up, sparkling shells to collect and a
   vine to swing across the river on. Areas place them in build();
   interactive spots show a little bouncing prompt when Mudkip is near.
------------------------------------------------------------------- */
const Toys = (() => {
  const { clamp, lerp, rnd, hex } = U;
  const { wait } = Mons;
  const TAU = Math.PI * 2;
  const gy = (x) => World.groundAt(x);
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  /* ---- Mudkip moves used by toys ---- */
  function* hopTo(m, x1, y1, T = 0.45, H = 40) {
    const x0 = m.x, y0 = m.y; let e = 0;
    m.mode = 'toy'; m.plat = null;
    yield* m.faceTo(x1 >= x0 ? 1 : -1, true);
    Game.sfx('boing', m.x, 0.4);
    while (e < T) { const dt = yield; e += dt; const k = Math.min(1, e / T); m.x = lerp(x0, x1, k); m.y = lerp(y0, y1, k) - Math.sin(k * Math.PI) * H; m.o.legF = -0.5; m.o.legB = 0.5; m.o.tailLift = 0.3; }
    m.x = x1; m.y = y1;
  }
  function land(m) { m.mode = 'land'; m.air = 0; m.vair = 0; m.plat = null; m.y = gy(m.x); m.sq.kick(0.5); }
  // bounce higher and higher on something springy; flip at the top of the last jump
  function* bounce(m, x, topY, o = {}) {
    m.target = null;
    yield* hopTo(m, x, topY, 0.45, 36);
    const n = o.n || 3;
    for (let i = 0; i < n; i++) {
      const H = 44 + i * 32, T = 0.52 + i * 0.12, flip = i === n - 1, yaw0 = m.yaw;
      if (o.onBounce) o.onBounce(i);
      Game.sfx('boing', x, 0.5 + i * 0.2);
      let e = 0;
      while (e < T) {
        const dt = yield; e += dt; const k = Math.min(1, e / T);
        m.mode = 'toy'; m.x = x; m.y = topY - Math.sin(k * Math.PI) * H;
        m.o.squash = k < 0.08 || k > 0.92 ? 0.14 : -0.06; m.o.legF = -0.7; m.o.legB = 0.7; m.o.tailLift = 0.4; m.happyT = 0.2;
        if (flip) m.yaw = yaw0 + ease(k) * TAU;
        if (flip && k > 0.45 && k < 0.55 && Math.random() < 0.5) FX.sparkles(x, m.y - 14, 3, 14);
      }
      m.yaw = yaw0; m.sq.kick(0.45);
    }
    for (const q of Mons.all) if (q !== m && Math.abs(q.x - x) < 260 && !q.sleeping && q.emote && Math.random() < 0.7) q.emote(Math.random() < 0.5 ? 'star' : 'heart', 1.2);
    const lx = clamp(x + (o.side || (m.x < World.W / 2 ? 1 : -1)) * 36, 20, World.W - 20);
    yield* hopTo(m, lx, gy(lx), 0.5, 30);
    land(m); m.happyT = 1.2;
    Save.discover(o.secret || 'toy.bounce');
  }

  /* ---- springy things: the beach umbrella, giant mushrooms ---- */
  function springy(A, x, topY, o = {}) {
    return A.addHot({ x0: x - (o.w || 28), x1: x + (o.w || 28), y0: topY - 10, y1: gy(x), x, reach: 50, prompt: 'up',
      tap() { const m = Game.mudkip; if (m.mode !== 'land') return; if (o.prop) o.prop.shake = 0.5; m.doTask(bounce(m, x, topY, o), 3); } });
  }

  /* ---- hammock between two palms ---- */
  function hammock(A, M, x0, x1, yTop) {
    const w = Math.round(x1 - x0), sag = 16, h = sag + 14, s = new ISpr(w + 2, h);
    const cy = (u) => 4 + Math.sin(u * Math.PI) * sag;
    for (let x = 0; x <= w; x++) {
      const u = x / w, y = Math.round(cy(u));
      const edge = u < 0.18 || u > 0.82;
      if (edge) { s.set(x, y, M.rope ? M.rope[1] : M.drift[2]); continue; }
      for (let k = 0; k < 4; k++) s.set(x, y + k, k === 0 ? M.shell[3] : (x + k) % 6 < 3 ? (M.flowerP ? M.flowerP[1] : M.shell[2]) : M.shell[3 - (k === 3 ? 1 : 0)]);
      s.set(x, y + 4, M.ink[1]);
    }
    s.ax = 0; s.ay = 0;
    const prop = { frames: [s], x: x0, y: yTop, zd: -2, noSettle: true };
    A.props.push(prop);
    const mid = (x0 + x1) / 2, restY = yTop + 4 + sag;
    A.addHot({ x0: mid - 30, x1: mid + 30, y0: restY - 20, y1: restY + 8, x: mid, reach: 70, prompt: 'zz', tap() { const m = Game.mudkip; if (m.mode === 'land') m.doTask(rest(m, mid, restY, prop), 3); } });
    return prop;
  }
  function* rest(m, x, y, prop) {
    m.target = null;
    yield* hopTo(m, x, y, 0.55, 26);
    HUD.toast('Mudkip curls up in the hammock... (tap anywhere to get up)', { life: 2.6 });
    let e = 0, z = 0;
    while (!m.target && e < 90) {
      const dt = yield; e += dt; z -= dt;
      const sw = Math.sin(e * 1.1) * 3;
      m.mode = 'toy'; m.x = x + sw; m.y = y;
      m.o.bodyDip = 2; m.o.legSplay = 0.7; m.o.eyes = e > 1.5 ? 'sleep' : 'happy'; m.o.mouth = 0.2; m.o.tailWag = Math.sin(e * 0.9) * 0.15; m.o.headPitch = 0.1;
      if (z <= 0 && e > 1.5) { z = 1.8; FX.add({ type: 'icon', icon: 'swirl', x: m.x + 6, y: m.y - 26, vx: 5, vy: -9, life: 1.6, layer: 3 }); }
    }
    const tg = m.target;
    const lx = clamp(x + (tg && tg.x < x ? -40 : 40), 20, World.W - 20);
    m.target = null;
    yield* hopTo(m, lx, gy(lx), 0.45, 24);
    land(m); m.happyT = 0.8;
    if (tg) m.target = tg;
    Save.discover('toy.hammock');
  }

  /* ---- a bell (on the dock) that calls the birds ---- */
  function bell(A, M, x, y) {
    const mk = (ang) => {
      const s = new ISpr(16, 30);
      for (let yy = 0; yy < 30; yy++) { s.set(7, yy, M.wood[1]); s.set(8, yy, M.wood[2]); }
      for (let xx = 2; xx < 14; xx++) s.set(xx, 2, M.wood[3]);
      const bx = 8 + Math.round(Math.sin(ang) * 4), by = 5;
      for (let yy = 0; yy < 9; yy++) { const hw = 1 + Math.round(yy * 0.45); for (let xx = -hw; xx <= hw; xx++) s.set(bx + xx, by + yy, yy === 8 ? M.ink[1] : M.fruit ? M.fruit[Math.min(2, 1 + (xx < 0 ? 1 : 0))] : M.sand[4]); }
      s.ax = 8; s.ay = 29; return s;
    };
    const frames = [mk(0), mk(0.5), mk(-0.5)];
    const prop = { frames: [frames[0]], x, y, zd: -1, noSettle: true };
    A.props.push(prop);
    A.addHot({ x0: x - 12, x1: x + 12, y0: y - 30, y1: y, x, reach: 40, prompt: '!', tap() {
      Game.sfx('chime', x, 1); setTimeout(() => Game.sfx('chime', x, 0.7), 260);
      let k = 0; const sw = setInterval(() => { prop.frames = [frames[1 + (k % 2)]]; if (++k > 6) { clearInterval(sw); prop.frames = [frames[0]]; } }, 120);
      FX.add({ type: 'ring', x, y: y - 24, r0: 3, r1: 30, life: 0.8, c: 0xffffffff, layer: 3 });
      for (const q of Mons.all) {
        if (q === Game.mudkip) continue;
        q.hear('loud', x, 0.8);
        if (q.circle && (q.kind === 'pelipper' || q.kind === 'wingull') && !q.busy(3)) { q.mode = 'fly'; q.perchAt = null; q.doTask(q.circle(x, y - 70, 70, 7, 'fly'), 3); }
      }
      Save.discover('toy.bell');
    } });
    return prop;
  }

  /* ---- sandcastle: tap to build it up (Spheal come to admire a finished castle) ---- */
  function castle(A, M, prop, x) {
    let lvl = 1;
    const build = () => {
      const s = Props.sandcastle(M), up = new ISpr(s.w, s.h + (lvl - 1) * 10);
      up.paste(s, 0, (lvl - 1) * 10);
      // extra towers for each level
      for (let l = 1; l < lvl; l++) for (let y = 0; y < 12; y++) for (let xx = 0; xx < 8; xx++) { const X = 22 + xx, Y = (lvl - 1) * 10 - l * 10 + y; if ((y < 2 && xx % 3 === 1)) continue; up.set(X, Y, M.sand[y < 3 ? 4 : xx < 2 ? 2 : 3]); }
      if (lvl >= 3) for (let y = 0; y < 6; y++) up.set(26, y, M.wood[2]), up.set(27 + (y < 3 ? 1 : 0), y < 3 ? y : 0, M.flowerP ? M.flowerP[1] : M.shell[1]);
      up.ax = s.ax; up.ay = up.h - (s.h - s.ay);
      prop.frames = [up]; prop.y = prop.y0 ?? (prop.y0 = prop.y);
    };
    A.addHot({ x0: x - 26, x1: x + 26, y0: gy(x) - 50, y1: gy(x), x, reach: 44, prompt: 'up', tap() {
      const m = Game.mudkip;
      m.doTask((function* () {
        yield* m.faceTo(x > m.x ? 1 : -1, false);
        let e = 0; Game.sfx('dust', x, 0.7);
        while (e < 1) { const dt = yield; e += dt; m.o.headPitch = 0.3; m.o.legF = Math.sin(e * 20) * 0.6; if (Math.random() < dt * 20) FX.add({ type: 'drop', x: x + rnd(-10, 10), y: gy(x) - rnd(4, 20), vx: rnd(-30, 30), vy: -rnd(20, 60), g: 400, life: 0.6, c: Game.P.sand[3], size: 1, floor: gy(x), layer: 3 }); }
        if (lvl < 3) { lvl++; build(); FX.sparkles(x, gy(x) - 40, 8, 20); HUD.toast(lvl === 3 ? 'A magnificent sandcastle!' : 'Mudkip adds another tower!', { life: 1.8 }); }
        else HUD.toast('The castle is finished! Maybe someone will come and admire it...', { life: 2 });
        if (lvl === 3) { Save.discover('toy.castle'); for (const q of Mons.all) if ((q.kind === 'spheal' || q.kind === 'sealeo') && !q.sleeping && !q.busy(2) && Math.abs(q.x - x) < 500 && q.clapAbout) { q.doTask((function* (s) { yield* s.walkTo(x + (s.x < x ? -40 : 40), 60); yield* s.faceTo(x > s.x ? 1 : -1, false); yield* s.clapAbout(3); })(q), 2); } }
        m.happyT = 1;
      })(), 3);
    } });
  }

  /* ---- sparkling shells to collect along the tideline ---- */
  function shells(A, M, xs) {
    const list = [];
    const spawn = (h) => { h.x = xs[0] + Math.random() * (xs[1] - xs[0]); const g = gy(h.x); h.x0 = h.x - 8; h.x1 = h.x + 8; h.y0 = g - 12; h.y1 = g + 4; h.off = false; h.t = 0; };
    for (let i = 0; i < 5; i++) {
      const h = A.addHot({ x: 0, reach: 26, prompt: null, shell: true, tap() {
        if (this.off) return;
        this.off = true; Save.addItem('shell', 1); Save.addPoints(15); Game.sfx('twinkle', this.x, 0.8); FX.sparkles(this.x, gy(this.x) - 6, 8, 14, 0xffffffff, hex('#ffd0e0'));
        const n = Save.itemN('shell');
        HUD.toast('Shell collected! (' + n + ')' + (n % 10 === 0 ? ' — Shell hunter bonus +150!' : ''), { life: 1.6 });
        if (n % 10 === 0) Save.addPoints(150);
        const me = this; setTimeout(() => { if (Game.area === A) spawn(me); }, 20000 + Math.random() * 20000);
      } });
      spawn(h); list.push(h);
    }
    A.shellSpots = list;
    return list;
  }
  function drawShells(fb, cx, cy, t) {
    const A = Game.area; if (!A || !A.shellSpots) return;
    for (const h of A.shellSpots) {
      if (h.off) continue;
      const X = Math.round(h.x - cx), Y = Math.round(gy(h.x) - cy - 2);
      if (X < 2 || Y < 2 || X > fb.w - 3 || Y > fb.h - 3) continue;
      const d = fb.d, W = fb.w, i = Y * W + X;
      d[i] = 0xffc0d8f8; d[i - 1] = 0xffa0b8e8; d[i + 1] = 0xffa0b8e8; d[i - W] = 0xffe8f0ff; d[i + W] = 0xff7890c8;
      const s = Math.sin(t * 4 + h.x);
      if (s > 0.7) { d[i - W * 2] = 0xffffffff; d[i - 2] = U.screen(d[i - 2], 0xffffffff, 0.7); d[i + 2] = U.screen(d[i + 2], 0xffffffff, 0.7); d[i - W * 3] = U.screen(d[i - W * 3], 0xffffffff, 0.5); }
    }
  }

  /* ---- a long vine to swing across the river ---- */
  function vine(A, M, xL, xR, groundY) {
    const ax = (xL + xR) / 2, L = 700, th = Math.asin(Math.min(0.95, (xR - xL) / 2 / L)), ay = groundY - 80 - L * Math.cos(th);
    const state = { side: -1, swing: null };
    const end = (side) => [ax + Math.sin(th * side) * L, ay + Math.cos(th * side) * L];
    const prop = { frames: [new ISpr(1, 1)], x: ax, y: ay, zd: -1, noSettle: true, draw(fb, X, Y, pal, t, cx, cy) {
      const sw = state.swing;
      const ang = sw ? sw.ang : th * state.side + Math.sin(t * 0.8) * 0.01;
      const ex = ax + Math.sin(ang) * L, ey = ay + Math.cos(ang) * L;
      const x0 = ax - cx, y0 = ay - cy, x1 = ex - cx, y1 = ey - cy;
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      const c1 = pal[M.leafD ? M.leafD[1] : M.moss[0]], c2 = pal[M.leaf ? M.leaf[3] : M.moss[2]];
      for (let k = 0; k < n; k++) {
        const u = k / n, px = Math.round(x0 + (x1 - x0) * u + Math.sin(u * 9 + t) * 1.2), py = Math.round(y0 + (y1 - y0) * u);
        if (px < 0 || py < 0 || px >= fb.w || py >= fb.h) continue;
        fb.d[py * fb.w + px] = c1;
        if (k % 9 === 0 && px + 1 < fb.w) { fb.d[py * fb.w + px + 1] = c2; if (py + 1 < fb.h) fb.d[(py + 1) * fb.w + px + 1] = c2; }
      }
    } };
    A.props.push(prop);
    const hot = (side) => { const [ex, ey] = end(side); return A.addHot({ x0: ex - 24, x1: ex + 24, y0: ey - 20, y1: groundY + 4, x: ex, reach: 60, prompt: side === state.side ? 'up' : null, vineSide: side, tap() {
      if (side !== state.side) { HUD.toast('The vine is on the other bank.', { life: 1.4 }); return; }
      const m = Game.mudkip; if (m.mode !== 'land') return;
      m.doTask(swing(m, side), 3);
    } }); };
    const hL = hot(-1), hR = hot(1);
    function* swing(m, side) {
      const [ex, ey] = end(side);
      yield* hopTo(m, ex, ey + 22, 0.45, 20);
      Game.sfx('whoosh', ex, 0.9);
      state.swing = { ang: th * side };
      let e = 0; const T = 1.5;
      while (e < T) {
        const dt = yield; e += dt; const k = Math.min(1, e / T);
        const ang = th * side * Math.cos(k * Math.PI);
        state.swing.ang = ang;
        m.mode = 'toy'; m.x = ax + Math.sin(ang) * L; m.y = ay + Math.cos(ang) * L + 22;
        m.o.legF = -0.8; m.o.legB = 0.8; m.o.tailLift = 0.5; m.happyT = 0.2; m.yaw = m.face(-side, true);
        if (Math.random() < dt * 8) FX.add({ type: 'drop', x: m.x + rnd(-8, 8), y: m.y - 10, vx: rnd(-20, 20), vy: rnd(-10, 10), g: 60, life: 1.2, c: hex('#56a042'), c2: hex('#8ccc5a'), size: 2, floor: groundY, layer: 3 });
      }
      state.swing = null; state.side = -side;
      hL.prompt = state.side === -1 ? 'up' : null; hR.prompt = state.side === 1 ? 'up' : null;
      const lx = clamp(end(-side)[0] + (-side) * 30, 20, World.W - 20);
      yield* hopTo(m, lx, gy(lx), 0.5, 20);
      land(m); m.happyT = 1.2;
      Save.discover('toy.vine');
    }
    return prop;
  }

  /* ---- little prompts over things you can play with ---- */
  const ICON = {
    up: ['..k..', '.kkk.', 'kkkkk', '..k..', '..k..'],
    zz: ['kkk..', '..k..', '.k...', 'kkk..', '...kk', '....k', '...kk'],
    '!': ['.k.', '.k.', '.k.', '...', '.k.'],
  };
  function drawPrompts(fb, cx, cy, t) {
    const A = Game.area, m = Game.mudkip; if (!A || !m || Game.mode !== 'explore') return;
    for (const h of A.hot) {
      if (h.off || !h.prompt) continue;
      const hx = h.x ?? (h.x0 + h.x1) / 2;
      const dd = Math.abs(hx - m.x);
      if (dd > 110) continue;
      const k = Math.min(1, (110 - dd) / 40);
      const ic = ICON[h.prompt] || ICON['!'];
      const bw = ic[0].length + 4, bh = ic.length + 4;
      const X = Math.round(hx - cx - bw / 2), Y = Math.round(h.y0 - cy - bh - 6 - Math.abs(Math.sin(t * 3 + hx)) * 3);
      const d = fb.d, W = fb.w;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const X2 = X + x, Y2 = Y + y; if (X2 < 0 || Y2 < 0 || X2 >= W || Y2 >= fb.h) continue;
        const corner = (x === 0 || x === bw - 1) && (y === 0 || y === bh - 1);
        if (corner) continue;
        const edge = x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
        const i = Y2 * W + X2;
        d[i] = U.mix(d[i], edge ? 0xff302018 : 0xfff8f8ff, k * 0.92);
      }
      for (let y = 0; y < ic.length; y++) for (let x = 0; x < ic[y].length; x++) if (ic[y][x] === 'k') { const X2 = X + 2 + x, Y2 = Y + 2 + y; if (X2 >= 0 && Y2 >= 0 && X2 < W && Y2 < fb.h) d[Y2 * W + X2] = U.mix(d[Y2 * W + X2], 0xff3a3ae8, k); }
    }
  }
  return { hopTo, bounce, springy, hammock, bell, castle, shells, drawShells, vine, drawPrompts };
})();
