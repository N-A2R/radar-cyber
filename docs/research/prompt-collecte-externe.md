# Prompt de collecte externe

*Ce document est un prompt. Transmets-le tel quel à un assistant disposant d'un
accès internet et d'un accès en écriture au dépôt GitHub. Il n'a pas besoin de
comprendre le projet : tout ce dont il a besoin est écrit ici.*

*Un validateur est fourni dans le dépôt (`scripts/validate-external-data.mts`).
Il vérifie la structure, les SIREN, les codes INSEE et les dates. Il tourne avec
Node seul, sans installation.*

---

# Mission : collecter des données publiques pour un observatoire cyber régional

Tu travailles pour **radar-cyber**, un outil qui surveille les cyberattaques
visant la région **Nouvelle-Aquitaine** (France). Son environnement de
développement n'a pas d'accès internet : ta collecte est le seul moyen d'obtenir
ces données.

**Dépôt** : `j0ltdevv/radar-cyber`

## Les 4 blocs, par ordre de valeur

| Bloc | Objet | Pourquoi c'est important |
| --- | --- | --- |
| **1** | Corpus d'incidents réels | **Le plus précieux.** Sans lui, on ne sait pas si l'outil voit 10 % ou 80 % des attaques. |
| **2** | Entreprises de la région | Le référentiel ne couvre que les mairies. Les entreprises ne sont pas surveillées. |
| **3** | Santé et enseignement | Hôpitaux et établissements scolaires sont des cibles classiques de rançongiciels. |
| **4** | Sonde des sources | 265 sources sont branchées sans qu'on sache lesquelles rapportent vraiment. |

**Les blocs sont indépendants.** Livrer le bloc 1 seul est plus utile que livrer
les quatre à moitié. Si tu manques de temps, fais les blocs dans l'ordre et
arrête-toi proprement plutôt que de tout bâcler.

## Règles absolues

1. **N'invente jamais une donnée.** Pas de SIREN plausible, pas d'incident
   reconstitué, pas de date approximative présentée comme exacte. Un champ que tu
   ne trouves pas vaut `null`. Une donnée fausse est pire qu'une donnée absente :
   elle sera chargée en base et fera croire à l'outil qu'il couvre un cas qu'il
   ne couvre pas.
2. **Toute affirmation a une source.** URL consultable + date de consultation.
   Pour les incidents : une **citation exacte** de l'article, pas une paraphrase.
3. **Distingue ce qui est établi de ce qui est déclaré.** Une revendication de
   pirate n'est pas un incident confirmé. Le champ `confiance` sert à ça.
4. **Respecte les licences** et note-les. Privilégie les données sous Licence
   Ouverte / Etalab, domaine public, ou les API publiques officielles.
5. **Signale tes échecs.** Une source injoignable, un quota atteint, une
   recherche infructueuse : écris-le dans le compte rendu. Un silence se lit
   comme « rien trouvé », ce qui est une information fausse.
6. **Ne touche à aucun fichier de code.** Tu n'ajoutes que les fichiers listés
   plus bas. Pas de refactorisation, pas de « correction » du code existant.

## Ce qu'il ne faut PAS collecter

- **Aucune donnée personnelle** sur des individus (noms de dirigeants, emails,
  téléphones personnels). On référence des **organisations**, pas des personnes.
- **Aucun contenu de fuite.** Pour une revendication de rançongiciel : le nom de
  la victime, le groupe, la date et l'URL suffisent. Jamais les données volées,
  jamais de copie d'échantillon, jamais d'identifiants.
- **Aucun article payant en entier.** Titre + court extrait (< 400 caractères) +
  URL. Si l'article est derrière un paywall et que tu ne peux pas lire le
  contenu, ne l'utilise pas comme preuve.
