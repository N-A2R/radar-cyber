# Référentiel territorial Nouvelle-Aquitaine — chantier 1

**Livré le 2026-11-12.** Premier des six gros chantiers, celui qui débloque les
autres. Construit **sans export de la base du porteur et sans accès réseau aux
sites institutionnels** : npm et GitHub suffisent.

---

## 1. Ce qui est chargé

| Niveau | Entités | SIREN | Géocodées |
| --- | ---: | ---: | ---: |
| Communes | **4 293** | 4 293 | 4 293 |
| EPCI | **156** | 156 | 156 |
| Départements | **12** | 0 | 12 |
| Région | **1** | 0 | 1 |
| **Total** | **4 462** | 4 449 | **4 462** |

**22 904 alias** dérivés. **224 communes déléguées ou associées** rattachées en
alias de leur commune parente, au lieu de devenir des organisations fantômes
sans SIREN.

Communes par département : 16:359 · 17:462 · 19:277 · 23:255 · 24:503 · 33:534 ·
40:327 · 47:319 · 64:545 · 79:252 · 86:265 · 87:195.

Les 13 sans SIREN sont les 12 départements et la région : le jeu source ne le
fournit pas, **aucun identifiant n'a été inventé**.

## 2. Provenance

| Source | Licence | Apport |
| --- | --- | --- |
| `@etalab/decoupage-administratif@6.0.0` (npm) | MIT | communes, EPCI, départements, région, SIREN, codes postaux, population, appartenances |
| `codes-postaux@4.1.2` (npm) | MIT | recoupement postal indépendant : **4 304 communes** retrouvées par leur code INSEE |
| `gregoiredavid/france-geojson` | **Licence Ouverte 1.0** (Admin Express / IGN) | contours des 12 départements → centroïdes |

La licence du troisième dépôt est absente du champ `license` de GitHub, mais
**explicitement déclarée dans son README**. Vérifié avant usage, pas supposé.

**Géocodage** : centroïde géométrique de l'anneau extérieur du plus grand
polygone (formule du lacet). Contours simplifiés → précision communale, **pas
adresse**. EPCI et région : centroïde pondéré par la population des membres.

## 3. Deux pièges trouvés dans les données

**77 codes INSEE en doublon.** Le fichier source contient 4 594 lignes pour
4 517 codes : 77 communes apparaissent deux fois, une ligne `commune-actuelle`
(porteuse du SIREN, de la population, des codes postaux) et une ligne
`commune-deleguee` du même code. Un dédoublonnage naïf par dictionnaire garde la
dernière et **perd le SIREN de 77 communes**. Le générateur préfère
explicitement la ligne actuelle.

**EPCI à cheval.** Quatre intercommunalités débordent la région
(Haute-Corrèze Communauté, Pays Foyen, Castillon/Pujols, Pays de Saint Yrieix).
Leur département est laissé vide plutôt que d'affirmer un rattachement faux ;
chacune produit un avertissement.

## 4. Mesures à l'échelle réelle

Banc : `bench/referentiel/probe-match.mts`, résultats bruts
`bench/results/NA-match.json`. On balaie **les 4 293 communes**, pas un
échantillon choisi.

| Formulation testée | Rattachement correct | Abstention | **Erreur** | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| « La mairie de X a été visée… » | **4 033 (93,9 %)** | 260 | **0** | 0,033 ms | 0,065 ms |
| « La ville de X annonce… » | 4 033 (93,9 %) | 254 | **0** | 0,030 ms | 0,058 ms |
| « Un incident à la commune de X » | 4 033 (93,9 %) | 260 | **0** | 0,024 ms | 0,049 ms |
| « La mairie de X indique que… » | 4 033 (93,9 %) | 260 | **0** | 0,029 ms | 0,053 ms |

- **Index** : 22 088 clés, construit en **91 ms**.
- **Les 260 abstentions sont les 111 noms communaux homonymes** (247 communes
  concernées, plus quelques cas voisins). Le moteur expose les candidats à
  égalité au lieu de deviner. **Zéro mauvaise organisation sur 17 172 décisions.**
