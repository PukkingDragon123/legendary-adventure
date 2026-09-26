/* ------------------------------------------------------------------
   Actors — Mudkip and the beach ball as living things on the canvas:
   springs for squash & secondary motion, sprite caching, shadows,
   reflections and splashes.
------------------------------------------------------------------- */
class Spring {
  constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  kick(v) { this.v += v; return this; }
  step(dt, target = 0) {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.x - target) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

const Ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

class MudkipActor {
  constructor(o) {
    this.x = o.x;
    this.gy = o.gy; // ground line (feet) in screen px
    this.h = 0; // height above ground
    this.yaw = o.yaw ?? 1.15;
    this.pitch = o.pitch ?? 0.16;
    this.scale = o.scale ?? 1;
    this.pal = o.pal;
    this.light = o.light;
    this.cache = new Map();
    this.sq = new Spring(300, 13);
    this.fin = new Spring(120, 6.5);
    this.tail = new Spring(80, 5);
    this.blinkAt = 1.5 + Math.random() * 2;
    this.blinkT = 0;
    this.pose = {};
    this.last = null;
    this.SW = Math.ceil((o.bw || 112) * this.scale);
    this.SH = Math.ceil((o.bh || 112) * this.scale);
    this.OX = Math.floor(this.SW / 2);
    this.OY = Math.floor(this.SH * (o.oy ?? 0.86));
  }
  // blink scheduler: returns true while eyes should be shut
  blink(t, dt) {
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      return true;
    }
    if (t > this.blinkAt) {
      this.blinkT = 0.13;
      this.blinkAt = t + 2.2 + Math.random() * 2.8;
      return true;
    }
    return false;
  }
  sprite(pose) {
    const q = (v, s) => Math.round((v || 0) / s) * s;
    const P = {
      squash: q(pose.squash, 0.02), lean: q(pose.lean, 0.03), headPitch: q(pose.headPitch, 0.03),
      headYaw: q(pose.headYaw, 0.04), headRoll: q(pose.headRoll, 0.03), finSway: q(pose.finSway ?? 0.04, 0.03),
      finTwist: pose.finTwist ?? 0.32, tailLift: q(pose.tailLift, 0.04), tailWag: q(pose.tailWag, 0.05),
      tailTwist: pose.tailTwist ?? -0.85, legF: q(pose.legF, 0.08), legB: q(pose.legB, 0.08), legSplay: q(pose.legSplay, 0.06),
      mouth: q(pose.mouth ?? 0.6, 0.1), eyes: pose.eyes || 'open', gill: q(pose.gill, 0.04), look: q(pose.look, 0.05),
      bodyDip: q(pose.bodyDip, 0.5),
    };
    const yaw = q(this.yaw, 0.035);
    // fins are "cheated" toward the camera; mirror the cheat when Mudkip faces left
    const side = Math.max(-1, Math.min(1, Math.cos(yaw) * 3));
    P.finTwist = q((pose.finTwist ?? 0.32) * side, 0.04);
    P.tailTwist = q((pose.tailTwist ?? -0.85) * side, 0.04);
    const key = yaw + '|' + Object.values(P).join('|');
    let s = this.cache.get(key);
    if (!s) {
      s = Mudkip.render(Mudkip.build(P), {
        yaw, pitch: this.pitch, scale: this.scale, W: this.SW, H: this.SH, ox: this.OX, oy: this.OY, pal: this.pal, light: this.light,
      });
      this.cache.set(key, s);
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
    }
    this.last = s;
    return s;
  }
  // screen-space top-left of the sprite buffer
  origin() { return [Math.round(this.x) - this.OX, Math.round(this.gy - this.h) - this.OY]; }
  anchor(name) {
    const s = this.last;
    const [x0, y0] = this.origin();
    const a = s.anchors[name];
    return [x0 + a[0], y0 + a[1]];
  }
  // draw sprite; optional water line (screen y) below which pixels are tinted as submerged
  draw(fb, opts = {}) {
    const s = this.last;
    const [x0, y0] = this.origin();
    const { waterY = null, sub = null, subDeep = null } = opts;
    fb.blit(s.buf, x0, y0, {
      map: waterY === null ? null : (c, x, y) => {
        if (y < waterY) return c;
        if (subDeep && y > waterY + (opts.deepAfter ?? 3)) return subDeep(c);
        return sub(c);
      },
    });
  }
  // vertical mirror image into water pixels
  reflect(fb, axisY, t, opts) {
    const s = this.last;
    const [x0, y0] = this.origin();
    const { tint, test, gap = 0, fadeLen = 40, wobble = 1 } = opts;
    const W = s.buf.w, H = s.buf.h, d = s.buf.d;
    for (let sy = 0; sy < H; sy++) {
      const wy = y0 + sy; // world y of source row
      if (wy > axisY) continue;
      const ty = Math.round(2 * axisY - wy + gap);
      if (ty < 0 || ty >= fb.h) continue;
      const dist = ty - axisY;
      if (dist > fadeLen) continue;
      const off = Math.round(Math.sin(ty * 0.9 + t * 5.2) * wobble * (0.5 + dist / fadeLen));
      const fade = dist / fadeLen;
      for (let sx = 0; sx < W; sx++) {
        const c = d[sy * W + sx];
        if (!c) continue;
        const tx = x0 + sx + off;
        if (tx < 0 || tx >= fb.w) continue;
        if (test && !test(tx, ty)) continue;
        if (PX.bayer4(tx, ty) < fade * 0.9) continue;
        fb.d[ty * fb.w + tx] = tint(c);
      }
    }
  }
}

