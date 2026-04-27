import * as THREE from "three";
import type { SpatialPanelState } from "../types";

type PanelHitKind = "preset" | "slider" | "reset" | "page" | "stimulus" | "trial";

interface PanelHit {
  kind: PanelHitKind;
  index: number;
  value?: number;
}

interface SpatialControlPanelOptions {
  presetNames: string[];
  selectedPreset: string;
  stimulusOptions: Array<{ value: string; label: string }>;
  selectedStimulus: string;
  onPresetSelected: (name: string) => void;
  onStimulusSelected: (name: string) => void;
  onStateChanged: (state: SpatialPanelState) => void;
  onTrialStartStop: () => void;
  onTrialMark: () => void;
  onTrialNext: () => void;
  onReset: () => void;
}

interface TrialPanelState {
  running: boolean;
  elapsedLabel: string;
  repeat: number;
}

const panelWidth = 0.42;
const panelHeight = 0.32;
const canvasWidth = 1024;
const canvasHeight = 780;
const presetPageSize = 5;

export class SpatialControlPanel {
  readonly group = new THREE.Group();
  readonly state: SpatialPanelState = {
    shakeBoost: 0.35,
    dampingPreview: 0.5
  };

  private readonly canvas = document.createElement("canvas");
  private readonly texture: THREE.CanvasTexture;
  private readonly panelMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly localPoint = new THREE.Vector3();
  private selectedPreset: string;
  private selectedStimulus: string;
  private trialState: TrialPanelState = {
    running: false,
    elapsedLabel: "00:00.0",
    repeat: 1
  };
  private presetPage = 0;
  private activeHitKey = "";
  private needsPaint = true;

