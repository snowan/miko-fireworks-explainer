import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkHtml } from "./check-html.mjs";
import { renderLesson, STYLE_CONFIG } from "./render.mjs";
import { validateSpec } from "./validate.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_PATH = resolve(SCRIPT_DIR, "../assets/examples/agent-memory.json");
const OPENSANDBOX_PATH = resolve(SCRIPT_DIR, "../assets/examples/opensandbox.json");
const example = JSON.parse(await readFile(EXAMPLE_PATH, "utf8"));
const opensandbox = JSON.parse(await readFile(OPENSANDBOX_PATH, "utf8"));

test("the bundled agent-memory lesson satisfies the version 2 portfolio contract", function () {
  const result = validateSpec(example);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(example.version, 2);
  assert.equal(example.scenes.length, 5);
  assert.equal(example.scenes.reduce((sum, scene) => sum + scene.visuals.length, 0), 11);
  assert.equal(new Set(example.scenes.flatMap((scene) => scene.visuals.map((visual) => visual.type))).size, 9);
  assert.deepEqual(new Set(example.overview.nodes.map((node) => node.sceneId)), new Set(example.scenes.map((scene) => scene.id)));
  assert.equal(example.teachBack.length, 3);
});

test("validation reports exact broken relationships and a next action", function () {
  const broken = structuredClone(example);
  broken.scenes[1].visuals[0].edges[0].to = "missing-node";
  broken.scenes[1].evidenceIds.push("invented-source");
  const result = validateSpec(broken);

  assert.equal(result.errors.length, 3);
  assert.ok(result.errors.some((item) => /edges\[0\]\.to/u.test(item.path) && /Unknown destination node/u.test(item.message)));
  assert.ok(result.errors.some((item) => /Disconnected node/u.test(item.message)));
  assert.ok(result.errors.some((item) => /evidenceIds/u.test(item.path)));
  assert.ok(result.errors.every((item) => item.next.length > 10));
});

test("diagram semantics reject disconnected mechanisms and distinguish flows from cycles", function () {
  const disconnected = structuredClone(example);
  disconnected.scenes[0].visuals[0].nodes.push({ id: "orphan", label: "Orphan node", detail: "Nothing connects this card" });
  const disconnectedResult = validateSpec(disconnected);
  assert.ok(disconnectedResult.errors.some((item) => /Disconnected node: orphan/u.test(item.message)));

  const backwardsFlow = structuredClone(example);
  backwardsFlow.scenes[0].visuals[0].edges.push({ from: "end", to: "koko", label: "repeat" });
  const flowResult = validateSpec(backwardsFlow);
  assert.ok(flowResult.warnings.some((item) => /flow contains a directed return path/u.test(item.message)));

  const fakeCycle = structuredClone(example);
  fakeCycle.scenes[0].visuals[0].type = "cycle";
  const cycleResult = validateSpec(fakeCycle);
  assert.ok(cycleResult.errors.some((item) => /cycle view needs a real directed return path/iu.test(item.message)));
});

test("comparisons name the shared dimension that makes their cards one argument", function () {
  const unnamed = structuredClone(example);
  delete unnamed.scenes[0].visuals[1].comparisonDimension;
  const result = validateSpec(unnamed);
  assert.ok(result.warnings.some((item) => /comparisonDimension/u.test(item.path)));
});

test("the OpenSandbox regression lesson has explicit routes in every mechanism view", async function () {
  const validation = validateSpec(opensandbox);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.warnings, []);
  const safeWorkshop = opensandbox.scenes[0].visuals[0];
  const executionChoice = opensandbox.scenes[0].visuals[1];
  assert.equal(safeWorkshop.type, "cycle");
  assert.equal(executionChoice.type, "flow");
  assert.equal(executionChoice.edges.length, 3);
  assert.ok(executionChoice.edges.every((edge) => edge.label));

  const html = await renderLesson(opensandbox);
  assert.deepEqual(checkHtml(html).errors, []);
  assert.match(html, /<span class="source-label">Original source<\/span>/u);
  assert.match(html, /href="https:\/\/github\.com\/opensandbox-group\/OpenSandbox"/u);
  assert.doesNotMatch(html, /arrows show cause or movement/iu);
});

test("source-led lessons validate and show the original work directly below the topic", async function () {
  const sourced = structuredClone(example);
  sourced.source = {
    title: "Agent memory architecture notes",
    url: "https://example.com/agent-memory",
    byline: "Example author",
  };
  const validation = validateSpec(sourced);
  assert.deepEqual(validation.errors, []);

  const html = await renderLesson(sourced);
  assert.match(html, /<h1 id="page-title">How Agent Memory Works<\/h1>/u);
  assert.match(html, /<span class="source-label">Original source<\/span>/u);
  assert.match(html, /Agent memory architecture notes/u);
  assert.match(html, /<p class="core-summary-label">Core idea<\/p>/u);
  assert.doesNotMatch(html, /Koko asks · Michi draws/u);

  sourced.source.url = "file:///tmp/not-a-public-source";
  const invalid = validateSpec(sourced);
  assert.ok(invalid.errors.some((item) => item.path === "source.url"));
});

test("charts must disclose whether numbers are verified or illustrative", function () {
  const broken = structuredClone(example);
  const chart = broken.scenes[3].visuals[1];
  delete chart.dataStatus;
  delete chart.chartNote;
  const result = validateSpec(broken);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].path, /dataStatus/u);
  assert.match(result.errors[1].path, /chartNote/u);
});

