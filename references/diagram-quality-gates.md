# Diagram quality gates

Use these gates for every authored diagram and for every renderer change. A diagram is a causal explanation, not a collection of cards.

## 1. Declare the intent before layout

Write one row for each view before adding coordinates or choosing a preset:

| Field | Required answer |
| --- | --- |
| Learner question | What exact confusion does this view resolve? |
| Visual type | Why is this a flow, graph, cycle, layer, comparison, timeline, funnel, sequence, or chart? |
| Reading direction | Left to right, top to bottom, outward from a hub, or around a loop |
| Main claim | One sentence the learner should be able to say after reading it |
| Relationship grammar | What does every arrow, connector, or value mean? |
| Mobile form | How will the same topology remain explicit without shrinking the desktop SVG? |

If two views have the same answers, keep the clearer one. If the edge grammar cannot be named, revise the model before rendering.

## 2. Pass the topology gate

- A directed edge reads from `from` to `to`. Confirm the mechanism actually moves, calls, contains, permits, rejects, or returns in that direction.
- Label every directed relationship with a learner-facing verb or short phrase.
- Connect every node in a mechanism view. A disconnected card is either a missing relationship or material for another view.
- Use `flow` for a one-way causal or movement path. A directed return edge belongs in `cycle` unless it represents a separately labeled outcome branch.
- Use `cycle` only when the edge set contains a real directed loop.
- Use `comparison` for alternatives that do not move into one another. Set `comparisonDimension` so the learner knows the shared question being contrasted.
- Use `sequence` when actor order and message direction matter. A result that returns to a caller points back to that caller.
- Use a branch when one decision or state has multiple outcomes. Preserve the branch instead of placing outcomes in a misleading linear row.

Run the spec validator after topology changes. Treat its warnings about labels, flow cycles, and comparison dimensions as failures to repair.

## 3. Pass the geometry gate

At the rendered desktop size:

- no node overlaps another node;
- no edge passes through an unrelated node;
- arrowheads end at a node boundary rather than underneath a card;
- labels do not overlap nodes, other labels, or arrowheads;
- long labels and details wrap inside their node without silent clipping;
- backward or return routes use a visible lane or loop instead of cutting across the main path;
- a hub fans directly to its targets without another target blocking those routes;
- the traveler sits on the exact path for an authored edge.

The renderer exposes the current result as `window.__mikoDiagramAudit`. For each view, require:

```js
{
  nodeOverlaps: [],
  edgeCrossings: [],
  labelOverlaps: [],
  travelerLabelOverlaps: [],
  missingEdgeLabels: [],
  travelerAttached: true,
  mobileRelationshipCount: 1,
  horizontalOverflow: false
}
```

`mobileRelationshipCount` varies with topology but should be non-zero for a mechanism with relationships. A comparison or quantitative chart may legitimately have no traveler and no directed edges.

When `horizontalOverflow` is true, `overflowElements` lists the first rendered elements outside the viewport to make the CSS fault actionable.

Sampling-based geometry checks are a safety net, not proof of readability. Visually inspect the result as well.

## 4. Preserve semantics on mobile

Do not shrink a dense SVG until its text becomes unreadable. Render an authored mobile form:

- linear flows become ordered cards separated by labeled downward connectors;
- branches keep the decision once and show each labeled outcome side by side or in a readable stack;
- cycles list every directed transition, including the return step;
- graphs with a hub keep one hub and separately labeled relationships to each target;
- comparisons state the dimension and show every alternative with its complete detail;
- sequences list ordered source, message, and destination relationships;
- charts preserve labels, values, and provenance.

At a 390 px viewport, confirm there is no horizontal overflow and that topology, active state, and reading order remain understandable without seeing the desktop diagram.

## 5. Explain how to read the selected view

The legend and explanation must change with the selected view. Examples:

- `flow`: follow arrows from source to destination;
- `cycle`: follow the loop and its real return path;
- `sequence`: time moves downward and arrows are messages;
- `layers`: read control, containment, or dependency from top to bottom;
- `comparison`: compare alternatives on the stated dimension; there is no process flow.

Never use a universal phrase such as “arrows show cause or movement” when the current view has no arrows.

## 6. Browser acceptance

Inspect every view at desktop and mobile widths. Verify:

1. the learner question, diagram, caption, and route explanation make the same claim;
2. the direction of every arrow matches the spec and the spoken explanation;
3. the geometry audit is clean;
4. labels and details are complete;
5. traveler motion follows a real edge and reduced-motion mode remains clear;
6. view selection, navigation, Pause/Play, Replay, truth layers, and teach-back work;
7. the console has no errors and the page makes no runtime network requests.

If any view fails, repair the spec or renderer and re-run validation, rendering, artifact checks, and browser acceptance for all views.
