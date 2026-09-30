/* ------------------------------------------------------------------
   Wild — the new residents of Hoenn, living on the Eco brain.
   Evolutions settle next to their families (Marshtomp and Swampert on
   Mudkip's beach, Lombre with the Lotad, Nuzleaf by the Seedot tree,
   Linoone racing the Zigzagoon, Breloom sparring with Shroomish,
   Masquerain over Surskit's pond, Vigoroth and Slaking by Slakoth's log,
   Swellow teaching Taillow, Crawdaunt bossing the Corphish, Vibrava and
   Flygon over Trapinch's pit, Starmie with the Staryu), babies tag after
   their elders (Azurill, Wynaut, Budew), and the new places fill up:
   Numel, Spinda, Torkoal and Slugma on Mt. Chimney; Snorunt, Spheal and
   the Eon duo in Shoal Cave. Also: their Pokédex pages, quests, chatter,
   flight carriers and map pins.
------------------------------------------------------------------- */
const Wild = (() => {
  const { rnd, clamp, pick, hex } = U;
  const E = Eco;
  const fx = {
    sparks: (m, c1, c2, n = 1, dy = 14) => { for (let i = 0; i < n; i++) FX.add({ type: 'spark', x: m.x + rnd(-8, 8), y: m.y - dy + rnd(-6, 6), size: 1, life: 0.5, c: hex(c1), c2: hex(c2), layer: 3 }); },
    puff: (m, dy = 12) => FX.add({ type: 'dust', x: m.x + rnd(-4, 4), y: m.y - dy, vx: rnd(-8, 8), vy: -rnd(16, 30), r: 3 + Math.random() * 3, life: 1.2, c: 0xffd8d4d0, c2: 0xff9a9690, layer: 3 }),
    bubbles: (m) => FX.add({ type: 'ring', x: m.x + rnd(-6, 6), y: m.y - 16 - rnd(0, 10), r0: 1, r1: 4, life: 0.6, c: 0xffffffff, layer: 3 }),
  };
  const bank = (st, k = 90) => clamp((st.vx || 0) / k, -1, 1);

  /* ===================== species configs ===================== */
  // ---- the Mudkip line ----
  E.def('marshtomp', { sp: 'Marshtomp', scale: 0.42, speed: 42, persona: 'curious', diet: true, active: 'day',
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, crouch: 0, mouth: 0, side: 3 * Math.cos(m.yaw) }),
    acts: [{ id: 'mudplay', w: 2, T: [1.6, 2.6], sfx: 'mud', p: (m, k) => ({ crouch: Math.abs(Math.sin(k * 9)), mouth: 0.6 }), fx: (m) => { if (Math.random() < 0.2) FX.add({ type: 'drop', x: m.x + rnd(-8, 8), y: m.y - 4, vx: rnd(-40, 40), vy: -rnd(40, 80), g: 400, life: 0.6, c: 0xff3a5a7a, size: 1, floor: World.groundAt(m.x), layer: 2 }); } },
      { id: 'flex', w: 1, T: 1.5, face: 0.8, p: () => ({ mouth: 1, eyes: 'happy' }) }] });
  E.def('swampert', { sp: 'Swampert', scale: 0.44, speed: 36, persona: 'calm', diet: true, active: 'any', alert: 0.6,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, crouch: 0, roar: 0, mouth: 0 }),
    acts: [{ id: 'roar', w: 1, T: 1.8, face: 0.7, sfx: 'roar', vol: 0.4, cry: true, p: (m, k) => ({ roar: Math.sin(k * Math.PI), mouth: Math.sin(k * Math.PI) }), fx: (m, k) => { if (k > 0.3 && k < 0.6) Game.shake(0.6); } },
      { id: 'guard', w: 2, T: [2, 3], p: () => ({ crouch: 0.8, eyes: 'open' }) },
      { id: 'mudshot', w: 1, T: 1.2, sfx: 'mud', p: (m, k) => ({ mouth: k < 0.5 ? 1 : 0, crouch: 0.4 }), fx: (m, k, dt) => { if (Math.random() < dt * 30) FX.add({ type: 'drop', x: m.x + Math.cos(m.yaw) * 14, y: m.y - 22, vx: Math.cos(m.yaw) * rnd(120, 200), vy: -rnd(20, 60), g: 300, life: 0.8, c: 0xff2a4a6a, c2: 0xff3a6a8a, size: 2, floor: World.groundAt(m.x), layer: 3 }); } }] });
  // ---- the Marill family (Weather Woods pond) ----
  E.def('azurill', { sp: 'Azurill', scale: 0.38, speed: 30, persona: 'curious', baby: true, hopper: 150, active: 'day', diet: true, leash: 56,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, bounce: st.air > 0.5 ? 1 : 0.2 + 0.2 * Math.sin(st.t * 5 + m.seed), mouth: 0.3 }),
    acts: [{ id: 'bounce', w: 3, T: [1.4, 2], hop: 240, sfx: 'boing', p: (m, k) => ({ bounce: 1 - k, eyes: 'happy', mouth: 0.8 }) },
      { id: 'tailspin', w: 1, T: 1.2, p: (m, k) => ({ eyes: 'happy' }), fx: (m, k) => { m.rot = Math.sin(k * Math.PI * 2) * 0.3; }, after: (m) => { m.rot = 0; } }],
    babyAct: { id: 'bounce', T: 1.2, hop: 200, sfx: 'boing', p: () => ({ bounce: 1, eyes: 'happy' }) } });
  E.def('marill', { sp: 'Marill', scale: 0.34, speed: 34, persona: 'curious', loco: 'amphi', diet: true, active: 'day',
    pose: (m, st) => ({ walk: st.mv && !st.swim ? st.ph : 0, swim: st.swim ? 1 : 0, mouth: 0.2 }),
    swimAct: { id: 'splash', T: 1.4, sfx: 'splash', vol: 0.3, p: () => ({ eyes: 'happy', mouth: 1 }), fx: (m, k, dt) => { if (Math.random() < dt * 10) FX.add({ type: 'drop', x: m.x + rnd(-6, 6), y: AI.surf(m.x) - 1, vx: rnd(-40, 40), vy: -rnd(60, 110), g: 380, life: 0.6, c: 0xffe8fbff, size: 1, floor: AI.surf(m.x), layer: 3 }); } },
    acts: [{ id: 'ballbounce', w: 2, T: 1.4, hop: 180, p: () => ({ eyes: 'happy', mouth: 0.8 }) }] });
  E.def('azumarill', { sp: 'Azumarill', scale: 0.42, speed: 32, persona: 'calm', loco: 'amphi', diet: true, active: 'day',
    pose: (m, st) => ({ walk: st.mv && !st.swim ? st.ph : 0, swim: st.swim ? 1 : 0, mouth: 0.1 }),
    swimAct: { id: 'bubblebeam', T: 1.8, sfx: 'bubble', p: (m, k) => ({ mouth: 1 }), fx: (m, k, dt) => { if (Math.random() < dt * 14) fx.bubbles(m); } },
    acts: [{ id: 'bubblebeam', w: 1, T: 1.6, face: 0.6, sfx: 'bubble', p: () => ({ mouth: 1 }), fx: (m, k, dt) => { if (Math.random() < dt * 14) fx.bubbles(m); } }] });
  // ---- forest evolutions ----
  E.def('lombre', { sp: 'Lombre', scale: 0.4, speed: 38, persona: 'showoff', diet: true, active: 'twilight',
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, swim: st.swim ? st.ph : 0, side: 3 * Math.cos(m.yaw) }),
    acts: [{ id: 'dance', dance: true, w: 2, T: [2, 3], sfx: 'bongo', p: (m, k, e) => ({ dance: e * 3, groove: Math.sin(e * 8), mouth: 0.8, eyes: 'happy' }) },
      { id: 'prank', w: 1, T: 1.4, face: 0.9, p: () => ({ mouth: 1, lean: 0.4 }), after: () => Game.sfx('yum', null, 0.4) }] });
  E.def('nuzleaf', { sp: 'Nuzleaf', scale: 0.4, speed: 44, persona: 'showoff', diet: true, active: 'day',
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, whistle: 0, mouth: 0 }),
    acts: [{ id: 'whistle', w: 3, T: [2.2, 3.2], dance: true, sfx: 'whistle', p: (m, k, e) => ({ whistle: 1, eyes: Math.sin(e * 3) > 0 ? 'happy' : 'closed' }), fx: (m, k, dt) => { if (Math.random() < dt * 3) FX.add({ type: 'icon', icon: 'note', x: m.x + rnd(-6, 6), y: m.y - 30, vx: rnd(-6, 6), vy: -14, life: 1.4, layer: 3 }); } },
      { id: 'leafdance', w: 1, T: 2, p: (m, k, e) => ({ eyes: 'happy', mouth: 0.6 }), fx: (m, k) => { m.rot = Math.sin(k * Math.PI * 4) * 0.12; }, after: (m) => { m.rot = 0; } }] });
  E.def('linoone', { sp: 'Linoone', scale: 0.46, speed: 72, dashK: 2.4, persona: 'curious', diet: true, smell: 460, active: 'day', prey: ['zigzagoon'], chaseRate: 0.12,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, dash: st.mv > 1.2 ? 1 : 0, sniff: 0 }),
    acts: [{ id: 'dash', w: 3, T: [1, 1.6], dash: 190, sfx: 'whoosh', vol: 0.3, p: () => ({ dash: 1, eyes: 'happy' }), fx: (m, k, dt) => { if (Math.random() < dt * 16) FX.add({ type: 'dust', x: m.x, y: m.y - 1, vx: -Math.cos(m.yaw) * 30, vy: -6, r: 2, life: 0.35, c: 0xffd8ecf4, c2: 0xffb0c8d8, layer: 2 }); } },
      { id: 'sniff', w: 2, T: [1.5, 2.5], p: (m, k, e) => ({ sniff: 0.7 + Math.sin(e * 14) * 0.3 }) }] });
  E.def('breloom', { sp: 'Breloom', scale: 0.42, speed: 46, persona: 'showoff', active: 'day', diet: true,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, punch: 0, tail: Math.sin(st.t * 3 + m.seed) * 0.4 }),
    acts: [{ id: 'machpunch', w: 3, T: 1.1, face: 0.5, sfx: 'whoosh', p: (m, k) => ({ punch: k > 0.3 && k < 0.7 ? 1 : 0, mouth: 0.8 }), fx: (m, k) => { if (k > 0.35 && k < 0.4) { FX.add({ type: 'ring', x: m.x + Math.cos(m.yaw) * 22, y: m.y - 18, r0: 2, r1: 12, life: 0.3, c: 0xffffffff, layer: 4 }); Game.sfx('bonk', m.x, 0.5); } } },
      { id: 'spores', w: 1, T: 2, p: () => ({ eyes: 'closed' }), fx: (m, k, dt) => { if (Math.random() < dt * 14) FX.add({ type: 'spark', x: m.x + rnd(-10, 10), y: m.y - 28 - rnd(0, 10), size: 1, life: 1, c: hex('#e8ffb0'), c2: hex('#9ad060'), layer: 3 }); } }] });
  E.def('masquerain', { sp: 'Masquerain', scale: 0.36, speed: 34, persona: 'calm', loco: 'hover', hover: 44, active: 'day',
    pose: (m, st) => ({ flap: st.t * 16, mouth: 0 }),
    acts: [{ id: 'intimidate', w: 1, T: 1.6, face: 0.9, sfx: 'chime', p: () => ({ eyes: 'open' }), fx: (m, k) => { if (k > 0.4 && k < 0.45) FX.add({ type: 'ring', x: m.x, y: m.y - 10, r0: 4, r1: 20, life: 0.4, c: hex('#9ad8ff'), layer: 3 }); } },
      { id: 'hover', w: 2, T: [2, 3], p: () => ({}) }] });
  E.def('vigoroth', { sp: 'Vigoroth', scale: 0.45, speed: 64, persona: 'grumpy', active: 'any', roamRate: 0.9, actRate: 0.5,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, arms: st.t * (st.mv ? 12 : 7) + m.seed, mouth: 0.4 }),
    acts: [{ id: 'frenzy', w: 3, T: [1.4, 2.2], dash: 140, sfx: 'grr', vol: 0.4, p: (m, k, e) => ({ arms: e * 20, mouth: 1 }), fx: (m, k, dt) => { if (Math.random() < dt * 4) m.yaw = Math.PI - m.yaw; } },
      { id: 'scratch', w: 1, T: 1.2, sfx: 'scratch', p: (m, k, e) => ({ arms: e * 30, eyes: 'closed' }) }] });
  E.def('slaking', { sp: 'Slaking', scale: 0.56, speed: 10, persona: 'calm', active: 'day', hibernate: true, roamRate: 0.1, actRate: 0.7, alert: 0.3, diet: true,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, lie: st.mv ? 0 : 1, scratch: 0 }),
    acts: [{ id: 'lounge', w: 4, T: [4, 7], p: (m, k, e) => ({ lie: 1, eyes: Math.sin(e) > 0.6 ? 'closed' : 'open' }) },
      { id: 'yawn', w: 2, T: 2, sfx: 'yum', vol: 0.3, p: (m, k) => ({ lie: 1, mouth: Math.sin(k * Math.PI), eyes: 'closed' }) },
      { id: 'scratch', w: 1, T: 1.6, p: (m, k, e) => ({ lie: 1, scratch: 0.5 + 0.5 * Math.sin(e * 10) }) }] });
  // ---- birds and bugs ----
  E.def('swellow', { sp: 'Swellow', scale: 0.4, speed: 110, persona: 'showoff', loco: 'fly', alt: [70, 160], perch: 0.25, active: 'day', diet: true,
    pose: (m, st) => ({ flap: st.fly ? st.fl : 0, spread: st.fly ? 1 : 0, dive: st.act === 'dive' ? 1 : 0, perch: st.fly ? 0 : 1, walk: !st.fly && st.mv ? st.ph : 0 }),
    acts: [{ id: 'dive', w: 2, when: (m) => m.mode === 'fly', run: function* (m) { const tx = m.x + Math.cos(m.yaw) * 120, g = World.groundAt(tx); Game.sfx('whoosh', m.x, 0.5); yield* m.flyTo(tx, g - 16, m.speed * 1.8, 'dive', { agile: 4, peak: (d) => (d < 40 ? 1 : 0.6) }); yield* m.flyTo(tx + Math.cos(m.yaw) * 80, g - m.alt[1], m.speed, 'fly'); } },
      { id: 'aerial', w: 1, when: (m) => m.mode === 'fly', run: function* (m) { let e = 0; while (e < 1.2) { const dt = yield; e += dt; m.rot = e / 1.2 * Math.PI * 2; m.setAct('aerial', 0.9); } m.rot = 0; } }] });
  E.def('vibrava', { sp: 'Vibrava', scale: 0.38, speed: 40, persona: 'curious', loco: 'hover', hover: 34, active: 'day',
    pose: (m, st) => ({ flap: st.t * 40, spread: 1, mouth: 0 }),
    acts: [{ id: 'buzz', w: 3, T: [1.6, 2.4], face: 0.7, sfx: 'zap', p: () => ({ spread: 1, mouth: 0.5 }), fx: (m, k, dt) => { if (Math.random() < dt * 6) FX.add({ type: 'ring', x: m.x, y: m.y - 8, r0: 3, r1: 26, flat: 0.8, life: 0.5, c: hex('#bfffd0'), layer: 3 }); } }] });
  E.def('flygon', { sp: 'Flygon', scale: 0.52, speed: 38, persona: 'calm', loco: 'hover', hover: 46, active: 'any',
    pose: (m, st) => ({ flap: st.t * 22, spread: 1, walk: 0 }),
    acts: [{ id: 'sandstorm', w: 1, T: 2.4, sfx: 'dust', p: () => ({ spread: 1 }), fx: (m, k, dt) => { for (let i = 0; i < 2; i++) if (Math.random() < dt * 30) FX.add({ type: 'dust', x: m.x + rnd(-40, 40), y: World.groundAt(m.x) - rnd(0, 30), vx: rnd(40, 90) * (Math.random() < 0.5 ? -1 : 1), vy: -rnd(4, 16), r: 2, life: 0.8, c: hex('#f0d890'), c2: hex('#c8a060'), layer: 3 }); } },
      { id: 'glide', w: 2, T: [2, 3], p: () => ({ spread: 1 }) }] });
  // ---- beach ----
  E.def('crawdaunt', { sp: 'Crawdaunt', scale: 0.48, speed: 30, persona: 'grumpy', diet: true, active: 'any', prey: ['corphish'], chaseRate: 0.15,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, claw: 0.15 + Math.sin(st.t * 2 + m.seed) * 0.08, side: 3 * Math.cos(m.yaw) }),
    acts: [{ id: 'crabhammer', w: 2, T: 1.2, face: 0.6, sfx: 'snip', p: (m, k) => ({ claw: k < 0.5 ? 1 : 0.2, mouth: 0.6 }), fx: (m, k) => { if (k > 0.5 && k < 0.55) { Game.shake(1); FX.add({ type: 'ring', x: m.x + Math.cos(m.yaw) * 16, y: m.y - 4, r0: 2, r1: 14, flat: 0.4, life: 0.4, c: 0xffffffff, layer: 3 }); } } },
      { id: 'boss', w: 1, T: 2, face: 1, p: () => ({ claw: 1 }) }] });
  E.def('wynaut', { sp: 'Wynaut', scale: 0.36, speed: 34, persona: 'curious', baby: true, hopper: 120, active: 'day',
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, sway: Math.sin(st.t * 3 + m.seed) * 0.5 }),
    acts: [{ id: 'sway', dance: true, w: 2, T: [1.5, 2.5], p: (m, k, e) => ({ sway: Math.sin(e * 7), arms: 1, mouth: 1, eyes: 'happy' }) }],
    babyAct: { id: 'sway', T: 1.6, p: (m, k, e) => ({ sway: Math.sin(e * 7), arms: 1, mouth: 1, eyes: 'happy' }) } });
  E.def('wobbuffet', { sp: 'Wobbuffet', scale: 0.46, speed: 18, persona: 'calm', active: 'any', alert: 0.4,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, sway: Math.sin(st.t * 1.6 + m.seed) * 0.4, salute: 0, squish: 0 }),
    acts: [{ id: 'salute', w: 3, T: 1.8, face: 1, cry: true, p: (m, k) => ({ salute: Math.sin(k * Math.PI) > 0.3 ? 1 : 0, eyes: 'closed', mouth: 0.5 }) },
      { id: 'counter', w: 1, T: 1, sfx: 'boing', p: (m, k) => ({ squish: Math.sin(k * Math.PI) }), fx: (m, k) => { if (k > 0.5 && k < 0.56) FX.add({ type: 'ring', x: m.x, y: m.y - 24, r0: 4, r1: 30, life: 0.4, c: hex('#ffb0d0'), layer: 4 }); } }],
    onPoke: (m) => { m.doTask(m.perform(m.cfg.acts[1]), 3); m.emote('shock', 1); } });
  E.def('starmie', { sp: 'Starmie', scale: 0.38, speed: 60, loco: 'swim', persona: 'calm', active: 'night',
    pose: (m, st) => ({ spin: st.t * (st.mv ? 5 : 1.5), glow: 0.5 + 0.5 * Math.sin(st.t * 3) }),
    acts: [{ id: 'jewel', w: 2, T: [1.5, 2.5], sfx: 'twinkle', p: (m, k, e) => ({ spin: e * 14, glow: 1 }) }] });
  E.def('staryuS', { dex: 'staryu', sp: 'Staryu', scale: 0.32, speed: 50, loco: 'swim', persona: 'calm', active: 'night',
    pose: (m, st) => ({ spin: st.t * (st.mv ? 4 : 1.2), glow: 0.5 + 0.5 * Math.sin(st.t * 2.4 + m.seed), bend: Math.sin(st.t * 0.8 + m.seed) * 0.08 }),
    acts: [{ id: 'glow', w: 1, T: 1.6, p: () => ({ glow: 1 }) }] });
  // ---- forest babies ----
  E.def('budew', { sp: 'Budew', scale: 0.34, speed: 22, persona: 'shy', baby: true, active: 'day', hibernate: true,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, bloom: Eco.season() === 'spring' ? 1 : 0.3 }),
    acts: [{ id: 'bloom', w: 2, T: [2, 3], when: () => Game.hour() !== 'night', p: (m, k) => ({ bloom: Math.sin(k * Math.PI), tilt: Math.sin(k * 12) * 0.2 }), fx: (m) => { if (Math.random() < 0.1) FX.sparkles(m.x, m.y - 12, 2, 8, 0xffffffff, 0xffa0d8ff); } }] });
  // ---- Mt. Chimney ----
  E.def('numel', { sp: 'Numel', scale: 0.4, speed: 18, persona: 'calm', herd: 110, diet: true, active: 'day', hot: true,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, hump: 0.1 + Math.sin(st.t * 1.5 + m.seed) * 0.05, mouth: 0 }),
    acts: [{ id: 'ember', w: 2, T: 1.6, sfx: 'steam', vol: 0.4, p: (m, k) => ({ hump: Math.sin(k * Math.PI), eyes: 'happy' }), fx: (m, k, dt) => { if (Math.random() < dt * 24) fx.sparks(m, '#ffe070', '#ff5a10', 1, 22); if (Math.random() < dt * 5) fx.puff(m, 24); } },
      { id: 'graze', w: 3, T: [2, 3.5], p: (m, k, e) => ({ mouth: Math.sin(e * 10) > 0 ? 0.6 : 0.1 }) }] });
  E.def('spinda', { sp: 'Spinda', scale: 0.4, speed: 30, persona: 'curious', active: 'day', diet: true,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, wobble: st.t * 2.4 + m.seed, spots: m.spots || 1, mouth: 0.3 }),
    acts: [{ id: 'dizzy', w: 3, T: [1.6, 2.4], p: (m, k, e) => ({ wobble: e * 9, eyes: 'closed', mouth: 0.6 }), fx: (m, k, dt) => { m.x += Math.sin(Game.t * 5) * 20 * dt; if (Math.random() < dt * 2) FX.add({ type: 'icon', icon: 'swirl', x: m.x, y: m.y - 30, vx: 4, vy: -10, life: 1, layer: 3 }); } },
      { id: 'teeter', w: 1, dance: true, T: 2.4, sfx: 'boing', vol: 0.3, p: (m, k, e) => ({ wobble: e * 6, eyes: 'happy', mouth: 0.9 }), fx: (m, k) => { m.rot = Math.sin(k * Math.PI * 3) * 0.18; }, after: (m) => { m.rot = 0; } }] });
  E.def('torkoal', { sp: 'Torkoal', scale: 0.42, speed: 12, persona: 'shy', active: 'day', hot: true, wade: true,
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, smoke: 0, hide: 0, mouth: 0 }),
    acts: [{ id: 'smokering', w: 3, T: 2.2, face: 0.6, sfx: 'steam', vol: 0.5, p: (m, k) => ({ smoke: Math.sin(k * Math.PI), mouth: 0.4 }), fx: (m, k, dt) => { if (k > 0.3 && k < 0.34) { const [hx, hy] = m.at('top'); FX.add({ type: 'ring', x: hx, y: hy - 6, r0: 3, r1: 10, flat: 0.5, life: 1.6, c: 0xffd8d4d0, layer: 4, vy: -18 }); } if (Math.random() < dt * 8) fx.puff(m, 26); } },
      { id: 'hide', w: 1, T: [2, 3], p: () => ({ hide: 1, eyes: 'closed' }) }] });
  E.def('slugma', { sp: 'Slugma', scale: 0.34, speed: 10, persona: 'calm', active: 'any', hot: true, lavaOk: true, wade: true,
    pose: (m, st) => ({ ooze: st.t * (st.mv ? 5 : 1.6) + m.seed, mouth: 0.2 }),
    physics: (m) => { const L = Game.area && Game.area.def.LAVAS && Game.area.def.LAVAS.find((q) => m.x > q.x0 && m.x < q.x1 && World.groundAt(m.x) > q.y); if (L) { m.y = L.y + 6; return true; } return false; },
    acts: [{ id: 'melt', w: 2, T: 2, sfx: 'lava', vol: 0.4, p: () => ({ eyes: 'happy' }), fx: (m, k, dt) => { if (Math.random() < dt * 16) fx.sparks(m, '#ffe070', '#ff3a10', 1, 8); } }] });
  // ---- the Eon duo ----
  E.def('latias', { sp: 'Latias', scale: 0.4, speed: 90, persona: 'shy', loco: 'fly', alt: [50, 140], perch: 0, active: 'any', alert: 0.6,
    pose: (m, st) => ({ fly: 1, bank: bank(st), mouth: 0 }),
    acts: [{ id: 'cloak', w: 2, T: 2.5, sfx: 'twinkle', p: () => ({ eyes: 'happy' }), fx: (m, k) => { m.hideK = Math.sin(k * Math.PI) * 0.85; }, after: (m) => { m.hideK = 0; } },
      { id: 'mistball', w: 1, T: 1.6, face: 0.6, sfx: 'chime', p: (m, k) => ({ mouth: 0.6 }), fx: (m, k, dt) => { if (Math.random() < dt * 20) fx.sparks(m, '#ffffff', '#ff9ac8', 1, 6); } }] });
  E.def('latios', { sp: 'Latios', scale: 0.42, speed: 110, persona: 'calm', loco: 'fly', alt: [50, 150], perch: 0, active: 'any', alert: 0.6,
    pose: (m, st) => ({ fly: 1, bank: bank(st), mouth: 0 }),
    acts: [{ id: 'lusterpurge', w: 1, T: 1.6, face: 0.6, sfx: 'zap', p: () => ({ mouth: 0.8 }), fx: (m, k, dt) => { if (Math.random() < dt * 20) fx.sparks(m, '#ffffff', '#6ab0ff', 1, 6); } },
      { id: 'race', w: 2, run: function* (m) { const tx = clamp(m.x + (Math.random() < 0.5 ? -1 : 1) * 300, m.minX, m.maxX); Game.sfx('whoosh', m.x, 0.5); yield* m.flyTo(tx, m.y + rnd(-20, 20), m.speed * 2.2, 'race', { agile: 3, peak: () => 0.8 }); } }] });
  // ---- Shoal Cave (Spheal and Sealeo on the snowy shore) ----
  E.def('snorunt', { sp: 'Snorunt', scale: 0.38, speed: 36, persona: 'shy', cold: true, active: 'any',
    pose: (m, st) => ({ walk: st.mv ? st.ph : 0, shiver: Eco.season() === 'winter' || (Game.area && Game.area.def.cave) ? 0 : Math.sin(st.t * 30) * 0.3 }),
    acts: [{ id: 'snowplay', w: 2, T: [1.6, 2.4], sfx: 'crunch', when: () => Eco.season() === 'winter' || (Game.area && Game.areaId === 'shoal'), p: () => ({ mouth: 1, eyes: 'happy' }), hop: 160 },
      { id: 'hide', w: 1, T: 2.5, p: () => ({ shiver: 0.6, eyes: 'closed' }) }] });
  E.def('sphealS', { dex: 'spheal', sp: 'Spheal', scale: 0.36, speed: 34, persona: 'curious', cold: true, herd: 90, diet: true, active: 'any',
    pose: (m, st) => ({ roll: st.mv ? st.ph * 1.2 : 0, squash: Math.sin(st.t * 2.1 + m.seed) * 0.02, clap: 0, mouth: 0.25, headPitch: 0, tailWag: Math.sin(st.t * 3 + m.seed) * 0.4 }),
    acts: [{ id: 'clap', w: 2, T: 1.6, face: 0.8, sfx: 'clap', p: (m, k, e) => ({ clap: Math.sin(e * 18) > 0 ? 1 : 0, eyes: 'happy', mouth: 1 }) },
      { id: 'roll', w: 2, T: 1.4, dash: 90, p: (m, k, e) => ({ roll: e * 9 }) }] });
  E.def('sealeoS', { dex: 'sealeo', sp: 'Sealeo', scale: 0.44, speed: 24, persona: 'showoff', cold: true, active: 'any',
    pose: (m, st) => ({ squash: Math.sin(st.t * 1.8 + m.seed) * 0.015, headPitch: 0.05, headYaw: 0, mouth: 0.2, flipper: 0, clap: 0, tailWag: Math.sin(st.t * 2.2) * 0.3, lean: 0 }),
    acts: [{ id: 'pose', w: 2, T: 2, face: 1, p: () => ({ headPitch: -0.2, mouth: 0.6, eyes: 'happy' }) },
      { id: 'clap', w: 1, T: 1.4, sfx: 'clap', p: (m, k, e) => ({ clap: Math.sin(e * 16) > 0 ? 1 : 0, flipper: 0.8 }) }] });

  /* ===================== Pokédex pages ===================== */
  Object.assign(DexData.TYPES, { Fairy: '#f0a0d0', Fighting: '#c05a3a', Fire: '#f08030', Poison: '#a040a0' });
  const D = DexData.S;
  const add = (id, e) => { D[id] = e; if (!DexData.ORDER.includes(id)) DexData.ORDER.push(id); };
  const B = (n, tier, hint) => ({ n, tier, hint });
  add('marshtomp', { no: 259, name: 'Marshtomp', type: ['Water', 'Ground'], h: 0.7, area: ['beach'], persona: 'curious', blurb: 'Mudkip all grown up! It plays in the mud along the shore and is much stronger than it looks.', beh: { walk: B('Stomping', 1, 'Marshtomp stomps along the beach.'), mudplay: B('Mud play', 2, 'It loves splashing in wet sand.'), flex: B('Flexing', 3, 'Stand close and it shows off its muscles.'), family: B('Big brother', 4, 'Marshtomp watches over the little ones.') }, obj: [{ id: 'marshtomp.flex', t: 'Marshtomp flexing', beh: 'flex', reward: 'pts:400' }] });
  add('swampert', { no: 260, name: 'Swampert', type: ['Water', 'Ground'], h: 1.5, area: ['beach'], persona: 'calm', blurb: 'The final form of the Mudkip line. It can haul huge boulders and senses storms coming through its fins.', beh: { walk: B('Striding', 1, 'Swampert patrols the shore.'), guard: B('On guard', 2, 'It crouches low, ready for anything.'), mudshot: B('Mud Shot', 3, 'Swampert flings mud when it plays.'), roar: B('Mighty roar', 4, 'Get it to face you... and roar!') }, obj: [{ id: 'swampert.roar', t: 'Swampert roaring', beh: 'roar', reward: 'pts:700' }, { id: 'swampert.mud', t: 'Swampert\'s Mud Shot', beh: 'mudshot', reward: 'pts:500' }] });
  add('azurill', { no: 298, name: 'Azurill', type: ['Normal', 'Fairy'], h: 0.2, area: ['forest'], persona: 'curious', baby: 1, blurb: 'A baby Pokémon that bounces on its big rubbery tail. It follows Marill everywhere.', beh: { walk: B('Toddling', 1, 'Azurill toddle after Marill by the pond.'), bounce: B('Tail bounce', 3, 'Azurill bounce on their tails when happy.'), nuzzle: B('Nuzzle', 3, 'Babies love their family.'), tailspin: B('Tail spin', 2, 'It spins its tail like a ball.') }, obj: [{ id: 'azurill.bounce', t: 'Azurill bouncing', beh: 'bounce', reward: 'pts:400' }] });
  add('marill', { no: 183, name: 'Marill', type: ['Water', 'Fairy'], h: 0.4, area: ['forest'], persona: 'curious', blurb: 'Its oily tail ball floats on water, so it never sinks. It dives to eat water plants.', beh: { walk: B('Waddling', 1, 'Marill waddle around the pond.'), swim: B('Swimming', 2, 'Watch it paddle in the pond.'), splash: B('Splash play', 3, 'Marill splash about when they swim.'), family: B('Family time', 4, 'Marill looks after little Azurill.') }, obj: [{ id: 'marill.splash', t: 'Marill splashing', beh: 'splash', reward: 'pts:400' }] });
  add('azumarill', { no: 184, name: 'Azumarill', type: ['Water', 'Fairy'], h: 0.8, area: ['forest'], persona: 'calm', blurb: 'Its long ears can hear the tiniest sound. It makes bubble balloons for crying children.', beh: { walk: B('Strolling', 1, 'Azumarill stroll by the water.'), swim: B('Swimming', 2, 'It swims in the woods pond.'), bubblebeam: B('Bubble Beam', 3, 'Azumarill blows bubbles when it swims.'), family: B('Family time', 4, 'The whole family by the pond!') }, obj: [{ id: 'azumarill.bubble', t: 'Azumarill\'s Bubble Beam', beh: 'bubblebeam', reward: 'pts:500' }] });
  add('lombre', { no: 271, name: 'Lombre', type: ['Water', 'Grass'], h: 1.2, area: ['forest'], persona: 'showoff', blurb: 'A cheeky prankster of the riverside. It loves to surprise fishermen, and dances at twilight.', beh: { walk: B('Sneaking', 1, 'Lombre creeps by the river at dawn and dusk.'), dance: B('River dance', 3, 'Play a song near Lombre.'), prank: B('Prank face', 2, 'Lombre loves a good trick.') }, obj: [{ id: 'lombre.dance', t: 'Lombre dancing', beh: 'dance', reward: 'pts:500' }] });
  add('nuzleaf', { no: 274, name: 'Nuzleaf', type: ['Grass', 'Dark'], h: 1.0, area: ['forest'], persona: 'showoff', blurb: 'It plays a leaf flute that makes listeners uneasy. Seedot gather round when it plays.', beh: { walk: B('Prowling', 1, 'Nuzleaf wander near the Seedot tree.'), whistle: B('Leaf flute', 3, 'Nuzleaf plays the leaf on its head like a flute.'), leafdance: B('Leaf dance', 2, 'It twirls its leaf when happy.') }, obj: [{ id: 'nuzleaf.whistle', t: 'Nuzleaf playing its leaf flute', beh: 'whistle', reward: 'pts:500' }] });
  add('linoone', { no: 264, name: 'Linoone', type: ['Normal'], h: 0.5, area: ['forest'], persona: 'curious', blurb: 'It charges in straight lines at amazing speed — but cannot turn corners. It races Zigzagoon for fun.', beh: { walk: B('Trotting', 1, 'Linoone trot through the grass.'), dash: B('Straight dash', 3, 'Linoone sprint dead straight. Snap it at full speed!'), sniff: B('Sniffing', 2, 'It sniffs for buried treasure.'), chase: B('Racing Zigzagoon', 4, 'Linoone loves a race with Zigzagoon.') }, obj: [{ id: 'linoone.dash', t: 'Linoone dashing', beh: 'dash', reward: 'pts:500' }] });
  add('breloom', { no: 286, name: 'Breloom', type: ['Grass', 'Fighting'], h: 1.2, area: ['forest'], persona: 'showoff', blurb: 'Its stretchy arms throw lightning-fast punches. It trains the young Shroomish.', beh: { walk: B('Hopping', 1, 'Breloom hop among the mushrooms.'), machpunch: B('Mach Punch', 4, 'Breloom\'s punch is so fast — time your shot!'), spores: B('Spore cloud', 2, 'Breloom puffs spores from its cap.') }, obj: [{ id: 'breloom.punch', t: 'Breloom\'s Mach Punch', beh: 'machpunch', reward: 'pts:700' }] });
  add('masquerain', { no: 284, name: 'Masquerain', type: ['Bug', 'Flying'], h: 0.8, area: ['forest'], persona: 'calm', blurb: 'The eye patterns on its antennae scare off enemies. It hovers over ponds like a little helicopter.', beh: { float: B('Hovering', 1, 'Masquerain hover over the pond.'), hover: B('Hovering', 1, 'Look over the pond.'), intimidate: B('Scary eyes', 3, 'It flashes its big eye patterns at you.') }, obj: [{ id: 'masquerain.eyes', t: 'Masquerain\'s scary eyes', beh: 'intimidate', reward: 'pts:500' }] });
  add('vigoroth', { no: 288, name: 'Vigoroth', type: ['Normal'], h: 1.4, area: ['forest'], persona: 'grumpy', blurb: 'It cannot keep still — its blood boils and it must run around. It never lets Slakoth sleep in peace.', beh: { walk: B('Restless', 1, 'Vigoroth never stops moving.'), frenzy: B('Frenzy', 3, 'It goes wild, arms spinning!'), scratch: B('Scratching', 2, 'Vigoroth scratches everything.') }, obj: [{ id: 'vigoroth.frenzy', t: 'Vigoroth in a frenzy', beh: 'frenzy', reward: 'pts:500' }] });
  add('slaking', { no: 289, name: 'Slaking', type: ['Normal'], h: 2.0, area: ['forest'], persona: 'calm', blurb: 'The laziest Pokémon of all. It lies on its side eating the grass within reach, then scoots to a new spot.', beh: { lounge: B('Lounging', 1, 'Slaking lies around all day.'), yawn: B('Big yawn', 3, 'Catch Slaking mid-yawn.'), scratch: B('Belly scratch', 2, 'It scratches its tummy.'), walk: B('Moving?!', 4, 'Slaking walking is a rare sight indeed.') }, obj: [{ id: 'slaking.yawn', t: 'Slaking yawning', beh: 'yawn', reward: 'pts:500' }, { id: 'slaking.walk', t: 'Slaking actually moving', beh: 'walk', reward: 'pts:900' }] });
  add('swellow', { no: 277, name: 'Swellow', type: ['Normal', 'Flying'], h: 0.7, area: ['canopy'], persona: 'showoff', blurb: 'It keeps its glossy wings in perfect condition, and teaches young Taillow to fly.', beh: { fly: B('Soaring', 1, 'Swellow circle above Treetop Town.'), dive: B('Steep dive', 3, 'Swellow dive at blinding speed.'), aerial: B('Aerial Ace', 4, 'It loops the loop!') }, obj: [{ id: 'swellow.dive', t: 'Swellow diving', beh: 'dive', reward: 'pts:500' }, { id: 'swellow.ace', t: 'Swellow\'s loop-the-loop', beh: 'aerial', reward: 'pts:700' }] });
  add('vibrava', { no: 329, name: 'Vibrava', type: ['Ground', 'Dragon'], h: 1.1, area: ['beach'], persona: 'curious', blurb: 'It vibrates its wings so fast they make ultrasonic waves. It hovers over the Fossil Cliffs.', beh: { float: B('Hovering', 1, 'Vibrava hover near Trapinch\'s pit.'), buzz: B('Sonic wings', 3, 'Vibrava buzz their wings to make sound waves.') }, obj: [{ id: 'vibrava.buzz', t: 'Vibrava buzzing its wings', beh: 'buzz', reward: 'pts:500' }] });
  add('flygon', { no: 330, name: 'Flygon', type: ['Ground', 'Dragon'], h: 2.0, area: ['beach'], persona: 'calm', blurb: 'The Desert Spirit. Its wings sing as it flies, whipping up sandstorms — and it can carry a rider far away.', beh: { float: B('Hovering', 1, 'Flygon hover over the Fossil Cliffs.'), glide: B('Gliding', 2, 'Flygon glide on the sea breeze.'), sandstorm: B('Sandstorm', 4, 'Flygon whips up the sand with its wings.') }, obj: [{ id: 'flygon.storm', t: 'Flygon\'s sandstorm', beh: 'sandstorm', reward: 'pts:700' }] });
  add('crawdaunt', { no: 342, name: 'Crawdaunt', type: ['Water', 'Dark'], h: 1.1, area: ['beach'], persona: 'grumpy', blurb: 'The rogue of the beach. It bosses the Corphish around and snaps its claws at anything that comes near.', beh: { walk: B('Swaggering', 1, 'Crawdaunt swagger along the shore.'), boss: B('Boss pose', 2, 'It shows off its huge claws.'), crabhammer: B('Crabhammer', 4, 'Snap Crawdaunt mid-swing.'), chase: B('Bossing Corphish', 3, 'It chases Corphish around.') }, obj: [{ id: 'crawdaunt.hammer', t: 'Crawdaunt\'s Crabhammer', beh: 'crabhammer', reward: 'pts:700' }] });
  add('wynaut', { no: 360, name: 'Wynaut', type: ['Psychic'], h: 0.6, area: ['beach', 'volcano'], persona: 'curious', baby: 1, blurb: 'A cheerful baby Pokémon. It sways in happy groups and toughens up by pushing against its friends.', beh: { walk: B('Bouncing', 1, 'Wynaut bounce around.'), sway: B('Happy sway', 2, 'Wynaut sways when it is happy... or when music plays.'), nuzzle: B('Nuzzle', 3, 'Babies love their family.') }, obj: [{ id: 'wynaut.sway', t: 'Wynaut swaying', beh: 'sway', reward: 'pts:300' }] });
  add('wobbuffet', { no: 202, name: 'Wobbuffet', type: ['Psychic'], h: 1.3, area: ['volcano'], persona: 'calm', blurb: 'It hates light and shock. When attacked, it puffs up and counters! Wobbuffet salutes everyone it meets.', beh: { walk: B('Wobbling', 1, 'Wobbuffet wobble by the bathhouse.'), salute: B('Salute!', 3, 'WOBBUFFET! (It salutes.)'), counter: B('Counter', 4, 'Poke it and it bounces back!'), family: B('Proud parent', 4, 'Wobbuffet looks after the Wynaut.') }, obj: [{ id: 'wobbuffet.salute', t: 'Wobbuffet saluting', beh: 'salute', reward: 'pts:500' }, { id: 'wobbuffet.counter', t: 'Wobbuffet countering', beh: 'counter', reward: 'pts:600' }] });
  add('starmie', { no: 121, name: 'Starmie', type: ['Water', 'Psychic'], h: 1.1, area: ['beach', 'shoal'], persona: 'calm', blurb: 'Its jewel core shines in seven colours. At night it spins through the sea like a falling star.', beh: { swim: B('Spinning swim', 2, 'Starmie swim at night.'), jewel: B('Jewel flash', 3, 'Its core flashes as it spins.') }, obj: [{ id: 'starmie.jewel', t: 'Starmie flashing its core', beh: 'jewel', reward: 'pts:500' }] });
  add('budew', { no: 406, name: 'Budew', type: ['Grass', 'Poison'], h: 0.2, area: ['forest'], persona: 'shy', baby: 1, blurb: 'A tiny baby bud. In spring its bud opens a little and it smells wonderful. In winter it stays shut tight.', beh: { idle: B('Budding', 1, 'Look closely in the forest flowers.'), bloom: B('Blooming', 3, 'Budew bloom best in spring sunshine.') }, obj: [{ id: 'budew.bloom', t: 'Budew blooming', beh: 'bloom', reward: 'pts:400' }] });
  add('snorunt', { no: 361, name: 'Snorunt', type: ['Ice'], h: 0.7, area: ['canopy', 'shoal'], persona: 'shy', blurb: 'It is said that a home visited by Snorunt will prosper. It shivers in summer but plays happily in snow.', beh: { walk: B('Pattering', 1, 'Snorunt wander the ice.'), hide: B('Hiding', 2, 'Shy Snorunt hide their faces.'), snowplay: B('Snow play', 4, 'Snorunt love to play in the snow and ice.') }, obj: [{ id: 'snorunt.snow', t: 'Snorunt playing in snow', beh: 'snowplay', reward: 'hat.beanie' }] });
  add('numel', { no: 322, name: 'Numel', type: ['Fire', 'Ground'], h: 0.7, area: ['volcano'], persona: 'calm', blurb: 'Magma bubbles inside its hump at 1,200°C. It is so slow it barely notices when you touch it.', beh: { walk: B('Plodding', 1, 'Numel plod across the ash fields.'), graze: B('Grazing', 1, 'Numel nibble the ashy grass.'), ember: B('Hump ember', 3, 'Its hump puffs embers when it is happy.') }, obj: [{ id: 'numel.ember', t: 'Numel puffing embers', beh: 'ember', reward: 'pts:400' }] });
  add('spinda', { no: 327, name: 'Spinda', type: ['Normal'], h: 1.1, area: ['volcano'], persona: 'curious', blurb: 'No two Spinda have the same spot pattern! It totters about as if dizzy — which confuses its foes.', beh: { walk: B('Tottering', 1, 'Spinda totter about on the ash.'), dizzy: B('Dizzy spin', 3, 'Spinda get dizzy... very dizzy.'), teeter: B('Teeter Dance', 4, 'Play a song and Spinda starts its famous dance.') }, obj: [{ id: 'spinda.teeter', t: 'Spinda\'s Teeter Dance', beh: 'teeter', reward: 'pts:700' }] });
  add('torkoal', { no: 324, name: 'Torkoal', type: ['Fire'], h: 0.5, area: ['volcano'], persona: 'shy', blurb: 'It burns coal in its shell for energy, and blows black smoke rings from its nostrils.', beh: { walk: B('Crawling', 1, 'Torkoal crawl near the hot spring.'), smokering: B('Smoke ring', 3, 'Torkoal puffs perfect smoke rings.'), hide: B('Shell hide', 2, 'Shy Torkoal pull into their shells.') }, obj: [{ id: 'torkoal.ring', t: 'Torkoal\'s smoke ring', beh: 'smokering', reward: 'pts:500' }] });
  add('slugma', { no: 218, name: 'Slugma', type: ['Fire'], h: 0.7, area: ['volcano'], persona: 'calm', blurb: 'Its body is made of magma. If it stops moving it cools and hardens, so it keeps oozing about.', beh: { walk: B('Oozing', 1, 'Slugma ooze through the lava puddles.'), melt: B('Melting glow', 3, 'Slugma glows hotter when happy.') }, obj: [{ id: 'slugma.melt', t: 'Slugma glowing', beh: 'melt', reward: 'pts:500' }] });
  add('latias', { no: 380, name: 'Latias', type: ['Dragon', 'Psychic'], h: 1.4, area: ['volcano', 'shoal'], legendary: 1, rare: 2, persona: 'shy', blurb: 'A legendary Pokémon that can bend light to turn invisible. Gentle and shy, she understands human feelings.', beh: { fly: B('Gliding', 3, 'Latias glides through the sky.'), float: B('Hovering', 2, 'Latias hides near the bathhouse.'), cloak: B('Invisible!', 4, 'Latias fades from view... snap it just before!'), mistball: B('Mist Ball', 4, 'A glowing ball of mist.'), pair: B('Eon duo', 4, 'Latias and Latios flying together!') }, obj: [{ id: 'latias.cloak', t: 'Latias turning invisible', beh: 'cloak', reward: 'pts:1000' }, { id: 'latias.pair', t: 'The Eon duo flying together', beh: 'pair', reward: 'pts:1500' }] });
  add('latios', { no: 381, name: 'Latios', type: ['Dragon', 'Psychic'], h: 2.0, area: ['shoal'], legendary: 1, rare: 2, persona: 'calm', blurb: 'A legendary Pokémon that can fly faster than a jet plane. He shares what he sees with Latias.', beh: { fly: B('Soaring', 3, 'Latios soars over the frozen sea.'), race: B('Jet speed', 4, 'Latios races across the sky.'), lusterpurge: B('Luster Purge', 4, 'A burst of blue light.'), pair: B('Eon duo', 4, 'Latios and Latias flying together!') }, obj: [{ id: 'latios.race', t: 'Latios at full speed', beh: 'race', reward: 'pts:1000' }] });
  add('groudon', { no: 383, name: 'Groudon', type: ['Ground'], h: 3.5, area: ['volcano'], legendary: 1, rare: 2, persona: 'calm', blurb: 'The legendary Pokémon said to have raised the land. It sleeps in magma, and its light dries up the rain.', beh: { sleep: B('Magma slumber', 3, 'Something enormous sleeps in the crater\'s lava.'), rise: B('Awakening', 4, 'Solve the magma stones...'), roar: B('Earth-shaking roar', 4, 'Groudon roars at the sky.'), drought: B('Drought', 4, 'Its roar makes the sunlight blaze.'), glow: B('Lava lines', 3, 'Its markings glow like magma.') }, obj: [{ id: 'groudon.rise', t: 'Groudon awakening', beh: 'rise', reward: 'pts:1500' }, { id: 'groudon.drought', t: 'Groudon calling the sun', beh: 'drought', reward: 'pts:1200' }] });
  add('regice', { no: 378, name: 'Regice', type: ['Ice'], h: 1.8, area: ['shoal'], legendary: 1, rare: 2, persona: 'calm', blurb: 'Its body is made of Antarctic ice that never melts. It was sealed away in a cave long ago.', beh: { dormant: B('Frozen', 3, 'A giant frozen in the ice chamber.'), awake: B('Awakening', 4, 'Stand in the circle, be still... then sing.'), icebeam: B('Ice Beam', 4, 'Regice breathes a freezing beam.'), glow: B('Braille glow', 3, 'Its seven dots glow.') }, obj: [{ id: 'regice.awake', t: 'Regice awakening', beh: 'awake', reward: 'pts:1500' }, { id: 'regice.beam', t: 'Regice\'s Ice Beam', beh: 'icebeam', reward: 'pts:1000' }] });
  add('rayquaza', { no: 384, name: 'Rayquaza', type: ['Dragon', 'Flying'], h: 7.0, area: ['canopy', 'volcano'], legendary: 1, rare: 2, persona: 'calm', blurb: 'It lives in the ozone layer and descends to calm Groudon and Kyogre when they clash.', beh: { soar: B('Sky dragon', 4, 'Once a great Pokémon wakes, watch the sky...'), roar: B('Dragon roar', 4, 'Rayquaza roars as it passes overhead.') }, obj: [{ id: 'rayquaza.soar', t: 'Rayquaza soaring overhead', beh: 'soar', reward: 'pts:2000' }, { id: 'rayquaza.roar', t: 'Rayquaza roaring', beh: 'roar', reward: 'pts:2000' }] });
  // every creature also shares the ecosystem moments
  for (const k of ['marshtomp', 'swampert', 'marill', 'azumarill', 'wobbuffet', 'numel']) if (D[k] && !D[k].beh.family) D[k].beh.family = B('Family time', 4, 'Watch it with its little ones.');
  for (const k of Object.keys(E.SP)) { const d = D[E.SP[k].dex || k]; if (d) { d.beh.eat = d.beh.eat || B('Snacking', 2, 'Hungry Pokémon raid ripe berry bushes.'); d.beh.sleep = d.beh.sleep || B('Sleeping', 1, 'Come back when it is resting.'); } }
  DexData.ORDER.sort((a, b) => D[a].no - D[b].no);
  Object.assign(DexData.AREAS, {
    volcano: { name: 'Fiery Path', sub: 'Mt. Chimney · Lavaridge', need: 99, blurb: 'Ash falls like snow on the slopes of a smoking volcano. A hot-spring town, jagged black rock, and a crater full of magma.' },
    shoal: { name: 'Shoal Cave', sub: 'Route 125 Ice Cave', need: 99, blurb: 'A snowy islet with an ice cave full of frozen waterfalls, glittering tide pools and an ancient sealed chamber.' },
  });

  /* ===================== chatter ===================== */
  Object.assign(Talk.CHAT || {}, {
    marshtomp: ['Marsh-tomp!', '(It flexes proudly.) You look just like I did!', 'Mud fight? MUD FIGHT!'],
    swampert: ['Swam-pert.', '(It pats your head gently with a huge hand.)', 'A storm is coming... I can feel it in my fins.'],
    azurill: ['Azu! Azu!', '(It bounces on its tail. Boing boing!)'], marill: ['Ma-rill!', '(Its tail ball bobs happily.)'], azumarill: ['Azu-marill.', '(It hears you before you speak.)'],
    lombre: ['Lom-bre! Hehe!', '(It is hiding something behind its back.)'], nuzleaf: ['Nuz...', '(It toots a note on its leaf.)'], linoone: ['Lin-oone!', 'Race you! Straight line only!'],
    breloom: ['Bre-loom!', '(It shadowboxes at lightning speed.)'], masquerain: ['Masq...', '(Its big eye patterns stare at you.)'], vigoroth: ['VIGO! VIGO! VIGO!', 'Can\'t stop! Won\'t stop!'],
    slaking: ['...', '(Slaking scratches its belly and does not look at you.)'], swellow: ['Swel-loooow!', '(It preens its glossy wings.)'], vibrava: ['Bzzzzz!', '(Its wings hum like a tuning fork.)'],
    flygon: ['Flyyy-gon!', '(Its wings sing a desert song.)'], crawdaunt: ['*SNAP*', 'This is MY beach, shrimp.'], wynaut: ['Wynaut!', '(It sways left and right.)'],
    wobbuffet: ['WOBBUFFET!', '(It salutes.)'], starmie: ['Hyah!', '(Its jewel blinks in seven colours.)'], budew: ['Bu...', '(Its little bud trembles.)'],
    snorunt: ['Snow-run!', '(It shivers... happily?)'], numel: ['Nuuu...mel.', '(It forgot what it was doing.)'], spinda: ['Spin-daaa~', '(It wobbles in a little circle.)'],
    torkoal: ['*puff puff*', '(A smoke ring drifts from its nose.)'], slugma: ['*blorp*', '(It is very warm. Maybe don\'t hug it.)'], latias: ['Ahh~', '(She tilts her head curiously.)'], latios: ['Hyuuu!', '(He looks toward the sea.)'],
    groudon: ['GROOOOAR!', '(The ground trembles.)'], regice: ['...', '(Seven dots glow in a pattern.)'], rayquaza: ['...!'], sphealS: ['Spheal!'], sealeoS: ['Sea-leo!'],
  });

  /* ===================== quests ===================== */
  Talk.QUESTS.push(
    { id: 'q.flygon', area: 'beach', giver: 'flygon', title: 'Wings of the Desert',
      intro: ['(Flygon hums a desert song. Its wings buzz like singing sand.)', 'Flyyy-gon! (It points at the smoking mountain far away.)', 'It could fly you to Mt. Chimney... if you photograph a Vibrava buzzing its wings!'],
      photo: { sp: 'vibrava', beh: 'buzz' }, wait: ['(Flygon waits. Find a Vibrava by the Fossil Cliffs and snap it buzzing.)'],
      done: ['FLYYYGON! (It loves the photo!)', '(Climb on! Next stop: Fiery Path!)'], reward: 'pts:500', unlock: 'volcano' },
    { id: 'q.latias', area: 'volcano', giver: 'latias', title: 'The Shy Dragon',
      intro: ['(Latias shimmers into view, then hides behind her wings.)', '...Latios is waiting for me at Shoal Cave, across the sea.', 'I am too nervous... Could you show me a photo of Torkoal blowing a smoke ring? It always makes me laugh!'],
      photo: { sp: 'torkoal', beh: 'smokering' }, wait: ['(Latias peeks out. "A smoke ring photo, please...")'],
      done: ['Hehe! Look at that smoke ring!', 'I feel brave now. Hold on tight — we fly to Shoal Cave!'], reward: 'pts:600', unlock: 'shoal' },
    { id: 'q.numel', area: 'volcano', giver: 'numel', title: 'Sleepy Numel',
      intro: ['Nuuu...mel.', '(Numel is so slow it forgot what it was doing.)', '(Maybe a song right next to it will wake it up!)'],
      progress: 'song', n: 1, wait: ['Nuuu... (It is still waiting for a song.)'], done: ['NUMEL! (Its hump puffs a happy ember.)', '(It nudges some warm Razz Berries toward you.)'], reward: 'pts:400', onDone: () => Save.addItem('razz', 2) },
    { id: 'q.spinda', area: 'volcano', giver: 'spinda', title: 'Dizzy Dance',
      intro: ['Spin-daaa~', 'Everything is spinning... is it spinning for you too?', 'Show me three dizzy belly flops next to me! (Jump, then press Down!)'],
      progress: 'flops', n: 3, wait: ['Spin-da! {left} more!'], done: ['Wheeeee! Now YOU are dizzy too!', '(It teaches you its secret wobble. Your photos sparkle a little more!)'], reward: 'pts:500' },
    { id: 'q.wobbuffet', area: 'volcano', giver: 'wobbuffet', title: 'Proud Parent',
      intro: ['WOBBUFFET!', '(It points at the little Wynaut swaying nearby, then at your camera.)', '(It wants a photo of its Wynaut swaying happily!)'],
      photo: { sp: 'wynaut', beh: 'sway' }, wait: ['WOBBU? (A swaying Wynaut photo, please!)'], done: ['WOBBUFFEEET!!', '(It salutes you very, very proudly.)'], reward: 'pts:500' },
    { id: 'q.slaking', area: 'forest', giver: 'slaking', title: 'Lazy Lunch',
      intro: ['...', '(Slaking points at its mouth. Then at the berry bushes. Then closes its eyes.)', '(Bring it 2 Nanab Berries. It is not getting up.)'],
      fetch: { item: 'nanab', n: 2 }, wait: ['... (Still waiting. {left} more Nanab Berries.)'], done: ['*munch*... *munch*...', '(Slaking gives you a thumbs up without opening its eyes.)'], reward: 'pts:500' },
    { id: 'q.azurill', area: 'forest', giver: 'azurill', title: 'Bounce Bounce',
      intro: ['Azu! Azu!', '(It bounces on its tail, again and again.)', '(It wants a photo of itself mid-bounce!)'],
      photo: { sp: 'azurill', beh: 'bounce' }, wait: ['Azu? (Did you get my bounce?)'], done: ['AZU-RILL! (It bounces so high it lands in the pond.)', '(Marill fishes it out and thanks you.)'], reward: 'pts:400' },
    { id: 'q.latios', area: 'shoal', giver: 'latios', title: 'Eon Duo',
      intro: ['Hyuuu... (Latios looks relieved to see Latias.)', 'Thank you for bringing her here.', 'We fly together over the frozen sea at dusk. Will you photograph us side by side?'],
      photo: { sp: 'latias', beh: 'pair' }, wait: ['(Watch the sky over the shore around dusk...)'], done: ['What a beautiful photo...', 'Latias says you are the best photographer in Hoenn!'], reward: 'pts:1200' },
  );

  /* ===================== flights and map ===================== */
  if (typeof Mailman !== 'undefined') {
    Object.assign(Mailman.CARRIER, { volcano: 'flygon', shoal: 'latias' });
    Object.assign(Mailman.CSP, {
      flygon: { sp: 'Flygon', scale: 0.46, name: 'Flygon', flap: (k) => ({ flap: k * 2.2, spread: 1, eyes: 'happy', mouth: 0.3 }) },
      latias: { sp: 'Latias', scale: 0.4, name: 'Latias', flap: (k) => ({ fly: 1, bank: k * 0.25, eyes: 'happy', mouth: 0.3 }) },
    });
  }
  if (typeof WorldMap !== 'undefined' && WorldMap.LOC) Object.assign(WorldMap.LOC, {
    volcano: { x: 122, y: 118, yaw: 0.1, label: 'Fiery Path' },
    shoal: { x: 44, y: 214, yaw: -0.7, label: 'Shoal Cave' },
  });

  /* ===================== spawns in the existing places ===================== */
  const wrap = (id, fn) => { const A = Areas[id]; if (!A) return; const s0 = A.spawn; A.spawn = (a, G) => { s0(a, G); try { fn(a, G); } catch (e) { console.error(e); } }; };
  wrap('beach', (A, G) => {
    E.add(G, 'marshtomp', 760, { range: 240 });
    E.add(G, 'swampert', 1060, { range: 200 });
    E.add(G, 'wynaut', 640, { range: 180 }); E.add(G, 'wynaut', 700, { range: 180 });
    E.add(G, 'crawdaunt', 1100, { range: 260 });
    E.add(G, 'vibrava', 4620, { range: 200 }); E.add(G, 'vibrava', 4880, { range: 160 });
    E.add(G, 'flygon', 5060, { range: 220 });
    const h = Game.hour();
    if (h === 'night' || h === 'dusk') E.add(G, 'starmie', 2000, { box: { x0: 1500, x1: 2600, y0: World.SEA + 30, y1: World.SEA + 160 } });
  });
  wrap('forest', (A, G) => {
    const POND = { x0: 2250, x1: 2780, level: 576 }, RIVER = { x0: 930, x1: 1475, level: 578 };
    E.add(G, 'lombre', 1540, { range: 200, water: RIVER });
    for (const x of [380, 1900, 2950]) E.add(G, 'budew', x, { range: 90 });
    E.add(G, 'nuzleaf', 660, { range: 160 });
    E.add(G, 'linoone', 3000, { minX: 2830, maxX: 3240 });
    E.add(G, 'breloom', 2960, { range: 150 });
    E.add(G, 'masquerain', 2520, { minX: POND.x0 + 30, maxX: POND.x1 - 30 });
    E.family(G, 'marill', 'azurill', 2200, 2, { water: POND, range: 200 });
    E.add(G, 'azumarill', 2840, { water: POND, range: 220 });
    E.add(G, 'vigoroth', 560, { range: 260 });
    E.add(G, 'slaking', 3160, { range: 60 });
    E.add(G, 'latias', 1800, { range: 900, y: 300 });
  });
  wrap('canopy', (A, G) => {
    E.add(G, 'snorunt', 900, { range: 200 }); E.add(G, 'snorunt', 2200, { range: 200 });
    E.add(G, 'swellow', 1400, { range: 900 });
  });
  return { fx };
})();
