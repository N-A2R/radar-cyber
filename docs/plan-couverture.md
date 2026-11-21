# Plan d'action couverture — ordonné par impact

> Établi le **2026-11-21** à partir des motifs d'absence mesurés par
> `scripts/mesure-couverture.mts` et retranscrits dans
> `docs/couverture-mesuree.md`. Une action = **un chantier** avec un critère de
> sortie mesurable. Aucun gain n'est compté sans son dénominateur, aucune heure
> n'est comptée sans son régime (`docs/planification.md`).

## 1. La base mesurée

Mesure du **2026-11-21**, fenêtre `2025-11-01 → 2026-10-31`, corpus de 60
incidents dont **42 dans la fenêtre**, **4 480 organisations en base** au moment
du re-jeu. Source : `docs/couverture-mesuree.md` (console + JSON du script).

| Lecture | Résultat | Dénominateur |
| --- | --- | --- |
| Couverture brute | **28 / 42 (66,7 %)** | 42 incidents de la fenêtre |
| Rattachements défendables | **26 / 42 (61,9 %)** | idem (exactes + partielles) |
| Rattachements exacts | **21 / 42 (50,0 %)** | idem |

**Un point de couverture = 1 incident de la fenêtre correctement désigné =
1 / 42 = 2,38 points de pourcentage.** Les gains ci-dessous sont donnés en
incidents et en points de pourcentage, sur la lecture que chaque chantier
déplace.

| Motif mesuré | Incidents | Actionnable ? |
| --- | ---: | --- |
| `pas_rattache` · `absent_du_referentiel` | **14** | oui — chantier A1 |
| `vu` · `partielle` | **5** | oui — chantier A2 |
| `vu` · `hors_sujet` | **2** | oui — chantier A3 |
| `pas_admis` | **0** | non — aucun refus à la porte |
| `hors_fenetre` | 18 | non — hors dénominateur |
| `vu` · `exacte` | 21 | déjà acquis |

Deux motifs structurels sont à lire avec le chantier A1, sans être additionnés
à ses points : le référentiel utilisé affiche **0 ligne** en agroalimentaire,
industrie, construction et commerce, et `docs/manques-referentiel.md` recense
**500 entités nommées absentes** (199 en France, 301 sans indice de zone) ;
par voie de chargement : `sirene` 6, `annuaire-administratif` 9, `manuel` 485.

**Le taux dépend de l'état de la base.** Le même corpus rejoué sur un état plus
riche a donné 24/42, 27/42 puis 31/42 le 15 novembre
(`bench/results/couverture-2026-11-15-post-vague1.json`,
`bench/results/couverture-2026-11-15.json`,
`bench/results/couverture-2026-11-15-post-vague2.json`), avec
11 → 9 → 5 absents du référentiel : une passe a déjà repris 2 à 4 absents.
Le plafond arithmétique de A1 est donc +14 points ; le gain d'une passe au rythme
observé est de **+3 à +4 points**. C'est le re-jeu, pas le plafond, qui fait foi.

## 2. Barème de coût

Budget en **heures de travail humain**, régime déclaré (`docs/planification.md`) :

| Brique | Coût retenu | Origine du calibrage |
| --- | --- | --- |
| Décision jugée avec preuve | 1,5 min / cas | `docs/plans/wave-precision.md` S1 (500 verdicts = 12 h) |
| Identification d'une entité (registre + site + preuve + chargement) | 5 min / cas | même famille de travail, périmètre plus large |
| Import / règle avec tests | 2 h | `docs/plans/wave-regles.md` S1–S3 (3 h + 2 h) |
| Mesure avant/après et publication JSON | 1 h scripté | idem, S2 (2 h) |
| Rapport nominatif | 0,5 h jugé | idem, S4 (1 h), rapport joint ici à la mesure |

Règle de calibration obligatoire (`docs/planification.md`) : pour tout chantier
**jugé**, traiter les **5 premiers cas**, écrire le rythme observé et la
projection avant de continuer. Si le rythme dérive de plus de 30 %, le dire dans
le critère de sortie plutôt que d'ajuster le chiffre.

## 3. Le plan, ordonné par impact

Classement par **gain d'exactitude** (lecture la plus exigeante : 21/42 aujourd'hui),
qui départage les chantiers ne déplaçant pas la couverture brute. Le ratio est
calculé sur le gain pertinent de chaque ligne.

| # | Chantier | Motif traité | Gain brut | Gain défendable | Gain exact | Coût | Points / h |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| **A1** | Combler le référentiel des 14 absents | `absent_du_referentiel` × 14 | **+14** (66,7 → 100 %) | +14 (61,9 → 95,2 %) | **+14** (50,0 → 83,3 %) | **5 h** | **2,8** |
| **A2** | Transformer 5 rattachements partiels en exacts | `partielle` × 5 | 0 | 0 | **+5** (50,0 → 61,9 %) | **3,5 h** | **1,4** |
| **A3** | Éliminer 2 rattachements hors sujet | `hors_sujet` × 2 | 0 | **+2** (61,9 → 66,7 %) | **+2** (50,0 → 54,8 %) | **3 h** | **0,7** |
| P0 | Publier le JSON de référence du 21/11 | — | 0 | 0 | 0 | 0,5 h | — |
| | **Total** | **21 motifs** | **+14** | **+16** | **+21** | **12 h** | |

