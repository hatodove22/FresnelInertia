/**
 * Validate the deliberately small JSON Schema subset used by this repository.
 *
 * Supported keywords: type, enum, minimum, maximum, minItems, maxItems,
 * items, required, properties, and additionalProperties=false. Unknown
 * keywords are annotations from this validator's point of view. The function
 * is pure so firmware-independent tools and tests can share identical error
 * codes without pulling in a package manager dependency.
 */

export function schemaValueType(value) {
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

export function matchesSchemaType(value, expected) {
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

export function validateSchemaSubset(schema, value, location = "$") {
  const errors = [];

  const addError = (keyword, discriminator, message) => {
    errors.push({
      code: `${keyword}|${location}|${discriminator}`,
      keyword,
      location,
      discriminator: String(discriminator),
      message: `${location}: ${message}`,
    });
  };

  if (!schema || Object.keys(schema).length === 0) {
    return errors;
  }

  if (schema.type && !matchesSchemaType(value, schema.type)) {
    addError("type", schema.type, `expected ${schema.type}, got ${schemaValueType(value)}`);
    return errors;
  }

  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    addError(
      "enum",
      JSON.stringify(value),
      `expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`,
    );
  }

  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) {
    addError("minimum", schema.minimum, `expected >= ${schema.minimum}, got ${value}`);
  }

  if (typeof schema.maximum === "number" && typeof value === "number" && value > schema.maximum) {
    addError("maximum", schema.maximum, `expected <= ${schema.maximum}, got ${value}`);
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      addError("minItems", schema.minItems, `expected at least ${schema.minItems} items, got ${value.length}`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      addError("maxItems", schema.maxItems, `expected at most ${schema.maxItems} items, got ${value.length}`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateSchemaSubset(schema.items, item, `${location}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];

    for (const property of required) {
      if (!Object.prototype.hasOwnProperty.call(value, property)) {
        addError("required", property, `missing required property ${property}`);
      }
    }

    for (const [key, childValue] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        errors.push(...validateSchemaSubset(properties[key], childValue, `${location}.${key}`));
      } else if (schema.additionalProperties === false) {
        addError("additionalProperties", key, `unexpected property ${key}`);
      }
    }
  }

  return errors;
}
