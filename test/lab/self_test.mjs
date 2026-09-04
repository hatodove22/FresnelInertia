import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { captureFromStdin, classifyCapturedLines } from "../../tools/lab/lib/capture.mjs";
import { main as labMain } from "../../tools/lab/lab.mjs";
import { writeEvidenceBundle } from "../../tools/lab/lib/evidence.mjs";
import { LabError } from "../../tools/lab/lib/errors.mjs";
import { runSelfTests } from "../../tools/lab/lib/self_test.mjs";
import {
  evaluateCheckFiles,
  evaluateCheckTexts,
  loadLabSchemas,
} from "../../tools/lab/lib/workflow.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, "..", "..");

test("all dry-run fixtures return exact exit and finding codes", async () => {
  const result = await runSelfTests(repoRoot);
  assert.equal(result.passed, true, JSON.stringify(result.results, null, 2));
  assert.equal(result.results.length, 20);
});

test("full-timing fixture plan stays aligned with the Gate 1 pulse template", async () => {
  const [staticTemplate, template, s1OffTemplate, fixturePlan, fixtureTelemetry] = await Promise.all([
    fs.readFile(path.join(repoRoot, "tools", "lab", "plans", "gate1-static.template.json"), "utf8"),
    fs.readFile(path.join(repoRoot, "tools", "lab", "plans", "gate1-pulse.template.json"), "utf8"),
    fs.readFile(
      path.join(repoRoot, "tools", "lab", "plans", "gate1-pulse-s1-off.template.json"),
      "utf8",
    ),
    fs.readFile(path.join(testDirectory, "fixtures", "gate1_pulse_complete.plan.json"), "utf8"),
    fs.readFile(path.join(testDirectory, "fixtures", "gate1_pulse_40s_pass.ndjson"), "utf8"),
  ]);
  const parsedStaticTemplate = JSON.parse(staticTemplate);
  const parsedTemplate = JSON.parse(template);
  const parsedS1OffTemplate = JSON.parse(s1OffTemplate);
  assert.deepEqual(JSON.parse(fixturePlan).checks, parsedTemplate.checks);
  assert.deepEqual(parsedS1OffTemplate.checks, parsedTemplate.checks);
  for (const activeTemplate of [parsedStaticTemplate, parsedTemplate]) {
    assert.equal(activeTemplate.metadata.preset_id, "liquid_small_box");
    assert.equal(activeTemplate.metadata.gate1_run_variant, "active");
    assert.equal(activeTemplate.metadata.s1_state, "on");
  }
  assert.equal(parsedS1OffTemplate.metadata.preset_id, "liquid_small_box");
  assert.equal(parsedS1OffTemplate.metadata.gate1_run_variant, "s1_off_control");
  assert.equal(parsedS1OffTemplate.metadata.s1_state, "off");

  const schemas = await loadLabSchemas(repoRoot);
  const shortFrames = fixtureTelemetry.trim().split(/\r?\n/).slice(0, -1);
  const shortCapture = evaluateCheckTexts({
    planText: fixturePlan,
    telemetryText: `${shortFrames.join("\n")}\n`,
    schemas,
  });
  assert.equal(shortCapture.exitCode, 2);
  assert.deepEqual(shortCapture.findingCodes, ["PULSE_CAPTURE_TOO_SHORT"]);
  assert.equal(
    shortCapture.analysis.checks[1].metrics.captured_duration_ms,
    39500,
  );

  const postSilenceSpikeFrames = fixtureTelemetry
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const postSilenceSpike = postSilenceSpikeFrames.find(
    (frame) => frame.timestamp_ms === 38500,
  );
  postSilenceSpike.mass.energy = 0.1;
  postSilenceSpike.actuators = [0.1, 0.1, 0.1, 0.1];
  const recurrentPulseActivity = evaluateCheckTexts({
    planText: fixturePlan,
    telemetryText: `${postSilenceSpikeFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(recurrentPulseActivity.exitCode, 2);
  assert.deepEqual(recurrentPulseActivity.findingCodes, ["PULSE_SILENCE_NOT_REACHED"]);
});

test("first-frame timestamp origin resolves offsets into captured timestamps", async () => {
  const schemas = await loadLabSchemas(repoRoot);
  const evaluation = await evaluateCheckFiles({
    planPath: path.join(testDirectory, "fixtures", "static_first_frame.plan.json"),
    telemetryPath: path.join(testDirectory, "fixtures", "static_first_frame_pass.ndjson"),
    schemas,
  });
  assert.equal(evaluation.exitCode, 0);
  assert.equal(evaluation.analysis.metrics.timestamp_origin, "first_frame");
  assert.equal(evaluation.analysis.metrics.timestamp_base_ms, 1234000);
  assert.equal(
    evaluation.analysis.checks[0].metrics.resolved_capture_start_timestamp_ms,
    1234000,
  );
  assert.equal(evaluation.analysis.checks[0].metrics.assessment_start_ms, 1239000);

  const hardwarePlanPath = path.join(
    testDirectory,
    "fixtures",
    "hardware_static_complete.plan.json",
  );
  const hardwareTelemetryPath = path.join(
    testDirectory,
    "fixtures",
    "hardware_static_pass.ndjson",
  );
  const hardwareEvaluation = await evaluateCheckFiles({
    planPath: hardwarePlanPath,
    telemetryPath: hardwareTelemetryPath,
    schemas,
  });
  assert.equal(hardwareEvaluation.exitCode, 0);
  assert.equal(
    hardwareEvaluation.analysis.metrics.hardware_evidence.active_context_end_timestamp_ms,
    33000,
  );
  assert.deepEqual(
    hardwareEvaluation.analysis.metrics.hardware_evidence.final_safe_idle_mismatches,
    [],
  );
  assert.equal(hardwareEvaluation.analysis.metrics.hardware_evidence.complete, true);

  const withoutFinalIdle = evaluateCheckTexts({
    planText: await fs.readFile(hardwarePlanPath, "utf8"),
    telemetryText: (await fs.readFile(hardwareTelemetryPath, "utf8"))
      .trim()
      .split(/\r?\n/)
      .slice(0, -1)
      .join("\n"),
    schemas,
  });
  assert.equal(withoutFinalIdle.exitCode, 2);
  assert.deepEqual(withoutFinalIdle.findingCodes, [
    "FINAL_SAFE_IDLE_NOT_PROVEN",
    "USB_TELEMETRY_EVIDENCE_FAILED",
  ]);

  const unsafeFinalFrames = (await fs.readFile(hardwareTelemetryPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  unsafeFinalFrames.at(-1).audio.test_mode = true;
  unsafeFinalFrames.at(-1).audio.demo_compat_mode = true;
  const unclearedChannelTest = evaluateCheckTexts({
    planText: await fs.readFile(hardwarePlanPath, "utf8"),
    telemetryText: `${unsafeFinalFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(unclearedChannelTest.exitCode, 2);
  assert.deepEqual(unclearedChannelTest.findingCodes, [
    "FINAL_SAFE_IDLE_NOT_PROVEN",
    "RUN_TELEMETRY_CONTEXT_MISMATCH",
  ]);
  assert.deepEqual(
    unclearedChannelTest.analysis.metrics.hardware_evidence.final_safe_idle_mismatches,
    [
      { field: "audio.test_mode", expected: false, actual: true },
      { field: "audio.demo_compat_mode", expected: false, actual: true },
    ],
  );
  assert.equal(unclearedChannelTest.analysis.metrics.hardware_evidence.complete, false);

  const preActiveFrames = (await fs.readFile(hardwareTelemetryPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  preActiveFrames[0].run_mode = "idle";
  preActiveFrames[0].audio.runtime_enabled = false;
  preActiveFrames[0].audio.output_silenced = true;
  const preActiveCanonicalJson = evaluateCheckTexts({
    planText: await fs.readFile(hardwarePlanPath, "utf8"),
    telemetryText: `${preActiveFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(preActiveCanonicalJson.exitCode, 2);
  assert.deepEqual(preActiveCanonicalJson.findingCodes, ["RUN_TELEMETRY_CONTEXT_MISMATCH"]);
  assert.equal(
    preActiveCanonicalJson.analysis.metrics.hardware_evidence.active_context_start_timestamp_ms,
    0,
  );

  const unsafeActiveFrames = (await fs.readFile(hardwareTelemetryPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  unsafeActiveFrames[1].audio.compile_enabled = false;
  unsafeActiveFrames[1].audio.driver_installed = false;
  unsafeActiveFrames[1].audio.output_silenced = true;
  unsafeActiveFrames[1].audio.test_mode = true;
  unsafeActiveFrames[1].audio.demo_compat_mode = true;
  unsafeActiveFrames[1].audio.test_wall = "Front";
  unsafeActiveFrames[1].audio.transport = "dual_i2s";
  unsafeActiveFrames[1].audio.output_layout = "front_back_2ch";
  unsafeActiveFrames[1].audio.active_output_channels = 2;
  unsafeActiveFrames[1].audio.underrun_count = 1;
  unsafeActiveFrames[1].safety.imu_fault_injection_active = true;
  unsafeActiveFrames[1].safety.audio_zero_asserted = true;
  unsafeActiveFrames[1].safety.tilt_disarmed = false;
  const unsafeActiveContext = evaluateCheckTexts({
    planText: await fs.readFile(hardwarePlanPath, "utf8"),
    telemetryText: `${unsafeActiveFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(unsafeActiveContext.exitCode, 2);
  assert.deepEqual(unsafeActiveContext.findingCodes, ["RUN_TELEMETRY_CONTEXT_MISMATCH"]);
  assert.deepEqual(
    unsafeActiveContext.analysis.metrics.hardware_evidence.telemetry_context_mismatches
      .map((mismatch) => mismatch.field),
    [
      "audio.compile_enabled",
      "audio.driver_installed",
      "audio.output_silenced",
      "audio.test_mode",
      "audio.demo_compat_mode",
      "audio.test_wall",
      "audio.transport",
      "audio.output_layout",
      "audio.active_output_channels",
      "audio.underrun_count",
      "safety.imu_fault_injection_active",
      "safety.audio_zero_asserted",
      "safety.tilt_disarmed",
    ],
  );

  const degradedPlan = JSON.parse(await fs.readFile(hardwarePlanPath, "utf8"));
  degradedPlan.metadata.platformio_environment = "m5stack-sticks3-audio";
  degradedPlan.metadata.effective_output_peak_limit = 0;
  degradedPlan.metadata.supply_12v_state = "off";
  degradedPlan.metadata.expected_run_mode = "idle";
  degradedPlan.metadata.expected_audio_runtime_enabled = false;
  degradedPlan.metadata.expected_audio_compile_enabled = false;
  degradedPlan.metadata.expected_audio_driver_installed = false;
  degradedPlan.metadata.expected_audio_transport = "dual_i2s";
  degradedPlan.metadata.expected_audio_output_layout = "front_back_2ch";
  degradedPlan.metadata.expected_active_output_channels = 2;
  const matchingDegradedFrames = (await fs.readFile(hardwareTelemetryPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  for (const frame of matchingDegradedFrames) {
    frame.run_mode = "idle";
    frame.audio.compile_enabled = false;
    frame.audio.driver_installed = false;
    frame.audio.runtime_enabled = false;
    frame.audio.output_silenced = true;
    frame.audio.demo_compat_mode = true;
    frame.audio.transport = "dual_i2s";
    frame.audio.output_layout = "front_back_2ch";
    frame.audio.active_output_channels = 2;
    frame.audio.output_peak_limit = 0;
    frame.safety.audio_zero_asserted = true;
  }
  const matchingDegradedContext = evaluateCheckTexts({
    planText: JSON.stringify(degradedPlan),
    telemetryText: `${matchingDegradedFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(matchingDegradedContext.exitCode, 2);
  assert.deepEqual(matchingDegradedContext.findingCodes, ["RUN_METADATA_INCOMPLETE"]);
  assert.deepEqual(
    matchingDegradedContext.analysis.metrics.hardware_evidence.invalid_fields,
    [
      "metadata.effective_output_peak_limit",
      "metadata.expected_active_output_channels",
      "metadata.expected_audio_compile_enabled",
      "metadata.expected_audio_driver_installed",
      "metadata.expected_audio_output_layout",
      "metadata.expected_audio_runtime_enabled",
      "metadata.expected_audio_transport",
      "metadata.expected_run_mode",
      "metadata.platformio_environment",
      "metadata.supply_12v_state",
    ],
  );

  const canonicalHardwarePlan = JSON.parse(await fs.readFile(hardwarePlanPath, "utf8"));
  const canonicalHardwareFrames = (await fs.readFile(hardwareTelemetryPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const evaluateHardware = (plan, frames = canonicalHardwareFrames) => evaluateCheckTexts({
    planText: JSON.stringify(plan),
    telemetryText: `${frames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });

  const placeholderPlan = structuredClone(canonicalHardwarePlan);
  placeholderPlan.run_id = "TBD";
  placeholderPlan.metadata.git_commit = "TODO";
  placeholderPlan.metadata.build_id = "N/A";
  placeholderPlan.metadata.preset_hash = "?";
  placeholderPlan.metadata.resolved_feature_flags = "-";
  placeholderPlan.metadata.calibration_identity = "pending";
  placeholderPlan.metadata.fixture_orientation = "T.B.D.";
  placeholderPlan.metadata.operator_observation = "not applicable";
  const placeholderEvidence = evaluateHardware(placeholderPlan);
  assert.equal(placeholderEvidence.exitCode, 2);
  assert.deepEqual(placeholderEvidence.findingCodes, ["RUN_METADATA_INCOMPLETE"]);
  assert.deepEqual(
    placeholderEvidence.analysis.metrics.hardware_evidence.invalid_fields,
    [
      "metadata.build_id",
      "metadata.calibration_identity",
      "metadata.fixture_orientation",
      "metadata.git_commit",
      "metadata.operator_observation",
      "metadata.preset_hash",
      "metadata.resolved_feature_flags",
      "run_id",
    ],
  );

  const earlySafeIdleFrames = structuredClone(canonicalHardwareFrames);
  const earlySafeIdle = structuredClone(earlySafeIdleFrames.at(-1));
  earlySafeIdle.timestamp_ms = earlySafeIdleFrames.at(-2).timestamp_ms;
  earlySafeIdle.frame_counter = earlySafeIdleFrames.at(-2).frame_counter;
  earlySafeIdleFrames[earlySafeIdleFrames.length - 2] = earlySafeIdle;
  const earlySafeIdleAttempt = evaluateHardware(
    canonicalHardwarePlan,
    earlySafeIdleFrames,
  );
  assert.equal(earlySafeIdleAttempt.exitCode, 2);
  assert.deepEqual(earlySafeIdleAttempt.findingCodes, [
    "RUN_TELEMETRY_CONTEXT_MISMATCH",
  ]);

  const shortenedStaticFrames = structuredClone(canonicalHardwareFrames);
  shortenedStaticFrames.splice(-2, 1);
  shortenedStaticFrames.at(-1).timestamp_ms = 32999;
  const shortenedStaticPlan = structuredClone(canonicalHardwarePlan);
  shortenedStaticPlan.metadata.usb_telemetry_status_after.transmitted_frames -= 1;
  const shortenedStaticCapture = evaluateHardware(
    shortenedStaticPlan,
    shortenedStaticFrames,
  );
  assert.equal(shortenedStaticCapture.exitCode, 2);
  assert.deepEqual(shortenedStaticCapture.findingCodes, ["STATIC_CAPTURE_TOO_SHORT"]);
  assert.equal(
    shortenedStaticCapture.analysis.checks[0].metrics.captured_duration_ms,
    32999,
  );

  const recurrentStaticFrames = structuredClone(canonicalHardwareFrames);
  recurrentStaticFrames.at(-2).mass.energy = 0.1;
  recurrentStaticFrames.at(-2).actuators = [0.1, 0.1, 0.1, 0.1];
  const recurrentStaticActivity = evaluateHardware(
    canonicalHardwarePlan,
    recurrentStaticFrames,
  );
  assert.equal(recurrentStaticActivity.exitCode, 2);
  assert.deepEqual(recurrentStaticActivity.findingCodes, [
    "STATIC_ACTUATOR_ABOVE_LIMIT",
    "STATIC_ENERGY_ABOVE_LIMIT",
  ]);

  const absoluteOriginPlan = structuredClone(canonicalHardwarePlan);
  absoluteOriginPlan.timestamp_origin = "absolute";
  const absoluteOrigin = evaluateHardware(absoluteOriginPlan);
  assert.equal(absoluteOrigin.exitCode, 2);
  assert.deepEqual(absoluteOrigin.findingCodes, ["RUN_METADATA_INCOMPLETE"]);
  assert.deepEqual(absoluteOrigin.analysis.metrics.hardware_evidence.invalid_fields, [
    "timestamp_origin",
  ]);

  const contiguousPlan = structuredClone(canonicalHardwarePlan);
  contiguousPlan.frame_counter_mode = "contiguous";
  const contiguousFrames = structuredClone(canonicalHardwareFrames);
  contiguousFrames.forEach((frame, index) => {
    frame.frame_counter = 1000 + index;
  });
  const contiguousAttempt = evaluateHardware(contiguousPlan, contiguousFrames);
  assert.equal(contiguousAttempt.exitCode, 2);
  assert.deepEqual(contiguousAttempt.findingCodes, ["RUN_METADATA_INCOMPLETE"]);
  assert.deepEqual(contiguousAttempt.analysis.metrics.hardware_evidence.invalid_fields, [
    "frame_counter_mode",
  ]);

  for (const [variant, s1State] of [["active", "off"], ["s1_off_control", "on"]]) {
    const mismatchedS1Plan = structuredClone(canonicalHardwarePlan);
    mismatchedS1Plan.metadata.gate1_run_variant = variant;
    mismatchedS1Plan.metadata.s1_state = s1State;
    const mismatchedS1 = evaluateHardware(mismatchedS1Plan);
    assert.equal(mismatchedS1.exitCode, 2);
    assert.deepEqual(
      mismatchedS1.findingCodes,
      variant === "active"
        ? ["RUN_METADATA_INCOMPLETE"]
        : ["RUN_METADATA_INCOMPLETE", "RUN_PLAN_CONTRACT_MISMATCH"],
    );
    assert.deepEqual(mismatchedS1.analysis.metrics.hardware_evidence.invalid_fields, [
      "metadata.s1_state",
    ]);
  }

  const wrongPresetPlan = structuredClone(canonicalHardwarePlan);
  wrongPresetPlan.metadata.preset_id = "granular_single_marble_box";
  const wrongPreset = evaluateHardware(wrongPresetPlan);
  assert.equal(wrongPreset.exitCode, 2);
  assert.deepEqual(wrongPreset.findingCodes, ["RUN_METADATA_INCOMPLETE"]);
  assert.deepEqual(wrongPreset.analysis.metrics.hardware_evidence.invalid_fields, [
    "metadata.preset_id",
  ]);

  const authorizationBypassPlan = structuredClone(canonicalHardwarePlan);
  authorizationBypassPlan.metadata.physical_output_authorization_required = false;
  const authorizationBypass = evaluateHardware(authorizationBypassPlan);
  assert.equal(authorizationBypass.exitCode, 2);
  assert.deepEqual(authorizationBypass.findingCodes, ["RUN_METADATA_INCOMPLETE"]);
  assert.equal(authorizationBypass.analysis.metrics.hardware_evidence.required, true);
  assert.deepEqual(authorizationBypass.analysis.metrics.hardware_evidence.invalid_fields, [
    "metadata.physical_output_authorization_required",
  ]);

  const wrongHardwareProfilePlan = structuredClone(canonicalHardwarePlan);
  wrongHardwareProfilePlan.metadata.hardware_profile = "some AtomS3 board";
  const wrongHardwareProfile = evaluateHardware(wrongHardwareProfilePlan);
  assert.equal(wrongHardwareProfile.exitCode, 2);
  assert.deepEqual(wrongHardwareProfile.findingCodes, ["RUN_METADATA_INCOMPLETE"]);
  assert.deepEqual(wrongHardwareProfile.analysis.metrics.hardware_evidence.invalid_fields, [
    "metadata.hardware_profile",
  ]);

  const operatorRejectedPlan = structuredClone(canonicalHardwarePlan);
  operatorRejectedPlan.metadata.operator_observation_outcome = "fail";
  const operatorRejected = evaluateHardware(operatorRejectedPlan);
  assert.equal(operatorRejected.exitCode, 2);
  assert.deepEqual(operatorRejected.findingCodes, ["OPERATOR_OBSERVATION_FAILED"]);
  assert.equal(operatorRejected.analysis.metrics.hardware_evidence.complete, false);

  const s1OffStaticPlan = structuredClone(canonicalHardwarePlan);
  s1OffStaticPlan.metadata.gate1_run_variant = "s1_off_control";
  s1OffStaticPlan.metadata.s1_state = "off";
  const s1OffStatic = evaluateHardware(s1OffStaticPlan);
  assert.equal(s1OffStatic.exitCode, 2);
  assert.deepEqual(s1OffStatic.findingCodes, ["RUN_PLAN_CONTRACT_MISMATCH"]);

  const multipleMeasurementsPlan = structuredClone(canonicalHardwarePlan);
  multipleMeasurementsPlan.checks.push({
    ...structuredClone(multipleMeasurementsPlan.checks[0]),
    id: "second-static-hold",
  });
  const multipleMeasurements = evaluateHardware(multipleMeasurementsPlan);
  assert.equal(multipleMeasurements.exitCode, 2);
  assert.deepEqual(multipleMeasurements.findingCodes, ["RUN_PLAN_CONTRACT_MISMATCH"]);

  const missingSequencePlan = structuredClone(canonicalHardwarePlan);
  missingSequencePlan.checks = missingSequencePlan.checks.filter(
    (check) => check.type !== "sequence",
  );
  const missingSequence = evaluateHardware(missingSequencePlan);
  assert.equal(missingSequence.exitCode, 2);
  assert.deepEqual(missingSequence.findingCodes, ["RUN_PLAN_CONTRACT_MISMATCH"]);

  const relaxedThresholdPlan = structuredClone(canonicalHardwarePlan);
  relaxedThresholdPlan.checks[0].max_energy = 1;
  const relaxedThreshold = evaluateHardware(relaxedThresholdPlan);
  assert.equal(relaxedThreshold.exitCode, 2);
  assert.deepEqual(relaxedThreshold.findingCodes, ["RUN_PLAN_CONTRACT_MISMATCH"]);

  const transportDropPlan = structuredClone(canonicalHardwarePlan);
  transportDropPlan.metadata.usb_telemetry_status_after.dropped_frames = 1;
  const transportDrop = evaluateHardware(transportDropPlan);
  assert.equal(transportDrop.exitCode, 2);
  assert.deepEqual(transportDrop.findingCodes, ["USB_TELEMETRY_EVIDENCE_FAILED"]);

  const transmittedCountMismatchPlan = structuredClone(canonicalHardwarePlan);
  transmittedCountMismatchPlan.metadata.usb_telemetry_status_after.transmitted_frames = 1;
  const transmittedCountMismatch = evaluateHardware(transmittedCountMismatchPlan);
  assert.equal(transmittedCountMismatch.exitCode, 2);
  assert.deepEqual(transmittedCountMismatch.findingCodes, ["USB_TELEMETRY_EVIDENCE_FAILED"]);

  const inconsistentDropTotalPlan = structuredClone(canonicalHardwarePlan);
  for (const snapshotName of ["usb_telemetry_status_before", "usb_telemetry_status_after"]) {
    inconsistentDropTotalPlan.metadata[snapshotName].backpressure_dropped_frames = 1;
  }
  const inconsistentDropTotal = evaluateHardware(inconsistentDropTotalPlan);
  assert.equal(inconsistentDropTotal.exitCode, 2);
  assert.deepEqual(inconsistentDropTotal.findingCodes, ["USB_TELEMETRY_EVIDENCE_FAILED"]);

  const wrongTelemetryPeriodPlan = structuredClone(canonicalHardwarePlan);
  wrongTelemetryPeriodPlan.metadata.usb_telemetry_status_before.period_ms = 5000;
  wrongTelemetryPeriodPlan.metadata.usb_telemetry_status_after.period_ms = 5000;
  const wrongTelemetryPeriod = evaluateHardware(wrongTelemetryPeriodPlan);
  assert.equal(wrongTelemetryPeriod.exitCode, 2);
  assert.deepEqual(wrongTelemetryPeriod.findingCodes, ["USB_TELEMETRY_EVIDENCE_FAILED"]);

  const invalidUsbStatusPlan = structuredClone(canonicalHardwarePlan);
  invalidUsbStatusPlan.metadata.usb_telemetry_status_before = 7;
  const invalidUsbStatus = evaluateHardware(invalidUsbStatusPlan);
  assert.equal(invalidUsbStatus.exitCode, 3);
  assert.ok(
    invalidUsbStatus.issues.some(
      (issue) => issue.code === "type|$.metadata.usb_telemetry_status_before|object",
    ),
  );

  const intermittentInvalidImuFrames = structuredClone(canonicalHardwareFrames);
  intermittentInvalidImuFrames[10].imu.valid = false;
  const intermittentInvalidImu = evaluateHardware(
    canonicalHardwarePlan,
    intermittentInvalidImuFrames,
  );
  assert.equal(intermittentInvalidImu.exitCode, 2);
  assert.equal(intermittentInvalidImu.analysis.metrics.hardware_evidence.complete, false);
  assert.deepEqual(intermittentInvalidImu.findingCodes, ["RUN_TELEMETRY_CONTEXT_MISMATCH"]);
  assert.deepEqual(
    intermittentInvalidImu.analysis.metrics.hardware_evidence.telemetry_context_mismatches
      .map((mismatch) => mismatch.field),
    ["imu.valid"],
  );

  const finalEventFrames = structuredClone(canonicalHardwareFrames);
  finalEventFrames.at(-1).evt_total = finalEventFrames.at(-2).evt_total + 1;
  const finalEvent = evaluateHardware(canonicalHardwarePlan, finalEventFrames);
  assert.equal(finalEvent.exitCode, 2);
  assert.deepEqual(finalEvent.findingCodes, ["FINAL_SAFE_IDLE_NOT_PROVEN"]);
  assert.deepEqual(finalEvent.analysis.metrics.hardware_evidence.final_safe_idle_mismatches, [
    {
      field: "evt_total",
      expected: "unchanged from active-end value 0",
      actual: 1,
    },
  ]);

  const postLivePlan = structuredClone(canonicalHardwarePlan);
  postLivePlan.metadata.usb_telemetry_status_after.transmitted_frames += 1;
  const postLiveFrames = structuredClone(canonicalHardwareFrames);
  const originalFinalIdle = postLiveFrames.pop();
  const liveContinuation = structuredClone(postLiveFrames.at(-1));
  liveContinuation.timestamp_ms = 33500;
  liveContinuation.frame_counter += 125;
  originalFinalIdle.timestamp_ms = 34000;
  originalFinalIdle.frame_counter = liveContinuation.frame_counter + 125;
  postLiveFrames.push(liveContinuation, originalFinalIdle);
  const allowedPostLive = evaluateHardware(postLivePlan, postLiveFrames);
  assert.equal(allowedPostLive.exitCode, 0);
  assert.deepEqual(allowedPostLive.findingCodes, []);
  assert.equal(allowedPostLive.analysis.metrics.hardware_evidence.post_active_frame_count, 2);

  const transientPostActiveViolationFrames = structuredClone(postLiveFrames);
  transientPostActiveViolationFrames.at(-2).audio.test_mode = true;
  transientPostActiveViolationFrames.at(-2).audio.demo_compat_mode = true;
  transientPostActiveViolationFrames.at(-2).audio.test_wall = "Front";
  transientPostActiveViolationFrames.at(-2).safety.imu_fault_injection_active = true;
  transientPostActiveViolationFrames.at(-2).safety.tilt_disarmed = false;
  const transientPostActiveViolation = evaluateHardware(
    postLivePlan,
    transientPostActiveViolationFrames,
  );
  assert.equal(transientPostActiveViolation.exitCode, 2);
  assert.deepEqual(
    transientPostActiveViolation.findingCodes,
    ["RUN_TELEMETRY_CONTEXT_MISMATCH"],
  );
  assert.deepEqual(
    transientPostActiveViolation.analysis.metrics.hardware_evidence
      .post_active_context_mismatches.map((mismatch) => mismatch.field),
    ["post_active.frame_contract"],
  );

  const rearmPlan = structuredClone(canonicalHardwarePlan);
  rearmPlan.metadata.usb_telemetry_status_after.transmitted_frames += 2;
  const rearmFrames = structuredClone(canonicalHardwareFrames);
  const rearmedLive = structuredClone(rearmFrames.at(-2));
  rearmedLive.timestamp_ms = 34000;
  rearmedLive.frame_counter = rearmFrames.at(-1).frame_counter + 125;
  const finalIdleAfterRearm = structuredClone(rearmFrames.at(-1));
  finalIdleAfterRearm.timestamp_ms = 34500;
  finalIdleAfterRearm.frame_counter = rearmedLive.frame_counter + 125;
  rearmFrames.push(rearmedLive, finalIdleAfterRearm);
  const rearmedAfterSafeIdle = evaluateHardware(rearmPlan, rearmFrames);
  assert.equal(rearmedAfterSafeIdle.exitCode, 2);
  assert.deepEqual(rearmedAfterSafeIdle.findingCodes, ["RUN_TELEMETRY_CONTEXT_MISMATCH"]);
  assert.deepEqual(
    rearmedAfterSafeIdle.analysis.metrics.hardware_evidence
      .post_active_context_mismatches.map((mismatch) => mismatch.field),
    ["post_active.rearm_after_safe_idle"],
  );
});

test("monotonic mode accepts low-rate snapshots and evt_total still detects hidden events", async () => {
  const schemas = await loadLabSchemas(repoRoot);
  const rawPlan = JSON.parse(
    await fs.readFile(path.join(testDirectory, "fixtures", "static.plan.json"), "utf8"),
  );
  rawPlan.frame_counter_mode = "monotonic";
  delete rawPlan.timestamp_origin;
  const sourceFrames = (await fs.readFile(
    path.join(testDirectory, "fixtures", "static_pass.ndjson"),
    "utf8",
  ))
    .trim()
    .split(/\r?\n/)
    .map((line, index) => ({ ...JSON.parse(line), frame_counter: 1000 + index * 1250 }));

  const passing = evaluateCheckTexts({
    planText: JSON.stringify(rawPlan),
    telemetryText: `${sourceFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(passing.exitCode, 0);
  assert.deepEqual(passing.findingCodes, []);
  assert.equal(passing.analysis.metrics.timestamp_origin, "absolute");

  const finalGapFrames = structuredClone(sourceFrames);
  finalGapFrames.at(-1).timestamp_ms = 34000;
  finalGapFrames.push({
    ...structuredClone(finalGapFrames.at(-1)),
    timestamp_ms: 36000,
    frame_counter: finalGapFrames.at(-1).frame_counter + 1250,
  });
  const anchoredQuiet = evaluateCheckTexts({
    planText: JSON.stringify(rawPlan),
    telemetryText: `${finalGapFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(anchoredQuiet.exitCode, 0);
  assert.deepEqual(anchoredQuiet.findingCodes, []);
  assert.equal(
    anchoredQuiet.analysis.checks[0].metrics.post_assessment_anchor_timestamp_ms,
    36000,
  );
  assert.equal(anchoredQuiet.analysis.checks[0].metrics.post_assessment_anchor_gap_ms, 1000);

  const noisyAssessmentAnchor = structuredClone(finalGapFrames);
  noisyAssessmentAnchor.at(-1).mass.energy = 0.1;
  noisyAssessmentAnchor.at(-1).actuators = [0.1, 0.1, 0.1, 0.1];
  const rejectedNoisyAnchor = evaluateCheckTexts({
    planText: JSON.stringify(rawPlan),
    telemetryText: `${noisyAssessmentAnchor.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(rejectedNoisyAnchor.exitCode, 2);
  assert.deepEqual(rejectedNoisyAnchor.findingCodes, [
    "STATIC_ACTUATOR_ABOVE_LIMIT",
    "STATIC_ENERGY_ABOVE_LIMIT",
  ]);
  assert.equal(
    rejectedNoisyAnchor.analysis.checks[0].metrics.assessment_envelope_frame_count,
    rejectedNoisyAnchor.analysis.checks[0].metrics.assessment_frame_count + 1,
  );

  const eventInFinalSamplingGap = structuredClone(finalGapFrames);
  eventInFinalSamplingGap.at(-1).new_evt = 1;
  eventInFinalSamplingGap.at(-1).evt_total = 1;
  const rejectedFinalGapEvent = evaluateCheckTexts({
    planText: JSON.stringify(rawPlan),
    telemetryText: `${eventInFinalSamplingGap.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(rejectedFinalGapEvent.exitCode, 2);
  assert.deepEqual(rejectedFinalGapEvent.findingCodes, ["STATIC_NEW_EVENT"]);
  assert.equal(rejectedFinalGapEvent.analysis.checks[0].metrics.evt_total_delta, 1);

  sourceFrames[4].evt_total = 1;
  for (let index = 5; index < sourceFrames.length; index += 1) {
    sourceFrames[index].evt_total = 1;
  }
  const hiddenEvent = evaluateCheckTexts({
    planText: JSON.stringify(rawPlan),
    telemetryText: `${sourceFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(hiddenEvent.exitCode, 2);
  assert.deepEqual(hiddenEvent.findingCodes, ["STATIC_NEW_EVENT"]);

  const pulsePlan = JSON.parse(
    await fs.readFile(path.join(testDirectory, "fixtures", "pulse.plan.json"), "utf8"),
  );
  const splitBoundaryFrames = (await fs.readFile(
    path.join(testDirectory, "fixtures", "pulse_pass.ndjson"),
    "utf8",
  ))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const energyOnlyResponseFrames = structuredClone(splitBoundaryFrames);
  for (const frame of energyOnlyResponseFrames) {
    if (frame.timestamp_ms >= 200 && frame.timestamp_ms <= 500) {
      frame.actuators = [0, 0, 0, 0];
    }
  }
  const rejectedEnergyOnlyResponse = evaluateCheckTexts({
    planText: JSON.stringify(pulsePlan),
    telemetryText: `${energyOnlyResponseFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(rejectedEnergyOnlyResponse.exitCode, 2);
  assert.deepEqual(rejectedEnergyOnlyResponse.findingCodes, ["PULSE_RESPONSE_MISSING"]);

  splitBoundaryFrames[2].timestamp_ms = 299;
  const splitBoundary = evaluateCheckTexts({
    planText: JSON.stringify(pulsePlan),
    telemetryText: `${splitBoundaryFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(splitBoundary.exitCode, 2);
  assert.deepEqual(splitBoundary.findingCodes, ["PULSE_WINDOW_INCOMPLETE"]);
  assert.equal(splitBoundary.analysis.checks[0].metrics.pulse_boundary_gap_ms, 199);

  const unsafeIntegerPlan = structuredClone(rawPlan);
  unsafeIntegerPlan.checks[0].start_timestamp_ms = Number.MAX_SAFE_INTEGER + 1;
  const rejectedUnsafePlanInteger = evaluateCheckTexts({
    planText: JSON.stringify(unsafeIntegerPlan),
    telemetryText: `${sourceFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(rejectedUnsafePlanInteger.exitCode, 3);
  assert.ok(
    rejectedUnsafePlanInteger.issues.some(
      (issue) => issue.code.startsWith("maximum|$.checks[0].start_timestamp_ms|"),
    ),
  );

  const unsafeIntegerTelemetry = structuredClone(sourceFrames);
  unsafeIntegerTelemetry[0].timestamp_ms = Number.MAX_SAFE_INTEGER + 1;
  const rejectedUnsafeTelemetryInteger = evaluateCheckTexts({
    planText: JSON.stringify(rawPlan),
    telemetryText: `${unsafeIntegerTelemetry.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    schemas,
  });
  assert.equal(rejectedUnsafeTelemetryInteger.exitCode, 3);
  assert.ok(
    rejectedUnsafeTelemetryInteger.issues.some(
      (issue) => issue.code.startsWith("maximum|$[0].timestamp_ms|"),
    ),
  );
});

test("capture classifies every non-JSON line as transport evidence", () => {
  const result = classifyCapturedLines([
    '{"timestamp_ms":0}',
    "boot: observer ready",
    "",
    "{malformed-json}",
  ]);
  assert.deepEqual(result.telemetryLines, ['{"timestamp_ms":0}']);
  assert.deepEqual(result.transportLines, ["boot: observer ready", "", "{malformed-json}"]);
});

test("stdin capture writes telemetry, transport log, counts, and hashes", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "haptics-lab-capture-"));
  const outputPath = path.join(temporaryRoot, "capture");
  const { Readable } = await import("node:stream");
  try {
    const rawInput = Buffer.from(
      'USB-only prep: telemetry off\r\n{"frame":1,"run_mode":"live"}\r\n' +
        '{"frame":2,"run_mode":"idle"}\r\n',
      "utf8",
    );
    const result = await captureFromStdin({
      outputPath,
      readable: Readable.from([rawInput]),
      generatedAt: "2026-08-27T00:00:00.000Z",
    });
    assert.equal(result.manifest.format_version, 2);
    assert.equal(result.manifest.status, "pass");
    assert.equal(result.manifest.counts.json_lines, 2);
    assert.equal(result.manifest.counts.non_json_lines, 1);
    assert.deepEqual(await fs.readFile(path.join(outputPath, "mixed-input.raw")), rawInput);
    assert.equal(
      result.manifest.artifacts.mixed_input.sha256,
      crypto.createHash("sha256").update(rawInput).digest("hex"),
    );
    assert.equal(
      await fs.readFile(path.join(outputPath, "transport.log"), "utf8"),
      "USB-only prep: telemetry off\n",
    );
    const telemetry = await fs.readFile(path.join(outputPath, "telemetry.ndjson"), "utf8");
    const hash = crypto.createHash("sha256").update(telemetry).digest("hex");
    assert.equal(result.manifest.artifacts.telemetry.sha256, hash);

    const invalidOutputPath = path.join(temporaryRoot, "invalid-capture");
    const invalidInput = Buffer.concat([
      Buffer.from('{"last_event":{"primary_wall":"', "utf8"),
      Buffer.from([0xff]),
      Buffer.from('"}}\n', "utf8"),
    ]);
    await assert.rejects(
      captureFromStdin({
        outputPath: invalidOutputPath,
        readable: Readable.from([invalidInput]),
        generatedAt: "2026-08-27T00:00:01.000Z",
      }),
      (error) => {
        assert.ok(error instanceof LabError);
        assert.equal(error.code, "INPUT_UTF8_INVALID");
        assert.equal(error.exitCode, 3);
        return true;
      },
    );
    assert.deepEqual(
      await fs.readFile(path.join(invalidOutputPath, "mixed-input.raw")),
      invalidInput,
    );
    const invalidManifest = JSON.parse(
      await fs.readFile(path.join(invalidOutputPath, "capture-manifest.json"), "utf8"),
    );
    assert.equal(invalidManifest.status, "input_error");
    assert.equal(invalidManifest.error_code, "INPUT_UTF8_INVALID");
    assert.equal(
      invalidManifest.artifacts.mixed_input.sha256,
      crypto.createHash("sha256").update(invalidInput).digest("hex"),
    );
    assert.deepEqual((await fs.readdir(invalidOutputPath)).sort(), [
      "capture-manifest.json",
      "mixed-input.raw",
    ]);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("check failure leaves a complete evidence bundle and refuses overwrite", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "haptics-lab-check-"));
  const outputPath = path.join(temporaryRoot, "evidence");
  const planPath = path.join(testDirectory, "fixtures", "sequence.plan.json");
  const telemetryPath = path.join(testDirectory, "fixtures", "sequence_gap_fail.ndjson");
  try {
    const schemas = await loadLabSchemas(repoRoot);
    const evaluation = await evaluateCheckFiles({ planPath, telemetryPath, schemas });
    assert.equal(evaluation.exitCode, 2);
    const args = {
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
      generatedAt: "2026-08-27T00:00:00.000Z",
    };
    const bundle = await writeEvidenceBundle(args);
    assert.equal(bundle.report.status, "fail");
    assert.deepEqual(bundle.report.finding_codes, ["TELEMETRY_SEQUENCE_GAP"]);
    assert.equal(bundle.report.checks[0].status, "fail");

    const expectedFiles = [
      "manifest.json",
      "metrics.json",
      "report.json",
      "report.md",
      "run-plan.json",
      "schemas",
      "telemetry.ndjson",
    ];
    assert.deepEqual((await fs.readdir(outputPath)).sort(), expectedFiles);
    assert.deepEqual((await fs.readdir(path.join(outputPath, "schemas"))).sort(), [
      "lab_report.schema.json",
      "lab_run_plan.schema.json",
      "telemetry_frame.schema.json",
    ]);
    assert.equal(await fs.readFile(path.join(outputPath, "run-plan.json"), "utf8"), evaluation.planText);
    assert.equal(
      await fs.readFile(path.join(outputPath, "telemetry.ndjson"), "utf8"),
      evaluation.telemetryText,
    );
    const metrics = await fs.readFile(path.join(outputPath, "metrics.json"), "utf8");
    const metricsHash = crypto.createHash("sha256").update(metrics).digest("hex");
    assert.equal(bundle.manifest.artifacts.metrics.sha256, metricsHash);
    for (const [manifestKey, fileName] of [
      ["telemetry", "telemetry_frame.schema.json"],
      ["run_plan", "lab_run_plan.schema.json"],
      ["report", "lab_report.schema.json"],
    ]) {
      const bundledSchema = await fs.readFile(path.join(outputPath, "schemas", fileName), "utf8");
      const schemaHash = crypto.createHash("sha256").update(bundledSchema).digest("hex");
      assert.equal(bundle.manifest.schemas[manifestKey].sha256, schemaHash);
    }

    const validReportStdout = [];
    const validReportStderr = [];
    assert.equal(
      await labMain(
        ["validate", "--report", path.join(outputPath, "report.json")],
        {
          stdin: process.stdin,
          stdout: { write: (value) => validReportStdout.push(value) },
          stderr: { write: (value) => validReportStderr.push(value) },
        },
      ),
      0,
    );
    assert.equal(validReportStderr.join(""), "");
    assert.match(validReportStdout.join(""), /schema-valid/);

    const unsafeReportPath = path.join(temporaryRoot, "unsafe-integer-report.json");
    const unsafeReportText = JSON.stringify(bundle.report).replace(
      /"frame_count":\d+/,
      '"frame_count":9007199254740993',
    );
    await fs.writeFile(unsafeReportPath, unsafeReportText);
    const unsafeReportStderr = [];
    assert.equal(
      await labMain(
        ["validate", "--report", unsafeReportPath],
        {
          stdin: process.stdin,
          stdout: { write: () => {} },
          stderr: { write: (value) => unsafeReportStderr.push(value) },
        },
      ),
      3,
    );
    assert.match(unsafeReportStderr.join(""), /maximum\|\$\.summary\.frame_count\|/);

    for (const [argv, expectedCode] of [
      [["validate"], "VALIDATE_INPUT_REQUIRED"],
      [["validate", "--plan", "--report", path.join(outputPath, "report.json")], "MISSING_ARGUMENT"],
      [["validate", "--plan="], "MISSING_ARGUMENT"],
    ]) {
      const rejectedStderr = [];
      assert.equal(
        await labMain(argv, {
          stdin: process.stdin,
          stdout: { write: () => {} },
          stderr: { write: (value) => rejectedStderr.push(value) },
        }),
        3,
      );
      assert.match(rejectedStderr.join(""), new RegExp(`\\[${expectedCode}\\]`));
    }

    const contradictoryReport = {
      ...bundle.report,
      status: "pass",
      summary: { ...bundle.report.summary, finding_count: 0 },
      finding_codes: [],
    };
    const contradictoryReportPath = path.join(temporaryRoot, "contradictory-report.json");
    await fs.writeFile(contradictoryReportPath, JSON.stringify(contradictoryReport));
    const contradictoryStderr = [];
    assert.equal(
      await labMain(
        ["validate", "--report", contradictoryReportPath],
        {
          stdin: process.stdin,
          stdout: { write: () => {} },
          stderr: { write: (value) => contradictoryStderr.push(value) },
        },
      ),
      3,
    );
    assert.match(
      contradictoryStderr.join(""),
      /semantic\|\$\.status\|matches_findings_and_checks/,
    );

    const emptyPassReport = {
      ...bundle.report,
      status: "pass",
      summary: {
        frame_count: 0,
        duration_ms: 0,
        finding_count: 0,
        check_count: 0,
      },
      finding_codes: [],
      findings: [],
      checks: [],
    };
    const emptyPassPath = path.join(temporaryRoot, "empty-pass-report.json");
    await fs.writeFile(emptyPassPath, JSON.stringify(emptyPassReport));
    const emptyPassStderr = [];
    assert.equal(
      await labMain(
        ["validate", "--report", emptyPassPath],
        {
          stdin: process.stdin,
          stdout: { write: () => {} },
          stderr: { write: (value) => emptyPassStderr.push(value) },
        },
      ),
      3,
    );
    assert.match(
      emptyPassStderr.join(""),
      /semantic\|\$\.status\|matches_findings_and_checks/,
    );

    await assert.rejects(writeEvidenceBundle(args), (error) => {
      assert.ok(error instanceof LabError);
      assert.equal(error.code, "OUTPUT_EXISTS");
      assert.equal(error.exitCode, 4);
      return true;
    });
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("schema failure returns 3 and preserves original diagnostic source bytes", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "haptics-lab-invalid-"));
  const outputPath = path.join(temporaryRoot, "evidence");
  const stdout = [];
  const stderr = [];
  try {
    const exitCode = await labMain(
      [
        "check",
        "--plan",
        path.join(testDirectory, "fixtures", "sequence.plan.json"),
        "--telemetry",
        path.join(testDirectory, "fixtures", "schema_invalid.ndjson"),
        "--out",
        outputPath,
      ],
      {
        stdin: process.stdin,
        stdout: { write: (value) => stdout.push(value) },
        stderr: { write: (value) => stderr.push(value) },
      },
    );
    assert.equal(exitCode, 3);
    assert.match(stderr.join(""), /required\|\$\[0\]\|new_evt/);
    const report = JSON.parse(await fs.readFile(path.join(outputPath, "report.json"), "utf8"));
    assert.equal(report.status, "input_error");
    assert.deepEqual(report.finding_codes, ["required|$[0]|new_evt"]);
    assert.equal(report.summary.frame_count, 1);
    assert.equal(stdout.join(""), "");

    const unsafeTimestampPath = path.join(
      testDirectory,
      "fixtures",
      "unsafe_timestamp_schema_fail.ndjson",
    );
    const unsafeTimestampBytes = await fs.readFile(unsafeTimestampPath);
    const unsafeTimestampOutputPath = path.join(
      temporaryRoot,
      "unsafe-timestamp-evidence",
    );
    const unsafeTimestampStderr = [];
    const unsafeTimestampExit = await labMain(
      [
        "check",
        "--plan",
        path.join(testDirectory, "fixtures", "sequence.plan.json"),
        "--telemetry",
        unsafeTimestampPath,
        "--out",
        unsafeTimestampOutputPath,
      ],
      {
        stdin: process.stdin,
        stdout: { write: () => {} },
        stderr: { write: (value) => unsafeTimestampStderr.push(value) },
      },
    );
    assert.equal(unsafeTimestampExit, 3);
    assert.match(
      unsafeTimestampStderr.join(""),
      /maximum\|\$\[1\]\.timestamp_ms\|9007199254740991/,
    );
    assert.deepEqual(
      await fs.readFile(path.join(unsafeTimestampOutputPath, "telemetry.ndjson")),
      unsafeTimestampBytes,
    );
    const unsafeTimestampReport = JSON.parse(
      await fs.readFile(path.join(unsafeTimestampOutputPath, "report.json"), "utf8"),
    );
    assert.equal(unsafeTimestampReport.status, "input_error");
    assert.equal(unsafeTimestampReport.summary.frame_count, 2);
    assert.equal(unsafeTimestampReport.summary.duration_ms, 0);

    const invalidPlanPath = path.join(temporaryRoot, "invalid-utf8-plan.json");
    const validHardwarePlanBytes = await fs.readFile(
      path.join(testDirectory, "fixtures", "hardware_static_complete.plan.json"),
    );
    const freeTextMarker = Buffer.from("quiet");
    const markerOffset = validHardwarePlanBytes.indexOf(freeTextMarker);
    assert.notEqual(markerOffset, -1);
    const invalidPlanBytes = Buffer.concat([
      validHardwarePlanBytes.subarray(0, markerOffset + 3),
      Buffer.from([0xff]),
      validHardwarePlanBytes.subarray(markerOffset + 3),
    ]);
    const binaryOutputPath = path.join(temporaryRoot, "binary-evidence");
    await fs.writeFile(invalidPlanPath, invalidPlanBytes);
    const binaryExitCode = await labMain(
      [
        "check",
        "--plan",
        invalidPlanPath,
        "--telemetry",
        path.join(testDirectory, "fixtures", "hardware_static_pass.ndjson"),
        "--out",
        binaryOutputPath,
      ],
      {
        stdin: process.stdin,
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      },
    );
    assert.equal(binaryExitCode, 3);
    assert.deepEqual(
      await fs.readFile(path.join(binaryOutputPath, "run-plan.json")),
      invalidPlanBytes,
    );
    const binaryManifest = JSON.parse(
      await fs.readFile(path.join(binaryOutputPath, "manifest.json"), "utf8"),
    );
    assert.equal(
      binaryManifest.artifacts.run_plan.sha256,
      crypto.createHash("sha256").update(invalidPlanBytes).digest("hex"),
    );
    const binaryReport = JSON.parse(
      await fs.readFile(path.join(binaryOutputPath, "report.json"), "utf8"),
    );
    assert.deepEqual(binaryReport.finding_codes, ["utf8_decode|$|run-plan"]);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
