#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { captureFromStdin } from "./lib/capture.mjs";
import { parseOptions, rejectUnknownOptions, requireStringOption } from "./lib/cli_args.mjs";
import { writeEvidenceBundle } from "./lib/evidence.mjs";
import { EXIT, LabError, errorMessage } from "./lib/errors.mjs";
import { runSelfTests } from "./lib/self_test.mjs";
import { evaluateCheckFiles, loadLabSchemas, validateFiles } from "./lib/workflow.mjs";

const modulePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(modulePath), "..", "..");

const usage = `Usage:
  node tools/lab/lab.mjs validate [--plan FILE] [--telemetry FILE] [--report FILE]
  node tools/lab/lab.mjs check --plan FILE --telemetry FILE --out NEW_DIRECTORY
  <producer> | node tools/lab/lab.mjs capture --out NEW_DIRECTORY
  node tools/lab/lab.mjs self-test

Exit codes: 0 pass, 2 acceptance failure, 3 input/schema failure, 4 tool failure.
capture is passive: every JSON line is retained as telemetry and every non-JSON
line is retained in transport.log. No command is sent to a device.`;

function printIssues(issues, stderr) {
  for (const issue of issues) {
    stderr.write(`[${issue.code}] ${issue.message}\n`);
  }
}

async function commandValidate(tokens, io) {
  const options = parseOptions(tokens);
  const inputNames = ["plan", "telemetry", "report"];
  rejectUnknownOptions(options, inputNames);
  const suppliedInputs = inputNames.filter((name) =>
    Object.prototype.hasOwnProperty.call(options, name));
  if (suppliedInputs.length === 0) {
    throw new LabError(
      "VALIDATE_INPUT_REQUIRED",
      "validate requires at least one of --plan, --telemetry, or --report",
      EXIT.INPUT_FAIL,
    );
  }
  const paths = Object.fromEntries(
    suppliedInputs.map((name) => [name, path.resolve(requireStringOption(options, name))]),
  );
  const schemas = await loadLabSchemas(repoRoot);
  const result = await validateFiles({
    planPath: paths.plan,
    telemetryPath: paths.telemetry,
    reportPath: paths.report,
    schemas,
  });
  if (result.issues.length > 0) {
    printIssues(result.issues, io.stderr);
    return result.exitCode;
  }
  io.stdout.write(`PASS: ${result.validatedCount} input file(s) are schema-valid.\n`);
  return EXIT.PASS;
}

async function commandCheck(tokens, io) {
  const options = parseOptions(tokens);
  rejectUnknownOptions(options, ["plan", "telemetry", "out"]);
  const planPath = path.resolve(requireStringOption(options, "plan"));
  const telemetryPath = path.resolve(requireStringOption(options, "telemetry"));
  const outputPath = path.resolve(requireStringOption(options, "out"));
  const schemas = await loadLabSchemas(repoRoot);
  const evaluation = await evaluateCheckFiles({ planPath, telemetryPath, schemas });

  if (evaluation.issues.length > 0) {
    printIssues(evaluation.issues, io.stderr);
    const reportPlan = {
      run_id:
        typeof evaluation.plan?.run_id === "string" && evaluation.plan.run_id.trim().length > 0
          ? evaluation.plan.run_id
          : "invalid-run-plan",
    };
    const bundle = await writeEvidenceBundle({
      outputPath,
      plan: reportPlan,
      planText: evaluation.planText,
      planBytes: evaluation.planBytes,
      telemetryText: evaluation.telemetryText,
      telemetryBytes: evaluation.telemetryBytes,
      telemetrySchemaText: schemas.texts.telemetry,
      runPlanSchemaText: schemas.texts.runPlan,
      reportSchema: schemas.report,
      reportSchemaText: schemas.texts.report,
      analysis: evaluation.analysis,
    });
    io.stderr.write(`Input/schema failure: diagnostic evidence written to ${bundle.outputDirectory}\n`);
    return EXIT.INPUT_FAIL;
  }

  const bundle = await writeEvidenceBundle({
    outputPath,
    plan: evaluation.plan,
    planText: evaluation.planText,
    planBytes: evaluation.planBytes,
    telemetryText: evaluation.telemetryText,
    telemetryBytes: evaluation.telemetryBytes,
    telemetrySchemaText: schemas.texts.telemetry,
    runPlanSchemaText: schemas.texts.runPlan,
    reportSchema: schemas.report,
    reportSchemaText: schemas.texts.report,
    analysis: evaluation.analysis,
  });
  const label = evaluation.exitCode === EXIT.PASS ? "PASS" : "FAIL";
  io.stdout.write(`${label}: evidence written to ${bundle.outputDirectory}\n`);
  if (evaluation.findingCodes.length > 0) {
    io.stdout.write(`Findings: ${evaluation.findingCodes.join(", ")}\n`);
  }
  return evaluation.exitCode;
}

async function commandCapture(tokens, io) {
  const options = parseOptions(tokens);
  rejectUnknownOptions(options, ["out"]);
  const outputPath = path.resolve(requireStringOption(options, "out"));
  const result = await captureFromStdin({ outputPath, readable: io.stdin });
  io.stdout.write(
    `PASS: captured ${result.manifest.counts.json_lines} JSON line(s) and ` +
      `${result.manifest.counts.non_json_lines} transport line(s) to ${result.outputDirectory}\n`,
  );
  return EXIT.PASS;
}

async function commandSelfTest(tokens, io) {
  if (tokens.length > 0) {
    throw new LabError("INVALID_ARGUMENT", "self-test accepts no options", EXIT.INPUT_FAIL);
  }
  const result = await runSelfTests(repoRoot);
  for (const entry of result.results) {
    io.stdout.write(`${entry.passed ? "PASS" : "FAIL"} ${entry.name}\n`);
    if (!entry.passed) {
      io.stdout.write(`  expected exit/codes: ${entry.expected_exit} ${JSON.stringify(entry.expected_codes)}\n`);
      io.stdout.write(`  actual exit/codes:   ${entry.actual_exit} ${JSON.stringify(entry.actual_codes)}\n`);
    }
  }
  if (!result.passed) {
    throw new LabError("SELF_TEST_FAILED", "One or more lab-tool fixtures failed", EXIT.TOOL_FAIL);
  }
  io.stdout.write(`PASS: ${result.results.length} lab-tool fixture(s).\n`);
  return EXIT.PASS;
}

export async function main(argv = process.argv.slice(2), io = process) {
  const command = argv[0];
  const tokens = argv.slice(1);
  try {
    if (command === undefined || command === "help" || command === "--help" || command === "-h") {
      io.stdout.write(`${usage}\n`);
      return command === undefined ? EXIT.INPUT_FAIL : EXIT.PASS;
    }
    if (command === "validate") {
      return await commandValidate(tokens, io);
    }
    if (command === "check") {
      return await commandCheck(tokens, io);
    }
    if (command === "capture") {
      return await commandCapture(tokens, io);
    }
    if (command === "self-test") {
      return await commandSelfTest(tokens, io);
    }
    throw new LabError("UNKNOWN_COMMAND", `Unknown command: ${command}`, EXIT.INPUT_FAIL);
  } catch (error) {
    const code = error instanceof LabError ? error.code : "UNEXPECTED_TOOL_ERROR";
    const exitCode = error instanceof LabError ? error.exitCode : EXIT.TOOL_FAIL;
    io.stderr.write(`[${code}] ${errorMessage(error)}\n`);
    return exitCode;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  process.exitCode = await main();
}