test("the whole-journey map represents every scene exactly once", function () {
  const broken = structuredClone(example);
  broken.overview.nodes[1].sceneId = broken.overview.nodes[0].sceneId;
  const result = validateSpec(broken);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].message, /does not map scene/u);
  assert.match(result.errors[1].message, /maps scene.*2 times/u);
});

test("rendering is deterministic and produces a complete offline artifact", async function () {
  const first = await renderLesson(example);
  const second = await renderLesson(example);
  assert.equal(first, second);

  const result = checkHtml(first);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.match(first, /data:image\/png;base64,/u);
  assert.match(first, /id="character-art-data"/u);
  assert.match(first, /--michi-portrait-size: [\d.]+% auto/u);
  assert.match(first, /--koko-portrait-size: [\d.]+% auto/u);
  assert.doesNotMatch(first, /<figure class="board-figure"/u);
  assert.doesNotMatch(first, /Selected from the supplied Michi/u);
  assert.doesNotMatch(first, /--portrait-size: 820px/u);
  assert.match(first, /id="overview-diagram"/u);
  assert.match(first, /id="overview-mobile"/u);
  assert.match(first, /<nav id="overview-diagram" class="overview-flow diagram-desktop"/u);
  assert.doesNotMatch(first, /<svg id="overview-diagram"/u);
  assert.match(first, /overview-connector-label/u);
  assert.match(first, /id="visual-nav"/u);
  assert.match(first, /id="visual-legend"/u);
  assert.match(first, /id="route-explanation"/u);
  assert.match(first, /__mikoDiagramAudit/u);
  assert.match(first, /data-diagram-audit/u);
  assert.match(first, /data-edge-from/u);
  assert.match(first, /mobile-branches/u);
  assert.match(first, /mobile-transition-list/u);
  assert.match(first, /animateMotion/u);
  assert.match(first, /Illustrative data/u);
  assert.match(first, /font-size: clamp\(2\.2rem, 4\.2vw, 4rem\)/u);
  assert.match(first, /font-size: clamp\(1\.75rem, 10vw, 2\.8rem\)/u);
  assert.doesNotMatch(first, /[\t ]+$/mu);
  assert.doesNotMatch(first, /Miko Fireworks Explainer<\/span>/u);
  assert.doesNotMatch(first, /class="role-note"/u);
  assert.doesNotMatch(first, /arrows show cause or movement/iu);
  assert.doesNotMatch(first, /<script\b[^>]*\bsrc=/iu);
  assert.doesNotMatch(first, /<link\b[^>]*\bhref=/iu);
});

test("version 1 lessons remain renderable through the compatibility adapter", async function () {
  const legacy = structuredClone(example);
  legacy.version = 1;
  delete legacy.overview;
  legacy.scenes.forEach(function (scene) {
    scene.visual = scene.visuals[0];
    delete scene.visuals;
  });
  const validation = validateSpec(legacy);
  assert.deepEqual(validation.errors, []);
  const html = await renderLesson(legacy);
  assert.deepEqual(checkHtml(html).errors, []);
  assert.match(html, /The whole journey/u);
});

test("all four supplied Michi and Koko visual styles render", async function () {
  for (const style of Object.keys(STYLE_CONFIG)) {
    for (const key of ["michiPortrait", "kokoPortrait"]) {
      const crop = STYLE_CONFIG[style][key];
      assert.ok(crop.x >= 0 && crop.y >= 0 && crop.size > 0, `${style} ${key}`);
      assert.ok(crop.x + crop.size <= 1024, `${style} ${key} width`);
      assert.ok(crop.y + crop.size <= 1536, `${style} ${key} height`);
    }
    const styled = structuredClone(example);
    styled.style = style;
    const html = await renderLesson(styled);
    const result = checkHtml(html);
    assert.deepEqual(result.errors, [], style);
    assert.match(html, new RegExp(`data-style="${style}"`, "u"));
    assert.match(html, /--michi-portrait-position: [\d.]+% [\d.]+%/u);
    assert.match(html, /--koko-portrait-position: [\d.]+% [\d.]+%/u);
  }
});

test("the artifact checker rejects a learner-facing character selection panel", async function () {
  const html = await renderLesson(example);
  const exposed = html.replace(
    '<main id="main-content">',
    '<section class="image-selection">Selected from the supplied Michi board</section><main id="main-content">',
  );
  const result = checkHtml(exposed);
  assert.ok(result.errors.some((item) => item.check === "learner-facing-selection"));
});

test("learner content cannot break out of HTML or JSON containers", async function () {
  const hostile = structuredClone(example);
  hostile.title = "Memory </title><script>alert('cat')</script> lesson";
  hostile.source = {
    title: "Source </a><script>alert('source')</script>",
    url: "https://example.com/?q=\"bad\"",
    byline: "Author <img src=x>",
  };
  hostile.scenes[0].question = "Can </script><img src=x onerror=alert(1)> escape?";

  const html = await renderLesson(hostile);
  const result = checkHtml(html);
  assert.deepEqual(result.errors, []);
  assert.doesNotMatch(html, /<script>alert\('cat'\)<\/script>/u);
  assert.doesNotMatch(html, /<img src=x onerror=/u);
  assert.match(html, /Memory &lt;\/title&gt;&lt;script&gt;/u);
  assert.match(html, /Source &lt;\/a&gt;&lt;script&gt;/u);
  assert.doesNotMatch(html, /<script>alert\('source'\)<\/script>/u);
  assert.match(html, /\\u003c\/script\\u003e/u);
});
