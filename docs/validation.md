# Validation des corps de requête — 2026-11-21

Toutes les routes d'écriture de `apps/api/src/routes` sont auditées. Le chemin
réel est préfixé par `/api`. **13 routes POST, 0 route PUT/PATCH.**

Le helper partagé `apps/api/src/routes/body-validation.ts` expose `parseBody`
(`schema.safeParse(body ?? {})`, un corps absent valant `{}`) et `invalidBody`,
qui renvoie :

```json
{ "error": "invalid input", "details": [{ "path": "email", "message": "..." }] }
```

La validation se fait dans le handler, après les preHandler (limiteur de débit,
authentification) : un corps invalide ne court-circuite pas le 429.

| Méthode | Chemin | Fichier | Schéma | Champs requis | Corps `{}` |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | `auth.ts` | `RegisterBody` (strict) | `email`, `password` ; optionnels `role`, `displayName` | 400 |
| POST | `/api/auth/login` | `auth.ts` | `LoginBody` (strict) | `email`, `password` | 400 |
| POST | `/api/auth/logout` | `auth.ts` | `EmptyBody` (strict) | aucun | 200 |
| POST | `/api/orgs/from-hint` | `orgs.ts` | `createOrgFromHintSchema` | `nom`, `source`, `preuve` | 400 |
| POST | `/api/quarantine/review` | `quarantine.ts` | `ReviewBody` (strict + refine) | `ids`, `action` ; `reason` requis si `action = reject` | 400 |
| POST | `/api/quarantine/:id/promote` | `quarantine.ts` | `EmptyBody` (strict) | aucun | 404 si inconnu, jamais 400 |
| POST | `/api/review/refuser-sans-indice` | `review.ts` | `RefuserSansIndiceBody` (strict) | `raison` | 400 |
| POST | `/api/review/:id/decision` | `review.ts` | `DecisionBody` (strict + refine) | `decision`, `raison` ; `orgId` pour `accepter` | 400 |
| POST | `/api/sources/:id/morte` | `sources.ts` | `MorteBody` (strict) | `raison` | 400 |
| POST | `/api/sources/:id/reactiver` | `sources.ts` | `EmptyBody` (strict) | aucun | 404 si inconnu, jamais 400 |
| POST | `/api/alerts/:id/ack` | `alerts.ts` | `EmptyBody` (strict) | aucun | 404 si inconnu, jamais 400 |
| POST | `/api/alerts/:id/resolve` | `alerts.ts` | `EmptyBody` (strict) | aucun | 404 si inconnu, jamais 400 |
| POST | `/api/ingest` | `ingest.ts` | `ingestBodySchema` (`events` : tableau d'objets `eventSchema`) | `events` (tableau, éventuellement vide) ; `dedup_key` et `title` par événement | 400 ; `{"events":[]}` reste valide |

**Règle des routes sans corps** : `{}` est accepté (aucun 400 artificiel) ;
toute clé inattendue est refusée avec un 400 détaillé (Zod 4 place la clé dans
le `message`, `path` étant vide pour ce type d'issue).

L'email d'inscription et de connexion est normalisé par
`z.string().trim().toLowerCase().pipe(z.email())` : la validation de l'email
intervient après la normalisation. Les événements d'`ingest` utilisent
`z.object` (clés inconnues tolérées) pour ne pas casser les bots ; les
réparations métier de `admitEvent` restent inchangées.

Couverture : `apps/api/test/validation-corps.test.ts`.
