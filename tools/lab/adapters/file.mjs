import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import { EXIT, LabError, errorMessage } from "../lib/errors.mjs";

export async function readText(filePath, label = "input") {
  return decodeUtf8Bytes(await readBytes(filePath, label), label);
}

export function decodeUtf8Bytes(content, label = "input") {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    throw new LabError(
      "INPUT_UTF8_INVALID",
      `${label} is not valid UTF-8: ${errorMessage(error)}`,
      EXIT.INPUT_FAIL,
      { label },
    );
  }
}

export async function readBytes(filePath, label = "input") {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    throw new LabError(
      "INPUT_READ_FAILED",
      `Could not read ${label} at ${filePath}: ${errorMessage(error)}`,
      EXIT.INPUT_FAIL,
      { file_path: filePath, label },
    );
  }
}

export async function createExclusiveDirectory(directoryPath) {
  const absolutePath = path.resolve(directoryPath);
  const parentPath = path.dirname(absolutePath);

  try {
    await fs.mkdir(parentPath, { recursive: true });
    await fs.mkdir(absolutePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new LabError(
        "OUTPUT_EXISTS",
        `Output path already exists and will not be overwritten: ${absolutePath}`,
        EXIT.TOOL_FAIL,
        { output_path: absolutePath },
      );
    }
    throw new LabError(
      "OUTPUT_CREATE_FAILED",
      `Could not create output directory ${absolutePath}: ${errorMessage(error)}`,
      EXIT.TOOL_FAIL,
      { output_path: absolutePath },
    );
  }

  return absolutePath;
}

export async function writeText(filePath, content) {
  return writeBytes(filePath, Buffer.from(content, "utf8"));
}

export async function writeBytes(filePath, content) {
  try {
    await fs.writeFile(filePath, content, { flag: "wx" });
  } catch (error) {
    throw new LabError(
      "ARTIFACT_WRITE_FAILED",
      `Could not write artifact ${filePath}: ${errorMessage(error)}`,
      EXIT.TOOL_FAIL,
      { file_path: filePath },
    );
  }
}

export async function sha256Text(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export async function sha256Bytes(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function describeTextArtifact(relativePath, content) {
  return {
    path: relativePath.replaceAll("\\", "/"),
    bytes: Buffer.byteLength(content, "utf8"),
    sha256: await sha256Text(content),
  };
}

export async function describeBinaryArtifact(relativePath, content) {
  return {
    path: relativePath.replaceAll("\\", "/"),
    bytes: content.byteLength,
    sha256: await sha256Bytes(content),
  };
}
