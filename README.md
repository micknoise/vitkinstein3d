# Wittgenstein 3D

**[Play it →](https://micknoise.github.io/wittgenstein3d/)**

A first-person exploration demo. 

The whole thing is one HTML file with no external requests. Every texture is drawn onto a canvas at
load time; there are no image assets anywhere.

![A storeroom door opening onto a warehouse](screenshots/portal-warehouse.jpg)

*A storeroom. Through the door, a warehouse that is nowhere near it.*

---

## Controls

| | |
|---|---|
| **WASD** | walk (shift to hurry) |
| **mouse** | look |
| **click** | take — it hovers at arm's length, still physical |
| **right-click** / **F** | throw |
| **wheel** | push the held object away / pull it closer |
| **E** | open a door |
| **Esc** | release the mouse |

Desktop only — it uses pointer lock.

---

## The building is generated

Every house is built from a seed, shown on the title screen. `?seed=424242` loads that one again;
**another house** on the title screen rolls a new one.

The *vocabulary* is authored and the *building* is generated.

Rooms attach to one another's free walls and are rejected if they would overlap. Contents are placed
against an occupancy grid — wardrobes and sideboards against walls, lamps in corners, mugs on the
tables they belong on — so nothing lands inside anything else and the doorways stay clear.

## Some of the doors and passages are portals.

![A kitchen door opening onto a landing](screenshots/portal-landing.jpg)

*A kitchen. Through the door, a landing from the other end of the house.*

---

## Building it

```sh
npm install
npm run build      # bundles three.js, cannon-es and src/ into index.html
npm test           # 63 checks against 5 different seeds, headless
npm run perf       # draw calls and triangles per room; fails over budget
npm run shots 1234 # renders every room and every portal of that building
npm run music 1234 # draws that house's score to wav, and measures it
```

`index.html` is the build output and is committed, so GitHub Pages serves it directly. There is no
build step for anyone who just wants to play it.

## Layout

| | |
|---|---|
| `src/00-textures.js` | every surface, drawn onto canvases at load; grime and decal layers |
| `src/05-rng.js` | the seeded random source |
| `src/10-types.js` | the vocabulary: room types, what is in them, where it goes |
| `src/15-generate.js` | the generator — layout, connections, dressing, portals |
| `src/20-build.js` | turns a plan into geometry and rigid bodies |
| `src/25-portal.js` | portal rendering and traversal |
| `src/30-player.js` | the body, the hands, the doors |
| `src/35-vision.js` | perception: one full-screen pass, driven by how far in you are |
| `src/38-music.js` | the score: generated, and played by what you do |
| `src/40-main.js` | sound, screen, loop |
| `shell.html` | the page the build is injected into |
| `SPECIFICATION.md` | what it is meant to do, as a checklist someone can assess it against |

A generated building and a hand-written one are the same kind of thing so you can still author a level by hand. The generator emits
the `SPACES` structure which the building uses.

There is a console handle on `window.VK`: `VK.go(x,y,z,yaw,pitch)` teleports, `VK.goSpace(key)` jumps
to a room, `VK.aimAt(x,y,z)` points the camera, `VK.tick(n)` runs *n* physics frames without
rendering, `VK.openAll()` opens every door, `VK.spaces` is the plan.

## You are not seeing this very well

It gets worse the further in you are — not in metres, in **doors**. Depth is
breadth-first steps from the room you woke up in, and a portal counts double:
you have not walked further, but you have been taken further.  shows
the raw render.

## The score

`?nomusic=1` turns the score off, `?noverb=1` takes out its reverb and leaves
everything else, `?fx=N` scales the visual FX and the score interactions, and
`npm run music` draws the score to a wav so it can be listened to away from the
game.

## Optimisation

The building is drawn a room at a time. Rooms are groups, and only the one you are in, the ones it
opens onto and anything two steps out that is on screen get drawn. Everything in a
room that never moves is merged into one piece of geometry per material.

Lights are descriptions rather than lights: a fixed pool of twelve is filled each frame from
wherever the camera is, scored by what each one actually contributes there, and two of them cast
shadows. Shadow maps are redrawn only when something has moved. Pixel ratio adapts to keep the
frame. `npm run perf` reports draw calls and triangles per room and **fails** above a stated budget,
so none of this quietly comes undone.

## Known limitations

- Portals are single-bounce: one seen through another renders black.
- Doors are animated rather than simulated; a leaf stops being solid the moment it moves.
- One storey, axis-aligned rooms. There are stairs, but no upstairs — the door at the top of a
  flight is a portal back to the ground floor.
- No inventory and no gating yet: everything is takeable and nothing is required.
- The score is stereo but not positional.

## Built with

[three.js](https://threejs.org) and [cannon-es](https://github.com/pmndrs/cannon-es), both bundled
into the single output file.
