#!/usr/bin/env -S npx tsx
/**
 * Certifie l'identité légale de chaque organisation citée par un événement.
 *
 * Source officielle : API « recherche d'entreprises » mise à disposition par
 * la DINUM à partir des données SIRENE de l'INSEE
 * (https://recherche-entreprises.api.gouv.fr/). C'est une source NATIONALE :
 * aucun résultat n'est présenté comme une collecte locale. Aucune clé ni clé
 * secrète n'est requise, aucun résultat n'est mis en cache dans le dépôt.
 *
 * Par défaut : rapport seul, aucune écriture. `--appliquer` horodate les SIREN
 * confirmés, corrige ceux que la source contredit, et retire l'attribution
 * d'événement des libellés qui ne désignent aucune personne morale vérifiable
 * (noms de domaine, noms commerciaux sans fiche officielle...). Un retrait est
 * tracé dans l'`evidence` de l'événement.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/certifier-siren-cites.mts [--appliquer]
 *     [--json=bench/results/siren-cites.json] [--echantillon=100] [--controle-seul]
 *     [--attente-ms=1100] [--timeout-ms=12000] [--api-base=https://...]
 */
import { writeFile } from "node:fs/promises";
import { closePools } from "../apps/api/src/db.js";
import {
  choisirCandidat,
  correspondNomLegal,
  confirmerParSiren,
  estNomDeDomaine,
  requeteRecherche,
  type CandidatSirene,
} from "../apps/api/src/siren/verification.js";
import {
  compterOrganisationsNonVerifiees,
  declierEvenements,
  echantillonSirens,
  enregistrerVerification,
  fusionnerEvenements,
  lireOrganisationsCitees,
  proprietaireDuSiren,
  type OrgCitee,
} from "../apps/api/src/siren/verification-db.js";

const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";
const USER_AGENT = "radar-cyber/identite-legale-verifiee (source: SIRENE/DINUM)";

interface Options {
  appliquer: boolean;
  controleSeul: boolean;
  jsonPath: string | null;
  echantillon: number;
  apiBase: string;
  attenteMs: number;
  timeoutMs: number;
}

interface ApiResultat {
  siren?: string;
  nom_raison_sociale?: string | null;
  nom_complet?: string | null;
  siege?: { departement?: string | null } | null;
  date_fermeture?: string | null;
}

type Action = "deja" | "ajoute" | "corrige" | "detache" | "fusionne" | "erreur";

interface Decision {
  orgId: number;
  nom: string;
  sirenActuel: string | null;
  evenements: number;
  action: Action;
  sirenRetenu?: string;
  nomOfficiel?: string;
  motif?: string;
}

interface Rapport {
  genereLe: string;
  sourceOfficielle: string;
  mode: "rapport" | "application";
  organisationsCitees: number;
  dejaVerifiees: number;
  ajoutees: number;
  corrigees: number;
  fusionnees: number;
  detachrees: number;
  evenementsDeclies: number;
  nonVerifieesApres: number;
  echantillon: {
    taille: number;
    conformes: number;
    nomsDifferents: number;
    introuvables: number;
    erreurs: number;
    exemplesNonConformes: Array<{ id: number; siren: string; nom: string; officiel: string | null }>;
  } | null;
  decisions: Decision[];
}

function valeur(args: string[], nom: string): string | null {
  const prefixe = `--${nom}=`;
  const trouve = args.find((a) => a.startsWith(prefixe));
  return trouve ? trouve.slice(prefixe.length) : null;
}

