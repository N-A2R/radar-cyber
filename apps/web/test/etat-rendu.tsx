/**
 * Capture de l'état rendu — chantier D0 (démarrage prouvé).
 *
 * Les vérifications de composants (`test:fil`, `test:render`…) rendent des jeux
 * d'exemple. Ici la question est différente : est-ce que l'UI affiche les
 * données RÉELLES de la base ? Le script se connecte à l'API en cours
 * d'exécution, en tire le fil, l'annuaire et une fiche organisation, puis rend
 * les VRAIS composants avec ces données — même chemin de rendu que le
 * navigateur, sans navigateur.
 *
 *   RADAR_API_ORIGIN=http://127.0.0.1:8080 \
 *   RADAR_ADMIN_EMAIL=admin@radar.local RADAR_ADMIN_PASSWORD=… \
 *   pnpm -F @radar/web run test:etat
 */
import { renderToStaticMarkup } from "react-dom/server";
import EventList from "../src/components/EventList";
import DirectoryView from "../src/components/DirectoryView";
import { OrgSheetBody } from "../src/components/OrgSheet";
import type { DirectoryResponse, Event, LoginResponse, OrgDetail } from "../src/api";
import type { FeedProps } from "../src/contracts";

const API = process.env.RADAR_API_ORIGIN ?? "http://127.0.0.1:8080";
const EMAIL = process.env.RADAR_ADMIN_EMAIL ?? "admin@radar.local";
const PASSWORD = process.env.RADAR_ADMIN_PASSWORD ?? "";
/** Fiche capturée : une organisation portant un événement réel rattaché. */
const ORG_CIBLE = Number(process.env.RADAR_CAPTURE_ORG ?? 1918);

async function get<T>(path: string, token: string | null): Promise<T> {
	const res = await fetch(`${API}/api${path}`, {
		headers: token ? { authorization: `Bearer ${token}` } : {},
	});
	if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
	return (await res.json()) as T;
}

/** HTML statique → texte lisible : les blocs deviennent des lignes, les cellules des colonnes. */
function texte(html: string, maxLignes = 40): string {
	const lignes = html
		.replace(/<\/(tr|p|h1|h2|h3|li|section|div|aside|header)>/g, "\n")
		.replace(/<\/(td|th)>/g, " | ")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.split("\n")
		.map((l) => l.replace(/\s*\|\s*$/, "").trim())
		.filter((l) => l.length > 0);
	return lignes.slice(0, maxLignes).join("\n");
}

function bandeau(titre: string): void {
	console.log(`\n${"=".repeat(72)}\n${titre}\n${"=".repeat(72)}`);
}

async function main(): Promise<void> {
	if (!PASSWORD) throw new Error("RADAR_ADMIN_PASSWORD manquant");
	const login = await fetch(`${API}/api/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
	});
	if (!login.ok) throw new Error(`login → HTTP ${login.status}`);
	const { token } = (await login.json()) as LoginResponse;

	const events = await get<Event[]>("/events?limit=25&order=regional", token);
	const dir = await get<DirectoryResponse>("/directory?sort=eventCount&dir=desc&limit=25", token);
	const fiche = await get<OrgDetail>(`/orgs/${ORG_CIBLE}`, token);

	const byFamily = [...new Set(events.map((e) => e.family))].map((family) => ({
		family,
		n: events.filter((e) => e.family === family).length,
	}));
	const rattaches = events.filter((e) => e.orgId !== null).length;

	bandeau(`FIL — ${events.length} événements (API GET /api/events, tri régional)`);
	console.log(`dont ${rattaches} rattachés à une organisation, ${byFamily.length} familles`);
	const fil = renderToStaticMarkup(
		<EventList
			{...({
				events,
				byFamily,
				family: null,
				onFamily: () => {},
				selectedEventId: null,
				onSelectEvent: () => {},
				loading: false,
				error: null,
			} as FeedProps)}
		/>,
	);
	console.log(texte(fil, 46));

	bandeau(`ANNUAIRE — page 1 (API GET /api/directory, tri événements décroissant)`);
	const lignes = dir.rows ?? [];
	console.log(`${dir.total ?? lignes.length} organisations au total, ${lignes.length} affichées`);
	const annuaire = renderToStaticMarkup(
		<DirectoryView orgs={lignes} loading={false} error={null} onOpenOrg={() => {}} />,
	);
	console.log(texte(annuaire, 34));

	bandeau(`FICHE ORGANISATION — ${fiche.org.name} (API GET /api/orgs/${ORG_CIBLE})`);
	const corps = renderToStaticMarkup(<OrgSheetBody data={fiche} />);
	console.log(texte(corps, 40));
}

main().catch((e) => {
	console.error("ÉCHEC capture :", e instanceof Error ? e.message : e);
	process.exitCode = 1;
});
