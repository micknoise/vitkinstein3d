# Working on Vitkinstein 3D

A first-person exploration demo about perception and the uncanny. Read
`PLAN.md` before starting anything — it is the experiment list and the working
method, and it is where results get written down.

## Build and verify

```sh
npm install
npm run build                 # src/ + three + cannon-es  ->  index.html
npm test                      # 43 checks x 5 seeds, headless; must be green
npm test 424242               # one seed
npm run perf                  # draw calls / triangles / lights per room
npm run perf all              # ...across all five test seeds
                              # both exit 1 above the budget in perf-probe.js
npm run shots 424242          # a screenshot of every room and every portal
npm run compare -- old.html shots/before 424242 '&pr=1'
npm run diff shots/before shots/after   # 0.00% between two runs of one build
```

`index.html` is a build output **and is committed** — GitHub Pages serves it
directly. Rebuild and commit it with any change to `src/`, or the published
game silently drifts from the source.

## Shape of the code

Files are concatenated in filename order into one IIFE, so everything shares a
scope and there are no imports. Load order matters.

| | |
|---|---|
| `src/00-textures.js` | every surface, drawn onto canvases at load; grime and decals |
| `src/05-rng.js` | the seeded random source — `R`, `rr`, `ri`, `rpick`, `rchance` |
| `src/10-types.js` | the vocabulary: room types, what is in them, where it goes |
| `src/15-generate.js` | the generator: layout, connections, dressing, portals |
| `src/20-build.js` | plan → geometry, rigid bodies, light descriptions, room groups |
| `src/25-portal.js` | portal rendering and traversal |
| `src/30-player.js` | the body, the hands, the doors |
| `src/35-video.js` | the tape: the whole frame, through a helmet camera |
| `src/40-main.js` | sound, screen, the frame loop, the light pool, visibility |

**Everything random must come from `05-rng.js`,** never `Math.random()`, or
seeds stop reproducing and the test suite stops meaning anything. (Audio noise
buffers are the deliberate exception.)

The generator emits exactly the `SPACES` structure the builder consumes, so a
generated building and a hand-written one are the same kind of thing.

## Things that will bite

- **Lights are descriptions.** `allLights` are plain objects. The real lights
  are a pool of 12 in `LIGHT_POOL`, refilled per frame by contribution at the
  camera. Adding a `THREE.PointLight` directly will work in one room and blow
  the shader's light budget in another. Use `addLight()`.
- **Shadow maps do not update on their own.** `shadowMap.autoUpdate = false`.
  If you move a caster in a new way, set `shadowsDirty = true`.
- **Meshes belong to a room group,** via `attach()`. Anything added straight to
  `scene` is never culled and never hidden. Statics have
  `matrixAutoUpdate = false` after `freezeStatics()` — move one and it will not
  move.
- **Raycasts take `null`, not `scene.children`** — `lookedAt(null)` narrows to
  nearby visible rooms itself.
- **Portal views re-render the whole scene** from another camera. Anything
  per-frame keyed to the main camera must be right for that camera too; the
  light pool already handles this via `applyLightPoolAt`.
- **Headless raycasts need `scene.updateMatrixWorld(true)`** — `VK.tick()` does
  it, real frames do it at render.

## Debug handle

`window.VK` — `go(x,y,z,yaw,pitch)`, `goSpace(key)`, `aimAt(x,y,z)`,
`tick(n)` (physics without rendering), `openAll()`, `grab()/hurl()`,
`spaces`, `count()`, `info()`, `PORTALS`, `renderer`.

URL flags: `?seed=N`, `?perf=1`, `?pr=N` (pin pixel ratio), `?nograin=1`,
`?nodrift=1` (stop rooms changing behind you), `?novhs=1` (raw render, no tape).

## House rules

- No narrative, no NPCs, no combat, no fail state.
- No external requests, no image assets, one file.
- Walking speed stays 2.15 m/s.
- **The room-name prompt stays**, and stays as it is. It is how players work out
  what is happening — see `PLAN.md` §2 and A5. Rooms deliberately labelled `'—'`
  stay silent.
- Grabbable objects stay individual and dependable. They are what players use to
  navigate; do not merge, pool or stabilise them away.
- **Trunk only — no experiment branches.** One experiment per commit, on `main`,
  pushed as soon as `npm test` is green: GitHub Pages serves `main`, and playing
  it is how an experiment gets judged. Revert is the undo. Record the verdict in
  `PLAN.md` §10, including for the ones you throw away.
- `npm run perf` before and after anything touching rendering; put both sets of
  numbers in the commit message. It fails above the budget — if a change really
  needs more, raise the budget deliberately and say why.
