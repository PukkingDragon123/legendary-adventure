/* ------------------------------------------------------------------
   Accs — a few wild Pokémon wear something of their own: a party hat,
   a bow, a flower crown, shades, a beanie in winter. These are the very
   same 3D pieces Mudkip wears (Mudkip.accModel), rendered with the
   Pokémon's own camera, light and time-of-day palette, sized to its
   head and baked straight into its sprite — so they turn, bob, squash,
   get the HD pass and the outline exactly like the rest of its body.
   Only about one Pokémon in nine has one, and each keeps its look.
------------------------------------------------------------------- */
const Accs = (() => {
  const KINDS = [{ hat: 'party' }, { hat: 'bow' }, { hat: 'flower' }, { glasses: 'round' }, { hat: 'crown' }, { hat: 'straw' }, { hat: 'sailor' }, { hat: 'bucket' }, { glasses: 'star' }, { hat: 'chef' }];
  // shapes that simply cannot wear a hat nicely (no head on top, or all fins)
  const NO = new Set(['corphish', 'crawdaunt', 'spheal', 'sealeo', 'trapinch', 'nincada', 'surskit', 'masquerain', 'vibrava', 'luvdisc', 'wailord', 'wailmer', 'staryu', 'starmie', 'minior', 'lunatone', 'solrock', 'clamperl', 'tentacool', 'chinchou', 'carvanha', 'sharpedo', 'remoraid', 'mantine', 'corsola', 'lileep', 'anorith', 'kyogre', 'relicanth', 'feebas', 'milotic', 'deoxys', 'palkia', 'dialga', 'jirachi', 'castform', 'slugma', 'wobbuffet', 'regice', 'groudon', 'rayquaza', 'latias', 'latios', 'meloetta']);
  const SEASONAL = new Set(['party', 'bow', 'flower', 'crown', 'straw', 'sailor', 'bucket', 'chef']);
  function lookFor(m) {
    if (typeof Mons === 'undefined' || !(m instanceof Mons.Mon)) return null;
    if (m.acc3) return m.acc3;
    if (m.accL !== undefined) return winter(m, m.accL);
    let L = null;
    if (m !== Game.mudkip && !m.layer && !m.bg && m.kind !== 'mailman' && !NO.has(m.dex) && !(DexData.S[m.dex] || {}).legendary) {
      const h = U.hash(Math.floor(m.seed * 1000), 7, 3);
      if (h < 0.11) L = KINDS[Math.floor(h / 0.11 * KINDS.length) % KINDS.length];
    }
    m.accL = L;
    return winter(m, L);
  }
  function winter(m, L) {
    if (L && L.hat && SEASONAL.has(L.hat) && typeof Pal !== 'undefined' && Pal.season === 'winter' && Game.area && !Game.area.def.noSeason) return { hat: 'beanie' };
    return L;
  }
  const key = (L) => (L.hat || '') + '/' + (L.glasses || '');
  // s: a cropped sprite {d,w,h,x0,y0,anchors} (anchors in full-buffer coords). Returns a new sprite with the piece merged in.
  function bake(m, s, P, opt) {
    const A = s.anchors || {}, top = A.top, head = A.head;
    if (!top) return s;
    const L = lookFor(m); if (!L) return s;
    // head size: head centre to the eye (3D, so it holds at every angle); falls back to head → top of head
    const eye = A.eyeN || A.eyeF, d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0));
    let hc = head, hr = head ? (eye ? Math.max(d3(head, eye) * 1.05, d3(head, top) * 0.62) : d3(head, top)) : 0;
    const cap = Math.max(s.w, s.h) * 0.3;
    if (!head || hr < 2) { if (L.glasses) return s; hr = Math.max(3, s.h * 0.16); hc = [top[0], top[1] + hr, top[2]]; }
    if (hr > cap) hr = cap;
    if (L.glasses && !eye) return s;
    hr *= m.accK || 1;
    const sc = hr / 14.2;
    const g = P.gradePal(Mudkip.PAL, 'mudkip');
    const W = Math.ceil(64 * sc) + 8, H = Math.ceil(64 * sc) + 8, ox = W >> 1, oy = H >> 1;
    let r;
    try { r = Mudkip.render(Mudkip.accModel(L), { yaw: opt.yaw, pitch: opt.pitch, scale: sc, W, H, ox, oy, pal: g.pal, light: opt.light }); } catch (e) { return s; }
    const hd = r.buf.d;
    // where the hat buffer lands in the full sprite buffer
    const bx = Math.round(hc[0] - ox), by = Math.round(hc[1] - oy + hr * (m.accSink || 0));
    let x0 = s.x0, y0 = s.y0, x1 = s.x0 + s.w - 1, y1 = s.y0 + s.h - 1, any = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hd[y * W + x]) { any = true; x0 = Math.min(x0, bx + x); x1 = Math.max(x1, bx + x); y0 = Math.min(y0, by + y); y1 = Math.max(y1, by + y); }
    if (!any) return s;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint32Array(w * h);
    for (let y = 0; y < s.h; y++) out.set(s.d.subarray(y * s.w, y * s.w + s.w), (y + s.y0 - y0) * w + (s.x0 - x0));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = hd[y * W + x]; if (c) out[(by + y - y0) * w + (bx + x - x0)] = c; }
    return { d: out, w, h, x0, y0, anchors: s.anchors, bytes: w * h * 4 + 200, time: s.time, acc: true };
  }
  function draw() {}
  return { lookFor, bake, key, draw };
})();
