const GATE1_HARDWARE_CONTEXT = Object.freeze({
  platformioEnvironment: "m5stack-atoms3-pipeline",
  hardwareProfile: "as-built AtomS3 custom board",
  presetId: "liquid_small_box",
  timestampOrigin: "first_frame",
  frameCounterMode: "monotonic",
  runMode: "live",
  audioRuntimeEnabled: true,
  audioCompileEnabled: true,
  audioDriverInstalled: true,
  audioTransport: "tdm8_slot",
  audioOutputLayout: "quad_wall_4ch",
  activeOutputChannels: 4,
  outputPeakLimit: 0.08,
  usbTelemetryPeriodMs: 100,
});

const GATE1_SEQUENCE_CONTRACT = Object.freeze({
  type: "sequence",
  max_sample_gap_ms: 500,
});

const GATE1_STATIC_CONTRACT = Object.freeze({
  type: "static30s",
  start_timestamp_ms: 0,
  warmup_ms: 2000,
  duration_ms: 30000,
  minimum_capture_duration_ms: 33000,
  max_sample_gap_ms: 500,
  max_new_evt: 0,
  max_actuator_abs: 0.02,
  max_energy: 0.02,
});

const GATE1_PULSE_CONTRACT = Object.freeze({
  type: "pulse_to_silence",
  pulse_timestamp_ms: 5000,
  baseline_duration_ms: 2000,
  response_deadline_ms: 1000,
  settle_deadline_ms: 32000,
  silence_duration_ms: 30000,
  minimum_capture_duration_ms: 40000,
  max_sample_gap_ms: 500,
  min_response_actuator: 0.03,
  min_response_energy: 0.03,
  max_silence_actuator: 0.02,
  max_silence_energy: 0.02,
});

const USB_STATUS_COUNTER_FIELDS = Object.freeze([
  "transmitted_frames",
  "dropped_frames",
  "backpressure_dropped_frames",
  "console_interrupted_frames",
  "unterminated_partial_frames",
  "serialization_errors",
]);

const INCOMPLETE_EVIDENCE_TOKENS = new Set([
  "",
  "editme",
  "unknown",
  "todo",
  "tbd",
  "na",
  "notapplicable",
  "pending",
  "placeholder",
  "none",
  "null",
  "?",
]);

function isIncompleteEvidenceString(value) {
  if (typeof value !== "string") {
    return true;
  }
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[\s._\-/]+/g, "");
  return INCOMPLETE_EVIDENCE_TOKENS.has(trimmed) ||
    INCOMPLETE_EVIDENCE_TOKENS.has(normalized) ||
    ["editme", "todo", "tbd", "pending", "placeholder"].some(
      (marker) => normalized.includes(marker),
    );
}

function isUsbStatusSnapshot(value) {
  return value !== null &&
    typeof value === "object" &&
    value.compile_enabled === true &&
    value.runtime_enabled === false &&
    Number.isSafeInteger(value.period_ms) &&
    value.period_ms >= 50 &&
    value.period_ms <= 5000 &&
    Number.isSafeInteger(value.pending_bytes) &&
    value.pending_bytes >= 0 &&
    USB_STATUS_COUNTER_FIELDS.every(
      (field) => Number.isSafeInteger(value[field]) && value[field] >= 0,
    );
}

function contractMismatches(check, expected, checkIndex) {
  const mismatches = [];
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (check?.[field] !== expectedValue) {
      mismatches.push({
        check_index: checkIndex,
        check_id: check?.id ?? null,
        field,
        expected: expectedValue,
        actual: check?.[field],
      });
    }
  }
  return mismatches;
}

function gate1PlanContractIssues(plan, variant) {
  const issues = [];
  const indexedChecks = plan.checks.map((check, index) => ({ check, index }));
  const sequences = indexedChecks.filter(({ check }) => check.type === "sequence");
  const measurements = indexedChecks.filter(
    ({ check }) => check.type === "static30s" || check.type === "pulse_to_silence",
  );

  if (sequences.length !== 1) {
    issues.push({ field: "checks", expected: "exactly one sequence check", actual: sequences.length });
  }
  if (measurements.length !== 1) {
    issues.push({ field: "checks", expected: "exactly one measurement check", actual: measurements.length });
  }
  for (const { check, index } of sequences) {
    issues.push(...contractMismatches(check, GATE1_SEQUENCE_CONTRACT, index));
  }

  if (measurements.length === 1) {
    const { check, index } = measurements[0];
    if (variant === "s1_off_control" && check.type !== "pulse_to_silence") {
      issues.push({
        check_index: index,
        check_id: check.id,
        field: "type",
        expected: "pulse_to_silence for s1_off_control",
        actual: check.type,
      });
    }
    const expected = check.type === "static30s"
      ? GATE1_STATIC_CONTRACT
      : GATE1_PULSE_CONTRACT;
    issues.push(...contractMismatches(check, expected, index));
  }
  return issues;
}

function usbStatusEvidenceIssues(metadata, canonicalFrameCount) {
  const before = metadata.usb_telemetry_status_before;
  const after = metadata.usb_telemetry_status_after;
  if (!isUsbStatusSnapshot(before) || !isUsbStatusSnapshot(after)) {
    return [];
  }
  const issues = [];
  const expect = (condition, field, expected, actual) => {
    if (!condition) {
      issues.push({ field, expected, actual });
    }
  };
  expect(before.pending_bytes === 0, "usb_telemetry_status_before.pending_bytes", 0,
         before.pending_bytes);
  expect(after.pending_bytes === 0, "usb_telemetry_status_after.pending_bytes", 0,
         after.pending_bytes);
  expect(
    before.period_ms === GATE1_HARDWARE_CONTEXT.usbTelemetryPeriodMs,
    "usb_telemetry_status_before.period_ms",
    GATE1_HARDWARE_CONTEXT.usbTelemetryPeriodMs,
    before.period_ms,
  );
  expect(after.period_ms === before.period_ms, "usb_telemetry_status_after.period_ms",
         before.period_ms, after.period_ms);
  expect(
    before.dropped_frames ===
      before.backpressure_dropped_frames + before.console_interrupted_frames,
    "usb_telemetry_status_before.dropped_frames",
    "backpressure_dropped_frames + console_interrupted_frames",
    before.dropped_frames,
  );
  expect(
    after.dropped_frames ===
      after.backpressure_dropped_frames + after.console_interrupted_frames,
    "usb_telemetry_status_after.dropped_frames",
    "backpressure_dropped_frames + console_interrupted_frames",
    after.dropped_frames,
  );
  const transmittedDelta = after.transmitted_frames - before.transmitted_frames;
  expect(
    transmittedDelta === canonicalFrameCount,
    "usb_telemetry_status_after.transmitted_frames",
    `${before.transmitted_frames} + ${canonicalFrameCount} canonical frame(s)`,
    after.transmitted_frames,
  );
  for (const field of [
    "dropped_frames",
    "backpressure_dropped_frames",
    "console_interrupted_frames",
    "unterminated_partial_frames",
    "serialization_errors",
  ]) {
    expect(after[field] === before[field], `usb_telemetry_status_after.${field}`,
           `unchanged from ${before[field]}`, after[field]);
  }
  return issues;
}

function makeFinding(code, message, checkId = undefined, details = undefined) {
  return {
    code,
    message,
    ...(checkId ? { check_id: checkId } : {}),
    ...(details ? { details } : {}),
  };
}

function declaresGate1HardwareEvidence(metadata) {
  return Object.prototype.hasOwnProperty.call(metadata, "gate1_run_variant") ||
    metadata.platformio_environment === GATE1_HARDWARE_CONTEXT.platformioEnvironment;
}

function maxActuatorAbs(frame) {
  return Math.max(...frame.actuators.map((value) => Math.abs(value)));
}

function maxGap(frames) {
  let maximum = 0;
  for (let index = 1; index < frames.length; index += 1) {
    maximum = Math.max(maximum, frames[index].timestamp_ms - frames[index - 1].timestamp_ms);
  }
  return maximum;
}

