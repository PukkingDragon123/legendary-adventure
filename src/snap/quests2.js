/* ------------------------------------------------------------------
   Quests2 — more residents with jobs for Mudkip, one or more in every
   area. Every quest points at Pokédex entries (`dex`) and uses one of
   the objective kinds: photo a behaviour, scan for hidden clues
   (progress 'clue'), scan a Pokémon to research it ('scan'), deliver a
   parcel to another Pokémon ('deliver') or register a number of the
   area's Pokémon ('census'). `lv` is the Mudkip level needed to take
   the job. Progress.js runs the new objective kinds.
------------------------------------------------------------------- */
const Quests2 = (() => {
  const Q = [
    /* ---------------- Coral Cove ---------------- */
    { id: 'q.wingull', area: 'beach', giver: 'wingull', title: 'Hat Thief', lv: 1, dex: ['wingull'],
      intro: ['Wiiing! Gull gull!', '(Wingull snatches hats for fun. It wants proof it is the best thief on the beach.)', '(Photograph a Wingull stealing something!)'],
      photo: { sp: 'wingull', beh: 'steal' }, wait: ['Gull? (It wants a photo of a Wingull swooping to steal!)'],
      done: ['WIIING! (It shows the photo to every Wingull on the beach.)', '(It drops a stolen stash of berries at your feet.)'], reward: 'item:berry:3' },
    { id: 'q.census1', area: 'beach', giver: 'wynaut', title: 'Coral Cove Census', lv: 2, census: 8,
      intro: ['Wynaut! Wynaut!', '(Wynaut is counting everyone who lives on this beach. It keeps losing count.)', '(Register 8 Coral Cove Pokémon in your Pokédex to help!)'],
      progress: 'census', n: 8, wait: ['Wy-naut? ({have} of 8 registered. Try the sea, the dunes and the cliffs!)'],
      done: ['WYNAUT!! (It sways so happily it bumps into Wobbuffet... who is not here.)', '(It hands you a Poké Ball charm it found.)'], reward: 'pts:600' },
    { id: 'q.nincada', area: 'beach', giver: 'trapinch', title: 'Underground Buzz', lv: 3, dex: ['nincada', 'trapinch'],
      intro: ['Chomp! Chomp!', '(Trapinch\'s friend Nincada burrowed into the dunes and will not come out.)', '(Use Scan in the dunes to find 3 burrow holes, then walk over them.)'],
      progress: 'clue', n: 3, clues: [4300, 4540, 4900], clueName: 'burrow hole', wait: ['Chomp? ({have} of 3 holes. Scan (4) near the dunes!)'],
      done: ['CHOMP! (Nincada peeks out of the last hole and buzzes hello.)', '(Trapinch shares a shiny Razz Berry it was hiding.)'], reward: 'item:razz:2', xp: 40 },
    { id: 'q.swampert', area: 'beach', giver: 'marshtomp', title: 'Future Me', lv: 2, dex: ['swampert', 'marshtomp'],
      intro: ['Marsh-tomp!', 'One day I will be as big as Swampert, down the beach!', 'Photograph Swampert firing a Mud Shot so I can practise!'],
      photo: { sp: 'swampert', beh: 'mudshot' }, wait: ['Marsh? (Swampert lives further along the cove. Snap its Mud Shot!)'],
      done: ['WHOA. So cool.', '(Marshtomp copies the pose... and falls in the mud.)'], reward: 'pts:500' },
    { id: 'q.tentacool', area: 'beach', giver: 'swampert', title: 'Beach Rescue', lv: 2, dex: ['tentacool'],
      intro: ['Swam-pert.', '(Swampert points at the shore. A Tentacool has washed up and is drying out!)', '(Spray it with Water Gun to help it back into the sea, and photograph the rescue.)'],
      photo: { sp: 'tentacool', beh: 'rescue' }, wait: ['(Swampert watches the shore. A beached Tentacool needs Water Gun!)'],
      done: ['(Swampert gives you a huge, gentle pat on the head.)', 'Swam... pert. (Thank you.)'], reward: 'pts:500', xp: 40 },
    { id: 'q.crawdaunt', area: 'beach', giver: 'crawdaunt', title: 'Boss of the Beach', lv: 4, dex: ['crawdaunt', 'corphish'],
      intro: ['*SNAP* So you are the shrimp who beat Corphish.', 'Prove you have guts. Get a photo of my Crabhammer. Up close!'],
      photo: { sp: 'crawdaunt', beh: 'crabhammer' }, wait: ['*SNAP* Crabhammer photo. Close up. Go on.'],
      done: ['...Not bad, shrimp. Not bad at all.', '(Crawdaunt lets you pass. Everyone on the beach looks impressed.)'], reward: 'pts:800' },
    /* ---------------- Weather Woods ---------------- */
    { id: 'q.kecleon', area: 'forest', giver: 'plusle', title: 'Now You See Me', lv: 3, dex: ['kecleon'],
      intro: ['Pla-pla! Pla!', '(Plusle says a Kecleon is hiding somewhere nearby, perfectly invisible!)', '(Use Scan near the trees to reveal it.)'],
      progress: 'scan', scan: 'kecleon', n: 1, wait: ['Pla? (Scan (4) around the woods to find the invisible Kecleon!)'],
      done: ['PLA-PLA-PLAAA! (Plusle and Minun cheer for you.)', '(They share their lucky Sitrus Berries.)'], reward: 'item:sitrus:2' },
    { id: 'q.breloom', area: 'forest', giver: 'shroomish', title: 'Spore Storm', lv: 2, dex: ['breloom', 'shroomish'],
      intro: ['Shroo... shroo!', '(Shroomish wants to grow up strong like Breloom.)', '(Photograph Breloom throwing a Mach Punch!)'],
      photo: { sp: 'breloom', beh: 'machpunch' }, wait: ['Shroo? (Breloom trains near the pond. A Mach Punch photo, please!)'],
      done: ['SHROOOO! (A happy puff of spores. Achoo!)'], reward: 'pts:500' },
    { id: 'q.nuzleaf', area: 'forest', giver: 'nuzleaf', title: 'Leaf Whistle', lv: 3, dex: ['nuzleaf', 'seedot'],
      intro: ['Nuz... (Nuzleaf toots a sad note on its leaf.)', '(Seedot keep hiding its three spare whistle leaves in the grass.)', '(Scan the woods for the leaves, then walk over them.)'],
      progress: 'clue', n: 3, clues: [760, 1760, 2080], clueName: 'whistle leaf', wait: ['Nuz? ({have} of 3 leaves found.)'],
      done: ['{note} Nuuuz~ {note} (It plays a beautiful tune.)', '(The Seedot drop from the trees to listen.)'], reward: 'pts:600', xp: 40 },
    { id: 'q.castform', area: 'forest', giver: 'lotad', title: 'Rain, Please', lv: 2, dex: ['castform'],
      intro: ['Lo-tad!', '(Lotad\'s leaf is drying out. Castform can change the weather!)', '(Photograph Castform in its rainy form.)'],
      photo: { sp: 'castform', beh: 'rainy' }, wait: ['Lo... (A rainy Castform photo, please. Rain comes and goes in the woods.)'],
      done: ['LOTAD! (It floats in circles in the puddles.)'], reward: 'item:nanab:2' },
    { id: 'q.parcel', area: 'forest', giver: 'azumarill', title: 'Care Package', lv: 2, dex: ['vigoroth'],
      intro: ['Azu-marill.', '(Azumarill packed a basket of berries for Vigoroth, who never stops running.)', '(Deliver it! Vigoroth races around the west side of the woods.)'],
      progress: 'deliver', deliver: 'vigoroth', n: 1, deliverLines: ['VIGO! VIGO! Food? FOOD!', '(Vigoroth eats the whole basket in one second and runs off again.)'],
      wait: ['(Azumarill waits. Find Vigoroth to the west and talk to it.)'], done: ['Azu~ (It smiles gently.)'], reward: 'pts:400' },
    { id: 'q.census2', area: 'forest', giver: 'linoone', title: 'Woods Census', lv: 4, census: 12,
      intro: ['Lin-oone! I run through the whole woods every day!', 'But I have never counted everyone. Register 12 Weather Woods Pokémon!'],
      progress: 'census', n: 12, wait: ['{have} of 12! Keep going, straight line!'], done: ['Lin-OONE! That is everyone I know!'], reward: 'pts:900' },
    /* ---------------- Treetop Town ---------------- */
    { id: 'q.swablu', area: 'canopy', giver: 'swablu', title: 'Clean Freak', lv: 3, dex: ['swablu'],
      intro: ['Swa-blu~', '(Swablu cleans everything with its cotton wings. It wants a portrait of its hard work.)'],
      photo: { sp: 'swablu', beh: 'clean' }, wait: ['Swa? (Photograph a Swablu cleaning!)'], done: ['Swa-bluuu~ (It fluffs your fin clean too.)'], reward: 'pts:500' },
    { id: 'q.snorunt', area: 'canopy', giver: 'snorunt', title: 'Snowball Stash', lv: 3, dex: ['snorunt'],
      intro: ['Snow-run!', '(Snorunt hid three snowballs around town before summer and cannot find them.)', '(Scan to find them, then walk over each one.)'],
      progress: 'clue', n: 3, clues: [640, 1300, 2500], clueName: 'snowball', wait: ['Snow? ({have} of 3 snowballs.)'],
      done: ['SNOW-RUN! (A tiny snowball fight breaks out.)'], reward: 'item:pecha:2', xp: 40 },
    { id: 'q.taillow', area: 'canopy', giver: 'taillow', title: 'Sky Race', lv: 4, dex: ['swellow', 'taillow'],
      intro: ['TAILLOW! (It puffs out its chest.)', 'Swellow is the fastest bird in Hoenn. Photograph its Aerial Ace and I will train until I beat it!'],
      photo: { sp: 'swellow', beh: 'aerial' }, wait: ['Tail? (Swellow soars over the treetops. Snap its Aerial Ace!)'], done: ['TAIIILLOW! (It zooms off to train.)'], reward: 'pts:700' },
    /* ---------------- Starfall Cave ---------------- */
    { id: 'q.align', area: 'falls', giver: 'lunatone', title: 'Sun and Moon', lv: 4, dex: ['solrock', 'lunatone'],
      intro: ['...', '(Lunatone glows. It wants to remember the moment the sun and moon line up.)', '(Photograph Solrock aligned with Lunatone.)'],
      photo: { sp: 'solrock', beh: 'align' }, wait: ['(Lunatone waits, glowing softly.)'], done: ['(Lunatone and Solrock spin together in thanks.)'], reward: 'pts:800' },
    { id: 'q.minior', area: 'falls', giver: 'solrock', title: 'Falling Stars', lv: 4, dex: ['minior'],
      intro: ['...', '(Solrock flares. Pieces of a meteor are hiding in the cave... and one of them is alive.)', '(Scan to research a Minior.)'],
      progress: 'scan', scan: 'minior', n: 1, wait: ['(Scan (4) near the glittering rocks.)'], done: ['(Solrock beams warmly.)'], reward: 'item:razz:2' },
    /* ---------------- Fiery Path ---------------- */
    { id: 'q.slugma', area: 'volcano', giver: 'slugma', title: 'Warm Spots', lv: 5, dex: ['slugma', 'torkoal'],
      intro: ['*blorp*', '(Slugma is looking for the warmest spots on the path to nap in.)', '(Scan for 3 warm vents, then walk over them.)'],
      progress: 'clue', n: 3, clues: [2860, 3380, 3620], clueName: 'warm vent', wait: ['*blorp* ({have} of 3 warm spots.)'],
      done: ['*BLORP!* (Slugma melts happily into the warm rock.)'], reward: 'pts:700', xp: 40 },
    /* ---------------- Shoal Cave ---------------- */
    { id: 'q.sealeo', area: 'shoal', giver: 'sealeo', title: 'Ice Show', lv: 5, dex: ['sealeo', 'spheal'],
      intro: ['Sea-leo! LOOK AT ME!', 'I can balance a Spheal tower! Photograph my tower act!'],
      photo: { sp: 'sealeo', beh: 'tower' }, wait: ['Did you get the tower? THE TOWER?'], done: ['SEA-LEO! A star is born!'], reward: 'pts:800' },
    { id: 'q.regice', area: 'shoal', giver: 'snorunt', title: 'Seven Dots', lv: 6, dex: ['regice'],
      intro: ['Snow... run.', '(Snorunt shivers. Something very old sleeps deep in the ice cave.)', '(Scan the sleeping giant to learn what it is.)'],
      progress: 'scan', scan: 'regice', n: 1, wait: ['(Scan (4) inside the ice cave.)'], done: ['Snow-run! (It hides behind you, but it is impressed.)'], reward: 'pts:1000' },
  ];
  // extra chatter so every resident hints at something to do
  const CHAT = {
    tentacool: ['(It is drying out... Water Gun would help!)'],
    trapinch: ['Chomp! (It stares at the dunes. Something is buzzing under the sand.)'],
    nincada: ['Bzz... (It hides in its hole.)'],
    wynaut: ['Wynaut! (It is counting on its stubby arms.)'],
  };
  if (typeof Talk !== 'undefined') {
    Talk.QUESTS.push(...Q);
    // the pearl lies on the deep seabed: needs deep diving (Lv4)
    const lq = Talk.QUESTS.find((q) => q.id === 'q.luvdisc'); if (lq) lq.lv = 4;
    for (const k in CHAT) Talk.CHAT[k] = (Talk.CHAT[k] || []).concat(CHAT[k]);
  }
  return { Q };
})();
