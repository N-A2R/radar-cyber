/**
 * Scellement RFC 3161 des exports publics.
 *
 * Une date de fichier ne prouve rien : elle est modifiable. Ici l'empreinte
 * SHA-256 des octets exacts livrés est envoyée à une TSA, le jeton reçu est
 * vérifié (structure, empreinte couverte, horodatage et numéro de série), puis
 * seulement la ligne `export_scellement` est écrite. En cas d'échec, aucun
 * dossier n'est publié : on ne renvoie jamais un export non daté.
 *
 * Le prestataire par défaut est un service TSA public. Sa qualification au
 * regard de la liste nationale de confiance ANSSI est déclarée explicitement :
 * elle n'est pas revendiquée. Un opérateur disposant d'un service qualifié
 * configure `RADAR_TSA_URL` et `RADAR_TSA_PRESTATAIRE_ANSSI` en conséquence.
 * Aucun secret n'est stocké ici, seulement le certificat public joint au jeton.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { query } from "../db.js";
import {
	empreinteRacine,
	fournisseurRfc3161,
	verifierJeton,
	type FournisseurJeton,
	type JetonVerifie,
} from "../journal/rfc3161.js";

/** Déclaration véridique du prestataire par défaut, sans qualification inventée. */
export const PRESTATAIRE_PAR_DEFAUT =
	"FreeTSA (freetsa.org) — jeton RFC 3161 public ; hors liste nationale de confiance ANSSI (qualification non revendiquée)";

export type ContenuExport = Buffer | string;

export type OptionsScellement = {
	/** Identifiant opaque du dossier (chemin relatif ou route), jamais une donnée personnelle. */
	reference: string;
	format: string;
	contenu: ContenuExport;
	fichier?: string | null;
	/** Heure de publication ; par défaut l'instant où le jeton a été obtenu. */
	exporteLe?: Date;
	fournisseur?: FournisseurJeton;
	verificateur?: (jeton: string, empreinte: Buffer) => JetonVerifie;
	prestataireAnssi?: string;
};

export type Scellement = {
	id: number;
	reference: string;
	format: string;
	sha256Fichier: string;
	tokenRfc3161: string;
	certificatTsa: string;
	prestataireAnssi: string;
	tsaUrl: string;
	tsaGenTime: string;
	tsaSerial: string;
	exporteLe: string;
	enTetes: Record<string, string>;
};

type LigneScellement = {
	id: string;
	reference: string;
	format: string;
	sha256_fichier: string;
	token_rfc3161: string;
	certificat_tsa: string;
	prestataire_anssi: string;
	tsa_url: string;
	tsa_gen_time: string;
	tsa_serial: string;
	exporte_le: Date | string;
};

/** SHA-256 des octets exacts qui seront livrés au téléchargeur. */
export function empreinteFichier(contenu: ContenuExport): string {
	return createHash("sha256").update(contenu).digest("hex");
}

/**
 * Obtient et vérifie un jeton, puis inscrit le scellement. Tout échec lève :
 * un export public sans date certaine n'est jamais publié.
 */
export async function scellerExport(options: OptionsScellement): Promise<Scellement> {
	const octets = Buffer.isBuffer(options.contenu) ? options.contenu : Buffer.from(options.contenu, "utf8");
	if (octets.length === 0) throw new Error("refus de sceller un export vide");
	if (!options.reference || !options.format) throw new Error("référence et format d'export requis");

	const sha256Fichier = empreinteFichier(octets);
	// Un même dossier revérifié deux fois ne consomme pas un second jeton et
	// n'ajoute pas de ligne : la preuve déjà publiée reste la seule valable.
	const existant = await query<LigneScellement>(
		`SELECT id::text, reference, format, sha256_fichier, token_rfc3161, certificat_tsa,
		        prestataire_anssi, tsa_url, tsa_gen_time, tsa_serial, exporte_le
		   FROM public.export_scellement WHERE reference = $1 AND sha256_fichier = $2`,
		[options.reference, sha256Fichier],
	);
	if (existant.rows[0]) return versScellement(existant.rows[0]);
	const empreinte = empreinteRacine(sha256Fichier);
	const fournisseur = options.fournisseur ?? fournisseurRfc3161();
	const jeton = await fournisseur(sha256Fichier);
	const verifie = (options.verificateur ?? verifierJeton)(jeton.jeton, empreinte);

	if (verifie.genTime !== jeton.genTime || verifie.serial !== jeton.serial) {
		throw new Error("jeton RFC 3161 incohérent avec la réponse de la TSA");
	}
	if (verifie.certificat && jeton.certificat && verifie.certificat !== jeton.certificat) {
		throw new Error("certificat TSA du jeton différent du certificat déclaré");
	}

	const prestataireAnssi = options.prestataireAnssi ?? process.env.RADAR_TSA_PRESTATAIRE_ANSSI ?? PRESTATAIRE_PAR_DEFAUT;
	const exporteLe = options.exporteLe ?? new Date(jeton.genTime);
	const resultat = await query<LigneScellement>(
		`INSERT INTO public.export_scellement
		   (reference, format, taille_octets, sha256_fichier, token_rfc3161, certificat_tsa,
		    prestataire_anssi, tsa_url, tsa_gen_time, tsa_serial, verify_ok, fichier, exporte_le)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12::timestamptz)
		 ON CONFLICT (reference, sha256_fichier) DO NOTHING
		 RETURNING id::text, reference, format, sha256_fichier, token_rfc3161, certificat_tsa,
		           prestataire_anssi, tsa_url, tsa_gen_time, tsa_serial, exporte_le`,
		[
			options.reference,
			options.format,
			octets.length,
			sha256Fichier,
			jeton.jeton,
			jeton.certificat,
			prestataireAnssi,
			jeton.tsaUrl,
			jeton.genTime,
			jeton.serial,
			options.fichier ?? null,
			exporteLe.toISOString(),
		],
	);
	const ligne = resultat.rows[0];
	if (ligne) return versScellement(ligne);
	// Un concurrent a publié les mêmes octets sous la même référence : sa
	// preuve est la bonne, on la rend au lieu de lever une violation d'unicité.
	const publie = await query<LigneScellement>(
		`SELECT id::text, reference, format, sha256_fichier, token_rfc3161, certificat_tsa,
		        prestataire_anssi, tsa_url, tsa_gen_time, tsa_serial, exporte_le
		   FROM public.export_scellement WHERE reference = $1 AND sha256_fichier = $2`,
		[options.reference, sha256Fichier],
	);
	const retenu = publie.rows[0];
	if (!retenu) throw new Error("insertion du scellement sans ligne retournée");
	return versScellement(retenu);
}

