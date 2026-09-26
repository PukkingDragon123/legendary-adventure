/* ------------------------------------------------------------------
   Waves & wind — a height-field ripple simulation across the current
   area's water (splashes, dives and gusts push the surface and the
   rings run out, reflect off the shore and settle), and a gusty wind
   that drives clouds, chop, swaying plants and blowing sand.
------------------------------------------------------------------- */
const Ripples = (() => {
  const DX = 3;
  let N = 2, h = new Float32Array(2), v = new Float32Array(2), wet = new Uint8Array(2);
  const K = (110 / DX) ** 2; // wave speed ~110 px/s
  function init() {
    N = Math.ceil(World.W / DX) + 3;
    h = new Float32Array(N); v = new Float32Array(N); wet = new Uint8Array(N);
    for (let i = 0; i < N; i++) wet[i] = World.waterAt(Math.min(World.W, i * DX)) !== null ? 1 : 0;
  }
  function at(x) {
    const f = x / DX, i = Math.floor(f);
    if (i < 0 || i >= N - 1) return 0;
    const k = f - i;
    return h[i] * (1 - k) + h[i + 1] * k;
  }
  function vel(x) { const i = Math.round(x / DX); return i < 0 || i >= N ? 0 : v[i]; }
  // impulse in px/s (positive pushes the surface down, like something landing)
  function poke(x, amp, w = 5) {
    const c = Math.round(x / DX);
    for (let j = -w; j <= w; j++) {
      const i = c + j;
      if (i > 0 && i < N - 1 && wet[i]) v[i] += amp * Math.cos((j / (w + 1)) * Math.PI / 2) ** 2;
    }
  }
  function step(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 90))), s = dt / n;
    for (let k = 0; k < n; k++) {
      for (let i = 1; i < N - 1; i++) {
        if (!wet[i]) { h[i] = 0; v[i] = 0; continue; }
        const l = wet[i - 1] ? h[i - 1] : h[i], r = wet[i + 1] ? h[i + 1] : h[i];
        v[i] += (K * (l + r - 2 * h[i]) - 1.6 * v[i] - 5 * h[i]) * s;
      }
      for (let i = 1; i < N - 1; i++) { h[i] += v[i] * s; if (h[i] > 14) h[i] = 14; else if (h[i] < -14) h[i] = -14; }
    }
  }
  return { init, at, vel, poke, step, DX };
})();

const Wind = (() => {
  const W = { v: 0.4, off: 0, t: 0, boost: 0 };
  W.update = (dt) => {
    W.t += dt;
    const base = 0.35 + 0.25 * Math.sin(W.t * 0.05), gust = Math.max(0, Math.sin(W.t * 0.37) * Math.sin(W.t * 0.13 + 1)) * 0.9;
    W.boost = Math.max(0, W.boost - dt * 0.2);
    W.v = base + gust + W.boost;
    W.off += dt * (0.6 + W.v * 1.4);
    // gusts ruffle open water into little travelling chop
    const A = World.area;
    if (A && A.water && A.water.length && Math.random() < dt * (2 + W.v * 10)) {
      const w = A.water[(Math.random() * A.water.length) | 0];
      Ripples.poke(w.x0 + Math.random() * (w.x1 - w.x0), (Math.random() - 0.3) * 30 * W.v, 3);
    }
  };
  return W;
})();
