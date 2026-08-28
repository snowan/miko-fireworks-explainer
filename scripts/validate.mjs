#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STYLE_IDS = Object.freeze([
  "minimal",
  "daily-chibi",
  "retro-manga",
  "magical-festival",
]);

export const VISUAL_TYPES = Object.freeze([
  "flow",
  "graph",
  "cycle",
  "layers",
  "comparison",
  "timeline",
  "funnel",
  "sequence",
  "bar",
  "donut",
]);

export const EVIDENCE_STATES = Object.freeze([
  "verified",
  "inferred",
  "analogy",
]);

const CHART_TYPES = new Set(["bar", "donut"]);
const EDGE_OPTIONAL_TYPES = new Set(["comparison", "bar", "donut"]);
const LABELED_EDGE_TYPES = new Set(["flow", "graph", "cycle", "layers", "timeline", "funnel", "sequence"]);
const CHART_DATA_STATES = new Set(["verified", "illustrative"]);
const OVERVIEW_TYPES = new Set(["flow", "graph", "cycle", "layers", "comparison", "timeline", "funnel"]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value, minimum = 1, maximum = Infinity) {
  return (
    typeof value === "string" &&
    value.trim().length >= minimum &&
    value.trim().length <= maximum
  );
}

function wordCount(value) {
  return typeof value === "string"
    ? value.trim().split(/\s+/u).filter(Boolean).length
    : 0;
}

function issue(path, message, next) {
  return { path, message, next };
}

function validateText(errors, value, path, options = {}) {
  const { minimum = 1, maximum = Infinity, label = "text" } = options;
  if (!isText(value, minimum, maximum)) {
    errors.push(
      issue(
        path,
        `Expected ${label} between ${minimum} and ${maximum === Infinity ? "any" : maximum} characters.`,
        `Replace ${path} with a concise, non-empty string.`,
      ),
    );
    return false;
  }
  return true;
}

function validateSlug(value, path, label, errors) {
  if (!isText(value) || !SLUG.test(value)) {
    errors.push(issue(path, `Expected a lowercase hyphenated ${label}.`, `Use a value such as \"memory-gate\" at ${path}.`));
    return false;
  }
  return true;
}

function validateEvidenceRefs(refs, path, evidenceIds, errors) {
  if (!Array.isArray(refs)) {
    errors.push(issue(path, "Expected an array of evidence IDs.", "Reference evidence defined in the root evidence array."));
    return;
  }
  refs.forEach((id, index) => {
    if (!evidenceIds.has(id)) {
      errors.push(issue(`${path}[${index}]`, `Unknown evidence ID \"${String(id)}\".`, "Define this ID in the root evidence array or remove the reference."));
    }
  });
}

function directedGraphHasCycle(nodes, edges) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return false;
  const nodeIds = new Set(nodes.filter(isObject).map((node) => node.id));
  const outgoing = new Map(Array.from(nodeIds, (id) => [id, []]));
  edges.forEach((edge) => {
    if (isObject(edge) && nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      outgoing.get(edge.from).push(edge.to);
    }
  });
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const found = outgoing.get(id).some(visit);
    visiting.delete(id);
    visited.add(id);
    return found;
  }
  return Array.from(nodeIds).some(visit);
}

function disconnectedNodeIds(nodes, edges) {
  if (!Array.isArray(nodes) || nodes.length < 2 || !Array.isArray(edges) || edges.length === 0) return [];
  const nodeIds = nodes.filter(isObject).map((node) => node.id);
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  edges.forEach((edge) => {
    if (!isObject(edge) || !neighbors.has(edge.from) || !neighbors.has(edge.to)) return;
    neighbors.get(edge.from).add(edge.to);
    neighbors.get(edge.to).add(edge.from);
  });
  const reached = new Set();
  const queue = nodeIds.length ? [nodeIds[0]] : [];
  while (queue.length) {
    const id = queue.shift();
    if (reached.has(id)) continue;
    reached.add(id);
    neighbors.get(id).forEach((neighbor) => queue.push(neighbor));
  }
  return nodeIds.filter((id) => !reached.has(id));
}