function entier(args: string[], nom: string, defaut: number): number {
  const brut = valeur(args, nom);
  if (brut === null) return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${nom} doit être un entier positif`);
  return n;
}

function options(args: string[]): Options {
  return {
    appliquer: args.includes("--appliquer"),
    controleSeul: args.includes("--controle-seul"),
    jsonPath: valeur(args, "json"),
    echantillon: entier(args, "echantillon", 0),
    apiBase: valeur(args, "api-base") ?? API_BASE,
    attenteMs: Math.max(0, entier(args, "attente-ms", 1100)),
    timeoutMs: Math.max(1000, entier(args, "timeout-ms", 12000)),
  };
}

function sommeil(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resultats(data: unknown): ApiResultat[] {
  if (typeof data !== "object" || data === null || !("results" in data)) return [];
  const liste = data.results;
  return Array.isArray(liste)
    ? liste.filter((r): r is ApiResultat => typeof r === "object" && r !== null)
    : [];
}

/** Reprises sur 429/5xx et coupures réseau : jamais d'abandon sur un simple accès. */
async function apiGet(url: string, opts: Options): Promise<unknown | null> {
  for (let tentative = 0; tentative < 5; tentative++) {
    const controle = new AbortController();
    const minuteur = setTimeout(() => controle.abort(), opts.timeoutMs);
    try {
      const reponse = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controle.signal,
      });
      clearTimeout(minuteur);
      if (reponse.status === 429 || reponse.status >= 500) {
        await sommeil(1500 * (tentative + 1));
        continue;
      }
      if (!reponse.ok) return null;
      return (await reponse.json()) as unknown;
    } catch {
      clearTimeout(minuteur);
      await sommeil(1000 * (tentative + 1));
    }
  }
  return null;
}

function versCandidat(resultat: ApiResultat): CandidatSirene | null {
  if (!resultat.siren || !/^\d{9}$/.test(resultat.siren)) return null;
  const nom = resultat.nom_raison_sociale || resultat.nom_complet || "";
  if (!nom.trim()) return null;
  return {
    siren: resultat.siren,
    nom,
    dept: resultat.siege?.departement ?? null,
    fermeLe: resultat.date_fermeture ?? null,
  };
}


async function chercherParSiren(siren: string, opts: Options): Promise<CandidatSirene | null> {
  const url = `${opts.apiBase}?${new URLSearchParams({ q: siren, per_page: "5" })}`;
  const data = await apiGet(url, opts);
  const trouve = resultats(data).find((r) => r.siren === siren);
  return trouve ? versCandidat(trouve) : null;
}

async function chercherParNom(nom: string, dept: string | null, opts: Options): Promise<CandidatSirene[]> {
  const params = new URLSearchParams({ q: nom, per_page: "10" });
  if (dept && /^\d{2}$/.test(dept.trim())) params.set("departement", dept.trim());
  const data = await apiGet(`${opts.apiBase}?${params}`, opts);
  return resultats(data).map(versCandidat).filter((c): c is CandidatSirene => c !== null);
}

async function decider(org: OrgCitee, opts: Options): Promise<Decision> {
  const base: Decision = {
    orgId: org.id,
    nom: org.name,
    sirenActuel: org.siren,
    evenements: org.evenements,
    action: "erreur",
  };
  if (org.siren_verifie_le && org.siren && /^\d{9}$/.test(org.siren)) {
    return { ...base, action: "deja" };
  }
  if (estNomDeDomaine(org.name)) {
    return { ...base, action: "detache", motif: "domaine : aucune personnalité morale" };
  }

  const requete = requeteRecherche(org.name);
  const sirenActuel = org.siren && /^\d{9}$/.test(org.siren) ? org.siren : null;
  let retenu: CandidatSirene | null = null;
  let action: Action = sirenActuel ? "corrige" : "ajoute";

  if (sirenActuel) {
    const reponse = await chercherParSiren(sirenActuel, opts);
    await sommeil(opts.attenteMs);
    if (reponse && confirmerParSiren(sirenActuel, org.name, reponse)) {
      retenu = { ...reponse, siren: sirenActuel };
      action = "corrige";
    }
  }
  if (!retenu) {
    if (!requete) return { ...base, action: "detache", motif: "libellé vide" };
    const candidats = await chercherParNom(requete, org.dept, opts);
    await sommeil(opts.attenteMs);
    retenu = choisirCandidat(org.name, org.dept, candidats);
  }
  if (!retenu) {
    return { ...base, action: "detache", motif: "aucune fiche officielle confirmée" };
  }
  return {
    ...base,
    action,
    sirenRetenu: retenu.siren,
    nomOfficiel: retenu.nom,
    motif: retenu.siren === sirenActuel ? "SIREN confirmé par la source officielle" : "SIREN corrigé",
  };
}

async function verifierEchantillon(opts: Options): Promise<Rapport["echantillon"]> {
  const orgs = await echantillonSirens(opts.echantillon);
  const rapport: NonNullable<Rapport["echantillon"]> = {
    taille: orgs.length,
    conformes: 0,
    nomsDifferents: 0,
    introuvables: 0,
    erreurs: 0,
    exemplesNonConformes: [],
  };
  for (const org of orgs) {
    try {
      const reponse = await chercherParSiren(org.siren, opts);
      if (!reponse) rapport.introuvables++;
      else if (confirmerParSiren(org.siren, org.name, reponse)) rapport.conformes++;
      else {
        rapport.nomsDifferents++;
        if (rapport.exemplesNonConformes.length < 10) {
          rapport.exemplesNonConformes.push({
            id: org.id,
            siren: org.siren,
            nom: org.name,
            officiel: reponse.nom,
          });
        }
      }
    } catch {
      rapport.erreurs++;
    }
    await sommeil(opts.attenteMs);
  }
  return rapport;
}

async function main(): Promise<void> {
  const opts = options(process.argv.slice(2));
  const orgs = opts.controleSeul ? [] : await lireOrganisationsCitees();
  const decisions: Decision[] = [];
  if (!opts.controleSeul) {
    for (const org of orgs) {
      const decision = await decider(org, opts);
      decisions.push(decision);
      console.log(
        `[${decision.action}] org=${decision.orgId} ${decision.nom} ` +
          `${decision.sirenActuel ?? "∅"} -> ${decision.sirenRetenu ?? "∅"} ${decision.motif ?? ""}`,
      );
    }
  }

  let evenementsDeclies = 0;
  let fusionnees = 0;
  if (opts.appliquer) {
    for (const decision of decisions) {
      if (decision.action === "ajoute" || decision.action === "corrige") {
        if (!decision.sirenRetenu || !decision.nomOfficiel) continue;
        const org = orgs.find((o) => o.id === decision.orgId);
        const proprietaire = await proprietaireDuSiren(decision.sirenRetenu, decision.orgId);
        if (proprietaire !== null) {
          fusionnees += await fusionnerEvenements(decision.orgId, proprietaire);
          decision.action = "fusionne";
          decision.motif = `événements rapportés à l'org ${proprietaire}`;
        } else {
          await enregistrerVerification({
            orgId: decision.orgId,
            siren: decision.sirenRetenu,
            nomOfficiel: decision.nomOfficiel,
            renommer: !correspondNomLegal(org?.name ?? "", decision.nomOfficiel),
          });
        }
      } else if (decision.action === "detache") {
        evenementsDeclies += await declierEvenements([decision.orgId], decision.motif ?? "non vérifié");
      }
    }
  }

  const echantillon = opts.echantillon > 0 ? await verifierEchantillon(opts) : null;
  const rapport: Rapport = {
    genereLe: new Date().toISOString(),
    sourceOfficielle: opts.apiBase,
    mode: opts.appliquer ? "application" : "rapport",
    organisationsCitees: orgs.length,
    dejaVerifiees: decisions.filter((d) => d.action === "deja").length,
    ajoutees: decisions.filter((d) => d.action === "ajoute").length,
    corrigees: decisions.filter((d) => d.action === "corrige").length,
    fusionnees,
    detachrees: decisions.filter((d) => d.action === "detache").length,
    evenementsDeclies,
    nonVerifieesApres: await compterOrganisationsNonVerifiees(),
    echantillon,
    decisions,
  };
  console.log(JSON.stringify({ ...rapport, decisions: undefined }, null, 2));
  if (opts.jsonPath) {
    await writeFile(opts.jsonPath, `${JSON.stringify(rapport, null, 2)}\n`);
    console.log(`rapport écrit : ${opts.jsonPath}`);
  }
  await closePools();
  if (opts.appliquer && rapport.nonVerifieesApres > 0) {
    console.error(`critère non atteint : ${rapport.nonVerifieesApres} organisation(s) citée(s) non vérifiée(s)`);
    process.exitCode = 1;
  }
}

main().catch(async (erreur) => {
  console.error(erreur);
  await closePools();
  process.exitCode = 1;
});
