/**
 * Vérification runtime du fil enrichi (chantier 19).
 *
 * Ce que le typecheck ne voit pas : est-ce qu'une ligne sans confiance (serveur
 * plus ancien) s'affiche quand même ? Est-ce qu'une revendication fragile ne se
 * lit pas comme un fait établi ? Est-ce que la date de collecte est annoncée
 * comme telle ?
 */
import { renderToStaticMarkup } from "react-dom/server";
import EventList from "../src/components/EventList";
import type { Event } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

const base: Event = {
	id: "1",
	dedupKey: "k1",
	family: "ransomware",
	assertionType: "third_party_claim",
	title: "Revendication contre une scierie",
	summary: null,
	observedAt: "2026-11-12T10:00:00Z",
	severity: 4,
	confidence: "C3",
	sourceId: "ransomlook",
	sourceUrl: null,
	geoType: "claimed_origin",
	lat: null,
	lon: null,
	orgId: 12,
	regional: true,
};

const fragile: Event = {
	...base,
	fraicheur: { ageJours: 1, precision: "collecte", classe: "recent", libelle: "hier · date de collecte, pas de l'incident" },
	confiance: {
		note: 0.38,
		niveau: "fragile",
		raisons: ["source C3", "revendication tierce, non confirmée", "2 sources"],
		sourcesDistinctes: 2,
		libelle: "fragile",
	},
};

const etabli: Event = {
	...base,
	id: "2",
	title: "Incident confirmé par trois rédactions",
	confidence: "A2",
	assertionType: "confirmed_incident",
	fraicheur: { ageJours: 0, precision: "certaine", classe: "frais", libelle: "aujourd'hui" },
	confiance: { note: 0.94, niveau: "etabli", raisons: ["source A2", "incident confirmé"], sourcesDistinctes: 3, libelle: "établi" },
};

const sansMetadonnees: Event = { ...base, id: "3", title: "Ligne d'un serveur plus ancien" };

const html = renderToStaticMarkup(
	<EventList
		events={[fragile, etabli, sansMetadonnees]}
		byFamily={[{ family: "ransomware", n: 3 }]}
		family={null}
		onFamily={() => {}}
		selectedEventId={null}
		onSelectEvent={() => {}}
		loading={false}
		error={null}
	/>,
);

check("le fil se rend", html.includes("Revendication contre une scierie"));
check("une revendication fragile est marquée", html.includes('data-niveau="fragile"'));
check("un incident établi est marqué", html.includes('data-niveau="etabli"'));
check("la corroboration est chiffrée", html.includes("2 sources"));
check("la date de collecte est annoncée", html.includes("date de collecte, pas de l&#x27;incident") || html.includes("date de collecte, pas de l'incident"));
check("les raisons sont en infobulle", html.includes("revendication tierce, non confirmée"));
check("une ligne sans métadonnées ne casse rien", html.includes("Ligne d&#x27;un serveur plus ancien") || html.includes("Ligne d'un serveur plus ancien"));

// La différence entre les deux niveaux doit être visible dans le HTML, sinon
// l'écran ne sert à rien.
check(
	"fragile et établi ne se ressemblent pas",
	html.includes('data-niveau="fragile"') && html.includes('data-niveau="etabli"'),
);

console.log(failures === 0 ? "\nfil: tout est vert" : `\nfil: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
