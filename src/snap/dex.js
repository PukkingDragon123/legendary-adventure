/* ------------------------------------------------------------------
   Dex — the Rotom Dex. A chunky glossy-red pixel device with Rotom
   living in it: a lightning-bolt antenna that sparks, grey side clips,
   a pointed tail with a round Home button, and Rotom's face at the top
   of the screen (big eyes that blink and follow your selection, a
   toothy grin that talks).
     · Main page: the Pokédex — species list with sprites, seen/caught,
       a detail card (habitat, behaviours, photos, completion) and full
       entries (a photo per star tier, behaviour clues, objectives).
     · Home (the tail button / H): a grid of apps on pages — Pokédex,
       Encyclopedia (habitats + behaviours), Quests, Progress, Map,
       Photos, Mail from NPCs, Settings, Style, Shop, Secrets, TMs,
       Day/Night, Rotom Chat, Help, Bag.
   Touch, mouse (hover, wheel, drag, swipe) and keyboard. On big UI
   canvases (phones at 2-3x) the device is drawn at 2x so it fills the
   screen and stays readable.
------------------------------------------------------------------- */
const Dex = (() => {
  const { clamp, lerp, hex, mix } = U;
  const INK = 0xff1b2240;
  const qs = new URLSearchParams(location.search);
  const D = {
    open: false, t: 0, closing: 0, page: 'dex', prev: null, trans: 1, dir: 1,
    sel: null, star: 0, scroll: {}, btns: [], press: null, keyAng: 0, keyV: 0,
    thumbs: new Map(), imgs: new Map(), confirm: null, album: 0, styleSlot: 'hat', mudYaw: 1.1,
    s: 1, G: null, mouse: null, mouseT: -9, hoverId: null, faceK: 0, lookAt: null, line: null, idleT: 8,
    face: { lx: 0, ly: 0, blinkT: 0, nextBlink: 2, mood: 'norm', moodT: 0, talk: 0, pop: 1, zaps: [], zapT: 1, wx: 0, wy: 0, wanderT: 0, spark: 0 },
    home: { pg: 0, sel: 0, slide: 0 }, filter: 'all', lsel: {}, tab: {}, after: null, ensure: null, chat: [], mailC: null,
  };
  // the Rotom screen: soft periwinkle with dots, navy ink, Rotom's cyan face
  const P = {
    scr: hex('#a7b3ef'), scrL: hex('#bcc5f5'), scrLL: hex('#d3d9fb'), card: hex('#e8ecff'), white: hex('#f8f9ff'), dot: hex('#99a5e7'), scrD: hex('#8590d9'), scrDD: hex('#5c66ba'), rim: hex('#23265e'), off: hex('#1b1e44'),
    text: hex('#1a1e4b'), dim: hex('#4c5595'), faint: hex('#7a82bf'),
    face: hex('#b2effe'), faceL: hex('#e0fbff'), faceD: hex('#70cde6'), faceDD: hex('#3692b8'), eye: hex('#0e0c1c'), lid: hex('#3a3858'), mouth: hex('#2c0f30'), tongue: hex('#ff6f93'),
    red: hex('#ec3f4b'), redD: hex('#a41f2e'), gold: hex('#ffc83a'), goldD: hex('#c07a10'), green: hex('#2fb463'), blue: hex('#3a7ae8'), grey: hex('#8a90a8'),
    clip: hex('#b9c0cd'), clipL: hex('#eef1f5'), clipD: hex('#737b90'),
  };
  const FR_CLASSIC = { b: hex('#e03a3c'), l: hex('#ff7466'), ll: hex('#ffb6a6'), d: hex('#a41c2a'), dd: hex('#6c0f1e'), ink: hex('#2a0710') };
  const frCache = {};
  function framePal(S) {
    if (!S || S.id === 'skin.classic') return FR_CLASSIC;
    if (frCache[S.id]) return frCache[S.id];
    return (frCache[S.id] = { b: S.body, l: S.bodyL, ll: mix(S.bodyL, 0xffffffff, 0.45), d: S.bodyD, dd: mix(S.bodyD, S.ink, 0.45), ink: S.ink });
  }
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
    { id: 'dex', name: 'Pokédex', col: '#ef4d56' },
    { id: 'ency', name: 'Encyclopedia', col: '#35ad63' },
    { id: 'quests', name: 'Quests', col: '#f09a30' },
    { id: 'prog', name: 'Progress', col: '#8a5ee6' },
    { id: 'map', name: 'Map', col: '#2f9fdc', launch: () => WorldMap.open(), lock: () => locked('map') },
    { id: 'album', name: 'Photos', col: '#f36fa8' },
    { id: 'mail', name: 'Mail', col: '#5673ee' },
    { id: 'settings', name: 'Settings', col: '#67728c' },
    { id: 'style', name: 'Style', col: '#e2589a' },
    { id: 'shop', name: 'Shop', col: '#ee7434' },
    { id: 'disc', name: 'Secrets', col: '#4b47bd' },
    { id: 'tms', name: 'TMs', col: '#22a898' },
    { id: 'time', name: 'Day/Night', col: '#34449e' },
    { id: 'chat', name: 'Chat', col: '#2fb8e4' },
    { id: 'help', name: 'Help', col: '#8f9d3c' },
    { id: 'bag', name: 'Bag', col: '#b8742e', launch: () => Bag.open(), lock: () => locked('bag') },
  ];
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
    Game.mode = 'dex'; D.open = true; D.t = 0; D.closing = 0; D.trans = 1; D.after = null;
    if (!D.opened) {
      D.opened = true;
      const pg = qs.get('dexpage'); if (pg && (PAGES[pg] || pg === 'home')) D.page = pg;
      const s = qs.get('dexsel'); if (s && DexData.S[s]) D.sel = s;
    }
    if (D.page === 'entry' && !(D.sel && DexData.S[D.sel])) D.page = 'dex';
    if (!PAGES[D.page]) D.page = 'dex';
    D.faceK = D.page === 'home' ? 1 : 0;
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
    if (a.lock && a.lock()) { SFX.error(); say('That app is still locked! Level up to open it. Bzzt!', { mood: 'sad' }); return; }
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
      if (D.closing > 0.5) { D.open = false; Game.mode = 'explore'; D.closing = 0; const f = D.after; D.after = null; if (f) try { f(); } catch (e) { console.error(e); } }
    }
    D.trans = Math.min(1, D.trans + dt * 4.5);
    D.keyV += (-Math.sin(D.keyAng) * 18 - D.keyV * 2.2) * dt; D.keyAng += D.keyV * dt;
    D.mudYaw += dt * 0.9;
    D.selT = (D.selT || 0) + dt;
    D.faceK += ((D.page === 'home' ? 1 : 0) - D.faceK) * Math.min(1, dt * 10);
    D.home.slide *= Math.exp(-dt * 16); if (Math.abs(D.home.slide) < 0.5) D.home.slide = 0;
    const F = D.face;
    F.pop = clamp((D.t - 0.36) / 0.22, 0, 1);
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
    H.pg = n; H.slide = d * 60; SFX.page(); zap(1);
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
      out.d[y * out.w + x] = n >= Math.ceil(SS * SS * 0.34) ? (sil ? 0xff1a1e30 : best) : 0;
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
  function medal(fb, m, x, y) { const mc = [0, 0xffc07a3a, 0xffb8c0d0, 0xffffc83a, 0xff9af0ff][m] || 0xff808080; UI.disc(fb, x, y, 4, INK); UI.disc(fb, x, y, 3, mc); UI.put(fb, x - 1, y - 1, 0xffffffff); }
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
    Font.draw(fb, text, x + w / 2, y + Math.round((h - 5) / 2), col, { font: 'small', align: 'center' });
  }
  // a chunky button (red by default) with a pressed look
  function button(fb, id, x, y, w, h, text, fn, o = {}) {
    const pr = D.press && D.press.b && D.press.b.id === id, hv = D.hoverId === id;
    const fill = o.fill ?? P.red, dk = mix(fill, 0xff000000, 0.35);
    UI.rrect(fb, x, y + 1, w, h, 4, dk);
    UI.rrect(fb, x, y + (pr ? 1 : 0), w, h, 4, P.rim);
    UI.rrect(fb, x + 1, y + 1 + (pr ? 1 : 0), w - 2, h - 2, 3, hv ? mix(fill, 0xffffffff, 0.15) : fill);
    UI.hline(fb, x + 3, x + w - 4, y + 1 + (pr ? 1 : 0), mix(fill, 0xffffffff, 0.4));
    Font.draw(fb, text, x + w / 2, y + Math.round((h - 5) / 2) + (pr ? 1 : 0), o.col ?? 0xffffffff, { font: 'small', align: 'center' });
    btn(id, x - 2, y - 2, w + 4, h + 4, fn, o);
  }
  function tabs(fb, key, x, y, w, list) {
    const cur = D.tab[key] || list[0][0], tw = Math.floor(w / list.length), h = D.G.C ? 11 : 13;
    list.forEach(([id, label], i) => {
      const on = cur === id, bx = x + i * tw;
      pill(fb, bx, y, tw - 2, h, on ? P.red : P.scrLL, on ? 0xffffffff : P.dim, label);
      btn('tab-' + key + id, bx, y - 3, tw - 2, h + 6, () => { D.tab[key] = id; SFX.page(); }, { silent: true });
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
  // darken towards a soft shadow (keeps the world visible through transparent UI pixels)
  function shadow(fb, x, y, w, h, r, a) {
    rrFill(fb, x, y, w, h, r, () => 0);
    for (let j = 0; j < h; j++) {
      let ins = 0;
      if (j < r) ins = r - Math.round(Math.sqrt(r * r - (r - j - 0.5) ** 2)); else if (j >= h - r) ins = r - Math.round(Math.sqrt(r * r - (j - (h - r) + 0.5) ** 2));
      const Y = y + j; if (Y < 0 || Y >= fb.h) continue;
      for (let i = ins; i < w - ins; i++) {
        const X = x + i; if (X < 0 || X >= fb.w) continue;
        const k = Y * fb.w + X, v = fb.d[k], al = v >>> 24;
        fb.d[k] = al < 255 ? ((Math.min(255, al + a * 255) << 24) | (v & 0xffffff)) >>> 0 : mix(v, 0xff05060f, a);
      }
    }
  }
  // rasterise a shape given by inside(x, y) with bevel shading and a 1px outline
  function blob(fb, x0, y0, w, h, inside, shade, ink) {
    const W2 = w + 2, m = new Uint8Array(W2 * (h + 2));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) m[(y + 1) * W2 + x + 1] = 1;
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
      const i = (y + 1) * W2 + x + 1, g = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx >= -1 && yy >= -1 && xx <= w && yy <= h ? m[(yy + 1) * W2 + xx + 1] : 0; };
      if (m[i]) UI.put(fb, x0 + x, y0 + y, shade(x, y, !g(0, -1), !g(0, 1), !g(-1, 0), !g(1, 0)));
      else if (g(-1, 0) || g(1, 0) || g(0, -1) || g(0, 1)) UI.put(fb, x0 + x, y0 + y, ink);
    }
  }
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0; return [Math.hypot(px - ax - dx * t, py - ay - dy * t), t]; }
  function inPoly(pts, x, y) { let ins = false; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [xa, ya] = pts[a], [xb, yb] = pts[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) ins = !ins; } return ins; }

  /* ---------- geometry ---------- */
  function geom(W, H) {
    const C = H < 240 || W < 440;
    const antH = C ? 12 : 17, tailH = C ? 8 : 11, sideM = C ? 5 : 8;
    const DW = Math.min(W - sideM * 2, C ? 470 : 480), DH = Math.min(H - antH - tailH - 2, C ? 300 : 272);
    const ox = Math.round((W - DW) / 2), oy = Math.round(antH + (H - antH - tailH - DH) / 2);
    const bs = C ? 8 : 11, bt = C ? 15 : 20, bb = C ? 12 : 15;
    return { C, W, H, DW, DH, ox, oy, bs, bt, bb, antH, tailH, R: C ? 12 : 16, hh: C ? 23 : 31, scr: { x: ox + bs, y: oy + bt, w: DW - bs * 2, h: DH - bt - bb } };
  }
  function content(G) { const s = G.scr; return { x: s.x + 5, y: s.y + G.hh + 2, w: s.w - 10, h: s.h - G.hh - 7 }; }
  function split(Q, f = 0.46, gap = 6) { const lw = Math.round(Q.w * f); return [{ x: Q.x, y: Q.y, w: lw, h: Q.h }, { x: Q.x + lw + gap, y: Q.y, w: Q.w - lw - gap, h: Q.h }]; }
  function faceDims(G) {
    const k = U.ease.inOut(clamp(D.faceK, 0, 1)), C = G.C;
    return { cx: Math.round(G.scr.x + G.scr.w / 2), top: G.scr.y, rx: Math.round(lerp(C ? 31 : 41, C ? 45 : 60, k)), ry: Math.round(lerp(C ? 20 : 27, C ? 31 : 44, k)) };
  }

  /* ---------- the device shell ---------- */
  function drawShell(fb, G, FR, t) {
    const { ox, oy, DW, DH, R, C } = G;
    shadow(fb, ox + 3, oy + 6, DW, DH + G.tailH - 4, R, 0.32);
    // grey side clips (tucked behind the frame edges)
    const chh = Math.round(DH * 0.24), cy = Math.round(oy + DH * 0.4);
    for (const [sx, side] of [[ox - 4, -1], [ox + DW - 4, 1]]) {
      UI.rrect(fb, sx, cy, 8, chh, 3, FR.ink);
      rrFill(fb, sx + 1, cy + 1, 6, chh - 2, 2, (i, j, ins, w, h) => (j === 0 || i === 0 ? P.clipL : j === h - 1 || i === w - 1 ? P.clipD : P.clip));
      for (let k = 1; k <= 3; k++) { const gy = cy + Math.round((chh * k) / 4); UI.hline(fb, sx + 2, sx + 5, gy, P.clipD); UI.hline(fb, sx + 2, sx + 5, gy + 1, P.clipL); }
      UI.put(fb, sx + (side < 0 ? 1 : 6), cy + 2, 0xffffffff);
    }
    antenna(fb, G, FR, t);
    tailTip(fb, G, FR, t);
    // the frame: ink outline, glossy body (bright top band, darker bottom), bevel edges
    UI.rrect(fb, ox, oy, DW, DH, R, FR.ink);
    rrFill(fb, ox + 1, oy + 1, DW - 2, DH - 2, R - 1, (i, j, ins, w, h) => {
      if (j === 0) return FR.ll;
      if (j <= 2) return FR.l;
      if (j >= h - 1) return FR.dd;
      if (j >= h - 3) return FR.d;
      if (i === ins) return FR.l;
      if (i === w - 1 - ins) return FR.d;
      return FR.b;
    });
    // gloss streaks along the top-left corner
    for (let i = 0; i < Math.round(DW * 0.18); i++) if (i % 9 < 6) UI.put(fb, ox + R + 2 + i, oy + 2, 0xffffffff);
    for (let j = 0; j < 4; j++) UI.put(fb, ox + 3, oy + R + 2 + j, FR.ll);
    // screen well: dark lip, inner rim
    const s = G.scr;
    UI.rrect(fb, s.x - 3, s.y - 3, s.w + 6, s.h + 6, 7, FR.dd);
    UI.hline(fb, s.x + 3, s.x + s.w - 4, s.y + s.h + 3, FR.l);
    UI.rrect(fb, s.x - 2, s.y - 2, s.w + 4, s.h + 4, 6, P.rim);
    // rivets in the corners
    for (const [rx, ry] of [[ox + 6, oy + 6], [ox + DW - 7, oy + 6], [ox + 6, oy + DH - 7], [ox + DW - 7, oy + DH - 7]]) {
      UI.disc(fb, rx, ry, C ? 1 : 2, FR.dd); UI.put(fb, rx - (C ? 0 : 1), ry - (C ? 0 : 1), FR.ll); if (!C) UI.put(fb, rx + 1, ry + 1, FR.ink);
    }
    // darker segments along the top and bottom
    const f = faceDims(G), segW = C ? 7 : 9, gapW = C ? 3 : 4;
    const segs = (x0, x1, y) => { const n = Math.min(4, Math.floor((x1 - x0 + gapW) / (segW + gapW))); if (n < 1) return; let x = Math.round((x0 + x1) / 2 - (n * (segW + gapW) - gapW) / 2); for (let k = 0; k < n; k++, x += segW + gapW) { UI.rrect(fb, x, y, segW, 3, 1, FR.dd); UI.hline(fb, x + 1, x + segW - 2, y + 3, FR.l); } };
    const ty = oy + Math.round((G.bt - 3) / 2) - 1, ax = ox + Math.round(DW * 0.36);
    segs(ox + (C ? 40 : 48), ax - 9, ty);
    segs(f.cx + Math.round(f.rx * 0.78) + 8, ox + DW - (C ? 40 : 48), ty);
    const by = oy + DH - Math.round(G.bb / 2) - 1, tw = C ? 14 : 19;
    segs(ox + R + 6, f.cx - tw - 8, by); segs(f.cx + tw + 8, ox + DW - R - 6, by);
    // bezel keys: back (left) and close (right)
    const kh = G.bt - (C ? 6 : 7), kw = C ? 21 : 26, ky = oy + 3;
    bezelKey(fb, 'back', ox + (C ? 11 : 14), ky, kw, kh, 'back', () => back());
    bezelKey(fb, 'x', ox + DW - (C ? 11 : 14) - kw, ky, kw, kh, 'x', () => close());
  }
  function bezelKey(fb, id, x, y, w, h, glyphId, fn) {
    const pr = D.press && D.press.b && D.press.b.id === id, hv = D.hoverId === id, o = pr ? 1 : 0;
    UI.rrect(fb, x, y + 1, w, h, 4, 0xff2a0710);
    UI.rrect(fb, x, y + o, w, h, 4, 0xff2a0710);
    rrFill(fb, x + 1, y + 1 + o, w - 2, h - 2, 3, (i, j, ins, ww, hh) => (j === 0 ? P.clipL : j >= hh - 1 ? P.clipD : hv ? P.clipL : P.clip));
    const cx = x + (w >> 1), cy = y + (h >> 1) + o, c = 0xff2a2f48;
    if (glyphId === 'x') { const r = h > 11 ? 3 : 2; for (let k = -r; k <= r; k++) { UI.put(fb, cx + k, cy + k, c); UI.put(fb, cx + k, cy - k, c); UI.put(fb, cx + k + 1, cy + k, c); UI.put(fb, cx + k + 1, cy - k, c); } }
    else { const r = h > 11 ? 3 : 2; for (let k = 0; k <= r; k++) UI.vline(fb, cx - 2 + k, cy - k, cy + k, c); UI.rect(fb, cx - 2 + r, cy - 1, r + 2, 2, c); }
    btn(id, x - 8, y - 10, w + 16, h + 16, fn);
  }
  function antenna(fb, G, FR, t) {
    const { ox, oy, DW, C, antH } = G, ax = ox + Math.round(DW * 0.36), base = oy + 4;
    const Hh = antH + 4, sx = Hh * 0.62;
    const pts = [[0, Hh], [-0.28 * sx, Hh * 0.52], [0.24 * sx, Hh * 0.45], [-0.08 * sx, 0]].map(([x, y]) => [x, y]);
    const r0 = C ? 2.3 : 3, r1 = C ? 1.1 : 1.4, bw = Math.ceil(sx) + 8, x0 = ax - (bw >> 1), y0 = base - Hh - 1;
    const inside = (x, y) => {
      const px = x - (ax - x0), py = y - 1;
      for (let i = 0; i < 3; i++) { const [d, tt] = segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); const k = (i + tt) / 3, r = lerp(r0, r1, k); if (d <= r) return true; }
      return false;
    };
    const sp = D.face.spark;
    blob(fb, x0, y0, bw, Hh + 3, inside, (x, y, top, bot, lef, rig) => {
      let c = top || lef ? FR.l : bot || rig ? FR.d : FR.b;
      if (y < 4 && sp > 0) c = mix(c, P.gold, sp * 0.8);
      return c;
    }, FR.ink);
    // sparks from the tip
    const tx = ax + Math.round(pts[3][0]), ty = y0 + 1;
    if (sp > 0.05) for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) { const d = Math.hypot(xx, yy); if (d < 5) UI.blend(fb, tx + xx, ty + yy, P.gold, sp * 0.35 * (1 - d / 5)); }
    for (const z of D.face.zaps) {
      if (z.t < 0) continue;
      const rnd = U.rng(Math.floor(z.seed) + Math.floor(z.t * 30));
      let x = tx, y = ty; const a0 = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
      for (let k = 0; k < 4; k++) { const a = a0 + (rnd() - 0.5) * 1.6, l = 2 + rnd() * 2.5; const nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l; UI.line(fb, Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), k % 2 ? P.gold : 0xffffffff); x = nx; y = ny; }
    }
  }
  function tailTip(fb, G, FR, t) {
    const { ox, oy, DW, DH, C, tailH } = G, cx = ox + (DW >> 1), yb = oy + DH, tw = C ? 14 : 19;
    const pts = [[-tw, -8], [tw, -8], [tw - 1, 1], [3, tailH - 1], [0, tailH], [-3, tailH - 1], [-tw + 1, 1]];
    blob(fb, cx - tw - 1, yb - 8, tw * 2 + 2, tailH + 9, (x, y) => inPoly(pts, x - tw - 1, y - 8), (x, y, top, bot, lef, rig) => (lef ? FR.l : rig || bot ? FR.d : y > 10 ? FR.b : FR.b), FR.ink);
  }
  function homeButton(fb, G, FR, t) {
    const { ox, oy, DW, DH, C } = G, cx = ox + (DW >> 1), cy = oy + DH - Math.round(G.bb / 2) + 1;
    const id = 'homebtn', pr = D.press && D.press.b && D.press.b.id === id, hv = D.hoverId === id, r = C ? 5 : 6, o = pr ? 1 : 0;
    UI.disc(fb, cx, cy + 1, r + 1, FR.ink);
    UI.orb(fb, cx, cy + o, r, hv ? P.clipL : P.clip, { ol: FR.ink });
    // a tiny house
    const hc = D.page === 'home' ? P.red : 0xff3a4058, hy = cy + o - 1;
    UI.put(fb, cx, hy - 2, hc); UI.hline(fb, cx - 1, cx + 1, hy - 1, hc); UI.hline(fb, cx - 2, cx + 2, hy, hc); UI.rect(fb, cx - 1, hy + 1, 3, 2, hc);
    if (D.page !== 'home' && !D.closing) { const k = (Math.sin(t * 3) + 1) / 2; if (k > 0.6) UI.ring(fb, cx, cy + o, r + 2, mix(FR.l, 0xffffffff, 0.5), 1); }
    btn(id, cx - r - 10, cy - r - 8, r * 2 + 20, r * 2 + 14, () => { if (D.page === 'home') go('dex', { dir: 1 }); else go('home', { dir: -1 }); });
  }

  /* ---------- the screen ---------- */
  function drawScreen(fb, G, pw, t) {
    const s = G.scr;
    if (pw <= 0) { UI.rrect(fb, s.x, s.y, s.w, s.h, 5, P.off); return; }
    const gx = s.w - 90;
    rrFill(fb, s.x, s.y, s.w, s.h, 5, (i, j) => {
      let c = P.scr;
      if ((j & 3) === 1 && ((i + (((j >> 2) & 1) << 1)) & 3) === 0) c = P.dot;
      const g = i + j * 0.9 - gx; if (g > 0 && g < 12) c = mix(c, 0xffffffff, 0.07);
      if (j < 2) c = mix(c, P.scrDD, j === 0 ? 0.4 : 0.2);
      else if (j >= s.h - 1) c = mix(c, 0xffffffff, 0.2);
      return c;
    });
    if (pw < 1) {
      // CRT power-on: a bright line opens up into the screen
      const k = U.ease.outCubic(pw), bh = Math.max(1, Math.round(s.h * k)), y0 = s.y + Math.round((s.h - bh) / 2);
      rrFill(fb, s.x, s.y, s.w, s.h, 5, (i, j) => { const Y = s.y + j; if (Y < y0 || Y >= y0 + bh) return P.off; return pw < 0.5 ? mix(0xffffffff, P.scr, pw * 2) : 0; });
      UI.hline(fb, s.x + 4, s.x + s.w - 5, y0, 0xffffffff); UI.hline(fb, s.x + 4, s.x + s.w - 5, y0 + bh - 1, 0xffffffff);
    }
  }

  /* ---------- Rotom's face: cyan semicircle, big eyes on a black bridge, toothy grin ---------- */
  function drawFace(fb, G, t) {
    const F = D.face, f = faceDims(G), { cx, top, rx, ry } = f, C = G.C;
    const pop = F.pop < 1 ? U.ease.outBack(F.pop) : 1;
    if (pop <= 0.02) return;
    const RX = Math.max(3, Math.round(rx * pop)), RY = Math.max(2, Math.round(ry * pop));
    // cyan semicircle hanging from the top of the screen
    for (let y = 0; y <= RY; y++) {
      const hw = Math.floor(RX * Math.sqrt(Math.max(0, 1 - (y / (RY + 0.5)) ** 2)));
      for (let x = -hw; x <= hw; x++) {
        const d = Math.hypot(x / (RX + 0.5), y / (RY + 0.5));
        let c = d > 0.955 || Math.abs(x) >= hw ? P.faceDD : d > 0.86 ? P.faceD : P.face;
        if (y === RY) c = P.faceDD;
        if (d < 0.78 && x < -RX * 0.3 && y > 2 && y < RY * 0.5 && ((x + y) & 3) === 0) c = P.faceL;
        UI.put(fb, cx + x, top + y, c);
      }
    }
    UI.hline(fb, cx - RX + 2, cx + RX - 2, top, P.faceDD);
    // mouth: a wide toothy grin (talks, gasps, frowns)
    const m = F.mood, happy = m === 'happy' || m === 'wink' || m === 'love';
    const mw = Math.round(RX * (happy ? 0.62 : 0.52)), my = top + Math.round(RY * 0.62);
    let open = F.talk ? 0.3 + 0.7 * Math.abs(Math.sin(D.rt * 17)) : happy ? 0.9 : 0.55;
    const mhMax = Math.max(3, Math.round(RY * 0.3));
    if (m === 'wow') { const r = Math.max(2, Math.round(RY * 0.14)); UI.disc(fb, cx, my + 1, r + 1, P.eye); UI.disc(fb, cx, my + 1, r, P.mouth); }
    else if (m === 'sad' || m === 'dizzy') {
      for (let x = -mw + 2; x <= mw - 2; x++) { const k = x / mw, yy = m === 'sad' ? Math.round(k * k * 3) : Math.round(Math.sin(x * 0.9 + D.rt * 8)); UI.put(fb, cx + x, my + 2 - yy, P.eye); UI.put(fb, cx + x, my + 3 - yy, P.eye); }
    } else {
      const mh = Math.max(2, Math.round(mhMax * open));
      const edge = (x) => Math.round((x / mw) ** 2 * (happy ? 3 : 2));
      for (let x = -mw; x <= mw; x++) {
        const k = x / mw, e = edge(x), yTop = my - e, yBot = my + Math.round(mh * Math.sqrt(Math.max(0, 1 - k * k)));
        for (let y = yTop - 1; y <= yBot + 1; y++) {
          const inner = y >= yTop && y <= yBot && Math.abs(x) < mw;
          let c = inner ? P.mouth : P.eye;
          if (inner) {
            const toothRow = C ? 1 : 2;
            if (y < yTop + toothRow + (Math.abs(x) < mw - 2 ? 0 : -1) && ((x + mw) % 4 !== 0)) c = 0xffffffff;
            else if (mh > 4 && y > yBot - 2 && Math.abs(x) < mw * 0.45) c = P.tongue;
          }
          UI.put(fb, cx + x, y, c);
        }
      }
    }
    // eyes + the black bridge between them (they sit on the seam, over the bezel lip)
    const ex = Math.round(RX * 0.42), erx = Math.max(2, Math.round(RX * 0.2)), ery = Math.max(2, Math.round(RY * 0.34 * (C ? 1 : 1))), ey = top + ery - 2;
    D.eyeAt = [cx, ey];
    UI.rect(fb, cx - ex, ey - Math.round(ery * 0.55), ex * 2, Math.round(ery * 1.1), P.eye);
    const blink = F.blinkT > 0 || F.pop < 0.9;
    for (const sd of [-1, 1]) {
      const ecx = cx + sd * ex;
      ellipse(fb, ecx, ey, erx + 2, ery + 2, P.eye);
      let em = m;
      if (m === 'wink' && sd === 1) em = 'shut';
      if (blink && em !== 'x') em = 'shut';
      if (em === 'shut') { for (let x = -erx; x <= erx; x++) { const yy = Math.round((x / erx) ** 2 * 2); UI.put(fb, ecx + x, ey + 1 - yy, P.lid); UI.put(fb, ecx + x, ey + 2 - yy, P.lid); } continue; }
      if (em === 'happy' || em === 'love' || em === 'wink') {
        // "^" happy eyes
        ellipse(fb, ecx, ey, erx, ery, 0xffffffff);
        ellipse(fb, ecx, ey + Math.max(2, Math.round(ery * 0.55)), erx + 1, ery, P.eye);
        continue;
      }
      ellipse(fb, ecx, ey, erx, ery, 0xffffffff);
      UI.hline(fb, ecx - erx + 2, ecx + erx - 2, ey + ery, hex('#c8d2f0'));
      if (em === 'x') { const r = Math.min(erx, ery) - 1; for (let k = -r; k <= r; k++) { UI.put(fb, ecx + k, ey + k, P.eye); UI.put(fb, ecx + k, ey - k, P.eye); UI.put(fb, ecx + k + 1, ey + k, P.eye); UI.put(fb, ecx + k + 1, ey - k, P.eye); } continue; }
      const small = em === 'wow';
      const prx = Math.max(1, Math.round(erx * (small ? 0.32 : 0.5))), pry = Math.max(1, Math.round(ery * (small ? 0.4 : 0.62)));
      const px = ecx + Math.round(F.lx * (erx - prx - 0.5)), py = ey + Math.round(F.ly * (ery - pry - 0.5));
      ellipse(fb, px, py, prx, pry, P.eye);
      UI.put(fb, px - Math.max(0, prx - 1), py - Math.max(0, pry - 1), 0xffffffff);
      if (prx > 2) { UI.put(fb, px - prx + 2, py - pry + 1, 0xffffffff); UI.put(fb, px - prx + 1, py - pry + 2, 0xffffffff); }
      if (em === 'sad') UI.rect(fb, ecx - erx - 1, ey - ery - 1, erx * 2 + 3, Math.round(ery * 0.8), P.eye);
    }
  }
  function ellipse(fb, cx, cy, rx, ry, c) { for (let y = -ry; y <= ry; y++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.3)) ** 2))); UI.hline(fb, cx - hw, cx + hw, cy + y, c); } }

  /* ---------- header: page title on the left, Rotom's speech on the right ---------- */
  function drawHeader(fb, G, t) {
    const s = G.scr, f = faceDims(G), C = G.C, pg = D.page;
    if (pg === 'home') return drawHomeHeader(fb, G, f, t);
    const x = s.x + 6, y = s.y + (C ? 4 : 5), gs = C ? 12 : 16;
    UI.img(fb, glyph(pageIcon(pg), gs), x, y + (C ? 0 : 0), 1);
    const maxW = f.cx - f.rx - 6 - (x + gs + 4);
    Font.draw(fb, fit(pageTitle(pg), maxW, 'title'), x + gs + 4, y + (C ? 1 : 3), P.text, { font: 'title' });
    const sub = SUB[pg] ? SUB[pg]() : '';
    if (sub) Font.draw(fb, fit(sub, f.cx - f.rx - 6 - x), x, y + (C ? 13 : 18), P.dim, { font: 'small' });
    if (!drawBubble(fb, G, f, t)) {
      const r = RIGHT[pg] ? RIGHT[pg]() : '';
      if (r) Font.draw(fb, r, s.x + s.w - 6, y + (C ? 3 : 5), P.dim, { font: 'small', align: 'right' });
    }
  }
  function drawHomeHeader(fb, G, f, t) {
    const s = G.scr, C = G.C, x = s.x + 7, y = s.y + (C ? 5 : 7);
    const hr = Game.hour();
    Font.icon(fb, hr === 'night' || hr === 'dusk' ? 'moon' : 'sun', x, y, 1);
    Font.draw(fb, hr.toUpperCase(), x + 11, y + 1, P.text, { font: 'small' });
    Font.draw(fb, fit(Game.areaId ? areaName(Game.areaId) : '', f.cx - f.rx - 8 - x), x, y + 11, P.dim, { font: 'small' });
    const lv = hasP() ? Progress.level() : null;
    if (!drawBubble(fb, G, f, t)) {
      const rx = s.x + s.w - 7;
      Font.draw(fb, (lv ? 'LV ' + lv + '  ' : '') + rank().toUpperCase(), rx, y + 1, P.text, { font: 'small', align: 'right' });
      Font.draw(fb, '{coin} ' + Save.data.points, rx, y + 11, P.dim, { font: 'small', align: 'right' });
    }
  }
  function drawBubble(fb, G, f, t) {
    const L = D.line; if (!L || L.t < 0) return false;
    const s = G.scr, C = G.C, x0 = f.cx + f.rx + 6, x1 = s.x + s.w - 5, w = x1 - x0;
    if (w < 40) return false;
    const lines = Font.wrap(L.text.replace(/★/g, '{star}'), 'small', w - 12).slice(0, 2);
    const bw = Math.min(w, Math.max(...lines.map((l) => Font.measure(l, 'small'))) + 12), bh = lines.length * 8 + 6;
    const hh = D.page === 'home' ? Math.min(f.ry, C ? 26 : 34) : G.hh;
    const by = s.y + Math.max(2, Math.round((hh - bh) / 2)) - 1 + (L.t < 0.1 ? Math.round((1 - L.t / 0.1) * 3) : 0);
    if (L.life - L.t < 0.3 && Math.floor(L.t * 20) % 2) return true;
    UI.rrect(fb, x0 + 1, by + 1, bw, bh, 4, P.scrD);
    UI.rrect(fb, x0, by, bw, bh, 4, P.rim);
    UI.rrect(fb, x0 + 1, by + 1, bw - 2, bh - 2, 3, P.white);
    // tail pointing at Rotom
    const ty = by + (bh >> 1);
    for (let k = 1; k <= 3; k++) { UI.vline(fb, x0 - k + 1, ty - (3 - k), ty + (3 - k), k === 3 ? P.rim : P.white); UI.put(fb, x0 - k + 1, ty - (4 - k), P.rim); UI.put(fb, x0 - k + 1, ty + (4 - k), P.rim); }
    let left = Math.floor(L.t * 42);
    lines.forEach((ln, i) => { if (left <= 0) return; const part = ln.slice(0, left); left -= ln.length; Font.draw(fb, part, x0 + 6, by + 4 + i * 8, P.text, { font: 'small' }); });
    return true;
  }
  const SUB = {
    dex: () => { const c = counts(); return 'SEEN ' + c.seen + '  CAUGHT ' + c.caught + ' / ' + c.all; },
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
  const W_ = 0xfff8f9ff;
  function glyph(id, n) {
    const key = id + '|' + n;
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
    };
    (G[id] || G.dex)();
    // sticker outline
    const OL = 0xff1a1438, m = new Uint8Array(d.length);
    for (let i = 0; i < d.length; i++) m[i] = d[i] ? 1 : 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; if (m[i]) continue; if ((x > 0 && m[i - 1]) || (x < n - 1 && m[i + 1]) || (y > 0 && m[i - n]) || (y < n - 1 && m[i + n])) d[i] = OL; }
    ICO.set(key, b);
    return b;
  }
  function appTile(fb, a, x, y, sz, t, on, pr) {
    const r = Math.max(4, Math.round(sz * 0.26)), c = a.c, top = mix(c, 0xffffffff, 0.2), bot = mix(c, 0xff000000, 0.2);
    UI.rrect(fb, x + 1, y + 3, sz, sz, r, 0x80000000 | (P.scrDD & 0xffffff));
    if (on) UI.rrect(fb, x - 2, y - 2, sz + 4, sz + 4, r + 2, 0xffffffff);
    UI.rrect(fb, x, y, sz, sz, r, P.rim);
    rrFill(fb, x + 1, y + 1, sz - 2, sz - 2, r - 1, (i, j, ins, w, h) => {
      const k = j / h; let col = mix(top, bot, k);
      if (j < h * 0.46 && i > ins + 1 && i < w - ins - 2 && j > 0) col = mix(col, 0xffffffff, 0.14);
      if (j === 0) col = mix(top, 0xffffffff, 0.45);
      if (j >= h - 1) col = mix(bot, 0xff000000, 0.2);
      return col;
    });
    const gs = Math.round(sz * 0.7), g = glyph(a.id, gs);
    const bob = on ? Math.round(Math.sin(t * 5) * 1) : 0;
    UI.img(fb, g, x + Math.round((sz - gs) / 2), y + Math.round((sz - gs) / 2) + bob + (pr ? 1 : 0), 1);
  }
  function badge(fb, x, y, n) {
    const s = n > 9 ? '9+' : n === true ? '!' : String(n), w = Math.max(9, Font.measure(s, 'small') + 5);
    UI.rrect(fb, x - (w >> 1), y - 4, w, 10, 4, 0xff2a0710); UI.rrect(fb, x - (w >> 1) + 1, y - 3, w - 2, 8, 3, P.red); UI.hline(fb, x - (w >> 1) + 3, x + (w >> 1) - 3, y - 3, 0xffff9a9a);
    Font.draw(fb, s, x + 1, y - 1, 0xffffffff, { font: 'small', align: 'center' });
  }
  function appBadge(id) {
    if (id === 'mail') return mailUnread();
    if (id === 'quests') { const n = questList().filter((e) => e.s === 'ready').length; return n || 0; }
    if (id === 'dex') return Quests.unseen() ? true : 0;
    return 0;
  }

  /* ---------- page: home (the app grid) ---------- */
  function pageHome(fb, G, t) {
    const f = faceDims(G), s = G.scr, C = G.C, H = D.home, pages = Math.ceil(APPS.length / 8);
    const top = s.y + f.ry + (C ? 4 : 6), bot = s.y + s.h - (C ? 4 : 6);
    const ind = C ? 11 : 14, lab = C ? 9 : 11;
    const avail = bot - top - ind;
    const isz = Math.max(18, Math.min(C ? 34 : 44, Math.floor(avail / 2) - lab - 2));
    const rowH = isz + lab + 1, cw = Math.floor((s.w - 16) / 4);
    const y0 = top + Math.max(0, Math.floor((avail - rowH * 2) / 2)), y1 = y0 + rowH + ind;
    const sl = Math.round(H.slide);
    for (let i = 0; i < 8; i++) {
      const a = APPS[H.pg * 8 + i]; if (!a) continue;
      const col = i % 4, row = i >> 2, cx = s.x + 8 + col * cw + (cw >> 1) + sl, iy = row ? y1 : y0;
      if (cx < s.x - cw || cx > s.x + s.w + cw) continue;
      const id = 'app-' + a.id, on = H.sel === i, pr = D.press && D.press.b && D.press.b.id === id;
      const lk = a.lock && a.lock();
      appTile(fb, a, cx - (isz >> 1), iy - (on ? 2 : 0), isz, t, on, pr);
      if (lk) { UI.rectA(fb, cx - (isz >> 1) + 1, iy - (on ? 2 : 0) + 1, isz - 2, isz - 2, 0xff1a1e4b, 0.45); Font.icon(fb, 'lock', cx - 2, iy + (isz >> 1) - 4 - (on ? 2 : 0), 1); }
      const bn = appBadge(a.id); if (bn) badge(fb, cx + (isz >> 1) - 2, iy - (on ? 2 : 0) + 1, bn);
      const nm = a.name.toUpperCase(), lw = Font.measure(nm, 'small');
      if (on) { UI.rrect(fb, cx - (lw >> 1) - 4, iy + isz + 1, lw + 8, 9, 4, P.rim); UI.rrect(fb, cx - (lw >> 1) - 3, iy + isz + 2, lw + 6, 7, 3, P.white); }
      Font.draw(fb, nm, cx, iy + isz + 3, on ? P.text : P.text, { font: 'small', align: 'center' });
      if (on) D.lookAt = [cx, iy + (isz >> 1)];
      btn(id, cx - (cw >> 1) + 2, iy - 3, cw - 4, isz + lab + 4, () => { H.sel = i; SFX.select(); launch(a); }, { silent: true, hov: () => { if (H.sel !== i) { H.sel = i; } } });
    }
    // page indicator between the rows:  ◀ ═══ ▶
    const iy = y0 + rowH + (ind >> 1) - 1, bw = C ? 16 : 22, gap = 4, tw = pages * bw + (pages - 1) * gap, bx0 = s.x + (s.w >> 1) - (tw >> 1);
    for (let p = 0; p < pages; p++) { const bx = bx0 + p * (bw + gap); UI.rrect(fb, bx, iy - 1, bw, 4, 2, p === H.pg ? P.rim : P.scrD); if (p === H.pg) UI.hline(fb, bx + 1, bx + bw - 2, iy, P.white); btn('pg' + p, bx - 2, iy - 5, bw + 4, 12, () => { if (p !== H.pg) flipHome(p - H.pg); }); }
    const arrow = (dir, ax) => {
      const en = dir < 0 ? H.pg > 0 : H.pg < pages - 1, c = en ? P.rim : P.scrD, id = 'pgarr' + dir;
      const hv = D.hoverId === id;
      for (let k = 0; k < 4; k++) UI.vline(fb, ax + (dir < 0 ? k : -k), iy + 1 - (3 - k) , iy + 1 + (3 - k) - 1, hv && en ? P.red : c);
      btn(id, ax - 10, iy - 8, 20, 18, () => flipHome(dir));
    };
    arrow(-1, bx0 - 12); arrow(1, bx0 + tw + 11);
  }

  /* ---------- page: Pokédex (main) ---------- */
  function dexList() {
    const f = D.filter, A = Game.areaId;
    return DexData.ORDER.filter((k) => f === 'all' || (f === 'here' ? (DexData.S[k].area || []).includes(A) : !Save.data.seen[k]));
  }
  const AREA_COL = { beach: ['#8fd8ff', '#f2dc9a'], forest: ['#a4e8b0', '#4f9e58'], canopy: ['#bdefff', '#79b95e'], falls: ['#7f8ad8', '#5a5a9a'], stage: ['#ffc0e0', '#b56aa0'], volcano: ['#ffb894', '#8e4636'], shoal: ['#d2f2ff', '#9ccfe8'] };
  function areaCols(a) { const c = AREA_COL[a] || ['#b8d8ff', '#8aa0c8']; return [hex(c[0]), hex(c[1])]; }
  function pageDex(fb, G, t) {
    const Q = content(G), C = G.C, [L, R] = split(Q, C ? 0.44 : 0.46);
    const list = dexList();
    if (!D.sel || !DexData.S[D.sel]) D.sel = list[0] || DexData.ORDER[0];
    // filter chips
    const chH = C ? 11 : 12; let x = L.x;
    for (const [id, lab] of [['all', 'ALL'], ['here', 'HERE'], ['miss', 'MISSING']]) {
      const w = Font.measure(lab, 'small') + (C ? 9 : 12), on = D.filter === id;
      pill(fb, x, L.y, w, chH, on ? P.red : P.scrLL, on ? 0xffffffff : P.dim, lab);
      btn('flt-' + id, x, L.y - 3, w, chH + 5, () => { D.filter = id; D.scroll.dex = 0; SFX.page(); }, { silent: true });
      x += w + 3;
    }
    Font.draw(fb, String(list.length), L.x + L.w - 2, L.y + (C ? 3 : 4), P.dim, { font: 'small', align: 'right' });
    const LQ = { x: L.x, y: L.y + chH + 3, w: L.w, h: L.h - chH - 3 }, rh = C ? 18 : 23;
    const si = list.indexOf(D.sel);
    if (!list.length) Font.draw(fb, D.filter === 'miss' ? 'ALL CAUGHT! BZZT!' : 'NOBODY HERE...', LQ.x + LQ.w / 2, LQ.y + 20, P.dim, { font: 'small', align: 'center' });
    const s = listView(fb, 'dex', LQ, list.length, rh, si, (b, i, x2, y, w, h, on) => dexRow(b, list[i], x2, y, w, h, on, C), (i) => { const sp = list[i]; if (D.sel === sp) openEntry(sp); else selectSp(sp); });
    if (si >= 0) D.lookAt = [LQ.x + LQ.w * 0.5, LQ.y + si * rh - s + rh / 2];
    dexDetail(fb, G, R, D.sel, t);
  }
  function dexRow(b, sp, x, y, w, h, on, C) {
    const st = stat(sp), d = DexData.S[sp];
    const fill = on ? P.white : st === 2 ? P.card : P.scrLL;
    UI.rrect(b, x, y, w, h - 2, 3, on ? P.red : P.scrD);
    UI.rrect(b, x + 1, y + 1, w - 2, h - 4, 2, fill);
    if (on) { UI.rrect(b, x + 1, y + 1, 3, h - 4, 1, P.red); }
    const ts = h - 5, th = thumb(sp, ts, st < 2);
    const tx = x + 5, ty = y + 1;
    UI.rrect(b, tx, ty, ts + 1, ts + 1, 2, st === 2 ? mix(areaCols((d.area || [])[0])[0], 0xffffffff, 0.35) : P.scrL);
    if (th) UI.img(b, th, tx + Math.round((ts + 1 - th.w) / 2), ty + Math.round((ts + 1 - th.h) / 2), 1, st === 1 ? { tint: P.scrDD, tintK: 0.35 } : st === 0 ? { tint: P.faint, tintK: 0.25 } : {});
    else if (th === undefined) Font.draw(b, '..', tx + ts / 2, ty + ts / 2 - 2, P.dim, { font: 'small', align: 'center' });
    const nx = tx + ts + 5, nm = st ? d.name : '???';
    if (C) {
      Font.draw(b, fit(nm, w - (nx - x) - 34, 'body'), nx, y + 4, st ? P.text : P.faint, { font: 'body' });
      Font.draw(b, pad3(d.no), x + w - 13, y + 6, P.faint, { font: 'small', align: 'right' });
    } else {
      Font.draw(b, 'NO.' + pad3(d.no), nx, y + 3, P.faint, { font: 'small' });
      Font.draw(b, fit(nm, w - (nx - x) - 16, 'body'), nx, y + 11, st ? P.text : P.faint, { font: 'body' });
    }
    const ix = x + w - 10, iy = y + Math.round((h - 2) / 2) - 3;
    if (st === 2) Font.icon(b, 'pb', ix, iy, 1);
    else if (st === 1) eyeIcon(b, ix, iy + 1);
  }
  function eyeIcon(fb, x, y) { const c = P.dim; UI.hline(fb, x + 1, x + 5, y, c); UI.put(fb, x, y + 1, c); UI.put(fb, x + 6, y + 1, c); UI.hline(fb, x + 1, x + 5, y + 3, c); UI.put(fb, x, y + 2, c); UI.put(fb, x + 6, y + 2, c); UI.rect(fb, x + 2, y + 1, 3, 2, 0xff1a1e4b); }
  function typePill(fb, ty, x, y) { const w = Font.measure(ty.toUpperCase(), 'small') + 8; UI.rrect(fb, x, y, w, 9, 3, mix(hex(DexData.TYPES[ty] || '#888888'), 0xff000000, 0.35)); UI.rrect(fb, x, y, w, 8, 3, hex(DexData.TYPES[ty] || '#888888')); Font.draw(fb, ty.toUpperCase(), x + w / 2, y + 2, 0xffffffff, { font: 'small', align: 'center' }); return w; }
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
    const st = stat(sp), C = G.C;
    card(fb, R);
    const sx = R.x + 4, sy = R.y + 4, sw = R.w - 8, sh = C ? 48 : 70;
    stage(fb, sx, sy, sw, sh, (d.area || [])[0], st, t);
    const tsz = C ? 38 : 56, th = thumb(sp, tsz, st < 2);
    const pop = clamp((D.selT || 0) / 0.18, 0, 1), bob = st === 2 ? Math.round(Math.sin(t * 2.2)) : 0;
    if (th) {
      const X = sx + Math.round((sw - th.w) / 2), Y = sy + sh - 5 - th.h + bob + Math.round((1 - U.ease.outBack(pop)) * 6);
      // soft ground shadow
      for (let i = -Math.round(th.w * 0.35); i <= Math.round(th.w * 0.35); i++) UI.blend(fb, sx + (sw >> 1) + i, sy + sh - 5, P.rim, 0.25);
      UI.img(fb, th, X, Y, 1, st === 1 ? { tint: P.scrDD, tintK: 0.45 } : {});
      if (st === 0) Font.draw(fb, '?', sx + (sw >> 1), Y + (th.h >> 1) - 5, P.gold, { font: 'title', align: 'center', outline: P.rim });
    } else Font.draw(fb, th === undefined ? 'LOADING...' : '???', sx + sw / 2, sy + sh / 2 - 2, P.white, { font: 'small', align: 'center' });
    pill(fb, sx + 3, sy + 3, Font.measure('NO.' + pad3(d.no), 'small') + 8, 9, P.white, P.text, 'NO.' + pad3(d.no), { hi: false });
    const sl = st === 2 ? 'CAUGHT' : st === 1 ? 'SEEN' : 'UNKNOWN', sc = st === 2 ? P.green : st === 1 ? P.blue : P.grey, sw2 = Font.measure(sl, 'small') + (st === 2 ? 17 : 8);
    pill(fb, sx + sw - sw2 - 3, sy + 3, sw2, 9, sc, 0xffffffff, st === 2 ? '' : sl, { hi: false });
    if (st === 2) { Font.icon(fb, 'pb', sx + sw - sw2 + 1, sy + 4, 1); Font.draw(fb, sl, sx + sw - 5, sy + 5, 0xffffffff, { font: 'small', align: 'right' }); }
    let y = sy + sh + (C ? 4 : 5);
    const x = R.x + 6, w = R.w - 12;
    Font.draw(fb, st ? d.name : '???', x, y + 1, P.text, { font: 'title' });
    if (st) { let tx = R.x + R.w - 6; for (const ty of d.type.slice().reverse()) { const tw = Font.measure(ty.toUpperCase(), 'small') + 8; tx -= tw; typePill(fb, ty, tx, y + 1); tx -= 2; } }
    y += C ? 13 : 15;
    const hab = (d.area || []).map(areaName).join(', ') || '???';
    Font.draw(fb, fit('HABITAT ' + (st ? hab : (d.area || []).length ? hab : '???'), w), x, y, P.dim, { font: 'small' });
    y += C ? 8 : 9;
    if (!C) { Font.draw(fb, 'HEIGHT ' + (st ? d.h + ' M' : '?.? M') + (d.legendary ? '   {spark} LEGENDARY' : ''), x, y, P.dim, { font: 'small' }); y += 10; }
    const dn = speciesDone(sp), btnH = C ? 12 : 14, statH = C ? 9 : 20;
    const blurbMax = Math.max(1, Math.floor((R.y + R.h - 5 - btnH - statH - y - 3) / 8));
    const blurb = st === 2 ? d.blurb : st === 1 ? 'Spotted by Rotom! Photograph it to fill in its page.' : 'No data. ' + (Object.values(d.beh)[0] ? 'Clue: ' + Object.values(d.beh)[0].hint : 'Keep exploring!');
    y += textLines(fb, blurb, x, y, w, st === 2 ? P.text : P.dim, blurbMax) + 2;
    // behaviours + photo tiers
    const by = R.y + R.h - 5 - btnH - statH;
    if (C) {
      Font.draw(fb, 'BEH ' + dn.got + '/' + dn.beh, x, by + 1, P.text, { font: 'small' });
      stars(fb, dn.st, x + w - 31, by, 4);
    } else {
      Font.draw(fb, 'BEHAVIOURS ' + dn.got + '/' + dn.beh, x, by + 1, P.text, { font: 'small' });
      const bk = Object.keys(d.beh), seenB = Save.data.beh[sp] || {};
      let px = x + w - bk.length * 6;
      for (const k of bk) { const got = k in seenB, tr = d.beh[k].tier; UI.rrect(fb, px, by, 5, 6, 1, got ? [0, P.green, P.blue, P.gold, 0xffff7ad0][tr] || P.gold : P.scrD); px += 6; }
      Font.draw(fb, 'PHOTOS', x, by + 11, P.text, { font: 'small' });
      stars(fb, dn.st, x + w - 31, by + 10, 4);
    }
    // completion bar + button
    const pct = Math.round(dn.pct * 100);
    const bw = Math.round(w * 0.42);
    UI.rrect(fb, x, R.y + R.h - 5 - btnH + 3, bw, 7, 3, P.scrD); if (pct) UI.rrect(fb, x, R.y + R.h - 5 - btnH + 3, Math.max(4, Math.round((bw * pct) / 100)), 7, 3, pct >= 100 ? P.gold : P.green);
    Font.draw(fb, pct + '%', x + bw + 4, R.y + R.h - 5 - btnH + 4, P.dim, { font: 'small' });
    const lab = st ? 'ENTRY {right}' : 'WHERE?', bww = Math.max(C ? 52 : 64, Font.measure(lab, 'small') + 14);
    button(fb, 'open-entry', R.x + R.w - 6 - bww, R.y + R.h - 5 - btnH, bww, btnH, lab, () => openEntry(sp), { fill: st ? P.red : P.blue });
  }

  /* ---------- page: a species entry ---------- */
  function pageEntry(fb, G, t) {
    const sp = D.sel, d = DexData.S[sp];
    if (!d) { go('dex'); return; }
    const S = D.SP, C = G.C, Q = content(G), [L, R] = split(Q, C ? 0.45 : 0.47);
    const ph = Save.data.photos[sp] || {};
    // photo for the chosen star tier
    const tier = D.star + 1, rec = ph['s' + tier];
    const navH = C ? 12 : 14, tierH = C ? 12 : 14, infoH = rec ? 10 : 0;
    const pw = L.w, phh = L.h - navH - tierH - infoH - 7;
    const px = L.x, py = L.y;
    UI.rrect(fb, px - 1, py - 1, pw + 2, phh + 2, 3, P.rim);
    if (rec && rec.img) {
      const b = photo(rec.img);
      if (b) UI.imgFit(fb, b, px, py, pw, phh);
      else for (let y = 0; y < phh; y++) for (let x = 0; x < pw; x++) UI.put(fb, px + x, py + y, U.hash(x, y, Math.floor(t * 10)) > 0.5 ? 0xff3a4058 : 0xff262a3a);
    } else {
      stage(fb, px, py, pw, phh, (d.area || [])[0], 0, t);
      const th = thumb(sp, Math.min(40, phh - 16), true);
      if (th) UI.img(fb, th, px + Math.round((pw - th.w) / 2), py + Math.round((phh - th.h) / 2) - 4);
      Font.draw(fb, 'No ' + '{star}'.repeat(tier) + ' photo yet', px + pw / 2, py + phh - 11, 0xffffffff, { font: 'small', align: 'center', outline: P.rim });
    }
    // tier selector
    const ty = py + phh + 3, tw = Math.floor(pw / 4);
    for (let k = 0; k < 4; k++) {
      const on = D.star === k, has = !!ph['s' + (k + 1)], bx = px + k * tw;
      UI.rrect(fb, bx, ty, tw - 2, tierH, 3, P.rim);
      UI.rrect(fb, bx + 1, ty + 1, tw - 4, tierH - 2, 2, on ? P.red : has ? P.white : P.scrL);
      const sw = (k + 1) * 7 - 1;
      for (let s = 0; s <= k; s++) Font.icon(fb, has ? 'star' : 'star0', bx + Math.round((tw - 2 - sw) / 2) + s * 7, ty + Math.round((tierH - 7) / 2), 1);
      btn('tier' + k, bx, ty - 2, tw - 2, tierH + 4, () => { D.star = k; SFX.page(); }, { silent: true });
    }
    let iy = ty + tierH + 3;
    if (rec) {
      const bd = d.beh[rec.beh];
      medal(fb, rec.medal, px + 4, iy + 3);
      Font.draw(fb, (DexData.MEDALS[rec.medal] || '') + '  ' + rec.score + ' PTS', px + 11, iy + 1, P.text, { font: 'small' });
      if (bd) Font.draw(fb, fit(bd.n, pw - 90), px + pw, iy + 1, P.dim, { font: 'small', align: 'right' });
      iy += infoH;
    }
    // prev / next species
    const nav = (dir) => { const Ls = DexData.ORDER.filter((k) => stat(k) > 0); const i = Ls.indexOf(sp); if (Ls.length) { D.sel = Ls[(i + dir + Ls.length) % Ls.length]; D.star = bestTier(D.sel); D.scroll.entry = 0; D.trans = 0.4; D.dir = dir; D.selT = 0; SFX.page(); } };
    const ny = L.y + L.h - navH;
    button(fb, 'prev', px, ny, 30, navH, '{left}', () => nav(-1), { silent: true, fill: hex('#3a4290') });
    button(fb, 'next', px + pw - 30, ny, 30, navH, '{right}', () => nav(1), { silent: true, fill: hex('#3a4290') });
    const Ls = DexData.ORDER.filter((k) => stat(k) > 0);
    Font.draw(fb, (Ls.indexOf(sp) + 1) + ' / ' + Ls.length, px + pw / 2, ny + Math.round((navH - 5) / 2), P.dim, { font: 'small', align: 'center' });
    // info column
    card(fb, R);
    const I = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 };
    const hc = P.redD;
    scrollPanel(fb, 'entry', I, (b, y0) => {
      let y = y0 + 5;
      const x = I.x + 5, w = I.w - 12;
      Font.draw(b, 'NO.' + pad3(d.no), x, y + 1, P.faint, { font: 'small' });
      Font.draw(b, stat(sp) ? d.name : '???', x + 28, y - 2, P.text, { font: 'title' });
      let tx = I.x + I.w - 8;
      for (const ty2 of d.type.slice().reverse()) { const w2 = Font.measure(ty2.toUpperCase(), 'small') + 8; tx -= w2; typePill(b, ty2, tx, y - 1); tx -= 2; }
      y += 14;
      Font.draw(b, fit('HT ' + d.h + ' M   ' + (d.area || []).map(areaName).join(', '), w), x, y, P.dim, { font: 'small' });
      y += 10;
      y += textLines(b, d.blurb, x, y, w, P.text, 99, 9) + 6;
      Font.draw(b, 'BEHAVIOURS', x, y, hc, { font: 'small' }); y += 10;
      const seenB = Save.data.beh[sp] || {};
      for (const k in d.beh) {
        const bh = d.beh[k], got = k in seenB, cl = got ? [] : Font.wrap('Clue: ' + bh.hint, 'small', w - 12);
        UI.rrect(b, x - 2, y - 3, w + 4, got ? 12 : 13 + cl.length * 8, 2, got ? P.white : P.scrLL);
        Font.draw(b, got ? '{check}' : '{lock}', x, y - 1, 0, { font: 'small' });
        Font.draw(b, got ? bh.n : '???', x + 10, y, P.text, { font: 'small' });
        for (let s = 0; s < bh.tier; s++) Font.icon(b, got ? 'star' : 'star0', x + w - 6 - (bh.tier - 1 - s) * 7, y - 1, 1);
        cl.forEach((ln, j) => Font.draw(b, ln, x + 10, y + 10 + j * 8, P.dim, { font: 'small' }));
        y += 14 + cl.length * 8;
      }
      y += 3;
      Font.draw(b, 'PHOTO OBJECTIVES', x, y, hc, { font: 'small' }); y += 10;
      for (const o of d.obj) {
        const done = !!Save.data.obj[o.id];
        y += textLines(b, (done ? '{check} ' : '{star0} ') + o.t, x, y, w, done ? P.dim : P.text, 3, 8);
        Font.draw(b, fit('   Reward: ' + (o.reward.startsWith('pts:') ? o.reward.slice(4) + ' pts' : Rewards.name(o.reward)), w), x, y, P.faint, { font: 'small' });
        y += 12;
      }
      return y + 4 - y0;
    });
    D.lookAt = [L.x + L.w / 2, L.y + phh / 2];
  }

  /* ---------- page: encyclopedia (habitats + behaviours) ---------- */
  function habitats() { return Object.keys(DexData.AREAS).filter((id) => DexData.ORDER.some((k) => (DexData.S[k].area || []).includes(id))); }
  function pageEncy(fb, G, t) {
    const Q = content(G), C = G.C;
    const th = tabs(fb, 'ency', Q.x, Q.y, Math.min(Q.w, C ? 170 : 200), [['hab', 'HABITATS'], ['beh', 'BEHAVIOURS']]);
    const Q2 = { x: Q.x, y: Q.y + th, w: Q.w, h: Q.h - th };
    if ((D.tab.ency || 'hab') === 'beh') return encyBeh(fb, G, Q2, t);
    const [L, R] = split(Q2, C ? 0.4 : 0.38);
    const ids = habitats();
    D.lsel.ency = clamp(D.lsel.ency || 0, 0, Math.max(0, ids.length - 1));
    if (ids[D.lsel.ency] !== D.encyA && D.encyA && ids.includes(D.encyA) && D.ensure !== 'ency') D.lsel.ency = ids.indexOf(D.encyA);
    const sel = D.lsel.ency, rh = C ? 20 : 24;
    listView(fb, 'ency', L, ids.length, rh, sel, (b, i, x, y, w, h, on) => {
      const id = ids[i], sp = DexData.ORDER.filter((k) => (DexData.S[k].area || []).includes(id)), got = sp.filter((k) => stat(k) === 2).length, un = Save.unlocked(id);
      UI.rrect(b, x, y, w, h - 2, 3, on ? P.red : P.scrD); UI.rrect(b, x + 1, y + 1, w - 2, h - 4, 2, on ? P.white : P.scrLL);
      const [sky, gnd] = areaCols(id); UI.rrect(b, x + 3, y + 3, 8, h - 8, 2, sky); UI.rect(b, x + 3, y + h - 8, 8, 3, gnd);
      Font.draw(b, fit((un ? '' : '{lock} ') + areaName(id), w - 44, C ? 'small' : 'body'), x + 14, y + (C ? 4 : 3), un ? P.text : P.faint, { font: C ? 'small' : 'body' });
      const k = got / Math.max(1, sp.length), bw = w - 18 - (C ? 30 : 34);
      if (C) { UI.rect(b, x + 14, y + 12, bw, 3, P.scrD); UI.rect(b, x + 14, y + 12, Math.round(bw * k), 3, k >= 1 ? P.gold : P.green); }
      else { UI.rect(b, x + 14, y + 16, bw, 3, P.scrD); UI.rect(b, x + 14, y + 16, Math.round(bw * k), 3, k >= 1 ? P.gold : P.green); }
      Font.draw(b, got + '/' + sp.length, x + w - 4, y + (C ? 9 : 12), P.dim, { font: 'small', align: 'right' });
    }, (i) => { D.lsel.ency = i; D.encyA = ids[i]; D.scroll.encyR = 0; });
    const id = ids[sel]; D.encyA = id; if (!id) return;
    card(fb, R);
    const A = DexData.AREAS[id] || {}, [sky] = areaCols(id);
    const I = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 };
    const sps = DexData.ORDER.filter((k) => (DexData.S[k].area || []).includes(id));
    scrollPanel(fb, 'encyR', I, (b, y0) => {
      let y = y0 + 4; const x = I.x + 5, w = I.w - 12;
      UI.rrect(b, x - 2, y, w + 4, C ? 14 : 18, 3, sky);
      Font.draw(b, (A.name || id), x + 2, y + (C ? 2 : 4), P.text, { font: C ? 'body' : 'title' });
      Font.draw(b, fit((A.sub || '').toUpperCase(), w * 0.5), x + w, y + (C ? 5 : 7), P.dim, { font: 'small', align: 'right' });
      y += C ? 18 : 22;
      if (A.blurb) y += textLines(b, A.blurb, x, y, w, P.text, 4, 8) + 4;
      let bt = 0, bg = 0, r4 = 0, r4g = 0;
      for (const k of sps) { const dd = DexData.S[k], sb = Save.data.beh[k] || {}; for (const bk in dd.beh) { bt++; if (bk in sb) bg++; if (dd.beh[bk].tier >= 4) { r4++; if (bk in sb) r4g++; } } }
      Font.draw(b, 'POKéMON ' + sps.filter((k) => stat(k) === 2).length + '/' + sps.length + '   BEHAVIOURS ' + bg + '/' + bt + '   {star}{star}{star}{star} ' + r4g + '/' + r4, x, y, P.dim, { font: 'small' });
      y += 11;
      const cs = C ? 26 : 30, cols = Math.max(1, Math.floor((w + 4) / cs));
      sps.forEach((k, i) => {
        const cx = x + (i % cols) * cs, cy = y + Math.floor(i / cols) * (cs + 2), st = stat(k);
        UI.rrect(b, cx, cy, cs - 3, cs - 3, 3, st === 2 ? P.white : P.scrL);
        const tt = thumb(k, cs - 7, st < 2);
        if (tt) UI.img(b, tt, cx + Math.round((cs - 3 - tt.w) / 2), cy + Math.round((cs - 3 - tt.h) / 2), 1, st === 1 ? { tint: P.scrDD, tintK: 0.4 } : {});
        if (st === 2) Font.icon(b, 'pb', cx + cs - 10, cy + cs - 10, 1);
        const by = cy - (D.scroll.encyR || 0) + (I.y - y0) - 0;
        void by;
      });
      const rows = Math.ceil(sps.length / cols);
      // buttons for the species tiles (registered in screen space)
      sps.forEach((k, i) => { const cx = x + (i % cols) * cs, cy = y + Math.floor(i / cols) * (cs + 2); if (cy >= I.y - 2 && cy + cs < I.y + I.h + 2) btn('eny-' + k, cx, cy, cs - 3, cs - 3, () => { if (stat(k)) { D.sel = k; openEntry(k); } else hintFor(k); }); });
      y += rows * (cs + 2) + 4;
      return y - y0;
    });
  }
  function encyBeh(fb, G, Q, t) {
    const C = G.C;
    const tiers = [0, 0, 0, 0, 0], got = [0, 0, 0, 0, 0], rare = [];
    for (const k of DexData.ORDER) { const d = DexData.S[k], sb = Save.data.beh[k] || {}; for (const bk in d.beh) { const tr = d.beh[bk].tier; tiers[tr]++; if (bk in sb) got[tr]++; if (tr >= 3) rare.push({ k, bk, tr, got: bk in sb }); } }
    const [L, R] = split(Q, C ? 0.36 : 0.34);
    card(fb, L);
    let y = L.y + 6;
    Font.draw(fb, 'STAR TIERS', L.x + 6, y, P.redD, { font: 'small' }); y += 10;
    const rowH = C ? 14 : 18;
    for (let tr = 1; tr <= 4; tr++) {
      const k = got[tr] / Math.max(1, tiers[tr]), x = L.x + 6, w = L.w - 12;
      for (let s = 0; s < tr; s++) Font.icon(fb, 'star', x + s * 7, y, 1);
      Font.draw(fb, got[tr] + '/' + tiers[tr], x + w, y + 1, P.text, { font: 'small', align: 'right' });
      UI.rect(fb, x, y + 9, w, 3, P.scrD); UI.rect(fb, x, y + 9, Math.round(w * k), 3, [0, P.green, P.blue, P.gold, 0xffff7ad0][tr]);
      y += rowH;
    }
    textLines(fb, 'Rare moments score the most stars. Rotom lists them on the right!', L.x + 6, y + 2, L.w - 12, P.dim, Math.max(1, Math.floor((L.y + L.h - y - 6) / 8)));
    rare.sort((a, b) => (a.got - b.got) || (b.tr - a.tr));
    const rh = C ? 22 : 26;
    D.lsel.encyB = clamp(D.lsel.encyB || 0, 0, Math.max(0, rare.length - 1));
    listView(fb, 'encyR', R, rare.length, rh, -1, (b, i, x, y2, w, h) => {
      const r = rare[i], d = DexData.S[r.k], bh = d.beh[r.bk], seen = stat(r.k) > 0;
      UI.rrect(b, x, y2, w, h - 2, 3, P.scrD); UI.rrect(b, x + 1, y2 + 1, w - 2, h - 4, 2, r.got ? P.white : P.scrLL);
      const tt = thumb(r.k, h - 6, !seen); if (tt) UI.img(b, tt, x + 3 + Math.round((h - 6 - tt.w) / 2), y2 + 2 + Math.round((h - 6 - tt.h) / 2), 1);
      const tx = x + h;
      Font.draw(b, fit((seen ? d.name : '???') + ' · ' + (r.got ? bh.n : '???'), w - h - 32), tx, y2 + 3, P.text, { font: 'small' });
      for (let s = 0; s < r.tr; s++) Font.icon(b, r.got ? 'star' : 'star0', x + w - 5 - (r.tr - s) * 7, y2 + 2, 1);
      Font.draw(b, fit(r.got ? '{check} Photographed!' : 'Clue: ' + bh.hint, w - h - 6), tx, y2 + (C ? 12 : 14), P.dim, { font: 'small' });
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
    const Q = content(G), C = G.C;
    const th = tabs(fb, 'quests', Q.x, Q.y, Math.min(Q.w, C ? 170 : 200), [['log', 'QUEST LOG'], ['stamps', 'STAMPS']]);
    const Q2 = { x: Q.x, y: Q.y + th, w: Q.w, h: Q.h - th };
    if ((D.tab.quests || 'log') === 'stamps') return pageStamps(fb, G, Q2, t);
    const list = questList(), [L, R] = split(Q2, C ? 0.47 : 0.46);
    D.lsel.qlog = clamp(D.lsel.qlog || 0, 0, Math.max(0, list.length - 1));
    const sel = D.lsel.qlog, rh = C ? 18 : 22, tr = trackId();
    if (!list.length) { Font.draw(fb, 'NO QUESTS YET!', L.x + L.w / 2, L.y + 20, P.dim, { font: 'small', align: 'center' }); return; }
    const s = listView(fb, 'qlog', L, list.length, rh, sel, (b, i, x, y, w, h, on) => {
      const e = list[i], q = e.q, ic = QST[e.s] || QST.active;
      UI.rrect(b, x, y, w, h - 2, 3, on ? P.red : P.scrD); UI.rrect(b, x + 1, y + 1, w - 2, h - 4, 2, on ? P.white : e.s === 'done' ? P.scrL : P.scrLL);
      UI.disc(b, x + 8, y + (h >> 1) - 1, C ? 4 : 5, ic[2]); Font.draw(b, ic[0], x + 8, y + (h >> 1) - 3, 0xffffffff, { font: 'small', align: 'center' });
      Font.draw(b, fit(q.title, w - 22 - (q.id === tr ? 10 : 0), C ? 'small' : 'body'), x + 16, y + (C ? 5 : 3), e.s === 'done' ? P.faint : P.text, { font: C ? 'small' : 'body' });
      if (!C) Font.draw(b, fit(q.birch ? 'PROF. BIRCH' : spName(q.giver).toUpperCase() + ' · ' + areaName(q.area).toUpperCase(), w - 22), x + 16, y + 13, P.faint, { font: 'small' });
      if (q.id === tr) Font.icon(b, 'spark', x + w - 9, y + 4, 1);
    }, (i) => { if (D.lsel.qlog === i) trackQuest(list[i].q); D.lsel.qlog = i; });
    D.lookAt = [L.x + L.w / 2, L.y + sel * rh - s + rh / 2];
    const e = list[sel]; if (!e) return;
    const q = e.q, ic = QST[e.s] || QST.active;
    card(fb, R);
    let y = R.y + 5; const x = R.x + 6, w = R.w - 12;
    pill(fb, x, y, Font.measure(ic[1], 'small') + 10, 9, ic[2], 0xffffffff, ic[1], { hi: false });
    if (q.area) Font.draw(fb, fit(areaName(q.area).toUpperCase(), w - 60), x + w, y + 2, P.dim, { font: 'small', align: 'right' });
    y += 12;
    y += textLines(fb, q.title, x, y + 1, w, P.text, 2, 12, 'title') + 2;
    // who asked
    const gsp = q.birch ? null : q.giver, tt = gsp && DexData.S[gsp] ? thumb(gsp, C ? 20 : 26, false) : null;
    const gy = y;
    if (tt) UI.img(fb, tt, x, gy, 1); else portrait(fb, x, gy, C ? 20 : 26, q.birch ? 'birch' : gsp);
    const gw = (C ? 20 : 26) + 5;
    Font.draw(fb, (q.birch ? 'Prof. Birch' : spName(q.giver)), x + gw, gy + 2, P.text, { font: 'body' });
    Font.draw(fb, q.birch ? 'RESEARCH REQUEST' : 'ASKED FOR HELP', x + gw, gy + (C ? 13 : 15), P.faint, { font: 'small' });
    y = gy + (C ? 23 : 30);
    const obj = q.birch ? (e.s === 'done' ? 'Completed!' : q.birch.hint) : hasP() && Progress.objective ? Progress.objective(q) : '';
    Font.draw(fb, 'OBJECTIVE', x, y, P.redD, { font: 'small' }); y += 9;
    y += textLines(fb, obj, x, y, w, P.text, C ? 2 : 3, 8) + 3;
    const rw = q.birch ? rewardLabel(q.birch.reward) : rewardLabel(q.reward);
    if (rw && y < R.y + R.h - 30) { Font.draw(fb, fit('REWARD: ' + rw, w), x, y, P.dim, { font: 'small' }); y += 10; }
    if (!q.birch && e.s !== 'done') {
      const on = q.id === tr, bh = C ? 12 : 14;
      button(fb, 'track', x, R.y + R.h - 5 - bh, w, bh, on ? '{spark} TRACKING — TAP TO STOP' : 'TRACK THIS QUEST', () => trackQuest(q), { fill: on ? P.green : P.red });
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
    const C = G.C, n = Quests.stamps(), [L, R] = split(Q, 0.44);
    card(fb, L);
    Font.draw(fb, 'RESEARCH STAMPS', L.x + 6, L.y + 5, P.redD, { font: 'small' });
    Font.draw(fb, String(n), L.x + L.w - 8, L.y + 3, P.text, { font: 'title', align: 'right' });
    const ids = Object.keys(DexData.AREAS), LQ = { x: L.x + 3, y: L.y + 16, w: L.w - 6, h: L.h - 19 - (C ? 14 : 18) };
    listView(fb, 'stampA', LQ, ids.length, C ? 20 : 24, -1, (b, i, x, y, w, h) => {
      const id = ids[i], a = DexData.AREAS[id], un = Save.unlocked(id);
      UI.rrect(b, x, y, w, h - 2, 3, P.scrD); UI.rrect(b, x + 1, y + 1, w - 2, h - 4, 2, un ? P.white : P.scrLL);
      Font.draw(b, fit((un ? '{check} ' : '{lock} ') + a.name, w - 8, C ? 'small' : 'body'), x + 4, y + (C ? 3 : 2), P.text, { font: C ? 'small' : 'body' });
      Font.draw(b, fit(un ? a.sub : id === 'stage' ? 'Needs Meloetta\'s band' : a.need >= 99 ? 'Follow the quests to get there' : 'Needs ' + a.need + ' stamps', w - 8), x + 4, y + (C ? 11 : 13), P.faint, { font: 'small' });
    });
    const bh = C ? 12 : 14;
    button(fb, 'map', L.x + 4, L.y + L.h - bh - 4, L.w - 8, bh, '{spark} OPEN THE WORLD MAP', () => { if (locked('map')) { SFX.error(); say('The map is still locked! Bzzt.', { mood: 'sad' }); return; } close(() => WorldMap.open()); });
    card(fb, R);
    const I = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 };
    scrollPanel(fb, 'stampR', I, (b, y0) => {
      let y = y0 + 5; const x = I.x + 5, w = I.w - 10;
      Font.draw(b, 'Prof. Birch\'s requests', x, y + 1, P.text, { font: 'body' }); y += 15;
      for (const q of Quests.BIRCH) {
        const done = !!Save.data.quests[q.id], hl = done ? [] : Font.wrap(q.hint, 'small', w - 12);
        UI.rrect(b, x - 3, y - 3, w + 4, 12 + hl.length * 8, 2, done ? P.white : P.scrLL);
        Font.draw(b, fit((done ? '{check} ' : '{star0} ') + q.t, w), x, y, P.text, { font: 'small' });
        hl.forEach((ln, j) => Font.draw(b, ln, x + 8, y + 9 + j * 8, P.dim, { font: 'small' }));
        y += 15 + hl.length * 8;
      }
      return y - y0;
    });
  }

  /* ---------- page: progress (from progress.js) ---------- */
  function pageProg(fb, G, t) {
    const Q = content(G), [L, R] = split(Q, 0.42);
    if (hasP() && Progress.dexPage) {
      card(fb, L); card(fb, R);
      const Li = { x: L.x + 2, y: L.y + 2, w: L.w - 4, h: L.h - 4 }, Ri = { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 };
      Progress.dexPage(fb, D.SP, Li, Ri, 0, t, { btn, clipTo, areas, D, thumb });
    } else {
      const c = counts();
      Font.draw(fb, 'Seen ' + c.seen + ' · Caught ' + c.caught + ' / ' + c.all, Q.x + 6, Q.y + 8, P.text, { font: 'title' });
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
    out.sort((a, b) => (!!R[a.id] - !!R[b.id]) || (b.t - a.t));
    D.mailC = { t: D.rt || 0, list: out };
    return out;
  }
  function mailUnread() { const R = Save.data.rmail || {}; return mailList().filter((m) => !R[m.id]).length; }
  function pageMail(fb, G, t) {
    const Q = content(G), C = G.C, [L, R] = split(Q, C ? 0.45 : 0.44);
    const M = mailList(), RD = (Save.data.rmail = Save.data.rmail || {});
    if (D.mailSel) { const i = M.findIndex((m) => m.id === D.mailSel); if (i >= 0 && D.ensure !== 'mail') D.lsel.mail = i; }
    D.lsel.mail = clamp(D.lsel.mail || 0, 0, Math.max(0, M.length - 1));
    const sel = D.lsel.mail, rh = C ? 22 : 26;
    const s = listView(fb, 'mail', L, M.length, rh, sel, (b, i, x, y, w, h, on) => {
      const m = M[i], unread = !RD[m.id];
      UI.rrect(b, x, y, w, h - 2, 3, on ? P.red : P.scrD); UI.rrect(b, x + 1, y + 1, w - 2, h - 4, 2, on ? P.white : unread ? P.card : P.scrLL);
      const ps = h - 7, tt = DexData.S[m.sp] ? thumb(m.sp, ps, false) : null;
      if (tt) UI.img(b, tt, x + 3 + Math.round((ps - tt.w) / 2), y + 2 + Math.round((ps - tt.h) / 2)); else portrait(b, x + 3, y + 2, ps, m.sp);
      const tx = x + ps + 7;
      Font.draw(b, fit(m.from.toUpperCase(), w - ps - 18), tx, y + 3, unread ? P.redD : P.faint, { font: 'small' });
      Font.draw(b, fit(m.subj, w - ps - 14, C ? 'small' : 'body'), tx, y + (C ? 11 : 12), unread ? P.text : P.dim, { font: C ? 'small' : 'body' });
      if (unread) { UI.disc(b, x + w - 6, y + 5, 2, P.red); }
    }, (i) => { D.lsel.mail = i; D.mailSel = M[i] && M[i].id; });
    const m = M[sel]; if (!m) return;
    D.mailSel = m.id;
    if (!RD[m.id]) { RD[m.id] = 1; Save.save(); D.mailC = null; }
    D.lookAt = [L.x + L.w / 2, L.y + sel * rh - s + rh / 2];
    card(fb, R, P.white);
    const x = R.x + 6, w = R.w - 12; let y = R.y + 5;
    const ps = C ? 22 : 28, tt = DexData.S[m.sp] ? thumb(m.sp, ps, false) : null;
    UI.rrect(fb, x - 1, y - 1, ps + 2, ps + 2, 4, P.scrL);
    if (tt) UI.img(fb, tt, x + Math.round((ps - tt.w) / 2), y + Math.round((ps - tt.h) / 2)); else portrait(fb, x, y, ps, m.sp);
    Font.draw(fb, 'FROM: ' + m.from.toUpperCase(), x + ps + 6, y + 2, P.faint, { font: 'small' });
    textLines(fb, m.subj, x + ps + 6, y + 11, w - ps - 6, P.text, 2, 11, 'body');
    y += ps + 6;
    UI.hline(fb, x, x + w, y, P.scrL); y += 5;
    const bh = C ? 12 : 14, maxL = Math.max(1, Math.floor((R.y + R.h - 6 - (m.act ? bh + 4 : 0) - y) / 9));
    textLines(fb, m.body, x, y, w, P.text, maxL, 9);
    if (m.act) button(fb, 'mail-act', x, R.y + R.h - 5 - bh, w, bh, m.act.label, m.act.fn);
  }

  /* ---------- page: TMs / moves ---------- */
  function pickMove(i) { const m = Moves.LIST[i]; if (!m) return; D.lsel.tms = i; if (Moves.has(m.id)) { Moves.select(i); SFX.select(); say(m.name + ' selected! Press B or X to use it!', { mood: 'happy' }); } else { SFX.error(); say('Not learned yet! ' + (m.how || ''), { mood: 'sad', life: 6 }); } }
  function pageTMs(fb, G, t) {
    const Q = content(G), C = G.C, [L, R] = split(Q, C ? 0.46 : 0.44), LS = Moves.LIST;
    D.lsel.tms = clamp(D.lsel.tms ?? Math.max(0, LS.findIndex((m) => m.id === Moves.cur)), 0, LS.length - 1);
    const sel = D.lsel.tms, rh = C ? 17 : 20;
    const s = listView(fb, 'tms', L, LS.length, rh, sel, (b, i, x, y, w, h, on) => {
      const m = LS[i], own = Moves.has(m.id), cur = Moves.cur === m.id;
      UI.rrect(b, x, y, w, h - 2, 3, on ? P.red : P.scrD); UI.rrect(b, x + 1, y + 1, w - 2, h - 4, 2, on ? P.white : own ? P.card : P.scrLL);
      const r = (h >> 1) - 3; UI.orb(b, x + 4 + r, y + (h >> 1) - 1, r, own ? m.col : P.grey, { ol: P.rim });
      if (own) Moves.icon(b, m.id, x + 4 + r, y + (h >> 1) - 1, 1);
      Font.draw(b, fit(own ? m.name : '???', w - r * 2 - 40, C ? 'small' : 'body'), x + r * 2 + 8, y + (C ? 5 : 4), own ? P.text : P.faint, { font: C ? 'small' : 'body' });
      Font.draw(b, m.tm || 'MOVE', x + w - 4, y + (C ? 5 : 6), cur ? P.red : P.faint, { font: 'small', align: 'right' });
    }, (i) => { if (D.lsel.tms === i) pickMove(i); D.lsel.tms = i; });
    D.lookAt = [L.x + L.w / 2, L.y + sel * rh - s + rh / 2];
    const m = LS[sel]; if (!m) return;
    const own = Moves.has(m.id);
    card(fb, R);
    const x = R.x + 6, w = R.w - 12; let y = R.y + 6;
    const r = C ? 12 : 16, cx = x + r + 1, cy = y + r + 1;
    UI.disc(fb, cx, cy + 2, r + 1, P.scrD); UI.orb(fb, cx, cy, r, own ? m.col : P.grey, { ol: P.rim });
    if (own) Moves.icon(fb, m.id, cx, cy, 2); else Font.draw(fb, '?', cx, cy - 5, 0xffffffff, { font: 'title', align: 'center' });
    if (own && Moves.coolK(m.id) > 0) Moves.coolPie(fb, cx, cy, r, Moves.coolK(m.id));
    Font.draw(fb, own ? m.name : '???', x + r * 2 + 8, y + 2, P.text, { font: 'title' });
    Font.draw(fb, (m.tm ? m.tm + ' · ' : 'STARTER MOVE · ') + (m.cool ? m.cool + 'S RECHARGE' : 'NO RECHARGE'), x + r * 2 + 8, y + 17, P.dim, { font: 'small' });
    y += r * 2 + 8;
    y += textLines(fb, own ? (m.desc || MOVE_DESC[m.id] || '') : 'How to learn: ' + (m.how || 'keep exploring!'), x, y, w, P.text, 5, 9) + 4;
    const bh = C ? 12 : 14;
    if (own) button(fb, 'usemove', x, R.y + R.h - 5 - bh, w, bh, Moves.cur === m.id ? '{check} EQUIPPED' : 'EQUIP (B / X TO USE)', () => pickMove(sel), { fill: Moves.cur === m.id ? P.green : P.red });
  }
  const MOVE_DESC = { bubble: 'Floating bubbles Pokémon love to chase and pop.', growl: 'A big "Mud-KIP!": nearby Pokémon look your way. A photo trick!', dig: 'Dig on sand or soil for buried treasure.', smash: 'Breaks cracked rocks and boulders.', ice: 'Freezes the water into floes you can hop across.' };

  /* ---------- page: day / night ---------- */
  const SKY = { dawn: ['#ffb8a0', '#8ab0e8'], noon: ['#8ad0ff', '#4a90e8'], afternoon: ['#ffd89a', '#6aa8e8'], dusk: ['#ff8a5a', '#5a3a8a'], night: ['#1a2050', '#0a0e2a'] };
  function pageTime(fb, G, t) {
    const Q = content(G), C = G.C, [L, R] = split(Q, 0.5), hr = Game.hour(), sk = SKY[hr] || SKY.noon;
    const s0 = hex(sk[0]), s1 = hex(sk[1]);
    rrFill(fb, L.x, L.y, L.w, L.h, 5, (i, j, ins, w, h) => (j === 0 || i === ins || i === w - 1 - ins || j === h - 1 ? P.scrDD : mix(s1, s0, j / h)));
    const hi = Pal.HOURS.indexOf(hr), k = (hi + 0.5) / Pal.HOURS.length, night = hr === 'night';
    const ax = L.x + 14 + Math.round((L.w - 28) * k), ay = L.y + L.h - 18 - Math.round(Math.sin(k * Math.PI) * (L.h - 44));
    if (night) { for (let i = 0; i < 26; i++) UI.put(fb, L.x + 3 + Math.floor(U.hash(i, 1, 2) * (L.w - 6)), L.y + 3 + Math.floor(U.hash(i, 3, 4) * (L.h - 24)), (Math.sin(t * 3 + i) > 0.3) ? 0xffffffff : 0xffa0a8d8); UI.disc(fb, ax, ay, 8, hex('#fff2b8')); UI.disc(fb, ax + 4, ay - 3, 7, mix(s1, s0, (ay - L.y) / L.h)); }
    else { for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2 + t * 0.4; UI.line(fb, Math.round(ax + Math.cos(an) * 11), Math.round(ay + Math.sin(an) * 11), Math.round(ax + Math.cos(an) * 14), Math.round(ay + Math.sin(an) * 14), hex('#ffd23a')); } UI.disc(fb, ax, ay, 8, hex('#ffe060')); UI.disc(fb, ax - 2, ay - 2, 3, hex('#fff8c0')); }
    for (let i = 0; i < L.w - 4; i++) { const hgt = 5 + Math.round(Math.sin(i * 0.11) * 3 + Math.sin(i * 0.31) * 2); UI.vline(fb, L.x + 2 + i, L.y + L.h - 2 - hgt, L.y + L.h - 3, night ? hex('#101838') : hex('#3a8a4a')); }
    Font.draw(fb, hr.toUpperCase(), L.x + 8, L.y + 7, night ? 0xffffffff : P.text, { font: 'title', outline: night ? P.rim : undefined });
    card(fb, R);
    let y = R.y + 6; const x = R.x + 6, w = R.w - 12, bh = C ? 12 : 14;
    Font.draw(fb, 'TIME OF DAY', x, y, P.redD, { font: 'small' }); y += 10;
    y += textLines(fb, Game.canTime() ? 'Dialga lends you its power: let the hours pass whenever you like.' : 'Time flows by itself... Only the Pokémon that rules time could change it.', x, y, w, P.text, 3, 8) + 3;
    button(fb, 'time-next', x, y, w, bh, Game.canTime() ? 'LET TIME PASS {right}' : '{lock} LET TIME PASS', () => Game.tryTime(), { fill: Game.canTime() ? P.blue : P.grey });
    y += bh + 8;
    if (typeof Seasons !== 'undefined') {
      Font.draw(fb, 'SEASON: ' + Seasons.NAME[Seasons.cur].toUpperCase(), x, y, P.redD, { font: 'small' }); y += 10;
      const ok = !hasP() || Progress.has('season');
      if (y + bh < R.y + R.h - 2) button(fb, 'season-next', x, y, w, bh, ok ? 'NEXT SEASON {right}' : '{lock} SEASONS (LV 8)', () => Seasons.next(), { fill: ok ? P.green : P.grey });
      y += bh + 7;
    }
    const Wt = Weather.W, wl = Wt.rain > 0.3 ? 'RAIN' : Wt.snow > 0.3 ? 'SNOW' : Wt.fog > 0.3 ? 'FOG' : 'CLEAR';
    if (y < R.y + R.h - 9) Font.draw(fb, fit('WEATHER: ' + wl + (Game.areaId ? ' · ' + areaName(Game.areaId).toUpperCase() : ''), w), x, y, P.dim, { font: 'small' });
  }

  /* ---------- page: chat with Rotom ---------- */
  const CHATQ = [['joke', 'TELL A JOKE'], ['hint', 'GIVE ME A HINT'], ['near', 'WHO IS NEARBY?'], ['me', 'HOW AM I DOING?']];
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
    const Q = content(G), C = G.C, bh = C ? 12 : 14, cols = C || Q.w < 400 ? 2 : 4, bw = Math.floor((Q.w - (cols - 1) * 4) / cols);
    const rows = Math.ceil(CHATQ.length / cols), Lh = Q.h - rows * (bh + 4);
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
    CHATQ.forEach(([id, lab], i) => {
      const bx = Q.x + (i % cols) * (bw + 4), by = Q.y + Lh + Math.floor(i / cols) * (bh + 4);
      button(fb, 'chat-' + id, bx, by, bw, bh, (C ? '' : (i + 1) + '  ') + lab, () => chatAsk(id), { fill: [P.red, P.blue, P.green, hex('#8a5ee6')][i], silent: true });
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
    const S = D.SP, Q = content(G), [L, R] = split(Q, 0.5);
    const al = Save.data.album, sel = al[D.album] || null;
    card(fb, L);
    const pw = L.w - 8, phh = Math.min(Math.round(pw * 0.72), L.h - 30);
    UI.rrect(fb, L.x + 3, L.y + 3, pw + 2, phh + 2, 2, P.rim);
    if (sel && sel.img) { const b = photo(sel.img); if (b) UI.imgFit(fb, b, L.x + 4, L.y + 4, pw, phh); }
    else Font.draw(fb, al.length ? 'Photo not saved' : 'No photos yet - go snap!', L.x + L.w / 2, L.y + 4 + phh / 2 - 4, P.white, { font: 'small', align: 'center' });
    if (sel) {
      const y = L.y + 8 + phh;
      if (sel.sp && DexData.S[sel.sp]) { Font.draw(fb, fit(DexData.S[sel.sp].name + (DexData.S[sel.sp].beh[sel.beh] ? ' - ' + DexData.S[sel.sp].beh[sel.beh].n : ''), L.w - 12), L.x + 6, y + 2, P.text, { font: 'small' }); stars(fb, sel.stars, L.x + 6, y + 11); medal(fb, sel.medal, L.x + 46, y + 14); Font.draw(fb, sel.score + ' PTS', L.x + 54, y + 12, P.dim, { font: 'small' }); }
    }
    const cw = G.C ? 46 : 56, chh = Math.round(cw * 0.82), cols = Math.max(2, Math.floor((R.w - 4) / cw));
    const gx = R.x + Math.floor((R.w - cols * cw) / 2), rows = Math.ceil(al.length / cols);
    D.scroll.album = clamp(D.scroll.album || 0, 0, Math.max(0, rows * chh - R.h + 4));
    areas.album = { x: R.x, y: R.y, w: R.w, h: R.h };
    if (!al.length) Font.draw(fb, 'YOUR LAST PHOTOS APPEAR HERE.', R.x + R.w / 2, R.y + R.h / 2, P.dim, { font: 'small', align: 'center' });
    clipTo(fb, R, (b) => {
      al.forEach((a, i) => {
        const x = gx + (i % cols) * cw, y = R.y + 2 + Math.floor(i / cols) * chh - D.scroll.album;
        UI.rrect(b, x + 1, y + 1, cw - 4, chh - 4, 2, i === D.album ? P.red : P.rim);
        const im = a.img ? photo(a.img) : null;
        if (im) UI.imgFit(b, im, x + 3, y + 3, cw - 8, chh - 8); else UI.rect(b, x + 3, y + 3, cw - 8, chh - 8, 0xff2a3040);
        if (a.stars) stars(b, a.stars, x + 3, y + chh - 12, a.stars);
        if (a.medal) medal(b, a.medal, x + cw - 9, y + chh - 9);
      });
    });
    al.forEach((a, i) => { const x = gx + (i % cols) * cw, y = R.y + 2 + Math.floor(i / cols) * chh - D.scroll.album; if (y + chh > R.y && y < R.y + R.h - 4) btn('al' + i, x, Math.max(R.y, y), cw, chh, () => { D.album = i; }); });
    if (sel) { const i = D.album; D.lookAt = [gx + (i % cols) * cw + cw / 2, R.y + Math.floor(i / cols) * chh - D.scroll.album + chh / 2]; }
    void S;
  }
  /* ---- style: Mudkip's wardrobe + device customisation ---- */
  const mudCache = new Map();
  function mudSprite(look, yaw) {
    const key = JSON.stringify(look) + '|' + yaw.toFixed(2);
    if (mudCache.has(key)) return mudCache.get(key);
    const m = Mudkip.meta, sc = 1.0, W = Math.ceil(m.bw * sc), H = Math.ceil(m.bh * sc);
    const r = Mudkip.render(Mudkip.build(Object.assign({ side: Math.cos(yaw), eyes: 'happy', mouth: 1 }, look)), { yaw, pitch: 0.16, scale: sc, W, H, ox: W >> 1, oy: Math.floor(H * m.oy), pal: Mudkip.PAL, light: { dir: [-0.5, 0.72, 0.5] } });
    const b = r.buf; b.ox = W >> 1; b.oy = Math.floor(H * m.oy);
    const bb = Creature.bounds(r); b.bb = bb;
    if (mudCache.size > 60) mudCache.delete(mudCache.keys().next().value);
    mudCache.set(key, b);
    return b;
  }
  function drawMud(fb, L, yOff = 0) {
    const look = Save.look(), yaw = Math.round((0.6 + Math.sin(D.mudYaw * 0.7) * 0.9) * 10) / 10, b = mudSprite(look, yaw);
    const bb = b.bb || { x0: 0, y0: 0, w: b.w, h: b.h }, avail = L.h - 30 - yOff, sc = bb.h * 2 <= avail ? 2 : 1;
    const baseY = L.y + L.h - 16;
    UI.rrect(fb, L.x + L.w / 2 - 30, baseY - 2, 60, 5, 2, P.scrD);
    UI.img(fb, b, Math.round(L.x + L.w / 2 - b.ox * sc), Math.round(baseY - (bb.y0 + bb.h) * sc), sc);
  }
  function pageStyle(fb, G, t) {
    const Q = content(G), C = G.C, [L, R] = split(Q, 0.4);
    card(fb, L);
    Font.draw(fb, 'Mudkip\'s look', L.x + 6, L.y + 5, P.text, { font: 'body' });
    drawMud(fb, L, 12);
    Font.draw(fb, UI.skin().name.toUpperCase() + ' SKIN', L.x + L.w / 2, L.y + L.h - 9, P.dim, { font: 'small', align: 'center' });
    // slot tabs (3 rows)
    const per = 4, sw = Math.floor(R.w / per), th = C ? 11 : 12;
    Rewards.SLOTS.forEach(([slot, label], i) => {
      const bx = R.x + (i % per) * sw, by = R.y + Math.floor(i / per) * (th + 2), on = D.styleSlot === slot;
      pill(fb, bx, by, sw - 2, th, on ? P.red : P.scrLL, on ? 0xffffffff : P.dim, label.toUpperCase());
      btn('slot-' + slot, bx, by, sw - 2, th + 1, () => { D.styleSlot = slot; D.scroll.style = 0; }, { silent: true });
    });
    const rowsT = Math.ceil(Rewards.SLOTS.length / per), top = R.y + rowsT * (th + 2) + 2;
    const items = Object.keys(Rewards.C).filter((id) => Rewards.C[id].slot === D.styleSlot);
    const eq = Save.data.equip[D.styleSlot], canNone = ['hat', 'shirt', 'glasses', 'key', 'shoes', 'fun'].includes(D.styleSlot);
    const rows = canNone ? [null, ...items] : items;
    const LQ = { x: R.x, y: top, w: R.w, h: R.y + R.h - top };
    listView(fb, 'style', LQ, rows.length, C ? 16 : 19, -1, (b, i, x, y, w, h) => {
      const id = rows[i], own = id === null || Save.has(id), on = eq === id || (id === null && !eq);
      UI.rrect(b, x, y, w, h - 2, 3, on ? P.red : P.scrD); UI.rrect(b, x + 1, y + 1, w - 2, h - 4, 2, on ? P.white : own ? P.card : P.scrLL);
      const nm = id === null ? 'None' : own ? Rewards.C[id].name : '???';
      Font.draw(b, fit((on ? '{check} ' : own ? '' : '{lock} ') + nm, w * 0.55, C ? 'small' : 'body'), x + 5, y + (C ? 4 : 3), own ? P.text : P.faint, { font: C ? 'small' : 'body' });
      if (id && own && Rewards.C[id].desc) Font.draw(b, fit(Rewards.C[id].desc, w * 0.42), x + w - 4, y + (C ? 4 : 6), P.faint, { font: 'small', align: 'right' });
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
    const Q = content(G), C = G.C, [L, R] = split(Q, 0.36), pts = Save.data.points;
    card(fb, L);
    Font.draw(fb, '{coin} ' + pts, L.x + 6, L.y + 6, P.text, { font: 'title' });
    const ty = L.y + 22 + textLines(fb, 'Earn points with great photos and requests. Some prizes are only won from Pokédex quests!', L.x + 6, L.y + 22, L.w - 12, P.dim, C ? 3 : 5, 8);
    drawMud(fb, L, ty - L.y);
    const cats = [['items', 'ITEMS'], ['outfit', 'OUTFITS'], ['device', 'DEVICE']];
    D.shopCat = D.shopCat || 'items';
    const cw = Math.floor(R.w / 3), th = C ? 11 : 12;
    cats.forEach(([id, label], i) => {
      const bx = R.x + i * cw, on = D.shopCat === id;
      pill(fb, bx, R.y, cw - 2, th, on ? P.red : P.scrLL, on ? 0xffffffff : P.dim, label);
      btn('shopcat-' + id, bx, R.y - 3, cw - 2, th + 5, () => { D.shopCat = id; D.scroll.shop = 0; }, { silent: true });
    });
    let rows;
    if (D.shopCat === 'items') rows = GOODS.map((g) => ({ id: g.id, name: g.name, desc: g.desc, price: g.price, owned: false, buy: g.buy }));
    else {
      const slots = D.shopCat === 'outfit' ? ['hat', 'shirt', 'glasses', 'neck'] : ['skin', 'banner', 'key', 'deco'];
      rows = Object.keys(Rewards.C).filter((id) => slots.includes(Rewards.C[id].slot) && !id.endsWith('.none'))
        .map((id) => { const ex = exclusive().has(id); return { id, name: Rewards.C[id].name + (ex ? ' {star}' : ''), desc: (ex ? 'Quest prize - or buy it now! ' : '') + (Rewards.C[id].desc || ''), price: (PRICE[Rewards.C[id].slot] || 500) * (ex ? 3 : 1), owned: Save.has(id), buy() { Save.own(id); Save.equip(Rewards.C[id].slot, id); } }; })
        .sort((a, b) => (a.owned - b.owned) || (a.price - b.price));
    }
    const LQ = { x: R.x, y: R.y + th + 3, w: R.w, h: R.h - th - 3 }, rh = C ? 22 : 26;
    listView(fb, 'shop', LQ, rows.length, rh, -1, (g, i, x, y, w, h) => {
      const r = rows[i], afford = pts >= r.price;
      UI.rrect(g, x, y, w, h - 2, 3, P.scrD); UI.rrect(g, x + 1, y + 1, w - 2, h - 4, 2, r.owned ? P.white : P.card);
      Font.draw(g, fit(r.name, w - 62, C ? 'small' : 'body'), x + 5, y + (C ? 3 : 2), P.text, { font: C ? 'small' : 'body' });
      Font.draw(g, fit(r.desc || '', w - 62), x + 5, y + (C ? 12 : 15), P.faint, { font: 'small' });
      const bw = 48, bx = x + w - 4 - bw, bh = C ? 11 : 13;
      pill(g, bx, y + Math.round((h - 2 - bh) / 2), bw, bh, r.owned ? P.grey : afford ? P.red : hex('#6a6a80'), 0xffffffff, r.owned ? 'OWNED' : '{coin}' + r.price, { hi: !r.owned });
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
    const Q = content(G), C = G.C, [L, R] = split(Q, 0.34), got = SECRETS.filter((s) => Save.found(s[0])).length;
    card(fb, L);
    Font.draw(fb, 'SECRETS FOUND', L.x + 6, L.y + 6, P.redD, { font: 'small' });
    Font.draw(fb, got + ' / ' + SECRETS.length, L.x + 6, L.y + 16, P.text, { font: 'title', sc: C ? 1 : 2 });
    const k = got / SECRETS.length, bw = L.w - 12, by = L.y + (C ? 32 : 44);
    UI.rrect(fb, L.x + 6, by, bw, 6, 3, P.scrD); if (got) UI.rrect(fb, L.x + 6, by, Math.max(4, Math.round(bw * k)), 6, 3, P.gold);
    textLines(fb, 'Use Scan (4) near anything suspicious. Pokémon clues point the way too!', L.x + 6, by + 11, L.w - 12, P.dim, Math.max(1, Math.floor((L.y + L.h - by - 16) / 8)));
    listView(fb, 'disc', R, SECRETS.length, C ? 20 : 23, -1, (b, i, x, y, w, h) => {
      const [id, name, hint] = SECRETS[i], f = Save.found(id);
      UI.rrect(b, x, y, w, h - 2, 3, P.scrD); UI.rrect(b, x + 1, y + 1, w - 2, h - 4, 2, f ? P.white : P.scrLL);
      Font.draw(b, fit((f ? '{spark} ' : '{lock} ') + (f ? name : '???'), w - 8), x + 4, y + 3, f ? P.text : P.dim, { font: 'small' });
      Font.draw(b, fit(f ? 'Discovered!' : hint, w - 14), x + 12, y + (C ? 11 : 12), P.faint, { font: 'small' });
    });
  }
  /* ---- settings ---- */
  function rotomCfg() { return Save.data.rotom || (Save.data.rotom = { off: false, chat: 1 }); }
  function pageSettings(fb, G, t) {
    const Q = content(G), C = G.C, [L, R] = split(Q, 0.5), rowH = C ? 16 : 20;
    const row = (Qc, y, id, label, val, fn) => {
      const on = D.hoverId === 'set-' + id;
      UI.rrect(fb, Qc.x, y, Qc.w, rowH - 2, 3, P.scrD); UI.rrect(fb, Qc.x + 1, y + 1, Qc.w - 2, rowH - 4, 2, on ? P.white : P.card);
      Font.draw(fb, label, Qc.x + 6, y + (C ? 3 : 5), P.text, { font: C ? 'small' : 'body' });
      pill(fb, Qc.x + Qc.w - 52, y + Math.round((rowH - 2 - 10) / 2), 48, 10, val === 'ON' ? P.green : val === 'OFF' ? P.grey : P.blue, 0xffffffff, fit(val, 44), { hi: false });
      btn('set-' + id, Qc.x, y, Qc.w, rowH - 2, fn);
      return y + rowH;
    };
    Font.draw(fb, 'GAME', R.x + 2, R.y + 1, P.redD, { font: 'small' });
    let y = R.y + 9;
    y = row(R, y, 'sound', 'Sound', Sound.on ? 'ON' : 'OFF', () => { const v = Sound.set(!Sound.on); U.store.set('mk-snap-sound', v); Music.onSound(v); });
    y = row(R, y, 'song', 'Song', Music.cur && Music.TRACKS && Music.TRACKS[Music.cur] ? Music.TRACKS[Music.cur].title : '-', () => Music.next());
    y = row(R, y, 'grid', 'Camera grid', Photo.grid ? 'ON' : 'OFF', () => { Photo.grid = !Photo.grid; });
    y = row(R, y, 'time', 'Time of day', Game.hour().toUpperCase(), () => Game.tryTime());
    if (y + rowH <= R.y + R.h + 2) row(R, y, 'reset', 'Reset journal', D.confirm ? 'SURE?' : '...', () => { if (D.confirm) { Save.reset(); D.confirm = null; HUD.toast('Journal reset.'); say('Memory wiped! Who are you? Bzzt!', { mood: 'dizzy', moodT: 2 }); } else { D.confirm = true; say('Tap again to erase EVERYTHING!', { mood: 'wow' }); setTimeout(() => { D.confirm = null; }, 2500); } });
    const cfg = rotomCfg();
    Font.draw(fb, 'ROTOM BUDDY', L.x + 2, L.y + 1, P.redD, { font: 'small' });
    y = L.y + 9;
    y = row(L, y, 'rbuddy', 'Rotom in the world', cfg.off ? 'OFF' : 'ON', () => { cfg.off = !cfg.off; Save.save(); say(cfg.off ? 'Rotom will stay in the Dex. Bzzt...' : 'Yay! Rotom will fly with you!', { mood: cfg.off ? 'sad' : 'happy' }); });
    y = row(L, y, 'rchat', 'Chatter', ['QUIET', 'SOME', 'LOTS'][cfg.chat ?? 1], () => { cfg.chat = ((cfg.chat ?? 1) + 1) % 3; Save.save(); say(['Rotom will be quiet. Mostly.', 'Normal chatter! Bzzt!', 'Rotom will talk a LOT! Bzzt-bzzt!'][cfg.chat]); });
    textLines(fb, 'Poke Rotom in the world (or press O) for jokes and hints. It ducks out of your photos!', L.x + 2, y + 3, L.w - 4, P.dim, Math.max(1, Math.floor((L.y + L.h - y - 4) / 8)));
  }

  const PAGES = { home: pageHome, dex: pageDex, entry: pageEntry, ency: pageEncy, quests: pageQuests, prog: pageProg, album: pageAlbum, mail: pageMail, settings: pageSettings, style: pageStyle, shop: pageShop, disc: pageDisc, tms: pageTMs, time: pageTime, chat: pageChat, help: pageHelp };

  /* ---------- drawing ---------- */
  function draw(fbOut, t) {
    const W0 = fbOut.w, H0 = fbOut.h;
    // big UI canvases (phones at 2-3x): draw at 2x so the device fills the screen and stays readable
    const s = Math.max(1, Math.floor(Math.min(W0 / 420, H0 / 194)));
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
    UI.rectA(fb, 0, 0, W, H, 0xff0a0e20, 0.55 * dimK);
    // rise in / drop out
    const rise = D.closing ? U.ease.inCubic(clamp((D.closing - 0.16) / 0.34, 0, 1)) : 1 - U.ease.outBack(clamp(D.t / 0.34, 0, 1));
    const dy = Math.round(rise * (H - G.oy + G.antH + 8)) + Math.round(Math.sin(t * 2.2) * 1.2);
    G.oy += dy; G.scr.y += dy;
    drawShell(fb, G, FR, t);
    // keychain from the side clip
    if (Save.data.equip.key) Rewards.drawKey(fb, Save.data.equip.key, G.ox + G.DW + 1, G.oy + Math.round(G.DH * 0.64), D.keyAng, t);
    const pw = D.closing ? clamp(1 - D.closing / 0.16, 0, 1) : clamp((D.t - 0.24) / 0.2, 0, 1);
    drawScreen(fb, G, pw, t);
    if (pw >= 1) {
      const fn = PAGES[D.page] || pageDex, Scr = G.scr;
      const k = U.ease.outCubic(D.trans), slide = Math.round((1 - k) * 36 * D.dir);
      if (slide) {
        const L2 = D.tmp2 && D.tmp2.w === W && D.tmp2.h === H ? D.tmp2 : (D.tmp2 = new PX.Buf(W, H));
        L2.d.fill(0);
        fn(L2, G, t);
        for (let y = Math.max(0, Scr.y); y < Math.min(H, Scr.y + Scr.h); y++) for (let x = Math.max(0, Scr.x + 1); x < Math.min(W, Scr.x + Scr.w - 1); x++) { const sx = x - slide; if (sx < 0 || sx >= W) continue; const v = L2.d[y * W + sx]; if (v) fb.d[y * W + x] = v; }
        // scanline sweep
        UI.rectA(fb, Scr.x + 2, Math.round(Scr.y + Scr.h * k), Scr.w - 4, 2, 0xffffffff, 0.4);
      } else fn(fb, G, t);
      drawHeader(fb, G, t);
    }
    if (pw > 0.3 || D.closing) drawFace(fb, G, t);
    homeButton(fb, G, FR, t);
    D.dev = { x: G.ox - 4, y: G.oy - G.antH, w: G.DW + 8, h: G.DH + G.antH + G.tailH };
    // big close bar under the device when there is room (portrait phones)
    if (H - (G.oy + G.DH + G.tailH) > 34 && !D.closing) {
      const cw = Math.min(G.DW, 150), cx = Math.round((W - cw) / 2), cy = G.oy + G.DH + G.tailH + 10;
      UI.rrect(fb, cx, cy, cw, 22, 6, FR.ink); UI.rrect(fb, cx + 1, cy + 1, cw - 2, 20, 5, FR.b);
      Font.draw(fb, 'CLOSE', cx + cw / 2, cy + 8, 0xffffffff, { font: 'small', align: 'center' });
      btn('closebar', cx, cy, cw, 22, () => close());
    }
  }

  return Object.assign(D, { cancel, open, close, go, back, update, draw, down, move, up, wheel, key, hover, thumb, say, mood, zap, stat, counts, SECRETS, APPS, LINES });
})();