function integrityAnalysis(frames, frameCounterMode) {
  const sequenceOccurrences = [];
  const timestampOccurrences = [];
  const eventRegressionOccurrences = [];
  const eventMismatchOccurrences = [];

  if (frames.length > 0 && frames[0].evt_total < frames[0].new_evt) {
    eventMismatchOccurrences.push({
      index: 0,
      current_total: frames[0].evt_total,
      new_evt: frames[0].new_evt,
      expected_minimum_total: frames[0].new_evt,
      frame_counter_mode: frameCounterMode,
    });
  }

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    const expectedContiguousCounter = Math.min(Number.MAX_SAFE_INTEGER, previous.frame_counter + 1);
    const contiguous = current.frame_counter === expectedContiguousCounter;
    const validCounterTransition =
      frameCounterMode === "contiguous"
        ? contiguous
        : current.frame_counter > previous.frame_counter ||
          (previous.frame_counter === Number.MAX_SAFE_INTEGER &&
            current.frame_counter === Number.MAX_SAFE_INTEGER);

    if (!validCounterTransition) {
      sequenceOccurrences.push({
        index,
        previous: previous.frame_counter,
        current: current.frame_counter,
        expected:
          frameCounterMode === "contiguous" ? expectedContiguousCounter : `>${previous.frame_counter}`,
      });
    }
    if (current.timestamp_ms <= previous.timestamp_ms) {
      timestampOccurrences.push({
        index,
        previous: previous.timestamp_ms,
        current: current.timestamp_ms,
      });
    }

    const eventDelta = current.evt_total - previous.evt_total;
    if (eventDelta < 0) {
      eventRegressionOccurrences.push({
        index,
        previous: previous.evt_total,
        current: current.evt_total,
      });
    } else if (validCounterTransition) {
      const expectedEventMinimum = Math.min(
        Number.MAX_SAFE_INTEGER,
        previous.evt_total + current.new_evt,
      );
      const eventCountAgrees =
        frameCounterMode === "contiguous"
          ? current.evt_total === expectedEventMinimum
          : current.evt_total >= expectedEventMinimum;
      if (eventCountAgrees) {
        continue;
      }
      eventMismatchOccurrences.push({
        index,
        previous_total: previous.evt_total,
        current_total: current.evt_total,
        delta: eventDelta,
        new_evt: current.new_evt,
        expected_minimum_total: expectedEventMinimum,
        frame_counter_mode: frameCounterMode,
      });
    }
  }

  const findings = [];
  if (sequenceOccurrences.length > 0) {
    findings.push(
      makeFinding(
        "TELEMETRY_SEQUENCE_GAP",
        frameCounterMode === "contiguous"
          ? `frame_counter is not contiguous at ${sequenceOccurrences.length} transition(s)`
          : `frame_counter is not strictly increasing at ${sequenceOccurrences.length} transition(s)`,
        undefined,
        { occurrences: sequenceOccurrences },
      ),
    );
  }
  if (timestampOccurrences.length > 0) {
    findings.push(
      makeFinding(
        "TELEMETRY_TIMESTAMP_NOT_MONOTONIC",
        `timestamp_ms is not strictly increasing at ${timestampOccurrences.length} transition(s)`,
        undefined,
        { occurrences: timestampOccurrences },
      ),
    );
  }
  if (eventRegressionOccurrences.length > 0) {
    findings.push(
      makeFinding(
        "TELEMETRY_EVT_TOTAL_REGRESSION",
        `evt_total regressed at ${eventRegressionOccurrences.length} transition(s)`,
        undefined,
        { occurrences: eventRegressionOccurrences },
      ),
    );
  }
  if (eventMismatchOccurrences.length > 0) {
    findings.push(
      makeFinding(
        "TELEMETRY_EVT_TOTAL_MISMATCH",
        `evt_total delta disagrees with current-frame new_evt at ${eventMismatchOccurrences.length} transition(s)`,
        undefined,
        { occurrences: eventMismatchOccurrences },
      ),
    );
  }

  return {
    findings,
    metrics: {
      sequence_gap_count: sequenceOccurrences.length,
      timestamp_regression_count: timestampOccurrences.length,
      event_total_regression_count: eventRegressionOccurrences.length,
      event_total_mismatch_count: eventMismatchOccurrences.length,
      frame_counter_mode: frameCounterMode,
    },
  };
}

