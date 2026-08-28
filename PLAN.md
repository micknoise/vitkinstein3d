# Vitkinstein 3D — experimental plan

A lab notebook, not a roadmap. The prototype works; what it does not yet have is
knowledge about which of its possible directions are any good. Everything below
is written as an experiment: a claim, the smallest thing that would test it, and
what would make us drop it.

**Working rate: one experiment at a time, committed and pushed to `main`.**
`main` stays playable and green — it is what gets played.

---

## 1. Where this is

`main` is the only branch; local and `origin/main` agree, and the committed
`index.html` is a faithful build of the committed `src/`.

Verified on the current build, five seeds, headless: 54/54 checks pass —
generation, no room overlaps, every room reachable, the body, the hands, doors,
no trim across a doorway, portal traversal, objects and carried objects through
portals, portal faces not showing stale views, objects settling, clean console.

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
scene            573 meshes   269 shadow casters   95 materials   568 geometries
lights           13 in scene (12 pool + hemisphere), 2 casting
draw calls       14 – 173 per room   (worst: storeroom 173, passage 165)
triangles        256 – 6430 per room
shader programs  16
```

Across all five test seeds the worst room is 251 draw calls and 9814 triangles.
`npm run perf` now **fails** above the budget in `perf-probe.js` — 280 calls and
11,000 triangles per room, 640 geometries in the scene. `npm run perf all`
checks the whole set of seeds. The counts are deterministic: the probe freezes
the clock and steps physics itself, so they do not depend on how fast the
machine ran.

Before E1 this was 1017 meshes / 1012 geometries and 22–334 draw calls. The
remaining calls are mostly *not* mergeable and should not be attacked: a room's
count is now dominated by its grabbable objects, which stay individual on
purpose (§2), plus the transparent decals, which have to stay separately sorted.
Triangles went slightly *up*, because a merged room-sized mesh is no longer
frustum-culled piece by piece — the right trade, since triangles were never the
constraint.

---

## 2. What players actually do — observed, 27 August 2026

The prototype has been played. What emerged, unprompted and undesigned:

1. They work out that they are walking around an impossible architecture.
2. They start **placing objects in rooms as markers**, so they can tell whether
   they have been somewhere before.
3. Then they realise what is happening.

This is the most important paragraph in the document, and none of it was
designed. Three things follow, and they govern everything below.

**The physics objects are the navigation instrument.** Not a toy and not set
dressing — the thing players reach for to think with. Anything that makes
objects less reliable, less takeable or less placeable damages the central
mechanic. And anything that does the marking *for* the player — footprints,
breadcrumbs, a map, a compass — takes the discovery away and does it worse than
they do.

**The room names are how people work it out.** Naming each space on entry is not
a navigation aid and must not be treated as one. It is the vocabulary the player
reasons with: seeing *the front room* twice in one house, or being told you are
in *the kitchen* somewhere a kitchen cannot possibly be, is the evidence that
the architecture is impossible. Take the names away and the marking behaviour
loses the thing it is marking *about*. This is settled — see A5.

The corollary is already in the build and is now justified: the warehouse and
the plant room are labelled `'—'` and announce nothing. The rooms you cannot
name are the rooms you cannot reason about, and they should stay silent.

**Realisation is the reward.** No fail state, nothing to collect: the arc is
entirely epistemic. Confusion → method → understanding. Judge every experiment
on whether it lengthens and deepens that arc, not on whether it adds content.

**The house now has something to respond to.** A player who marks a room has
declared what they believe. That is the best material the uncanny could ask for,
and the easiest thing in the building to ruin. See A1.

---

## 3. How to work on this

**Trunk only.** Work lands on `main` and is pushed as soon as it is green,
because GitHub Pages serves `main` and playing it is how an experiment gets
judged. An experiment that sits on a branch is an experiment nobody has played.
Revert is the undo, not a branch: the commit is the unit that gets thrown away.

1. **One experiment per commit**, small enough that reverting it takes nothing
   else with it. `main` stays playable at every commit.
2. **Write the hypothesis into the commit message** before writing the code. If
   you cannot say what you expect to happen, the experiment is not ready.
3. **Judge it, then keep or revert.** Record the verdict in §10 with a date and
   a sentence on *why*. A reverted experiment with a written reason is a result;
   a reverted experiment with no note is wasted work that will be re-attempted
   in six months.
4. **`npm test` green before push.** If an experiment needs the suite changed,
   change it deliberately and say so.
5. **`npm run perf` before and after** anything touching rendering or the scene
   graph, and put both numbers in the commit message.
6. **Rebuild and commit `index.html`** with any change to `src/`, or the
   published game drifts from the source and the thing being played is not the
   thing being judged.
7. **Screenshot A/B** for anything that is supposed to look identical. Render
   both builds and diff them — do not eyeball sixteen pairs:
   ```sh
   npm run compare -- old.html    shots/before 424242 '&pr=1'
   npm run compare -- index.html  shots/after  424242 '&pr=1'
   npm run diff shots/before shots/after
   ```
   Two runs of the *same* build come out at 0.00%, so anything above the noise
   floor is the change and not the tool. Check that control if a result looks
   surprising.

### What must not drift

These are the load-bearing decisions. An experiment may challenge one
deliberately, but nothing should erode them by accident:

- **No narrative, no NPCs, no combat, no fail state.** The subject is perception
  and the uncanny. Anything that explains the house makes it less frightening.
- **No navigation aids.** No map, no compass, no markers the game places. §2 is
  the reason: players build their own, and that is the game. **The room-name
  prompt is not one of these** — it names, it does not locate, and naming is how
  players work out what is happening. It stays.
- **Rooms stay recognisable.** The dread depends on a specific front room being
  where a front room cannot be. Abstraction is the enemy of this, not the aim.
- **Objects stay dependable.** Takeable, placeable, and where you left them,
  unless an experiment is deliberately and knowingly testing otherwise.
- **One self-contained file, no external requests, no image assets.**
- **The vocabulary is authored, the building is generated.**
- **Slow is a feature.** 2.15 m/s. Do not speed the player up to make testing
  more convenient.
- **Load stays a few seconds.**

---

## 4. Track A — the house knows you were here

The strongest unexplored ground, and now the best understood, because §2 says
what the player is doing while it happens.

### A1 · Change behind your back — **A1a done, 2026-08-28; A1b still open**
**Claim.** A room that is subtly different when you return is more disturbing
than any amount of atmosphere, and costs almost nothing.
**Smallest version.** When a room's group goes invisible, roll once: rotate one
piece of furniture 90°, move a small object to a different surface, switch one
light off. Never more than one change per visit.

**The marker question — the real design decision here.** Players place objects
to test whether they have been in a room. So the house can either respect those
objects or interfere with them, and the two are completely different games.

- *Respect them.* Change only what the player did not choose: furniture, doors,
  lights, the height of a shelf. The instrument stays trustworthy, and what it
  measures gets stranger. Start here.
- *Interfere with them.* Move the marker itself. The house is now aware of being
  measured. This is the strongest move available and it destroys the player's
  only method — so it can be used approximately once, late, and never twice.

Run these as two experiments, in that order, and do not merge the second until
the first has been played by someone else.

**How you'll know.** Watch someone play without telling them. The tell is a
double-take — going back to check. If they never notice, the change is too
small; if they say "that's a bug", it is too large or too physical.
**Kill if.** It reads as jank rather than doubt, or you need a sound cue to sell
it. The effect must survive being unremarked.
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
**Size.** Small–medium.

### A3 · Dust and footprints — **do not do this**
Superseded by §2. The instinct was to give the player a trace of themselves;
players invented a better version of it out of mugs and bricks, and theirs is
better precisely because they had to think of it. Adding automatic footprints
would do the work for them and remove the step where they realise they need a
method. Kept here so it is not proposed again.

### A4 · The house notices you marking
**Claim.** The house does not need to punish the marking to make it terrible. It
only needs to acknowledge it.
**Smallest version.** Track objects the player has moved and left. Somewhere
deep, generate a room that is *already marked* — the same kinds of objects, in
the same kind of arrangement, placed the way this player places them.
**How you'll know.** The player should stop and count. It should be impossible
to tell whether they did it.
**Kill if.** It requires anything that looks like a message. The moment it is
legible as a designed signal it stops working.
**Size.** Medium. Needs a light record of player placements; no new rendering.

### A5 · Take the room names away — **settled: no, keep them**
Proposed on the theory that naming each room was doing the player's work for
them. Wrong, and usefully so: the names are the main reason people work out
what is going on. They are not a landmark system, they are the vocabulary — the
thing that makes *the front room, again* legible as evidence rather than as
déjà vu. Removing them would leave players marking rooms with no way to say
what they had found.

Kept here as a closed question. Do not reopen it, and do not quietly erode it
either: no shortening the prompt to a symbol, no showing it only once per room
*type*, no moving it into a corner of the HUD. If anything, the names are a
lever that has not been pulled — see A6.

### A6 · A name that is wrong
**Claim.** If naming is how the player reasons, then the sharpest available move
is not to remove a name but to give one that cannot be true.
**Smallest version.** Once, deep in the house, a space announces itself as
something it visibly is not — *the kitchen*, printed in a concrete hall.
**How you'll know.** The player should stop walking.
**Kill if.** It reads as a bug in the generator rather than as the house saying
something. The room has to be unmistakably not-a-kitchen, or it is just a
mislabel.
**Danger.** This is the same class of move as A1b: it attacks the instrument the
player is using to understand the building. Once, late, never twice, and not
until A1a has been played by someone else.
**Size.** Trivial to build, expensive to get wrong.

---

## 5. Track B — space that folds

The portals work. What has not been tried is what they are *for*.

### B1 · Objects through portals — **done, 2026-08-27**
**Claim.** Given §2, this is no longer cosmetic. Objects are the instrument the
player thinks with, and portals are where the space folds; an object that stops
dead at the fold is a hole in the instrument, exactly where the player most
needs it to be sound. It is also the one detail that gives the portal away.
**Smallest version.** Extend `traverse()` from the player to any dynamic body
crossing a face, transforming position, velocity and angular velocity.
**How you'll know.** Throw a mug through and it lands. Roll a ball through and
it keeps rolling. Then: leave a marker on one side and find it from the other.
**Kill if.** Nothing — this is close to required. Watch for bodies oscillating
at the plane; a short per-body cooldown will be needed.
**Size.** Small. The transform already exists.

### B2 · Recursion
**Claim.** A portal seen through a portal is the image the whole project is
reaching for.
**Smallest version.** One extra bounce: render the far view with the twin's quad
enabled, into a second target.
**How you'll know.** `npm run perf` before and after, and look at it.
**Kill if.** The cost lands on the frames that were already the worst — the busy
rooms, not the warehouse.
**Size.** Medium.

### B3 · The corridor that returns to itself — **done, 2026-08-27**
**Claim.** An endless hallway is one line of generator code away and is the
purest version of the effect. And with §2 in hand it is now also a *test*: a
player who marks rooms will work out what the corridor is doing, using a mug.
**Smallest version.** Two portal faces at each end of a passage, linked to each
other. Walk far enough and you are back where you started, having passed the
same chair four times.
**How you'll know.** Instant. It either turns the stomach or it does not. Then
watch how long it takes a marking player to prove it to themselves.
**Kill if.** The seam is visible — the far view is the *same room*, so the
lighting has to match itself exactly.
**Size.** Small, and probably the best return in the document.

### B4 · A room containing itself
A scale model of the room you are standing in, on a table in that room, that you
can enter. Large; the player is 1.6 m and does not scale. Park until B1–B3 have
been judged.

---

## 6. Track C — the body, and Track D — reasons to go on

### C1 · Depth as a physical fact — **partly done, 2026-08-28, through the vision pass**
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

### C2 · Spatial sound — **done, 2026-08-28**
**Claim.** The distant thump is currently distant in timbre only. A `PannerNode`
per source is the cheapest large improvement left in the build — and it gives a
marking player another way to know where they are, which is the loop.
**Smallest version.** Move impacts, footsteps and the far thump onto positional
nodes; keep room tone and hum monophonic.
**Size.** Small–medium. High confidence.

### D1 · Something you have to find
**Claim.** §2 says the loop is already object-centred, so gating with an object
is consistent rather than bolted on.
**Smallest version.** One door in the house is locked. Somewhere else there is a
key — an ordinary takeable object, on a shelf, unremarked. Carrying it to the
door opens it. No inventory UI: you hold it in your hands, which is the same
mechanic as everything else.
**How you'll know.** Does the player start *looking at* rooms rather than
passing through them?
**Kill if.** It turns exploration into a search task and the rooms stop being
places. Watch particularly for the key competing with the marking behaviour for
the same objects.
**Size.** Medium.

---

## 7. Track E — craft, and the things that unblock the rest

### E1 · Merge the statics — **done, 2026-08-27**
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
badly; decals must stay separate (transparent, depth-sorted). Grabbable objects
must stay individual — see §2.
**Size.** Medium. Highest leverage in the document.

### E2 · A window — **done, 2026-08-28: onto nothing**
Every space is an interior, so one window — onto a light well, onto brick, onto
nothing at all — would be the loudest thing in the game. What is outside is a
design question, not a technical one. Medium.

### E3 · Stairs — **done, 2026-08-28, and not the way this said to do it**
One storey is the biggest remaining constraint on the layout. Large: the player
is a sphere on a flat floor. Not before E1.

### E4 · Perf as a test — **done, 2026-08-27**
The optimisation pass will erode silently without a threshold. `npm run perf`
fails if any room exceeds a stated draw call / triangle budget. Small — do it
while the numbers in §1 are still true.

---

## 8. Suggested order

Revised after §2. Slow and steady, roughly a session each, each landing on
`main` before the next begins:

1. **E1** merge the statics — buys the headroom for everything else
2. **E4** perf budget as a test — locks in what E1 wins
3. **B1** objects through portals — the instrument has to survive the fold
4. **B3** the corridor that returns to itself — cheapest strong idea here
5. **A1a** change behind your back, markers respected
6. **C2** spatial sound
7. **A2** the way back is not the way you came
8. **A4** the house notices you marking
9. **C1** depth as a physical fact
10. **D1** something you have to find — only once the house is worth being in

Then, and only then, the two that attack the player's own instruments. Neither
before someone else has played the build; neither twice; and stop and re-judge
the whole document after each:

11. **A1b** move a marker
12. **A6** a name that is wrong

Housekeeping along the way: `README.md` and `SPECIFICATION.md` predate the
optimisation pass and describe the old lighting and culling — update them when
E1 lands and the numbers are stable. `SPECIFICATION.md` should also gain
requirements for whatever survives; it is the document someone assesses this
against.

---

## 9. Open questions — for Mick, not for the agent

- **Does the house have an end?** Everything in Track D assumes going *deeper*
  means something. If there is a bottom, the generator needs to know it.
- **What is outside a window** (E2)? Nothing? The same room? A city that does not
  exist? This one decision changes what the building is.
- **Is the player anybody?** A4 and B4 both point at a figure that is you. Large
  door, yours to open.
- **VR when?** The grab is already the portable pattern. Portals in stereo are a
  known hard problem — two views per eye per portal — so decide before B2 rather
  than after.

---

## 10. Results

One line per experiment as it is judged: date, verdict, why. This section is the
actual product of the plan.

| date | experiment | verdict | why |
|---|---|---|---|
| 2026-08-27 | **baseline — v0.2 as played** | works | Played on real hardware. Does what it is supposed to do; a genuinely weird experience. This is the control condition every later experiment is judged against — if a change makes it *more* interesting but *less* weird, it has failed. |
| 2026-08-27 | **observed play loop** | finding | Players work out the architecture is impossible, then place objects in rooms as markers to tell whether they have been there, then realise what is happening. Undesigned and emergent. Recorded in full as §2; it reorders the plan, kills A3, and creates A4. |
| 2026-08-28 | **the tape** | **killed** | *"I don't like the vhs shader at all. It detracts from the game and doesn't work."* Removed entirely after three passes. Worth keeping the reason: a tape artefact is a statement about the **recording**, and this game is not found footage — it says the thing you are looking at was filmed, which puts a camera and an author between the player and the building, and the building is supposed to be happening to *you*. Every hour spent on it went into making a good VHS emulation of the wrong idea. Replaced by the vision pass, where the defect is in the person looking. |
| 2026-08-28 | **sound: rooms, and walls** | **for Mick to judge** | The two biggest realism wins after the impacts, done together because they are one subsystem. **Rooms**: a synthesised impulse response per acoustic — noise under an exponential envelope, a one-pole lowpass so it darkens as it decays, and a handful of sparse early reflections at the front, which is what actually carries the size of a room rather than the tail. Three acoustics chosen from what a room is made of and how big it is; on seed 424242 that is dead 5, hall 2, room 4. Two convolvers crossfaded rather than one whose buffer is swapped, because swapping under a live convolver clicks. **Walls**: a sound made in the room you are in arrives whole, one through an open door arrives at 2.2kHz and 62%, one from further off at 700Hz and 34% — measured off , which already knew. Between them a warehouse now sounds like a warehouse and a box room like a box room, which no amount of work on the objects themselves could have done. |
| 2026-08-28 | **sound: the hum and the creak go, impacts get made of something** | **for Mick to judge** | Playtest: the door creak is not good and is not needed, the ever-present hum is not working, footsteps are fine, impacts are placeholders. Hum and creak removed. Impacts rebuilt as modal synthesis — a two-millisecond noise excitation ringing a bank of high-Q resonators, which is what an impact physically is — with mode ratios and decay times per material: wood dull and gone at once, metal ringing for a second on inharmonic partials, glass bright and clean, stone a thud with no ring. Pitch comes from the object's size and mass, so a bucket and a brick of the same size do not sound alike, and every mode is detuned a few per cent per hit so the same mug twice is not the same sound. Materials now carry their names from  and every grabbable body knows what it is made of: wood 26, metal 25, soft 58, glass 17, ceramic 10 on seed 424242. Footsteps take the floor they are on. Also fixed:  started at 0, so the first impact after load was always swallowed. |
| 2026-08-28 | **portal lighting continuity** | fixed | Playtesters: the room through a portal looks too bright from a distance, and the lighting changes dramatically as you cross. It was a double development. The portal quad tone-mapped and gamma-encoded its output, and since the vision pass landed that output goes into a *linear* buffer which is tone-mapped and gamma-encoded again — on top of an exposure of 1.15/0.6 against the room's 1.15. The quad now writes linear and is developed once, with the room around it. Measured as the brightness jump crossing each portal on seed 424242: **4.02× → 1.01×, 3.15× → 1.26×, 3.17× → 1.39×**. The fourth went 1.23× → 2.19×, and that is honest: it was two errors cancelling, an over-bright portal showing a dark warehouse. Also tried turning shadows on in portal views, since an unshadowed room is a flatter one — it makes every room in the building go dark, because the light pool is refilled at the portal camera and the shadow maps then bake against *those* light positions before the main render uses them. Measured, reverted, and written down in the code so it is not tried again. |
| 2026-08-28 | **the vision pass, second look — it was all in the periphery** | fixed | *"I can't really tell if there is an effect or not most of the time on this machine. However, on my macbook neo it looks much much better."* Two machines, one build, and the difference was the diagnosis. Nearly everything in the pass was weighted to the edge of the frame — warp at `0.45 + 1.9·r²`, blur at `smoothstep(0.02, 0.30, r²)` so exactly zero in the middle, vignette edge-only. On a laptop at arm's length the edges *are* most of your visual field; on a monitor you sit back from, you look at the middle, where by design nothing was happening. All three now have a real floor at the centre. And "quite present at the start" had not been delivered: at dose 0.16 the snow was 0.073 amplitude, which is nothing. Start dose 0.16 → 0.30, snow base 0.055 → 0.090. Added `?fx=N` and `VK.pinDose()` so this can be judged and reported as a number on the machine it is played on, rather than as a feeling on mine. |
| 2026-08-28 | **the vision pass — you are not seeing this very well** | **for Mick to judge** | Mick's direction. Visual snow, surfaces that will not hold still, a periphery that softens and closes in, colour separating at edges, and after-images — what people describe after two days without sleep or on a dose of something. Present from the first room (0.16) and as bad as it gets at the far end (1.00), scaled to *this* house rather than to a fixed number of doors, because houses run nine to thirteen rooms and a fixed scale leaves the deepest room in a small one two thirds of the way there. Depth is doors, not metres — PLAN C1's measure — and a portal counts two: you have not walked further, you have been taken further. Trails are  rather than a mix, so bright things smear and dark things do not go muddy. |
| 2026-08-28 | **the tape, third pass — the bar was the whole picture** | fixed | Played: *"There is a constant horizontal wobble throughout which makes the game unplayable."* One smoothstep with its edges the wrong way round: `smoothstep(0.055, 0.0, ...)` made the head-switching bar read as 1 across **93.5%** of the frame and 0 only in the band it was supposed to be. So the bar's sideways drag was being applied to every scan line, every frame, at 40Hz. Now 2.8% of the frame height, measured. The lesson recorded rather than the fix: two of the three faults in this pass were *inverted conditions* that still produced a plausible-looking picture, so screenshots did not catch either. The bar's position and depth are now numbers passed in from JS and asserted, the same way the bursts were moved out of the shader for the same reason. |
| 2026-08-28 | **the tape, second pass — bursts, not shake** | **for Mick to judge** | Played: *"too shakey. It should shake more quickly, and less often, like bursts of static. Also the grain is not high enough."* Both right, and the first one was a structural mistake rather than a number: the interference was driven by smoothstepped shader noise, which is bad at *rare* — push the threshold up to stop the permanent shimmer and you get nothing for minutes instead. It is now stated outright on the CPU: a window every 6.5s, 45% of them empty, and the ones that are not last 90–290ms. Measured over five minutes: breaking up 1.04% of the time, 18 times, longest 0.27s. Inside a burst the jitter runs at 240Hz per scan line with whole-frame snatches and the odd line thrown right out, so it reads as static rather than as movement. The constant wobble that was making it seasick is gone. Grain roughly doubled, in two sizes. |
| 2026-08-28 | **the tape — everything you see is footage** | **for Mick to judge** | Mick's idea, and not in this document before today. One full-screen pass: the scene now renders into a target and the target onto the canvas through a helmet camera and a bad tape. Wide lens bending the walls, chroma pulled apart and smeared right the way VHS does it, scan lines, a shadow mask, interference that comes and goes in bursts, and the head-switching bar rolling up the frame every eight seconds dragging the picture sideways as it passes. Rendering to a target means three stops tone-mapping for us, so the pass does ACES itself — *first*, because the artefacts belong to the camera and the tape and go on the picture after it is developed, not before. `?novhs=1` turns it off, and the screenshot A/B now uses it: the tape is deterministic under `VK.freeze`, but barrel distortion and grain blunt exactly the small differences the A/B exists to catch. |
| 2026-08-28 | **E3 — stairs** | **for Mick to judge** | Mick's design, and it turned a large job into a medium one. This section assumed stairs meant a second storey, which meant giving rooms a height and teaching four x/z-only lookups a third axis. Instead: a stairwell is one tall ordinary room with an ordinary door at the bottom, and three metres up at the head of the flight is another door — and that one is a **portal to a door on the ground floor somewhere else**. You climb, and you arrive downstairs. The engine never learns what a storey is, and the result is a better joke than real stairs would have been. It reused two things built this week: openings with a bottom edge above the floor (the window's sill) and portals whose transform is rigid, so walking through at three metres keeps your height *above the floor* rather than above the world — you do not fall and you do not notice. The steps are drawn but not collided with; what you actually walk on is a smooth ramp over them, invisible, extended past both ends so there is no lip to catch on. |
| 2026-08-28 | **E2b — a shaft of light through the window** | **for Mick to judge** | Played, and the verdict was that the window works but does not do the job it was for: the point of it is *false hope*, and a pane with no light through it offers none. So daylight now comes in — a tapered additive shaft from the opening down to a lit patch of floor, plus one cold entry in the light pool so the room around it genuinely brightens. Two things fell out of it. Crossed quads through the beam's axis, not a box: a box shows you its edges, which sample the bright middle of the gradient and read as two hard streaks with nothing between. And the nothing outside had to stop being black — daylight pouring out of a black hole reads as a fault — so it goes pale a long way up, the way the top of a light well does. There is still not one thing out there to look at. Mick: *"the maps themselves feel much more engaging as a result of this change, so it's working."* |
| 2026-08-28 | **E2 — a window, onto nothing** | **for Mick to judge** | Every space was an interior. One window per house now, and what is outside it is nothing: the house stops at the glass. Mick's call, taken against my noted objection that a void arguably explains the building — recorded because if it turns out to explain it away, that is the reason and not the execution. The work was not the view, it was the sill: *every* opening in this building ran from the floor up, so walls, linings and trim all had to learn about an opening with a bottom edge. Nothing is a closed unlit box the colour of the fog, hung outside the opening — it has no surface to read as a surface and no far wall to judge distance against, and it seals the view so you do not see the backs of the other rooms floating in the dark. Glass is real geometry with a body, so nothing can be thrown out and lost, and the wall under the sill keeps you in. |
| 2026-08-28 | **C2 — spatial sound** | kept | A listener that follows the camera, and a `PannerNode` per event that has a place: impacts play from where the object hit, door creaks from the door, and the far thump now arrives on a bearing 11–24m away instead of from nowhere. Room tone and the mains hum stay monophonic deliberately — they are the room, not events in it, and giving them a position puts the room in a corner. Footsteps stay monophonic too, which the plan did not anticipate: they happen *at* the listener, so a panner costs a node and does nothing. Gives a marking player another way to know where they are, which is the §2 loop. |
| 2026-08-28 | **A1a — change behind your back, markers respected** | **for Mick to judge** | A room you return to is not quite the room you left. One change per visit, made while the room is switched off so it is never seen happening: a light goes out, an unlit one comes on, a door you left open is shut, a shut one stands open. Never more than one, never the last light in a room, and never — measured, not asserted — anything you can pick up. Doors are the strongest change and the likeliest to break that promise, so a door only changes if nothing is standing in its swing. Light fittings had to come out of the E1 merge so a bulb can be seen to go out, which is why the mesh budget went up. **Judge by watching someone play without telling them: the tell is a double-take. If they say "that's a bug", it is too large.** |
| 2026-08-28 | **objects slide after they settle** | noted, not chased | With the house left alone and drift off, 27 of 203 objects move more than 2cm over 30s of simulated time; the worst goes 0.85m. Not caused by A1a — identical with drift off. First guess was rolling, and that is not it: the big movers are all `Box` shapes of mass 4, and the cylinders barely move (0.11m). More likely generator-placed heavy objects resolving an overlap they were dressed into. The thing that actually matters for §2 is whether a marker *the player places* stays, and mostly it does — five placed and walked away from moved 0, 0, 0.012, 0 and 0.486m. Left alone deliberately: chasing it means changing damping or friction on the grabbables, and CLAUDE.md says not to stabilise them away without meaning to. |
| 2026-08-28 | **the corridor was sometimes sealed off** | fixed | Reported from play: the entrance to the endless corridor is visible in the scullery but only a quarter of the doorway is there and you cannot get through. Two faults in the B3 placement. The doorway is cut at the corridor's centre, but the corridor was slid along the parent's wall by up to a third of its own length, so its centre ended up past the end of the wall it was joining and the opening was clipped to a slot — the grow loop bounds exactly this and I had not copied the bound. And the corridor could be as narrow as 1.2m, which cannot hold a 1.0m doorway in its end wall once the wall has thickness, so the end portals were clipped too. New check: every opening must fit inside the wall it is cut into. The reachability test could never have caught this — it reads the plan, where the two openings line up perfectly, not the geometry that gets built. |
| 2026-08-27 | **you could walk out of the world** | fixed | Reported from play on seed 370294185: crossing into the warehouse, the screen goes black. `withinFrame` had two faults. It copied into `_v2`, the same scratch vector `updatePortals` keeps the player position in, so the first face whose flag differed destroyed the position every later face was judged from. And it bounded only the offset along the wall and the height, never the distance to the plane — an infinite prism sticking out of the doorway both ways, so walking across it anywhere in the building counted as standing in the doorway. Both pre-existing; B3 made them reachable by putting portal planes through the middle of the house. New check walks every room in four directions and fails if anyone leaves the floor — it catches the reported seed. |
| 2026-08-27 | **B3 — the corridor that returns to itself** | **for Mick to judge** | Both ends of one passage linked to each other: walk down it and you come out of the end you were walking towards, in the same corridor, having gone nowhere. Every house gets one. The generator could not produce the passage it needs — the grow loop orients a corridor to run *away* from its parent, so a corridor's end is always its doorway — so one is now placed deliberately, running across the wall it joins and entered from its long side. The seam the plan warned about does not arise: the far view is the same room, so the lighting matches itself exactly. **Open: whether every house should have one.** Gating it is one `rchance()`, and that call should come from playing it. |
| 2026-08-27 | **portal side flags read from where you used to be** | fixed | `updatePortals` read the player position once and kept using it after `traverse()` had moved them, so a frame ended with every face's flag describing the old position. The next frame read the difference as a crossing — and `withinFrame` only asks whether you are inside the doorway rectangle, not whether you are near its plane, so the face that fired could be one 14m away that the jump lined up with. Walking into the corridor portal put you outside the warehouse, 573m off, falling. Latent before B3: it needs a jump that lines up with another face, which two pairs in distant rooms almost never manage and a pair sharing a room manages every time. |
| 2026-08-27 | **E4 — perf budget as a test** | kept | `npm run perf` now exits non-zero above a stated per-room draw call and triangle budget, so the E1 win cannot erode a room at a time with nobody noticing. Budgets are the worst values across the five test seeds plus about ten per cent: 280 calls, 11,000 triangles, 640 geometries. Verified by running it against the pre-E1 build, which it fails on six counts. The probe had to be made deterministic first — it settled the house on wall-clock frames, so the same seed came out at 248 or 249 calls depending on the machine, and a budget cannot sit on a number that moves. |
| 2026-08-27 | **what you carry vanished at the fold** | fixed | What is in your hands reaches the portal plane about a metre before your eyes do, so for a step or two the object was past the fold while the camera was not — and the quad, sitting between the two, hid it. It came back once you were through. Fixed by putting the held object through the fold for the length of the portal pass, so the portal camera sees it: the far clip plane then decides which half shows, and a mug that is half through appears half in the room and half in the view, which is what a doorway does. Considered flipping `depthTest` on the held object instead — fewer moving parts, but materials are shared, so it means cloning on grab and the object then draws over door frames too. Two frames of the sixteen-view A/B changed and no others. |
| 2026-08-27 | **portal views skewed from behind** | fixed | `renderPortals` refreshed at most two faces a frame and then made *every* quad visible again. A quad samples its render target in screen space, so a quad shown without being redrawn is a picture taken from where the camera used to be, stretched across the doorway from where the camera is now — reported from play as the view through the door skewing. It happened whenever a face was skipped: past the two-face budget, or with the camera behind its plane, which is what backing out through a doorway does. Now only the faces redrawn this frame are shown, and the budget takes the nearest faces rather than whichever the generator emitted first. Also pre-existing. Zero pixels changed across the sixteen standard views. |
| 2026-08-27 | **B1 — objects through portals** | kept | `traverse()` moved the player and whatever was in their hands; nothing else. A thrown mug went through the doorway into the space physically behind it — outside the building — and fell for ever. Now any awake dynamic body crossing a face is transformed the same way the player is, position, velocity, angular velocity and orientation, with a six-frame cooldown so it cannot oscillate at the plane. Reported from play as a new bug; it was not, it reproduces on the pre-merge build, and B1 had simply never been done. Two new checks in the suite, both of which fail on the old build. |
| 2026-08-27 | **objects drawn in the wrong room** | fixed | An object's mesh stayed parented to the room it was built in, so a carried or placed object inherited the visibility of a room it had left and stopped being drawn. Worst for the marking behaviour in §2 — a marker that is not drawn when you return is a marker that lies. `syncBodies` now re-parents by position. Also pre-existing. |
| 2026-08-27 | **E1 — merge the statics** | kept | Per-room, per-material merge of everything that never moves: 1017 meshes → 573, 1012 geometries → 568, worst room 334 draw calls → 175, front room 295 → 157. Shadow casters 478 → 269. Pixel A/B worst view 0.15%, under the 0.19% same-build noise floor — the picture did not move. Did not reach the "<60 calls" guess in E1, and that guess was wrong rather than the work: what is left is grabbables (individual by §2) and depth-sorted decals, neither of which should be merged. Load unchanged. |
| 2026-08-27 | **textures were never seeded** | fixed | `00-textures.js` drew every crack, stain and mould patch with `Math.random()`, so `?seed=N` reproduced a house's *layout* but never its *surfaces*. The screenshot A/B in §3 could therefore never have worked: the same build photographed twice differed on 41% of its pixels, which is more than the E1 merge changed. Surfaces now run on `TR`, a second stream seeded from `SEED` and kept deliberately separate from the generator's `R` so that existing seeds keep their layouts. Same-build control is now 0.00%. Found by running the control before trusting the comparison — worth doing again. |
| 2026-08-27 | **A5 — remove the room names** | killed before building | The names are the main reason people work out what is going on: they are the vocabulary that makes *the front room, again* legible as evidence. Proposed on the theory that they were doing the player's work; they are doing the opposite. Settled, not deprioritised. Turned into A6, which uses naming as a lever instead of removing it. |
