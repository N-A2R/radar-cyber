# Chantier — domaine vérifié et provenance pour 100 % des organisations de Nouvelle-Aquitaine

Date : 2026-11-21, tranche suivante le 2026-11-22. Branche : `ext/chantier-a1`, reprise depuis `origin/big/DomainesReels` (PR #300).

## État réel observé

La PR #300 avait livré 942 organisations dotées d'un domaine vérifié avec preuve. Son objectif propre est atteint, mais il couvre 0,06 % du périmètre : l'objectif de 100 % du présent chantier ne l'est pas.

Mesure live sur la base `radar` (PostgreSQL, 127.0.0.1:5433), au 2026-11-21 :

| Indicateur | Valeur |
| --- | --- |
| Organisations | 1 673 221 |
| Sources | 376 |
| Événements | 27 882 |
| Organisations de Nouvelle-Aquitaine | 1 671 912 |

Les chiffres du brief (1 673 151 organisations, 312 sources, ~28 000 événements) sont ceux de l'instantané documenté ; l'écart vient d'écritures concurrentes d'autres branches sur la même base.

## Définition retenue pour « domaine vérifié avec provenance »

Une organisation entre dans le numérateur seulement si :

1. elle est en Nouvelle-Aquitaine (départements 16, 17, 18, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87) ;
2. `org.domain` contient une racine de domaine valide ;
3. `org_enrichissement` porte une ligne `champ = 'domaine'` dont la valeur est le même domaine, avec une source non vide et une confiance ≥ 0,8 ;
4. la preuve JSONB porte un statut HTTP 200 et l'URL finale qui redescend sur cette même racine.

Un domaine présent dans `org.domain` sans preuve HTTP n'est donc pas compté.

## Étapes implémentées, une mesure par comportement

1. `scripts/domain-coverage.mts` — métrique reproductible (normalisation, filtre NA, contrôle de provenance, agrégation). 5 tests.
2. `scripts/expand-domains.mts` — lecture d'un export public Wikidata P856 (SIREN, site, QID), appariement strict par SIREN, rejet des hôtes sans racine valide, vérification HTTP (200, même racine, page ≥ 150 caractères, hors parking, jeton distinctif du nom). 6 tests.
3. Écriture transactionnelle `org` + `org_enrichissement`, uniquement avec `--apply` ; aucune donnée d'événement, de victime ou de personne n'est lue ni écrite.
4. `bench/results/domains-from-wikidata.json` — détail des 338 domaines ajoutés avec QID, SIREN, domaine, confiance.
5. Tranche suivante — `scripts/expand-domains-racine.mts` : les candidats Wikidata P856 dont le SIREN n'apparie aucune organisation sont appariés par jeton rare de la racine de domaine, **confirmés par le libellé Wikidata contenu dans le nom de l'organisation**, puis soumis à la même preuve HTTP stricte. Sur 500 paires examinées : 144 confirmées par libellé, 97 vérifiées HTTP et écrites. Le libellé écarte les faux positifs observés sans garde-fou (Vesoul → Saint-Jean-de-Luz, Smictom d'Alsace → Périgord, Kessel GmbH → collège du 47). 6 tests. Détail : `bench/results/domains-from-root-match.json` (et le dry-run `...-dry.json`).

`apps/api/test/domain-coverage.test.ts`, `apps/api/test/expand-domains.test.ts` et `apps/api/test/expand-domains-racine.test.ts` : 17 tests réussis, un comportement par test. Typecheck `tsc --noEmit` des paquets : OK (`pnpm -r typecheck` refuses le `node_modules` symlinké du worktree). `apps/api/src/server.ts` : 0 ligne modifiée.

## Commande reproductible

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée après les deux expansions (`pnpm domaines:etendre -- --limit=1000 --concurrency=48 --apply`, puis `pnpm domaines:etendre-racine -- --limit=500 --concurrency=32 --apply`) :

```
organisations_total=1673220
organisations_nouvelle_aquitaine=1671911
organisations_avec_domaine=1382
organisations_avec_domaine_verifie_et_provenance=1367
couverture_pourcent=0.0818
```

La commande `pnpm domaines:mesurer` rejouée indépendamment après écriture redonne exactement ces chiffres.

## Résultat chiffré

**1 367 organisations sur 1 671 911 ont un domaine vérifié et sa provenance, soit 0,0818 % de la Nouvelle-Aquitaine. Objectif 100 % : NON ATTEINT.**

Progression due à ce chantier : 932 → 1 270 (`wikidata:P856:http200`, +338) puis 1 270 → 1 367 (`wikidata:P856:racine:http200`, +97), soit **435 domaines supplémentaires** tous vérifiés HTTP et tracés. Il reste 1 670 544 organisations sans domaine vérifié (99,918 % du périmètre).

## Limite structurelle — pourquoi 100 % n'est pas atteignable ici

- 1 594 010 organisations viennent de SIRENE (dont 429 025 fermées) et n'ont aucun site dans les jeux publics consultés ; l'API recherche-entreprises renvoie 0 champ site web sur 100 SIREN testés en #300.
- L'export Wikidata exploité ne contient que 14 458 lignes exploitables : la route SIREN a accepté 338 domaines, la route racine confirmée par libellé 97 de plus sur les 500 premières paires. Même en élargissant, le réservoir public restant ne peut couvrir 1,67 M d'organisations ; les appariements sans confirmation de libellé produisent des attributions fausses et ont été rejetés.
- Les autres corpus publics (articles, santé, communes, institutions) plafonnent à ~1 700 candidats au total et sont déjà exploités par #300 et #297.
- Attribuer un domaine deviné, loué ou acheté à une organisation sans preuve publique gonflerait le chiffre mais détruirait la garantie « vérifié avec provenance ». Aucun domaine n'a été fabriqué.

## Conformité

Nouvelle-Aquitaine uniquement ; sources publiques/grises uniquement (Wikidata P856, libellés Wikidata, preuve HTTP) ; aucun service payant ; aucune donnée personnelle de victime ; code et interface en anglais ; rapport en français ; `server.ts` inchangé ; chaque commande exécutée en moins de 60 s.