function validateNode(node, path, errors, warnings, ids, options = {}) {
  if (!isObject(node)) {
    errors.push(issue(path, "Expected a diagram node object.", `Add an object with id, label, and optional detail at ${path}.`));
    return;
  }

  if (validateSlug(node.id, `${path}.id`, "node ID", errors)) {
    if (ids.has(node.id)) {
      errors.push(issue(`${path}.id`, `Duplicate node ID \"${node.id}\".`, "Give every node in this visual a unique ID."));
    } else {
      ids.add(node.id);
    }
  }

  if (validateText(errors, node.label, `${path}.label`, { maximum: 50, label: "a short node label" }) && node.label.trim().length > 28) {
    warnings.push(issue(`${path}.label`, "This label may wrap tightly in the diagram.", "Shorten the label to roughly 28 characters when possible."));
  }

  if (node.detail !== undefined) {
    validateText(errors, node.detail, `${path}.detail`, { maximum: 120, label: "a node detail" });
  }

  if (node.value !== undefined && (typeof node.value !== "number" || !Number.isFinite(node.value) || node.value < 0)) {
    errors.push(issue(`${path}.value`, "Expected a finite number greater than or equal to zero.", "Use a real or explicitly illustrative chart value."));
  }

  if (node.sceneId !== undefined) {
    if (validateSlug(node.sceneId, `${path}.sceneId`, "scene ID", errors) && options.sceneIds && !options.sceneIds.has(node.sceneId)) {
      errors.push(issue(`${path}.sceneId`, `Unknown scene ID \"${node.sceneId}\".`, "Point this overview node to one of the lesson's scene IDs."));
    }
  } else if (options.requireSceneLink) {
    errors.push(issue(`${path}.sceneId`, "Every overview node needs a sceneId.", "Map this overview node to the scene it summarizes."));
  }
}

