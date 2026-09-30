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
  const P = { all: qs.get('unlock') === 'all', ready: false, pollT: 0, fl: [], cards: [], lvUp: null, pings: [], log: null, noFlagT: 0, scanHit: 0, deepT: 0 };
  // XP needed to reach each level (index = level)
  const XP = [0, 0, 100, 260, 480, 760, 1100, 1500, 1960, 2480, 3060, 3700, 4400, 5160, 5980, 6860, 7800, 8800, 9900, 11100, 12400];
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

  /* ---------- save data ---------- */
  function L() {
    const d = Save.data;
    if (!d.lv) d.lv = { xp: 0, got: {}, feat: {}, track: null, init: 0 };
    return d.lv;
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
  function gain(n, why, silent) {
    const D = L(), l0 = levelOf(D.xp);
    D.xp += n; Save.save();
    if (silent) return;
    P.fl.push({ t: 0, text: '+' + n + ' XP' + (why ? ' ' + why : '') });
    if (P.fl.length > 4) P.fl.shift();
    const l1 = levelOf(D.xp);
    if (l1 > l0) levelUp(l1);
  }
  function award(key, n, why, silent) { const D = L(); if (D.got[key]) return false; D.got[key] = 1; gain(n, why, silent); return true; }
  function levelUp(l) {
    P.lvUp = { t: 0, lv: l };
    try { Game.sfx('reward'); if (SFX.unlock) SFX.unlock(); } catch (e) { /* audio */ }
    const mk = Game.mudkip; if (mk && typeof FX !== 'undefined' && FX.confetti) FX.confetti(mk.x, mk.y - 24, 50);
    if (mk && mk.emote) mk.emote('heart', 1.5);
    checkFeats();
  }
  function checkFeats(silent) {
    const D = L();
    for (const f of FEATS) if (!D.feat[f.id] && (levelOf(D.xp) >= f.lv || (f.flag && f.flag()))) { D.feat[f.id] = 1; Save.save(); if (!silent && !P.all) P.cards.push({ t: 0, f }); }
  }
  // the whole journal, scanned for things worth XP (keys make each count once)
  function poll(silent) {
    const d = Save.data;
    for (const sp in d.seen) if (DexData.S[sp]) award('sp.' + sp, 60, 'New Pokédex entry: ' + nm(sp), silent);
    for (const sp in d.beh) for (const b in d.beh[sp]) award('bh.' + sp + '.' + b, 12, '', silent);
    for (const id in d.obj) award('ob.' + id, 30, 'Photo objective', silent);
    for (const id in d.quests) award('rq.' + id, 50, 'Request', silent);
    const tq = d.tq || {};
    for (const id in tq) if (tq[id].s === 'done') { const q = Talk.QUESTS.find((x) => x.id === id); award('tq.' + id, 100 + ((q && q.xp) || 0), 'Quest: ' + (q ? q.title : id), silent); }
    for (const id in d.disc) award('dc.' + id, 15, '', silent);
    for (const id in d.tms || {}) award('tm.' + id, 40, 'New move', silent);
    const st = d.stats || {};
    for (let i = 1; i <= Math.min(20, st.sumo || 0); i++) award('sumo.' + i, 40, 'Sumo win', silent);
    for (let i = 1; i <= Math.min(10, Math.floor((st.rope || 0) / 5)); i++) award('rope.' + i, 20, 'Jump rope', silent);
    if (st.regi) award('regi', 150, 'Ancient puzzle', silent);
    for (const a in d.areas) if (a !== 'beach') award('ar.' + a, 50, 'New area', silent);
    censusTick();
    checkFeats(silent);
  }
  function init() {
    if (P.ready) return;
    P.ready = true;
    const D = L();
    // existing journals: count everything already done, silently (grants a sensible level)
    if (!D.init) { poll(true); D.init = 1; checkFeats(true); Save.save(); }
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
  { const r0 = Save.recordPhoto; Save.recordPhoto = function (r) { const out = r0.call(this, r); try { if (r && r.species && out.improved) gain(Math.max(2, (r.stars || 0) * 5 + (r.medal || 0) * 4), 'photo'); } catch (e) { console.error(e); } return out; }; }
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
  // Birch's requests show up as quests too
  const birch = () => { let open = 0; return (Quests.BIRCH || []).filter((b) => Save.data.quests[b.id] || open++ < 2).map((b) => ({ id: b.id, birch: b, title: star(b.t), giver: 'birch', area: null })); };
  function entries() {
    const out = [];
    for (const q of QS()) { const s = status(q); if (s !== 'hidden') out.push({ q, s }); }
    for (const b of birch()) out.push({ q: b, s: Save.data.quests[b.id] ? 'done' : 'active' });
    const ord = { ready: 0, active: 1, avail: 2, lvl: 3, done: 4 }, rk = (e) => ord[e.s] + (e.q.birch ? 0.5 : 0);
    const tr = L().track;
    out.sort((a, b) => (a.q.id === tr ? -1 : b.q.id === tr ? 1 : 0) || rk(a) - rk(b) || (a.q.area === Game.areaId ? -1 : 0) - (b.q.area === Game.areaId ? -1 : 0));
    return out;
  }
  function tracked() {
    const tr = L().track;
    let q = tr && QS().find((x) => x.id === tr);
    if (q && status(q) !== 'done' && status(q) !== 'hidden') return q;
    // automatic: the nearest job in this area (ready > active > available), then anywhere
    const here = QS().filter((x) => x.area === Game.areaId);
    for (const want of ['ready', 'active', 'avail']) { q = here.find((x) => status(x) === want); if (q) return q; }
    for (const want of ['ready', 'active']) { q = QS().find((x) => status(x) === want); if (q) return q; }
    return null;
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
    for (const f of P.fl) f.t += dt; P.fl = P.fl.filter((f) => f.t < 2.2);
    for (const p of P.pings) p.t += dt; P.pings = P.pings.filter((p) => p.t < p.life);
    if (P.lvUp) { P.lvUp.t += dt; if (P.lvUp.t > 3.2) P.lvUp = null; }
    if (!P.lvUp && P.cards.length) { P.cards[0].t += dt; if (P.cards[0].t > 3.8) P.cards.shift(); }
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
  function logBadge() { return QS().some((q) => status(q) === 'ready' || (status(q) === 'avail' && q.area === Game.areaId)); }
  // row below the top bar: level chip + XP bar, then the tracked objective
  function drawLevel(fb, t) {
    const lv = level(), D = L(), x = 6, y = 32;
    const a = XP[Math.min(lv, MAXLV)], b = XP[Math.min(lv + 1, MAXLV)] || a + 1, k = lv >= MAXLV ? 1 : clamp((D.xp - a) / (b - a), 0, 1);
    UI.rectA(fb, x, y, 92, 12, 0xff0a0e20, 0.55);
    UI.rrect(fb, x + 1, y + 1, 24, 10, 3, 0xff3a78e8);
    Font.draw(fb, 'Lv' + lv, x + 13, y + 3, WHITE, { font: 'small', align: 'center' });
    UI.rect(fb, x + 28, y + 4, 60, 4, 0xff2a3050);
    UI.rect(fb, x + 28, y + 4, Math.round(60 * k), 4, P.lvUp ? GOLD : 0xff5aff9a);
    // floating "+XP"
    P.fl.slice(-1).forEach((f, i) => { const kk = f.t / 2.2; if (Math.floor(f.t * 20) % 2 && kk > 0.8) return; Font.draw(fb, f.text, x + 96, y + 1 + i * 9 - Math.round(kk * 6), 0xff9affb0, { font: 'small', outline: INK }); });
    // tracked quest
    const q = tracked();
    if (q && Game.mode === 'explore') {
      const txt = '> ' + q.title + ': ' + objective(q) + (q.area !== Game.areaId ? ' [' + areaName(q.area) + ']' : '');
      const w = Math.min(fb.w * 0.5, Font.measure(txt, 'small') + 8);
      UI.rectA(fb, x, y + 14, w, 11, 0xff0a0e20, 0.45);
      Font.draw(fb, fit(txt, w - 6), x + 4, y + 16, GOLD, { font: 'small' });
      HUD.btn('track', x, y + 14, w, 11, () => openLog());
    }
  }
  const toastTop = () => (Game.mode === 'explore' ? 62 : 34);
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
  function drawCards(fb, t) {
    const W = fb.w;
    if (P.lvUp) {
      const k = P.lvUp.t, e = Math.min(1, k / 0.35), out = k > 2.8 ? 1 - (k - 2.8) / 0.4 : 1;
      const w = 170, h = 44, x = Math.round(W / 2 - w / 2), y = Math.round(66 + (1 - U.ease.outBack(e)) * -60);
      if (out <= 0) return;
      UI.rrect(fb, x, y + 3, w, h, 8, 0xff0a0e1a);
      UI.rrect(fb, x, y, w, h, 8, INK); UI.rrect(fb, x + 2, y + 2, w - 4, h - 4, 6, 0xff2a5ad8);
      for (let i = 0; i < 8; i++) { const a = t * 2 + i * 0.785; UI.put(fb, Math.round(W / 2 + Math.cos(a) * (w / 2 + 6)), Math.round(y + h / 2 + Math.sin(a) * (h / 2 + 6)), GOLD); }
      Font.draw(fb, 'LEVEL UP!', W / 2, y + 7, GOLD, { font: 'title', align: 'center', outline: INK });
      Font.draw(fb, 'Mudkip is now Lv ' + P.lvUp.lv, W / 2, y + 28, WHITE, { font: 'small', align: 'center' });
      return;
    }
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
  { const d0 = Talk.drawDialog; Talk.drawDialog = function (fb, t) { const r = d0.call(this, fb, t); try { if (P.log) drawLog(fb, t); else if (!Talk.dlg) drawCards(fb, t); } catch (e) { console.error(e); } return r; }; }

  /* ---------- world map markers ---------- */
  { const w0 = WorldMap.draw; WorldMap.draw = function (fb, t) {
    const r = w0.call(this, fb, t);
    try {
      const tq = tracked();
      for (const id in WorldMap.LOC) {
        const b = HUD.btns.find((x) => x.id === 'pin-' + id); if (!b) continue;
        const qq = QS().filter((q) => q.area === id);
        const rd = qq.some((q) => status(q) === 'ready'), av = qq.some((q) => status(q) === 'avail'), ac = qq.some((q) => status(q) === 'active');
        if (!rd && !av && !ac) continue;
        const X = b.x + b.w + 5, Y = b.y + 7, isT = tq && tq.area === id;
        if (isT) UI.ring(fb, X, Y, 7 + Math.round(Math.sin(t * 5)), GOLD, 1);
        UI.disc(fb, X, Y, 5, INK); UI.disc(fb, X, Y, 4, rd ? 0xff30d8ff : av ? 0xff2ac8ff : 0xff4a5470);
        if (rd) Font.icon(fb, 'star', X - 3, Y - 3, 1); else Font.draw(fb, av ? '!' : '?', X, Y - 3, WHITE, { font: 'small', align: 'center' });
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
  function logList() { const e = entries(); return P.log.tab === 'done' ? e.filter((x) => x.s === 'done') : e.filter((x) => x.s !== 'done'); }
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
    [['active', 'Active (' + nA + ')'], ['done', 'Done (' + nD + ')']].forEach(([id, lab], i) => {
      const tx = x + 10 + i * 78, on = G.tab === id;
      UI.panel(fb, tx, y + 24, 74, 14, { r: 3, ol: S.ink, fill: on ? S.accent : S.btn });
      Font.draw(fb, lab, tx + 37, y + 27, WHITE, { font: 'small', align: 'center' });
      G.rects.push({ x: tx, y: y + 24, w: 74, h: 14, fn: () => { G.tab = id; G.sel = 0; G.scroll = 0; Game.sfx('page', null, 0.5); } });
    });
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
    if (!list.length) Font.draw(fb, G.tab === 'done' ? 'Nothing finished yet.' : 'No quests right now.', lx + lw / 2, ly + 20, 0xff6a7090, { font: 'small', align: 'center' });
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
    if (e.s !== 'done') { const s = st(q); const hint = s ? (q.wait && q.wait[0] ? q.wait[0].replace(/\{have\}/g, s.n || 0).replace(/\{left\}/g, Math.max(0, (q.n || 1) - (s.n || 0))) : '') : q.intro[q.intro.length - 1]; if (hint) line('Hint', String(hint).replace(/\{[a-z]+\}/g, '')); }
    line('Reward', rewardLabel(q.reward) + ' + ' + (100 + (q.xp || 0)) + ' XP' + (q.unlock ? ' + a flight to ' + areaName(q.unlock) : ''));
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
      else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd' || k === 'Tab') { G.tab = G.tab === 'done' ? 'active' : 'done'; G.sel = 0; G.scroll = 0; }
      else if (k === 'Enter' || k === ' ' || k === 't') trackSel();
      return true;
    }
    if (k === 'l' && !Talk.dlg && Game.mode === 'explore') { openLog(); return true; }
    return k0.call(this, k, e);
  }; }
  { const b0 = Talk.busy; Talk.busy = function () { return !!P.log || b0.call(this); }; }
  if (typeof U.on === 'function') U.on('area', () => { P.pings.length = 0; if (P.log) P.log = null; });

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

  return Object.assign(P, { has, hudOk, level, gain, award, FEATS, XP, openLog, closeLog, logBadge, icon, toastTop, dexPage, objective, status, tracked, entries, onScan });
})();
