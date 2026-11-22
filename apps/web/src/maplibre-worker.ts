// MapLibre GL 6charge son worker depuis un fichier séparé :
// avec un bundler, import.meta.url n'est pas fiable — on fixe l'URL explicitement.
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);
