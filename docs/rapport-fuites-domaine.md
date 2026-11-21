# Rapport — Fuites rattachées par domaine

**Date de mesure :** 21 novembre 2026 (22 h 04 UTC).
**Périmètre :** Nouvelle-Aquitaine uniquement. Sources grises admises, aucun service payant.

## Résultat

**Le nombre de fuites rattachées à une organisation de Nouvelle-Aquitaine par domaine est 2.**

Les deux rattachements concernent deux organisations distinctes du référentiel, à partir de revendications publiques de `ransomwatch` (source grise) :

| Organisation (id) | Domaine racine | Source | Revendication (id) |
|---:|---|---|---:|
| 168102 | `sefiso-atlantique.fr` | ransomwatch | 14826 |
| 604869 | `fol-23.fr` | ransomwatch | 15319 |

Aucun nom de victime, courriel, mot de passe, adresse IP ni corps de texte TLP:RED n'est lu, stocké ou publié : la mesure ne manipule que des identifiants, des racines de domaine et des compteurs. Le JSON publié contient les identifiants d'organisation et les racines de domaine, jamais de donnée personnelle.

## État réel de départ

La mesure est effectuée sur la base de travail réelle (`postgres://radar:radar@localhost:5433/radar`), telle que fournie, et non sur un jeu de démonstration :

| Grandeur | Valeur mesurée | Requête |
|---|---:|---|
| Organisations | 1 673 151 | `SELECT count(*) FROM org;` |
| Sources | 312 | `SELECT count(*) FROM source;` |
| Événements | 26 688 | `SELECT count(*) FROM event;` |
| Revendications avec indice de domaine | 16 756 | `SELECT count(*) FROM quarantine_raw WHERE kind='claim' AND org_hint IS NOT NULL;` |
| Organisations portant un domaine ou un site web | 88 | `SELECT count(*) FROM org WHERE domain IS NOT NULL OR website IS NOT NULL;` |

Les requêtes exactes sont publiées dans le résultat committable `bench/results/leaks-by-domain-2026-11-21.json` (champ `sql`).

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:leaks-by-domain --json=bench/results/leaks-by-domain-2026-11-21.json
```

Sortie observée :

```
NA leaks attached by domain: 2 (claims=16756, domain orgs=88, orgs=1673151, sources=312, events=26688)
```

La commande lit les tables, calcule le rattachement avec la même fonction que l'API (`measureLeaksByDomain` → `attachLeaksByDomain`), écrit le JSON de preuve et ferme ses connexions. Elle s'exécute en environ une seconde, sans appel réseau ni service payant.

## Méthode, étape par étape

1. **Sélection des fuites.** Seules les revendications de `quarantine_raw` (`kind = 'claim'`) disposant d'un indice de domaine sont lues ; les champs `raw_body`, titres et autres données de victime ne figurent pas dans la requête. Les revendications rejetées sont écartées.
2. **Normalisation.** Un indice tel que `www.sefiso-atlantique.fr` ou `https://fol-23.fr/page` est réduit à sa racine enregistrable par la fonction déjà utilisée par le moteur de rattachement (`domaineRacine`). Les jetons génériques (`com`, noms d'organisation) ne produisent aucune racine et sont ignorés.
3. **Filtre Nouvelle-Aquitaine.** Seules les organisations dont le département est l'un des douze départements de la région (code INSEE ou libellé, avec ou sans accent) entrent dans l'index. Le prédicat est unique et partagé entre le calcul pur, la mesure et l'API.
4. **Rattachement strict.** Égalité exacte de racines, domaine ou site web de l'organisation. Une racine partagée par deux organisations NA n'est pas rattachée : ce serait une supposition, pas une preuve. Une même revendication n'est comptée qu'une fois.
5. **Comptage.** Nombre de revendications distinctes rattachées à au moins une organisation NA : **2**. L'API `GET /api/leaks/by-domain` expose le même compteur sous des clés anglaises, sans identifiant de revendication.

## Vérifications

- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar tsx test/run.ts test/leaks-by-domain.test.ts test/securite-couverture.test.ts` : **15 tests réussis, 0 échec**. Un test par comportement : égalité exacte, normalisation `www`/URL, exclusion hors NA, indices non-domaines, codes et libellés de département, sources grises, revendications rejetées, ambiguïté, déduplication, absence de données de victime, mesure sur les tables, contrat HTTP et couverture des règles d'accès.
- `tsc --noEmit` dans `apps/api` : réussi.
- Chaque commande exécutée reste largement sous la limite de 60 secondes (mesure : ~1 s ; tests ciblés : ~5 s ; typecheck : ~8 s).
- `apps/api/src/server.ts` n'est **pas modifié** (diff de 0 ligne) : la nouvelle route est enregistrée dans le registre unique `routes/index.ts`, avec sa règle d'accès dans `security/rbac.ts`.
- Le code, les clés JSON, la route et les messages sont en anglais ; le présent rapport est en français.

## Limites mesurées

Le référentiel ne contient que 88 organisations avec un domaine ou un site web, dont 2 en Nouvelle-Aquitaine. Le chiffre de 2 reflète donc fidèlement l'état disponible : il ne prétend pas mesurer l'ensemble des fuites concernant la région. Tant que les autres organisations NA n'auront pas de domaine vérifié, le rattachement par domaine restera limité à ces deux cas ; aucune racine n'est devinée pour gonfler le résultat.

## Prévolution

Les PR #291 (`big/Fuites`, 0 fuite NA sur 25 domaines seulement) et #299 (`big/LeakSites`, 67 revendications rattachées par nom ou domaine unique, pipeline limité à deux agrégateurs) ne publient pas ce compteur reproductible mesuré sur l'état réel complet : aucune ne couvre ce chantier. La mesure ci-dessus est donc établie sur la branche `ext/chantier-d2`.
