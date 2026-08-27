import { decodeUtf8Bytes } from "./file.mjs";

export async function readInputBytes(readable = process.stdin) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function splitInputLines(text) {
  if (text.length === 0) {
    return [];
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines.map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
}

export async function readInputLines(readable = process.stdin) {
  const bytes = await readInputBytes(readable);
  return splitInputLines(decodeUtf8Bytes(bytes, "capture stdin"));
}
