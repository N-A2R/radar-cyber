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
    port: 5173,
    proxy: { "/api": "http://localhost:8080" },
  },
});