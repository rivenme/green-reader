# ⛳ Green Reader — Realistic Putting Simulator

A single-file browser game that simulates how a golf ball rolls across an
undulating green, so you can **learn to read break, slope and speed**. No build
step, no dependencies — just open `index.html` in any modern browser.

## Play

```
open golf-putting-game/index.html      # macOS — 2D top-down (works offline)
open golf-putting-game/3d.html         # 3D green simulator (needs internet for Three.js CDN)
xdg-open golf-putting-game/index.html  # Linux
# or just double-click the file
```

### 🏔 3D version (`3d.html`)

The same physics rendered as a **real 3D green** (Three.js): walk/orbit around
the putt to read the slope like a pro — drag anywhere to orbit the camera,
scroll to zoom, press `C` to snap behind the ball. The terrain mesh is the
actual elevation field with contour lines every 0.25 ft, a GSPro-style putting
grid draped on the surface, height-ramp colouring and a sun casting ball
shadows for depth. Break is shown the way modern golf sims (GSPro, PGA 2K) do
it: **flowing dots** that drift downhill — faster and brighter where the slope
is steeper. Aiming, predicted path and the roll trail work identically to the
2D version.

The 3D course has **50 seeded levels** on a clean edge-to-edge green.
Difficulty ramps to its max around level 30, then keeps varying by seed.

3D-only realism: green contours stay in the real-world 1–4% slope range (no
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

## Levels & difficulty (10 holes)

Difficulty scales smoothly across the 10 levels — each is **seeded**, so the
same level number always plays the same:

| As you level up | Effect |
|-----------------|--------|
| Base tilt increases | Stronger overall break |
| More & sharper bumps/hollows | Multi-break, double-breaking putts |
| Longer distance | Harder speed control |
| Higher Stimp (8 → 13) | Faster greens that break more and run out |

## Tips to actually get better
1. **Speed first.** Most missed putts are wrong *pace*, not wrong *line*. A putt
   dying at the hole takes more break; a firm putt holds its line.
2. **Read the high side.** Find the highest ground between ball and cup and aim
   to roll the ball across the slope above the hole.
3. **Turn the path off** (`P`) once you can read it — then turn it on to check.
4. **Trust the slope arrows** on faster (higher-Stimp) greens; small slopes move
   the ball a lot when the green is quick.

Built as a self-contained `index.html` (HTML5 Canvas + vanilla JS).
