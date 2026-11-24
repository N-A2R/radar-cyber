# Chaînes d'affirmations répétées sans source primaire
OBJECTIF : atteint — 82 / ≥1

Une affirmation est une revendication de victime enregistrée dans
`leak_claim`. La migration `225` crée `claim_chain` : une ligne par victime
affirmée au moins **3 fois** par au moins **2 sources distinctes**, vue pour la
première fois il y a **≥ 30 jours**. `primary_source_count` compte les
revendications de la chaîne reliées à un événement confirmé dont l'URL publique
est renseignée (chaîne de preuve de la migration `206`). Une chaîne avec zéro
document de ce type est une rumeur au sens de ce chantier.

La clé est `sha256(victime normalisée)` : ni titre, ni nom, ni URL, ni donnée
personnelle ne sont stockés. Aucune source nationale n'est présentée comme
locale : aucune origine géographique n'est inférée.

## Critère de sortie

```sql
SELECT count(*) FROM claim_chain WHERE repetitions>=3 AND primary_source_count=0 AND first_seen_at IS NOT NULL >=30;
```

PostgreSQL 18 caste `30` en booléen vrai dans la dernière comparaison : elle se
lit donc `first_seen_at IS NOT NULL`. Le rafraîchissement n'écrivant que des
chaînes âgées d'au moins 30 jours, les deux lectures coïncident.

Sortie brute sur la base de dev, après `pnpm migrate` :

```
 count
-------
    82
(1 row)
```

## Rejouer

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:claim-chains
```

Le script appelle `refresh_claim_chains()` (idempotent), exécute le critère tel
quel, vérifie qu'il concorde avec la projection TypeScript, puis écrit
`bench/results/claim-chain-2026-11-23.json`. Rapport : empreintes, compteurs,
dates, verdicts — jamais de nom de victime. Aucun appel réseau, aucune écriture
hors de `claim_chain`.

La ligne OBJECTIF ci-dessus est calculée par `apps/api/src/analyse/objectif-claim-chains.ts`
depuis la mesure ci-dessus ; `pnpm mesure:claim-chains` échoue si le rapport ne la
déclare pas exactement une fois.

## Limites

Le lien vers un événement confirmé atteste d'une publication de première main
déjà admise par le radar ; il n'atteste pas de la vérité du fond de
l'affirmation. Les chaînes ainsi étayées sortent du comptage des rumeurs sans
être déclarées vraies pour autant. Les affirmations vues moins de trois fois ou
par une seule source ne sont pas des chaînes et ne sont donc pas comptées.