  constructor(private readonly options: SpatialControlPanelOptions) {
    this.selectedPreset = options.selectedPreset;
    this.selectedStimulus = options.selectedStimulus;
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.panelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWidth, panelHeight),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    this.panelMesh.name = "spatial-experiment-panel";
    this.group.name = "spatial-control-panel";
    this.group.position.set(0.47, 1.12, -0.76);
    this.group.rotation.set(-0.08, -0.45, 0);
    this.group.add(this.panelMesh);
    this.paint();
  }

  setSelectedPreset(name: string) {
    if (this.selectedPreset !== name) {
      this.selectedPreset = name;
      const selectedIndex = this.options.presetNames.indexOf(name);
      if (selectedIndex >= 0) {
        this.presetPage = Math.floor(selectedIndex / presetPageSize);
      }
      this.needsPaint = true;
    }
  }

  setState(state: SpatialPanelState) {
    const next = {
      shakeBoost: THREE.MathUtils.clamp(state.shakeBoost, 0, 1),
      dampingPreview: THREE.MathUtils.clamp(state.dampingPreview, 0, 1)
    };
    if (this.state.shakeBoost !== next.shakeBoost || this.state.dampingPreview !== next.dampingPreview) {
      this.state.shakeBoost = next.shakeBoost;
      this.state.dampingPreview = next.dampingPreview;
      this.needsPaint = true;
    }
  }

  setStimulus(name: string) {
    if (this.selectedStimulus !== name) {
      this.selectedStimulus = name;
      this.needsPaint = true;
    }
  }

  setTrialState(state: TrialPanelState) {
    if (
      this.trialState.running !== state.running ||
      this.trialState.elapsedLabel !== state.elapsedLabel ||
      this.trialState.repeat !== state.repeat
    ) {
      this.trialState = { ...state };
      this.needsPaint = true;
    }
  }

  update() {
    if (this.needsPaint) {
      this.paint();
    }
  }

  interactRay(origin: THREE.Vector3, direction: THREE.Vector3, pressed: boolean) {
    this.raycaster.set(origin, direction);
    const hit = this.raycaster.intersectObject(this.panelMesh, false)[0];
    if (!hit) {
      if (!pressed) {
        this.activeHitKey = "";
      }
      return false;
    }
    this.panelMesh.worldToLocal(this.localPoint.copy(hit.point));
    return this.handleLocalPoint(this.localPoint.x, this.localPoint.y, pressed);
  }

  interactPoint(worldPoint: THREE.Vector3, pressed = true) {
    this.panelMesh.worldToLocal(this.localPoint.copy(worldPoint));
    const inside =
      Math.abs(this.localPoint.x) <= panelWidth * 0.5 + 0.018 &&
      Math.abs(this.localPoint.y) <= panelHeight * 0.5 + 0.018 &&
      Math.abs(this.localPoint.z) <= 0.035;
    if (!inside) {
      this.activeHitKey = "";
      return false;
    }
    return this.handleLocalPoint(this.localPoint.x, this.localPoint.y, pressed);
  }

  private handleLocalPoint(x: number, y: number, pressed: boolean) {
    const u = (x / panelWidth + 0.5) * canvasWidth;
    const v = (0.5 - y / panelHeight) * canvasHeight;
    const hit = this.pick(u, v);
    if (!hit) {
      return false;
    }

    const hitKey = `${hit.kind}:${hit.index}`;
    if (pressed && (hit.kind === "slider" || this.activeHitKey !== hitKey)) {
      this.activeHitKey = hitKey;
      this.applyHit(hit);
    }
    if (!pressed) {
      this.activeHitKey = "";
    }
    return true;
  }

  private pick(x: number, y: number): PanelHit | undefined {
    const presetStartY = 136;
    const presetRowH = 54;
    if (x >= 320 && x <= 410 && y >= 124 && y <= 166) {
      return { kind: "page", index: -1 };
    }
    if (x >= 422 && x <= 512 && y >= 124 && y <= 166) {
      return { kind: "page", index: 1 };
    }
    for (let i = 0; i < Math.min(this.visiblePresetCount(), presetPageSize); i += 1) {
      const top = presetStartY + i * presetRowH;
      if (x >= 44 && x <= 512 && y >= top && y <= top + 42) {
        return { kind: "preset", index: this.presetPage * presetPageSize + i };
      }
    }

    const sliders = [
      { y: 336, index: 0 },
      { y: 444, index: 1 }
    ];
    for (const slider of sliders) {
      if (x >= 574 && x <= 940 && y >= slider.y - 28 && y <= slider.y + 42) {
        return {
          kind: "slider",
          index: slider.index,
          value: THREE.MathUtils.clamp((x - 574) / 366, 0, 1)
        };
      }
    }

    if (x >= 574 && x <= 750 && y >= 178 && y <= 228) {
      return { kind: "stimulus", index: -1 };
    }
    if (x >= 764 && x <= 940 && y >= 178 && y <= 228) {
      return { kind: "stimulus", index: 1 };
    }
    if (x >= 574 && x <= 690 && y >= 546 && y <= 600) {
      return { kind: "trial", index: 0 };
    }
    if (x >= 704 && x <= 822 && y >= 546 && y <= 600) {
      return { kind: "trial", index: 1 };
    }
    if (x >= 836 && x <= 940 && y >= 546 && y <= 600) {
      return { kind: "trial", index: 2 };
    }
    if (x >= 574 && x <= 940 && y >= 684 && y <= 744) {
      return { kind: "reset", index: 0 };
    }
    return undefined;
  }

  private applyHit(hit: PanelHit) {
    if (hit.kind === "preset") {
      const name = this.options.presetNames[hit.index];
      if (name) {
        this.selectedPreset = name;
        this.options.onPresetSelected(name);
      }
    } else if (hit.kind === "slider" && hit.value !== undefined) {
      if (hit.index === 0) {
        this.state.shakeBoost = hit.value;
      } else {
        this.state.dampingPreview = hit.value;
      }
      this.options.onStateChanged({ ...this.state });
    } else if (hit.kind === "reset") {
      this.options.onReset();
    } else if (hit.kind === "page") {
      this.presetPage = THREE.MathUtils.clamp(this.presetPage + hit.index, 0, this.maxPresetPage());
    } else if (hit.kind === "stimulus") {
      this.cycleStimulus(hit.index);
    } else if (hit.kind === "trial") {
      if (hit.index === 0) {
        this.options.onTrialStartStop();
      } else if (hit.index === 1) {
        this.options.onTrialMark();
      } else {
        this.options.onTrialNext();
      }
    }
    this.needsPaint = true;
  }

  private paint() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "rgba(12, 18, 22, 0.92)";
    this.roundRect(ctx, 0, 0, canvasWidth, canvasHeight, 34);
    ctx.fill();
    ctx.strokeStyle = "rgba(184, 223, 224, 0.34)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#eaf3f4";
    ctx.font = "700 44px system-ui, sans-serif";
    ctx.fillText("Experiment Panel", 44, 72);
    ctx.fillStyle = "#95c7c4";
    ctx.font = "600 25px system-ui, sans-serif";
    ctx.fillText("Ray select / direct touch", 44, 112);

    ctx.fillStyle = "#bfd1d5";
    ctx.font = "700 25px system-ui, sans-serif";
    ctx.fillText("Preset list", 44, 156);
    this.paintPageButton(ctx, "<", 320, this.presetPage > 0);
    this.paintPageButton(ctx, ">", 422, this.presetPage < this.maxPresetPage());
    ctx.fillStyle = "#9eb2b8";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText(`${this.presetPage + 1}/${this.maxPresetPage() + 1}`, 373, 152);
    const visiblePresets = this.options.presetNames.slice(
      this.presetPage * presetPageSize,
      this.presetPage * presetPageSize + presetPageSize
    );
    visiblePresets.forEach((name, index) => this.paintPresetRow(ctx, name, index));

    ctx.fillStyle = "#bfd1d5";
    ctx.font = "700 25px system-ui, sans-serif";
    ctx.fillText("Stimulus", 574, 156);
    this.paintStimulusControl(ctx);

    ctx.fillStyle = "#bfd1d5";
    ctx.font = "700 25px system-ui, sans-serif";
    ctx.fillText("Sliders", 574, 286);
    this.paintSlider(ctx, "Motion boost", this.state.shakeBoost, 336);
    this.paintSlider(ctx, "Damping preview", this.state.dampingPreview, 444);

    this.paintTrialControls(ctx);
    this.paintResetButton(ctx);

    this.texture.needsUpdate = true;
    this.needsPaint = false;
  }

  private visiblePresetCount() {
    return Math.max(0, this.options.presetNames.length - this.presetPage * presetPageSize);
  }

  private maxPresetPage() {
    return Math.max(0, Math.ceil(this.options.presetNames.length / presetPageSize) - 1);
  }

  private selectedStimulusIndex() {
    return Math.max(0, this.options.stimulusOptions.findIndex((option) => option.value === this.selectedStimulus));
  }

  private selectedStimulusLabel() {
    return this.options.stimulusOptions[this.selectedStimulusIndex()]?.label ?? "Manual";
  }

  private cycleStimulus(direction: number) {
    if (this.options.stimulusOptions.length === 0) {
      return;
    }
    const nextIndex =
      (this.selectedStimulusIndex() + direction + this.options.stimulusOptions.length) %
      this.options.stimulusOptions.length;
    const option = this.options.stimulusOptions[nextIndex];
    this.selectedStimulus = option.value;
    this.options.onStimulusSelected(option.value);
  }

  private paintPresetRow(ctx: CanvasRenderingContext2D, name: string, index: number) {
    const y = 178 + index * 54;
    const selected = name === this.selectedPreset;
    ctx.fillStyle = selected ? "rgba(71, 164, 158, 0.54)" : "rgba(255, 255, 255, 0.075)";
    this.roundRect(ctx, 44, y, 468, 42, 16);
    ctx.fill();
    ctx.strokeStyle = selected ? "rgba(158, 236, 230, 0.72)" : "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#eef7f8";
    ctx.font = "650 23px system-ui, sans-serif";
    ctx.fillText(name.replaceAll("_", " "), 64, y + 28);
  }

  private paintSlider(ctx: CanvasRenderingContext2D, label: string, value: number, y: number) {
    ctx.fillStyle = "#e4eff1";
    ctx.font = "650 26px system-ui, sans-serif";
    ctx.fillText(label, 574, y - 38);
    ctx.fillStyle = "rgba(255, 255, 255, 0.11)";
    this.roundRect(ctx, 574, y, 366, 20, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(88, 198, 190, 0.84)";
    this.roundRect(ctx, 574, y, 366 * value, 20, 10);
    ctx.fill();
    ctx.fillStyle = "#ecf7f8";
    ctx.beginPath();
    ctx.arc(574 + 366 * value, y + 10, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9eb2b8";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText(value.toFixed(2), 878, y - 38);
  }

  private paintStimulusControl(ctx: CanvasRenderingContext2D) {
    this.paintPageButton(ctx, "<", 574, true, 178);
    this.paintPageButton(ctx, ">", 850, true, 178);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    this.roundRect(ctx, 678, 178, 158, 50, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.13)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ecf7f8";
    ctx.font = "750 23px system-ui, sans-serif";
    ctx.fillText(this.fitLabel(this.selectedStimulusLabel(), 13), 694, 211);
  }

  private paintTrialControls(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#bfd1d5";
    ctx.font = "700 25px system-ui, sans-serif";
    ctx.fillText("Trial", 574, 520);
    ctx.fillStyle = "#9eb2b8";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText(`R${this.trialState.repeat} ${this.trialState.elapsedLabel}`, 660, 520);
    this.paintActionButton(ctx, this.trialState.running ? "Stop" : "Start", 574, 546, 116, this.trialState.running);
    this.paintActionButton(ctx, "Mark", 704, 546, 118, false);
    this.paintActionButton(ctx, "Next", 836, 546, 104, false);
  }

  private paintActionButton(
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    width: number,
    active: boolean
  ) {
    ctx.fillStyle = active ? "rgba(71, 164, 158, 0.46)" : "rgba(255, 255, 255, 0.09)";
    this.roundRect(ctx, x, y, width, 54, 16);
    ctx.fill();
    ctx.strokeStyle = active ? "rgba(158, 236, 230, 0.64)" : "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#eef7f8";
    ctx.font = "750 22px system-ui, sans-serif";
    ctx.fillText(label, x + 18, y + 35);
  }

  private paintPageButton(ctx: CanvasRenderingContext2D, label: string, x: number, enabled: boolean, y = 124) {
    ctx.fillStyle = enabled ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.04)";
    this.roundRect(ctx, x, y, 90, 42, 14);
    ctx.fill();
    ctx.strokeStyle = enabled ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = enabled ? "#ecf7f8" : "#64747a";
    ctx.font = "800 25px system-ui, sans-serif";
    ctx.fillText(label, x + 37, y + 29);
  }

  private fitLabel(label: string, maxLength: number) {
    return label.length <= maxLength ? label : `${label.slice(0, maxLength - 1)}...`;
  }

  private paintResetButton(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(214, 100, 87, 0.34)";
    this.roundRect(ctx, 574, 684, 366, 60, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 190, 179, 0.56)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff3f0";
    ctx.font = "750 26px system-ui, sans-serif";
    ctx.fillText("Reset Object", 604, 723);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
}
