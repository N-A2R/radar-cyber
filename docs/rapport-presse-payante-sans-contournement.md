# Rapport — Presse payante sans contournement (21 novembre 2026)

Branche : `ext/chantier-b6`. Périmètre : les douze départements de Nouvelle-Aquitaine
(16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87). Ce rapport est rédigé en français ;
le code, les scripts et l'interface en ligne de commande sont en anglais.

## 1. Résultat chiffré

**17 flux de titres publics intégrés** (sur 17 flux vérifiés), contre **13 avant**
l'intervention. La mesure est reproductible et archivée dans
`bench/results/public-title-feeds.json` :

```
integratedFeeds: 17        corpusFeeds: 17        eligibleFeeds: 17
paywalledPublisherFeeds: 15    googleNewsFallbackFeeds: 2
registeredPublicTitleSourceRows: 4
```

Aucun chiffre cible n'était écrit dans le dépôt, ni dans une issue ou une PR
(exécution de l'étape 0 : aucune PR ni aucun commit portant sur ce chantier).
L'objectif chiffré retenu est donc la couverture intégrale du corpus figé des
flux de titres publics vérifiés : **17/17**. Il est mesuré, pas déclaré.

## 2. État réel de départ

Mesuré en lecture seule sur la base PostgreSQL locale (port 5433) avant toute écriture :

| Compteur | Énoncé de mission | Observé au départ | Requête |
|---|---:|---:|---|
| Organisations | 1 673 151 | 1 673 221 | `SELECT count(*) FROM org;` |
| Sources | 312 | 418 | `SELECT count(*) FROM source;` |
| Événements | ~28 000 | 27 882 | `SELECT count(*) FROM event;` |
| Flux publics intégrés | — | 13 | script de mesure ci-dessous |

L'écart avec l'énoncé reflète l'état live : plusieurs chantiers parallèles ont
continué à charger le référentiel et les sources. Le point de départ réel est
donc 13 flux intégrés, pas 0 : 13 des 17 URL du corpus étaient déjà présentes
dans `source` (Sud Ouest et déclinaisons, Charente Libre, La Nouvelle
République). Le travail a consisté à compléter et à rendre la mesure auditable,
sans créer de doublon.

## 3. Définition de la mesure

Un flux compte comme **intégré** quand trois conditions sont réunies :

1. l'entrée du corpus `bench/corpus/quotidiens.jsonl` est éligible : tous ses
   départements appartiennent aux douze départements de Nouvelle-Aquitaine,
   sa parade déclare l'exploitation des seules métadonnées RSS, et sa preuve de
   chargement est datée du 21/11/2026 avec HTTP 200 et au moins un item ;
2. une ligne `source` **activée** porte exactement la même URL de flux ;
3. le rapprochement se fait sur l'URL normalisée, ce qui évite les doublons
   dus à un slash final.

Le dénominateur est le corpus figé de 17 flux (15 flux éditeur payants + 2
flux de repli Google News filtrés par site), dont chaque ligne porte une preuve
de chargement réelle obtenue le 21/11/2026. Aucun appel réseau n'est fait par
la mesure : elle ne rejoue pas de téléchargement et ne peut donc pas gonfler le
chiffre avec des URL mortes.

## 4. Méthode, en trois étapes testables

1. **Registre et garde-fous** — `apps/api/src/press/public-title-feeds.ts`
   parse le corpus, refuse tout département hors région, toute parade qui ne
   limite pas l'usage aux métadonnées, et toute preuve de chargement absente ou
   non datée. Une entrée rejetée fait échouer l'intégration avant toute écriture.
2. **Intégration idempotente** — `scripts/integrate-public-title-feeds.mts`
   lit les URL des sources activées, calcule le plan, puis insère uniquement les
   flux manquants dans une transaction, avec `ON CONFLICT (id) DO NOTHING`.
   Quatre lignes ont été créées : `public-title:na-quotidien-012`, `-015`,
   `-016`, `-017`. Les 13 flux déjà présents n'ont pas été modifiés ni dupliqués.
   Les nouvelles lignes sont `family='presse'`, `kind='narrative'`,
   `format='rss'`, `relevance='context'` (source grise assumée) et portent dans
   `parser` la politique `metadata-only` avec la date de vérification.
3. **Mesure reproductible** — `scripts/measure-public-title-feeds.mts` produit
   le JSON archivé. Un second passage de l'intégration en `--dry-run` annonce
   `alreadyIntegrated: 17, inserted: 0` : l'opération est stable.

Le diff de `apps/api/src/server.ts` est de **0 ligne** : l'intégration est un
chargement de sources, aucun chemin HTTP ni tâche de collecte n'a été modifié.

## 5. Tests

`apps/api/test/public-title-feeds.test.ts` — **11 tests, un comportement par test**,
tous verts (`tsx test/run.ts test/public-title-feeds.test.ts`, base éphémère) :
lecture des 17 flux, rejet d'un département hors région, rejet d'une parade non
métadonnée, exigence d'une preuve datée et HTTP 200, colonnes exactes d'une
ligne source, comptage conditionné à une source activée, absence de doublon,
plan des quatre flux manquants et idempotence, flux éditeurs payants sans
contournement, replis Google News filtrés par site, absence de corps d'article
et de donnée de victime. Le typecheck du paquet API passe également.

## 6. Commandes reproductibles

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
TSX=apps/api/node_modules/.bin/tsx

# État avant (archive le chiffre 13)
$TSX scripts/integrate-public-title-feeds.mts --dry-run \
  --out=bench/results/public-title-feeds-baseline.json

# Intégration idempotente
$TSX scripts/integrate-public-title-feeds.mts \
  --out=bench/results/public-title-feeds-integration.json

# Mesure (lecture seule) — écrit le chiffre 17
$TSX scripts/measure-public-title-feeds.mts \
  --out=bench/results/public-title-feeds.json
```

Durées observées : 1,35 s pour les quatre commandes chaînées (intégration,
mesure et deux contrôles), 3,8 s pour les 11 tests, 12,4 s pour le typecheck.
Aucune commande ne dépasse 60 s.

## 7. Contraintes

- **Nouvelle-Aquitaine uniquement** : les douze départements sont vérifiés un à
  un ; un flux couvrant un département extérieur est refusé.
- **Sources grises autorisées** : les 17 flux sont en `relevance='context'` ;
  les deux replis Google News sont des flux d'agrégation documentés comme tels.
- **Aucune donnée personnelle de victime** : seules des métadonnées de flux
  (nom du titre, URL, date de vérification) sont écrites ; aucun titre d'article,
  extrait, corps ou nom de personne n'est stocké par ce chantier.
- **Aucun service payant** : zéro appel réseau dans le code ajouté ; le corpus
  figé et la base locale suffisent. Aucun contournement de paywall : les articles
  derrière abonnement ne sont pas téléchargés, seules les métadonnées RSS
  publiques sont exploitées.
- **Code et interface en anglais, rapport en français** : respecté.
- **Diff de `server.ts` ≤ 10 lignes** : 0 ligne.
- **Aucune commande de plus de 60 s** : respecté, durées ci-dessus.

## 8. Limites

- Le chiffre mesure des **flux intégrés**, pas des événements produits ni des
  articles payants lus : ce sont deux objets distincts et aucune confusion
  n'est faite ici.
- Treize flux existaient déjà par URL ; ils n'ont pas été réécrits pour porter
  le marqueur `public-title:`. La mesure s'appuie donc sur le corpus figé comme
  registre, et non sur un préfixe d'identifiant en base.
- Les deux flux Google News renvoient des URL d'agrégateur, pas des URL
  d'article d'éditeur ; ils sont comptés comme flux publics de titres, pas comme
  source de texte intégral.

**CHANTIER TERMINÉ — 17 flux de titres publics intégrés, mesurés et reproductibles.**
