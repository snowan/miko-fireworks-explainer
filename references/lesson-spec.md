# Lesson specification, version 2

The renderer accepts one UTF-8 JSON object. Use version 2 for new lessons. Version 1 remains supported for legacy single-view specs.

## Root fields

| Field | Type | Requirement |
| --- | --- | --- |
| `version` | number | Use `2` for a new lesson |
| `title` | string | Plain-language topic name, 3–120 characters; normally 3–8 words |
| `summary` | string | One to three concise sentences explaining the core topic itself |
| `source` | object | Optional original source with `title`, absolute HTTP(S) `url`, and optional `byline` |
| `audience` | string | Optional; defaults to `curious beginner` |
| `style` | string | `minimal`, `daily-chibi`, `retro-manga`, or `magical-festival` |
| `traveler` | object | `name` is a short ID; `label` is learner-facing |
| `truthLadder` | object | Non-empty `analogy`, `mechanism`, and `caveat` strings |
| `overview` | visual | A scene-linked whole-journey map |
| `scenes` | array | 3–7 scene objects |
| `evidence` | array | Evidence objects; may be empty only when `fictional` is `true` |
| `teachBack` | array | 2–4 question objects |

For a source-led lesson, make the opening factual and direct:

```json
{
  "title": "How Large Language Models Work",
  "summary": "A large language model turns text into numbers, connects context with attention, and predicts one token at a time. Training changes its weights; inference uses them.",
  "source": {
    "title": "Holding the LLM Stack in Your Head",
    "url": "https://thegustafson.com/series",
    "byline": "Nick Gustafson"
  }
}
```

The title names the topic. The summary explains the topic, not the lesson format or its characters. Omit `source` for a lesson that is not based on one identifiable original work.

## Whole-journey overview

The overview is a named visual. Every node needs a `sceneId`, and every scene must appear in the map.

```json
{
  "overview": {
    "id": "memory-journey",
    "title": "One fact's whole journey",
    "caption": "Pick any stage to jump to Koko's question.",
    "type": "flow",
    "nodes": [
      {"id": "stage-chat", "sceneId": "chat-context", "label": "Chat context", "detail": "Temporary"},
      {"id": "stage-gate", "sceneId": "memory-gate", "label": "Memory gate", "detail": "Approve or reject"},
      {"id": "stage-store", "sceneId": "memory-store", "label": "Durable record", "detail": "Available later"}
    ],
    "edges": [
      {"from": "stage-chat", "to": "stage-gate", "label": "candidate"},
      {"from": "stage-gate", "to": "stage-store", "label": "approved"}
    ]
  }
}
```

Use `flow`, `timeline`, or `cycle` for most overviews. Keep the structure stable; the renderer adds visited, current, and upcoming state.

## Scene and coordinated views

Each scene has one Koko question, Michi's three truth depths, one takeaway, and one to three named visuals.

```json
{
  "id": "memory-gate",
  "title": "The memory gate",
  "question": "What decides whether my fact gets saved?",
  "simpleAnswer": "A gate checks whether the fact is useful and safe to keep.",
  "technicalAnswer": "The write policy evaluates relevance, sensitivity, user intent, and duplication before persistence.",
  "caveat": "Real systems use different policies, and some do not write durable memory at all.",
  "takeaway": "Selection happens before storage.",
  "visuals": [
    {
      "id": "write-decision",
      "title": "The write decision",
      "caption": "The candidate reaches storage only after approval.",
      "type": "flow",
      "nodes": [
        {"id": "candidate", "label": "Candidate fact", "detail": "Koko likes salmon treats"},
        {"id": "gate", "label": "Memory gate", "detail": "Useful? Safe? Allowed?"},
        {"id": "store", "label": "Memory store", "detail": "Durable record"}
      ],
      "edges": [
        {"from": "candidate", "to": "gate", "label": "evaluate"},
        {"from": "gate", "to": "store", "label": "approved"}
      ],
      "activeNodeIds": ["gate"]
    },
    {
      "id": "selection-funnel",
      "title": "Many messages, few memories",
      "caption": "Successive checks narrow chat content into selected records.",
      "type": "funnel",
      "nodes": [
        {"id": "messages", "label": "Messages"},
        {"id": "candidates", "label": "Useful candidates"},
        {"id": "allowed", "label": "Safe and allowed"},
        {"id": "records", "label": "Durable records"}
      ],
      "edges": [
        {"from": "messages", "to": "candidates", "label": "usefulness"},
        {"from": "candidates", "to": "allowed", "label": "safety"},
        {"from": "allowed", "to": "records", "label": "write"}
      ],
      "activeNodeIds": ["allowed"]
    }
  ],
  "evidenceIds": ["architecture-model"]
}
```

