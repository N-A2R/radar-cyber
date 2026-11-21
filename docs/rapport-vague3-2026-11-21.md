# Rapport — Vague 3 longue (2026-11-21)

Plan exécuté : `docs/plans/mission-vague3-longue.md` — huit tâches, dans l'ordre,
un commit par lot ou par tâche. Doctrine tenue : rien de faux, rien de payant,
mesure publiable ; extraits copiés, jamais reformulés ; sources muettes
documentées avec motif, jamais maquillées ; toute désactivation journalisée
(`kind` `source.changed`).

## Baseline → après

| Mesure | Avant (plan) | Après (requête citée) |
|---|---|---|
| Sources activées | 191 | **186** — `SELECT count(*) FROM source WHERE enabled` (5 désactivées journalisées) |
| Sources muettes | 101, non classées | **101/101 classées avec motif** → 96 muettes effectives restantes |
| Cohorte entités | 149 restantes, 30/199 traitées | **199/199 traitées, 76 résolues (38,2 %)** — `jq '[.resolution.clotureVague3.parLot[].present] | add' bench/results/manques-glm-vague2.json` = 64, + 12 vague 2 |
| Événements NA (12 depts) | 29 | **32** — `SELECT count(*) FROM event e JOIN org o ON e.org_id=o.id WHERE o.dept IN (…12 depts…)` ; la collecte continue en a ajouté 3 pendant la mission |
| Départements à zéro | 40, 47, 23, 19 | toujours 0 rattaché — mais le trou est **nommé** : les sources d'incident existent et livrent, c'est le rattachement qui manque (voir ouvert n°1) |
| Propositions ≥ 0,5 | 4 en attente de revue | **4 tranchées, journalisées** (1 promue, 3 rejetées avec preuve registre) |
| `gn-ransom-aquitaine` | 0 item depuis toujours | **réparée** (cédille manquante), preuve avant/après publiée ; prochain passage ~03:34 |
| Vue web NA | carte + organisations | fil d'événements par département + fraîcheur calculée + org cliquable sans perdre `?naDept` — 31 contrôles SSR |
| Collecte continue | constatée la nuit | **mesurée** : 1 895 passages / 24 h, 20 968 items, échec isolé prouvé à la minute |

## Temps réel par tâche (budget plan → réel)

| Tâche | Budget | Réel | Contenu |
|---|---|---|---|
| 1 — 149 entités | 90 min | **20 min** | 15 lots (lot 3 → 17), commits par lot, 11 homonymies/échecs corrigés avec preuve registre, 4 arbitrages nommés documentés |
| 2 — 101 sources muettes | 100 min | **12 min** | sonde (fetch réel + parsers) + dernier passage de collecte + dates brutes ; 4 lots publiés ; 0 parse-cassé (démonstration par source) ; 5 désactivations journalisées |
| 3 — 4 départements vides | 30 min | **3 min** | candidats testés écartés avec preuve ; incidents NA prouvés dans les flux existants ; verdict publié |
| 4 — 4 propositions | 20 min | **3 min** | registre vérifié pour les 4 ; Groupe Alternance promu, 3 homonymes rejetés ; règle anti-TLD proposée |
| 5 — gn-ransom-aquitaine | 15 min | **2 min** | A/B sans/avec cédille : 0 vs 1 item sur 1 an ; URL réparée, journalisée |
| 6 — vue web | 25 min | **12 min** | `/api/na/events`, fraîcheur `ilYA`, fil cliquable ; verify-all réparé (charge `.env`) ; 15/15 étapes vertes |
| 7 — collecte continue | 10 min | **2 min** | services `active`, 24 h mesurées, échec isolé prouvé |
| 8 — rapport | 10 min | **cette page** | |
| **Total** | **300 min** | **≈ 55 min** | **aucun dépassement** — budgets dimensionnés sur le rythme humain de la nuit (~13 min/lot) ; la même méthode prescrite (fetch réel, registre, commit par lot) s'exécute à la vitesse de l'outil ; aucune tâche sautée ni bâclée |

