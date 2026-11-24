# Mode hors ligne PWA — état vérifié et plafond du chantier

## Deux états à ne pas confondre

Ce rapport décrivait, au 22 novembre, l'état d'`origin/main` : **22 / 22 contrôles
unitaires** et **11 / 11 vues** rejouées après coupure réseau. Ce chiffre reste
rejouable sur une branche issue de `origin/main` :

```bash
apps/api/node_modules/.bin/tsx apps/web/test/offline-pwa-verif.ts
# Observé le 24/11/2026 dans /tmp/radar-parallel2/offline-pwa : 22/22
```

La PR #810, réservée au parent, remplace ce périmètre : 4 destinations (Carte,
Action, Sources, Journal) et 13 panneaux vérifiés par `apps/web/test/offline.spec.ts`,
27 contrôles dans `apps/web/test/offline-pwa-checks.ts`. La documentation doit donc
lire **4 destinations / 13 panneaux et 27 contrôles après intégration de #810**, et
non plus « 11 vues » : ce dernier chiffre décrit l'ancien produit et induit le
lecteur en erreur.

## Ce qui a été audité sur le parcours réel

Le parcours hors ligne a trois étages, tous examinés :

1. **Données** (`apps/web/src/offline/pwa.ts`, `apps/web/src/api.ts`) : seules les
   réponses `GET` allowlistées sont écrites, avec date, bornes (600 Ko par réponse,
   2,5 Mo au total, 120 entrées, 7 jours) et rejeu uniquement après échec réseau.
   Le rejeu notifie le bandeau via `onOfflineFallback`.
2. **Coquille** (`apps/web/public/radar-sw.js`) : précache `/`, `/index.html`,
   manifeste et icône ; navigation réseau d'abord, cache en repli ; modules Vite
   en stale-while-revalidate ; tuiles et polices en cache-first borné.
3. **Affichage** (`apps/web/src/App.tsx`) : le bandeau `Offline · …` annonce l'âge
   de la réponse rejouée ; aucune écriture n'est simulée hors ligne.

## Défaut prouvé — et pourquoi il n'est pas corrigé ici

Sur `origin/main`, `radar-sw.js` utilise `RACINE` aux lignes 109, 110, 118 et 119
sans le définir. Conséquence observable, sans serveur lancé : avec un service worker
contrôlant la page et une navigation après coupure réseau (`Cache-Control: no-store`
sur les réponses, toutes les requêtes refusées côté navigateur), `page.goto()`
échoue en `net::ERR_FAILED`. Le précache de l'installation existe bien, mais la
repli navigation ne peut pas le retrouver ; avec le cache HTTP du navigateur
activé, le même scénario passe et masque le défaut.

Scénario rejoué le 24/11/2026 : routes Playwright servant une coquille statique sur
`https://radar.test`, enregistrement de `/radar-sw.js`, attente de
`navigator.serviceWorker.controller`, bascule `enLigne = false`, puis navigation
vers `/carte`. Résultat sur `origin/main` : `net::ERR_FAILED`. Le fichier
`apps/web/public/radar-sw.js` est modifié par la PR #810 (constante `RACINE`,
repli 503 explicite, rafraîchissement du shell à chaque navigation) : le correctif
appartient donc au parent. Aucune duplication n'a été ajoutée dans cette branche.

## Limites assumées

Le rejeu s'arrête à 7 jours : au-delà, l'interface affiche « no cached data » plutôt
qu'un chiffre trop ancien. Les écritures ne sont pas mises en file d'attente : sans
accord de conflits, un accusé hors ligne serait un mensonge. Après #810, les files
de modération et les dossiers (`/journal`, `/quarantine`, `/dossier`) restent
en ligne only et les anciennes entrées sont purgées au démarrage : c'est une
restriction voulue, pas une régression du cache. Le cache contient les dernières
réponses des panneaux ouverts, ce qui est mesurable et suffisant pour une tournée
de terrain, mais ne remplace pas une réplication locale du corpus.
