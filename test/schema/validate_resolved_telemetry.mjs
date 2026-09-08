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
const wire4 = JSON.parse(fs.readFileSync(new URL("../../schemas/espnow_telemetry_wire_v4.json", import.meta.url), "utf8"));
const v4 = structuredClone(frame);
v4.mass.demo = {
  pile_slope: -0.625, granular_flow: 0.375, granular_pile_active: true,
  pressure: { enabled: true, phase: "burst", charge: 0.875, phase_s: 1.234, remaining: 0.25, burst_sequence: 412 }
};
v4.last_event = { type: "PressurePop", primary_wall: "Top", amplitude: 0.9 };
assert.deepEqual(validateSchemaSubset(schema, v4), []);
for (const phase of ["sealed", "burst", "spent"]) {
  v4.mass.demo.pressure.phase = phase;
  assert.deepEqual(validateSchemaSubset(schema, v4), []);
}
for (const mutate of [
  d => { d.pile_slope = null; }, d => { d.granular_flow = 1.01; },
  d => { d.granular_pile_active = 1; }, d => { delete d.pressure; },
  d => { d.pressure.enabled = 1; }, d => { d.pressure.phase = "open"; },
  d => { d.pressure.charge = -1; }, d => { d.pressure.remaining = 2; },
  d => { d.pressure.phase_s = -0.1; }, d => { d.pressure.burst_sequence = 65536; },
  d => { d.pressure.burst_sequence = 0.5; }, d => { delete d.pressure.remaining; }
]) {
  const changed = structuredClone(v4);
  mutate(changed.mass.demo);
  assert.notEqual(validateSchemaSubset(schema, changed).length, 0);
}
assert.equal(wire4.version, 4);
assert.equal(wire4.packet_size_bytes, 250);
assert.equal(wire4.crc.covered_byte_count, 246);
assert.deepEqual(Object.fromEntries(wire4.demo_extension.fields.map(f => [f.name, f.offset])), {
  pile_slope: 226, granular_flow: 230, pressure_charge: 234, pressure_phase_ms: 238,
  burst_sequence: 240, pressure_phase: 242, flags: 243, pressure_remaining: 244, crc32: 246
});
const wire5 = JSON.parse(fs.readFileSync(new URL("../../schemas/espnow_telemetry_wire_v5.json", import.meta.url), "utf8"));
const v5 = structuredClone(frame);
v5.mass.heartbeat = { enabled: true, phase: 0.25, bpm: 72, beat_sequence: 4294967295,
  primary: 0.8, secondary: 0.1, contraction: 0.6 };
v5.last_event = { type: "HeartbeatPulse", primary_wall: "None", amplitude: 0.8 };
assert.deepEqual(validateSchemaSubset(schema, v5), []);
for (const mutate of [
  h => { h.enabled = false; }, h => { h.phase = -0.1; }, h => { h.phase = null; },
  h => { h.bpm = 39; }, h => { h.bpm = 141; }, h => { h.beat_sequence = 4294967296; },
  h => { h.beat_sequence = 0.5; }, h => { h.primary = -1; }, h => { h.secondary = 2; },
  h => { h.contraction = null; }, h => { delete h.primary; }, h => { h.unreported = 1; }
]) {
  const changed = structuredClone(v5); mutate(changed.mass.heartbeat);
  assert.notEqual(validateSchemaSubset(schema, changed).length, 0);
}
// The subset validator ignores exclusiveMaximum; C++ and Web parser tests
// exercise phase=1 rejection while this asserts the complete schema contract.
assert.equal(schema.properties.mass.properties.heartbeat.properties.phase.exclusiveMaximum, 1);
assert.equal(wire5.version, 5);
assert.equal(wire5.packet_size_bytes, 250);
assert.equal(wire5.crc.covered_byte_count, 246);
assert.deepEqual(Object.fromEntries(wire5.heartbeat_extension.fields.map(f => [f.name, f.offset])), {
  phase: 226, bpm: 230, beat_sequence: 234, primary: 238, secondary: 240,
  contraction: 242, enabled: 244, reserved: 245, crc32: 246
});
console.log("OK telemetry v1-v5; malformed config/demo/heartbeat cases rejected; v3/v4/v5 wire offsets checked.");
