/**
 * Open-Connect build config.
 * Uses the TanStack Start + Vite toolkit that shipped with the original scaffold
 * (package name still references lovable.dev for plugin compatibility only).
 * Product identity, auth, deploy, and domains are fully owned by Open-Connect.
 *
 * That package already wires: tanstackStart, viteReact, tailwindcss, tsConfigPaths,
 * nitro/cloudflare target, VITE_* injection, @ path alias. Do not duplicate those plugins.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    resolve: {
      // pkce-challenge exposes browser/node conditions but no worker condition.
      // Its browser build uses Web Crypto, which is native to Cloudflare Workers.
      alias: {
        "pkce-challenge": fileURLToPath(import.meta.resolve("pkce-challenge")).replace(
          "index.node.js",
          "index.browser.js",
        ),
      },
    },
  },
  tanstackStart: {
    // Custom SSR entry with OAuth well-known + error page handling.
    server: { entry: "server" },
  },
});
