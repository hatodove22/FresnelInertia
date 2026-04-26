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
  const texture = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = "#7f7fff";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 72; i += 1) {
      const x = (Math.sin(i * 45.1) * 0.5 + 0.5) * size;
      const y = (Math.cos(i * 31.7) * 0.5 + 0.5) * size;
      const r = 12 + (i % 7) * 3;
      const gradient = ctx.createRadialGradient(x, y, 1, x, y, r);
      gradient.addColorStop(0, "rgba(160, 160, 255, 0.65)");
      gradient.addColorStop(1, "rgba(92, 92, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  texture.repeat.set(2.5, 2.5);
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
