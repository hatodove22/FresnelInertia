import path from "node:path";

import {
  createExclusiveDirectory,
  decodeUtf8Bytes,
  describeBinaryArtifact,
  describeTextArtifact,
  writeBytes,
  writeText,
} from "../adapters/file.mjs";
import { readInputBytes, splitInputLines } from "../adapters/stdin.mjs";

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function classifyCapturedLines(lines) {
  const telemetryLines = [];
  const transportLines = [];

  for (const line of lines) {
    try {
      JSON.parse(line);
      telemetryLines.push(line);
    } catch {
      // Transport chatter and malformed payloads are evidence, not whitespace.
      transportLines.push(line);
    }
  }

  return { telemetryLines, transportLines };
}

export async function captureFromStdin({ outputPath, readable = process.stdin, generatedAt = new Date().toISOString() }) {
  const inputBytes = await readInputBytes(readable);
  const outputDirectory = await createExclusiveDirectory(outputPath);
  const mixedInputArtifact = await describeBinaryArtifact("mixed-input.raw", inputBytes);
  await writeBytes(path.join(outputDirectory, "mixed-input.raw"), inputBytes);

  let inputText;
  try {
    inputText = decodeUtf8Bytes(inputBytes, "capture stdin");
  } catch (error) {
    const manifest = {
      format_version: 2,
      command: "capture",
      source: "stdin",
      status: "input_error",
      created_at: generatedAt,
      error_code: error?.code ?? "INPUT_UTF8_INVALID",
      counts: {
        input_bytes: inputBytes.byteLength,
        input_lines: null,
        json_lines: null,
        non_json_lines: null,
      },
      artifacts: { mixed_input: mixedInputArtifact },
    };
    await writeText(path.join(outputDirectory, "capture-manifest.json"), stableJson(manifest));
    if (error && typeof error === "object") {
      error.details = {
        ...(error.details ?? {}),
        output_directory: outputDirectory,
        mixed_input: mixedInputArtifact,
      };
    }
    throw error;
  }

  const lines = splitInputLines(inputText);
  const { telemetryLines, transportLines } = classifyCapturedLines(lines);
  const telemetryText = telemetryLines.length > 0 ? `${telemetryLines.join("\n")}\n` : "";
  const transportText = transportLines.length > 0 ? `${transportLines.join("\n")}\n` : "";
  const artifacts = {
    mixed_input: mixedInputArtifact,
    telemetry: await describeTextArtifact("telemetry.ndjson", telemetryText),
    transport_log: await describeTextArtifact("transport.log", transportText),
  };
  const manifest = {
    format_version: 2,
    command: "capture",
    source: "stdin",
    status: "pass",
    created_at: generatedAt,
    counts: {
      input_bytes: inputBytes.byteLength,
      input_lines: lines.length,
      json_lines: telemetryLines.length,
      non_json_lines: transportLines.length,
    },
    artifacts,
  };
  const manifestText = stableJson(manifest);
  await writeText(path.join(outputDirectory, "telemetry.ndjson"), telemetryText);
  await writeText(path.join(outputDirectory, "transport.log"), transportText);
  await writeText(path.join(outputDirectory, "capture-manifest.json"), manifestText);
  return { outputDirectory, manifest };
}
