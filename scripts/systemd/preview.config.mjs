// Configuration vite preview pour le service radar-web.
//
// vite preview sert `apps/web/dist` mais n'applique PAS `server.proxy` du
// vite.config.ts de dev : sans cette config, l'UI interrogerait /api sur le
// port de preview et obtiendrait des 404. On déclare donc le proxy /api vers
// l'API Fastify, dans la config de preview uniquement (le build n'est pas
// impacté). Fichier volontairement en .mjs sans import de `vite` : le projet
// est en pnpm strict, `vite` n'est pas résolvable depuis scripts/.
export default {
  preview: {
    host: "127.0.0.1",
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8080",
        changeOrigin: false,
      },
    },
  },
};
