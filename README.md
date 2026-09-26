# Mudkip Beach Museum

A fictional museum exhibition, **Mudkip: A Day at the Beach**: five animated pixel
paintings of one shoreline from dawn to midnight. Every painting is rendered live in
the browser. Click a painting to step into the viewing room and watch it come to life,
then tap the scene to play (boost the ball, splash the water, make Mudkip jump).

Open `index.html` in any modern browser. No build step or server is needed to view it.

| No. | Title | Time | What happens |
| --- | --- | --- | --- |
| I | First Light | 06:12 | Mudkip noses the beach ball along the wet sand at sunrise; the swash erases its pawprints. |
| II | High Noon Header | 12:04 | The centerpiece. Mudkip heads the ball into the air from ankle-deep water and splashes down on every landing. |
| III | Swell Season | 15:30 | Swimming in the swell, flicking the ball, and a dolphin leap every third throw. Waves burst on the rocks. |
| IV | Golden Hour | 18:47 | Backlit by the setting sun, Mudkip balances the ball on its head fin. |
| V | Moonlit Lullaby | 23:10 | Asleep against the ball under the stars, with glowing waves and a sweeping lighthouse beam. |

## How it works

- **Mudkip is a tiny 3D model** (ellipsoids for the head, body and legs; flat plates for the
  head fin, tail fan and three-spiked cheek gills) ray-cast straight into pixels. It is
  toon-shaded into hand-picked five-step colour ramps, then finished with sel-out outlines,
  cast shadows between parts and hand-drawn eye stamps. That is why it can turn, squash,
  leap and sleep from any angle while staying on-model.
- **Everything else is painted procedurally** into a 384 × 216 framebuffer: dithered skies,
  clouds, a swash cycle with foam, wet sand and caustics, reflections, splashes, ripples,
  palm trees, the lighthouse, stars and fireflies.
- **Each hour regrades the same palette** (sunrise lavender, sunset rim light, moonlight).
- **Sound is synthesized** with the Web Audio API (surf, gulls, crickets, splashes, boings).
  It stays off until you turn it on in the viewer.

## Controls in the viewing room

`←` `→` change painting · `Space` pause · `M` sound · `L` pixel loupe · `Esc` close ·
swipe left/right on touch screens.

## Source

The page is built from `src/` into a single self-contained `index.html`:

```
node tools/build.mjs
```

| File | Role |
| --- | --- |
| `src/px.js` | Framebuffer, colour helpers, dithering, noise |
| `src/mudkip.js` | Posable Mudkip model and pixel renderer |
| `src/ball.js` | Spinning beach ball renderer |
| `src/scenery.js` | Skies, clouds, palms, lighthouse, particles |
| `src/actors.js` | Springs, sprite caching, shadows, reflections, splashes |
| `src/beach.js` | Shared shoreline: sea, swash, foam, wet sand |
| `src/paintings.js`, `src/paintings2.js` | The five paintings |
| `src/app.js` | Gallery, pixel frames, viewing room, sound |
| `src/page.html`, `src/style.css` | Page markup and museum styles |

`dev/scene-test.html?p=noon&t=3&z=3` renders any painting at a given time for inspection.

---

Unofficial fan art, made for fun. Pokémon and Mudkip are trademarks of Nintendo,
Creatures Inc. and GAME FREAK inc. The Tidepool Museum is fictional.
