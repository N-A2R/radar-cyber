# Chantier : Couverture — rattacher les sigles, importer le registre, outiller la revue

> Suite directe de `docs/rapport-regles-branchees.md`. Les règles rendent la
> machine juste (83 % sur ce qu'elle écrit) mais muette : **220 indices en file,
> 0 rattaché**. Objectif : **remonter la couverture sans retomber dans le faux**.

## Le choix de l'utilisateur (arbitrages figés)

| Sujet | Décision |
|---|---|
| Sigles | Rattacher **seulement si le registre le confirme sans ambiguïté** (SIREN + dénomination compatible) |
| Priorité | **Couverture** — quitte à descendre vers ~60 % de précision |
| Revue | **File de revue dans l'interface web** (accepter/refuser en un clic, preuve affichée) |
| Périmètre | **Nouvelle-Aquitaine** |
| Référentiel | **Import du registre complet** (SIRENE) pour ne plus avoir d'absence |
| Durée | **3 nuits** |
| Critère de réussite | **« X % des 220 indices rattachés à la bonne organisation, mesuré sur échantillon frais »** |

## Baseline mesurée (2026-11-21)

| Mesure | Valeur | Source |
|---|---|---|
| Indices en file | **220** | file `quarantine_raw` pending |
| Rattachables, moteur livré (`off`) | 16 | `precision-branchement.json` |
| Rattachables, règles actives (`on`) | **0** | idem (refus : sigle 14, homonyme 2) |
| Précision, règles on (proportionnel) | 13,8 % · couverture 16,6 % | idem |
| Organisations en base | 1 244 106 | `/api/stats` |
| Entités non résolues | 71 absentes · 34 à revoir | `manques-glm-vague2.json` |

## Budget et quota — à lire avant de lancer

Le plan ZCode finit le **23/11 à 02:00**. Au débit mesuré (85,5 M/h), **90 M
restants = ~1 h de travail actif**. Trois nuits demandent ~250 M : **le chantier
ne tiendra pas cette nuit**. Il est donc découpé pour que chaque session laisse
un état propre et reprenable :

- session 1 (aujourd'hui) : **S1 + S2** — l'import et la règle des sigles, avec
  mesure ;
- session 2 : **S3** — la file de revue web ;
- session 3 : **S4 + S5** — mesure finale sur échantillon frais et rapport.

Garde-fou : sous **40 M** restants, terminer la tâche en cours, écrire
`docs/rapport-couverture-partiel.md`, committer, s'arrêter.

## Règles

Verdict sans preuve = pas de verdict. Une baisse de précision se publie. Un refus
écrit **quelle règle** l'a posé. Aucune correction de test pour faire passer la
CI. Aucun chiffre de couverture sans le dénominateur.

---

## S1 — L'import du registre (Nouvelle-Aquitaine)

- [ ] **S1.1** Inventorier ce qui existe (`scripts/import-sirene*.mts`,
      `import-entreprises-na.mts`) et mesurer l'écart avec la base actuelle
- [ ] **S1.2** Importer les établissements NA du registre, de façon **idempotente**
      et rejouable : nouvelles organisations, alias, villes, départements
- [ ] **S1.3** Vérifier après import : combien d'organisations NA, combien
      d'aliases, et **combien des 71 entités absentes sont désormais présentes**
- [ ] **S1.4** Commit : `feat(referentiel): import registre NA — X entités absentes couvertes`

**Critère :** une requête qui montre les 71 absentes avant/après.

## S2 — La règle des sigles (registre confirmé)

- [ ] **S2.1** Écrire la règle : un indice de type **sigle** est rattaché si et
      seulement si le registre renvoie **une** organisation dont la dénomination
      est compatible (sigle contenu dans la dénomination, ou alias officiel)
- [ ] **S2.2** Tester la règle sur le jeu d'or (50 pièges) : aucun piège ne doit
      passer
- [ ] **S2.3** Mesurer sur la file réelle des 220 : combien rattachés, avec
      quelle distribution de confiance
- [ ] **S2.4** Mesurer sur le corpus gelé et le frais : précision **et** couverture
      avant/après, publier `bench/results/precision-sigles.json`
- [ ] **S2.5** Commit : `feat(precision): les sigles confirmés au registre sont rattachés`

**Critère :** la couverture réelle remonte au-dessus de 0 avec une précision
publiée, et le jeu d'or reste vert.

## S3 — La file de revue dans le web

- [ ] **S3.1** `GET /api/review/queue` : les indices non rattachés, avec l'indice,
      les candidats proposés, leur score et la règle de refus
- [ ] **S3.2** Vue de revue : accepter / refuser en un clic, la preuve (registre,
      site) affichée à côté, rien d'autre à l'écran
- [ ] **S3.3** Chaque décision humaine est journalisée (`kind` dédié) et sort la
      file : accepter crée le rattachement, refuser le classe définitivement
- [ ] **S3.4** Tests front (`test:review`) + `verify-all.sh` vert
- [ ] **S3.5** Commit : `feat(web): file de revue des rattachements non résolus`

**Critère :** un parcours complet testé : indice → candidat → décision → journal.

## S4 — La mesure de couverture finale

- [ ] **S4.1** Sur un **échantillon frais** de 200 indices réels (graine neuve) :
      rattachés, justes, faux, refusés — verdicts avec preuve
- [ ] **S4.2** Publier `bench/results/couverture-finale.json` : le taux de
      réussite **et** son intervalle de confiance
- [ ] **S4.3** Comparer à la baseline (0/220) et au frais précédent (16,6 %)

## S5 — Rapport

- [ ] **S5.1** `docs/rapport-couverture.md` : avant/après, ce que l'import a
      apporté, ce que la règle sigle a coûté en précision, ce qui reste en revue
- [ ] **S5.2** `pnpm typecheck` + `bash scripts/verify-all.sh`, `git status` propre
- [ ] **S5.3** Marquer le chantier terminé dans `bench/state/chantier-couverture.json`

## Arrêt

`WAVE-COMPLETE` quand S5.3 est fait et la vérification verte. Sinon, à chaque fin
de session : état commité, dernier commit qui dit où on en est, `SESSION-END`.
