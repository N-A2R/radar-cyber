# Recensement REC — services essentiels de Nouvelle-Aquitaine (2026-11-23)

## Objectif et critère

Le radar identifie les opérateurs critiques de Nouvelle-Aquitaine et l'autorité
sectorielle à prévenir sous 24 heures. Le contrôle externe exécute tel quel :

```sql
SELECT count(*) FROM org o WHERE o.kind='operateur_critique' AND (o.id NOT IN (SELECT org_id FROM org_rec) OR o.secteur IS NULL);
```

**Sortie brute (base `radar`, 172.29.0.2:5432, après migration 217) :**

```
0
```

**Sortie brute (base de test créée par `apps/api/test/run.ts`, migration 217
appliquée depuis zéro) :**

```
0
```

La migration 217 ajoute `org.secteur` (miroir généré de `org.sector`, colonne
attendue par le critère mais absente du schéma initial), la table `org_rec` et
un garde-fou : un opérateur critique importé sans secteur reçoit automatiquement
« services essentiels ». Chaque fiche porte `secteur_rec`,
`autorite_competente`, `date_recensement` (2026-11-23), `source_id`,
`source_url`, `source_date`, `source_portee` et `notification_heures = 24`.

## Opérateurs recensés

| Dépt | Opérateur | Secteur REC | Autorité à prévenir (24 h) | Source datée | Portée |
|---|---|---|---|---|---|
| 16 | CENTRE HOSPITALIER D'ANGOULEME | sante | ARS Nouvelle-Aquitaine — délégation de la Charente (16) | ARS NA, 2026-11-22 | départementale |
| 17 | AEROPORT DE ROCHEFORT - CHARENTE-MARITIME (SAINT-AGNANT) | transport_aerien | DREAL Nouvelle-Aquitaine — service transports (17) | Transports NA, 2026-11-22 | régionale |
| 17 | CENTRE HOSPITALIER ROCHEFORT | sante | ARS Nouvelle-Aquitaine — délégation de la Charente-Maritime (17) | ARS NA, 2026-11-22 | départementale |
| 17 | EDF (LA ROCHELLE) | energie | DREAL Nouvelle-Aquitaine — pôle énergie (17) | DREAL NA, 2026-11-22 | régionale |
| 17 | GRAND PORT MARITIME DE LA ROCHELLE | transport_maritime | DREAL Nouvelle-Aquitaine — service transports (17) | Transports NA, 2026-11-22 | régionale |
| 19 | CHU LIMOGES - SITE CH DUBOIS | sante | ARS Nouvelle-Aquitaine — périmètre Corrèze (19) | ARS NA, 2026-11-22 | départementale |
| 23 | CENTRE HOSPITALIER GUERET | sante | ARS Nouvelle-Aquitaine — délégation de la Creuse (23) | ARS NA, 2026-11-22 | départementale |
| 23 | RTE FONCTIONS CENTRALES (MERINCHAL) | energie | DREAL Nouvelle-Aquitaine — pôle énergie (23) | DREAL NA, 2026-11-22 | régionale |
| 24 | CENTRE HOSPITALIER DE PERIGUEUX | sante | ARS Nouvelle-Aquitaine — délégation Dordogne (24) | ARS NA, 2026-11-22 | départementale |
| 33 | GROUPE HOSPITALIER PELLEGRIN - CHU | sante | ARS Nouvelle-Aquitaine — délégation de la Gironde (33) | ARS NA, 2026-11-22 | régionale |

Total : **10 opérateurs**, **10 fiches `org_rec`**, aucun secteur manquant,
aucune fiche incomplète. Les sources sont celles du corpus du radar, déjà
vérifiées HTTP 200 et horodatées dans `source_verification` le 2026-11-22 ;
leurs URL et leur portée déclarée sont stockées dans `source` et `org_rec`.
Aucune source nationale n'est étiquetée locale : les portées possibles sont
`departementale`, `regionale`, `nationale` et `interne`, et le contrôle
`compteursRec().sourcesNonDatees` renvoie 0.

## Rejouabilité

- Migration : `db/migrate-217-rec-operateurs-critiques.sql` (idempotente).
- Lecture : `apps/api/src/rec/operateurs-critiques.ts`
  (`CRITERE_ORG_REC`, `listOperateursCritiques`, `compteursRec`).
- Contrôle sans écriture : `pnpm verifie:rec` → `scripts/verifie-rec.mts`.
- Tests : `apps/api/test/rec-operateurs-critiques.test.ts` (critère brut,
  champs obligatoires, portée des sources, garde-fou de secteur).
- Le jeu de test `insurance-query` calcule le socle régional avant d'ajouter ses
  trois organisations : les dix opérateurs REC font désormais partie du
  référentiel et donc de la population régionale de l'indice d'assurance.

Aucune donnée personnelle ni secret n'est stocké : seuls des noms
d'établissements publics ou d'opérateurs de services essentiels, leur secteur,
une autorité sectorielle et une source publique datée figurent dans la table.
