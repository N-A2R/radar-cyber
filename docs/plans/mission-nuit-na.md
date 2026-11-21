# Plan : Nuit Nouvelle-Aquitaine — couverture totale, zéro trou

> Objectif de la nuit, en une phrase : **que la Nouvelle-Aquitaine soit couverte
> à fond** — les 12 départements, les cinq familles de sources, une interface
> qui la montre, une collecte qui tourne seule, et un audit final qui ne laisse
> ni source muette ni trou non documenté.
>
> Usage : outil **personnel**. Pas de produit à vendre, pas de vitrine : ce qui
> compte c'est que ça serve chaque matin, et que ce soit vrai.

## Doctrine (ne se négocie pas)

- Rien de faux, rien d'illisible, rien de payant, mesure publiable.
- Un SIREN non vérifié à une source citable n'est pas publié.
- Un chiffre sans requête n'est pas écrit.
- Un extrait se **copie** du contenu reçu, il ne se reformule pas.
- Une source muette se documente ; elle ne se maquille pas avec du vide.
- Sources gratuites uniquement. Aucun contournement de captcha, aucun scraper payant.

## Baseline mesurée au départ (2026-11-21)

| Mesure | Valeur | Commande |
|---|---|---|
| Organisations en base | 1 244 048 | `SELECT count(*) FROM org` |
| Organisations NA (12 depts) | 1 242 882 | `dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')` |
| **Événements rattachés à une org NA** | **31** | jointure `event` × `org` |
| Orgs NA ayant au moins un événement | 25 | idem |
| Répartition | Gironde 20 · Pyrénées-Atl. 3 · Ch.-Maritime 2 · Vienne 2 · Charente 1 · Deux-Sèvres 1 · Hte-Vienne 1 · Dordogne 1 | — |
| **Départements à zéro** | **Landes (40), Lot-et-Garonne (47), Creuse (23), Corrèze (19)** | — |
| Sources activées | 181 | `SELECT count(*) FROM source WHERE enabled` |

