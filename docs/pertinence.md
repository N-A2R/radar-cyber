# Pertinence cyber — filtre configurable et score par événement

Le radar ingère des flux cyber et de la presse générale. Le filtre de pertinence
décide de ce qui entre ; le score dit à quel point un événement est cyber. Les
deux viennent du **même moteur**, `apps/api/src/collectors/pertinence.ts`, sans
aucune dépendance npm, sans appel réseau et sans requête SQL par item.

## Ce qui est livré

| Besoin | Réponse |
|---|---|
| Détecter la langue | `detectLanguage` / `languageVerdict` dans `collectors/filter.ts`, voir [docs/detection-langue.md](detection-langue.md) |
| Configurer le filtre | `RADAR_CYBER_KEYWORDS`, `RADAR_CYBER_EXCLUSIONS`, `RADAR_CYBER_MIN_SCORE`, voir ci-dessous |
| Scorer un événement | `event.pertinence_score` (0–10) et `event.pertinence_rule`, migration 049 ; score aussi dans `event.evidence.pertinence` et dans l'API `/events` (`pertinenceScore`, `pertinenceRule`) |
| Comprendre un rejet | `evaluatePertinence()` rend `reason`, `matches` (terme + champ + poids) et `exclusion` |
| Mesurer la qualité | `scripts/mesure-pertinence.mts` sur 100 items réels gelés, résultats ci-dessous |
| Tester | `apps/api/test/pertinence.test.ts` : 30 textes attendus + configuration, seuils, états vides |

## Configuration

Aucune variable n'est obligatoire. Une valeur vide, invalide ou excessive
n'interrompt jamais la collecte : elle est ignorée et signalée dans
`RelevanceConfig.warnings`, affichés en début de run par `runGenericSources`.

| Variable | Défaut | Effet |
|---|---|---|
| `RADAR_CYBER_KEYWORDS` | vide | Termes **ajoutés** au lexique intégré, séparés par des virgules. Un terme ajouté pèse 2. Les doublons (casse/accents) sont fusionnés. |
| `RADAR_CYBER_EXCLUSIONS` | vide | Phrases qui annulent un score **faible** si elles apparaissent dans le titre ou le résumé. |
| `RADAR_CYBER_MIN_SCORE` | `2` | Seuil d'admission, entier de 1 à 10. Hors bornes ou non numérique → 2 avec avertissement. |

Plafonds : 64 termes ajoutés et 64 exclusions, 80 caractères par terme. Au-delà,
le terme est ignoré avec un avertissement — un fichier `.env` recopié 10 000
fois ne doit pas devenir un déni de service.

## Score

| Poids | Exemples | Rôle |
|---|---|---|
| 4 | cyberattaque, ransomware, CVE-, vulnérabilité, breach, exploit, malware, phishing, intrusion, piratage, DDoS | Cyber certain : admis seul |
| 2 | cyber, cybersécurité, cybercriminalité, faille, ANSSI, données personnelles, threat actor | Contexte technique : admis seul au seuil 2 |
| 1 | attaque(s), menace(s), virus, sécurité, incident, hacker | Ambigu : jamais admis seul, **ne s'additionne pas** avec un autre terme ambigu |

Règles de calcul :

1. Le meilleur poids compte ; les autres signaux de poids ≥ 2 ajoutent au plus
   1 point chacun, dans une limite de 3. Deux termes faibles (« menace » +
   « attaque ») restent à 1 : l'actualité géopolitique n'est pas un incident
   cyber.
