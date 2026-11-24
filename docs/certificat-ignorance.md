# Certificat d'ignorance par organisation

Un score de couverture répond « combien d'organisations sont couvertes ». Il ne
dit pas **ce que le radar ne sait pas** d'une organisation donnée. Le registre
`org_unknown` rend chaque absence de preuve explicite, datée et nommée.

## Portée

Une ligne signifie : *à la date `checked_at`, le radar ne détient aucune preuve
de ce champ pour cette organisation*. Ce n'est **pas** une affirmation sur le
monde : une organisation sans domaine connu peut avoir un site, une absence
d'événement rattaché ne prouve pas une absence d'incident. Les sources
nationales restent des sources nationales ; aucun champ n'infère une portée
géographique locale.

Aucune donnée personnelle : le catalogue contient `contact_public`, qui
consigne l'absence de contact dans le référentiel, jamais un nom, une adresse,
un courriel ou un numéro.

## Catalogue (`unknown_field`)

| Champ | Condition d'absence de preuve |
|---|---|
| `domaine` | ni `domain` ni `website` renseignés |
| `actifs` | aucun `asset` rattaché |
| `evenements` | aucun `event` rattaché |
| `certificat_tls` | aucun actif de type `cert` / `certificate` / `tls` |
| `localisation` | `lat` ou `lon` absent |
| `identifiant_legal` | `siren` absent |
| `secteur` | `sector` absent |
| `code_postal` | `code_postal` absent du référentiel |
| `alias` | aucun `org_alias` rattaché |
| `historique` | aucune version dans `org_history` |
| `contact_public` | aucun champ de contact n'existe dans `org` (absence structurante) |

La table est écrite par `enregistrer_org_unknown(p_limit)` (migration 217),
rejouable : une relance rafraîchit `checked_at` sans créer de doublon
`UNIQUE (org_id, unknown_field)`. Le scan initial est joué par la migration,
puis les déploiements passent par `scripts/bootstrap.mts`.

## Critère et vérification

Critère exécuté tel quel :

```sql
SELECT count(*) FROM org_unknown
 WHERE unknown_field IS NOT NULL
   AND checked_at IS NOT NULL;
```

Cible : **10 261 lignes**, avec **au moins 3 champs distincts par organisation**.

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
  npx tsx scripts/certificat-ignorance.mts --check
DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
  npx tsx scripts/certificat-ignorance.mts --apply
```

Lecture publique : `GET /api/certificat-ignorance?orgId=<id>&limit=100`. La
réponse répète la portée et ne renvoie que l'identifiant public de l'org, le
champ inconnu, la raison et la date du contrôle.
