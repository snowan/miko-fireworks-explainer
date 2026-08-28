#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSpec } from "./validate.mjs";

const REQUIRED_IDS = [
  "lesson-card",
  "scene-nav",
  "overview-diagram",
  "overview-mobile",
  "visual-nav",
  "visual-counter",
  "visual-legend",
  "visual-caption",
  "route-explanation",
  "koko-question",
  "michi-answer",
  "diagram",
  "mobile-visual",
  "previous-scene",
  "next-scene",
  "play-toggle",
  "replay",
  "teach-back",
  "quiz-list",
  "evidence-ledger",
  "character-art-data",
  "lesson-data",
];

function addIssue(issues, check, message, next) {
  issues.push({ check, message, next });
}

function parseEmbeddedSpec(html, issues) {
  const match = html.match(/<script id="lesson-data" type="application\/json">([\s\S]*?)<\/script>/u);
  if (!match) {
    addIssue(issues, "embedded-spec", "The lesson JSON block is missing.", "Render the artifact again with the current renderer.");
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    addIssue(issues, "embedded-spec", `The embedded lesson JSON is invalid: ${error.message}`, "Fix JSON escaping in the renderer before delivering this artifact.");
    return null;
  }
}

export function checkHtml(html) {
  const errors = [];
  const warnings = [];
  const visibleHtml = html.replace(/<script\b[\s\S]*?<\/script>/giu, "");

  if (!/^<!doctype html>/iu.test(html.trimStart())) {
    addIssue(errors, "doctype", "The output does not start with an HTML5 doctype.", "Render a complete HTML document.");
  }
  if (!html.includes('data-miko-fireworks="1"')) {
    addIssue(errors, "identity", "The Miko Fireworks artifact marker is missing.", "Render with scripts/render.mjs instead of a generic HTML template.");
  }
  if (!html.includes("data:image/png;base64,")) {
    addIssue(errors, "offline-art", "The selected character art is not embedded.", "Ensure the configured PNG can be read and rendered as a data URI.");
  }
  if (/<script\b[^>]*\bsrc\s*=/iu.test(html) || /<link\b[^>]*\bhref\s*=/iu.test(html)) {
    addIssue(errors, "offline-runtime", "The artifact references an external script or stylesheet.", "Bundle all runtime JavaScript and CSS inline.");
  }
  if (/<(?:iframe|object|embed)\b/iu.test(html)) {
    addIssue(errors, "embedded-content", "The artifact embeds an external browsing context or object.", "Remove iframe, object, or embed elements.");
  }
  if (/\b(?:file:\/\/|\/Users\/|\.\.\/assets\/)/u.test(html)) {
    addIssue(errors, "local-path", "The artifact contains an unresolved local file path.", "Embed the asset or replace the path with learner-facing source text.");
  }
  if (/\b(?:TODO|FIXME|undefined)\b/u.test(visibleHtml)) {
    addIssue(errors, "placeholders", "The artifact contains a placeholder or undefined value.", "Resolve every placeholder before delivery.");
  }
  if (!html.includes("prefers-reduced-motion")) {
    addIssue(errors, "reduced-motion", "The artifact does not declare a reduced-motion experience.", "Add a prefers-reduced-motion rule and disable timed auto-advance when it matches.");
  }
  if (!html.includes('data-edge-from') || !html.includes('data-edge-to')) {
    addIssue(errors, "auditable-routes", "Rendered relationships do not expose their source and destination IDs.", "Render each arrow with data-edge-from and data-edge-to so browser QA can detect routes through unrelated nodes.");
  }
  if (!html.includes("__mikoDiagramAudit") || !html.includes("data-diagram-audit")) {
    addIssue(errors, "diagram-audit", "The browser geometry audit is missing.", "Embed the diagram audit so every view can report node overlaps, route crossings, labels, and traveler attachment.");
  }
  if (!html.includes("mobile-branches") || !html.includes("mobile-transition-list")) {
    addIssue(errors, "mobile-semantics", "The mobile renderer does not preserve branches and explicit transitions.", "Render branch outcomes and transition lists instead of flattening every diagram into unrelated cards.");
  }
  if (/arrows show cause or movement/iu.test(visibleHtml)) {
    addIssue(errors, "false-legend", "The diagram uses a generic arrow legend that may contradict the selected view.", "Describe the selected view's actual semantics, such as comparison, messages, state transitions, or containment.");
  }
  if (!html.includes("Koko, the curious brown tabby student") || !html.includes("Michi, the warm calico cat sensei")) {
    addIssue(errors, "character-identity", "The accessible character identities are incomplete.", "Label Koko as the brown tabby student and Michi as the calico sensei.");
  }
  if (!html.includes("--michi-portrait-size:") || !html.includes("--koko-portrait-size:")) {
    addIssue(errors, "full-character-portraits", "The responsive Michi and Koko portrait framing is missing.", "Render both dialogue portraits from complete character-art regions at every viewport size.");
  }
  if (/\b(?:board-figure|board-caption|image-selection)\b/iu.test(visibleHtml) || /Selected from the supplied Michi/iu.test(visibleHtml)) {
    addIssue(errors, "learner-facing-selection", "The learner-facing artifact exposes an internal character-art selection panel.", "Keep reference boards internal and show only the complete dialogue portraits.");
  }

  const idMatches = Array.from(html.matchAll(/\sid="([^"]+)"/gu), function (match) { return match[1]; });
  const idCounts = new Map();
  idMatches.forEach(function (id) { idCounts.set(id, (idCounts.get(id) || 0) + 1); });
  idCounts.forEach(function (count, id) {
    if (count > 1) {
      addIssue(errors, "unique-ids", `The HTML ID \"${id}\" appears ${count} times.`, "Use each document ID once so controls and accessible labels resolve correctly.");
    }
  });
  REQUIRED_IDS.forEach(function (id) {
    if (!idCounts.has(id)) {
      addIssue(errors, "required-controls", `Required element #${id} is missing.`, "Render with the complete interactive shell.");
    }
  });

  const spec = parseEmbeddedSpec(html, errors);
  if (spec) {
    const validation = validateSpec(spec);
    validation.errors.forEach(function (item) {
      addIssue(errors, "embedded-spec", `${item.path}: ${item.message}`, item.next);
    });
    validation.warnings.forEach(function (item) {
      addIssue(warnings, "embedded-spec", `${item.path}: ${item.message}`, item.next);
    });

    if (spec.scenes && html.match(/setTimeout\(/gu)?.length < 1) {
      addIssue(errors, "auto-advance", "The scene timer is missing.", "Keep timed advance with an explicit Pause/Play control.");
    }
  }

  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/u)?.[1];
  if (!csp) {
    addIssue(warnings, "csp", "No Content Security Policy was found.", "Add a CSP that permits only the embedded image, style, and script.");
  } else if (!csp.includes("default-src 'none'")) {
    addIssue(warnings, "csp", "The Content Security Policy does not fail closed by default.", "Start the policy with default-src 'none'.");
  }

  return { errors, warnings, spec };
}

