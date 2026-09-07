export type Preference = "a" | "b" | "tie";
export interface Observation { a: number[]; b: number[]; preference: Preference }

interface Likelihood { log: number; gradient: number; weight: number }
interface Comparison { difference: Float64Array; preference: Preference }
interface Posterior {
  points: number[][];
  priorRoot: Float64Array;
  mode: Float64Array;
  precisionRoot: Float64Array;
}
interface Projection { coordinates: Float64Array; mean: number; variance: number }

const MAX_VOTES = 60, MAX_POINTS = 64;
const LENGTH_SCALE = 0.30, JITTER = 1e-8, TIE_MARGIN = 0.30;
const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const dot = (a: Float64Array, b: Float64Array) => {
  let value = 0;
  for (let i = 0; i < a.length; i++) value += a[i] * b[i];
  return value;
};
const sigmoid = (x: number) => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
const softplus = (x: number) => Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x)));

/** Ordered logistic observation model on d = utility(a) - utility(b).
 * A: sigmoid(d-delta); B: sigmoid(-d-delta); tie: 1-P(A)-P(B).
 * The interval likelihood is real evidence for a small difference, not two
 * contradictory votes or a fabricated numeric utility measurement. */
function likelihood(d: number, preference: Preference): Likelihood {
  if (preference !== "tie") {
    const sign = preference === "a" ? 1 : -1, value = sign * d - TIE_MARGIN;
    const p = sigmoid(value);
    return { log: -softplus(-value), gradient: sign * (1 - p), weight: p * (1 - p) };
  }
  // P(tie) = 2*sinh(delta) / (exp(d)+exp(-d)+exp(delta)+exp(-delta)).
  // Stable log-sum-exp also gives the analytic gradient and negative Hessian.
  const shift = Math.max(Math.abs(d), TIE_MARGIN);
  const positive = Math.exp(d - shift), negative = Math.exp(-d - shift);
  const sum = positive + negative + Math.exp(TIE_MARGIN - shift) + Math.exp(-TIE_MARGIN - shift);
  const difference = (positive - negative) / sum;
  return {
    log: Math.log(Math.expm1(2 * TIE_MARGIN)) - TIE_MARGIN - shift - Math.log(sum),
    gradient: -difference,
    weight: Math.max(0, (positive + negative) / sum - difference * difference),
  };
}

function kernel(a: number[], b: number[]) {
  let distance = 0;
  for (let i = 0; i < a.length; i++) distance += (a[i] - b[i]) ** 2;
  return Math.exp(-distance / (2 * LENGTH_SCALE * LENGTH_SCALE));
}

/** Dense Cholesky is small here (at most 64 distinct configurations).
 * There are no explicit matrix inverses or third-party numeric dependencies. */
function cholesky(matrix: Float64Array, n: number) {
  const root = new Float64Array(matrix.length);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let value = matrix[i * n + j];
    for (let k = 0; k < j; k++) value -= root[i * n + k] * root[j * n + k];
    if (i === j) {
      if (!Number.isFinite(value) || value <= 0) throw new Error("Preference posterior is not numerically positive definite");
      root[i * n + j] = Math.sqrt(value);
    } else root[i * n + j] = value / root[j * n + j];
  }
  return root;
}
function lowerSolve(root: Float64Array, b: Float64Array) {
  const n = b.length, result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let value = b[i];
    for (let j = 0; j < i; j++) value -= root[i * n + j] * result[j];
    result[i] = value / root[i * n + i];
  }
  return result;
}
function transposeSolve(root: Float64Array, b: Float64Array) {
  const n = b.length, result = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let value = b[i];
    for (let j = i + 1; j < n; j++) value -= root[j * n + i] * result[j];
    result[i] = value / root[i * n + i];
  }
  return result;
}

