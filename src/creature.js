/* ------------------------------------------------------------------
   Creature — generic "3D model straight to pixel art" renderer.
   A model is a list of primitives (analytic ellipsoids and flat plates
   with 2D outlines) posed in model space, plus optional eye stamps and
   single-pixel dots. Rendering ray-casts orthographically, toon-shades
   through per-material colour ramps, adds cast shadows, internal contour
   lines and a sel-out outer outline.
   Model space: x = forward, y = up, z = the creature's near side at yaw 0.
------------------------------------------------------------------- */
const M3 = {
  mul(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
    ];
  },
  v(m, p) {
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
  },
  inv(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const id = 1 / (a * A + b * B + c * C);
    return [
      A * id, -(b * i - c * h) * id, (b * f - c * e) * id,
      B * id, (a * i - c * g) * id, -(a * f - c * d) * id,
      C * id, -(a * h - b * g) * id, (a * e - b * d) * id,
    ];
  },
  rx(t) { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; },
  ry(t) { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
  rz(t) { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; },
  diag(x, y, z) { return [x, 0, 0, 0, y, 0, 0, 0, z]; },
  I() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; },
  cols(u, v, w) { return [u[0], v[0], w[0], u[1], v[1], w[1], u[2], v[2], w[2]]; },
};
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/* ---------- 2D shape helpers for plates ---------- */
const Shape2D = {
  catmull(pts, closed = true, seg = 8) {
    const out = [], n = pts.length;
    const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let s = 0; s < seg; s++) {
        const t = s / seg, t2 = t * t, t3 = t2 * t;
        const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([f(0), f(1)]);
      }
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  },
  inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  },
  segDist(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - ax - dx * t, y - ay - dy * t);
  },
  polyDist(x, y, pl) {
    let d = Infinity;
    for (let i = 0; i < pl.length - 1; i++) d = Math.min(d, Shape2D.segDist(x, y, pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]));
    return d;
  },
  bbox(poly, pad = 0) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of poly) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
    return [a - pad, b - pad, c + pad, d + pad];
  },
  inTri(px, py, a, b, c) {
    const s1 = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    const s2 = (c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0]);
    const s3 = (a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0]);
    return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  },
  // polygon shape from control points; `fn(u,v)` optionally returns a material code for inside points
  poly(ctrl, mat, seg = 8, fn = null) {
    const P = Shape2D.catmull(ctrl, true, seg);
    const bb = Shape2D.bbox(P, 0.5);
    return { bb, poly: P, test: (u, v) => (u < bb[0] || u > bb[2] || v < bb[1] || v > bb[3] || !Shape2D.inPoly(u, v, P) ? 0 : fn ? fn(u, v) : mat) };
  },
};

// Bake a 2D shape test into a lookup grid (0.25 unit cells) so per-pixel tests are O(1)
function bakeShape(shape, res = 0.25) {
  const [u0, v0, u1, v1] = shape.bb;
  const gw = Math.ceil((u1 - u0) / res), gh = Math.ceil((v1 - v0) / res);
  const g = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) g[y * gw + x] = shape.test(u0 + (x + 0.5) * res, v0 + (y + 0.5) * res);
  return {
    bb: shape.bb,
    test(u, v) {
      const x = Math.floor((u - u0) / res), y = Math.floor((v - v0) / res);
      if (x < 0 || y < 0 || x >= gw || y >= gh) return 0;
      return g[y * gw + x];
    },
  };
}

