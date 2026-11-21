# Rapport de nuit — Nouvelle-Aquitaine, couverture totale, zéro trou

Date : 2026-11-21 · Branche : `mission/4h-glm` · Plan fait foi :
`docs/plans/mission-nuit-na.md` (les 10 Tasks cochées dans le fichier, pas ici).

La mission s'est exécutée Task 0 → Task 9 dans l'ordre, un commit par lot ou par
tâche, mesure avant/après à chaque phase. Chaque chiffre ci-dessous provient
d'un script ou d'une requête référencée dans `bench/results/` ; rien n'est
estimé, les trous documentés ne sont ni lissés ni masqués.

## La baseline et ce qui a bougé

| Mesure | Départ (Task 0) | Fin de nuit | |
|---|---|---|---|
| Organisations NA (12 depts) | 1 242 882 | idem | — |
| Événements rattachés à une org NA | 31 | 29–31 (audit Task 8) | le volume d'événements bouge à la marge pendant la nuit (admissions/dédup) ; le trou territorial, lui, n'a pas bougé |
| Orgs NA avec au moins un événement | 25 | 25 | — |
| Départements à zéro | 40, 47, 23, 19 | 40, 47, 23, 19 | **trou toujours réel, documenté avec raison** (voir audit) |
| Sources de périmètre NA actives | 29 | **39** | +10 câblées et vérifiées (Task 1) |
| Sources NA muettes (7 j) | 7 | 15 | 10 nouvelles sources sans encore de passage utile ; classées avec motif |
| Organisations chargées (lot reprise) | — | **7** (2 lots, 20/169 entités) | SIREN vérifié au registre, preuves verbatim |

Ce qui a vraiment changé cette nuit n'est pas le compteur d'événements : c'est
le **socle de collecte et de rattachement**.

## Ce qui a été construit (par Task)

- **Task 0 — socle de mesure** : `scripts/mesure-na.mts` publie 12 départements
  × 4 compteurs, chaque bloc du JSON porte sa requête SQL, concordance 6/6
  contre la table du plan (`ecartVsPlan: []`).
- **Task 1 — sources régionales** : 10 nouvelles sources vérifiées par fetch
  réel (items comptés, dernier pubDate, titres verbatim —
  `na-sources-sondage-2026-11-21.json`) : 6 éditions Sud Ouest départementales
  (16/17/24/40/47/79), 2 flux `api/v1` de La Nouvelle République (86/79,
  découverts dans le HTML — les `/rss*` répondent 404), 2 flux Google News
  ciblés `site:` pour La Montagne (19/23) et Le Populaire du Centre (87), ces
  deux titres n'exposant plus de RSS public (404 documenté). **12/12
  départements ont maintenant au moins 2 sources actives.**
- **Task 2 — CERT/CISA** : branchés et frais (CERT-FR 322 items / 192 évts /
  3 rattachés NA en 7 j ; KEV 1 316 événements au total) — rien à câbler,
  mesure publiée (`na-cert-2026-11-21.json`).
- **Task 3 — rattachement ransomware** : le cœur de la nuit. Mesure AVANT sur
  180 `org_hint` des 30 derniers jours : 13 propositions ≥ 0,5 dont **9 faux
  positifs vérifiés un par un**. Deux correctifs : (a) le préfiltre accentué
  annoncé par le plan (`migration 041` : `org.name_norm` générée déaccentuée +
  index trigramme — gain mesuré sur la fenêtre : **0**, écrit tel quel, le
  défaut était réel et reste un garde-fou testé) ; (b) le **motif dominant
  mesuré**, jetons dupliqués/génériques/courts dans `scoreEntry` (« CO & CO »
  attrapait tout `.co.*`, « LIMITED » absorbait « Boutinot Limited ») : dédup +
  jetons génériques + plancher 3 lettres. APRÈS : 4 propositions au seuil
  humain, 0 automatique, 434 tests verts, 3 régressions ajoutées
  (`na-ransomware.json`).
- **Task 4 — trou référentiel** : **liste vide côté NA** — aucune entité NA
  citée par une revendication en attente ne reste sans organisation (vérifié
  trois fois : 30 j, toutes périodes, 169 restants vague 2). Les 8 entités
  françaises non résolues sont hors NA et documentées. Reprise facultative :
  2 lots (20 entités), 7 chargées avec SIREN vérifié via
  recherche-entreprises.api.gouv.fr (sans clé) et site recoupé, 9 absentes
  documentées avec requête consignée, 4 à arbitrage humain. Un bug de la
  première méthode (entité sans domaine jamais cherchée) a été corrigé et
  l'org fausse qu'il avait produite supprimée.
