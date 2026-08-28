# Grounding and story rules

## One traveler, one causal chain

Choose a concrete traveler and follow it through the complete mechanism. A traveler could be one login code, one cache request, one memory, or one packet. Name it in the spec so the renderer can repeat it consistently.

Every scene should answer three questions:

1. What changed for the traveler?
2. Which component caused that change?
3. Why should the learner care?

## Truth ladder

Every lesson has three simultaneously available layers:

- **Easy picture** — an analogy that makes the shape of the idea memorable.
- **Real mechanism** — the actual parts, states, and causal links.
- **Important caveat** — where the analogy breaks or where implementations differ.

Do not present an analogy as evidence. Do not hide a contradiction between the analogy and mechanism; name it in the caveat.

## Evidence states

Classify each supporting item:

- `verified`: directly supported by a cited primary source, supplied material, or inspected system state;
- `inferred`: a reasoned synthesis or generic model whose exact implementation may differ;
- `analogy`: a teaching device, not a factual claim.

Use `verified` only when the lesson has inspectable support. Include a direct URL or precise source note when possible. For current product behavior, laws, medicine, finance, security guidance, or other drift-prone/high-stakes topics, research current authoritative sources first.

If sources disagree, show the disagreement in the caveat or split the lesson into variants. If evidence is absent, make the limitation visible rather than inventing certainty.

## Story shapes

Choose the smallest useful shape:

- **Journey:** start → transform → store/forward → result.
- **Mystery:** surprising symptom → competing guesses → mechanism → resolution.
- **Failure and recovery:** normal path → failure → detection → repair.
- **Comparison:** same traveler through option A and option B → tradeoff.
- **State machine:** state → event → next state → terminal/retry condition.

## Teach-back

Ask about causality, not vocabulary. A good question is “Why does the memory gate run before the write?” A weak question is “What is the component called?”

For each incorrect option, the shared explanation should say what relation was reversed or omitted. The learner should be able to return to the relevant scene from the question wording.
