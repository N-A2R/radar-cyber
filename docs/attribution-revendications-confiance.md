# Attribution des revendications : hiérarchisée et contestable
OBJECTIF : atteint — 35170 / 50

## Objectif

Remplacer le champ groupe libre (`leak_claim.group_name`) par une attribution
hiérarchisée et contestable. Cible : au moins 50 lignes dans `attribution` avec
un code Admiralty valide, une revendication sans preuve qui reste « non
attribué », et un audit conservé des changements.

## Livré

- `db/migrate-217-claim-attribution.sql` : table `attribution` (claim_id,
  groupe, code_admiralty, evidence_url, auteur, updated_at), table
  `attribution_audit`, deux triggers (garde-fou preuve et audit) et la fonction
  `contester_attribution`. La vue `revendication_attribuee` est la surface de
  lecture qui remplace le libellé libre : `non attribué`/`F6` par défaut.
- `apps/api/src/attribution/claim-attribution.ts` : règles pures. Sans preuve
  http(s), pas d'attribution. Avec preuve, le libellé libre sert uniquement à
  retrouver un groupe du catalogue public `leak_site` ; il n'est jamais copié.
  Le code Admiralty combine la fiabilité de la source (A-F) et la crédibilité
  (1-6, montante avec la corroboration).
- `apps/api/src/routes/attributions.ts` : route enregistrée dans le registre
  unique et la matrice RBAC. Lecture publique (`GET /api/attributions`),
  historique public (`GET /api/attributions/historique`) et contestation
  analyste (`PATCH /api/attributions/:claimId`). Motifs codés, auteur = rôle
  applicatif : aucune donnée personnelle.
- `scripts/backfill-claim-attributions.mts` : remplissage idempotent, par lots,
  sans lire les victimes. Les lignes inchangées ne sont pas réécrites.

## Mesure — sortie brute

Commandes :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm migrate
pnpm attributions:backfill
# une contestation réelle a été jouée pour prouver l'audit des changements :
psql -h localhost -p 5433 -U radar -d radar -c \
  "SELECT contester_attribution(claim_id, groupe, 'B2', 'analyste', 'confiance-a-revoir') \
   FROM attribution WHERE groupe <> 'non attribué' ORDER BY claim_id LIMIT 1;"
pnpm verifie:attributions
```

Sortie du vérificateur :

```
colonnes de attribution : claim_id, groupe, code_admiralty, evidence_url, auteur, updated_at
SELECT count(*) FROM attribution WHERE code_admiralty ~ '^[A-F][1-6]$' :
35170
dont attributions réelles (groupe reconnu + preuve) : 19784
revendication sans preuve (groupe / code) : non attribué / F6
tentative d attribution sans preuve : refusée (SQLSTATE 23514)
lignes dans attribution_audit : 35171 (dont contestations : 1 )
colonnes : OK
cible >= 50 : ATTEINTE
sans preuve = non attribué : OK
audit conservé : OK
```

Les 35 170 lignes conformes comprennent les revendications non attribuées
(codées `F6`, valeur « inconnu » de l'échelle Admiralty). Le compte des
attributions réelles, groupe reconnu et preuve citée, est de 19 784 — lui aussi
très au-dessus de 50.

## Contraintes

- Sans preuve, le trigger `attribution_exige_preuve` impose `groupe = 'non
  attribué'`, `code = 'F6'` et `evidence_url NULL` ; toute tentative
  d'attribution est refusée en SQLSTATE 23514, y compris via la fonction de
  contestation.
- Toute insertion, modification ou suppression est copiée dans
  `attribution_audit` avec l'ancien et le nouvel état, le rôle auteur et le
  motif. Le journal n'est pas réécrit par le remplissage idempotent.
- Aucune donnée de victime, courriel, téléphone ou identifiant de compte n'est
  stocké dans ces tables ni exposé par ces routes. Aucune source nationale
  n'est présentée comme locale : seules les sources réellement présentes dans
  la base (`ransomlook`, `ransomwatch`, etc.) servent au calcul.
