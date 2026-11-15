/**
 * Mapping code NAF → secteur du référentiel.
 *
 * Un seul endroit pour l'import (`import-entreprises-na.mts`) et le backfill
 * (`backfill-secteurs-org.mts`) : sans lui, l'import crée des lignes que la
 * mesure ne sait pas compter — le 15 novembre, 7 460 entreprises hors
 * numérique étaient en base avec `sector = NULL`, donc « 0 ligne » en
 * commerce/industrie/BTP/agro dans la mesure de couverture publiée.
 *
 * Les clés sont sans point (`47.11B` comme `4711B`) : l'API
 * recherche-entreprises renvoie le code ponctué, certains jeux le donnent brut.
 */
export const NAF_TO_SECTEUR: Record<string, string> = {
	// Numérique et télécoms.
	"6201Z": "numerique",
	"6202A": "numerique",
	"6203Z": "numerique",
	"6209Z": "numerique",
	// Commerce alimentaire de proximité et de gros.
	"4711B": "commerce",
	"4711D": "commerce",
	"4711F": "commerce",
	"4631Z": "commerce",
	// Transformation et conservation de viande.
	"1013A": "agroalimentaire",
	// Usinage.
	"2562B": "industrie",
	// Construction de maisons individuelles.
	"4120A": "construction",
};

/** Secteur d'un code NAF quel que soit son format, `null` si inconnu. */
export function secteurDeNaf(naf: string | null | undefined): string | null {
	if (!naf) return null;
	const cle = naf.replace(/\./g, "").toUpperCase();
	return NAF_TO_SECTEUR[cle] ?? null;
}
