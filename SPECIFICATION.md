# Vitkinstein 3D — Demo Specification

**Build:** v0.2 — generated buildings, non-euclidean space
**Date:** 27 August 2026
**Deliverable:** `index.html` — one self-contained file, ~1.1 MB, works offline
**Purpose of this document:** a checklist a human operator can assess the build against, without reading the source.

**Changes since v0.1:** the building is now generated rather than authored (§3.1); doorways can be
portals, so space no longer adds up (§3.2); visible texture tiling addressed by larger tiles, a
non-repeating grime layer and a decal pass (§3.7); skirting and dado rails stop at doorways (F27);
seeds make any building reproducible (F1).

**Changes since the v0.2 tag:** objects go through portals rather than only the player (F15a–F15b);
portal faces no longer show a view they did not just render (F15c); objects are drawn in the room
they are in rather than the room they were built in (F15d); statics are merged per room and per
material, and the cost is now held to a budget the build fails on (N4, N6); a seed reproduces a
building's surfaces and not only its layout (N7).

---

## 1. What this is

A first-person 3D exploration demo in the browser. You are somewhere domestic and worn. Behind one
of the doors is a room that cannot be there, and you can see into it before you walk through.
No narrative, no NPCs, no combat, no fail state. The subject is perception and the uncanny.

References: Mike Nelson's constructed interiors; the parts of *Half-Life* the Backrooms came out
of; the dream in which your own house has a corridor you have never seen.

Still a **toy engine** — content is expected to be replaced. What is being proved is the world,
the interaction, the atmosphere, and now the generator and the impossible geometry.

---

## 2. Scope

### In scope for v0.2

| # | Item |
|---|---|
| S1 | A seeded generator that builds the whole house from a room-type vocabulary |
| S2 | Doorways that are portals: you see through them, and space does not add up |
| S3 | Rigid-body physics on all loose objects |
| S4 | Pick up / carry / throw, in the three.js pattern that ports to VR |
| S5 | Surfaces that do not read as one tile repeated |
| S6 | Doors, atmosphere, procedural sound |

### Deliberately not in v0.2

Inventory; required pickups and gating; VR; save/load; exterior; stairs or level changes;
recursive portals (a portal seen through a portal); physics objects passing through portals;
anything that follows you.

---

## 3. Functional requirements

Each requirement has an acceptance test an operator can run by hand.

### 3.1 The generator

| ID | Requirement | How to assess |
|---|---|---|
| **F1** | Every building is generated from a seed shown on the title screen. The same seed always gives the same house; `?seed=424242` in the URL loads that one. **Another house** on the title screen generates a fresh one. | Note the seed, play, reload with `?seed=` that number. Same house. Press **another house**. Different one. |
| **F2** | 9–13 rooms per building, drawn from nine authored types: front room, back room, box room, kitchen, passage, landing, storeroom, plant room, and one warehouse. | Walk the building. Count. |
| **F3** | Rooms attach to one another's walls with a shared doorway, and never overlap in space. | Nothing intersects; no doorway opens into the back of another room's wall. |
| **F4** | Every room is reachable from where you start. | You can get everywhere without clipping. |
| **F5** | Room contents are placed by rule, not scattered at random: wardrobes and sideboards against walls, lamps in corners, mugs and bottles on the tables and benches they belong on, small objects anywhere there is floor. Nothing is placed inside anything else, and the doorways stay clear. | Look at any room. Furniture should look put there, not dropped. |
| **F6** | Each building has its own colour scheme — the wallpaper and carpet are mixed per seed. | Compare two seeds. |
| **F7** | Some light fittings simply do not work (about one in eight), and some flicker. | Look up in several rooms. |
| **F8** | Some rooms have a doorway that opens onto brick — a room that should be there and is not. | Find one. They are always in walls with nothing behind them. |
| **F9** | You start standing near a wall looking across the room, with nothing placed where you are standing. | Reload a few seeds. You should never begin facing plaster at arm's length. |

### 3.2 Non-euclidean space

