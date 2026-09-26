# Creature modeling guide

Every Pokémon in the game is a small **3D model rendered straight to pixel art** by
`src/creature.js`. Mudkip (`src/mudkip.js`) is the reference implementation: read it first.

## How a model works

A model is a list of primitives in *model space* (units ≈ pixels at render scale 1):

- `x` = forward (the way the creature faces), `y` = up, `z` = the creature's side that
  faces the camera at yaw 0. **The ground contact point is the origin (y = 0).**
- `ell` primitives: analytic ellipsoids. `mat(s)` receives the hit point `s` on the unit
  sphere (local space) and returns a material code, or 0 to skip. Use it for colour
  regions and decals (belly, spots, mouth, cheeks, lines).
- `plate` primitives: flat 2D shapes (fins, claws, whiskers, tusks, wings) placed in 3D.
  Build the 2D shape with `Shape2D.poly(ctrlPoints, code)` (Catmull-Rom outline) or a custom
  `{ bb, test(u,v) }`, then wrap it with `bakeShape(shape)` so tests are O(1).
- `lines`: 1-px decal polylines in a primitive's local coordinates (ridges, segment lines).
- `stamps`: hand-drawn pixel stamps (eyes) placed at a surface point; variants are picked by
  how much the surface faces the camera (`open` / `openN` / `openF` ...).
- `dots`: single pixels (nostrils).
- `pri`: per-group priority for flush contour lines; `glossy`: materials that get specular.

Helpers (all global): `Creature.{ell, plate, chain, T, R, S, F, onEll, sph, code, palette, grade, bounds, render}`,
`M3` (3×3 math, `rx/ry/rz/diag/mul/v/cols`), `V3`, `Shape2D`, `bakeShape`, `PX.hex`.

```js
const Spheal = (() => {
  const { ell, plate, chain, T, R, onEll, sph, code } = Creature;
  const BODY = 1, BELLY = 2, SPOT = 3;               // material ids 1..30
  const PAL = Creature.palette({                     // 5-tone ramp: deep, shadow, base, light, highlight
    [BODY]: { r: ['#2f4f9a', '#4a6fc0', '#6e93dc', '#9dbcf0', '#d6e6ff'], od: '#1a2c62', ol: '#34529c', ln: '#35539e' },
    // od = outline on the shadow side, ol = outline on the lit side, ln = internal contour line
  });
  const DEFAULT = { roll: 0, mouth: 0, eyes: 'open', squash: 0 };
  function build(pose) {
    const P = Object.assign({}, DEFAULT, pose);
    const root = Creature.F(M3.diag(1 + P.squash * 0.5, 1 - P.squash, 1 + P.squash * 0.5), [0, 0, 0]);
    const body = chain(root, T(0, 70, 0), R(M3.rz(P.roll)));
    const bodyPrim = ell(body, [70, 70, 66], { part: 1, grp: 1, mat: (s) => (s[1] < -0.1 ? code(BELLY) : code(BODY)) });
    return { prims: [bodyPrim], stamps: [], dots: [], anchors: { top: [0, 140, 0] }, pri: { 1: 0 }, glossy: { [BODY]: 1 }, baseMat: BODY };
  }
  const render = (model, opt) => Creature.render(model, opt);
  return { build, render, PAL, MAT: { BODY, BELLY, SPOT }, DEFAULT,
           meta: { heightM: 0.8, bw: 230, bh: 200, oy: 0.86 } };  // sprite buffer at scale 1, origin fraction
})();
```

`meta.bw/bh` = sprite buffer size at scale 1 (must contain the creature in every pose/yaw),
`meta.oy` = where the ground line sits as a fraction of `bh` (origin x is the buffer centre).

## Size: Pokédex accurate

**175 model units = 1 metre** (Mudkip, 0.4 m, is 70 units tall at scale 1). Match the
Pokédex height of each species with the rendered silhouette height at yaw ≈ 1.1:

| Species | Pokédex | Target rendered height |
| --- | --- | --- |
| Mudkip | 0.4 m | 70 (reference) |
| Corphish | 0.6 m | ~105 |
| Luvdisc | 0.6 m | ~105 (heart height) |
| Spheal | 0.8 m | ~140 |
| Sealeo | 1.1 m | ~190 |
| Pelipper | 1.2 m | ~210 standing |
| Walrein | 1.4 m | ~245 |
| Kyogre | 4.5 m | ~790 long (game renders it at scale ≈ 0.55) |
| Wailord | 14.5 m | ~2540 long (game renders it far away at scale ≈ 0.12) |
| Dialga | 5.4 m | **exception: the player wants a super small Dialga, ~95 units tall, chibi** |

Check with the line-up: `dev/creature-test.html?lineup=mudkip,spheal,sealeo,walrein`.

## Style rules (match Mudkip)

- 5-tone ramps per material; outlines are a darker, more saturated version of the material
  hue (never pure black). `ol` lighter than `od`.
- Clean shapes, readable silhouettes, few materials (3-7). No noisy dithering on creatures.
- Glossy highlight only on shiny skin (Spheal/Sealeo skin, Kyogre, Dialga armour).
- Eyes: use stamps (see `EYES_S/EYES_L` in mudkip.js) or ellipse decals in `mat(s)` for big
  creatures. Eyes must stay clean and symmetrical; provide open, happy (^ ^), blink/closed.
- Must look unmistakably like the official design from 3/4 views: yaw 0.5–1.5 and the
  mirrored side (π − yaw). Profile (yaw 0) must also read well.
- Cute and polished: this is a cheerful cartoon game.

## Performance

Renders are cached by pose, but first renders must stay reasonable: ≤ 25 ms at scale 1 for
creatures up to ~250 px. For big models lower `model.shadowSteps` (default 30) to ~12–16.
Always `bakeShape()` plates.

## Workflow

Contact sheet (rows = poses, columns = yaws):

```
node tools/shot.mjs "$PWD/dev/creature-test.html?sp=spheal&yaws=0,0.6,1.1,1.6,2.2&z=3&poses=[{},{\"mouth\":1}]" OUT.png 1800 1100 "" 900
```

Then look at `OUT.png` with the image viewer (Read tool) and compare with the reference
image side by side. Iterate on proportions and colours until it is clearly on-model.
Reference images are in the repo root (`IMG_54xx.*`) and in the chat image folder.