P0 est un préalable, pas un chantier d'impact : il rend la baseline rejouable.
Les trois chantiers sont indépendants et peuvent être menés dans l'ordre ci-dessus ;
chacun se clôt par un re-jeu publié avec son dénominateur.

---

## P0 — Publier la mesure de référence

- Rejouer `pnpm mesure:couverture -- --json=bench/results/couverture-2026-11-21.json`.
- Le JSON doit porter `dateMesure: "2026-11-21"`, `couverture.vus: 28`,
  `couverture.total: 42`, `couverture.qualite: {exacte: 21, partielle: 5,
  hors_sujet: 2}`, `couverture.causes: {absent_du_referentiel: 14,
  au_referentiel_mais_non_reconnu: 0}` et `organisationsEnBase: 4480`.

**Critère de sortie :** le JSON est commité et sa relecture redonne exactement
les chiffres de `docs/couverture-mesuree.md`. Si un chiffre diffère, la baseline
est corrigée au propre avant tout chantier — on ne planifie pas sur un fantôme.

## A1 — Combler le référentiel des 14 absents · 5 h · +14 points (plafond)

**Motif :** les 14 incidents `pas_rattache · absent_du_referentiel` de la mesure
du 21/11 (Ymed, EHPAD Champdeniers, Fédération Nationale des Chasseurs, Fédération
Française de Cyclisme, Delicity, SDIS des Landes, Institut Bergonié, Rectorat de
Poitiers, Bordeaux Métropole, Ministère de l'Intérieur, Vivaticket, Cerballiance,
Cegedim Santé, Cdiscount). C'est **un tiers de la fenêtre** et la première cause
d'absence mesurée.

**Décomposition du budget :** 14 entités × 5 min = 1,2 h de jugement (arrondi à
1,5 h avec la calibration) + 2 h d'import idempotent organisations/alias + 1 h de
re-jeu et publication + 0,5 h de rapport.

1. **A1.1 — Calibration.** Traiter Ymed, Delicity, Vivaticket, Cerballiance et
   Cdiscount ; écrire le rythme mesuré dans `bench/state/plan-couverture.json`.
2. **A1.2 — Verdicts nominatifs.** Pour chacune des 14 entités : site → mentions
   légales → registre (`recherche-entreprises.api.gouv.fr`) → extrait verbatim.
   Trois tentatives maximum, puis `irreductible` avec la requête consignée.
   Aucun SIREN inventé, aucun rattachement forcé (`docs/manques-referentiel.md`).
3. **A1.3 — Chargement.** Organisations, alias, villes, départements et secteurs
   par voie déclarée (`sirene` / `annuaire-administratif` / `manuel`) ;
   idempotence vérifiée par re-jeu ; chaque écriture journalisée.
4. **A1.4 — Re-jeu.** `pnpm mesure:couverture -- --json=bench/results/couverture-apres-A1.json`.

