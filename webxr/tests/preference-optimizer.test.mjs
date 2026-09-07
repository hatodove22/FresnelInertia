import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/tuning/PreferenceOptimizer.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const { PreferenceOptimizer } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const observe = (a, b, preference) => ({ a, b, preference });
function finitePrediction(prediction) {
  assert.ok(Number.isFinite(prediction.mean));
  assert.ok(Number.isFinite(prediction.variance) && prediction.variance >= 0 && prediction.variance <= 1 + 1e-8);
}

test("no history gives a neutral uncertain prior and deterministic bounded suggestions for one to five dimensions", () => {
  for (const dimensions of [1, 2, 3, 4, 5]) {
    const optimizer = new PreferenceOptimizer(dimensions), current = Array(dimensions).fill(0.5);
    assert.deepEqual(optimizer.predict(current), { mean: 0, variance: 1 });
    const first = optimizer.suggest(current, 17);
    assert.deepEqual(first, optimizer.suggest(current, 17));
    assert.notDeepEqual(first.point, current);
    assert.equal(first.point.length, dimensions);
    assert.ok(first.point.every(value => value >= 0 && value <= 1));
    assert.ok(first.point.every(value => value === 0 || value === 1),
      "prior difference uncertainty is largest at a corner, not a random identical-variance point");
    assert.equal(first.mean, 0); assert.equal(first.uncertainty, 1);
    assert.doesNotMatch(first.reason, /最適解|保証|global optimum/i);
    const excluded = optimizer.suggest(current, 17, [first.point]);
    assert.notDeepEqual(excluded.point, first.point);
  }
  assert.deepEqual(new PreferenceOptimizer(2).suggest([0.15, 0.2], 24).point, [1, 1],
    "joint prior covariance identifies the uniquely most distinct challenger");
});

test("pairwise choices learn the correct order, and repeated agreement strengthens a noisy comparison", () => {
  const optimizer = new PreferenceOptimizer(1), a = [0.15], b = [0.85];
  optimizer.fit([observe(a, b, "b")]);
  const weak = optimizer.predict(b).mean - optimizer.predict(a).mean;
  assert.ok(weak > 0);
  optimizer.fit(Array.from({ length: 16 }, () => observe(a, b, "b")));
  const strong = optimizer.predict(b).mean - optimizer.predict(a).mean;
  assert.ok(strong > weak + 0.5);
  const high = optimizer.predict(b), low = optimizer.predict(a);
  finitePrediction(high); finitePrediction(low);
  assert.ok(high.variance < 1 && low.variance < 1);
  close(high.mean, -low.mean, 1e-7, "preference learns a difference, not a free intercept");
  optimizer.fit([observe([0], [0.33], "b"), observe([0.33], [0.66], "b"), observe([0.66], [1], "b"),
    observe([0], [0.66], "b"), observe([0.33], [1], "b")]);
  const ordered = [0, 0.33, 0.66, 1].map(x => optimizer.predict([x]).mean);
  assert.ok(ordered.every((value, i) => i === 0 || value > ordered[i - 1]), `correct direction: ${ordered}`);
});

test("ties are informative symmetric ordinal observations; contradictory choices stay finite", () => {
  const a = [0.1, 0.3], b = [0.9, 0.7], optimizer = new PreferenceOptimizer(2);
  optimizer.fit([observe(a, b, "tie")]);
  const oneTie = optimizer.predict(a);
  close(oneTie.mean, 0); close(optimizer.predict(b).mean, 0);
  assert.ok(oneTie.variance < 1, "a tie constrains their difference without fabricating a winner");
  optimizer.fit(Array.from({ length: 16 }, () => observe(a, b, "tie")));
  assert.ok(optimizer.predict(a).variance < oneTie.variance);
  optimizer.fit([observe(a, b, "a"), observe(a, b, "b"), observe(a, b, "tie")]);
  close(optimizer.predict(a).mean, 0); close(optimizer.predict(b).mean, 0);
  for (const point of [a, b, [0.5, 0.5], [0, 1]]) finitePrediction(optimizer.predict(point));
  optimizer.fit([observe(a, a, "a"), observe(a, a, "b"), observe(a, a, "tie")]);
  close(optimizer.predict(a).mean, 0); close(optimizer.predict(a).variance, 1);
});