Visual IDs must be unique within the scene. Every version 2 visual needs `id`, `title`, and `caption`.

## Visual grammar

Every visual has two to eight uniquely identified nodes and an `edges` array. Every edge endpoint must name a node in the same visual. Directed edges read from `from` to `to` and need a short learner-facing `label`. Every node in a mechanism view must connect to the same topology. `activeNodeIds` marks the current mechanism or traveler location.

| Type | Best use | Edge rule |
| --- | --- | --- |
| `flow` | One-way movement or causation | At least one labeled edge and no directed return cycle |
| `graph` | Relationships or retrieval paths | At least one edge |
| `cycle` | Retry, feedback, or correction | At least one labeled real directed return path |
| `layers` | Boundaries, containment, or dependencies | At least one edge |
| `comparison` | Contrasts or tradeoffs | Edges may be empty; `comparisonDimension` names the shared question |
| `timeline` | Ordered change over time | At least one edge |
| `funnel` | Filtering or narrowing | At least one edge |
| `sequence` | Ordered messages between actors | At least one edge |
| `bar` | Comparing numeric magnitudes | Edges may be empty; values required |
| `donut` | Parts of one numeric whole | Edges may be empty; values required |

Read `diagram-portfolio.md` before selecting several views.

For a comparison, make the dimension explicit rather than relying on card position:

```json
{
  "type": "comparison",
  "comparisonDimension": "where code inherits permissions",
  "nodes": [
    {"id": "direct", "label": "Caller environment", "detail": "Inherits the caller's access"},
    {"id": "sandbox", "label": "Sandbox boundary", "detail": "Uses separately configured policy"}
  ],
  "edges": []
}
```

When a request genuinely travels into a system and a result comes back, use `cycle` or a sequence with an explicit return message. Do not append a backward edge to a linear `flow`; it can cross the forward path and reverse the learner's reading direction.

## Quantitative charts

Every `bar` or `donut` node needs a finite, non-negative `value`, with at least one value above zero. The visual also needs:

```json
{
  "dataStatus": "illustrative",
  "chartNote": "Teaching-only scores; actual ranking scales differ.",
  "evidenceIds": ["score-analogy"]
}
```

`dataStatus` is `verified` or `illustrative`. Verified charts require at least one evidence ID supporting the values. Illustrative charts must plainly say that their values teach a pattern rather than report measurements.

## Evidence

```json
{
  "id": "architecture-model",
  "status": "inferred",
  "label": "Generic write-and-retrieve model",
  "note": "A conceptual synthesis; exact memory products differ.",
  "url": "https://example.com/optional-primary-source"
}
```

IDs must be unique. `status` is `verified`, `inferred`, or `analogy`. `url` is optional but must use HTTP or HTTPS when present. Scene evidence IDs support the answer; visual evidence IDs support a particular view.

## Teach-back

```json
{
  "question": "Why does the memory gate run before storage?",
  "options": [
    "To decide what is safe and useful to persist",
    "To make the network faster",
    "To turn every message into a permanent fact"
  ],
  "correctIndex": 0,
  "explanation": "The gate prevents irrelevant or unsafe candidates from becoming durable records."
}
```

Provide two to four distinct options and a zero-based `correctIndex`.

## Version 1 compatibility

Version 1 uses one `scene.visual` and has no required overview. The renderer creates a default journey map and wraps each legacy visual as one view. Do not mix `visual` and `visuals` in the same spec. Use version 2 for all new work.

## Rendering commands

```bash
node scripts/validate.mjs lesson.json
node scripts/render.mjs lesson.json lesson.html
node scripts/check-html.mjs lesson.html
```

For the same spec and bundled assets, output is deterministic. The generated HTML is self-contained, makes no runtime network request, advances through scene views automatically, pauses, replays, honors reduced motion, and switches to an authored mobile representation at narrow widths.

The active browser view also exposes `window.__mikoDiagramAudit`. Require empty `nodeOverlaps`, `edgeCrossings`, `labelOverlaps`, `travelerLabelOverlaps`, and `missingEdgeLabels`; require `travelerAttached` for relationship views; require `horizontalOverflow` to be false; and confirm `mobileRelationshipCount` preserves the authored topology. Read `diagram-quality-gates.md` for the full acceptance process.
