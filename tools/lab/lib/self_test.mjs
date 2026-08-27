import path from "node:path";

import { readText } from "../adapters/file.mjs";
import { EXIT, LabError } from "./errors.mjs";
import { evaluateCheckTexts, loadLabSchemas } from "./workflow.mjs";

export async function runSelfTests(repoRoot) {
  const casesPath = path.join(repoRoot, "test", "lab", "cases.json");
  const casesText = await readText(casesPath, "lab self-test cases");
  let cases;
  try {
    cases = JSON.parse(casesText);
  } catch (error) {
    throw new LabError(
      "SELF_TEST_CASES_INVALID",
      `Lab self-test case manifest is invalid JSON: ${error.message}`,
      EXIT.TOOL_FAIL,
    );
  }
  if (!Array.isArray(cases)) {
    throw new LabError(
      "SELF_TEST_CASES_INVALID",
      "Lab self-test case manifest must be an array",
      EXIT.TOOL_FAIL,
    );
  }

  const schemas = await loadLabSchemas(repoRoot);
  const results = [];
  for (const fixtureCase of cases) {
    const planPath = path.join(repoRoot, "test", "lab", fixtureCase.plan);
    const telemetryPath = path.join(repoRoot, "test", "lab", fixtureCase.telemetry);
    const [planText, telemetryText] = await Promise.all([
      readText(planPath, `${fixtureCase.name} run plan`),
      readText(telemetryPath, `${fixtureCase.name} telemetry`),
    ]);
    const actual = evaluateCheckTexts({ planText, telemetryText, schemas });
    const expectedCodes = [...fixtureCase.expected_codes].sort();
    const actualCodes = [...actual.findingCodes].sort();
    const passed =
      actual.exitCode === fixtureCase.expected_exit &&
      JSON.stringify(actualCodes) === JSON.stringify(expectedCodes);
    results.push({
      name: fixtureCase.name,
      passed,
      expected_exit: fixtureCase.expected_exit,
      actual_exit: actual.exitCode,
      expected_codes: expectedCodes,
      actual_codes: actualCodes,
    });
  }

  return {
    passed: results.every((result) => result.passed),
    results,
  };
}
