# BODACC — procédures collectives par SIREN

## Ce que c'est

Le BODACC publie les annonces légales des entreprises : jugements d'ouverture
de liquidation ou de redressement, sauvegardes, radiations. Une procédure
collective régionale est un **signal daté de défaillance d'entreprise** — un
fournisseur, un prestataire, un client local qui s'arrête.

La source est **nationale** (DILA, `bodacc-datadila.opendatasoft.com`). Elle
n'est jamais présentée comme une source locale : le filtre Nouvelle-Aquitaine
(`region_code=75`, code INSEE) est appliqué à la lecture des annonces.

## Preuve conservée

Chaque événement `family='bodacc'` porte trois éléments non nuls, imposés par
`db/migrate-200-bodacc-pc.sql` :

| Champ | Source | Contrainte SQL |
|---|---|---|
| `observed_at` | `dateparution` de l'annonce | `IS NOT NULL` |
| `evidence->>'siren'` | `registre[]` (9 chiffres) | `~ '^[0-9]{9}$'` |
| `evidence->>'url_bodacc'` | `url_complete` du dataset | `~ '^https://www\.bodacc\.fr/'` |

L'URL est celle de l'annonce d'origine, pas une reconstruction : le dataset
expose directement
`https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:…`.

## Données personnelles

Rien de personnel n'est stocké :

- `commercant` n'est pas recopié (il porte un nom de personne physique pour les
  dossiers `pp`) ;
- `listepersonnes` n'est lu que pour récupérer la `denomination` d'une
  **personne morale** (`typePersonne='pm'`) ; un dossier `pp` reste anonyme et
  son titre utilise le SIREN ;
- ni adresse, ni code postal, ni nom de dirigeant.

Seuls le SIREN, la ville, le département, le tribunal et la nature du jugement
sont conservés.

## Fonctionnement

- Collecteur dédié : `apps/api/src/collectors/bodacc.collector.ts`
  (`id` = `bodacc:pc-na`, `family` = `bodacc`, intervalle 3600 s).
- Fenêtre lue à chaque run : 30 jours glissants, 300 annonces au plus,
  pagination par 100, arrêt dès qu'une annonce sort de la fenêtre.
- Déduplication par `dedup_key = bodacc:<id annonce>`.
- Le moteur générique exclut la source (`generic.ts`) : elle a son collecteur.

## Exécution

```bash
pnpm migrate            # applique migrate-200-bodacc-pc.sql
pnpm collecte:bodacc    # collecte et écrit
pnpm collecte:bodacc -- --dry-run
```

## Critère de sortie

```sql
SELECT count(*) FROM event
 WHERE family='bodacc' AND observed_at >= now() - interval '30 days';
-- ≥ 50

SELECT count(*) FROM event
 WHERE family='bodacc'
   AND (evidence->>'url_bodacc' IS NULL
        OR evidence->>'siren' IS NULL
        OR observed_at IS NULL);
-- 0
```

Mesure du 2026-11-22 : 300 événements sur 30 jours, 0 preuve incomplète,
294 SIREN distincts.