| ID | Requirement | How to assess |
|---|---|---|
| **F10** | Each building has two portal doorways: one from an ordinary room onto a warehouse of 16–30 m × 12–22 m × 5–8 m, and one linking two ordinary rooms that are nowhere near each other. | The title screen says how many "doors that are not doors" there are. |
| **F11** | You **see through** a portal — the far room is rendered live through the opening, correctly aligned as you move, not a black rectangle or a still image. | Stand off to one side of a portal and move. The view through it parallaxes like a real doorway. |
| **F12** | The view through a portal matches the brightness and colour of the room it shows. | Compare the warehouse seen through the door with the warehouse walked into. |
| **F13** | Walking through a portal is seamless: you are moved and turned so that you continue in the direction you were walking, keeping your speed and whatever you are carrying. | Walk through at an angle, carrying a mug. You should not be able to feel the seam. |
| **F14** | The space beyond a portal is genuinely impossible — the warehouse is larger than the entire house and reached through an internal wall. | Pace out the room you entered from, then the warehouse. |
| **F15** | Portals never open onto the back of an existing room's wall. | Every portal leads somewhere. |
| **F15a** | Objects go through portals too, not only the player. A thrown object is moved, turned and keeps its speed and spin, and arrives in the room on the far side. | Throw a mug through one and watch where it lands. Roll something through and it keeps rolling. |
| **F15b** | An object held while crossing stays visible the whole way. What you carry reaches the plane about a metre before your eyes do, and for those steps it is drawn through the doorway rather than hidden behind it. | Walk slowly through a portal carrying something and watch it. |
| **F15c** | A portal opening never shows a view it did not just render. From behind its own plane, or beyond the two-face budget, it shows the room rather than a stale image. | Walk through, turn round, and back up into the doorway. |
| **F15d** | An object is drawn in the room it is in, not the room it was built in. Objects left in other rooms as markers are there when you return. | Leave something in three rooms, walk a loop, and come back. |
| **F14a** | One window per house, and outside it is nothing — no ground, no sky, no far wall. The house stops at the glass. You cannot climb out or throw anything out. | Find it. Look out. Put your face to the glass and move. |
| **F15e** | One passage in the house returns to itself: its two ends are linked to each other, so walking down it brings you back to where you started, past the same fittings again. Looking down it, you see the corridor itself receding. | Find the corridor with a doorway at both ends and no way out at either. Put a mug halfway along and walk. |

### 3.3 Movement and body

| ID | Requirement | How to assess |
|---|---|---|
| **F16** | WASD and mouse look under pointer lock. Deliberately slow (≈2.15 m/s) with weight, subtle head bob and roll; shift raises it to ≈3.5 m/s. | Walk a corridor. It should feel like a body. |
| **F17** | You collide with walls, floors and furniture, and cannot leave the building or fall out of the world. | Walk into everything. |
| **F18** | W walks exactly where the camera points, at every heading. | Face a corner diagonally and walk. |
| **F19** | Footsteps sound at a walking cadence and stop when you stop. | Walk, then stand. |

### 3.4 Hands

| ID | Requirement | How to assess |
|---|---|---|
| **F20** | Looking at a loose object within ~2.6 m shows "take" and opens the reticle. | Look at a mug, a bottle, a brick. |
| **F21** | Left-click takes it. It hovers at arm's length, still physical — it collides with the world while held. | Walk a held mug into a wall. |
| **F22** | Left-click drops it; right-click or F throws it, harder for light things than heavy ones. | Throw a mug, then a drum. |
| **F23** | Mouse wheel pushes the held object out to 1.7 m or pulls it in to 0.55 m. | Hold something and scroll. |
| **F24** | Impacts sound in proportion to speed and mass; objects come to rest and stay at rest. | Knock a crate stack over and wait. |

### 3.5 Doors

| ID | Requirement | How to assess |
|---|---|---|
| **F25** | Hinged doors on most connections between rooms. Looking at one shows "open"; E or right-click swings it with a creak; again closes it. | Open and close several. |
| **F26** | A closed door is solid; an opening door stops being solid, so it can never trap you. | Stand in a doorway and open the door into yourself. |
| **F27** | Skirting boards, dado rails and picture rails stop at every doorway and butt into the architrave. Nothing runs across an opening. | Open a door in a room with a dado rail and look at the threshold. |

### 3.6 The world