2. Un terme trouvé **dans le résumé** perd un point (plancher 1) ; dans l'URL,
   il plafonne à 1 (l'URL porte surtout le nom du média). Le titre porte le
   poids plein. Les pluriels simples français et anglais sont tolérés
   (`cyberattaques`, `failles`), les codes comme `CVE-` sont des préfixes.
3. Organisation nommée ou domaine/asset cité : +3. Le domaine du flux lui-même
   est exclu (`ignoreDomains`) : un article de *Sud Ouest* ne passe pas parce
   que l'org « Sud Ouest » figure dans son URL.
4. CVE avec EPSS au-dessus du seuil : +3 et `rule='epss'` ; département ou
   préfecture de la région cité : +2 et `rule='dept'`. Ces deux règles ne sont
   plus des contournements : elles montent le score au même titre que les mots.
5. Score borné à 10. `reason` vaut `excluded`, `org`, `epss`, `dept`, `keyword`
   ou `none`, par ordre de priorité. Une organisation trouvée par le gazetteer
   mais absente de l'index de pertinence admet aussi l'item et lui donne le
   même score plancher qu'une organisation indexée.
6. Une exclusion ne neutralise qu'un score < 4 : « virus hivernaux » est
   rejeté, « ransomware dans un hôpital, virus hivernaux en parallèle » reste
   admis.

## Branchement

- `collectors/generic.ts` charge la configuration **une fois par run**, évalue
  chaque item narratif (titre + résumé + URL) et n'applique la porte qu'aux
  sources `relevance != 'strict'`. Les sources cyber-natives sont scorées mais
  jamais rejetées par ce filtre.
- Les trois autres points d'écriture (`routes/ingest.ts`, `server.ts`,
  `quarantine/promote.ts`) calculent le score avec `scoreEventPertinence()` :
  aucun événement admis ne reste sans score.
- `isRelevant()` reste disponible pour les scripts d'audit (`audit-filter.mts`) ;
  il délègue au moteur et garde ses motifs historiques `keyword`/`org`/`none`.
- `db/migrate-049-event-pertinence.sql` ajoute les colonnes et des contraintes
  `CHECK`. Les lignes antérieures restent NULL : on n'invente pas de score
  rétroactif.
- Cas d'erreur : titre absent, résumé nul, item `null`, configuration vide ou
  invalide → verdict `none`, score 0, jamais d'exception. Une source vide ou
  304 reste un run `ok` avec zéro item, pas un filtre qui « rejette tout ».

## Mesure — 100 items réels (21/11/2026)

**Protocole.** Corpus gelé dans `bench/pertinence/corpus-100.json` : 100 titres
réels extraits de la table `event` (sources `gn-*`, `presse-*`, `eco-*`),
sélection déterministe par `md5(id || graine)`, 70 items cyber explicites et
30 items non cyber étiquetés à la lecture du titre seul, sans consulter le
score. Aucun item synthétique. Les négatifs sont volontairement « tentants » :
« virus mortel pour les lièvres », « menace d'un couteau », « attaques de loup »,
« l'Iran menace… des attaques ». Les titres sont figés dans le corpus ; le
rejeu ne lit ni la base ni le réseau.

**Commande** : `apps/api/node_modules/.bin/tsx scripts/mesure-pertinence.mts`
(.option `--json=…` pour figer un résultat). Le script vérifie lui-même la
taille et les étiquettes du corpus et échoue si le jeu est corrompu.

| Résultat | Valeur |
|---|---|
| Matrice | TP=69, FP=0, TN=30, FN=1 |
| **Taux de faux positifs** | **0,0 % (0/30)** |
| Précision | 100,0 % (69/69) |
| Rappel | 98,6 % (69/70) |
| Contrefactuel seuil 1 (« présence d'un mot ») | 53,3 % (16/30) |

Le seul manque est un titre où l'incident est décrit par « attaquée
numériquement » et « piratée » sans terme du lexique. Le contrefactuel montre
que le corpus n'est pas trivial : l'ancienne règle admettrait 16 des 30 items
non cyber.

**Limites.** La population cyber est déjà passée par l'ancienne porte : la
mesure estime le taux de faux positifs *parmi du contenu retenu*, pas le rappel
sur un flux brut de presse générale. Les étiquettes portent sur le titre seul ;
le moteur de production lit aussi le résumé et l'URL. Les 30 textes du test
unitaire couvrent les cas limites (configuration, exclusions, états vides)
que cet échantillon réel ne contient pas.