export function formatCheckIssues(kind, issues, sourcePath) {
  const lines = [`${kind} (${issues.length}) in ${sourcePath}`];
  issues.forEach(function (item) {
    lines.push(`- ${item.check}: ${item.message}`);
    lines.push(`  Next: ${item.next}`);
  });
  return lines.join("\n");
}

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("No rendered artifact provided.\nNext: node check-html.mjs <lesson.html>");
    process.exitCode = 2;
    return;
  }

  const absolutePath = resolve(sourcePath);
  let html;
  try {
    html = await readFile(absolutePath, "utf8");
  } catch (error) {
    console.error(`Could not read rendered artifact at ${absolutePath}: ${error.message}\nNext: confirm the path, then run the check again.`);
    process.exitCode = 2;
    return;
  }

  const result = checkHtml(html);
  if (result.errors.length > 0) {
    console.error(formatCheckIssues("Rendered HTML errors", result.errors, absolutePath));
    process.exitCode = 1;
    return;
  }

  const sceneCount = result.spec?.scenes?.length || 0;
  const viewCount = result.spec?.scenes?.reduce((sum, scene) => sum + (Array.isArray(scene.visuals) ? scene.visuals.length : 1), 0) || 0;
  console.log(`Rendered HTML valid: ${sceneCount} interactive scenes, ${viewCount} scene views, a journey overview, embedded character art, offline runtime, and required controls present.`);
  if (result.warnings.length > 0) {
    console.warn(formatCheckIssues("Rendered HTML warnings", result.warnings, absolutePath));
  }
}

const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  await main();
}
