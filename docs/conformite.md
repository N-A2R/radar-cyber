# Conformité et sécurité — Radar Cyber

Ce document décrit les mesures techniques et organisationnelles en place, et
leurs limites. Il couvre le RGPD (règlement 2016/679) pour les données
personnelles que le radar traite : comptes d'accès, journaux d'accès, demandes
de rectification et, indirectement, données publiées par les sources sur des
organisations et des personnes physiques qui y sont mentionnées.

Références de code : `apps/api/src/security/rbac.ts` (matrice d'accès),
`apps/api/src/security/access-log.ts` (journal des accès),
`apps/api/src/security/headers.ts` (en-têtes),
`apps/api/src/domain/rectification.ts` (droit de réponse),
`db/migrate-049-securite-conformite.sql` (schéma),
`docs/socle.md` et `SECURITY.md` pour le contexte général.

## 1. Principes appliqués

| Principe RGPD | Traduction dans le radar |
| --- | --- |
| Licéité, finalité | Les comptes servent à l'accès aux outils d'analyse ; les journaux servent à la sécurité et à la preuve des accès ; les demandes de rectification servent à exercer un droit de réponse. Aucune de ces données n'est revendue ni utilisée pour du profilage publicitaire. |
| Minimisation | L'adresse IP et le user-agent ne sont jamais stockés en clair : seule une empreinte SHA-256 poivrée est conservée. La fiche publique n'expose que les rectifications **publiées**, jamais les coordonnées des demandeurs ni les demandes en cours. |
| Exactitude | Une rectification est confrontée au nom, à un alias actif ou au domaine officiel de l'organisation visée, puis validée par un administrateur avant publication. Le journal garde la version initiale : aucune réécriture. |
| Limitation de la conservation | Journal des accès : 90 jours par défaut (`RADAR_AUDIT_RETENTION_DAYS`), via `purger_access_log()`. Événements : rétention existante (90 jours, archives conservées). Sessions : 7 jours. |
| Intégrité et confidentialité | Mots de passe scrypt + sel, jetons de session stockés uniquement sous forme de SHA-256, contrôle d'accès déclaratif, en-têtes de sécurité, limitation de débit. |
| Responsabilité (accountability) | Chaque refus d'accès et chaque décision de rectification est un fait daté dans le journal de vérité append-only. Les règles d'accès sont vérifiées par un test de couverture à chaque livraison. |

## 2. Registre des traitements (simplifié)

| Traitement | Données | Base légale retenue | Conservation |
| --- | --- | --- | --- |
| Comptes et sessions | e-mail, nom affiché, hash de mot de passe, hash de jeton, date de dernière connexion | Intérêt légitime : sécuriser un outil interne d'analyse | Durée du compte ; sessions 7 jours |
| Journal des accès API | méthode, route, statut, décision, motif, rôle, identifiant utilisateur, hash IP/user-agent, identifiant de corrélation, durée | Intérêt légitime : sécurité et détection d'abus (art. 6.1.f) ; obligation de sécurité (art. 32) | 90 jours ; les refus restent dans le journal de vérité |
| Droit de réponse | organisation nommée, coordonnées de contact, motif, texte de la demande, moyen de vérification, décision et auteur | Exercice d'un droit par la personne/organisation concernée (art. 16 et 21) ; intérêt légitime à la traçabilité | Tant que la réponse est publiée ; suppression possible sur demande (cascade de l'historique) |
| Événements publiés | faits issus de sources ouvertes, parfois associés à une organisation | Intérêt légitime : observatoire de la cybermenace (art. 6.1.f), avec mise en balance | 90 jours en table chaude, résumé archivé |
| Données brutes de collecte (`quarantine_raw`) | contenu source non structuré, parfois porteur d'un indice d'organisation | Intérêt légitime : pouvoir vérifier et rejouer une admission (art. 6.1.f), durée limitée à la revue | 90 jours par défaut ; durée déclarée **par source** dans `registre_traitement.duree_jours`, purge appliquée par `runRetention` et consignée au journal (`event.purge`, sujet = source) |

