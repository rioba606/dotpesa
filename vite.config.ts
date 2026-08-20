// vite.config.ts
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper)
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // @lovable.dev/vite-tanstack-config defaults to the Cloudflare preset
  // (build-only, produces a wrangler.json + Workers bundle). Override it
  // here so `.output/server` is a plain Node server Render can run,
  // instead of a Cloudflare Workers bundle.
  nitro: {
    preset: "node-server",
  },
  // Add Vite server configuration including proxy
  vite: {
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
        },
      },
    },
  },
});