function analyzeStatic(check, frames, timestampBase, timestampOrigin) {
  const captureStart = timestampBase + check.start_timestamp_ms;
  const assessmentStart = captureStart + check.warmup_ms;
  const assessmentEnd = assessmentStart + check.duration_ms;
  const captureFrames = frames.filter(
    (frame) => frame.timestamp_ms >= captureStart && frame.timestamp_ms <= assessmentEnd,
  );
  const assessmentFrames = frames.filter(
    (frame) => frame.timestamp_ms >= assessmentStart && frame.timestamp_ms <= assessmentEnd,
  );
  const postAssessmentAnchor = frames.find(
    (frame) => frame.timestamp_ms >= assessmentEnd,
  ) ?? null;
  const minimumCaptureEnd = Number.isSafeInteger(check.minimum_capture_duration_ms)
    ? frames[0].timestamp_ms + check.minimum_capture_duration_ms
    : null;
  const minimumCaptureAnchor = minimumCaptureEnd === null
    ? null
    : frames.find((frame) => frame.timestamp_ms >= minimumCaptureEnd) ?? null;
  const silenceEndAnchor = minimumCaptureEnd === null
    ? postAssessmentAnchor
    : minimumCaptureAnchor;
  const coverageFrames = silenceEndAnchor && !captureFrames.includes(silenceEndAnchor)
    ? frames.filter(
        (frame) =>
          frame.timestamp_ms >= captureStart &&
          frame.timestamp_ms <= silenceEndAnchor.timestamp_ms,
      )
    : captureFrames;
  const assessmentEnvelopeFrames =
    silenceEndAnchor && !assessmentFrames.includes(silenceEndAnchor)
      ? frames.filter(
          (frame) =>
            frame.timestamp_ms >= assessmentStart &&
            frame.timestamp_ms <= silenceEndAnchor.timestamp_ms,
        )
      : assessmentFrames;
  const findings = [];
  const capturedDurationMs = frames.at(-1).timestamp_ms - frames[0].timestamp_ms;
  const capturedStartGap = captureFrames.length > 0 ? captureFrames[0].timestamp_ms - captureStart : null;
  const postAssessmentAnchorGap = postAssessmentAnchor
    ? postAssessmentAnchor.timestamp_ms - assessmentEnd
    : null;
  const observedGap = maxGap(coverageFrames);
  const complete =
    captureFrames.length > 0 &&
    assessmentFrames.length > 0 &&
    capturedStartGap >= 0 &&
    capturedStartGap <= check.max_sample_gap_ms &&
    postAssessmentAnchorGap !== null &&
    postAssessmentAnchorGap >= 0 &&
    postAssessmentAnchorGap <= check.max_sample_gap_ms;

  if (!complete) {
    findings.push(
      makeFinding(
        "STATIC_WINDOW_INCOMPLETE",
        "Static capture does not cover warm-up plus the complete 30-second assessment window",
        check.id,
        {
          expected_start_ms: captureStart,
          expected_end_ms: assessmentEnd,
          captured_start_gap_ms: capturedStartGap,
          post_assessment_anchor_timestamp_ms: postAssessmentAnchor?.timestamp_ms ?? null,
          post_assessment_anchor_gap_ms: postAssessmentAnchorGap,
        },
      ),
    );
  }
  if (coverageFrames.length > 1 && observedGap > check.max_sample_gap_ms) {
    findings.push(
      makeFinding(
        "STATIC_SAMPLE_GAP",
        `Static capture contains a ${observedGap} ms sample gap`,
        check.id,
        { maximum_gap_ms: observedGap, allowed_gap_ms: check.max_sample_gap_ms },
      ),
    );
  }
  if (
    Number.isSafeInteger(check.minimum_capture_duration_ms) &&
    capturedDurationMs < check.minimum_capture_duration_ms
  ) {
    findings.push(
      makeFinding(
        "STATIC_CAPTURE_TOO_SHORT",
        `Static Gate 1 capture duration ${capturedDurationMs} ms is shorter than ${check.minimum_capture_duration_ms} ms`,
        check.id,
        {
          captured_duration_ms: capturedDurationMs,
          required_duration_ms: check.minimum_capture_duration_ms,
        },
      ),
    );
  }

  const eventSum = assessmentFrames.reduce((sum, frame) => sum + frame.new_evt, 0);
  const eventBaseline =
    captureFrames.filter((frame) => frame.timestamp_ms < assessmentStart).at(-1) ??
    assessmentFrames[0];
  const eventTotalDelta =
    eventBaseline && silenceEndAnchor
      ? silenceEndAnchor.evt_total - eventBaseline.evt_total
      : 0;
  const observedEventCount = Math.max(eventSum, eventTotalDelta);
  const actuatorMaximum = assessmentEnvelopeFrames.reduce(
    (maximum, frame) => Math.max(maximum, maxActuatorAbs(frame)),
    0,
  );
  const energyMaximum = assessmentEnvelopeFrames.reduce(
    (maximum, frame) => Math.max(maximum, Math.abs(frame.mass.energy)),
    0,
  );

  if (observedEventCount > check.max_new_evt) {
    findings.push(
      makeFinding(
        "STATIC_NEW_EVENT",
        `Static assessment observed ${observedEventCount} new event(s); allowed ${check.max_new_evt}`,
        check.id,
        {
          observed_new_evt_sum: eventSum,
          observed_evt_total_delta: eventTotalDelta,
          allowed_new_evt: check.max_new_evt,
        },
      ),
    );
  }
  if (actuatorMaximum > check.max_actuator_abs) {
    findings.push(
      makeFinding(
        "STATIC_ACTUATOR_ABOVE_LIMIT",
        `Static actuator magnitude ${actuatorMaximum} exceeds ${check.max_actuator_abs}`,
        check.id,
        { maximum_actuator_abs: actuatorMaximum, allowed_actuator_abs: check.max_actuator_abs },
      ),
    );
  }
  if (energyMaximum > check.max_energy) {
    findings.push(
      makeFinding(
        "STATIC_ENERGY_ABOVE_LIMIT",
        `Static energy ${energyMaximum} exceeds ${check.max_energy}`,
        check.id,
        { maximum_energy: energyMaximum, allowed_energy: check.max_energy },
      ),
    );
  }

  return {
    findings,
    metrics: {
      timestamp_origin: timestampOrigin,
      requested_start_timestamp_ms: check.start_timestamp_ms,
      resolved_capture_start_timestamp_ms: captureStart,
      capture_start_ms: captureStart,
      assessment_start_ms: assessmentStart,
      assessment_end_ms: assessmentEnd,
      post_assessment_anchor_timestamp_ms: postAssessmentAnchor?.timestamp_ms ?? null,
      post_assessment_anchor_gap_ms: postAssessmentAnchorGap,
      minimum_capture_end_timestamp_ms: minimumCaptureEnd,
      minimum_capture_anchor_timestamp_ms: minimumCaptureAnchor?.timestamp_ms ?? null,
      event_baseline_timestamp_ms: eventBaseline?.timestamp_ms ?? null,
      warmup_ms: check.warmup_ms,
      assessment_duration_ms: check.duration_ms,
      assessment_frame_count: assessmentFrames.length,
      assessment_envelope_frame_count: assessmentEnvelopeFrames.length,
      captured_duration_ms: capturedDurationMs,
      minimum_capture_duration_ms: check.minimum_capture_duration_ms ?? null,
      maximum_sample_gap_ms: observedGap,
      new_evt_sum: eventSum,
      evt_total_delta: eventTotalDelta,
      maximum_actuator_abs: actuatorMaximum,
      maximum_energy: energyMaximum,
    },
  };
}

function isPulseResponse(frame, check) {
  const requiredResponses = [];
  if (check.min_response_actuator > 0) {
    requiredResponses.push(maxActuatorAbs(frame) >= check.min_response_actuator);
  }
  if (check.min_response_energy > 0) {
    requiredResponses.push(Math.abs(frame.mass.energy) >= check.min_response_energy);
  }
  return requiredResponses.length > 0 && requiredResponses.every(Boolean);
}

function isSilent(frame, check) {
  return (
    frame.new_evt === 0 &&
    maxActuatorAbs(frame) <= check.max_silence_actuator &&
    Math.abs(frame.mass.energy) <= check.max_silence_energy
  );
}

