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
});