- **Aucun secret** (clé d'API, jeton, mot de passe), même trouvé publiquement.

## Périmètre géographique

Nouvelle-Aquitaine, **12 départements** : `16` Charente, `17` Charente-Maritime,
`19` Corrèze, `23` Creuse, `24` Dordogne, `33` Gironde, `40` Landes,
`47` Lot-et-Garonne, `64` Pyrénées-Atlantiques, `79` Deux-Sèvres, `86` Vienne,
`87` Haute-Vienne.

Le dépôt contient déjà `db/data/referentiel-na.json` avec **4 517 codes INSEE**
de communes. **Lis ce fichier** et utilise ces codes : c'est la référence. Un
code commune inventé ou périmé fera échouer la validation.

---

## Bloc 1 — Corpus témoin d'incidents (priorité maximale)

### Ce qu'on cherche

Des **incidents cyber publics ayant touché une organisation de
Nouvelle-Aquitaine**, sur les **12 derniers mois complets** :
**du 2025-11-01 au 2026-10-31**.

Organisations concernées : mairie, intercommunalité, conseil départemental,
hôpital, clinique, EHPAD, école, collège, lycée, université, entreprise,
association, opérateur public.

Types d'incident : rançongiciel, fuite de données, déni de service, défiguration
de site, hameçonnage ciblé, compromission de compte ou de messagerie.

### Où chercher (pistes, à vérifier)

- **Presse régionale** : Sud Ouest, Charente Libre, La République des Pyrénées,
  Le Courrier Français, La Tribune Bordeaux, France 3 Nouvelle-Aquitaine,
  France Bleu (antennes locales), Actu.fr éditions départementales.
- **Presse spécialisée** : Le Monde Informatique, L'Usine Digitale, ZDNet France,
  Next, Cybermalveillance.gouv.fr (actualités).
- **Sources officielles** : CERT-FR (`cert.ssi.gouv.fr`, avis et alertes),
  ANSSI, communiqués des établissements eux-mêmes, délibérations de conseils
  municipaux mentionnant une cyberattaque.
- **Revendications de rançongiciels** : le miroir GitHub
  `joshhighet/ransomwatch` (`posts.json`, Unlicense) contient des titres de
  victimes. **Attention** : les titres ne portent pas le pays. Ne retiens une
  revendication que si tu peux **établir le lien avec la Nouvelle-Aquitaine** par
  une autre source, ou marque-la `confiance: "declare"` en expliquant le doute.
- **Requêtes de moteur de recherche** : « cyberattaque + [ville ou département] »,
  « rançongiciel + hôpital + Nouvelle-Aquitaine », « fuite de données + mairie +
  Gironde », etc. Teste plusieurs formulations, y compris en anglais.

### Format exact

Fichier : **`bench/fixtures/corpus-temoin-na.json`**

```json
{
  "meta": {
    "titre": "Corpus témoin d'incidents cyber publics — Nouvelle-Aquitaine",
    "genereLe": "2026-11-12",
    "producteur": "nom de l'assistant ou du modèle ayant collecté",
    "fenetre": ["2025-11-01", "2026-10-31"],
    "methode": "Comment tu as cherché, en 3 à 6 phrases.",
    "sources": [
      { "nom": "Sud Ouest", "url": "https://www.sudouest.fr", "licence": "Presse — citation courte", "apporte": "incidents sur établissements de santé" }
    ],
    "recherches": [
      { "requete": "cyberattaque mairie Gironde 2026", "moteur": "nom du moteur", "le": "2026-11-12", "resultatsUtiles": 2 }
    ],
    "limites": "Ce que ta méthode ne peut pas voir : sources payantes, incidents non médiatisés, etc.",
    "avertissement": "Les revendications d'attaquants ne sont pas des faits établis."
  },
  "incidents": [
    {
      "id": "na-2026-001",
      "entite": "Nom exact de l'organisation telle que citée",
      "entiteType": "sante",
      "departement": "33",
      "commune": "Bordeaux",
      "codeCommune": "33063",
      "dateIncident": "2026-01-14",
      "datePublique": "2026-01-16",
      "type": "ransomware",
      "resume": "Deux à quatre phrases factuelles : ce qui est rapporté, par qui, et l'impact décrit. Pas de spéculation.",
      "preuve": {
        "url": "https://exemple.fr/article",
        "editeur": "Sud Ouest",
        "titre": "Titre exact de l'article",
        "extrait": "Citation exacte de 1 à 3 phrases, 400 caractères maximum.",
        "consulteLe": "2026-11-12"
      },
      "sourcesAdditionnelles": [
        { "url": "https://autre.fr/article", "editeur": "France 3" }
      ],
      "confiance": "rapporte",
      "verification": "Ce qui est confirmé, ce qui reste incertain. Exemple : l'établissement a confirmé l'attaque, mais ni le volume de données ni le groupe ne sont établis."
    }
  ]
}
```

**Valeurs autorisées** (le validateur les contrôle) :

- `entiteType` : `collectivite` | `sante` | `enseignement` | `entreprise` | `autre`
- `type` : `ransomware` | `fuite` | `ddos` | `defacement` | `phishing` | `compromission` | `autre`
- `confiance` :
  - **`etabli`** — confirmé par l'organisation elle-même, une autorité, ou un
    communiqué officiel ;
  - **`rapporte`** — rapporté par la presse, sans confirmation directe ;
  - **`declare`** — revendiqué par un attaquant, non vérifié.
- `codeCommune` : code INSEE du jeu versionné, ou `null` si tu ne peux pas le
  déterminer. **Ne devine pas.**
- `dateIncident` : `null` si inconnue. `datePublique` est obligatoire : c'est elle
  qui mesure notre délai de détection.
- Toutes les dates au format `AAAA-MM-DD`.

### Objectif de qualité

**40 incidents bien sourcés valent mieux que 400 approximatifs.** Si tu n'en
trouves que 15, livre 15 incidents et explique dans `meta.limites` pourquoi la
moisson est maigre — c'est en soi une information précieuse sur la visibilité
publique des incidents dans la région.

---

## Bloc 2 — Entreprises de Nouvelle-Aquitaine

### Périmètre

Toutes les entreprises de la région représentent des centaines de milliers de
lignes : inutile. On veut les organisations **qu'il serait grave de voir
attaquées**, ou **par lesquelles une attaque peut rebondir** :

1. **Entreprises de 50 salariés et plus**, tous secteurs (tranched d'effectif
   INSEE `21` et au-dessus) ;
2. **Entreprises du numérique et des télécoms**, quelle que soit leur taille :
   NAF `61.xx`, `62.xx`, `63.xx` — ce sont des victimes potentielles et des
   prestataires par lesquels une attaque peut se propager ;
3. **Secteurs critiques**, quelle que soit la taille : énergie (`35`), eau et
   déchets (`36`–`39`), transport (`49`–`53`), santé (`86`), finance et assurance
   (`64`–`66`).

**Si un ensemble dépasse 30 000 enregistrements**, livre les plus gros d'abord
(effectif décroissant) et indique dans le compte rendu le total réel et la
requête exacte pour reproduire la suite.

### Où chercher

- **`recherche-entreprises.api.gouv.fr`** — API publique sans clé. Elle renvoie
  SIREN, nom, NAF, siège (avec commune, code postal, parfois latitude/longitude),
  catégorie d'entreprise, état administratif, et souvent les enseignes et sigles.
  Respecte ses limites de débit : en cas de `429`, ralentis.
- **Base SIRENE** sur `data.gouv.fr` (Licence Ouverte 2.0) si l'API est trop
  lente pour le volume.
- **`api-adresse.data.gouv.fr`** (Base Adresse Nationale) pour les coordonnées
  manquantes, si nécessaire.

### Format exact

Fichier : **`db/data/entreprises-na.json`**

```json
{
  "meta": {
    "titre": "Entreprises de Nouvelle-Aquitaine",
    "genereLe": "2026-11-12",
    "producteur": "…",
    "methode": "API utilisée, filtres appliqués, pagination, tri.",
    "sources": [
      { "nom": "recherche-entreprises.api.gouv.fr", "url": "https://recherche-entreprises.api.gouv.fr", "licence": "Licence Ouverte 2.0", "apporte": "SIREN, NAF, siège, effectif, état" }
    ],
    "compteurs": { "trouves": 0, "livres": 0, "sansCoordonnees": 0, "sansSiteWeb": 0 },
    "limites": "Ce qui manque et pourquoi."
  },
  "entreprises": [
    {
      "siren": "123456782",
      "nom": "Dénomination officielle complète",
      "sigle": null,
      "nomsAlternatifs": ["Nom commercial", "Enseigne"],
      "naf": "62.02A",
      "categorie": "ETI",
      "effectifMin": 250,
      "etat": "actif",
      "dateCreation": "1998-04-01",
      "siege": {
        "adresse": "12 rue Exemple",
        "codePostal": "33000",
        "codeCommune": "33063",
        "commune": "Bordeaux",
        "departement": "33",
        "lat": 44.8412,
        "lon": -0.5806
      },
      "siteWeb": "https://exemple.fr",
      "domaine": "exemple.fr",
      "source": { "nom": "recherche-entreprises.api.gouv.fr", "url": "https://recherche-entreprises.api.gouv.fr/search?...", "consulteLe": "2026-11-12" }
    }
  ]
}
```

**Points de vigilance** :

- `siren` : **9 chiffres, clé de Luhn valide**. Le validateur la recalcule. Ne
  fabrique jamais un numéro.
- `etat` : `actif` ou `cesse`. **N'inclus pas les entreprises cessées.**
- `naf` : format INSEE `62.02A` ou `6202A`, les deux sont acceptés.
- `nomsAlternatifs` : précieux, c'est ce qui permet de reconnaître
  l'entreprise dans un article de presse. Prends les enseignes, noms commerciaux
  et sigles **réellement déclarés**, pas des variantes que tu génères.
- `siteWeb` / `domaine` : souvent absents de SIRENE. Mets `null` plutôt que
  d'inventer un domaine à partir du nom — c'est exactement le genre de donnée
  fausse qui pollue un observatoire.
- `categorie` : `PME` | `ETI` | `GE` | `null`. `effectifMin` : borne basse de la
  tranche INSEE, ou `null`.

---

## Bloc 3 — Santé et enseignement

Deux fichiers, même structure. Ce sont les cibles les plus fréquentes des
rançongiciels en France.

### Santé — `db/data/sante-na.json`

Source : **FINESS** sur `data.gouv.fr` (Licence Ouverte), ou l'annuaire santé
public. Priorité aux établissements de santé publics et privés, EHPAD, centres
de santé. `finess` = **9 chiffres**.

### Enseignement — `db/data/enseignement-na.json`

Source : **Annuaire de l'éducation** (`data.education.gouv.fr`, dataset
`fr-en-annuaire-education`, Licence Ouverte). Il contient le code UAI, le type
d'établissement, la commune et les coordonnées. `uai` = **7 chiffres + 1 lettre
majuscule** (ex. `0330001A`).