function analyzePulse(check, frames, timestampBase, timestampOrigin) {
  const pulseStart = timestampBase + check.pulse_timestamp_ms;
  const baselineStart = pulseStart - check.baseline_duration_ms;
  const responseEnd = pulseStart + check.response_deadline_ms;
  const settleEnd = pulseStart + check.settle_deadline_ms;
  const minimumCaptureEnd = Number.isSafeInteger(check.minimum_capture_duration_ms)
    ? frames[0].timestamp_ms + check.minimum_capture_duration_ms
    : null;
  const minimumCaptureAnchor = minimumCaptureEnd === null
    ? null
    : frames.find((frame) => frame.timestamp_ms >= minimumCaptureEnd) ?? null;
  const baselineFrames = frames.filter(
    (frame) => frame.timestamp_ms >= baselineStart && frame.timestamp_ms < pulseStart,
  );
  const baselineAnchor = frames
    .filter((frame) => frame.timestamp_ms <= baselineStart)
    .at(-1) ?? null;
  const baselineCoverageFrames = baselineAnchor
    ? [
        baselineAnchor,
        ...baselineFrames.filter((frame) => frame !== baselineAnchor),
      ]
    : baselineFrames;
  const windowFrames = frames.filter(
    (frame) => frame.timestamp_ms >= pulseStart && frame.timestamp_ms <= settleEnd,
  );
  const silenceEvaluationEnd = minimumCaptureAnchor?.timestamp_ms ?? settleEnd;
  const silenceEvaluationFrames = frames.filter(
    (frame) =>
      frame.timestamp_ms >= pulseStart &&
      frame.timestamp_ms <= silenceEvaluationEnd,
  );
  const findings = [];
  const capturedDurationMs = frames.at(-1).timestamp_ms - frames[0].timestamp_ms;
  const baselineGap = maxGap(baselineCoverageFrames);
  const baselineStartGap =
    baselineAnchor ? baselineStart - baselineAnchor.timestamp_ms : null;
  const baselineEndGap =
    baselineFrames.length > 0 ? pulseStart - baselineFrames.at(-1).timestamp_ms : null;
  const baselineComplete =
    baselineAnchor !== null &&
    baselineFrames.length > 0 &&
    baselineStartGap >= 0 &&
    baselineStartGap <= check.max_sample_gap_ms &&
    baselineEndGap > 0 &&
    baselineEndGap <= check.max_sample_gap_ms &&
    baselineGap <= check.max_sample_gap_ms;
  if (!baselineComplete) {
    findings.push(
      makeFinding(
        "PULSE_BASELINE_INCOMPLETE",
        "Pulse capture does not continuously cover the required pre-pulse baseline",
        check.id,
        {
          expected_start_ms: baselineStart,
          expected_end_ms: pulseStart,
          captured_start_gap_ms: baselineStartGap,
          captured_end_gap_ms: baselineEndGap,
          maximum_gap_ms: baselineGap,
          allowed_gap_ms: check.max_sample_gap_ms,
        },
      ),
    );
  }
  const baselineEventTotal = baselineAnchor?.evt_total ?? null;
  const baselineSilent =
    baselineComplete &&
    baselineFrames.every(
      (frame) => isSilent(frame, check) && frame.evt_total === baselineEventTotal,
    );
  if (baselineComplete && !baselineSilent) {
    findings.push(
      makeFinding(
        "PULSE_BASELINE_NOT_SILENT",
        "Pre-pulse baseline already contains activity or a cumulative event change",
        check.id,
        {
          baseline_start_ms: baselineStart,
          baseline_end_ms: pulseStart,
          baseline_anchor_timestamp_ms: baselineAnchor?.timestamp_ms ?? null,
          baseline_frame_count: baselineFrames.length,
        },
      ),
    );
  }
  const observedGap = maxGap(windowFrames);
  const startGap = windowFrames.length > 0 ? windowFrames[0].timestamp_ms - pulseStart : null;
  const pulseBoundaryGap = baselineFrames.length > 0 && windowFrames.length > 0
    ? windowFrames[0].timestamp_ms - baselineFrames.at(-1).timestamp_ms
    : null;
  const endGap = windowFrames.length > 0 ? settleEnd - windowFrames.at(-1).timestamp_ms : null;
  const complete =
    windowFrames.length > 0 &&
    startGap >= 0 &&
    startGap <= check.max_sample_gap_ms &&
    pulseBoundaryGap !== null &&
    pulseBoundaryGap > 0 &&
    pulseBoundaryGap <= check.max_sample_gap_ms &&
    endGap >= 0 &&
    endGap <= check.max_sample_gap_ms &&
    observedGap <= check.max_sample_gap_ms;

  if (!complete) {
    findings.push(
      makeFinding(
        "PULSE_WINDOW_INCOMPLETE",
        "Pulse capture does not continuously cover the response and settle deadline",
        check.id,
        {
          expected_start_ms: pulseStart,
          expected_end_ms: settleEnd,
          captured_start_gap_ms: startGap,
          pulse_boundary_gap_ms: pulseBoundaryGap,
          captured_end_gap_ms: endGap,
          maximum_gap_ms: observedGap,
          allowed_gap_ms: check.max_sample_gap_ms,
        },
      ),
    );
  }
  if (
    Number.isSafeInteger(check.minimum_capture_duration_ms) &&
    capturedDurationMs < check.minimum_capture_duration_ms
  ) {
    findings.push(
      makeFinding(
        "PULSE_CAPTURE_TOO_SHORT",
        `Pulse Gate 1 capture duration ${capturedDurationMs} ms is shorter than ${check.minimum_capture_duration_ms} ms`,
        check.id,
        {
          captured_duration_ms: capturedDurationMs,
          required_duration_ms: check.minimum_capture_duration_ms,
        },
      ),
    );
  }

  const response = windowFrames.find(
    (frame) => frame.timestamp_ms <= responseEnd && isPulseResponse(frame, check),
  );
  if (!response) {
    findings.push(
      makeFinding(
        "PULSE_RESPONSE_MISSING",
        "The configured actuator/mass-energy response requirements were not all reached before the response deadline",
        check.id,
        { response_deadline_ms: check.response_deadline_ms },
      ),
    );
  }

  let silenceStart = null;
  let silenceEnd = null;
  let previousQuietFrame = null;
  let silenceEventTotal = null;
  if (response) {
    for (const frame of silenceEvaluationFrames) {
      if (frame.timestamp_ms < response.timestamp_ms) {
        continue;
      }
      const continuous =
        previousQuietFrame === null ||
        frame.timestamp_ms - previousQuietFrame.timestamp_ms <= check.max_sample_gap_ms;
      const quiet = isSilent(frame, check);
      const cumulativeEventChanged =
        silenceEventTotal !== null && frame.evt_total !== silenceEventTotal;
      if (!quiet || !continuous || cumulativeEventChanged) {
        silenceStart = quiet ? frame.timestamp_ms : null;
        previousQuietFrame = quiet ? frame : null;
        silenceEventTotal = quiet ? frame.evt_total : null;
        silenceEnd = null;
        continue;
      }
      if (silenceStart === null) {
        silenceStart = frame.timestamp_ms;
        silenceEventTotal = frame.evt_total;
      }
      previousQuietFrame = frame;
      if (
        frame.timestamp_ms <= settleEnd &&
        frame.timestamp_ms - silenceStart >= check.silence_duration_ms
      ) {
        silenceEnd ??= frame.timestamp_ms;
      }
    }
  }

  if (response && silenceEnd === null) {
    findings.push(
      makeFinding(
        "PULSE_SILENCE_NOT_REACHED",
        "No continuous event-free silence interval completed before the settle deadline",
        check.id,
        {
          settle_deadline_ms: check.settle_deadline_ms,
          required_silence_ms: check.silence_duration_ms,
        },
      ),
    );
  }

  return {
    findings,
    metrics: {
      timestamp_origin: timestampOrigin,
      baseline_start_timestamp_ms: baselineStart,
      baseline_end_timestamp_ms: pulseStart,
      baseline_duration_ms: check.baseline_duration_ms,
      baseline_anchor_timestamp_ms: baselineAnchor?.timestamp_ms ?? null,
      baseline_frame_count: baselineFrames.length,
      baseline_passed: baselineSilent,
      baseline_maximum_sample_gap_ms: baselineGap,
      pulse_boundary_gap_ms: pulseBoundaryGap,
      requested_pulse_timestamp_ms: check.pulse_timestamp_ms,
      resolved_pulse_timestamp_ms: pulseStart,
      pulse_timestamp_ms: pulseStart,
      response_timestamp_ms: response?.timestamp_ms ?? null,
      response_latency_ms: response ? response.timestamp_ms - pulseStart : null,
      silence_start_timestamp_ms: silenceEnd === null ? null : silenceStart,
      silence_end_timestamp_ms: silenceEnd,
      settle_latency_ms: silenceEnd === null ? null : silenceStart - pulseStart,
      completed_silence_duration_ms: silenceEnd === null ? 0 : silenceEnd - silenceStart,
      maximum_sample_gap_ms: observedGap,
      captured_duration_ms: capturedDurationMs,
      minimum_capture_duration_ms: check.minimum_capture_duration_ms ?? null,
      minimum_capture_end_timestamp_ms: minimumCaptureEnd,
      minimum_capture_anchor_timestamp_ms: minimumCaptureAnchor?.timestamp_ms ?? null,
    },
  };
}

function activeHardwareWindow(plan, frames, timestampBase) {
  const intervals = [];
  for (const check of plan.checks) {
    if (check.type === "static30s") {
      const start = timestampBase + check.start_timestamp_ms;
      const assessmentEnd = start + check.warmup_ms + check.duration_ms;
      const postAssessmentAnchor = frames.find(
        (frame) => frame.timestamp_ms >= assessmentEnd,
      );
      const minimumCaptureEnd = Number.isSafeInteger(check.minimum_capture_duration_ms)
        ? frames[0].timestamp_ms + check.minimum_capture_duration_ms
        : null;
      const minimumCaptureAnchor = minimumCaptureEnd === null
        ? null
        : frames.find((frame) => frame.timestamp_ms >= minimumCaptureEnd);
      intervals.push({
        start,
        // Gate 1 must remain powered in the fixed Live context through the
        // advertised minimum hold. A later Safe Idle frame cannot substitute
        // for the powered end anchor.
        end: minimumCaptureAnchor?.timestamp_ms ??
          postAssessmentAnchor?.timestamp_ms ??
          assessmentEnd,
      });
    } else if (check.type === "pulse_to_silence") {
      const pulse = timestampBase + check.pulse_timestamp_ms;
      const minimumCaptureEnd = Number.isSafeInteger(check.minimum_capture_duration_ms)
        ? frames[0].timestamp_ms + check.minimum_capture_duration_ms
        : null;
      const minimumCaptureAnchor = minimumCaptureEnd === null
        ? null
        : frames.find((frame) => frame.timestamp_ms >= minimumCaptureEnd);
      intervals.push({
        start: pulse - check.baseline_duration_ms,
        end: minimumCaptureAnchor?.timestamp_ms ?? pulse + check.settle_deadline_ms,
      });
    }
  }
  const end = intervals.length > 0
    ? Math.max(...intervals.map((interval) => interval.end))
    : null;
  const plannedStart = intervals.length > 0
    ? Math.min(...intervals.map((interval) => interval.start))
    : null;
  const start = plan.timestamp_origin === "first_frame" && plannedStart !== null
    ? timestampBase
    : plannedStart;
  return {
    frames: frames.filter((frame) =>
      start !== null && end !== null &&
      frame.timestamp_ms >= start && frame.timestamp_ms <= end),
    start_timestamp_ms: start,
    end_timestamp_ms: end,
  };
}

