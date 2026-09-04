import basicSsl from "@vitejs/plugin-basic-ssl";
import { iwsdkDev } from "@iwsdk/vite-plugin-dev";
import { resolve } from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  plugins: [
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
        webusb: resolve(process.cwd(), "webusb.html")
      }
    }
  }
});
