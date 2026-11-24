# Indice ReCyF-2.5 par collectivité

L'indice de maturité affiché pour une collectivité n'est pas un score maison.
Il est publié sous la référence `ReCyF-2.5`, transposition publique et non
certificative du référentiel national ANSSI (source **externe**, jamais
présentée comme une source locale du radar). Aucune certification ANSSI n'est
revendiquée, aucune donnée personnelle ni secret n'est stocké.

## Méthode datée (2026-11-23)

Pour chaque organisation `kind = 'collectivite'` ayant au moins un événement
public :

```
n           = nombre d'événements rattachés à l'organisation
pénalité    = somme(max(0, sévérité - 1))      # sévérité radar sur 1..4
score       = clamp(1 - pénalité / (3 * n), 0, 1)
confiance   = min(0.99, 0.5 + 0.1 * min(5, n))
```

- `score`：0 = exposition maximale observée, 1 = aucun fait préjudiciable
  observé ; il ne mesure pas une conformité audité au référentiel ANSSI.
- `confidence`：croît avec le nombre de faits publics, plafonnée à 0,99.
- `methode_sha256`：empreinte SHA-256 du texte de méthode complet, identique
  dans `apps/api/src/analyse/recyf.ts` et dans la migration `db/migrate-222-org-score-recyf.sql`.
- `calcule_le`：horodatage UTC du calcul ; `services` et `confirmees`
  conservent les compteurs d'événements de la table `org_score`.

La clé de `org_score` est `(org_id, referentiel)` : les scores CTEM
précédents restent disponibles sous `ctem-priorite@1`.

## Publication

```
npx tsx scripts/export-recyf.mts            # calcule, publie et écrit le CSV daté
npx tsx scripts/export-recyf.mts --check    # vérifie le critère et le CSV
```

Le CSV `bench/results/export-recyf-AAAA-MM-JJ.csv` contient une ligne par
collectivité scorée avec la date d'export, le score, sa formule explicite,
sa confiance, l'empreinte de la méthode et la nature de la source
(« ANSSI (source nationale externe, transposition non certificative) »).

## Critère du juge externe

```sql
SELECT count(*) FROM org_score WHERE referentiel='ReCyF-2.5' AND (score IS NULL OR methode_sha256 IS NULL OR confidence IS NULL OR calcule_le IS NULL);
```

La migration insère les scores de toutes les collectivités ayant un événement ;
le test `apps/api/test/org-score-recyf.test.ts` exécute ce critère tel quel.
