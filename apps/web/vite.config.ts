import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "geojson-as-json",
      transform(code, id) {
        if (!id.endsWith(".geojson")) return null;
        return { code: `export default ${code}`, map: null };
      },
    },
  ],
  server: {
    // Écoute large : sans cela, un accès via un tunnel ou un reverse proxy est
    // refusé. Les hôtes autorisés viennent de l'environnement, pas du dépôt :
    //   RADAR_ALLOWED_HOSTS=".exemple.app,localhost" pnpm -F @radar/web dev
    // On ne met pas `allowedHosts: true` : cela désactiverait la protection
    // contre le DNS rebinding.
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: (process.env.RADAR_ALLOWED_HOSTS ?? "localhost")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    proxy: { "/api": process.env.RADAR_API_ORIGIN ?? "http://localhost:8080" },
  },
  // `vite preview` a son propre bloc : sans lui, un build de recette renvoie
  // l'index HTML à la place des réponses d'API, et tous les écrans paraissent
  // vides (0 flux, 0 entrée) alors que le code est bon.
  preview: {
    host: "127.0.0.1",
    proxy: { "/api": process.env.RADAR_API_ORIGIN ?? "http://localhost:8080" },
  },
  // Réglages lus par vitest uniquement : le build navigateur n'y touche pas.
  test: {
    // `test/offline.spec.ts` est un spec Playwright (voir playwright.config.ts),
    // pas un test vitest : on ne collecte que les *.test.*.
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup-polyfills.ts"],
    alias: [
      // `?worker&url` n'est pas résolu par le pipeline vitest ; la carte réelle
      // n'est jamais montée dans les tests, un module vide suffit.
      {
        find: /^maplibre-gl\/dist\/maplibre-gl-worker\.mjs\?worker&url$/,
        replacement: new URL("./test/stubs/maplibre-worker-url.ts", import.meta.url).pathname,
      },
    ],
  },
});