function validateVisual(visual, path, evidenceIds, errors, warnings, options = {}) {
  if (!isObject(visual)) {
    errors.push(issue(path, "Expected a visual model object.", "Add a visual type, 2–8 nodes, edges, and a short learner-facing purpose."));
    return null;
  }

  if (options.requireMetadata) {
    validateSlug(visual.id, `${path}.id`, "visual ID", errors);
    validateText(errors, visual.title, `${path}.title`, { minimum: 2, maximum: 80, label: "a visual title" });
    validateText(errors, visual.caption, `${path}.caption`, { minimum: 3, maximum: 220, label: "a visual caption" });
  } else {
    if (visual.id !== undefined) validateSlug(visual.id, `${path}.id`, "visual ID", errors);
    if (visual.title !== undefined) validateText(errors, visual.title, `${path}.title`, { minimum: 2, maximum: 80, label: "a visual title" });
    if (visual.caption !== undefined) validateText(errors, visual.caption, `${path}.caption`, { minimum: 3, maximum: 220, label: "a visual caption" });
  }

  if (!VISUAL_TYPES.includes(visual.type)) {
    errors.push(issue(`${path}.type`, `Unknown visual type \"${String(visual.type)}\".`, `Use one of: ${VISUAL_TYPES.join(", ")}.`));
  }

  const nodes = visual.nodes;
  const nodeIds = new Set();
  if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 8) {
    errors.push(issue(`${path}.nodes`, "Expected between 2 and 8 diagram nodes.", "Split a crowded model into another coordinated view, or add enough nodes to show a relationship."));
  } else {
    nodes.forEach((node, nodeIndex) => validateNode(node, `${path}.nodes[${nodeIndex}]`, errors, warnings, nodeIds, options));
  }

  const edges = visual.edges;
  if (!Array.isArray(edges)) {
    errors.push(issue(`${path}.edges`, "Expected an array of diagram edges.", "Add real relationships; use an empty array only for comparison or quantitative charts."));
  } else {
    if (!EDGE_OPTIONAL_TYPES.has(visual.type) && edges.length < 1) {
      errors.push(issue(`${path}.edges`, "This visual needs at least one causal or relational edge.", "Connect nodes with from and to IDs."));
    }
    edges.forEach((edge, edgeIndex) => {
      const edgePath = `${path}.edges[${edgeIndex}]`;
      if (!isObject(edge)) {
        errors.push(issue(edgePath, "Expected an edge object.", `Add from and to node IDs at ${edgePath}.`));
        return;
      }
      if (!nodeIds.has(edge.from)) {
        errors.push(issue(`${edgePath}.from`, `Unknown source node \"${String(edge.from)}\".`, "Use an ID from this visual's nodes array."));
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(issue(`${edgePath}.to`, `Unknown destination node \"${String(edge.to)}\".`, "Use an ID from this visual's nodes array."));
      }
      if (edge.from && edge.from === edge.to) {
        warnings.push(issue(edgePath, "This edge loops back to the same node.", "Keep it only if the self-loop teaches a real retry or recurrence."));
      }
      if (edge.label !== undefined) {
        validateText(errors, edge.label, `${edgePath}.label`, { maximum: 60, label: "an edge label" });
      } else if (LABELED_EDGE_TYPES.has(visual.type)) {
        warnings.push(issue(`${edgePath}.label`, "This directed relationship has no learner-facing label.", "Name the movement, message, transition, containment, or relationship shown by this arrow."));
      }
    });

    const disconnected = disconnectedNodeIds(nodes, edges);
    if (!EDGE_OPTIONAL_TYPES.has(visual.type) && disconnected.length > 0) {
      errors.push(issue(`${path}.edges`, `Disconnected node${disconnected.length === 1 ? "" : "s"}: ${disconnected.join(", ")}.`, "Connect every node to the mechanism or move unrelated material into another view."));
    }

    const hasCycle = directedGraphHasCycle(nodes, edges);
    if (visual.type === "cycle" && !hasCycle) {
      errors.push(issue(`${path}.edges`, "A cycle view needs a real directed return path.", "Add an edge that returns to an earlier state, or use flow/timeline when nothing repeats."));
    } else if (visual.type === "flow" && hasCycle) {
      warnings.push(issue(`${path}.type`, "This flow contains a directed return path that can render as a backwards crossing.", "Use type \"cycle\" for a real loop, or remove the return edge from the one-way flow."));
    }
  }

  if (visual.type === "comparison") {
    if (visual.comparisonDimension === undefined) {
      warnings.push(issue(`${path}.comparisonDimension`, "The comparison does not name the shared dimension being compared.", "Add a short comparisonDimension such as \"where code inherits access\" so the cards form one readable contrast."));
    } else {
      validateText(errors, visual.comparisonDimension, `${path}.comparisonDimension`, { minimum: 3, maximum: 120, label: "a shared comparison dimension" });
    }
  }

  if (visual.activeNodeIds !== undefined) {
    if (!Array.isArray(visual.activeNodeIds)) {
      errors.push(issue(`${path}.activeNodeIds`, "Expected an array of node IDs.", "List the nodes that carry the traveler or current mechanism."));
    } else {
      visual.activeNodeIds.forEach((id, activeIndex) => {
        if (!nodeIds.has(id)) {
          errors.push(issue(`${path}.activeNodeIds[${activeIndex}]`, `Unknown active node \"${String(id)}\".`, "Use an ID from this visual's nodes array."));
        }
      });
    }
  }

  if (visual.evidenceIds !== undefined) {
    validateEvidenceRefs(visual.evidenceIds, `${path}.evidenceIds`, evidenceIds, errors);
  }

  if (CHART_TYPES.has(visual.type)) {
    if (!Array.isArray(nodes) || nodes.some((node) => !isObject(node) || typeof node.value !== "number" || !Number.isFinite(node.value) || node.value < 0)) {
      errors.push(issue(`${path}.nodes`, `Every ${visual.type} chart node needs a non-negative numeric value.`, "Add value to each node; do not invent quantities to decorate the lesson."));
    } else if (nodes.every((node) => node.value === 0)) {
      errors.push(issue(`${path}.nodes`, `A ${visual.type} chart cannot contain only zero values.`, "Use at least one positive value or choose a non-quantitative visual type."));
    }
    if (!CHART_DATA_STATES.has(visual.dataStatus)) {
      errors.push(issue(`${path}.dataStatus`, "A quantitative chart must say whether its values are verified or illustrative.", "Set dataStatus to verified or illustrative."));
    }
    validateText(errors, visual.chartNote, `${path}.chartNote`, { minimum: 3, maximum: 220, label: "a chart provenance note" });
    if (visual.dataStatus === "verified" && (!Array.isArray(visual.evidenceIds) || visual.evidenceIds.length < 1)) {
      errors.push(issue(`${path}.evidenceIds`, "A verified chart needs at least one evidence reference.", "Cite the source that supports the chart values."));
    }
  }

  return { nodeIds };
}

