import { EXIT, LabError } from "./errors.mjs";

export function parseOptions(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      throw new LabError("INVALID_ARGUMENT", `Unexpected positional argument: ${token}`, EXIT.INPUT_FAIL);
    }
    const equalsIndex = token.indexOf("=");
    const name = token.slice(2, equalsIndex >= 0 ? equalsIndex : undefined);
    const inlineValue = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : undefined;
    if (!name) {
      throw new LabError("INVALID_ARGUMENT", "Empty option name", EXIT.INPUT_FAIL);
    }
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      throw new LabError("DUPLICATE_ARGUMENT", `Option --${name} was supplied more than once`, EXIT.INPUT_FAIL);
    }
    if (inlineValue !== undefined) {
      options[name] = inlineValue;
      continue;
    }
    const next = tokens[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[name] = true;
    } else {
      options[name] = next;
      index += 1;
    }
  }
  return options;
}

export function requireStringOption(options, name) {
  if (typeof options[name] !== "string" || options[name].trim().length === 0) {
    throw new LabError("MISSING_ARGUMENT", `--${name} is required`, EXIT.INPUT_FAIL);
  }
  return options[name];
}

export function rejectUnknownOptions(options, allowed) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(options).filter((name) => !allowedSet.has(name));
  if (unknown.length > 0) {
    throw new LabError(
      "UNKNOWN_ARGUMENT",
      `Unknown option(s): ${unknown.map((name) => `--${name}`).join(", ")}`,
      EXIT.INPUT_FAIL,
    );
  }
}
