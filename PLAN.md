# Vitkinstein 3D — experimental plan

A lab notebook, not a roadmap. The prototype works; what it does not yet have is
knowledge about which of its possible directions are any good. Everything below
is written as an experiment: a claim, the smallest thing that would test it, and
what would make us drop it.

**Working rate: one experiment at a time.** `main` stays playable and green.

---

## 1. Where this is

At `f870b2e` (local and `origin/main` agree; the committed `index.html` is a
faithful build of the committed `src/`, hash-checked).

Verified on the current build, five seeds, headless: 18/18 checks pass —
generation, no room overlaps, every room reachable, the body, the hands, doors,
no trim across a doorway, portal traversal, objects settling, clean console.

The optimisation pass is real and it changed the shape of the engine, so it is
worth writing down what the architecture now *is*:

| | |
|---|---|
| **Lights** | `allLights` are descriptions, not lights. A fixed pool of 12 `PointLight`s is filled each frame from wherever the camera is, scored by `intensity / (1 + d²)`, with slot memory so the pool does not reshuffle and make shadows jump. Two slots cast shadows at 512². A portal view refills the pool at *its* camera with no slot memory. |
| **Visibility** | Rooms are `Group`s in `roomGroups`, connected by `roomGraph`. Shown: the room you are in, everything it opens onto, anything two steps out that is actually in frustum, plus the far side of any portal being drawn and its neighbours. |
| **Shadows** | `shadowMap.autoUpdate = false`. Redrawn only when a caster has moved — an unsettled body or a swinging door — and never on consecutive frames. |
| **Resolution** | Pixel ratio adapts between 0.75 and 1.25 on a one-second mean. `?pr=N` pins it so a rendering change can be A/B'd without it moving underneath. |
| **Portals** | `visiblePortals()` is split from `renderPortals()` so room visibility can switch the far side on before anything draws. Targets are 0.32 of the render, tied to the pixel ratio. No shadows in a portal view. |
| **Raycasts** | Restricted to nearby visible room groups (`rayRoots`). Hover runs every third frame. |
| **Instruments** | `?perf=1` for the on-screen probe, `VK.info()` for a script, `?nograin=1` to A/B the CSS grain layer. `npm run perf` for structural counts, `npm run compare` to render the same views from two builds. |

### Baseline to beat, or at least not to regress

Seed 424242, twelve rooms, `npm run perf` (counts are meaningful; the
swiftshader millisecond figures are not):

```
scene            1017 meshes   478 shadow casters   95 materials   1012 geometries
lights           13 in scene (12 pool + hemisphere), 2 casting
draw calls       22 – 334 per room   (worst: storeroom 334, front room 292)
triangles        144 – 6062 per room
shader programs  16
```

The number to attack is **1012 geometries / 334 draw calls in a busy room**, and
it is E1 below. Everything else has headroom.

---

## 2. How to work on this

1. **One experiment per branch**, named `exp/<short-name>`. The branch exists to
   be thrown away; that is the point of it.
2. **Write the hypothesis into the commit message** before writing the code. If
   you cannot say what you expect to happen, the experiment is not ready.
3. **Judge it, then keep or kill.** Record the verdict in §6 of this file with a
   date and a sentence on *why*. A killed experiment with a written reason is a
   result; a killed experiment with no note is wasted work that will be
   re-attempted in six months.
4. **`npm test` green before merge.** If an experiment needs the suite changed,
   change it deliberately and say so.
5. **`npm run perf` before and after** anything touching rendering or the scene
   graph, and put both numbers in the commit message.
6. **Screenshot A/B** for anything that is supposed to look identical:
   `npm run compare -- old.html shots/before 424242` against the new build.

### What must not drift

These are the load-bearing decisions. An experiment may challenge one
deliberately, but nothing should erode them by accident:

- **No narrative, no NPCs, no combat, no fail state.** The subject is perception
  and the uncanny. Anything that explains the house makes it less frightening.
- **Rooms stay recognisable.** The dread depends on a specific front room being
  where a front room cannot be. Abstraction is the enemy of this, not the aim.
- **One self-contained file, no external requests, no image assets.** Every
  surface is drawn at load.
- **The vocabulary is authored, the building is generated.** Do not replace room
  types with noise.
- **Slow is a feature.** 2.15 m/s. Do not speed the player up to make testing
  more convenient.
