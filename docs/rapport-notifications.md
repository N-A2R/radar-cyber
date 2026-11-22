# Rapport — Chantier Notifications

Branche : `ext/chantier-f6` (depuis `origin/main`). Date : 22 novembre 2026.

## Prévol

Aucune pull request existante ne porte sur ce sujet : recherche `gh pr list --state all`
avec `notifications`, `notification`, `alertes`, `webhook`, `RSS` et `chantier-f6`
(aucun résultat pour le sujet ; les PR listées concernent d'autres chantiers).
L'historique ne contient pas non plus de livraison « notifications » : les seuls
commits liés à `notify` sont des correctifs antérieurs de diffusion webhook/Telegram.
Nous implémentons donc le chantier à partir de l'état réel.

## État réel de départ

La mesure est reproductible sur la base de travail réelle :

```bash
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-notifications.mts
```

Résultat obtenu (exécution du 22/11/2026) :

```json
{
  "organizations": 1673151,
  "sources": 312,
  "events": 26394,
  "alerts": 1432,
  "na_departments": 12,
  "eligible_notifications": 1382,
  "pending_delivery": 1382,
  "channels": ["email", "webhook", "rss"]
}
```

Le chiffre central est **3 canaux livrés et testés sur 1 382 alertes
Nouvelle-Aquitaine éligibles**, mesurées sur 1 673 151 organisations, 312 sources
et 26 394 événements. Les 1 382 alertes sont comptées par le même sélecteur que
celui utilisé à l'exécution (`notify/notification-alerts.ts`), pas par une
requête adhoc : le nombre est donc directement comparable aux envois.

La lecture sur la base réelle ne lui écrit rien : la colonne `email_delivered_at`
est lue via `to_jsonb(a)`, si bien que la mesure fonctionne avant même que la
migration 064 soit appliquée en production. L'écriture de la trace email, elle,
nécessite cette migration (elle est appliquée automatiquement dans la base de
test).

## Ce qui a été livré

- **Email** : client SMTP minimal en Node natif (`notify/smtp.ts`), sans paquet
  ni prestataire payant. SMTP implicite TLS, STARTTLS, AUTH PLAIN/LOGIN, et
  relais local en clair. Configuration par variables d'environnement
  (`RADAR_ALERT_EMAIL_*`) ; aucune valeur sensible par défaut. Traçabilité par
  `email_delivered_at` (`db/migrate-064-notification-channels.sql`).
- **Webhook** : canal existant conservé, mais branché sur le sélecteur commun et
  sur le même message structuré ; le `POST` JSON et le back-off sont inchangés.
- **RSS** : flux public `GET /api/alerts/rss.xml`, 20 alertes maximales, XML 2.0,
  interface anglaise (`Radar Cyber - Nouvelle-Aquitaine alerts`,
  `<language>en</language>`), règle d'accès explicite et cache d'une minute.
- **Sélecteur commun** : Nouvelle-Aquitaine uniquement (12 départements
  canoniques ; un événement régional sans organisation peut aussi passer),
  scopes de revue exclus, TLP:RED exclu. Aucun filtre de famille de source :
  les sources grises restent autorisées.
- **Confidentialité** : ni titre d'alerte, ni titre d'événement, résumé ou
  `evidence` ne sont publiés. Les messages ne contiennent que des champs
  structurés (identifiant, sévérité, organisation, source, date, lien) ; les
  noms d'organisation/source passent par un nettoyage des courriels, numéros,
  adresses IP et noms précédés d'un titre honorifique, et les liens perdent
  query string et fragment.
- **Câblage** : `server.ts` ne change que sur 2 lignes (import + condition),
  soit 4 lignes de diff au total, limite de 10 respectée.

## Tests

Un test par comportement, sans réseau externe ni donnée de production : serveur
HTTP local pour le webhook, serveur SMTP local pour l'email, base de test
jetable pour la sélection.

```bash
cd apps/api
RADAR_TEST_ADMIN_URL=postgres://radar:radar@127.0.0.1:5433/postgres \
  ./node_modules/.bin/tsx test/run.ts \
  test/notifications.test.ts test/securite-couverture.test.ts \
  test/contrat-routes.test.ts test/agents-cpu.test.ts test/rupture-revue.test.ts
```

Résultat obtenu : **52 tests, 52 réussis, 0 échec** (3,3 s), dont les
**11 tests de notifications** couvrant : réception webhook et trace par canal,
échec webhook avec retry, envoi email SMTP sans donnée personnelle, échec SMTP
enregistré, filtrage NA du flux RSS, exclusion TLP:RED et revue, route RSS
publique, message anglais structuré, configuration des canaux, nettoyage des
identifiants personnels et rejet des adresses injectables.

Vérification complémentaire : `tsc --noEmit -p apps/api/tsconfig.json` → code
de sortie 0. Chaque commande exécutée reste sous la limite de 60 s.

## Limites assumées

- Le flux RSS est public par conception : il ne publie que des champs structurés
  et aucun texte libre sur les victimes. Il n'existe pas d'abonnement email
  configurable par utilisateur ; l'email part vers une boîte opérationnelle
  unique définie par `RADAR_ALERT_EMAIL_TO`.
- Telegram reste configuré et diffusé comme auparavant, mais n'est pas un
  objectif du chantier et n'est pas compté dans les 3 canaux mesurés.
- La base réelle partagée n'a pas été migrée pendant ce chantier : la mesure est
  en lecture seule. Le déploiement doit appliquer `db/migrate-064-*.sql` avant
  d'activer le canal email.
