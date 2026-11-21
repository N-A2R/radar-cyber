# Plan : Vague 3 — fermer ce que la nuit a laissé ouvert

> Suite directe du rapport `docs/rapport-nuit-na-2026-11-21.md`. La nuit a
> construit le socle : 191 sources, 12/12 départements avec au moins 2 sources,
> rattachement assaini, vue web, collecte continue. Elle a laissé cinq choses
> ouvertes, et c'est elles qu'on ferme.
>
> Usage : outil personnel. Ce qui compte, c'est que ça serve chaque matin et que
> ce soit vrai.

## Baseline mesurée au départ (2026-11-21)

| Mesure | Valeur | Source |
|---|---|---|
| Sources activées | 191 | `SELECT count(*) FROM source WHERE enabled` |
| Événements NA | 29 | jointure `event` × `org` sur les 12 depts |
| Départements à zéro | 40, 47, 23, 19 | audit de nuit |
| Sources muettes (toutes) | 101 | `na-audit-2026-11-21.json` |
| Sources NA muettes | 13 (dont 10 nouvelles) | idem |
| Entités vague 2 restantes | 149 sur 169 | `manques-glm-vague2.json` |
| Propositions ≥ 0,5 à revue | 4 (BUILD, AMAROK, SCI CHEVRON, GROUPE ALTERNANCE) | rapport de nuit |

## Doctrine

Rien de faux, rien de lisible à moitié, rien de payant, mesure publiable. Un
SIREN non vérifié n'est pas publié. Un chiffre sans requête n'est pas écrit. Un
extrait se copie, il ne se reformule pas. Une source muette se documente avec
son motif — elle ne se maquille pas avec du vide.

## Validation Commands

- `pnpm typecheck`
- `bash scripts/verify-all.sh`
- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar`

## Task 1: Les 4 départements vides — sources d'incident, pas de généralistes

Le rapport est clair : à 40, 47, 23 et 19, la collecte tourne (68-90 items/7 j)
mais ce sont des fils généralistes, **aucun incident cyber n'y passe**.

- [ ] Lister, pour chacun des 4 départements, les sources qui **publient des
      faits divers cyber** (presse locale : Sud Ouest édition Landes et
      Lot-et-Garonne, La Montagne Corrèze et Creuse) — vérifier par fetch réel
      qu'elles publient bien des items, et lesquels
- [ ] Chercher les sources **institutionnelles** qui publient des incidents :
      préfectures, ARS, collectivités, CCI, journaux municipaux
- [ ] Si aucune source ne couvre le cyber dans un département : l'écrire dans
      l'audit avec la liste des sources testées et leur verdict
- [ ] Commit : `feat(sources): sources d'incident pour les 4 départements vides`

**Critère :** pour chacun des 4, soit un flux qui publie réellement des
incidents, soit la preuve écrite qu'il n'en existe pas de gratuit.

## Task 2: Les 101 sources muettes — triage en profondeur

- [ ] `scripts/source-health.mts --json` → classer les 101 muettes
- [ ] Par lots de 25 : fetch réel, motif (`parse-casse` / `vide-legitime` /
      `format-change` / `bloque-externe`), et **pour les `parse-casse`, la
      réparation du parser** avec preuve avant/après
- [ ] Une source morte depuis > 30 j se désactive (journalisée), elle ne reste
      pas « active et vide »
- [ ] Publier `bench/results/sources-muettes-vague3.json`
- [ ] Commit par lot

**Critère :** chaque muette a un motif écrit ; au moins 5 `parse-casse` réparées
avec preuve, ou la démonstration qu'il n'y en a pas.

## Task 3: Les 149 entités de la vague 2

La méthode est réutilisable : `tsx scripts/lot-reprise-na.mts --lot=N`.

- [ ] Reprendre les lots restants, un commit par lot
- [ ] Les 4 entités en arbitrage humain (ch-sf.fr, Chu De Rennes, coteg-azam.fr,
      homonymies du lot 1) : trancher avec preuve, ou documenter le doute
- [ ] Publier le taux global final dans `manques-glm-vague2.json`
- [ ] Commit par lot + un commit de clôture

**Critère :** `cohorte.traitees == 199`, taux publié et arithmétiquement vérifiable.

## Task 4: Les 4 propositions de rattachement à revue

BUILD, AMAROK, SCI CHEVRON, GROUPE ALTERNANCE — le classificateur les propose à
≥ 0,5 sans trancher.

- [ ] Pour chacune : vérifier l'identité réelle (site, mentions légales,
      registre), dire si le rattachement est **juste ou faux**, avec la preuve
- [ ] Si juste : la promouvoir et journaliser
- [ ] Si faux : documenter pourquoi, et envisager une règle qui l'aurait évitée
      (jeton, domaine, ville) — sans casser les rattachements valides existants
- [ ] Commit : `mesure(na): les 4 propositions de rattachement tranchées`

## Task 5: `gn-ransom-aquitaine` — mort ou vivant ?

Le flux a produit **0 item en 7 jours**.

- [ ] Vérifier la source à la main (URL, HTTP, contenu, date du dernier item)
- [ ] Si la série est morte : la désactiver, journaliser, et chercher un
      remplaçant équivalent gratuit
- [ ] Si elle vit mais que le parser ne voit rien : réparer et prouver
- [ ] Commit : `fix(sources): gn-ransom-aquitaine vérifiée`

## Task 6: La vue web — un cran plus loin

La vue NA existe (carte, filtre `?naDept=`, état vide, 18 contrôles).

- [ ] Sur un département : le **fil d'événements** doit être lisible et
      honnête (source, date, organisation, famille)
- [ ] Un indicateur de **fraîcheur** : « dernière collecte il y a X », par source
      ou par département
- [ ] Cliquer une organisation doit mener à sa fiche, sans perdre le filtre
- [ ] Tests `test:na` étendus, `verify-all.sh` vert

**Critère :** un parcours complet département → événement → organisation tient
dans les tests.

## Task 7: Collecte continue — prouver qu'elle tourne

- [ ] Vérifier `radar-api.service` et `radar-report.timer` en état `active`
- [ ] Mesurer sur 24 h : passages de collecte, items nouveaux, erreurs
- [ ] Un échec de source ne doit pas arrêter les autres : le prouver (ou le
      corriger)
- [ ] Commit : `docs(ops): état de la collecte continue, mesuré`

## Task 8: Rapport

- [ ] `docs/rapport-vague3-2026-11-21.md` : baseline, ce qui a bougé, chiffres
      avant/après, ce qui reste ouvert et pourquoi
- [ ] `pnpm typecheck` + `bash scripts/verify-all.sh`, corriger si rouge
- [ ] `git status` propre (hors `AGENTS.md`, `.claude/`)
- [ ] Commit : `docs(mission): rapport vague 3 publié`

## Arrêt

Huit tâches. Écrire `MISSION-COMPLETE` quand elles sont cochées ou explicitement
documentées comme impossibles. Ne pas enchaîner sans plan écrit.
