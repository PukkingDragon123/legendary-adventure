/* ------------------------------------------------------------------
   World — the current area's lane: walk line, water bodies and
   walkable platforms (docks, bridges, branches). Areas swap in with
   World.load(area). Also a small WorldRender shim for shared code
   (particles, the beach ball) that asks for the water surface.
------------------------------------------------------------------- */
const World = (() => {
  const { clamp } = U;
  const W0 = {
    area: null, W: 2000, H: 1000, SEA: 1e9, HORIZON: 300, shoreX: 1e9,
    GY: new Float32Array(2001), WL: null, plats: [],
  };
  function load(A) {
    W0.area = A; W0.W = A.W; W0.H = A.H;
    W0.SEA = A.sea ?? 1e9; W0.HORIZON = A.horizon ?? 300;
    W0.GY = U.profile(A.ground, A.W);
    // water level per pixel (NaN = dry)
    const WL = new Float32Array(A.W + 1).fill(NaN);
    for (const w of A.water || []) for (let x = Math.max(0, w.x0 | 0); x <= Math.min(A.W, w.x1 | 0); x++) if (W0.GY[x] > w.level + 1) WL[x] = w.level;
    W0.WL = WL;
    W0.shoreX = 1e9;
    for (let x = 0; x <= A.W; x++) if (!isNaN(WL[x]) && WL[x] === W0.SEA) { W0.shoreX = x; break; }
    W0.plats = (A.plats || []).map((p) => Object.assign({}, p));
  }
  const groundAt = (x) => W0.GY[clamp(Math.round(x), 0, W0.W)];
  const slopeAt = (x) => (groundAt(x + 3) - groundAt(x - 3)) / 6;
  // water level at x (null when dry)
  function waterAt(x) { const v = W0.WL ? W0.WL[clamp(Math.round(x), 0, W0.W)] : NaN; return isNaN(v) ? null : v; }
  const isWet = (x, pad = 10) => { const l = waterAt(x); return l !== null && groundAt(x) - l > pad; };
  function platAt(x) { for (const p of W0.plats) if (x >= p.x0 && x <= p.x1 && !p.off) return p; return null; }
  // the surface something standing at (x, y) would stand on: a platform just below/at y, else the ground
  function standY(x, y = -1e9, onPlat = null) {
    if (onPlat && x >= onPlat.x0 && x <= onPlat.x1) return onPlat.y;
    return groundAt(x);
  }
  return Object.assign(W0, { load, groundAt, slopeAt, waterAt, isWet, platAt, standY });
})();

const WorldRender = (() => {
  // water surface (with ripples) at x; far below everything when dry
  function surfaceAt(x, t) {
    const l = World.waterAt(x);
    if (l === null) return 1e9;
    const A = World.area;
    const wave = A && A.waves ? Math.sin(x * 0.021 + t * 1.3) * A.waves * 0.6 + Math.sin(x * 0.047 - t * 1.9) * A.waves * 0.4 : 0;
    return l + wave + (typeof Ripples !== 'undefined' ? Ripples.at(x) : 0);
  }
  return { surfaceAt, tilt: () => 0 };
})();
