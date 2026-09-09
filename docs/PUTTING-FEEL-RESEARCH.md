# Putting technique and play feel

Research and code review: September 8, 2026. Implementation inspected at `6f5e9f0`. This document proposes changes; it does not describe shipped behavior.

Implementation update, September 8: the recommendations below have been implemented locally, including the optional realistic cup. See the current [README](../README.md) for controls and rules, and [verification results](VERIFICATION.md) for executed checks. The observations in the table below describe the original implementation. Human comparisons of the control mappings and physical iPhone haptic testing remain separate from automated verification.

The recommended direction is a putting game where players can choose a starting line and pace, repeat an intentional stroke, and understand the result. Consistency and readable feedback should be the first improvements. Added realism should support those goals.

## Evidence from golf coaching and research

- **Practice pace with an area target.** PGA coach Ethan McCallister describes a stopping zone and putts from 10, 20, and 30 feet. His coaching emphasizes consistent tempo while changing stroke length. This supports a distance ladder and rewards for a good leave. It does not establish that a particular touchscreen gesture transfers to a physical putting stroke. [PGA safety-zone drill](https://www.pga.com/story/stop-three-putting-pga-coach-ethan-mccallisters-safety-zone-drill-for-perfect-speed-control).
- **Starting direction and short-putt confidence deserve separate practice.** PGA coach Brendon Elliott recommends gate, three-foot circle, and distance-control drills. These provide a useful structure for progressive challenges. [PGA putting drills](https://www.pga.com/story/golf-tips-the-best-putting-drills-to-improve-your-stroke).
- **Speed and the chosen line interact.** Paul Hurrion's measured examples show that changing pace changes the required line, entry direction, and potential finish beyond the hole. A fixed instruction to finish a particular distance past every hole misses the effect of slope and green speed. His work also describes how faster entry reduces the effective capture width. These findings support showing alternative pace choices; they do not justify copying one universal optimal entry speed into our game. [Hurrion's putting research](https://www.paulhurrion.com/media/entering-the-drop-zone/).
- **Rolling and capture are related modeling problems.** A. R. Penner's 2002 paper models a rolling ball on a sloping green and combines its path with a hole-capture model. This supports evaluating launch direction, pace, and cup interaction together. The paper is a model, not a calibration of our current game. [The physics of putting](https://raypenner.com/golf-putting.pdf).
- **Pin fairness depends on green speed.** The USGA explains that some hole locations become unusable when balls can no longer stop near them at the chosen green speed. A pin passing one slope threshold is therefore insufficient evidence that it is playable. [USGA architectural speed limit](https://www.usga.org/content/usga/home-page/course-care/forethegolfer/2017/the-architectural-speed-limit-for-putting-greens.html).

The product recommendations below are design inferences from this evidence and the local code review. Their effect on enjoyment requires playtesting.

## Current implementation findings

| Area | Observed behavior | Effect to investigate |
| --- | --- | --- |
| Drag scale | `src/aiming.js` computes the range from cup distance, then converts the pull through a nonlinear curve. | The same movement selects different distances after changing lies. |
| Exact-distance assist | `distanceCalibration(stimp)` converts requested flat-ground feet to speed using the shared simulator. | This makes distance selection consistent with the simulation, but automatically compensates for green speed. |
| Bar color | `src/game.js` uses 50% and 80% of the available range as yellow/red thresholds. | Color communicates control range, although a player may interpret it as short/good/long relative to the cup. |
| Straight reach indicator | The tube extends the selected flat-ground distance along the starting direction. Practice also has a simulated curved path and expected finish. | The two endpoints can be mistaken for the same prediction. |
| Break readout | `updateRead()` still chooses speed using `sqrt(2 * friction * (distance + 1.5))` and reports the final lateral displacement. | It neither uses the new distance calibration nor measures the ball's offset as it passes the cup. It should not be treated as an exact aim correction. |
| Cup | `src/physics.js` accepts any path intersecting the cup, regardless of speed. | Pace mistakes can be masked by a successful capture. This is the user's requested forgiving behavior. |
| Green edge | The physics clamps the ball at a rectangular boundary and reverses the crossing velocity component. | The boundary behaves like an invisible wall. |
| Pin generation | `src/course.js` checks local slope and reachability, including a reach check at Stimp 7. | Stopping behavior around the pin is not comprehensively checked at every playable speed. |
| Rewards | `src/scoring.js` strongly rewards one-putts and long one-putts. | A well-paced long putt leaving a simple second putt receives little direct feedback. |

Reproduced with the current pure aiming functions at Stimp 10 and a 185-pixel maximum pull: a 100-pixel pull selects **8.2 feet** with the cup 10 feet away and **21.5 feet** with the cup 30 feet away. These are selected flat-ground distances, not measured finishes on a sloping hole. The range stays fixed during each gesture; the inconsistency occurs between lies.

## Recommended changes, in order

1. **Make the controls learnable.** Prototype a stable drag-to-launch-speed curve that persists between holes. On the same surface, the same pull should produce the same launch. A faster green can then produce a longer roll, giving players a reason to learn its pace. Keep the current exact-feet interface as an explicit assist. If a precision setting is necessary for very short putts, make it visible and user selected. Retain the dead zone, smoothing, and protection against a release-coordinate jump. Do not add a timing window or finger-flick speed requirement to the first prototype.

2. **Separate stroke strength from outcome.** Use a neutral strength meter. In assisted Practice, show a separate pace assessment with words such as “Short,” “Comfortable pace,” or “Long,” with color as a secondary cue. Changing the available range must not change an unchanged shot's assessment. A good pace label must not promise a hole: starting line is a separate choice. Hide predictive assessments in Competition and show the result after the shot.

3. **Clarify the visual aim.** Use a short starting-direction guide near the ball and a distinct, optional curved prediction ending at the simulated stopping point. Keep the flat-ground distance in the control panel. Offer temporary contour and downhill-flow cues during reading, then reduce their prominence when the player commits. Keep ball and cup visible above the finger and outside the phone's controls. Add a low viewing angle for reading and a stable view for executing the putt.

4. **Unify every read with the shot simulation.** The selected launch vector, preview, readout, and actual roll should use the same conditions and physics. For a straight-at-cup comparison, use the selected pace and report the lateral miss at a clearly defined cup crossing. If it never reaches that crossing, report “Finishes short” instead of inventing a break value. Distinguish this diagnostic from a solver-derived starting aim. In Practice, allow players to compare a softer and firmer plausible route to see the pace/line tradeoff.

5. **Explain the outcome and make retry useful.** Preserve the actual starting line and path after a putt. Show a compact result such as “Finished 8 in left · 14 in long,” then let Practice replay the same lie. A suggested adjustment should come from a counterfactual simulation, not a rule that every left miss means aim right. Provide one change at a time when a stable, better alternative exists. Keep random stroke error off in the learning drills.

6. **Make every green fair.** Validate a neighborhood around the pin at the selected green speed, including whether plausible approaches settle nearby and whether a return putt remains playable. Include low-speed behavior and grain in this check. Tune green speed and slope response together using reference putts; internal distance calibration alone does not establish real-world accuracy. Audit visual slope exaggeration against the readout. Replace the invisible reflecting boundary with a visible fringe that slows the ball and a clear recovery rule beyond it.

7. **Make realistic cup behavior optional.** Preserve the existing forgiving cup and decorative flag as the default. A separate realistic option could use entry speed and offset to distinguish a clean drop from a ball rolling across the opening. It should be tested independently and clearly labeled. All prediction and coaching must follow the selected cup rule. Any more detailed rim interaction belongs after the simple version feels fair; the flag must never become an obstacle again.

8. **Reward golf decisions and improve the phone experience.** Add a short-putt circle, a starting-line gate, and a 10/20/30-foot stopping-zone ladder. Reward a good leave, successful two-putts, and improvement across attempts as well as makes. Progress from flat short putts to single slopes, combinations, and grain. Add an optional brief strike haptic and a cup-drop haptic; retain silent rolling. Keep the camera steady during input and avoid moving it until the player's chosen action is clear. Condense the HUD during the roll and make retry immediate.

## Calculation contract

Keep one authoritative simulation. Feed it the same terrain, launch vector, Stimp, grain setting, and cup rule used for play. Maintain separate data for:

- **Stroke:** gesture position and resulting launch speed/direction.
- **Flat reference:** calibrated distance for that launch on a flat reference surface; clearly label which surface or assist it represents.
- **Actual prediction:** path and finish with the active cup rule.
- **Pace diagnostic:** a second simulation with cup capture disabled, used to inspect entry/closest-approach speed and the potential leave after a miss.

The second simulation matters because the forgiving cup otherwise makes even excessive pace end exactly at the hole. A counterfactual rollout must be labeled as such, never drawn as the actual result of a holed putt. If it does not settle within the simulation limit, show an unresolved/runaway state instead of a false stopping marker. Grade pace only when the trajectory supplies a meaningful comparison near the target; a shot aimed away from the hole should receive a line explanation.

A preliminary “comfortable pace” band is a game-design setting to tune, not a universal golf constant. Define its meaning, publish it in help, and validate uphill/downhill cases separately. Avoid equating an arbitrary percentage of maximum power with a successful putt.

## Delivery and validation

**First iteration:** unify the readout, separate strength from pace feedback, clarify the prediction, and compare stable versus adaptive touch controls. Preserve an option to return to the existing feel during testing.

**Second iteration:** add useful result/retry feedback, stopping-zone drills, pin fairness checks, and phone camera/HUD improvements.

**Later experiment:** realistic cup option and deeper physical calibration after the basic interaction is understandable.

Check these properties before release:

- Equal launch conditions reproduce equal outcomes with random error disabled.
- Changing only the control range cannot change a selected shot's outcome label.
- Preview and played shot agree across flat, uphill, downhill, and breaking putts.
- A pace label can be good while the line misses; feedback explains that distinction.
- Fast crossings follow the selected cup rule in both prediction and play.
- Proposed pins permit appropriate stopping behavior throughout the supported speed range.
- Touch remains usable for tap-ins, long putts, and rotated iPhone layouts.

Playtest both control mappings with the same flat and sloped scenarios in counterbalanced order. Record leave distance, accidental shots, retries, and whether the player can explain the miss and make a useful adjustment. Ask which mapping feels more predictable. Treat these as measurements of the game's usability and learnability; real-golf skill transfer would require separate validation.
