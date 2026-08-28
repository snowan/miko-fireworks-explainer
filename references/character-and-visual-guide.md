# Character and visual guide

## Identity contract

Michi and Koko are recurring teachers, not interchangeable mascots.

| Character | Visual identity | Teaching role | Voice |
| --- | --- | --- | --- |
| Michi | Calico cat with white, orange, and dark patches | Sensei who draws the model and names the caveat | Calm, concrete, exact, encouraging |
| Koko | Brown tabby with visible stripes | Student who asks what a thoughtful beginner would ask | Curious, concise, candid about confusion |

Always describe Koko as a brown tabby. Some supplied stylizations use near-black brown; that rendering must not redefine the character.

## Dialogue rules

- Koko asks one question at a time. Prefer “Where does it go?” to “Can you elaborate on the persistence layer?”
- Michi answers the question before adding terminology.
- Never make Koko foolish for comic effect.
- Never make Michi omniscient. When evidence is incomplete, Michi says so.
- A joke may decorate a lesson, but must not carry a required technical fact.
- Give each scene one visual takeaway. Its one to three views may reveal different aspects of that same takeaway; split unrelated teaching goals into another scene.

## Bundled boards

The boards are style references supplied by the user. They remain internal source assets; the learner-facing artifact must not display a board, gallery, image-selection section, or selection caption.

Each dialogue avatar frames one complete character illustration from the selected board. Keep the whole chosen Michi or Koko silhouette visible—including the ears, face, and lower edge of that illustration—instead of zooming into a facial fragment. Use percentage-based framing so the same composition survives the 76px desktop and 56px mobile avatar sizes. The original files remain unchanged.

| Style ID | Asset | Best use |
| --- | --- | --- |
| `minimal` | `assets/characters/minimal.png` | Crisp diagrams, architecture, comparisons |
| `daily-chibi` | `assets/characters/daily-chibi.png` | Warm everyday Q&A and the default lesson |
| `retro-manga` | `assets/characters/retro-manga.png` | Motion, branching flows, incidents, failures |
| `magical-festival` | `assets/characters/magical-festival.png` | Abstract ideas, transformations, imaginative metaphors |

## Visual grammar

- Make the moving traveler visually distinct with the accent color.
- Begin with a compact whole-journey route that links every scene. Highlight visited, current, and upcoming stages without rearranging it or crowding its transition labels.
- Use arrows for movement, lines without arrows for relationships, and enclosed regions for boundaries.
- Label every node with a noun or short verb phrase; do not rely on color alone.
- Keep each view to 2–8 nodes. Replace a crowded picture with a coordinated supporting view or another scene.
- Prefer a flow for movement, graph for relationships, cycle for repetition, layers for boundaries, comparison for tradeoffs, timeline for change over time, funnel for selection, and sequence for actor messages.
- Use bars for magnitude and donuts for parts of one whole only when the numbers are verified or explicitly illustrative.
- Animate meaning, such as a traveler moving across an edge. Avoid decorative perpetual motion.
- Respect `prefers-reduced-motion`; the static state must retain the full explanation.

## Accessibility text

Alt text and labels must preserve identity and function. A useful pattern is: “Michi, a calico sensei, and Koko, a brown tabby student, in the daily chibi style.” Avoid describing the cats only by color.