**Le diagnostic est net :** le référentiel est énorme (1,24 M d'orgs NA), mais
**31 événements** seulement. Le trou n'est pas dans les organisations, il est
dans la **collecte** et le **rattachement**.

## Validation Commands

- `pnpm typecheck`
- `bash scripts/verify-all.sh`
- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar`

## Règles d'exécution

1. Chaque phase se termine par une **mesure** écrite dans `bench/results/`, pas
   par une impression. Si la mesure ne bouge pas, le dire.
2. Une phase = **un ou plusieurs commits**, message au format du projet.
3. Cocher les cases de ce plan au fur et à mesure ; il fait foi, pas la mémoire.
4. Ne jamais `/clear`, jamais de `git push --force`.
5. Si une phase est impossible (source payante, captcha, API fermée) : la
   documenter dans le rapport **et passer à la suivante**. Ne pas s'acharner.

---

## Task 0: Socle de mesure NA

La table de baseline ci-dessus a été relevée **à la main en psql**. Elle sert de
**repère de contrôle**, pas de source : elle ne doit jamais être recopiée dans un
fichier de résultats. Le JSON de baseline est **produit par le script**, et ses
compteurs doivent **concorder** avec cette table.

- [x] Écrire `scripts/mesure-na.mts` : compte par département (orgs, orgs avec
      événement, événements), sources régionales actives, sources muettes NA.
      Il émet **ses propres requêtes SQL**, aucune valeur en dur.
- [x] Le script écrit `bench/results/na-baseline-2026-11-21.json` (ou l'imprime
      et Task 0 le redirige) : **chaque bloc du JSON porte la requête qui l'a
      produit** (`sql` par compteur, ou un champ `requetes` en tête).
- [x] **Contrôle de concordance** : comparer, compteur par compteur, la sortie du
      script aux valeurs de la table ci-dessus (1 242 882 orgs NA, 31 événements,
      25 orgs avec événement, Gironde 20, 40/47/23/19 à zéro, 181 sources).
- [x] Si un compteur **diffère** : non applicable — les 6 compteurs concordent
      (`ecartVsPlan: []` dans le JSON).
- [ ] Commit : `mesure(na): baseline Nouvelle-Aquitaine publiée`

**Critère :** le JSON existe, il a été **produit par le script** (pas édité à la
main), et chaque compteur est accompagné de sa requête. Un JSON dont les nombres
viennent de la table du plan est un échec de cette tâche.

## Task 1: Sources régionales — les 12 départements

- [x] Inventorier les sources de presse régionale NA **gratuites et lisibles** :
      Sud Ouest, La Nouvelle République, Charente Libre, La Montagne, Le
      Populaire du Centre, Ouest-France éditions locales, Médiacités NA, France
      Bleu NA, et les titres départementaux
- [x] Pour chacune : flux RSS/Atom réel, test de fetch, volume d'items, langue,
      et **fréquence de publication mesurée** — `bench/results/na-sources-sondage-2026-11-21.json`
      (URL testée, HTTP, items réels, dernier pubDate, titres verbatim ; les
      candidates mortes documentées avec leur motif)
- [x] Câbler les sources retenues dans `db/sources-regional.sql` (INSERT idempotent)
- [x] Vérifier en base : au moins **une source active par département** — 12/12,
      minimum 2 sources chacun (`bench/results/na-sources-2026-11-21.json`)
- [ ] Commit : `feat(sources): presse régionale NA par département`

**Critère :** requête SQL qui liste, par département, ses sources actives. Aucun
département sans au moins une source.

## Task 2: CERT et alertes officielles

- [x] ANSSI (CERT-FR) : vérifier le flux existant, sa fraîcheur, sa portée — 4 flux
      actifs, dernier item 2026-11-20, portée nationale documentée
- [x] CISA KEV et avis : vérifier s'ils sont branchés, sinon dire pourquoi —
      branchés (KEV 9 items/7 j, 1 316 événements au total ; ICS advisories actifs)
- [x] Mesurer le rendement : items collectés sur 7 jours, dont rattachés à une org
      NA — `bench/results/na-cert-2026-11-21.json` : CERT-FR 322 items / 192 évts
      / 3 rattachés NA ; CISA 154 items / 85 évts / 0 NA
- [ ] Commit : `feat(sources): CERT et alertes officielles mesurés`

## Task 3: Revendications ransomware — rattachement NA

- [x] Prendre les revendications des 30 derniers jours et chercher celles qui
      citent une organisation NA (par nom, par domaine, par ville des 12 depts)
      — 303 revendications, 180 avec org_hint, verdicts par indice dans le JSON
- [x] Mesurer le taux de rattachement **avant** tout changement — 13 propositions
      ≥ 0,5 dont **9 faux positifs vérifiés un par un** (CO & CO ×6 par jetons
      dupliqués, LIMITED, H CONSULTING, MEDIA INVEST, SCI JP & CO) ; 0 automatique
- [x] Réparer le motif dominant d'échec s'il y en a un (parser, alias, préfiltre
      accentué — défaut connu de `promote.ts`) — **deux motifs réparés** :
      le préfiltre accentué annoncé (migration 041 `org.name_norm`, sans gain
      sur la fenêtre 30 j — écrit tel quel) et le motif dominant mesuré
      (jetons dupliqués + génériques + 2 lettres dans `scoreEntry`) :
      13 → 4 propositions, 434 tests verts, régressions ajoutées
- [x] Re-mesurer après, publier avant/après dans `bench/results/na-ransomware.json`
- [ ] Commit : `mesure(na): rattachement ransomware avant/après`

## Task 4: Trou référentiel — entités NA sans organisation

- [x] Lister les entités citées par les revendications NA qui n'ont **aucune**
      organisation correspondante — **liste vide côté NA** : 241 indices en
      attente, 23 rapprochés par le moteur corrigé, les 8 restantes du périmètre
      français sont toutes Île-de-France/Paris (`bench/results/na-entites-sans-org.json`) ;
      aucun indice non-domaine ne cite une commune NA (requête consignée)
- [x] Les résoudre avec la méthode des lots (sources gratuites, preuves citées),
      par lots de 10, un commit par lot — non applicable côté NA (liste vide) ;
      reprise vague 2 lancée : **lot 1** = 6 chargées avec SIREN vérifié au
      registre (recherche-entreprises.api.gouv.fr, sans clé), 3 absentes
      documentées, 1 à arbitrer (`bench/results/na-lot-reprise-1.json`)
- [ ] Reprendre au passage les lots restants de `mission-vague2-complete.md`
      (169 entités) **si** le temps le permet : ce sont les mêmes sources

**Critère :** aucune entité NA citée par une revendication ne reste sans
organisation **ou** chaque non-résolution est documentée avec sa raison.

## Task 5: Qualité du rattachement

- [ ] Rejouer la mesure de qualité (`scripts/mesure-couverture.mts`) sur NA :
      rattachements `exacte` / `partielle` / `hors_sujet`
- [ ] Si `hors_sujet` > 20 % : corriger le motif dominant, re-mesurer
- [ ] Publier `bench/results/na-rattachement.json`
- [ ] Commit : `mesure(na): qualité du rattachement publiée`

## Task 6: Interface — une vraie vue Nouvelle-Aquitaine

L'UI web existe (`apps/web`), la carte NA aussi (`departements-na.geojson`).

- [ ] Une vue « Nouvelle-Aquitaine » : carte des 12 départements colorée par
      volume d'événements, liste filtrable, accès à la fiche organisation
- [ ] Un filtre département persistant dans l'URL (`url-state.ts` existe)
- [ ] Un état vide honnête : « aucun événement sur ce département » plutôt qu'un
      écran blanc
- [ ] Tests front : rendu de la vue, filtre appliqué, état vide
- [ ] Commit : `feat(web): vue Nouvelle-Aquitaine`

**Critère :** `verify-all.sh` vert, et une capture ou un test qui prouve la vue.

## Task 7: Collecte continue

- [ ] Vérifier ce qui tourne déjà (`scripts/systemd/*`, `radar-report.timer`)
- [ ] Rendre la collecte des sources NA **continue** et le dire : fréquence,
      unité, journal, et ce qui se passe en cas d'échec
- [ ] Un contrôle de santé des sources : une source muette depuis N jours doit
      apparaître dans un rapport, pas disparaître
- [ ] Commit : `feat(ops): collecte NA continue et surveillée`

**Critère :** une preuve d'exécution réelle (log, `systemctl status`, ou run
manuel tracé) — pas une intention.

## Task 8: Audit zéro trou

- [ ] Tous les départements NA ont au moins un événement, ou une raison écrite
- [ ] Toutes les sources NA activées ont produit quelque chose sur 7 jours, ou
      sont classées muettes avec leur motif
- [ ] Aucune entité NA citée sans organisation, ou non-résolution documentée
- [ ] Écrire `bench/results/na-audit-2026-11-21.json` + un tableau lisible
- [ ] Commit : `mesure(na): audit zéro trou`

## Task 9: Rapport de nuit

- [ ] `docs/rapport-nuit-na-2026-11-21.md` : la baseline, ce qui a bougé et de
      combien, ce qui reste ouvert et pourquoi
- [ ] `pnpm typecheck` + `bash scripts/verify-all.sh`, corriger si rouge
- [ ] `git status` propre (hors `AGENTS.md`, `.claude/`)
- [ ] Commit : `docs(mission): rapport de nuit Nouvelle-Aquitaine`

## Arrêt

La mission s'arrête quand les Tasks 0 à 9 sont cochées, ou quand celles qui ne
peuvent pas l'être sont explicitement documentées. Écrire alors
`MISSION-COMPLETE`. Ne pas enchaîner sur autre chose sans le plan écrit.