### Format commun

```json
{
  "meta": {
    "titre": "Établissements de santé de Nouvelle-Aquitaine",
    "genereLe": "2026-11-12",
    "producteur": "…",
    "methode": "…",
    "sources": [{ "nom": "FINESS", "url": "https://www.data.gouv.fr/...", "licence": "Licence Ouverte 2.0", "apporte": "identifiant, nom, commune, coordonnées" }],
    "compteurs": { "livres": 0 },
    "limites": "…"
  },
  "etablissements": [
    {
      "finess": "330781196",
      "nom": "Centre hospitalier universitaire de Bordeaux",
      "type": "CHU",
      "nomsAlternatifs": ["CHU Bordeaux", "Hôpital Pellegrin"],
      "codeCommune": "33063",
      "commune": "Bordeaux",
      "departement": "33",
      "lat": 44.8283,
      "lon": -0.5764,
      "siteWeb": "https://www.chu-bordeaux.fr",
      "source": { "nom": "FINESS", "url": "https://…", "consulteLe": "2026-11-12" }
    }
  ]
}
```

Pour l'enseignement, remplace `finess` par `uai`. Le champ `type` est libre mais
sois cohérent : `CH`, `CHU`, `clinique`, `EHPAD`, `autre` d'un côté ;
`ecole`, `college`, `lycee`, `universite`, `autre` de l'autre.