Depuis la migration 214, chaque source active possède une ligne complète dans
`registre_traitement` (`base_legale`, `duree_jours`, `finalite`, `id`) ; un
trigger sur `source` déclare immédiatement toute source qui devient active.
`GET /api/registre-traitements/export.csv` est public (aucune donnée
personnelle dans le fichier) et télécharge, en un clic depuis le registre des
sources de l'interface, `registre_traitements_AAAA-MM-JJ.csv` : une ligne par
source active, avec sa finalité, sa base légale et sa durée de rétention. La
portée affichée est calculée depuis `region`/`department` : `nationale` pour
`region='national'`, `locale` avec un département, `regionale` avec une
région, `internationale` sinon. Une source nationale n'est donc jamais
présentée comme locale. `pnpm verifie:registre-traitements` rejoue le contrôle
de complétude sur la base courante.

Les sources externes sont des données publiques ou diffusées sous licence ; le
radar n'ajoute pas de catégorie particulière de données au sens de l'article 9
sans justification préalable. En cas de doute sur une donnée sensible, la
décision de publication est humaine (file de revue).

## 3. Rôles et contrôle route par route

Trois rôles, hiérarchisés : **lecteur** < **analyste** < **admin**. Un admin
satisfait toutes les gardes ; un analyste satisfait les gardes analyste et
lecteur.

La matrice `POLITIQUE_ACCES` (`apps/api/src/security/rbac.ts`) énumère
**chaque** route `/api/*` avec la méthode HTTP, le chemin Fastify (`:id`) et le
niveau requis. Points clés :

- **Refus par défaut** : une route API absente de la matrice répond 404 et
  l'incident est audité. Il n'existe pas de « reste public ».
- **Bootstrap** : sur une base sans aucun compte, `POST /api/auth/register`
  est autorisé sans jeton et crée le premier admin. Dès qu'un compte existe,
  la route exige un admin.
- **Lectures publiques** : observatoire, santé, statistiques, annuaire,
  recherche, flux SSE, alertes et quarantaine en lecture. Un jeton valide,
  lorsqu'il est fourni, est attaché à la requête pour adapter l'interface,
  sans changer le niveau d'accès.
- **Lectures authentifiées** : fiches organisations, organisations liées,
  détail d'alerte, rectifications publiées d'une fiche.
- **Analyste** : files de revue, décisions de revue, promotion de la
  quarantaine, création d'organisation depuis un indice, accusé/résolution
  d'alerte, lecture de la file du journal. Le refus groupé sans indice
  (`POST /api/review/refuser-sans-indice`) reste réservé aux administrateurs
  par sa garde locale, plus stricte que la matrice.
- **Admin** : journal des accès, export CSV du journal de revue, gestion des
  sources (morte/réactivation), ingestion machine à machine, création de
  comptes et **décisions sur les demandes de rectification** (instruction et
  publication).

Le contrôle est installé par `installAccessControl(app)` **avant** toute
déclaration de route. Les routes conservent leurs gardes locales
(`requireAuth`, `requireRole`) comme seconde couche : une route ne doit pas
devenir accessible si le registre global est oublié dans un test isolé.

`test/securite-couverture.test.ts` enregistre le même registre de routes que
le serveur (`registerApiRoutes`) et échoue s'il existe une route sans règle ou
une règle sans route. `test/securite-rbac.test.ts` vérifie les 401/403 pour
les trois rôles, le jeton invalide, la route inconnue et l'inscription initiale.

## 4. Journal des accès

`access_log` (migration 049) enregistre, pour chaque appel `/api/*` :

- horodatage, méthode, **route effective** (template `:id`, jamais l'URL brute
  avec paramètres), statut HTTP, décision (`autorise`/`refuse`) et motif ;
- niveau requis, rôle, identifiant utilisateur, acteur (`humain:<email>` ou
  `anonyme`) ;
- `ip_hash` et `user_agent_hash` (SHA-256 poivré, 32 hexadécimales),
  `correlation_id` (en-tête `X-Request-Id` fourni ou UUID généré, renvoyé dans
  la réponse), durée en millisecondes.

Propriétés :

- **Append-only applicatif** : un trigger refuse tout `UPDATE`, sauf
  l'anonymisation explicite d'un ancien compte. La suppression n'est possible
  que par `purger_access_log(jours)`, appelée par la rétention.
- **Lisible par les administrateurs** : `GET /api/audit/acces`, filtrable par
  période, acteur, décision, route et identifiant de corrélation, paginé et
  borné. Les champs sensibles n'en sortent pas.
- **Mirroir des refus** : chaque 401/403/404/429 est aussi consigné dans le
  journal de vérité avec `kind = acces.refus` et le motif de la décision. Le
  journal de vérité n'est pas soumis à la rétention de 90 jours : la preuve
  d'un incident subsiste après la purge du journal des accès.