function evaluateSafeIdleState(frame, metadata) {
  if (!frame) {
    return [{ field: "frame", expected: "canonical Safe Idle frame", actual: frame }];
  }
  const mismatches = [];
  const expect = (condition, field, expected, actual) => {
    if (!condition) {
      mismatches.push({ field, expected, actual });
    }
  };
  expect(frame.preset === metadata.preset_id, "preset", metadata.preset_id, frame.preset);
  expect(frame.run_mode === "idle", "run_mode", "idle", frame.run_mode);
  expect(frame.new_evt === 0, "new_evt", 0, frame.new_evt);
  expect(
    frame.actuators.every((value) => Math.abs(value) <= 1e-6),
    "actuators",
    [0, 0, 0, 0],
    frame.actuators,
  );
  expect(Math.abs(frame.mass.energy) <= 1e-6, "mass.energy", 0, frame.mass.energy);
  expect(
    frame.mass.pos_norm.every((value) => Math.abs(value) <= 1e-6),
    "mass.pos_norm",
    [0, 0],
    frame.mass.pos_norm,
  );
  expect(
    frame.mass.vel_norm_s.every((value) => Math.abs(value) <= 1e-6),
    "mass.vel_norm_s",
    [0, 0],
    frame.mass.vel_norm_s,
  );
  expect(frame.audio?.runtime_enabled === false, "audio.runtime_enabled", false,
         frame.audio?.runtime_enabled);
  expect(
    frame.audio?.compile_enabled === metadata.expected_audio_compile_enabled,
    "audio.compile_enabled",
    metadata.expected_audio_compile_enabled,
    frame.audio?.compile_enabled,
  );
  expect(
    frame.audio?.driver_installed === metadata.expected_audio_driver_installed,
    "audio.driver_installed",
    metadata.expected_audio_driver_installed,
    frame.audio?.driver_installed,
  );
  expect(frame.audio?.output_silenced === true, "audio.output_silenced", true,
         frame.audio?.output_silenced);
  expect(frame.audio?.test_mode === false, "audio.test_mode", false,
         frame.audio?.test_mode);
  expect(frame.audio?.demo_compat_mode === false, "audio.demo_compat_mode", false,
         frame.audio?.demo_compat_mode);
  expect(frame.audio?.test_wall === "None", "audio.test_wall", "None",
         frame.audio?.test_wall);
  expect(
    frame.audio?.transport === metadata.expected_audio_transport,
    "audio.transport",
    metadata.expected_audio_transport,
    frame.audio?.transport,
  );
  expect(
    frame.audio?.output_layout === metadata.expected_audio_output_layout,
    "audio.output_layout",
    metadata.expected_audio_output_layout,
    frame.audio?.output_layout,
  );
  expect(
    frame.audio?.active_output_channels === metadata.expected_active_output_channels,
    "audio.active_output_channels",
    metadata.expected_active_output_channels,
    frame.audio?.active_output_channels,
  );
  expect(
    Number.isFinite(frame.audio?.output_peak_limit) &&
      Math.abs(frame.audio.output_peak_limit - metadata.effective_output_peak_limit) <= 1e-6,
    "audio.output_peak_limit",
    metadata.effective_output_peak_limit,
    frame.audio?.output_peak_limit,
  );
  expect(frame.safety?.imu_stale_safe_stop === false,
         "safety.imu_stale_safe_stop", false, frame.safety?.imu_stale_safe_stop);
  expect(frame.safety?.imu_fault_injection_active === false,
         "safety.imu_fault_injection_active", false,
         frame.safety?.imu_fault_injection_active);
  expect(frame.safety?.audio_zero_asserted === true,
         "safety.audio_zero_asserted", true, frame.safety?.audio_zero_asserted);
  expect(frame.safety?.tilt_disarmed === true,
         "safety.tilt_disarmed", true, frame.safety?.tilt_disarmed);
  expect(frame.last_event?.type === "None", "last_event.type", "None",
         frame.last_event?.type);
  return mismatches;
}

function evaluateFixedLiveState(frame, metadata) {
  if (!frame) {
    return [{ field: "frame", expected: "canonical fixed Live frame", actual: frame }];
  }
  const mismatches = [];
  const expect = (condition, field, expected, actual) => {
    if (!condition) {
      mismatches.push({ field, expected, actual });
    }
  };
  expect(frame.preset === metadata.preset_id, "preset", metadata.preset_id, frame.preset);
  expect(frame.run_mode === GATE1_HARDWARE_CONTEXT.runMode, "run_mode",
         GATE1_HARDWARE_CONTEXT.runMode, frame.run_mode);
  expect(frame.imu?.valid === true, "imu.valid", true, frame.imu?.valid);
  expect(frame.audio?.runtime_enabled === true, "audio.runtime_enabled", true,
         frame.audio?.runtime_enabled);
  expect(frame.audio?.compile_enabled === true, "audio.compile_enabled", true,
         frame.audio?.compile_enabled);
  expect(frame.audio?.driver_installed === true, "audio.driver_installed", true,
         frame.audio?.driver_installed);
  expect(frame.audio?.output_silenced === false, "audio.output_silenced", false,
         frame.audio?.output_silenced);
  expect(frame.audio?.test_mode === false, "audio.test_mode", false, frame.audio?.test_mode);
  expect(frame.audio?.demo_compat_mode === false, "audio.demo_compat_mode", false,
         frame.audio?.demo_compat_mode);
  expect(frame.audio?.test_wall === "None", "audio.test_wall", "None",
         frame.audio?.test_wall);
  expect(frame.audio?.transport === GATE1_HARDWARE_CONTEXT.audioTransport,
         "audio.transport", GATE1_HARDWARE_CONTEXT.audioTransport,
         frame.audio?.transport);
  expect(frame.audio?.output_layout === GATE1_HARDWARE_CONTEXT.audioOutputLayout,
         "audio.output_layout", GATE1_HARDWARE_CONTEXT.audioOutputLayout,
         frame.audio?.output_layout);
  expect(frame.audio?.active_output_channels === GATE1_HARDWARE_CONTEXT.activeOutputChannels,
         "audio.active_output_channels", GATE1_HARDWARE_CONTEXT.activeOutputChannels,
         frame.audio?.active_output_channels);
  expect(
    Number.isFinite(frame.audio?.output_peak_limit) &&
      Math.abs(frame.audio.output_peak_limit - GATE1_HARDWARE_CONTEXT.outputPeakLimit) <= 1e-6,
    "audio.output_peak_limit",
    GATE1_HARDWARE_CONTEXT.outputPeakLimit,
    frame.audio?.output_peak_limit,
  );
  expect(frame.safety?.imu_stale_safe_stop === false,
         "safety.imu_stale_safe_stop", false, frame.safety?.imu_stale_safe_stop);
  expect(frame.safety?.imu_fault_injection_active === false,
         "safety.imu_fault_injection_active", false,
         frame.safety?.imu_fault_injection_active);
  expect(frame.safety?.audio_zero_asserted === false,
         "safety.audio_zero_asserted", false, frame.safety?.audio_zero_asserted);
  expect(frame.safety?.tilt_disarmed === true,
         "safety.tilt_disarmed", true, frame.safety?.tilt_disarmed);
  return mismatches;
}