test("GP Laplace mean and variance match an independent scalar posterior for mixed wins, losses and ties", () => {
  // With only two inputs the entire likelihood depends on one scalar utility
  // difference. Bisection of that scalar posterior gives an independent check
  // of the matrix Newton solve and both ordinal-logistic derivatives.
  const optimizer = new PreferenceOptimizer(1), a = [0.2], b = [0.8];
  optimizer.fit(["a", "a", "a", "b", "tie", "tie"].map(preference => observe(a, b, preference)));
  const correlation = Math.exp(-(0.6 ** 2) / (2 * 0.3 ** 2));
  const variance = 2 * (1 - correlation + 1e-8), margin = 0.3;
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const gradient = difference => difference / variance - (
    3 * (1 - sigmoid(difference - margin)) - (1 - sigmoid(-difference - margin)) -
    2 * Math.sinh(difference) / (Math.cosh(margin) + Math.cosh(difference)));
  let low = -10, high = 10;
  for (let i = 0; i < 80; i++) {
    const middle = (low + high) / 2;
    if (gradient(middle) > 0) high = middle; else low = middle;
  }
  const difference = (low + high) / 2, pa = sigmoid(difference - margin), pb = sigmoid(-difference - margin);
  const curvature = 3 * pa * (1 - pa) + pb * (1 - pb) +
    2 * (Math.cosh(margin) * Math.cosh(difference) + 1) / (Math.cosh(margin) + Math.cosh(difference)) ** 2;
  const posteriorDifferenceVariance = 1 / (1 / variance + curvature);
  const covariance = 1 - correlation;
  const expectedMean = covariance / variance * difference;
  const expectedVariance = 1 - covariance ** 2 / variance + covariance ** 2 / variance ** 2 * posteriorDifferenceVariance;
  close(optimizer.predict(a).mean, expectedMean, 1e-7);
  close(optimizer.predict(b).mean, -expectedMean, 1e-7);
  close(optimizer.predict(a).variance, expectedVariance, 1e-7);
  close(optimizer.predict(b).variance, expectedVariance, 1e-7);
});

test("near-coincident comparisons are stable and correlated utility uncertainty does not cause duplicate acquisition", () => {
  const optimizer = new PreferenceOptimizer(2), center = [0.5, 0.5];
  const observations = Array.from({ length: 25 }, (_, i) => observe(center, [0.5 + (i + 1) * 1e-7, 0.5], i % 2 ? "a" : "tie"));
  optimizer.fit(observations);
  finitePrediction(optimizer.predict(center));
  finitePrediction(optimizer.predict([0.5 + 1e-10, 0.5]));
  const candidate = optimizer.suggest(center, 11);
  assert.ok(Math.hypot(candidate.point[0] - center[0], candidate.point[1] - center[1]) > 0.1,
    "shared near-point uncertainty is not independent improvement potential");
});

test("raw data and caller points are not mutated; a fresh instance reproduces the fit and seed", () => {
  const history = [observe([0.1, 0.2], [0.6, 0.5], "b"), observe([0.6, 0.5], [0.8, 0.9], "a"), observe([0.6, 0.5], [0.65, 0.6], "tie")];
  const original = structuredClone(history), first = new PreferenceOptimizer(2), second = new PreferenceOptimizer(2);
  first.fit(history); second.fit(structuredClone(history));
  const current = [0.6, 0.5], exclude = [[0.8, 0.9]];
  assert.deepEqual(first.suggest(current, 981, exclude), second.suggest(current, 981, exclude));
  assert.deepEqual(history, original); assert.deepEqual(current, [0.6, 0.5]); assert.deepEqual(exclude, [[0.8, 0.9]]);
  history[0].a[0] = 0.95;
  assert.deepEqual(first.predict([0.1, 0.2]), second.predict([0.1, 0.2]), "posterior owns copies of training points");
  first.fit([]); assert.deepEqual(first.predict(current), { mean: 0, variance: 1 });
});