- **Écriture avant réponse** : l'audit est posé dans le hook `onSend`, attendu
  par Fastify. Une administration qui interroge le journal juste après un refus
  le voit immédiatement. Une panne d'écriture est journalisée côté serveur
  mais ne fait pas échouer la requête.

`RADAR_AUDIT_PEPPER` est obligatoire en production : sans poivre, l'espace des
adresses IPv4 serait trop petit pour résister à une recherche exhaustive sur
les empreintes. Le changer rend les anciennes corrélations illisibles, ce qui
est aussi un moyen de « coupure » des journaux.

## 5. Limitation de débit

`@fastify/rate-limit` est enregistré globalement (`global: true`) avec une
limite par défaut généreuse (`RADAR_RATE_LIMIT_MAX`, 300/min) et une clé par
utilisateur authentifié, sinon par adresse IP. Les routes sensibles portent
leur propre configuration :

| Route | Limite |
| --- | --- |
| `POST /api/auth/login` | 5 / minute |
| `POST /api/rectifications` | 3 / heure |
| `POST /api/review/:id/decision`, `POST /api/ingest` | limite glissante applicative complémentaire (20/min) |

Un dépassement répond `429` avec `Retry-After` et le format d'erreur uniforme
`{ error: { code: "RATE_LIMIT_EXCEEDED", message, details } }`. Le refus est
audité comme tel. Deux limiteurs coexistent volontairement : le limiteur global
protège l'ensemble de l'API, les limiteurs applicatifs des routes d'écriture
utilisent une fenêtre glissante exacte en mémoire, sans dépendance Redis.

## 6. En-têtes de sécurité

`installSecurityHeaders()` enregistre Helmet (`nosniff`, `X-Frame-Options`,
`Referrer-Policy: no-referrer`, HSTS un an avec `includeSubDomains`) puis pose :

- `Permissions-Policy` (géolocalisation, micro, caméra, paiement désactivés) ;
- `Cross-Origin-Opener-Policy: same-origin` et
  `Cross-Origin-Resource-Policy: same-origin` ;
- `X-Permitted-Cross-Domain-Policies: none` ;
- `Cache-Control: no-store` et `Pragma: no-cache` sur les réponses `/api/*` ;
- une **CSP uniquement sur le HTML** servi par le même processus :
  `default-src 'self'`, `script-src 'self'`, `object-src 'none'`,
  `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`.
  Les trois origines externes réellement utilisées par `index.html` (Google
  Fonts, unpkg pour la feuille MapLibre, gstatic pour les polices) sont
  explicitement autorisées ; tout le reste est bloqué. Aucun script inline
  n'est autorisé.

La CSP n'est pas posée sur les réponses JSON : elle n'y protège rien et
casserait les clients qui consomment l'API.

## 7. Droit de réponse (article 16 et 21 du RGPD)

### 7.1 Parcours

1. **Dépôt public** — `POST /api/rectifications`. Une organisation nommée
   fournit : l'identifiant de la fiche visée (`orgId`), son nom, un e-mail de
   contact, un motif (`inexactitude`, `omission`, `suppression`, `autre`) et un
   texte d'au moins 20 caractères. Le domaine, le nom du contact et une
   référence de pièce justificative sont facultatifs. La limite est de 3
   demandes par heure et par client.
2. **Vérification d'identité nominale** — le nom déclaré doit correspondre au
   nom de l'organisation, à l'un de ses alias actifs ou à son domaine officiel.
   Sinon : `422 NOM_ORG_INCOHERENT`. Organisation inconnue : `404`. Champs
   invalides : `400 DEMANDE_INVALIDE` avec la liste des champs fautifs.
   Aucune donnée n'est inscrite dans ces cas.
3. **Enregistrement** — référence stable `DR-AAAA-000001`, statut `recu`,
   événement initial et fait `droit_reponse.demande` dans le journal, **dans la
   même transaction**. Si le journal est indisponible, la demande est annulée :
   il n'existe pas de demande non tracée. Réponse `202` avec la référence et
   la mention explicite qu'aucune publication n'est automatique.