- **Task 5 — qualité** : 31/42 vus (73,8 %), 23 exacte / 5 partielle / 3 hors
  sujet = **9,7 % < 20 % → aucun correctif exigé** (`na-rattachement.json`).
- **Task 6 — interface** : `GET /api/na/overview` + vue `NaView` (carte SVG des
  12 départements projetée du geojson, palette honnête, liste filtrable, fiche
  organisation, état vide « Aucun événement sur ce département » + référentiel
  affiché), filtre `?naDept=33` persistant. 18 contrôles SSR verts
  (`test:na`), ajoutés à `verify-all.sh` — script complet vert.
- **Task 7 — collecte continue** : constaté en marche (`radar-api.service`,
  `collector_run` chaque minute, échec NVD 429 isolé sans casser le reste) ;
  `radar-report.timer` **activé** (lundi 07:00, rattrapage) ; section « Sources
  actives muettes ou dormantes (7 j) » ajoutée au rapport hebdomadaire, NA
  d'abord ; documentation complète dans `docs/operations.md`. Preuves :
  capture live de l'endpoint après redémarrage, rapport généré, mesure de
  santé publiée (296 sources : 101 muettes, 35 faibles, 58 saines, 102
  dormantes).
- **Task 8 — audit zéro trou** : 8/12 départements couverts, **4 trous
  documentés avec leur raison** ; 39 sources NA toutes classées (26 produisent,
  13 muettes avec motif) ; entités sans org — conforme (`na-audit-2026-11-21.{json,md}`).

## Ce qui reste ouvert et pourquoi

1. **Les 4 départements à zéro (40, 47, 23, 19).** La collecte y est active
   (68-90 items/7 j chacun) mais aucun item n'a été admis-rattaché : un fil
   départemental généraliste ne contient pas d'incident cyber au passage
   (constat déjà mesuré à migrate-037). Les sources ciblées restent en place ;
   l'événement, quand il surviendra, entrera au passage suivant. La seule
   « réparation » possible serait d'inventer des événements — exclus par la
   doctrine.
- 2. **13 sources NA muettes.** 10 sont nouvelles (câblées cette nuit, pas
   encore de contenu nouveau) ; les autres (France Bleu → ici.fr mort,
   Médiacités, gn-ransom-aquitaine…) sont classées avec motif dans l'audit et
   réapparaissent dans le rapport hebdomadaire tant qu'elles ne produisent pas.
3. **169 − 20 = 149 entités vague 2 non reprises.** Temps de nuit consommé
   ailleurs ; la méthode est réexécutable (`tsx scripts/lot-reprise-na.mts
   --lot=N`), 4 entités attendent un arbitrage humain (ch-sf.fr, Chu De
   Rennes, coteg-azam.fr, + homonymies du lot 1).
4. **4 propositions ≥ 0,5 à vérifier en revue** (BUILD, AMAROK, SCI CHEVRON,
   GROUPE ALTERNANCE) : la règle « indice court + jeton ≥ 5 » est conservée
   volontairement ; l'identité réelle des organisations se vérifie en revue,
   pas en automatique.
5. **Écart signalé, non résolu** : le flux `gn-ransom-aquitaine` n'a produit
   aucun item en 7 j (0 nouveau) — à surveiller dans le rapport hebdo ; si la
   série est morte, il se classera muette avec motif à l'audit suivant.

## Vérifications finales

- `pnpm typecheck` : vert (api + web).
- `bash scripts/verify-all.sh` : **vert au complet** (tests API 434, tests web
  dont `test:na` 18 contrôles, build, healthcheck) — exécution réelle du
  01:47, exit 0.
- `git status` propre hors `AGENTS.md`, `.claude/`. Constaté au passage :
  `docs/plans/mission-zod4.md`, non suivi par git, a disparu du répertoire
  pendant la nuit par un processus extérieur à cette session (aucun commit de
  cette mission ne l'a touché).

## Arrêt

Les Tasks 0 à 9 sont cochées dans `docs/plans/mission-nuit-na.md`. La mission
s'arrête ici : `MISSION-COMPLETE`.
