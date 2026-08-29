#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatIssues, readSpec, validateSpec } from "./validate.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export const STYLE_CONFIG = Object.freeze({
  minimal: {
    label: "Clean minimal",
    asset: "minimal.png",
    paper: "#f7f3e8",
    surface: "#fffdf7",
    ink: "#24231f",
    muted: "#6f6a5f",
    accent: "#df624b",
    accent2: "#3c8a91",
    highlight: "#f3c75d",
    michiPortrait: { x: 30, y: 25, size: 255 },
    kokoPortrait: { x: 290, y: 25, size: 255 },
    brandPortrait: { x: 510, y: 35, size: 285 },
  },
  "daily-chibi": {
    label: "Everyday chibi",
    asset: "daily-chibi.png",
    paper: "#f7eee4",
    surface: "#fffaf4",
    ink: "#3d2f2a",
    muted: "#77635b",
    accent: "#d96b4b",
    accent2: "#65966d",
    highlight: "#f2c85c",
    michiPortrait: { x: 20, y: 20, size: 270 },
    kokoPortrait: { x: 285, y: 25, size: 285 },
    brandPortrait: { x: 755, y: 30, size: 269 },
  },
  "retro-manga": {
    label: "Retro manga",
    asset: "retro-manga.png",
    paper: "#fff2d2",
    surface: "#fffaf0",
    ink: "#1f1d1a",
    muted: "#665f55",
    accent: "#e6533f",
    accent2: "#4969c6",
    highlight: "#f2c540",
    michiPortrait: { x: 15, y: 20, size: 250 },
    kokoPortrait: { x: 215, y: 20, size: 250 },
    brandPortrait: { x: 20, y: 605, size: 300 },
  },
  "magical-festival": {
    label: "Magical festival",
    asset: "magical-festival.png",
    paper: "#fff0f5",
    surface: "#fff9fc",
    ink: "#34243e",
    muted: "#765e7d",
    accent: "#8b55c6",
    accent2: "#319e91",
    highlight: "#f4bd4c",
    michiPortrait: { x: 0, y: 10, size: 320 },
    kokoPortrait: { x: 290, y: 10, size: 310 },
    brandPortrait: { x: 690, y: 1245, size: 290 },
  },
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

