import assert from "node:assert/strict";
import fs from "node:fs";
import { validateSchemaSubset } from "../../tools/lib/schema_subset.mjs";

const schema = JSON.parse(fs.readFileSync(new URL("../../schemas/telemetry_frame.schema.json", import.meta.url), "utf8"));
const wire = JSON.parse(fs.readFileSync(new URL("../../schemas/espnow_telemetry_wire_v3.json", import.meta.url), "utf8"));
const legacy = JSON.parse(fs.readFileSync(new URL("./telemetry_frames.valid.jsonl", import.meta.url), "utf8").split(/\r?\n/)[0]);
const frame = {
  ...legacy,
  resolved: {
    family: "Granular",
    container: {
      span_x_m: 0.125, span_y_m: 0.25, span_z_m: 0.0625,
      fill: 0.375, headspace: 0.625, viscosity: 0.25,
      particle_count: 0.75, particle_hardness: 0.875,
    },
    model: { coherent_container_demo: true, device_frame_transform: true },
  },
};
assert.deepEqual(validateSchemaSubset(schema, legacy), [], "v1/v2 without resolved remain valid");
assert.deepEqual(validateSchemaSubset(schema, frame), []);
const invalid = (mutate) => {
  const changed = structuredClone(frame);
  mutate(changed.resolved);
  assert.notEqual(validateSchemaSubset(schema, changed).length, 0);
};
invalid((r) => { r.family = "unknown"; });
invalid((r) => { delete r.container; });
invalid((r) => { delete r.model.device_frame_transform; });
invalid((r) => { r.model.coherent_container_demo = 1; });
invalid((r) => { r.container.span_y_m = -1; });
invalid((r) => { r.container.particle_count = 2; });
invalid((r) => { r.container.viscosity = null; });
invalid((r) => { r.container.fill = -0.1; });
invalid((r) => { r.container.unreported = 1; });
assert.equal(wire.version, 3);
assert.equal(wire.packet_size_bytes, 230);
assert.equal(wire.crc.covered_byte_count, 226);
const offsets = Object.fromEntries(wire.resolved_extension.fields.map((f) => [f.name, f.offset]));
assert.deepEqual(offsets, {
  family: 196, model_flags: 197, span_x_m: 198, span_y_m: 202,
  span_z_m: 206, headspace: 210, viscosity: 214, particle_count: 218,
  particle_hardness: 222, crc32: 226,
});
// The small repository validator ignores exclusiveMinimum; wire C++ tests
// cover zero/NaN spans. Keep the full JSON Schema contract strictly positive.
assert.equal(schema.properties.resolved.properties.container.properties.span_x_m.exclusiveMinimum, 0);
console.log("OK resolved telemetry: legacy + v3 accepted, 9 invalid cases rejected, wire offsets checked.");