function validateScene(scene, index, version, evidenceIds, errors, warnings, sceneIds) {
  const path = `scenes[${index}]`;
  if (!isObject(scene)) {
    errors.push(issue(path, "Expected a scene object.", `Replace ${path} with a complete scene object.`));
    return;
  }

  if (validateSlug(scene.id, `${path}.id`, "scene ID", errors)) {
    if (sceneIds.has(scene.id)) {
      errors.push(issue(`${path}.id`, `Duplicate scene ID \"${scene.id}\".`, "Give every scene a unique ID."));
    } else {
      sceneIds.add(scene.id);
    }
  }

  validateText(errors, scene.title, `${path}.title`, { minimum: 2, maximum: 80, label: "a scene title" });
  if (validateText(errors, scene.question, `${path}.question`, { minimum: 3, maximum: 180, label: "Koko's question" }) && wordCount(scene.question) > 20) {
    warnings.push(issue(`${path}.question`, "Koko's question is longer than the intended conversational rhythm.", "Shorten it to about 16 words without removing the learner's real confusion."));
  }
  validateText(errors, scene.simpleAnswer, `${path}.simpleAnswer`, { minimum: 3, maximum: 360, label: "Michi's plain answer" });
  validateText(errors, scene.technicalAnswer, `${path}.technicalAnswer`, { minimum: 3, maximum: 700, label: "the exact mechanism" });
  if (scene.caveat !== undefined) {
    validateText(errors, scene.caveat, `${path}.caveat`, { minimum: 3, maximum: 500, label: "a caveat" });
  }
  validateText(errors, scene.takeaway, `${path}.takeaway`, { minimum: 3, maximum: 180, label: "a scene takeaway" });

  if (version === 1) {
    validateVisual(scene.visual, `${path}.visual`, evidenceIds, errors, warnings);
  } else {
    if (scene.visual !== undefined) {
      errors.push(issue(`${path}.visual`, "Version 2 uses visuals, not the singular visual field.", `Move ${path}.visual into ${path}.visuals and add the visual metadata.`));
    }
    if (!Array.isArray(scene.visuals) || scene.visuals.length < 1 || scene.visuals.length > 3) {
      errors.push(issue(`${path}.visuals`, "Expected between 1 and 3 coordinated visual views.", "Add named views that answer distinct learner questions without repeating the same picture."));
    } else {
      const visualIds = new Set();
      scene.visuals.forEach((visual, visualIndex) => {
        const visualPath = `${path}.visuals[${visualIndex}]`;
        validateVisual(visual, visualPath, evidenceIds, errors, warnings, { requireMetadata: true });
        if (isObject(visual) && isText(visual.id)) {
          if (visualIds.has(visual.id)) {
            errors.push(issue(`${visualPath}.id`, `Duplicate visual ID \"${visual.id}\" in this scene.`, "Give every coordinated view a unique ID."));
          }
          visualIds.add(visual.id);
        }
      });
    }
  }

  validateEvidenceRefs(scene.evidenceIds, `${path}.evidenceIds`, evidenceIds, errors);
}

