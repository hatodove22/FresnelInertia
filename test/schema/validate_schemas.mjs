import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const validations = [
  {
    schema: "schemas/control_message.schema.json",
    samples: "test/schema/control_messages.valid.jsonl",
  },
  {
    schema: "schemas/telemetry_frame.schema.json",
    samples: "test/schema/telemetry_frames.valid.jsonl",
  },
];

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function loadJsonl(relativePath) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  return source
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, index }) => {
      try {
        return { index, value: JSON.parse(line) };
      } catch (error) {
        throw new Error(`${relativePath}:${index}: invalid JSON: ${error.message}`);
      }
    });
}

function typeOf(value) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  if (Number.isInteger(value)) {
    return "integer";
  }
  return typeof value;
}

function matchesType(value, expected) {
  if (expected === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (expected === "integer") {
    return Number.isInteger(value);
  }
  if (expected === "array") {
    return Array.isArray(value);
  }
  if (expected === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === expected;
}

function validate(schema, value, location = "$") {
  const errors = [];

  if (!schema || Object.keys(schema).length === 0) {
    return errors;
  }

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${location}: expected ${schema.type}, got ${typeOf(value)}`);
    return errors;
  }

  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    errors.push(`${location}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  }

  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) {
    errors.push(`${location}: expected >= ${schema.minimum}, got ${value}`);
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${location}: expected at least ${schema.minItems} items, got ${value.length}`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${location}: expected at most ${schema.maxItems} items, got ${value.length}`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(schema.items, item, `${location}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];

    for (const property of required) {
      if (!Object.prototype.hasOwnProperty.call(value, property)) {
        errors.push(`${location}: missing required property ${property}`);
      }
    }

    for (const [key, childValue] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        errors.push(...validate(properties[key], childValue, `${location}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${location}: unexpected property ${key}`);
      }
    }
  }

  return errors;
}

let failureCount = 0;

for (const validation of validations) {
  const schema = loadJson(validation.schema);
  const samples = loadJsonl(validation.samples);
  const sampleErrors = [];
  let validationFailureCount = 0;

  for (const sample of samples) {
    const errors = validate(schema, sample.value);
    if (errors.length > 0) {
      validationFailureCount += 1;
      console.error(`${validation.samples}:${sample.index} failed ${validation.schema}`);
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
    }
  }

  if (validation.schema.endsWith("control_message.schema.json")) {
    const expectedTypes = schema.properties?.type?.enum ?? [];
    const seenTypes = new Set(samples.map((sample) => sample.value.type));
    for (const expectedType of expectedTypes) {
      if (!seenTypes.has(expectedType)) {
        sampleErrors.push(`missing control message sample for type ${expectedType}`);
      }
    }
  }

  if (sampleErrors.length > 0) {
    validationFailureCount += 1;
    console.error(`${validation.samples} failed sample coverage checks`);
    for (const error of sampleErrors) {
      console.error(`  - ${error}`);
    }
  }

  if (validationFailureCount === 0) {
    console.log(`OK ${validation.samples}: ${samples.length} sample(s) matched ${validation.schema}`);
  }

  failureCount += validationFailureCount;
}

if (failureCount > 0) {
  console.error(`Schema sample validation failed: ${failureCount} invalid sample(s)`);
  process.exit(1);
}
