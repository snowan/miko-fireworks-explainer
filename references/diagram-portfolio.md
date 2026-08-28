# Diagram portfolio guide

Use diagrams as a coordinated teaching system. A strong lesson has one compact whole-journey route, then one clean primary diagram per question and optional supporting views that answer genuinely different visual questions.

## The three zoom levels

1. **Whole journey:** show every scene as a compact stage in the traveler's route. Keep it stable while active, visited, and upcoming stages change; do not give it the size or detail of a mechanism diagram.
2. **Question view:** show the smallest model that answers Koko's current question.
3. **Supporting view:** add a second or third view only when it reveals a different sequence, boundary, comparison, time change, or quantity.

Do not split one fact across several pictures that must be mentally reassembled. Do not repeat the same nodes with a new layout and call that a new view.

## Choose the visual by the learner's question

| Learner needs to see | Visual type | What the edges or values mean |
| --- | --- | --- |
| Where one thing goes or what causes the next step | `flow` | Direction, movement, or causation |
| How several things relate or which path is relevant | `graph` | Named relationships |
| What repeats, retries, or gets corrected | `cycle` | A real return path |
| What is inside, outside, above, or below a boundary | `layers` | Containment or dependency |
| How two choices or concepts differ | `comparison` | No implied movement; name the shared `comparisonDimension` |
| What changes as time passes | `timeline` | A transition between dated or ordered states |
| How many candidates narrow into a few results | `funnel` | A named filter or gate |
| Which actor sends what to whom | `sequence` | A message or call ordered from top to bottom |
| How magnitudes compare | `bar` | A numeric value with provenance |
| How a whole divides into a few parts | `donut` | A numeric share of one total |

Prefer the simplest type that exposes the causal model. A flow is not a universal substitute for a sequence diagram; a chart is not a decorative replacement for qualitative explanation.

## A practical portfolio recipe

For each scene, start with one primary view. Consider one supporting view from a different family:

- **Movement + boundary:** `flow` plus `layers`.
- **Decision + narrowing:** `flow` plus `funnel`.
- **Stored structure + messages:** `layers` plus `sequence`.
- **Search topology + ranking:** `graph` plus an honest `bar` chart.
- **Lifecycle + repair:** `timeline` plus `cycle`.

Use three views only when the third answers a learner question the first two cannot. Across a five-scene lesson, about seven to eleven scene views is usually enough; usefulness matters more than a quota.

## Traveler and playback grammar

- Pick one concrete traveler for the entire lesson and name it in learner-facing language.
- Put the traveler on a real edge connected to the current mechanism. Never float it through empty space.
- Read every directed edge as `from` source to `to` destination. A returned result points back to its receiver.
- Keep node labels, relationship labels, and arrow direction visible while the traveler moves.
- Autoplay advances through views before moving to the next Koko question.
- Pause freezes the explanation in a complete state. Replay returns to the first scene and first view.
- Reduced-motion mode disables timed advance and preserves active nodes, route direction, labels, and current location.
- Motion must encode movement, causation, progress, or a state transition. Do not add decorative bobbing or looping particles.

## Quantitative truth rules

Use `bar` or `donut` only when numbers make a relationship easier to understand.

- Every chart node needs a non-negative numeric `value`.
- Set `dataStatus` to `verified` or `illustrative`.
- Add `chartNote` where the learner sees it.
- A `verified` chart must reference evidence supporting the values.
- An `illustrative` chart must plainly say that its numbers teach a pattern and are not measurements.
- If the conclusion works without invented numbers, prefer a qualitative comparison.

## Geometry and mobile checks

- Use two to eight nodes per view.
- Keep labels short enough to scan; put explanation in `detail` or the caption.
- Every edge endpoint must resolve to a node in the same view.
- Every mechanism node must connect to the topology, and every directed relationship needs a learner-facing label.
- Use `cycle` for a real directed return path. Do not place a backwards return edge in a one-way `flow`.
- Preserve the primary scene diagram's generous spacing. Supporting views and overview stages must not shrink or crowd it.
- A transition label must fit wholly between nodes or outside their bounds. If it does not, shorten the label, add space, wrap it in a dedicated connector, or change the layout—never draw text across a card.
- Check arrows, labels, and traveler paths for overlap at desktop width.
- Reject any edge that crosses an unrelated node. Route returns around the main lane and fan hub relationships directly to their targets.
- On narrow screens, use the renderer's authored mobile cards, routes, messages, and chart rows. Do not rely on shrinking a dense SVG until its text becomes unreadable.
- The mobile representation must preserve order, actors, relationships, active state, and quantitative values.
- Inspect `window.__mikoDiagramAudit` for every selected view, then confirm its sampling-based result visually. See `diagram-quality-gates.md` for the required fields and browser acceptance pass.

## Evidence at the claim

Scene evidence supports the answer. Visual-level evidence supports a particular diagram or chart. Keep the relevant evidence chips visible with the active view. Label analogies and inferences instead of making them look verified.