async function imageDataUri(style, assetRoot = resolve(SCRIPT_DIR, "../assets/characters")) {
  const config = STYLE_CONFIG[style];
  const assetPath = resolve(assetRoot, config.asset);
  let bytes;
  try {
    bytes = await readFile(assetPath);
  } catch (error) {
    throw new Error(`Could not read the ${config.label} character board at ${assetPath}: ${error.message}`);
  }
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function portraitCss(crop) {
  const boardWidth = 1024;
  const boardHeight = 1536;
  const size = (boardWidth / crop.size) * 100;
  const x = (crop.x / (boardWidth - crop.size)) * 100;
  const y = (crop.y / (boardHeight - crop.size)) * 100;
  return {
    size: `${size.toFixed(3)}% auto`,
    position: `${x.toFixed(3)}% ${y.toFixed(3)}%`,
  };
}

function clientRuntime() {
  "use strict";

  const lesson = JSON.parse(document.getElementById("lesson-data").textContent);
  const characterArtData = document.getElementById("character-art-data").textContent.trim();
  const characterArtBase64 = characterArtData.slice(characterArtData.indexOf(",") + 1);
  const characterArtBinary = window.atob(characterArtBase64);
  const characterArtBytes = new Uint8Array(characterArtBinary.length);
  for (let byteIndex = 0; byteIndex < characterArtBinary.length; byteIndex += 1) {
    characterArtBytes[byteIndex] = characterArtBinary.charCodeAt(byteIndex);
  }
  const characterArtUrl = URL.createObjectURL(new Blob([characterArtBytes], { type: "image/png" }));
  document.documentElement.style.setProperty("--character-art", 'url("' + characterArtUrl + '")');
  window.addEventListener("pagehide", function () { URL.revokeObjectURL(characterArtUrl); }, { once: true });
  const svgNS = "http://www.w3.org/2000/svg";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = {
    scene: 0,
    visual: 0,
    playing: !reducedMotion,
    truth: "simple",
    timer: null,
    answers: new Map(),
  };

  const elements = {
    lessonCard: document.getElementById("lesson-card"),
    nav: document.getElementById("scene-nav"),
    visualNav: document.getElementById("visual-nav"),
    visualCounter: document.getElementById("visual-counter"),
    visualCaption: document.getElementById("visual-caption"),
    visualLegend: document.getElementById("visual-legend"),
    routeExplanation: document.getElementById("route-explanation"),
    counter: document.getElementById("scene-counter"),
    sceneTitle: document.getElementById("scene-title"),
    visualType: document.getElementById("visual-type"),
    question: document.getElementById("koko-question"),
    answer: document.getElementById("michi-answer"),
    answerMode: document.getElementById("answer-mode"),
    takeaway: document.getElementById("takeaway"),
    evidence: document.getElementById("scene-evidence"),
    diagram: document.getElementById("diagram"),
    mobileVisual: document.getElementById("mobile-visual"),
    overviewDiagram: document.getElementById("overview-diagram"),
    overviewMobile: document.getElementById("overview-mobile"),
    progress: document.getElementById("progress-fill"),
    prev: document.getElementById("previous-scene"),
    next: document.getElementById("next-scene"),
    play: document.getElementById("play-toggle"),
    replay: document.getElementById("replay"),
    quiz: document.getElementById("quiz-list"),
    quizScore: document.getElementById("quiz-score"),
    evidenceLedger: document.getElementById("evidence-ledger"),
    live: document.getElementById("lesson-live"),
  };

  function makeSvg(tag, attributes, text) {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], String(entry[1]));
    });
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function splitLabel(value, maxLength) {
    const words = String(value).trim().split(/\s+/u);
    const lines = [];
    let line = "";
    words.forEach(function (word) {
      const proposed = line ? line + " " + word : word;
      if (proposed.length > maxLength && line) {
        lines.push(line);
        line = word;
      } else {
        line = proposed;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function visualsFor(scene) {
    if (Array.isArray(scene.visuals)) return scene.visuals;
    return [Object.assign({
      id: scene.id + "-visual",
      title: scene.title,
      caption: scene.takeaway,
    }, scene.visual)];
  }

  function overviewForLesson() {
    if (lesson.overview) return lesson.overview;
    const nodes = lesson.scenes.map(function (scene) {
      return { id: "overview-" + scene.id, sceneId: scene.id, label: scene.title, detail: scene.question };
    });
    return {
      id: "auto-overview",
      title: "The whole journey",
      caption: "Choose any stage to jump into the lesson.",
      type: "flow",
      nodes: nodes,
      edges: nodes.slice(0, -1).map(function (node, index) {
        return { from: node.id, to: nodes[index + 1].id, label: "next" };
      }),
    };
  }

  function nodeMetrics(type, index, count) {
    if (type === "layers") return { width: 300, height: 66, radius: 20 };
    if (type === "funnel") return { width: Math.max(175, 430 - index * (255 / Math.max(1, count - 1))), height: 62, radius: 18 };
    if (type === "comparison") return { width: 300, height: 154, radius: 25 };
    if (type === "graph") return { width: 178, height: 92, radius: 22 };
    return { width: 170, height: 108, radius: 24 };
  }

  function positionsFor(type, count) {
    if (type === "cycle") {
      const radiusX = count > 5 ? 280 : 245;
      const radiusY = count > 5 ? 150 : 142;
      return Array.from({ length: count }, function (_, index) {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
        return { x: 450 + Math.cos(angle) * radiusX, y: 220 + Math.sin(angle) * radiusY };
      });
    }

    if (type === "layers" || type === "funnel") {
      const gap = count === 1 ? 0 : 315 / (count - 1);
      return Array.from({ length: count }, function (_, index) {
        return { x: 450, y: 62 + gap * index };
      });
    }

    if (type === "comparison") {
      const leftCount = Math.ceil(count / 2);
      const rightCount = count - leftCount;
      const points = [];
      for (let i = 0; i < leftCount; i += 1) {
        points.push({ x: 225, y: leftCount === 1 ? 220 : 116 + (208 * i) / (leftCount - 1) });
      }
      for (let i = 0; i < rightCount; i += 1) {
        points.push({ x: 675, y: rightCount === 1 ? 220 : 116 + (208 * i) / (rightCount - 1) });
      }
      return points;
    }

    if (type === "graph") {
      if (count > 8) return positionsFor("cycle", count);
      const presets = [
        { x: 105, y: 220 },
        { x: 325, y: 220 },
        { x: 545, y: 105 },
        { x: 545, y: 335 },
        { x: 790, y: 220 },
        { x: 325, y: 80 },
        { x: 325, y: 360 },
        { x: 790, y: 80 },
      ];
      return presets.slice(0, count);
    }

    const gap = count === 1 ? 0 : 690 / (count - 1);
    return Array.from({ length: count }, function (_, index) {
      return { x: 105 + gap * index, y: type === "timeline" ? 230 : 220 };
    });
  }

  function positionsForVisual(visual) {
    const fallback = positionsFor(visual.type, visual.nodes.length);
    if (visual.type === "graph") {
      const outgoing = new Map();
      visual.edges.forEach(function (edge) {
        if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
        outgoing.get(edge.from).push(edge.to);
      });
      const hub = visual.nodes.find(function (node) { return (outgoing.get(node.id) || []).length >= 3; });
      if (hub) {
        const targetIds = new Set(outgoing.get(hub.id));
        const targets = visual.nodes.filter(function (node) { return targetIds.has(node.id); });
        const remaining = visual.nodes.filter(function (node) { return node.id !== hub.id && !targetIds.has(node.id); });
        if (!remaining.length && targets.length === visual.nodes.length - 1) {
          const byId = new Map([[hub.id, { x: 210, y: 220 }]]);
          targets.forEach(function (node, index) {
            const y = targets.length === 1 ? 220 : 66 + (308 * index) / Math.max(1, targets.length - 1);
            byId.set(node.id, { x: 675, y: y });
          });
          return visual.nodes.map(function (node) { return byId.get(node.id); });
        }
      }
      return fallback;
    }
    if (visual.type !== "flow" && visual.type !== "timeline") return fallback;

    const outgoing = new Map();
    visual.edges.forEach(function (edge) {
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from).push(edge.to);
    });
    const branch = visual.nodes.find(function (node) {
      const targets = outgoing.get(node.id) || [];
      return targets.length >= 2 && targets.length <= 3;
    });
    if (!branch) return fallback;

    const targetIds = new Set(outgoing.get(branch.id));
    const before = visual.nodes.filter(function (node) { return node.id !== branch.id && !targetIds.has(node.id); });
    const targets = visual.nodes.filter(function (node) { return targetIds.has(node.id); });
    if (!before.length || before.length + targets.length + 1 !== visual.nodes.length) return fallback;

    const byId = new Map();
    before.forEach(function (node, index) {
      const x = before.length === 1 ? 120 : 90 + (240 * index) / Math.max(1, before.length - 1);
      byId.set(node.id, { x: x, y: 220 });
    });
    byId.set(branch.id, { x: 390, y: 220 });
    targets.forEach(function (node, index) {
      const gap = targets.length === 2 ? 190 : 125;
      byId.set(node.id, { x: 700, y: 220 + (index - (targets.length - 1) / 2) * gap });
    });
    return visual.nodes.map(function (node) { return byId.get(node.id); });
  }

  function boundaryPoint(from, to, metrics) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return { x: from.x, y: from.y };
    const xScale = dx === 0 ? Number.POSITIVE_INFINITY : (metrics.width / 2) / Math.abs(dx);
    const yScale = dy === 0 ? Number.POSITIVE_INFINITY : (metrics.height / 2) / Math.abs(dy);
    const scale = Math.min(xScale, yScale);
    return { x: from.x + dx * scale, y: from.y + dy * scale };
  }

  function addMarker(svg, markerId) {
    const defs = makeSvg("defs");
    const marker = makeSvg("marker", {
      id: markerId,
      markerWidth: 10,
      markerHeight: 10,
      refX: 8,
      refY: 3,
      orient: "auto",
      markerUnits: "strokeWidth",
    });
    marker.appendChild(makeSvg("path", { d: "M0,0 L0,6 L9,3 z", class: "arrow-head" }));
    defs.appendChild(marker);
    svg.appendChild(defs);
  }

  function addTraveler(layer, pathData, midpoint) {
    const traveler = makeSvg("circle", { class: "traveler-dot", r: 8, "aria-hidden": "true" });
    if (state.playing && !reducedMotion) {
      traveler.appendChild(makeSvg("animateMotion", {
        dur: "2.7s",
        repeatCount: "indefinite",
        path: pathData,
      }));
    } else {
      traveler.setAttribute("cx", midpoint.x);
      traveler.setAttribute("cy", midpoint.y);
    }
    layer.appendChild(traveler);
  }

  function nodeJourneyClass(node) {
    if (!node.sceneId) return "";
    const linkedIndex = lesson.scenes.findIndex(function (scene) { return scene.id === node.sceneId; });
    if (linkedIndex < 0) return "";
    if (linkedIndex < state.scene) return " visited";
    if (linkedIndex > state.scene) return " upcoming";
    return " current";
  }

  function boxesOverlap(first, second, padding) {
    const gap = padding || 0;
    return first.left < second.right + gap && first.right > second.left - gap && first.top < second.bottom + gap && first.bottom > second.top - gap;
  }

  function labelBox(candidate, text) {
    const width = Math.max(28, String(text).length * 7.1);
    let left = candidate.x - width / 2;
    if (candidate.anchor === "start") left = candidate.x;
    if (candidate.anchor === "end") left = candidate.x - width;
    return { left: left, right: left + width, top: candidate.y - 13, bottom: candidate.y + 4 };
  }

  function edgeLabelPlacement(edge, start, end, source, destination, byId, occupiedLabels, type) {
    const middleX = (start.x + end.x) / 2;
    const middleY = (start.y + end.y) / 2;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const perpendicular = { x: -dy / length, y: dx / length };
    const sourceTop = source.point.y - source.metrics.height / 2;
    const destinationTop = destination.point.y - destination.metrics.height / 2;
    const candidates = [];

    if (Math.abs(dx) >= Math.abs(dy) * 3) {
      candidates.push({ x: middleX, y: Math.min(sourceTop, destinationTop) - 18, anchor: "middle" });
      candidates.push({ x: middleX, y: Math.max(source.point.y + source.metrics.height / 2, destination.point.y + destination.metrics.height / 2) + 29, anchor: "middle" });
    } else if (Math.abs(dy) >= Math.abs(dx) * 3) {
      const outsideNodes = type === "layers" || type === "funnel";
      const right = outsideNodes
        ? Math.max(source.point.x + source.metrics.width / 2, destination.point.x + destination.metrics.width / 2) + 18
        : Math.max(start.x, end.x) + 18;
      const left = outsideNodes
        ? Math.min(source.point.x - source.metrics.width / 2, destination.point.x - destination.metrics.width / 2) - 18
        : Math.min(start.x, end.x) - 18;
      candidates.push({ x: right, y: middleY + 4, anchor: "start" });
      candidates.push({ x: left, y: middleY + 4, anchor: "end" });
    }

    [28, -28, 46, -46].forEach(function (offset) {
      candidates.push({ x: middleX + perpendicular.x * offset, y: middleY + perpendicular.y * offset + 4, anchor: "middle" });
    });
    candidates.push({ x: middleX, y: middleY - 48, anchor: "middle" });
    candidates.push({ x: middleX, y: middleY + 52, anchor: "middle" });

    const nodeBoxes = Array.from(byId.values()).map(function (entry) {
      return {
        left: entry.point.x - entry.metrics.width / 2,
        right: entry.point.x + entry.metrics.width / 2,
        top: entry.point.y - entry.metrics.height / 2,
        bottom: entry.point.y + entry.metrics.height / 2,
      };
    });
    const selected = candidates.find(function (candidate) {
      const box = labelBox(candidate, edge.label);
      const inBounds = box.left >= 8 && box.right <= 892 && box.top >= 8 && box.bottom <= 432;
      return inBounds && !nodeBoxes.some(function (nodeBox) { return boxesOverlap(box, nodeBox, 5); }) && !occupiedLabels.some(function (other) { return boxesOverlap(box, other, 4); });
    }) || candidates[0] || { x: middleX, y: middleY - 10, anchor: "middle" };
    occupiedLabels.push(labelBox(selected, edge.label));
    return selected;
  }

  function edgeRoute(visual, edge, start, end) {
    if (visual.type === "cycle") {
      const middleX = (start.x + end.x) / 2;
      const middleY = (start.y + end.y) / 2;
      const reciprocal = visual.edges.some(function (candidate) { return candidate.from === edge.to && candidate.to === edge.from; });
      const distance = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
      const controlX = reciprocal
        ? middleX - ((end.y - start.y) / distance) * 62
        : 450 + (middleX - 450) * 1.28;
      const controlY = reciprocal
        ? middleY + ((end.x - start.x) / distance) * 62
        : 220 + (middleY - 220) * 1.28;
      const travelerAmount = 0.84;
      return {
        path: "M " + start.x + " " + start.y + " Q " + controlX + " " + controlY + " " + end.x + " " + end.y,
        labelStart: start,
        labelEnd: end,
        midpoint: {
          x: (1 - travelerAmount) * (1 - travelerAmount) * start.x + 2 * (1 - travelerAmount) * travelerAmount * controlX + travelerAmount * travelerAmount * end.x,
          y: (1 - travelerAmount) * (1 - travelerAmount) * start.y + 2 * (1 - travelerAmount) * travelerAmount * controlY + travelerAmount * travelerAmount * end.y,
        },
      };
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx < -80) {
      const laneY = Math.min(start.y, end.y) < 150 ? 410 : 28;
      return {
        path: "M " + start.x + " " + start.y + " L " + start.x + " " + laneY + " L " + end.x + " " + laneY + " L " + end.x + " " + end.y,
        labelStart: { x: start.x, y: laneY },
        labelEnd: { x: end.x, y: laneY },
        midpoint: { x: start.x + (end.x - start.x) * 0.72, y: laneY },
      };
    }

    if (Math.abs(dx) > 110 && Math.abs(dy) > 34) {
      const elbowX = start.x + dx * 0.52;
      return {
        path: "M " + start.x + " " + start.y + " L " + elbowX + " " + start.y + " L " + elbowX + " " + end.y + " L " + end.x + " " + end.y,
        labelStart: { x: elbowX, y: start.y },
        labelEnd: { x: elbowX, y: end.y },
        midpoint: { x: elbowX + (end.x - elbowX) * 0.72, y: end.y },
      };
    }

    return {
      path: "M " + start.x + " " + start.y + " L " + end.x + " " + end.y,
      labelStart: start,
      labelEnd: end,
      midpoint: { x: start.x + (end.x - start.x) * 0.72, y: start.y + (end.y - start.y) * 0.72 },
    };
  }

  function renderNetworkSvg(svg, visual, markerId, options) {
    const positions = positionsForVisual(visual);
    const byId = new Map();
    visual.nodes.forEach(function (node, index) {
      byId.set(node.id, {
        node: node,
        point: positions[index],
        metrics: nodeMetrics(visual.type, index, visual.nodes.length),
      });
    });

    const activeIds = new Set(visual.activeNodeIds || []);
    let travelerEdgeIndex = visual.edges.findIndex(function (edge) { return activeIds.has(edge.from); });
    if (travelerEdgeIndex < 0) travelerEdgeIndex = visual.edges.findIndex(function (edge) { return activeIds.has(edge.to); });
    if (travelerEdgeIndex < 0 && visual.edges.length) travelerEdgeIndex = 0;

    const edgeLayer = makeSvg("g", { class: "edge-layer" });
    const occupiedLabels = [];
    let travelerRoute = null;
    visual.edges.forEach(function (edge, edgeIndex) {
      const source = byId.get(edge.from);
      const destination = byId.get(edge.to);
      if (!source || !destination) return;
      const start = boundaryPoint(source.point, destination.point, source.metrics);
      const end = boundaryPoint(destination.point, source.point, destination.metrics);
      const route = edgeRoute(visual, edge, start, end);
      const pathData = route.path;
      const activeRoute = edgeIndex === travelerEdgeIndex;
      edgeLayer.appendChild(makeSvg("path", {
        d: pathData,
        class: "diagram-edge edge-" + (edgeIndex % 3) + (activeRoute ? " active-route" : ""),
        "marker-end": "url(#" + markerId + ")",
        "data-edge-from": edge.from,
        "data-edge-to": edge.to,
      }));
      if (edge.label) {
        const labelPoint = edgeLabelPlacement(edge, route.labelStart, route.labelEnd, source, destination, byId, occupiedLabels, visual.type);
        edgeLayer.appendChild(makeSvg("text", { x: labelPoint.x, y: labelPoint.y, class: "edge-label", "text-anchor": labelPoint.anchor }, edge.label));
      }
      if (activeRoute) {
        travelerRoute = { path: pathData, midpoint: route.midpoint };
      }
    });
    if (travelerRoute) addTraveler(edgeLayer, travelerRoute.path, travelerRoute.midpoint);
    svg.appendChild(edgeLayer);

    const nodeLayer = makeSvg("g", { class: "node-layer" });
    visual.nodes.forEach(function (node, index) {
      const point = positions[index];
      const metrics = nodeMetrics(visual.type, index, visual.nodes.length);
      const clickable = Boolean(options && options.onNode && node.sceneId);
      const group = makeSvg("g", {
        class: "diagram-node" + (activeIds.has(node.id) ? " active" : "") + nodeJourneyClass(node) + (clickable ? " clickable" : ""),
        transform: "translate(" + point.x + " " + point.y + ")",
        tabindex: "0",
        role: clickable ? "button" : "img",
        "aria-label": node.label + (node.detail ? ": " + node.detail : ""),
      });
      group.appendChild(makeSvg("title", {}, node.label + (node.detail ? ": " + node.detail : "")));
      group.appendChild(makeSvg("rect", {
        x: -metrics.width / 2,
        y: -metrics.height / 2,
        width: metrics.width,
        height: metrics.height,
        rx: metrics.radius,
        class: "node-shape",
      }));

      const label = makeSvg("text", { class: "node-label", "text-anchor": "middle" });
      const maxLabel = visual.type === "layers" ? 34 : visual.type === "funnel" ? 28 : 18;
      const labelLines = splitLabel(node.label, visual.type === "comparison" ? 34 : maxLabel).slice(0, 3);
      const detailMax = visual.type === "comparison" ? 42 : visual.type === "layers" ? 44 : visual.type === "funnel" ? 34 : visual.type === "graph" ? 25 : 26;
      const detailLimit = visual.type === "comparison" ? 4 : visual.type === "layers" || visual.type === "funnel" ? 2 : 3;
      const detailLines = node.detail ? splitLabel(node.detail, detailMax).slice(0, detailLimit) : [];
      const labelHeight = labelLines.length * 17;
      const detailHeight = detailLines.length * 14;
      const totalTextHeight = labelHeight + (detailLines.length ? 11 + detailHeight : 0);
      const textTop = -totalTextHeight / 2;
      labelLines.forEach(function (line, lineIndex) {
        label.appendChild(makeSvg("tspan", { x: 0, y: textTop + 13 + lineIndex * 17 }, line));
      });
      group.appendChild(label);

      if (node.detail) {
        const detail = makeSvg("text", { class: "node-detail", "text-anchor": "middle" });
        const detailStart = textTop + labelHeight + 19;
        detailLines.forEach(function (line, lineIndex) {
          detail.appendChild(makeSvg("tspan", { x: 0, y: detailStart + lineIndex * 14 }, line));
        });
        group.appendChild(detail);
      }

      if (clickable) {
        group.addEventListener("click", function () { options.onNode(node); });
        group.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            options.onNode(node);
          }
        });
      }
      nodeLayer.appendChild(group);
    });
    svg.appendChild(nodeLayer);
  }

  function renderSequenceSvg(svg, visual, markerId) {
    const activeIds = new Set(visual.activeNodeIds || []);
    const gap = visual.nodes.length === 1 ? 0 : 700 / (visual.nodes.length - 1);
    const actorById = new Map();
    const actorLayer = makeSvg("g", { class: "sequence-actors" });
    visual.nodes.forEach(function (node, index) {
      const x = 100 + gap * index;
      actorById.set(node.id, { x: x, node: node });
      actorLayer.appendChild(makeSvg("line", { x1: x, y1: 105, x2: x, y2: 405, class: "sequence-lifeline" }));
      const group = makeSvg("g", { class: "diagram-node sequence-actor" + (activeIds.has(node.id) ? " active" : ""), transform: "translate(" + x + " 65)" });
      group.appendChild(makeSvg("rect", { x: -72, y: -32, width: 144, height: 64, rx: 18, class: "node-shape" }));
      const label = makeSvg("text", { class: "node-label", "text-anchor": "middle" });
      splitLabel(node.label, 16).slice(0, 2).forEach(function (line, lineIndex) {
        label.appendChild(makeSvg("tspan", { x: 0, y: -4 + lineIndex * 17 }, line));
      });
      group.appendChild(label);
      actorLayer.appendChild(group);
    });
    svg.appendChild(actorLayer);

    let travelerEdgeIndex = visual.edges.findIndex(function (edge) { return activeIds.has(edge.from); });
    if (travelerEdgeIndex < 0) travelerEdgeIndex = visual.edges.findIndex(function (edge) { return activeIds.has(edge.to); });
    if (travelerEdgeIndex < 0 && visual.edges.length) travelerEdgeIndex = 0;
    const messageLayer = makeSvg("g", { class: "sequence-messages" });
    const eventGap = Math.min(68, 250 / Math.max(1, visual.edges.length - 1));
    visual.edges.forEach(function (edge, index) {
      const source = actorById.get(edge.from);
      const destination = actorById.get(edge.to);
      if (!source || !destination) return;
      const y = 145 + eventGap * index;
      const direction = destination.x >= source.x ? 1 : -1;
      const startX = source.x + 12 * direction;
      const endX = destination.x - 12 * direction;
      const pathData = "M " + startX + " " + y + " L " + endX + " " + y;
      const activeRoute = index === travelerEdgeIndex;
      messageLayer.appendChild(makeSvg("path", {
        d: pathData,
        class: "diagram-edge edge-" + (index % 3) + (activeRoute ? " active-route" : ""),
        "marker-end": "url(#" + markerId + ")",
        "data-edge-from": edge.from,
        "data-edge-to": edge.to,
      }));
      messageLayer.appendChild(makeSvg("text", { x: (startX + endX) / 2, y: y - 10, class: "edge-label", "text-anchor": "middle" }, edge.label || "message"));
      if (activeRoute) addTraveler(messageLayer, pathData, { x: startX + (endX - startX) * 0.84, y: y });
    });
    svg.appendChild(messageLayer);
  }

  function renderBarSvg(svg, visual) {
    const activeIds = new Set(visual.activeNodeIds || []);
    const maxValue = Math.max(1, ...visual.nodes.map(function (node) { return Number(node.value) || 0; }));
    const gap = Math.min(105, 320 / Math.max(1, visual.nodes.length - 1));
    visual.nodes.forEach(function (node, index) {
      const value = Number(node.value) || 0;
      const y = 95 + gap * index;
      const width = (value / maxValue) * 520;
      const group = makeSvg("g", { class: "chart-row" + (activeIds.has(node.id) ? " active" : "") });
      group.appendChild(makeSvg("title", {}, node.label + ": " + value + (node.detail ? ". " + node.detail : "")));
      group.appendChild(makeSvg("text", { x: 225, y: y + 5, class: "chart-label", "text-anchor": "end" }, node.label));
      group.appendChild(makeSvg("rect", { x: 245, y: y - 18, width: 540, height: 36, rx: 12, class: "chart-track" }));
      group.appendChild(makeSvg("rect", { x: 245, y: y - 18, width: Math.max(4, width), height: 36, rx: 12, class: "chart-bar bar-" + (index % 4) }));
      group.appendChild(makeSvg("text", { x: Math.min(825, 260 + width), y: y + 5, class: "chart-value" }, String(value)));
      svg.appendChild(group);
    });
  }

  function renderDonutSvg(svg, visual) {
    const values = visual.nodes.map(function (node) { return Math.max(0, Number(node.value) || 0); });
    const rawTotal = values.reduce(function (sum, value) { return sum + value; }, 0);
    const total = rawTotal || visual.nodes.length || 1;
    let offset = 0;
    const donut = makeSvg("g", { class: "donut-chart", transform: "rotate(-90 280 220)" });
    donut.appendChild(makeSvg("circle", { cx: 280, cy: 220, r: 112, pathLength: 100, class: "donut-track" }));
    visual.nodes.forEach(function (node, index) {
      const value = rawTotal ? values[index] : 1;
      const percent = (value / total) * 100;
      donut.appendChild(makeSvg("circle", {
        cx: 280,
        cy: 220,
        r: 112,
        pathLength: 100,
        class: "donut-segment segment-" + (index % 5),
        "stroke-dasharray": percent + " " + (100 - percent),
        "stroke-dashoffset": -offset,
      }));
      offset += percent;
    });
    svg.appendChild(donut);
    svg.appendChild(makeSvg("text", { x: 280, y: 214, class: "donut-center", "text-anchor": "middle" }, String(rawTotal)));
    svg.appendChild(makeSvg("text", { x: 280, y: 238, class: "donut-caption", "text-anchor": "middle" }, "total"));
    visual.nodes.forEach(function (node, index) {
      const y = 112 + index * 58;
      const value = values[index];
      const percent = rawTotal ? Math.round((value / rawTotal) * 100) : 0;
      svg.appendChild(makeSvg("rect", { x: 500, y: y - 14, width: 18, height: 18, rx: 5, class: "legend-swatch segment-" + (index % 5) }));
      svg.appendChild(makeSvg("text", { x: 530, y: y, class: "chart-label" }, node.label));
      svg.appendChild(makeSvg("text", { x: 805, y: y, class: "chart-value", "text-anchor": "end" }, value + " · " + percent + "%"));
    });
  }

  function renderVisualToSvg(svg, visual, options) {
    svg.replaceChildren();
    const titleId = svg.id + "-title";
    svg.appendChild(makeSvg("title", { id: titleId }, visual.title + ": " + visual.caption));
    svg.setAttribute("aria-labelledby", titleId);
    const markerId = svg.id + "-arrowhead";
    addMarker(svg, markerId);
    if (visual.type === "sequence") {
      renderSequenceSvg(svg, visual, markerId);
    } else if (visual.type === "bar") {
      renderBarSvg(svg, visual);
    } else if (visual.type === "donut") {
      renderDonutSvg(svg, visual);
    } else {
      renderNetworkSvg(svg, visual, markerId, options);
    }
  }

  function mobileStatusClass(node) {
    return nodeJourneyClass(node).trim();
  }

  function mobileNodeCard(node, index, activeIds, options) {
    const clickable = Boolean(options && options.onNode && node.sceneId);
    const card = document.createElement(clickable ? "button" : "article");
    if (clickable) card.type = "button";
    card.className = "mobile-node " + mobileStatusClass(node) + (activeIds.has(node.id) ? " active" : "");
    const number = document.createElement("span");
    number.className = "mobile-step-number";
    number.textContent = String(index + 1);
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = node.label;
    copy.appendChild(label);
    if (node.detail) {
      const detail = document.createElement("small");
      detail.textContent = node.detail;
      copy.appendChild(detail);
    }
    card.append(number, copy);
    if (clickable) card.addEventListener("click", function () { options.onNode(node); });
    return card;
  }

  function mobileConnector(label, suffix) {
    const connector = document.createElement("div");
    connector.className = "mobile-connector";
    connector.setAttribute("aria-label", (label || "next") + (suffix ? " " + suffix : ""));
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↓";
    const copy = document.createElement("strong");
    copy.textContent = label || "next";
    connector.append(arrow, copy);
    return connector;
  }

  function simpleBranch(visual) {
    const outgoing = new Map();
    visual.edges.forEach(function (edge) {
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from).push(edge.to);
    });
    const branch = visual.nodes.find(function (node) {
      const targets = outgoing.get(node.id) || [];
      return targets.length >= 2 && targets.length <= 4;
    });
    if (!branch) return null;
    const targetIds = new Set(outgoing.get(branch.id));
    const before = visual.nodes.filter(function (node) { return node.id !== branch.id && !targetIds.has(node.id); });
    const targets = visual.nodes.filter(function (node) { return targetIds.has(node.id); });
    if (before.length + targets.length + 1 !== visual.nodes.length) return null;
    return { branch: branch, before: before, targets: targets };
  }

  function mobileTransitions(visual) {
    const byId = new Map(visual.nodes.map(function (node) { return [node.id, node]; }));
    const transitions = document.createElement("div");
    transitions.className = "mobile-transition-list";
    visual.edges.forEach(function (edge) {
      const source = byId.get(edge.from);
      const destination = byId.get(edge.to);
      if (!source || !destination) return;
      const row = document.createElement("article");
      row.className = "mobile-transition";
      const from = document.createElement("strong");
      from.textContent = source.label;
      const relation = document.createElement("span");
      relation.textContent = "—" + (edge.label || "next") + "→";
      const to = document.createElement("strong");
      to.textContent = destination.label;
      row.append(from, relation, to);
      transitions.appendChild(row);
    });
    return transitions;
  }

  function renderMobileVisual(container, visual, options) {
    container.replaceChildren();
    const activeIds = new Set(visual.activeNodeIds || []);
    if (visual.type === "bar" || visual.type === "donut") {
      const maxValue = Math.max(1, ...visual.nodes.map(function (node) { return Number(node.value) || 0; }));
      visual.nodes.forEach(function (node, index) {
        const row = document.createElement("article");
        row.className = "mobile-chart-row" + (activeIds.has(node.id) ? " active" : "");
        const top = document.createElement("div");
        top.className = "mobile-chart-top";
        const label = document.createElement("strong");
        label.textContent = node.label;
        const value = document.createElement("span");
        value.textContent = String(Number(node.value) || 0);
        top.append(label, value);
        const track = document.createElement("div");
        track.className = "mobile-chart-track";
        const fill = document.createElement("span");
        fill.className = "mobile-chart-fill bar-" + (index % 4);
        fill.style.width = ((Number(node.value) || 0) / maxValue) * 100 + "%";
        track.appendChild(fill);
        row.append(top, track);
        if (node.detail) {
          const detail = document.createElement("p");
          detail.textContent = node.detail;
          row.appendChild(detail);
        }
        container.appendChild(row);
      });
      return;
    }

    if (visual.type === "sequence") {
      const byId = new Map(visual.nodes.map(function (node) { return [node.id, node]; }));
      visual.edges.forEach(function (edge, index) {
        const source = byId.get(edge.from);
        const destination = byId.get(edge.to);
        if (!source || !destination) return;
        const step = document.createElement("article");
        step.className = "mobile-sequence-step";
        const number = document.createElement("span");
        number.className = "mobile-step-number";
        number.textContent = String(index + 1);
        const copy = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = source.label + " → " + destination.label;
        copy.appendChild(strong);
        copy.appendChild(document.createTextNode(edge.label ? " · " + edge.label : ""));
        step.append(number, copy);
        container.appendChild(step);
      });
      return;
    }

    if (visual.type === "comparison") {
      const dimension = document.createElement("p");
      dimension.className = "mobile-comparison-dimension";
      dimension.textContent = "Compare on: " + (visual.comparisonDimension || visual.caption);
      const grid = document.createElement("div");
      grid.className = "mobile-comparison-grid";
      visual.nodes.forEach(function (node, index) {
        grid.appendChild(mobileNodeCard(node, index, activeIds, options));
      });
      container.append(dimension, grid);
      return;
    }

    if (visual.type === "cycle") {
      const heading = document.createElement("p");
      heading.className = "mobile-comparison-dimension";
      heading.textContent = "Follow each labeled transition; return arrows show what can repeat.";
      container.append(heading, mobileTransitions(visual));
      return;
    }

    const branch = simpleBranch(visual);
    if (branch && (visual.type === "flow" || visual.type === "timeline" || visual.type === "graph")) {
      const flow = document.createElement("div");
      flow.className = "mobile-flow";
      branch.before.forEach(function (node, index) {
        flow.appendChild(mobileNodeCard(node, visual.nodes.indexOf(node), activeIds, options));
        const nextNode = branch.before[index + 1] || branch.branch;
        const edge = visual.edges.find(function (candidate) { return candidate.from === node.id && candidate.to === nextNode.id; });
        if (edge) flow.appendChild(mobileConnector(edge.label));
      });
      flow.appendChild(mobileNodeCard(branch.branch, visual.nodes.indexOf(branch.branch), activeIds, options));
      const branches = document.createElement("div");
      branches.className = "mobile-branches";
      branch.targets.forEach(function (node) {
        const edge = visual.edges.find(function (candidate) { return candidate.from === branch.branch.id && candidate.to === node.id; });
        const outcome = document.createElement("div");
        outcome.className = "mobile-branch";
        const label = document.createElement("strong");
        label.className = "mobile-branch-label";
        label.textContent = (edge && edge.label) || "outcome";
        outcome.append(label, mobileNodeCard(node, visual.nodes.indexOf(node), activeIds, options));
        branches.appendChild(outcome);
      });
      flow.appendChild(branches);
      container.appendChild(flow);
      return;
    }

    const flow = document.createElement("div");
    flow.className = "mobile-flow";
    let linearEdgeCount = 0;
    visual.nodes.forEach(function (node, index) {
      flow.appendChild(mobileNodeCard(node, index, activeIds, options));
      if (index >= visual.nodes.length - 1) return;
      const nextNode = visual.nodes[index + 1];
      const edge = visual.edges.find(function (candidate) { return candidate.from === node.id && candidate.to === nextNode.id; });
      if (edge) {
        linearEdgeCount += 1;
        flow.appendChild(mobileConnector(edge.label));
      }
    });
    container.appendChild(flow);
    if (linearEdgeCount !== visual.edges.length && visual.edges.length) {
      container.appendChild(mobileTransitions(visual));
    }
  }

  function jumpToSceneId(sceneId, shouldScroll) {
    const index = lesson.scenes.findIndex(function (scene) { return scene.id === sceneId; });
    if (index < 0) return;
    state.scene = index;
    state.visual = 0;
    state.truth = "simple";
    renderScene({ focus: true });
    if (shouldScroll) elements.lessonCard.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function renderOverviewDesktop(container, visual, options) {
    container.replaceChildren();
    container.setAttribute("aria-label", visual.title + ": " + visual.caption);
    const activeIds = new Set(visual.activeNodeIds || []);
    const activeIndex = visual.nodes.findIndex(function (node) { return activeIds.has(node.id); });
    const activeConnectorIndex = activeIndex === visual.nodes.length - 1 ? activeIndex - 1 : activeIndex;
    const track = document.createElement("div");
    track.className = "overview-flow-track";

    visual.nodes.forEach(function (node, index) {
      const stage = document.createElement("button");
      stage.type = "button";
      stage.className = "overview-stage " + nodeJourneyClass(node).trim();
      stage.setAttribute("aria-current", activeIds.has(node.id) ? "step" : "false");
      stage.setAttribute("aria-label", node.label + (node.detail ? ": " + node.detail : ""));

      const number = document.createElement("span");
      number.className = "overview-stage-number";
      number.textContent = String(index + 1);
      const copy = document.createElement("span");
      copy.className = "overview-stage-copy";
      const label = document.createElement("strong");
      label.textContent = node.label;
      copy.appendChild(label);
      if (node.detail) {
        const detail = document.createElement("small");
        detail.textContent = node.detail;
        copy.appendChild(detail);
      }
      stage.append(number, copy);
      stage.addEventListener("click", function () { options.onNode(node); });
      track.appendChild(stage);

      if (index >= visual.nodes.length - 1) return;
      const nextNode = visual.nodes[index + 1];
      const edge = visual.edges.find(function (candidate) {
        return candidate.from === node.id && candidate.to === nextNode.id;
      });
      const connector = document.createElement("div");
      connector.className = "overview-connector" + (index < state.scene ? " visited" : "") + (index === activeConnectorIndex ? " active" : "");
      connector.setAttribute("aria-hidden", "true");
      const edgeLabel = document.createElement("span");
      edgeLabel.className = "overview-connector-label";
      edgeLabel.textContent = edge?.label || "next";
      const line = document.createElement("span");
      line.className = "overview-connector-line";
      if (index === activeConnectorIndex) {
        const traveler = document.createElement("span");
        traveler.className = "overview-traveler";
        line.appendChild(traveler);
      }
      connector.append(edgeLabel, line);
      track.appendChild(connector);
    });
    container.appendChild(track);
  }

  function renderOverview() {
    const overview = overviewForLesson();
    const activeNode = overview.nodes.find(function (node) { return node.sceneId === lesson.scenes[state.scene].id; });
    const rendered = Object.assign({}, overview, { activeNodeIds: activeNode ? [activeNode.id] : [] });
    const options = { onNode: function (node) { jumpToSceneId(node.sceneId, true); } };
    renderOverviewDesktop(elements.overviewDiagram, rendered, options);
    renderMobileVisual(elements.overviewMobile, rendered, options);
  }

  function visualLegend(visual) {
    if (visual.type === "comparison") return "compare alternatives · no process flow";
    if (visual.type === "sequence") return "time moves downward · arrows are messages";
    if (visual.type === "timeline") return "arrows show state transitions and outcomes";
    if (visual.type === "cycle") return "arrows follow the loop and real return path";
    if (visual.type === "layers") return "top to bottom shows control or containment";
    if (visual.type === "graph") return "arrows show named relationships";
    if (visual.type === "funnel") return "arrows show each narrowing gate";
    if (visual.type === "bar" || visual.type === "donut") return "values show magnitude · read the provenance note";
    return "follow arrows from source to destination";
  }

  function routeExplanation(visual) {
    const byId = new Map(visual.nodes.map(function (node) { return [node.id, node]; }));
    if (visual.type === "comparison") {
      const details = visual.nodes.map(function (node) {
        return node.label + (node.detail ? ": " + node.detail : "");
      }).join("; ");
      return "Compare on: " + (visual.comparisonDimension || visual.caption) + ". " + details;
    }
    if (visual.type === "bar" || visual.type === "donut") {
      return visual.chartNote || visual.caption;
    }
    if (!visual.edges.length) return visual.caption;
    const prefix = visual.type === "sequence" ? "Messages: " : visual.type === "layers" ? "Relationship chain: " : "Route: ";
    return prefix + visual.edges.map(function (edge) {
      const source = byId.get(edge.from);
      const destination = byId.get(edge.to);
      if (!source || !destination) return "";
      return source.label + " —" + (edge.label || "next") + "→ " + destination.label;
    }).filter(Boolean).join("; ");
  }

  function samplePath(path) {
    const tokens = (path.getAttribute("d") || "").match(/[MLQ]|-?\d+(?:\.\d+)?/gu) || [];
    const points = [];
    let index = 0;
    let current = { x: 0, y: 0 };
    while (index < tokens.length) {
      const command = tokens[index];
      index += 1;
      if (command === "M") {
        current = { x: Number(tokens[index]), y: Number(tokens[index + 1]) };
        index += 2;
      } else if (command === "L") {
        const end = { x: Number(tokens[index]), y: Number(tokens[index + 1]) };
        index += 2;
        for (let step = 1; step <= 16; step += 1) {
          const amount = step / 16;
          points.push({ x: current.x + (end.x - current.x) * amount, y: current.y + (end.y - current.y) * amount });
        }
        current = end;
      } else if (command === "Q") {
        const control = { x: Number(tokens[index]), y: Number(tokens[index + 1]) };
        const end = { x: Number(tokens[index + 2]), y: Number(tokens[index + 3]) };
        index += 4;
        for (let step = 1; step <= 24; step += 1) {
          const amount = step / 24;
          points.push({
            x: (1 - amount) * (1 - amount) * current.x + 2 * (1 - amount) * amount * control.x + amount * amount * end.x,
            y: (1 - amount) * (1 - amount) * current.y + 2 * (1 - amount) * amount * control.y + amount * amount * end.y,
          });
        }
        current = end;
      } else {
        break;
      }
    }
    return points;
  }

  function auditRenderedDiagram(scene, visual) {
    const desktopGeometryVisible = window.getComputedStyle(elements.diagram).display !== "none";
    const groups = desktopGeometryVisible ? Array.from(elements.diagram.querySelectorAll(".diagram-node")) : [];
    const nodeRects = groups.map(function (group, index) {
      const match = (group.getAttribute("transform") || "").match(/translate\(([\d.-]+)[ ,]([\d.-]+)\)/u);
      const shape = group.querySelector("rect");
      const centerX = match ? Number(match[1]) : 0;
      const centerY = match ? Number(match[2]) : 0;
      const left = centerX + (shape ? Number(shape.getAttribute("x")) : -80);
      const top = centerY + (shape ? Number(shape.getAttribute("y")) : -44);
      const width = shape ? Number(shape.getAttribute("width")) : 160;
      const height = shape ? Number(shape.getAttribute("height")) : 88;
      return { id: visual.nodes[index] && visual.nodes[index].id, left: left, right: left + width, top: top, bottom: top + height };
    });
    const nodeOverlaps = [];
    nodeRects.forEach(function (first, firstIndex) {
      nodeRects.slice(firstIndex + 1).forEach(function (second) {
        if (boxesOverlap(first, second, 2)) nodeOverlaps.push(first.id + " / " + second.id);
      });
    });
    const edgeCrossings = [];
    (desktopGeometryVisible ? elements.diagram.querySelectorAll(".diagram-edge") : []).forEach(function (path) {
      const from = path.dataset.edgeFrom;
      const to = path.dataset.edgeTo;
      const samples = samplePath(path);
      const through = nodeRects.filter(function (rect) {
        return rect.id !== from && rect.id !== to && samples.some(function (point) {
          return point.x > rect.left + 2 && point.x < rect.right - 2 && point.y > rect.top + 2 && point.y < rect.bottom - 2;
        });
      }).map(function (rect) { return rect.id; });
      if (through.length) edgeCrossings.push(from + " → " + to + " through " + through.join(", "));
    });
    const labelRects = (desktopGeometryVisible ? Array.from(elements.diagram.querySelectorAll(".edge-label")) : []).map(function (label, index) {
      const box = label.getBBox();
      return { id: "label " + (index + 1) + " (" + label.textContent + ")", left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
    });
    const labelOverlaps = [];
    labelRects.forEach(function (label, labelIndex) {
      const nodesHit = nodeRects.filter(function (rect) { return boxesOverlap(label, rect, 3); }).map(function (rect) { return rect.id; });
      if (nodesHit.length) labelOverlaps.push(label.id + " over " + nodesHit.join(", "));
      labelRects.slice(labelIndex + 1).forEach(function (other) {
        if (boxesOverlap(label, other, 2)) labelOverlaps.push(label.id + " over " + other.id);
      });
    });
    const travelerDot = desktopGeometryVisible ? elements.diagram.querySelector(".traveler-dot") : null;
    const travelerX = travelerDot ? Number(travelerDot.getAttribute("cx")) : Number.NaN;
    const travelerY = travelerDot ? Number(travelerDot.getAttribute("cy")) : Number.NaN;
    const travelerRadius = travelerDot ? Number(travelerDot.getAttribute("r")) || 8 : 0;
    const travelerBounds = Number.isFinite(travelerX) && Number.isFinite(travelerY)
      ? { left: travelerX - travelerRadius, right: travelerX + travelerRadius, top: travelerY - travelerRadius, bottom: travelerY + travelerRadius }
      : null;
    const travelerLabelOverlaps = travelerBounds
      ? labelRects.filter(function (label) { return boxesOverlap(travelerBounds, label, 2); }).map(function (label) { return label.id; })
      : [];
    const overflowElements = Array.from(document.querySelectorAll("body *")).map(function (element) {
      const rect = element.getBoundingClientRect();
      return { element: element.tagName.toLowerCase() + (element.id ? "#" + element.id : "") + (element.classList.length ? "." + Array.from(element.classList).join(".") : ""), left: Math.round(rect.left), right: Math.round(rect.right) };
    }).filter(function (item) { return item.left < -1 || item.right > window.innerWidth + 1; }).slice(0, 12);
    const audit = {
      sceneId: scene.id,
      visualId: visual.id,
      type: visual.type,
      geometryChecked: desktopGeometryVisible,
      nodeOverlaps: nodeOverlaps,
      edgeCrossings: edgeCrossings,
      labelOverlaps: labelOverlaps,
      travelerLabelOverlaps: travelerLabelOverlaps,
      missingEdgeLabels: visual.edges.filter(function (edge) { return !edge.label; }).map(function (edge) { return edge.from + " → " + edge.to; }),
      travelerAttached: visual.edges.length === 0 || Boolean(elements.diagram.querySelector(".traveler-dot")),
      mobileRelationshipCount: elements.mobileVisual.querySelectorAll(".mobile-connector, .mobile-branch-label, .mobile-transition, .mobile-sequence-step").length,
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      overflowElements: overflowElements,
    };
    window.__mikoDiagramAudit = audit;
    elements.diagram.setAttribute("data-diagram-audit", JSON.stringify(audit));
    return audit;
  }

  function renderDiagram(scene, visual) {
    renderVisualToSvg(elements.diagram, visual);
    renderMobileVisual(elements.mobileVisual, visual);
    elements.visualLegend.textContent = visualLegend(visual);
    const explanation = routeExplanation(visual);
    const audit = auditRenderedDiagram(scene, visual);
    const geometryProblems = audit.nodeOverlaps.concat(audit.edgeCrossings, audit.labelOverlaps, audit.travelerLabelOverlaps);
    elements.routeExplanation.textContent = geometryProblems.length
      ? "Diagram needs repair before teaching: " + geometryProblems.join("; ") + ". " + explanation
      : explanation;
    elements.routeExplanation.classList.toggle("audit-failed", geometryProblems.length > 0);
    elements.visualCaption.className = "visual-caption" + (visual.dataStatus ? " " + visual.dataStatus : "");
    elements.visualCaption.textContent = visual.dataStatus
      ? (visual.dataStatus === "verified" ? "Verified data" : "Illustrative data") + " · " + visual.chartNote
      : visual.caption;
  }

  function evidenceItemById(id) {
    return lesson.evidence.find(function (item) { return item.id === id; });
  }

  function renderSceneEvidence(scene, visual) {
    elements.evidence.replaceChildren();
    const evidenceIds = Array.from(new Set([...(scene.evidenceIds || []), ...(visual.evidenceIds || [])]));
    if (!evidenceIds.length) {
      const empty = document.createElement("span");
      empty.className = "evidence-chip inferred";
      empty.textContent = "No external claim in this scene";
      elements.evidence.appendChild(empty);
      return;
    }
    evidenceIds.forEach(function (id) {
      const item = evidenceItemById(id);
      if (!item) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "evidence-chip " + item.status;
      chip.textContent = item.status + " · " + item.label;
      chip.title = item.note;
      chip.addEventListener("click", function () {
        const target = document.getElementById("evidence-" + item.id);
        if (target) target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      });
      elements.evidence.appendChild(chip);
    });
  }

  function answerFor(scene) {
    if (state.truth === "mechanism") return scene.technicalAnswer;
    if (state.truth === "caveat") return scene.caveat || lesson.truthLadder.caveat;
    return scene.simpleAnswer;
  }

  function truthLabel() {
    if (state.truth === "mechanism") return "Real mechanism";
    if (state.truth === "caveat") return "Important caveat";
    return "Easy picture";
  }

  function updateTruthTabs() {
    document.querySelectorAll("[data-truth]").forEach(function (button) {
      const selected = button.dataset.truth === state.truth;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }

  function updateNav() {
    elements.nav.querySelectorAll("button").forEach(function (button, index) {
      const selected = index === state.scene;
      button.classList.toggle("selected", selected);
      button.classList.toggle("visited", index < state.scene);
      button.setAttribute("aria-current", selected ? "step" : "false");
    });
  }

  function announce(scene, visual, visualCount) {
    elements.live.textContent = "Scene " + (state.scene + 1) + ", view " + (state.visual + 1) + " of " + visualCount + ": " + visual.title + ". Question: " + scene.question + " Answer: " + answerFor(scene);
  }

  function viewOrdinal() {
    let ordinal = state.visual;
    for (let index = 0; index < state.scene; index += 1) ordinal += visualsFor(lesson.scenes[index]).length;
    return ordinal;
  }

  function totalViews() {
    return lesson.scenes.reduce(function (sum, scene) { return sum + visualsFor(scene).length; }, 0);
  }

  function buildVisualNav(scene, visuals) {
    elements.visualNav.replaceChildren();
    visuals.forEach(function (visual, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === state.visual ? "selected" : "";
      button.setAttribute("aria-pressed", String(index === state.visual));
      const number = document.createElement("span");
      number.textContent = String(index + 1);
      const label = document.createElement("strong");
      label.textContent = visual.title;
      button.append(number, label);
      button.addEventListener("click", function () {
        state.visual = index;
        renderScene();
      });
      elements.visualNav.appendChild(button);
    });
  }

  function renderScene(options) {
    const scene = lesson.scenes[state.scene];
    const visuals = visualsFor(scene);
    state.visual = Math.min(state.visual, visuals.length - 1);
    const visual = visuals[state.visual];
    elements.counter.textContent = "Scene " + (state.scene + 1) + " of " + lesson.scenes.length;
    elements.visualCounter.textContent = "View " + (state.visual + 1) + " of " + visuals.length;
    elements.sceneTitle.textContent = scene.title;
    elements.visualType.textContent = visual.type + " view";
    elements.question.textContent = scene.question;
    elements.answer.textContent = answerFor(scene);
    elements.answerMode.textContent = truthLabel();
    elements.takeaway.textContent = scene.takeaway;
    elements.progress.style.width = ((viewOrdinal() + 1) / totalViews()) * 100 + "%";
    elements.prev.disabled = state.scene === 0;
    elements.next.textContent = state.scene === lesson.scenes.length - 1 ? "Start teach-back" : "Next question";
    elements.play.textContent = state.playing ? "Pause" : "Play";
    elements.play.setAttribute("aria-pressed", String(state.playing));
    document.body.classList.toggle("is-playing", state.playing);
    updateTruthTabs();
    updateNav();
    buildVisualNav(scene, visuals);
    renderOverview();
    renderDiagram(scene, visual);
    renderSceneEvidence(scene, visual);
    announce(scene, visual, visuals.length);
    scheduleAdvance();
    if (options && options.focus) elements.sceneTitle.focus();
  }

  function scheduleAdvance() {
    window.clearTimeout(state.timer);
    state.timer = null;
    if (!state.playing || reducedMotion) return;
    state.timer = window.setTimeout(function () {
      const visuals = visualsFor(lesson.scenes[state.scene]);
      if (state.visual < visuals.length - 1) {
        state.visual += 1;
        renderScene();
      } else if (state.scene < lesson.scenes.length - 1) {
        state.scene += 1;
        state.visual = 0;
        state.truth = "simple";
        renderScene();
      } else {
        state.playing = false;
        renderScene();
      }
    }, 7000);
  }

  function buildSceneNav() {
    lesson.scenes.forEach(function (scene, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = "<span class=\"nav-number\">" + (index + 1) + "</span><span></span>";
      button.lastElementChild.textContent = scene.question;
      button.addEventListener("click", function () {
        state.scene = index;
        state.visual = 0;
        state.truth = "simple";
        renderScene({ focus: true });
      });
      elements.nav.appendChild(button);
    });
  }

  function buildEvidenceLedger() {
    lesson.evidence.forEach(function (item) {
      const article = document.createElement("article");
      article.className = "ledger-item " + item.status;
      article.id = "evidence-" + item.id;

      const top = document.createElement("div");
      top.className = "ledger-top";
      const status = document.createElement("span");
      status.className = "status-dot";
      status.textContent = item.status;
      const title = document.createElement("h3");
      title.textContent = item.label;
      top.append(status, title);

      const note = document.createElement("p");
      note.textContent = item.note;
      article.append(top, note);

      if (item.url) {
        const link = document.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noreferrer noopener";
        link.textContent = "Open source ↗";
        article.appendChild(link);
      }
      elements.evidenceLedger.appendChild(article);
    });
  }

  function updateQuizScore() {
    const answered = state.answers.size;
    let correct = 0;
    state.answers.forEach(function (isCorrect) {
      if (isCorrect) correct += 1;
    });
    elements.quizScore.textContent = answered === 0
      ? "Not started"
      : correct + " correct · " + answered + " of " + lesson.teachBack.length + " answered";
  }

  function buildQuiz() {
    lesson.teachBack.forEach(function (item, questionIndex) {
      const article = document.createElement("article");
      article.className = "quiz-card";

      const heading = document.createElement("h3");
      heading.textContent = (questionIndex + 1) + ". " + item.question;
      article.appendChild(heading);

      const choices = document.createElement("div");
      choices.className = "quiz-options";
      choices.setAttribute("role", "group");
      choices.setAttribute("aria-label", item.question);
      const feedback = document.createElement("p");
      feedback.className = "quiz-feedback";
      feedback.setAttribute("aria-live", "polite");

      item.options.forEach(function (option, optionIndex) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option;
        button.addEventListener("click", function () {
          const correct = optionIndex === item.correctIndex;
          state.answers.set(questionIndex, correct);
          choices.querySelectorAll("button").forEach(function (candidate, candidateIndex) {
            candidate.classList.remove("correct", "incorrect");
            if (candidateIndex === item.correctIndex) candidate.classList.add("correct");
          });
          if (!correct) button.classList.add("incorrect");
          feedback.className = "quiz-feedback visible " + (correct ? "correct" : "incorrect");
          feedback.textContent = (correct ? "Yes. " : "Not quite. ") + item.explanation;
          updateQuizScore();
        });
        choices.appendChild(button);
      });

      article.append(choices, feedback);
      elements.quiz.appendChild(article);
    });
  }

  document.querySelectorAll("[data-truth]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.truth = button.dataset.truth;
      renderScene();
    });
  });

  elements.prev.addEventListener("click", function () {
    if (state.scene === 0) return;
    state.scene -= 1;
    state.visual = 0;
    state.truth = "simple";
    renderScene({ focus: true });
  });

  elements.next.addEventListener("click", function () {
    if (state.scene < lesson.scenes.length - 1) {
      state.scene += 1;
      state.visual = 0;
      state.truth = "simple";
      renderScene({ focus: true });
      return;
    }
    state.playing = false;
    renderScene();
    document.getElementById("teach-back").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    document.querySelector("#teach-back h2").focus();
  });

  elements.play.addEventListener("click", function () {
    state.playing = !state.playing;
    renderScene();
  });

  elements.replay.addEventListener("click", function () {
    state.scene = 0;
    state.visual = 0;
    state.truth = "simple";
    state.playing = !reducedMotion;
    elements.lessonCard.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    renderScene({ focus: true });
  });

  document.getElementById("print-lesson").addEventListener("click", function () {
    window.print();
  });

  document.getElementById("reset-quiz").addEventListener("click", function () {
    state.answers.clear();
    elements.quiz.querySelectorAll("button").forEach(function (button) {
      button.classList.remove("correct", "incorrect");
    });
    elements.quiz.querySelectorAll(".quiz-feedback").forEach(function (feedback) {
      feedback.className = "quiz-feedback";
      feedback.textContent = "";
    });
    updateQuizScore();
  });

  document.addEventListener("keydown", function (event) {
    const target = event.target;
    if (target && (target.matches("button, a, input, textarea, select") || target.isContentEditable)) return;
    if (event.key === "ArrowRight") {
      elements.next.click();
    } else if (event.key === "ArrowLeft") {
      elements.prev.click();
    } else if (event.key === " ") {
      event.preventDefault();
      elements.play.click();
    }
  });

  buildSceneNav();
  buildEvidenceLedger();
  buildQuiz();
  updateQuizScore();
  renderScene();
}

