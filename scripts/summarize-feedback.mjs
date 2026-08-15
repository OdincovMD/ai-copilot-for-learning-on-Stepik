#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";

const PASS_CRITERIA = {
  minimumUsefulRate: 0.7,
  maximumFactualErrorRate: 0.05,
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.feedbackPath || args.help) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const feedback = readJsonArray(args.feedbackPath);
  const evalSet = args.evalSetPath ? readEvalSetCsv(args.evalSetPath) : [];
  const summary = buildSummary(feedback, evalSet);

  if (args.format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(renderMarkdownSummary(summary));
}

function parseArgs(argv) {
  const parsed = {
    feedbackPath: undefined,
    evalSetPath: undefined,
    format: "markdown",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--eval-set") {
      parsed.evalSetPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--format") {
      parsed.format = argv[index + 1] === "json" ? "json" : "markdown";
      index += 1;
      continue;
    }

    if (!parsed.feedbackPath) {
      parsed.feedbackPath = arg;
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`Usage:
  npm run eval:feedback -- <feedback.json> [--eval-set <eval-set.csv>] [--format markdown|json]

Examples:
  npm run eval:feedback -- /tmp/stepik-copilot-feedback.json
  npm run eval:feedback -- /tmp/stepik-copilot-feedback.json --eval-set docs/stepik-copilot/eval/eval-set.local.csv
`);
}