- Vérifié en base avec le vrai moteur (`matchOrgDetailed`) : premier appel
  179 ms (construction de l'index depuis Postgres), suivants **0,1 à 0,4 ms**.
- « Le conseil départemental de la Gironde », « Bordeaux Métropole »,
  « la région Nouvelle-Aquitaine » se rattachent correctement.
- « La mairie de Mazerolles » → **aucun rattachement, motif `ambiguous`**. C'est
  le comportement voulu : cinq communes portent ce nom.

**Depuis le 2026-11-22**, la même mesure avec le département cité donne
**4 293/4 293 rattachements corrects, 0 erreur, 0 abstention**, dont
**247/247 communes homonymes** (`bench/results/NA-homonymes-c7.json`). Le
cœur de rattachement en ligne (`match/core.ts`) porte désormais le département
de chaque organisation et ne l'utilise que s'il départage un unique candidat
à égalité ; sans indice, l'abstention reste la règle.

**Ce que ce banc ne dit pas** : il mesure le rattachement d'une formulation
synthétique propre, pas le rappel sur de vrais articles. Il ne prouve rien sur
le bruit de la presse réelle.

## 5. Chargement

```bash
# Sans base : valide le jeu et affiche le plan (à mettre en CI)
tsx scripts/load-referentiel-na.mts --plan-only

# Dry-run : compare au contenu réel de la base
DATABASE_URL=... tsx scripts/load-referentiel-na.mts

# Écrit
DATABASE_URL=... tsx scripts/load-referentiel-na.mts --apply
```

Mesuré : **4 462 organisations et 22 904 alias en 3,6 s**. Rejeu immédiat :
**0 création, 0 alias inséré**. Idempotence vérifiée à l'échelle réelle, pas
seulement en test.

Trois règles de sécurité, chacune couverte par un test en base :

1. **SIREN d'abord.** Une organisation existante avec le même SIREN est
   complétée, pas dupliquée sous un autre slug.
2. **Le travail humain est conservé.** Un nom corrigé par un analyste survit au
   rechargement. Seuls les champs vides sont remplis, et la géométrie rafraîchie.
3. **Aucune fusion sur le seul nom.** Les collisions avec des données
   extérieures sont **signalées**, pas fusionnées — le bench A a montré ce que
   coûte une fusion sur homonyme. Les 111 homonymes internes au jeu sont
   comptés séparément, ils sont attendus.

**Aucune migration.** Seules des colonnes déjà présentes sont utilisées
(`siren`, `geo_source` viennent des migrations existantes).

## 6. Fichiers

| Fichier | Rôle |
| --- | --- |
| `db/data/referentiel-na.json` | **Jeu versionné**, 1,1 Mo. Un déploiement neuf n'a besoin ni de réseau ni de Python. |
| `bench/referentiel/build_na.py` | Générateur (stdlib seule), à relancer quand le découpage change. |
| `apps/api/src/referentiel/model.ts` | Types du jeu, provenance incluse. |
| `apps/api/src/referentiel/aliases.ts` | Dérivation des noms et alias, pure. |
| `apps/api/src/referentiel/plan.ts` | Jeu → organisations + alias, sans base. |
| `apps/api/src/referentiel/load.ts` | Écriture idempotente et non destructive. |
| `scripts/load-referentiel-na.mts` | CLI dry-run / apply / plan-only. |
| `bench/referentiel/probe-match.mts` | Banc de rattachement à l'échelle réelle. |

## 7. Limites assumées

- **Périmètre territorial seulement.** Ni entreprises (SIRENE), ni santé
  (FINESS), ni scolaire (UAI). L'objectif « référentiel exhaustif NA » n'est
  **pas atteint** : il manque les personnes morales économiques et sanitaires,
  qui exigent un export ou un jeu officiel.
- **Homonymes résolus seulement avec un indice explicite (2026-11-22).**
  Ancien état : 111 noms communaux ambigus sans contexte, le moteur s'abstenait.
  SUPERSEDED on 2026-11-22 → le département cité dans le texte départage les
  247 communes concernées (247/247) ; sans département, l'abstention est
  conservée. Une revue humaine reste nécessaire pour les textes sans indice.
- **Centroïdes, pas adresses.** Suffisant pour la carte et le tri territorial,
  insuffisant pour de la géolocalisation fine.
- **Pas de sites web ni de domaines.** Le jeu ne les fournit pas ; ils viendront
  de l'étage « surface d'attaque », pas d'une invention.

## 8. Vérifications

- `apps/api/test/referentiel-plan.test.ts` : **14/14**, sans base.
- `apps/api/test/referentiel-load.test.ts` : **4/4**, en base.
- Suite API complète : **122/122**.
- Typecheck API : 0 erreur.
OBJECTIF : atteint — 247/247 communes homonymes NA désambiguïées / 247 communes homonymes