class BallActor {
  constructor(o) {
    this.x = o.x; this.y = o.y; this.vx = 0; this.vy = 0;
    this.R = o.R ?? 12;
    this.rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.axis = [0.3, 0.2, 1];
    this.w = 3;
    this.pal = o.pal;
    this.light = o.light;
    this.squashT = 0;
    this.sprite = null;
  }
  spin(dt) {
    this.rot = M3.mul(Ball.axisAngle(this.axis, this.w * dt), this.rot);
  }
  render() {
    let sx = 1, sy = 1;
    if (this.squashT > 0) {
      const k = Math.sin((this.squashT / 0.16) * Math.PI) * 0.16;
      sx = 1 + k; sy = 1 - k;
    }
    this.sprite = Ball.render({ R: this.R, rot: this.rot, light: this.light, sx, sy, pal: this.pal });
    return this.sprite;
  }
  draw(fb) {
    const s = this.sprite || this.render();
    fb.blit(s.buf, Math.round(this.x) - s.cx, Math.round(this.y) - s.cy);
  }
  reflect(fb, axisY, t, opts) {
    const s = this.sprite || this.render();
    const { tint, test, fadeLen = 40 } = opts;
    const x0 = Math.round(this.x) - s.cx, y0 = Math.round(this.y) - s.cy;
    const W = s.buf.w, H = s.buf.h;
    for (let sy = 0; sy < H; sy++) {
      const wy = y0 + sy;
      if (wy > axisY) continue;
      const ty = Math.round(2 * axisY - wy);
      const dist = ty - axisY;
      if (ty < 0 || ty >= fb.h || dist > fadeLen) continue;
      const off = Math.round(Math.sin(ty * 0.9 + t * 5.2) * (0.5 + dist / fadeLen));
      for (let sx = 0; sx < W; sx++) {
        const c = s.buf.d[sy * W + sx];
        if (!c) continue;
        const tx = x0 + sx + off;
        if (tx < 0 || tx >= fb.w) continue;
        if (test && !test(tx, ty)) continue;
        if (PX.bayer4(tx, ty) < (dist / fadeLen) * 0.9) continue;
        fb.d[ty * fb.w + tx] = tint(c);
      }
    }
  }
}

// dithered elliptical shadow using a darkening colour map
function dropShadow(fb, cx, cy, rx, ry, dark, strength = 1, test = null) {
  const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= fb.w || y >= fb.h) continue;
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      const d = u * u + v * v;
      if (d > 1) continue;
      if (test && !test(x, y)) continue;
      const k = (d < 0.55 ? 1 : (1 - d) / 0.45) * strength;
      if (PX.bayer4(x, y) >= k) continue;
      const i = y * fb.w + x;
      fb.d[i] = dark(fb.d[i]);
    }
}

// Water splash: crown sheet, flung droplets, spray column, foam patch and expanding rings
function splash(parts, x, y, o = {}) {
  const n = o.n ?? 20, power = o.power ?? 1;
  const cDrop = o.c || PX.hex('#ffffff'), cDrop2 = o.c2 || PX.hex('#8fd6ee'), cRing = o.ring || PX.hex('#e8fbff');
  const test = o.test || null;
  const tiny = (p) => parts.add({ type: 'ripple', x: p.x, y: p.floor, r0: 0.5, r1: 2.5 + Math.random() * 2, flat: 0.4, life: 0.45, c: cRing, layer: 0, test });
  // flung droplets in every direction (perspective-flattened ring)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const sp = (34 + Math.random() * 46) * power;
    const up = (80 + Math.random() * 100) * power;
    parts.add({
      type: 'drop', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 1.5 - 1, vx: Math.cos(a) * sp, vy: -up, g: 430,
      life: 2, c: cDrop, c2: cDrop2, size: Math.random() < 0.45 ? 2 : 1, layer: Math.sin(a) < -0.2 ? 0 : 1, floor: y + Math.sin(a) * 4 + 1, onFloor: tiny,
    });
  }
  // crown sheet: two tight fans rising from the rim of the impact
  const crown = Math.round((o.crown ?? 18) * power);
  for (let i = 0; i < crown; i++) {
    const side = i % 2 ? 1 : -1;
    const a = -Math.PI / 2 + side * (0.28 + Math.random() * 0.42);
    const sp = (120 + Math.random() * 80) * power;
    parts.add({
      type: 'drop', x: x + side * (5 + Math.random() * 7), y: y - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 560,
      life: 2, c: cDrop, c2: cDrop2, size: 2, layer: 1, floor: y + 1 + Math.random() * 2, onFloor: tiny,
    });
  }
  // central spray column
  for (let i = 0; i < 7 * power; i++) {
    parts.add({
      type: 'drop', x: x + (Math.random() - 0.5) * 6, y: y - 2, vx: (Math.random() - 0.5) * 26, vy: -(130 + Math.random() * 90) * power, g: 470,
      life: 2, c: cDrop, c2: cDrop2, size: 2, layer: 1, floor: y + 1,
    });
  }
  parts.add({ type: 'crown', x, y: y + 1, w: 17 * power, h: 13 * power, life: 0.42, c: cDrop, c2: cDrop2, layer: 1, seed: Math.floor(Math.random() * 999) });
  parts.add({ type: 'patch', x, y: y + 1, rx: 15 * power, ry: 4.2 * power, life: 0.9, c: cDrop, c2: cRing, layer: 0, test, seed: Math.floor(Math.random() * 999) });
  parts.add({ type: 'ripple', x, y: y + 1, r0: 6, r1: 30 * power, flat: 0.32, life: 1.2, c: cRing, layer: 0, test });
  parts.add({ type: 'ripple', x, y: y + 1, r0: 3, r1: 18 * power, flat: 0.32, life: 0.9, c: cRing, layer: 0, test });
}
