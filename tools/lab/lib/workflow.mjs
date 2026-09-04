import path from "node:path";

import { validateSchemaSubset } from "../../lib/schema_subset.mjs";
import { decodeUtf8Bytes, readBytes, readText } from "../adapters/file.mjs";
import { analyzeTelemetry } from "./analyze.mjs";
import { EXIT, LabError, errorMessage } from "./errors.mjs";
import {
  parseJsonText,
  parseTelemetryNdjson,
  validateReportSemantics,
  validateLabInputs,
  validatePlanOnly,
} from "./input.mjs";

const schemaRelativePaths = Object.freeze({
  telemetry: "schemas/telemetry_frame.schema.json",
  runPlan: "schemas/lab_run_plan.schema.json",
  report: "schemas/lab_report.schema.json",
});

function parseInternalSchema(text, relativePath) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new LabError(
      "INTERNAL_SCHEMA_PARSE_FAILED",
      `Repository schema ${relativePath} is invalid JSON: ${errorMessage(error)}`,
      EXIT.TOOL_FAIL,
    );
  }
}

export async function loadLabSchemas(repoRoot) {
  const telemetryPath = path.join(repoRoot, schemaRelativePaths.telemetry);
  const runPlanPath = path.join(repoRoot, schemaRelativePaths.runPlan);
  const reportPath = path.join(repoRoot, schemaRelativePaths.report);
  let telemetryText;
  let runPlanText;
  let reportText;
  try {
    [telemetryText, runPlanText, reportText] = await Promise.all([
      readText(telemetryPath, "telemetry schema"),
      readText(runPlanPath, "run-plan schema"),
      readText(reportPath, "report schema"),
    ]);
  } catch (error) {
    throw new LabError(
      "INTERNAL_SCHEMA_READ_FAILED",
      `Could not load repository schemas: ${errorMessage(error)}`,
      EXIT.TOOL_FAIL,
    );
  }
  return {
    telemetry: parseInternalSchema(telemetryText, schemaRelativePaths.telemetry),
    runPlan: parseInternalSchema(runPlanText, schemaRelativePaths.runPlan),
    report: parseInternalSchema(reportText, schemaRelativePaths.report),
    texts: { telemetry: telemetryText, runPlan: runPlanText, report: reportText },
  };
}

export function evaluateCheckTexts({ planText, telemetryText, schemas, inputIssues = [] }) {
  const validated = validateLabInputs({
    planText,
    telemetryText,
    runPlanSchema: schemas.runPlan,
    telemetrySchema: schemas.telemetry,
  });
  const allIssues = [...inputIssues, ...validated.issues];
  if (allIssues.length > 0) {
    const timestamps = validated.frames
      .map((frame) => frame?.timestamp_ms)
      .filter(
        (value) =>
          Number.isSafeInteger(value) &&
          value >= 0 &&
          value <= Number.MAX_SAFE_INTEGER,
      );
    const diagnosticDurationMs =
      timestamps.length > 1 && timestamps.at(-1) >= timestamps[0]
        ? timestamps.at(-1) - timestamps[0]
        : 0;
    const findings = allIssues.map(({ code, message, ...details }) => ({
      code,
      message,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    }));
    const findingCodes = [...new Set(findings.map((entry) => entry.code))].sort();
    const analysis = {
      status: "input_error",
      findings,
      findingCodes,
      checks: [],
      metrics: {
        schema_version: 1,
        frame_summary: {
          count: validated.frames.length,
          // Input-error reports must themselves remain schema-valid so the
          // original invalid bytes can always be preserved in the bundle.
          duration_ms: Number.isSafeInteger(diagnosticDurationMs)
            ? diagnosticDurationMs
            : 0,
        },
        input_validation: {
          issue_count: findings.length,
          finding_codes: findingCodes,
        },
        checks: [],
      },
    };
    return {
      exitCode: EXIT.INPUT_FAIL,
      issues: allIssues,
      findingCodes,
      plan: validated.plan,
      frames: validated.frames,
      analysis,
    };
  }

  const analysis = analyzeTelemetry(validated.plan, validated.frames);
  return {
    exitCode: analysis.findings.length === 0 ? EXIT.PASS : EXIT.ACCEPTANCE_FAIL,
    issues: [],
    findingCodes: analysis.findingCodes,
    plan: validated.plan,
    frames: validated.frames,
    analysis,
  };
}

export async function evaluateCheckFiles({ planPath, telemetryPath, schemas }) {
  const [planBytes, telemetryBytes] = await Promise.all([
    readBytes(planPath, "run plan"),
    readBytes(telemetryPath, "telemetry"),
  ]);
  const inputIssues = [];
  const decodeForEvidence = (bytes, label, discriminator) => {
    try {
      return decodeUtf8Bytes(bytes, label);
    } catch (error) {
      if (!(error instanceof LabError) || error.code !== "INPUT_UTF8_INVALID") {
        throw error;
      }
      inputIssues.push({
        code: `utf8_decode|$|${discriminator}`,
        message: `$: invalid UTF-8 in ${label}`,
        location: "$",
      });
      return bytes.toString("utf8");
    }
  };
  const planText = decodeForEvidence(planBytes, "run plan", "run-plan");
  const telemetryText = decodeForEvidence(telemetryBytes, "telemetry", "telemetry");
  return {
    ...evaluateCheckTexts({ planText, telemetryText, schemas, inputIssues }),
    planText,
    telemetryText,
    planBytes,
    telemetryBytes,
  };
}

export async function validateFiles({ planPath, telemetryPath, reportPath, schemas }) {
  const issues = [];
  let validatedCount = 0;

  if (planPath) {
    const planText = await readText(planPath, "run plan");
    const result = validatePlanOnly({ planText, runPlanSchema: schemas.runPlan });
    issues.push(...result.issues);
    validatedCount += 1;
  }

  if (telemetryPath) {
    const telemetryText = await readText(telemetryPath, "telemetry");
    const result = parseTelemetryNdjson(telemetryText);
    issues.push(...result.issues);
    for (const frame of result.frames) {
      issues.push(...validateSchemaSubset(schemas.telemetry, frame.value, frame.location));
    }
    validatedCount += 1;
  }

  if (reportPath) {
    const reportText = await readText(reportPath, "lab report");
    const result = parseJsonText(reportText, "lab-report");
    issues.push(...result.issues);
    if (result.issues.length === 0) {
      const schemaIssues = validateSchemaSubset(schemas.report, result.value);
      issues.push(...schemaIssues);
      if (schemaIssues.length === 0) {
        issues.push(...validateReportSemantics(result.value));
      }
    }
    validatedCount += 1;
  }

  if (validatedCount === 0) {
    throw new LabError(
      "VALIDATE_INPUT_REQUIRED",
      "validate requires at least one of --plan, --telemetry, or --report",
      EXIT.INPUT_FAIL,
    );
  }

  return { exitCode: issues.length === 0 ? EXIT.PASS : EXIT.INPUT_FAIL, issues, validatedCount };
}