- **Load stays a few seconds.** Generation and texture synthesis both happen at
  load; new work there is charged to the player's patience.

---

## 3. Track A — the house knows you were here

The strongest unexplored ground, and the closest to what the thing is about.
Nothing here needs new engine capability; it needs the generator and the room
groups it already has.

### A1 · Change behind your back
**Claim.** A room that is subtly different when you return is more disturbing
than any amount of atmosphere, and costs almost nothing.
**Smallest version.** When a room's group goes invisible, roll once: rotate one
piece of furniture 90°, move a small object to a different surface, switch one
light off. Never more than one change per visit, never the thing you were
holding.
**How you'll know.** Watch someone play without telling them. The tell is a
double-take — going back to check. If they never notice, the change is too
small; if they say "that's a bug", it is too large or too physical.
**Kill if.** It reads as jank rather than doubt, or you find yourself needing a
sound cue to sell it. The effect must survive being unremarked.
**Size.** Small. A `driftRoom(key)` hook where `updateRoomVisibility` turns a
group off.

### A2 · The way back is not the way you came
**Claim.** Doors are the strongest instrument in the building, so the strongest
change is a door.
**Smallest version.** On the *second* return to a room, one of its doorways is
bricked up — the `blocked` opening the generator already knows how to make.
Never the one you came in by; never so that the graph disconnects (there is
already a reachability test to lean on).
**How you'll know.** Does the player try the handle twice? Do they go quiet?
**Kill if.** It produces dead ends that feel like a broken generator rather than
a closing house.
**Size.** Small–medium: needs geometry to change after build, or a pre-built
brick panel that becomes visible.

### A3 · Dust
**Claim.** Seeing your own footprints is the cheapest way to make the player the
subject of the game.
**Smallest version.** A decal trail on dusty floors (concrete, tile), fading
over minutes. Then: one room where the prints are already there when you arrive.
**Kill if.** It looks like a video game breadcrumb trail. The prints have to
read as evidence, not navigation.
**Size.** Small. Reuses the decal pass.

---

## 4. Track B — space that folds

The portals work. What has not been tried is what they are *for*.

### B1 · Objects through portals
**Claim.** The portal is not believable until a thrown mug lands on the other
side. Right now it stops at a wall, and that is the one thing that gives it away.
**Smallest version.** Extend `traverse()` from the player to any dynamic body
crossing a face, transforming position, velocity and angular velocity.
**How you'll know.** Throw a mug through and it lands. Roll a ball through and
it keeps rolling.
**Kill if.** Nothing — this is close to required. Watch for objects oscillating
at the plane; a short cooldown per body will be needed.
**Size.** Small. The transform already exists.

### B2 · Recursion
**Claim.** A portal seen through a portal is the image the whole project is
reaching for.
**Smallest version.** One extra bounce: render the far view with the twin's
quad enabled, into a second target.
**How you'll know.** `npm run perf` before and after, and look at it. Two
bounces is a third render pass; the room-visibility work has bought room for it.
**Kill if.** The cost lands on the frames that were already the worst — the
busy rooms, not the warehouse.
**Size.** Medium.

### B3 · The corridor that returns to itself
**Claim.** An endless hallway is one line of generator code away and is the
purest version of the effect.
**Smallest version.** Two portal faces at each end of a passage, linked to each
other. Walk far enough and you are back where you started, having passed the
same chair four times.
**How you'll know.** Instant. It either turns the stomach or it does not.
**Kill if.** The seam is visible — the far view is the *same room*, so the
lighting has to match itself exactly.
**Size.** Small — but likely the best return in the document.

### B4 · A room containing itself
**Claim.** A scale model of the room you are standing in, on a table in that
room, that you can enter.
**Smallest version.** A shrunken copy of the room's plan built at 1/8, with a
portal in its doorway to the full-size room.
**Kill if.** The scale change breaks the body — the player is 1.6 m and does not
scale.
**Size.** Large. Park until B1–B3 have been judged.

---

## 5. Track C — the body, and Track D — reasons to go on

### C1 · Depth as a physical fact
**Claim.** The further you are from the room you woke up in — in *graph* steps,
not metres — the less well you perceive. Field of view narrows a few degrees,
the room tone thickens, the walk drags very slightly.
**Smallest version.** A `depth` value from a breadth-first search on
`roomGraph`, driving three numbers.
**How you'll know.** Take the same player through a shallow route and a deep one
and ask which felt worse. They should not be able to say why.
**Kill if.** It reads as an effect rather than a condition. Anything a player can
name is too strong.
**Size.** Small.

