import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";

// maplibre-gl v6 charge son worker depuis `dist/maplibre-gl-worker.mjs`, mais
// l'import par sous-chemin échoue dans Vite (résolution par `exports`). On
// l'alias vers le vrai fichier : `?url` renvoie alors une URL servie valide.
const require = createRequire(import.meta.url);
const maplibreWorker = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");

export default defineConfig({
  resolve: {
    alias: {
      "maplibre-gl/dist/maplibre-gl-worker.mjs": maplibreWorker,
    },
  },
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
});