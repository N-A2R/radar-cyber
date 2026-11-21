/**
 * Rejeu des requêtes : le cas métier à prouver est 500, 500, puis 200.
 * Le harnais est le même que celui des autres vérifications : un script SSR
 * compilé par Vite, exécuté par Node, avec des assertions lisibles.
 */
import { api, ApiError } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type ReponseSimulee = { statut: number; corps?: unknown; erreur?: Error };
let file: ReponseSimulee[] = [];
let appels = 0;
let urls: string[] = [];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  appels += 1;
  urls.push(String(input));
  const reponse = file.shift();
  if (!reponse) throw new Error("fetch appelé plus de fois que prévu");
  if (reponse.erreur) throw reponse.erreur;
  return {
    ok: reponse.statut >= 200 && reponse.statut < 300,
    status: reponse.statut,
    json: async () => reponse.corps,
  } as Response;
}) as typeof fetch;

function prepare(reponses: ReponseSimulee[]) {
  file = [...reponses];
  appels = 0;
  urls = [];
}

const succes = { ok: true, sources: [] };

// --- Le cas demandé : deux 5xx, puis un 200 ---------------------------------
prepare([
  { statut: 500 },
  { statut: 503 },
  { statut: 200, corps: succes },
]);
const apresTrois = await api.health();
check("500 puis 503 puis 200 : réussite au 3e essai", apresTrois.ok === true);
check("exactement trois requêtes", appels === 3, `${appels} appels`);
check("toutes sur le même endpoint", urls.every((url) => url === "/api/health"), urls.join(", "));

// --- Bornes : deux retentatives, pas une de plus -----------------------------
prepare([{ statut: 500 }, { statut: 500 }, { statut: 500 }]);
let echec: unknown = null;
try {
  await api.health();
} catch (err) {
  echec = err;
}
check("trois 500 : échec lisible après 3 appels", appels === 3
  && echec instanceof ApiError && echec.kind === "http" && echec.status === 500,
  echec instanceof Error ? echec.message : String(echec));

// --- Les 4xx sont définitifs : jamais rejoués --------------------------------
prepare([{ statut: 400 }]);
echec = null;
try {
  await api.health();
} catch (err) {
  echec = err;
}
check("400 : erreur typée et lisible", echec instanceof ApiError
  && echec.kind === "http" && echec.status === 400 && echec.message.includes("HTTP 400"),
  echec instanceof Error ? echec.message : String(echec));
check("400 : une seule requête", appels === 1, `${appels} appels`);

// --- Les pannes réseau se rejouent, comme les 5xx ----------------------------
prepare([
  { erreur: new TypeError("fetch failed") },
  { erreur: new TypeError("fetch failed") },
  { statut: 200, corps: succes },
]);
const apresReseau = await api.health();
check("deux erreurs réseau puis 200 : réussite", apresReseau.ok === true && appels === 3, `${appels} appels`);

// --- Une annulation du appelant n'est pas une erreur à rejouer ---------------
prepare([]);
const controller = new AbortController();
controller.abort(new Error("changement de vue"));
echec = null;
try {
  await api.today({}, controller.signal);
} catch (err) {
  echec = err;
}
check("signal annulé : aucune requête envoyée", appels === 0 && echec !== null);

console.log(failures === 0 ? "\napi-retry: tout est vert" : `\napi-retry: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
