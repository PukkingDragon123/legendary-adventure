/* ------------------------------------------------------------------
   Save — the player's journal, kept in localStorage: photos per species
   and star tier, behaviours seen, objectives, requests, rewards and
   equipped cosmetics, unlocked areas, discoveries and items.

   Robust for itch.io (the game runs in a third-party iframe there):
   · every storage access is guarded; a probe at load tells whether
     storage works at all (Safari/iOS iframes, private mode, blocked
     site data) — Save.status.ok / .blocked / .full
   · autosave: debounced on every change (max wait 3 s), every 30 s,
     and on visibilitychange / pagehide / beforeunload
   · a rolling backup copy; a corrupt main save falls back to it
   · versioned (v) with migrations so old journals keep loading
   · export / import as a text code or a .json file (see savekit.js)
------------------------------------------------------------------- */
const Save = (() => {
  const KEY = 'mudkip-snap-v1', BAK = 'mudkip-snap-bak', VER = 2;
  const fresh = () => ({
    v: VER, points: 0, photos: {}, seen: {}, beh: {}, obj: {}, quests: {}, owned: { 'skin.classic': 1, 'neck.camera': 1, 'banner.rookie': 1, 'deco.none': 1, 'hat.straw': 1, 'glasses.round': 1, 'fun.stache': 1, 'hat.bow': 1 },
    equip: { skin: 'skin.classic', banner: 'banner.rookie', key: null, deco: 'deco.none', hat: null, shirt: null, glasses: null, neck: 'neck.camera', shoes: null, fun: null },
    items: { berry: 3 }, areas: { beach: 1 }, visits: {}, disc: {}, album: [], lastArea: 'beach', songs: {}, tut: {}, shots: 0, stats: {}, season: 'summer',
    meta: { created: Date.now(), saves: 0, savedAt: 0, notice: 0 },
  });
  // storage, every access guarded (a throwing getter counts as "blocked")
  const LS = () => { try { return window.localStorage || null; } catch (e) { return null; } };
  function rawGet(k) { try { const s = LS(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function rawSet(k, v) { try { const s = LS(); if (!s) return 'blocked'; s.setItem(k, v); return 'ok'; } catch (e) { return e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) ? 'full' : 'blocked'; } }
  function rawDel(k) { try { const s = LS(); if (s) s.removeItem(k); } catch (e) { /* ignore */ } }
  const status = { ok: true, blocked: false, full: false, why: '', savedAt: 0, saving: false, iframe: false };
  try { status.iframe = window.self !== window.top; } catch (e) { status.iframe = true; }
  function probe() {
    const k = 'mudkip-snap-probe', v = String(Date.now());
    const r = rawSet(k, v);
    if (r !== 'ok' || rawGet(k) !== v) {
      status.ok = false; status.blocked = r !== 'full'; status.full = r === 'full';
      status.why = !LS() ? 'Storage is switched off for this page.' : r === 'full' ? 'Browser storage is full.' : 'The browser blocks storage here (private mode or third-party iframe).';
    } else { status.ok = true; status.blocked = false; status.full = false; status.why = ''; }
    rawDel(k);
    return status.ok;
  }

  // ---- versions: each step upgrades a journal one version ----
  const MIGRATE = {
    1: (d) => { d.meta = Object.assign({ created: Date.now(), saves: 0, savedAt: 0, notice: 1 }, d.meta || {}); return d; }, // (v1 players already know the game: no first-launch notice)
  };
  function migrate(d) {
    if (!d || typeof d !== 'object') return null;
    let v = d.v | 0; if (v < 1) v = 1;
    while (v < VER) { if (MIGRATE[v]) d = MIGRATE[v](d) || d; v++; d.v = v; }
    if (d.v > VER) d.v = VER; // a newer build's journal: keep what we understand
    const f = fresh();
    return Object.assign(f, d, { equip: Object.assign(f.equip, d.equip || {}), owned: Object.assign(f.owned, d.owned || {}), meta: Object.assign(f.meta, d.meta || {}) });
  }
  function parse(s) { if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }

  let data = fresh();
  let dirty = false, timer = null, firstDirty = 0, loadedFrom = 'new';
  function load() {
    probe();
    let d = parse(rawGet(KEY)); loadedFrom = d ? 'main' : 'new';
    if (!d) { const b = parse(rawGet(BAK)); if (b) { d = b; loadedFrom = 'backup'; } }
    data = (d && migrate(d)) || fresh();
    api.data = data;
    hook();
  }
  // squeeze the journal when storage is full: drop photo images, oldest first
  function slim(level) {
    if (level >= 1) for (const a of data.album) delete a.img;
    if (level >= 2) for (const sp in data.photos) for (const k in data.photos[sp]) if (data.photos[sp][k]) delete data.photos[sp][k].img;
  }
  function write(backup) {
    timer && clearTimeout(timer); timer = null;
    data.meta.saves = (data.meta.saves || 0) + 1; data.meta.savedAt = Date.now();
    let s = JSON.stringify(data), r = rawSet(KEY, s);
    if (r === 'full') { slim(1); s = JSON.stringify(data); r = rawSet(KEY, s); }
    if (r === 'full') { rawDel(BAK); slim(2); s = JSON.stringify(data); r = rawSet(KEY, s); }
    if (r === 'ok' && backup) rawSet(BAK, s);
    const was = status.ok;
    status.ok = r === 'ok'; status.full = r === 'full'; status.blocked = r === 'blocked';
    if (!status.ok) status.why = r === 'full' ? 'Browser storage is full.' : 'The browser blocks storage here (private mode or third-party iframe).';
    if (status.ok) { status.savedAt = Date.now(); dirty = false; }
    try { U.emit('save', status, was); } catch (e) { /* ignore */ }
    return status.ok;
  }
  // debounced: 0.8 s after the last change, but never more than 3 s after the first
  function save() {
    if (!dirty) firstDirty = Date.now();
    dirty = true;
    try { U.emit('saving', status); } catch (e) { /* ignore */ }
    if (timer) clearTimeout(timer);
    const wait = Math.max(0, Math.min(800, 3000 - (Date.now() - firstDirty)));
    timer = setTimeout(() => write(false), wait);
  }
  function flush(backup) { if (dirty || backup) return write(!!backup); return status.ok; }
  let hooked = false;
  function hook() {
    if (hooked) return; hooked = true;
    try {
      setInterval(() => flush(true), 30000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
      window.addEventListener('pagehide', () => flush());
      window.addEventListener('beforeunload', () => flush());
      window.addEventListener('blur', () => flush());
    } catch (e) { /* ignore */ }
  }
  const has = (id) => !!data.owned[id];
  function own(id) { if (data.owned[id]) return false; data.owned[id] = 1; save(); return true; }
  function equip(slot, id) { data.equip[slot] = id; save(); if (Game.mudkip) Game.mudkip.setLook(look()); }
  // Mudkip's cosmetic pose fields from equipped items
  function look() {
    const e = data.equip, o = {};
    for (const s of ['hat', 'shirt', 'glasses', 'neck', 'shoes', 'fun']) if (e[s]) o[s] = e[s].split('.')[1];
    return o;
  }
  const unlocked = (a) => !!data.areas[a];
  function unlock(a) { if (data.areas[a]) return false; data.areas[a] = 1; save(); return true; }
  function visit(a) { data.visits[a] = (data.visits[a] || 0) + 1; data.lastArea = a; save(); }
  function useItem(k) { if ((data.items[k] || 0) <= 0) return false; data.items[k]--; save(); return true; }
  function addItem(k, n = 1) { data.items[k] = (data.items[k] || 0) + n; save(); }
  const itemN = (k) => data.items[k] || 0;
  function discover(id) { if (data.disc[id]) return false; data.disc[id] = Date.now(); save(); return true; }
  const found = (id) => !!data.disc[id];
  function addPoints(n) { data.points += n; save(); }

  /**
   * Record a rated photo. r: { species, beh, stars, score, medal, img, area, subjects }
   * → { newSpecies, newBeh, newStar, improved }
   */
  function recordPhoto(r) {
    data.shots++;
    const out = { newSpecies: false, newBeh: false, newStar: false, improved: false };
    if (r.species) {
      const sp = r.species;
      if (!data.seen[sp]) { data.seen[sp] = Date.now(); out.newSpecies = true; }
      const bh = data.beh[sp] || (data.beh[sp] = {});
      if (r.beh) { if (!(r.beh in bh)) out.newBeh = true; if (!(r.beh in bh) || bh[r.beh] < r.score) bh[r.beh] = r.score; }
      const ph = data.photos[sp] || (data.photos[sp] = {});
      const k = 's' + r.stars;
      if (!ph[k]) out.newStar = true;
      if (!ph[k] || ph[k].score < r.score) { ph[k] = { score: r.score, medal: r.medal, beh: r.beh, img: r.img, area: r.area, t: Date.now() }; out.improved = true; }
      // extra species in the frame count as seen too
      for (const s of r.others || []) if (!data.seen[s]) data.seen[s] = Date.now();
    }
    data.album.unshift({ sp: r.species, beh: r.beh, stars: r.stars, score: r.score, medal: r.medal, img: r.img, t: Date.now() });
    if (data.album.length > (data.albumMax || 24)) data.album.length = data.albumMax || 24;
    save();
    return out;
  }
  const bestScore = (sp) => { const p = data.photos[sp]; if (!p) return 0; return Math.max(0, ...['s1', 's2', 's3', 's4'].map((k) => (p[k] ? p[k].score : 0))); };
  function reset() { data = fresh(); data.meta.notice = 1; api.data = data; write(true); }

  /* ---------- export / import ---------- */
  const MAGIC = 'MKSNAP';
  // photos=false leaves the images out (a short code to copy); true keeps everything (.json file)
  function exportObj(photos) {
    const d = JSON.parse(JSON.stringify(data));
    if (!photos) { for (const a of d.album || []) delete a.img; for (const sp in d.photos || {}) for (const k in d.photos[sp]) if (d.photos[sp][k]) delete d.photos[sp][k].img; }
    return { game: 'mudkip-snap', v: VER, at: Date.now(), save: d };
  }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function unb64(s) { return decodeURIComponent(escape(atob(s))); }
  function exportCode() { return MAGIC + VER + ':' + b64(JSON.stringify(exportObj(false))); }
  function exportFile() { return JSON.stringify(exportObj(true)); }
  // text (a code or a .json) → a journal, or throws with a friendly message
  function decode(txt) {
    txt = String(txt || '').trim();
    let o = null;
    if (txt.startsWith(MAGIC)) { const i = txt.indexOf(':'); try { o = JSON.parse(unb64(txt.slice(i + 1).replace(/\s+/g, ''))); } catch (e) { throw new Error('That save code looks broken or incomplete.'); } }
    else { try { o = JSON.parse(txt); } catch (e) { throw new Error('That is not a Mudkip Snap save code or file.'); } }
    const d = o && o.game === 'mudkip-snap' ? o.save : o;
    if (!d || typeof d !== 'object' || !d.seen || !d.areas) throw new Error('That is not a Mudkip Snap save.');
    return migrate(d);
  }
  function importText(txt) {
    const d = decode(txt);
    data = d; api.data = data;
    write(true);
    return d;
  }
  const api = { data, load, save, flush, has, own, equip, look, unlocked, unlock, visit, useItem, addItem, itemN, discover, found, addPoints, recordPhoto, bestScore, reset, status, probe, exportCode, exportFile, decode, importText, VER, KEY, loaded: () => loadedFrom, isDirty: () => dirty };
  return api;
})();
