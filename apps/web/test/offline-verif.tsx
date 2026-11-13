/**
 * Carte hors ligne : un plan qui ne disparaît pas quand le réseau tombe.
 *
 * Ce que le typecheck ne voit pas : est-ce qu'un cache de trois heures est
 * présenté comme « à jour » ? Est-ce qu'un stockage plein casse l'écran ? Est-ce
 * que le style de secours demande encore des tuiles ?
 */
import { creerMemoire, etatDonnees, styleSecours } from "../src/offline";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

// --- Stockage simulé, avec quota cassant -----------------------------------
function fauxStockage(options: { plein?: boolean } = {}) {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => {
			if (options.plein) throw new Error("QuotaExceededError");
			data.set(k, v);
		},
		_taille: () => data.size,
	};
}

const memoire = creerMemoire(fauxStockage());
const maintenant = Date.parse("2026-11-13T12:00:00Z");
memoire.ecrire("carte", { orgs: [1, 2, 3] }, maintenant);
const relu = memoire.lire<{ orgs: number[] }>("carte");
check("un instantané se relit", relu?.data.orgs.length === 3);
check("sa date est conservée", relu?.at === maintenant);

check("absence de stockage tolérée", creerMemoire(null).lire("carte") === null);
check(
	"quota plein : écrire échoue sans casser l'écran",
	(() => {
		const m = creerMemoire(fauxStockage({ plein: true }));
		m.ecrire("carte", { orgs: [] });
		return m.lire("carte") === null;
	})(),
);
check(
	"instantané sans date écarté",
	(() => {
		const s = fauxStockage();
		s.setItem("radar:instantane:test", JSON.stringify({ data: {} }));
		return creerMemoire(s).lire("test") === null;
	})(),
);

// --- Âge des données : jamais « à jour » pour du cache ----------------------
const cas: Array<[number, string, string]> = [
	[0, "frais", "à jour"],
	[14, "frais", "à jour"],
	[45, "perime", "hors ligne · données de 45 min"],
	[180, "perime", "hors ligne · données de 3 h"],
	[60 * 24 * 3, "perime", "hors ligne · données de 3 j"],
];
for (const [minutes, etatAttendu, libelle] of cas) {
	const r = etatDonnees({ at: maintenant - minutes * 60_000, data: {} }, maintenant);
	check(`à ${minutes} min → ${etatAttendu}`, r.etat === etatAttendu && r.libelle === libelle, r.libelle);
}
check("sans instantané : « aucune donnée en mémoire »", etatDonnees(null).etat === "absent");
check(
	"une date dans le futur ne donne pas un âge négatif",
	etatDonnees({ at: maintenant + 600_000, data: {} }, maintenant).ageMinutes === 0,
);

// --- Style de secours : zéro réseau ---------------------------------------
const style = styleSecours({ type: "FeatureCollection", features: [] }, { type: "FeatureCollection", features: [] });
const serialise = JSON.stringify(style);
check("le style de secours est un style MapLibre", style.version === 8 && Array.isArray(style.layers));
check("aucune tuile distante", !serialise.includes("http") && !serialise.includes("tiles"));
check("aucun sprite ni police distante", !serialise.includes("glyphs") && !serialise.includes("sprite"));
check("les contours sont embarqués", style.sources.dep?.type === "geojson");
check("les villes sont embarquées", style.sources.cities?.type === "geojson");

console.log(failures === 0 ? "\noffline: tout est vert" : `\noffline: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
