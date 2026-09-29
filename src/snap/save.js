/* ------------------------------------------------------------------
   Save — the player's journal, kept in localStorage (wrapped so a
   blocked or full storage never breaks the game): photos per species
   and star tier, behaviours seen, objectives, requests, rewards and
   equipped cosmetics, unlocked areas, discoveries and items.
------------------------------------------------------------------- */
const Save = (() => {
  const KEY = 'mudkip-snap-v1';
  const fresh = () => ({
    v: 1, points: 0, photos: {}, seen: {}, beh: {}, obj: {}, quests: {}, owned: { 'skin.classic': 1, 'neck.camera': 1, 'banner.rookie': 1, 'deco.none': 1, 'hat.straw': 1, 'glasses.round': 1, 'fun.stache': 1, 'hat.bow': 1 },
    equip: { skin: 'skin.classic', banner: 'banner.rookie', key: null, deco: 'deco.none', hat: null, shirt: null, glasses: null, neck: 'neck.camera', shoes: null, fun: null },
    items: { berry: 3 }, areas: { beach: 1 }, visits: {}, disc: {}, album: [], lastArea: 'beach', songs: {}, tut: {}, shots: 0, stats: {},
  });
  let data = fresh();
  let dirty = false, timer = null;
  function load() {
    const d = U.store.get(KEY, null);
    if (d && d.v === 1) data = Object.assign(fresh(), d, { equip: Object.assign(fresh().equip, d.equip || {}), owned: Object.assign(fresh().owned, d.owned || {}) });
    api.data = data;
  }
  function save() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null; dirty = false;
      if (!U.store.set(KEY, data)) {
        // out of room: drop album images, oldest first, then retry
        for (const a of data.album) delete a.img;
        U.store.set(KEY, data);
      }
    }, 400);
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
  function reset() { data = fresh(); api.data = data; U.store.set(KEY, data); }
  const api = { data, load, save, has, own, equip, look, unlocked, unlock, visit, useItem, addItem, itemN, discover, found, addPoints, recordPhoto, bestScore, reset };
  return api;
})();