export function validateSpec(spec) {
  const errors = [];
  const warnings = [];

  if (!isObject(spec)) {
    return {
      errors: [issue("root", "Expected one JSON object at the document root.", "Wrap the lesson fields in a JSON object.")],
      warnings,
    };
  }

  if (spec.version !== 1 && spec.version !== 2) {
    errors.push(issue("version", `Unsupported lesson version \"${String(spec.version)}\".`, "Set version to 2 for multi-view lessons or 1 for a legacy single-view lesson."));
  }
  validateText(errors, spec.title, "title", { minimum: 3, maximum: 120, label: "a lesson title" });
  validateText(errors, spec.summary, "summary", { minimum: 3, maximum: 260, label: "a lesson summary" });
  if (spec.audience !== undefined) {
    validateText(errors, spec.audience, "audience", { maximum: 100, label: "an audience description" });
  }
  if (!STYLE_IDS.includes(spec.style)) {
    errors.push(issue("style", `Unknown style \"${String(spec.style)}\".`, `Use one of: ${STYLE_IDS.join(", ")}.`));
  }

  if (!isObject(spec.traveler)) {
    errors.push(issue("traveler", "Expected one concrete traveler object.", "Add traveler.name and traveler.label so the learner can follow one thing end to end."));
  } else {
    validateSlug(spec.traveler.name, "traveler.name", "traveler ID", errors);
    validateText(errors, spec.traveler.label, "traveler.label", { minimum: 2, maximum: 100, label: "a learner-facing traveler label" });
  }

  if (!isObject(spec.truthLadder)) {
    errors.push(issue("truthLadder", "Expected analogy, mechanism, and caveat truth layers.", "Add a truthLadder object with all three strings."));
  } else {
    validateText(errors, spec.truthLadder.analogy, "truthLadder.analogy", { minimum: 3, maximum: 500, label: "an analogy" });
    validateText(errors, spec.truthLadder.mechanism, "truthLadder.mechanism", { minimum: 3, maximum: 900, label: "the actual mechanism" });
    validateText(errors, spec.truthLadder.caveat, "truthLadder.caveat", { minimum: 3, maximum: 700, label: "an important caveat" });
  }

  const evidenceIds = new Set();
  if (!Array.isArray(spec.evidence)) {
    errors.push(issue("evidence", "Expected an evidence array.", "Add evidence objects with verified, inferred, or analogy status."));
  } else {
    if (spec.evidence.length === 0 && spec.fictional !== true) {
      errors.push(issue("evidence", "A factual lesson cannot have an empty evidence ledger.", "Add supporting items and label uncertainty, or set fictional to true for an invented lesson."));
    }
    spec.evidence.forEach((item, index) => {
      const path = `evidence[${index}]`;
      if (!isObject(item)) {
        errors.push(issue(path, "Expected an evidence object.", `Add id, status, label, and note at ${path}.`));
        return;
      }
      if (validateSlug(item.id, `${path}.id`, "evidence ID", errors)) {
        if (evidenceIds.has(item.id)) {
          errors.push(issue(`${path}.id`, `Duplicate evidence ID \"${item.id}\".`, "Give every evidence item a unique ID."));
        } else {
          evidenceIds.add(item.id);
        }
      }
      if (!EVIDENCE_STATES.includes(item.status)) {
        errors.push(issue(`${path}.status`, `Unknown evidence status \"${String(item.status)}\".`, `Use one of: ${EVIDENCE_STATES.join(", ")}.`));
      }
      validateText(errors, item.label, `${path}.label`, { minimum: 2, maximum: 140, label: "an evidence label" });
      validateText(errors, item.note, `${path}.note`, { minimum: 3, maximum: 500, label: "an evidence note" });
      if (item.url !== undefined && (typeof item.url !== "string" || !/^https?:\/\//iu.test(item.url))) {
        errors.push(issue(`${path}.url`, "Expected an absolute HTTP or HTTPS URL.", "Use a direct source URL or remove the url field and provide a precise source note."));
      }
      if (item.status === "verified" && item.url === undefined && isText(item.note) && !/user|supplied|file|inspected|source/iu.test(item.note)) {
        warnings.push(issue(path, "This verified item has no URL or obvious source locator.", "Add a direct URL or name the supplied or inspected source precisely in note."));
      }
    });
  }

  const sceneIds = new Set();
  if (!Array.isArray(spec.scenes) || spec.scenes.length < 3 || spec.scenes.length > 7) {
    errors.push(issue("scenes", "Expected between 3 and 7 scenes.", "Use a short causal sequence; split long lessons into another explainer."));
  } else {
    spec.scenes.forEach((scene, index) => validateScene(scene, index, spec.version, evidenceIds, errors, warnings, sceneIds));
  }

  if (spec.version === 2) {
    if (isObject(spec.overview) && !OVERVIEW_TYPES.has(spec.overview.type)) {
      errors.push(issue("overview.type", `The whole-journey overview cannot use "${String(spec.overview.type)}".`, `Use one of: ${Array.from(OVERVIEW_TYPES).join(", ")}. Keep sequence and quantitative charts as scene views.`));
    }
    const overviewResult = validateVisual(spec.overview, "overview", evidenceIds, errors, warnings, {
      requireMetadata: true,
      requireSceneLink: true,
      sceneIds,
    });
    if (overviewResult && Array.isArray(spec.overview?.nodes)) {
      const mappedSceneIds = spec.overview.nodes.map((node) => node.sceneId).filter(Boolean);
      const mappedScenes = new Set(mappedSceneIds);
      sceneIds.forEach((sceneId) => {
        if (!mappedScenes.has(sceneId)) {
          errors.push(issue("overview.nodes", `The overview does not map scene \"${sceneId}\".`, "Represent every scene once in the whole-journey overview."));
        }
      });
      mappedScenes.forEach((sceneId) => {
        const count = mappedSceneIds.filter((candidate) => candidate === sceneId).length;
        if (count > 1) {
          errors.push(issue("overview.nodes", `The overview maps scene \"${sceneId}\" ${count} times.`, "Use exactly one overview node for each scene so the journey has one stable stage per question."));
        }
      });
    }

    if (Array.isArray(spec.scenes)) {
      const visualCount = spec.scenes.reduce((sum, scene) => sum + (Array.isArray(scene?.visuals) ? scene.visuals.length : 0), 0);
      if (visualCount < spec.scenes.length + 2) {
        warnings.push(issue("scenes[*].visuals", "This v2 lesson has little visual variety beyond one view per scene.", "Add a second view only where it reveals another mechanism, boundary, sequence, or honest chart."));
      }
    }
  }

  if (!Array.isArray(spec.teachBack) || spec.teachBack.length < 2 || spec.teachBack.length > 4) {
    errors.push(issue("teachBack", "Expected between 2 and 4 teach-back questions.", "Add causal questions that check understanding rather than vocabulary recall."));
  } else {
    spec.teachBack.forEach((item, index) => {
      const path = `teachBack[${index}]`;
      if (!isObject(item)) {
        errors.push(issue(path, "Expected a teach-back question object.", `Add question, options, correctIndex, and explanation at ${path}.`));
        return;
      }
      validateText(errors, item.question, `${path}.question`, { minimum: 3, maximum: 220, label: "a teach-back question" });
      if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4) {
        errors.push(issue(`${path}.options`, "Expected between 2 and 4 answer options.", "Add distinct learner-facing choices."));
      } else {
        const options = new Set();
        item.options.forEach((option, optionIndex) => {
          if (validateText(errors, option, `${path}.options[${optionIndex}]`, { minimum: 1, maximum: 220, label: "an answer option" })) {
            const normalized = option.trim().toLocaleLowerCase("en-US");
            if (options.has(normalized)) {
              errors.push(issue(`${path}.options[${optionIndex}]`, "Duplicate answer option.", "Use choices that test different causal models."));
            }
            options.add(normalized);
          }
        });
      }
      if (!Number.isInteger(item.correctIndex) || !Array.isArray(item.options) || item.correctIndex < 0 || item.correctIndex >= item.options.length) {
        errors.push(issue(`${path}.correctIndex`, "The correct answer index does not point to an option.", "Use a zero-based index within the options array."));
      }
      validateText(errors, item.explanation, `${path}.explanation`, { minimum: 3, maximum: 500, label: "a corrective explanation" });
    });
  }

  return { errors, warnings };
}

