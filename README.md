# Vitkinstein 3D

**[Play it →](https://micknoise.github.io/vitkinstein3d/)**

A first-person exploration demo. You are somewhere domestic and worn — wallpaper with damp coming
through it, a lamp doing most of the work, mugs somebody left on a table. Behind one of the doors is
a room that cannot be there, and you can see into it before you walk through.

No narrative, no NPCs, no combat, no fail state. The subject is perception and the uncanny: rooms
you did not expect, doors that go nowhere, a warehouse behind a terraced house. It takes after Mike
Nelson's constructed interiors, the parts of *Half-Life* the Backrooms came out of, and the dream in
which your own house has a corridor you have never seen.

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

The *vocabulary* is authored and the *building* is generated. That distinction is the whole design:
noise-based generation gives you endless plausible nothing, and the dread here depends on rooms
being recognisable — a specific front room, a specific storeroom — and then being where they cannot
be. So there are nine room types with size ranges, materials, lighting kinds and rules about what
tends to be in them and where; the generator decides which rooms exist, how big they are, how they
connect, what is in them and how worn they are.

Rooms attach to one another's free walls and are rejected if they would overlap. Contents are placed
against an occupancy grid — wardrobes and sideboards against walls, lamps in corners, mugs on the
tables they belong on — so nothing lands inside anything else and the doorways stay clear.

## Two of the doors are not doors

They are portals. Each face renders the view out of its twin into a texture, mapped back onto the
opening in screen space with an oblique clip plane, so you *see* the other place through the doorway
and it parallaxes correctly as you move. Walk through and you are moved and turned by the transform
that takes one frame to the other, keeping your speed and whatever you are carrying. Objects go
through too — throw a mug at one and it arrives, turning as the space turns — which matters more
than it sounds, because leaving objects in rooms is how people work out what the building is doing.

One passage in every house returns to itself: both its ends are the same doorway, so you can walk
down it as long as you like and never leave it. Looking along it, you see the corridor receding into
itself.

This is what lets space stop adding up. Because the two sides are never connected in world space,
the generator can put the far side anywhere at all — including a warehouse larger than the entire
house, reached through an internal wall.

![A kitchen door opening onto a landing](screenshots/portal-landing.jpg)

*A kitchen. Through the door, a landing from the other end of the house.*

---

## Building it

```sh
npm install
npm run build      # bundles three.js, cannon-es and src/ into index.html
npm test           # 25 checks against 5 different seeds, headless
npm run perf       # draw calls and triangles per room; fails over budget
npm run shots 1234 # renders every room and every portal of that building
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
| `src/35-video.js` | the tape: one full-screen pass, camera and VHS |
| `src/40-main.js` | sound, screen, loop |
| `shell.html` | the page the build is injected into |
| `SPECIFICATION.md` | what it is meant to do, as a checklist someone can assess it against |

A generated building and a hand-written one are the same kind of thing — the generator emits exactly
the `SPACES` structure the builder consumes, so you can still author a level by hand.

There is a console handle on `window.VK`: `VK.go(x,y,z,yaw,pitch)` teleports, `VK.goSpace(key)` jumps
to a room, `VK.aimAt(x,y,z)` points the camera, `VK.tick(n)` runs *n* physics frames without
rendering, `VK.openAll()` opens every door, `VK.spaces` is the plan.

## One window

Every space is an interior except for one. Somewhere in each house there is a window, and outside it
there is nothing — no ground, no sky, nothing to judge a distance against. The house stops at the
glass. Daylight comes through it anyway, in a shaft down onto the floor, and nothing out there
accounts for it.

## Everything you see is footage

The frame is not the render. The world is drawn into a target and the target is drawn onto the
screen through a camera strapped to somebody's head and a tape that has been used before: a wide
lens that bends the walls, scan lines, chroma that does not sit quite on the luma, interference that
comes and goes, and the head-switching bar rolling up the picture every few seconds. 
shows you the raw render.

## Keeping it fast

The building is drawn a room at a time. Rooms are groups, and only the one you are in, the ones it
opens onto and anything two steps out that is actually on screen get drawn at all. Everything in a
room that never moves is merged into one piece of geometry per material, which took the worst room
from 334 draw calls to 173 — objects you can pick up stay separate, because you navigate by them.

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
- Sound is monophonic — the distant thump is distant in timbre only.

## Built with

[three.js](https://threejs.org) and [cannon-es](https://github.com/pmndrs/cannon-es), both bundled
into the single output file.
