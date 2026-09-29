/* ------------------------------------------------------------------
   Wild — new residents of Hoenn living on the Eco brain: evolutions
   next to their families (Marshtomp by Mudkip's shore, Lombre with the
   Lotad), babies with their elders (Wynaut, Budew), Starmie at night by
   the Staryu, Snorunt that love winter, and Latias drifting over the
   woods at dusk.
------------------------------------------------------------------- */
const Wild = (() => {
  const { rnd } = U;
  const W = (m, st) => ({ walk: st.mv ? st.ph : 0 });
  Eco.def('marshtomp', { sp: 'Marshtomp', scale: 0.42, speed: 42, persona: 'curious', diet: true, loco: 'walk', active: 'day',
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, crouch: 0, mouth: 0 }),
    acts: [{ id: 'mudplay', w: 2, T: [1.6, 2.6], sfx: 'mud', p: (m, k) => ({ crouch: Math.abs(Math.sin(k * 9)), mouth: 0.6 }), fx: (m) => { if (Math.random() < 0.2) FX.add({ type: 'drop', x: m.x + rnd(-8, 8), y: m.y - 4, vx: rnd(-40, 40), vy: -rnd(40, 80), g: 400, life: 0.6, c: 0xff3a5a7a, size: 1, floor: World.groundAt(m.x), layer: 2 }); } },
      { id: 'flex', w: 1, T: 1.5, face: 0.8, p: () => ({ mouth: 1, eyes: 'happy' }) }] });
  Eco.def('lombre', { sp: 'Lombre', scale: 0.4, speed: 38, persona: 'showoff', diet: true, active: 'twilight',
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, swim: st.swim ? st.ph : 0 }),
    acts: [{ id: 'dance', dance: true, w: 2, T: [2, 3], sfx: 'bongo', p: (m, k, e) => ({ dance: e * 3, groove: Math.sin(e * 8), mouth: 0.8, eyes: 'happy' }) },
      { id: 'prank', w: 1, T: 1.4, face: 0.9, p: (m, k) => ({ mouth: 1, lean: 0.4 }), after: () => Game.sfx('yum', null, 0.4) }] });
  Eco.def('wynaut', { sp: 'Wynaut', scale: 0.36, speed: 34, persona: 'curious', baby: true, hopper: 120, active: 'day',
    pose: (m, st, t) => ({ walk: st.mv ? st.ph : 0, sway: Math.sin(st.t * 3 + m.seed) * 0.5 }),
    acts: [{ id: 'sway', dance: true, w: 2, T: [1.5, 2.5], p: (m, k, e) => ({ sway: Math.sin(e * 7), arms: 1, mouth: 1, eyes: 'happy' }) }] });
  Eco.def('budew', { sp: 'Budew', scale: 0.34, speed: 22, persona: 'shy', baby: true, active: 'day', hibernate: true,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, bloom: Eco.season() === 'spring' ? 1 : 0.3 }),
    acts: [{ id: 'bloom', w: 2, T: [2, 3], when: () => Game.hour() !== 'night', p: (m, k) => ({ bloom: Math.sin(k * Math.PI), tilt: Math.sin(k * 12) * 0.2 }), fx: (m) => { if (Math.random() < 0.1) FX.sparkles(m.x, m.y - 12, 2, 8, 0xffffffff, 0xffa0d8ff); } }] });
  Eco.def('snorunt', { sp: 'Snorunt', scale: 0.38, speed: 36, persona: 'shy', cold: true, active: 'any',
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, shiver: Eco.season() === 'winter' ? 0 : Math.sin(st.t * 30) * 0.3 }),
    acts: [{ id: 'snowplay', w: 2, T: [1.6, 2.4], sfx: 'crunch', when: () => Eco.season() === 'winter', p: () => ({ mouth: 1, eyes: 'happy' }), hop: 160 },
      { id: 'hide', w: 1, T: 2.5, p: () => ({ shiver: 0.6, eyes: 'closed' }) }] });
  Eco.def('starmie', { sp: 'Starmie', scale: 0.38, speed: 60, loco: 'swim', persona: 'calm', active: 'night',
    pose: (m, st) => ({ spin: st.t * (st.mv ? 5 : 1.5), glow: 0.5 + 0.5 * Math.sin(st.t * 3) }),
    acts: [{ id: 'jewel', w: 2, T: [1.5, 2.5], sfx: 'twinkle', p: (m, k, e) => ({ spin: e * 14, glow: 1 }) }] });
  Eco.def('latias', { sp: 'Latias', scale: 0.4, speed: 90, loco: 'fly', alt: [80, 150], persona: 'shy', perch: 0, active: 'any',
    pose: (m, st) => ({ fly: 1, bank: Math.max(-1, Math.min(1, (st.vx || 0) / 90)) }),
    acts: [{ id: 'cloak', w: 1, T: 2.5, sfx: 'twinkle', p: () => ({ eyes: 'happy' }), fx: (m, k) => { m.hideK = Math.sin(k * Math.PI) * 0.8; }, after: (m) => { m.hideK = 0; } }] });

  const D = DexData.S;
  const add = (id, e) => { D[id] = e; if (!DexData.ORDER.includes(id)) { DexData.ORDER.push(id); DexData.ORDER.sort((a, b) => D[a].no - D[b].no); } };
  const B = (n, tier, hint) => ({ n, tier, hint });
  add('marshtomp', { no: 259, name: 'Marshtomp', type: ['Water', 'Ground'], h: 0.7, area: ['beach'], persona: 'curious', blurb: 'Mudkip all grown up! It plays in the mud along the shore and is much stronger than it looks.', beh: { walk: B('Stomping', 1, 'Marshtomp stomps along the beach.'), mudplay: B('Mud play', 2, 'It loves splashing in wet sand.'), flex: B('Flexing', 3, 'Stand close and it shows off its muscles.') }, obj: [{ id: 'marshtomp.flex', t: 'Marshtomp flexing', beh: 'flex', reward: 'pts:400' }] });
  add('lombre', { no: 271, name: 'Lombre', type: ['Water', 'Grass'], h: 1.2, area: ['forest'], persona: 'showoff', blurb: 'A cheeky prankster of the riverside. It loves to surprise fishermen, and dances at twilight.', beh: { walk: B('Sneaking', 1, 'Lombre creeps by the river at dawn and dusk.'), dance: B('River dance', 3, 'Play a song near Lombre.'), prank: B('Prank face', 2, 'Lombre loves a good trick.') }, obj: [{ id: 'lombre.dance', t: 'Lombre dancing', beh: 'dance', reward: 'pts:500' }] });
  add('wynaut', { no: 360, name: 'Wynaut', type: ['Psychic'], h: 0.6, area: ['beach'], persona: 'curious', blurb: 'A cheerful baby Pokémon. It sways in happy groups and toughens up by pushing against its friends.', beh: { walk: B('Bouncing', 1, 'Wynaut bounce around the dunes.'), sway: B('Happy sway', 2, 'Wynaut sways when it is happy... or when music plays.'), nuzzle: B('Nuzzle', 3, 'Babies love their family.') }, obj: [{ id: 'wynaut.sway', t: 'Wynaut swaying', beh: 'sway', reward: 'pts:300' }] });
  add('budew', { no: 406, name: 'Budew', type: ['Grass', 'Poison'], h: 0.2, area: ['forest'], persona: 'shy', blurb: 'A tiny baby bud. In spring its bud opens a little and it smells wonderful. In winter it stays shut tight.', beh: { idle: B('Budding', 1, 'Look closely in the forest flowers.'), bloom: B('Blooming', 3, 'Budew bloom best in spring sunshine.') }, obj: [{ id: 'budew.bloom', t: 'Budew blooming', beh: 'bloom', reward: 'pts:400' }] });
  add('snorunt', { no: 361, name: 'Snorunt', type: ['Ice'], h: 0.7, area: ['canopy'], persona: 'shy', blurb: 'It is said that a home visited by Snorunt will prosper. It shivers in summer but plays happily in snow.', beh: { walk: B('Pattering', 1, 'Snorunt wanders the treetops.'), hide: B('Hiding', 2, 'Shy Snorunt hide their faces.'), snowplay: B('Snow play', 4, 'Come back in winter!') }, obj: [{ id: 'snorunt.snow', t: 'Snorunt playing in snow', beh: 'snowplay', reward: 'hat.beanie' }] });
  add('starmie', { no: 121, name: 'Starmie', type: ['Water', 'Psychic'], h: 1.1, area: ['beach'], persona: 'calm', blurb: 'Its jewel core shines in seven colours. At night it spins through the sea like a falling star.', beh: { swim: B('Spinning swim', 2, 'Starmie swim the reef at night.'), jewel: B('Jewel flash', 3, 'Its core flashes as it spins.') }, obj: [{ id: 'starmie.jewel', t: 'Starmie flashing its core', beh: 'jewel', reward: 'pts:500' }] });
  add('latias', { no: 380, name: 'Latias', type: ['Dragon', 'Psychic'], h: 1.4, area: ['forest'], legendary: 1, rare: 2, persona: 'shy', blurb: 'A legendary Pokémon that can bend light to turn invisible. It glides gently over the woods.', beh: { fly: B('Gliding', 3, 'Look up over Weather Woods.'), cloak: B('Invisible!', 4, 'Latias fades from view... snap it just before!') }, obj: [{ id: 'latias.cloak', t: 'Latias turning invisible', beh: 'cloak', reward: 'pts:1000' }] });
  Object.assign(Talk.CHAT || {}, {});

  const wrap = (id, fn) => { const A = Areas[id]; if (!A) return; const s0 = A.spawn; A.spawn = (a, G) => { s0(a, G); try { fn(a, G); } catch (e) { console.error(e); } }; };
  wrap('beach', (A, G) => {
    Eco.add(G, 'marshtomp', 1500, { range: 300 });
    Eco.family(G, 'marshtomp', 'wynaut', 900, 0);
    Eco.add(G, 'wynaut', 1000, { range: 200 }); Eco.add(G, 'wynaut', 1060, { range: 200 });
    if (Game.hour() === 'night' || Game.hour() === 'dusk') Eco.add(G, 'starmie', 2000, { box: { x0: 1500, x1: 2600, y0: World.SEA + 30, y1: World.SEA + 160 } });
  });
  wrap('forest', (A, G) => {
    Eco.add(G, 'lombre', 1600, { range: 250 });
    for (const x of [380, 1900, 2950]) Eco.add(G, 'budew', x, { range: 90 });
    Eco.add(G, 'latias', 1800, { range: 900, y: 300 });
  });
  wrap('canopy', (A, G) => { Eco.add(G, 'snorunt', 900, { range: 200 }); Eco.add(G, 'snorunt', 2200, { range: 200 }); });
  return {};
})();