function readJsonArray(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${filePath} to contain a JSON array`);
  }

  return parsed;
}

function readEvalSetCsv(filePath) {
  const raw = readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return [];
  }

  const [headerLine, ...lines] = parseCsvLines(raw);
  const headers = parseCsvRow(headerLine);
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const values = parseCsvRow(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}

function parseCsvLines(raw) {
  return raw.split(/\r?\n/);
}

function parseCsvRow(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"" && inQuotes && nextChar === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function buildSummary(feedback, evalSet) {
  const normalized = feedback.map(normalizeFeedbackRecord).filter(Boolean);
  const uniqueUrls = new Set(normalized.map((record) => record.url).filter(Boolean));
  const directLeakStats = summarizeDirectLeaks(normalized);

  return {
    totalRecords: normalized.length,
    uniqueUrls: uniqueUrls.size,
    byFeedbackReason: countBy(normalized, (record) => record.feedbackReason),
    byMode: countBy(normalized, (record) => record.mode),
    byTaskKind: countBy(normalized, (record) => record.taskKind),
    bySource: countBy(normalized, (record) => record.source),
    quality: {
      usefulRate: ratio(countByValue(normalized, "feedbackReason", "useful"), normalized.length),
      factualErrorRate: ratio(countByValue(normalized, "feedbackReason", "factual_error"), normalized.length),
      tooDirectCount: countByValue(normalized, "feedbackReason", "too_direct"),
      missedContextCount: countByValue(normalized, "feedbackReason", "missed_context"),
    },
    directLeaks: directLeakStats,
    reviewQueues: buildReviewQueues(normalized),
    evalSet: summarizeEvalSet(normalized, evalSet),
    passCriteria: evaluatePassCriteria(normalized, directLeakStats),
  };
}

function normalizeFeedbackRecord(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return {
    id: stringValue(value.id),
    createdAt: stringValue(value.createdAt),
    url: stringValue(value.url),
    mode: stringValue(value.mode),
    taskKind: stringValue(value.taskKind),
    source: stringValue(value.source),
    feedbackReason: stringValue(value.feedbackReason),
    requestSummary: value.requestSummary && typeof value.requestSummary === "object" ? value.requestSummary : {},
    request: value.request && typeof value.request === "object" ? value.request : {},
    analysis: value.analysis && typeof value.analysis === "object" ? value.analysis : {},
    directAnswerLeak: readDirectAnswerLeak(value),
  };
}

function stringValue(value) {
  return typeof value === "string" && value ? value : "unknown";
}

function readDirectAnswerLeak(record) {
  const candidates = [
    record.has_direct_answer_leak,
    record.hasDirectAnswerLeak,
    record.directAnswerLeak,
  ];
  const explicit = candidates.find((value) => typeof value === "boolean");
  return typeof explicit === "boolean" ? explicit : undefined;
}

function countBy(records, selector) {
  const counts = {};
  for (const record of records) {
    const key = selector(record) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return sortObjectByKey(counts);
}

function countByValue(records, field, expectedValue) {
  return records.filter((record) => record[field] === expectedValue).length;
}

function ratio(value, total) {
  return total > 0 ? value / total : 0;
}

function summarizeDirectLeaks(records) {
  const choiceOrCode = records.filter((record) => record.taskKind === "choice" || record.taskKind === "code");
  const labeled = choiceOrCode.filter((record) => typeof record.directAnswerLeak === "boolean");
  const leaked = labeled.filter((record) => record.directAnswerLeak);

  return {
    choiceOrCodeRecords: choiceOrCode.length,
    labeledRecords: labeled.length,
    explicitLeakCount: leaked.length,
    status: labeled.length === 0 ? "unknown" : leaked.length === 0 ? "pass" : "fail",
    leakedRecordIds: leaked.map((record) => record.id),
  };
}

function buildReviewQueues(records) {
  const negative = records.filter((record) => record.feedbackReason !== "useful");
  return {
    negativeCount: negative.length,
    tooDirect: records
      .filter((record) => record.feedbackReason === "too_direct")
      .map(toReviewItem),
    missedContext: records
      .filter((record) => record.feedbackReason === "missed_context")
      .map(toReviewItem),
    factualError: records
      .filter((record) => record.feedbackReason === "factual_error")
      .map(toReviewItem),
  };
}

function toReviewItem(record) {
  return {
    id: record.id,
    url: record.url,
    mode: record.mode,
    taskKind: record.taskKind,
    source: record.source,
  };
}

function summarizeEvalSet(records, evalSet) {
  if (evalSet.length === 0) {
    return {
      provided: false,
    };
  }

  const feedbackUrls = new Set(records.map((record) => normalizeUrl(record.url)));
  const evalRows = evalSet.map((row) => ({
    caseId: row.case_id || "unknown",
    url: row.url || "",
    stepType: row.step_type || "unknown",
    hasComments: row.has_comments || "unknown",
    expectedModes: row.expected_modes || "",
  }));
  const covered = evalRows.filter((row) => feedbackUrls.has(normalizeUrl(row.url)));

  return {
    provided: true,
    totalCases: evalRows.length,
    coveredCases: covered.length,
    coverageRate: ratio(covered.length, evalRows.length),
    byStepType: countBy(evalRows, (row) => row.stepType),
    byHasComments: countBy(evalRows, (row) => row.hasComments),
    missingCaseIds: evalRows
      .filter((row) => !feedbackUrls.has(normalizeUrl(row.url)))
      .map((row) => row.caseId),
  };
}

function normalizeUrl(url) {
  if (!url || url === "unknown") {
    return "";
  }

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function evaluatePassCriteria(records, directLeakStats) {
  const usefulRate = ratio(countByValue(records, "feedbackReason", "useful"), records.length);
  const factualErrorRate = ratio(countByValue(records, "feedbackReason", "factual_error"), records.length);

  return {
    usefulRate: usefulRate >= PASS_CRITERIA.minimumUsefulRate ? "pass" : "fail",
    factualErrorRate: factualErrorRate <= PASS_CRITERIA.maximumFactualErrorRate ? "pass" : "fail",
    directAnswerLeaks: directLeakStats.status,
  };
}

function renderMarkdownSummary(summary) {
  return [
    "# Stepik Copilot Eval Summary",
    "",
    `- Records: ${summary.totalRecords}`,
    `- Unique URLs: ${summary.uniqueUrls}`,
    `- Useful rate: ${formatPercent(summary.quality.usefulRate)} (${summary.passCriteria.usefulRate})`,
    `- Factual error rate: ${formatPercent(summary.quality.factualErrorRate)} (${summary.passCriteria.factualErrorRate})`,
    `- Too direct: ${summary.quality.tooDirectCount}`,
    `- Missed context: ${summary.quality.missedContextCount}`,
    `- Direct-answer leaks on choice/code: ${summary.directLeaks.status} (${summary.directLeaks.explicitLeakCount} explicit leaks, ${summary.directLeaks.labeledRecords}/${summary.directLeaks.choiceOrCodeRecords} labeled)`,
    "",
    "## Breakdown",
    "",
    renderCounts("Feedback reasons", summary.byFeedbackReason),
    renderCounts("Modes", summary.byMode),
    renderCounts("Task kinds", summary.byTaskKind),
    renderCounts("Sources", summary.bySource),
    renderEvalSet(summary.evalSet),
    renderReviewQueues(summary.reviewQueues),
  ].filter(Boolean).join("\n");
}

function renderCounts(title, counts) {
  const lines = [`### ${title}`, ""];
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    lines.push("- none");
  } else {
    for (const [key, value] of entries) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

function renderEvalSet(evalSet) {
  if (!evalSet.provided) {
    return "## Eval Set Coverage\n\n- Eval set CSV was not provided.";
  }

  return [
    "## Eval Set Coverage",
    "",
    `- Covered cases: ${evalSet.coveredCases}/${evalSet.totalCases} (${formatPercent(evalSet.coverageRate)})`,
    renderCounts("Step types in eval set", evalSet.byStepType),
    renderCounts("Comments coverage in eval set", evalSet.byHasComments),
    evalSet.missingCaseIds.length > 0
      ? `### Missing Cases\n\n${evalSet.missingCaseIds.map((caseId) => `- ${caseId}`).join("\n")}`
      : "### Missing Cases\n\n- none",
  ].join("\n");
}

function renderReviewQueues(reviewQueues) {
  return [
    "## Review Queues",
    "",
    `- Negative records: ${reviewQueues.negativeCount}`,
    renderReviewQueue("Too direct", reviewQueues.tooDirect),
    renderReviewQueue("Missed context", reviewQueues.missedContext),
    renderReviewQueue("Factual error", reviewQueues.factualError),
  ].join("\n");
}

function renderReviewQueue(title, items) {
  const lines = [`### ${title}`, ""];
  if (items.length === 0) {
    lines.push("- none");
  } else {
    for (const item of items) {
      lines.push(`- ${item.id} | ${item.taskKind} | ${item.mode} | ${item.source} | ${item.url}`);
    }
  }

  return lines.join("\n");
}

function formatPercent(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

function sortObjectByKey(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

main();
