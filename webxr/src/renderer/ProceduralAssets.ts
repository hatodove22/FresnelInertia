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

export function makeWoodTexture() {
  const texture = makeTexture(512, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#8c5e37");
    gradient.addColorStop(0.52, "#b9824d");
    gradient.addColorStop(1, "#5f3f25");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 1) {
      const wobble = Math.sin(y * 0.034) * 9 + Math.sin(y * 0.011) * 18;
      ctx.strokeStyle = `rgba(42, 24, 14, ${0.10 + Math.sin(y * 0.09) * 0.035})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.22, y + wobble, size * 0.74, y - wobble, size, y + Math.sin(y * 0.02) * 6);
      ctx.stroke();
    }

    for (let i = 0; i < 18; i += 1) {
      const x = (Math.sin(i * 19.17) * 0.5 + 0.5) * size;
      const y = (Math.cos(i * 11.61) * 0.5 + 0.5) * size;
      ctx.strokeStyle = "rgba(47, 27, 16, 0.18)";
      ctx.beginPath();
      ctx.ellipse(x, y, 18 + (i % 5) * 5, 5 + (i % 3) * 3, i, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  texture.repeat.set(3, 2);
  return texture;
}

export function makeMatTexture() {
  const texture = makeTexture(512, (ctx, size) => {
    ctx.fillStyle = "#253036";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(154, 198, 201, 0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(235, 244, 245, 0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(54, 54, size - 108, size - 108);
  });
  texture.repeat.set(2, 2);
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

export function makeLabelTexture(name: string, family: string) {
  return makeTexture(512, (ctx, size) => {
    ctx.fillStyle = "rgba(238, 246, 241, 0.95)";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#162026";
    ctx.font = "700 54px system-ui, sans-serif";
    ctx.fillText("HAPTIC SAMPLE", 34, 98);
    ctx.fillStyle = "#2c7f82";
    ctx.fillRect(34, 128, size - 68, 8);
    ctx.fillStyle = "#253036";
    ctx.font = "700 42px system-ui, sans-serif";
    ctx.fillText(family.toUpperCase(), 34, 210);
    ctx.font = "500 28px system-ui, sans-serif";
    const wrapped = name.replaceAll("_", " ");
    ctx.fillText(wrapped.slice(0, 24), 34, 268);
    ctx.fillStyle = "rgba(37, 48, 54, 0.34)";
    ctx.fillRect(34, 330, 190, 18);
    ctx.fillRect(34, 372, 310, 18);
    ctx.fillRect(34, 414, 250, 18);
  });
}