function objective(z: Float64Array, comparisons: Comparison[]) {
  let value = dot(z, z) * 0.5;
  for (const comparison of comparisons) value -= likelihood(dot(comparison.difference, z), comparison.preference).log;
  return value;
}
function derivatives(z: Float64Array, comparisons: Comparison[]) {
  const n = z.length, gradient = Float64Array.from(z), hessian = new Float64Array(n * n);
  for (let i = 0; i < n; i++) hessian[i * n + i] = 1;
  for (const comparison of comparisons) {
    const vector = comparison.difference, term = likelihood(dot(vector, z), comparison.preference);
    for (let i = 0; i < n; i++) {
      gradient[i] -= term.gradient * vector[i];
      for (let j = 0; j <= i; j++) {
        const value = term.weight * vector[i] * vector[j];
        hessian[i * n + j] += value;
        if (i !== j) hessian[j * n + i] += value;
      }
    }
  }
  return { gradient, hessian };
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function halton(index: number, base: number) {
  let result = 0, fraction = 1;
  while (index > 0) { fraction /= base; result += fraction * (index % base); index = Math.floor(index / base); }
  return result;
}
function normalCdf(x: number) {
  // Standard normal CDF approximation (absolute error below 8e-8). Fitting
  // uses exact analytic logistic derivatives; this is only for Gaussian EI.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail = Math.exp(-x * x / 2) / SQRT_TWO_PI * t *
    (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}
function positiveDifference(mean: number, variance: number) {
  if (variance <= 1e-16) return Math.max(0, mean);
  const sd = Math.sqrt(variance), z = mean / sd;
  return Math.max(0, mean * normalCdf(z) + sd * Math.exp(-z * z / 2) / SQRT_TWO_PI);
}

/** Small, dependency-free preferential Bayesian search, with no hardware,
 * session storage or UI authority. Inputs are applied settings in [0,1]^d.
 *
 * Prior: zero-mean, unit-variance RBF GP. Comparison-noise scale, kernel length
 * and tie threshold are fixed because tens of choices cannot identify them
 * reliably together. Utility offset/scale are conventions, not a measured
 * quality score. Different people/materials/tasks need distinct sessions.
 *
 * Whiten f=Lz, z~N(0,I), fit the ordinal-logistic posterior mode with damped
 * Newton, and use its inverse Hessian as a Laplace covariance. This approximate
 * posterior and finite candidate pool do not certify a global optimum or
 * calibrated perceptual confidence. Keep a connected comparison history.
 *
 * Foundations: Brochu et al. (2007), preference GP + Laplace and logistic link:
 * https://papers.nips.cc/paper_files/paper/2007/file/b6a1085a27ab7bff7550f8a3bd017df8-Paper.pdf
 * Ordinal thresholds: https://jmlr.org/papers/v6/chu05a.html (probit there;
 * the explicit three-outcome logistic likelihood above is our adaptation).
 * Anchored expected-best-option acquisition:
 * https://botorch.readthedocs.io/en/stable/acquisition.html#botorch.acquisition.preference.AnalyticExpectedUtilityOfBestOption
 */
export class PreferenceOptimizer {
  private posterior?: Posterior;

  constructor(readonly dimensions: number) {
    if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 5) throw new RangeError("Preference search supports 1–5 dimensions");
  }

  private point(value: number[]): number[] {
    if (!Array.isArray(value) || value.length !== this.dimensions || Array.from(value).some(v => !Number.isFinite(v) || v < 0 || v > 1)) {
      throw new RangeError(`Preference points require ${this.dimensions} finite coordinates in [0,1]`);
    }
    return value.map(v => v === 0 ? 0 : v);
  }

  /** Refit from raw comparisons. Invalid input leaves the previous fit intact.
   * A skipped/unknown judgment must be omitted, never converted into a tie. */
  fit(observations: Observation[]): void {
    if (!Array.isArray(observations) || observations.length > MAX_VOTES) throw new RangeError("Preference search accepts at most 60 comparisons");
    const points: number[][] = [];
    const indexOf = (point: number[]) => {
      const index = points.findIndex(other => other.every((value, i) => Math.abs(value - point[i]) <= 1e-10));
      if (index >= 0) return index;
      if (points.length === MAX_POINTS) throw new RangeError("Preference search accepts at most 64 distinct points");
      points.push(point); return points.length - 1;
    };
    const rows = observations.map(observation => {
      if (!observation || !["a", "b", "tie"].includes(observation.preference)) throw new RangeError("A comparison must be a, b or tie");
      return { a: indexOf(this.point(observation.a)), b: indexOf(this.point(observation.b)), preference: observation.preference };
    });
    const n = points.length;
    if (n === 0) { this.posterior = undefined; return; }
    const covariance = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      const value = kernel(points[i], points[j]) + (i === j ? JITTER : 0);
      covariance[i * n + j] = covariance[j * n + i] = value;
    }
    const priorRoot = cholesky(covariance, n);
    const comparisons = rows.map(row => ({ preference: row.preference,
      difference: Float64Array.from({ length: n }, (_, j) => priorRoot[row.a * n + j] - priorRoot[row.b * n + j]) }));
    let mode = new Float64Array(n);
    for (let iteration = 0; iteration < 40; iteration++) {
      const { gradient, hessian } = derivatives(mode, comparisons);
      if (Math.max(...gradient.map(Math.abs)) < 1e-8) break;
      const root = cholesky(hessian, n), step = transposeSolve(root, lowerSolve(root, gradient));
      const before = objective(mode, comparisons), descent = dot(gradient, step);
      let amount = 1, accepted = false;
      for (let backtrack = 0; backtrack < 24; backtrack++) {
        const next = Float64Array.from(mode, (value, i) => value - amount * step[i]);
        if (objective(next, comparisons) <= before - 1e-4 * amount * descent + 1e-12) {
          mode = next; accepted = true; break;
        }
        amount *= 0.5;
      }
      if (!accepted) throw new Error("Preference posterior did not converge");
    }
    const final = derivatives(mode, comparisons);
    if (!mode.every(Number.isFinite) || Math.max(...final.gradient.map(Math.abs)) > 1e-5) throw new Error("Preference posterior did not converge");
    this.posterior = { points, priorRoot, mode, precisionRoot: cholesky(final.hessian, n) };
  }

  private project(x: number[]): Projection {
    const fit = this.posterior;
    if (!fit) return { coordinates: new Float64Array(), mean: 0, variance: 1 };
    const coordinates = lowerSolve(fit.priorRoot, Float64Array.from(fit.points, point => kernel(x, point)));
    const posteriorCoordinates = lowerSolve(fit.precisionRoot, coordinates);
    // Conditional GP uncertainty plus uncertainty of the inferred latent modes.
    const variance = 1 - dot(coordinates, coordinates) + dot(posteriorCoordinates, posteriorCoordinates);
    return { coordinates, mean: dot(coordinates, fit.mode), variance: Math.max(0, Math.min(1, variance)) };
  }

  predict(x: number[]): { mean: number; variance: number } {
    const prediction = this.project(this.point(x));
    return { mean: prediction.mean, variance: prediction.variance };
  }

  suggest(incumbent: number[], seed: number, exclude: number[][] = []): { point: number[]; mean: number; uncertainty: number; reason: string } {
    const reference = this.point(incumbent);
    if (!Number.isSafeInteger(seed)) throw new RangeError("Preference candidate seed must be a finite safe integer");
    if (!Array.isArray(exclude)) throw new RangeError("Excluded points must be an array");
    const excluded = [reference, ...exclude.map(point => this.point(point))];
    const randomValue = random(seed), shift = Array.from({ length: this.dimensions }, randomValue);
    const candidates: number[][] = [];
    const near = (a: number[], b: number[]) => a.every((value, i) => Math.abs(value - b[i]) < 1e-6);
    const add = (point: number[]) => {
      if (!excluded.some(other => near(point, other)) && !candidates.some(other => near(point, other))) candidates.push(point);
    };
    // Rotated low-discrepancy coverage, corners and local perturbations. This
    // finite reproducible search is an acquisition approximation, not a claim
    // that the best point over the continuous gain range has been found.
    for (let i = 1; i <= 192; i++) add(shift.map((offset, axis) => (halton(i, [2, 3, 5, 7, 11][axis]) + offset) % 1));
    for (let corner = 0; corner < 2 ** this.dimensions; corner++) add(reference.map((_, axis) => (corner >>> axis) & 1));
    for (const radius of [0.06, 0.15, 0.30]) {
      for (let axis = 0; axis < this.dimensions; axis++) for (const sign of [-1, 1]) {
        add(reference.map((value, i) => clamp(value + (axis === i ? sign * radius : 0))));
      }
      for (let i = 0; i < 24; i++) add(reference.map(value => clamp(value + (randomValue() * 2 - 1) * radius)));
    }
    for (const point of this.posterior?.points ?? []) add([...point]);
    if (!candidates.length) throw new RangeError("No distinct preference candidate is available");
    // Shuffle equal-scoring candidates without making seed affect the posterior.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(randomValue() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const baseline = this.project(reference);
    let best: { point: number[]; prediction: Projection; score: number; differenceSd: number } | undefined;
    for (const point of candidates) {
      const prediction = this.project(point);
      const difference = Float64Array.from(prediction.coordinates, (value, i) => value - baseline.coordinates[i]);
      const posteriorDifference = this.posterior ? lowerSolve(this.posterior.precisionRoot, difference) : difference;
      // Var[f(x)-f(b)] includes Cov[f(x),f(b)]. Comparing nearby points must
      // not treat their shared utility uncertainty as independent evidence.
      const variance = Math.max(0, 2 - 2 * kernel(point, reference) - dot(difference, difference) + dot(posteriorDifference, posteriorDifference));
      const score = positiveDifference(prediction.mean - baseline.mean, variance);
      if (!best || score > best.score + 1e-14) best = { point, prediction, score, differenceSd: Math.sqrt(variance) };
    }
    const selected = best!, differenceMean = selected.prediction.mean - baseline.mean;
    const reason = !this.posterior ? "まだ比較がないため、現在値と異なる範囲を試す候補です。" :
      differenceMean > selected.differenceSd ? "これまでの比較から改善が見込まれる候補です。実際に比べて確認します。" :
      "評価がまだ不確かな範囲も含め、改善の可能性を調べる候補です。";
    return { point: [...selected.point], mean: selected.prediction.mean,
      uncertainty: Math.sqrt(selected.prediction.variance), reason };
  }
}
