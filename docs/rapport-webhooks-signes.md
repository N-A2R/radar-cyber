# Rapport — Chantier Webhooks signés

Branche : `ext/chantier-g2` (reprise de `ext/chantier-f6`, elle-même issue de
`origin/main`). Date : 22 novembre 2026.

## Prévol

Recherches effectuées avec `gh pr list --state all --search ...` (mots-clés :
`webhook`, `webhook signature`, `webhooks signés`, `signature`, `HMAC`) et
`git log --oneline --all | grep -i ...`. Une seule PR concerne les webhooks :
**#386 « Notifications : email, webhook et RSS testés (3/3 canaux) »**, branche
`ext/chantier-f6`. Son objectif chiffré (3 canaux livrés, 1 382 alertes
éligibles) est atteint, mais son diff ne contient ni HMAC, ni secret, ni
en-tête de signature : l'objectif de ce chantier — **la signature vérifiable
par le client** — n'est donc pas livré. Aucune PR ne porte sur les webhooks
signés. Nous repartons de la branche de la PR #386 (un commit au-dessus de
`origin/main`) et poursuivons jusqu'à l'objectif mesurable.

## État réel de départ

La mesure est reproductible sur la base de travail réelle, en lecture seule :

```bash
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-notifications.mts
```

Résultat observé lors de ce chantier : 1 673 151 organisations, 312 sources,
26 394 événements, 1 432 alertes, 12 départements de Nouvelle-Aquitaine et
1 382 alertes éligibles au sélecteur commun de notification.

## Objectif mesuré

Commande reproductible (le script n'écrit rien dans la base ; il envoie les
charges à un récepteur HTTP local jetable) :

```bash
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-webhook-signatures.mts
```

Résultat obtenu le 22/11/2026 (exécution de 1,66 s) :

```json
{
  "organizations": 1673151,
  "sources": 312,
  "events": 26394,
  "alerts": 1432,
  "na_departments": 12,
  "eligible_alerts": 1382,
  "signed_deliveries": 1382,
  "client_verified": 1382,
  "tampered_rejected": 1382,
  "fresh_timestamps": 1382
}
```

**Chiffre central : 1 382 signatures sur 1 382 vérifiables par un client
indépendant (100 %), avec 1 382 charges altérées rejetées sur 1 382.** La
vérification est faite par une implémentation HMAC séparée du module de
signature, sur les octets bruts reçus, et non par la fonction de vérification
du serveur.

## Protocole livré

- `RADAR_ALERT_WEBHOOK_SECRET` : secret HMAC partagé, lu depuis l'environnement.
  Sans secret, aucun `POST` n'est envoyé : l'alerte est marquée en échec avec
  `webhook signing secret is not configured` (échec fermé, pas d'envoi en clair).
- Corps : le JSON exact sérialisé une seule fois, tel qu'envoyé.
- `x-radar-timestamp` : seconde Unix de l'envoi.
- `x-radar-signature` : `sha256=<hex HMAC-SHA256(secret, timestamp + "." + corps brut)>`.
- Le client doit vérifier sur le corps brut avant `JSON.parse`, comparer en
  temps constant et refuser un écart de timestamp supérieur à 300 secondes.

Vérification minimale côté client (Node natif, aucun paquet) :

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const expected = `sha256=${createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex")}`;
if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) reject();
if (expected.length !== signature.length) reject();
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) reject();
accept(JSON.parse(rawBody));
```

Le helper exporté `verifyWebhookSignature()` applique la même règle et sert de
point de test ; la mesure et le test de bout en bout ne l'utilisent pas comme
unique preuve.

## Tests

Un test par comportement observable, dans `apps/api/test/webhook-signature.test.ts` :

1. le client vérifie la signature reçue sur le corps brut exact ;
2. une charge modifiée après signature est rejetée ;
3. un timestamp hors de la fenêtre de fraîcheur est rejeté ;
4. sans secret, aucun webhook n'est envoyé et l'alerte reste en échec ;
5. le secret est lu depuis l'environnement.

Commande reproductible :

```bash
cd apps/api
RADAR_TEST_ADMIN_URL=postgres://radar:radar@127.0.0.1:5433/postgres \
  ./node_modules/.bin/tsx test/run.ts test/webhook-signature.test.ts \
  test/notifications.test.ts test/contrat-routes.test.ts
```

Résultat : **45 tests réussis, 0 échec** (les 5 nouveaux comportements, les 11
tests de notifications existants et les tests de contrat de routes). Le contrôle
`./node_modules/.bin/tsc --noEmit -p tsconfig.json` renvoie le code 0.

## Conformité

- `apps/api/src/server.ts` : **0 ligne ajoutée par ce chantier**. Le diff total
  par rapport à `origin/main` reste les 4 lignes déjà apportées par la PR #386,
  donc ≤ 10 lignes.
- Nouvelle-Aquitaine uniquement : les charges signées viennent du sélecteur
  partagé (12 départements, périmètres de revue et TLP:RED exclus).
- Sources grises autorisées : aucun filtre de source supplémentaire ajouté.
- Aucune donnée personnelle de victime : les charges restent les champs
  structurés et nettoyés du `notification-content` existant ; signature incluse.
- Aucun service payant : `node:crypto`, `fetch` et un serveur HTTP local suffisent.
- Code et interface en anglais ; rapport en français.
- Chaque commande exécutée reste sous 60 s (maximum observé : 8 s pour le
  typecheck).

## Limites assumées

- Le secret doit être déployé à l'identique chez l'émetteur et chez chaque
  client ; ce chantier ne fournit pas de rotation automatique de secret.
- Une dérive d'horloge supérieure à 5 minutes entraîne un rejet légitime.
- Les récepteurs existants continuent de recevoir les mêmes charges JSON ; ils
  doivent ajouter la vérification ci-dessus pour tirer parti de la signature.
- La mesure signe de vraies alertes NA vers un récepteur local : aucun appel à
  un webhook de production et aucune écriture en base.
