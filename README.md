# ⛳ Green Reader — Realistic Putting Simulator

A single-file browser game that simulates how a golf ball rolls across an
undulating green, so you can **learn to read break, slope and speed**. The green
is rendered as a real 3D surface with Three.js — walk and orbit around the putt
to read the slope like a pro.

**Play online:** [rivenme.github.io/green-reader](https://rivenme.github.io/green-reader/)
— works on **phones** too: drag the ball back to putt, one finger to orbit,
pinch to zoom, with a compact green-read card and the controls in a ☰ bottom
sheet.

## Play

```
open index.html        # macOS
xdg-open index.html    # Linux
# or just double-click the file
```

No build step. The only dependency is **Three.js**, loaded from a CDN at
runtime — so the game needs an internet connection to load.

### 🎮 Modes

Pick a mode from the tabs in the side panel (tap **☰** on phones):

- **⛳ Competition** — climb all 50 levels for a high score. Each holed putt scores
  `distance × difficulty × stroke-tier × streak` and fires a celebration
  (🔥 ONE PUTT! / 💣 BOMB! / BIRDIE! / PAR) with a pop-up score, confetti and a
  chime. A par-or-better **streak** multiplies your score. Clear level 50 for an
  end-of-run recap. Lifetime points earn **XP & ranks** (Weekend Hacker → … →
  Legend), and there are **12 achievement badges** and a **Locker** of unlockable
  ball colours, trails and green themes.
- **🎯 Practice** — pure learning: caddie card, best-line guide, free retries,
  no score pressure.

Progress (XP, badges, best run, equipped cosmetics) is saved in your browser's
`localStorage`. The big top number is your **vs-par** score; the small line is
your **run points + streak**. **➰** toggles the predicted break path and **↺**
replays the hole.

### 🏔 The 3D green

Walk/orbit around the putt to read the slope like a pro — drag anywhere to orbit
the camera, scroll to zoom, press `C` to snap behind the ball. The terrain mesh
is the actual elevation field with contour lines every 0.25 ft, a GSPro-style
putting grid draped on the surface, height-ramp colouring and a sun casting ball
shadows for depth. Break is shown the way modern golf sims (GSPro, PGA 2K) do
it: **flowing dots** that drift downhill — faster and brighter where the slope
is steeper.

The course has **50 seeded levels** on a clean edge-to-edge green. Difficulty
ramps to its max around level 30, then keeps varying by seed.

Realism touches: green contours stay in the real-world 1–4% slope range (no
deep bowls — real greens are built to drain, so hollows are shallow), plus
structural features real architects use — **tiers** and **ridges/spines** —
with pins always cut on reasonably flat ground. The roll model is the real
thing: a **skid phase** (the first stretch slides, holds its line, then breaks
hardest at the end), an abrupt **die** as grass swallows the slowing ball,
**grass grain** (down-grain faster, cross-grain drifts; toggleable), and
subtle imperfection wobble. **Cup capture follows the physics of the lipout**:
the hole plays smaller the faster you arrive — dead-centre drops below
~4.6 ft/s, an edge graze under ~1.8 ft/s, anything hotter lips out or rolls
straight over. **Human stroke error** (toggleable) grows with stroke length,
like real lag putts. Synthesized **sound**: strike click, rolling grass,
cup rattle. A **green speed slider** sets the Stimp (default 10 ≈ members'
club; 13+ = tournament glass). Press `V` for a **crouched read camera** at
ball height. Distance to the hole updates live, the power bar shows roll-out
for your draw-back, and the panel tracks your **make % by distance and
strokes gained vs the PGA Tour** across sessions.

**Caddie card**: the panel reads the green for you in numbers — rise/fall to
the cup in feet, slope % at the hole, and "break if aimed straight": how many
feet a dead-straight putt at holing pace would miss by, i.e. exactly how far
to aim into the hill.

Toggle **Best line to hole** (`B`) and the game solves the actual ideal putt —
it searches aim angles × speeds through the real physics for a line that holes
out with a soft dying arrival, and drapes it on the green. Green line = holes
out; amber = best-effort lag when no direct make exists from your lie.

### Controls — the "best method": slingshot aiming
1. **Press and hold near the ball.**
2. **Drag *backwards*** (away from where you want it to go). The line shows your
   start direction; the bar shows power (green → yellow → red = too hard).
3. **Release** to strike the putt.

The aim line is deliberately **straight** — it does *not* show the curve. You
must read the slope and aim into the break yourself. That is the whole skill,
and why this teaches better than a game that just draws the line in for you.

| Key | Action |
|-----|--------|
| `R` | Replay the hole |
| `P` | Toggle predicted break path (the "answer key") |
| `S` | Toggle slope arrows & shading |
| `B` | Toggle best line to hole |
| `C` | Snap camera behind the ball |
| `V` | Crouched read camera (ball height) |
| `N` | Skip to next level |

## How the learning aids map to reality

- **Colour shading** — elevation map. 🔵 blue = low ground / valleys ("depth"),
  🟢 green = level, 🔴 red = high ground. Hill-shading adds 3‑D feel.
- **Arrows** — point **downhill** (the direction gravity pulls the ball). Longer/
  brighter arrow = steeper slope = more break. Aim *opposite* the arrows so the
  ball curls back toward the cup.
- **Predicted path** (toggle with `P`) — runs the real physics forward and draws
  the true curving roll, so you can check your read after committing.
- **Stimp** — green speed (Stimpmeter). Higher = faster green = ball rolls
  farther *and breaks more* for the same slope.

## The physics (what makes it realistic)

The green is a continuous **elevation field** `h(x,y)` in feet: a tilted base
plane plus several Gaussian **bumps (hills)** and **hollows (depth)**.

Each simulation step the ball feels two real forces:

```
a_gravity  = -g · ∇h          # gravity pulls the ball down the slope (∇h = steepest-uphill gradient)
a_friction = -μ · v̂           # rolling resistance opposes motion
a = a_gravity + a_friction
```

- `∇h` (the gradient) is computed **analytically** from the field, so slope and
  break are exact, not faked.
- `μ` (rolling deceleration) is derived from the **real Stimpmeter relationship**
  `μ = v₀² / (2·stimp)` — a ball leaving the ramp at `v₀ ≈ 6 ft/s` rolls `stimp`
  feet on the flat. Faster greens ⇒ lower friction ⇒ longer, breakier putts.
- Integration uses **sub-stepped semi-implicit Euler** for stability.
- The ball **settles** only when it is slow *and* the slope is too weak to keep
  it rolling — so it trickles down hills realistically.
- **Cup capture / lip-out**: arrive slowly and it drops; arrive too hot and it
  rims out and deflects, just like real life.

## Levels & difficulty

The course has **50 seeded levels** — each level number always plays the same.
Difficulty ramps to its max around level 30, then keeps varying by seed:

| As you level up | Effect |
|-----------------|--------|
| Base tilt increases | Stronger overall break |
| More & sharper bumps/hollows | Multi-break, double-breaking putts |
| Longer distance | Harder speed control |
| Tiers & ridges/spines appear | Structural features that redirect the roll |

You can also set green speed yourself with the **Stimp slider** (default 10 ≈
members' club; 13+ = tournament glass) — faster greens break more and run out.

## Tips to actually get better
1. **Speed first.** Most missed putts are wrong *pace*, not wrong *line*. A putt
   dying at the hole takes more break; a firm putt holds its line.
2. **Read the high side.** Find the highest ground between ball and cup and aim
   to roll the ball across the slope above the hole.
3. **Turn the path off** (`P`) once you can read it — then turn it on to check.
4. **Trust the slope arrows** on faster (higher-Stimp) greens; small slopes move
   the ball a lot when the green is quick.

Built as a self-contained `index.html` (Three.js / WebGL + vanilla JS).
