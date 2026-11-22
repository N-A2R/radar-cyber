/**
 * Collecteur BODACC — procédures collectives en Nouvelle-Aquitaine, par SIREN.
 *
 * BODACC est une source **nationale** (DILA). On ne la présente jamais comme
 * une source régionale : le filtre `region_code=75` est appliqué à la lecture,
 * et chaque événement porte l'URL de l'annonce légale d'origine. La preuve
 * conservée est le SIREN — un identifiant public d'entreprise, jamais un nom
 * de personne physique ni une adresse.
 *
 * Le dataset OpenDataSoft expose directement `url_complete`
 * (`https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:…`) :
 * c'est cette URL qui sert de preuve, pas une URL reconstruite à la main.
 * `listepersonnes` est lu uniquement pour récupérer la dénomination d'une
 * **personne morale** ; un dossier `pp` (personne physique) reste anonyme.
 */
import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";

export const BODACC_RECORDS_URL =
	"https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";

/** Code région INSEE de la Nouvelle-Aquitaine dans le dataset BODACC. */
export const BODACC_REGION_CODE = 75;
/** Fenêtre glissante lue à chaque run : la preuve doit rester datée et récente. */
export const BODACC_FENETRE_JOURS = 30;
const PAGE_SIZE = 100;
const MAX_ITEMS = 300;

export type BodaccRecord = {
	id?: unknown;
	dateparution?: unknown;
	publicationavis?: unknown;
	typeavis_lib?: unknown;
	familleavis?: unknown;
	registre?: unknown;
	url_complete?: unknown;
	numerodepartement?: unknown;
	departement_nom_officiel?: unknown;
	region_code?: unknown;
	tribunal?: unknown;
	ville?: unknown;
	cp?: unknown;
	jugement?: unknown;
	listepersonnes?: unknown;
	numeroannonce?: unknown;
};

type BodaccResponse = { results?: unknown; total_count?: unknown };

/** SIREN à 9 chiffres depuis `registre` (["898815808", "898 815 808"]). */
export function sirenDepuisRegistre(registre: unknown): string | null {
	const valeurs = Array.isArray(registre) ? registre : [registre];
	for (const valeur of valeurs) {
		const chiffres = String(valeur ?? "").replace(/\D/g, "");
		if (/^[0-9]{9}$/.test(chiffres)) return chiffres;
	}
	return null;
}