test("bounded preference search improves a known two-dimensional objective from actual pairwise feedback", () => {
  const objective = ([x, y]) => -((x - 0.72) ** 2 + 1.4 * (y - 0.31) ** 2);
  for (const seed of [4, 19, 41]) {
    const optimizer = new PreferenceOptimizer(2), history = [], tried = [[0.05, 0.95]];
    const initial = tried[0]; let incumbent = initial;
    for (let trial = 0; trial < 28; trial++) {
      const result = optimizer.suggest(incumbent, seed + trial * 17, tried);
      const candidate = result.point, delta = objective(candidate) - objective(incumbent);
      assert.ok(candidate.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      assert.ok(Number.isFinite(result.mean) && Number.isFinite(result.uncertainty));
      history.push(observe([...incumbent], candidate, Math.abs(delta) < 0.004 ? "tie" : delta > 0 ? "b" : "a"));
      tried.push(candidate);
      if (delta > 0.004) incumbent = candidate;
      optimizer.fit(history);
    }
    assert.ok(objective(incumbent) > objective(initial) + 0.4);
    assert.ok(objective(incumbent) > -0.05, `useful tested candidate at seed ${seed}: ${incumbent}`);
    const inferredBest = tried.reduce((a, b) => optimizer.predict(a).mean > optimizer.predict(b).mean ? a : b);
    assert.ok(objective(inferredBest) > -0.1, `posterior ranking is useful, not only random candidate coverage: ${inferredBest}`);
    for (const point of tried) finitePrediction(optimizer.predict(point));
  }
});

test("dimension, coordinate and history budgets are explicit and a rejected refit preserves the existing posterior", () => {
  for (const dimension of [0, 6, 1.5, NaN]) assert.throws(() => new PreferenceOptimizer(dimension), RangeError);
  const optimizer = new PreferenceOptimizer(2), a = [0.2, 0.2], b = [0.8, 0.8];
  optimizer.fit([observe(a, b, "b")]); const previous = optimizer.predict(a);
  for (const invalid of [[-0.1, 0], [1.1, 0], [NaN, 0], [Infinity, 0], [0.2], new Array(2)]) {
    assert.throws(() => optimizer.predict(invalid), RangeError);
    assert.throws(() => optimizer.fit([observe(a, invalid, "a")]), RangeError);
  }
  assert.throws(() => optimizer.fit([observe(a, b, "skip")]), RangeError);
  assert.throws(() => optimizer.fit(Array.from({ length: 61 }, () => observe(a, b, "a"))), RangeError);
  assert.throws(() => optimizer.fit(Array.from({ length: 33 }, (_, i) => observe([i / 100, 0], [i / 100, 1], "a"))), RangeError);
  assert.throws(() => optimizer.suggest(a, NaN), RangeError);
  assert.deepEqual(optimizer.predict(a), previous);
  optimizer.fit(Array.from({ length: 60 }, (_, i) => observe(a, b, i % 3 === 0 ? "tie" : "b")));
  finitePrediction(optimizer.predict(a)); finitePrediction(optimizer.predict(b));
});

test("five-dimensional posterior includes the fifth coordinate and matches its independent one-dimensional restriction", () => {
  // Holding the first four axes equal reduces the same RBF prior and ordinal
  // likelihood to the already independently checked scalar problem. This also
  // detects silently truncating the combined session's final torque coordinate.
  const full = new PreferenceOptimizer(5), scalar = new PreferenceOptimizer(1);
  const lift = z => [0.2, 0.4, 0.6, 0.8, z];
  const rows = [[0.1, 0.4, 'b'], [0.4, 0.8, 'b'], [0.1, 0.8, 'b'], [0.8, 0.9, 'tie']];
  full.fit(rows.map(([a, b, preference]) => observe(lift(a), lift(b), preference)));
  scalar.fit(rows.map(([a, b, preference]) => observe([a], [b], preference)));
  for (const z of [0, 0.1, 0.3, 0.4, 0.65, 0.8, 0.9, 1]) {
    const prediction = full.predict(lift(z)), expected = scalar.predict([z]);
    finitePrediction(prediction);
    close(prediction.mean, expected.mean, 1e-8);
    close(prediction.variance, expected.variance, 1e-8);
  }
  assert.ok(full.predict(lift(0.8)).mean > full.predict(lift(0.1)).mean);
  assert.throws(() => full.predict([0.2, 0.4, 0.6, 0.8]), RangeError);
  assert.throws(() => full.suggest(lift(0.8), 55, [new Array(5)]), RangeError);
});

test("bounded joint 5D search handles cross-branch interactions using only pairwise feedback", () => {
  // Deliberately non-additive vibration × position and damping × inertia terms.
  // This is a deterministic numerical regression, not a perceptual convergence
  // guarantee or evidence that a fixed number of human votes is sufficient.
  const target = [0.7, 0.3, 0.65, 0.25, 0.6];
  const objective = point => -point.reduce((sum, value, axis) => sum + (value - target[axis]) ** 2, 0) -
    2 * (point[0] * point[2] - target[0] * target[2]) ** 2 -
    1.3 * (point[1] * point[3] - target[1] * target[3]) ** 2;
  for (const seed of [9, 31]) {
    const optimizer = new PreferenceOptimizer(5), history = [], initial = [0.08, 0.9, 0.08, 0.9, 0.1], tried = [initial];
    let incumbent = initial;
    for (let trial = 0; trial < 36; trial++) {
      const proposal = optimizer.suggest(incumbent, seed + trial * 29, tried);
      assert.equal(proposal.point.length, 5);
      assert.ok(proposal.point.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      assert.ok(Number.isFinite(proposal.mean) && Number.isFinite(proposal.uncertainty));
      assert.ok(!tried.some(point => point.every((value, axis) => Math.abs(value - proposal.point[axis]) < 1e-6)),
        'the fifth Halton axis participates in bounded nonduplicate candidates');
      const delta = objective(proposal.point) - objective(incumbent);
      history.push(observe([...incumbent], [...proposal.point], Math.abs(delta) < 0.004 ? 'tie' : delta > 0 ? 'b' : 'a'));
      tried.push(proposal.point);
      if (delta > 0.004) incumbent = proposal.point;
      optimizer.fit(history);
    }
    assert.ok(objective(incumbent) > objective(initial) + 0.4, 'joint comparison learns a useful tested combination on this synthetic fixture');
    const inferredBest = tried.reduce((a, b) => optimizer.predict(a).mean > optimizer.predict(b).mean ? a : b);
    assert.ok(objective(inferredBest) > objective(initial) + 0.4, 'posterior ranking reflects the combined preference data');
    for (const point of tried) finitePrediction(optimizer.predict(point));
    const restored = new PreferenceOptimizer(5); restored.fit(structuredClone(history));
    assert.deepEqual(optimizer.suggest(incumbent, 1001, tried), restored.suggest(incumbent, 1001, tried));
  }
});
