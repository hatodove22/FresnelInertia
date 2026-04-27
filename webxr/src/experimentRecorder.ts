import type { SpatialPanelState, TiltState } from "./types";

export type TrialPhase = "start" | "sample" | "mark" | "next" | "stop";

export interface TrialSnapshot {
  condition: string;
  repeat: number;
  preset: string;
  inputMode: string;
  panelState: SpatialPanelState;
  tilt: TiltState;
}

export interface TrialRecord extends TrialSnapshot {
  timestamp: string;
  elapsedMs: number;
  phase: TrialPhase;
  marker: string;
}

export class ExperimentRecorder {
  readonly records: TrialRecord[] = [];
  private running = false;
  private startedAt = 0;
  private stoppedElapsedMs = 0;
  private lastSampleAt = 0;
  private markerCount = 0;

  isRunning() {
    return this.running;
  }

  elapsedMs(now = performance.now()) {
    return this.running ? now - this.startedAt : this.stoppedElapsedMs;
  }

  start(snapshot: TrialSnapshot, now = performance.now()) {
    if (this.running) {
      return;
    }
    this.running = true;
    this.startedAt = now;
    this.stoppedElapsedMs = 0;
    this.lastSampleAt = now;
    this.markerCount = 0;
    this.log("start", "trial_start", snapshot, now);
  }

  stop(snapshot: TrialSnapshot, now = performance.now()) {
    if (!this.running) {
      return;
    }
    this.log("stop", "trial_stop", snapshot, now);
    this.stoppedElapsedMs = now - this.startedAt;
    this.running = false;
  }

  mark(snapshot: TrialSnapshot, now = performance.now()) {
    this.markerCount += 1;
    this.log("mark", `mark_${this.markerCount}`, snapshot, now);
  }

  next(snapshot: TrialSnapshot, now = performance.now()) {
    this.log("next", "repeat_next", snapshot, now);
  }

  sample(snapshot: TrialSnapshot, now = performance.now()) {
    if (!this.running || now - this.lastSampleAt < 250) {
      return;
    }
    this.lastSampleAt = now;
    this.log("sample", "tick", snapshot, now);
  }

  toJson() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), records: this.records }, null, 2);
  }

  toCsv() {
    const header = [
      "timestamp",
      "elapsedMs",
      "phase",
      "marker",
      "condition",
      "repeat",
      "preset",
      "inputMode",
      "shakeBoost",
      "dampingPreview",
      "tiltX",
      "tiltY"
    ];
    const rows = this.records.map((record) => [
      record.timestamp,
      Math.round(record.elapsedMs).toString(),
      record.phase,
      record.marker,
      record.condition,
      record.repeat.toString(),
      record.preset,
      record.inputMode,
      record.panelState.shakeBoost.toFixed(3),
      record.panelState.dampingPreview.toFixed(3),
      record.tilt.x.toFixed(4),
      record.tilt.y.toFixed(4)
    ]);
    return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  }

  private log(phase: TrialPhase, marker: string, snapshot: TrialSnapshot, now: number) {
    this.records.push({
      ...snapshot,
      panelState: { ...snapshot.panelState },
      tilt: { ...snapshot.tilt },
      timestamp: new Date().toISOString(),
      elapsedMs: this.running ? now - this.startedAt : 0,
      phase,
      marker
    });
  }
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}
