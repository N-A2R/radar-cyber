/**
 * Normalisation d'un département, partagée par les critères de rattachement.
 *
 * Un département arrive tantôt comme code (`33`, `2A`), tantôt comme libellé
 * (`Gironde`, `Charente-Maritime`), tantôt enrichi (`Gironde (33)`). Un
 * départage ne doit pas échouer pour une simple différence d'écriture : cette
 * fonction rend le code INSEE dès qu'il est reconnaissable, sinon le libellé
 * déaccentué. Elle est pure et ne touche ni la base ni le collecteur.
 */
const LABELS: Readonly<Record<string, string>> = {
	"01": "ain", "02": "aisne", "03": "allier", "04": "alpes-de-haute-provence",
	"05": "hautes-alpes", "06": "alpes-maritimes", "07": "ardeche", "08": "ardennes",
	"09": "ariege", "10": "aube", "11": "aude", "12": "aveyron",
	"13": "bouches-du-rhone", "14": "calvados", "15": "cantal", "16": "charente",
	"17": "charente-maritime", "18": "cher", "19": "correze", "2a": "corse-du-sud",
	"2b": "haute-corse", "21": "cote-dor", "22": "cotes-darmor", "23": "creuse",
	"24": "dordogne", "25": "doubs", "26": "drome", "27": "eure", "28": "eure-et-loir",
	"29": "finistere", "30": "gard", "31": "haute-garonne", "32": "gers",
	"33": "gironde", "34": "herault", "35": "ille-et-vilaine", "36": "indre",
	"37": "indre-et-loire", "38": "isere", "39": "jura", "40": "landes",
	"41": "loir-et-cher", "42": "loire", "43": "haute-loire", "44": "loire-atlantique",
	"45": "loiret", "46": "lot", "47": "lot-et-garonne", "48": "lozere",
	"49": "maine-et-loire", "50": "manche", "51": "marne", "52": "haute-marne",
	"53": "mayenne", "54": "meurthe-et-moselle", "55": "meuse", "56": "morbihan",
	"57": "moselle", "58": "nievre", "59": "nord", "60": "oise", "61": "orne",
	"62": "pas-de-calais", "63": "puy-de-dome", "64": "pyrenees-atlantiques",
	"65": "hautes-pyrenees", "66": "pyrenees-orientales", "67": "bas-rhin",
	"68": "haut-rhin", "69": "rhone", "70": "haute-saone", "71": "saone-et-loire",
	"72": "sarthe", "73": "savoie", "74": "haute-savoie", "75": "paris",
	"76": "seine-maritime", "77": "seine-et-marne", "78": "yvelines",
	"79": "deux-sevres", "80": "somme", "81": "tarn", "82": "tarn-et-garonne",
	"83": "var", "84": "vaucluse", "85": "vendee", "86": "vienne",
	"87": "haute-vienne", "88": "vosges", "89": "yonne", "90": "territoire-de-belfort",
	"91": "essonne", "92": "hauts-de-seine", "93": "seine-saint-denis",
	"94": "val-de-marne", "95": "val-doise", "971": "guadeloupe",
	"972": "martinique", "973": "guyane", "974": "la-reunion",
};

function normalise(valeur: string): string {
	return valeur
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Code INSEE d'un département, reconnu sous forme de code ou de libellé. */
export function codeDepartement(valeur: string | null | undefined): string | null {
	if (!valeur) return null;
	const brut = valeur.trim();
	if (/^\d{2,3}$/i.test(brut) || /^2[ab]$/i.test(brut)) return brut.toLowerCase();
	const nettoye = normalise(brut);
	if (!nettoye) return null;
	for (const [code, libelle] of Object.entries(LABELS)) {
		if (nettoye === libelle) return code;
	}
	// `Gironde (33)` et autres libellés enrichis : le code reste la clé la plus sûre.
	const code = brut.match(/(?:^|\D)(\d{2,3}|2[ab])(?:\D|$)/i);
	return code?.[1]?.toLowerCase() ?? nettoye;
}
