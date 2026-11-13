# Journal de vérité

> Aucune écriture destructive. On n'insère que des faits datés ; tout le reste
> est une vue calculée.

## Le problème

Neuf chemins d'écriture, aucun ne conservait l'état antérieur : `UPDATE org`,
`ON CONFLICT DO UPDATE` sur l'ingestion, la purge à 90 jours, la revue, la
promotion de quarantaine. Corriger le présent effaçait le passé.

La démonstration la plus nette est arrivée en remplaçant le moteur de
rattachement : on savait qu'il corrigeait des erreurs, on ne savait pas
lesquelles. L'ancien rattachement n'avait jamais été conservé.

## Le dispositif

### Deux horloges, comme un graphe bi-temporel

| Colonne | Sens | Peut-elle être rétroactive ? |
| --- | --- | --- |
| `valid_at` | quand le fait était vrai **dans le monde** | oui — un article publié après coup |
| `recorded_at` | quand le radar l'a **appris** | non, jamais |

C'est ce qui permet deux questions différentes : *« qu'est-ce qui était vrai en
mars ? »* et *« qu'est-ce qu'on croyait savoir en mars ? »*.

### Le pourquoi, pas seulement le quoi

Chaque fait porte `actor` (`moteur:gazetteer@2`, `humain:analyste@…`,
`collecteur:cert_fr`) et un `payload` avec la preuve : alias retenu, motif,
seuil, version, extrait. Sans ça, on sait qu'une décision a été prise mais pas
sur quoi elle reposait.

### Append-only, garanti par la base

Des triggers refusent `UPDATE`, `DELETE` et `TRUNCATE`, quelle que soit la
couche. Ce n'est pas une convention de code : c'est une propriété du moteur, et
`pnpm verify:journal` essaie réellement les trois et échoue si l'un passe.

### Les projections restent la lecture

Décision assumée : **event sourcing pragmatique, pas orthodoxe**. Le journal fait
autorité pour l'audit, le rejeu et la mesure ; les projections (`event.org_id`,
`org.name`, les alertes) font autorité pour la lecture. Aucun écran ne rejoue le
journal pour s'afficher.

## Les trois voies câblées

| Voie | Fait consigné | Ce qui était perdu |
| --- | --- | --- |
| Ingestion | `event.rattachement`, `match.decided` | l'ancien `org_id`, le motif, le moteur |
| Référentiel | `referentiel.charged`, `org.changed` | la valeur antérieure des champs complétés |
| Revue | `review.decided` | la décision humaine, son auteur et son motif |

## La vérification

`pnpm verify:journal` — lancé aussi par `pnpm setup:check`.

Quatre contrôles :

1. **append-only** — les trois écritures destructives sont refusées ;
2. **couverture** — chaque événement de la base a sa trace ; un événement sans
   journal est un angle mort ;
3. **cohérence** — `event.org_id` s'accorde avec le dernier fait de
   rattachement ; une divergence signale une écriture passée à côté ;
4. **bi-temporalité** — tout fait a une horloge de connaissance.

Éprouvé par sabotage : deux `org_id` mis à `NULL`, le contrôle a échoué en les
nommant, puis `pnpm replay:journal --apply` a reconstruit la projection depuis
le journal. Divergence détectée, réparation prouvée.

## Ce que le chantier a corrigé, et qu'on ne voyait pas

En produisant le **diff nominatif** du changement de moteur — la mesure impossible
avant le journal — deux faux positifs sont apparus, tous deux de mon fait :

```
na-2026-013  « sept magasins en Béarn, dont Sauveterre-de-Béarn »
             → rattaché à la Commune de Sauveterre-de-Béarn
na-2026-020  « une monnaie locale au Pays basque »
             → rattaché à la Communauté d'agglomération du Pays Basque
```

Un nom de lieu n'est pas une organisation victime. Le moteur distingue désormais
les **rôles d'établissement** (« ville de », « mairie de », « hôpital de »), qui
tranchent, des **territoires** (`sector` ∈ commune, epci, département, région),
dont le nom reste consultable mais ne décide plus rien.

Résultat : 7/15 → **5/15, zéro faux**. Moins de rattachements, tous justes.

## Usage

```bash
pnpm verify:journal                      # contrôle, sort en 1 si écart
pnpm replay:journal                      # montre les écarts sans écrire
pnpm replay:journal --apply              # reconstruit la projection
pnpm replay:journal --as-of=2026-11-01   # état cru à cette date
```

## Ce qui reste à câbler

- **alertes** (`alert.changed`) et **sources** (`source.changed`) : kinds
  déclarés, voies pas encore écrites ;
- **rétention** : la purge de 90 jours n'archive pas encore ; c'est le chantier 2
  de `docs/chantiers.md` ;
- **écran** : le journal n'est pas exposé dans l'interface. Il devrait l'être —
  « pourquoi cette alerte » a désormais une réponse vraie.
