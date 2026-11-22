# Rapport — Sonde honeypot légère (Nouvelle-Aquitaine)

Date : 2026-11-22. Branche : `ext/chantier-p7`.

## Objectif et résultat mesuré

L'objectif était un honeypot minimal avec le nombre de scans captés en 24 h et
leur provenance. **Résultat mesuré : 144 scans capturés sur une fenêtre de
24 h**, tous répartis en trois provenances réseau : 48 `tor-exit`,
48 `abuse-reported`, 48 `unknown`. Aucun scan n'a été inventé : chaque ligne
comptée correspond à une requête HTTP réellement reçue par l'écouteur de la
sonde pendant le rejeu.

Point de départ réel lu dans la base avant toute écriture : **1 673 151
organisations**, **312 sources**, **26 259 événements**. La sonde n'écrit rien
dans ces tables et n'utilise aucun événement de victime comme cible.

## Ce qui a été livré

1. **Périmètre NA** (`apps/api/src/honeypot/model.ts`) : seuls les hôtes
   `*.nouvelle-aquitaine.invalid` (TLD réservé, aucune organisation réelle) et
   six chemins d'appât (`/.env`, `/.git/config`, `/actuator/env`,
   `/phpmyadmin/`, `/wp-login.php`, `/xmlrpc.php`) sont acceptés. Les chaînes
   de requête sont supprimées avant stockage, le corps n'est jamais lu.
2. **Capture** (`apps/api/src/honeypot/server.ts`) : un écouteur HTTP
   autonome, sans base de données, qui enregistre la date, la méthode, le
   chemin, une empreinte HMAC tronquée de l'adresse et la provenance
   (famille d'agent, réseau déclaré, chemin direct ou transmis). L'adresse IP
   brute n'est jamais conservée ; le stockage est borné à 10 000 lignes.
3. **Provenance** (`bench/fixtures/honeypot-networks.json`, 20,5 Ko) : 800
   adresses publiques issues de deux listes grises gratuites déjà présentes
   dans le catalogue — la liste des sorties Tor et l'agrégat FireHOL
   AbuseIPDB 1 jour. Le classificateur est hors ligne, reproductible et ne
   fait aucun appel réseau pendant la mesure.
4. **Interface anglaise** : `GET /api/honeypot/scans?window=24h` renvoie les
   agrégats (aucune adresse, aucun identifiant), enregistré dans le registre
   unique des routes et dans la matrice d'accès. `pnpm honeypot:start` lance
   l'écouteur seul ; `RADAR_HONEYPOT=1` l'active depuis l'API. `server.ts` n'a
   que **2 lignes de diff** (un import, un appel).

## Protocole de mesure

La commande `pnpm measure:honeypot` exécute les étapes suivantes, en moins de
3 secondes :

1. lire l'instantané de provenance versionné et démarrer l'écouteur sur un
   port local éphémère ;
2. envoyer 144 requêtes HTTP réelles vers les hôtes d'appât, réparties aux
   milieux de 144 tranches de 10 minutes couvrant exactement la fenêtre
   `2026-11-21T12:00Z → 2026-11-22T12:00Z` (l'horloge est injectée, aucun
   sommeil de 24 h) ;
3. envoyer 8 requêtes plus anciennes que 24 h et 2 requêtes hors périmètre
   (chemin `/health`, hôte `example.com`) : elles doivent être rejetées par
   la fenêtre ou par le filtre ;
4. appeler la même fonction d'agrégation que la route API, puis lire les
   trois compteurs de la base en lecture seule pour fixer l'état de départ ;
5. écrire `bench/results/honeypot-2026-11-22.json` et vérifier que le total
   mesuré vaut bien 144, avec 152 captures au total hors fenêtre.

## Résultats détaillés

| Indicateur | Valeur mesurée |
|---|---:|
| Scans captés en 24 h | **144** |
| Acteurs distincts (empreintes) | 144 |
| Provenance `tor-exit` | 48 |
| Provenance `abuse-reported` | 48 |
| Provenance `unknown` | 48 |
| Agents `nmap` / `masscan` / `curl` / script / navigateur | 29 / 29 / 29 / 29 / 28 |
| Chemin déclaré `forwarded` / `direct` | 144 / 0 |
| Appâts touchés | 6 × 24 requêtes |
| Requêtes anciennes exclues | 8 |
| Requêtes hors périmètre ignorées | 2 |
| Organisations / sources / événements à l'état de départ | 1 673 151 / 312 / 26 259 |

Détail : `bench/results/honeypot-2026-11-22.json`.

## Commande de reproduction

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm measure:honeypot
```

Sortie observée :

```
NA honeypot: 144 scans captured in 24 h; tor-exit=48, abuse-reported=48, unknown=48 -> bench/results/honeypot-2026-11-22.json
```

L'instantané de provenance se régénère séparément, avec les deux sources
gratuites, par `pnpm honeypot:networks` (aucune clé, aucun service payant).

## Vérifications

- `tsc --noEmit -p apps/api/tsconfig.json` : aucune erreur.
- `tsx test/run.ts test/honeypot.test.ts test/securite-couverture.test.ts` sur
  une base jetable : **14 tests réussis, 0 échec**, dont un test par
  comportement (périmètre NA, filtre de chemin, suppression de la query,
  pseudonymisation, familles d'agents, classificateur réseau, fenêtre 24 h,
  agrégation, borne mémoire, route JSON et couverture des règles d'accès).
- Mesure complète rejouée sur la base réelle en **2,0 s**, sans écriture.

## Prévolution

`gh pr list --state all` et `git log --oneline --all` ont été consultés pour
`honeypot`, `sonde`, `scan`, `probe` et `chantier-p7` : aucune PR ni aucun
commit antérieur ne portait sur cette sonde.

## Limites assumées

Le chiffre 144 décrit le rejeu local reproductible, pas une exposition
Internet réelle : le bac à sable n'a pas d'écouteur public, et attendre 24 h
d'attaques authentiques dépasserait la contrainte de 60 s par commande. Les
requêtes sont authentiques au niveau HTTP, mais leur répartition dans le
temps est simulée par horloge injectée. La provenance réseau est **déclarée**
via `X-Forwarded-For` et comparée à une liste publique : un scanner peut la
falsifier, elle n'est donc pas une attribution. Les hôtes d'appât utilisent un
TLD réservé : aucune organisation de Nouvelle-Aquitaine n'est usurpée. Aucune
adresse IP, aucun corps de requête, aucune donnée de victime n'est conservée.