function evaluateFinalSafeIdle(
  frame,
  metadata,
  activeEndTimestampMs,
  activeEndEventTotal,
) {
  const mismatches = [];
  if (!frame || activeEndTimestampMs === null || frame.timestamp_ms <= activeEndTimestampMs) {
    mismatches.push({
      field: "final_frame.timestamp_ms",
      expected: `>${activeEndTimestampMs}`,
      actual: frame?.timestamp_ms,
    });
  }
  mismatches.push(...evaluateSafeIdleState(frame, metadata));
  if (frame && Number.isSafeInteger(activeEndEventTotal) && frame.evt_total !== activeEndEventTotal) {
    mismatches.push({
      field: "evt_total",
      expected: `unchanged from active-end value ${activeEndEventTotal}`,
      actual: frame.evt_total,
    });
  }
  return mismatches;
}

function analyzeHardwareEvidence(plan, frames, timestampBase) {
  const metadata = plan.metadata ?? {};
  if (metadata.physical_output_authorization_required !== true) {
    const gate1Claim = declaresGate1HardwareEvidence(metadata);
    return {
      findings: gate1Claim
        ? [makeFinding(
            "RUN_METADATA_INCOMPLETE",
            "A Gate 1 hardware plan must explicitly require physical-output authorization",
            undefined,
            { invalid_fields: ["metadata.physical_output_authorization_required"] },
          )]
        : [],
      required: gate1Claim,
      complete: gate1Claim ? false : null,
      invalid_fields: gate1Claim ? ["metadata.physical_output_authorization_required"] : [],
      plan_contract_issues: [],
      usb_telemetry_status_issues: [],
      telemetry_context_mismatches: [],
      operator_observation_outcome: null,
      active_context_start_timestamp_ms: null,
      active_context_end_timestamp_ms: null,
      active_context_last_evt_total: null,
      post_active_frame_count: 0,
      post_active_context_mismatches: [],
      final_safe_idle_mismatches: [],
    };
  }

  const invalidFields = [];
  if (isIncompleteEvidenceString(plan.run_id)) {
    invalidFields.push("run_id");
  }
  const requiredStrings = [
    "git_commit",
    "build_id",
    "platformio_environment",
    "hardware_profile",
    "preset_id",
    "gate1_run_variant",
    "preset_source",
    "preset_hash",
    "resolved_feature_flags",
    "calibration_identity",
    "fixture_orientation",
    "operator_observation",
  ];
  for (const property of requiredStrings) {
    const value = metadata[property];
    if (isIncompleteEvidenceString(value)) {
      invalidFields.push(`metadata.${property}`);
    }
  }
  if (metadata.s1_state !== "on" && metadata.s1_state !== "off") {
    invalidFields.push("metadata.s1_state");
  }
  if (metadata.preset_id !== GATE1_HARDWARE_CONTEXT.presetId) {
    invalidFields.push("metadata.preset_id");
  }
  if (
    metadata.gate1_run_variant !== "active" &&
    metadata.gate1_run_variant !== "s1_off_control"
  ) {
    invalidFields.push("metadata.gate1_run_variant");
  } else {
    const requiredS1State = metadata.gate1_run_variant === "active" ? "on" : "off";
    if (metadata.s1_state !== requiredS1State) {
      invalidFields.push("metadata.s1_state");
    }
  }
  if (plan.timestamp_origin !== GATE1_HARDWARE_CONTEXT.timestampOrigin) {
    invalidFields.push("timestamp_origin");
  }
  if (plan.frame_counter_mode !== GATE1_HARDWARE_CONTEXT.frameCounterMode) {
    invalidFields.push("frame_counter_mode");
  }
  if (!isUsbStatusSnapshot(metadata.usb_telemetry_status_before)) {
    invalidFields.push("metadata.usb_telemetry_status_before");
  }
  if (!isUsbStatusSnapshot(metadata.usb_telemetry_status_after)) {
    invalidFields.push("metadata.usb_telemetry_status_after");
  }
  if (metadata.supply_12v_state !== "on") {
    invalidFields.push("metadata.supply_12v_state");
  }
  if (metadata.platformio_environment !== GATE1_HARDWARE_CONTEXT.platformioEnvironment) {
    invalidFields.push("metadata.platformio_environment");
  }
  if (metadata.hardware_profile !== GATE1_HARDWARE_CONTEXT.hardwareProfile) {
    invalidFields.push("metadata.hardware_profile");
  }
  if (metadata.expected_run_mode !== GATE1_HARDWARE_CONTEXT.runMode) {
    invalidFields.push("metadata.expected_run_mode");
  }
  if (
    metadata.expected_audio_runtime_enabled !== GATE1_HARDWARE_CONTEXT.audioRuntimeEnabled
  ) {
    invalidFields.push("metadata.expected_audio_runtime_enabled");
  }
  if (
    metadata.expected_audio_compile_enabled !== GATE1_HARDWARE_CONTEXT.audioCompileEnabled
  ) {
    invalidFields.push("metadata.expected_audio_compile_enabled");
  }
  if (
    metadata.expected_audio_driver_installed !== GATE1_HARDWARE_CONTEXT.audioDriverInstalled
  ) {
    invalidFields.push("metadata.expected_audio_driver_installed");
  }
  if (metadata.expected_audio_transport !== GATE1_HARDWARE_CONTEXT.audioTransport) {
    invalidFields.push("metadata.expected_audio_transport");
  }
  if (
    metadata.expected_audio_output_layout !== GATE1_HARDWARE_CONTEXT.audioOutputLayout
  ) {
    invalidFields.push("metadata.expected_audio_output_layout");
  }
  if (
    metadata.expected_active_output_channels !== GATE1_HARDWARE_CONTEXT.activeOutputChannels
  ) {
    invalidFields.push("metadata.expected_active_output_channels");
  }
  if (
    !Number.isFinite(metadata.effective_output_peak_limit) ||
    Math.abs(metadata.effective_output_peak_limit - GATE1_HARDWARE_CONTEXT.outputPeakLimit) > 1e-6
  ) {
    invalidFields.push("metadata.effective_output_peak_limit");
  }
  if (metadata.operator_confirmed_physical_output_authorization !== true) {
    invalidFields.push("metadata.operator_confirmed_physical_output_authorization");
  }
  if (
    metadata.operator_observation_outcome !== "pass" &&
    metadata.operator_observation_outcome !== "fail"
  ) {
    invalidFields.push("metadata.operator_observation_outcome");
  }
  if (metadata.final_safe_idle_confirmed !== true) {
    invalidFields.push("metadata.final_safe_idle_confirmed");
  }
  if (metadata.evidence_complete !== true) {
    invalidFields.push("metadata.evidence_complete");
  }

  const uniqueInvalidFields = [...new Set(invalidFields)].sort();
  const planContractIssues = gate1PlanContractIssues(plan, metadata.gate1_run_variant);
  const usbTelemetryStatusIssues = uniqueInvalidFields.length === 0
    ? usbStatusEvidenceIssues(metadata, frames.length)
    : [];
  const findings = [];
  if (uniqueInvalidFields.length > 0) {
    findings.push(
      makeFinding(
        "RUN_METADATA_INCOMPLETE",
        "Hardware evidence metadata is incomplete or still contains template values",
        undefined,
        { invalid_fields: uniqueInvalidFields },
      ),
    );
  }
  if (planContractIssues.length > 0) {
    findings.push(
      makeFinding(
        "RUN_PLAN_CONTRACT_MISMATCH",
        "Physical Gate 1 evidence must contain exactly one canonical measurement and exactly one canonical sequence check",
        undefined,
        { issues: planContractIssues },
      ),
    );
  }
  if (usbTelemetryStatusIssues.length > 0) {
    findings.push(
      makeFinding(
        "USB_TELEMETRY_EVIDENCE_FAILED",
        "Before/after USB telemetry status does not prove a clean, completed canonical capture",
        undefined,
        { issues: usbTelemetryStatusIssues },
      ),
    );
  }
  const telemetryContextMismatches = [];
  const activeWindow = activeHardwareWindow(plan, frames, timestampBase);
  const activeEndFrame = activeWindow.frames.at(-1) ?? null;
  const postActiveFrames = activeWindow.end_timestamp_ms === null
    ? []
    : frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => frame.timestamp_ms > activeWindow.end_timestamp_ms);
  const postActiveContextMismatches = [];
  let finalSafeIdleMismatches = [];
  if (uniqueInvalidFields.length === 0 && planContractIssues.length === 0) {
    if (activeWindow.frames.length === 0) {
      telemetryContextMismatches.push({
        field: "active_context_window",
        expected: "at least one canonical frame inside a static or pulse check window",
        mismatch_count: 1,
      });
    }
    const presetMismatches = activeWindow.frames.filter(
      (frame) => frame.preset !== metadata.preset_id,
    ).length;
    if (presetMismatches > 0) {
      telemetryContextMismatches.push({
        field: "preset",
        expected: metadata.preset_id,
        mismatch_count: presetMismatches,
      });
    }
    const runModeMismatches = activeWindow.frames.filter(
      (frame) => frame.run_mode !== GATE1_HARDWARE_CONTEXT.runMode,
    ).length;
    if (runModeMismatches > 0) {
      telemetryContextMismatches.push({
        field: "run_mode",
        expected: GATE1_HARDWARE_CONTEXT.runMode,
        mismatch_count: runModeMismatches,
      });
    }
    const validImuMismatches = activeWindow.frames.filter(
      (frame) => frame.imu?.valid !== true,
    ).length;
    if (validImuMismatches > 0) {
      telemetryContextMismatches.push({
        field: "imu.valid",
        expected: true,
        mismatch_count: validImuMismatches,
      });
    }
    const audioMismatches = activeWindow.frames.filter(
      (frame) =>
        frame.audio?.runtime_enabled !== GATE1_HARDWARE_CONTEXT.audioRuntimeEnabled,
    ).length;
    if (audioMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.runtime_enabled",
        expected: GATE1_HARDWARE_CONTEXT.audioRuntimeEnabled,
        mismatch_count: audioMismatches,
      });
    }
    const audioCompileMismatches = activeWindow.frames.filter(
      (frame) =>
        frame.audio?.compile_enabled !== GATE1_HARDWARE_CONTEXT.audioCompileEnabled,
    ).length;
    if (audioCompileMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.compile_enabled",
        expected: GATE1_HARDWARE_CONTEXT.audioCompileEnabled,
        mismatch_count: audioCompileMismatches,
      });
    }
    const audioDriverMismatches = activeWindow.frames.filter(
      (frame) =>
        frame.audio?.driver_installed !== GATE1_HARDWARE_CONTEXT.audioDriverInstalled,
    ).length;
    if (audioDriverMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.driver_installed",
        expected: GATE1_HARDWARE_CONTEXT.audioDriverInstalled,
        mismatch_count: audioDriverMismatches,
      });
    }
    const expectedOutputSilenced = false;
    const audioSilencedMismatches = activeWindow.frames.filter(
      (frame) => frame.audio?.output_silenced !== expectedOutputSilenced,
    ).length;
    if (audioSilencedMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.output_silenced",
        expected: expectedOutputSilenced,
        mismatch_count: audioSilencedMismatches,
      });
    }
    const audioTestModeMismatches = frames.filter(
      (frame) => frame.audio?.test_mode !== false,
    ).length;
    if (audioTestModeMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.test_mode",
        expected: false,
        mismatch_count: audioTestModeMismatches,
      });
    }
    const audioDemoModeMismatches = frames.filter(
      (frame) => frame.audio?.demo_compat_mode !== false,
    ).length;
    if (audioDemoModeMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.demo_compat_mode",
        expected: false,
        mismatch_count: audioDemoModeMismatches,
      });
    }
    const audioTestWallMismatches = frames.filter(
      (frame) => frame.audio?.test_wall !== "None",
    ).length;
    if (audioTestWallMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.test_wall",
        expected: "None",
        mismatch_count: audioTestWallMismatches,
      });
    }
    const audioTransportMismatches = activeWindow.frames.filter(
      (frame) => frame.audio?.transport !== GATE1_HARDWARE_CONTEXT.audioTransport,
    ).length;
    if (audioTransportMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.transport",
        expected: GATE1_HARDWARE_CONTEXT.audioTransport,
        mismatch_count: audioTransportMismatches,
      });
    }
    const audioLayoutMismatches = activeWindow.frames.filter(
      (frame) => frame.audio?.output_layout !== GATE1_HARDWARE_CONTEXT.audioOutputLayout,
    ).length;
    if (audioLayoutMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.output_layout",
        expected: GATE1_HARDWARE_CONTEXT.audioOutputLayout,
        mismatch_count: audioLayoutMismatches,
      });
    }
    const audioChannelMismatches = activeWindow.frames.filter(
      (frame) =>
        frame.audio?.active_output_channels !== GATE1_HARDWARE_CONTEXT.activeOutputChannels,
    ).length;
    if (audioChannelMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.active_output_channels",
        expected: GATE1_HARDWARE_CONTEXT.activeOutputChannels,
        mismatch_count: audioChannelMismatches,
      });
    }
    const finalFrame = frames.at(-1);
    const audioCounterFrames = frames;
    const initialUnderrunCount = activeWindow.frames[0]?.audio?.underrun_count;
    const underrunMismatches = Number.isSafeInteger(initialUnderrunCount)
      ? audioCounterFrames.filter(
        (frame) => frame.audio?.underrun_count !== initialUnderrunCount,
      ).length
      : Math.max(1, audioCounterFrames.length);
    if (underrunMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.underrun_count",
        expected: Number.isSafeInteger(initialUnderrunCount)
          ? `unchanged from ${initialUnderrunCount}`
          : "present safe-integer baseline with no growth",
        mismatch_count: underrunMismatches,
      });
    }
    const outputLimitMismatches = activeWindow.frames.filter(
      (frame) =>
        !Number.isFinite(frame.audio?.output_peak_limit) ||
        Math.abs(frame.audio.output_peak_limit - GATE1_HARDWARE_CONTEXT.outputPeakLimit) > 1e-6,
    ).length;
    if (outputLimitMismatches > 0) {
      telemetryContextMismatches.push({
        field: "audio.output_peak_limit",
        expected: GATE1_HARDWARE_CONTEXT.outputPeakLimit,
        mismatch_count: outputLimitMismatches,
      });
    }
    const staleStopMismatches = activeWindow.frames.filter(
      (frame) => frame.safety?.imu_stale_safe_stop !== false,
    ).length;
    if (staleStopMismatches > 0) {
      telemetryContextMismatches.push({
        field: "safety.imu_stale_safe_stop",
        expected: false,
        mismatch_count: staleStopMismatches,
      });
    }
    const injectedImuMismatches = frames.filter(
      (frame) => frame.safety?.imu_fault_injection_active !== false,
    ).length;
    if (injectedImuMismatches > 0) {
      telemetryContextMismatches.push({
        field: "safety.imu_fault_injection_active",
        expected: false,
        mismatch_count: injectedImuMismatches,
      });
    }
    const audioZeroMismatches = activeWindow.frames.filter(
      (frame) => frame.safety?.audio_zero_asserted !== expectedOutputSilenced,
    ).length;
    if (audioZeroMismatches > 0) {
      telemetryContextMismatches.push({
        field: "safety.audio_zero_asserted",
        expected: expectedOutputSilenced,
        mismatch_count: audioZeroMismatches,
      });
    }
    const tiltArmedMismatches = frames.filter(
      (frame) => frame.safety?.tilt_disarmed !== true,
    ).length;
    if (tiltArmedMismatches > 0) {
      telemetryContextMismatches.push({
        field: "safety.tilt_disarmed",
        expected: true,
        mismatch_count: tiltArmedMismatches,
      });
    }
    let safeIdleObserved = false;
    for (const { frame, index } of postActiveFrames) {
      const safeIdleMismatches = evaluateSafeIdleState(frame, metadata);
      const isSafeIdle = safeIdleMismatches.length === 0;
      const liveMismatches = evaluateFixedLiveState(frame, metadata);
      const isFixedLive = liveMismatches.length === 0;
      if (safeIdleObserved && !isSafeIdle) {
        postActiveContextMismatches.push({
          field: "post_active.rearm_after_safe_idle",
          expected: "Safe Idle remains latched through the end of the canonical log",
          index,
          timestamp_ms: frame.timestamp_ms,
          actual_run_mode: frame.run_mode,
        });
      } else if (!isSafeIdle && !isFixedLive) {
        postActiveContextMismatches.push({
          field: "post_active.frame_contract",
          expected: "fixed Gate 1 Live continuation or complete Safe Idle postcondition",
          index,
          timestamp_ms: frame.timestamp_ms,
          live_mismatches: liveMismatches,
          safe_idle_mismatches: safeIdleMismatches,
        });
      }
      if (isSafeIdle) {
        safeIdleObserved = true;
      }
    }
    telemetryContextMismatches.push(...postActiveContextMismatches);
    finalSafeIdleMismatches = evaluateFinalSafeIdle(
      finalFrame,
      metadata,
      activeWindow.end_timestamp_ms,
      activeEndFrame?.evt_total,
    );
  }
  if (telemetryContextMismatches.length > 0) {
    findings.push(
      makeFinding(
        "RUN_TELEMETRY_CONTEXT_MISMATCH",
        "Canonical telemetry does not match the declared preset, run mode, output/channel-test state, or required safety state",
        undefined,
        { mismatches: telemetryContextMismatches },
      ),
    );
  }
  if (
    uniqueInvalidFields.length === 0 &&
    planContractIssues.length === 0 &&
    metadata.operator_observation_outcome === "fail"
  ) {
    findings.push(
      makeFinding(
        "OPERATOR_OBSERVATION_FAILED",
        "The structured operator observation rejected the tactile or safety acceptance criteria",
      ),
    );
  }
  if (finalSafeIdleMismatches.length > 0) {
    findings.push(
      makeFinding(
        "FINAL_SAFE_IDLE_NOT_PROVEN",
        "The final canonical telemetry frame does not prove the post-run Safe Idle state",
        undefined,
        { mismatches: finalSafeIdleMismatches },
      ),
    );
  }
  return {
    findings,
    required: true,
    // `complete` is the machine-readable acceptance bit, not merely a claim
    // that the plan fields were filled in.
    complete: findings.length === 0,
    invalid_fields: uniqueInvalidFields,
    plan_contract_issues: planContractIssues,
    usb_telemetry_status_issues: usbTelemetryStatusIssues,
    telemetry_context_mismatches: telemetryContextMismatches,
    operator_observation_outcome: metadata.operator_observation_outcome ?? null,
    active_context_start_timestamp_ms: activeWindow.start_timestamp_ms,
    active_context_end_timestamp_ms: activeWindow.end_timestamp_ms,
    active_context_last_evt_total: activeEndFrame?.evt_total ?? null,
    post_active_frame_count: postActiveFrames.length,
    post_active_context_mismatches: postActiveContextMismatches,
    final_safe_idle_mismatches: finalSafeIdleMismatches,
  };
}