---

## Bloc 4 — Sonde des sources

### Ce qu'on cherche

Le dépôt déclare **265 sources** dans `db/sources*.sql` et
`db/darkweb-sources.sql`. On ignore lesquelles sont vivantes, lesquelles
répondent du contenu exploitable, et lesquelles sont mortes.

**Lis ces fichiers SQL**, extrais les identifiants et URL, puis teste chaque URL
**http/https** (saute les `.onion`, inaccessibles sans Tor — signale-les comme
`bloque`).

Pour chacune : code HTTP, type de contenu, nombre d'items si c'est un flux,
date du dernier item, et **2 ou 3 titres réels** en exemple. Les titres sont
essentiels : sans eux, impossible de vérifier que la source parle bien de son
sujet.

### Format exact

Fichier : **`bench/results/sources-probe.json`**

```json
{
  "meta": {
    "titre": "Sonde des sources déclarées",
    "genereLe": "2026-11-12",
    "producteur": "…",
    "methode": "Une requête GET par URL, délai de N secondes, user-agent annoncé.",
    "sources": [{ "nom": "Catalogue du dépôt", "url": "https://github.com/j0ltdevv/radar-cyber", "licence": "Interne", "apporte": "liste des URL testées" }],
    "compteurs": { "testees": 0, "vivantes": 0, "vides": 0, "mortes": 0, "bloquees": 0 },
    "limites": "Un seul passage : une source peut être momentanément indisponible."
  },
  "sources": [
    {
      "id": "presse-sudouest-rss",
      "url": "https://www.sudouest.fr/rss.xml",
      "httpStatus": 200,
      "contentType": "application/rss+xml",
      "format": "rss",
      "itemsVus": 50,
      "dernierItemLe": "2026-11-12",
      "exemplesTitres": ["Titre réel 1", "Titre réel 2"],
      "latenceMs": 340,
      "verdict": "vivant",
      "note": ""
    }
  ]
}
```

