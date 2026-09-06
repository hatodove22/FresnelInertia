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
