import type { TiltState } from "../types";

interface PermissionDeviceOrientationEvent extends DeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class PhoneInput {
  readonly tilt: TiltState = { x: 0, y: 0 };

  private dragging = false;
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private startTilt: TiltState = { x: 0, y: 0 };
  private usingOrientation = false;

  constructor(private readonly target: HTMLElement) {
    target.addEventListener("pointerdown", this.onPointerDown);
    target.addEventListener("pointermove", this.onPointerMove);
    target.addEventListener("pointerup", this.onPointerUp);
    target.addEventListener("pointercancel", this.onPointerUp);
  }

  async enableOrientation(): Promise<boolean> {
    const orientationCtor = DeviceOrientationEvent as unknown as PermissionDeviceOrientationEvent;
    if (typeof orientationCtor.requestPermission === "function") {
      const permission = await orientationCtor.requestPermission();
      if (permission !== "granted") {
        return false;
      }
    }
    window.addEventListener("deviceorientation", this.onOrientation, true);
    this.usingOrientation = true;
    return true;
  }

  isOrientationEnabled() {
    return this.usingOrientation;
  }

  dispose() {
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerup", this.onPointerUp);
    this.target.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("deviceorientation", this.onOrientation, true);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.usingOrientation || this.dragging) {
      return;
    }
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startTilt = { ...this.tilt };
    this.target.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging || event.pointerId !== this.pointerId) {
      return;
    }
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.tilt.x = clamp(this.startTilt.x + ((event.clientX - this.startX) / width) * 3.2, -1, 1);
    this.tilt.y = clamp(this.startTilt.y + ((event.clientY - this.startY) / height) * 3.2, -1, 1);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.dragging = false;
    this.pointerId = -1;
  };

  private onOrientation = (event: DeviceOrientationEvent) => {
    const gamma = event.gamma ?? 0;
    const beta = event.beta ?? 0;
    this.tilt.x = clamp(gamma / 34, -1, 1);
    this.tilt.y = clamp((beta - 35) / 42, -1, 1);
  };
}