`verdict` : **`vivant`** (contenu exploitable) | **`vide`** (répond mais sans
item) | **`mort`** (404, 410, domaine disparu) | **`bloque`** (403, paywall,
.onion, quota). `httpStatus` à `0` si la requête n'aboutit pas.

**Politesse** : espace tes requêtes, annonce un user-agent identifiable, n'insiste
pas sur une URL qui refuse. Ce bloc ne doit pas ressembler à une attaque.

---

## Livraison

### Branche et fichiers

Crée une branche **`data/collecte-externe`** et n'ajoute **que** ces fichiers :

```
bench/fixtures/corpus-temoin-na.json     (bloc 1)
db/data/entreprises-na.json              (bloc 2)
db/data/sante-na.json                    (bloc 3)
db/data/enseignement-na.json             (bloc 3)
bench/results/sources-probe.json         (bloc 4)
docs/research/collecte-externe.md        (compte rendu, obligatoire)
```

JSON **compact** (sans indentation) pour tout fichier dépassant 5 Mo. Pas de
fichier binaire, pas d'archive, pas de capture d'écran. Si le total dépasse
100 Mo, réduis le périmètre et documente la coupe.

### Auto-contrôle avant de livrer

Le dépôt contient un validateur. Lance-le :

```bash
node scripts/validate-external-data.mts
```

Il vérifie la structure, les clés de Luhn des SIREN, les codes INSEE face au jeu
versionné, les formats de date, les URL et les doublons. **Il doit terminer avec
0 erreur.** Il n'a besoin d'aucune dépendance : Node 22.6 ou plus récent suffit
(il exécute le TypeScript directement). Avec un Node plus ancien :

```bash
pnpm install --frozen-lockfile
./apps/api/node_modules/.bin/tsx scripts/validate-external-data.mts
```

S'il reste des erreurs : corrige la donnée, ou retire l'enregistrement douteux et
compte-le dans le compte rendu. **Ne modifie pas le validateur pour le faire
passer.**

### Compte rendu obligatoire

Fichier `docs/research/collecte-externe.md`, en français, avec :

1. **Ce qui a été collecté** : nombre d'enregistrements par bloc, fenêtre
   couverte, date de collecte.
2. **Comment** : sources réellement utilisées, requêtes lancées, filtres,
   pagination, volume écarté.
3. **Ce qui a échoué** : URL injoignables, quotas, sources inexploitables,
   blocs abandonnés et pourquoi.
4. **Licences** : une ligne par source, avec le lien.
5. **Limites de la collecte** : ce que ta méthode ne pouvait structurellement pas
   voir. Pour le corpus d'incidents en particulier : quels types d'incidents
   passent sous le radar de la presse ?
6. **Résultat du validateur** : la sortie finale, copiée telle quelle.

### Puis

Ouvre une pull request vers `master`, titre :
**`données: collecte externe (corpus, entreprises, santé, enseignement, sources)`**,
avec le compte rendu en description. **Ne la fusionne pas** : elle sera relue.

Si tu n'as pas d'accès en écriture au dépôt, produis les fichiers en pièces
jointes en respectant exactement les noms et chemins ci-dessus.

## Critère de réussite

Pas le volume. **La fiabilité.** Celui qui exploitera ces données ne peut pas
aller vérifier tes URL : il te fait confiance. Une seule donnée inventée et
chargée en base fausse durablement les mesures de l'outil.

En cas de doute entre « je livre une valeur plausible » et « je livre `null` en
expliquant », **livre `null`**.
