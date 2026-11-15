/**
 * Mapping division NAF (les deux premiers chiffres du code) → secteur du
 * référentiel, pour la totalité des divisions A01 à U99.
 *
 * Complète `naf-secteurs.mts` (les codes précis, qui restent prioritaires) :
 * avec le stock SIRENE national en entrée, un établissement peut porter
 * n'importe quel code — sans ce mapping, la mesure sectorielle serait un
 * trou de 90 %.
 *
 * Le vocabulaire des secteurs reprend celui déjà en base (numerique,
 * sante-social, energie-eau-dechets, finance-assurance, transport-logistique,
 * commerce, agroalimentaire, industrie, construction) et l'étend aux
 * divisions sans couverture. Un code inconnu vaut « autre », jamais NULL :
 * « sans secteur » est un trou publiée, « autre » est un choix assumé.
 */
export const DIVISION_TO_SECTEUR: Record<string, string> = {
	// A — agriculture, sylviculture et pêche
	"01": "agriculture",
	"02": "agriculture",
	"03": "agriculture",
	// B — industries extractives
	"05": "industrie",
	"06": "industrie",
	"07": "industrie",
	"08": "industrie",
	"09": "industrie",
	// C — industrie manufacturière (10 = industries alimentaires)
	"10": "agroalimentaire",
	"11": "industrie",
	"12": "industrie",
	"13": "industrie",
	"14": "industrie",
	"15": "industrie",
	"16": "industrie",
	"17": "industrie",
	"18": "industrie",
	"19": "industrie",
	"20": "industrie",
	"21": "industrie",
	"22": "industrie",
	"23": "industrie",
	"24": "industrie",
	"25": "industrie",
	"26": "industrie",
	"27": "industrie",
	"28": "industrie",
	"29": "industrie",
	"30": "industrie",
	"31": "industrie",
	"32": "industrie",
	"33": "industrie",
	// D — production et distribution d'électricité, gaz, vapeur
	"35": "energie-eau-dechets",
	// E — eau, déchets, dépollution
	"36": "energie-eau-dechets",
	"37": "energie-eau-dechets",
	"38": "energie-eau-dechets",
	"39": "energie-eau-dechets",
	// F — construction
	"41": "construction",
	"42": "construction",
	"43": "construction",
	// G — commerce
	"45": "commerce",
	"46": "commerce",
	"47": "commerce",
	// H — transports et entreposage
	"49": "transport-logistique",
	"50": "transport-logistique",
	"51": "transport-logistique",
	"52": "transport-logistique",
	"53": "transport-logistique",
	// I — hébergement et restauration
	"55": "restauration-hotellerie",
	"56": "restauration-hotellerie",
	// J — information et communication
	"58": "numerique",
	"59": "numerique",
	"60": "numerique",
	"61": "numerique",
	"62": "numerique",
	"63": "numerique",
	// K — finance et assurance
	"64": "finance-assurance",
	"65": "finance-assurance",
	"66": "finance-assurance",
	// L — immobilier
	"68": "immobilier",
	// M — activités spécialisées, scientifiques et techniques
	"69": "activites-specialisees",
	"70": "activites-specialisees",
	"71": "activites-specialisees",
	"72": "activites-specialisees",
	"73": "activites-specialisees",
	"74": "activites-specialisees",
	"75": "activites-specialisees",
	// N — activités de services de soutien
	"77": "services-entreprises",
	"78": "services-entreprises",
	"79": "services-entreprises",
	"80": "services-entreprises",
	"81": "services-entreprises",
	"82": "services-entreprises",
	// O — administration publique
	"84": "administration",
	// P — enseignement
	"85": "enseignement",
	// Q — santé et action sociale
	"86": "sante-social",
	"87": "sante-social",
	"88": "sante-social",
	// R — arts, spectacles et activités récréatives
	"90": "culture-loisirs",
	"91": "culture-loisirs",
	"92": "culture-loisirs",
	"93": "culture-loisirs",
	// S — associations et autres services
	"94": "associations",
	"95": "services-personnels",
	"96": "services-personnels",
	// T — particuliers employeurs et entreprises de ménages
	"97": "particulier-employeur",
	"98": "particulier-employeur",
	// U — organisations extraterritoriales
	"99": "autre",
};

/** Secteur d'un code NAF quel que soit son format ; inconnu → « autre ». */
export function secteurDeDivision(naf: string | null | undefined): string | null {
	if (!naf) return null;
	const code = naf.replace(/\./g, "").toUpperCase();
	const division = DIVISION_TO_SECTEUR[code.slice(0, 2)];
	return division ?? "autre";
}
