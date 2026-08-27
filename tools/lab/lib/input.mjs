import { validateSchemaSubset } from "../../lib/schema_subset.mjs";

function issue(code, message, location = undefined, details = undefined) {
  return { code, message, ...(location ? { location } : {}), ...(details ? { details } : {}) };
}

export function parseJsonText(source, discriminator, location = "$") {
  try {
    return { value: JSON.parse(source), issues: [] };
  } catch (error) {
    return {
      value: undefined,
      issues: [
        issue(
          `json_parse|${location}|${discriminator}`,
          `${location}: invalid JSON in ${discriminator}: ${error.message}`,
          location,
        ),
      ],
    };
  }
}

export function parseTelemetryNdjson(source) {
  const rawLines = source.split(/\r?\n/);
  while (rawLines.length > 0 && rawLines.at(-1) === "") {
    rawLines.pop();
  }

  const frames = [];
  const issues = [];

  rawLines.forEach((line, index) => {
    const location = `$[${index}]`;
    if (line.trim().length === 0) {
      issues.push(
        issue(
          `json_parse|${location}|telemetry`,
          `${location}: empty line is not a telemetry JSON object`,
          location,
          { line_number: index + 1 },
        ),
      );
      return;
    }
    const parsed = parseJsonText(line, "telemetry", location);
    if (parsed.issues.length > 0) {
      issues.push({ ...parsed.issues[0], details: { line_number: index + 1 } });
      return;
    }
    frames.push({ value: parsed.value, lineNumber: index + 1, location });
  });

  if (rawLines.length === 0) {
    issues.push(issue("semantic|$|telemetry_empty", "Telemetry input contains no frames", "$"));
  }

  return { frames, issues };
}

const requiredByCheckType = Object.freeze({
  sequence: ["max_sample_gap_ms"],
  static30s: [
    "start_timestamp_ms",
    "warmup_ms",
    "duration_ms",
    "max_sample_gap_ms",
    "max_new_evt",
    "max_actuator_abs",
    "max_energy",
  ],
  pulse_to_silence: [
    "pulse_timestamp_ms",
    "baseline_duration_ms",
    "response_deadline_ms",
    "settle_deadline_ms",
    "silence_duration_ms",
    "max_sample_gap_ms",
    "min_response_actuator",
    "min_response_energy",
    "max_silence_actuator",
    "max_silence_energy",
  ],
});

export function validateRunPlanSemantics(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return issues;
  }

  if (typeof plan.run_id === "string" && plan.run_id.trim().length === 0) {
    issues.push(issue("semantic|$.run_id|non_empty", "$.run_id: run_id must not be empty", "$.run_id"));
  }

  const seenIds = new Set();
  if (Array.isArray(plan.checks)) {
    plan.checks.forEach((check, index) => {
      if (!check || typeof check !== "object" || Array.isArray(check)) {
        return;
      }
      const location = `$.checks[${index}]`;
      if (typeof check.id === "string") {
        if (check.id.trim().length === 0) {
          issues.push(issue(`semantic|${location}.id|non_empty`, `${location}.id: check id must not be empty`));
        } else if (seenIds.has(check.id)) {
          issues.push(issue(`semantic|${location}.id|unique`, `${location}.id: duplicate check id ${check.id}`));
        }
        seenIds.add(check.id);
      }

      const required = requiredByCheckType[check.type] ?? [];
      for (const property of required) {
        if (!Object.prototype.hasOwnProperty.call(check, property)) {
          issues.push(
            issue(
              `semantic|${location}|${property}`,
              `${location}: ${check.type} requires ${property}`,
              location,
            ),
          );
        }
      }

      if (
        check.type === "pulse_to_silence" &&
        Number.isInteger(check.pulse_timestamp_ms) &&
        Number.isInteger(check.baseline_duration_ms) &&
        check.baseline_duration_ms > check.pulse_timestamp_ms
      ) {
        issues.push(
          issue(
            `semantic|${location}.baseline_duration_ms|before_pulse`,
            `${location}.baseline_duration_ms: baseline must fit before the pulse timestamp`,
          ),
        );
      }
      if (
        check.type === "pulse_to_silence" &&
        Number.isInteger(check.response_deadline_ms) &&
        Number.isInteger(check.settle_deadline_ms) &&
        check.response_deadline_ms > check.settle_deadline_ms
      ) {
        issues.push(
          issue(
            `semantic|${location}.response_deadline_ms|before_settle_deadline`,
            `${location}.response_deadline_ms: response deadline must not exceed settle deadline`,
          ),
        );
      }
      if (check.type === "pulse_to_silence") {
        const actuatorEnabled = check.min_response_actuator > 0;
        const energyEnabled = check.min_response_energy > 0;
        if (!actuatorEnabled && !energyEnabled) {
          issues.push(
            issue(
              `semantic|${location}|response_threshold_enabled`,
              `${location}: at least one pulse response threshold must be greater than zero`,
            ),
          );
        }
        if (
          actuatorEnabled &&
          check.min_response_actuator <= check.max_silence_actuator
        ) {
          issues.push(
            issue(
              `semantic|${location}.min_response_actuator|above_silence`,
              `${location}.min_response_actuator: enabled response threshold must exceed the silence threshold`,
            ),
          );
        }
        if (energyEnabled && check.min_response_energy <= check.max_silence_energy) {
          issues.push(
            issue(
              `semantic|${location}.min_response_energy|above_silence`,
              `${location}.min_response_energy: enabled response threshold must exceed the silence threshold`,
            ),
          );
        }
      }
      if (
        check.type === "pulse_to_silence" &&
        Number.isInteger(check.silence_duration_ms) &&
        Number.isInteger(check.settle_deadline_ms) &&
        check.silence_duration_ms > check.settle_deadline_ms
      ) {
        issues.push(
          issue(
            `semantic|${location}.silence_duration_ms|within_settle_deadline`,
            `${location}.silence_duration_ms: silence duration must fit inside settle deadline`,
          ),
        );
      }
    });
  }

  return issues;
}

