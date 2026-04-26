export const iwsdkIntegrationNotes = {
  runtimeFoundation: "@iwsdk/core",
  inputFoundation: "@iwsdk/xr-input",
  devEmulation: "@iwsdk/vite-plugin-dev",
  approach:
    "This v1 app keeps the haptics visual simulator independent while using IWSDK packages and the IWER Vite plugin as the Quest development foundation. The WebXR bridge is intentionally isolated so it can be replaced with IWSDK ECS grab components as that API stabilizes."
} as const;
