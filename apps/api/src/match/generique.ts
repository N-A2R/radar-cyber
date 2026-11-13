/**
 * Vocabulaire qui ne désigne rien en propre.
 *
 * Une seule source pour deux usages qui doivent rester d'accord :
 *  - `referentiel/plan-etendu.ts` s'en sert pour décider quels noms deviennent
 *    des alias au chargement ;
 *  - `match/gazetteer.ts` s'en sert pour décider quels alias peuvent trancher
 *    un rattachement à l'ingestion.
 *
 * Si les deux listes divergeaient, on chargerait des alias que le moteur
 * refuserait d'utiliser — ou l'inverse, ce qui est pire.
 */

/** Mots génériques d'un nom d'établissement (santé, enseignement, médico-social). */
export const MOTS_GENERIQUES: ReadonlySet<string> = new Set<string>([
	// enseignement
	"ecole", "elementaire", "primaire", "maternelle", "publique", "privee",
	"college", "lycee", "ensemble", "scolaire", "groupe", "section",
	"enseignement", "professionnel", "technologique", "general", "generale",
	"campus", "institut", "annexe", "site",
	// santé et médico-social
	"centre", "service", "services", "maison", "foyer", "antenne", "unite", "secteur",
	"hopital", "hospitalier", "clinique", "pharmacie", "laboratoire", "cabinet",
	"consultation", "consultations", "protection", "infantile", "soins",
	"infirmiers", "infirmier", "pmi", "msp", "ehpad", "eps", "chs", "cmp",
	"csapa", "carr", "ciam", "ime", "sessad", "iemp", "upatou", "ssiad",
	"accueil", "medicalise", "medicalises", "medical", "medicale", "social",
	"sociale", "reinsertion", "aide", "fam", "mas", "finess", "etablissement",
	"etablissements", "polyvalent", "polyvalents", "adultes", "handicapes",
	"personnes", "ages", "enfants", "jeunes", "vie", "logis", "residence",
	"retraite", "sante", "soin", "permanent", "ambulatoire", "public", "prive",
	// particules et mots outils : en français ET en anglais, les flux sont mixtes
	"de", "du", "des", "la", "le", "les", "l", "d", "et", "pour", "aux", "au",
	"en", "sur", "sous", "chez", "the", "of", "and", "for",
]);

/** Mots génériques d'un nom d'entreprise : une enseigne nue ne rapproche rien. */
export const MOTS_GENERIQUES_ENTREPRISE: ReadonlySet<string> = new Set<string>([
	"services", "service", "groupe", "group", "societe", "entreprise", "etablissement",
	"etablissements", "france", "francais", "francaise", "international",
	"internationale", "holding", "investissement", "investissements", "gestion",
	"conseil", "conseils", "technologies", "technology", "solutions", "systemes",
	"system", "numerique", "informatique", "digital", "telecom", "telecoms",
	"nouvelle", "aquitaine", "europe", "europeen", "europeenne", "sas", "sarl",
	"sci", "scp", "eurl", "gie", "snc", "association", "associations",
	// Mots anglais courants dans les flux techniques (CVE, bulletins). Une
	// organisation nommée « THE HOST » ou « CALL AGENT » se rattachait à tout
	// texte contenant « host » ou « agent » : mesuré sur 400 événements, trois
	// faux positifs, tous de cette famille.
	"the", "host", "agent", "call", "app", "apps", "web", "mail", "store",
	"shop", "home", "house", "one", "plus", "pro", "max", "direct", "express",
	"cloud", "data", "media", "network", "networks", "systems", "software",
	"security", "secure", "platform", "product", "products", "support",
	"center", "centre", "central", "first", "next", "best", "top", "world",
	"wide", "global", "smart", "tech", "technology", "technologies", "online",
	"market", "trade", "business", "company", "partners", "partner", "office",
	"lab", "labs", "studio", "studios", "agency", "agency", "consulting",
]);

/**
 * Mots qui nomment un rôle institutionnel. Un alias qui en porte un peut
 * trancher un rattachement ; le même nom sans le rôle n'est qu'un lieu.
 *
 * « Ville de Tarnos » désigne une organisation ; « Tarnos » désigne un point
 * sur une carte, et un article parle de Tarnos sans que la mairie soit victime.
 */
export const MOTS_ROLE: readonly string[] = [
	"commune", "ville", "mairie", "departement", "departemental", "region",
	"regional", "prefecture", "sous-prefecture", "agglomeration", "agglo",
	"communaute", "metropole", "syndicat", "conseil", "district",
	"universite", "ecole", "college", "lycee", "hopital", "chu", "chr",
	"clinique", "institut", "laboratoire", "pharmacie", "ehpad",
];

/**
 * Retire les mots de rôle et les particules de tête d'un alias pour isoler le
 * nom du lieu. « Département de la Gironde » → « gironde ».
 */
export function nomDeLieu(jetons: readonly string[]): string {
	let debut = 0;
	while (debut < jetons.length) {
		const jeton = jetons[debut] as string;
		if (jetons[debut] === "de" || jetons[debut] === "du" || jetons[debut] === "des"
			|| jetons[debut] === "d" || jetons[debut] === "la" || jetons[debut] === "le"
			|| jetons[debut] === "les" || jetons[debut] === "l") {
			debut++;
			continue;
		}
		if (MOTS_ROLE.includes(jeton)) {
			debut++;
			continue;
		}
		break;
	}
	return jetons.slice(debut).join(" ");
}

/** Vrai si l'alias commence par un mot de rôle : « ville de … », « mairie de … ». */
export function commenceParUnRole(jetons: readonly string[]): boolean {
	return jetons.length > 1 && MOTS_ROLE.includes(jetons[0] as string);
}

/**
 * Mots de rôle qui désignent une **organisation à établissement** : une mairie,
 * un hôpital, une école. Ceux-là peuvent trancher un rattachement.
 *
 * Par opposition aux mots de **territoire** (« département », « région »,
 * « agglomération ») : « en Gironde », « au Pays basque » sont des localisations.
 * Un article qui les cite parle d'un lieu, pas d'une institution victime.
 * Les traiter comme des organisations est exactement le faux positif qui
 * rattachait « Vignobles Toutigeac » au Département de la Gironde.
 */
export const MOTS_ROLE_ETABLISSEMENT: readonly string[] = [
	"commune", "ville", "mairie", "prefecture", "sous-prefecture",
	"universite", "ecole", "college", "lycee", "hopital", "chu", "chr",
	"clinique", "institut", "laboratoire", "pharmacie", "ehpad", "syndicat",
];

/** Vrai si l'alias commence par un rôle d'établissement, et non de territoire. */
export function commenceParRoleEtablissement(jetons: readonly string[]): boolean {
	return jetons.length > 1 && MOTS_ROLE_ETABLISSEMENT.includes(jetons[0] as string);
}
