/* ------------------------------------------------------------------
   Beach ball — a true spinning sphere, shaded into pixel ramps.
   Six gores (red / white / yellow / white / blue / white) and white
   pole caps with a small valve, sel-out outline.
------------------------------------------------------------------- */
const Ball = (() => {
  const H = PX.hex;
  const BASE = {
    red: [H('#8e1c2c'), H('#c42f3a'), H('#ea4b42'), H('#ff7b64')],
    white: [H('#9faac2'), H('#c9d3e3'), H('#f1f4f7'), H('#ffffff')],
    yellow: [H('#b0701a'), H('#dca126'), H('#f7c93c'), H('#ffe486')],
    blue: [H('#1a3c94'), H('#285fc4'), H('#3b85ea'), H('#7cb8ff')],
    spec: H('#ffffff'),
    od: H('#2b2140'),
    ol: H('#58476e'),
  };
  const GORES = ['red', 'white', 'yellow', 'white', 'blue', 'white'];

  function grade(fn) {
    const o = {};
    for (const k of ['red', 'white', 'yellow', 'blue']) o[k] = BASE[k].map((c, i) => fn(c, i));
    o.spec = fn(BASE.spec, 4);
    o.od = fn(BASE.od, -2);
    o.ol = fn(BASE.ol, -1);
    return o;
  }

  // rotation helpers
  const axisAngle = (ax, a) => {
    const [x, y, z] = V3.norm(ax), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  };

  /**
   * render({R, rot, light:{dir,rim?}, sx, sy, pal}) -> {buf, cx, cy}
   * sx/sy squash the silhouette (impact), rot is a 3x3 (local->view).
   */
  function render(o) {
    const R = o.R, pal = o.pal || BASE;
    const sx = o.sx || 1, sy = o.sy || 1;
    const rw = Math.ceil(R * sx) + 2, rh = Math.ceil(R * sy) + 2;
    const W = rw * 2 + 1, Hh = rh * 2 + 1;
    const cx = rw + 0.5, cy = rh + 0.5;
    const buf = new PX.Buf(W, Hh);
    const Ld = V3.norm((o.light && o.light.dir) || [-0.5, 0.72, 0.5]);
    const Hv = V3.norm(V3.add(Ld, [0, 0, 1]));
    const rot = o.rot;
    const tone = new Int8Array(W * Hh).fill(-1);
    const rim = o.light && o.light.rim;
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - cx) / (R * sx), v = (y + 0.5 - cy) / (R * sy);
        const r2 = u * u + v * v;
        if (r2 > 1) continue;
        const nz = Math.sqrt(1 - r2);
        const n = [u, -v, nz];
        // local direction = rot^T n
        const lx = rot[0] * n[0] + rot[3] * n[1] + rot[6] * n[2];
        const ly = rot[1] * n[0] + rot[4] * n[1] + rot[7] * n[2];
        const lz = rot[2] * n[0] + rot[5] * n[1] + rot[8] * n[2];
        let key;
        if (Math.abs(ly) > 0.9) key = 'white';
        else {
          const lon = Math.atan2(lz, lx) + Math.PI;
          key = GORES[Math.floor((lon / (Math.PI * 2)) * 6) % 6];
        }
        const valve = ly > 0.975;
        const d = V3.dot(n, Ld);
        let t = d < -0.12 ? 0 : d < 0.32 ? 1 : d < 0.78 ? 2 : 3;
        if (rim) {
          const rr = (1 - nz) * Math.max(0, n[0] * rim.dir[0] + n[1] * rim.dir[1]);
          if (rr > rim.k) t = Math.max(t, 2) + 1;
        }
        t = Math.min(3, t);
        let c = pal[valve ? 'red' : key][t];
        if (V3.dot(n, Hv) > 0.972) c = pal.spec;
        const i = y * W + x;
        buf.d[i] = c;
        tone[i] = t;
      }
    // outline
    const src = buf.d.slice();
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (src[i]) continue;
        let best = -1;
        if (x > 0 && src[i - 1]) best = Math.max(best, tone[i - 1]);
        if (x < W - 1 && src[i + 1]) best = Math.max(best, tone[i + 1]);
        if (y > 0 && src[i - W]) best = Math.max(best, tone[i - W]);
        if (y < Hh - 1 && src[i + W]) best = Math.max(best, tone[i + W]);
        if (best < 0) continue;
        buf.d[i] = best >= 3 ? pal.ol : pal.od;
      }
    return { buf, cx: rw, cy: rh };
  }

  return { render, grade, axisAngle, BASE };
})();
