/* ------------------------------------------------------------------
   Progress — the Pokédex-completion loop that ties everything together.
     · Mudkip levels: XP from new Pokédex entries and behaviours, photo
       quality, quests, requests, secrets, TMs and challenges. Level +
       XP bar in the HUD and a level-up celebration.
     · Gradual unlocks: features open with levels or story quests, each
       announced with a "New: ..." card. ?unlock=all opens everything.
     · Quest log (L or the scroll button): active / done, objectives,
       rewards and which Pokédex entries a quest helps; track a quest.
     · Markers: an arrow to the tracked objective, pins on the world map.
     · Scanning: reveals quest clues, hidden Pokémon, unregistered
       species and quest targets nearby.
     · New objective kinds for quests2.js: clue, scan, deliver, census.
     · The Rotom Dex "Progress" page: completion %, per-area progress
       and hints for what is left to discover.
   Everything hooks in by wrapping public functions of the other
   modules, so they stay untouched.
------------------------------------------------------------------- */
const Progress = (() => {
  const { clamp } = U;
  const INK = 0xff1b2240, WHITE = 0xffffffff, GOLD = 0xffffd23a, CYAN = 0xff3ad8ff;
  const qs = new URLSearchParams(location.search);
  const P = { all: qs.get('unlock') === 'all', ready: false, pollT: 0, fl: [], cards: [], lvUp: null, pings: [], log: null, noFlagT: 0, scanHit: 0, deepT: 0, sp: [], stars: [], bar: null, geo: null, toastY: 62 };
  // XP needed to reach each level (index = level)
  // (v2 curve: gentle early levels, steps that grow smoothly so each area's
  //  recommended level — beach 3, forest 5, canopy 7, falls 9, volcano 11,
  //  shoal 13 — lands about halfway through that area's content; later areas
  //  pay more per discovery and road fights fill the gap)
  const XP = [0, 0, 120, 380, 820, 1500, 2400, 3450, 4600, 5850, 7200, 8650, 10200, 11850, 13600, 15450, 17400, 19450, 21600, 23850, 26200];
  const XP1 = [0, 0, 100, 260, 480, 760, 1100, 1500, 1960, 2480, 3060, 3700, 4400, 5160, 5980, 6860, 7800, 8800, 9900, 11100, 12400]; // the old curve (migration)
  // later areas are worth more per discovery (first area a species lives in)
  const TIER = { beach: 1, forest: 1.25, canopy: 1.6, falls: 2, stage: 2, volcano: 2.4, shoal: 2.8 };
  const tierOf = (a) => TIER[a] || 1;
  const spTier = (sp) => { const d = DexData.S[sp]; const as = d ? [].concat(d.area || []) : []; return as.length ? Math.min(...as.map(tierOf)) : 1; };
  // XP sources (for the breakdown page)
  const SRC = { dex: 'New Pokédex entries', beh: 'New behaviours', photo: 'Photo quality', obj: 'Photo objectives', quest: 'Quests', req: 'Requests', fight: 'Road fights & bosses', disc: 'Secrets & discoveries', move: 'New moves', games: 'Minigames', area: 'New areas' };
  const catOf = (why) => (/^(Road fight|Rematch|Boss|Battle|Rival|Tamed|Win|Beat)/i.test(why || '') ? 'fight' : /photo/i.test(why || '') ? 'photo' : /quest/i.test(why || '') ? 'quest' : 'games');
  const MAXLV = XP.length - 1;
  // features and when they open (lv, or a story flag that opens them early)
  const FEATS = [
    { id: 'moves', lv: 2, name: 'Moves', desc: 'B / X uses Water Gun and Tackle.' },
    { id: 'bag', lv: 2, name: 'Bag & berries', desc: 'Open the Bag (B key / bag icon). F throws berries.' },
    { id: 'scan', lv: 3, name: 'Scanner', desc: 'Scan (4) reveals quest clues and hidden Pokémon.' },
    { id: 'map', lv: 3, name: 'World Map', desc: 'Press M to fly between places.', flag: () => Save.found('mail.map') },
    { id: 'dive', lv: 4, name: 'Deep diving', desc: 'Mudkip can now swim to the sea floor.' },
    { id: 'wheel', lv: 4, name: 'Move wheel & TMs', desc: 'Hold B (or Q) to pick learned TM moves.', flag: () => Object.keys(Save.data.tms || {}).length > 0 },
    { id: 'music', lv: 5, name: 'Guitar & music', desc: 'Sing and play the rhythm game (G).' },
    { id: 'style', lv: 5, name: 'Wardrobe', desc: 'Dress Mudkip up (V).' },
    { id: 'time', lv: 6, name: 'Clock', desc: 'Tap the clock (T) to change the time of day.' },
    { id: 'games', lv: 7, name: 'Playground', desc: 'Minigames and challenges (H).' },
    { id: 'season', lv: 8, name: 'Seasons', desc: 'Tap the season chip (N) to change the season.' },
  ];
  const FD = Object.fromEntries(FEATS.map((f) => [f.id, f]));
  const nm = (sp) => (DexData.S[sp] ? DexData.S[sp].name : { mailman: 'Pelipper (mail)', birch: 'Prof. Birch' }[sp] || sp);
  const star = (t) => String(t).replace(/★/g, '{star}');
  // one line that fits in w pixels (trimmed with "..")
  function fit(t, w, font = 'small') { t = star(t); if (Font.measure(t, font) <= w) return t; while (t.length > 1 && Font.measure(t + '..', font) > w) t = t.slice(0, -1); return t + '..'; }
  const areaName = (a) => (DexData.AREAS[a] ? DexData.AREAS[a].name : a);
  const questXP = (q) => Math.round((70 + ((q && q.xp) || 0)) * (q ? tierOf(q.area) : 1));

  /* ---------- save data ---------- */
  function L() {
    const d = Save.data;
    if (!d.lv) d.lv = { xp: 0, got: {}, feat: {}, track: null, init: 0, cv: 2 };
    const D = d.lv;
    // v1 curve → v2: keep the player's level and progress through it
    if (!D.cv) {
      let l = 1; while (l < MAXLV && D.xp >= XP1[l + 1]) l++;
      const k = l >= MAXLV ? 0 : (D.xp - XP1[l]) / (XP1[l + 1] - XP1[l]);
      D.xp = Math.round(XP[l] + k * ((XP[l + 1] || XP[l]) - XP[l])); D.cv = 2;
    }
    if (!D.src) D.src = {};
    if (!D.rep) D.rep = {};
    return D;
  }
  function levelOf(xp) { let l = 1; while (l < MAXLV && xp >= XP[l + 1]) l++; return l; }
  const level = () => (P.all ? Math.max(MAXLV, levelOf(L().xp)) : levelOf(L().xp));
  function has(id) {
    if (P.all) return true;
    const f = FD[id]; if (!f) return true;
    return !!L().feat[id] || levelOf(L().xp) >= f.lv || !!(f.flag && f.flag());
  }
  const hudOk = (id) => (id === 'map' ? has('map') : id === 'bag' ? has('bag') : id === 'style' ? has('style') : id === 'games' ? has('games') : true);

  /* ---------- XP ---------- */
  // this session's XP by source
  const SES = { xp: 0, src: {}, t0: Date.now(), lv0: 0, streak: 0, best: 0, lastGood: -1e9 };
  // repeating the same thing pays less (the count fades by half every 10 minutes)
  function repeatK(key) {
    const D = L(), r = D.rep[key] || { n: 0, t: 0 }, now = Date.now();
    const n = r.n * Math.pow(0.5, (now - r.t) / 600000);
    D.rep[key] = { n: n + 1, t: now };
    // trim the table
    const ks = Object.keys(D.rep); if (ks.length > 80) { ks.sort((a, b) => D.rep[a].t - D.rep[b].t); for (const k of ks.slice(0, ks.length - 60)) delete D.rep[k]; }
    return Math.max(0.25, Math.pow(0.75, n));
  }
  function gain(n, why, silent, cat) {
    const D = L(), l0 = levelOf(D.xp);
    n = Math.max(1, Math.round(n));
    cat = cat || catOf(why);
    if (cat === 'fight' && /^Rematch/.test(why || '')) n = Math.max(1, Math.round(n * repeatK('re.' + why)));
    D.xp += n; D.src[cat] = (D.src[cat] || 0) + n; Save.save();
    if (silent) { P.bar = null; return; }
    SES.xp += n; SES.src[cat] = (SES.src[cat] || 0) + n;
    // several small gains in a row merge into one popup
    const last = P.fl[P.fl.length - 1];
    if (last && last.t < 0.5 && last.why === (why || '')) { last.n += n; last.t = 0; }
    else P.fl.push({ t: 0, n, why: why || '', cat });
    if (P.fl.length > 3) P.fl.shift();
    // the bar pauses a beat (the new XP shows as a flickering ghost), then fills
    if (P.bar && !P.bar.moving) P.bar.hold = 0.28;
    const l1 = levelOf(D.xp);
    if (l1 > l0) levelUp(l1);
  }
  function award(key, n, why, silent, cat) {
    const D = L(); if (D.got[key]) return false; D.got[key] = 1;
    if (!cat && /^punk\.|^boss|^tame/.test(key)) cat = 'fight';
    gain(n, why, silent, cat); return true;
  }
  // the celebration starts once the XP bar has filled up (see barUpdate)
  function levelUp(l) {
    if (P.all) { checkFeats(); return; }
    if (P.lvUp) P.lvUp.lv = l; else P.lvUp = { t: -1.4, lv: l, from: P.bar ? P.bar.lv : l - 1 };
    checkFeats();
  }
  function lvStart() {
    try { Game.sfx('unlock'); } catch (e) { /* audio */ }
    const mk = Game.mudkip; if (mk && typeof FX !== 'undefined' && FX.confetti) FX.confetti(mk.x, mk.y - 24, 50);
    if (mk && mk.emote) mk.emote('heart', 1.5);
  }
  function lvFlip() {
    try { Game.sfx('reward'); } catch (e) { /* audio */ }
    const c = lvPos(); if (!c) return;
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3, v = 70 + Math.random() * 80; P.stars.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: 0, life: 0.9 + Math.random() * 0.6, big: i % 2 === 0 }); }
  }
  function lvLand() {
    try { Game.sfx('sparkle'); } catch (e) { /* audio */ }
    if (P.bar) { P.bar.bump = 1; P.bar.flash = 0.6; }
    burst(HB.x + BCX, HB.y + BCY, 14, 1);
  }
  function checkFeats(silent) {
    const D = L();
    for (const f of FEATS) if (!D.feat[f.id] && (levelOf(D.xp) >= f.lv || (f.flag && f.flag()))) { D.feat[f.id] = 1; Save.save(); if (!silent && !P.all) P.cards.push({ t: 0, f }); }
  }
  // the whole journal, scanned for things worth XP (keys make each count once)
  function poll(silent) {
    const d = Save.data;
    for (const sp in d.seen) if (DexData.S[sp] && !DexData.S[sp].player) award('sp.' + sp, 40 * spTier(sp), 'New Pokédex entry: ' + nm(sp), silent, 'dex');
    for (const sp in d.beh) for (const b in d.beh[sp]) { const S0 = DexData.S[sp], bb = S0 && S0.beh && S0.beh[b]; award('bh.' + sp + '.' + b, (6 + ((bb && bb.tier) || 1) * 2) * spTier(sp), 'New behaviour: ' + nm(sp) + (bb && bb.n ? ' ' + bb.n.toLowerCase() : ''), silent, 'beh'); }
    for (const id in d.obj) award('ob.' + id, 15 * spTier(id.split('.')[0]), 'Photo objective', silent, 'obj');
    for (const id in d.quests) award('rq.' + id, 40, 'Request done', silent, 'req');
    const tq = d.tq || {};
    for (const id in tq) if (tq[id].s === 'done') { const q = Talk.QUESTS.find((x) => x.id === id); award('tq.' + id, questXP(q), 'Quest: ' + (q ? q.title : id), silent, 'quest'); }
    for (const id in d.disc) award('dc.' + id, 15 * tierOf(id.split('.')[0]), 'Secret found', silent, 'disc');
    for (const id in d.tms || {}) award('tm.' + id, 40, 'New move learned', silent, 'move');
    const st = d.stats || {};
    // minigames: the first wins pay well, then less and less
    for (let i = 1; i <= Math.min(20, st.sumo || 0); i++) award('sumo.' + i, Math.max(8, Math.round(40 * Math.pow(0.85, i - 1))), 'Sumo win' + (i > 1 ? ' x' + i : ''), silent, 'games');
    for (let i = 1; i <= Math.min(10, Math.floor((st.rope || 0) / 5)); i++) award('rope.' + i, Math.max(6, Math.round(20 * Math.pow(0.85, i - 1))), 'Jump rope x' + i * 5, silent, 'games');
    if (st.regi) award('regi', 150, 'Ancient puzzle solved', silent, 'disc');
    for (const a in d.areas) if (a !== 'beach') award('ar.' + a, 50 * tierOf(a), 'New area: ' + areaName(a), silent, 'area');
    censusTick();
    checkFeats(silent);
  }
  function init() {
    if (P.ready) return;
    P.ready = true;
    const D = L();
    // existing journals: count everything already done, silently (grants a sensible level)
    if (!D.init) { poll(true); D.init = 1; checkFeats(true); Save.save(); }
    SES.lv0 = level();
    stampAccepted(true);
    wrapGame();
  }

  /* ---------- gates: wrap the entry points of locked features ---------- */
  function locked(id) {
    const f = FD[id];
    if (P.noFlagT > 0) return;
    P.noFlagT = 1.2;
    HUD.toast('{lock} ' + f.name + ' unlocks at Lv ' + f.lv + '. Complete Pokédex entries and quests to level up!', { life: 2.8, col: 0xff8a90a8 });
    Game.sfx('error');
  }
  function gate(obj, fn, id, pass) {
    if (!obj || typeof obj[fn] !== 'function') return;
    const f0 = obj[fn];
    obj[fn] = function (...a) { if (!has(id) && !(pass && pass(...a))) { locked(id); return undefined; } return f0.apply(this, a); };
  }
  gate(typeof Bag !== 'undefined' ? Bag : null, 'open', 'bag');
  gate(typeof Style !== 'undefined' ? Style : null, 'open', 'style');
  gate(typeof Rhythm !== 'undefined' ? Rhythm : null, 'open', 'music');
  gate(typeof Arcade !== 'undefined' ? Arcade : null, 'open', 'games');
  gate(typeof Seasons !== 'undefined' ? Seasons : null, 'next', 'season');
  gate(WorldMap, 'open', 'map');
  gate(Moves, 'toggleWheel', 'wheel');
  gate(Moves, 'press', 'moves');
  { const r0 = Moves.release; Moves.release = function (...a) { if (!has('moves')) return undefined; return r0.apply(this, a); }; }
  { const s0 = Moves.select; Moves.select = function (i) { const m = Moves.LIST[i]; if (m && m.id === 'scan' && !has('scan')) { locked('scan'); return; } if (m && m.id === 'sing' && !has('music')) { locked('music'); return; } return s0.call(this, i); }; }
  if (Moves.drawChip) { const c0 = Moves.drawChip; Moves.drawChip = function (...a) { if (!has('moves')) return; return c0.apply(this, a); }; }
  if (typeof Music !== 'undefined' && Music.drawUI) { const m0 = Music.drawUI; Music.drawUI = function (fb, t, where) { if (where === 'explore' && !has('music')) return; return m0.apply(this, arguments); }; }
  { const t0 = HUD.tool; HUD.tool = function (id) { if (id === 'scan' && !has('scan')) { locked('scan'); return; } if (id === 'song' && !has('music')) { locked('music'); return; } const r = t0.apply(this, arguments); if (id === 'scan') onScan(); return r; }; }
  { const h0 = HUD.toast; HUD.toast = function (msg, o) { if (typeof msg === 'string' && msg.startsWith('Scan: nothing unusual') && Game.rt - P.scanHit < 2) return; return h0.call(this, msg, o); }; }
  // photo quality XP
  { const r0 = Save.recordPhoto; Save.recordPhoto = function (r) { const out = r0.call(this, r); try { if (r && r.species) photoXP(r, out); } catch (e) { console.error(e); } return out; }; }
  // a good photo (3★+) within 45 s of the last good one grows the streak: +15% per step, up to +60%
  function photoXP(r, out) {
    const stars = r.stars || 0, now = Game.rt || 0;
    if (stars >= 3) { SES.streak = now - SES.lastGood < 45 ? SES.streak + 1 : 1; SES.lastGood = now; SES.best = Math.max(SES.best, SES.streak); }
    else if (stars <= 1) SES.streak = 0;
    if (!out.improved && !out.newBeh) return;
    let n = stars * 4 + (r.medal || 0) * 3 + (out.newStar ? 6 : 0);
    n *= spTier(r.species);
    const sk = SES.streak >= 2 ? Math.min(0.6, (SES.streak - 1) * 0.15) : 0;
    n *= 1 + sk;
    // the same Pokémon again and again: less each time
    n *= repeatK('ph.' + r.species);
    const lab = 'Photo ' + '★'.repeat(Math.max(1, stars)) + ' ' + nm(r.species) + (sk ? ' · Streak x' + SES.streak : '') + (out.newStar ? ' · new best' : '');
    gain(Math.max(2, n), lab, false, 'photo');
  }
  function wrapGame() {
    if (Game.tryTime && !Game.tryTime.pg) { const t0 = Game.tryTime; Game.tryTime = function (...a) { if (!has('time')) { locked('time'); return; } return t0.apply(this, a); }; Game.tryTime.pg = 1; }
    // deep water: until Lv4 Mudkip paddles near the surface
    Game.swimCap = (x, s) => {
      if (has('dive')) return 1e9;
      const cap = s + 44;
      if (Game.mudkip && Game.mudkip.y >= cap - 1 && P.deepT <= 0) { P.deepT = 6; HUD.toast('Too deep for now! Deep diving unlocks at Lv ' + FD.dive.lv + '.', { life: 2.4, col: 0xff8a90a8 }); }
      return cap;
    };
  }

  /* ---------- quests: states, objectives, tracking ---------- */
  const QS = () => Talk.QUESTS;
  const st = (q) => Talk.qState(q.id);
  const afterOk = (q) => !q.after || (Talk.qState(q.after) && Talk.qState(q.after).s === 'done');
  function status(q) {
    const s = st(q);
    if (s && s.s === 'done') return 'done';
    if (s && s.s === 'active') return Talk.ready(q) ? 'ready' : 'active';
    if (!afterOk(q) || !Save.unlocked(q.area)) return 'hidden';
    if ((q.lv || 1) > level()) return 'lvl';
    return 'avail';
  }
  function censusN(q) { return DexData.ORDER.filter((k) => Save.data.seen[k] && (DexData.S[k].area || []).includes(q.area)).length; }
  function censusTick() {
    for (const q of QS()) {
      if (q.progress !== 'census') continue;
      const s = st(q); if (!s || s.s !== 'active') continue;
      const n = censusN(q);
      if (n !== s.n) { const was = s.n || 0; s.n = n; Save.save(); if (was < q.n && n >= q.n && P.ready) HUD.toast(q.title + ': go back and tell ' + nm(q.giver) + '!', { life: 2.6, col: GOLD }); }
    }
  }
  const BERRY = { berry: 'Oran Berries', pecha: 'Pecha Berries', nanab: 'Nanab Berries', razz: 'Razz Berries', sitrus: 'Sitrus Berries' };
  function behName(sp, b) { const d = DexData.S[sp]; return d && d.beh[b] ? d.beh[b].n : b; }
  function objective(q) {
    const s = st(q), n = q.n || 1, have = s ? s.n || 0 : 0, g = nm(q.giver);
    const cnt = ' (' + Math.min(have, n) + '/' + n + ')';
    if (!s) return q.lv > level() ? 'Reach Lv ' + q.lv + ', then talk to ' + g : 'Talk to ' + g + ' in ' + areaName(q.area);
    if (s.s === 'done') return 'Completed!';
    const gt = q.gate && q.gate(); if (gt && gt.obj) return gt.obj; // waiting for the area's boss (bosses.js)
    if (Talk.ready(q)) return 'Return to ' + g + ' in ' + areaName(q.area);
    if (q.instant) return 'Talk to ' + g;
    if (q.fetch) return 'Bring ' + q.fetch.n + ' ' + (BERRY[q.fetch.item] || q.fetch.item) + ' (' + Math.min(Save.itemN(q.fetch.item), q.fetch.n) + '/' + q.fetch.n + ')';
    if (q.photo) return 'Photograph ' + nm(q.photo.sp) + (q.photo.beh ? ': "' + behName(q.photo.sp, q.photo.beh) + '"' : '');
    switch (q.progress) {
      case 'flops': return 'Belly flop next to ' + g + cnt;
      case 'song': return 'Play a song next to ' + g;
      case 'spots': return 'Dig up the glittering spots' + cnt;
      case 'pearl': return 'Find the glint on the seabed';
      case 'nap': return 'Stand still next to ' + g + ' for a while';
      case 'mail': return 'Deliver the letters' + cnt;
      case 'clue': return 'Scan for ' + (q.clueName || 'clue') + 's, then walk over them' + cnt;
      case 'scan': return 'Scan a ' + nm(q.scan) + ' to research it';
      case 'deliver': return 'Deliver the parcel to ' + nm(q.deliver);
      case 'census': return 'Register ' + n + ' ' + areaName(q.area) + ' Pokémon' + cnt;
      default: return 'Help ' + g + cnt;
    }
  }
  function rewardLabel(r) {
    if (!r) return '';
    if (r.startsWith('pts:')) return r.slice(4) + ' points';
    if (r.startsWith('item:')) { const [, k, n] = r.split(':'); return n + ' ' + (BERRY[k] || k); }
    if (r.startsWith('tm:')) { const m = Moves.DEF[r.slice(3)]; return m ? (m.tm ? m.tm + ' ' : '') + m.name : 'a TM'; }
    return Rewards.C[r] ? Rewards.C[r].name : r;
  }
  function dexOf(q) {
    const l = (q.dex || []).slice();
    if (q.photo) l.push(q.photo.sp);
    if (q.scan) l.push(q.scan);
    if (q.deliver) l.push(q.deliver);
    if (DexData.S[q.giver]) l.push(q.giver);
    if (q.progress === 'census') for (const k of DexData.ORDER) if (!Save.data.seen[k] && (DexData.S[k].area || []).includes(q.area) && l.length < 6) l.push(k);
    return [...new Set(l)].filter((k) => DexData.S[k] && !DexData.S[k].player);
  }
  // only jobs the player has taken on (talked to the giver and accepted) show up anywhere;
  // Birch's requests are never "accepted", so only finished ones join the log
  const birch = () => (Quests.BIRCH || []).filter((b) => Save.data.quests[b.id]).map((b) => ({ id: b.id, birch: b, title: star(b.t), giver: 'birch', area: null }));
  const isOpen = (q) => { const s = st(q); return !!s && s.s === 'active'; };
  const at = (q) => { const s = st(q); return (s && s.at) || 0; };
  // number every accepted job in the order it was taken; a newly accepted job becomes the tracked one
  function stampAccepted(quiet) {
    const D = L(); let ch = 0;
    for (const q of QS()) {
      const s = st(q); if (!s || s.at) continue;
      s.at = D.seq = (D.seq || 0) + 1; ch = 1;
      if (!quiet && s.s === 'active') D.track = q.id;
    }
    if (ch) Save.save();
  }
  function entries() {
    const out = [];
    for (const q of QS()) if (st(q)) out.push({ q, s: status(q) });
    for (const b of birch()) out.push({ q: b, s: 'done' });
    const ord = { ready: 0, active: 1, done: 4 }, rk = (e) => (ord[e.s] ?? 2) + (e.q.birch ? 0.5 : 0);
    const tr = tracked();
    out.sort((a, b) => (tr && a.q === tr ? -1 : tr && b.q === tr ? 1 : 0) || rk(a) - rk(b) || at(b.q) - at(a.q));
    return out;
  }
  function tracked() {
    const tr = L().track;
    const q = tr && QS().find((x) => x.id === tr);
    if (q && isOpen(q)) return q;
    // automatic: the newest accepted job that is still open
    let best = null;
    for (const x of QS()) if (isOpen(x) && (!best || at(x) > at(best))) best = x;
    return best;
  }
  function nearestMon(kind) {
    const mk = Game.mudkip; let best = null, bd = 1e9;
    for (const m of Mons.all) { if (m === mk || !m.alive || (m.kind !== kind && m.dex !== kind) || String(m.kind).startsWith('bg-')) continue; const d = Math.abs(m.x - mk.x); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  // where the tracked objective is in this area: { x, y, label }
  function target(q) {
    if (!q || q.area !== Game.areaId || !Game.mudkip) return null;
    const s = st(q), g = Talk.giverOf(q), gp = g ? { x: g.x, y: g.y - 30, who: g, label: nm(q.giver) } : null;
    const gt = s && q.gate && q.gate(); if (gt && gt.target) return gt.target() || gp; // point at the boss
    if (!s || Talk.ready(q) || q.instant) return gp;
    if (q.photo) { const m = nearestMon(q.photo.sp); return m ? { x: m.x, y: m.y - 30, who: m, label: nm(q.photo.sp) } : gp; }
    if (q.progress === 'scan') { const m = nearestMon(q.scan); return m ? { x: m.x, y: m.y - 30, who: m, label: 'Scan ' + nm(q.scan) } : null; }
    if (q.progress === 'deliver') { const m = nearestMon(q.deliver); return m ? { x: m.x, y: m.y - 30, who: m, label: nm(q.deliver) } : null; }
    if (q.progress === 'clue') { const c = clues(q).filter((c) => !c.got).sort((a, b) => Math.abs(a.x - Game.mudkip.x) - Math.abs(b.x - Game.mudkip.x))[0]; return c ? { x: c.x, y: c.y - 8, label: c.rev ? (q.clueName || 'clue') : 'Scan here' } : gp; }
    if (q.progress === 'census' || q.fetch) return null;
    return gp;
  }

  /* ---------- new objective kinds ---------- */
  function clues(q) {
    const s = st(q); if (!s) return [];
    s.rev = s.rev || []; s.got = s.got || [];
    return q.clues.map((x, i) => ({ i, x, y: World.standY ? World.standY(x) : World.groundAt(x), rev: s.rev.includes(i), got: s.got.includes(i) }));
  }
  function onScan() {
    const mk = Game.mudkip; if (!mk) return;
    const R = Game.VW * 0.75;
    let hits = 0;
    const ping = (at, label, col) => { P.pings.push({ at, label, col, t: 0, life: 4.5 }); hits++; };
    for (const q of QS()) {
      if (q.area !== Game.areaId) continue;
      const s = st(q); if (!s || s.s !== 'active') continue;
      if (q.progress === 'clue') for (const c of clues(q)) if (!c.got && !c.rev && Math.abs(c.x - mk.x) < R) { s.rev.push(c.i); Save.save(); ping(() => [c.x, c.y - 6], (q.clueName || 'clue') + '!', GOLD); }
      if (q.progress === 'scan' && (s.n || 0) < (q.n || 1)) { const m = nearestMon(q.scan); if (m && Math.abs(m.x - mk.x) < R) { ping(() => m.headPt(), nm(q.scan) + ' researched!', GOLD); setTimeout(() => Talk.progress(q.id), 700); } }
      if (q.photo) { const m = nearestMon(q.photo.sp); if (m && Math.abs(m.x - mk.x) < R) ping(() => m.headPt(), 'Quest: photo ' + nm(q.photo.sp), GOLD); }
      if (q.progress === 'deliver') { const m = nearestMon(q.deliver); if (m && Math.abs(m.x - mk.x) < R) ping(() => m.headPt(), 'Deliver here', GOLD); }
    }
    // hidden and unregistered Pokémon
    for (const m of Mons.all) {
      if (m === mk || !m.alive || Math.abs(m.x - mk.x) > R || String(m.kind).startsWith('bg-') || !DexData.S[m.dex]) continue;
      if (m.hideK > 0.4 || m.hidden || !m.visible) ping(() => m.headPt(), 'Hidden Pokémon!', 0xffff7ad0);
      else if (!Save.data.seen[m.dex]) ping(() => m.headPt(), 'New: ??? ', CYAN);
    }
    if (hits) { P.scanHit = Game.rt; setTimeout(() => HUD.toast('Scan: ' + hits + ' thing' + (hits > 1 ? 's' : '') + ' marked nearby!', { life: 2, col: 0xff7affc0 }), 600); }
    // scanning the unregistered also hints at how to find them
    const miss = DexData.ORDER.filter((k) => !Save.data.seen[k] && (DexData.S[k].area || []).includes(Game.areaId));
    if (!hits && miss.length) { const k = miss[(Math.random() * miss.length) | 0], d = DexData.S[k], b = Object.values(d.beh)[0]; P.scanHit = Game.rt; setTimeout(() => HUD.toast('Rotom: "Not every Pokémon here is registered. Hint: ' + (b ? b.hint : 'keep exploring') + '"', { life: 4.5, col: 0xff7affc0 }), 900); }
  }
  // delivering: talk to the recipient
  Talk.hooks.unshift((m) => {
    for (const q of QS()) {
      if (q.area !== Game.areaId) continue;
      const s = st(q);
      if (q.progress === 'deliver' && s && s.s === 'active' && !(s.n >= 1) && (m.kind === q.deliver || m.dex === q.deliver)) {
        Talk.open(q.deliverLines || ['(Delivered!)'], { who: m, name: nm(q.deliver), title: q.title, done: () => Talk.progress(q.id) });
        return true;
      }
      // quests that need a higher level
      if (!s && afterOk(q) && (q.lv || 1) > level() && m.kind === q.giver && Talk.giverOf(q) === m) {
        Talk.bubble(() => m.headPt(), '(It has a job for you at Lv ' + q.lv + '!)', { life: 2.4, who: m });
        return true;
      }
    }
    return false;
  });

  /* ---------- per frame ---------- */
  function update(dt) {
    if (!P.ready && Game.areaId && typeof Save !== 'undefined') init();
    if (!P.ready) return;
    P.noFlagT = Math.max(0, P.noFlagT - dt); P.deepT = Math.max(0, P.deepT - dt);
    P.pollT += dt;
    if (P.pollT > 0.5) { P.pollT = 0; poll(false); }
    stampAccepted(false);
    for (const f of P.fl) f.t += dt; P.fl = P.fl.filter((f) => f.t < 2.2);
    for (const p of P.pings) p.t += dt; P.pings = P.pings.filter((p) => p.t < p.life);
    barUpdate(dt);
    for (const s of P.sp) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += (s.g ?? 90) * dt; s.vx *= 1 - dt * 1.5; }
    P.sp = P.sp.filter((s) => s.t < s.life);
    for (const s of P.stars) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 140 * dt; s.vx *= 1 - dt; }
    P.stars = P.stars.filter((s) => s.t < s.life);
    if (P.lvUp) {
      const U0 = P.lvUp, t0 = U0.t;
      // the celebration waits for the explore screen (not while taking photos, talking or reading the log)
      if (t0 >= 0 || (Game.mode === 'explore' && !Talk.dlg && !P.log && !(typeof Cards !== 'undefined' && Cards.live))) U0.t += dt; // (not during a card battle)
      if (t0 < 0 && U0.t >= 0) lvStart();
      if (t0 < FLIP && U0.t >= FLIP) lvFlip();
      if (U0.t > LVT) { P.lvUp = null; lvLand(); }
    }
    if (!P.lvUp && P.cards.length && !(typeof Cards !== 'undefined' && Cards.live)) { P.cards[0].t += dt; if (P.cards[0].t > 3.8) P.cards.shift(); }
    // unlock=all: locked moves stay out of the way
    if (!has('wheel') && Moves.wheel) Moves.closeWheel();
    // collecting revealed clues
    const mk = Game.mudkip;
    if (mk && Game.mode === 'explore') for (const q of QS()) {
      if (q.progress !== 'clue' || q.area !== Game.areaId) continue;
      const s = st(q); if (!s || s.s !== 'active') continue;
      for (const c of clues(q)) if (c.rev && !c.got && Math.abs(c.x - mk.x) < 26 && Math.abs(c.y - mk.y) < 50) {
        s.got.push(c.i); Save.save(); Game.sfx('sparkle'); if (FX.confetti) FX.confetti(c.x, c.y - 10, 14);
        Talk.progress(q.id);
      }
    }
  }
  { const u0 = Talk.update; Talk.update = function (dt) { const r = u0.call(this, dt); try { update(dt); } catch (e) { console.error(e); } return r; }; }

  /* ---------- drawing: HUD ---------- */
  function icon(fb, cx, cy, t) {
    // a rolled quest scroll with a "!"
    UI.rrect(fb, cx - 6, cy - 7, 12, 14, 2, INK); UI.rrect(fb, cx - 5, cy - 6, 10, 12, 1, 0xfff4e2b0);
    UI.hline(fb, cx - 7, cx + 6, cy - 7, INK); UI.hline(fb, cx - 7, cx + 6, cy + 7, INK);
    UI.hline(fb, cx - 6, cx + 5, cy - 6, 0xffd8b870); UI.hline(fb, cx - 6, cx + 5, cy + 6, 0xffd8b870);
    UI.rect(fb, cx - 1, cy - 4, 2, 5, 0xffe8384a); UI.rect(fb, cx - 1, cy + 3, 2, 2, 0xffe8384a);
  }
  function logBadge() { return QS().some((q) => status(q) === 'ready'); }

  /* ---------- the level badge (a Mudkip-head emblem) and the XP bar ---------- */
  const hx = U.hex;
  const BCOL = {
    b: { finL: hx('#d2f0ff'), fin: hx('#62b8f8'), finD: hx('#2f78d4'), hl: hx('#ffffff'), bL: hx('#96d8ff'), b: hx('#4aa8f2'), bD: hx('#2f78d4'), bDD: hx('#1f559e'), rL: hx('#c8ecff'), gL: hx('#ffd08a'), g: hx('#ff8a2a'), gD: hx('#c8521a') },
    g: { finL: hx('#fffbe0'), fin: hx('#ffe27a'), finD: hx('#e0a030'), hl: hx('#ffffff'), bL: hx('#fff2a8'), b: hx('#ffd23a'), bD: hx('#eaa424'), bDD: hx('#b87212'), rL: hx('#fffbe0'), gL: hx('#ffe0b0'), g: hx('#ff9a4a'), gD: hx('#d0602a') },
  };
  // sprite layout: head circle centre (BCX, BCY) radius BR, the fin sweeps back from the crown, orange gills at the cheeks
  const BW = 29, BH = 31, BCX = 14, BCY = 19, BR = 9;
  const GILL = ['#...', '##..', '.###', '##..', '#...'];
  const FIN = [[4, 5], [3, 7], [3, 9], [4, 11], [4, 13], [5, 14], [5, 15], [6, 16], [7, 17], [8, 18], [9, 19]]; // rows y = 2..12: [back, front]
  const HB = { x: 5, y: 32 }; // where the HUD badge sprite sits (fin tip just under the clock)
  const sprC = {};
  function badgeSpr(gold) {
    const key = gold ? 'g' : 'b'; if (sprC[key]) return sprC[key];
    const C = BCOL[key], w = BW, h = BH, part = new Uint8Array(w * h), d = new Uint32Array(w * h);
    const setP = (x, y, p) => { if (x >= 0 && y >= 0 && x < w && y < h && !part[y * w + x]) part[y * w + x] = p; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = x - BCX, dy = y - BCY; if (dx * dx + dy * dy <= BR * BR + BR * 0.6) part[y * w + x] = 1; }
    // Mudkip's head fin: convex front edge from the brow up to a tip that leans back, concave back edge
    FIN.forEach(([xl, xr], j) => { for (let x = xl; x <= xr; x++) setP(x, 2 + j, 2); });
    GILL.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') { setP(1 + i, BCY + 1 + j, 3); setP(w - 2 - i, BCY + 1 + j, 3); } });
    const pt = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? part[y * w + x] : 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = pt(x, y), i = y * w + x;
      if (!p) { if (pt(x - 1, y) || pt(x + 1, y) || pt(x, y - 1) || pt(x, y + 1)) d[i] = INK; continue; }
      if (p !== 1 && (pt(x - 1, y) === 1 || pt(x + 1, y) === 1 || pt(x, y - 1) === 1 || pt(x, y + 1) === 1)) { d[i] = INK; continue; }
      if (p === 1) {
        const dx = x - BCX, dy = y - BCY, r = Math.hypot(dx, dy), l = (-dx * 0.55 - dy * 0.8) / BR;
        let c = l > 0.5 ? C.bL : l > -0.25 ? C.b : l > -0.62 ? C.bD : C.bDD;
        if (r > BR - 1.7) c = dy + dx * 0.4 < 0 ? C.rL : C.bDD; // bevelled coin rim
        else if (r > BR - 2.7) c = dy + dx * 0.4 < 0 ? C.b : C.bD;
        d[i] = c;
      } else if (p === 2) {
        // light front edge, a darker vein along the back
        const fr = pt(x + 1, y) !== 2, bk = pt(x - 1, y) !== 2, bk2 = !bk && pt(x - 2, y) !== 2;
        d[i] = fr ? C.finL : bk || pt(x, y + 1) === 1 ? C.finD : bk2 && y > 3 ? C.bD : C.fin;
      } else d[i] = y < BCY + 3 ? C.gL : y > BCY + 3 ? C.gD : C.g;
    }
    const pp = (x, y, c) => { d[y * w + x] = c; };
    pp(BCX - 4, BCY - 5, C.hl); pp(BCX - 3, BCY - 6, C.hl); pp(BCX - 5, BCY - 4, C.hl); pp(4, 4, C.hl); pp(6, 5, C.hl);
    return (sprC[key] = { w, h, d });
  }
  // stamp a sprite scaled (nearest) so its head centre lands on (cx, cy); sx/sy may differ (coin flip)
  function blitC(fb, s, cx, cy, sx, sy = sx) {
    if (sx <= 0.05 || sy <= 0.05) return;
    const W = Math.max(1, Math.round(s.w * sx)), H = Math.max(1, Math.round(s.h * sy)), x0 = Math.round(cx - (BCX + 0.5) * sx), y0 = Math.round(cy - (BCY + 0.5) * sy);
    for (let j = 0; j < H; j++) {
      const yy = y0 + j; if (yy < 0 || yy >= fb.h) continue;
      const row = Math.min(s.h - 1, Math.floor(j / sy)) * s.w;
      for (let i = 0; i < W; i++) { const xx = x0 + i; if (xx < 0 || xx >= fb.w) continue; const c = s.d[row + Math.min(s.w - 1, Math.floor(i / sx))]; if (c) fb.d[yy * fb.w + xx] = c; }
    }
  }
  // chunky 3x5 pixel digits (block size px) with an ink outline, centred on (cx, cy)
  const DG = { 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'] };
  function digits(fb, str, cx, cy, px, col, shade) {
    str = String(str);
    const gap = Math.max(1, px >> 1), w = str.length * 3 * px + (str.length - 1) * gap, x0 = Math.round(cx - w / 2), y0 = Math.round(cy - (5 * px) / 2);
    for (let pass = 0; pass < 2; pass++) for (let n = 0; n < str.length; n++) {
      const g = DG[str[n]]; if (!g) continue;
      const gx = x0 + n * (3 * px + gap);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (g[r][c] !== '#') continue;
        const X = gx + c * px, Y = y0 + r * px;
        if (pass === 0) UI.rect(fb, X - 1, Y - 1, px + 2, px + 2, INK);
        else { UI.rect(fb, X, Y, px, px, col); if (shade && px > 1 && (r === 4 || g[r + 1][c] !== '#')) UI.hline(fb, X, X + px - 1, Y + px - 1, shade); }
      }
    }
  }
  // a four-point twinkle
  function twinkle(fb, x, y, r, c) {
    x = Math.round(x); y = Math.round(y);
    UI.put(fb, x, y, 0xffffffff);
    for (let i = 1; i <= r; i++) { const cc = i === r ? c : 0xffffffff; UI.put(fb, x - i, y, cc); UI.put(fb, x + i, y, cc); UI.put(fb, x, y - i, cc); UI.put(fb, x, y + i, cc); }
  }
  function burst(x, y, n, big) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (big ? 40 : 20) + Math.random() * (big ? 50 : 30); P.sp.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, t: 0, life: 0.45 + Math.random() * 0.45, g: 70, big: big && i % 3 === 0 }); }
    if (P.sp.length > 90) P.sp.splice(0, P.sp.length - 90);
  }
  // XP progress through a level (0..1)
  function barK(xp, lv) { if (lv >= MAXLV) return 1; const a = XP[lv], b = XP[lv + 1]; return clamp((xp - a) / (b - a), 0, 1); }
  function bar() { if (!P.bar) { const lv = level(); P.bar = { lv, shown: barK(L().xp, lv), ghost: 0, hold: 0, flash: 0, bump: 0, moving: false, spT: 0 }; } return P.bar; }
  function barUpdate(dt) {
    const B = bar(), lv = level(), xp = L().xp;
    B.flash = Math.max(0, B.flash - dt); B.bump = Math.max(0, B.bump - dt * 3);
    if (Game.mode !== 'explore') { B.moving = false; return; } // animations wait until the HUD is on screen
    if (B.lv > lv) { B.lv = lv; B.shown = barK(xp, lv); }
    // after the level-up celebration lands, the bar empties and fills with the leftover XP
    if (B.lv < lv && !P.lvUp) { B.lv = lv; B.shown = 0; B.hold = 0.2; }
    const tg = B.lv < lv ? 1 : barK(xp, B.lv);
    B.ghost = tg;
    if (B.hold > 0) { B.hold -= dt; B.moving = false; return; }
    const was = B.shown;
    B.shown = B.shown < tg ? Math.min(tg, B.shown + Math.max(0.45 * dt, (tg - B.shown) * 5 * dt)) : tg;
    B.moving = B.shown > was + 1e-6;
    const G = P.geo;
    if (B.moving && G) { B.spT += dt; while (B.spT > 0.035) { B.spT -= 0.035; P.sp.push({ x: G.x + G.w * B.shown, y: G.y + 1 + Math.random() * 4, vx: -10 + Math.random() * 40, vy: -25 - Math.random() * 45, t: 0, life: 0.35 + Math.random() * 0.4, g: 60 }); } }
    if (was < tg && B.shown >= tg && G) { burst(G.x + G.w * B.shown, G.y + 3, 8, false); B.bump = Math.max(B.bump, 0.6); try { Game.sfx('chirp', null, 0.6); } catch (e) { /* audio */ } }
    if (P.lvUp && P.lvUp.t < -0.2 && B.shown >= 0.999) P.lvUp.t = -0.2;
  }
  const BAR = ['#e8fcff', '#98ecff', '#40c8ff', '#2a96f0', '#1c64c4'].map(hx), BARG = ['#fffce0', '#fff08a', '#ffd23a', '#f4aa30', '#c87a18'].map(hx);
  const TRK = hx('#18244e'), TRK0 = hx('#0c1432'), GH0 = hx('#ffffff'), GH1 = hx('#aef0ff');
  function drawBar(fb, x, y, w, h, B, t, gold) {
    UI.rrect(fb, x, y, w, h, 2, INK);
    const ix = x + 1, iy = y + 1, iw = w - 2, ih = h - 2, seg = iw / 10;
    const fw = Math.round(iw * B.shown), gw = Math.round(iw * Math.max(B.shown, B.ghost)), cols = gold ? BARG : BAR;
    const blink = Math.floor(t * 14) % 2;
    for (let yy = 0; yy < ih; yy++) {
      const cf = cols[Math.min(4, Math.round((yy * 4) / Math.max(1, ih - 1)))], cfs = U.mix(cf, INK, 0.42), ct = yy === 0 ? TRK0 : TRK;
      for (let xx = 0; xx < iw; xx++) {
        if ((xx === 0 || xx === iw - 1) && (yy === 0 || yy === ih - 1)) continue;
        const sep = xx > 0 && Math.floor(xx / seg) !== Math.floor((xx - 1) / seg);
        const c = xx < fw ? (sep ? cfs : cf) : xx < gw ? (blink ? GH0 : GH1) : sep ? TRK0 : ct;
        fb.d[(iy + yy) * fb.w + ix + xx] = c;
      }
    }
    if (fw > 2) {
      // a slanted glint sweeps along the filled part every few seconds (and whenever XP pours in)
      const ph = B.moving ? (t * 1.6) % 1 : ((t % 3.4) / 0.9);
      if (ph < 1) { const sx = -4 + (fw + 8) * ph; for (let yy = 0; yy < ih; yy++) for (let dx = -1; dx <= 1; dx++) { const xx = Math.round(sx + dx - yy * 0.8 + ih * 0.4); if (xx >= 0 && xx < fw) UI.blend(fb, ix + xx, iy + yy, 0xffffffff, dx === 0 ? 0.8 : 0.45); } }
      // hot leading edge while filling
      if (B.moving) { UI.vline(fb, ix + fw - 1, iy, iy + ih - 1, 0xffffffff); UI.put(fb, ix + fw, iy - 1, 0xffffffff); }
    }
  }
  // row below the top bar: the level badge + XP plate, then the tracked objective
  function drawLevel(fb, t) {
    const S = UI.skin(), B = bar(), D = L(), lv = B.lv, max = lv >= MAXLV;
    const pend = B.lv < level(), gold = pend || B.flash > 0;
    const bump = B.bump > 0 ? -Math.round(Math.sin((1 - B.bump) * Math.PI) * 2) : 0;
    // plate
    const px = 26, py = HB.y + BCY - 9, pw = 96, ph = 18;
    UI.rrect(fb, px, py + 2, pw, ph, 5, 0xff0a0e1a);
    UI.panel(fb, px, py, pw, ph, { r: 5, ol: S.ink, fill: U.mix(S.btn, 0xff000000, 0.2), hi: null, sh: null });
    const a = XP[Math.min(lv, MAXLV)], b = XP[Math.min(lv + 1, MAXLV)];
    Font.draw(fb, 'EXP', px + 10, py + 3, gold ? hx('#ffe07a') : hx('#8fd4ff'), { font: 'small' });
    const num = max ? 'MAX' : Math.round(B.shown * (b - a)) + '/' + (b - a);
    Font.draw(fb, num, px + pw - 5, py + 3, B.moving || pend ? hx('#fff4b0') : WHITE, { font: 'small', align: 'right' });
    const bx = px + 8, by = py + 9, bw = pw - 13;
    P.geo = { x: bx + 1, y: by + 1, w: bw - 2 };
    drawBar(fb, bx, by, bw, 7, B, t, gold);
    // badge (the celebration badge flies in and replaces it at the end of a level-up)
    const cx = HB.x + BCX, cy = HB.y + BCY + bump;
    const flying = P.lvUp && P.lvUp.t > LVT - FLY;
    if (!flying) {
      if (gold) { const r = BR + 3 + Math.round((Math.sin(t * 10) + 1) * 1.5); UI.ring(fb, cx, cy, r, hx('#ffe07a'), 1); }
      blitC(fb, badgeSpr(gold && Math.floor(t * 8) % 2 === 0), cx, cy, 1);
      digits(fb, lv, cx + 0.5, cy + 0.5, 2, WHITE, gold ? hx('#ffd23a') : hx('#b8dcff'));
    }
    // a glint runs over the badge every few seconds
    const gp = (t % 4.2) / 0.5;
    if (gp < 1 && !flying) twinkle(fb, cx + 6, cy - 7, gp < 0.5 ? 1 : 2, hx('#bfe8ff'));
    // XP sparkles
    for (const s of P.sp) {
      const k = s.t / s.life; if (k > 0.7 && Math.floor(s.t * 24) % 2) continue;
      if (s.big && k < 0.6) twinkle(fb, s.x, s.y, 2, hx('#ffe07a')); else twinkle(fb, s.x, s.y, k < 0.4 ? 1 : 0, hx('#aef0ff'));
    }
    // floating "+XP" (newest on top)
    let fy = py + 1;
    for (let i = P.fl.length - 1; i >= 0; i--) {
      const f = P.fl[i], kk = f.t / 2.2, pop = f.t < 0.12 ? Math.round((1 - f.t / 0.12) * 3) : 0;
      if (kk > 0.8 && Math.floor(f.t * 20) % 2) { fy -= 10; continue; }
      const X = px + pw + 5, Y = fy - Math.round(kk * 6) - pop, head = '+' + f.n + ' XP', big = f.cat === 'dex' || f.cat === 'quest' || f.cat === 'area' || f.cat === 'fight';
      const hw = Font.measure(head, 'small'), rw = f.why ? Math.max(0, Math.min(230, fb.w - X - 60) - hw - 10) : 0, wt = rw > 30 ? fit(f.why, rw) : '';
      // a soft plate behind the line keeps it readable over bright scenery
      UI.rectA(fb, X - 2, Y - 1, hw + (wt ? Font.measure(wt, 'small') + 10 : 0) + 4, 9, 0xff0a0e20, 0.4 * (1 - kk));
      Font.draw(fb, head, X, Y, big ? hx('#ffe07a') : hx('#aef7ff'), { font: 'small', outline: INK });
      if (wt) { Font.draw(fb, '·', X + hw + 3, Y, hx('#8fd4ff'), { font: 'small', outline: INK }); Font.draw(fb, wt, X + hw + 8, Y, WHITE, { font: 'small', outline: INK }); }
      fy -= 10;
    }
    // tracked quest
    const q = tracked(), ty = py + ph + 4;
    P.toastY = ty;
    if (q && Game.mode === 'explore') {
      const txt = '> ' + q.title + ': ' + objective(q) + (q.area !== Game.areaId ? ' [' + areaName(q.area) + ']' : '');
      const w = Math.min(fb.w * 0.5, Font.measure(txt, 'small') + 8);
      UI.rectA(fb, 6, ty, w, 11, 0xff0a0e20, 0.45);
      Font.draw(fb, fit(txt, w - 6), 10, ty + 2, GOLD, { font: 'small' });
      HUD.btn('track', 6, ty, w, 11, () => openLog());
      P.toastY = ty + 14;
    }
    HUD.btn('lvbadge', 4, py - 4, px + pw - 4, ph + 6, () => openLog());
  }
  const toastTop = () => (Game.mode === 'explore' ? P.toastY || 62 : 34);
  function arrowTo(fb, t) {
    if (Game.mode !== 'explore' || Talk.busy() || P.lvUp) return;
    const q = tracked(), tg = target(q); if (!tg) return;
    const [ux, uy] = Talk.toUI(tg.x, tg.y);
    const W = fb.w, H = fb.h, m = 14, on = ux > m && ux < W - m && uy > 50 && uy < H - m;
    if (on) {
      if (tg.who && tg.who === Talk.giverOf(q)) return; // the giver already wears a marker
      const X = Math.round(ux), Y = Math.round(uy) - 8 + Math.round(Math.sin(t * 5) * 2);
      for (let i = 0; i < 5; i++) UI.hline(fb, X - 4 + i, X + 4 - i, Y + i, i === 0 || i === 4 ? INK : GOLD);
      UI.hline(fb, X - 5, X + 5, Y - 1, INK);
      Font.draw(fb, tg.label, X, Y - 10, GOLD, { font: 'small', align: 'center', outline: INK });
      return;
    }
    // off screen: an arrow on the edge
    const cx = W / 2, cy = H / 2, dx = ux - cx, dy = uy - cy, a = Math.atan2(dy, dx);
    const s = Math.min((W / 2 - m - 4) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m - 30) / Math.max(1e-3, Math.abs(dy)));
    const X = Math.round(cx + dx * s), Y = Math.round(cy + dy * s), ca = Math.cos(a), sa = Math.sin(a);
    const pulse = 1 + Math.round((Math.sin(t * 6) + 1) * 0.8);
    UI.disc(fb, X, Y, 8 + pulse, INK); UI.disc(fb, X, Y, 7 + pulse, 0xcc1b2240 | 0);
    for (let r = -6; r <= 6; r++) for (let w = -Math.round((6 - Math.abs(r)) * 0.7); w <= Math.round((6 - Math.abs(r)) * 0.7); w++) UI.put(fb, Math.round(X + ca * r - sa * w), Math.round(Y + sa * r + ca * w), GOLD);
    const dist = Math.round(Math.abs(tg.x - Game.mudkip.x) / 10);
    Font.draw(fb, tg.label + ' ' + dist + 'm', clamp(X - ca * 20, 30, W - 30), clamp(Y - sa * 16 - 3, 50, H - 20), GOLD, { font: 'small', align: 'center', outline: INK });
  }
  function drawClues(fb, t) {
    if (Game.mode !== 'explore' && Game.mode !== 'camera') return;
    for (const q of QS()) {
      if (q.progress !== 'clue' || q.area !== Game.areaId) continue;
      const s = st(q); if (!s || s.s !== 'active') continue;
      for (const c of clues(q)) {
        if (!c.rev || c.got) continue;
        const [x, y] = Talk.toUI(c.x, c.y);
        const X = Math.round(x), Y = Math.round(y);
        const r = 4 + Math.round((Math.sin(t * 5 + c.i) + 1) * 1.5);
        UI.ring(fb, X, Y - 2, r, GOLD, 1);
        Font.icon(fb, 'spark', X - 3, Y - 16 + Math.round(Math.sin(t * 4) * 2), 1);
      }
    }
    // scan pings
    for (const p of P.pings) {
      const [wx, wy] = p.at(); const [x, y] = Talk.toUI(wx, wy);
      const X = Math.round(x), Y = Math.round(y) - 6, k = (p.t * 1.5) % 1;
      UI.ring(fb, X, Y, 5 + Math.round(k * 10), p.col, 1);
      if (p.t < p.life - 0.5 || Math.floor(p.t * 12) % 2) Font.draw(fb, p.label, X, Y - 20, p.col, { font: 'small', align: 'center', outline: INK });
    }
  }
  /* ---------- the level-up celebration ---------- */
  const LVT = 3.6, FLIP = 0.55, FLY = 0.55; // total length, when the badge flips to the new level, flight back to the HUD
  let lvFb = null;
  // where the big badge is right now: { x, y, s }
  function lvPos() {
    const U0 = P.lvUp, fb = lvFb; if (!U0 || !fb) return null;
    const k = Math.max(0, U0.t), sc = fb.h >= 250 ? 3 : 2;
    const X = Math.round(fb.w / 2), Y = Math.round(sc === 3 ? fb.h * 0.33 : fb.h * 0.34);
    let s = sc * U.ease.outBack(Math.min(1, k / 0.42)), x = X, y = Y;
    if (k > LVT - FLY) { const e = U.ease.inCubic(Math.min(1, (k - (LVT - FLY)) / FLY)); x = X + (HB.x + BCX - X) * e; y = Y + (HB.y + BCY - Y) * e; s = sc + (1 - sc) * e; }
    return { x, y, s, sc, X, Y };
  }
  const RAY = hx('#fff2a0'), GOLDT = hx('#ffe070'), GOLDD = hx('#c87a18');
  function drawLevelUp(fb, t) {
    lvFb = fb;
    const U0 = P.lvUp, k = U0.t; if (k < 0) return;
    const W = fb.w, H = fb.h, c = lvPos(), sc = c.sc, fly = k > LVT - FLY, fade = fly ? 1 - (k - (LVT - FLY)) / FLY : 1;
    // flash
    if (k < 0.25) UI.rectA(fb, 0, 0, W, H, 0xffffffff, 0.45 * (1 - k / 0.25));
    // sunburst rays behind the badge
    if (!fly) {
      const R = Math.round(U.ease.outCubic(Math.min(1, k / 0.5)) * (34 + 16 * sc)), rot = k * 0.7, al = k > LVT - FLY - 0.4 ? (LVT - FLY - k) / 0.4 : 1;
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x, y); if (d > R || d < 4) continue;
        const a = Math.atan2(y, x) + rot, w = Math.cos(a * 6);
        if (w < 0.55) continue;
        const kk = (1 - d / R) * 0.9 * al * (w - 0.55) / 0.45 + 0.08;
        if (kk > 0.1) { const X = c.X + x, Y = c.Y + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const i = Y * W + X, v = fb.d[i], al = Math.min(0.7, kk * 0.8); fb.d[i] = v ? U.mix(v, RAY, al) : (((Math.round(al * 255) << 24) | (RAY & 0xffffff)) >>> 0); }
      }
    }
    // shockwave rings when the badge flips
    if (k > FLIP && k < FLIP + 0.6) { const e = (k - FLIP) / 0.6, r = Math.round(8 * sc + e * 40 * sc); UI.ring(fb, c.X, c.Y, r, 0xffffffff, 2); if (r > 8) UI.ring(fb, c.X, c.Y, r - 5, GOLDT, 1); }
    // the badge: pops in, flips like a coin to the new number, then flies back into the HUD
    let sx = c.s, num = U0.from || U0.lv - 1, gold = false;
    if (k > FLIP - 0.12 && k < FLIP + 0.12) { const e = (k - (FLIP - 0.12)) / 0.24; sx = c.s * Math.abs(Math.cos(e * Math.PI)); }
    if (k >= FLIP) { num = U0.lv; gold = !fly; }
    // orbiting twinkles
    if (!fly && k > 0.2) for (let i = 0; i < 8; i++) { const a = t * 2.2 + (i * Math.PI) / 4, rr = (BR + 7) * c.s; twinkle(fb, c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr * 0.9, (i + Math.floor(t * 6)) % 3 === 0 ? 2 : 1, GOLDT); }
    blitC(fb, badgeSpr(gold), c.x, c.y, sx, c.s);
    if (sx > c.s * 0.55 && c.s > 0.6) digits(fb, num, c.x + 0.5, c.y + 0.5, Math.max(1, Math.round(2 * c.s)), WHITE, gold ? hx('#ffd23a') : hx('#b8dcff'));
    // flying stars
    for (const s of P.stars) {
      const kk = s.t / s.life; if (kk > 0.75 && Math.floor(s.t * 20) % 2) continue;
      if (s.big) Font.icon(fb, 'star', Math.round(s.x) - 3, Math.round(s.y) - 3, 1); else twinkle(fb, s.x, s.y, 2, GOLDT);
    }
    if (fade <= 0) return;
    // "LEVEL UP!" drops in letter by letter, then waves
    const ty = Math.round(c.Y + (BH - BCY) * sc + 6), txt = 'LEVEL UP!';
    if (k > FLIP && !fly) {
      const ws = [...txt].map((ch) => Font.measure(ch === ' ' ? 'I' : ch, 'title') + 1), tw = ws.reduce((s, v) => s + v, 0);
      let x = Math.round(W / 2 - tw / 2);
      [...txt].forEach((ch, i) => {
        const t0 = FLIP + i * 0.045, e = Math.min(1, Math.max(0, (k - t0) / 0.3));
        if (e > 0 && ch !== ' ') {
          const y = ty - Math.round((1 - U.ease.outBack(e)) * 16) + Math.round(Math.sin(t * 7 - i * 0.7) * 1.5 * Math.min(1, (k - t0) / 0.6));
          Font.draw(fb, ch, x, y + 1, GOLDD, { font: 'title', outline: INK });
          Font.draw(fb, ch, x, y, (Math.floor(t * 8) + i) % 9 === 0 ? 0xffffffff : GOLDT, { font: 'title' });
        }
        x += ws[i];
      });
      if (k > FLIP + 0.5 && (k > FLIP + 0.8 || Math.floor(k * 20) % 2)) {
        Font.draw(fb, 'Mudkip reached Lv ' + U0.lv + '!', W / 2, ty + 20, WHITE, { font: 'body', align: 'center', outline: INK });
        const nf = FEATS.filter((f) => f.lv === U0.lv).map((f) => f.name);
        if (nf.length) Font.draw(fb, '{new} ' + nf.join(' + '), W / 2, ty + 34, hx('#aef7ff'), { font: 'small', align: 'center', outline: INK });
      }
    }
  }
  function drawCards(fb, t) {
    const W = fb.w;
    lvFb = fb;
    if (P.lvUp) { if (P.lvUp.t >= 0) drawLevelUp(fb, t); return; }
    const c = P.cards[0]; if (!c) return;
    const k = c.t, e = Math.min(1, k / 0.3), out = k > 3.4 ? (k - 3.4) / 0.4 : 0;
    const f = c.f, w = Math.max(Font.measure('NEW: ' + f.name, 'body'), Font.measure(f.desc, 'small')) + 24, h = 32;
    const x = Math.round(W / 2 - w / 2), y = Math.round(66 - (1 - U.ease.outBack(e)) * 50 - out * 60);
    UI.rrect(fb, x, y + 2, w, h, 6, 0xff0a0e1a); UI.rrect(fb, x, y, w, h, 6, INK); UI.rrect(fb, x + 1, y + 1, w - 2, h - 2, 5, 0xfff4f6fb);
    UI.rect(fb, x + 4, y + 4, 3, h - 8, 0xffff3a4a);
    Font.draw(fb, '{new} ' + f.name, x + 12, y + 5, INK, { font: 'body' });
    Font.draw(fb, f.desc, x + 12, y + 20, 0xff5a6080, { font: 'small' });
  }
  { const b0 = Talk.drawBubbles; Talk.drawBubbles = function (fb, t) { const r = b0.call(this, fb, t); try { drawClues(fb, t); if (Game.mode === 'explore' && !(typeof Arcade !== 'undefined' && Arcade.live)) { drawLevel(fb, t); arrowTo(fb, t); } } catch (e) { console.error(e); } return r; }; }
  { const d0 = Talk.drawDialog; Talk.drawDialog = function (fb, t) { const r = d0.call(this, fb, t); try { if (P.log) drawLog(fb, t); else if (!Talk.dlg && !(typeof Cards !== 'undefined' && Cards.live && !(P.lvUp && P.lvUp.t >= 0))) drawCards(fb, t); } catch (e) { console.error(e); } return r; }; }

  /* ---------- world map markers ---------- */
  { const w0 = WorldMap.draw; WorldMap.draw = function (fb, t) {
    const r = w0.call(this, fb, t);
    try {
      const tq = tracked();
      for (const id in WorldMap.LOC) {
        const b = HUD.btns.find((x) => x.id === 'pin-' + id); if (!b) continue;
        const qq = QS().filter((q) => q.area === id);
        // only jobs the player has accepted get a pin
        const rd = qq.some((q) => status(q) === 'ready'), ac = qq.some((q) => status(q) === 'active');
        if (!rd && !ac) continue;
        const X = b.x + b.w + 5, Y = b.y + 7, isT = tq && tq.area === id;
        if (isT) UI.ring(fb, X, Y, 7 + Math.round(Math.sin(t * 5)), GOLD, 1);
        UI.disc(fb, X, Y, 5, INK); UI.disc(fb, X, Y, 4, rd ? 0xff30d8ff : 0xff4a5470);
        if (rd) Font.icon(fb, 'star', X - 3, Y - 3, 1); else Font.draw(fb, '?', X, Y - 3, WHITE, { font: 'small', align: 'center' });
      }
      if (tq && !WorldMap.travel) Font.draw(fb, 'Tracked: ' + tq.title + ' — ' + areaName(tq.area), fb.w / 2, 24, GOLD, { font: 'small', align: 'center', outline: INK });
    } catch (e) { console.error(e); }
    return r;
  }; }

  /* ---------- quest log ---------- */
  function openLog() {
    if (Game.mode !== 'explore' || Talk.dlg) return;
    P.log = { tab: 'active', sel: 0, scroll: 0, rects: [], t: 0 };
    if (Game.mudkip) { Game.mudkip.stop && Game.mudkip.stop(); Game.mudkip.keyDir = 0; }
    Game.sfx('page');
  }
  function closeLog() { P.log = null; Game.sfx('back', null, 0.6); }
  function logList() { const e = entries(); if (P.log.tab === 'exp') return []; return P.log.tab === 'done' ? e.filter((x) => x.s === 'done') : e.filter((x) => x.s !== 'done'); }
  function trackSel() {
    const l = logList(), e = l[P.log.sel]; if (!e || e.q.birch || e.s === 'done') return;
    L().track = L().track === e.q.id ? null : e.q.id; Save.save(); Game.sfx('select');
    HUD.toast(L().track ? 'Tracking: ' + e.q.title : 'Tracking: automatic', { life: 1.8, col: GOLD });
  }
  const STC = { ready: [0xff30d8ff, 'Ready!'], active: [0xffffd23a, 'In progress'], avail: [0xff2ac8ff, 'New'], lvl: [0xff8a90a8, 'Locked'], done: [0xff5ad07a, 'Done'] };
  function drawLog(fb, t) {
    const G = P.log; G.t += 1 / 60; G.rects = [];
    const S = UI.skin(), W = Math.min(fb.w - 12, 460), H = Math.min(fb.h - 12, 260), x = Math.round((fb.w - W) / 2), y = Math.round((fb.h - H) / 2);
    UI.rectA(fb, 0, 0, fb.w, fb.h, 0xff0a0e20, 0.45);
    UI.rrect(fb, x, y + 3, W, H, 8, 0xff0a0e1a);
    UI.body(fb, x, y, W, H, S, { r: 8 });
    Font.draw(fb, 'QUEST LOG', x + 10, y + 7, WHITE, { font: 'title', outline: INK });
    // level summary
    const lv = level();
    Font.draw(fb, 'Mudkip Lv ' + lv + '  ·  ' + L().xp + ' XP' + (lv < MAXLV ? '  (next: ' + XP[lv + 1] + ')' : ''), x + W - 30, y + 9, WHITE, { font: 'small', align: 'right', outline: INK });
    UI.panel(fb, x + W - 22, y + 5, 16, 14, { r: 3, ol: S.ink, fill: S.btn }); Font.icon(fb, 'cross', x + W - 17, y + 9, 1);
    G.rects.push({ x: x + W - 24, y: y + 3, w: 20, h: 18, fn: closeLog });
    // tabs
    const all = entries(), nA = all.filter((e) => e.s !== 'done').length, nD = all.length - nA;
    [['active', 'Active (' + nA + ')'], ['done', 'Done (' + nD + ')'], ['exp', 'EXP & Levels']].forEach(([id, lab], i) => {
      const tx = x + 10 + i * 78, on = G.tab === id;
      UI.panel(fb, tx, y + 24, 74, 14, { r: 3, ol: S.ink, fill: on ? S.accent : S.btn });
      Font.draw(fb, lab, tx + 37, y + 27, WHITE, { font: 'small', align: 'center' });
      G.rects.push({ x: tx, y: y + 24, w: 74, h: 14, fn: () => { G.tab = id; G.sel = 0; G.scroll = 0; Game.sfx('page', null, 0.5); } });
    });
    if (G.tab === 'exp') { drawExp(fb, x, y, W, H, S); return; }
    // list (left)
    const lx = x + 8, ly = y + 42, lw = Math.min(170, Math.round(W * 0.4)), lh = H - 50;
    UI.screen(fb, lx, ly, lw, lh, { fill: 0xfffbfaf4, rim: S.ink, glare: false });
    const list = logList(), rowH = 20, vis = Math.floor((lh - 4) / rowH);
    G.sel = clamp(G.sel, 0, Math.max(0, list.length - 1));
    if (G.sel < G.scroll) G.scroll = G.sel; if (G.sel >= G.scroll + vis) G.scroll = G.sel - vis + 1;
    const tr = tracked();
    list.slice(G.scroll, G.scroll + vis).forEach((e, j) => {
      const i = j + G.scroll, ry = ly + 2 + j * rowH, sel = i === G.sel, [col, lab] = STC[e.s];
      if (sel) UI.rrect(fb, lx + 2, ry, lw - 4, rowH - 2, 3, 0xffd8e8ff);
      UI.disc(fb, lx + 9, ry + 8, 4, INK); UI.disc(fb, lx + 9, ry + 8, 3, col);
      Font.draw(fb, fit((tr && tr.id === e.q.id ? '> ' : '') + e.q.title, lw - 20), lx + 16, ry + 2, INK, { font: 'small' });
      Font.draw(fb, fit((e.q.birch ? 'Prof. Birch' : nm(e.q.giver) + ' · ' + areaName(e.q.area)) + ' · ' + lab, lw - 20), lx + 16, ry + 10, 0xff6a7090, { font: 'small' });
      G.rects.push({ x: lx, y: ry, w: lw, h: rowH, fn: () => { if (G.sel === i) trackSel(); else { G.sel = i; Game.sfx('blip', null, 0.4); } } });
    });
    if (!list.length) {
      if (G.tab === 'done') Font.draw(fb, 'Nothing finished yet.', lx + lw / 2, ly + 20, 0xff6a7090, { font: 'small', align: 'center' });
      else Font.draw(fb, 'No quests yet. Talk to Pokémon with a ! over their head to take on a job.', lx + 8, ly + 14, 0xff6a7090, { font: 'small', maxW: lw - 16, lh: 9 });
    }
    if (list.length > vis) Font.draw(fb, (G.scroll + 1) + '-' + Math.min(list.length, G.scroll + vis) + ' of ' + list.length, lx + lw / 2, ly + lh - 9, 0xff6a7090, { font: 'small', align: 'center' });
    // details (right)
    const dx = lx + lw + 6, dw = x + W - 8 - dx;
    UI.screen(fb, dx, ly, dw, lh, { fill: 0xfffbfaf4, rim: S.ink, glare: false });
    const e = list[G.sel]; if (!e) return;
    const q = e.q, [col, lab] = STC[e.s];
    let yy = ly + 5;
    Font.draw(fb, fit(q.title, dw - 12, 'body'), dx + 6, yy, INK, { font: 'body' }); yy += 14;
    UI.rrect(fb, dx + 6, yy, Font.measure(lab, 'small') + 8, 10, 3, col); Font.draw(fb, lab, dx + 10, yy + 2, WHITE, { font: 'small' });
    Font.draw(fb, q.birch ? 'From Professor Birch' : 'From ' + nm(q.giver) + ' in ' + areaName(q.area), dx + 14 + Font.measure(lab, 'small'), yy + 2, 0xff5a6080, { font: 'small' }); yy += 15;
    const line = (head, txt, c = INK) => { Font.draw(fb, head, dx + 6, yy, 0xff3a78e8, { font: 'small' }); yy += 9; const ls = Font.wrap(star(txt), 'small', dw - 16); ls.slice(0, 3).forEach((l) => { Font.draw(fb, l, dx + 10, yy, c, { font: 'small' }); yy += 9; }); yy += 3; };
    if (q.birch) {
      line('Objective', q.birch.t);
      if (e.s !== 'done') line('Hint', q.birch.hint);
      line('Reward', rewardLabel(q.birch.reward) + ' + 50 XP');
      return;
    }
    line('Objective', objective(q));
    if (typeof Bosses !== 'undefined' && Bosses.recLv) { const rl = Bosses.recLv(q.area), pk = typeof Punks !== 'undefined' ? Punks.tally(q.area) : null; line(areaName(q.area), 'Recommended Lv ' + rl + (level() < rl ? ' (you are Lv ' + level() + ')' : ' {check}') + (pk ? '  ·  Road fights ' + pk.won + '/' + pk.n : ''), level() < rl ? 0xffc03030 : INK); }
    if (e.s !== 'done') { const s = st(q); const hint = s ? (q.wait && q.wait[0] ? q.wait[0].replace(/\{have\}/g, s.n || 0).replace(/\{left\}/g, Math.max(0, (q.n || 1) - (s.n || 0))) : '') : q.intro[q.intro.length - 1]; if (hint) line('Hint', String(hint).replace(/\{[a-z]+\}/g, '')); }
    line('Reward', rewardLabel(q.reward) + ' + ' + questXP(q) + ' XP' + (q.unlock ? ' + a flight to ' + areaName(q.unlock) : ''));
    const dl = dexOf(q);
    if (dl.length) {
      Font.draw(fb, 'Helps the Pokédex', dx + 6, yy, 0xff3a78e8, { font: 'small' }); yy += 10;
      let xx = dx + 10;
      for (const k of dl) {
        const seen = !!Save.data.seen[k], lbl = (seen ? '{check}' : '?') + (seen ? nm(k) : '???');
        const w = Font.measure(lbl, 'small') + 6;
        if (xx + w > dx + dw - 4) { xx = dx + 10; yy += 11; }
        UI.rrect(fb, xx, yy - 1, w, 10, 3, seen ? 0xffcff0d8 : 0xffe4e6ee);
        Font.draw(fb, lbl, xx + 3, yy + 1, INK, { font: 'small' });
        xx += w + 3;
      }
      yy += 14;
    }
    if (e.s !== 'done') {
      const isT = tr && tr.id === q.id && L().track === q.id, bl = isT ? 'Untrack' : 'Track', bw = Font.measure(bl, 'small') + 16, bx = dx + dw - bw - 6, by = ly + lh - 18;
      UI.panel(fb, bx, by, bw, 14, { r: 3, ol: S.ink, fill: S.accent });
      Font.draw(fb, bl, bx + bw / 2, by + 3, WHITE, { font: 'small', align: 'center' });
      G.rects.push({ x: bx, y: by, w: bw, h: 14, fn: trackSel });
      Font.draw(fb, 'L / Esc: close', dx + 6, by + 3, 0xff8a90a8, { font: 'small' });
    }
  }
  // the EXP page: level, what the next levels unlock, and XP by source
  function drawExp(fb, x, y, W, H, S) {
    const D = L(), lv = level(), xp = D.xp, ly = y + 42, lh = H - 50, lw = Math.min(200, Math.round(W * 0.46)), lx = x + 8;
    const DIM = hx('#6a7090'), BLUE = hx('#e8783a');
    UI.screen(fb, lx, ly, lw, lh, { fill: 0xfffbfaf4, rim: S.ink, glare: false });
    let yy = ly + 5;
    Font.draw(fb, 'Mudkip Lv ' + lv, lx + 6, yy, INK, { font: 'body' }); yy += 14;
    const a = XP[Math.min(lv, MAXLV)], b = XP[Math.min(lv + 1, MAXLV)], k = lv >= MAXLV ? 1 : clamp((xp - a) / (b - a), 0, 1), bw = lw - 12;
    UI.rrect(fb, lx + 6, yy, bw, 7, 3, INK); UI.rect(fb, lx + 7, yy + 1, bw - 2, 5, hx('#d8deea'));
    if (k > 0) UI.rect(fb, lx + 7, yy + 1, Math.max(1, Math.round((bw - 2) * k)), 5, hx('#30a8f0'));
    yy += 10;
    Font.draw(fb, lv >= MAXLV ? xp + ' XP · max level!' : (xp - a) + ' / ' + (b - a) + ' XP  ·  ' + (b - xp) + ' to Lv ' + (lv + 1), lx + 6, yy, DIM, { font: 'small' }); yy += 13;
    // the next unlocks
    Font.draw(fb, 'Coming up', lx + 6, yy, BLUE, { font: 'small' }); yy += 10;
    const up = FEATS.filter((f) => !has(f.id)).slice(0, 2);
    if (!up.length) { Font.draw(fb, '{check} Every feature unlocked', lx + 10, yy, INK, { font: 'small' }); yy += 9; }
    for (const f of up) { Font.draw(fb, fit('Lv ' + f.lv + ': ' + f.name, lw - 16), lx + 10, yy, INK, { font: 'small' }); yy += 9; }
    yy += 4;
    if (typeof Bosses !== 'undefined' && Bosses.REC) {
      Font.draw(fb, 'Recommended levels', lx + 6, yy, BLUE, { font: 'small' }); yy += 10;
      const ar = ['beach', 'forest', 'canopy', 'falls', 'volcano', 'shoal'].filter((id) => Bosses.REC[id]);
      ar.forEach((id) => {
        const r = Bosses.REC[id], ok = lv >= r, un = Save.unlocked(id), here = Game.areaId === id;
        if (yy > ly + lh - 10) return;
        Font.draw(fb, fit((ok ? '{check} ' : un ? '' : '{lock} ') + areaName(id) + (here ? ' (here)' : ''), lw - 50), lx + 10, yy, ok ? hx('#2a8a4a') : un ? hx('#c03030') : hx('#6a7090'), { font: 'small' });
        Font.draw(fb, 'Lv ' + r, lx + lw - 8, yy, ok ? hx('#2a8a4a') : un ? hx('#c03030') : hx('#6a7090'), { font: 'small', align: 'right' });
        yy += 9;
      });
    }
    // XP by source (right)
    const dx = lx + lw + 6, dw = x + W - 8 - dx;
    UI.screen(fb, dx, ly, dw, lh, { fill: 0xfffbfaf4, rim: S.ink, glare: false });
    yy = ly + 5;
    Font.draw(fb, 'XP by source', dx + 6, yy, INK, { font: 'body' });
    Font.draw(fb, 'all · today', dx + dw - 6, yy + 3, DIM, { font: 'small', align: 'right' }); yy += 15;
    const rows = Object.keys(SRC).map((id) => [id, D.src[id] || 0, SES.src[id] || 0]).filter((r) => r[1] > 0 || r[2] > 0).sort((p, q) => q[1] - p[1]);
    const known = rows.reduce((t, r) => t + r[1], 0), max = Math.max(1, ...rows.map((r) => r[1]));
    if (xp - known > 0) rows.push(['early', xp - known, 0]);
    if (!rows.length) Font.draw(fb, 'No XP yet: snap a new Pokémon!', dx + 6, yy, DIM, { font: 'small' });
    const nmW = Math.min(140, Math.round(dw * 0.52)), barX = dx + 6 + nmW, barW = Math.max(10, dw - nmW - 70);
    for (const [id, all, ses] of rows) {
      if (yy > ly + lh - 32) break;
      Font.draw(fb, fit(id === 'early' ? 'Earlier progress' : SRC[id], nmW - 4), dx + 6, yy, INK, { font: 'small' });
      UI.rect(fb, barX, yy + 2, barW, 4, hx('#e4e6ee')); UI.rect(fb, barX, yy + 2, Math.max(1, Math.round(barW * Math.min(1, all / max))), 4, id === 'fight' ? hx('#f05a3a') : id === 'dex' || id === 'quest' ? hx('#ffb21a') : hx('#30a8f0'));
      Font.draw(fb, String(all), dx + dw - 30, yy, INK, { font: 'small', align: 'right' });
      Font.draw(fb, ses ? '+' + ses : '-', dx + dw - 6, yy, ses ? hx('#2a8a4a') : DIM, { font: 'small', align: 'right' });
      yy += 10;
    }
    const mins = Math.max(1, Math.round((Date.now() - SES.t0) / 60000));
    const by = ly + lh - 22;
    UI.rect(fb, dx + 6, by - 3, dw - 12, 1, hx('#d8deea'));
    Font.draw(fb, fit('This session: +' + SES.xp + ' XP in ' + mins + ' min' + (lv > SES.lv0 ? ' · +' + (lv - SES.lv0) + ' Lv' : '') + (SES.best >= 2 ? ' · best streak x' + SES.best : ''), dw - 12), dx + 6, by, INK, { font: 'small' });
    Font.draw(fb, fit('New finds pay most. Repeats pay less.', dw - 12), dx + 6, by + 9, DIM, { font: 'small' });
  }
  { const d0 = Talk.down; Talk.down = function (ux, uy) {
    if (P.log) { const G = P.log; for (let i = G.rects.length - 1; i >= 0; i--) { const r = G.rects[i]; if (ux >= r.x && uy >= r.y && ux < r.x + r.w && uy < r.y + r.h) { r.fn(); return true; } } return true; }
    return d0.call(this, ux, uy);
  }; }
  { const k0 = Talk.key; Talk.key = function (k, e) {
    if (P.log) {
      const G = P.log, n = logList().length;
      if (k === 'Escape' || k === 'l') closeLog();
      else if (k === 'ArrowDown' || k === 's') { G.sel = Math.min(n - 1, G.sel + 1); Game.sfx('blip', null, 0.4); }
      else if (k === 'ArrowUp' || k === 'w') { G.sel = Math.max(0, G.sel - 1); Game.sfx('blip', null, 0.4); }
      else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd' || k === 'Tab') { const T = ['active', 'done', 'exp'], d = k === 'ArrowLeft' || k === 'a' ? 2 : 1; G.tab = T[(T.indexOf(G.tab) + d) % 3]; G.sel = 0; G.scroll = 0; Game.sfx('page', null, 0.5); }
      else if (k === 'x') { G.tab = 'exp'; }
      else if (k === 'Enter' || k === ' ' || k === 't') trackSel();
      return true;
    }
    if (k === 'l' && !Talk.dlg && Game.mode === 'explore') { openLog(); return true; }
    return k0.call(this, k, e);
  }; }
  { const b0 = Talk.busy; Talk.busy = function () { return !!P.log || b0.call(this); }; }
  if (typeof U.on === 'function') U.on('area', () => { P.pings.length = 0; P.sp.length = 0; if (P.log) P.log = null; });

  /* ---------- Rotom Dex: Progress page ---------- */
  function dexPage(fb, S, Lp, R, slide, t, X) {
    const list = DexData.ORDER.filter((k) => !DexData.S[k].player);
    const seen = list.filter((k) => Save.data.seen[k]).length;
    let bt = 0, bg = 0; for (const k of list) { bt += Object.keys(DexData.S[k].beh).length; bg += Object.keys(Save.data.beh[k] || {}).length; }
    const pct = Math.round(((seen / list.length) * 0.6 + (bg / Math.max(1, bt)) * 0.4) * 100);
    const txt = S.screenText, dim = U.mix(S.screenText, S.screen, 0.4);
    if (Lp) {
      Font.draw(fb, 'Completion', Lp.x + 6 + slide, Lp.y + 6, txt, { font: 'title' });
      Font.draw(fb, pct + '%', Lp.x + 6 + slide, Lp.y + 22, txt, { font: 'title', sc: 2 });
      const bw = Lp.w - 12;
      UI.rect(fb, Lp.x + 6, Lp.y + 56, bw, 5, S.screenD); UI.rect(fb, Lp.x + 6, Lp.y + 56, Math.round(bw * pct / 100), 5, S.accent);
      Font.draw(fb, 'Registered ' + seen + ' / ' + list.length, Lp.x + 6, Lp.y + 66, txt, { font: 'small' });
      Font.draw(fb, 'Behaviours ' + bg + ' / ' + bt, Lp.x + 6, Lp.y + 76, txt, { font: 'small' });
      Font.draw(fb, 'Mudkip Lv ' + level() + ' · ' + L().xp + ' XP', Lp.x + 6, Lp.y + 90, txt, { font: 'small' });
      const nxt = FEATS.find((f) => !has(f.id));
      if (nxt) Font.draw(fb, 'Next unlock: ' + nxt.name + ' (Lv ' + nxt.lv + ')', Lp.x + 6, Lp.y + 100, dim, { font: 'small', maxW: Lp.w - 12 });
      const q = tracked(); if (q) Font.draw(fb, 'Quest: ' + q.title + ' — ' + objective(q), Lp.x + 6, Lp.y + 114, dim, { font: 'small', maxW: Lp.w - 12, lh: 9 });
    }
    X.areas.prog = { x: R.x, y: R.y, w: R.w, h: R.h };
    const ids = Object.keys(DexData.AREAS);
    X.clipTo(fb, R, (b) => {
      let y = R.y + 4 - (X.D.scroll.prog || 0);
      if (!Lp) { Font.draw(b, 'Pokédex ' + pct + '% · Lv ' + level(), R.x + 6 + slide, y, txt, { font: 'body' }); y += 16; }
      for (const id of ids) {
        const sp = list.filter((k) => (DexData.S[k].area || []).includes(id)); if (!sp.length) continue;
        const un = Save.unlocked(id), got = sp.filter((k) => Save.data.seen[k]), miss = sp.filter((k) => !Save.data.seen[k]);
        const hh = un && miss.length ? 32 + Math.min(2, miss.length) * 9 : 24;
        UI.rrect(b, R.x + 3 + slide, y, R.w - 8, hh - 3, 3, U.mix(S.screen, 0xffffffff, un ? 0.3 : 0.05));
        Font.draw(b, (un ? '' : '{lock} ') + areaName(id), R.x + 8 + slide, y + 3, txt, { font: 'small' });
        const k = got.length / sp.length, bw = 50, bx = R.x + R.w - bw - 34;
        UI.rect(b, bx, y + 5, bw, 4, S.screenD); UI.rect(b, bx, y + 5, Math.round(bw * k), 4, k >= 1 ? 0xff4ad8ff : S.accent);
        Font.draw(b, got.length + '/' + sp.length, R.x + R.w - 8, y + 3, txt, { font: 'small', align: 'right' });
        if (!un) Font.draw(b, fit('Not visited yet: follow the quests to get there.', R.w - 20), R.x + 12 + slide, y + 12, dim, { font: 'small' });
        else if (!miss.length) Font.draw(b, '{check} Every Pokémon here registered!', R.x + 12 + slide, y + 12, dim, { font: 'small' });
        else {
          Font.draw(b, miss.length + ' left to discover:', R.x + 12 + slide, y + 12, dim, { font: 'small' });
          miss.slice(0, 2).forEach((m, i) => { const d = DexData.S[m], h = Object.values(d.beh)[0]; Font.draw(b, fit('? ' + (h ? h.hint : 'Keep exploring.'), R.w - 26), R.x + 14 + slide, y + 21 + i * 9, txt, { font: 'small' }); });
        }
        y += hh;
      }
      X.D.progH = y + (X.D.scroll.prog || 0) - R.y;
    });
    X.D.scroll.prog = clamp(X.D.scroll.prog || 0, 0, Math.max(0, (X.D.progH || 0) - R.h + 8));
  }

  return Object.assign(P, { SES, SRC, TIER, questXP, drawExp, badgeSpr, has, hudOk, level, gain, award, FEATS, XP, openLog, closeLog, logBadge, icon, toastTop, dexPage, objective, status, tracked, entries, onScan });
})();