function objetJson(valeur: unknown): Record<string, unknown> | null {
	if (typeof valeur !== "string" || valeur.trim() === "") return null;
	try {
		const parsed: unknown = JSON.parse(valeur);
		return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/**
 * Dénomination d'une personne morale, et seulement d'une personne morale.
 *
 * Un dossier `pp` porte le nom d'une personne physique : on ne le lit pas.
 * Le repli est le SIREN, pas `commercant` (qui peut aussi être un nom propre).
 */
export function denominationMorale(listepersonnes: unknown): string | null {
	const racine = objetJson(listepersonnes);
	if (!racine) return null;
	const brut = racine["personne"] ?? racine["personnes"];
	const personnes = Array.isArray(brut) ? brut : brut ? [brut] : [];
	for (const personne of personnes) {
		if (personne === null || typeof personne !== "object") continue;
		const objet = personne as Record<string, unknown>;
		if (objet["typePersonne"] !== "pm") continue;
		const denomination = objet["denomination"];
		if (typeof denomination === "string" && denomination.trim() !== "") return denomination.trim();
	}
	return null;
}

/** Nature du jugement, formulée courte quand le vocabulaire BODACC le permet. */
export function natureCourte(jugement: unknown, typeAvis: unknown): string {
	const objet = objetJson(jugement);
	const nature = typeof objet?.["nature"] === "string" ? (objet["nature"] as string) : "";
	const texte = `${nature} ${String(typeAvis ?? "")}`.toLowerCase();
	if (texte.includes("liquidation")) return "Liquidation judiciaire";
	if (texte.includes("redressement")) return "Redressement judiciaire";
	if (texte.includes("sauvegarde")) return "Sauvegarde";
	const libelle = typeof typeAvis === "string" ? typeAvis.trim() : "";
	return libelle !== "" ? libelle : "Procédure collective";
}

function dateParutionIso(valeur: unknown): string | null {
	if (typeof valeur !== "string") return null;
	const jour = valeur.trim().slice(0, 10);
	if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(jour)) return null;
	const ms = Date.parse(`${jour}T00:00:00.000Z`);
	return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function urlAnnonce(record: BodaccRecord): string | null {
	const directe = typeof record.url_complete === "string" ? record.url_complete.trim() : "";
	if (/^https:\/\/www\.bodacc\.fr\//.test(directe)) return directe;
	const id = typeof record.id === "string" ? record.id.trim() : "";
	if (id !== "") return `https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:${encodeURIComponent(id)}`;
	return null;
}

const SEVERITE_LIQUIDATION = 4;
const SEVERITE_AUTRE = 3;

/**
 * Transforme une annonce BODACC en événement, ou `null` si une preuve manque.
 *
 * Aucune donnée personnelle n'est recopiée : ni `commercant`, ni adresse, ni
 * `listepersonnes` brut. Seuls le SIREN, la ville, le département, le tribunal
 * et la nature du jugement sont conservés.
 */
export function mapBodaccRecord(record: BodaccRecord, cutoffJour: string): NormalizedEvent | null {
	if (String(record.familleavis ?? "") !== "collective") return null;
	if (Number(record.region_code) !== BODACC_REGION_CODE) return null;

	const id = typeof record.id === "string" ? record.id.trim() : "";
	if (id === "") return null;

	const siren = sirenDepuisRegistre(record.registre);
	if (siren === null) return null;

	const url = urlAnnonce(record);
	if (url === null) return null;

	const observedAt = dateParutionIso(record.dateparution);
	if (observedAt === null || observedAt.slice(0, 10) < cutoffJour) return null;

	const ville = typeof record.ville === "string" ? record.ville.trim() : "";
	const departementNom = typeof record.departement_nom_officiel === "string" ? record.departement_nom_officiel.trim() : "";
	const departement = typeof record.numerodepartement === "string" ? record.numerodepartement.trim() : "";
	const tribunal = typeof record.tribunal === "string" ? record.tribunal.trim() : "";
	const typeAvis = typeof record.typeavis_lib === "string" ? record.typeavis_lib.trim() : "";
	const nature = natureCourte(record.jugement, typeAvis);
	const morale = denominationMorale(record.listepersonnes);
	const etiquete = morale ?? `SIREN ${siren}`;
	const lieu = ville !== "" ? ` (${ville})` : "";
	const title = `${nature} — ${etiquete}${lieu}`.slice(0, 400);

	const lieuTexte = [ville, departementNom, departement !== "" ? `(${departement})` : ""]
		.filter((partie) => partie !== "")
		.join(", ");
	const summary = [
		`Procédure collective publiée au BODACC le ${observedAt.slice(0, 10)}`,
		tribunal !== "" ? `au ${tribunal}` : null,
		lieuTexte !== "" ? `— ${lieuTexte}` : null,
		`. Nature : ${nature}.`,
	].filter((partie) => partie !== null).join(" ").replace(/\s+/g, " ").replace(/\s+\./g, ".");

	const objJugement = objetJson(record.jugement);
	const natureComplete = typeof objJugement?.["nature"] === "string" ? (objJugement["nature"] as string) : null;

	return {
		dedupKey: `bodacc:${id}`,
		family: "bodacc",
		assertionType: "confirmed_incident",
		title,
		summary,
		observedAt,
		severity: nature === "Liquidation judiciaire" ? SEVERITE_LIQUIDATION : SEVERITE_AUTRE,
		confidence: "A1",
		sourceId: "bodacc:pc-na",
		sourceUrl: url,
		evidence: {
			siren,
			url_bodacc: url,
			bodacc_id: id,
			date_parution: observedAt.slice(0, 10),
			type_avis: typeAvis !== "" ? typeAvis : null,
			nature_jugement: natureComplete,
			tribunal: tribunal !== "" ? tribunal : null,
			ville: ville !== "" ? ville : null,
			departement: departement !== "" ? departement : null,
			departement_nom: departementNom !== "" ? departementNom : null,
			region_code: BODACC_REGION_CODE,
			numero_annonce: typeof record.numeroannonce === "number" ? record.numeroannonce : null,
		},
		geoType: "entity_location",
	};
}

export function urlPageBodacc(offset: number, cutoffJour: string): string {
	const params = new URLSearchParams({
		limit: String(PAGE_SIZE),
		offset: String(offset),
		order_by: "dateparution desc",
		where: `familleavis="collective" and region_code=${BODACC_REGION_CODE} and dateparution>="${cutoffJour}"`,
	});
	return `${BODACC_RECORDS_URL}?${params.toString()}`;
}

export function cutoffJour(maintenant: Date, jours = BODACC_FENETRE_JOURS): string {
	return new Date(maintenant.getTime() - jours * 86_400_000).toISOString().slice(0, 10);
}

export const collector: Collector = {
	id: "bodacc:pc-na",
	family: "bodacc",
	intervalSec: 3600,
	async run(ctx: CollectContext) {
		const maintenant = ctx.now();
		const cutoff = cutoffJour(maintenant);
		const events: NormalizedEvent[] = [];
		const vus = new Set<string>();
		let offset = 0;
		let arret = false;
		let derniereParution: string | null = null;

		while (!arret && events.length < MAX_ITEMS && offset < 10_000) {
			const page = await ctx.fetchJson<BodaccResponse>(urlPageBodacc(offset, cutoff));
			const lignes = Array.isArray(page?.results) ? (page.results as BodaccRecord[]) : [];
			if (lignes.length === 0) break;

			for (const ligne of lignes) {
				const jour = typeof ligne.dateparution === "string" ? ligne.dateparution.slice(0, 10) : "";
				if (jour !== "" && jour < cutoff) {
					arret = true;
					continue;
				}
				if (jour !== "" && (derniereParution === null || jour > derniereParution)) derniereParution = jour;
				const evenement = mapBodaccRecord(ligne, cutoff);
				if (evenement === null || vus.has(evenement.dedupKey)) continue;
				vus.add(evenement.dedupKey);
				events.push(evenement);
				if (events.length >= MAX_ITEMS) break;
			}

			if (lignes.length < PAGE_SIZE) break;
			offset += lignes.length;
		}

		ctx.log(`bodacc: ${events.length} annonce(s) de procédure collective retenue(s) sur ${BODACC_FENETRE_JOURS} jours`);
		return {
			events,
			cursor: {
				derniereParution,
				recolteAt: maintenant.toISOString(),
				region_code: BODACC_REGION_CODE,
			},
		};
	},
};
