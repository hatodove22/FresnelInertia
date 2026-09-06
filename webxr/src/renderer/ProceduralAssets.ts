import * as THREE from "three";

type PaintFn = (ctx: CanvasRenderingContext2D, size: number) => void;

function makeTexture(size: number, paint: PaintFn) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable");
  }
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function makeLiquidNormalTexture() {
  // Analytic gradients of a tileable height field. Normal data is linear,
  // unlike a color texture; the old painted sRGB map biased both axes alike.
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    let dx = 0, dy = 0;
    for (const [kx, ky, amplitude, phase] of [[2, 1, 0.12, 0.4], [-1, 3, 0.085, 1.8], [4, -3, 0.025, 2.7], [7, 5, 0.01, 0.7]]) {
      const derivative = amplitude * Math.cos(kx * u + ky * v + phase);
      dx += kx * derivative;
      dy += ky * derivative;
    }
    const length = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    data[i] = Math.round(127.5 * (1 - dx / length));
    data[i + 1] = Math.round(127.5 * (1 - dy / length));
    data[i + 2] = Math.round(127.5 * (1 + 1 / length));
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(1.4, 1.4);
  texture.needsUpdate = true;
  return texture;
}