const CSS = String.raw`
  :root {
    --paper: #f7eee4;
    --surface: #fffaf4;
    --ink: #3d2f2a;
    --muted: #77635b;
    --accent: #d96b4b;
    --accent-2: #65966d;
    --highlight: #f2c85c;
    --line: color-mix(in srgb, var(--ink) 18%, transparent);
    --shadow: 0 20px 60px color-mix(in srgb, var(--ink) 14%, transparent);
    --radius: 28px;
    color-scheme: light;
    font-family: Inter, ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; overflow-x: clip; }
  body {
    margin: 0;
    overflow-x: clip;
    color: var(--ink);
    background:
      radial-gradient(circle at 12% 4%, color-mix(in srgb, var(--highlight) 24%, transparent), transparent 25rem),
      radial-gradient(circle at 92% 18%, color-mix(in srgb, var(--accent-2) 17%, transparent), transparent 28rem),
      var(--paper);
    line-height: 1.55;
  }

  button, a { font: inherit; }
  button { color: inherit; }
  button:focus-visible, a:focus-visible, [tabindex]:focus-visible {
    outline: 4px solid color-mix(in srgb, var(--accent-2) 70%, white);
    outline-offset: 3px;
  }

  .skip-link {
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 50;
    padding: 10px 16px;
    color: white;
    background: var(--ink);
    border-radius: 999px;
    transform: translateY(-150%);
  }
  .skip-link:focus { transform: translateY(0); }

  .topbar {
    width: min(1180px, calc(100% - 32px));
    margin: 18px auto 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .brand { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 0.88rem; font-weight: 850; letter-spacing: -0.01em; }
  .brand-mark {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    overflow: hidden;
    border: 2px solid var(--ink);
    border-radius: 16px;
    background-color: white;
    background-image: var(--character-art);
    background-repeat: no-repeat;
    background-size: var(--brand-portrait-size);
    background-position: var(--brand-portrait-position);
    box-shadow: 3px 3px 0 var(--ink);
  }
  .top-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 6px 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    background: color-mix(in srgb, var(--surface) 86%, transparent);
    font-size: 0.82rem;
    font-weight: 750;
  }
  .ghost-button {
    min-height: 38px;
    padding: 8px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    cursor: pointer;
    font-weight: 800;
  }

  .hero {
    width: min(1180px, calc(100% - 32px));
    margin: 28px auto 34px;
  }
  h1 {
    max-width: 900px;
    margin: 0;
    font-size: clamp(2.2rem, 4.2vw, 4rem);
    line-height: 1.04;
    letter-spacing: -0.045em;
  }
  .source-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin: 14px 0 0; color: var(--muted); font-size: 0.9rem; }
  .source-label { color: var(--ink); font-size: 0.72rem; font-weight: 900; letter-spacing: 0.09em; text-transform: uppercase; }
  .source-line a { color: var(--accent-2); font-weight: 850; text-underline-offset: 3px; }
  .source-byline { color: var(--muted); }
  .core-summary { max-width: 820px; margin: 22px 0 0; padding: 18px 20px; border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--surface) 76%, transparent); }
  .core-summary-label { margin: 0; color: var(--accent); font-size: 0.72rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
  .hero-summary { margin: 6px 0 0; color: var(--ink); font-size: clamp(1rem, 1.6vw, 1.18rem); line-height: 1.65; }
  .hero-meta { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 16px; }
  .traveler-chip { color: var(--ink); background: color-mix(in srgb, var(--highlight) 42%, var(--surface)); }

  main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
  .journey-overview { margin: 10px 0 34px; }
  .overview-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 15px; }
  .overview-heading h2 { margin: 0; font-size: clamp(1.8rem, 4vw, 3rem); line-height: 1; letter-spacing: -0.05em; }
  .overview-heading p:last-child { max-width: 520px; margin: 0; color: var(--muted); }
  .overview-shell { overflow: hidden; border: 2px solid var(--ink); border-radius: 28px; background: var(--surface); box-shadow: 5px 6px 0 color-mix(in srgb, var(--ink) 92%, transparent); }
  .overview-flow { display: block; overflow-x: auto; padding: 20px 18px 16px; scrollbar-width: thin; }
  .overview-flow-track { width: max-content; min-width: 100%; display: flex; align-items: center; justify-content: center; }
  .overview-stage { width: 142px; min-height: 112px; flex: 0 0 142px; display: grid; grid-template-columns: 27px 1fr; align-items: start; gap: 8px; padding: 13px 11px; border: 1.8px solid var(--ink); border-radius: 22px; color: var(--ink); background: var(--surface); box-shadow: 3px 4px 0 color-mix(in srgb, var(--ink) 18%, transparent); text-align: left; cursor: pointer; }
  .overview-stage:hover { transform: translateY(-1px); box-shadow: 4px 5px 0 color-mix(in srgb, var(--ink) 22%, transparent); }
  .overview-stage.visited { background: color-mix(in srgb, var(--accent-2) 10%, var(--surface)); }
  .overview-stage.current { border-color: var(--accent); border-width: 3px; background: color-mix(in srgb, var(--highlight) 34%, var(--surface)); }
  .overview-stage.upcoming { opacity: 0.72; }
  .overview-stage-number { width: 27px; height: 27px; display: grid; place-items: center; border: 1px solid var(--ink); border-radius: 9px; background: var(--highlight); font-size: 0.7rem; font-weight: 950; }
  .overview-stage-copy { display: grid; gap: 5px; min-width: 0; }
  .overview-stage-copy strong { font-size: 0.84rem; line-height: 1.15; }
  .overview-stage-copy small { color: var(--muted); font-size: 0.68rem; line-height: 1.25; }
  .overview-connector { width: 82px; flex: 0 0 82px; display: grid; align-items: end; gap: 6px; padding: 0 7px; }
  .overview-connector-label { min-height: 34px; display: grid; place-items: end center; color: var(--muted); font-size: 0.64rem; font-weight: 800; line-height: 1.1; text-align: center; }
  .overview-connector-line { position: relative; height: 3px; border-radius: 999px; background: color-mix(in srgb, var(--accent-2) 74%, var(--ink)); }
  .overview-connector-line::after { content: ""; position: absolute; top: 50%; right: -2px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 9px solid var(--accent-2); transform: translateY(-50%); }
  .overview-connector.visited .overview-connector-line, .overview-connector.active .overview-connector-line { background: var(--accent); }
  .overview-connector.visited .overview-connector-line::after, .overview-connector.active .overview-connector-line::after { border-left-color: var(--accent); }
  .overview-traveler { position: absolute; z-index: 2; top: 50%; left: calc(50% - 6px); width: 12px; height: 12px; border: 2px solid var(--ink); border-radius: 50%; background: var(--highlight); box-shadow: 1px 2px 0 color-mix(in srgb, var(--ink) 25%, transparent); transform: translateY(-50%); }
  .is-playing .overview-traveler { animation: overview-travel 2.7s linear infinite; }
  @keyframes overview-travel { from { left: -5px; } to { left: calc(100% - 7px); } }
  .overview-caption { margin: 0; padding: 11px 16px; border-top: 1px solid var(--line); color: var(--muted); background: color-mix(in srgb, var(--highlight) 14%, transparent); font-size: 0.84rem; text-align: center; }
  .lesson-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; align-items: start; }
  .question-rail {
    position: sticky;
    top: 18px;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: 0 12px 36px color-mix(in srgb, var(--ink) 7%, transparent);
    backdrop-filter: blur(12px);
  }
  .section-kicker { margin: 0 0 4px; color: var(--accent); font-size: 0.73rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
  .question-rail h2 { margin: 0 0 15px; font-size: 1.25rem; letter-spacing: -0.03em; }
  .scene-nav { display: grid; gap: 8px; }
  .scene-nav button {
    width: 100%;
    display: grid;
    grid-template-columns: 28px 1fr;
    align-items: start;
    gap: 10px;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 15px;
    text-align: left;
    color: var(--muted);
    background: transparent;
    cursor: pointer;
    line-height: 1.3;
    font-size: 0.84rem;
  }
  .scene-nav button:hover { background: color-mix(in srgb, var(--accent) 7%, var(--surface)); color: var(--ink); }
  .scene-nav button.selected { border-color: color-mix(in srgb, var(--accent) 32%, transparent); color: var(--ink); background: color-mix(in srgb, var(--accent) 11%, var(--surface)); font-weight: 750; }
  .nav-number { width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); font-size: 0.73rem; font-weight: 900; }
  .rail-note { margin: 18px 0 0; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.76rem; }

  .lesson-card {
    overflow: hidden;
    border: 2px solid var(--ink);
    border-radius: 34px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .progress-track { height: 8px; background: color-mix(in srgb, var(--ink) 8%, transparent); }
  .progress-fill { width: 20%; height: 100%; background: linear-gradient(90deg, var(--accent), var(--highlight)); transition: width 420ms ease; }
  .lesson-inner { padding: clamp(20px, 4vw, 38px); }
  .scene-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
  .scene-counter { margin: 0 0 4px; color: var(--accent); font-size: 0.75rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
  .scene-heading h2 { margin: 0; font-size: clamp(1.55rem, 3vw, 2.35rem); letter-spacing: -0.045em; outline: none; }
  .visual-type { flex: 0 0 auto; padding: 7px 11px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 0.74rem; font-weight: 800; text-transform: capitalize; }
  .view-strip { margin: -5px 0 20px; padding: 10px; border: 1px solid var(--line); border-radius: 17px; background: color-mix(in srgb, var(--paper) 36%, var(--surface)); }
  .visual-counter { display: block; margin: 0 0 7px 3px; color: var(--muted); font-size: 0.7rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
  .visual-nav { display: flex; gap: 7px; overflow-x: auto; padding: 1px; scrollbar-width: thin; }
  .visual-nav button { min-width: max-content; display: inline-flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid transparent; border-radius: 12px; color: var(--muted); background: transparent; cursor: pointer; font-size: 0.76rem; }
  .visual-nav button span { width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: 0.68rem; font-weight: 900; }
  .visual-nav button.selected { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 36%, transparent); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }

  .dialogue { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 14px; align-items: center; }
  .dialogue.michi { grid-template-columns: minmax(0, 1fr) 76px; margin-top: 18px; }
  .portrait {
    width: 76px;
    height: 76px;
    border: 2px solid var(--ink);
    border-radius: 24px;
    background-color: white;
    background-image: var(--character-art);
    background-repeat: no-repeat;
    box-shadow: 3px 4px 0 var(--ink);
  }
  .portrait.michi { background-size: var(--michi-portrait-size); background-position: var(--michi-portrait-position); }
  .portrait.koko { background-size: var(--koko-portrait-size); background-position: var(--koko-portrait-position); }
  .bubble { position: relative; min-height: 76px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 20px; background: color-mix(in srgb, var(--paper) 62%, var(--surface)); }
  .dialogue.koko .bubble::before, .dialogue.michi .bubble::after {
    content: "";
    position: absolute;
    top: 27px;
    width: 14px;
    height: 14px;
    background: inherit;
    border: solid var(--line);
    transform: rotate(45deg);
  }
  .dialogue.koko .bubble::before { left: -8px; border-width: 0 0 1px 1px; }
  .dialogue.michi .bubble::after { right: -8px; border-width: 1px 1px 0 0; }
  .speaker { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 0.76rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.07em; }
  .speaker small { color: var(--muted); font-weight: 750; letter-spacing: 0; text-transform: none; }
  .bubble p { margin: 0; font-size: 1.02rem; }

  .diagram-shell { margin: 24px 0 0; overflow: hidden; border: 1px solid var(--line); border-radius: 24px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, white), color-mix(in srgb, var(--paper) 54%, var(--surface))); }
  .traveler-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 16px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 0.78rem; }
  .traveler-bar strong { color: var(--ink); }
  .traveler-token { display: inline-flex; align-items: center; gap: 7px; }
  .traveler-token::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--highlight); border: 1px solid var(--ink); box-shadow: 1px 1px 0 var(--ink); }
  #diagram { width: 100%; height: auto; min-height: 310px; display: block; }
  .mobile-visual { display: none; }
  .diagram-edge { fill: none; stroke: color-mix(in srgb, var(--accent-2) 82%, var(--ink)); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 8 8; }
  .diagram-edge.active-route { stroke-width: 4.5; }
  .edge-1 { stroke: var(--accent); }
  .edge-2 { stroke: color-mix(in srgb, var(--highlight) 72%, var(--ink)); }
  .arrow-head { fill: var(--accent-2); }
  .edge-label { fill: var(--muted); stroke: var(--surface); stroke-width: 7px; paint-order: stroke; font-size: 12px; font-weight: 800; }
  .node-shape { fill: var(--surface); stroke: var(--ink); stroke-width: 1.8; filter: drop-shadow(2px 3px 0 color-mix(in srgb, var(--ink) 20%, transparent)); }
  .diagram-node.active .node-shape { fill: color-mix(in srgb, var(--highlight) 36%, var(--surface)); stroke: var(--accent); stroke-width: 3; }
  .diagram-node.visited .node-shape { fill: color-mix(in srgb, var(--accent-2) 13%, var(--surface)); }
  .diagram-node.current .node-shape { fill: color-mix(in srgb, var(--highlight) 42%, var(--surface)); stroke: var(--accent); stroke-width: 3; }
  .diagram-node.upcoming { opacity: 0.72; }
  .diagram-node.clickable { cursor: pointer; }
  .node-label { fill: var(--ink); font-size: 14px; font-weight: 900; }
  .node-detail { fill: var(--muted); font-size: 11px; font-weight: 650; }
  .traveler-dot { fill: var(--highlight); stroke: var(--ink); stroke-width: 2.5; filter: drop-shadow(2px 3px 0 color-mix(in srgb, var(--ink) 28%, transparent)); }
  .sequence-lifeline { stroke: color-mix(in srgb, var(--ink) 24%, transparent); stroke-width: 2; stroke-dasharray: 5 7; }
  .sequence-actor .node-label { font-size: 13px; }
  .chart-label { fill: var(--ink); font-size: 14px; font-weight: 850; }
  .chart-value { fill: var(--ink); font-size: 13px; font-weight: 950; }
  .chart-track { fill: color-mix(in srgb, var(--ink) 9%, transparent); }
  .chart-bar { fill: var(--accent-2); }
  .chart-bar.bar-1 { fill: var(--accent); }
  .chart-bar.bar-2 { fill: color-mix(in srgb, var(--highlight) 78%, var(--ink)); }
  .chart-bar.bar-3 { fill: color-mix(in srgb, var(--accent-2) 52%, var(--highlight)); }
  .chart-row.active .chart-bar { stroke: var(--ink); stroke-width: 2; }
  .donut-track { fill: none; stroke: color-mix(in srgb, var(--ink) 9%, transparent); stroke-width: 58; }
  .donut-segment { fill: none; stroke-width: 58; }
  .segment-0 { stroke: var(--accent-2); fill: var(--accent-2); }
  .segment-1 { stroke: var(--accent); fill: var(--accent); }
  .segment-2 { stroke: color-mix(in srgb, var(--highlight) 78%, var(--ink)); fill: color-mix(in srgb, var(--highlight) 78%, var(--ink)); }
  .segment-3 { stroke: #8b61b4; fill: #8b61b4; }
  .segment-4 { stroke: #4f79b8; fill: #4f79b8; }
  .donut-center { fill: var(--ink); font-size: 32px; font-weight: 950; }
  .donut-caption { fill: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; }
  .is-playing .diagram-edge { animation: edge-travel 1.4s linear infinite; }
  .is-playing .diagram-node.active .node-shape { animation: node-pulse 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes edge-travel { to { stroke-dashoffset: -32; } }
  @keyframes node-pulse { 50% { transform: scale(1.035); } }
  .diagram-reading { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 10px 16px; align-items: start; padding: 11px 16px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--paper) 42%, var(--surface)); }
  .diagram-reading strong { color: var(--accent-2); font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; }
  .diagram-reading p { margin: 0; color: var(--ink); font-size: 0.79rem; line-height: 1.45; }
  .diagram-reading p.audit-failed { color: var(--danger); font-weight: 800; }
  .visual-caption { margin: 0; padding: 11px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.82rem; text-align: center; }
  .visual-caption.illustrative { color: #74438b; background: #f8edff; }
  .visual-caption.verified { color: #246645; background: #edf8f0; }
  .mobile-node-list { display: grid; gap: 9px; }
  .mobile-node { width: 100%; display: grid; grid-template-columns: 32px 1fr; align-items: start; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 15px; color: var(--ink); background: var(--surface); text-align: left; }
  button.mobile-node { cursor: pointer; }
  .mobile-node > span:last-child { display: grid; gap: 2px; }
  .mobile-node small { color: var(--muted); font-size: 0.76rem; }
  .mobile-node.active, .mobile-node.current { border-color: var(--accent); background: color-mix(in srgb, var(--highlight) 26%, var(--surface)); }
  .mobile-node.visited { background: color-mix(in srgb, var(--accent-2) 9%, var(--surface)); }
  .mobile-node.upcoming { opacity: 0.76; }
  .mobile-step-number { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--ink); border-radius: 9px; background: var(--highlight); font-size: 0.72rem; font-weight: 950; }
  .mobile-flow { display: grid; gap: 7px; }
  .mobile-connector { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 30px; padding: 0 12px; color: var(--accent-2); font-size: 0.72rem; }
  .mobile-connector span { text-align: center; font-size: 1.1rem; line-height: 1; }
  .mobile-branches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 5px; padding-left: 18px; border-left: 3px solid color-mix(in srgb, var(--accent-2) 60%, var(--line)); }
  .mobile-branch { min-width: 0; display: grid; align-content: start; gap: 6px; }
  .mobile-branch-label { padding: 5px 8px; border-radius: 999px; color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 9%, var(--surface)); font-size: 0.68rem; text-align: center; }
  .mobile-branch .mobile-node { grid-template-columns: 26px minmax(0, 1fr); padding: 10px; }
  .mobile-branch .mobile-step-number { width: 24px; height: 24px; }
  .mobile-comparison-dimension { margin: 0 0 9px; padding: 9px 11px; border-radius: 12px; color: var(--ink); background: color-mix(in srgb, var(--highlight) 22%, var(--surface)); font-size: 0.76rem; font-weight: 800; }
  .mobile-comparison-grid { display: grid; gap: 9px; }
  .mobile-transition-list { display: grid; gap: 7px; }
  .mobile-transition { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 7px; padding: 10px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface); font-size: 0.73rem; }
  .mobile-transition strong:last-child { text-align: right; }
  .mobile-transition span { color: var(--accent-2); font-weight: 900; white-space: nowrap; }
  .mobile-routes { display: grid; gap: 6px; margin: 12px 0 0; padding: 11px 12px 11px 32px; border-radius: 14px; color: var(--muted); background: color-mix(in srgb, var(--paper) 56%, var(--surface)); font-size: 0.75rem; }
  .mobile-sequence-step { display: grid; grid-template-columns: 32px 1fr; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .mobile-sequence-step:last-child { border-bottom: 0; }
  .mobile-sequence-step p { margin: 0; font-size: 0.82rem; }
  .mobile-chart-row { padding: 12px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); }
  .mobile-chart-row + .mobile-chart-row { margin-top: 9px; }
  .mobile-chart-row.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .mobile-chart-top { display: flex; justify-content: space-between; gap: 12px; font-size: 0.82rem; }
  .mobile-chart-track { height: 18px; margin-top: 8px; overflow: hidden; border-radius: 7px; background: color-mix(in srgb, var(--ink) 9%, transparent); }
  .mobile-chart-fill { display: block; min-width: 4px; height: 100%; background: var(--accent-2); }
  .mobile-chart-fill.bar-1 { background: var(--accent); }
  .mobile-chart-fill.bar-2 { background: color-mix(in srgb, var(--highlight) 78%, var(--ink)); }
  .mobile-chart-fill.bar-3 { background: color-mix(in srgb, var(--accent-2) 52%, var(--highlight)); }
  .mobile-chart-row p { margin: 7px 0 0; color: var(--muted); font-size: 0.72rem; }
  .takeaway { margin: 0; padding: 12px 16px; border-top: 1px solid var(--line); color: var(--ink); background: color-mix(in srgb, var(--highlight) 17%, transparent); font-weight: 800; text-align: center; }

  .truth-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 90px 0 0; }
  .truth-tabs button { padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--surface); cursor: pointer; font-size: 0.78rem; font-weight: 800; }
  .truth-tabs button.selected { color: white; border-color: var(--ink); background: var(--ink); }
  .scene-evidence { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 18px; }
  .evidence-chip { padding: 6px 9px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); cursor: pointer; font-size: 0.7rem; font-weight: 850; text-transform: capitalize; }
  .evidence-chip.verified { color: #246645; background: #edf8f0; border-color: #a8d2b6; }
  .evidence-chip.inferred { color: #76530b; background: #fff7dc; border-color: #e5c874; }
  .evidence-chip.analogy { color: #74438b; background: #f8edff; border-color: #d6afe5; }

  .lesson-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px clamp(20px, 4vw, 38px) 22px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--paper) 32%, var(--surface)); }
  .control-group { display: flex; gap: 8px; flex-wrap: wrap; }
  .control-button { min-height: 42px; padding: 9px 15px; border: 1px solid var(--ink); border-radius: 14px; background: var(--surface); cursor: pointer; font-weight: 850; box-shadow: 2px 2px 0 var(--ink); }
  .control-button:hover:not(:disabled) { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--ink); }
  .control-button:disabled { cursor: not-allowed; opacity: 0.42; box-shadow: none; }
  .control-button.primary { color: white; background: var(--ink); }

  .content-section { margin: 78px 0; }
  .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
  .section-heading h2 { margin: 0; font-size: clamp(2rem, 4vw, 3.4rem); line-height: 1; letter-spacing: -0.055em; outline: none; }
  .section-heading p { max-width: 540px; margin: 0; color: var(--muted); }

  .truth-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .truth-card { min-height: 230px; padding: 24px; border: 1px solid var(--line); border-radius: 25px; background: var(--surface); }
  .truth-card:nth-child(1) { transform: rotate(-0.6deg); }
  .truth-card:nth-child(2) { border: 2px solid var(--ink); box-shadow: 5px 6px 0 var(--ink); }
  .truth-card:nth-child(3) { transform: rotate(0.6deg); }
  .truth-number { width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid var(--ink); border-radius: 12px; background: var(--highlight); font-weight: 950; }
  .truth-card h3 { margin: 17px 0 8px; font-size: 1.2rem; }
  .truth-card p { margin: 0; color: var(--muted); }

  .quiz-shell { padding: clamp(22px, 4vw, 42px); border: 2px solid var(--ink); border-radius: 32px; background: var(--surface); box-shadow: 7px 8px 0 var(--ink); }
  .quiz-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 20px; }
  .quiz-score { color: var(--muted); font-size: 0.85rem; font-weight: 800; }
  .quiz-list { display: grid; gap: 16px; }
  .quiz-card { padding: 20px; border: 1px solid var(--line); border-radius: 20px; background: color-mix(in srgb, var(--paper) 35%, var(--surface)); }
  .quiz-card h3 { margin: 0 0 14px; font-size: 1rem; }
  .quiz-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
  .quiz-options button { padding: 12px; border: 1px solid var(--line); border-radius: 14px; text-align: left; background: var(--surface); cursor: pointer; font-size: 0.84rem; }
  .quiz-options button:hover { border-color: var(--accent-2); }
  .quiz-options button.correct { border-color: #39875b; background: #e9f8ee; box-shadow: inset 0 0 0 1px #39875b; }
  .quiz-options button.incorrect { border-color: #b6473f; background: #fff0ee; }
  .quiz-feedback { display: none; margin: 13px 0 0; padding: 10px 12px; border-radius: 12px; font-size: 0.85rem; }
  .quiz-feedback.visible { display: block; }
  .quiz-feedback.correct { color: #255f40; background: #e9f8ee; }
  .quiz-feedback.incorrect { color: #84352f; background: #fff0ee; }

  .legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
  .legend span { padding: 5px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 850; }
  .legend .verified { color: #246645; background: #edf8f0; }
  .legend .inferred { color: #76530b; background: #fff7dc; }
  .legend .analogy { color: #74438b; background: #f8edff; }
  .evidence-ledger { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .ledger-item { padding: 20px; border: 1px solid var(--line); border-top: 5px solid var(--muted); border-radius: 20px; background: var(--surface); scroll-margin: 100px; }
  .ledger-item.verified { border-top-color: #39875b; }
  .ledger-item.inferred { border-top-color: #d2a329; }
  .ledger-item.analogy { border-top-color: #9d61b8; }
  .ledger-top { display: flex; align-items: center; gap: 9px; }
  .ledger-top h3 { margin: 0; font-size: 1rem; }
  .status-dot { padding: 3px 7px; border-radius: 999px; color: var(--muted); background: color-mix(in srgb, var(--paper) 65%, var(--surface)); font-size: 0.65rem; font-weight: 900; text-transform: uppercase; }
  .ledger-item p { margin: 11px 0 0; color: var(--muted); font-size: 0.86rem; }
  .ledger-item a { display: inline-block; margin-top: 12px; color: var(--accent-2); font-weight: 800; }

  footer { width: min(1180px, calc(100% - 32px)); margin: 20px auto 40px; padding-top: 20px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 20px; color: var(--muted); font-size: 0.78rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

  @media (max-width: 920px) {
    .overview-heading { align-items: flex-start; flex-direction: column; }
    .lesson-grid { grid-template-columns: 1fr; }
    .question-rail { position: static; }
    .scene-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .truth-grid, .evidence-ledger { grid-template-columns: 1fr; }
    .truth-card:nth-child(n) { transform: none; }
    .quiz-options { grid-template-columns: 1fr; }
  }

  @media (max-width: 620px) {
    .topbar { align-items: flex-start; }
    .brand span:last-child { display: none; }
    .brand-mark { width: 42px; height: 42px; border-radius: 15px; }
    h1 { font-size: clamp(1.75rem, 10vw, 2.8rem); }
    .hero { margin-top: 18px; }
    .scene-nav { grid-template-columns: 1fr; }
    .lesson-inner { padding: 20px 14px; }
    .scene-heading { align-items: flex-start; }
    .dialogue, .dialogue.michi { grid-template-columns: 56px minmax(0, 1fr); }
    .dialogue.michi .bubble { grid-column: 2; grid-row: 1; }
    .dialogue.michi .portrait { grid-column: 1; grid-row: 1; }
    .portrait { width: 56px; height: 56px; border-radius: 18px; }
    .truth-tabs { margin-right: 0; }
    .lesson-controls { align-items: stretch; flex-direction: column; }
    .control-group { display: grid; grid-template-columns: repeat(2, 1fr); }
    .control-button { width: 100%; }
    #diagram, #overview-diagram { display: none; }
    #mobile-visual, #overview-mobile { display: block; padding: 13px; }
    .traveler-bar { align-items: flex-start; flex-direction: column; }
    .diagram-reading { grid-template-columns: 1fr; }
    .section-heading { align-items: flex-start; flex-direction: column; }
    footer { flex-direction: column; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  }

  @media print {
    body { background: white; }
    .top-actions, .question-rail, .lesson-controls, .truth-tabs, .scene-evidence, #reset-quiz { display: none !important; }
    .hero, .lesson-grid, .truth-grid, .evidence-ledger { display: block; }
    #diagram, #overview-diagram { display: block !important; }
    #mobile-visual, #overview-mobile { display: none !important; }
    .lesson-card, .quiz-shell, .truth-card, .ledger-item { break-inside: avoid; box-shadow: none; margin-bottom: 16px; }
    main, .hero, footer { width: 100%; }
  }
`;

