import path from "node:path";

import { validateSchemaSubset } from "../../lib/schema_subset.mjs";
import { validateReportSemantics } from "./input.mjs";
import {
  createExclusiveDirectory,
  describeBinaryArtifact,
  describeTextArtifact,
  writeBytes,
  writeText,
} from "../adapters/file.mjs";
import { EXIT, LabError } from "./errors.mjs";

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function markdownCell(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, " ");
}

export function buildReport(plan, analysis, generatedAt = new Date().toISOString()) {
  const frameSummary = analysis.metrics.frame_summary;
  return {
    schema_version: 1,
    run_id: plan.run_id,
    generated_at: generatedAt,
    status: analysis.status ?? (analysis.findings.length === 0 ? "pass" : "fail"),
    summary: {
      frame_count: frameSummary.count,
      duration_ms: frameSummary.duration_ms,
      finding_count: analysis.findings.length,
      check_count: analysis.checks.length,
    },
    finding_codes: analysis.findingCodes,
    findings: analysis.findings,
    checks: analysis.checks,
  };
}

export function renderReportMarkdown(report) {
  const lines = [
    `# Lab report: ${markdownCell(report.run_id)}`,
    "",
    `- Status: **${report.status.toUpperCase()}**`,
    `- Generated: ${markdownCell(report.generated_at)}`,
    `- Frames: ${report.summary.frame_count}`,
    `- Captured duration: ${report.summary.duration_ms} ms`,
    `- Findings: ${report.summary.finding_count}`,
    "",
    "## Checks",
    "",
    "| Check | Type | Status |",
    "| --- | --- | --- |",
    ...report.checks.map(
      (check) => `| ${markdownCell(check.id)} | ${markdownCell(check.type)} | ${check.status} |`,
    ),
    "",
    "## Check metrics",
    "",
    ...report.checks.flatMap((check) => [
      `### ${markdownCell(check.id)}`,
      "",
      "| Metric | Value |",
      "| --- | --- |",
      ...Object.entries(check.metrics).map(
        ([name, value]) => `| ${markdownCell(name)} | ${markdownCell(JSON.stringify(value))} |`,
      ),
      "",
    ]),
    "",
    "## Findings",
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("| Code | Check | Message |", "| --- | --- | --- |");
    for (const finding of report.findings) {
      lines.push(
        `| ${markdownCell(finding.code)} | ${markdownCell(finding.check_id ?? "-")} | ${markdownCell(finding.message)} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeEvidenceBundle({
  outputPath,
  plan,
  planText,
  planBytes = Buffer.from(planText, "utf8"),
  telemetryText,
  telemetryBytes = Buffer.from(telemetryText, "utf8"),
  telemetrySchemaText,
  runPlanSchemaText,
  reportSchema,
  reportSchemaText,
  analysis,
  generatedAt = new Date().toISOString(),
}) {
  const report = buildReport(plan, analysis, generatedAt);
  const reportErrors = [
    ...validateSchemaSubset(reportSchema, report),
    ...validateReportSemantics(report),
  ];
  if (reportErrors.length > 0) {
    throw new LabError(
      "REPORT_SCHEMA_FAILED",
      `Internal report failed its schema: ${reportErrors.map((entry) => entry.code).join(", ")}`,
      EXIT.TOOL_FAIL,
      { errors: reportErrors },
    );
  }

  const metricsText = stableJson(analysis.metrics);
  const reportJsonText = stableJson(report);
  const reportMarkdownText = renderReportMarkdown(report);

  const artifacts = {
    run_plan: await describeBinaryArtifact("run-plan.json", planBytes),
    telemetry: await describeBinaryArtifact("telemetry.ndjson", telemetryBytes),
    metrics: await describeTextArtifact("metrics.json", metricsText),
    report_json: await describeTextArtifact("report.json", reportJsonText),
    report_markdown: await describeTextArtifact("report.md", reportMarkdownText),
  };
  const schemas = {
    telemetry: await describeTextArtifact("schemas/telemetry_frame.schema.json", telemetrySchemaText),
    run_plan: await describeTextArtifact("schemas/lab_run_plan.schema.json", runPlanSchemaText),
    report: await describeTextArtifact("schemas/lab_report.schema.json", reportSchemaText),
  };
  const manifest = {
    format_version: 1,
    run_id: plan.run_id,
    created_at: generatedAt,
    command: "check",
    status: report.status,
    artifacts,
    schemas,
  };
  const manifestText = stableJson(manifest);

  const outputDirectory = await createExclusiveDirectory(outputPath);
  const schemaDirectory = await createExclusiveDirectory(path.join(outputDirectory, "schemas"));
  await writeBytes(path.join(outputDirectory, "run-plan.json"), planBytes);
  await writeBytes(path.join(outputDirectory, "telemetry.ndjson"), telemetryBytes);
  await writeText(path.join(outputDirectory, "metrics.json"), metricsText);
  await writeText(path.join(outputDirectory, "report.json"), reportJsonText);
  await writeText(path.join(outputDirectory, "report.md"), reportMarkdownText);
  await writeText(path.join(schemaDirectory, "telemetry_frame.schema.json"), telemetrySchemaText);
  await writeText(path.join(schemaDirectory, "lab_run_plan.schema.json"), runPlanSchemaText);
  await writeText(path.join(schemaDirectory, "lab_report.schema.json"), reportSchemaText);
  await writeText(path.join(outputDirectory, "manifest.json"), manifestText);

  return { outputDirectory, report, manifest };
}