| ID | Requirement | How to assess |
|---|---|---|
| **F28** | Every space announces itself once, quietly, in lower case, on first entry. The warehouse and the plant room do not. | Walk the building. |
| **F29** | 140–230 objects can be picked up across a building. | Spot-check per room. |
| **F30** | Fog density is per room and cross-fades as you move between them — thickest in passages, thinnest in the warehouse. | Walk slowly between two rooms. |

### 3.7 Surfaces and atmosphere

| ID | Requirement | How to assess |
|---|---|---|
| **F31** | **No visible tiling.** Wall, floor and ceiling textures are drawn at 1024 with detail counts scaled to area, so a tile covers about four metres at the same grain as one metre would. | Stand back from the longest wall in the warehouse and look for a repeat. This was the main defect in v0.1. |
| **F32** | Each wall segment's UVs are offset at random, so neighbouring pieces of the same wall never line their tiles up. | Look along a wall past a doorway. |
| **F33** | A non-repeating grime layer is stretched once over each wall segment and multiplied over the base texture — damp rising from the skirting, streaks running down from the ceiling — with its edges faded so the layer itself leaves no rectangle. | Look at any wall. The dirt should not repeat anywhere. |
| **F34** | A second pass sticks things on the walls after the fact: mould at floor and ceiling level, thrown paint splats with runs, torn and sun-faded posters. Two to nine per room depending on type. | Find mould in a plant room and a poster in a kitchen. |
| **F35** | Every surface is procedurally generated at load with derived normal maps — no image files anywhere. | Stand close to concrete. There is grain, stain and relief. |
| **F36** | Lighting is entirely practical: bulbs, tubes and standard lamps, all visible in the scene, warm indoors, cold in passages and kitchens. | Look up. |
| **F37** | Film grain and vignette at all times. | Any screenshot. |
| **F38** | Sound is generated at runtime: room tone, mains hum, footsteps, impacts, door creaks, a drop as you pass through a portal, and an occasional distant thump from a part of the building you have not found. | Play with sound on for a minute. |

---

## 4. Non-functional requirements

| ID | Requirement | How to assess |
|---|---|---|
| **N1** | Single HTML file, no build step, no server, no network. | Open it from the desktop with the wifi off. |
| **N2** | Clean console during load and play. | Devtools. |
| **N3** | Loads to playable in a few seconds. Generation, texture synthesis and normal-map derivation all happen at load. | Time it. |
| **N4** | Runs at monitor refresh on a GPU of the last decade at 1080p. Rooms are drawn a group at a time — the one you are in, the ones it opens onto, and anything two steps out that is on screen. Everything static in a room is merged to one mesh per material. Lights are descriptions filled into a pool of twelve each frame, scored by contribution at the camera, two of which cast shadows; shadow maps redraw only when a caster has moved. Pixel ratio adapts between 0.75 and 1.25. At most two portals render per frame, each an extra pass at 32% of the render, only within 14 m and on screen. | Move around with a frame counter. See §5 on measurement. |
| **N5a** | Sound is positional: an impact, a door and the distant thump are heard from where they happen, and turn around you as you turn. The room tone and the mains hum are not positional, being the room itself. | Put on headphones, drop something to one side and turn on the spot. |
| **N6** | The cost does not creep back. `npm run perf` reports draw calls and triangles per room and exits non-zero above a stated budget — 280 draw calls and 11,000 triangles per room, 640 geometries in the scene. | `npm run perf all` across the five test seeds. |
| **N7** | A seed reproduces a building exactly, surfaces included: the same number gives the same layout, the same wear and the same cracks in the same plaster. | Load `?seed=424242` twice and compare. `npm run compare` and `npm run diff` do it by pixel. |
| **N5** | Chromium, Firefox, Safari on desktop. Pointer lock makes it desktop-only by design. | Two of the three. |

---

## 5. Verified in headless Chromium

`node test.js` runs twenty-five checks against **five different seeds** — the point being that a
generator has to be correct for buildings nobody has looked at, not just the one in the screenshot.
All pass. The suite covers:

- room count, no two rooms overlapping, every room reachable including through portals
- standing on the floor, walking distance over time, not walking out of the building, not falling
  out of the world
- taking an object, holding it in front of you, throwing it
- every door swinging fully open
- **F27 geometrically**: a ray is fired through every doorway in every room with trim, at skirting
  height and dado height, and must reach the far side unobstructed (140+ rays per run)
