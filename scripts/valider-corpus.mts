#!/usr/bin/env node
/**
 * Recharge chaque URL d'un corpus JSONL et vérifie que la page mentionne
 * l'organisation déclarée. Aucune donnée n'est mise en cache : le résultat
 * reflète l'état du web au moment de l'exécution.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/valider-corpus.mts [corpus.jsonl] [--json chemin.json]
 *
 * Sortie : taille du corpus, nombre de pages accessibles, d'URL mortes et
 * d'incohérences, avec le détail de chaque anomalie. Code de sortie 1 dès
 * qu'une ligne n'est pas valide.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { get as httpsGet } from 'node:https';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const jsonFlag = args.indexOf('--json');
const jsonPath = jsonFlag >= 0 && args[jsonFlag + 1] ? resolve(args[jsonFlag + 1]) : null;
const concurrencyFlag = args.indexOf('--concurrency');
const CONCURRENCY = Math.max(1, Number(concurrencyFlag >= 0 && args[concurrencyFlag + 1]) || 5);
const valeursDeFlags = new Set([jsonFlag + 1, concurrencyFlag + 1].filter((i) => i > 0));
const positional = args.filter((a, i) => !a.startsWith('--') && !valeursDeFlags.has(i));
const corpusPath = resolve(positional[0] ?? 'bench/couverture/incidents.jsonl');
const DIRECT_TIMEOUT = 9_000;
const READER_TIMEOUT = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

type Ligne = Record<string, unknown> & {
  organisation?: string;
  url?: string;
  extrait?: string;
  titre?: string;
};

type Etat = 'valide' | 'incoherente' | 'morte';

type Resultat = {
  ligne: number;
  organisation: string;
  url: string;
  etat: Etat;
  detail: string;
  cle_trouvee?: string;
  extrait_trouve?: boolean;
  source_contenu: 'directe' | 'lecteur' | 'aucune';
};

const ENTITES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'",
  rdcquo: '"', ldquo: '"', hellip: '…', eacute: 'e', egrave: 'e', agrave: 'a',
  ccedilla: 'c', ugrave: 'u', ocirc: 'o', icirc: 'i', ecirc: 'e', ucirc: 'u',
};

/** Texte comparable : accents repliés, ponctuation unifiée, espaces normalisés. */
function normalise(valeur: string): string {
  return valeur
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entiere, code: string) => {
      if (code[0] === '#') {
        const hex = code[1]?.toLowerCase() === 'x';
        const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(point) && point < 0x110000 ? String.fromCodePoint(point) : ' ';
      }
      return ENTITES[code.toLowerCase()] ?? ' ';
    })
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u201a\u02bc`]/g, "'")
    .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u2013\u2014\u2010\u2212]/g, '-')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function htmlEnTexte(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, (e) => e)
    .replace(/\s+/g, ' ');
}

/** Mots trop généraux pour prouver à eux seuls la présence d'une organisation. */
const GENERIQUES = new Set([
  'a', 'au', 'aux', 'd', 'dans', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les',
  'sur', 'sous', 'un', 'une', 'dont', 'pour', 'par', 'avec', 'nom', 'nouvelle', 'aquitaine',
  'france', 'saint', 'sainte', 'ville', 'mairie', 'commune', 'communaute', 'departement',
  'charente', 'correze', 'creuse', 'dordogne', 'gironde', 'landes', 'lot', 'garonne',
  'pyrenees', 'atlantiques', 'vienne', 'haute', 'service', 'centre', 'association',
  'societe', 'syndicat', 'hopital', 'clinique', 'etablissement', 'direction', 'federation',
  'nationale', 'national', 'regional', 'regionale', 'departemental', 'departementale',
  'groupe', 'prestataire', 'hebergeur', 'site', 'sites', 'club', 'maison', 'parc', 'residence',
  'source', 'actualites', 'actu', 'info', 'presse', 'cyberattaque', 'attaque', 'incident',
  'donnees', 'personnelles', 'financieres', 'familles', 'difficulte', 'aide', 'sante',
  'travail', 'theatre', 'cinema', 'plateforme', 'espace', 'aeroport', 'college', 'lycee',
  'ecole', 'universite', 'tourisme', 'municipal', 'municipale', 'municipaux', 'prive',
  'publique', 'social', 'sociale', 'culture', 'sport', 'festival', 'billetterie',
  'informatique', 'numerique', 'cybersecurite', 'securite', 'commerce', 'commerciale',
  'agence', 'office', 'chambre', 'interentreprises', 'laboratoire', 'resident',
  'hospitalier', 'commissariat', 'police', 'reseaux', 'agglo', 'prefecture',
]);

const PREFIXES = [
  'communaute de communes de ', 'communaute d agglomeration de ', 'ville de ',
  'mairie de ', 'mairie d ', 'commune de ', 'centre hospitalier de ',
  'centre public de sante de ', 'hopital de ', 'association de ', 'association ',
  'societe ', 'syndicat ', 'federation nationale des ', 'federation des ',
  'federation ', 'etablissement de ', 'direction departementale des ',
  'residence ', 'ehpad ', 'sas ', 'sarl ',
];

/** Segments de l'organisation, du plus nominatif au plus générique. */
function segmentsOrganisation(organisation: string): string[] {
  // Découpage sur la chaîne brute : la normalisation transforme la ponctuation
  // en espaces et ferait disparaître les séparateurs « — » et « : ».
  const morceaux = organisation
    .split(/[:;|/,()[\]]|\s+[—–-]\s+/)
    .map((morceau) => normalise(morceau))
    .filter(Boolean);
  return morceaux
    .map((segment) => {
      let reste = segment;
      for (const prefixe of PREFIXES) {
        if (reste.startsWith(prefixe)) {
          reste = reste.slice(prefixe.length);
          break;
        }
      }
      return reste.trim().replace(/^(?:et|de|d|des|du|la|le|les|dun)\s+/, '').trim();
    })
    .filter((segment) => segment.length >= 4);
}

function motsDistinctifs(segment: string): string[] {
  return segment.split(' ').filter((mot) => mot.length >= 4 && !GENERIQUES.has(mot) && !/^\d+$/.test(mot));
}

function dansLeTexte(cle: string, texte: string): boolean {
  return ` ${texte} `.includes(` ${cle} `);
}

/**
 * Vérification stricte : le segment nominatif de l'organisation (ou le champ
 * `mention` quand il est fourni) doit apparaître dans la page. Un simple mot
 * générique (« plateau », « espace », « théâtre ») ne suffit jamais.
 */
function verifierOrganisation(organisation: string, texte: string, mention?: string): string | null {
  const complet = normalise(organisation);
  // L'intégralité du nom dans la page est toujours une preuve suffisante.
  if (dansLeTexte(complet, texte)) return complet;
  // Sinon on exige un mot du segment principal : les compléments après « — »
  // ou « : » (ville, prestataire, service) ne prouvent pas l'organisation.
  const segments = segmentsOrganisation(organisation);
  const noyau = mention ? normalise(mention) : segments[0] ?? complet;
  // Un acronyme du nom court (« TMA », « CCI », « SPSTI ») est une mention
  // explicite, même quand il fait moins de quatre lettres.
  const premierMorceau = organisation.split(/[:;|/,()[\]]|\s+[—–-]\s+/)[0] ?? organisation;
  for (const acronyme of premierMorceau.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []) {
    const cle = normalise(acronyme);
    if (dansLeTexte(cle, texte)) return cle;
  }
  if (noyau.split(' ').length > 1 && dansLeTexte(noyau, texte)) return noyau;
  const presents = motsDistinctifs(noyau).filter((mot) => dansLeTexte(mot, texte));
  if (presents.length >= 2 || presents.some((mot) => mot.length >= 5)) {
    return presents.sort((a, b) => b.length - a.length)[0]!;
  }
  return null;
}

async function lireAvecDelai(input: string | URL, init: RequestInit, delai: number): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(delai) });
}

type Page = { texte: string; source: 'directe' | 'lecteur'; detail: string };
/**
 * Dernier recours pour ce poste de travail : son proxy TLS intercepte certains
 * journaux et leur certificat n'est pas validé par Node. On ne l'utilise qu'après
 * échec de la lecture normale et du lecteur, et on le signale dans le détail.
 */
function httpsDirect(url: string, sauts = 0): Promise<{ statut: number; corps: string; type: string }> {
  return new Promise((resolu, rejete) => {
    const requete = httpsGet(url, {
      rejectUnauthorized: false,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    }, (reponse) => {
      const statut = reponse.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(statut) && reponse.headers.location && sauts < 5) {
        reponse.resume();
        resolu(httpsDirect(new URL(reponse.headers.location, url).href, sauts + 1));
        return;
      }
      const morceaux: Buffer[] = [];
      reponse.on('data', (morceau: Buffer) => morceaux.push(morceau));
      reponse.on('end', () => resolu({
        statut,
        corps: Buffer.concat(morceaux).toString('utf8'),
        type: String(reponse.headers['content-type'] ?? ''),
      }));
    });
    requete.setTimeout(DIRECT_TIMEOUT, () => requete.destroy(new Error('timeout')));
    requete.on('error', rejete);
  });
}

async function chargerDirectProxy(url: string): Promise<Page> {
  try {
    const reponse = await httpsDirect(url);
    if (reponse.statut >= 200 && reponse.statut < 300 && !reponse.type.includes('pdf')) {
      const texte = normalise(htmlEnTexte(reponse.corps));
      if (texte.length >= 300) {
        return { texte, source: 'directe', detail: `HTTP ${reponse.statut} (TLS proxy)` };
      }
    }
  } catch (erreur) {
    return { texte: '', source: 'aucune', detail: `reprise TLS : ${(erreur as Error).message}` };
  }
  return { texte: '', source: 'aucune', detail: 'reprise TLS : contenu vide' };
}


/** Lecteur de secours : utile derrière un proxy TLS ou pour les pages rendues côté client. */
async function chargerLecteur(url: string, contexte: string): Promise<Page> {
  let dernierDetail = '';
  for (let essai = 0; essai < 3; essai++) {
    try {
      const lecture = await lireAvecDelai(
        `https://r.jina.ai/${url}`,
        { headers: { accept: 'text/plain', 'user-agent': USER_AGENT }, redirect: 'follow' },
        READER_TIMEOUT,
      );
      const brut = await lecture.text();
      const alerte = brut.match(/Warning: Target URL returned error (\d{3})/);
      if (!lecture.ok || alerte) {
        dernierDetail = `${contexte} ; lecteur : HTTP ${lecture.ok ? alerte?.[1] : lecture.status}`;
        // 429 est un débit momentané, pas une page morte : on réessaie.
        if (lecture.status === 429) {
          await new Promise((resolu) => setTimeout(resolu, 1500 * (essai + 1)));
          continue;
        }
        return { texte: '', source: 'aucune', detail: dernierDetail };
      }
      const corps = brut.includes('Markdown Content:') ? brut.split('Markdown Content:')[1]! : brut;
      const texte = normalise(htmlEnTexte(corps));
      if (texte.length < 200) {
        return { texte: '', source: 'aucune', detail: `${contexte} ; lecteur : contenu vide` };
      }
      return { texte, source: 'lecteur', detail: `${contexte} ; lecteur HTTP ${lecture.status}` };
    } catch (erreur) {
      dernierDetail = `${contexte} ; lecteur indisponible (${(erreur as Error).message})`;
    }
  }
  const reprise = await chargerDirectProxy(url);
  return reprise.texte ? reprise : { texte: '', source: 'aucune', detail: `${dernierDetail} ; ${reprise.detail}` };
}

