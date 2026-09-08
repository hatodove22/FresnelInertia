import basicSsl from "@vitejs/plugin-basic-ssl";
import { iwsdkDev } from "@iwsdk/vite-plugin-dev";
import { resolve } from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import { staticPwa } from "./src/pwa/staticPwaPlugin";

export default defineConfig({
  // Relative assets work both at a pages.dev root and a GitHub Pages subpath.
  base: process.env.VITE_BASE_PATH || "./",
  plugins: [
    staticPwa(),
    basicSsl(),
    iwsdkDev({
      emulator: {
        device: "metaQuest3"
      },
      verbose: false
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 8081,
    strictPort: false,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), ".."]
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 8081
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        webusb: resolve(process.cwd(), "webusb.html"),
        tune: resolve(process.cwd(), "tune.html")
      }
    }
  }
});