function versScellement(ligne: LigneScellement): Scellement {
	return {
		id: Number(ligne.id),
		reference: ligne.reference,
		format: ligne.format,
		sha256Fichier: ligne.sha256_fichier,
		tokenRfc3161: ligne.token_rfc3161,
		certificatTsa: ligne.certificat_tsa,
		prestataireAnssi: ligne.prestataire_anssi,
		tsaUrl: ligne.tsa_url,
		tsaGenTime: ligne.tsa_gen_time,
		tsaSerial: ligne.tsa_serial,
		exporteLe: new Date(ligne.exporte_le).toISOString(),
		// En-têtes prêts à être posés sur une réponse HTTP : le jeton voyage
		// avec le dossier, le client peut le revérifier sans notre base.
		// Les valeurs HTTP doivent rester ASCII : la mention du prestataire
		// peut contenir des tirets typographiques ou des accents.
		enTetes: {
			"X-Export-Scellement-Id": String(ligne.id),
			"X-Export-Sha256": ligne.sha256_fichier,
			"X-Export-Rfc3161-Token": ligne.token_rfc3161,
			"X-Export-Tsa-Gen-Time": ligne.tsa_gen_time,
			"X-Export-Tsa-Url": ligne.tsa_url,
			"X-Export-Prestataire-Anssi": ligne.prestataire_anssi.replace(/[^\x20-\x7e]/g, "?"),
		},
	};
}

/** Poser les en-têtes de scellement sur une réponse de téléchargement. */
export function appliquerEnTetes(
	header: (nom: string, valeur: string) => unknown,
	scellement: Scellement,
): void {
	for (const [nom, valeur] of Object.entries(scellement.enTetes)) header(nom, valeur);
}

/**
 * Pour les tests d'intégration : `RADAR_EXPORT_SCELLEMENT=0` évite un appel
 * réseau à chaque export. La production ne désactive jamais ce réglage.
 */
export function scellementHttpActif(): boolean {
	return process.env.RADAR_EXPORT_SCELLEMENT !== "0";
}

/**
 * Écrit un dossier avec son jeton joint. Le scellement est obtenu avant
 * l'écriture : une panne de la TSA ne laisse jamais un fichier non daté.
 */
export async function ecrireDossierScelle(options: {
	chemin: string;
	contenu: ContenuExport;
	reference: string;
	format: string;
	fichier?: string;
}): Promise<Scellement> {
	const scellement = await scellerExport({
		reference: options.reference,
		format: options.format,
		contenu: options.contenu,
		fichier: options.fichier ?? options.reference,
	});
	await mkdir(dirname(options.chemin), { recursive: true });
	await writeFile(options.chemin, options.contenu);
	await writeFile(
		`${options.chemin}.scellement.json`,
		JSON.stringify(
			{
				id: scellement.id,
				reference: scellement.reference,
				sha256_fichier: scellement.sha256Fichier,
				token_rfc3161: scellement.tokenRfc3161,
				certificat_tsa: scellement.certificatTsa,
				prestataire_anssi: scellement.prestataireAnssi,
				tsa_url: scellement.tsaUrl,
				tsa_gen_time: scellement.tsaGenTime,
				tsa_serial: scellement.tsaSerial,
			},
			null,
			2,
		),
		"utf8",
	);
	return scellement;
}