const Creature = (() => {
  const code = (m, bias = 0) => m | ((bias + 2) << 5);

  /* frames: { L: linear 3x3, t: translation } */
  const F = (L, t) => ({ L, t });
  const comp = (P, C) => ({ L: M3.mul(P.L, C.L), t: V3.add(M3.v(P.L, C.t), P.t) });
  const T = (x, y, z) => F(M3.I(), [x, y, z]);
  const R = (m) => F(m, [0, 0, 0]);
  const S = (x, y, z) => F(M3.diag(x, y, z), [0, 0, 0]);
  const chain = (...fs) => fs.reduce((a, b) => comp(a, b));
  // point on an ellipsoid primitive given unit-sphere direction s
  const onEll = (prim, s) => ({ p: V3.add(prim.c, M3.v(prim.L, s)), s, prim });
  const sph = (az, v) => { const c = Math.sqrt(Math.max(0, 1 - v * v)); return [c * Math.cos(az), v, c * Math.sin(az)]; };
  // ellipsoid primitive from a frame + radii
  const ell = (f, r, o) => Object.assign({ kind: 'ell', c: f.t, L: M3.mul(f.L, M3.diag(r[0], r[1], r[2])) }, o);
  // plate primitive: frame plus local axes (u, v in the plate, w = normal)
  const plate = (f, shape, o, axes = null) => Object.assign({ kind: 'plate', c: f.t, L: axes ? M3.mul(f.L, M3.cols(...axes)) : f.L, shape, thick: 1.6 }, o);

  function stampColors(c) { const o = {}; for (const k in c) o[k] = typeof c[k] === 'string' ? PX.hex(c[k]) : c[k]; return o; }

  /**
   * render(model, opt)
   * model: { prims, stamps?, dots?, anchors?, pri?, glossy?, shadow? }
   * opt:   { yaw, pitch, scale, W, H, ox, oy, pal, light }
   */
  function render(model, opt) {
    const { yaw = 1.05, pitch = 0.16, scale = 1, W = 96, H = 96, ox = 48, oy = 82, pal, light } = opt;
    const V = M3.mul(M3.rx(pitch), M3.mul(M3.ry(-yaw), M3.diag(scale, scale, scale)));
    const N = W * H;
    const depth = new Float32Array(N).fill(-1e9);
    const mat = new Uint8Array(N), part = new Uint8Array(N), grp = new Uint8Array(N), bias = new Int8Array(N);
    const nxb = new Float32Array(N), nyb = new Float32Array(N), nzb = new Float32Array(N);

    for (const p of model.prims) {
      p.cv = M3.v(V, p.c);
      p.Lv = M3.mul(V, p.L);
      p.Li = M3.inv(p.Lv);
      const Li = p.Li, cv = p.cv;
      let x0, y0, x1, y1;
      if (p.kind === 'ell') {
        const rx = Math.hypot(p.Lv[0], p.Lv[1], p.Lv[2]), ry = Math.hypot(p.Lv[3], p.Lv[4], p.Lv[5]);
        x0 = ox + cv[0] - rx; x1 = ox + cv[0] + rx; y0 = oy - cv[1] - ry; y1 = oy - cv[1] + ry;
      } else {
        const [a, b, c, d] = p.shape.bb;
        x0 = y0 = Infinity; x1 = y1 = -Infinity;
        for (const [u, v] of [[a, b], [a, d], [c, b], [c, d]]) {
          for (const w of [-p.thick, p.thick]) {
            const q = V3.add(cv, M3.v(p.Lv, [u, v, w]));
            x0 = Math.min(x0, ox + q[0]); x1 = Math.max(x1, ox + q[0]);
            y0 = Math.min(y0, oy - q[1]); y1 = Math.max(y1, oy - q[1]);
          }
        }
      }
      const px0 = Math.max(0, Math.floor(x0) - 1), px1 = Math.min(W - 1, Math.ceil(x1) + 1);
      const py0 = Math.max(0, Math.floor(y0) - 1), py1 = Math.min(H - 1, Math.ceil(y1) + 1);
      if (px0 > px1 || py0 > py1) continue;
      if (p.kind === 'ell') {
        const dx = Li[2], dy = Li[5], dz = Li[8];
        const a = dx * dx + dy * dy + dz * dz;
        const Z0 = -cv[2];
        for (let py = py0; py <= py1; py++) {
          const Y = oy - (py + 0.5) - cv[1];
          for (let px = px0; px <= px1; px++) {
            const X = px + 0.5 - ox - cv[0];
            const s0x = Li[0] * X + Li[1] * Y + Li[2] * Z0;
            const s0y = Li[3] * X + Li[4] * Y + Li[5] * Z0;
            const s0z = Li[6] * X + Li[7] * Y + Li[8] * Z0;
            const b = 2 * (s0x * dx + s0y * dy + s0z * dz);
            const c = s0x * s0x + s0y * s0y + s0z * s0z - 1;
            const disc = b * b - 4 * a * c;
            if (disc < 0) continue;
            const t = (-b + Math.sqrt(disc)) / (2 * a);
            const i = py * W + px;
            if (t <= depth[i]) continue;
            const s = [s0x + t * dx, s0y + t * dy, s0z + t * dz];
            const m = p.mat(s);
            if (!m) continue;
            let nx = Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2];
            let ny = Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2];
            let nz = Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2];
            const l = Math.hypot(nx, ny, nz) || 1;
            depth[i] = t; mat[i] = m & 31; bias[i] = (m >> 5) - 2; part[i] = p.part; grp[i] = p.grp;
            nxb[i] = nx / l; nyb[i] = ny / l; nzb[i] = nz / l;
          }
        }
      } else {
        const r2x = Li[6], r2y = Li[7], r2z = Li[8];
        const nl = Math.hypot(r2x, r2y, r2z);
        let nx = r2x / nl, ny = r2y / nl, nz = r2z / nl;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const edgeOn = Math.abs(r2z) / nl < 0.45;
        const samples = edgeOn ? 7 : 1;
        for (let py = py0; py <= py1; py++) {
          const Y = oy - (py + 0.5) - cv[1];
          for (let px = px0; px <= px1; px++) {
            const X = px + 0.5 - ox - cv[0];
            const i = py * W + px;
            let hitZ = null, hitM = 0;
            if (!edgeOn) {
              const Zr = -(r2x * X + r2y * Y) / r2z;
              const u = Li[0] * X + Li[1] * Y + Li[2] * Zr;
              const v = Li[3] * X + Li[4] * Y + Li[5] * Zr;
              const m = p.shape.test(u, v);
              if (m) { hitZ = Zr + cv[2]; hitM = m; }
            } else {
              const half = p.thick / 2;
              const za = (-half - (r2x * X + r2y * Y)) / r2z, zb = (half - (r2x * X + r2y * Y)) / r2z;
              const zf = Math.max(za, zb), zk = Math.min(za, zb);
              for (let k = 0; k < samples; k++) {
                const Zr = zf + ((zk - zf) * k) / (samples - 1);
                const u = Li[0] * X + Li[1] * Y + Li[2] * Zr;
                const v = Li[3] * X + Li[4] * Y + Li[5] * Zr;
                const m = p.shape.test(u, v);
                if (m) { hitZ = Zr + cv[2]; hitM = m; break; }
              }
            }
            if (hitZ === null || hitZ <= depth[i]) continue;
            depth[i] = hitZ; mat[i] = hitM & 31; bias[i] = (hitM >> 5) - 2; part[i] = p.part; grp[i] = p.grp;
            nxb[i] = nx; nyb[i] = ny; nzb[i] = nz;
          }
        }
      }
    }

    /* ---- screen-space cast shadows between parts ---- */
    const Lg = light || { dir: [-0.5, 0.72, 0.5] };
    const Ld = V3.norm(Lg.dir);
    const shadow = new Uint8Array(N);
    const steps = model.shadowSteps ?? 30;
    if (steps > 0) {
      const st = 1 / Math.max(Math.abs(Ld[0]), Math.abs(Ld[1]), 0.2);
      const zmax = (model.shadowDepth ?? 26) * scale;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!mat[i]) continue;
          const X0 = x + 0.5 - ox, Y0 = oy - (y + 0.5), Z0 = depth[i];
          for (let k = 2; k < steps; k++) {
            const qx = X0 + Ld[0] * st * k, qy = Y0 + Ld[1] * st * k, qz = Z0 + Ld[2] * st * k;
            const sx = Math.floor(ox + qx), sy = Math.floor(oy - qy);
            if (sx < 0 || sy < 0 || sx >= W || sy >= H) break;
            const j = sy * W + sx;
            if (mat[j] && grp[j] !== grp[i] && depth[j] > qz + 1.5 && depth[j] < qz + zmax) { shadow[i] = 1; break; }
          }
        }
    }

    /* ---- toon shading ---- */
    const Hh = V3.norm(V3.add(Ld, [0, 0, 1]));
    const th = Lg.th || [-0.2, 0.18, 0.74];
    const specT = Lg.spec ?? 0.975;
    const rim = Lg.rim || null;
    const glossy = model.glossy || {};
    const out = new Uint32Array(N);
    const tone = new Int8Array(N).fill(-1);
    const rimMask = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const m = mat[i];
      if (!m) continue;
      const nx = nxb[i], ny = nyb[i], nz = nzb[i];
      const d = nx * Ld[0] + ny * Ld[1] + nz * Ld[2];
      let t = d < th[0] ? 0 : d < th[1] ? 1 : d < th[2] ? 2 : 3;
      if (shadow[i]) t = Math.min(t, d < th[1] ? 0 : 1);
      t += bias[i];
      const sp = nx * Hh[0] + ny * Hh[1] + nz * Hh[2];
      if (glossy[m] && !shadow[i] && sp > specT && t >= 2) t = 4;
      let rimHit = false;
      if (rim) {
        const r = (1 - nz) * Math.max(0, nx * rim.dir[0] + ny * rim.dir[1]);
        if (r > rim.k && !(rim.noShadow && shadow[i])) { t = Math.max(t, rim.base ?? 3) + (r > rim.k * 1.6 ? 1 : 0); rimHit = true; }
      }
      t = Math.max(0, Math.min(4, t));
      tone[i] = t;
      const P = rimHit && rim.pal ? rim.pal : pal;
      out[i] = (P[m] || pal[m]).r[t];
      if (rimHit && rim.pal) rimMask[i] = 1;
    }

    /* ---- projected line decals ---- */
    const plotLine = (a, b, color, partId) => {
      let x0 = Math.floor(a[0]), y0 = Math.floor(a[1]);
      const x1 = Math.floor(b[0]), y1 = Math.floor(b[1]);
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let guard = 0; guard < 4000; guard++) {
        if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) {
          const i = y0 * W + x0;
          if (part[i] === partId) out[i] = color;
        }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    };
    for (const p of model.prims) {
      if (!p.lines) continue;
      for (const ln of p.lines) {
        const pts = ln.pts.map((q) => { const g = V3.add(p.cv, M3.v(p.Lv, q)); return [ox + g[0], oy - g[1]]; });
        const col = ln.color !== undefined ? ln.color : ln.useLn ? pal[ln.mat].ln : pal[ln.mat].r[ln.tone];
        for (let k = 0; k < pts.length - 1; k++) plotLine(pts[k], pts[k + 1], col, p.part);
      }
    }

    // surface point → screen position, facing and visibility
    const surf = (an) => {
      const q = M3.v(V, an.p);
      const Li = an.prim.Li, s = an.s;
      const n = V3.norm([Li[0] * s[0] + Li[3] * s[1] + Li[6] * s[2], Li[1] * s[0] + Li[4] * s[1] + Li[7] * s[2], Li[2] * s[0] + Li[5] * s[1] + Li[8] * s[2]]);
      const xi = Math.floor(ox + q[0]), yi = Math.floor(oy - q[1]);
      let vis = false;
      if (xi >= 0 && yi >= 0 && xi < W && yi < H) {
        const i = yi * W + xi;
        vis = part[i] === an.prim.part && Math.abs(depth[i] - q[2]) < 3 * Math.max(1, scale);
      }
      return { xi, yi, n, vis };
    };

    /* ---- stamps (eyes) ---- */
    const baseMat = new Uint8Array(N);
    for (const st of model.stamps || []) {
      const r = surf(st.at);
      if (!r.vis || r.n[2] < (st.minFacing ?? 0.12)) continue;
      const set = st.set;
      const kind = st.kind || 'open';
      let g = set[kind] || set.open;
      if (r.n[2] < (st.far ?? 0.5)) g = set[kind + 'F'] || set[kind] || set.open;
      else if (r.n[2] < (st.near ?? 0.78)) g = set[kind + 'N'] || set[kind] || set.open;
      const cols = st._c || (st._c = stampColors(st.colors));
      const sh = g.length, sw = g[0].length;
      const flip = st.flipX ? -1 : 1;
      const x0 = r.xi - Math.floor(sw / 2), y0 = r.yi - Math.floor(sh / 2) + (st.dy || 0);
      for (let rr = 0; rr < sh; rr++)
        for (let c = 0; c < sw; c++) {
          const ch = g[rr][flip > 0 ? c : sw - 1 - c];
          if (ch === '.') continue;
          const x = x0 + c, y = y0 + rr;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x;
          if (!mat[i] && !st.overflow) continue;
          out[i] = cols[ch];
          if (mat[i] && mat[i] !== 31) baseMat[i] = mat[i];
          if (mat[i]) mat[i] = 31;
        }
    }
    for (const dt of model.dots || []) {
      const r = surf(dt.at);
      if (!r.vis || r.n[2] < (dt.minFacing ?? 0.35)) continue;
      const i = r.yi * W + r.xi;
      if (dt.onlyMat && mat[i] !== dt.onlyMat) continue;
      out[i] = dt.color !== undefined ? (typeof dt.color === 'string' ? PX.hex(dt.color) : dt.color) : pal[dt.mat].r[dt.tone ?? 0];
    }
    const mm = (i) => (mat[i] === 31 ? baseMat[i] || model.baseMat || 1 : mat[i]);

    /* ---- internal contour lines ---- */
    const PRI = model.pri || {};
    const lineCol = new Uint32Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!grp[i]) continue;
        const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
        for (const j of nb) {
          if (j < 0 || !grp[j] || grp[j] === grp[i]) continue;
          const m = mm(i);
          if (depth[j] > depth[i] + 1.2 * Math.max(1, scale * 0.8)) { lineCol[i] = pal[m].ln; break; }
          if (depth[j] >= depth[i] - 1.2 && (PRI[grp[i]] || 0) > (PRI[grp[j]] || 0)) { lineCol[i] = pal[m].ln; break; }
        }
      }
    for (let i = 0; i < N; i++) if (lineCol[i] && mat[i] !== 31) out[i] = lineCol[i];

    /* ---- outer outline (1px, sel-out) ---- */
    const final = new Uint32Array(N);
    final.set(out);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (mat[i]) continue;
        let best = -1, bestTone = 9;
        const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
        for (const j of nb) {
          if (j < 0 || !mat[j]) continue;
          const tj = tone[j] < 0 ? 2 : tone[j];
          if (best < 0 || depth[j] > depth[best]) { best = j; bestTone = tj; }
        }
        if (best < 0) continue;
        const m = mm(best);
        const P2 = rimMask[best] && rim && rim.pal ? rim.pal : pal;
        final[i] = bestTone >= 3 ? (P2[m] || pal[m]).ol : (P2[m] || pal[m]).od;
        depth[i] = depth[best] - 0.01;
        part[i] = part[best];
      }

    const A = {};
    for (const k in model.anchors || {}) {
      const a = model.anchors[k];
      const p = a.p || a;
      const q = M3.v(V, p);
      A[k] = [ox + q[0], oy - q[1], q[2]];
    }
    const buf = new PX.Buf(W, H);
    buf.d = final;
    return { buf, depth, part, W, H, ox, oy, anchors: A };
  }

  // Grade every colour of a palette through fn(colour, toneIndex); outlines get -2/-1
  function grade(base, fn) {
    const out = {};
    for (const k in base) {
      const e = base[k];
      out[k] = { r: e.r.map((c, i) => fn(c, i)), od: fn(e.od, -2), ol: fn(e.ol, -1), ln: fn(e.ln, -1) };
    }
    return out;
  }
  // Palette from hex strings: { id: { r:[5], od, ol, ln } }
  function palette(def) {
    const out = {};
    for (const k in def) {
      const e = def[k];
      out[k] = { r: e.r.map(PX.hex), od: PX.hex(e.od), ol: PX.hex(e.ol), ln: PX.hex(e.ln || e.ol) };
    }
    return out;
  }
  // measure the silhouette box of a rendered sprite (for sizing checks)
  function bounds(sprite) {
    const { buf } = sprite;
    let x0 = buf.w, y0 = buf.h, x1 = -1, y1 = -1;
    for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) if (buf.d[y * buf.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  return { render, code, grade, palette, bounds, F, comp, T, R, S, chain, onEll, sph, ell, plate };
})();