export async function renderLesson(spec, options = {}) {
  const result = validateSpec(spec);
  if (result.errors.length > 0) {
    throw new Error(formatIssues("Lesson spec errors", result.errors));
  }

  const config = STYLE_CONFIG[spec.style];
  const characterArtData = await imageDataUri(spec.style, options.assetRoot);
  const michiPortrait = portraitCss(config.michiPortrait);
  const kokoPortrait = portraitCss(config.kokoPortrait);
  const brandPortrait = portraitCss(config.brandPortrait);
  const title = escapeHtml(spec.title);
  const summary = escapeHtml(spec.summary);
  const audience = escapeHtml(spec.audience || "curious beginner");
  const traveler = escapeHtml(spec.traveler.label);
  const overviewTitle = escapeHtml(spec.overview?.title || "The whole journey");
  const overviewCaption = escapeHtml(spec.overview?.caption || "Choose any stage to jump into the lesson.");
  const viewCount = spec.scenes.reduce((sum, scene) => sum + (Array.isArray(scene.visuals) ? scene.visuals.length : 1), 0);
  const sourceHtml = spec.source
    ? `      <p class="source-line"><span class="source-label">Original source</span><a href="${escapeHtml(spec.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(spec.source.title)}</a>${spec.source.byline ? `<span class="source-byline">by ${escapeHtml(spec.source.byline)}</span>` : ""}</p>\n`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="${config.paper}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
  <title>${title} · Visual explainer</title>
  <style>
    :root {
      --paper: ${config.paper};
      --surface: ${config.surface};
      --ink: ${config.ink};
      --muted: ${config.muted};
      --accent: ${config.accent};
      --accent-2: ${config.accent2};
      --highlight: ${config.highlight};
      --michi-portrait-size: ${michiPortrait.size};
      --michi-portrait-position: ${michiPortrait.position};
      --koko-portrait-size: ${kokoPortrait.size};
      --koko-portrait-position: ${kokoPortrait.position};
      --brand-portrait-size: ${brandPortrait.size};
      --brand-portrait-position: ${brandPortrait.position};
    }
${CSS}
  </style>
</head>
<body data-miko-fireworks="1" data-style="${escapeHtml(spec.style)}">
  <a class="skip-link" href="#lesson-card">Skip to the lesson</a>
  <div id="lesson-live" class="sr-only" aria-live="polite"></div>

  <header class="topbar">
    <div class="brand"><span class="brand-mark" role="img" aria-label="Michi, a calico cat, and Koko, a brown tabby cat together"></span><span>Visual explainer</span></div>
    <div class="top-actions">
      <button id="print-lesson" class="ghost-button" type="button">Print / save PDF</button>
    </div>
  </header>

  <section class="hero" aria-labelledby="page-title">
    <div>
      <h1 id="page-title">${title}</h1>
${sourceHtml}      <div class="core-summary">
        <p class="core-summary-label">Core idea</p>
        <p class="hero-summary">${summary}</p>
      </div>
      <div class="hero-meta">
        <span class="meta-chip">${audience}</span>
        <span class="meta-chip traveler-chip">Worked example: ${traveler}</span>
        <span class="meta-chip">${spec.scenes.length} core questions · ${viewCount} diagrams</span>
      </div>
    </div>
  </section>

  <main id="main-content">
    <section class="journey-overview" aria-labelledby="overview-title">
      <div class="overview-heading">
        <div><p class="section-kicker">Start with the whole</p><h2 id="overview-title">${overviewTitle}</h2></div>
        <p>See where the traveler is now, what it already crossed, and what comes next. Pick a stage to jump there.</p>
      </div>
      <div class="overview-shell">
        <div class="traveler-bar"><span class="traveler-token"><strong>Whole journey:</strong> ${traveler}</span><span>the glowing dot follows a real route</span></div>
        <nav id="overview-diagram" class="overview-flow diagram-desktop" aria-label="${overviewTitle}"></nav>
        <div id="overview-mobile" class="mobile-visual" aria-label="Mobile whole-journey flow"></div>
        <p class="overview-caption">${overviewCaption}</p>
      </div>
    </section>

    <section class="lesson-grid" aria-label="Interactive concept lesson">
      <aside class="question-rail" aria-labelledby="questions-title">
        <p class="section-kicker">Choose a question</p>
        <h2 id="questions-title">Questions this explains</h2>
        <nav id="scene-nav" class="scene-nav" aria-label="Lesson questions"></nav>
        <p class="rail-note">Playback advances through each view every 7 seconds. Use Pause to inspect a route or chart. Keyboard: ← → questions, Space pause/play.</p>
      </aside>

      <article id="lesson-card" class="lesson-card">
        <div class="progress-track" aria-hidden="true"><div id="progress-fill" class="progress-fill"></div></div>
        <div class="lesson-inner">
          <header class="scene-heading">
            <div>
              <p id="scene-counter" class="scene-counter"></p>
              <h2 id="scene-title" tabindex="-1"></h2>
            </div>
            <span id="visual-type" class="visual-type"></span>
          </header>

          <div class="view-strip">
            <span id="visual-counter" class="visual-counter"></span>
            <nav id="visual-nav" class="visual-nav" aria-label="Views for this question"></nav>
          </div>

          <div class="dialogue koko">
            <div class="portrait koko" role="img" aria-label="Koko, the curious brown tabby student"></div>
            <div class="bubble">
              <div class="speaker">Koko <small>brown tabby · student</small></div>
              <p id="koko-question"></p>
            </div>
          </div>

          <div class="diagram-shell">
            <div class="traveler-bar"><span class="traveler-token"><strong>Following:</strong> ${traveler}</span><span id="visual-legend"></span></div>
            <svg id="diagram" class="diagram-desktop" viewBox="0 0 900 440" role="img" aria-labelledby="diagram-title"><title id="diagram-title"></title></svg>
            <div id="mobile-visual" class="mobile-visual" aria-label="Mobile diagram"></div>
            <div class="diagram-reading"><strong>How to read this view</strong><p id="route-explanation"></p></div>
            <p id="visual-caption" class="visual-caption"></p>
            <p id="takeaway" class="takeaway"></p>
          </div>

          <div class="dialogue michi">
            <div class="bubble">
              <div class="speaker">Michi <small>calico · sensei · <span id="answer-mode">Easy picture</span></small></div>
              <p id="michi-answer"></p>
            </div>
            <div class="portrait michi" role="img" aria-label="Michi, the warm calico cat sensei"></div>
          </div>

          <div class="truth-tabs" role="tablist" aria-label="Explanation depth">
            <button type="button" role="tab" data-truth="simple">Easy picture</button>
            <button type="button" role="tab" data-truth="mechanism">Real mechanism</button>
            <button type="button" role="tab" data-truth="caveat">Important caveat</button>
          </div>
          <div id="scene-evidence" class="scene-evidence" aria-label="Evidence for this scene"></div>
        </div>

        <div class="lesson-controls">
          <div class="control-group">
            <button id="previous-scene" class="control-button" type="button">Back</button>
            <button id="play-toggle" class="control-button" type="button">Pause</button>
            <button id="replay" class="control-button" type="button">Replay</button>
          </div>
          <button id="next-scene" class="control-button primary" type="button">Next question</button>
        </div>
      </article>
    </section>

    <section class="content-section" aria-labelledby="truth-title">
      <div class="section-heading">
        <div><p class="section-kicker">Three layers, one honest model</p><h2 id="truth-title">The truth ladder</h2></div>
        <p>The analogy helps you enter. The mechanism tells you what actually happens. The caveat marks where the easy picture stops working.</p>
      </div>
      <div class="truth-grid">
        <article class="truth-card"><span class="truth-number">1</span><h3>Easy picture</h3><p>${escapeHtml(spec.truthLadder.analogy)}</p></article>
        <article class="truth-card"><span class="truth-number">2</span><h3>Real mechanism</h3><p>${escapeHtml(spec.truthLadder.mechanism)}</p></article>
        <article class="truth-card"><span class="truth-number">3</span><h3>Important caveat</h3><p>${escapeHtml(spec.truthLadder.caveat)}</p></article>
      </div>
    </section>

    <section id="teach-back" class="content-section" aria-labelledby="teach-back-title">
      <div class="section-heading">
        <div><p class="section-kicker">Check your understanding</p><h2 id="teach-back-title" tabindex="-1">Can you explain the mechanism?</h2></div>
        <p>Pick an answer, then use the explanation to repair the causal model—not just memorize a word.</p>
      </div>
      <div class="quiz-shell">
        <div class="quiz-toolbar"><span id="quiz-score" class="quiz-score">Not started</span><button id="reset-quiz" class="ghost-button" type="button">Reset answers</button></div>
        <div id="quiz-list" class="quiz-list"></div>
      </div>
    </section>

    <section class="content-section" aria-labelledby="evidence-title">
      <div class="section-heading">
        <div><p class="section-kicker">What supports the lesson</p><h2 id="evidence-title">Evidence ledger</h2></div>
        <p>Verified means directly supported. Inferred means a reasoned model. Analogy means a teaching device—not proof.</p>
      </div>
      <div class="legend" aria-label="Evidence status legend"><span class="verified">Verified</span><span class="inferred">Inferred</span><span class="analogy">Analogy</span></div>
      <div id="evidence-ledger" class="evidence-ledger"></div>
    </section>
  </main>

  <footer><span>Source-grounded visual lesson</span><span>Self-contained offline artifact · no runtime network request</span></footer>
  <noscript><p>This lesson needs JavaScript for scene controls and diagrams. Enable JavaScript, or print the truth ladder above.</p></noscript>
  <script id="character-art-data" type="application/octet-stream">${characterArtData}</script>
  <script id="lesson-data" type="application/json">${safeJson(spec)}</script>
  <script>(${clientRuntime.toString()})();</script>
</body>
</html>`;
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error("Missing input or output path.\nNext: node render.mjs <lesson.json> <lesson.html>");
    process.exitCode = 2;
    return;
  }

  let spec;
  try {
    spec = await readSpec(resolve(inputPath));
  } catch (error) {
    console.error(`${error.message}\nNext: confirm the spec path and JSON syntax, then render again.`);
    process.exitCode = 2;
    return;
  }

  let html;
  try {
    html = await renderLesson(spec);
  } catch (error) {
    console.error(`${error.message}\nNext: fix the reported lesson or asset problem, then render again.`);
    process.exitCode = 1;
    return;
  }

  const target = resolve(outputPath);
  try {
    await writeFile(target, html, "utf8");
  } catch (error) {
    console.error(`Could not write the explainer to ${target}: ${error.message}\nNext: choose a writable output path and render again.`);
    process.exitCode = 2;
    return;
  }
  console.log(`Rendered Miko explainer: ${target}`);
}

const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  await main();
}