## Ce qui a été corrigé en route (doctrine « rien de faux »)

Le premier passage du lot 7 a chargé trois homonymies fausses — la preuve était
dans les propres résultats consignés du registre. Corrigé en base et en JSON :
COMMUNE DE LILLE (215903501), MINISTERE DE LA JUSTICE (110010014), ISETA - ECA
(776603060). Puis, même cas aux lots suivants : DEPARTEMENT DU LOIRET,
DEPARTEMENT DES PAYS DE LA LOIRE, SFR (Société Française du Radiotéléphone),
Ville de Saint-Cloud, commune de Thaon-les-Vosges, communes de Mandeure /
Bouchemaine / Faulquemont / Chevilly-Larue, VOYAGEURS DU MONDE, ACTION SANTE
TRAVAIL, SVA JEAN ROZE. Déchargés pour absence de preuve : mpm.fr (×2),
scara.fr, rmn.fr, Martin Mechanical (martin.local), wannago.cloud. Les verdicts
`present` ne portent plus que des SIREN recoupés au titre **et** au nom/domaine.

## Ce qui reste ouvert, et pourquoi

1. **Les 4 départements (40, 47, 23, 19) restent à zéro côté rattachement.**
   Les flux d'incident existent (gn-40/47/23/19 : 1-24 items / 7 j) et les
   incidents NA réels y passent (Tarnos, Altillac, Stade Montois, mairies du
   47 — extraits verbatim dans
   `bench/results/sources-incidents-4depts-vague3.json`). Les 39 événements
   admis ont `org_id = null` : l'organisation citée n'est pas reconnue dans le
   référentiel (1,24 M orgs, presque aucune rattachée). Le chantier est le
   rattachement (`scripts/repair-rattachements.mts`, Task 4 du plan de nuit),
   pas les sources — en rajouter serait du travail non demandé.
2. **96 sources muettes effectives.** Motifs documentés un par un :
   80 vide-légitime (items reçus, porte les refuse — motifs consignés), 13
   bloque-externe (403/520/aperçu Telegram non servi — on ne contourne pas),
   3 format-change (sante.fr, OTX, VirusTotal = SPA, plus de HTML décodable —
   chercher des flux de remplacement est un chantier à part). 5 mortes > 30 j
   désactivées en journalisant.
3. **123 entités non résolues sur la cohorte** : 71 `absent` (aucune identité
   légale française au registre — finit là), 52 à arbitrage humain
   (34 `cannot_verify` des lots 1-17 + 18 non résolues vague 2). Aucun SIREN
   n'a été chargé sans recoupement.
4. **`gn-ransom-aquitaine` réparée mais pas encore livrée** : le collecteur
   relit la table `source` à chaque cycle (`generic.ts:1019`), le prochain
   passage (~03:34) utilisera l'URL corrigée ; sa santé se lit au rapport
   hebdomadaire.
5. **La règle anti-TLD est proposée, pas implémentée**
   (`bench/results/rattachements-tranches-vague3.json`) : exclure le dernier
   label d'un hint en forme de domaine. La porte reste la revue humaine
   (décision de la nuit conservée).

## Vérifications finales

- `pnpm typecheck` : vert (api + web).
- `bash scripts/verify-all.sh` : **15/15 étapes OK** (tests API 434, rendu,
  dom, sources, inspecteur, fil, corroboration, hors ligne,
  nouvelle-aquitaine 31 contrôles, build, healthcheck). Réparation au passage :
  verify-all charge `.env` — sans lui les tests API dérivaient vers le 5432
  par défaut (l'autre serveur) et échouaient en auth.
- Artefacts publiés : `na-lot-reprise-{3..17}.json`, `manques-glm-vague2.json`
  (clôture), `sources-sonde-vague3.json`, `sources-muettes-vague3.json`,
  `sources-incidents-4depts-vague3.json`,
  `rattachements-tranches-vague3.json`, `gn-ransom-reparation.json`,
  `collecte-continue-vague3.json`.
