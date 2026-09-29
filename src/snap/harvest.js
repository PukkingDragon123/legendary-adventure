/* ------------------------------------------------------------------
   Harvest — everything small that makes the lanes feel alive:
   · harvestables: berries, mushrooms, gems, shells, pearls and star
     pieces lying around (walk into them to collect; they grow back)
   · TM discs hidden around the world, glittering dig spots (dig or
     belly flop on them), quest items
   · animated foreground dressing, shaded in the time-of-day palette:
     grass tufts and flowers that sway in the wind and part when Mudkip
     runs through (a berry may pop out), reeds by the water, pebbles,
     mushrooms, crystal shards; kelp, coral fans, tube sponges and
     anemones in front of the seabed
   · ambient motes: pollen, drifting leaves, fireflies, cave dust,
     plankton and little fish schools; eyes that blink in the grass
------------------------------------------------------------------- */
const Harvest = (() => {
  const { clamp, rnd, hash, lerp } = U;
  const TAU = Math.PI * 2;
  const H = { items: [], spots: [], tufts: [], under: [], motes: [], fish: [], eyes: [], area: null, pal: null, palKey: '' };

  /* ---------- colours (graded for the hour and weather like the scenery) ---------- */
  const MATS = {
    g1: ['#10331c', '#1a4c24', '#276a2e', '#3c8c38', '#62b04a', '#9ad86a'],
    g2: ['#23401a', '#365a1e', '#4e7824', '#6e9a2c', '#98c048', '#cce47a'],
    dune: ['#3e5a2a', '#58763a', '#7a944a', '#a0b25e', '#c8d27c'],
    reed: ['#3a3a18', '#5a5620', '#7e782e', '#a89c42', '#d0c060'],
    cat: ['#3a1e10', '#5a3018', '#7a4422'],
    flP: ['#8a1e4a', '#d0407a', '#ff7aa8', '#ffc0d8'], flY: ['#8a6410', '#d0a020', '#ffd84a', '#fff4a8'],
    flW: ['#8a92a8', '#c8d0e0', '#f4f6ff', '#ffffff'], flB: ['#1e3a8a', '#3a6ad0', '#6aa4ff', '#b8d8ff'],
    rock: ['#262c38', '#3a4252', '#525c6e', '#6e7a8c', '#94a0b0', '#c4ccd6'],
    rockW: ['#1e2a2e', '#2c3c40', '#3e5256', '#56706e'],
    shroomR: ['#6a0e1a', '#a81e2a', '#e0383e', '#ff6a5a'], shroomB: ['#4a2a16', '#6e4424', '#946236', '#ba8850'],
    stalk: ['#a89c88', '#d4ccb8', '#f4f0e4'],
    shroomG: { c: ['#1a6a5a', '#2ab89a', '#6affd8', '#d0fff4'], emit: true },
    berryB: ['#14285a', '#1e46a0', '#3a78e0', '#8ac0ff'], berryP: ['#6a1440', '#b02a6a', '#f05a9a', '#ffb0d0'], berryR: ['#4a0a1a', '#8a1430', '#d82a48', '#ff7a8a'], berryN: ['#6a4a0a', '#b08a1a', '#f0d040', '#fff4a0'], berryS: ['#6a5a0a', '#c0a010', '#ffe030', '#fffac0'], stem: ['#1a3a14', '#2e5a20', '#4a8a30', '#7ab850'], leafB: ['#1a4a20', '#2e7a30', '#5aac48'],
    gemB: { c: ['#10306a', '#2a6ad8', '#7ac0ff', '#e0f4ff'], emit: true }, gemP: { c: ['#4a106a', '#9a3ad8', '#d49aff', '#f8e8ff'], emit: true },
    gemG: { c: ['#0a4a2a', '#1aa05a', '#6af0a0', '#e0fff0'], emit: true }, gemY: { c: ['#6a4a08', '#c89a18', '#ffe060', '#fffbe0'], emit: true },
    shell: ['#8a4a42', '#c8807a', '#f0b8ae', '#fff0ea'], pearl: { c: ['#a8a0b8', '#e0dcf0', '#ffffff'], emit: true },
    starp: { c: ['#8a3a10', '#e08a20', '#ffd060', '#fff8d0'], emit: true },
    kelp: ['#0e2a1a', '#18422a', '#26603a', '#3a8048', '#5aa45a'], kelpO: ['#2a2a10', '#44421a', '#626026', '#848436'],
    coP: ['#5a1a3a', '#9a3060', '#d85a8a', '#ff9ab8'], coO: ['#6a2a10', '#b0501e', '#e8843a', '#ffbe78'], coV: ['#301a5a', '#503a9a', '#7a64d0', '#b0a0f4'],
    coT: ['#0e3a3a', '#1a6a64', '#34a08e', '#7ad8c0'], anem: ['#5a1650', '#94337e', '#c862aa', '#eea0da'], sponge: ['#6a5010', '#a8801e', '#dcb03a', '#f8dc70'],
    crys: { c: ['#1e3a8a', '#3a7ae0', '#7ac0ff', '#d0ecff'], emit: true }, crysP: { c: ['#4a1e8a', '#8a4ae0', '#c49aff', '#f0dcff'], emit: true },
    ink: ['#10121c'],
  };
  const TAB = new Pal.Table(MATS);
  function palette() {
    const w = typeof Weather !== 'undefined' ? Weather.W : { rain: 0, fog: 0 };
    const key = Game.hour() + '|' + (w.rain || 0).toFixed(1) + '|' + (w.fog || 0).toFixed(1);
    if (H.palKey !== key) { H.pal = TAB.compile(Game.hour(), 0, { rain: +(w.rain || 0).toFixed(1), fog: +(w.fog || 0).toFixed(1) }); H.palKey = key; }
    return H.pal;
  }
  const C = (name, k) => { const ids = TAB[name]; return H.pal[ids[clamp(Math.round(k * (ids.length - 1)), 0, ids.length - 1)]]; };

  /* ---------- per-area setup ---------- */
  const STYLE = {
    beach: { land: ['dune', 'g1'], flowers: ['flY', 'flW', 'flP'], items: ['shell', 'shell', 'starp'], under: true, motes: 'pollen', rocks: 'rock' },
    forest: { land: ['g1', 'g2'], flowers: ['flP', 'flY', 'flB', 'flW'], items: ['shroom', 'shroom', 'gem'], motes: 'leaves', rocks: 'rockW', shrooms: true },
    canopy: { land: ['g1', 'g2'], flowers: ['flY', 'flP'], items: ['shroom'], motes: 'leaves', rocks: 'rockW', shrooms: true, sparse: 0.6 },
    falls: { land: ['g1'], flowers: ['flB'], items: ['gem', 'gem', 'starp', 'shroomG'], motes: 'dust', rocks: 'rock', crystals: true, sparse: 0.5 },
  };
  const TMS = { beach: [{ id: 'bubble', x: 2520 }, { id: 'ice', x: 4720 }], forest: [{ id: 'dig', x: 2150 }], canopy: [{ id: 'growl', x: 3215 }], falls: [{ id: 'smash', x: 3470 }] };
  const ITEM = {
    berry: { name: 'Oran Berry', inv: 'berry' }, shell: { name: 'Pretty Shell', inv: 'shell' }, pearl: { name: 'Pearl', inv: 'pearl' },
    shroom: { name: 'Tiny Mushroom', inv: 'mushroom' }, shroomG: { name: 'Glowing Mushroom', inv: 'mushroom' }, gem: { name: 'Shiny Gem', inv: 'gem' }, starp: { name: 'Star Piece', inv: 'stardust' },
  };
  H.ITEM = ITEM;
  // berries grow on bushes; pick them by hand (E) before a hungry Pokémon does
  const BERRY = {
    oran: { inv: 'berry', name: 'Oran Berry', mat: 'berryB', lure: 'Most Pokémon like it.' },
    pecha: { inv: 'pecha', name: 'Pecha Berry', mat: 'berryP', lure: 'Sweet! Cute Pokémon come running.' },
    razz: { inv: 'razz', name: 'Razz Berry', mat: 'berryR', lure: 'Its smell draws in rare Pokémon.' },
    nanab: { inv: 'nanab', name: 'Nanab Berry', mat: 'berryN', lure: 'Calms Pokémon: they sit still for photos.' },
    sitrus: { inv: 'sitrus', name: 'Sitrus Berry', mat: 'berryS', lure: 'Makes Pokémon happy and playful.' },
  };
  H.BERRY = BERRY;
  const PLANTS = { beach: ['oran', 'pecha', 'oran'], forest: ['oran', 'razz', 'nanab', 'sitrus'], canopy: ['nanab', 'pecha', 'sitrus'], falls: ['razz', 'oran'] };
  function surfaceKind(x) {
    const lvl = World.waterAt(x);
    if (lvl === null) return 'land';
    return World.groundAt(x) - lvl > 30 ? 'sea' : 'shallow';
  }
  function reset(A, id) {
    H.items.length = 0; H.spots.length = 0; H.tufts.length = 0; H.under.length = 0; H.motes.length = 0; H.fish.length = 0; H.eyes.length = 0;
    H.area = id; H.palKey = ''; H.flocks.length = 0;
    let sd = 7; for (const ch of id) sd = (sd * 31 + ch.charCodeAt(0)) | 0;
    const st = STYLE[id] || STYLE.forest, r = U.rng(Math.abs(sd) % 1000003), band = (A.band || 12);
    const W = World.W, sparse = st.sparse ?? 1;
    // foreground tufts, flowers, pebbles and rocks along the front edge of the lane
    for (let x = 20; x < W - 20; x += 5 + r() * 9 / sparse) {
      const k = surfaceKind(x), g = World.groundAt(x);
      if (k === 'shallow') { if (r() < 0.35) H.tufts.push({ x, kind: 'reed', n: 3 + (r() * 3 | 0), h: 10 + r() * 10, ph: r() * 6, push: 0, zd: band * 0.4 }); continue; }
      if (k === 'sea') {
        // seabed life in front of the reef
        const q = r();
        if (q < 0.25) H.under.push({ x, kind: 'kelp', h: 30 + r() * 60, ph: r() * 6, col: r() < 0.7 ? 'kelp' : 'kelpO', n: 1 + (r() * 2 | 0) });
        else if (q < 0.4) H.under.push({ x, kind: 'fan', r: 6 + r() * 8, col: ['coP', 'coO', 'coV'][r() * 3 | 0], ph: r() * 6 });
        else if (q < 0.5) H.under.push({ x, kind: 'tube', n: 2 + (r() * 3 | 0), h: 6 + r() * 10, col: r() < 0.5 ? 'sponge' : 'coT' });
        else if (q < 0.6) H.under.push({ x, kind: 'anem', r: 4 + r() * 4, ph: r() * 6 });
        else if (q < 0.72) H.under.push({ x, kind: 'rock', w: 6 + r() * 10, h: 4 + r() * 6, col: 'rockW' });
        x += r() * 8;
        continue;
      }
      if (World.platAt(x) && World.platY(World.platAt(x), x) < g - 20) continue;
      const q = r();
      const ramp = st.land[(r() * st.land.length) | 0];
      if (q < 0.62) H.tufts.push({ x, kind: 'grass', ramp, n: 3 + (r() * 5 | 0), h: 5 + r() * 9, ph: r() * 6, push: 0, zd: band * (0.35 + r() * 0.2), flower: r() < 0.28 ? st.flowers[(r() * st.flowers.length) | 0] : null });
      else if (q < 0.7) H.tufts.push({ x, kind: 'pebble', w: 2 + r() * 4, h: 1 + r() * 3, col: st.rocks, zd: band * (0.3 + r() * 0.3) });
      else if (q < 0.74) H.tufts.push({ x, kind: 'rock', w: 8 + r() * 12, h: 5 + r() * 8, col: st.rocks, zd: band * 0.5, seed: r() * 999 });
      else if (q < 0.79 && st.shrooms) H.tufts.push({ x, kind: 'shroom', col: r() < 0.6 ? 'shroomB' : 'shroomR', s: 2 + r() * 3, zd: band * (0.3 + r() * 0.3) });
      else if (q < 0.83 && st.crystals) H.tufts.push({ x, kind: 'crystal', col: r() < 0.6 ? 'crys' : 'crysP', h: 5 + r() * 9, lean: (r() - 0.5) * 0.6, zd: band * 0.45 });
    }
    H.tufts.sort((a, b) => a.x - b.x); H.under.sort((a, b) => a.x - b.x);
    // harvestables
    for (let x = 120; x < W - 100; x += 90 + r() * 140) {
      const k = surfaceKind(x);
      if (k === 'shallow') continue;
      if (World.platAt(x) && k === 'sea') continue;
      let kind = st.items[(r() * st.items.length) | 0];
      if (k === 'sea') kind = r() < 0.3 ? 'pearl' : r() < 0.7 ? 'shell' : 'starp';
      H.items.push({ kind, x, y: World.groundAt(x) - 1, under: k === 'sea', t: 0, taken: 0, ph: r() * 6 });
    }
    // berry bushes
    const pk = PLANTS[id] || ['oran'];
    for (let x = 160; x < W - 120; x += 220 + r() * 260) {
      if (surfaceKind(x) !== 'land' || World.platAt(x)) continue;
      H.items.push({ kind: 'plant', berry: pk[(r() * pk.length) | 0], x, y: World.groundAt(x) - 1, ripe: 1 + ((r() * 3) | 0), grow: 0, t: 0, taken: 0, ph: r() * 6 });
    }
    // TM discs not yet learned
    for (const tm of TMS[id] || []) if (!Moves.has(tm.id)) H.items.push({ kind: 'tm', tm: tm.id, x: tm.x, y: World.groundAt(tm.x) - 9, under: surfaceKind(tm.x) === 'sea', t: 0, taken: 0, ph: 0 });
    // glittering dig spots
    for (let i = 0; i < 5; i++) { for (let g = 0; g < 20; g++) { const x = 200 + r() * (W - 400); if (surfaceKind(x) === 'land' && !World.platAt(x)) { H.spots.push({ x, found: false, kind: 'treasure', ph: r() * 6 }); break; } } }
    // quest spots that are still to be found
    for (const q of Talk.QUESTS) { const s = Talk.qState(q.id); if (q.area === id && s && s.s === 'active' && (q.progress === 'spots' || q.progress === 'pearl')) setTimeout(() => questSpots(q, Talk.giverOf(q), s.n || 0), 0); }
    // eyes in the grass (something is watching...)
    for (let i = 0; i < 3; i++) { const t = H.tufts[(r() * H.tufts.length) | 0]; if (t && t.kind === 'grass') { t.h = Math.max(t.h, 11); t.n = Math.max(t.n, 6); H.eyes.push({ tuft: t, blink: r() * 3, gone: 0, i }); } }
  }
  function questSpots(q, giver, have = 0) {
    if (!giver) return;
    const r = U.rng(hash(q.id.length, 3, 9) * 1e6 | 0);
    if (q.progress === 'spots') {
      H.spots = H.spots.filter((s) => s.quest !== q.id);
      let placed = 0;
      for (let g = 0; g < 200 && placed < q.n - have; g++) {
        const x = clamp(giver.home + (r() - 0.5) * 900, 80, World.W - 80);
        if (surfaceKind(x) !== 'land' || World.platAt(x) || H.spots.some((s) => Math.abs(s.x - x) < 60)) continue;
        H.spots.push({ x, found: false, kind: 'quest', quest: q.id, ph: r() * 6 }); placed++;
      }
    } else if (q.progress === 'pearl' && have < 1) {
      for (let g = 0; g < 200; g++) {
        const x = 1250 + r() * 900;
        if (surfaceKind(x) === 'sea') { H.items.push({ kind: 'qpearl', quest: q.id, x, y: World.groundAt(x) - 2, under: true, t: 0, taken: 0, ph: 0 }); break; }
      }
    }
  }
  U.on && U.on('area', (id) => { if (Game.area) reset(Game.area, id); });

  /* ---------- collecting, digging, pounding ---------- */
  function collect(it) {
    const mk = Game.mudkip;
    it.taken = 1; it.t = 0;
    FX.sparkles(it.x, it.y - 4, 7, 14);
    if (it.kind === 'tm') { Moves.unlock(it.tm, 'Found a TM disc!'); it.gone = true; FX.confetti(it.x, it.y - 10, 30); return; }
    if (it.kind === 'qpearl') { it.gone = true; Game.sfx('twinkle', it.x); Talk.event('pearl', it.quest); HUD.toast('Found the lost pearl! Take it back to Luvdisc.', { life: 2.6 }); return; }
    if (it.kind === 'plant') {
      const b = BERRY[it.berry], n = it.ripe;
      Save.addItem(b.inv, n); it.ripe = 0; it.grow = 0; it.taken = 0;
      Game.sfx('pop', it.x, 0.8); popIcon(it.x, it.y - 12, it.berry);
      HUD.toast('+' + n + ' ' + b.name + (n > 1 ? 's' : ''), { life: 1.6, col: 0xff6ae0a0 });
      if (mk) mk.happyT = Math.max(mk.happyT, 0.5);
      return;
    }
    if (it.kind === 'berry') { const b = BERRY[it.berry || 'oran']; Save.addItem(b.inv, 1); popIcon(it.x, it.y - 8, it.berry || 'oran'); Game.sfx('pop', it.x, 0.7); HUD.toast('+1 ' + b.name, { life: 1.4, col: 0xff6ae0a0 }); it.gone = !!it.extra; it.respawn = 90; return; }
    const d = ITEM[it.kind];
    Save.addItem(d.inv, 1);
    Game.sfx(it.kind === 'berry' ? 'pop' : 'twinkle', it.x, 0.7);
    HUD.toast('+1 ' + d.name, { life: 1.4, col: 0xff6ae0a0 });
    it.respawn = 80 + Math.random() * 80;
    if (mk) mk.happyT = Math.max(mk.happyT, 0.3);
  }
  // the picked berry pops up over Mudkip's head
  function popIcon(x, y, berry) {
    const mat = (BERRY[berry] || BERRY.oran).mat;
    FX.add({ type: 'fn', x, y, vy: -30, life: 0.9, layer: 4, draw: (fb, p, k, cx, cy) => { palette(); const X = Math.round(p.x - cx), Y = Math.round(p.y - cy); for (let yy = -4; yy <= 4; yy++) for (let xx = -4; xx <= 4; xx++) { const d = xx * xx + yy * yy; if (d > 17) continue; put(fb, X + xx, Y + yy, d > 12 ? 0xff1b2240 : C(mat, xx + yy < -3 ? 1 : xx + yy < 1 ? 0.66 : 0.33)); } put(fb, X, Y - 5, C('leafB', 0.6)); put(fb, X + 1, Y - 6, C('leafB', 1)); } });
  }
  // the nearest thing Mudkip could pick up (E)
  function nearest() {
    const mk = Game.mudkip; if (!mk) return null;
    let best = null, bd = 18;
    for (const it of H.items) {
      if (it.taken || it.gone) continue;
      if (it.kind === 'plant' && it.ripe <= 0) continue;
      const d = Math.abs(mk.x - it.x); if (d < bd && Math.abs((mk.y - 8) - (it.y - 6)) < 22) { bd = d; best = it; }
    }
    return best;
  }
  function pick() {
    const mk = Game.mudkip, it = H.near; if (!mk || !it || mk.busy(2)) return false;
    mk.wakeUp(); mk.doTask(mk.pickUp(it, () => { if (!it.taken && !it.gone && (it.kind !== 'plant' || it.ripe > 0)) collect(it); }), 2);
    return true;
  }
  function reveal(sp, how) {
    sp.found = true;
    Game.sfx('chest', sp.x, 0.8); FX.sparkles(sp.x, World.groundAt(sp.x) - 6, 12, 20); FX.confetti(sp.x, World.groundAt(sp.x) - 6, 16);
    if (sp.kind === 'quest') { Talk.event('spot', sp.quest); return 'a buried treasure'; }
    const r = Math.random();
    if (r < 0.35) { Save.addItem('gem', 1); return 'a shiny gem'; }
    if (r < 0.6) { Save.addItem('berry', 2); return 'two berries'; }
    if (r < 0.8) { Save.addItem('stardust', 1); return 'a star piece'; }
    Save.addPoints(150); return 'an old coin (+150)';
  }
  function dig(x) {
    const sp = H.spots.find((s) => !s.found && Math.abs(s.x - x) < 22);
    return sp ? reveal(sp, 'dig') : null;
  }
  function pound(x, y) {
    const sp = H.spots.find((s) => !s.found && Math.abs(s.x - x) < 26);
    if (sp) { const what = reveal(sp, 'pound'); HUD.toast('The ground shook loose ' + what + '!', { life: 2.2 }); }
    // things nearby jump off the ground
    for (const it of H.items) if (!it.taken && !it.under && Math.abs(it.x - x) < 50) it.hop = 1;
  }

  function update(dt, t) {
    if (!Game.area || H.area !== Game.areaId) return;
    const mk = Game.mudkip;
    for (const it of H.items) {
      it.t += dt;
      if (it.hop > 0) it.hop = Math.max(0, it.hop - dt * 2.5);
      if (it.taken) { if (it.gone) continue; if (it.t > it.respawn) { it.taken = 0; it.t = 0; } continue; }
      if (it.kind === 'plant' && it.ripe < 3) { it.grow += dt; if (it.grow > 40) { it.grow = 0; it.ripe++; } }
    }
    H.near = Game.mode === 'explore' ? nearest() : null;
    // hungry Pokémon raid ripe bushes when Mudkip is not looking
    H.snackT = (H.snackT ?? 12) - dt;
    if (H.snackT <= 0 && mk) {
      H.snackT = 14 + Math.random() * 14;
      const plants = H.items.filter((p) => p.kind === 'plant' && p.ripe > 0 && Math.abs(p.x - mk.x) > 50);
      for (const p of plants) {
        const m = Mons.all.find((q) => q !== mk && q.alive && q.mode === 'land' && !q.layer && !q.busy(2) && !q.sleeping && q.walkTo && Math.abs(q.x - p.x) < 220);
        if (m) { m.doTask(raid(m, p), 2); break; }
      }
    }
    // grass parts when Mudkip moves through it
    if (mk && mk.moving && mk.mode === 'land' && mk.air <= 0) {
      for (const tf of H.tufts) {
        if (tf.kind !== 'grass' && tf.kind !== 'reed') continue;
        if (tf.x < mk.x - 10) continue; if (tf.x > mk.x + 10) break;
        if (tf.push <= 0.2) { tf.pushDir = Math.sign(tf.x - mk.x) || 1; if (Math.random() < 0.25) Game.sfx('rustle', tf.x, 0.25); if (Math.random() < 0.012 && tf.kind === 'grass') popBerry(tf); }
        tf.push = 1;
      }
    }
    for (const tf of H.tufts) if (tf.push > 0) tf.push = Math.max(0, tf.push - dt * 1.8);
    // eyes in the grass: sneak up slowly to find out who it is
    for (const e of H.eyes) {
      if (e.gone) continue;
      e.blink -= dt; if (e.blink < -0.15) e.blink = 2 + Math.random() * 3;
      if (!mk) continue;
      const d = Math.abs(mk.x - e.tuft.x);
      if (d < 40 && mk.moving > 60) { e.gone = 1; FX.poof(e.tuft.x, World.groundAt(e.tuft.x) - 4, 0xffe0f0d0, 0xffa0c090, 5, 4); Game.sfx('rustle', e.tuft.x, 0.6); }
      else if (d < 22 && (mk.sneak || !mk.moving)) {
        e.gone = 1;
        const who = ['Zigzagoon', 'Seedot', 'Kecleon', 'Wynaut', 'a tiny Shroomish'][e.i % 5];
        FX.sparkles(e.tuft.x, World.groundAt(e.tuft.x) - 8, 8, 16); Game.sfx('twinkle', e.tuft.x);
        HUD.toast('Peekaboo! It was ' + who + ' hiding in the grass. It left you a star piece.', { life: 3 });
        Save.addItem('stardust', 1);
        if (Save.discover('peek.' + Game.areaId + '.' + e.i)) Save.addPoints(80);
      }
    }
    // ambient motes and far-away flocks
    updateMotes(dt, t);
    updateFlocks(dt);
  }
  function* raid(m, p) {
    m.emote('bulb', 0.9);
    yield* m.walkTo(p.x + (m.x < p.x ? -10 : 10), (m.speed || 45) * 1.2);
    let e = 0;
    while (e < 1.6 && p.ripe > 0) { const dt = yield; e += dt; m.o.mouth = Math.sin(e * 16) > 0 ? 1 : 0.2; m.o.eyes = 'happy'; m.setAct(m.act.id, 0.7); if (e > 0.5 && e - dt <= 0.5) { p.ripe--; Game.sfx('munch', p.x, 0.7); FX.poof(p.x, p.y - 6, 0xffffffff, C((BERRY[p.berry] || BERRY.oran).mat, 0.6), 3, 2); } if (e > 1.1 && e - dt <= 1.1 && p.ripe > 0) { p.ripe--; Game.sfx('munch', p.x, 0.7); } }
    m.emote('heart', 1.2);
    if (Talk && Game.mudkip && Math.abs(Game.mudkip.x - m.x) < 300) Talk.bubble(() => m.headPt(), pick2(['Nom nom!', 'Yum!', '*munch*']), { life: 1.4, who: m });
  }
  const pick2 = (a) => a[(Math.random() * a.length) | 0];
  function popBerry(tf) {
    const x = tf.x, y = World.groundAt(x) - 6;
    H.items.push({ kind: 'berry', berry: pick2((PLANTS[H.area] || ['oran'])), x: x + (Math.random() - 0.5) * 10, y: y + 5, t: 0, taken: 0, ph: 0, hop: 1, extra: true });
    FX.poof(x, y + 4, 0xffe0f0d0, 0xffa0c090, 4, 3);
    HUD.toast('A berry fell out of the grass!', { life: 1.6 });
  }

  /* ---------- motes: pollen, leaves, fireflies, cave dust, plankton, fish ---------- */
  function updateMotes(dt, t) {
    const st = STYLE[H.area] || STYLE.forest, hr = Game.hour(), night = hr === 'night' || hr === 'dusk';
    const want = Game.lowFx ? 14 : 34;
    const cx = Game.cam.x, cy = Game.cam.y, VW = Game.VW, VH = Game.VH;
    while (H.motes.length < want) {
      const x = cx + Math.random() * VW, y = cy + Math.random() * VH;
      const lvl = World.waterAt(x), under = lvl !== null && y > lvl + 4;
      let kind = under ? 'plankton' : night && st.motes !== 'dust' ? 'firefly' : st.motes;
      if (!under && Weather.W && Weather.W.rain > 0.4) kind = 'drip';
      H.motes.push({ kind, x, y, vx: 0, vy: 0, t: 0, life: 4 + Math.random() * 6, ph: Math.random() * 6, c: Math.random() });
    }
    const wind = typeof Wind !== 'undefined' ? Wind.v : 0.4;
    for (const m of H.motes) {
      m.t += dt;
      if (m.kind === 'pollen') { m.vx = 6 + wind * 18 + Math.sin(m.t * 1.3 + m.ph) * 6; m.vy = Math.sin(m.t * 0.9 + m.ph) * 4 - 1; }
      else if (m.kind === 'leaves') { m.vx = 8 + wind * 22 + Math.sin(m.t * 2 + m.ph) * 10; m.vy = 10 + Math.sin(m.t * 3 + m.ph) * 6; }
      else if (m.kind === 'firefly') { m.vx = Math.sin(m.t * 0.8 + m.ph) * 10; m.vy = Math.cos(m.t * 0.6 + m.ph * 2) * 7; }
      else if (m.kind === 'dust') { m.vx = Math.sin(m.t * 0.3 + m.ph) * 3; m.vy = 1.5; }
      else if (m.kind === 'plankton') { m.vx = Math.sin(m.t * 0.5 + m.ph) * 3; m.vy = -2 + Math.sin(m.t + m.ph) * 2; }
      else if (m.kind === 'drip') { m.vx = 0; m.vy = 0; }
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.x < cx - 30 || m.x > cx + VW + 30 || m.y < cy - 30 || m.y > cy + VH + 30) m.t = m.life;
    }
    H.motes = H.motes.filter((m) => m.t < m.life);
    // a little school of fish crossing the water now and then
    if (st.under && H.fish.length < 2 && Math.random() < dt * 0.15) {
      const dir = Math.random() < 0.5 ? 1 : -1, x = dir > 0 ? cx - 40 : cx + VW + 40, y = cy + VH * (0.3 + Math.random() * 0.6);
      const lvl = World.waterAt(x);
      if (lvl !== null && y > lvl + 20 && y < World.groundAt(x) - 20) { const n = 5 + (Math.random() * 7 | 0), f = []; for (let i = 0; i < n; i++) f.push({ dx: -i * 5 * dir + (Math.random() - 0.5) * 6, dy: (Math.random() - 0.5) * 10, ph: Math.random() * 6 }); H.fish.push({ x, y, dir, f, t: 0, col: Math.random() < 0.5 ? 0xff58c8f0 : 0xff70a0ff }); }
    }
    for (const s of H.fish) { s.t += dt; s.x += s.dir * 34 * dt; s.y += Math.sin(s.t * 1.4) * 6 * dt; if (Math.abs(s.x - (cx + VW / 2)) > VW) s.dead = true; if (Game.mudkip && Math.hypot(Game.mudkip.x - s.x, Game.mudkip.y - s.y) < 40) { s.dir = Math.sign(s.x - Game.mudkip.x) || s.dir; s.y += (s.y > Game.mudkip.y ? 1 : -1) * 40 * dt; } }
    H.fish = H.fish.filter((s) => !s.dead);
  }

  /* ---------- Pokémon far away in the sky: flocks crossing behind the lane ---------- */
  const FLOCK = { beach: { c: [0xffffffff, 0xff8a8e98], n: [3, 7], name: 'wingull' }, forest: { c: [0xff5a3a26, 0xff2a2a3a], n: [4, 9], name: 'taillow' }, canopy: { c: [0xfffae8d8, 0xffe0c8b8], n: [2, 5], name: 'swablu', puff: true } };
  H.flocks = [];
  function updateFlocks(dt) {
    const F = FLOCK[H.area]; if (!F) return;
    if (H.flocks.length < 2 && Math.random() < dt * 0.08) {
      const dir = Math.random() < 0.5 ? 1 : -1, p = 0.3 + Math.random() * 0.15, cx = Game.cam.x;
      const n = F.n[0] + ((Math.random() * (F.n[1] - F.n[0] + 1)) | 0), birds = [];
      for (let i = 0; i < n; i++) { const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; birds.push({ dx: -row * 7 * dir, dy: i ? side * row * 4 : 0, ph: Math.random() * 6 }); }
      const hz = World.HORIZON || 300;
      H.flocks.push({ lx: cx * p + (dir > 0 ? -40 : Game.VW + 40), y: Math.min(hz - 30, Game.cam.y + Game.VH * 0.25) - Math.random() * 40, dir, p, v: 18 + Math.random() * 14, birds, t: 0, F });
    }
    for (const f of H.flocks) { f.t += dt; f.lx += f.dir * f.v * dt; f.y += Math.sin(f.t * 0.5) * 2 * dt; const X = f.lx - Game.cam.x * f.p; if (X < -120 || X > Game.VW + 120) f.dead = f.t > 2; }
    H.flocks = H.flocks.filter((f) => !f.dead);
  }
  function drawFar(fb, cx, cy, t) {
    if (!Game.area || H.area !== Game.areaId) return;
    const hr = Game.hour(), dusk = hr === 'dusk' || hr === 'night';
    for (const f of H.flocks) {
      const X0 = f.lx - cx * f.p, Y0 = f.y - cy;
      for (const b of f.birds) {
        const X = Math.round(X0 + b.dx), Y = Math.round(Y0 + b.dy + Math.sin(f.t * 2 + b.ph) * 1.5);
        if (X < -4 || Y < -4 || X >= fb.w + 4 || Y >= fb.h + 4) continue;
        const c = dusk ? 0xff201822 : f.F.c[0], c2 = dusk ? 0xff201822 : f.F.c[1];
        if (f.F.puff) { for (let yy = -1; yy <= 1; yy++) for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy * 3 <= 5) put(fb, X + xx, Y + yy, c); put(fb, X + f.dir * 3, Y, 0xffd8a060); continue; }
        const up = Math.sin(f.t * 9 + b.ph) > 0;
        put(fb, X, Y, c); put(fb, X - 1, Y + (up ? -1 : 1), c); put(fb, X + 1, Y + (up ? -1 : 1), c); put(fb, X - 2, Y + (up ? -2 : 1), c2); put(fb, X + 2, Y + (up ? -2 : 1), c2);
      }
    }
  }

  /* ---------- drawing ---------- */
  const DIRT = U.hex('#3a2a1a');
  const put = (fb, x, y, c) => { if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) fb.d[y * fb.w + x] = c; };
  const putO = (fb, x, y, c, occ, v) => { if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) { const i = y * fb.w + x; fb.d[i] = c; if (occ) occ[i] = v; } };
  const blend = (fb, x, y, c, a) => { if (x >= 0 && y >= 0 && x < fb.w && y < fb.h) { const i = y * fb.w + x; fb.d[i] = U.mix(fb.d[i], c, a); } };
  const glow = (fb, x, y, c, r, a) => { for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const d = Math.hypot(xx, yy); if (d > r) continue; const X = x + xx, Y = y + yy; if (X < 0 || Y < 0 || X >= fb.w || Y >= fb.h) continue; const i = Y * fb.w + X; fb.d[i] = U.screen(fb.d[i], c, a * (1 - d / r)); } };
  function first(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].x < x) lo = m + 1; else hi = m; } return lo; }
  // items lying on the ground (drawn before the water so seabed ones get the water tint)
  function draw(fb, cx, cy, t) {
    if (!Game.area || H.area !== Game.areaId) return;
    palette();
    const occ = Stage.S.occ, hr = Game.hour();
    for (const sp of H.spots) {
      if (sp.found) continue;
      const X = Math.round(sp.x - cx), Y = Math.round(World.groundAt(sp.x) - cy);
      if (X < -10 || X > fb.w + 10 || Y < -10 || Y > fb.h + 10) continue;
      // a patch of disturbed earth with a glint that comes and goes
      for (let i = -4; i <= 4; i++) blend(fb, X + i, Y + (i & 1), DIRT, 0.25);
      const k = (Math.sin(t * 2.2 + sp.ph) + 1) / 2, big = sp.kind === 'quest';
      if (k > 0.7 || big) { const s = big ? 2 : 1; put(fb, X, Y - 2, 0xffffffff); for (let j = 1; j <= s; j++) { put(fb, X - j, Y - 2, 0xfffff4a0); put(fb, X + j, Y - 2, 0xfffff4a0); put(fb, X, Y - 2 - j, 0xfffff4a0); put(fb, X, Y - 2 + j, 0xfffff4a0); } }
    }
    for (const it of H.items) {
      if (it.taken) continue;
      const bob = it.kind === 'tm' ? Math.sin(t * 2.4) * 2 : 0, hop = it.hop ? -Math.sin((1 - it.hop) * Math.PI) * 10 : 0;
      const X = Math.round(it.x - cx), Y = Math.round(it.y - cy + bob + hop);
      if (X < -12 || X > fb.w + 12 || Y < -20 || Y > fb.h + 12) continue;
      drawItem(fb, it, X, Y, t, occ, hr);
    }
  }
  function drawItem(fb, it, X, Y, t, occ, hr) {
    const o = it.under ? 1 : 2;
    switch (it.kind) {
      case 'plant': {
        // a leafy berry bush with its ripe berries
        const bm = (BERRY[it.berry] || BERRY.oran).mat, sw = Math.sin(t * 1.5 + it.ph) * 0.6;
        for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.33, L = 6 + (k % 3) * 2; for (let j = 0; j < L; j++) { const q = j / L; putO(fb, Math.round(X + Math.cos(a) * j * 0.9 + sw * q), Math.round(Y + Math.sin(a) * j), C('stem', 0.25 + q * 0.7), occ, o); } }
        for (let k = 0; k < 7; k++) { const lx = X + Math.round(Math.cos(k * 0.9) * 5 + sw), ly = Y - 4 - ((k * 3) % 6); putO(fb, lx, ly, C('leafB', 0.6), occ, o); putO(fb, lx + 1, ly, C('leafB', 1), occ, o); putO(fb, lx, ly + 1, C('leafB', 0.2), occ, o); }
        const spots = [[-4, -6], [3, -8], [0, -11]];
        for (let n = 0; n < it.ripe; n++) { const [bx, by] = spots[n]; for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) putO(fb, X + bx + xx + Math.round(sw), Y + by + yy, C(bm, xx + yy < 0 ? 0.9 : 0.4), occ, o); put(fb, X + bx - 1 + Math.round(sw), Y + by - 1, 0xffffffff); }
        break;
      }
      case 'berry': {
        const b = (BERRY[it.berry || 'oran'] || BERRY.oran).mat;
        for (let y = -3; y <= 0; y++) for (let x = -2; x <= 2; x++) { if (x * x + (y + 1.5) * (y + 1.5) > 5.5) continue; putO(fb, X + x, Y + y, C(b, x + y < -2 ? 1 : x + y < 0 ? 0.66 : 0.33), occ, o); }
        putO(fb, X - 1, Y - 3, C(b, 1), occ, o); putO(fb, X, Y - 4, C('leafB', 0.5), occ, o); putO(fb, X + 1, Y - 5, C('leafB', 1), occ, o);
        break;
      }
      case 'shell': {
        const m = ['..a..', '.aba.', 'abcba', 'bcdcb'];
        for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) { const ch = m[y][x]; if (ch === '.') continue; putO(fb, X - 2 + x, Y - 3 + y, C('shell', { a: 1, b: 0.66, c: 0.4, d: 0 }[ch]), occ, o); }
        break;
      }
      case 'pearl': case 'qpearl': {
        for (let y = -2; y <= 0; y++) for (let x = -1; x <= 1; x++) putO(fb, X + x, Y + y, C('pearl', x + y < -1 ? 1 : 0.5), occ, o);
        if (Math.sin(t * 3 + it.x) > 0.6 || it.kind === 'qpearl') { put(fb, X - 1, Y - 2, 0xffffffff); glow(fb, X, Y - 1, 0xffffe8f8, it.kind === 'qpearl' ? 7 : 4, 0.35); }
        break;
      }
      case 'shroom': case 'shroomG': {
        const cap = it.kind === 'shroomG' ? 'shroomG' : 'shroomR';
        putO(fb, X, Y, C('stalk', 0.5), occ, o); putO(fb, X, Y - 1, C('stalk', 1), occ, o);
        for (let x = -2; x <= 2; x++) putO(fb, X + x, Y - 2, C(cap, 0.4), occ, o);
        for (let x = -1; x <= 1; x++) putO(fb, X + x, Y - 3, C(cap, 0.8), occ, o);
        if (it.kind === 'shroom') { putO(fb, X - 1, Y - 3, 0xffffffff, occ, o); putO(fb, X + 1, Y - 2, 0xffffffff, occ, o); }
        else glow(fb, X, Y - 2, C(cap, 1), 5, hr === 'night' ? 0.5 : 0.25);
        break;
      }
      case 'gem': {
        const g = ['gemB', 'gemP', 'gemG', 'gemY'][Math.floor(it.x) % 4];
        const m = ['..a..', '.aab.', 'abbcc', '.bcc.', '..c..'];
        for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const ch = m[y][x]; if (ch === '.') continue; putO(fb, X - 2 + x, Y - 5 + y, C(g, { a: 1, b: 0.66, c: 0.33 }[ch]), occ, o); }
        if (Math.sin(t * 2.6 + it.x) > 0.5) { put(fb, X - 1, Y - 5, 0xffffffff); glow(fb, X, Y - 3, C(g, 0.9), 5, 0.3); }
        break;
      }
      case 'starp': {
        const c1 = C('starp', 0.9), c0 = C('starp', 0.5);
        putO(fb, X, Y - 4, c1, occ, o); putO(fb, X - 1, Y - 3, c1, occ, o); putO(fb, X, Y - 3, 0xffffffff, occ, o); putO(fb, X + 1, Y - 3, c1, occ, o);
        putO(fb, X - 2, Y - 2, c0, occ, o); putO(fb, X - 1, Y - 2, c1, occ, o); putO(fb, X, Y - 2, c1, occ, o); putO(fb, X + 1, Y - 2, c1, occ, o); putO(fb, X + 2, Y - 2, c0, occ, o);
        putO(fb, X - 1, Y - 1, c0, occ, o); putO(fb, X + 1, Y - 1, c0, occ, o);
        glow(fb, X, Y - 3, C('starp', 1), 5, 0.25 + 0.15 * Math.sin(t * 3));
        break;
      }
      case 'tm': {
        // a spinning TM disc under a beacon of light, with orbiting sparkles
        const col = Moves.DEF[it.tm] ? Moves.DEF[it.tm].col : 0xffffffff;
        for (let y = -46; y < 0; y++) { const a = 0.22 * (1 + y / 46) * (0.75 + 0.25 * Math.sin(t * 4 + y * 0.3)); for (let x = -3; x <= 3; x++) { const X2 = X + x, Y2 = Y + y; if (X2 < 0 || Y2 < 0 || X2 >= fb.w || Y2 >= fb.h) continue; const i2 = Y2 * fb.w + X2; fb.d[i2] = U.screen(fb.d[i2], col, a * (1 - Math.abs(x) / 4)); } }
        for (let k = 0; k < 3; k++) { const an = t * 2.2 + k * 2.1; put(fb, Math.round(X + Math.cos(an) * 11), Math.round(Y + Math.sin(an) * 4), 0xffffffff); }
        glow(fb, X, Y, col, 14, 0.4 + 0.12 * Math.sin(t * 3));
        const w = Math.max(1, Math.abs(Math.cos(t * 2.2)) * 7);
        for (let y = -7; y <= 7; y++) for (let x = -8; x <= 8; x++) {
          const u = x / w, v = y / 7, d = u * u + v * v; if (d > 1) continue;
          const c = d > 0.72 ? 0xff1b2240 : d < 0.08 ? 0xff1b2240 : d < 0.18 ? 0xffe8ecf8 : U.tweak(col, 0, 1, u < 0 ? 0.12 : -0.06);
          putO(fb, X + x, Y + y, c, occ, o);
        }
        if (Math.sin(t * 5) > 0.3) put(fb, X - 1, Y - 4, 0xffffffff);
        break;
      }
    }
  }
  // seabed life in front of everything under the water (the water pass tints it)
  function drawUnder(fb, cx, cy, t) {
    if (!Game.area || H.area !== Game.areaId || !H.under.length) return;
    palette();
    const occ = Stage.S.occ;
    const wind = Math.sin(t * 0.8);
    for (let i = first(H.under, cx - 40); i < H.under.length; i++) {
      const u = H.under[i]; if (u.x > cx + fb.w + 40) break;
      const g = World.groundAt(u.x), X = Math.round(u.x - cx), Y = Math.round(g - cy + 3);
      if (Y < -80 || Y > fb.h + 90) continue;
      if (u.kind === 'kelp') {
        for (let s = 0; s < u.n; s++) {
          let px = X + s * 3, py = Y;
          const L = Math.round(u.h * (s ? 0.7 : 1));
          for (let k = 0; k < L; k++) {
            const q = k / L, sway = Math.sin(t * 1.2 + u.ph + k * 0.12 + s) * 5 * q * q + wind * 2 * q;
            const x = Math.round(px + sway), y = py - k;
            const c = C(u.col, 0.15 + q * 0.75 + (k % 7 === 0 ? 0.15 : 0));
            putO(fb, x, y, c, occ, 1); putO(fb, x + 1, y, C(u.col, 0.1 + q * 0.5), occ, 1);
            if (k % 6 === 3) { const lx = x + (k % 12 < 6 ? 2 : -2); putO(fb, lx, y, C(u.col, 0.6 + q * 0.3), occ, 1); putO(fb, lx + (k % 12 < 6 ? 1 : -1), y - 1, C(u.col, 0.8), occ, 1); }
          }
        }
      } else if (u.kind === 'fan') {
        // sea fan: a branching lattice, gently waving
        const R = u.r, sw = Math.sin(t * 0.9 + u.ph) * 0.12;
        for (let a = -1.25; a <= 1.25; a += 0.18) for (let r = 2; r < R; r++) {
          const aa = a + sw * (r / R), x = Math.round(X + Math.sin(aa) * r), y = Math.round(Y - 1 - Math.cos(aa) * r * 1.1);
          if ((r + Math.round(a * 10)) % 3 === 0 || r > R - 2) putO(fb, x, y, C(u.col, 0.3 + (r / R) * 0.7), occ, 1);
        }
        putO(fb, X, Y - 1, C(u.col, 0.1), occ, 1);
      } else if (u.kind === 'tube') {
        for (let s = 0; s < u.n; s++) {
          const x0 = X + s * 3 - u.n, h = Math.round(u.h * (0.6 + ((s * 37) % 10) / 25));
          for (let y = 0; y < h; y++) { putO(fb, x0, Y - y, C(u.col, 0.25), occ, 1); putO(fb, x0 + 1, Y - y, C(u.col, 0.6), occ, 1); }
          putO(fb, x0, Y - h, C(u.col, 1), occ, 1); putO(fb, x0 + 1, Y - h, C(u.col, 0.1), occ, 1);
        }
      } else if (u.kind === 'anem') {
        for (let k = -u.r; k <= u.r; k++) {
          const L = Math.round(u.r * 1.4 - Math.abs(k) * 0.4);
          for (let j = 0; j < L; j++) { const q = j / L; putO(fb, Math.round(X + k + Math.sin(t * 2 + u.ph + k) * 2 * q), Y - j, C('anem', 0.2 + q * 0.8), occ, 1); }
        }
      } else if (u.kind === 'rock') {
        rockAt(fb, X, Y, u.w, u.h, u.col, occ, 1, u.x);
      }
    }
  }
  function rockAt(fb, X, Y, w, h, col, occ, o, seed) {
    for (let y = 0; y < h; y++) {
      const hw = Math.round((w / 2) * Math.sqrt(1 - Math.pow(y / h, 2)));
      for (let x = -hw; x <= hw; x++) {
        const lit = (-x / Math.max(1, hw)) * 0.5 + (y / h) * 0.6 + (U.hash(Math.round(seed) + x, y, 3) - 0.5) * 0.25;
        const edge = x === -hw || x === hw || y === h - 1;
        putO(fb, X + x, Y - y, edge ? C(col, 0.05) : C(col, clamp(0.25 + lit * 0.7, 0, 1)), occ, o);
      }
    }
  }
  // land foreground (drawn over the lane, in front of Mudkip's feet) + motes
  function drawFore(fb, cx, cy, t) {
    if (!Game.area || H.area !== Game.areaId) return;
    palette();
    const wind = typeof Wind !== 'undefined' ? Wind.v : 0.4, hr = Game.hour();
    for (let i = first(H.tufts, cx - 30); i < H.tufts.length; i++) {
      const tf = H.tufts[i]; if (tf.x > cx + fb.w + 30) break;
      const g = World.groundAt(tf.x), X = Math.round(tf.x - cx), Y = Math.round(g - cy + (tf.zd || 0));
      if (Y < -30 || Y > fb.h + 30) continue;
      if (tf.kind === 'grass' || tf.kind === 'reed') {
        const reed = tf.kind === 'reed', ramp = reed ? 'reed' : tf.ramp;
        const sway0 = Math.sin(t * (1.6 + wind) + tf.ph + tf.x * 0.05) * (0.18 + wind * 0.3) + wind * 0.25;
        const push = tf.push ? tf.push * (tf.pushDir || 1) * 0.9 : 0;
        for (let b = 0; b < tf.n; b++) {
          const bx = X + b * 2 - tf.n, L = Math.round(tf.h * (0.55 + ((b * 7 + Math.round(tf.x)) % 5) / 9)), lean = ((b * 13 + Math.round(tf.x)) % 7 - 3) * 0.08;
          let px = bx, py = Y;
          for (let k = 0; k < L; k++) {
            const q = k / L, a = -Math.PI / 2 + (lean + sway0 + push) * q * 1.4;
            px += Math.cos(a) * 1.0; py += Math.sin(a) * 1.0;
            put(fb, Math.round(px), Math.round(py), C(ramp, 0.12 + q * 0.85));
          }
          if (reed && b === 1) { const x = Math.round(px), y = Math.round(py); for (let k = 0; k < 4; k++) { put(fb, x, y + k, C('cat', k ? 0.5 : 1)); put(fb, x + 1, y + k, C('cat', 0)); } }
          if (tf.flower && b === (tf.n >> 1)) { const x = Math.round(px), y = Math.round(py); put(fb, x, y, C(tf.flower, 1)); put(fb, x - 1, y, C(tf.flower, 0.6)); put(fb, x + 1, y, C(tf.flower, 0.6)); put(fb, x, y - 1, C(tf.flower, 0.6)); put(fb, x, y + 1, C(tf.flower, 0.4)); put(fb, x, y, C('flY', 1)); }
        }
      } else if (tf.kind === 'pebble') {
        for (let x = 0; x < tf.w; x++) for (let y = 0; y < tf.h; y++) put(fb, X + x, Y - y, C(tf.col, y === tf.h - 1 ? 0.8 : x === 0 ? 0.3 : 0.55));
      } else if (tf.kind === 'rock') {
        rockAt(fb, X, Y, tf.w, tf.h, tf.col, null, 0, tf.seed);
        // a tuft of moss on top
        for (let x = -2; x <= 2; x++) put(fb, X + x - 1, Y - tf.h, C('g1', 0.5 + (x & 1) * 0.3));
      } else if (tf.kind === 'shroom') {
        const s = Math.round(tf.s);
        for (let y = 0; y < s; y++) put(fb, X, Y - y, C('stalk', 0.6));
        for (let x = -s; x <= s; x++) put(fb, X + x, Y - s, C(tf.col, 0.4));
        for (let x = -s + 1; x <= s - 1; x++) put(fb, X + x, Y - s - 1, C(tf.col, 0.8));
        if (tf.col === 'shroomR') { put(fb, X - 1, Y - s - 1, 0xffffffff); put(fb, X + s - 1, Y - s, 0xffffffff); }
      } else if (tf.kind === 'crystal') {
        const h = Math.round(tf.h);
        for (let k = 0; k < h; k++) { const x = Math.round(X + tf.lean * k); put(fb, x, Y - k, C(tf.col, 0.4 + (k / h) * 0.5)); put(fb, x + 1, Y - k, C(tf.col, 0.2 + (k / h) * 0.4)); if (k < h * 0.6) put(fb, x - 1, Y - k, C(tf.col, 0.7)); }
        if (Math.sin(t * 2 + tf.x) > 0.7) glow(fb, Math.round(X + tf.lean * h), Y - h, C(tf.col, 1), 4, 0.4);
      }
    }
    // eyes blinking in the tall grass
    for (const e of H.eyes) {
      if (e.gone || e.blink < 0) continue;
      const X = Math.round(e.tuft.x - cx), Y = Math.round(World.groundAt(e.tuft.x) - cy + (e.tuft.zd || 0) - 6);
      if (X < -5 || X > fb.w + 5 || Y < -5 || Y > fb.h + 5) continue;
      const c = hr === 'night' || hr === 'dusk' ? 0xffc0fff0 : 0xffffffff;
      put(fb, X - 2, Y, c); put(fb, X + 2, Y, c); put(fb, X - 2, Y + 1, 0xff10121c); put(fb, X + 2, Y + 1, 0xff10121c);
    }
    // motes
    for (const m of H.motes) {
      const X = Math.round(m.x - cx), Y = Math.round(m.y - cy);
      if (X < 0 || Y < 0 || X >= fb.w || Y >= fb.h) continue;
      const k = Math.min(1, m.t / 0.6, (m.life - m.t) / 0.8);
      if (m.kind === 'pollen') blend(fb, X, Y, 0xffd8f8ff, 0.7 * k);
      else if (m.kind === 'leaves') { const c = m.c < 0.5 ? 0xff3aa05a : 0xff2a88c8; const f = Math.sin(m.t * 6 + m.ph) > 0; blend(fb, X, Y, c, k); blend(fb, X + (f ? 1 : 0), Y + (f ? 0 : 1), c, k * 0.8); }
      else if (m.kind === 'firefly') { const p = (Math.sin(m.t * 3 + m.ph) + 1) / 2; if (p > 0.3) glow(fb, X, Y, 0xff60ffd8, 3, 0.55 * p * k); put(fb, X, Y, 0xffc0ffe8); }
      else if (m.kind === 'dust') blend(fb, X, Y, 0xffffe8d0, 0.45 * k);
      else if (m.kind === 'plankton') blend(fb, X, Y, 0xfff0fff0, 0.5 * k);
    }
    // fish schools
    for (const s of H.fish) for (const f of s.f) {
      const X = Math.round(s.x + f.dx - cx), Y = Math.round(s.y + f.dy + Math.sin(s.t * 3 + f.ph) * 1.5 - cy);
      if (X < 1 || Y < 1 || X >= fb.w - 2 || Y >= fb.h - 1) continue;
      blend(fb, X, Y, s.col, 0.75); blend(fb, X - s.dir, Y, s.col, 0.6); blend(fb, X - 2 * s.dir, Y + (Math.sin(s.t * 12 + f.ph) > 0 ? 1 : -1), s.col, 0.45); put(fb, X + s.dir, Y, 0xffffffff);
    }
  }
    // "E" prompt over the thing Mudkip can pick up (tap it on touch screens)
  function drawPrompt(fb, t) {
    const it = H.near; if (!it || Game.mode !== 'explore') return;
    const [x, y] = Talk.toUI(it.x, it.y - (it.kind === 'plant' ? 16 : 10));
    const X = Math.round(x), Y = Math.round(y) - 6 + Math.round(Math.sin(t * 5) * 1.5);
    const name = it.kind === 'plant' ? (BERRY[it.berry] || BERRY.oran).name : it.kind === 'berry' ? (BERRY[it.berry || 'oran'] || BERRY.oran).name : it.kind === 'tm' ? 'TM disc' : it.kind === 'qpearl' ? 'Lost pearl' : (ITEM[it.kind] ? ITEM[it.kind].name : '');
    const touch = typeof Pad !== 'undefined' && Pad.touch;
    UI.disc(fb, X, Y + 1, 7, 0xff0a0e1a); UI.disc(fb, X, Y, 7, 0xff1b2240); UI.disc(fb, X, Y, 6, 0xffffffff);
    Font.draw(fb, touch ? '!' : 'E', X, Y - 4, 0xff1b2240, { font: 'small', align: 'center' });
    Font.draw(fb, (touch ? 'Tap: ' : '') + 'pick up ' + name, X, Y + 9, 0xffffffff, { font: 'small', align: 'center', outline: 0xff1b2240 });
    HUD.btn('pickup', X - 40, Y - 10, 80, 30, () => pick());
  }
  return Object.assign(H, { drawPrompt, pick, nearest, popIcon, reset, draw, drawUnder, drawFore, drawFar, update, dig, pound, questSpots, TMS });
})();
