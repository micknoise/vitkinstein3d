# Vitkinstein 3D — experimental plan

A lab notebook, not a roadmap. The prototype works; what it does not yet have is
knowledge about which of its possible directions are any good. Everything below
is written as an experiment: a claim, the smallest thing that would test it, and
what would make us drop it.

**Working rate: one experiment at a time, committed and pushed to `main`.**
`main` stays playable and green — it is what gets played.

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
7. **Screenshot A/B** for anything that is supposed to look identical:
   `npm run compare -- old.html shots/before 424242` against the new build.

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

### A1 · Change behind your back
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

### B1 · Objects through portals
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

### B3 · The corridor that returns to itself
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
badly; decals must stay separate (transparent, depth-sorted). Grabbable objects
must stay individual — see §2.
**Size.** Medium. Highest leverage in the document.

### E2 · A window
Every space is an interior, so one window — onto a light well, onto brick, onto
nothing at all — would be the loudest thing in the game. What is outside is a
design question, not a technical one. Medium.

### E3 · Stairs
One storey is the biggest remaining constraint on the layout. Large: the player
is a sphere on a flat floor. Not before E1.

### E4 · Perf as a test
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
| 2026-08-27 | **A5 — remove the room names** | killed before building | The names are the main reason people work out what is going on: they are the vocabulary that makes *the front room, again* legible as evidence. Proposed on the theory that they were doing the player's work; they are doing the opposite. Settled, not deprioritised. Turned into A6, which uses naming as a lever instead of removing it. |
