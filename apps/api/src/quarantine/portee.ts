/**
 * Portée d'une revendication : entre-t-elle dans le périmètre du radar ?
 *
 * La file de revue comptait 16 572 revendications en attente. Mesure faite
 * avant d'écrire quoi que ce soit : **une seule** se rattache à une
 * organisation du référentiel. Automatiser la *promotion* n'aurait donc rien
 * traité — et aurait industrialisé le genre d'erreur qu'on vient de corriger.
 *
 * Ce module ne promeut rien. Il répond à une question plus modeste et
 * vérifiable : cette revendication peut-elle concerner une organisation de la
 * région ? Trois réponses, jamais un score :
 *
 *  - `region`          : un département de la région est nommé ;
 *  - `hors_perimetre`  : l'indice est illisible, ou le pays annoncé est
 *                        explicitement étranger — la revendication reste en
 *                        base, elle sort seulement de la file ;
 *  - `a_revoir`        : rien ne permet de trancher, un humain regarde.
 *
 * Le classement est réversible : il ne change pas `status` sans écrire au
 * journal, et un `UPDATE` en arrière le défait.
 */
import { verifierTerritorial } from "../match/territorial.js";

export type Portee = "region" | "hors_perimetre" | "a_revoir";

export type VerdictPortee = {
	portee: Portee;
	/** Ce qui a décidé, en clair : jamais un score. */
	motif: string;
};

/** Séparateur des sources qui collent des métadonnées à l'indice. */
const SEPARATEUR = /[\\|;]/;

/** Domaine plausible : au moins un label et une extension alphabétique. */
const DOMAINE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,})+$/i;

/** Nom libre plausible : commence par une lettre, pas de caractères de contrôle. */
const NOM = /^[\p{L}][\p{L}\p{N} .'&()/-]{1,120}$/u;

/**
 * Pays dont l'apparition **explicite** suffit à sortir du périmètre régional.
 * Volontairement limité aux formes que les corpus de revendication écrivent
 * telles quelles (`Spain`, `USA`, `United Kingdom`…). Un nom de pays qui
 * apparaîtrait dans une phrase n'est pas traité ici : trop ambigu.
 */
const PAYS_HORS_PERIMETRE: Record<string, true> = {
	"usa": true, "united states": true, "us": true, "u.s.": true,
	"uk": true, "united kingdom": true, "england": true, "great britain": true,
	"scotland": true, "ireland": true, "germany": true, "deutschland": true,
	"spain": true, "italy": true, "portugal": true, "belgium": true,
	"netherlands": true, "switzerland": true, "austria": true, "poland": true,
	"czech republic": true, "czechia": true, "romania": true, "ukraine": true,
	"russia": true, "turkey": true, "israel": true, "uae": true,
	"united arab emirates": true, "saudi arabia": true, "qatar": true, "india": true,
	"china": true, "japan": true, "south korea": true, "korea": true,
	"singapore": true, "malaysia": true, "indonesia": true, "philippines": true,
	"vietnam": true, "thailand": true, "australia": true, "new zealand": true,
	"canada": true, "mexico": true, "brazil": true, "argentina": true,
	"chile": true, "colombia": true, "peru": true, "south africa": true,
	"egypt": true, "morocco": true, "nigeria": true, "kenya": true,
	"sweden": true, "norway": true, "denmark": true, "finland": true,
	"iceland": true, "greece": true, "hungary": true, "bulgaria": true,
	"croatia": true,
};

/** Segments d'un indice collé : `dollmar.com\$28.3M\Italy\127GB`. */
export function segments(indice: string): string[] {
	return indice.split(SEPARATEUR).map((s) => s.trim()).filter(Boolean);
}

/**
 * @param indice  `org_hint` de la revendication
 * @param texte   texte libre éventuel (titre brut), pour chercher un indice régional
 */
export function classerPortee(indice: string | null, texte = ""): VerdictPortee {
	const brut = (indice ?? "").trim();
	const morceaux = segments(brut);
	const premier = morceaux[0] ?? "";

	if (verifierTerritorial(`${brut} ${texte}`).regional) {
		return { portee: "region", motif: "un département de la région est nommé" };
	}

	if (premier.length < 3) {
		return { portee: "hors_perimetre", motif: "indice vide ou trop court" };
	}

	const estDomaine = DOMAINE.test(premier);
	const estNom = NOM.test(premier);
	if (!estDomaine && !estNom) {
		return { portee: "hors_perimetre", motif: "indice illisible : ni domaine ni nom" };
	}

	const pays = morceaux
		.map((m) => m.toLowerCase())
		.find((m) => PAYS_HORS_PERIMETRE[m] === true);
	if (pays) {
		return { portee: "hors_perimetre", motif: `pays hors périmètre annoncé : ${pays}` };
	}

	return { portee: "a_revoir", motif: "aucun indice permettant de trancher" };
}
