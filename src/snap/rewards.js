/* ------------------------------------------------------------------
   Rewards — everything you can earn: Pokédex / camera skins, profile
   banners, keychains that dangle from the device, camera-frame
   decorations and Mudkip's outfits (hats, shirts, glasses, neckwear).
------------------------------------------------------------------- */
const Rewards = (() => {
  const { clamp, hex, mix } = U;
  const C = {
    // skins (UI.SKINS holds the colours)
    'skin.classic': { slot: 'skin', name: 'Classic Red', desc: 'The original red Pokédex.' },
    'skin.sapphire': { slot: 'skin', name: 'Sapphire Blue', desc: 'Deep-sea blue, from the surfing Mantine.' },
    'skin.emerald': { slot: 'skin', name: 'Emerald', desc: 'Rainforest green with a golden trim.' },
    'skin.luvdisc': { slot: 'skin', name: 'Luvdisc Pink', desc: 'Covered in little hearts.' },
    'skin.mudkip': { slot: 'skin', name: 'Mudkip', desc: 'Blue and orange — just like you!' },
    'skin.coral': { slot: 'skin', name: 'Coral Reef', desc: 'Warm coral with a sea-glass screen.' },
    'skin.cosmic': { slot: 'skin', name: 'Cosmic', desc: 'A starry skin from beyond the sky.' },
    'skin.melody': { slot: 'skin', name: 'Melody', desc: 'Meloetta\'s own design, with musical notes.' },
    'skin.gold': { slot: 'skin', name: 'Champion Gold', desc: 'For the greatest photographer.' },
    // banners
    'banner.rookie': { slot: 'banner', name: 'Rookie Snapper', desc: 'Every legend starts somewhere.', cols: ['#4a90e8', '#ffffff'] },
    'banner.surf': { slot: 'banner', name: 'Wave Rider', desc: 'Earned by the breaching Wailord.', cols: ['#1f78bf', '#bfefff'] },
    'banner.rain': { slot: 'banner', name: 'Rain Dancer', desc: 'Ludicolo\'s gift.', cols: ['#2f7e38', '#bfe2ff'] },
    'banner.rainbow': { slot: 'banner', name: 'Rainbow Seeker', desc: 'Milotic shone under the rainbow.', cols: ['#ff7ab0', '#ffe066'] },
    'banner.sky': { slot: 'banner', name: 'Sky Hunter', desc: 'Pecked by a brave Taillow!', cols: ['#23335e', '#ff5a5a'] },
    'banner.star': { slot: 'banner', name: 'Stargazer', desc: 'Sun and moon met in the cave.', cols: ['#1a1040', '#ffe890'] },
    'banner.legend': { slot: 'banner', name: 'Time Traveller', desc: 'Dialga roared for you.', cols: ['#2a4a8a', '#9fd8ff'] },
    'banner.rock': { slot: 'banner', name: 'Rock Star', desc: 'You played the big concert!', cols: ['#ff4fa8', '#6affb0'] },
    'banner.master': { slot: 'banner', name: 'Master Photographer', desc: 'Every page of the Pokédex filled.', cols: ['#e0b030', '#fff4c8'] },
    // keychains
    'key.luvdisc': { slot: 'key', name: 'Luvdisc Charm', desc: 'A tiny pink heart.' },
    'key.spheal': { slot: 'key', name: 'Spheal Charm', desc: 'Round, blue and bouncy.' },
    'key.castform': { slot: 'key', name: 'Castform Charm', desc: 'Changes with the weather (not really).' },
    'key.minior': { slot: 'key', name: 'Minior Core', desc: 'A glowing pink core in a tiny shell.' },
    'key.orb': { slot: 'key', name: 'Blue Orb', desc: 'It hums like the deep sea.' },
    'key.note': { slot: 'key', name: 'Music Note', desc: 'Chatot copied a song into it.' },
    'key.pokeball': { slot: 'key', name: 'Poké Ball', desc: 'A classic.' },
    // camera decorations
    'deco.none': { slot: 'deco', name: 'Plain Frame', desc: 'Nothing fancy.' },
    'deco.shells': { slot: 'deco', name: 'Seashell Stickers', desc: 'Shells from the Spheal tower.' },
    'deco.frost': { slot: 'deco', name: 'Frosty Frame', desc: 'A souvenir of Walrein\'s Ice Beam.' },
    'deco.leaves': { slot: 'deco', name: 'Leafy Frame', desc: 'Kecleon approves.' },
    'deco.stars': { slot: 'deco', name: 'Twinkle Frame', desc: 'Volbeat painted it with light.' },
    'deco.pop': { slot: 'deco', name: 'Pop Stickers', desc: 'Pink and green concert stickers.' },
    // Mudkip outfits (pose fields for the model)
    'hat.lobster': { slot: 'hat', name: 'Lobster Hat', desc: 'Claws up! A prize from the Corphish duel.' },
    'hat.sailor': { slot: 'hat', name: 'Sailor Cap', desc: 'Returned by a sheepish Wingull.' },
    'hat.bucket': { slot: 'hat', name: 'Pelipper Bucket Hat', desc: 'Yellow like a Pelipper bill.' },
    'hat.beanie': { slot: 'hat', name: 'Spheal Beanie', desc: 'With a fluffy pom-pom.' },
    'hat.flower': { slot: 'hat', name: 'Flower Crown', desc: 'Ludicolo made it while dancing.' },
    'hat.star': { slot: 'hat', name: 'Pop-Star Tiara', desc: 'For the headliner.' },
    'hat.straw': { slot: 'hat', name: 'Straw Hat', desc: 'Smells a bit like Tropius fruit.' },
    'shirt.heart': { slot: 'shirt', name: 'Heart Shirt', desc: 'A pink tee with a big red heart.' },
    'shirt.stripe': { slot: 'shirt', name: 'Sailor Stripes', desc: 'Blue and white, very nautical.' },
    'shirt.pop': { slot: 'shirt', name: 'Pop-Star Jacket', desc: 'Sparkly magenta with gold trim.' },
    'shirt.hoodie': { slot: 'shirt', name: 'Rain Hoodie', desc: 'Warm and dry in Weather Woods.' },
    'glasses.star': { slot: 'glasses', name: 'Star Shades', desc: 'Pink star sunglasses.' },
    'glasses.round': { slot: 'glasses', name: 'Cool Shades', desc: 'Round and mysterious.' },
    'neck.camera': { slot: 'neck', name: 'Snap Camera', desc: 'Your trusty camera.' },
    'neck.bow': { slot: 'neck', name: 'Bow Tie', desc: 'Very dapper.' },
    'neck.scarf': { slot: 'neck', name: 'Red Scarf', desc: 'A gift from a fluffy friend.' },
  };
  const SLOTS = [['hat', 'Hats'], ['shirt', 'Shirts'], ['glasses', 'Shades'], ['neck', 'Neck'], ['skin', 'Skins'], ['banner', 'Banners'], ['key', 'Charms'], ['deco', 'Frames']];
  const name = (id) => (C[id] ? C[id].name : id);
  // pts:N / item:berry:N / catalog id
  function grant(id) {
    if (!id) return null;
    if (id.startsWith('pts:')) { Save.addPoints(+id.slice(4)); return { kind: 'pts', n: +id.slice(4), label: '+' + id.slice(4) + ' research points' }; }
    if (id.startsWith('item:')) { const [, k, n] = id.split(':'); Save.addItem(k, +n); return { kind: 'item', label: '+' + n + ' ' + k + (n > 1 ? 's' : '') }; }
    if (!C[id]) return null;
    const fresh = Save.own(id);
    return { kind: 'item', id, label: C[id].name, fresh, slot: C[id].slot };
  }
  /* ---- camera-frame decorations ---- */
  function drawDeco(fb, S, x0, y0, x1, y1, t) {
    const id = Save.data.equip.deco;
    if (!id || id === 'deco.none') return;
    const corners = [[x0 - 6, y0 - 6], [x1 - 10, y0 - 6], [x0 - 6, y1 - 10], [x1 - 10, y1 - 10]];
    if (id === 'deco.shells') { const m = ['..a..', '.aba.', 'abcba', 'bcccb', '.ddd.']; const cols = { a: hex('#fff0e8'), b: hex('#f4cebe'), c: hex('#dca08e'), d: hex('#b8766a') }; corners.forEach(([x, y], i) => UI.pix(fb, m, x + (i % 2 ? 0 : 2), y + 2, cols, 2)); }
    if (id === 'deco.frost') for (let k = 0; k < 60; k++) { const side = k % 4, u = ((k * 37) % 100) / 100; const x = side < 2 ? Math.round(x0 + (x1 - x0) * u) : side === 2 ? x0 - 2 : x1 + 1, y = side === 0 ? y0 - 2 : side === 1 ? y1 + 1 : Math.round(y0 + (y1 - y0) * u); UI.put(fb, x, y, 0xfffff4e8); if (k % 3 === 0) { UI.put(fb, x + 1, y, 0xffffe0c8); UI.put(fb, x, y + 1, 0xffffe0c8); } }
    if (id === 'deco.leaves') corners.forEach(([x, y], i) => { UI.pix(fb, ['..gg', '.ggl', 'ggl.', 'gl..'], x, y, { g: hex('#3aa84a'), l: hex('#9fe07a') }, 3); });
    if (id === 'deco.stars') for (let k = 0; k < 16; k++) { const u = (k * 0.137 + t * 0.02) % 1; const x = Math.round(x0 + (x1 - x0) * u), y = k % 2 ? y0 - 4 : y1 + 3; if (Math.sin(t * 4 + k) > 0) Font.icon(fb, 'spark', x - 2, y - 2, 1, 0xffffe890); }
    if (id === 'deco.pop') corners.forEach(([x, y], i) => { Font.icon(fb, i % 2 ? 'heart' : 'note', x + 1, y + 1, 2); });
  }
  /* ---- keychain charm (drawn hanging from the Pokédex) ---- */
  function drawKey(fb, id, x, y, ang, t) {
    const len = 12, ex = Math.round(x + Math.sin(ang) * len), ey = Math.round(y + Math.cos(ang) * len);
    UI.line(fb, x, y, ex, ey - 3, 0xffc8ccd8); UI.ring(fb, x, y, 2, 0xffd8dce8);
    const pal = {
      'key.luvdisc': [['.rr.rr.', 'rrrrrrr', 'rrwrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: hex('#ff7aa0'), w: hex('#ffffff') }],
      'key.spheal': [['.bbbb.', 'bbwbbb', 'bkbbkb', 'bccccb', '.cccc.'], { b: hex('#5a8ae0'), w: hex('#ffffff'), k: hex('#1b2240'), c: hex('#f4e8c0') }],
      'key.castform': [['..w..', '.www.', 'wwwww', 'wkwkw', 'bbbbb', '.b.b.'], { w: hex('#ffffff'), k: hex('#1b2240'), b: hex('#8aa4c8') }],
      'key.minior': [['..w..', '.ppp.', 'wpppw', 'pwpwp', '.ppp.', '..w..'], { p: hex('#ff5aa8'), w: hex('#ffe0f0') }],
      'key.orb': [['.bbb.', 'bcbbb', 'bbbbb', 'bbbbb', '.bbb.'], { b: hex('#2a6ad8'), c: hex('#bfe8ff') }],
      'key.note': [['..kkk', '..k.k', '..k..', 'kkk..', 'kkk..'], { k: hex('#ffd23a') }],
      'key.pokeball': [['.rrr.', 'rrrrr', 'kkwkk', 'wwwww', '.www.'], { r: hex('#ee3b45'), k: hex('#1b2240'), w: hex('#f4f7fb') }],
    }[id];
    if (!pal) return;
    const [m, c] = pal;
    const w = m[0].length;
    UI.pix(fb, m, ex - Math.floor(w / 2) * 2, ey - 2, c, 2);
  }
  function drawBanner(fb, id, x, y, w, h) {
    const c = C[id] && C[id].cols ? C[id].cols.map(hex) : [0xff4a90e8, 0xffffffff];
    UI.rrect(fb, x, y, w, h, 3, 0xff1b2240);
    for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
      const stripe = Math.floor((xx + yy) / 6) % 2;
      UI.put(fb, x + xx, y + yy, stripe ? c[0] : U.mix(c[0], 0xff000000, 0.15));
    }
    Font.draw(fb, name(id), x + w / 2, y + h / 2 - 3, c[1], { font: 'body', align: 'center', outline: 0xff1b2240 });
  }
  return { C, SLOTS, name, grant, drawDeco, drawKey, drawBanner };
})();
