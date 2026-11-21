-- 043 — Nettoyage des organisations créées depuis un indice contenant `www.`
-- et d'une organisation créée depuis un TLD invalide (`.dom`).
--
-- Contexte : avant la correction (apps/api/src/quarantine/from-hint.ts pour le
-- nom, apps/api/src/match/famille-indice.ts pour le TLD), le nom de
-- l'organisation était l'indice brut. Quatre créations de la file 5433 portent
-- donc `www.` dans `org.name` et `www ` dans leur alias `name-full`, alors que
-- leur `domain` était déjà normalisé. Une cinquième porte le domaine invalide
-- `coteg-toulouse.dom` comme nom **et** comme domaine.
--
-- Portée volontairement minimale : seuls les cinq identifiants observés, avec
-- les valeurs exactes relevées en base, sont éligibles. Chaque UPDATE est
-- conditionné à la valeur encore présente, donc le fichier est idempotent :
-- un second passage ne touche aucune ligne. `name_norm` est une colonne
-- GENERATED ALWAYS (migration 041) : elle suit `name` automatiquement et
-- n'est jamais écrite ici.
--
-- Aucune organisation n'est supprimée. Pour 2423932, le TLD `.dom` n'étant pas
-- un TLD valide, l'indice est désormais classé famille « nom » : on garde
-- l'organisation en nettoyant son nom, on vide son domaine devenu invalide,
-- on corrige l'alias de nom et on retire seulement l'alias de domaine obsolète.

-- (a) Les quatre noms `www.<domaine>` : retrait du préfixe `www.` uniquement.
UPDATE org AS o
   SET name = substring(o.name from 5)
  FROM (VALUES
    (2423928, 'www.nicecloud.nl'),
    (2423936, 'www.worldwidefittings.com'),
    (2423937, 'www.ccmcnet.com'),
    (2423941, 'www.osiiminppal.com')
  ) AS attendu(id, name_avant)
 WHERE o.id = attendu.id
   AND o.name = attendu.name_avant
   AND starts_with(o.name, 'www.');

-- Le même retrait sur l'alias de nom entier : `www nicecloud nl` → `nicecloud nl`.
-- Les alias `source='domain'` sont déjà corrects et ne changent pas.
UPDATE org_alias AS a
   SET alias = substring(a.alias from 5)
  FROM (VALUES
    (2423928, 'www nicecloud nl'),
    (2423936, 'www worldwidefittings com'),
    (2423937, 'www ccmcnet com'),
    (2423941, 'www osiiminppal com')
  ) AS attendu(org_id, alias_avant)
 WHERE a.org_id = attendu.org_id
   AND a.source = 'name-full'
   AND a.alias = attendu.alias_avant
   AND starts_with(a.alias, 'www ');

-- (b) `coteg-toulouse.dom` : nom nettoyé, domaine invalide vidé.
UPDATE org
   SET name = 'coteg-toulouse',
       domain = NULL
 WHERE id = 2423932
   AND name = 'coteg-toulouse.dom'
   AND domain = 'coteg-toulouse.dom';

UPDATE org_alias
   SET alias = 'coteg toulouse'
 WHERE org_id = 2423932
   AND source = 'name-full'
   AND alias = 'coteg toulouse dom';

-- L'alias de domaine n'a plus de domaine à désigner : seul cet alias est retiré.
DELETE FROM org_alias
 WHERE org_id = 2423932
   AND source = 'domain'
   AND alias = 'coteg-toulouse.dom';