- **F13**: walking into a portal and arriving in the room on the far side
- **F15a**: an object pushed into a portal coming out on the far side rather than the near one
- **F15b**: carrying an object up to a portal until it is through and you are not, and it staying
  in your hands, drawn, with no drift
- **F15c**: a portal face drawn from in front of it and not from behind its own plane
- **F15d**: an object carried through a portal still being drawn on the other side
- **F15e**: walking out of one end of the looping corridor and arriving at its other end, in the
  same room, nearer the end you were walking towards than the one you left by
- every portal face agreeing on which side of it you are, after a crossing
- objects settling rather than jittering
- a clean console

Frame rate under SwiftShader is not a measurement of anything — it is a software rasteriser with no
GPU. Assess N4 on real hardware.

Two defects the suite caught and that are now fixed, worth re-checking by hand: doorway offsets
could slide a doorway outside the wall it was cut into (leaving a wall across the opening), and a
portal opening could be cut without its portal ever being made (leaving a hole you fell through).

---

## 6. Extending it

**The vocabulary** is `src/10-types.js`. A room type says its size range, materials, trim, lighting
kind, and what tends to be in it and where:

```js
kitchen: {
  label: ['the kitchen', 'the scullery'],
  w: [2.8, 4.6], d: [2.6, 4.2], h: [2.4, 2.75],
  floor: 'tile', wall: 'cream', ceiling: 'plaster',
  skirting: true, fog: [0.05, 0.08], lights: 'strip', decals: [1, 3],
  dress: [
    { p: 'units', n: [1, 2], where: 'wall', on: [['jar', 1, 4], ['mug', 0, 3]] },
    { p: 'table', n: [0, 1], where: 'centre' },
    { p: 'scatter', n: [4, 10], where: 'floor' }
  ]
}
```

`where` is `wall`, `corner`, `centre`, `floor` or `hang`; `on` puts things on top of the thing just
placed. Add the type to `FOLLOWS` to say what it can lead to, and it starts appearing in buildings.

**The generator** is `src/15-generate.js`. It emits exactly the `SPACES` structure the builder
consumes, so a generated building and a hand-written one are the same kind of thing — you can still
author a level by hand and hand it to `buildSpace`.

**Portals** are `src/25-portal.js`. `PORTAL_LINKS` pairs two openings; everything else follows.

**A console handle** is on `window.VK`: `VK.go(x,y,z,yaw,pitch)` teleports, `VK.goSpace(key)` jumps
to a room, `VK.aimAt(x,y,z)` points the camera, `VK.tick(n)` runs *n* physics frames without
rendering, `VK.openAll()` opens every door, `VK.spaces` is the plan, `VK.count()` the totals.

`node build.js` rebuilds the HTML. `node test.js` runs the suite (`node test.js 1234` for one seed).
`node shots.js 1234` renders a screenshot of every room and every portal in that building.

---

## 7. Known limitations

1. **Portals are single-bounce.** A portal seen through another portal renders black. Recursion
   would be a second render pass per level of depth; worth it only if the design uses it.
2. **Doors are animated, not simulated.** A leaf becomes non-solid the moment it moves, so you
   cannot push one with an object or trap yourself.
3. **The layout is one storey and rectangular.** Rooms are axis-aligned boxes; there are no stairs,
   no L-shaped rooms. The impossibility is entirely in the portals.
4. **No inventory and no gating.** Every object is takeable and nothing is required.
5. **Shadows are rationed.** Two lights cast shadows, the two brightest slots of the pool at the
   camera, and the maps redraw only when a caster has moved — never on consecutive frames.
6. **Desktop only.** Pointer lock excludes touch; no gamepad.

---

## 8. Assessment summary sheet

| Area | Requirements | Pass / Fail | Notes |
|---|---|---|---|
| The generator | F1–F9 | | |
| Non-euclidean space | F10–F15e | | |
| Movement and body | F16–F19 | | |
| Hands | F20–F24 | | |
| Doors | F25–F27 | | |
| The world | F28–F30 | | |
| Surfaces and atmosphere | F31–F38 | | |
| Non-functional | N1–N7 | | |
