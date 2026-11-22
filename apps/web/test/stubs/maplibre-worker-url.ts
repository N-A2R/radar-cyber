// Substitut vitest pour `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` :
// le pipeline de test ne sait pas résoudre l'import `?worker&url` de Vite, et
// aucun test n'a besoin d'un vrai worker. Le build navigateur garde le vrai.
export default "";