4. **Instruction** — `GET /api/rectifications` (analyste) et
   `GET /api/rectifications/:id` (historique complet). L'administrateur pose
   une décision : `en_instruction`, `publiee` ou `refusee`, avec un motif
   d'au moins 5 caractères pour publier ou refuser. Chaque décision ajoute un
   événement et un fait `droit_reponse.decision` ; la projection `statut`
   évolue seule. Une demande encore `recu` depuis plus de 24 h passe
   automatiquement à `en_instruction` (événement et fait de journal) :
   l'accusé de réception n'est jamais l'état final.
5. **Publication** — seules les décisions `publiee` alimentent
   `GET /api/orgs/:id/rectifications` et le bloc « droit de réponse » de la
   fiche. Le texte de l'organisation, la référence, la date et le motif de la
   décision sont affichés. Les demandes reçues, en instruction ou refusées ne
   sont jamais affichées.
6. **Clôture** — une demande `publiee` ou `refusee` ne peut plus être décidée
   (`409 DEMANDE_CLOTUREE`) : une nouvelle demande est nécessaire. Le message
   initial, le moyen de vérification et l'historique des décisions sont
   immuables (triggers PostgreSQL). Une demande non tranchée au 29e jour est
   close d'office en `refusee`, motif « délai d'instruction d'un mois
   dépassé » : c'est le silence gardé de l'article 12.3, pas une publication.
   L'événement et le fait de journal sont écrits dans la même transaction.
   L'API rejoue ce passage au démarrage puis toutes les six heures
   (`instruire_droit_reponse()`), et un trigger de contrainte différé garantit
   qu'une demande insérée avec une date déjà ancienne est close immédiatement.
   Aucune demande ne peut donc exister sans événement, ni rester ouverte
   au-delà de 30 jours.
7. **Mesure** — `mesure_droit_reponse()` renvoie le total, les demandes
   ouvertes, les retards, les clôtures sous délai et les délais moyen et
   maximum en jours. `pnpm verifie:droit-reponse` exécute le critère de sortie
   sur la base courante : aucune demande de plus de 30 jours ouverte, aucune
   demande sans événement.

### 7.2 Interface

La fiche organisation affiche systématiquement la section « droit de réponse »
(`apps/web/src/components/DroitReponseSection.tsx`) :

- état vide : « aucune rectification publiée pour cette organisation » et
  bouton d'ouverture du formulaire ;
- état rempli : une entrée par réponse publiée, avec sa référence, son motif,
  son texte, sa date et le motif de la décision ;
- formulaire : nom prérempli et non modifiable, contact, e-mail, domaine
  justificatif, motif, texte, pièce justificative ; validation locale avant
  envoi, états `envoi`, `succès` (référence rendue) et `erreur` (message API,
  avec un libellé dédié au 429) ;
- mention explicite que les coordonnées servent uniquement à l'instruction et
  qu'aucune publication n'est automatique.

Les tests `test/droit-reponse.test.ts` (API) et
`test/droit-reponse-verif.tsx` (rendu) couvrent ces états, les erreurs et la
traçabilité.

## 8. Exercice des autres droits

Les droits suivants ne disposent pas tous d'un écran self-service ; la
procédure est documentée ici et s'appuie sur les outils d'administration
existants.

| Droit | Modalité |
| --- | --- |
| Information (art. 13-14) | Ce document, le formulaire de rectification et les mentions de l'interface. |
| Accès (art. 15) | Administrateur : `GET /api/audit/acces` filtré par `acteur` pour les accès ; `GET /api/rectifications` pour les demandes. Export à fournir à la personne sur demande identified. |
| Rectification (art. 16) | Le mécanisme de droit de réponse décrit au §7, avec décision humaine et publication sur la fiche. |
| Effacement (art. 17) | Suppression du compte (`app_user`, sessions en cascade) ; `anonymiser_acces_utilisateur('humain:<email>')` retire l'identité des accès historiques tout en gardant les faits de sécurité ; suppression d'une demande et de son historique par cascade. Les faits déjà publiés dans le journal de vérité ne sont pas réécrits : ils sont pseudonymisés, pas effacés. |
| Limitation (art. 18) | Les sources peuvent être désactivées sans suppression (`/api/sources/:id/morte`) ; l'accès à un compte peut être retiré en changeant son rôle en `lecteur`. |
| Portabilité (art. 20) | Export CSV du journal de revue (`GET /api/journal/review/export.csv`), registre daté des traitements (`GET /api/registre-traitements/export.csv`, bouton du registre des sources) et lecture JSON paginée des autres traitements. |
| Opposition (art. 21) | Le droit de réponse est le canal prévu pour les informations publiées sur une organisation ; une opposition au traitement des journaux de sécurité est appréciée au cas par cas, la sécurité étant un intérêt légitime. |
| Décision automatisée (art. 22) | Aucune décision produisant un effet juridique sur une personne n'est automatisée : les rattachements et alertes sont des signaux, la publication d'une rectification est toujours une décision humaine. Seule la clôture pour délai dépassé est automatique : elle constate le silence gardé prévu par l'article 12.3, sans publier ni trancher le fond. |

