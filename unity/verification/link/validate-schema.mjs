import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../webxr/package.json', import.meta.url));
const Ajv2020 = require('ajv/dist/2020.js').default;
const schema = JSON.parse(fs.readFileSync(new URL('../../../schemas/telemetry_frame.schema.json', import.meta.url), 'utf8'));
const samples = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
for (let index = 0; index < samples.length; index++) {
  if (!validate(samples[index])) throw new Error(`Snapshot ${index} ${samples[index].preset}: ${JSON.stringify(validate.errors)}`);
}
console.log(`Canonical telemetry schema: ${samples.length}/${samples.length} raw mock/loopback snapshots PASS`);