**Critère de sortie :** les 14 incidents ont un verdict nominatif dans le JSON de
chantier (`charge` avec SIREN et preuve, ou `irreductible` avec requête), la
couverture brute est **≥ 31/42** (rythme observé d'une passe, pas le plafond) et
`couverture.causes.absent_du_referentiel ≤ 11`, publiés avec le dénominateur 42.
Si un verdict `irreductible` contredit une mesure antérieure qui avait vu
l'entité (24 → 27 → 31/42 le 15/11), l'écart est documenté avant clôture.

## A2 — Transformer 5 rattachements partiels en exacts · 3,5 h · +5 points d'exactitude

**Motif :** 5 incidents `vu · partielle` (na-013 Béarn/Soule, na-027 UNSS,
na-033 Deux-Sèvres, na-034 Dordogne, na-036 Vienne). Ils sont déjà comptés
comme vus et défendables : ce chantier ne rapporte **aucun point de couverture
brute**, il ne déplace que la lecture exacte (21 → 26/42). Le dire, c'est éviter
de vendre une amélioration de qualité comme un gain de couverture.

1. **A2.1 — Calibration.** Les 2 premiers cas, puis projection des 3 restants.
2. **A2.2 — Diagnostic.** Pour chaque cas, distinguer « bonne enseigne, mauvais
   établissement » d'un vrai défaut de désignation ; la règle
   `qualiteRattachement` de `scripts/mesure-couverture.mts` sert de référence,
   elle n'est pas assouplie pour faire passer le chantier.
3. **A2.3 — Correctif.** Alias d'établissement ou désignation plus fine dans le
   référentiel, avec test de régression nominatif par incident.
4. **A2.4 — Re-jeu.** `bench/results/couverture-apres-A2.json`.

**Critère de sortie :** `couverture.qualite.exacte ≥ 26`, `partielle ≤ 0` sur ces
5 identifiants, et `couverture.vus = 28` / `vusDefendables = 26` **inchangés**.
Si la couverture brute ou défendable baisse, le correctif est retiré — un gain
d'exactitude ne s'achète pas contre le taux principal.

## A3 — Éliminer 2 rattachements hors sujet · 3 h · +2 points défendables

**Motif :** 2 incidents `vu · hors_sujet` (na-026 Réseau Alumni de Bordeaux,
na-044 FFRandonnée). Ils gonflent le 66,7 % brut : la couverture défendable
n'est que de 61,9 %. Gain brut nul, gain défendable +2 (26 → 28/42).

1. **A3.1 — Verdicts.** Pour les 2 cas, rétablir le bon organisme ou refuser la
   proposition ; preuve registre + site, comme dans la vague précision.
2. **A3.2 — Garde-fou.** Reconstituer le refus par une règle existante de
   `apps/api/src/match/regles-precision.ts` (homonyme, sigle, TLD) plutôt que par
   une exception nominative ; le jeu d'or 50 pièges reste vert
   (`tsx scripts/precision-gold.mts --verifier`).
3. **A3.3 — Re-jeu.** `bench/results/couverture-apres-A3.json`.

**Critère de sortie :** `couverture.qualite.hors_sujet = 0` et
`couverture.vusDefendables ≥ 28`, jeu d'or 50/50, aucun rattachement juste cassé
sur l'échantillon frais de précision. Si la règle coûte plus de 2 points
d'exactitude ailleurs, elle est retirée et les 2 cas restent en revue humaine.

## Chantier conditionnel — organisations présentes mais non reconnues

La mesure du 15/11 publiait **6** cas `au_referentiel_mais_non_reconnu`
(`bench/results/couverture-2026-11-15.json`) ; celle du 21/11 en publie **0**.
Ce motif n'existe donc que sur un état de base plus riche : il n'entre pas dans
le classement ci-dessus, qui porte sur la mesure du 21/11.

**Gain conditionnel :** +6 points au plus (21 → 27 vus sur la base du 15/11),
0 point sur la base du 21/11. **Coût :** 3 h jugé (règle sigle/mono-jeton, déjà
amorcée par S2 de `docs/plans/chantier-couverture.md`). **Critère de sortie :**
rejouer la mesure sur les deux états de base et publier les deux chiffres ;
l'action est déclarée no-op sur celui où le motif vaut 0.

## 4. Ce que ce plan ne traite pas

- **`pas_admis = 0`** : la porte d'admission ne refuse aucun incident du corpus.
  C'est un garde-fou, pas un chantier. Toute apparition de `pas_admis` lors d'un
  re-jeu ouvre une mesure séparée avant la clôture du chantier en cours.
- **18 `hors_fenetre`** : conservés comme contexte, exclus du dénominateur. Les
  compter reviendrait à baisser le taux sans rien apprendre sur le radar.
- **Les 4 secteurs à zéro ligne** : trouvés sur l'instantané
  (`docs/referentiel-trou.md`) et partiellement comblés ailleurs (7 436
  entreprises importées le 14/11, `docs/mesure-couverture.md`). Leur remplissage
  est la voie de chargement de A1, pas un gain distinct : additionner les deux
  compterait deux fois les mêmes incidents.
- **La file des 220 indices** (`docs/rapport-regles-branchees.md` : 0 rattaché
  avec les règles actives, refus 1-sigle 14 et 2-homonyme 2) a un dénominateur
  différent (220, pas 42). Ses points ne sont pas comparables à ceux de ce plan
  ; elle reste couverte par `docs/plans/chantier-couverture.md`.
- **Le délai** : `delaiJours` vaut `null` pour les 60 incidents. Ce plan mesure
  la capacité à désigner un incident publié, pas la vitesse de collecte
  (`docs/mesure-couverture.md`, section « Le délai »).

## 5. Garde-fous et reprise

- Un verdict sans preuve n'existe pas. Un SIREN non recoupé n'est pas chargé.
- Aucun chiffre sans dénominateur : toute publication porte `/ 42` et la date
  de mesure.
- Aucune correction de test pour faire passer un chantier ; une régression sur
  le jeu d'or ou sur l'échantillon frais annule le correctif.
- Un gain de qualité ne compense jamais une baisse de couverture brute : les
  trois lectures sont publiées côte à côte, comme dans le script de mesure.
- Reprise par état : `bench/state/plan-couverture.json` (créé à P0) porte
  l'étape courante, le rythme mesuré des cas jugés, le verdict des 14 entités et
  le commit de clôture de chaque chantier. À chaque fin de session : état
  commité, prochaine action explicite.

## Reproductible

```bash
pnpm mesure:couverture
pnpm mesure:couverture -- --json=bench/results/couverture-apres-A1.json
tsx scripts/precision-gold.mts --verifier
```

Corpus : `bench/fixtures/corpus-reference-na.json` (versionné). Baseline :
`docs/couverture-mesuree.md` (console du 2026-11-21). Règles de planification :
`docs/planification.md`. Chantier du flux : `docs/plans/chantier-couverture.md`.
