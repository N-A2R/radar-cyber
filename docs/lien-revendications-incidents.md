# Lien revendication de fuite → incident confirmé

Une revendication lue sur un site de fuite n'est pas un incident : la compter
en plus d'un `event` déjà admis double le volume. La migration 216 ajoute
`leak_claim.confirmed_event_id` et la fonction
`link_leak_claims_to_events(claim_ids bigint[] DEFAULT NULL)`. Le lien est
écrit sur la revendication ; l'événement n'est jamais modifié ni dupliqué.

## Règle `victim-group-date@1`

1. le nom normalisé de la victime figure dans le titre de l'événement ou dans
   `event.evidence->>'organisation'` ;
2. les groupes compatibles (identiques, ou absents d'un côté) ;
3. l'incident est antérieur à la revendication de 0 à 30 jours ;
4. un seul candidat est accepté — en cas d'ambiguïté, aucun lien n'est écrit.

Le prédicat SQL `leak_link_match(...)` est utilisé à la fois par l'écriture en
base et par le jeu d'or, pour éviter qu'une règle évaluée diffère de la règle
appliquée. La collecte (`enregistrer`) appelle la fonction sur les seules
revendications du lot ; un rattrapage global se fait avec
`SELECT public.link_leak_claims_to_events();`.

## Mesure

`leak_link_eval` contient 100 cas `na=false` avec l'étiquette vérifiée
(`expected`) et le résultat du lien (`matched`) : 75 paires positives, 25
négatifs (autre organisation, autre groupe, incident trop ancien, incident
postérieur). Les événements et revendications du jeu d'or portent le préfixe
`bench:leak-link:` et des URL `.invalid` : ce sont des cas de mesure, pas des
incidents attribués à des organismes réels. Le jeu d'or est créé par la
migration, comme `dedup_pair`/`dedup_eval` (205) : une base neuve mesure la
même chose, sans dépendre d'un script optionnel.

```sql
SELECT count(*) FILTER (WHERE matched)::float/count(*) FROM leak_link_eval;
-- 0.75
SELECT count(*) FILTER (WHERE matched AND NOT expected)::float
       / NULLIF(count(*) FILTER (WHERE matched), 0) FROM leak_link_eval;
-- 0
```

Vérification reproductible (sortie brute, aucun écrit) :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm verifie:lien-fuite
```

## Limite de couverture

Sur le corpus courant, les 1 316 événements `confirmed_incident` sont des
CVE CISA KEV, sans organisation ni groupe : les revendications ransomwatch
`na=false` n'ont pas de candidat conforme. Le lien reste alors `NULL`, ce qui
est le comportement attendu — une absence de preuve n'autorise pas un
rattachement. La règle et sa mesure deviennent actives dès que des incidents
confirmés portant victime/groupe/date sont collectés.