async function charger(url: string): Promise<Page> {
  let premierEchec = '';
  try {
    const reponse = await lireAvecDelai(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    }, DIRECT_TIMEOUT);
    const type = reponse.headers.get('content-type') ?? '';
    if (!reponse.ok) {
      premierEchec = `HTTP ${reponse.status}`;
    } else if (type.includes('pdf')) {
      premierEchec = 'réponse PDF (texte non extractible en direct)';
    } else {
      const html = await reponse.text();
      const texte = normalise(htmlEnTexte(html));
      if (texte.length >= 300) return { texte, source: 'directe', detail: `HTTP ${reponse.status}` };
      premierEchec = `page directe vide ou JS (${texte.length} caractères)`;
    }
  } catch (erreur) {
    premierEchec = `lecture directe impossible (${(erreur as Error).message})`;
  }
  return chargerLecteur(url, premierEchec);
}

async function verifier(ligne: Ligne, numero: number): Promise<Resultat> {
  const organisation = String(ligne.organisation ?? '');
  const url = String(ligne.url ?? '');
  const base: Resultat = {
    ligne: numero,
    organisation,
    url,
    etat: 'morte',
    detail: '',
    source_contenu: 'aucune',
  };
  if (!/^https?:\/\//.test(url)) return { ...base, detail: 'URL absente ou invalide' };
  if (!organisation) return { ...base, detail: 'organisation absente' };

  let page = await charger(url);
  if (!page.texte) return { ...base, detail: page.detail };
  const mention = ligne.mention ? String(ligne.mention) : undefined;
  let cle = verifierOrganisation(organisation, page.texte, mention);
  // Certaines pages servent en direct un contenu partiel (coquille JS) : on
  // retente avec le lecteur avant de conclure à une incohérence.
  if (!cle && page.source === 'directe') {
    const secours = await chargerLecteur(url, 'contrôle après contenu direct partiel');
    if (secours.texte) {
      page = secours;
      cle = verifierOrganisation(organisation, secours.texte, mention);
    }
  }
  const extrait = ligne.extrait ? normalise(String(ligne.extrait)).slice(0, 160) : '';
  const extraitTrouve = extrait.length > 25 ? page.texte.includes(extrait) : undefined;
  return {
    ...base,
    etat: cle ? 'valide' : 'incoherente',
    detail: cle ? page.detail : `${page.detail} ; organisation introuvable dans la page`,
    cle_trouvee: cle ?? undefined,
    extrait_trouve: extraitTrouve,
    source_contenu: page.source,
  };
}

async function principal(): Promise<void> {
  const brut = await readFile(corpusPath, 'utf8');
  const lignes: Ligne[] = brut.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
    try {
      return JSON.parse(l) as Ligne;
    } catch (erreur) {
      throw new Error(`ligne ${i + 1} : JSON invalide (${(erreur as Error).message})`);
    }
  });

  console.log(`Corpus : ${corpusPath}`);
  console.log(`${lignes.length} lignes à vérifier (concurrence ${CONCURRENCY})...\n`);

  const resultats: Resultat[] = new Array(lignes.length);
  let suivant = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (suivant < lignes.length) {
      const index = suivant++;
      resultats[index] = await verifier(lignes[index]!, index + 1);
      const r = resultats[index]!;
      console.log(`${String(index + 1).padStart(2)} ${r.etat.padEnd(11)} ${r.cle_trouvee ?? r.detail.slice(0, 90)} — ${r.organisation.slice(0, 55)}`);
    }
  }));

  const comptes = { valide: 0, incoherente: 0, morte: 0 };
  for (const r of resultats) comptes[r.etat]++;
  const total = resultats.length || 1;
  const pourcent = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  console.log('\n=== Résultat ===');
  console.log(`URL valides       : ${comptes.valide}/${resultats.length} (${pourcent(comptes.valide)})`);
  console.log(`URL mortes        : ${comptes.morte}/${resultats.length} (${pourcent(comptes.morte)})`);
  console.log(`URL incohérentes  : ${comptes.incoherente}/${resultats.length} (${pourcent(comptes.incoherente)})`);
  const parSource: Record<string, number> = {};
  for (const r of resultats) parSource[r.source_contenu] = (parSource[r.source_contenu] ?? 0) + 1;
  console.log(`Contenu lu        : ${JSON.stringify(parSource)}`);
  const anomalies = resultats.filter((r) => r.etat !== 'valide');
  if (anomalies.length) {
    console.log('\nAnomalies :');
    for (const r of anomalies) console.log(`  #${r.ligne} [${r.etat}] ${r.url}\n      ${r.detail}`);
  }
  if (jsonPath) {
    await writeFile(jsonPath, JSON.stringify({
      corpus: corpusPath,
      date: new Date().toISOString(),
      totaux: comptes,
      taux_validite: comptes.valide / total,
      resultats,
    }, null, 2) + '\n');
    console.log(`\nDétail JSON : ${jsonPath}`);
  }
  if (anomalies.length) process.exitCode = 1;
}

principal().catch((erreur) => {
  console.error(String(erreur));
  process.exitCode = 2;
});
