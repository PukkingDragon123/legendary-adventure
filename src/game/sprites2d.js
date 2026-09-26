/* ------------------------------------------------------------------
   2D pixel-art species. Each exposes the same { PAL, meta, build,
   render } shape as the 3D models, so the game (and its workers)
   use them unchanged. The art is painted from flat shapes at the
   world's true scale (175 px = 1 m) and simply mirrored for facing.
------------------------------------------------------------------- */
const Sprites2D = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const EYES = { blink: 'closed', sleep: 'closed', shut: 'closed', wide: 'open', sad: 'open', look: 'open' };
  const E = (e) => EYES[e] || e || 'open';
  const hx = (h) => PX.hex(h), mixh = (a, b, k) => PX.toHex(PX.mix(hx(a), hx(b), k));
  function palOf(sp) {
    const o = {};
    Object.keys(sp.pal).forEach((key, i) => {
      const [ol, sh, base, hi] = sp.pal[key];
      o[i + 1] = { r: [mixh(sh, ol, 0.4), sh, base, mixh(base, hi, 0.5), hi], od: ol, ol: mixh(ol, sh, 0.55), ln: ol };
    });
    return Creature.palette(o);
  }
  // k: art scale (world px per design px at scale 1); map: game pose -> design pose
  function make(name, k, map, o = {}) {
    const sp = Pix.SP[name], keys = Object.keys(sp.pal);
    const spin = o.spin ? Math.hypot(sp.w, sp.h) * 0.55 : 0;
    const hw = (Math.max(sp.ax, sp.w - sp.ax) + spin) * k + 6, up = (sp.ay + spin) * k + 6, down = (sp.h - sp.ay + spin) * k + 6;
    const meta = { bw: Math.ceil(hw * 2), bh: Math.ceil(up + down), oy: up / (up + down) };
    return {
      PAL: palOf(sp), meta, flat2d: true,
      build: (pose) => pose,
      render(pose, opt) {
        const s = k * opt.scale, dp = map(pose || {});
        const P = new Pix.Painter(sp.w, sp.h, keys, s);
        sp.draw(P, dp);
        const src = P.toBuf(opt.pal);
        const flip = Math.cos(opt.yaw) < 0;
        let rot = dp._rot || 0;
        if (dp._face && flip) rot = -rot;
        const pv = dp._pivot || [sp.ax, sp.ay], f = flip ? -1 : 1;
        const X = opt.ox + (pv[0] - sp.ax) * s * f, Y = opt.oy + (pv[1] - sp.ay) * s;
        const buf = new PX.Buf(opt.W, opt.H);
        src.ax = pv[0] * s; src.ay = pv[1] * s;
        Pix.draw(buf, src, X, Y, { flip, rot });
        const c = Math.cos(rot), sn = Math.sin(rot), anchors = {};
        const A = sp.anchors ? sp.anchors(dp) : {};
        for (const n in A) {
          const dx = (A[n][0] - pv[0]) * s * f, dy = (A[n][1] - pv[1]) * s;
          anchors[n] = [X + dx * c - dy * sn, Y + dx * sn + dy * c];
        }
        return { buf, anchors };
      },
    };
  }
  const n = (v) => v || 0;

  const Spheal = make('spheal', 3.3, (p) => ({ clap: n(p.clap), mouth: n(p.mouth), squash: clamp(n(p.squash), -0.25, 0.3), eyes: E(p.eyes), _rot: n(p.roll), _pivot: [22, 24] }), { spin: true });
  const Sealeo = make('sealeo', 3.2, (p) => ({ headPitch: clamp(n(p.headPitch) / 0.45, -0.4, 1), mouth: n(p.mouth), clap: Math.max(n(p.clap), n(p.flipper) * 0.6), eyes: E(p.eyes) }));
  const Walrein = make('walrein', 3.3, (p) => ({ headPitch: clamp(n(p.headPitch) / 0.45, -0.4, 1), mouth: n(p.mouth), flip: n(p.flipper), eyes: E(p.eyes) }));
  const Corphish = make('corphish', 2.6, (p) => ({ clawL: n(p.clawF), clawR: n(p.clawN), armL: n(p.armF), armR: n(p.armN), walk: n(p.walk), eyes: E(p.eyes), squash: n(p.squash), mouth: n(p.mouth), _rot: n(p.tilt), _pivot: [22, 39] }), { spin: true });
  const Luvdisc = make('luvdisc', 3.2, (p) => ({ kiss: n(p.kiss), blush: n(p.blush), eyes: E(p.eyes), _rot: -n(p.tilt) + n(p.wiggle) * 0.16, _face: true, _pivot: [15, 15] }), { spin: true });
  const Pelipper = make('pelipper', 3.3, (p) => ({ flap: clamp(n(p.flap), -1, 1), perch: (p.spread ?? 1) < 0.35 ? 1 : 0, pouch: n(p.pouch) * 2, eyes: E(p.eyes), _rot: -n(p.pitch) * 0.8, _face: true }), { spin: true });
  const Dialga = make('dialga', 1.9, (p) => ({ mouth: Math.max(n(p.mouth), n(p.roar)), walk: n(p.walk), eyes: E(p.eyes), gem: n(p.gem), wag: n(p.tailWag) }));
  const Kyogre = make('kyogre', 5.9, (p) => ({ tail: Math.sin(n(p.tail)), fin: clamp(n(p.fin), -1, 1), mouth: n(p.mouth), eyes: E(p.eyes), glow: n(p.glow), _rot: -n(p.headPitch) * 0.4, _face: true }), { spin: true });
  const Wailord = make('wailord', 21, (p) => ({ tail: n(p.tail), eyes: E(p.eyes), mouth: n(p.mouth), _rot: -n(p.roll) * 0.3, _face: true }));
  return { Spheal, Sealeo, Walrein, Corphish, Luvdisc, Pelipper, Dialga, Kyogre, Wailord };
})();
const { Spheal, Sealeo, Walrein, Corphish, Luvdisc, Pelipper, Dialga, Kyogre, Wailord } = Sprites2D;
