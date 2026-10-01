/* ------------------------------------------------------------------
   Dex — the Rotom Dex, drawn after the reference art: a chunky red
   pixel device (thick rounded frame with darker segments and rivets, a
   big lightning-bolt antenna rising from the top centre, grey side
   clips, a pointed tail with a round Home button) with Rotom living in
   it: big eyes on a dark bridge sitting ON the top frame, and a cyan
   face with a toothy grin hanging from the top of a periwinkle screen.
   The device keeps the reference's proportions, is centred and scaled
   to fit the canvas (crisp integer pixels); the page title / back
   button sit to its left, Rotom's speech bubble and the close button to
   its right (above / below it on portrait screens).
     · Main page: the Pokédex — species list with sprites, seen/caught,
       a detail card and full entries (a photo per star tier,
       behaviour clues, objectives).
     · Home (the tail button / H): the app grid of the reference (two
       2x2 groups, the ◀ ═══ ▶ page bar between the rows) — Pokédex,
       Encyclopedia, Quests, Progress, Map, Photos, Mail, Settings,
       Style, Shop, Secrets, TMs, Day/Night, Rotom Chat, Help, Bag.
   Touch, mouse (hover, wheel, drag, swipe) and keyboard. Phones draw at
   2x so the text stays readable.
------------------------------------------------------------------- */
const Dex = (() => {
  const { clamp, lerp, hex, mix } = U;
  const INK = 0xff40221b;
  const qs = new URLSearchParams(location.search);
  const D = {
    isOpen: false, t: 0, closing: 0, page: 'dex', prev: null, trans: 1, dir: 1,
    sel: null, star: 0, scroll: {}, btns: [], press: null, keyAng: 0, keyV: 0,
    thumbs: new Map(), imgs: new Map(), confirm: null, album: 0, styleSlot: 'hat', mudYaw: 1.1,
    s: 1, G: null, mouse: null, mouseT: -9, hoverId: null, faceK: 0, lookAt: null, line: null, idleT: 8,
    face: { lx: 0, ly: 0, blinkT: 0, nextBlink: 2, mood: 'norm', moodT: 0, talk: 0, pop: 1, zaps: [], zapT: 1, wx: 0, wy: 0, wanderT: 0, spark: 0 },
    home: { pg: 0, sel: 0, slide: 0 }, bounce: {}, shake: 0, zoom: null, filter: 'all', lsel: {}, tab: {}, after: null, ensure: null, chat: [], mailC: null,
  };
  // the Rotom screen of the reference: soft periwinkle glass with faint dots, navy ink, Rotom's cyan face
  const P = {
    scr: hex('#7ca0d2'), scrHi: hex('#9dbdea'), scrB: hex('#7284ce'), dot: hex('#6c7fcc'), mv: hex('#a0556b'), mvD: hex('#6a3c64'), mvS: hex('#784d74'),
    scrL: hex('#b4cbef'), scrLL: hex('#cddcf6'), card: hex('#e9f0ff'), white: hex('#f8faff'), scrD: hex('#6282c4'), scrDD: hex('#3f5aa8'), rim: hex('#1f2a66'), off: hex('#161a3c'),
    text: hex('#131a44'), dim: hex('#34427e'), faint: hex('#5a68a0'),
    face: hex('#7afcfe'), faceL: hex('#c8feff'), faceD: hex('#78d6f0'), faceDD: hex('#5ca9d6'), faceO: hex('#2b44bc'), eye: hex('#1f1e24'), lid: hex('#3a3858'), mouth: hex('#27103a'), tongue: hex('#ff6f93'),
    red: hex('#e8323a'), redD: hex('#a41f2e'), gold: hex('#ffc83a'), goldD: hex('#c07a10'), green: hex('#2fb463'), blue: hex('#3a7ae8'), grey: hex('#8a90a8'),
    clip: hex('#b9c0cd'), clipL: hex('#eef1f5'), clipD: hex('#737b90'),
    icoSh: hex('#5a78c4'), icoRing: hex('#5b95d8'), bar: hex('#84b8f0'), barL: hex('#b4dcfa'), barD: hex('#6aa0e2'), barO: hex('#4f86d4'), barOff: hex('#8aa8dc'), barOffO: hex('#7596d0'),
  };
  // the classic red frame, sampled from the reference art
  const FR_CLASSIC = { b: hex('#bc3110'), l: hex('#da3709'), hi: hex('#fc2221'), spec: hex('#ff7a5c'), d1: hex('#b1351d'), sh: hex('#ad3621'), dd: hex('#a20e0e'), ink: hex('#4e0406'), ink2: hex('#740e10'), mv: hex('#a0556b'), mvD: hex('#6a3c64'), mvS: hex('#784d74') };
  const frCache = {};
  // the skin handed to the older page drawers (they read screen / screenText / accent / ink / btn)
  function pageSkin(S) {
    if (D.SP && D.SP.src === S) return D.SP;
    return (D.SP = Object.assign({}, S, { src: S, screen: P.scrL, screenD: P.scrD, screenText: P.text, accent: S.id === 'skin.classic' || S.dark ? P.red : S.accent, ink: P.rim, btn: hex('#3a4290'), trim: P.white }));
  }
  const RANKS = [[0, 'Rookie'], [2000, 'Novice'], [6000, 'Pro'], [15000, 'Expert'], [30000, 'Master'], [60000, 'Legend']];
  const rank = () => { let r = RANKS[0][1]; for (const [n, name] of RANKS) if (Save.data.points >= n) r = name; return r; };
  const hasP = () => typeof Progress !== 'undefined';
  const locked = (id) => hasP() && Progress.hudOk && !Progress.hudOk(id);

  /* ---------- apps (home screen, 8 per page) ---------- */
  const APPS = [
    { id: 'chat', name: 'Chat', col: '#5c6af0' },
    { id: 'shop', name: 'Shop', col: '#e8ac4c' },
    { id: 'help', name: 'Help', col: '#6ccf78' },
    { id: 'mail', name: 'Mail', col: '#b4daf4' },
    { id: 'prog', name: 'Progress', col: '#34343c' },
    { id: 'time', name: 'Day/Night', col: '#2c3c7c' },
    { id: 'tms', name: 'TMs', col: '#c4def6' },
    { id: 'dex', name: 'Pokédex', col: '#4c8ce8' },
    { id: 'ency', name: 'Encyclopedia', col: '#35ad63' },
    { id: 'quests', name: 'Quests', col: '#f09a30' },
    { id: 'map', name: 'Map', col: '#2f9fdc', launch: () => WorldMap.open() },
    { id: 'album', name: 'Photos', col: '#f36fa8' },
    { id: 'settings', name: 'Settings', col: '#67728c' },
    { id: 'style', name: 'Style', col: '#e2589a' },
    { id: 'disc', name: 'Secrets', col: '#4b47bd' },
    { id: 'bag', name: 'Bag', col: '#b8742e', launch: () => Bag.open(), feat: 'bag' },
    { id: 'music', name: 'Guitar', col: '#e0506a', launch: () => Rhythm.open(0), feat: 'music' },
    { id: 'games', name: 'Playground', col: '#f0b030', launch: () => Arcade.open(), feat: 'games' },
    { id: 'sound', name: 'Sound', col: '#4a9a8a', toggle: () => { const v = Sound.set(!Sound.on); U.store.set('mk-snap-sound', v); Music.onSound(v); say(v ? 'Sound on! Bzzt!' : 'Shh... Rotom is quiet now.', { mood: v ? 'happy' : 'norm' }); } },
  ];
  // feature unlocks (progress.js): a locked app is greyed out with the level that opens it
  const FEAT = { map: 'map', style: 'style', time: 'time', tms: 'wheel', bag: 'bag', music: 'music', games: 'games' };
  const featLv = (id) => { if (!hasP() || !FEAT[id]) return 0; if (Progress.has(FEAT[id])) return 0; const f = Progress.FEATS.find((q) => q.id === FEAT[id]); return f ? f.lv : 0; };
  for (const a0 of APPS) a0.lock = () => featLv(a0.id) > 0;
  for (const a of APPS) a.c = hex(a.col);
  const APP = Object.fromEntries(APPS.map((a) => [a.id, a]));
  const TITLE = { entry: 'Pokédex', home: 'Rotom Dex' };
  const pageTitle = (p) => (TITLE[p] || (APP[p] ? APP[p].name : 'Rotom Dex')).toUpperCase();
  const pageIcon = (p) => (p === 'entry' ? 'dex' : p === 'home' ? 'dex' : APP[p] ? p : 'dex');

  /* ---------- Rotom's lines ---------- */
  const LINES = {
    home: ['Bzzt! Which app shall we open?', 'Rotom Dex, at your service!', 'All my apps are fully charged!', 'Tap an app! Rotom does the rest.'],
    dex: ['So many Pokémon! Bzzt!', 'Tap a Pokémon twice for its entry!', 'Who shall we research next? Zzt!', 'Rotom knows EVERYTHING. Almost.'],
    entry: ['Ooh, this one! Bzzt!', 'Rare behaviours give more stars!', 'Rotom loves this page! Zzzt!', 'Better photos, more stars!'],
    ency: ['Every habitat has secrets! Bzzt!', 'Behaviours are the best part!', 'Knowledge is power! Rotom power!'],
    quests: ['Jobs to do! Bzzt!', 'Track a quest to get an arrow!', 'Go go go! Zzt!'],
    prog: ['Look how far we have come!', 'Rotom is SO proud! Bzzt!'],
    album: ['Nice shots! Bzzzt!', 'You are a real pro!', 'Rotom is never in these... hmph.'],
    mail: ['You have got mail! Bzzt!', 'Rotom delivers faster than Pelipper!'],
    settings: ['Careful with that reset! Zzt!', 'Rotom can be quiet... sometimes.'],
    style: ['Looking sharp, Mudkip!', 'Fashion! Bzzt-bzzt!'],
    shop: ['Spend those points! Bzzt!', 'Rotom recommends EVERYTHING.'],
    disc: ['Secrets! Rotom LOVES secrets!', 'Scan anything suspicious!'],
    tms: ['Water Gun is great. Not near Rotom!', 'Watch Pokémon closely to copy moves!'],
    time: ['Tick tock! Bzzt!', 'Rotom glows in the dark. Handy!'],
    chat: ['Let\'s chat! Bzzt!', 'Ask Rotom anything!'],
    help: ['Need help? Rotom is here!'],
  };
  const GREET = ['Bzzt! Rotom Dex, ready!', 'Kiiih! Research time!', 'Zzt! Rotom is awake!', 'Bzzt-bzzt! Hello again!'];
  function say(text, o = {}) {
    if (!text) return;
    D.line = { text, t: -(o.delay || 0), life: o.life || clamp(2.4 + text.length / 15, 3, 7.5), voiced: false };
    if (o.mood) mood(o.mood, o.moodT || 1.6);
    D.idleT = 14 + Math.random() * 10;
  }
  function mood(m, dur = 1.5) { D.face.mood = m; D.face.moodT = dur; }
  const pick = (a) => a[(Math.random() * a.length) | 0];
  function zap(n = 2) { const F = D.face; for (let i = 0; i < n; i++) F.zaps.push({ t: -i * 0.05, life: 0.18 + Math.random() * 0.14, seed: Math.random() * 1000 }); F.spark = 1; }

  /* ---------- open / close / navigation ---------- */
  function open() {
    if (Game.mode === 'dex') return;
    if (Game.mode === 'camera') Photo.close();
    D.back = Game.mode;
    Game.mode = 'dex'; D.isOpen = true; D.t = 0; D.closing = 0; D.trans = 1; D.after = null;
    if (!D.opened) {
      D.opened = true;
      const pg = qs.get('dexpage'); if (pg && (PAGES[pg] || pg === 'home')) D.page = pg;
      const s = qs.get('dexsel'); if (s && DexData.S[s]) D.sel = s;
    }
    if (D.page === 'entry' && !(D.sel && DexData.S[D.sel])) D.page = 'dex';
    if (!PAGES[D.page]) D.page = 'dex';
    D.faceK = D.page === 'home' ? 1 : 0;
    D.homeT = -0.45; D.zoom = null; D.bounce = {};
    D.mailC = null;
    Quests.seen();
    SFX.dexOpen();
    const F = D.face; F.mood = 'norm'; F.moodT = 0; F.pop = 0; F.zaps.length = 0;
    const T = Save.data.tut || {};
    if (!T.rotomHome) { T.rotomHome = 1; Save.save(); say('Bzzt! Tap my tail button for all my apps!', { delay: 0.7, mood: 'happy' }); }
    else say(pick(GREET), { delay: 0.6, mood: 'happy' });
  }
  function close(after) { if (D.closing) return; D.closing = 0.001; D.after = typeof after === 'function' ? after : null; SFX.dexClose(); mood('wink', 1); }
  function go(page, o = {}) {
    if (page === D.page && !o.force) return;
    D.prev = D.page; D.page = page; D.trans = 0; D.dir = o.dir ?? 1;
    if (page === 'home') D.homeT = 0.1;
    if (D.prev !== 'home') D.zoom = null;
    if (o.sel !== undefined) D.sel = o.sel;
    SFX.page(); zap(2);
    if (page !== 'entry' && page !== 'dex' && LINES[page] && Math.random() < 0.7) say(pick(LINES[page]));
  }
  function back() {
    if (D.page === 'entry') go('dex', { dir: -1 });
    else if (D.page === 'home') close();
    else go('home', { dir: -1 });
  }
  function launch(a) {
    if (a.lock && a.lock()) { SFX.error(); D.shake = 0.35; say('Locked! ' + a.name + ' opens at Lv ' + featLv(a.id) + '. Bzzt!', { mood: 'sad' }); return; }
    D.bounce[a.id] = 1;
    if (a.toggle) { a.toggle(); return; }
    const tp = D.page === 'home' && D.tilePos && D.tilePos[a.id]; D.zoom = tp && !a.launch ? { x: tp[0], y: tp[1], c: a.c } : null;
    if (a.launch) { say('Opening the ' + a.name + '! Zzt!'); close(a.launch); return; }
    go(a.id, { dir: 1 });
  }
  function openEntry(sp) {
    if (stat(sp) === 0) { hintFor(sp); SFX.error(); return; }
    D.star = bestTier(sp); D.scroll.entry = 0;
    go('entry', { sel: sp });
    const d = DexData.S[sp];
    say(pick(['Ooh, ' + d.name + '! Bzzt!', d.name + '! Rotom loves ' + d.name + '!', 'Loading ' + d.name + '... done! Zzt!']));
  }
  function selectSp(sp) {
    if (D.sel === sp) return;
    D.sel = sp; D.selT = 0; SFX.blip();
    if (Math.random() < 0.35) { const d = DexData.S[sp], st = stat(sp); say(st === 2 ? pick([d.name + '! ' + d.type.join('/') + ' type!', 'Ah, ' + d.name + '! Good shots of this one!', d.name + '! Height ' + d.h + ' m!']) : st === 1 ? pick(['We saw ' + d.name + '! Now snap it!', d.name + '... no photo yet! Bzzt!']) : pick(['Bzzt... no data!', 'Who is THAT Pokémon?!', 'Mystery Pokémon! Zzt!'])); }
  }
  function hintFor(sp) {
    const d = DexData.S[sp], ar = (d.area || []).map((a) => (DexData.AREAS[a] ? DexData.AREAS[a].name : a));
    const b = Object.values(d.beh)[0];
    say(ar.length ? 'No data! Rotom heard it lives in ' + ar[0] + '.' + (b ? ' ' + b.hint : '') : 'No data yet! Keep exploring. Bzzt!', { mood: 'wow', life: 6 });
  }

  function update(dt) {
    D.t += dt;
    if (D.closing) {
      D.closing += dt;
      if (D.closing > 0.5) { D.isOpen = false; Game.mode = 'explore'; D.closing = 0; const f = D.after; D.after = null; if (f) try { f(); } catch (e) { console.error(e); } }
    }
    D.trans = Math.min(1, D.trans + dt * (D.zoom ? 3 : 4.5));
    D.keyV += (-Math.sin(D.keyAng) * 18 - D.keyV * 2.2) * dt; D.keyAng += D.keyV * dt;
    D.mudYaw += dt * 0.9;
    D.selT = (D.selT || 0) + dt;
    D.faceK += ((D.page === 'home' ? 1 : 0) - D.faceK) * Math.min(1, dt * 10);
    D.homeT = (D.homeT || 0) + dt;
    for (const k in D.bounce) { D.bounce[k] = Math.max(0, D.bounce[k] - dt * 2.2); if (!D.bounce[k]) delete D.bounce[k]; }
    D.shake = Math.max(0, D.shake - dt);
    if (D.trans >= 1) D.zoom = null;
    D.home.slide *= Math.exp(-dt * 16); if (Math.abs(D.home.slide) < 0.5) D.home.slide = 0;
    const F = D.face;
    F.pop = clamp((D.t - 0.36) / 0.22, 0, 1);
    // boot: Rotom wakes up — eyes pop open surprised, a zap, then a grin
    if (!D.closing && D.t - dt < 0.78 && D.t >= 0.78) { mood('wow', 0.45); zap(3); }
    F.nextBlink -= dt;
    if (F.nextBlink <= 0) { F.blinkT = 0.13; F.nextBlink = 1.8 + Math.random() * 3.4; F.dbl = Math.random() < 0.2; }
    if (F.blinkT > 0) { F.blinkT -= dt; if (F.blinkT <= 0 && F.dbl) { F.dbl = false; F.blinkT = 0.11; } }
    if (F.moodT > 0) { F.moodT -= dt; if (F.moodT <= 0) F.mood = 'norm'; }
    F.spark = Math.max(0, F.spark - dt * 3);
    F.zapT -= dt; if (F.zapT <= 0) { F.zapT = 0.9 + Math.random() * 2.6; zap(1 + (Math.random() < 0.3 ? 1 : 0)); }
    for (const z of F.zaps) z.t += dt; F.zaps = F.zaps.filter((z) => z.t < z.life);
    // what the eyes look at: the mouse if it moved lately, else the selection, else a lazy wander
    F.wanderT -= dt; if (F.wanderT <= 0) { F.wanderT = 1.2 + Math.random() * 2.4; F.wx = (Math.random() * 2 - 1) * 0.8; F.wy = Math.random() * 0.9 - 0.2; }
    let tx = F.wx, ty = F.wy;
    const E = D.eyeAt, tgt = D.rt - D.mouseT < 2.5 && D.mouse ? [D.mouse.x, D.mouse.y] : D.lookAt;
    if (E && tgt) { tx = clamp((tgt[0] - E[0]) / 70, -1, 1); ty = clamp((tgt[1] - E[1]) / 50, -1, 1); }
    if (F.mood === 'dizzy') { tx = Math.cos(D.t * 9); ty = Math.sin(D.t * 9); }
    F.lx += (tx - F.lx) * Math.min(1, dt * 12); F.ly += (ty - F.ly) * Math.min(1, dt * 12);
    D.rt = (D.rt || 0) + dt;
    // speech
    const L = D.line;
    if (L) {
      L.t += dt;
      if (L.t >= 0 && !L.voiced) { L.voiced = true; if (typeof Rotom !== 'undefined' && Rotom.voice) Rotom.voice('chat', 0.45); }
      F.talk = L.t >= 0 && L.t < L.text.length / 42 + 0.1 ? 1 : 0;
      if (L.t > L.life) D.line = null;
    } else F.talk = 0;
    if (!D.closing && D.t > 1) { D.idleT -= dt; if (D.idleT <= 0) { D.idleT = 16 + Math.random() * 12; idleChat(); } }
  }
  function idleChat() {
    const p = D.page, r = Math.random();
    if ((p === 'dex' || p === 'entry') && D.sel && stat(D.sel) === 2 && r < 0.5) { const d = DexData.S[D.sel]; say('Fun fact: ' + d.blurb.split('. ')[0].replace(/\.$/, '') + '!', { life: 7 }); return; }
    if (typeof Rotom !== 'undefined' && Rotom.joke && r < 0.35) { say(Rotom.joke(), { life: 7, mood: 'happy' }); return; }
    say(pick(LINES[p] || LINES.home));
  }

  /* ---------- input ---------- */
  const areas = {};
  function btn(id, x, y, w, h, fn, o = {}) { D.btns.push(Object.assign({ id, x, y, w, h, fn }, o)); }
  function hit(ux, uy) { for (let i = D.btns.length - 1; i >= 0; i--) { const b = D.btns[i]; if (ux >= b.x && uy >= b.y && ux < b.x + b.w && uy < b.y + b.h) return b; } return null; }
  function scrollArea(ux, uy) { let best = null; for (const k in areas) { const a = areas[k]; if (ux >= a.x && uy >= a.y && ux < a.x + a.w && uy < a.y + a.h) best = k; } return best; }
  const V = (v) => v / (D.s || 1);
  function down(ux0, uy0) {
    const ux = V(ux0), uy = V(uy0);
    D.mouse = { x: ux, y: uy }; D.mouseT = D.rt || 0;
    const hb = hit(ux, uy);
    // close buttons react on touch-down (some mobile browsers cancel the touch before it ends)
    if (hb && (hb.id === 'x' || hb.id === 'closebar')) { D.press = null; SFX.blip(); close(); return; }
    D.press = { b: hb, x: ux, y: uy, moved: false, t: D.rt || 0 };
    const s = scrollArea(ux, uy); if (s) { D.press.scroll = s; D.press.s0 = D.scroll[s] || 0; }
  }
  function move(ux0, uy0) {
    const ux = V(ux0), uy = V(uy0), p = D.press;
    D.mouse = { x: ux, y: uy }; D.mouseT = D.rt || 0;
    if (!p) return;
    const dx = ux - p.x, dy = uy - p.y;
    if (Math.abs(dy) > 4 || Math.abs(dx) > 6) p.moved = true;
    if (p.moved && p.scroll && Math.abs(dy) >= Math.abs(dx) * 0.7) D.scroll[p.scroll] = Math.max(0, p.s0 - dy);
    if (D.page === 'home' && Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy)) p.swipe = dx;
  }
  function up(ux0, uy0) {
    const ux = V(ux0), uy = V(uy0), p = D.press; D.press = null;
    if (!p) return;
    if (p.swipe && Math.abs(p.swipe) > 28) { flipHome(p.swipe < 0 ? 1 : -1); return; }
    if (p.moved && p.scroll) return;
    const b = hit(ux, uy);
    if (b && b === p.b && b.fn) { if (!b.silent) SFX.blip(); b.fn(ux, uy); return; }
    // tap outside the device closes it (mobile friendly)
    const R = D.dev;
    const out = (x, y) => !(x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h);
    if (!b && !p.b && R && out(ux, uy) && out(p.x, p.y)) close();
  }
  function cancel() { D.press = null; }
  function hover(ux0, uy0) { D.mouse = { x: V(ux0), y: V(uy0) }; D.mouseT = D.rt || 0; const b = hit(D.mouse.x, D.mouse.y); if (b && b.hov) b.hov(); }
  // the mouse moving over the device (main.js reports hovers to the HUD)
  if (typeof HUD !== 'undefined' && HUD.hover) { const h0 = HUD.hover; HUD.hover = function (ux, uy) { if (Game.mode === 'dex') { hover(ux, uy); return; } return h0.apply(this, arguments); }; }
  function wheel(dy) {
    const m = D.mouse, k = (m && scrollArea(m.x, m.y)) || MAINSCROLL[D.page] || D.page;
    if (D.page === 'home' && !(m && scrollArea(m.x, m.y))) { if (Math.abs(dy) > 20) flipHome(dy > 0 ? 1 : -1); return; }
    D.scroll[k] = Math.max(0, (D.scroll[k] || 0) + dy * 0.3);
  }
  const MAINSCROLL = { dex: 'dex', ency: 'encyR', quests: 'qlog', mail: 'mail', tms: 'tms', help: 'help', chat: 'chat' };
  function flipHome(d) {
    const pages = Math.ceil(APPS.length / 8), H = D.home, n = clamp(H.pg + d, 0, pages - 1);
    if (n === H.pg) { H.slide = -d * 10; return; }
    H.pg = n; H.slide = d * 60; D.homeT = 0.12; SFX.page(); zap(1);
  }
  function key(k) {
    if (k === 'p' || k === 'Tab') { close(); return; }
    if (k === 'Escape') { if (D.page === 'dex' || D.page === 'home') close(); else back(); return; }
    if (k === 'Backspace') { back(); return; }
    if ((k === 'h' || k === 'Home') && D.page !== 'home') { go('home', { dir: -1 }); return; }
    const f = KEYS[D.page]; if (f) f(k);
  }
  // keyboard: a selection that moves through a list
  function listKey(k, key, n, fnPick) {
    const cur = D.lsel[key] || 0;
    let i = cur;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 's') i++;
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'w') i--;
    else if (k === 'PageDown') i += 6; else if (k === 'PageUp') i -= 6;
    else if ((k === 'Enter' || k === ' ') && fnPick) { fnPick(cur); return true; }
    else return false;
    i = clamp(i, 0, Math.max(0, n - 1));
    if (i !== cur) { D.lsel[key] = i; D.ensure = key; SFX.blip(); }
    return true;
  }
  const KEYS = {
    home(k) {
      const H = D.home, pages = Math.ceil(APPS.length / 8), onPg = () => Math.min(8, APPS.length - H.pg * 8);
      if (k === 'ArrowRight' || k === 'd') { if (H.sel % 4 === 3 || H.sel === onPg() - 1) { if (H.pg < pages - 1) { flipHome(1); H.sel = H.sel - (H.sel % 4); } } else H.sel++; SFX.blip(); }
      else if (k === 'ArrowLeft' || k === 'a') { if (H.sel % 4 === 0) { if (H.pg > 0) { flipHome(-1); H.sel += 3; } } else H.sel--; SFX.blip(); }
      else if (k === 'ArrowDown' || k === 's') { H.sel = Math.min(onPg() - 1, H.sel + 4); SFX.blip(); }
      else if (k === 'ArrowUp' || k === 'w') { H.sel = Math.max(0, H.sel - 4); SFX.blip(); }
      else if (k === 'Enter' || k === ' ') { const a = APPS[H.pg * 8 + H.sel]; if (a) { SFX.select(); launch(a); } }
      else if (k >= '1' && k <= '8') { const a = APPS[H.pg * 8 + (+k - 1)]; if (a) { H.sel = +k - 1; launch(a); } }
      H.sel = clamp(H.sel, 0, onPg() - 1);
    },
    dex(k) {
      const L = dexList();
      if (k === 'f') { const F = ['all', 'here', 'miss']; D.filter = F[(F.indexOf(D.filter) + 1) % 3]; D.scroll.dex = 0; SFX.page(); return; }
      D.lsel.dex = Math.max(0, L.indexOf(D.sel));
      if (listKey(k, 'dex', L.length, (i) => openEntry(L[i]))) { const sp = L[D.lsel.dex]; if (sp && sp !== D.sel) { D.sel = sp; D.selT = 0; } }
    },
    entry(k) {
      const L = DexData.ORDER.filter((s) => stat(s) > 0), i = L.indexOf(D.sel);
      if ((k === 'ArrowRight' || k === 'ArrowLeft') && L.length) { const dir = k === 'ArrowRight' ? 1 : -1; D.sel = L[(Math.max(0, i) + dir + L.length) % L.length]; D.star = bestTier(D.sel); D.scroll.entry = 0; D.trans = 0.5; D.dir = dir; SFX.page(); }
      if (k === 'ArrowUp') D.star = (D.star + 3) % 4; if (k === 'ArrowDown') D.star = (D.star + 1) % 4;
    },
    ency(k) { const ids = habitats(); if (k === 'ArrowLeft' || k === 'ArrowRight') { tabKey('ency', ['hab', 'beh'], k); return; } listKey(k, 'ency', ids.length); },
    quests(k) { if (k === 'ArrowLeft' || k === 'ArrowRight') { tabKey('quests', ['log', 'stamps'], k); return; } listKey(k, 'qlog', questList().length, (i) => { const e = questList()[i]; if (e) trackQuest(e.q); }); },
    mail(k) { const M = mailList(); listKey(k, 'mail', M.length, (i) => { const m = M[i]; if (m && m.act) m.act.fn(); }); },
    tms(k) { listKey(k, 'tms', Moves.LIST.length, (i) => pickMove(i)); },
    album(k) { const n = Save.data.album.length; if (!n) return; if (k === 'ArrowRight' || k === 'ArrowDown') D.album = Math.min(n - 1, D.album + 1); if (k === 'ArrowLeft' || k === 'ArrowUp') D.album = Math.max(0, D.album - 1); },
    chat(k) { const i = '1234'.indexOf(k); if (i >= 0) chatAsk(CHATQ[i][0]); },
    shop(k) { if (k === 'ArrowLeft' || k === 'ArrowRight') { const c = ['items', 'outfit', 'device']; D.shopCat = c[(c.indexOf(D.shopCat || 'items') + (k === 'ArrowRight' ? 1 : 2)) % 3]; D.scroll.shop = 0; SFX.page(); } },
    time(k) { if (k === 'Enter' || k === ' ' || k === 't') Game.tryTime(); if (k === 'n' && typeof Seasons !== 'undefined') Seasons.next(); },
  };
  function tabKey(key, tabs, k) { const i = tabs.indexOf(D.tab[key] || tabs[0]); const n = clamp(i + (k === 'ArrowRight' ? 1 : -1), 0, tabs.length - 1); if (n !== i) { D.tab[key] = tabs[n]; SFX.page(); } }

  /* ---------- helpers: sprites, photos, species status ---------- */
  function thumb(sp, size = 30, sil = false) {
    const key = sp + '|' + size + '|' + (sil ? 1 : 0);
    if (D.thumbs.has(key)) return D.thumbs.get(key);
    const g = (() => { try { return (0, eval)(sp[0].toUpperCase() + sp.slice(1)); } catch (e) { return null; } })();
    if (!g) { D.thumbs.set(key, null); return null; }
    if (D.budget <= 0) return undefined; // render later
    const t0 = performance.now();
    const m = g.meta;
    const pose = { eyes: 'open' };
    if (sp === 'castform') pose.form = 'normal';
    const yaw = sp === 'wailord' || sp === 'kyogre' || sp === 'milotic' ? 0.5 : 1.1;
    const sc = 0.4;
    const r0 = g.render(g.build(Object.assign({ side: Math.cos(yaw) }, pose)), { yaw, pitch: 0.16, scale: sc, W: Math.ceil(m.bw * sc), H: Math.ceil(m.bh * sc), ox: Math.ceil(m.bw * sc) >> 1, oy: Math.floor(Math.ceil(m.bh * sc) * m.oy), pal: g.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
    const bb = Creature.bounds(r0);
    // supersample: render SS× bigger then shrink, so fixed-size eye stamps and outlines end up in proportion
    const SS = 3;
    const k = Math.min(size / Math.max(1, bb.w), size / Math.max(1, bb.h)) * sc * SS;
    const W = Math.ceil(m.bw * k) + 4, H = Math.ceil(m.bh * k) + 4;
    const r = g.render(g.build(Object.assign({ side: Math.cos(yaw) }, pose)), { yaw, pitch: 0.16, scale: k, W, H, ox: W >> 1, oy: Math.floor(H * m.oy), pal: g.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
    const b2 = Creature.bounds(r);
    const out = new PX.Buf(Math.max(1, Math.ceil(b2.w / SS)), Math.max(1, Math.ceil(b2.h / SS)));
    const lum = (c) => (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
      // mode of the SS×SS block (ties → darker, keeps outlines); mostly-empty blocks stay empty
      const cnt = new Map(); let n = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        const X = b2.x0 + x * SS + i, Y = b2.y0 + y * SS + j;
        if (X >= b2.x0 + b2.w || Y >= b2.y0 + b2.h) continue;
        const v = r.buf.d[Y * r.buf.w + X]; if (!v) continue;
        n++; cnt.set(v, (cnt.get(v) || 0) + 1);
      }
      let best = 0, bc = -1;
      for (const [c, mm] of cnt) if (mm > bc || (mm === bc && lum(c) < lum(best))) { best = c; bc = mm; }
      out.d[y * out.w + x] = n >= Math.ceil(SS * SS * 0.34) ? (sil ? 0xff301e1a : best) : 0;
    }
    D.thumbs.set(key, out);
    D.budget -= performance.now() - t0;
    return out;
  }
  function photo(url) {
    if (!url) return null;
    if (D.imgs.has(url)) return D.imgs.get(url);
    D.imgs.set(url, undefined);
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, im.width, im.height);
        const b = new PX.Buf(im.width, im.height); b.d = new Uint32Array(d.data.buffer.slice(0));
        D.imgs.set(url, b);
      } catch (e) { D.imgs.set(url, null); }
    };
    im.onerror = () => D.imgs.set(url, null);
    im.src = url;
    return undefined;
  }
  function stars(fb, n, x, y, max = 4) { for (let i = 0; i < max; i++) Font.icon(fb, i < n ? 'star' : 'star0', x + i * 8, y, 1); }
  function medal(fb, m, x, y) { const mc = [0, 0xff3a7ac0, 0xffd0c0b8, 0xff3ac8ff, 0xfffff09a][m] || 0xff808080; UI.disc(fb, x, y, 4, INK); UI.disc(fb, x, y, 3, mc); UI.put(fb, x - 1, y - 1, 0xffffffff); }
  // real Pokédex data the species file doesn't carry: category and weight (kg)
  const INFO = Object.fromEntries('tentacool Jellyfish 45.5|staryu Star Shape 34.5|starmie Mysterious 80|chinchou Angler 12|marill Aqua Mouse 8.5|azumarill Aqua Rabbit 28.5|wobbuffet Patient 28.5|slugma Lava 35|corsola Coral 5|remoraid Jet 12|mantine Kite 220|marshtomp Mud Fish 28|swampert Mud Fish 81.9|zigzagoon Tiny Raccoon 17.5|linoone Rushing 32.5|lotad Water Weed 2.6|lombre Jolly 32.5|ludicolo Carefree 55|seedot Acorn 4|nuzleaf Wily 28|taillow Tiny Swallow 2.3|swellow Swallow 19.8|wingull Seagull 9.5|pelipper Water Bird 28|surskit Pond Skater 1.7|masquerain Eyeball 3.6|shroomish Mushroom 4.5|breloom Mushroom 39.2|slakoth Slacker 24|vigoroth Wild Monkey 46.5|slaking Lazy 130.5|nincada Trainee 5.5|azurill Polka Dot 2|plusle Cheering 4.2|minun Cheering 4.2|volbeat Firefly 17.7|illumise Firefly 17.7|carvanha Savage 20.8|sharpedo Brutal 88.8|wailmer Ball Whale 130|wailord Float Whale 398|numel Numb 24|torkoal Coal 80.4|spinda Spot Panda 5|trapinch Ant Pit 15|vibrava Vibration 15.3|flygon Mystic 82|swablu Cotton Bird 1.2|altaria Humming 20.6|lunatone Meteorite 168|solrock Meteorite 154|corphish Ruffian 11.5|crawdaunt Rogue 32.8|lileep Sea Lily 23.8|anorith Old Shrimp 12.5|feebas Fish 7.4|milotic Tender 162|castform Weather 0.8|kecleon Color Swap 22|tropius Fruit 100|wynaut Bright 14|snorunt Snow Hat 16.8|spheal Clap 39.5|sealeo Ball Roll 87.6|walrein Ice Break 150.6|clamperl Bivalve 52.5|relicanth Longevity 23.4|luvdisc Rendezvous 8.7|bagon Rock Head 42.1|regice Iceberg 175|latias Eon 40|latios Eon 60|kyogre Sea Basin 352|groudon Continent 950|rayquaza Sky High 206.5|jirachi Wish 1.1|deoxys DNA 60.8|budew Bud 1.2|chatot Music Note 1.9|dialga Temporal 683|palkia Spatial 336|meloetta Melody 6.5|minior Meteor 40|mudkip Mud Fish 7.6'.split('|').map((r) => { const a = r.split(' '); return [a[0], { cat: a.slice(1, -1).join(' ') + ' Pokémon', wt: +a[a.length - 1] }]; }));
  const info = (sp) => INFO[sp] || { cat: 'Unknown Pokémon', wt: 0 };
  function speciesDone(sp) {
    const d = DexData.S[sp], ph = Save.data.photos[sp] || {};
    const beh = Object.keys(d.beh).length, got = Object.keys(Save.data.beh[sp] || {}).length;
    const objs = d.obj.length, oDone = d.obj.filter((o) => Save.data.obj[o.id]).length;
    const st = [1, 2, 3, 4].filter((k) => ph['s' + k]).length;
    return { beh, got, objs, oDone, st, best: Math.max(0, ...[1, 2, 3, 4].filter((k) => ph['s' + k]).map((k) => k)), pct: (got + oDone + st) / Math.max(1, beh + objs + 4) };
  }
  function bestTier(sp) { const p = Save.data.photos[sp] || {}; for (let k = 4; k >= 1; k--) if (p['s' + k]) return k - 1; return 0; }
  // 0 = unknown, 1 = seen (Rotom spotted it nearby), 2 = caught (photographed: registered)
  const stat = (sp) => (Save.data.seen[sp] ? 2 : Save.data.rspot && Save.data.rspot[sp] ? 1 : 0);
  const counts = () => { let s = 0, c = 0; for (const k of DexData.ORDER) { const v = stat(k); if (v) s++; if (v === 2) c++; } return { seen: s, caught: c, all: DexData.ORDER.length }; };
  const areaName = (a) => (DexData.AREAS[a] ? DexData.AREAS[a].name : a);
  const spName = (sp) => (DexData.S[sp] ? DexData.S[sp].name : { mailman: 'Pelipper', birch: 'Prof. Birch' }[sp] || String(sp || '?'));
  const pad3 = (n) => String(n).padStart(3, '0');
  const fit = (t, w, font = 'small') => { t = String(t).replace(/★/g, '{star}'); if (Font.measure(t, font) <= w) return t; while (t.length > 1 && Font.measure(t + '..', font) > w) t = t.slice(0, -1); return t + '..'; };
  function clipTo(fb, Q, fn) {
    // draw into a temp buffer then copy the clipped region (keeps scrolling lists inside their screen)
    const tmp = D.tmp && D.tmp.w === fb.w && D.tmp.h === fb.h ? D.tmp : (D.tmp = new PX.Buf(fb.w, fb.h));
    tmp.d.fill(0);
    fn(tmp);
    for (let y = Math.max(0, Q.y); y < Math.min(fb.h, Q.y + Q.h); y++) for (let x = Math.max(0, Q.x); x < Math.min(fb.w, Q.x + Q.w); x++) { const v = tmp.d[y * fb.w + x]; if (v) fb.d[y * fb.w + x] = v; }
  }
  function scrollbar(fb, Q, s, maxS, total) {
    const h = Math.max(10, Math.round((Q.h * Q.h) / total)), y = Q.y + Math.round(((Q.h - h) * s) / maxS);
    UI.rect(fb, Q.x + Q.w - 2, Q.y, 2, Q.h, P.scrD); UI.rect(fb, Q.x + Q.w - 3, y, 3, h, P.scrDD);
  }
  // a scrolling list: rows are drawn clipped, each row is a button
  function listView(fb, key, Q, n, rh, sel, drawRow, pick2) {
    areas[key] = Q;
    const total = n * rh, maxS = Math.max(0, total - Q.h);
    let s = clamp(D.scroll[key] || 0, 0, maxS);
    if (D.ensure === key && sel >= 0) { const y0 = sel * rh; if (y0 < s) s = y0; else if (y0 + rh > s + Q.h) s = y0 + rh - Q.h; D.ensure = null; }
    D.scroll[key] = s;
    const w = Q.w - (maxS > 0 ? 5 : 0);
    const i0 = Math.max(0, Math.floor(s / rh)), i1 = Math.min(n - 1, Math.ceil((s + Q.h) / rh));
    clipTo(fb, Q, (b) => { for (let i = i0; i <= i1; i++) drawRow(b, i, Q.x, Q.y + i * rh - s, w, rh, i === sel); });
    if (pick2) for (let i = i0; i <= i1; i++) { const y = Q.y + i * rh - s, y0 = Math.max(Q.y, y), y1 = Math.min(Q.y + Q.h, y + rh); if (y1 - y0 > 3) btn(key + ':' + i, Q.x, y0, w, y1 - y0, () => pick2(i)); }
    if (maxS > 0) scrollbar(fb, Q, s, maxS, total);
    return s;
  }
  // a scrolling free-form panel: fn(b, y0) draws at y0 and returns the content height
  function scrollPanel(fb, key, Q, fn) {
    areas[key] = Q;
    const s = D.scroll[key] || 0;
    let hgt = 0;
    clipTo(fb, Q, (b) => { hgt = fn(b, Q.y - s); });
    const maxS = Math.max(0, hgt - Q.h);
    D.scroll[key] = clamp(s, 0, maxS);
    if (maxS > 0) scrollbar(fb, Q, D.scroll[key], maxS, hgt);
  }
  // a rounded pill with centred small text
  function pill(fb, x, y, w, h, fill, col, text, o = {}) {
    UI.rrect(fb, x, y, w, h, Math.min(4, h >> 1), o.ol ?? P.rim);
    UI.rrect(fb, x + 1, y + 1, w - 2, h - 2, Math.min(3, (h >> 1) - 1), fill);
    if (o.hi !== false) UI.hline(fb, x + 3, x + w - 4, y + 1, mix(fill, 0xffffffff, 0.35));
    Font.draw(fb, fit(text, w - 4), x + w / 2, y + Math.round((h - 5) / 2), col, { font: 'small', align: 'center' });
  }
  // a chunky button (red by default) with a pressed look
  function button(fb, id, x, y, w, h, text, fn, o = {}) {
    const pr = D.press && D.press.b && D.press.b.id === id, hv = D.hoverId === id;
    const fill = o.fill ?? P.red, dk = mix(fill, 0xff000000, 0.35);
    UI.rrect(fb, x, y + 1, w, h, 4, dk);
    UI.rrect(fb, x, y + (pr ? 1 : 0), w, h, 4, P.rim);
    UI.rrect(fb, x + 1, y + 1 + (pr ? 1 : 0), w - 2, h - 2, 3, hv ? mix(fill, 0xffffffff, 0.15) : fill);
    UI.hline(fb, x + 3, x + w - 4, y + 1 + (pr ? 1 : 0), mix(fill, 0xffffffff, 0.4));
    Font.draw(fb, fit(text, w - 4), x + w / 2, y + Math.round((h - 5) / 2) + (pr ? 1 : 0), o.col ?? 0xffffffff, { font: 'small', align: 'center' });
    btn(id, x - 2, y - 2, w + 4, h + 4, fn, o);
  }
  function tabs(fb, key, x, y, w, list, cur0, onPick) {
    const cur = cur0 ?? (D.tab[key] || list[0][0]), tw = Math.floor((w + 2) / list.length), h = D.G.C ? 11 : 13;
    list.forEach(([id, label], i) => {
      const on = cur === id, bx = x + i * tw;
      pill(fb, bx, y, tw - 2, h, on ? P.red : P.scrLL, on ? 0xffffffff : P.dim, label);
      btn('tab-' + key + id, bx, y - 3, tw - 2, h + 6, () => { if (onPick) onPick(id); else D.tab[key] = id; SFX.page(); }, { silent: true });
    });
    return h + 3;
  }
  // a card panel on the screen
  function card(fb, Q, fill = P.card) { UI.rrect(fb, Q.x, Q.y, Q.w, Q.h, 5, P.scrDD); UI.rrect(fb, Q.x + 1, Q.y + 1, Q.w - 2, Q.h - 2, 4, fill); UI.hline(fb, Q.x + 4, Q.x + Q.w - 5, Q.y + 1, 0xffffffff); }
  function textLines(fb, str, x, y, w, col, maxL = 99, lh = 8, font = 'small') {
    const L = Font.wrap(String(str).replace(/★/g, '{star}'), font, w);
    L.slice(0, maxL).forEach((ln, i) => { let s = ln; if (i === maxL - 1 && L.length > maxL) s = fit(ln + '..', w, font); Font.draw(fb, s, x, y + i * lh, col, { font }); });
    return Math.min(L.length, maxL) * lh;
  }
  // rounded-rect fill with a per-pixel colour function
  function rrFill(fb, x, y, w, h, r, fn) {
    for (let j = 0; j < h; j++) {
      let ins = 0;
      if (j < r) ins = r - Math.round(Math.sqrt(r * r - (r - j - 0.5) ** 2));
      else if (j >= h - r) ins = r - Math.round(Math.sqrt(r * r - (j - (h - r) + 0.5) ** 2));
      const Y = y + j; if (Y < 0 || Y >= fb.h) continue;
      for (let i = ins; i < w - ins; i++) { const X = x + i; if (X < 0 || X >= fb.w) continue; const c = fn(i, j, ins, w, h); if (c) fb.d[Y * fb.w + X] = c; }
    }
  }
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0; return [Math.hypot(px - ax - dx * t, py - ay - dy * t), t]; }
  function inPoly(pts, x, y) { let ins = false; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [xa, ya] = pts[a], [xb, yb] = pts[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) ins = !ins; } return ins; }

  /* ---------- geometry: the device of the reference art, measured in its own units ----------
     x is measured from the centre line, y from the roof line (the top of the frame behind the eyes):
     the body is ±94 wide and 160 tall, the lightning antenna rises to y -53, the tail's tip hangs
     at y 188. The screen is x ±83, y 25..145. The whole device is scaled (k) to fit the canvas. */
  const UA = 53, UT = 188, UHW = 94;
  function geom(W, H) {
    const tot = UA + UT;
    const k = clamp(Math.min((H - 4) / tot, (W - 12) / (UHW * 2 + 10)), 0.4, 2.6);
    const hw = Math.round(UHW * k), DW = hw * 2, cx = Math.round(W / 2), ox = cx - hw;
    const TH = Math.round(tot * k), top = Math.max(1, Math.round((H - TH) / 2)), yR = Math.round(UA * k);
    const sw2 = Math.round(83 * k), sy = yR + Math.round(24 * k);
    const G = { k, W, H, DW, hw, TH, cx, ox, top, yR, oy: top + yR, DH: Math.round(160 * k), R: Math.max(4, Math.round(10 * k)) };
    G.scr = { x: cx - sw2, y: top + sy, w: sw2 * 2, h: Math.round(145 * k) - Math.round(24 * k) };
    G.C = G.scr.w < 200; G.L = G.scr.w >= 225;
    G.X = (u) => G.cx + Math.round(u * G.k);
    G.Y = (v) => G.oy + Math.round(v * G.k);
    G.bottom = () => G.top + G.TH;
    G.pad = Math.max(3, Math.round(4 * k));
    return G;
  }
  // the page area: the screen below Rotom's face
  function content(G) {
    const s = G.scr, f = faceDims(G), p = G.pad, y = Math.max(s.y + p, f.cy + f.r + 2);
    return { x: s.x + p, y, w: s.w - p * 2, h: s.y + s.h - p - y };
  }
  function split(Q, f = 0.46, gap = 4) { const lw = Math.round(Q.w * f); return [{ x: Q.x, y: Q.y, w: lw, h: Q.h }, { x: Q.x + lw + gap, y: Q.y, w: Q.w - lw - gap, h: Q.h }]; }
  // Rotom's face: a cyan disc hanging from the top of the screen (big on the home screen)
  function faceDims(G) {
    const e = U.ease.inOut(clamp(D.faceK, 0, 1));
    const ru = lerp(19, 33, e), cu = lerp(12, 15, e);
    return { cx: G.cx, cy: G.Y(cu), r: Math.round(ru * G.k), ru, cu, e };
  }

  /* ---------- the device shell (cached: antenna, frame, tail, clips, rivets and the screen glass) ---------- */
  function mask(w, h, fn) { const m = new Uint8Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (fn(i, j)) m[j * w + i] = 1; return m; }
  // city-block distance to the nearest pixel outside the mask (1 = the edge pixel); dir: 0 all, 1 up/left only, 2 down/right only
  function dist(m, w, h, dir = 0) {
    const d = new Uint16Array(w * h);
    for (let i = 0; i < w * h; i++) d[i] = m[i] ? 999 : 0;
    if (dir !== 2) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!d[i]) continue; d[i] = Math.min(d[i], (y ? d[i - w] : 0) + 1, (x ? d[i - 1] : 0) + 1); }
    if (dir !== 1) for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!d[i]) continue; d[i] = Math.min(d[i], (y < h - 1 ? d[i + w] : 0) + 1, (x < w - 1 ? d[i + 1] : 0) + 1); }
    return d;
  }
  function bodyIn(X, Y) {
    const d = Math.abs(X);
    const e = d - 38, yT = e <= 0 ? 0 : e < 8 ? (0.205 * e * e) / 16 : 0.205 * (e - 4);
    const yB = 160 - 7 * (d / 80) ** 2 + (d < 28 ? 1.3 * (1 - (d / 28) ** 2) : 0);
    if (Y < yT || Y > yB) return false;
    const tp = 3 * clamp((Y - 20) / 125, 0, 1), ax = UHW - d - tp;
    if (ax < 0) return false;
    if (ax < 12 && Y < 20) return (ax - 12) ** 2 + (Y - 20) ** 2 <= 144;
    if (ax < 14 && Y > 139) return (ax - 14) ** 2 + (Y - 139) ** 2 <= 196;
    return true;
  }
  const ANT = [[16, -53.5], [19.5, -50], [23.2, -16.5], [9, -16.5], [14.5, 6], [-10.5, 6], [-22.8, -39.2], [11, -30.2], [13.8, -50]];
  function devBuf(G, FR) {
    const key = G.W + 'x' + G.H + '|' + FR.b + '|' + FR.hi + '|' + FR.mv;
    if (D.devC && D.devC.key === key) return D.devC.buf;
    const { k, DW, hw, TH, yR } = G, B = new PX.Buf(DW, TH), bd = B.d;
    const ux = (i) => (i + 0.5 - hw) / k, uy = (j) => (j + 0.5 - yR) / k;
    const px = (u) => hw + Math.round(u * k), py = (v) => yR + Math.round(v * k);
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < DW && y < TH) bd[y * DW + x] = c; };
    const hiW = Math.max(2, Math.round(2.4 * k)), shW = Math.max(1, Math.round(1.6 * k));
    // a bevelled shape lit from the top left
    const bevel = (m, pal) => {
      const da = dist(m, DW, TH), du = dist(m, DW, TH, 1), dd = dist(m, DW, TH, 2);
      for (let i = 0; i < m.length; i++) {
        if (!m[i]) continue;
        const c = da[i] === 1 ? pal.ink : du[i] <= 1 + hiW ? pal.hi : du[i] === 2 + hiW ? pal.l : dd[i] <= 1 + shW ? pal.dd : dd[i] === 2 + shW ? pal.sh : pal.b;
        bd[i] = c;
      }
    };
    // 2. the pointed tail: a bright ridge down the middle
    {
      const tw = (Y) => (Y < 162 ? 13 : 13 - (Y - 162) * (12.4 / 26));
      const m = mask(DW, TH, (i, j) => { const Y = uy(j); return Y > 150 && Y < 188.5 && Math.abs(ux(i)) <= tw(Y); });
      const da = dist(m, DW, TH);
      for (let i = 0; i < m.length; i++) {
        if (!m[i]) continue;
        const X = ux(i % DW), Y = uy((i / DW) | 0), w = Math.max(0.6, tw(Y)), a = (X + 0.4) / w;
        bd[i] = da[i] === 1 ? FR.ink : Y < 164.5 ? FR.dd : Math.abs(a) < 0.26 ? FR.hi : Math.abs(a) < 0.36 ? FR.l : a < -0.7 || a > 0.62 ? FR.dd : FR.b;
      }
    }
    // 3. the frame: a thick rounded body with the screen well cut out
    const s = G.scr, sx = s.x - G.ox, sy = s.y - G.top, R = G.R;
    const insAt = (j) => { const r = R; if (j < r) return r - Math.round(Math.sqrt(r * r - (r - j - 0.5) ** 2)); if (j >= s.h - r) return r - Math.round(Math.sqrt(r * r - (j - (s.h - r) + 0.5) ** 2)); return 0; };
    const inS = (i, j) => { const jj = j - sy; if (jj < 0 || jj >= s.h) return false; const ins = insAt(jj), ii = i - sx; return ii >= ins && ii < s.w - ins; };
    const bm = mask(DW, TH, (i, j) => bodyIn(ux(i), uy(j)));
    const sm = mask(DW, TH, inS);
    const dO = dist(bm, DW, TH), fm = new Uint8Array(bm.length);
    for (let i = 0; i < fm.length; i++) fm[i] = bm[i] && !sm[i] ? 1 : 0;
    // distance to the screen: flood from the screen pixels over the frame
    const dS = new Uint16Array(fm.length); for (let i = 0; i < fm.length; i++) dS[i] = sm[i] ? 0 : 999;
    for (let y = 0; y < TH; y++) for (let x = 0; x < DW; x++) { const i = y * DW + x; if (!dS[i]) continue; dS[i] = Math.min(dS[i], (y ? dS[i - DW] : 999) + 1, (x ? dS[i - 1] : 999) + 1); }
    for (let y = TH - 1; y >= 0; y--) for (let x = DW - 1; x >= 0; x--) { const i = y * DW + x; if (!dS[i]) continue; dS[i] = Math.min(dS[i], (y < TH - 1 ? dS[i + DW] : 999) + 1, (x < DW - 1 ? dS[i + 1] : 999) + 1); }
    const hiB = Math.max(1, Math.round(1.8 * k));
    for (let j = 0; j < TH; j++) for (let i = 0; i < DW; i++) {
      const p = j * DW + i; if (!fm[p]) continue;
      const X = ux(i), Y = uy(j), o = dO[p], sd = dS[p];
      const reg = Y < 31 ? 0 : Y > 145 ? 2 : 1;
      let c;
      if (o === 1) c = reg === 0 ? FR.ink2 : FR.ink;
      else if (reg === 0) c = o === 2 ? FR.l : o <= 2 + hiW ? FR.hi : o === 3 + hiW && ((X > -58 && X < -30) || (X > 44 && X < 60)) ? FR.spec : sd === 1 ? FR.d1 : FR.b;
      else if (reg === 1) c = o === 2 ? FR.dd : o === 3 && k > 0.9 ? FR.sh : sd === 1 ? FR.l : FR.b;
      else c = sd === 1 ? FR.l : sd <= 1 + hiB ? FR.hi : sd === 2 + hiB ? FR.l : o === 2 ? FR.dd : o === 3 ? FR.sh : FR.b;
      bd[p] = c;
    }
    // 1. the lightning-bolt antenna (its stem runs down behind the eyes into the bridge)
    bevel(mask(DW, TH, (i, j) => inPoly(ANT, ux(i), uy(j))), { ink: FR.ink2, hi: FR.hi, l: FR.l, b: FR.b, sh: FR.sh, dd: FR.dd });
    // grooves between the frame segments (top: two each side; bottom: brackets around the Home button)
    const groove = (x0, y0, x1, y1) => {
      const n = Math.max(1, Math.round(Math.abs(y1 - y0) * k));
      for (let t2 = 0; t2 <= n; t2++) {
        const X = lerp(x0, x1, t2 / n), Y = lerp(y0, y1, t2 / n), x = px(X), y = py(Y), p = y * DW + x;
        if (p < 0 || p >= fm.length || !fm[p] || dO[p] <= 1 || dS[p] <= 1) continue;
        put(x, y, FR.dd); if (fm[p + 1] && dO[p + 1] > 1) put(x + 1, y, FR.l);
      }
    };
    for (const sd of [-1, 1]) {
      groove(sd * 77.5, 12, sd * 74.5, 26); groove(sd * 57.5, 5, sd * 56, 25);
      groove(sd * 22, 146, sd * 23.5, 159); groove(sd * 17.5, 146, sd * 18.5, 160);
    }
    // rivets
    const rivet = (X, Y, r) => {
      const x = px(X), y = py(Y), rr = Math.max(1, Math.round(r * k));
      if (rr === 1) { put(x, y, FR.ink2); put(x + 1, y, FR.dd); put(x, y + 1, FR.dd); put(x + 1, y + 1, FR.dd); return; }
      UI.disc(B, x, y, rr, FR.ink2); UI.disc(B, x, y, rr - 1, FR.dd);
      put(x - 1, y - 1, FR.sh); put(x + rr - 1, y + rr - 1, FR.l);
    };
    for (const sd of [-1, 1]) {
      rivet(sd * 72, 15.5, 1.6); rivet(sd * 62.5, 18.5, 1.6);
      rivet(sd * 69.5, 150.4, 1.1); rivet(sd * 63.6, 151.3, 1.4); rivet(sd * 57, 151.9, 1.6); rivet(sd * 49.5, 152.6, 1.9);
    }
    // grey side clips (two blocks on each side, set into the frame)
    for (const sd of [-1, 1]) {
      const y0 = py(76), y1 = py(105), ym = py(90.5);
      const xin = sd < 0 ? px(-83) - 1 : px(83);                         // the screen edge
      const xo = sd < 0 ? px(-UHW + 2.6) : px(UHW - 2.6) - 1;            // the clip's outer edge (inset from the frame)
      const xa = Math.min(xin, xo), xb = Math.max(xin, xo);
      // notch the silhouette: clear the frame outside the clip
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = sd < 0 ? 0 : xb + 1; sd < 0 ? x < xa : x < DW; x++) bd[y * DW + x] = 0;
      for (let y = y0; y <= y1; y++) for (let x = xa; x <= xb; x++) {
        const e = x === xa || x === xb || y === y0 || y === y1 || y === ym;
        let c = e ? 0xff221c1d : y <= y0 + 1 || y === ym + 1 ? 0xff665d5a : (x + y) & 1 ? 0xff49413d : 0xff403835;
        if (!e && (y === y1 - 1 || y === ym - 1)) c = 0xff332c2a;
        if (!e && x === (sd < 0 ? xa + 1 : xb - 1) && y > y0 + 1) c = 0xff574e4a;
        put(x, y, c);
      }
      // bright lip of the red frame just under each clip block
      for (let x = xa + 1; x < xb; x++) { if (bm[(y1 + 2) * DW + x]) put(x, y1 + 2, FR.hi); }
    }
    // 4. the screen glass: periwinkle with a soft glow at the top, faint dots, a mauve inner rim
    const rimT = Math.max(2, Math.round(2.4 * k)), edge = Math.max(1, Math.round(1.5 * k)), band = Math.max(2, Math.round(4.5 * k));
    const per = Math.max(8, Math.round(14 * k)), dr = k < 1.1 ? 1 : 2;
    for (let jj = 0; jj < s.h; jj++) {
      const ins = insAt(jj);
      for (let ii = ins; ii < s.w - ins; ii++) {
        const lft = ii - ins, rgt = s.w - 1 - ins - ii, bot = s.h - 1 - jj;
        let c;
        if (jj < rimT - 1) c = FR.mv;
        else if (jj === rimT - 1) c = FR.mvD;
        else if (lft === 0 || rgt === 0 || bot === 0) c = FR.mvS;
        else {
          c = mix(P.scrHi, P.scr, clamp((jj - rimT) / (s.h * 0.42), 0, 1));
          if (bot <= band) c = P.scrB;
          else if (lft <= edge || rgt <= edge || jj <= rimT + edge - 1) c = mix(c, P.scr, 0.85);
          // the faint dot pattern
          const gx = (ii + per * 10) % per, row = Math.floor((jj + per * 10 - (per >> 1)) / per), gy = (jj + per * 10 - (per >> 1)) % per, ox2 = row & 1 ? per >> 1 : 0;
          const ddx = Math.abs(((gx - ox2 + per) % per) - (per >> 1)), ddy = Math.abs(gy - (per >> 1));
          if (bot > band && ddx + ddy <= dr) c = mix(c, P.dot, ddx + ddy < dr ? 0.4 : 0.2);
        }
        put(sx + ii, sy + jj, c);
      }
    }
    D.devC = { key, buf: B };
    return B;
  }
  function framePal(S) {
    if (!S || S.id === 'skin.classic') return FR_CLASSIC;
    if (frCache[S.id]) return frCache[S.id];
    const b = S.body, l = S.bodyL, d = S.bodyD, W = 0xffffffff;
    const ml = mix(b, l, 0.55);
    return (frCache[S.id] = { b, l: ml, hi: mix(l, W, 0.12), spec: mix(l, W, 0.45), d1: mix(b, d, 0.25), sh: mix(b, d, 0.5), dd: d, ink: mix(d, S.ink, 0.6), ink2: mix(d, S.ink, 0.35), mv: mix(ml, P.scr, 0.45), mvD: mix(d, P.scr, 0.25), mvS: mix(d, P.scr, 0.4) });
  }
  function drawShell(fb, G, FR, t) {
    UI.img(fb, devBuf(G, FR), G.ox, G.top, 1);
    // sparks from the antenna tip
    const tx = G.X(16), ty = G.Y(-52.5), sp = D.face.spark;
    if (sp > 0.05) for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) { const d = Math.hypot(xx, yy); if (d < 6) UI.blend(fb, tx + xx, ty + yy, P.gold, sp * 0.35 * (1 - d / 6)); }
    for (const z of D.face.zaps) {
      if (z.t < 0) continue;
      const rnd = U.rng(Math.floor(z.seed) + Math.floor(z.t * 30));
      let x = tx, y = ty; const a0 = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
      for (let k2 = 0; k2 < 4; k2++) { const a = a0 + (rnd() - 0.5) * 1.6, l = 2 + rnd() * 3 * G.k; const nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l; UI.line(fb, Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), k2 % 2 ? P.gold : 0xffffffff); x = nx; y = ny; }
    }
  }
  // the round Home button on the bottom frame (the tail button)
  function homeButton(fb, G, FR, t) {
    const k = G.k, cx = G.X(0.5), cy = G.Y(152.6), r = Math.max(4, Math.round(6.6 * k));
    const id = 'homebtn', pr = D.press && D.press.b && D.press.b.id === id, hv = D.hoverId === id, o = pr ? 1 : 0;
    UI.disc(fb, cx, cy, r, FR.ink2);
    UI.disc(fb, cx, cy + o, r - 1, pr ? FR.dd : hv ? FR.l : FR.b);
    for (let a = 0; a < 40; a++) { const an = (a / 40) * Math.PI * 2; if (Math.cos(an - 2.4) > 0.3) UI.put(fb, Math.round(cx + Math.cos(an) * (r - 1.6)), Math.round(cy + o + Math.sin(an) * (r - 1.6)), FR.hi); }
    UI.ring(fb, cx, cy + o, Math.max(2, Math.round(r * 0.52)), FR.ink2, 1);
    UI.hline(fb, cx - r + 2, cx - Math.round(r * 0.52) - 1, cy + o, FR.dd); UI.hline(fb, cx + Math.round(r * 0.52) + 1, cx + r - 2, cy + o, FR.dd);
    UI.disc(fb, cx, cy + o, Math.max(1, Math.round(r * 0.28)), pr ? P.gold : FR.ink2);
    if (D.page !== 'home' && !D.closing) { const kk = (Math.sin(t * 3) + 1) / 2; if (kk > 0.65) UI.ring(fb, cx, cy + o, r + 1, mix(FR.hi, 0xffffffff, 0.5), 1); }
    btn(id, cx - r - 12, cy - r - 6, r * 2 + 24, r * 2 + 14, () => { if (D.page === 'home') go('dex', { dir: 1 }); else go('home', { dir: -1 }); });
  }

  /* ---------- the screen: power-on flash over the (cached) glass ---------- */
  function drawScreen(fb, G, pw, t) {
    const s = G.scr;
    if (pw >= 1) return;
    const k = U.ease.outCubic(pw), bh = Math.max(1, Math.round(s.h * k)), y0 = s.y + Math.round((s.h - bh) / 2);
    rrFill(fb, s.x + 1, s.y + 2, s.w - 2, s.h - 3, G.R, (i, j) => { const Y = s.y + 2 + j; if (Y < y0 || Y >= y0 + bh) return P.off; return pw < 0.5 ? mix(0xffffffff, P.scr, pw * 2) : 0; });
    if (pw > 0) { UI.hline(fb, s.x + 4, s.x + s.w - 5, y0, 0xffffffff); UI.hline(fb, s.x + 4, s.x + s.w - 5, y0 + bh - 1, 0xffffffff); }
  }

  /* ---------- Rotom's face: a cyan disc with a dotted rim and a toothy grin ---------- */
  function drawFace(fb, G, t) {
    const F = D.face, f = faceDims(G), k = G.k, s = G.scr;
    const pop = F.pop < 1 ? U.ease.outBack(F.pop) : 1;
    if (pop <= 0.02) return;
    const Rr = Math.max(3, f.r * pop), cx = f.cx, cy = f.cy;
    const x0 = Math.floor(cx - Rr - 1), x1 = Math.ceil(cx + Rr + 1), y1 = Math.ceil(cy + Rr + 1);
    const between = Math.round(9 * k);
    for (let y = cy; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      // inside the screen, or between the eyes (the face covers the frame's lip there)
      if (!(y >= s.y + 1 && x > s.x && x < s.x + s.w - 1) && !(Math.abs(x - cx + 0.5) < between)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), e = Rr - r;
      if (e < 0) continue;
      let c;
      if (e < 1) { if ((x + y) & 1) continue; c = P.faceO; }
      else if (e < 2) c = P.faceDD;
      else if (e < (2.4 + 3.6 * (dx / (r || 1)) ** 2) * k) c = P.faceD;
      else c = P.face;
      UI.put(fb, x, y, c);
    }
    drawMouth(fb, G, f, pop, t);
  }
  // the grin of the reference: a slanted crescent of big white teeth, rising to the right
  const MOUTH_U = [[-7.2, 32.4], [-3.5, 32.5], [0.5, 31.8], [4, 29.6], [6.4, 27.3], [8.2, 26.6]];
  const MOUTH_L = [[-7.4, 33.6], [-6, 35.4], [-3, 36.9], [1, 36.5], [4.5, 34.5], [7, 31.4], [8.4, 28.2]];
  const lineAt = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); } return pts[pts.length - 1][1]; };
  function drawMouth(fb, G, f, pop, t) {
    const F = D.face, m = F.mood, cx = f.cx, cy = f.cy;
    const happy = m === 'happy' || m === 'wink' || m === 'love';
    const talk = F.talk ? Math.abs(Math.sin(D.rt * 17)) : 0;
    const sc = (f.r / 33) * pop * (happy ? 1.22 : 1);
    const out = 0xff483224, lit = 0xffded6bf;
    if (m === 'wow') { const x = Math.round(cx + 1 * sc), y = Math.round(cy + 18 * sc), r = Math.max(2, Math.round(3.6 * sc)); UI.disc(fb, x, y, r + 1, out); UI.disc(fb, x, y, r, P.mouth); if (r > 2) UI.hline(fb, x - 1, x + 1, y + r - 1, P.tongue); return; }
    if (m === 'sad' || m === 'dizzy') {
      const w = Math.round(7.5 * sc), y0 = cy + 20 * sc;
      for (let i = -w; i <= w; i++) { const kx = i / w, yy = m === 'sad' ? Math.round(kx * kx * 3 * sc) : Math.round(Math.sin(i * 0.9 + D.rt * 8)); UI.put(fb, cx + i, Math.round(y0 + yy), out); UI.put(fb, cx + i, Math.round(y0 + yy + 1), out); }
      return;
    }
    const open = happy ? 0.75 + talk * 0.25 : talk, drop = open * 3.4;
    const tx = (x) => cx + (x + 1.2) * sc, ty = (y) => cy + (y - 15) * sc;
    const xu0 = MOUTH_L[0][0], xu1 = MOUTH_L[MOUTH_L.length - 1][0];
    const yTop = (X) => (happy ? lineAt(MOUTH_U, X) * 0.4 + 31 * 0.6 - (X * 0.15) : lineAt(MOUTH_U, X));
    const yBot = (X) => lineAt(MOUTH_L, X) + drop * (0.5 + 0.5 * clamp((8 - X) / 12, 0, 1)) + (happy ? 1.2 : 0);
    const inside = (x, y) => { const X = (x - cx) / sc - 1.2, Y = (y - cy) / sc + 15; return X >= xu0 && X <= xu1 && Y >= yTop(X) && Y <= yBot(X) ? [X, Y] : null; };
    const band = 2.5, xa = Math.floor(tx(xu0) - 2), xb = Math.ceil(tx(xu1) + 2), ya = Math.floor(ty(26) - 3), yb = Math.ceil(ty(38 + drop + 2));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const q = inside(x + 0.5, y + 0.5);
      if (!q) {
        if (inside(x + 1.5, y + 0.5) || inside(x - 0.5, y + 0.5) || inside(x + 0.5, y + 1.5) || inside(x + 0.5, y - 0.5)) UI.put(fb, x, y, out);
        else if (inside(x + 0.5, y + 2.5) && sc > 0.8) UI.put(fb, x, y, P.faceDD);   // a soft shadow over the teeth
        continue;
      }
      const [X, Y] = q, fT = (Y - yTop(X)) * sc, fB = (yBot(X) - Y) * sc, bw = band * sc;
      let c = 0xffffffff;
      if (open > 0.12 && fT > bw && fB > bw * 0.85) c = happy && fB < bw * 1.9 && Math.abs(X) < 4 ? P.tongue : P.mouth;
      else if (fB <= bw * 0.85 + (open > 0.12 ? 0 : 99) && fT > bw && open > 0.12) c = 0xffffffff;
      if (c === 0xffffffff) {
        const lower = open > 0.12 ? fB <= bw * 0.85 : fT > (yBot(X) - yTop(X)) * sc * 0.45;
        const seps = lower ? [-2.8, 2.2] : [-1.2, 3.5];
        for (const sx of seps) if (Math.abs(X - sx) * sc < 0.5) c = out;
        if (c !== out && ((lower && fB < 1) || (!lower && open > 0.12 && fT > bw - 1 && fT <= bw))) c = lit;
      }
      UI.put(fb, x, y, c);
    }
  }
  // the eyes and the dark bridge sit ON the top frame, over the screen's top edge
  function drawEyes(fb, G, t) {
    const F = D.face, k = G.k, cx = G.cx, oy = G.oy, m = F.mood;
    const X = (u) => cx + u * k, Y = (v) => oy + v * k;
    const OUT = 0xff231d1e, W = 0xffffffff, LIT = 0xffded8c2, PUP = 0xff241e1f;
    // the bridge: a thick grey ring with a dark core (the antenna rises out of it), open only at the bottom
    {
      const bcx = cx, bcy = Y(16.2), rx = 10 * k, ry = 13 * k, irx = 5.8 * k, iry = 7.6 * k;
      for (let y = Math.floor(bcy - ry - 1); y <= Math.ceil(bcy + 1.2 * k); y++) for (let x = Math.floor(bcx - rx - 1); x <= Math.ceil(bcx + rx + 1); x++) {
        const dx = x + 0.5 - bcx, dy0 = y + 0.5 - bcy, dy = Math.min(0, dy0), e = (dx / rx) ** 2 + (dy / ry) ** 2, ei = (dx / irx) ** 2 + (dy / iry) ** 2;
        if (e > 1) continue;
        if (dy0 > -2.4 * k && Math.abs(dx) < 2.6 * k + Math.max(0, dy0 + 2.4 * k) * 1.2) continue;   // the little opening onto the face
        const edge = (dx / (rx - 1)) ** 2 + (dy / (ry - 1)) ** 2 > 1;
        let c;
        if (edge) c = OUT;
        else if (ei < 1) c = ei > 0.6 ? 0xff372f2d : 0xff272120;
        else { const up = -dy / ry; c = up > 0.74 ? 0xff7c6e5f : up > 0.5 ? 0xff5a534b : 0xff463d3a; if (ei < 1.3) c = 0xff3c3431; }
        UI.put(fb, x, y, c);
      }
    }
    // gaze
    const lx = F.lx, ly = F.ly;
    D.eyeAt = [cx, Math.round(Y(12))];
    const blink = F.blinkT > 0 || F.pop < 0.9 || (D.t < 0.78 && !D.closing);
    for (const sd of [-1, 1]) {
      // tall ovals whose tops lean outwards; the pupil is a wide dark band across the middle
      const ex = X(sd * 18.9), ey = Y(10.4), rx = 9.6 * k, ry = 16 * k, th = sd * 0.32, cs = Math.cos(th), sn = Math.sin(th);
      let em = m;
      if (m === 'wink' && sd === 1) em = 'shut';
      if (blink && em !== 'x') em = 'shut';
      const sq = em === 'shut' ? 0.16 : 1;
      const loc = (x, y) => { const dx = x - ex, dy = y - ey; return [dx * cs + dy * sn, -dx * sn + dy * cs]; };
      const inE = (x, y) => { const [a, b] = loc(x, y); return (a / rx) ** 2 + (b / (ry * sq)) ** 2 <= 1; };
      const x0 = Math.floor(ex - ry - 3), x1 = Math.ceil(ex + ry + 3), y0 = Math.floor(ey - ry - 3), y1 = Math.ceil(ey + ry + 3);
      const small = em === 'wow', down = em === 'sad' ? 4 : 0;
      // the pupil in the eye's own frame (a: across, b: along the oval)
      const pa = -sd * 0.6 + lx * 2 * (small ? 1.8 : 1) + (em === 'dizzy' ? Math.cos(D.rt * 9) * 2.5 : 0);
      const pb = -0.6 + ly * 3.4 + down + (em === 'dizzy' ? Math.sin(D.rt * 9) * 3 : 0);
      const pra = (small ? 3.4 : 5.7) * k, prb = (small ? 3.8 : 5.9) * k;
      const happyE = em === 'happy' || em === 'love' || (em === 'wink' && sd !== 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px2 = x + 0.5, py2 = y + 0.5;
        if (!inE(px2, py2)) { if (inE(px2 + 1, py2) || inE(px2 - 1, py2) || inE(px2, py2 + 1) || inE(px2, py2 - 1)) UI.put(fb, x, y, OUT); continue; }
        const [a, b] = loc(px2, py2);
        if (em === 'shut') { UI.put(fb, x, y, b > 0 ? LIT : W); continue; }
        if (happyE) {
          // "^" eyes: the lower part of the oval is hidden behind a second oval
          const e2 = (bb) => (a / (rx * 1.05)) ** 2 + ((bb - ry * 0.66) / (ry * 0.8)) ** 2 <= 1;
          if (e2(b)) { if (!e2(b - 1.5)) UI.put(fb, x, y, OUT); continue; }
          UI.put(fb, x, y, (a / rx) ** 2 + (b / ry) ** 2 > 0.72 && b > -ry * 0.3 ? LIT : W); continue;
        }
        let c = b > ry * 0.78 || ((a / rx) ** 2 + (b / ry) ** 2 > 0.84 && b > ry * 0.25) ? LIT : W;
        if (em === 'x') { const r = rx * 0.7; if (Math.abs(Math.abs(a) - Math.abs(b)) < 1.1 && Math.abs(a) < r) c = PUP; UI.put(fb, x, y, c); continue; }
        const qa = a - pa * k, qb = b - pb * k, pe = (qa / pra) ** 2 + (qb / prb) ** 2;
        if (pe <= 1) c = PUP;
        else if (!small && em !== 'sad' && -sd * qa > 0 && qb > -3 * k && qb < -1 * k) c = PUP;   // the band towards the bridge
        else if (!small && em !== 'sad' && ((qa - sd * 4.8 * k) / (2.2 * k)) ** 2 + ((qb - 4.2 * k) / (1.5 * k)) ** 2 <= 1) c = PUP;   // the little tail, low on the outer side
        if (c === PUP && !small && pe <= 1 && ((qa - sd * 2.1 * k) / (2 * k)) ** 2 + ((qb - 3.1 * k) / (1.4 * k)) ** 2 <= 1) c = W;   // the glint low in the pupil
        if (em === 'sad' && b < -ry * 0.42) c = OUT;
        UI.put(fb, x, y, c);
      }
    }
  }
  /* ---------- around the device: title + back on the left, Rotom's speech + close on the right ---------- */
  const OL = 0xff321410;
  function sideLayout(G) {
    const lw = G.ox - 10, rw = G.W - (G.ox + G.DW) - 10;
    return { lr: lw >= 64 && rw >= 64, lx: 6, lw, rx: G.ox + G.DW + 6, rw };
  }
  function drawSide(fb, G, t) {
    const L = sideLayout(G), pg = D.page;
    // close (always): a round red X in the top-right corner
    {
      const r = G.C ? 7 : 8, cx = G.W - r - 5, cy = r + 5, id = 'x', pr = D.press && D.press.b && D.press.b.id === id, hv = D.hoverId === id;
      UI.disc(fb, cx, cy + 1, r + 1, OL); UI.disc(fb, cx, cy + (pr ? 1 : 0), r, 0xffffffff); UI.disc(fb, cx, cy + (pr ? 1 : 0), r - 1, hv ? P.red : P.redD);
      const q = r - 4, yy = cy + (pr ? 1 : 0);
      for (let i = -q; i <= q; i++) { UI.put(fb, cx + i, yy + i, 0xffffffff); UI.put(fb, cx + i, yy - i, 0xffffffff); UI.put(fb, cx + i + 1, yy + i, 0xffffffff); UI.put(fb, cx + i + 1, yy - i, 0xffffffff); }
      btn(id, cx - r - 8, cy - r - 6, r * 2 + 14, r * 2 + 14, () => close());
    }
    const title = pageTitle(pg), sub = SUB[pg] ? SUB[pg]() : '', right = RIGHT[pg] ? RIGHT[pg]() : '';
    if (L.lr) {
      let y = Math.max(G.top + 2, G.oy - Math.round(22 * G.k));
      const x = L.lx + 4, w = L.lw - 6;
      if (pg !== 'home') { sideBtn(fb, 'back', x, y, pg === 'entry' ? '{left} POKéDEX' : '{left} HOME', () => back()); y += 20; }
      UI.img(fb, glyph(pageIcon(pg), 14), x, y + 1, 1);
      Font.draw(fb, fit(title, w - 18, 'title'), x + 18, y + 2, 0xffffffff, { font: 'title', outline: OL });
      y += 20;
      const lines = [];
      if (pg === 'home') { const hr = Game.hour(); lines.push((hr === 'night' || hr === 'dusk' ? '{moon} ' : '{sun} ') + hr.toUpperCase()); if (Game.areaId) lines.push(areaName(Game.areaId).toUpperCase()); if (hasP()) lines.push('LV ' + Progress.level() + ' ' + rank().toUpperCase()); lines.push('{coin} ' + Save.data.points); }
      else { if (sub) for (const s2 of Font.wrap(sub, 'small', w)) lines.push(s2); if (right) lines.push(right); }
      for (const ln of lines.slice(0, 6)) { Font.draw(fb, fit(ln, w), x, y, 0xffffece8, { font: 'small', outline: OL }); y += 10; }
    } else {
      // no room at the sides (portrait): a compact title bar at the top left
      const x = 5, y = 4;
      if (pg !== 'home') sideBtn(fb, 'back', x, y, '{left}', () => back());
      Font.draw(fb, fit(title + (sub ? '  ' + sub : ''), G.W - 60), x + (pg !== 'home' ? 22 : 0), y + 4, 0xffffffff, { font: 'small', outline: OL });
    }
    drawBubble(fb, G, L, t);
  }
  function sideBtn(fb, id, x, y, label, fn) {
    const pr = D.press && D.press.b && D.press.b.id === id, hv = D.hoverId === id, w = Font.measure(label, 'small') + 12, h = 13, o = pr ? 1 : 0;
    UI.rrect(fb, x, y + 1, w, h, 5, OL);
    UI.rrect(fb, x, y + o, w, h, 5, OL);
    UI.rrect(fb, x + 1, y + 1 + o, w - 2, h - 2, 4, hv ? 0xffffffff : 0xffffece8);
    UI.hline(fb, x + 3, x + w - 4, y + h - 2 + o, 0xffe8c4b8);
    Font.draw(fb, label, x + w / 2, y + 4 + o, P.text, { font: 'small', align: 'center' });
    btn(id, x - 4, y - 4, w + 8, h + 8, fn);
  }
  function drawBubble(fb, G, L, t) {
    const Ln = D.line; if (!Ln || Ln.t < 0) return false;
    if (Ln.life - Ln.t < 0.3 && Math.floor(Ln.t * 20) % 2) return true;
    let x0, y0, w, tail;
    if (L.lr) { x0 = L.rx + 4; w = Math.min(L.rw - 6, 170); y0 = Math.max(G.C ? 22 : 26, G.oy - Math.round(14 * G.k)); tail = 'left'; }
    else { w = Math.min(G.W - 16, 220); x0 = Math.round((G.W - w) / 2); y0 = G.bottom() + 4; tail = 'up'; if (y0 + 30 > G.H) { y0 = G.scr.y + G.scr.h - 34; tail = 'none'; } }
    const lines = Font.wrap(Ln.text.replace(/★/g, '{star}'), 'small', w - 12).slice(0, L.lr ? 7 : 4);
    const bw = Math.min(w, Math.max(...lines.map((l) => Font.measure(l, 'small'))) + 12), bh = lines.length * 9 + 7;
    const by = y0 + (Ln.t < 0.1 ? Math.round((1 - Ln.t / 0.1) * 3) : 0);
    if (tail === 'up') x0 = Math.round((G.W - bw) / 2);
    UI.rrect(fb, x0 + 1, by + 2, bw, bh, 5, 0x80321410);
    UI.rrect(fb, x0, by, bw, bh, 5, OL);
    UI.rrect(fb, x0 + 1, by + 1, bw - 2, bh - 2, 4, P.white);
    UI.hline(fb, x0 + 4, x0 + bw - 5, by + bh - 2, 0xfff4d8d0);
    if (tail === 'left') {
      // a tail pointing back at Rotom
      const ty = by + Math.min(bh - 6, 7);
      for (let kk = 1; kk <= 4; kk++) { UI.vline(fb, x0 - kk + 1, ty - (4 - kk), ty + (4 - kk) - 1, kk === 4 ? OL : P.white); UI.put(fb, x0 - kk + 1, ty - (5 - kk), OL); UI.put(fb, x0 - kk + 1, ty + (4 - kk), OL); }
    } else if (tail === 'up') {
      const tx = x0 + (bw >> 1);
      for (let kk = 1; kk <= 4; kk++) { UI.hline(fb, tx - (4 - kk), tx + (4 - kk), by - kk + 1, kk === 4 ? OL : P.white); UI.put(fb, tx - (5 - kk), by - kk + 1, OL); UI.put(fb, tx + (5 - kk), by - kk + 1, OL); }
    }
    let left = Math.floor(Ln.t * 42);
    lines.forEach((ln, i) => { if (left <= 0) return; const part = ln.slice(0, left); left -= ln.length; Font.draw(fb, part, x0 + 6, by + 4 + i * 9, P.text, { font: 'small' }); });
    return true;
  }
  const SUB = {
    dex: () => { const c = counts(); return 'SEEN ' + c.seen + ' · CAUGHT ' + c.caught + '/' + c.all; },
    entry: () => { const d = DexData.S[D.sel]; return d ? 'NO.' + pad3(d.no) + ' ' + d.name.toUpperCase() : ''; },
    ency: () => (D.tab.ency === 'beh' ? 'BEHAVIOURS & RARE MOMENTS' : 'HABITATS OF HOENN'),
    quests: () => { const q = questList(); return q.filter((e) => e.s === 'ready').length + ' READY · ' + q.filter((e) => e.s === 'active').length + ' ACTIVE'; },
    prog: () => (hasP() ? 'MUDKIP LV ' + Progress.level() : 'COMPLETION'),
    album: () => Save.data.album.length + ' / ' + (Save.data.albumMax || 24) + ' PHOTOS',
    mail: () => { const n = mailUnread(); return n ? n + ' UNREAD' : 'ALL READ'; },
    settings: () => 'SOUND · MUSIC · ROTOM',
    style: () => UI.skin().name.toUpperCase(),
    shop: () => '{coin} ' + Save.data.points + ' POINTS',
    disc: () => SECRETS.filter((x) => Save.found(x[0])).length + ' / ' + SECRETS.length + ' FOUND',
    tms: () => Moves.LIST.filter((m) => Moves.has(m.id)).length + ' / ' + Moves.LIST.length + ' MOVES',
    time: () => Game.hour().toUpperCase() + (typeof Seasons !== 'undefined' ? ' · ' + Seasons.NAME[Seasons.cur].toUpperCase() : ''),
    chat: () => 'TALK TO ROTOM',
    help: () => 'HOW TO PLAY',
  };
  const RIGHT = {
    dex: () => { const c = counts(); return Math.round((c.caught / Math.max(1, c.all)) * 100) + '% DONE'; },
    entry: () => { const L = DexData.ORDER.filter((s) => stat(s) > 0); return (L.indexOf(D.sel) + 1) + ' / ' + L.length; },
    shop: () => rank().toUpperCase(),
  };

  /* ---------- app icons: tiny vector painter → cached pixel glyphs ---------- */
  const ICO = new Map();
  const W_ = 0xfffff9f8;
  function glyph(id, n, olc, ref) {
    const key = id + '|' + n + '|' + (olc || 0) + (ref ? '|r' : '');
    if (ICO.has(key)) return ICO.get(key);
    const b = new PX.Buf(n, n), d = b.d;
    const S = (fn) => { for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const c = fn((i + 0.5) / n, (j + 0.5) / n); if (c) d[j * n + i] = c; } };
    const ell = (cx, cy, rx, ry = rx) => (u, v) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1;
    const box = (x0, y0, x1, y1) => (u, v) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
    const rbox = (x0, y0, x1, y1, r) => (u, v) => { if (u < x0 || u > x1 || v < y0 || v > y1) return false; const dx = Math.max(x0 + r - u, 0, u - (x1 - r)), dy = Math.max(y0 + r - v, 0, v - (y1 - r)); return dx * dx + dy * dy <= r * r; };
    const poly = (pts) => (u, v) => inPoly(pts, u, v);
    const seg = (x0, y0, x1, y1, w) => (u, v) => segDist(u, v, x0, y0, x1, y1)[0] <= w;
    const and = (...fs) => (u, v) => fs.every((f) => f(u, v));
    const not = (f) => (u, v) => !f(u, v);
    const fill = (f, c) => S((u, v) => (f(u, v) ? c : 0));
    const clr = (f) => { for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (f((i + 0.5) / n, (j + 0.5) / n)) d[j * n + i] = 0; };
    const H = hex;
    const G = {
      dex() {
        const R = ell(0.5, 0.5, 0.45);
        fill(and(R, (u, v) => v < 0.5), H('#ee3b45')); fill(and(R, (u, v) => v >= 0.5), W_);
        fill(and(R, ell(0.36, 0.3, 0.13, 0.09)), H('#ff9a9a'));
        fill(and(R, (u, v) => Math.abs(v - 0.5) < 0.07), H('#1a1430'));
        fill(ell(0.5, 0.5, 0.18), H('#1a1430')); fill(ell(0.5, 0.5, 0.1), W_);
      },
      ency() {
        fill(poly([[0.03, 0.8], [0.5, 0.9], [0.97, 0.8], [0.97, 0.86], [0.5, 0.96], [0.03, 0.86]]), H('#1f7a44'));
        fill(poly([[0.06, 0.2], [0.48, 0.3], [0.48, 0.88], [0.06, 0.78]]), H('#fff1d0'));
        fill(poly([[0.52, 0.3], [0.94, 0.2], [0.94, 0.78], [0.52, 0.88]]), W_);
        fill(box(0.47, 0.28, 0.53, 0.9), H('#8a5a3a'));
        for (const v of [0.42, 0.54, 0.66]) fill(seg(0.12, v - 0.04, 0.4, v + 0.02, 0.022), H('#c8b89a'));
        fill(ell(0.73, 0.52, 0.13, 0.15), H('#44c060')); fill(seg(0.66, 0.64, 0.8, 0.4, 0.02), H('#1f7a44'));
      },
      quests() {
        fill(box(0.22, 0.18, 0.78, 0.82), H('#fff0c8'));
        fill(rbox(0.12, 0.08, 0.88, 0.24, 0.07), H('#e8b868')); fill(rbox(0.12, 0.76, 0.88, 0.92, 0.07), H('#e8b868'));
        fill(box(0.12, 0.14, 0.88, 0.16), H('#c08a3a')); fill(box(0.12, 0.82, 0.88, 0.84), H('#c08a3a'));
        fill(rbox(0.44, 0.3, 0.56, 0.58, 0.04), H('#e8323c')); fill(ell(0.5, 0.68, 0.065), H('#e8323c'));
      },
      prog() {
        fill(and(ell(0.2, 0.32, 0.15, 0.14), not(ell(0.2, 0.32, 0.08, 0.07))), H('#e8a820'));
        fill(and(ell(0.8, 0.32, 0.15, 0.14), not(ell(0.8, 0.32, 0.08, 0.07))), H('#e8a820'));
        fill(poly([[0.2, 0.12], [0.8, 0.12], [0.76, 0.4], [0.62, 0.56], [0.38, 0.56], [0.24, 0.4]]), H('#ffc83a'));
        fill(box(0.3, 0.16, 0.37, 0.4), H('#fff2a8'));
        fill(box(0.43, 0.54, 0.57, 0.7), H('#d89418'));
        fill(rbox(0.26, 0.7, 0.74, 0.88, 0.03), H('#7a4a24')); fill(box(0.36, 0.74, 0.64, 0.8), H('#ffe07a'));
      },
      map() {
        fill(poly([[0.06, 0.2], [0.36, 0.1], [0.36, 0.82], [0.06, 0.92]]), H('#f4e6b0'));
        fill(poly([[0.36, 0.1], [0.64, 0.2], [0.64, 0.92], [0.36, 0.82]]), H('#cfe8a4'));
        fill(poly([[0.64, 0.2], [0.94, 0.1], [0.94, 0.82], [0.64, 0.92]]), H('#f4e6b0'));
        fill(seg(0.1, 0.7, 0.4, 0.55, 0.035), H('#5ab0ff')); fill(seg(0.4, 0.55, 0.9, 0.62, 0.035), H('#5ab0ff'));
        fill(ell(0.62, 0.36, 0.13), H('#e8323c')); fill(poly([[0.51, 0.42], [0.73, 0.42], [0.62, 0.62]]), H('#e8323c')); fill(ell(0.62, 0.35, 0.05), W_);
      },
      album() {
        fill(rbox(0.3, 0.16, 0.56, 0.32, 0.03), H('#3a4058'));
        fill(rbox(0.06, 0.26, 0.94, 0.84, 0.08), H('#3a4058'));
        fill(box(0.06, 0.4, 0.94, 0.46), H('#4c5470'));
        fill(ell(0.5, 0.56, 0.24), H('#d8dde8')); fill(ell(0.5, 0.56, 0.17), H('#2a78d8')); fill(ell(0.5, 0.56, 0.08), H('#8ad0ff')); fill(ell(0.44, 0.5, 0.04), W_);
        fill(box(0.74, 0.32, 0.87, 0.4), H('#ffe07a')); fill(ell(0.17, 0.36, 0.045), H('#ff5a5a'));
      },
      mail() {
        fill(box(0.08, 0.24, 0.92, 0.8), W_);
        fill(poly([[0.08, 0.8], [0.44, 0.52], [0.56, 0.52], [0.92, 0.8]]), H('#e2e6f4'));
        fill(poly([[0.08, 0.24], [0.92, 0.24], [0.5, 0.58]]), H('#d2d8ee'));
        fill(seg(0.1, 0.26, 0.5, 0.58, 0.02), H('#8a92b8')); fill(seg(0.9, 0.26, 0.5, 0.58, 0.02), H('#8a92b8'));
        fill(ell(0.5, 0.56, 0.08), H('#e8323c'));
      },
      settings() {
        S((u, v) => { const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), R = 0.31 + (Math.cos(a * 8) > 0.15 ? 0.11 : 0); return r <= R && r > 0.12 ? (r < 0.23 ? H('#f0f3f8') : (dx + dy < 0 ? H('#d8dde8') : H('#aeb6c8'))) : 0; });
      },
      style() {
        fill(poly([[0.3, 0.12], [0.42, 0.18], [0.58, 0.18], [0.7, 0.12], [0.94, 0.34], [0.8, 0.48], [0.72, 0.42], [0.72, 0.88], [0.28, 0.88], [0.28, 0.42], [0.2, 0.48], [0.06, 0.34]]), W_);
        fill(ell(0.5, 0.15, 0.1, 0.06), 0);
        fill(and(ell(0.5, 0.56, 0.14), (u, v) => v < 0.56), H('#ee3b45')); fill(and(ell(0.5, 0.56, 0.14), (u, v) => v >= 0.56), H('#e8e8f0'));
        fill(and(ell(0.5, 0.56, 0.14), (u, v) => Math.abs(v - 0.56) < 0.025), H('#1a1430')); fill(ell(0.5, 0.56, 0.045), H('#1a1430'));
      },
      shop() {
        fill(seg(0.04, 0.16, 0.2, 0.22, 0.04), H('#3a4058')); fill(seg(0.2, 0.22, 0.3, 0.68, 0.04), H('#3a4058'));
        fill(poly([[0.2, 0.26], [0.94, 0.26], [0.84, 0.6], [0.28, 0.6]]), W_);
        for (const u of [0.42, 0.6, 0.76]) fill(seg(u, 0.28, u - 0.04, 0.58, 0.018), H('#b8c0d8'));
        fill(seg(0.24, 0.43, 0.9, 0.43, 0.018), H('#b8c0d8'));
        fill(seg(0.3, 0.7, 0.84, 0.7, 0.04), H('#3a4058'));
        fill(ell(0.36, 0.83, 0.075), H('#3a4058')); fill(ell(0.76, 0.83, 0.075), H('#3a4058'));
        fill(and(ell(0.56, 0.2, 0.12), (u, v) => v < 0.26), H('#ffc83a'));
      },
      disc() {
        fill(seg(0.58, 0.58, 0.86, 0.86, 0.075), H('#7a4a2a'));
        fill(and(ell(0.4, 0.4, 0.3), not(ell(0.4, 0.4, 0.21))), H('#d8dde8'));
        fill(ell(0.4, 0.4, 0.21), H('#9ad8ff')); fill(ell(0.33, 0.33, 0.06), W_);
        S((u, v) => { const dx = Math.abs(u - 0.78), dy = Math.abs(v - 0.2); return dx + dy * 3.2 < 0.12 || dx * 3.2 + dy < 0.12 ? H('#ffe070') : 0; });
      },
      tms() {
        S((u, v) => { const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy); if (r > 0.45 || r < 0.09) return 0; if (r < 0.16) return H('#dff6f2'); const a = Math.atan2(dy, dx); return Math.sin(a * 2 + 0.6) > 0.55 ? H('#c8fff4') : r > 0.4 ? H('#3ab8a8') : H('#6ee0cc'); });
      },
      time() {
        S((u, v) => { const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy); if (u < 0.5) { if (r < 0.26) return H('#ffd23a'); const a = Math.atan2(dy, dx); if (r > 0.33 && r < 0.46 && Math.cos(a * 8) > 0.6) return H('#ffb020'); return 0; } if (r < 0.3) return H('#26307a'); return 0; });
        fill(and(ell(0.56, 0.48, 0.2, 0.24), not(ell(0.66, 0.42, 0.17, 0.21)), (u, v) => u >= 0.5), H('#fff0b0'));
        fill(ell(0.8, 0.26, 0.03), W_); fill(ell(0.72, 0.72, 0.025), W_);
      },
      chat() {
        fill(rbox(0.06, 0.14, 0.94, 0.68, 0.15), W_); fill(poly([[0.24, 0.62], [0.44, 0.62], [0.18, 0.9]]), W_);
        for (const u of [0.3, 0.5, 0.7]) fill(ell(u, 0.41, 0.065), H('#2fb8e4'));
      },
      help() {
        fill(ell(0.5, 0.5, 0.44), W_);
        fill(and(ell(0.5, 0.38, 0.2, 0.18), not(ell(0.5, 0.38, 0.09, 0.075)), (u, v) => !(v > 0.38 && u < 0.5)), H('#6c7a20'));
        fill(box(0.44, 0.48, 0.56, 0.62), H('#6c7a20')); fill(ell(0.5, 0.75, 0.07), H('#6c7a20'));
      },
      bag() {
        fill(and(ell(0.5, 0.24, 0.15, 0.13), not(ell(0.5, 0.24, 0.08, 0.07)), (u, v) => v < 0.26), H('#5a3418'));
        fill(rbox(0.16, 0.24, 0.84, 0.92, 0.13), H('#f0983a'));
        fill(rbox(0.16, 0.24, 0.84, 0.5, 0.13), H('#c8641e'));
        fill(rbox(0.3, 0.6, 0.7, 0.84, 0.06), H('#ffb866'));
        fill(box(0.45, 0.44, 0.55, 0.56), H('#ffd23a'));
      },
      music() {
        fill(ell(0.3, 0.74, 0.15, 0.12), W_); fill(ell(0.74, 0.64, 0.15, 0.12), W_);
        fill(box(0.4, 0.2, 0.47, 0.74), W_); fill(box(0.84, 0.12, 0.9, 0.64), W_);
        fill(poly([[0.4, 0.2], [0.9, 0.08], [0.9, 0.26], [0.4, 0.38]]), W_);
        fill(ell(0.26, 0.71, 0.05, 0.03), H('#ffe0a0'));
      },
      games() {
        fill(rbox(0.06, 0.3, 0.94, 0.8, 0.18), W_);
        fill(box(0.2, 0.5, 0.38, 0.58), H('#3a3a5a')); fill(box(0.25, 0.44, 0.33, 0.64), H('#3a3a5a'));
        fill(ell(0.68, 0.48, 0.06), H('#ff4a5a')); fill(ell(0.8, 0.6, 0.06), H('#4a8aff'));
      },
      sound() {
        fill(box(0.12, 0.38, 0.3, 0.62), W_); fill(poly([[0.3, 0.38], [0.52, 0.18], [0.52, 0.82], [0.3, 0.62]]), W_);
        fill(and(ell(0.52, 0.5, 0.26), not(ell(0.52, 0.5, 0.18)), (u) => u > 0.62), W_);
        fill(and(ell(0.52, 0.5, 0.42), not(ell(0.52, 0.5, 0.34)), (u) => u > 0.7), W_);
      },
    };

    // reference-style pictograms (drawn in full-tile space, clipped to the tile's rounded face)
    const NV = H('#1e2a66'), WH = 0xffffffff;
    const R2 = {
      chat() {
        // a chunky white game-pad bubble with two eyes
        fill(poly([[0.22, 0.3], [0.38, 0.25], [0.42, 0.3], [0.58, 0.3], [0.62, 0.25], [0.78, 0.3], [0.86, 0.6], [0.8, 0.72], [0.66, 0.7], [0.62, 0.64], [0.38, 0.64], [0.34, 0.7], [0.2, 0.72], [0.14, 0.6]]), WH);
        fill(ell(0.39, 0.5, 0.075, 0.085), H('#5c6af0')); fill(ell(0.61, 0.5, 0.075, 0.085), H('#5c6af0'));
      },
      shop() {
        fill(seg(0.12, 0.3, 0.22, 0.3, 0.035), NV); fill(seg(0.22, 0.3, 0.32, 0.66, 0.035), NV);
        fill(poly([[0.24, 0.36], [0.86, 0.36], [0.78, 0.62], [0.31, 0.62]]), WH);
        S((u, v) => (inPoly([[0.27, 0.39], [0.82, 0.39], [0.76, 0.59], [0.33, 0.59]], u, v) && ((Math.floor(u * 22) + Math.floor(v * 22)) & 1) ? H('#c8ccd8') : 0));
        fill(seg(0.32, 0.7, 0.8, 0.7, 0.03), NV);
        fill(ell(0.38, 0.8, 0.06), NV); fill(ell(0.74, 0.8, 0.06), NV); fill(ell(0.38, 0.8, 0.025), WH); fill(ell(0.74, 0.8, 0.025), WH);
      },
      help() {
        const q = (u, v, g) => (and(ell(0.5, 0.38, 0.19 + g, 0.17 + g), not(ell(0.5, 0.38, 0.09 - g, 0.075 - g)), (u2, v2) => !(v2 > 0.38 && u2 < 0.5))(u, v) || box(0.44 - g, 0.5, 0.56 + g, 0.64 + g)(u, v) || ell(0.5, 0.78, 0.065 + g)(u, v));
        fill((u, v) => q(u, v, 0.035), H('#3c7a3c')); fill((u, v) => q(u, v, 0), H('#ffe040'));
      },
      mail() {
        fill(rbox(0.16, 0.3, 0.84, 0.74, 0.03), NV); fill(box(0.19, 0.33, 0.81, 0.71), WH);
        fill(seg(0.2, 0.34, 0.5, 0.56, 0.025), NV); fill(seg(0.8, 0.34, 0.5, 0.56, 0.025), NV);
      },
      prog() {
        S((u, v) => (v > 0.55 && ((Math.floor(u * 8) + Math.floor(v * 8)) & 1) ? H('#e8b020') : 0));
        S((u, v) => { const dx = u - 0.5, dy = v - 0.48, a = Math.atan2(dy, dx) + Math.PI / 2, r = Math.hypot(dx, dy), k = Math.cos((a * 5) / 2) ** 2, R = 0.16 + 0.22 * Math.pow(Math.abs(Math.cos(a * 2.5)), 3); return r < R + 0.035 ? (r < R ? (r < R * 0.5 ? H('#1a1a20') : H('#ffd23a')) : H('#1a1a20')) : 0; });
      },
      time() {
        fill(box(0, 0, 1, 1), H('#2c3c7c'));
        fill(ell(0.5, 1.02, 0.5, 0.22), H('#2a9a48')); fill(ell(0.5, 1.0, 0.44, 0.18), H('#4ad05a'));
        fill(ell(0.56, 0.28, 0.12), H('#ffc02a')); fill(ell(0.54, 0.26, 0.08), H('#ffe070'));
        fill(and(ell(0.24, 0.6, 0.12), not(ell(0.31, 0.55, 0.11))), H('#bfe8ff'));
        S((u, v) => { const dx = Math.abs(u - 0.78), dy = Math.abs(v - 0.58); return dx + dy * 3 < 0.09 || dx * 3 + dy < 0.09 ? WH : 0; });
        for (const [u, v] of [[0.2, 0.2], [0.36, 0.4], [0.82, 0.22], [0.86, 0.4]]) fill(ell(u, v, 0.022), WH);
      },
      tms() {
        S((u, v) => { const a = Math.atan2(v - 0.0, u - 0.5); return Math.sin(a * 9) > 0.3 ? H('#e4f2fc') : 0; });
        const ball = (cx, cy, r) => { fill(ell(cx, cy, r + 0.03), NV); fill(and(ell(cx, cy, r), (u, v) => v < cy), H('#ee3b45')); fill(and(ell(cx, cy, r), (u, v) => v >= cy), WH); fill(and(ell(cx, cy, r), (u, v) => Math.abs(v - cy) < 0.025), NV); fill(ell(cx, cy, r * 0.32), NV); fill(ell(cx, cy, r * 0.17), WH); };
        ball(0.32, 0.38, 0.22);
        fill(and(ell(0.5, 0.52, 0.3, 0.26), not(ell(0.5, 0.52, 0.22, 0.18)), (u, v) => v < 0.42 && u > 0.45), H('#f0b020'));
        fill(and(ell(0.5, 0.52, 0.3, 0.26), not(ell(0.5, 0.52, 0.22, 0.18)), (u, v) => v > 0.62 && u < 0.55), H('#f0b020'));
        fill(poly([[0.18, 0.6], [0.34, 0.6], [0.26, 0.72]]), H('#f0b020'));
        ball(0.68, 0.7, 0.22);
      },
      dex() {
        fill(and(ell(0.5, 0.52, 0.34), not(ell(0.5, 0.52, 0.25))), WH);
        fill(box(0.16, 0.48, 0.84, 0.56), WH);
        fill(ell(0.5, 0.52, 0.14), WH); fill(ell(0.5, 0.52, 0.08), H('#4c8ce8'));
      },
    };
    if (ref && R2[id]) R2[id](); else (G[id] || G.dex)();
    if (ref && R2[id]) { ICO.set(key, b); return b; }
    // sticker outline
    const OL = olc || 0xff38141a, m = new Uint8Array(d.length);
    for (let i = 0; i < d.length; i++) m[i] = d[i] ? 1 : 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; if (m[i]) continue; if ((x > 0 && m[i - 1]) || (x < n - 1 && m[i + 1]) || (y > 0 && m[i - n]) || (y < n - 1 && m[i + n])) d[i] = OL; }
    ICO.set(key, b);
    return b;
  }
  // a chunky rounded app tile: dark hue outline, glossy lighter top, darker base, a soft blue shadow ring
  const REF = { chat: 1, shop: 1, help: 1, mail: 1, prog: 1, time: 1, tms: 1, dex: 1 };
  // a chunky rounded app tile in the reference's style: thick dark-blue outline, glossy top-left highlight, darker bottom edge
  function appTile(fb, a, x, y, sz, t, on, pr, lk) {
    const r = Math.max(3, Math.round(sz * 0.2)), c = lk ? mix(a.c, 0xff9098a8, 0.75) : a.c, lt = mix(c, 0xffffffff, 0.3), dk = mix(c, 0xff000000, 0.22), ol = hex('#24307a');
    const o = pr ? 1 : 0, y2 = y + o;
    UI.rrect(fb, x - 1, y - 1 + 2, sz + 2, sz + 2, r + 1, P.icoSh);
    UI.rrect(fb, x - 1, y2 - 1, sz + 2, sz + 2, r + 1, on ? 0xffffffff : P.icoRing);
    UI.rrect(fb, x, y2, sz, sz, r, ol);
    const ref = REF[a.id], fw = sz - 4, g = ref ? glyph(a.id, fw, 0, 1) : null;
    const base = Math.max(2, Math.round(sz * 0.1)), hb = Math.max(2, Math.round(sz * 0.09));
    rrFill(fb, x + 2, y2 + 2, sz - 4, sz - 4, r - 2, (i, j, ins, w, h) => {
      let col = on ? mix(c, 0xffffffff, 0.08) : c;
      if (g) { const gc = g.d[j * fw + i]; if (gc) col = lk ? mix(gc, 0xff9098a8, 0.7) : gc; }
      if (j >= h - base) col = mix(col, 0xff000000, 0.22);
      else if (j < hb && i < w * 0.6 || i < hb && j < h * 0.6) col = mix(col, 0xffffffff, 0.3);
      if ((j === 0 && i > ins && i < w * 0.55) || (i === 0 && j > 1 && j < h * 0.5)) col = mix(col, 0xffffffff, 0.55);
      return col;
    });
    if (!ref) {
      const gs = Math.round(sz * 0.72), gl = glyph(a.id === 'sound' && !Sound.on ? 'sound' : a.id, gs, mix(c, 0xff30100a, 0.62));
      const bob = on ? Math.round(Math.sin(t * 5) * 1) : 0;
      UI.img(fb, gl, x + Math.round((sz - gs) / 2), y2 + Math.round((sz - gs) / 2) + bob, 1);
    }
  }
  function badge(fb, x, y, n, k = 1) {
    const s = n > 9 ? '9+' : n === true ? '!' : String(n), w = Math.max(9, Font.measure(s, 'small') + 5);
    if (k < 0.999) { const r = Math.max(1, Math.round(5 * k)); UI.disc(fb, x, y, r + 1, 0xffffffff); UI.disc(fb, x, y, r, 0xff3a30e8); return; }
    UI.disc(fb, x, y, 5, 0xffffffff); UI.rrect(fb, x - (w >> 1), y - 4, w, 9, 4, 0xffffffff);
    UI.rrect(fb, x - (w >> 1) + 1, y - 3, w - 2, 7, 3, 0xff3a30e8);
    Font.draw(fb, s, x + 1, y - 2, 0xffffffff, { font: 'small', align: 'center' });
  }
  function appBadge(id) {
    if (id === 'mail') return mailUnread();
    if (id === 'quests') { const n = questList().filter((e) => e.s === 'ready').length; return n || 0; }
    if (id === 'dex') return Quests.unseen() ? true : 0;
    if (id === 'bag') return typeof Bag !== 'undefined' && Bag.fresh && Bag.fresh() ? true : 0;
    if (id === 'style') return typeof Style !== 'undefined' && Style.fresh && Style.fresh() ? true : 0;
    return 0;
  }

  /* ---------- page: home (the app grid of the reference: two 2x2 groups, the page bar between the rows) ---------- */
  function pageHome(fb, G, t) {
    const s = G.scr, k = G.k, H = D.home, pages = Math.ceil(APPS.length / 8);
    const isz = Math.max(16, Math.round(34 * k));
    const colU = [-65, -27, 27, 65], rowU = [68.5, 122.5];
    const sl = Math.round(H.slide);
    let selA = null;
    for (let i = 0; i < 8; i++) {
      const a = APPS[H.pg * 8 + i]; if (!a) continue;
      const col = i % 4, row = i >> 2, cx = G.X(colU[col]) + sl, cy = G.Y(rowU[row]);
      const x = cx - (isz >> 1), y = cy - (isz >> 1);
      if (x + isz < s.x + 2 || x > s.x + s.w - 2) continue;
      const id = 'app-' + a.id, on = H.sel === i, pr = D.press && D.press.b && D.press.b.id === id;
      const lk = a.lock && a.lock();
      // entry cascade, hover lift, press squash and a springy bounce after a tap
      const intro = clamp((D.homeT - 0.05 * i) / 0.28, 0, 1), ik = intro < 1 ? U.ease.outBack(intro) : 1;
      const bo = D.bounce[a.id] || 0, bz = Math.round(Math.sin(bo * Math.PI * 3) * bo * 3);
      const hv = D.hoverId === id;
      const sz = Math.max(4, Math.round(isz * ik + (pr ? -2 : 0) + (hv && !pr ? 1 : 0) + (bo ? Math.abs(bz) * 0.6 : 0)));
      const lift = (on ? 1 : 0) + (hv && !pr ? 1 : 0) + bz + Math.round(Math.sin(t * 2.4 + i * 0.8) * 0.6 * (on ? 1 : 0));
      const x2 = cx - (sz >> 1), y2 = cy - (sz >> 1) - lift + (D.shake && on ? 0 : 0);
      const shx = lk && on && D.shake > 0 ? Math.round(Math.sin(D.shake * 60) * 2) : 0;
      if (ik > 0.05) appTile(fb, a, x2 + shx, y2, sz, t, on, pr, lk);
      if (lk && ik >= 1) {
        UI.rectA(fb, x2 + 1 + shx, y2 + 1, sz - 2, sz - 2, 0xff303850, 0.5);
        Font.icon(fb, 'lock', cx - 3 + shx, cy - 6 - lift, 1);
        const lt = 'LV' + featLv(a.id); UI.rrect(fb, cx - 9 + shx, cy + 2 - lift, 18, 8, 3, P.rim); Font.draw(fb, lt, cx + shx, cy + 3 - lift, 0xffffffff, { font: 'small', align: 'center' });
      }
      const bn = lk ? 0 : appBadge(a.id);
      if (bn && ik >= 1) { const bp = clamp((D.homeT - 0.3 - 0.05 * i) / 0.25, 0, 1); if (bp > 0) badge(fb, x2 + sz - 3 + shx, y2 + 2, bn, U.ease.outBack(bp)); }
      (D.tilePos || (D.tilePos = {}))[a.id] = [cx, cy];
      if (on) { D.lookAt = [cx, cy]; selA = a; }
      btn(id, x - 3, y - 3, isz + 6, isz + 6, () => { H.sel = i; SFX.select(); launch(a); }, { silent: true, hov: () => { if (H.sel !== i) { H.sel = i; SFX.blip && Math.random() < 0 && SFX.blip(); } } });
    }
    // the page bar between the rows:  ◀ ═══ ▶  (the selected app's name sits in the pill)
    const by = G.Y(96.5), bh = Math.max(7, Math.round(9.5 * k)), bw = Math.round(64 * k) + (G.C ? 10 : 0), bx = G.cx - (bw >> 1);
    lens(fb, bx, by - (bh >> 1), bw, bh);
    if (selA && D.showName) Font.draw(fb, fit((selA.lock && selA.lock() ? '{lock}' : '') + (selA.id === 'sound' ? (Sound.on ? 'SOUND ON' : 'SOUND OFF') : selA.name.toUpperCase()), bw - 8), G.cx, by - 2, 0xff7e3a1d, { font: 'small', align: 'center' });
    btn('pgbar', bx, by - bh, bw, bh * 2, () => { if (selA) { SFX.select(); launch(selA); } });
    const arrow = (dir) => {
      const en = dir < 0 ? H.pg > 0 : H.pg < pages - 1, id = 'pgarr' + dir, hv = D.hoverId === id && en;
      const ah = Math.max(3, Math.round(4.6 * k)), gp = Math.max(3, Math.round(6 * k)), tip = dir < 0 ? bx - gp - ah : bx + bw + gp + ah;
      // a soft triangle in the page bar's glassy blue, its flat side facing the pill
      for (let j = -ah; j <= ah; j++) {
        const a0 = dir < 0 ? tip + Math.abs(j) : tip - ah, a1 = dir < 0 ? tip + ah : tip - Math.abs(j);
        for (let x = a0; x <= a1; x++) {
          const edge = x === a0 || x === a1 || Math.abs(j) === ah;
          UI.put(fb, x, by + j, !en ? (edge ? P.barOffO : P.barOff) : edge ? P.barO : j < 0 ? (hv ? 0xffffffff : P.barL) : P.bar);
        }
      }
      btn(id, tip - 10, by - 9, 20, 18, () => flipHome(dir));
    };
    arrow(-1); arrow(1);
    // two tiny page dots under the pill
    if (pages > 1) for (let p = 0; p < pages; p++) { const dx = G.cx + (p - (pages - 1) / 2) * 6; UI.rect(fb, Math.round(dx) - 1, by + (bh >> 1) + 2, 3, 2, p === H.pg ? P.barO : P.barOff); }
  }
  // the glassy lens-shaped pill of the page bar
  function lens(fb, x, y, w, h) {
    const cy = y + h / 2;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w * 2 - 1, hh = (h / 2) * Math.sqrt(Math.max(0, 1 - Math.abs(u) ** 3.2));
      const ya = Math.round(cy - hh), yb = Math.round(cy + hh) - 1;
      for (let yy = ya; yy <= yb; yy++) {
        let c = yy === ya || yy === yb || i === 0 || i === w - 1 ? P.barO : yy - ya <= Math.max(1, (h >> 2)) ? P.barL : yy >= yb - 1 ? P.barD : P.bar;
        if (yy === ya + 1 && Math.abs(u) < 0.8) c = mix(P.barL, 0xffffffff, 0.35);
        UI.put(fb, x + i, yy, c);
      }
    }
  }

  /* ---------- page: Pokédex (main) ---------- */
  function dexList() {
    const f = D.filter, A = Game.areaId;
    return DexData.ORDER.filter((k) => f === 'all' || (f === 'here' ? (DexData.S[k].area || []).includes(A) : !Save.data.seen[k]));
  }
  const AREA_COL = { beach: ['#8fd8ff', '#f2dc9a'], forest: ['#a4e8b0', '#4f9e58'], canopy: ['#bdefff', '#79b95e'], falls: ['#7f8ad8', '#5a5a9a'], stage: ['#ffc0e0', '#b56aa0'], volcano: ['#ffb894', '#8e4636'], shoal: ['#d2f2ff', '#9ccfe8'] };
  function areaCols(a) { const c = AREA_COL[a] || ['#b8d8ff', '#8aa0c8']; return [hex(c[0]), hex(c[1])]; }
  const FILTERS = [['all', 'ALL'], ['here', 'HERE'], ['miss', 'MISSING']];
  function pageDex(fb, G, t) {
    const Q = content(G), tiny = Q.w < 150, [L, R] = split(Q, tiny ? 0.49 : 0.47, 3);
    const list = dexList();
    if (!D.sel || !DexData.S[D.sel]) D.sel = list[0] || DexData.ORDER[0];
    // one filter chip that cycles ALL / HERE / MISSING, the count on the right
    const chH = 11, fi = FILTERS.findIndex((f) => f[0] === D.filter), lab = FILTERS[Math.max(0, fi)][1] + ' {down}';
    const cw = Font.measure(lab, 'small') + 10, id = 'flt';
    pill(fb, L.x, L.y, cw, chH, D.hoverId === id ? P.white : P.scrLL, P.text, lab);
    btn(id, L.x - 2, L.y - 3, cw + 4, chH + 6, () => { D.filter = FILTERS[(Math.max(0, fi) + 1) % 3][0]; D.scroll.dex = 0; SFX.page(); }, { silent: true });
    Font.draw(fb, String(list.length), L.x + L.w - 1, L.y + 3, P.text, { font: 'small', align: 'right' });
    const LQ = { x: L.x, y: L.y + chH + 3, w: L.w, h: L.h - chH - 3 }, rh = tiny ? 19 : G.L ? 22 : 20;
    const si = list.indexOf(D.sel);
    if (!list.length) Font.draw(fb, D.filter === 'miss' ? 'ALL CAUGHT!' : 'NOBODY HERE', LQ.x + LQ.w / 2, LQ.y + 16, P.text, { font: 'small', align: 'center' });
    const s2 = listView(fb, 'dex', LQ, list.length, rh, si, (b, i, x2, y, w, h, on) => dexRow(b, list[i], x2, y, w, h, on, G), (i) => { const sp = list[i]; if (D.sel === sp) openEntry(sp); else selectSp(sp); });
    if (si >= 0) D.lookAt = [LQ.x + LQ.w * 0.5, LQ.y + si * rh - s2 + rh / 2];
    dexDetail(fb, G, R, D.sel, t);
  }
  function dexRow(b, sp, x, y, w, h, on, G) {
    const st = stat(sp), d = DexData.S[sp];
    UI.rrect(b, x, y, w, h - 1, 3, on ? P.red : P.scrDD);
    UI.rrect(b, x + 1, y + 1, w - 2, h - 3, 2, on ? P.white : st === 2 ? P.card : st === 1 ? P.scrLL : P.scrL);
    if (on) UI.rect(b, x + 1, y + 2, 2, h - 5, P.red);
    const ts = Math.min(h - 4, 18), th = thumb(sp, ts, st < 2), tx = x + 3, ty = y + 1 + ((h - 3 - ts) >> 1);
    if (th) UI.img(b, th, tx + Math.round((ts + 1 - th.w) / 2), ty + Math.round((ts - th.h) / 2), 1, st === 1 ? { tint: P.scrDD, tintK: 0.35 } : st === 0 ? { tint: P.faint, tintK: 0.3 } : {});
    else if (th === undefined) Font.draw(b, '..', tx + ts / 2, ty + ts / 2 - 2, P.dim, { font: 'small', align: 'center' });
    const nx = tx + ts + 3, room = x + w - nx - 2;
    const two = h >= 15, ny = two ? y + Math.round((h - 1) / 2) - 7 : y + Math.round((h - 6) / 2);
    // status icon: Poké Ball = caught (photographed), eye = seen
    const ix = x + w - 10, iy = y + Math.round((h - 1) / 2) - 4;
    if (st === 2) Font.icon(b, 'pb', ix, two ? ny + 8 : iy, 1); else if (st === 1) eyeIcon(b, ix, (two ? ny + 8 : iy) + 2);
    Font.draw(b, fit(st ? d.name : '???', room), nx, ny, st ? P.text : P.faint, { font: 'small' });
    if (two) {
      const nt = (room >= 56 ? 'No.' : '') + pad3(d.no);
      Font.draw(b, nt, nx, ny + 9, P.faint, { font: 'small' });
      if (st) { let cx = nx + Font.measure(nt, 'small') + 3; for (const ty2 of d.type) { if (cx + 5 > ix - 2 || room < 60) break; UI.rrect(b, cx, ny + 9, 5, 5, 2, typeCol(ty2)); cx += 7; } }
    }
  }
  function eyeIcon(fb, x, y) { const c = P.dim; UI.hline(fb, x + 1, x + 5, y, c); UI.put(fb, x, y + 1, c); UI.put(fb, x + 6, y + 1, c); UI.hline(fb, x + 1, x + 5, y + 3, c); UI.put(fb, x, y + 2, c); UI.put(fb, x + 6, y + 2, c); UI.rect(fb, x + 2, y + 1, 3, 2, 0xff4b1e1a); }
  const TYPE_COL = { Normal: '#9fa19f', Fire: '#e62829', Water: '#2980ef', Grass: '#3fa129', Electric: '#fac000', Ice: '#3dcef3', Fighting: '#ff8000', Poison: '#9141cb', Ground: '#915121', Flying: '#81b9ef', Psychic: '#ef4179', Bug: '#91a119', Rock: '#afa981', Ghost: '#704170', Dragon: '#5060e1', Dark: '#624d4e', Steel: '#60a1b8', Fairy: '#ef70ef' };
  const typeCol = (ty) => hex(TYPE_COL[ty] || (DexData.TYPES[ty]) || '#888888');
  function typePill(fb, ty, x, y) { const w = Font.measure(ty.toUpperCase(), 'small') + 8; UI.rrect(fb, x, y, w, 9, 3, mix(typeCol(ty), 0xff000000, 0.35)); UI.rrect(fb, x, y, w, 8, 3, typeCol(ty)); UI.hline(fb, x + 2, x + w - 3, y + 1, mix(typeCol(ty), 0xffffffff, 0.3)); Font.draw(fb, ty.toUpperCase(), x + w / 2, y + 2, 0xffffffff, { font: 'small', align: 'center' }); return w; }
  function stage(fb, x, y, w, h, area, st, t) {
    const [sky, gnd] = areaCols(area), dark = st === 0;
    rrFill(fb, x, y, w, h, 4, (i, j) => {
      let c = mix(mix(sky, 0xffffffff, 0.45), sky, j / h);
      if (j > h - 9) { const e = ((i - w / 2) / (w * 0.62)) ** 2 + ((j - h + 1) / 8) ** 2; if (e < 1 || j > h - 3) c = mix(gnd, 0xffffffff, e < 0.35 ? 0.2 : 0); }
      if (dark) c = mix(c, P.rim, 0.62);
      return c;
    });
    // little clouds
    if (!dark) for (let k = 0; k < 3; k++) { const cx = x + ((k * 53 + Math.floor(t * 3)) % (w + 20)) - 10, cy = y + 6 + k * 7; for (let i = -5; i <= 5; i++) if (cx + i > x + 2 && cx + i < x + w - 3) { UI.put(fb, cx + i, cy, 0xffffffff); if (Math.abs(i) < 3) UI.put(fb, cx + i, cy - 1, 0xffffffff); } }
    UI.rrect(fb, x, y, w, 1, 0, 0); // (keeps the stage edge crisp)
  }
  function dexDetail(fb, G, R, sp, t) {
    const d = DexData.S[sp]; if (!d) return;
    const st = stat(sp), tiny = R.w < 76;
    card(fb, R);
    const sx = R.x + 3, sy = R.y + 3, sw = R.w - 6, sh = Math.round(R.h * (tiny ? 0.44 : 0.42));
    stage(fb, sx, sy, sw, sh, (d.area || [])[0], st, t);
    const tsz = Math.min(sh - 8, sw - 12), th = thumb(sp, tsz, st < 2);
    const pop = clamp((D.selT || 0) / 0.18, 0, 1), bob = st === 2 ? Math.round(Math.sin(t * 2.2)) : 0;
    if (th) {
      const X = sx + Math.round((sw - th.w) / 2), Y = sy + sh - 3 - th.h + bob + Math.round((1 - U.ease.outBack(pop)) * 6);
      for (let i = -Math.round(th.w * 0.35); i <= Math.round(th.w * 0.35); i++) UI.blend(fb, sx + (sw >> 1) + i, sy + sh - 3, P.rim, 0.25);
      UI.img(fb, th, X, Y, 1, st === 1 ? { tint: P.scrDD, tintK: 0.45 } : {});
      if (st === 0) Font.draw(fb, '?', sx + (sw >> 1), Y + (th.h >> 1) - 5, P.gold, { font: 'title', align: 'center', outline: P.rim });
    } else Font.draw(fb, th === undefined ? '...' : '???', sx + sw / 2, sy + sh / 2 - 2, P.white, { font: 'small', align: 'center' });
    // number (top left) and status (top right) on the stage
    const no = (tiny ? '' : 'NO.') + pad3(d.no), nw = Font.measure(no, 'small') + 6;
    pill(fb, sx + 2, sy + 2, nw, 9, P.white, P.text, no, { hi: false });
    if (st === 2) { UI.disc(fb, sx + sw - 7, sy + 6, 5, P.rim); Font.icon(fb, 'pb', sx + sw - 10, sy + 3, 1); }
    else if (st === 1) { UI.rrect(fb, sx + sw - 13, sy + 2, 11, 9, 3, P.white); eyeIcon(fb, sx + sw - 11, sy + 5); }
    let y = sy + sh + 3;
    const x = R.x + 4, w = R.w - 8;
    const nmFont = w >= 110 ? 'title' : w >= 84 ? 'body' : 'small';
    Font.draw(fb, fit(st ? d.name : '???', w, nmFont), x, y + (nmFont === 'small' ? 1 : 0), P.text, { font: nmFont });
    y += nmFont === 'title' ? 14 : nmFont === 'body' ? 12 : 9;
    // types: pills when they fit, otherwise little colour chips
    if (st) {
      const tws = d.type.map((ty) => Font.measure(ty.toUpperCase(), 'small') + 8), tot = tws.reduce((a2, b2) => a2 + b2 + 2, 0);
      const roomT = R.y + R.h - 4 - (tiny ? 12 : 13) - 3 - y;
      if (tot <= w + 2 || roomT >= 21) { let tx = x; d.type.forEach((ty, i) => { if (tx > x && tx + tws[i] > x + w) { tx = x; y += 10; } typePill(fb, ty, tx, y); tx += tws[i] + 2; }); }
      else { let tx = x; for (const ty of d.type) { const c = typeCol(ty), cw = Math.floor((w - 2) / d.type.length) - 2; UI.rrect(fb, tx, y, cw, 8, 3, mix(c, 0xff000000, 0.35)); UI.rrect(fb, tx, y, cw, 7, 3, c); Font.draw(fb, fit(ty.toUpperCase().slice(0, 3), cw - 2), tx + cw / 2, y + 1, 0xffffffff, { font: 'small', align: 'center' }); tx += cw + 2; } }
      y += 11;
    }
    const btnH = tiny ? 12 : 13, bottom = R.y + R.h - 4;
    const dn = speciesDone(sp);
    // what fits between the types and the button
    const room = bottom - btnH - 3 - y;
    if (room >= 9) {
      const lines = [];
      const hab = (d.area || []).map(areaName).join(', ') || '???';
      if (st === 2) { lines.push([info(sp).cat, P.dim]); lines.push(['{star} ' + dn.st + '/4  BEH ' + dn.got + '/' + dn.beh, P.text]); lines.push([d.h + ' m · ' + info(sp).wt + ' kg', P.dim]); lines.push([hab, P.dim]); }
      else if (st === 1) lines.push(['SEEN NEAR ' + hab.toUpperCase(), P.dim]);
      else lines.push(['HABITAT ' + ((d.area || []).length ? hab : '???'), P.dim]);
      let yy = y;
      for (const [ln, col] of lines) { if (yy + 8 > bottom - btnH - 3) break; Font.draw(fb, fit(ln, w), x, yy, col, { font: 'small' }); yy += 9; }
      const left = Math.floor((bottom - btnH - 3 - yy) / 8);
      if (left >= 1) {
        const blurb = st === 2 ? d.blurb : st === 1 ? 'Spotted by Rotom! Photograph it to fill in its page.' : 'No data. ' + (Object.values(d.beh)[0] ? 'Clue: ' + Object.values(d.beh)[0].hint : 'Keep exploring!');
        textLines(fb, blurb, x, yy + 1, w, st === 2 ? P.text : P.dim, left, 8);
      }
    }
    // completion bar inside the button row on wider cards
    const lab = st ? 'ENTRY {right}' : 'WHERE?';
    if (w >= 100) {
      const pct = Math.round(dn.pct * 100), bw = w - 64;
      UI.rrect(fb, x, bottom - btnH + 3, bw, 7, 3, P.scrD); if (pct) UI.rrect(fb, x, bottom - btnH + 3, Math.max(4, Math.round((bw * pct) / 100)), 7, 3, pct >= 100 ? P.gold : P.green);
      button(fb, 'open-entry', x + w - 60, bottom - btnH, 60, btnH, lab, () => openEntry(sp), { fill: st ? P.red : P.blue });
    } else button(fb, 'open-entry', x, bottom - btnH, w, btnH, lab, () => openEntry(sp), { fill: st ? P.red : P.blue });
  }

  /* ---------- page: a species entry ---------- */
  const nameFont = (w) => (w >= 104 ? 'title' : w >= 72 ? 'body' : 'small');
  const fontH = (f) => (f === 'title' ? 14 : f === 'body' ? 12 : 9);
  function typeRow(b, types, x, y, w) {
    let tx = x;
    for (const ty of types) { const tw = Font.measure(ty.toUpperCase(), 'small') + 8; if (tx > x && tx + tw > x + w) { tx = x; y += 10; } typePill(b, ty, tx, y); tx += tw + 2; }
    return y + 11;
  }
  function pageEntry(fb, G, t) {
    const sp = D.sel, d = DexData.S[sp];
    if (!d) { go('dex'); return; }
    const Q = content(G), tiny = Q.w < 150, [L, R] = split(Q, tiny ? 0.46 : 0.47, 3);
    const ph = Save.data.photos[sp] || {};
    // photo for the chosen star tier
    const tier = D.star + 1, rec = ph['s' + tier];
    const navH = tiny ? 11 : 13, tierH = tiny ? 11 : 13, infoH = rec ? 9 : 0;
    const pw = L.w, phh = L.h - navH - tierH - infoH - 6;
    const px = L.x, py = L.y;
    UI.rrect(fb, px - 1, py - 1, pw + 2, phh + 2, 3, P.rim);
    if (rec && rec.img) {
      const b = photo(rec.img);
      if (b) UI.imgFit(fb, b, px, py, pw, phh);
      else for (let y = 0; y < phh; y++) for (let x = 0; x < pw; x++) UI.put(fb, px + x, py + y, U.hash(x, y, Math.floor(t * 10)) > 0.5 ? 0xff58403a : 0xff3a2a26);
    } else {
      stage(fb, px, py, pw, phh, (d.area || [])[0], 0, t);
      const th = thumb(sp, Math.max(12, Math.min(40, phh - 16)), true);
      if (th) UI.img(fb, th, px + Math.round((pw - th.w) / 2), py + Math.round((phh - th.h) / 2) - 4);
      Font.draw(fb, fit(pw < 70 ? 'NO PHOTO' : 'No ' + '{star}'.repeat(tier) + ' photo yet', pw - 4), px + pw / 2, py + phh - 10, 0xffffffff, { font: 'small', align: 'center', outline: P.rim });
    }
    // tier selector
    const ty = py + phh + 2, tw = Math.floor((pw + 2) / 4);
    for (let k = 0; k < 4; k++) {
      const on = D.star === k, has = !!ph['s' + (k + 1)], bx = px + k * tw, bw = tw - 2;
      UI.rrect(fb, bx, ty, bw, tierH, 3, P.rim);
      UI.rrect(fb, bx + 1, ty + 1, bw - 2, tierH - 2, 2, on ? P.red : has ? P.white : P.scrL);
      const n = k + 1, sw = n * 7 - 1, sy = ty + Math.round((tierH - 7) / 2);
      if (sw <= bw - 3) for (let s = 0; s < n; s++) Font.icon(fb, has ? 'star' : 'star0', bx + Math.round((bw - sw) / 2) + s * 7, sy, 1);
      else { Font.icon(fb, has ? 'star' : 'star0', bx + Math.round((bw - 13) / 2), sy, 1); Font.draw(fb, String(n), bx + Math.round((bw - 13) / 2) + 8, sy + 1, on ? 0xffffffff : P.text, { font: 'small' }); }
      btn('tier' + k, bx, ty - 2, bw, tierH + 4, () => { D.star = k; SFX.page(); }, { silent: true });
    }
    let iy = ty + tierH + 2;
    if (rec) {
      const bd = d.beh[rec.beh];
      medal(fb, rec.medal, px + 4, iy + 3);
      const sc = rec.score + ' PTS', lab = pw >= 100 ? (DexData.MEDALS[rec.medal] || '') + '  ' + sc : sc;
      Font.draw(fb, fit(lab, pw - 12), px + 11, iy + 1, P.text, { font: 'small' });
      if (bd && pw >= 140) Font.draw(fb, fit(bd.n, pw - 100), px + pw, iy + 1, P.dim, { font: 'small', align: 'right' });
      iy += infoH;
    }
    // prev / next species
    const nav = (dir) => { const Ls = DexData.ORDER.filter((k) => stat(k) > 0); const i = Ls.indexOf(sp); if (Ls.length) { D.sel = Ls[(i + dir + Ls.length) % Ls.length]; D.star = bestTier(D.sel); D.scroll.entry = 0; D.trans = 0.4; D.dir = dir; D.selT = 0; SFX.page(); } };
    const Ls = DexData.ORDER.filter((k) => stat(k) > 0), cnt = (Ls.indexOf(sp) + 1) + '/' + Ls.length, cntW = Font.measure(cnt, 'small') + 4;
    const ny = L.y + L.h - navH, nbw = clamp(Math.floor((pw - cntW) / 2), 12, 26);
    button(fb, 'prev', px, ny, nbw, navH, '{left}', () => nav(-1), { silent: true, fill: hex('#3a4290') });
    button(fb, 'next', px + pw - nbw, ny, nbw, navH, '{right}', () => nav(1), { silent: true, fill: hex('#3a4290') });
    if (pw - nbw * 2 >= cntW) Font.draw(fb, cnt, px + pw / 2, ny + Math.round((navH - 5) / 2), P.text, { font: 'small', align: 'center' });
    // info column
    card(fb, R);
    const I = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 };
    const hc = P.redD;
    scrollPanel(fb, 'entry', I, (b, y0) => {
      let y = y0 + 4;
      const x = I.x + 4, w = I.w - 10;
      Font.draw(b, 'NO.' + pad3(d.no), x, y, P.faint, { font: 'small' }); y += 9;
      const nf = nameFont(w);
      Font.draw(b, fit(stat(sp) ? d.name : '???', w, nf), x, y, P.text, { font: nf }); y += fontH(nf);
      y = typeRow(b, d.type, x, y, w) + 1;
      const IN = info(sp), st0 = stat(sp), dn = speciesDone(sp);
      y += textLines(b, st0 ? IN.cat : '??? Pokémon', x, y, w, P.dim, 2, 8) + 2;
      // height / weight chips, like the real Pokédex
      for (const [lab, val] of [['HEIGHT', st0 ? d.h.toFixed(1) + ' m' : '?.? m'], ['WEIGHT', st0 ? IN.wt.toFixed(1) + ' kg' : '?.? kg']]) {
        UI.rrect(b, x - 1, y, w + 2, 11, 3, P.scrD); UI.rrect(b, x, y + 1, w, 9, 2, P.white);
        const vw = Font.measure(val, 'small');
        Font.draw(b, fit(w - vw >= 48 ? lab : lab.slice(0, 2), w - vw - 6), x + 3, y + 3, P.redD, { font: 'small' }); Font.draw(b, val, x + w - 3, y + 3, P.text, { font: 'small', align: 'right' });
        y += 12;
      }
      y += 2;
      Font.draw(b, fit('HABITAT', w), x, y, hc, { font: 'small' }); y += 9;
      y += textLines(b, (d.area || []).map((a) => areaName(a) + (DexData.AREAS[a] && DexData.AREAS[a].sub ? ' (' + DexData.AREAS[a].sub + ')' : '')).join(', ') || '???', x, y, w, P.dim, 3, 8) + 3;
      y += textLines(b, st0 === 2 ? d.blurb : 'Photograph it to read its full entry!', x, y, w, P.text, 99, 9) + 4;
      // research completion
      const pct = Math.round(dn.pct * 100);
      Font.draw(b, fit('RESEARCH', w - 22), x, y, hc, { font: 'small' }); Font.draw(b, pct + '%', x + w, y, P.text, { font: 'small', align: 'right' }); y += 9;
      UI.rrect(b, x, y, w, 6, 3, P.scrD); if (pct) UI.rrect(b, x, y, Math.max(5, Math.round(w * pct / 100)), 6, 3, pct >= 100 ? P.gold : P.green); y += 10;
      Font.draw(b, fit('BEHAVIOURS', w), x, y, hc, { font: 'small' }); y += 10;
      const seenB = Save.data.beh[sp] || {};
      for (const k in d.beh) {
        const bh = d.beh[k], got = k in seenB, cl = got ? [] : Font.wrap('Clue: ' + bh.hint, 'small', w - 8), sw = bh.tier * 7;
        UI.rrect(b, x - 2, y - 3, w + 4, 12 + cl.length * 8, 2, got ? P.white : P.scrLL);
        Font.draw(b, got ? '{check}' : '{lock}', x, y - 1, 0, { font: 'small' });
        Font.draw(b, fit(got ? bh.n : '???', w - 10 - sw - 2), x + 9, y, P.text, { font: 'small' });
        for (let s = 0; s < bh.tier; s++) Font.icon(b, got ? 'star' : 'star0', x + w - 6 - (bh.tier - 1 - s) * 7, y - 1, 1);
        cl.forEach((ln, j) => Font.draw(b, ln, x + 4, y + 9 + j * 8, P.dim, { font: 'small' }));
        y += 14 + cl.length * 8;
      }
      y += 3;
      Font.draw(b, fit('PHOTO OBJECTIVES', w), x, y, hc, { font: 'small' }); y += 10;
      for (const o of d.obj) {
        const done = !!Save.data.obj[o.id];
        y += textLines(b, (done ? '{check} ' : '{star0} ') + o.t, x, y, w, done ? P.dim : P.text, 4, 8);
        y += textLines(b, 'Reward: ' + (o.reward.startsWith('pts:') ? o.reward.slice(4) + ' pts' : Rewards.name(o.reward)), x + 6, y, w - 6, P.faint, 2, 8) + 4;
      }
      return y + 4 - y0;
    });
    D.lookAt = [L.x + L.w / 2, L.y + phh / 2];
  }

  /* ---------- page: encyclopedia (habitats + behaviours) ---------- */
  function habitats() { return Object.keys(DexData.AREAS).filter((id) => DexData.ORDER.some((k) => (DexData.S[k].area || []).includes(id))); }
  function pageEncy(fb, G, t) {
    const Q = content(G), C = G.C, tiny = Q.w < 150;
    const th = tabs(fb, 'ency', Q.x, Q.y, Q.w, [['hab', 'HABITATS'], ['beh', 'BEHAVIOURS']]);
    const Q2 = { x: Q.x, y: Q.y + th, w: Q.w, h: Q.h - th };
    if ((D.tab.ency || 'hab') === 'beh') return encyBeh(fb, G, Q2, t);
    const [L, R] = split(Q2, tiny ? 0.4 : 0.38, 3);
    const ids = habitats();
    D.lsel.ency = clamp(D.lsel.ency || 0, 0, Math.max(0, ids.length - 1));
    if (ids[D.lsel.ency] !== D.encyA && D.encyA && ids.includes(D.encyA) && D.ensure !== 'ency') D.lsel.ency = ids.indexOf(D.encyA);
    const sel = D.lsel.ency, rh = tiny ? 17 : C ? 20 : 24;
    listView(fb, 'ency', L, ids.length, rh, sel, (b, i, x, y, w, h, on) => {
      const id = ids[i], sp = DexData.ORDER.filter((k) => (DexData.S[k].area || []).includes(id)), got = sp.filter((k) => stat(k) === 2).length, un = Save.unlocked(id);
      UI.rrect(b, x, y, w, h - 1, 3, on ? P.red : P.scrDD); UI.rrect(b, x + 1, y + 1, w - 2, h - 3, 2, on ? P.white : P.card);
      const [sky, gnd] = areaCols(id); UI.rrect(b, x + 3, y + 3, 6, h - 7, 2, sky); UI.rect(b, x + 3, y + h - 7, 6, 3, gnd);
      const cnt = got + '/' + sp.length, cw = w >= 76 ? Font.measure(cnt, 'small') + 4 : 0;
      Font.draw(b, fit((un ? '' : '{lock}') + areaName(id), w - 16 - cw), x + 12, y + 3, un ? P.text : P.faint, { font: 'small' });
      if (cw) Font.draw(b, cnt, x + w - 4, y + 3, P.dim, { font: 'small', align: 'right' });
      const k = got / Math.max(1, sp.length), bw = w - 16;
      UI.rect(b, x + 12, y + h - 6, bw, 2, P.scrD); UI.rect(b, x + 12, y + h - 6, Math.round(bw * k), 2, k >= 1 ? P.gold : P.green);
    }, (i) => { D.lsel.ency = i; D.encyA = ids[i]; D.scroll.encyR = 0; });
    const id = ids[sel]; D.encyA = id; if (!id) return;
    card(fb, R);
    const A = DexData.AREAS[id] || {}, [sky] = areaCols(id);
    const I = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 };
    const sps = DexData.ORDER.filter((k) => (DexData.S[k].area || []).includes(id));
    scrollPanel(fb, 'encyR', I, (b, y0) => {
      let y = y0 + 3; const x = I.x + 4, w = I.w - 10;
      const nf = w >= 120 ? 'title' : w >= 80 ? 'body' : 'small', hb = fontH(nf) + 4;
      UI.rrect(b, x - 2, y, w + 4, hb, 3, sky);
      Font.draw(b, fit(A.name || id, w - 2, nf), x + 1, y + 2 + (nf === 'small' ? 1 : 0), P.text, { font: nf });
      y += hb + 3;
      if (A.sub) { Font.draw(b, fit(A.sub.toUpperCase(), w), x, y, P.dim, { font: 'small' }); y += 9; }
      if (A.blurb) y += textLines(b, A.blurb, x, y, w, P.text, tiny ? 5 : 4, 8) + 3;
      let bt = 0, bg = 0, r4 = 0, r4g = 0;
      for (const k of sps) { const dd = DexData.S[k], sb = Save.data.beh[k] || {}; for (const bk in dd.beh) { bt++; if (bk in sb) bg++; if (dd.beh[bk].tier >= 4) { r4++; if (bk in sb) r4g++; } } }
      y += textLines(b, 'POKéMON ' + sps.filter((k) => stat(k) === 2).length + '/' + sps.length + ' · BEHAVIOURS ' + bg + '/' + bt + ' · {star}x4 ' + r4g + '/' + r4, x, y, w, P.dim, 3, 8) + 3;
      const cs = tiny ? 20 : C ? 24 : 30, cols = Math.max(1, Math.floor((w + 4) / cs));
      sps.forEach((k, i) => {
        const cx = x + (i % cols) * cs, cy = y + Math.floor(i / cols) * (cs + 2), st = stat(k);
        UI.rrect(b, cx, cy, cs - 3, cs - 3, 3, st === 2 ? P.white : P.scrL);
        const tt = thumb(k, cs - 7, st < 2);
        if (tt) UI.img(b, tt, cx + Math.round((cs - 3 - tt.w) / 2), cy + Math.round((cs - 3 - tt.h) / 2), 1, st === 1 ? { tint: P.scrDD, tintK: 0.4 } : {});
        if (st === 2 && cs >= 24) Font.icon(b, 'pb', cx + cs - 10, cy + cs - 10, 1);
      });
      const rows = Math.ceil(sps.length / cols);
      // buttons for the species tiles (registered in screen space)
      sps.forEach((k, i) => { const cx = x + (i % cols) * cs, cy = y + Math.floor(i / cols) * (cs + 2); if (cy >= I.y - 2 && cy + cs < I.y + I.h + 2) btn('eny-' + k, cx, cy, cs - 3, cs - 3, () => { if (stat(k)) { D.sel = k; openEntry(k); } else hintFor(k); }); });
      y += rows * (cs + 2) + 4;
      return y - y0;
    });
  }
  function encyBeh(fb, G, Q, t) {
    const C = G.C, tiny = Q.w < 150;
    const tiers = [0, 0, 0, 0, 0], got = [0, 0, 0, 0, 0], rare = [];
    for (const k of DexData.ORDER) { const d = DexData.S[k], sb = Save.data.beh[k] || {}; for (const bk in d.beh) { const tr = d.beh[bk].tier; tiers[tr]++; if (bk in sb) got[tr]++; if (tr >= 3) rare.push({ k, bk, tr, got: bk in sb }); } }
    let R = Q;
    if (!tiny) {
      const [L, R2] = split(Q, C ? 0.36 : 0.34, 3); R = R2;
      card(fb, L);
      let y = L.y + 5;
      Font.draw(fb, fit('STAR TIERS', L.w - 10), L.x + 5, y, P.redD, { font: 'small' }); y += 10;
      const rowH = C ? 15 : 18;
      for (let tr = 1; tr <= 4; tr++) {
        const k = got[tr] / Math.max(1, tiers[tr]), x = L.x + 5, w = L.w - 10;
        for (let s = 0; s < tr; s++) Font.icon(fb, 'star', x + s * 7, y, 1);
        Font.draw(fb, got[tr] + '/' + tiers[tr], x + w, y + 1, P.text, { font: 'small', align: 'right' });
        UI.rect(fb, x, y + 9, w, 3, P.scrD); UI.rect(fb, x, y + 9, Math.round(w * k), 3, [0, P.green, P.blue, P.gold, 0xffd07aff][tr]);
        y += rowH;
      }
      textLines(fb, 'Rare moments score the most stars!', L.x + 5, y + 1, L.w - 10, P.dim, Math.max(0, Math.floor((L.y + L.h - y - 4) / 8)));
    } else {
      // phones: one summary line above the list
      const rg = got[3] + got[4], rt = tiers[3] + tiers[4];
      Font.draw(fb, fit('{star}{star}{star}+ RARE ' + rg + '/' + rt, Q.w), Q.x + 1, Q.y + 1, P.text, { font: 'small' });
      R = { x: Q.x, y: Q.y + 10, w: Q.w, h: Q.h - 10 };
    }
    rare.sort((a, b) => (a.got - b.got) || (b.tr - a.tr));
    const rh = tiny ? 20 : C ? 22 : 26;
    listView(fb, 'encyR', R, rare.length, rh, -1, (b, i, x, y2, w, h) => {
      const r = rare[i], d = DexData.S[r.k], bh = d.beh[r.bk], seen = stat(r.k) > 0;
      UI.rrect(b, x, y2, w, h - 1, 3, P.scrDD); UI.rrect(b, x + 1, y2 + 1, w - 2, h - 3, 2, r.got ? P.white : P.card);
      const tt = thumb(r.k, h - 6, !seen); if (tt) UI.img(b, tt, x + 3 + Math.round((h - 6 - tt.w) / 2), y2 + 2 + Math.round((h - 6 - tt.h) / 2), 1);
      const tx = x + h, sw = r.tr * 7;
      Font.draw(b, fit((seen ? d.name : '???') + ' · ' + (r.got ? bh.n : '???'), w - h - sw - 6), tx, y2 + 3, P.text, { font: 'small' });
      for (let s = 0; s < r.tr; s++) Font.icon(b, r.got ? 'star' : 'star0', x + w - 4 - (r.tr - s) * 7, y2 + 2, 1);
      Font.draw(b, fit(r.got ? '{check} Photographed!' : 'Clue: ' + bh.hint, w - h - 4), tx, y2 + (tiny ? 11 : C ? 12 : 14), P.dim, { font: 'small' });
    }, (i) => { const r = rare[i]; if (stat(r.k)) { openEntry(r.k); } else hintFor(r.k); });
  }

  /* ---------- page: quests (quest log + research stamps) ---------- */
  function questList() {
    if (hasP() && Progress.entries) { try { return Progress.entries(); } catch (e) { return []; } }
    return (Quests.BIRCH || []).map((b) => ({ q: { id: b.id, birch: b, title: b.t, giver: 'birch' }, s: Save.data.quests[b.id] ? 'done' : 'active' }));
  }
  const trackId = () => (Save.data.lv && Save.data.lv.track) || null;
  function trackQuest(q) {
    if (!q || q.birch) return;
    if (!Save.data.lv) return;
    Save.data.lv.track = Save.data.lv.track === q.id ? null : q.id; Save.save();
    SFX.select(); say(Save.data.lv.track ? 'Tracking "' + q.title + '"! Follow the arrow!' : 'Stopped tracking. Bzzt.', { mood: 'happy' });
  }
  const QST = { ready: ['{star}', 'READY!', P.gold], active: ['!', 'ACTIVE', P.red], avail: ['?', 'NEW', P.blue], lvl: ['{lock}', 'LOCKED', P.grey], done: ['{check}', 'DONE', P.green] };
  function rewardLabel(r) {
    if (!r) return '';
    if (r.startsWith('pts:')) return r.slice(4) + ' points';
    if (r.startsWith('item:')) { const [, k, n] = r.split(':'); return n + ' ' + k; }
    if (r.startsWith('tm:')) { const m = Moves.DEF[r.slice(3)]; return m ? (m.tm ? m.tm + ' ' : '') + m.name : 'a TM'; }
    return Rewards.C[r] ? Rewards.C[r].name : r;
  }
  function pageQuests(fb, G, t) {
    const Q = content(G), C = G.C, tiny = Q.w < 150;
    const th = tabs(fb, 'quests', Q.x, Q.y, Q.w, [['log', 'QUEST LOG'], ['stamps', 'STAMPS']]);
    const Q2 = { x: Q.x, y: Q.y + th, w: Q.w, h: Q.h - th };
    if ((D.tab.quests || 'log') === 'stamps') return pageStamps(fb, G, Q2, t);
    const list = questList(), [L, R] = split(Q2, tiny ? 0.45 : 0.46, 3);
    D.lsel.qlog = clamp(D.lsel.qlog || 0, 0, Math.max(0, list.length - 1));
    const sel = D.lsel.qlog, rh = tiny ? 15 : C ? 18 : 22, tr = trackId();
    if (!list.length) { textLines(fb, 'No quests yet! Talk to Pokémon around Hoenn.', Q2.x + 4, Q2.y + 10, Q2.w - 8, P.text, 3, 9); return; }
    const s = listView(fb, 'qlog', L, list.length, rh, sel, (b, i, x, y, w, h, on) => {
      const e = list[i], q = e.q, ic = QST[e.s] || QST.active;
      UI.rrect(b, x, y, w, h - 1, 3, on ? P.red : P.scrDD); UI.rrect(b, x + 1, y + 1, w - 2, h - 3, 2, on ? P.white : e.s === 'done' ? P.scrL : P.card);
      const r = tiny ? 4 : 5;
      UI.disc(b, x + 3 + r, y + (h >> 1) - 1, r, ic[2]); Font.draw(b, ic[0], x + 3 + r, y + (h >> 1) - 3, 0xffffffff, { font: 'small', align: 'center' });
      const big = h >= 22;
      Font.draw(b, fit(q.title, w - r * 2 - 8 - (q.id === tr ? 8 : 0), big ? 'body' : 'small'), x + r * 2 + 5, y + (big ? 3 : Math.round((h - 6) / 2)), e.s === 'done' ? P.faint : P.text, { font: big ? 'body' : 'small' });
      if (big) Font.draw(b, fit(q.birch ? 'PROF. BIRCH' : spName(q.giver).toUpperCase() + ' · ' + areaName(q.area).toUpperCase(), w - r * 2 - 8), x + r * 2 + 5, y + 13, P.faint, { font: 'small' });
      if (q.id === tr) Font.icon(b, 'spark', x + w - 8, y + 4, 1);
    }, (i) => { if (D.lsel.qlog === i) trackQuest(list[i].q); D.lsel.qlog = i; });
    D.lookAt = [L.x + L.w / 2, L.y + sel * rh - s + rh / 2];
    const e = list[sel]; if (!e) return;
    const q = e.q, ic = QST[e.s] || QST.active;
    card(fb, R);
    const I = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 };
    const trackable = !q.birch && e.s !== 'done', bh = tiny ? 11 : 13;
    const P2 = trackable ? { x: I.x, y: I.y, w: I.w, h: I.h - bh - 3 } : I;
    scrollPanel(fb, 'qdet', P2, (b, y0) => {
      let y = y0 + 3; const x = I.x + 4, w = I.w - 10;
      const pwid = Font.measure(ic[1], 'small') + 8;
      pill(b, x, y, pwid, 9, ic[2], 0xffffffff, ic[1], { hi: false });
      if (q.area && w - pwid > 30) Font.draw(b, fit(areaName(q.area).toUpperCase(), w - pwid - 4), x + w, y + 2, P.dim, { font: 'small', align: 'right' });
      y += 12;
      const tf = w >= 110 ? 'title' : w >= 80 ? 'body' : 'small';
      y += textLines(b, q.title, x, y, w, P.text, 3, fontH(tf) - (tf === 'small' ? 0 : 1), tf) + 3;
      // who asked
      const ps = tiny ? 14 : C ? 18 : 24, gsp = q.birch ? null : q.giver, tt = gsp && DexData.S[gsp] ? thumb(gsp, ps, false) : null;
      if (tt) UI.img(b, tt, x, y, 1); else portrait(b, x, y, ps, q.birch ? 'birch' : gsp);
      Font.draw(b, fit(q.birch ? 'Prof. Birch' : spName(q.giver), w - ps - 4), x + ps + 4, y + 1, P.text, { font: 'small' });
      Font.draw(b, fit(q.birch ? 'RESEARCH REQUEST' : 'ASKED FOR HELP', w - ps - 4), x + ps + 4, y + 10, P.faint, { font: 'small' });
      y += Math.max(ps, 18) + 3;
      const obj = q.birch ? (e.s === 'done' ? 'Completed!' : q.birch.hint) : hasP() && Progress.objective ? Progress.objective(q) : '';
      Font.draw(b, 'OBJECTIVE', x, y, P.redD, { font: 'small' }); y += 9;
      y += textLines(b, obj, x, y, w, P.text, 6, 8) + 3;
      const rw = q.birch ? rewardLabel(q.birch.reward) : rewardLabel(q.reward);
      if (rw) y += textLines(b, 'REWARD: ' + rw, x, y, w, P.dim, 3, 8) + 2;
      return y - y0 + 2;
    });
    if (trackable) {
      const on = q.id === tr, w = I.w - 6;
      button(fb, 'track', I.x + 3, R.y + R.h - 4 - bh, w, bh, on ? (w >= 120 ? '{spark} TRACKING - TAP TO STOP' : '{spark} TRACKING') : w >= 100 ? 'TRACK THIS QUEST' : 'TRACK', () => trackQuest(q), { fill: on ? P.green : P.red });
    }
  }

  function portrait(fb, x, y, s, who) {
    // a little avatar for people (Prof. Birch)
    UI.rrect(fb, x, y, s, s, 4, P.rim); UI.rrect(fb, x + 1, y + 1, s - 2, s - 2, 3, hex('#ffe0b8'));
    UI.rect(fb, x + 2, y + 2, s - 4, Math.round(s * 0.3), hex('#6a4028'));
    UI.rect(fb, x + Math.round(s * 0.3), y + Math.round(s * 0.5), 2, 2, P.rim); UI.rect(fb, x + Math.round(s * 0.62), y + Math.round(s * 0.5), 2, 2, P.rim);
    UI.rect(fb, x + 2, y + s - Math.round(s * 0.22), s - 4, Math.round(s * 0.2) - 1, 0xffffffff);
    UI.hline(fb, x + Math.round(s * 0.38), x + Math.round(s * 0.62), y + Math.round(s * 0.68), hex('#b05a3a'));
  }
  function pageStamps(fb, G, Q, t) {
    const C = G.C, tiny = Q.w < 150, n = Quests.stamps(), [L, R] = split(Q, 0.46, 3);
    card(fb, L);
    const nS = String(n), nW = Font.measure(nS, 'small') + 4;
    Font.draw(fb, fit(L.w >= 100 ? 'RESEARCH STAMPS' : 'STAMPS', L.w - 10 - nW), L.x + 5, L.y + 5, P.redD, { font: 'small' });
    Font.draw(fb, nS, L.x + L.w - 5, L.y + 5, P.text, { font: 'small', align: 'right' });
    const bh = tiny ? 11 : 13, ids = Object.keys(DexData.AREAS), LQ = { x: L.x + 3, y: L.y + 16, w: L.w - 6, h: L.h - 19 - bh - 3 };
    listView(fb, 'stampA', LQ, ids.length, tiny ? 19 : C ? 20 : 24, -1, (b, i, x, y, w, h) => {
      const id = ids[i], a = DexData.AREAS[id], un = Save.unlocked(id);
      UI.rrect(b, x, y, w, h - 1, 3, P.scrDD); UI.rrect(b, x + 1, y + 1, w - 2, h - 3, 2, un ? P.white : P.scrLL);
      Font.draw(b, fit((un ? '{check} ' : '{lock} ') + a.name, w - 6), x + 3, y + 3, P.text, { font: 'small' });
      Font.draw(b, fit(un ? a.sub : id === 'stage' ? 'Needs Meloetta\'s band' : a.need >= 99 ? 'Follow the quests' : 'Needs ' + a.need + ' stamps', w - 6), x + 3, y + 11, P.faint, { font: 'small' });
    });
    button(fb, 'map', L.x + 3, L.y + L.h - bh - 3, L.w - 6, bh, L.w >= 110 ? '{spark} OPEN THE WORLD MAP' : '{spark} MAP', () => { if (locked('map')) { SFX.error(); say('The map is still locked! Bzzt.', { mood: 'sad' }); return; } close(() => WorldMap.open()); });
    card(fb, R);
    const I = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 };
    scrollPanel(fb, 'stampR', I, (b, y0) => {
      let y = y0 + 4; const x = I.x + 4, w = I.w - 8;
      Font.draw(b, fit('BIRCH\'S REQUESTS', w), x, y, P.redD, { font: 'small' }); y += 11;
      for (const q of Quests.BIRCH) {
        const done = !!Save.data.quests[q.id], tl = Font.wrap((done ? '{check} ' : '{star0} ') + q.t, 'small', w), hl = done ? [] : Font.wrap(q.hint, 'small', w - 6);
        UI.rrect(b, x - 2, y - 2, w + 3, 5 + (tl.length + hl.length) * 8, 2, done ? P.white : P.scrLL);
        tl.forEach((ln, j) => Font.draw(b, ln, x, y + j * 8, P.text, { font: 'small' }));
        hl.forEach((ln, j) => Font.draw(b, ln, x + 5, y + (tl.length + j) * 8, P.dim, { font: 'small' }));
        y += 8 + (tl.length + hl.length) * 8;
      }
      return y - y0;
    });
  }

  /* ---------- page: progress ---------- */
  function progData() {
    const list = DexData.ORDER.filter((k) => !DexData.S[k].player), seen = list.filter((k) => Save.data.seen[k]).length;
    let bt = 0, bg = 0; for (const k of list) { bt += Object.keys(DexData.S[k].beh).length; bg += Object.keys(Save.data.beh[k] || {}).length; }
    return { list, seen, bt, bg, pct: Math.round(((seen / list.length) * 0.6 + (bg / Math.max(1, bt)) * 0.4) * 100) };
  }
  function progSummary(b, x, y, w, big) {
    const d = progData(), y0 = y;
    Font.draw(b, 'COMPLETION', x, y, P.redD, { font: 'small' }); y += 9;
    Font.draw(b, d.pct + '%', x, y, P.text, { font: 'title', sc: big ? 2 : 1 }); y += big ? 30 : 16;
    UI.rrect(b, x, y, w, 5, 2, P.scrD); UI.rrect(b, x, y, Math.max(3, Math.round((w * d.pct) / 100)), 5, 2, P.red); y += 9;
    const lines = ['Registered ' + d.seen + ' / ' + d.list.length, 'Behaviours ' + d.bg + ' / ' + d.bt];
    if (hasP()) {
      const lv = Progress.level(), xp = (Save.data.lv && Save.data.lv.xp) || 0, nx = Progress.XP && Progress.XP[lv + 1];
      lines.push('Mudkip Lv ' + lv + (nx ? ' · ' + xp + '/' + nx + ' XP' : ' · ' + xp + ' XP'));
      const f = (Progress.FEATS || []).find((f2) => !Progress.has(f2.id)); if (f) lines.push('Next: ' + f.name + ' (Lv ' + f.lv + ')');
      const q = Progress.tracked && Progress.tracked(); if (q) lines.push('Quest: ' + q.title + (Progress.objective ? ' - ' + Progress.objective(q) : ''));
    }
    for (const ln of lines) y += textLines(b, ln, x, y, w, P.text, 3, 8) + 1;
    return y - y0;
  }
  function progAreas(b, x, y, w) {
    const y0 = y, list = DexData.ORDER.filter((k) => !DexData.S[k].player);
    for (const id of Object.keys(DexData.AREAS)) {
      const sp = list.filter((k) => (DexData.S[k].area || []).includes(id)); if (!sp.length) continue;
      const un = Save.unlocked(id), got = sp.filter((k) => Save.data.seen[k]), miss = sp.filter((k) => !Save.data.seen[k]);
      const hint = !un ? 'Not visited yet: follow the quests to get there.' : !miss.length ? '{check} Every Pokémon here registered!' : miss.length + ' left. ' + ((Object.values(DexData.S[miss[0]].beh)[0] || {}).hint || 'Keep exploring.');
      const hl = Font.wrap(hint, 'small', w - 8).slice(0, 2), hh = 21 + hl.length * 8;
      UI.rrect(b, x, y, w, hh - 2, 3, un ? P.white : P.scrLL);
      const cnt = got.length + '/' + sp.length;
      Font.draw(b, fit((un ? '' : '{lock} ') + areaName(id), w - 12 - Font.measure(cnt, 'small')), x + 4, y + 3, P.text, { font: 'small' });
      Font.draw(b, cnt, x + w - 4, y + 3, P.text, { font: 'small', align: 'right' });
      const k = got.length / sp.length; UI.rect(b, x + 4, y + 12, w - 8, 3, P.scrD); UI.rect(b, x + 4, y + 12, Math.round((w - 8) * k), 3, k >= 1 ? P.gold : P.green);
      hl.forEach((ln, j) => Font.draw(b, ln, x + 4, y + 18 + j * 8, P.dim, { font: 'small' }));
      y += hh;
    }
    return y - y0;
  }
  function pageProg(fb, G, t) {
    const Q = content(G);
    if (Q.w >= 270) {
      const [L, R] = split(Q, 0.42, 3);
      card(fb, L); card(fb, R);
      scrollPanel(fb, 'progL', { x: L.x + 2, y: L.y + 2, w: L.w - 4, h: L.h - 4 }, (b, y0) => progSummary(b, L.x + 6, y0 + 4, L.w - 12, L.w >= 90) + 8);
      scrollPanel(fb, 'prog', { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 }, (b, y0) => progAreas(b, R.x + 4, y0 + 3, R.w - 12) + 6);
    } else {
      card(fb, Q);
      scrollPanel(fb, 'prog', { x: Q.x + 2, y: Q.y + 2, w: Q.w - 4, h: Q.h - 4 }, (b, y0) => { let y = y0 + 4; y += progSummary(b, Q.x + 6, y, Q.w - 16, false) + 4; y += progAreas(b, Q.x + 4, y, Q.w - 12); return y - y0 + 4; });
    }
  }

  /* ---------- page: mail from NPCs ---------- */
  const CARRIER = { forest: 'pelipper', canopy: 'tropius', falls: 'altaria', stage: 'altaria' };
  function mailList() {
    if (D.mailC && (D.rt || 0) - D.mailC.t < 1) return D.mailC.list;
    const out = [], d = Save.data;
    out.push({ id: 'm.welcome', from: 'Prof. Birch', sp: 'birch', subj: 'Welcome to Hoenn!', body: 'Welcome, young researcher! I have lent you my newest invention: the Rotom Dex. It records every Pokémon you photograph. Rare behaviours earn more stars, so be patient and watch closely. Good luck!', t: 1 });
    if (Save.found('mail.map')) out.push({ id: 'm.map', from: 'Pelipper', sp: 'pelipper', subj: 'Special delivery: a map!', body: 'PELI! Professor Birch asked me to deliver a map of all Hoenn. Press M or tap the map app to fly between places you have unlocked. Pelipper!', t: d.disc['mail.map'] || 2, act: { label: 'OPEN MAP', fn: () => { if (!locked('map')) close(() => WorldMap.open()); } } });
    for (const id in DexData.AREAS) if (id !== 'beach' && Save.unlocked(id)) { const A = DexData.AREAS[id]; out.push({ id: 'm.area.' + id, from: CARRIER[id] ? spName(CARRIER[id]) : 'Prof. Birch', sp: CARRIER[id] || 'birch', subj: 'Now open: ' + A.name, body: (A.blurb || A.sub || '') + ' New Pokémon are waiting to be researched there!', t: 3 }); }
    for (const e of questList()) {
      const q = e.q; if (q.birch) continue;
      const nm = spName(q.giver), ar = areaName(q.area), intro = (q.intro || []).filter((l) => typeof l === 'string').slice(0, 2).join(' ');
      const act = { label: trackId() === q.id ? 'TRACKING' : 'TRACK QUEST', fn: () => trackQuest(q) };
      if (e.s === 'avail' || e.s === 'lvl') out.push({ id: 'm.q.' + q.id, from: nm, sp: q.giver, subj: q.title, body: intro + ' (Find ' + nm + ' in ' + ar + (e.s === 'lvl' && q.lv ? ' at Lv ' + q.lv : '') + '.)', t: 4, act });
      else if (e.s === 'ready') out.push({ id: 'm.r.' + q.id, from: nm, sp: q.giver, subj: q.title + ': all done?', body: 'I heard you finished the job! Come back and see me in ' + ar + ' for your reward!', t: 6, act });
      else if (e.s === 'done' && q.done) out.push({ id: 'm.d.' + q.id, from: nm, sp: q.giver, subj: 'Thank you!', body: (q.done || []).filter((l) => typeof l === 'string').join(' '), t: 5 });
    }
    for (const b of Quests.BIRCH || []) if (d.quests[b.id]) out.push({ id: 'm.b.' + b.id, from: 'Prof. Birch', sp: 'birch', subj: 'Request complete!', body: '"' + b.t + '" - splendid work! I have sent your reward: ' + rewardLabel(b.reward) + '. Keep it up!', t: d.quests[b.id] });
    const R = (d.rmail = d.rmail || {});
    void R; out.sort((a, b) => b.t - a.t);
    D.mailC = { t: D.rt || 0, list: out };
    return out;
  }
  function mailUnread() { const R = Save.data.rmail || {}; return mailList().filter((m) => !R[m.id]).length; }
  function pageMail(fb, G, t) {
    const Q = content(G), C = G.C, tiny = Q.w < 150, [L, R] = split(Q, tiny ? 0.44 : 0.44, 3);
    const M = mailList(), RD = (Save.data.rmail = Save.data.rmail || {});
    if (D.mailSel) { const i = M.findIndex((m) => m.id === D.mailSel); if (i >= 0 && D.ensure !== 'mail') D.lsel.mail = i; }
    D.lsel.mail = clamp(D.lsel.mail || 0, 0, Math.max(0, M.length - 1));
    const sel = D.lsel.mail, rh = tiny ? 20 : C ? 22 : 26;
    const s = listView(fb, 'mail', L, M.length, rh, sel, (b, i, x, y, w, h, on) => {
      const m = M[i], unread = !RD[m.id];
      UI.rrect(b, x, y, w, h - 1, 3, on ? P.red : P.scrDD); UI.rrect(b, x + 1, y + 1, w - 2, h - 3, 2, on ? P.white : unread ? P.card : P.scrLL);
      const ps = h - 6, tt = DexData.S[m.sp] ? thumb(m.sp, ps, false) : null;
      if (tt) UI.img(b, tt, x + 2 + Math.round((ps - tt.w) / 2), y + 2 + Math.round((ps - tt.h) / 2)); else portrait(b, x + 2, y + 2, ps, m.sp);
      const tx = x + ps + 5, big = h >= 26 && w >= 150;
      Font.draw(b, fit(m.from.toUpperCase(), w - ps - 12), tx, y + 3, unread ? P.redD : P.faint, { font: 'small' });
      Font.draw(b, fit(m.subj, w - ps - 8, big ? 'body' : 'small'), tx, y + (big ? 12 : 11), unread ? P.text : P.dim, { font: big ? 'body' : 'small' });
      if (unread) UI.disc(b, x + w - 5, y + 5, 2, P.red);
    }, (i) => { D.lsel.mail = i; D.mailSel = M[i] && M[i].id; });
    const m = M[sel]; if (!m) return;
    D.mailSel = m.id;
    if (!RD[m.id]) { RD[m.id] = 1; Save.save(); D.mailC = null; }
    D.lookAt = [L.x + L.w / 2, L.y + sel * rh - s + rh / 2];
    card(fb, R, P.white);
    const bh = tiny ? 11 : 13, I = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 - (m.act ? bh + 3 : 0) };
    scrollPanel(fb, 'mailR', I, (b, y0) => {
      const x = I.x + 4, w = I.w - 8; let y = y0 + 3;
      const ps = tiny ? 16 : C ? 22 : 28, tt = DexData.S[m.sp] ? thumb(m.sp, ps, false) : null;
      UI.rrect(b, x - 1, y - 1, ps + 2, ps + 2, 4, P.scrL);
      if (tt) UI.img(b, tt, x + Math.round((ps - tt.w) / 2), y + Math.round((ps - tt.h) / 2)); else portrait(b, x, y, ps, m.sp);
      Font.draw(b, fit(m.from.toUpperCase(), w - ps - 5), x + ps + 5, y + 1, P.faint, { font: 'small' });
      const sf = w - ps >= 90 ? 'body' : 'small';
      Font.draw(b, fit(m.subj, w - ps - 5, sf), x + ps + 5, y + 10, P.text, { font: sf });
      y += ps + 4;
      UI.hline(b, x, x + w, y, P.scrL); y += 4;
      y += textLines(b, m.body, x, y, w, P.text, 99, 9);
      return y - y0 + 4;
    });
    if (m.act) button(fb, 'mail-act', R.x + 4, R.y + R.h - 4 - bh, R.w - 8, bh, m.act.label, m.act.fn);
  }

  /* ---------- page: TMs / moves ---------- */
  function pickMove(i) { const m = Moves.LIST[i]; if (!m) return; D.lsel.tms = i; if (Moves.has(m.id)) { Moves.select(i); SFX.select(); say(m.name + ' selected! Press B or X to use it!', { mood: 'happy' }); } else { SFX.error(); say('Not learned yet! ' + (m.how || ''), { mood: 'sad', life: 6 }); } }
  function pageTMs(fb, G, t) {
    const Q = content(G), C = G.C, tiny = Q.w < 150, [L, R] = split(Q, tiny ? 0.46 : 0.44, 3), LS = Moves.LIST;
    D.lsel.tms = clamp(D.lsel.tms ?? Math.max(0, LS.findIndex((m) => m.id === Moves.cur)), 0, LS.length - 1);
    const sel = D.lsel.tms, rh = tiny ? 15 : C ? 17 : 20;
    const s = listView(fb, 'tms', L, LS.length, rh, sel, (b, i, x, y, w, h, on) => {
      const m = LS[i], own = Moves.has(m.id), cur = Moves.cur === m.id;
      UI.rrect(b, x, y, w, h - 1, 3, on ? P.red : P.scrDD); UI.rrect(b, x + 1, y + 1, w - 2, h - 3, 2, on ? P.white : own ? P.card : P.scrLL);
      const r = (h >> 1) - 3; UI.orb(b, x + 3 + r, y + (h >> 1) - 1, r, own ? m.col : P.grey, { ol: P.rim });
      if (own && r >= 4) Moves.icon(b, m.id, x + 3 + r, y + (h >> 1) - 1, 1);
      const code = w >= 80 ? m.tm || 'MOVE' : '', cw = code ? Font.measure(code, 'small') + 4 : 0;
      Font.draw(b, fit(own ? m.name : '???', w - r * 2 - 9 - cw), x + r * 2 + 6, y + Math.round((h - 6) / 2), own ? P.text : P.faint, { font: 'small' });
      if (code) Font.draw(b, code, x + w - 3, y + Math.round((h - 6) / 2), cur ? P.red : P.faint, { font: 'small', align: 'right' });
    }, (i) => { if (D.lsel.tms === i) pickMove(i); D.lsel.tms = i; });
    D.lookAt = [L.x + L.w / 2, L.y + sel * rh - s + rh / 2];
    const m = LS[sel]; if (!m) return;
    const own = Moves.has(m.id);
    card(fb, R);
    const x = R.x + 5, w = R.w - 10; let y = R.y + 5;
    const r = tiny ? 9 : C ? 12 : 16, cx = x + r + 1, cy = y + r + 1;
    UI.disc(fb, cx, cy + 2, r + 1, P.scrD); UI.orb(fb, cx, cy, r, own ? m.col : P.grey, { ol: P.rim });
    if (own) Moves.icon(fb, m.id, cx, cy, r >= 12 ? 2 : 1); else Font.draw(fb, '?', cx, cy - 4, 0xffffffff, { font: 'body', align: 'center' });
    if (own && Moves.coolK(m.id) > 0) Moves.coolPie(fb, cx, cy, r, Moves.coolK(m.id));
    const tw = w - r * 2 - 5, nf = nameFont(tw);
    Font.draw(fb, fit(own ? m.name : '???', tw, nf), x + r * 2 + 5, y + 1, P.text, { font: nf });
    const sub = (m.tm ? m.tm : 'STARTER') + (m.cool ? ' · ' + m.cool + 'S' : '');
    Font.draw(fb, fit(sub, tw), x + r * 2 + 5, y + fontH(nf) + 2, P.dim, { font: 'small' });
    y += Math.max(r * 2 + 6, fontH(nf) + 13);
    const bh = tiny ? 11 : 13;
    textLines(fb, own ? (m.desc || MOVE_DESC[m.id] || '') : 'How to learn: ' + (m.how || 'keep exploring!'), x, y, w, P.text, Math.max(1, Math.floor((R.y + R.h - 6 - bh - y) / 9)), 9);
    if (own) button(fb, 'usemove', x, R.y + R.h - 4 - bh, w, bh, Moves.cur === m.id ? '{check} EQUIPPED' : w >= 110 ? 'EQUIP (B / X TO USE)' : 'EQUIP', () => pickMove(sel), { fill: Moves.cur === m.id ? P.green : P.red });
  }

  const MOVE_DESC = { bubble: 'Floating bubbles Pokémon love to chase and pop.', growl: 'A big "Mud-KIP!": nearby Pokémon look your way. A photo trick!', dig: 'Dig on sand or soil for buried treasure.', smash: 'Breaks cracked rocks and boulders.', ice: 'Freezes the water into floes you can hop across.' };

  /* ---------- page: day / night ---------- */
  const SKY = { dawn: ['#ffb8a0', '#8ab0e8'], noon: ['#8ad0ff', '#4a90e8'], afternoon: ['#ffd89a', '#6aa8e8'], dusk: ['#ff8a5a', '#5a3a8a'], night: ['#1a2050', '#0a0e2a'] };
  function pageTime(fb, G, t) {
    const Q = content(G), C = G.C, tiny = Q.w < 150, [L, R] = split(Q, tiny ? 0.42 : 0.5, 3), hr = Game.hour(), sk = SKY[hr] || SKY.noon;
    const s0 = hex(sk[0]), s1 = hex(sk[1]);
    rrFill(fb, L.x, L.y, L.w, L.h, 5, (i, j, ins, w, h) => (j === 0 || i === ins || i === w - 1 - ins || j === h - 1 ? P.scrDD : mix(s1, s0, j / h)));
    const hi = Pal.HOURS.indexOf(hr), k = (hi + 0.5) / Pal.HOURS.length, night = hr === 'night', sr = tiny ? 6 : 8;
    const ax = L.x + 12 + Math.round((L.w - 24) * k), ay = L.y + L.h - 16 - Math.round(Math.sin(k * Math.PI) * (L.h - 40));
    if (night) { for (let i = 0; i < 26; i++) UI.put(fb, L.x + 3 + Math.floor(U.hash(i, 1, 2) * (L.w - 6)), L.y + 3 + Math.floor(U.hash(i, 3, 4) * (L.h - 24)), (Math.sin(t * 3 + i) > 0.3) ? 0xffffffff : 0xffd8a8a0); UI.disc(fb, ax, ay, sr, hex('#fff2b8')); UI.disc(fb, ax + 4, ay - 3, sr - 1, mix(s1, s0, (ay - L.y) / L.h)); }
    else { for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2 + t * 0.4; UI.line(fb, Math.round(ax + Math.cos(an) * (sr + 3)), Math.round(ay + Math.sin(an) * (sr + 3)), Math.round(ax + Math.cos(an) * (sr + 6)), Math.round(ay + Math.sin(an) * (sr + 6)), hex('#ffd23a')); } UI.disc(fb, ax, ay, sr, hex('#ffe060')); UI.disc(fb, ax - 2, ay - 2, 3, hex('#fff8c0')); }
    for (let i = 0; i < L.w - 4; i++) { const hgt = 5 + Math.round(Math.sin(i * 0.11) * 3 + Math.sin(i * 0.31) * 2); UI.vline(fb, L.x + 2 + i, L.y + L.h - 2 - hgt, L.y + L.h - 3, night ? hex('#101838') : hex('#3a8a4a')); }
    const hf = L.w >= 90 ? 'title' : 'body';
    Font.draw(fb, fit(hr.toUpperCase(), L.w - 10, hf), L.x + 5, L.y + 5, night ? 0xffffffff : P.text, { font: hf, outline: night ? P.rim : undefined });
    card(fb, R);
    let y = R.y + 5; const x = R.x + 5, w = R.w - 10, bh = tiny ? 11 : 13;
    Font.draw(fb, fit('TIME OF DAY', w), x, y, P.redD, { font: 'small' }); y += 9;
    const can = Game.canTime();
    y += textLines(fb, can ? 'Dialga lends you its power: let the hours pass.' : 'Time flows by itself... only the Pokémon that rules time could change it.', x, y, w, P.text, tiny ? 3 : 3, 8) + 2;
    button(fb, 'time-next', x, y, w, bh, can ? (w >= 100 ? 'LET TIME PASS {right}' : 'NEXT {right}') : '{lock} ' + (w >= 100 ? 'LET TIME PASS' : 'LOCKED'), () => Game.tryTime(), { fill: can ? P.blue : P.grey });
    y += bh + 5;
    if (typeof Seasons !== 'undefined' && y + 9 + bh <= R.y + R.h - 3) {
      Font.draw(fb, fit((w >= 100 ? 'SEASON: ' : '') + Seasons.NAME[Seasons.cur].toUpperCase(), w), x, y, P.redD, { font: 'small' }); y += 9;
      const ok = !hasP() || Progress.has('season');
      button(fb, 'season-next', x, y, w, bh, ok ? (w >= 100 ? 'NEXT SEASON {right}' : 'SEASON {right}') : '{lock} LV 8', () => Seasons.next(), { fill: ok ? P.green : P.grey });
      y += bh + 5;
    }
    const Wt = Weather.W, wl = Wt.rain > 0.3 ? 'RAIN' : Wt.snow > 0.3 ? 'SNOW' : Wt.fog > 0.3 ? 'FOG' : 'CLEAR';
    if (y < R.y + R.h - 9) Font.draw(fb, fit('WEATHER: ' + wl, w), x, y, P.dim, { font: 'small' });
  }

  /* ---------- page: chat with Rotom ---------- */
  const CHATQ = [['joke', 'TELL A JOKE', 'JOKE'], ['hint', 'GIVE ME A HINT', 'HINT'], ['near', 'WHO IS NEARBY?', 'NEARBY?'], ['me', 'HOW AM I DOING?', 'HOW AM I?']];
  function chatAsk(kind) {
    const R = typeof Rotom !== 'undefined' ? Rotom : null;
    const q = (CHATQ.find((c) => c[0] === kind) || ['', ''])[1];
    let a = '';
    if (kind === 'joke') a = R && R.joke ? R.joke() : 'Why did the Magnemite get a job? For the current-cy! Bzzt!';
    else if (kind === 'hint') a = R && R.hint ? R.hint() : 'Rare behaviours give more stars!';
    else if (kind === 'near') {
      const mk = Game.mudkip, near = mk ? Mons.all.filter((m) => m !== mk && m.alive && DexData.S[m.dex] && !String(m.kind).startsWith('bg-') && Math.abs(m.x - mk.x) < 400) : [];
      const sp = [...new Set(near.map((m) => m.dex))];
      const nw = sp.filter((k) => stat(k) < 2);
      a = !sp.length ? 'Rotom senses... nobody. Just us! Bzzt.' : nw.length ? 'Ooh! ' + nw.map((k) => (stat(k) ? DexData.S[k].name : 'a mystery Pokémon')).slice(0, 2).join(' and ') + ' nearby! No photo yet!' : 'Nearby: ' + sp.slice(0, 3).map((k) => DexData.S[k].name).join(', ') + '. All registered! Zzt!';
    } else { const c = counts(); a = 'You have caught ' + c.caught + ' of ' + c.all + ' Pokémon on camera' + (hasP() ? ' and reached Lv ' + Progress.level() : '') + '! ' + (c.caught > 20 ? 'Rotom is SO impressed!' : 'Great start! Bzzt!'); }
    D.chat.push({ me: true, text: q }, { me: false, text: a, t: 0 });
    if (D.chat.length > 30) D.chat.splice(0, D.chat.length - 30);
    D.chatNew = true;
    say(kind === 'joke' ? 'Hehe... Bzzt!' : 'Bzzt! Here you go!', { mood: kind === 'joke' ? 'happy' : 'norm', life: 2.5 });
    if (R && R.voice) R.voice('chat', 0.5);
  }
  function pageChat(fb, G, t) {
    const Q = content(G), C = G.C, bh = C ? 12 : 14, cols = Q.w < 300 ? 2 : 4, bw = Math.floor((Q.w - (cols - 1) * 3) / cols);
    const rows = Math.ceil(CHATQ.length / cols), Lh = Q.h - rows * (bh + 3);
    const L = { x: Q.x, y: Q.y, w: Q.w, h: Lh - 2 };
    card(fb, L, P.scrLL);
    if (!D.chat.length) D.chat.push({ me: false, text: 'Bzzt! Hi! Rotom is your research buddy. Ask me anything! (Or poke me out in the world. I like that. Mostly.)', t: 9 });
    const I = { x: L.x + 3, y: L.y + 3, w: L.w - 6, h: L.h - 6 };
    // messages bottom-aligned; the newest stays in view
    const lay = D.chat.map((m) => { const ls = Font.wrap(m.text, 'small', Math.round(I.w * 0.7)); return { m, ls, h: ls.length * 8 + 7 }; });
    const total = lay.reduce((a, l) => a + l.h + 3, 0) + 3;
    if (D.chatNew) { D.scroll.chat = Math.max(0, total - I.h); D.chatNew = false; }
    scrollPanel(fb, 'chat', I, (b, y0) => {
      let y = y0 + 3 + Math.max(0, I.h - total);
      for (const l of lay) {
        const w = Math.max(...l.ls.map((s) => Font.measure(s, 'small'))) + 10, me = l.m.me, x = me ? I.x + I.w - w - 6 : I.x + 14;
        UI.rrect(b, x, y, w, l.h, 4, P.rim); UI.rrect(b, x + 1, y + 1, w - 2, l.h - 2, 3, me ? P.white : P.face);
        if (!me) { UI.disc(b, I.x + 6, y + l.h - 5, 4, P.red); UI.put(b, I.x + 5, y + l.h - 6, 0xffffffff); UI.put(b, I.x + 7, y + l.h - 6, 0xffffffff); }
        l.ls.forEach((s, j) => Font.draw(b, s, x + 5, y + 4 + j * 8, P.text, { font: 'small' }));
        y += l.h + 3;
      }
      return Math.max(I.h, total);
    });
    CHATQ.forEach(([id, lab, short], i) => {
      const bx = Q.x + (i % cols) * (bw + 3), by = Q.y + Lh + Math.floor(i / cols) * (bh + 3);
      button(fb, 'chat-' + id, bx, by, bw, bh, Font.measure(lab, 'small') + 6 > bw ? short : lab, () => chatAsk(id), { fill: [P.red, P.blue, P.green, hex('#8a5ee6')][i], silent: true });
    });
  }

  /* ---------- page: help ---------- */
  const HELP = [
    ['MOVE', 'Stick or arrows / WASD. Tap the ground to walk there.'],
    ['JUMP', 'A or Space. Again in mid-air for a flip, Down to belly flop!'],
    ['CAMERA', 'SNAP or C. Drag to aim, pinch or wheel to zoom, tap a Pokémon to focus. Hold the shutter to catch the best moment.'],
    ['STARS', 'Rare behaviours give more stars. Big, centred, facing you and in focus = better medals.'],
    ['MOVES', 'B / X uses your move, hold for the move wheel. Water Gun wakes and splashes, Growl makes Pokémon look at you!'],
    ['SCAN', 'Scan (4) reveals clues, hidden Pokémon and secrets nearby.'],
    ['ROTOM', 'Poke Rotom (or press O) for jokes and hints. It flies out of your shots.'],
    ['KEYS', 'P Pokédex · M map · B bag · V wardrobe · L quests · G guitar · T time · H home (in the Dex).'],
  ];
  function pageHelp(fb, G, t) {
    const Q = content(G);
    card(fb, Q);
    const I = { x: Q.x + 2, y: Q.y + 2, w: Q.w - 4, h: Q.h - 4 };
    scrollPanel(fb, 'help', I, (b, y0) => {
      let y = y0 + 5; const x = I.x + 6, w = I.w - 14, lw = G.C ? 46 : 54;
      for (const [k, v] of HELP) {
        pill(b, x, y - 2, lw - 6, 10, P.red, 0xffffffff, k, { hi: false });
        y += Math.max(10, textLines(b, v, x + lw, y, w - lw, P.text, 9, 8)) + 5;
      }
      return y - y0;
    });
  }

  /* ---------- older pages (kept, drawn into the new screen) ---------- */
  function pageAlbum(fb, G, t) {
    const Q = content(G), tiny = Q.w < 150, [L, R] = split(Q, 0.5, 3);
    const al = Save.data.album, sel = al[D.album] || null;
    card(fb, L);
    const pw = L.w - 6, phh = Math.max(20, Math.min(Math.round(pw * 0.72), L.h - (sel ? (tiny ? 24 : 30) : 8)));
    UI.rrect(fb, L.x + 2, L.y + 2, pw + 2, phh + 2, 2, P.rim);
    if (sel && sel.img) { const b = photo(sel.img); if (b) UI.imgFit(fb, b, L.x + 3, L.y + 3, pw, phh); }
    else textLines(fb, al.length ? 'Photo not saved' : 'No photos yet - go snap!', L.x + 7, L.y + 3 + Math.round(phh / 2) - 8, pw - 8, P.white, 3, 8);
    if (sel) {
      const y = L.y + 6 + phh, d = DexData.S[sel.sp];
      if (d) {
        Font.draw(fb, fit(d.name + (d.beh[sel.beh] && pw >= 110 ? ' - ' + d.beh[sel.beh].n : ''), pw), L.x + 4, y + 1, P.text, { font: 'small' });
        stars(fb, sel.stars, L.x + 4, y + 10); medal(fb, sel.medal, L.x + 36, y + 13);
        if (pw >= 80) Font.draw(fb, sel.score + ' PTS', L.x + 43, y + 11, P.dim, { font: 'small' });
      }
    }
    const cw = tiny ? 29 : G.C ? 42 : 54, chh = Math.round(cw * 0.82), cols = Math.max(2, Math.floor((R.w - 2) / cw));
    const gx = R.x + Math.floor((R.w - cols * cw) / 2), rows = Math.ceil(al.length / cols);
    D.scroll.album = clamp(D.scroll.album || 0, 0, Math.max(0, rows * chh - R.h + 4));
    areas.album = { x: R.x, y: R.y, w: R.w, h: R.h };
    if (!al.length) textLines(fb, 'Your last photos appear here.', R.x + 4, R.y + R.h / 2 - 8, R.w - 8, P.text, 3, 8);
    clipTo(fb, R, (b) => {
      al.forEach((a, i) => {
        const x = gx + (i % cols) * cw, y = R.y + 2 + Math.floor(i / cols) * chh - D.scroll.album;
        UI.rrect(b, x + 1, y + 1, cw - 4, chh - 4, 2, i === D.album ? P.red : P.rim);
        const im = a.img ? photo(a.img) : null;
        if (im) UI.imgFit(b, im, x + 3, y + 3, cw - 8, chh - 8); else UI.rect(b, x + 3, y + 3, cw - 8, chh - 8, 0xff40302a);
        if (a.stars && cw >= 40) stars(b, a.stars, x + 3, y + chh - 12, a.stars);
        if (a.medal) medal(b, a.medal, x + cw - 9, y + chh - 9);
      });
    });
    al.forEach((a, i) => { const x = gx + (i % cols) * cw, y = R.y + 2 + Math.floor(i / cols) * chh - D.scroll.album; if (y + chh > R.y && y < R.y + R.h - 4) btn('al' + i, x, Math.max(R.y, y), cw, chh, () => { D.album = i; }); });
    if (sel) { const i = D.album; D.lookAt = [gx + (i % cols) * cw + cw / 2, R.y + Math.floor(i / cols) * chh - D.scroll.album + chh / 2]; }
  }

  /* ---- style: Mudkip's wardrobe + device customisation ---- */
  const mudCache = new Map();
  function mudSprite(look, yaw, sc = 1) {
    const key = JSON.stringify(look) + '|' + yaw.toFixed(2) + '|' + sc;
    if (mudCache.has(key)) return mudCache.get(key);
    const m = Mudkip.meta, W = Math.ceil(m.bw * sc), H = Math.ceil(m.bh * sc);
    const r = Mudkip.render(Mudkip.build(Object.assign({ side: Math.cos(yaw), eyes: 'happy', mouth: 1 }, look)), { yaw, pitch: 0.16, scale: sc, W, H, ox: W >> 1, oy: Math.floor(H * m.oy), pal: Mudkip.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
    const b = r.buf; b.ox = W >> 1; b.oy = Math.floor(H * m.oy);
    const bb = Creature.bounds(r); b.bb = bb;
    if (mudCache.size > 60) mudCache.delete(mudCache.keys().next().value);
    mudCache.set(key, b);
    return b;
  }
  function drawMud(fb, L, yOff = 0, bottomPad = 12) {
    const look = Save.look(), yaw = Math.round((0.6 + Math.sin(D.mudYaw * 0.7) * 0.9) * 10) / 10;
    const availH = L.h - yOff - bottomPad - 4, availW = L.w - 6;
    // pick a render scale so the model fits the card (x2 pixels when there is lots of room)
    const b1 = mudSprite(look, yaw, 1), bb1 = b1.bb || { h: b1.h, w: b1.w };
    let sc = 1, b = b1;
    if (bb1.h * 2 <= availH && bb1.w * 2 <= availW) sc = 2;
    else if (bb1.h > availH || bb1.w > availW) { const k2 = Math.max(0.3, Math.min(availH / bb1.h, availW / bb1.w)); b = mudSprite(look, yaw, Math.floor(k2 * 10) / 10); }
    const bb = b.bb || { x0: 0, y0: 0, w: b.w, h: b.h }, baseY = L.y + L.h - bottomPad;
    UI.rrect(fb, L.x + L.w / 2 - Math.min(30, L.w / 2 - 4), baseY - 2, Math.min(60, L.w - 8), 5, 2, P.scrD);
    UI.img(fb, b, Math.round(L.x + L.w / 2 - b.ox * sc), Math.round(baseY - (bb.y0 + bb.h) * sc), sc === 2 ? 2 : 1);
  }
  // a row of options: pills when they fit, a  ◀ NAME ▶  chip otherwise
  function chooser(fb, key, x, y, w, h, opts, cur, pick2) {
    const i = Math.max(0, opts.findIndex((o) => o[0] === cur));
    const per = Math.max(1, Math.min(opts.length, Math.floor(w / 44)));
    if (per >= 3) {
      const rows = Math.ceil(opts.length / per), sw = Math.floor(w / per);
      opts.forEach(([id, label], j) => {
        const bx = x + (j % per) * sw, by = y + Math.floor(j / per) * (h + 2), on = cur === id;
        pill(fb, bx, by, sw - 2, h, on ? P.red : P.scrLL, on ? 0xffffffff : P.dim, label.toUpperCase());
        btn(key + '-' + id, bx, by - 1, sw - 2, h + 2, () => pick2(id), { silent: true });
      });
      return rows * (h + 2);
    }
    const aw = 12;
    button(fb, key + '-prev', x, y, aw, h, '{left}', () => pick2(opts[(i + opts.length - 1) % opts.length][0]), { fill: hex('#3a4290'), silent: true });
    button(fb, key + '-next', x + w - aw, y, aw, h, '{right}', () => pick2(opts[(i + 1) % opts.length][0]), { fill: hex('#3a4290'), silent: true });
    pill(fb, x + aw + 2, y, w - aw * 2 - 4, h, P.red, 0xffffffff, opts[i][1].toUpperCase() + ' ' + (i + 1) + '/' + opts.length);
    return h + 3;
  }
  function pageStyle(fb, G, t) {
    const Q = content(G), C = G.C, tiny = Q.w < 150, [L, R] = split(Q, tiny ? 0.36 : 0.4, 3);
    card(fb, L);
    Font.draw(fb, fit(L.w >= 90 ? 'Mudkip\'s look' : 'MUDKIP', L.w - 8, L.w >= 90 ? 'body' : 'small'), L.x + 4, L.y + 4, P.text, { font: L.w >= 90 ? 'body' : 'small' });
    drawMud(fb, L, 14, 12);
    Font.draw(fb, fit(UI.skin().name.toUpperCase(), L.w - 6), L.x + L.w / 2, L.y + L.h - 9, P.dim, { font: 'small', align: 'center' });
    const th = C ? 11 : 12;
    const used = chooser(fb, 'slot', R.x, R.y, R.w, th, Rewards.SLOTS, D.styleSlot, (slot) => { D.styleSlot = slot; D.scroll.style = 0; SFX.page(); });
    const top = R.y + used + 1;
    const items = Object.keys(Rewards.C).filter((id) => Rewards.C[id].slot === D.styleSlot);
    const eq = Save.data.equip[D.styleSlot], canNone = ['hat', 'shirt', 'glasses', 'key', 'shoes', 'fun'].includes(D.styleSlot);
    const rows = canNone ? [null, ...items] : items;
    const LQ = { x: R.x, y: top, w: R.w, h: R.y + R.h - top };
    listView(fb, 'style', LQ, rows.length, tiny ? 14 : C ? 16 : 19, -1, (b, i, x, y, w, h) => {
      const id = rows[i], own = id === null || Save.has(id), on = eq === id || (id === null && !eq);
      UI.rrect(b, x, y, w, h - 1, 3, on ? P.red : P.scrDD); UI.rrect(b, x + 1, y + 1, w - 2, h - 3, 2, on ? P.white : own ? P.card : P.scrLL);
      const nm = id === null ? 'None' : own ? Rewards.C[id].name : '???', desc = w >= 130 && id && own && Rewards.C[id].desc;
      Font.draw(b, fit((on ? '{check} ' : own ? '' : '{lock} ') + nm, desc ? w * 0.55 : w - 8), x + 4, y + Math.round((h - 6) / 2), own ? P.text : P.faint, { font: 'small' });
      if (desc) Font.draw(b, fit(Rewards.C[id].desc, w * 0.42), x + w - 4, y + Math.round((h - 6) / 2), P.faint, { font: 'small', align: 'right' });
    }, (i) => { const id = rows[i]; if (id === null || Save.has(id)) { Save.equip(D.styleSlot, id); SFX.select(); if (D.styleSlot === 'key') D.keyV = 4; if (Math.random() < 0.5) say(pick(['Ooh, stylish!', 'Looking good! Bzzt!', 'Very fashionable!']), { mood: 'happy' }); } else SFX.error(); });
  }

  /* ---- shop: spend research points on items, outfits and device styles ---- */
  const PRICE = { hat: 900, shirt: 800, glasses: 600, neck: 500, skin: 1500, banner: 700, key: 400, deco: 600 };
  const GOODS = [
    { id: 'item.berry5', name: '5 Oran Berries', desc: 'Throw them to lure hungry Pokémon.', price: 150, buy() { Save.addItem('berry', 5); } },
    { id: 'item.lure', name: 'Sweet Lure', desc: 'For 90 s Pokémon come closer and rare ones show up.', price: 400, buy() { Game.lureT = 90; HUD.toast('The Sweet Lure fills the air... Pokémon are drawn to you!', { life: 3 }); } },
    { id: 'item.film', name: 'Photo Album Page', desc: '+6 album slots for your favourite shots.', price: 300, buy() { Save.data.albumMax = (Save.data.albumMax || 24) + 6; Save.save(); } },
  ];
  let exclusiveSet = null;
  function exclusive() {
    if (exclusiveSet) return exclusiveSet;
    exclusiveSet = new Set();
    for (const k in DexData.S) for (const o of DexData.S[k].obj || []) if (o.reward) exclusiveSet.add(o.reward);
    for (const q of Quests.BIRCH || []) if (q.reward) exclusiveSet.add(q.reward);
    return exclusiveSet;
  }
  function pageShop(fb, G, t) {
    const Q = content(G), C = G.C, pts = Save.data.points, narrow = Q.w < 170;
    let R = Q;
    if (!narrow) {
      const [L, R2] = split(Q, 0.34, 3); R = R2;
      card(fb, L);
      Font.draw(fb, fit('{coin} ' + pts, L.w - 8, 'body'), L.x + 5, L.y + 5, P.text, { font: 'body' });
      const ty = L.y + 19 + textLines(fb, 'Earn points with great photos and requests!', L.x + 5, L.y + 19, L.w - 10, P.dim, C ? 3 : 4, 8);
      drawMud(fb, L, ty - L.y, 6);
    }
    const cats = [['items', 'ITEMS'], ['outfit', 'OUTFITS'], ['device', 'DEVICE']];
    D.shopCat = D.shopCat || 'items';
    const th = tabs(fb, 'shopc', R.x, R.y, R.w, cats, D.shopCat, (id) => { D.shopCat = id; D.scroll.shop = 0; });
    let rows;
    if (D.shopCat === 'items') rows = GOODS.map((g) => ({ id: g.id, name: g.name, desc: g.desc, price: g.price, owned: false, buy: g.buy }));
    else {
      const slots = D.shopCat === 'outfit' ? ['hat', 'shirt', 'glasses', 'neck'] : ['skin', 'banner', 'key', 'deco'];
      rows = Object.keys(Rewards.C).filter((id) => slots.includes(Rewards.C[id].slot) && !id.endsWith('.none'))
        .map((id) => { const ex = exclusive().has(id); return { id, name: Rewards.C[id].name + (ex ? ' {star}' : ''), desc: (ex ? 'Quest prize - or buy it now! ' : '') + (Rewards.C[id].desc || ''), price: (PRICE[Rewards.C[id].slot] || 500) * (ex ? 3 : 1), owned: Save.has(id), buy() { Save.own(id); Save.equip(Rewards.C[id].slot, id); } }; })
        .sort((a, b) => (a.owned - b.owned) || (a.price - b.price));
    }
    const LQ = { x: R.x, y: R.y + th, w: R.w, h: R.h - th }, rh = C ? 21 : 26;
    listView(fb, 'shop', LQ, rows.length, rh, -1, (g, i, x, y, w, h) => {
      const r = rows[i], afford = pts >= r.price, bw = w >= 140 ? 48 : 38, bh = 11, bigF = h >= 26 && w >= 190;
      UI.rrect(g, x, y, w, h - 1, 3, P.scrDD); UI.rrect(g, x + 1, y + 1, w - 2, h - 3, 2, r.owned ? P.white : P.card);
      Font.draw(g, fit(r.name, w - bw - 10, bigF ? 'body' : 'small'), x + 4, y + (bigF ? 2 : 4), P.text, { font: bigF ? 'body' : 'small' });
      Font.draw(g, fit(r.desc || '', w - bw - 10), x + 4, y + (bigF ? 15 : 13), P.faint, { font: 'small' });
      pill(g, x + w - 3 - bw, y + Math.round((h - 1 - bh) / 2), bw, bh, r.owned ? P.grey : afford ? P.red : hex('#6a6a80'), 0xffffffff, r.owned ? 'OWNED' : '{coin}' + r.price, { hi: !r.owned });
    }, (i) => {
      const r = rows[i]; if (r.owned) return;
      if (Save.data.points < r.price) { SFX.error(); HUD.toast('Not enough points - take more great photos!', { life: 2 }); say('Not enough points! Bzzt...', { mood: 'sad' }); return; }
      Save.data.points -= r.price; Save.save(); r.buy(); SFX.reward(); HUD.toast('Bought ' + r.name + '!', { life: 2 }); say('Ka-ching! Bzzt!', { mood: 'happy' });
    });
  }

  /* ---- discoveries ---- */
  const SECRETS = [
    ['beach.chest', 'The sunken treasure chest', 'Something glints on the seabed past the reef.'],
    ['dialga.met', 'A crystal humming with time', 'A beach rock sounds hollow...'],
    ['orb.taken', 'The Lustrous Orb', 'One of the moored boats hides a pearly glow.'],
    ['wailord.song', 'The song that calls the giant', 'Wailord listen from far out at sea.'],
    ['kyogre.woke', 'The legend of the trench', 'The Blue Orb, the deep, the night...'],
    ['meloetta.record', 'The Pokémon inside the music', 'Tap the spinning record.'],
    ['forest.institute', 'The Weather Institute switch', 'The Institute can make any weather.'],
    ['forest.feebas', 'The quiet pool', 'Under the bridge, the ripples look different.'],
    ['forest.rainbow', 'A rainbow after rain', 'Rain, then sun...'],
    ['forest.lever', 'The old bridge lever', 'Something by the river could lower a bridge.'],
    ['forest.ludicolo', 'The dancing duck', 'Ludicolo cannot resist a good beat.'],
    ['forest.milotic', 'The most beautiful Pokémon', 'Look after the quiet fish and it may blossom.'],
    ['kecleon.found', 'The invisible one', 'Leaves that move with no wind...'],
    ['tropius.ride', 'A ride on Tropius', 'Feed Tropius enough fruit and it may give you a lift.'],
    ['zigzagoon.pickup', 'Zigzagoon\'s treasure hunt', 'Follow a Zigzagoon when it starts sniffing.'],
    ['seedot.gloss', 'A glossy acorn', 'Some acorns in the fruit tree look thirsty.'],
    ['slakoth.yawn', 'A catching yawn', 'Keep a lazy Pokémon company for a while.'],
    ['forest.cheer', 'Plus and Minus', 'Have fun where the cheer squad can see you.'],
    ['wailmer.leap', 'The Wailmer leap', 'Sing at the end of the dock on a sunny day.'],
    ['tentacool.rescue', 'Back to the sea', 'Something has washed up by the water line.'],
    ['staryu.stars', 'The starry shore', 'On the beach at night, the stars come down to the sand.'],
    ['chinchou.escort', 'Lights in the deep', 'The trench at night is not as dark as it looks.'],
    ['relicanth.rose', 'The living fossil', 'When both old friends are home, watch the trench at dawn.'],
    ['trapinch.found', 'The sand pit', 'A funnel in the sand by the cliffs.'],
    ['nincada.found', 'The Pokémon under the roots', 'Dry roots on the cliff top... maybe they need water.'],
    ['fossil.lileep', 'The Root Fossil revived', 'Dig at the cliffs, then visit the altar.'],
    ['fossil.anorith', 'The Claw Fossil revived', 'A second fossil lies deeper along the cliffs.'],
    ['toy.umbrella', 'Umbrella trampoline', 'That beach umbrella looks bouncy.'],
    ['toy.castle', 'A sandcastle masterpiece', 'Keep building by the tide line.'],
    ['toy.hammock', 'A nap in the hammock', 'Two palms, one hammock.'],
    ['toy.bell', 'The dock bell', 'Ring it and see who flies in.'],
    ['toy.vine', 'Vine swing', 'A long vine hangs over the forest river.'],
    ['toy.mushroom', 'Mushroom trampoline', 'The giant mushroom in the forest looks springy.'],
    ['canopy.stage', 'The treetop stage', 'A stage waiting for music.'],
    ['canopy.chimes', 'The wind chime tune', 'Chatot might whistle the right order.'],
    ['canopy.feeder', 'The feeder feast', 'Hang a berry, then chase off the thief.'],
    ['canopy.choir', 'The Altaria choir', 'Sing at the lookout when the sun goes down.'],
    ['canopy.clean', 'Squeaky clean', 'Stand still under a Swablu for a while.'],
    ['palkia.met', 'The Pokémon that rules space', 'Dialga is not the only one...'],
    ['falls.meteorite', 'The meteorite heart', 'Deep in the cave, a rock hums with space.'],
    ['falls.shower', 'A meteor shower', 'Starfall Cave lives up to its name at night.'],
    ['falls.chimes', 'The singing crystals', 'Listen to the drips - they know the tune.'],
    ['falls.flight', 'Bagon\'s first flight', 'A leaping Bagon needs a lift from below.'],
    ['falls.wish', 'Jirachi\'s wish', 'Sing by the crystal nest while stars are falling.'],
    ['falls.deoxys', 'The visitor from space', 'Wake the meteorite, then crack Minior of many colours.'],
    ['toy.geyser', 'Geyser launch', 'Swim over the vent in the glowing pool.'],
    ['toy.slide', 'Waterfall slide', 'The stream off the high ledge looks slippery.'],
    ['regi.puzzle', 'The Braille Wall', 'Deep in Starfall Cave, dots on a wall name three stones.'],
    ['volcano.vent', 'Steam Rider', 'Lavaridge\'s steam vents are stronger than they look.'],
    ['volcano.stones', 'The Magma Stones', 'Four carved stones ring Mt. Chimney\'s crater. Watch the lava.'],
    ['groudon.woke', 'The Land Awakens', 'Something enormous sleeps in the magma.'],
    ['volcano.flute', 'Glass Flute', 'The glassblower on the ash slopes wants volcanic ash.'],
    ['shoal.skate', 'Ice Skater', 'Shoal Cave\'s floor is slippery. Very slippery.'],
    ['regice.woke', 'The Iceberg Giant', 'Stand in the circle. Be still. Then sing.'],
    ['rayquaza.seen', 'Sky High', 'Once a great Pokémon wakes, watch the sky over Treetop Town.'],
    ['forest.windmill', 'The Old Windmill', 'Past the stump, Weather Woods opens into a flower meadow.'],
    ['arcade.battle', 'Type Champion', 'Beat Budew at Type Battle in Weather Woods.'],
    ['arcade.rope', 'Skip Star', 'Ten jumps in a row at Spinda\'s jump rope.'],
    ['arcade.seek', 'Seeker', 'Find Marill in Hide & Seek on the boardwalk.'],
    ['arcade.tag', 'Tag Master', 'Catch Linoone at Tag... and escape.'],
    ['arcade.bar', 'Star Mixer', 'Serve 5 drinks in one shift at the Sunset Bar.'],
  ];
  function pageDisc(fb, G, t) {
    const Q = content(G), C = G.C, tiny = Q.w < 150, [L, R] = split(Q, tiny ? 0.36 : 0.34, 3), got = SECRETS.filter((s) => Save.found(s[0])).length;
    card(fb, L);
    Font.draw(fb, fit(L.w >= 80 ? 'SECRETS FOUND' : 'FOUND', L.w - 10), L.x + 5, L.y + 5, P.redD, { font: 'small' });
    const cf = L.w >= 80 ? 'title' : 'body';
    Font.draw(fb, fit(got + '/' + SECRETS.length, L.w - 10, cf), L.x + 5, L.y + 15, P.text, { font: cf, sc: G.L ? 2 : 1 });
    const k = got / SECRETS.length, bw = L.w - 10, by = L.y + (G.L ? 46 : 32);
    UI.rrect(fb, L.x + 5, by, bw, 5, 2, P.scrD); if (got) UI.rrect(fb, L.x + 5, by, Math.max(3, Math.round(bw * k)), 5, 2, P.gold);
    textLines(fb, 'Use Scan (4) near anything suspicious. Pokémon clues point the way too!', L.x + 5, by + 9, L.w - 10, P.dim, Math.max(0, Math.floor((L.y + L.h - by - 12) / 8)));
    listView(fb, 'disc', R, SECRETS.length, C ? 20 : 23, -1, (b, i, x, y, w, h) => {
      const [id, name, hint] = SECRETS[i], f = Save.found(id);
      UI.rrect(b, x, y, w, h - 1, 3, P.scrDD); UI.rrect(b, x + 1, y + 1, w - 2, h - 3, 2, f ? P.white : P.card);
      Font.draw(b, fit((f ? '{spark} ' : '{lock} ') + (f ? name : '???'), w - 6), x + 3, y + 3, f ? P.text : P.dim, { font: 'small' });
      Font.draw(b, fit(f ? 'Discovered!' : hint, w - 10), x + 7, y + (C ? 11 : 12), P.faint, { font: 'small' });
    });
  }

  /* ---- settings ---- */
  function rotomCfg() { return Save.data.rotom || (Save.data.rotom = { off: false, chat: 1 }); }
  function pageSettings(fb, G, t) {
    const Q = content(G), C = G.C, cfg = rotomCfg();
    const rows = [
      ['h', 'ROTOM BUDDY'],
      ['rbuddy', 'Rotom in the world', cfg.off ? 'OFF' : 'ON', () => { cfg.off = !cfg.off; Save.save(); say(cfg.off ? 'Rotom will stay in the Dex. Bzzt...' : 'Yay! Rotom will fly with you!', { mood: cfg.off ? 'sad' : 'happy' }); }],
      ['rchat', 'Chatter', ['QUIET', 'SOME', 'LOTS'][cfg.chat ?? 1], () => { cfg.chat = ((cfg.chat ?? 1) + 1) % 3; Save.save(); say(['Rotom will be quiet. Mostly.', 'Normal chatter! Bzzt!', 'Rotom will talk a LOT! Bzzt-bzzt!'][cfg.chat]); }],
      ['note', 'Poke Rotom in the world (or press O) for jokes and hints. It ducks out of your photos!'],
      ['h', 'GAME'],
      ['sound', 'Sound', Sound.on ? 'ON' : 'OFF', () => { const v = Sound.set(!Sound.on); U.store.set('mk-snap-sound', v); Music.onSound(v); }],
      ['song', 'Song', Music.cur && Music.TRACKS && Music.TRACKS[Music.cur] ? Music.TRACKS[Music.cur].title : '-', () => Music.next()],
      ['grid', 'Camera grid', Photo.grid ? 'ON' : 'OFF', () => { Photo.grid = !Photo.grid; }],
      ['time', 'Time of day', Game.hour().toUpperCase(), () => Game.tryTime()],
      ['reset', 'Reset journal', D.confirm ? 'SURE?' : '...', () => { if (D.confirm) { Save.reset(); D.confirm = null; HUD.toast('Journal reset.'); say('Memory wiped! Who are you? Bzzt!', { mood: 'dizzy', moodT: 2 }); } else { D.confirm = true; say('Tap again to erase EVERYTHING!', { mood: 'wow' }); setTimeout(() => { D.confirm = null; }, 2500); } }],
    ];
    const rowH = C ? 16 : 20, vw = Q.w >= 160 ? 56 : 44;
    const I = { x: Q.x, y: Q.y, w: Q.w, h: Q.h };
    scrollPanel(fb, 'settings', I, (b, y0) => {
      let y = y0 + 1;
      const w = I.w - 5;
      for (const r of rows) {
        if (r[0] === 'h') { Font.draw(b, r[1], I.x + 2, y + 2, P.redD, { font: 'small' }); y += 11; continue; }
        if (r[0] === 'note') { y += textLines(b, r[1], I.x + 2, y + 1, w - 2, P.text, 4, 8) + 4; continue; }
        const [id, label, val, fn] = r, on = D.hoverId === 'set-' + id;
        UI.rrect(b, I.x, y, w, rowH - 2, 3, P.scrDD); UI.rrect(b, I.x + 1, y + 1, w - 2, rowH - 4, 2, on ? P.white : P.card);
        Font.draw(b, fit(label, w - vw - 10, C ? 'small' : 'body'), I.x + 5, y + (C ? 4 : 5), P.text, { font: C ? 'small' : 'body' });
        pill(b, I.x + w - vw - 3, y + Math.round((rowH - 2 - 10) / 2), vw, 10, val === 'ON' ? P.green : val === 'OFF' ? P.grey : P.blue, 0xffffffff, fit(val, vw - 4), { hi: false });
        r.y = y;
        y += rowH;
      }
      return y - y0 + 2;
    });
    const s = D.scroll.settings || 0;
    for (const r of rows) if (r.y !== undefined && r[3]) { const y = r.y, top = Math.max(I.y, y), bot = Math.min(I.y + I.h, y + rowH - 2); if (bot - top > 4) btn('set-' + r[0], I.x, top, I.w - 5, bot - top, r[3]); }
    void s;
  }

  const PAGES = { home: pageHome, dex: pageDex, entry: pageEntry, ency: pageEncy, quests: pageQuests, prog: pageProg, album: pageAlbum, mail: pageMail, settings: pageSettings, style: pageStyle, shop: pageShop, disc: pageDisc, tms: pageTMs, time: pageTime, chat: pageChat, help: pageHelp };

  /* ---------- drawing ---------- */
  // how many UI pixels per device pixel: phones (small CSS pixels) draw at 2x so the text stays readable
  function pickScale(W0, H0) {
    const US = (typeof Game !== 'undefined' && Game.US) || 2, dpr = window.devicePixelRatio || 1;
    const want = Math.max(1, Math.ceil((1.5 * dpr) / US - 0.01));
    const fit = Math.max(1, Math.min(Math.floor(H0 / 186), Math.floor(W0 / 150)));
    return Math.max(1, Math.min(want, fit));
  }
  function draw(fbOut, t) {
    const W0 = fbOut.w, H0 = fbOut.h;
    const s = pickScale(W0, H0);
    let fb = fbOut;
    if (s > 1) { const w = Math.ceil(W0 / s), h = Math.ceil(H0 / s); if (!D.vb || D.vb.w !== w || D.vb.h !== h) D.vb = new PX.Buf(w, h); fb = D.vb; fb.d.fill(0); }
    if (s !== D.s) { D.s = s; D.btns.length = 0; }
    // hover: the button under the mouse (from last frame's layout)
    const hb = D.mouse ? hit(D.mouse.x, D.mouse.y) : null;
    D.hoverId = hb && (D.rt || 0) - D.mouseT < 30 ? hb.id : null;
    drawAll(fb, t);
    if (s > 1) {
      const vw = fb.w, vd = fb.d, od = fbOut.d;
      for (let y = 0; y < H0; y++) { const sr = ((y / s) | 0) * vw, orow = y * W0; for (let x = 0; x < W0; x++) { const v = vd[sr + ((x / s) | 0)]; if (v) od[orow + x] = v; } }
    }
  }
  function drawAll(fb, t) {
    D.btns.length = 0; for (const k in areas) delete areas[k];
    D.budget = 12; D.lookAt = null;
    const S = UI.skin(), W = fb.w, H = fb.h, G = geom(W, H), FR = framePal(S);
    D.G = G; pageSkin(S);
    const dimK = clamp(D.t / 0.3, 0, 1) * (D.closing ? 1 - D.closing / 0.5 : 1);
    if (!D.bare) UI.rectA(fb, 0, 0, W, H, 0xff200e0a, 0.62 * dimK);
    // rise in / drop out, then a gentle hover
    const rise = D.closing ? U.ease.inCubic(clamp((D.closing - 0.16) / 0.34, 0, 1)) : 1 - U.ease.outBack(clamp(D.t / 0.42, 0, 1));
    const dy = D.bare ? 0 : Math.round(rise * (H - G.top + 8)) + Math.round(Math.sin(t * 2.2) * 1.2);
    G.top += dy; G.oy += dy; G.scr.y += dy;
    drawShell(fb, G, FR, t);
    // keychain from the right side clip
    if (Save.data.equip.key) Rewards.drawKey(fb, Save.data.equip.key, G.cx + G.hw - 2, G.Y(105) + 1, D.keyAng, t);
    const pw = D.closing ? clamp(1 - D.closing / 0.16, 0, 1) : clamp((D.t - 0.24) / 0.2, 0, 1);
    drawScreen(fb, G, pw, t);
    if (pw >= 1) {
      const fn = PAGES[D.page] || pageDex, Scr = G.scr;
      const k = U.ease.outCubic(D.trans), slide = Math.round((1 - k) * 36 * D.dir);
      if (D.zoom && k < 1) {
        // app open: the page grows out of the tapped icon
        const L2 = D.tmp2 && D.tmp2.w === W && D.tmp2.h === H ? D.tmp2 : (D.tmp2 = new PX.Buf(W, H));
        L2.d.fill(0); fn(L2, G, t);
        const zk = 0.12 + 0.88 * k, zx = D.zoom.x, zy = D.zoom.y;
        for (let y = Math.max(0, Scr.y + 2); y < Math.min(H, Scr.y + Scr.h - 1); y++) for (let x = Math.max(0, Scr.x + 1); x < Math.min(W, Scr.x + Scr.w - 1); x++) {
          const sx = Math.round(zx + (x - zx) / zk), sy = Math.round(zy + (y - zy) / zk);
          if (sx < Scr.x + 1 || sx >= Scr.x + Scr.w - 1 || sy < Scr.y + 2 || sy >= Scr.y + Scr.h - 1) continue;
          const v = L2.d[sy * W + sx]; if (v) fb.d[y * W + x] = k < 0.5 ? mix(D.zoom.c, v, k * 2) : v;
        }
      } else if (slide) {
        const L2 = D.tmp2 && D.tmp2.w === W && D.tmp2.h === H ? D.tmp2 : (D.tmp2 = new PX.Buf(W, H));
        L2.d.fill(0);
        fn(L2, G, t);
        for (let y = Math.max(0, Scr.y + 2); y < Math.min(H, Scr.y + Scr.h - 1); y++) for (let x = Math.max(0, Scr.x + 1); x < Math.min(W, Scr.x + Scr.w - 1); x++) { const sx = x - slide; if (sx < 0 || sx >= W) continue; const v = L2.d[y * W + sx]; if (v) fb.d[y * W + x] = v; }
        // scanline sweep
        UI.rectA(fb, Scr.x + 2, Math.round(Scr.y + Scr.h * k), Scr.w - 4, 2, 0xffffffff, 0.4);
      } else fn(fb, G, t);
      drawSlots(fb, G, t);
    }
    if (pw > 0.3 || D.closing) drawFace(fb, G, t);
    drawEyes(fb, G, t);
    homeButton(fb, G, FR, t);
    D.dev = { x: G.ox, y: G.top, w: G.DW, h: G.TH };
    if (!D.bare && (!D.closing || D.closing < 0.2)) drawSide(fb, G, t);
  }
  // little status texts in the screen's top corners, beside Rotom's face
  function drawSlots(fb, G, t) {
    if (sideLayout(G).lr) return;
    const s = G.scr, f = faceDims(G), p = G.pad, y = s.y + p + 1, pg = D.page;
    const lw = f.cx - f.r - (s.x + p) - 3;
    const L = SLOT_L[pg] ? SLOT_L[pg]() : '', R = SLOT_R[pg] ? SLOT_R[pg]() : '';
    if (L) Font.draw(fb, fit(L, lw), s.x + p + 1, y, P.text, { font: 'small' });
    if (R) Font.draw(fb, fit(R, lw), s.x + s.w - p - 1, y, P.text, { font: 'small', align: 'right' });
  }
  const SLOT_L = {
    home: () => { const hr = Game.hour(); return (hr === 'night' || hr === 'dusk' ? '{moon}' : '{sun}') + ' ' + hr.toUpperCase(); },
    dex: () => { const c = counts(); return '{pb} ' + c.caught + '/' + c.all; },
    entry: () => { const d = DexData.S[D.sel]; return d ? 'NO.' + pad3(d.no) : ''; },
  };
  const SLOT_R = {
    home: () => '{coin} ' + Save.data.points,
    dex: () => { const c = counts(); return Math.round((c.caught / Math.max(1, c.all)) * 100) + '%'; },
    entry: () => { const L = DexData.ORDER.filter((s) => stat(s) > 0); return (L.indexOf(D.sel) + 1) + '/' + L.length; },
  };

  // the HUD's Rotom Dex button shows one badge for all apps
  function anyBadge() { let n = 0; for (const a of APPS) { if (a.lock && a.lock()) continue; const v = appBadge(a.id); n += v === true ? 1 : v || 0; } if (hasP() && Progress.logBadge()) n = Math.max(n, 1); return n; }
  // open the Dex straight to an app (keyboard shortcuts)
  function openApp(id) { const a = APP[id]; if (!a) return open(); if (Game.mode !== 'dex') { open(); D.page = 'home'; D.faceK = 1; } const i = APPS.indexOf(a); D.home.pg = (i / 8) | 0; D.home.sel = i % 8; launch(a); }
  return Object.assign(D, { anyBadge, openApp, cancel, open, close, go, back, update, draw, down, move, up, wheel, key, hover, thumb, say, mood, zap, stat, counts, SECRETS, APPS, LINES });
})();