### C2 · Spatial sound
**Claim.** The distant thump is currently distant in timbre only. A `PannerNode`
per source is the cheapest large improvement left in the build.
**Smallest version.** Move impacts, footsteps and the far thump onto positional
nodes; keep room tone and hum monophonic.
**Size.** Small–medium. High confidence.

### D1 · Something you have to find
**Claim.** The uncanny needs somewhere to be going. Gating is already in the
design intent, and objects are already physical.
**Smallest version.** One door in the house is locked. Somewhere else there is a
key — an ordinary takeable object, on a shelf, unremarked. Carrying it to the
door opens it. No inventory UI: you hold it in your hands, which is the same
mechanic as everything else and needs no new interface.
**How you'll know.** Does the player start *looking at* rooms rather than
passing through them?
**Kill if.** It turns exploration into a search task and the rooms stop being
places.
**Size.** Medium. `PROP_INFO` needs a `key` kind; the generator needs to place
key and lock at a sensible graph distance.

---

## 6. Track E — craft, and the things that unblock the rest

### E1 · Merge the statics (do this first)
**Claim.** 1012 geometries and 334 draw calls in a room is the ceiling on
everything else in this document. Per-room merged geometry for walls, trim,
linings and non-grabbable furniture should take a busy room under 60 calls.
**Smallest version.** After `buildSpace`, merge every static mesh in a room
group by material into one `BufferGeometry`. Keep the physics bodies as they
are. `matrixAutoUpdate = false` is already being set on exactly this set, so the
selection logic exists.
**How you'll know.** `npm run perf`, and `npm run compare` proving the pixels
did not move.
**Watch for.** Shadow casters need to stay separable enough not to self-shadow
badly; decals must stay separate (they are transparent and depth-sorted).
**Size.** Medium. Highest leverage in the document.

### E2 · A window
**Claim.** Every space is an interior, so one window — onto a light well, onto
brick, onto nothing at all — would be the loudest thing in the game.
**Size.** Medium. New opening kind, new material, and a decision about what is
outside that is a design question, not a technical one.

### E3 · Stairs
**Claim.** One storey is the biggest remaining constraint on the layout, and a
half-landing is exactly the kind of space this house should have.
**Size.** Large — the player is a sphere on a flat floor; slopes need work.
Do not start this before E1.

### E4 · Perf as a test
**Claim.** The optimisation pass will erode silently without a threshold.
**Smallest version.** `npm run perf` fails if any room exceeds a stated draw
call / triangle budget.
**Size.** Small. Do it while the numbers above are still true.

---

## 7. Suggested order

Slow and steady, roughly a session each, each landing on `main` before the next
begins:

1. **E1** merge the statics — buys the headroom for everything else
2. **E4** perf budget as a test — locks in what E1 wins
3. **B1** objects through portals — the portals stop giving themselves away
4. **B3** the corridor that returns to itself — the cheapest strong idea here
5. **A1** change behind your back — the first real move on the subject
6. **C2** spatial sound — steady, high-confidence improvement
7. **A2** the way back is not the way you came
8. **C1** depth as a physical fact
9. **D1** something you have to find — only once the house is worth being in
10. re-judge the rest from what has been learned by then

Housekeeping to fold in along the way: `README.md` and `SPECIFICATION.md`
predate the optimisation pass and describe the old lighting and culling —
update them when E1 lands and the numbers are stable. `SPECIFICATION.md` should
also gain requirements for whatever survives the experiments; it is the document
someone assesses this against.

---

## 8. Open questions — for Mick, not for the agent

- **Does the house have an end?** Everything in Track D assumes going *deeper*
  means something. If there is a bottom, the generator needs to know it.
- **What is outside a window** (E2)? Nothing? The same room? A city that does not
  exist? This one decision changes what the building is.
- **Is the player anybody?** A3 and B4 both start pointing at a figure that is
  you. That is a large door to open and it is yours to open.
- **VR when?** The grab is already the portable pattern. Portals in stereo are a
  known hard problem — two views per eye per portal — so it wants to be decided
  before B2 rather than after.

---

## 9. Results

*(One line per experiment as it is judged: date, branch, verdict, why. This
section is the actual product of the plan.)*

| date | experiment | verdict | why |
|---|---|---|---|
| | | | |