export function analyzeTelemetry(plan, frames) {
  const integrity = integrityAnalysis(frames, plan.frame_counter_mode);
  const timestampOrigin = plan.timestamp_origin ?? "absolute";
  const timestampBase = timestampOrigin === "first_frame" ? frames[0].timestamp_ms : 0;
  const hardwareEvidence = analyzeHardwareEvidence(plan, frames, timestampBase);
  const checks = [];
  const findings = [...integrity.findings, ...hardwareEvidence.findings];

  for (const check of plan.checks) {
    let result;
    if (check.type === "static30s") {
      result = analyzeStatic(check, frames, timestampBase, timestampOrigin);
    } else if (check.type === "pulse_to_silence") {
      result = analyzePulse(check, frames, timestampBase, timestampOrigin);
    } else {
      const sequenceGap = maxGap(frames);
      const sequenceFindings = [];
      if (sequenceGap > check.max_sample_gap_ms) {
        sequenceFindings.push(
          makeFinding(
            "TELEMETRY_SAMPLE_GAP",
            `Telemetry sample gap ${sequenceGap} ms exceeds ${check.max_sample_gap_ms} ms`,
            check.id,
            { maximum_gap_ms: sequenceGap, allowed_gap_ms: check.max_sample_gap_ms },
          ),
        );
      }
      result = {
        findings: sequenceFindings,
        metrics: {
          integrity_checked: true,
          frame_counter_mode: plan.frame_counter_mode,
          maximum_sample_gap_ms: sequenceGap,
          allowed_sample_gap_ms: check.max_sample_gap_ms,
        },
      };
    }
    findings.push(...result.findings);
    const checkFailed =
      result.findings.length > 0 || (check.type === "sequence" && integrity.findings.length > 0);
    checks.push({
      id: check.id,
      type: check.type,
      status: checkFailed ? "fail" : "pass",
      metrics: result.metrics,
    });
  }

  const first = frames[0];
  const last = frames.at(-1);
  const findingCodes = [...new Set(findings.map((finding) => finding.code))].sort();
  const frameSummary = {
    count: frames.length,
    start_timestamp_ms: first.timestamp_ms,
    end_timestamp_ms: last.timestamp_ms,
    duration_ms: Math.max(0, last.timestamp_ms - first.timestamp_ms),
    first_frame_counter: first.frame_counter,
    last_frame_counter: last.frame_counter,
    maximum_sample_gap_ms: maxGap(frames),
  };
  const eventSummary = {
    new_evt_sum: frames.reduce((sum, frame) => sum + frame.new_evt, 0),
    first_evt_total: first.evt_total,
    last_evt_total: last.evt_total,
  };
  const signalSummary = {
    maximum_actuator_abs: frames.reduce(
      (maximum, frame) => Math.max(maximum, maxActuatorAbs(frame)),
      0,
    ),
    maximum_energy: frames.reduce(
      (maximum, frame) => Math.max(maximum, Math.abs(frame.mass.energy)),
      0,
    ),
  };

  return {
    findings,
    findingCodes,
    checks,
    metrics: {
      schema_version: 1,
      timestamp_origin: timestampOrigin,
      timestamp_base_ms: timestampBase,
      frame_summary: frameSummary,
      event_summary: eventSummary,
      signal_summary: signalSummary,
      integrity: integrity.metrics,
      hardware_evidence: {
        required: hardwareEvidence.required,
        complete: hardwareEvidence.complete,
        invalid_fields: hardwareEvidence.invalid_fields,
        plan_contract_issues: hardwareEvidence.plan_contract_issues,
        usb_telemetry_status_issues: hardwareEvidence.usb_telemetry_status_issues,
        telemetry_context_mismatches: hardwareEvidence.telemetry_context_mismatches,
        operator_observation_outcome: hardwareEvidence.operator_observation_outcome,
        active_context_start_timestamp_ms: hardwareEvidence.active_context_start_timestamp_ms,
        active_context_end_timestamp_ms: hardwareEvidence.active_context_end_timestamp_ms,
        active_context_last_evt_total: hardwareEvidence.active_context_last_evt_total,
        post_active_frame_count: hardwareEvidence.post_active_frame_count,
        post_active_context_mismatches: hardwareEvidence.post_active_context_mismatches,
        final_safe_idle_mismatches: hardwareEvidence.final_safe_idle_mismatches,
      },
      checks,
    },
  };
}