Les demandes d'exercice de droits reçues par e-mail doivent être enregistrées
dans le journal avec l'acteur qui les instruit et la décision prise, selon la
même règle que les rectifications. Le délai de réponse visé est d'un mois
(art. 12.3), prorogeable deux mois pour les demandes complexes.

## 9. Sécurité des comptes

- Les mots de passe sont dérivés avec `scrypt` + sel aléatoire 16 octets
  (`apps/api/src/auth.ts`) ; aucun mot de passe en clair n'est stocké.
- Les jetons de session sont aléatoires (32 octets) et ne sont conservés en
  base que sous forme de SHA-256. Le jeton lui-même n'existe que chez le
  client. Durée de vie : 7 jours ; `logout` supprime la session.
- `POST /api/auth/login` est limité à 5 essais par minute.
- Le premier compte est admin par nécessité (bootstrap) ; l'inscription
  suivante exige un admin. Rôle par défaut d'un nouveau compte : `lecteur`.
- Le front ne reçoit le jeton que via `POST /auth/login` et le joint en
  en-tête `Authorization: Bearer` sur les appels authentifiés.

## 10. Incident, failles et limites connues

- Un accès refusé est un fait de sécurité audité ; une série de refus est
  détectable via `GET /api/audit/acces?decision=refuse`. Il n'existe pas
  encore d'alerte automatique sur ce motif : elle est à mettre en place côté
  supervision si le service est exposé à Internet.
- En cas de violation de données, la procédure est : contenir (révocation des
  sessions concernées), qualifier via le journal des accès et le journal de
  vérité, puis notifier la CNIL sous 72 heures et les personnes concernées si
  le risque est élevé (art. 33-34). Cette procédure est à tenir à jour par
  l'équipe en charge.
- Le chiffrement au repos est celui fourni par PostgreSQL/l'hébergement ; le
  chiffrement des sauvegardes et la gestion des clés relèvent du déploiement
  (`scripts/backup-db.sh`).
- Limites actuelles : pas de délégué à la protection des données nommé dans le
  dépôt, pas de portail self-service pour l'effacement, pas de journalisation
  des modifications de rôle autres que l'audit des accès, pas de réplication
  du limiteur de débit entre instances (chaque processus compte ses propres
  appels). Ces points sont des pistes d'amélioration explicites, pas des
  garanties livrées.

## 11. Vérification

Commandes de référence, depuis la racine du worktree :

```bash
pnpm -F @radar/api typecheck
pnpm -F @radar/api test -- test/securite-couverture.test.ts  # 209 / 209 routes API couvertes
pnpm -F @radar/api test -- test/droit-reponse.test.ts \
  test/securite-rbac.test.ts test/securite-headers.test.ts \
  test/securite-couverture.test.ts
pnpm verifie:registre-traitements  # 0 source active sans registre complet
pnpm -F @radar/web typecheck
pnpm -F @radar/web run test:droit-reponse
pnpm -F @radar/web run test:orgsheet
bash scripts/verify-all.sh   # suite complète, y compris healthcheck
```

La suite complète (`pnpm -F @radar/api test`) crée une base PostgreSQL
jetable, applique `db/init.sql` puis toutes les migrations, dont la 049 : un
schéma qui ne s'applique pas fait échouer les tests avant toute autre
vérification.

OBJECTIF : atteint — 214 / 214 routes API avec une décision d'accès explicite (HEAD inclus ; 118 règles déclarées, 0 route sans règle, 0 règle orpheline). Mesure reproductible : `pnpm -F @radar/api test -- test/securite-couverture.test.ts`, qui compte les routes du routeur et les lignes de `POLITIQUE_ACCES`.

OBJECTIF : atteint — 0 source active sans registre complet / 0 attendu ; 1 ligne par source active dans `registre_traitements_AAAA-MM-JJ.csv`.
