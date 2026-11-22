# Rapport — Fuites rattachées par domaine

**Date de mesure :** 22 novembre 2026 (relecture de la base de travail réelle, `localhost:5433/radar`).
**Périmètre :** Nouvelle-Aquitaine uniquement, rattachement par domaine racine vérifié. Sources grises admises, aucun service payant, aucun appel réseau.

OBJECTIF : atteint — 8 / 8

CHANTIER TERMINE

## Résultat

**Le nombre de fuites rattachées à une organisation de Nouvelle-Aquitaine par domaine est 8.**

| Organisation (id) | Département | Domaine racine | Source | Revendication (id) |
|---:|:---:|---|---|---:|
| 21328 | 64 | `transdev.com` | ransomwatch | 1536 |
| 668071 | 33 | `notaires.fr` | ransomwatch | 8010 |
| 610 | 17 | `nieul-sur-mer.fr` | ransomwatch | 8135 |
| 295426 | 16 | `citebd.org` | ransomwatch | 13322 |
| 223089 | 33 | `asobostudio.com` | ransomwatch | 13682 |
| 373593 | 33 | `tivoli-33.org` | ransomwatch | 14505 |
| 168102 | 33 | `sefiso-atlantique.fr` | ransomwatch | 14826 |
| 604869 | 23 | `fol-23.fr` | ransomwatch | 15319 |

Répartition publiée par le script (clés triées, valeurs entières) :

```json
{ "byDepartment": { "16": 1, "17": 1, "23": 1, "33": 4, "64": 1 },
  "bySource": { "ransomwatch": 8 } }
```

Huit organisations distinctes, huit revendications distinctes : aucun doublon, aucune racine ambiguë, aucun rattachement hors région. Toutes les sources sont grises et gratuites (`ransomwatch`).

## État réel de la base et évolution

| Grandeur | 21/11 (PR #309) | 22/11 (PR #342) | 22/11 (relecture) |
|---|---:|---:|---:|
| Organisations | 1 673 151 | 1 673 220 | 1 673 220 |
| Sources | 312 | 463 | 662 |
| Événements | 26 688 | 27 899 | 26 758 |
| Revendications avec indice de domaine | 16 756 | 16 770 | 16 770 |
| Organisations avec domaine ou site web | 88 | 1 445 | 1 779 |
| ... dont en Nouvelle-Aquitaine | 2 | 1 230 | 1 635 |
| **Fuites rattachées par domaine** | **2** | **7** | **8** |

La PR #342 avait mesuré 7 sur un référentiel où 1 445 organisations portaient un domaine (1 230 en NA). Depuis, le référentiel a été enrichi : 1 779 organisations portent désormais un domaine ou un site web, dont 1 635 en Nouvelle-Aquitaine. La relecture donne donc 8 : les sept rattachements initiaux restent valides et celui de `citebd.org` (revendication 13322, organisation 295426, Charente) est devenu prouvable par domaine. Le compteur est rejoué sur la base, pas estimé.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:leaks-by-domain \
    --json=bench/results/leaks-by-domain-2026-11-22-recheck.json \
    --compare=bench/results/leaks-by-domain-2026-11-22.json
```

Sortie observée :

```
NA leaks attached by domain: 8 (claims=16770, domain orgs=1779, orgs=1673220, sources=662, events=26758) -> bench/results/leaks-by-domain-2026-11-22-recheck.json
By department: {"16":1,"17":1,"23":1,"33":4,"64":1} by source: {"ransomwatch":8}
Change since bench/results/leaks-by-domain-2026-11-22.json: added=1 removed=0 (count now 8)
```

La preuve horodatée, les huit rattachements, les trois requêtes SQL exactes et la différence avec la publication précédente sont dans `bench/results/leaks-by-domain-2026-11-22-recheck.json`. Le snapshot de la PR #342 reste la référence du comparateur.

## Méthode

1. **Lecture minimale.** Seuls `id`, `source`, `org_hint` et `status` des revendications sont lus dans `quarantine_raw` (`kind='claim'`) ; ni `raw_body`, ni titre, ni nom, courriel, mot de passe ou adresse IP ne sont sélectionnés.
2. **Normalisation.** L'indice est réduit à sa racine enregistrable par `domaineRacine` (`www.`, schéma URL, casse). Les jetons génériques et les indices non-domaines sont ignorés.
3. **Filtre NA.** Seules les organisations dont le département est l'un des douze codes de Nouvelle-Aquitaine (code INSEE ou libellé, accentué ou non) alimentent l'index. Une organisation hors région n'est jamais rattachée.
4. **Rattachement strict.** Égalité exacte de racine entre l'indice et le domaine ou le site web vérifié de l'organisation. Une racine partagée par deux organisations NA est écartée ; une revendication rejetée ou répétée est écartée.
5. **Agrégation.** `summarizeLeaksByDomain` regroupe les rattachements comptés par code département et par source, avec des clés triées. Ce récapitulatif ne contient que des compteurs et des catégories.
6. **Différence.** `diffLeakAttachments` compare le snapshot publié à la mesure courante : ajouts et retraits sont triés par clé stable et ne contiennent que les identifiants déjà publics. Le fichier `--compare` est validé avant lecture.

## Vérifications

- Tests ciblés : `cd apps/api && DATABASE_URL=postgres://radar:radar@localhost:5433/radar ./node_modules/.bin/tsx test/run.ts test/leaks-delta.test.ts test/leaks-summary.test.ts test/leaks-by-domain.test.ts` — **21 réussis, 0 échec** (16 tests existants et cinq tests sur la différence : ajout, retrait, inchangé, ordre stable, champs publiés seulement).
- `tsc --noEmit` dans `apps/api` : réussi.
- `apps/api/src/server.ts` n'est pas modifié : **diff de 0 ligne** (limite : 10). La route anglaise `GET /api/leaks/by-domain` reste enregistrée dans le registre unique des routes.
- Code, clés JSON, route et messages en anglais ; présent rapport en français.
- Aucun service payant, aucun appel réseau, aucune donnée personnelle publiée : le JSON contient des identifiants d'organisation, des racines de domaine et des compteurs.

## Limites

Le chiffre 8 reflète l'état mesuré du référentiel : 1 635 organisations NA portent un domaine vérifié, les autres n'ont pas d'indice exploitable. Aucune racine n'est devinée pour augmenter le total. Aucune cible supérieure à 8 n'est déclarée : toutes les fuites prouvables par domaine sur cet état sont publiées.
