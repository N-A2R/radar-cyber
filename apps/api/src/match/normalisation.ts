/**
 * Normalisation partagée du rattachement — module neutre, sans base ni modèle.
 *
 * Le moteur (`core.ts`, `gazetteer.ts`) et les règles de précision doivent
 * découper les noms exactement de la même façon : une divergence sur `Œ`/`Æ`
 * change les jetons discriminants et fait trancher la règle 2 à contresens.
 * `GENERIC_TOKENS` vit ici pour que la promotion et les règles partagent la
 * même définition sans dépendance circulaire vers `quarantine/promote.ts`.
 */

/** Jetons qui ne désignent rien (TLD, termes techniques, formes juridiques). */
export const GENERIC_TOKENS = new Set([
	"com", "net", "org", "edu", "gouv", "gov", "int", "info", "biz",
	"fr", "eu", "be", "ch", "ca", "uk", "de", "es", "it", "nl", "lu",
	"www", "http", "https", "mail", "web", "site",
	// Termes techniques : présents dans tous les CVE et dans des milliers de
	// raisons sociales. Ils ne distinguent rien.
	"code", "software", "network", "networks", "system", "systems", "server",
	"servers", "service", "services", "solution", "solutions", "security",
	"secure", "platform", "platforms", "product", "products", "digital",
	"cloud", "data", "media", "group", "global", "technology", "technologies",
	// Formes juridiques : présentes dans des centaines de milliers de raisons
	// sociales. Elles ne distinguent rien, mais elles bloquaient la règle
	// « tous les jetons du nom sont dans l'indice » : « EARL BLACK STAR » ne
	// pouvait pas rencontrer l'indice « black star » à cause du seul « earl ».
	"earl", "sarl", "sas", "sasu", "eurl", "sci", "scm", "snc", "scs", "scic",
	"scop", "gie", "geie", "sei", "sep", "selarl", "selas", "scp", "eirl",
	// Formes juridiques étrangères et mots d'activité, même statut : un nom
	// réduit à un mot d'activité n'a rien de distinctif.
	"ltd", "limited", "inc", "llc", "corp", "corporation", "plc",
	"consulting", "consultant", "consultants", "advisory",
]);

/**
 * Minuscules, accents retirés, ponctuation et espaces réduits.
 * `œ`/`æ` ne se décomposent pas en NFD : traités explicitement, en minuscule
 * comme en majuscule, avant la décomposition.
 */
export function normalizeNom(texte: string): string {
	return texte
		.replace(/œ/g, "oe")
		.replace(/Œ/g, "OE")
		.replace(/æ/g, "ae")
		.replace(/Æ/g, "AE")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}