export async function readSpec(path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Could not read lesson spec at ${path}: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Could not parse JSON in ${path}: ${error.message}`);
  }
}

export function formatIssues(kind, issues, sourcePath) {
  const heading = `${kind} (${issues.length})${sourcePath ? ` in ${sourcePath}` : ""}`;
  const lines = issues.flatMap((item) => [
    `- ${item.path}: ${item.message}`,
    `  Next: ${item.next}`,
  ]);
  return [heading, ...lines].join("\n");
}

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("No lesson spec provided.\nNext: node validate.mjs <lesson.json>");
    process.exitCode = 2;
    return;
  }

  let spec;
  try {
    spec = await readSpec(resolve(sourcePath));
  } catch (error) {
    console.error(`${error.message}\nNext: confirm the path and fix the JSON syntax, then run validation again.`);
    process.exitCode = 2;
    return;
  }

  const result = validateSpec(spec);
  if (result.errors.length > 0) {
    console.error(formatIssues("Lesson spec errors", result.errors, resolve(sourcePath)));
    process.exitCode = 1;
    return;
  }

  const visualCount = spec.scenes.reduce((sum, scene) => sum + (Array.isArray(scene.visuals) ? scene.visuals.length : 1), 0);
  console.log(`Miko lesson spec valid: v${spec.version}, ${spec.scenes.length} scenes, ${visualCount} scene views, ${spec.evidence.length} evidence items, ${spec.teachBack.length} teach-back questions.`);
  if (result.warnings.length > 0) {
    console.warn(formatIssues("Lesson spec warnings", result.warnings, resolve(sourcePath)));
  }
}

const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  await main();
}