export function validateReportSemantics(report) {
  const issues = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return issues;
  }
  if (
    !report.summary ||
    !Array.isArray(report.finding_codes) ||
    !Array.isArray(report.findings) ||
    !Array.isArray(report.checks)
  ) {
    return issues;
  }

  if (report.summary.finding_count !== report.findings.length) {
    issues.push(issue(
      "semantic|$.summary.finding_count|matches_findings",
      "$.summary.finding_count: value must equal findings.length",
      "$.summary.finding_count",
    ));
  }
  if (report.summary.check_count !== report.checks.length) {
    issues.push(issue(
      "semantic|$.summary.check_count|matches_checks",
      "$.summary.check_count: value must equal checks.length",
      "$.summary.check_count",
    ));
  }

  const expectedFindingCodes = [
    ...new Set(report.findings
      .map((finding) => finding?.code)
      .filter((code) => typeof code === "string")),
  ].sort();
  if (JSON.stringify(report.finding_codes) !== JSON.stringify(expectedFindingCodes)) {
    issues.push(issue(
      "semantic|$.finding_codes|matches_findings",
      "$.finding_codes: value must be the sorted unique code set from findings",
      "$.finding_codes",
    ));
  }

  const allChecksPass = report.checks.every((check) => check?.status === "pass");
  const passHasEvidence =
    Number.isSafeInteger(report.summary.frame_count) &&
    report.summary.frame_count > 0 &&
    Number.isSafeInteger(report.summary.check_count) &&
    report.summary.check_count > 0 &&
    report.checks.length > 0;
  if (
    (report.status === "pass" &&
      (report.findings.length !== 0 || !allChecksPass || !passHasEvidence)) ||
    (report.status !== "pass" && report.findings.length === 0) ||
    (report.status === "input_error" && report.checks.length !== 0)
  ) {
    issues.push(issue(
      "semantic|$.status|matches_findings_and_checks",
      "$.status: pass requires positive frame/check counts, at least one passing check, and no findings; non-pass requires findings; input_error requires no evaluated checks",
      "$.status",
    ));
  }

  const checksById = new Map();
  for (const [index, check] of report.checks.entries()) {
    if (typeof check?.id !== "string") {
      continue;
    }
    if (checksById.has(check.id)) {
      issues.push(issue(
        `semantic|$.checks[${index}].id|unique`,
        `$.checks[${index}].id: duplicate check id ${check.id}`,
        `$.checks[${index}].id`,
      ));
    }
    checksById.set(check.id, check);
  }
  for (const [index, finding] of report.findings.entries()) {
    if (typeof finding?.check_id !== "string") {
      continue;
    }
    const referencedCheck = checksById.get(finding.check_id);
    if (!referencedCheck || referencedCheck.status !== "fail") {
      issues.push(issue(
        `semantic|$.findings[${index}].check_id|failed_check`,
        `$.findings[${index}].check_id: must reference a failed check`,
        `$.findings[${index}].check_id`,
      ));
    }
  }

  return issues;
}

export function validateLabInputs({ planText, telemetryText, runPlanSchema, telemetrySchema }) {
  const planParsed = parseJsonText(planText, "run-plan");
  if (planParsed.issues.length > 0) {
    return { plan: undefined, frames: [], issues: planParsed.issues };
  }

  const issues = [
    ...validateSchemaSubset(runPlanSchema, planParsed.value),
    ...validateRunPlanSemantics(planParsed.value),
  ];
  const telemetryParsed = parseTelemetryNdjson(telemetryText);
  issues.push(...telemetryParsed.issues);

  for (const frame of telemetryParsed.frames) {
    issues.push(...validateSchemaSubset(telemetrySchema, frame.value, frame.location));
  }

  return {
    plan: planParsed.value,
    frames: telemetryParsed.frames.map((frame) => frame.value),
    issues,
  };
}

export function validatePlanOnly({ planText, runPlanSchema }) {
  const parsed = parseJsonText(planText, "run-plan");
  if (parsed.issues.length > 0) {
    return { plan: undefined, issues: parsed.issues };
  }
  return {
    plan: parsed.value,
    issues: [
      ...validateSchemaSubset(runPlanSchema, parsed.value),
      ...validateRunPlanSemantics(parsed.value),
    ],
  };
}
