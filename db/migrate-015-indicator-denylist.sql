-- 015 — dénylist d'indicateurs légitimement courants
--
-- Les collecteurs extraient les hôtes cités dans le texte des articles ; sans
-- cette table, un article mentionnant `cloudflare.com` crée un indicateur.
-- `scripts/build-warninglist.mts` produit `db/indicator-denylist.json` depuis
-- les warninglists MISP (listes « Top » mondiales + réseaux de datacenters).
-- `apps/api/src/collectors/warninglist.ts` charge ce JSON et écarte les
-- indicateurs qu'il contient, avant l'INSERT du collecteur générique.

CREATE TABLE IF NOT EXISTS indicator_denylist (
  id    bigserial PRIMARY KEY,
  kind  text NOT NULL CHECK (kind IN ('domain', 'network')),
  value text NOT NULL,
  UNIQUE (kind, value)
);

-- La comparaison se fait en minuscules côté applicatif : l'index doit suivre.
CREATE INDEX IF NOT EXISTS indicator_denylist_lower_value_idx
  ON indicator_denylist (lower(value));

-- Chargement optionnel (le runtime lit `db/indicator-denylist.json`, pas cette
-- table ; elle sert à l'audit et aux requêtes SQL). À exécuter à la main :
--
-- \copy indicator_denylist (kind, value) FROM PROGRAM 'node -e "const d=require(\"./db/indicator-denylist.json\");process.stdout.write([...d.domains.map(x=>`domain\t${x}`),...d.networks.map(x=>`network\t${x}`)].join(\"\\n\"))"' WITH (FORMAT text, DELIMITER E'\t')
--
-- Vérification :
-- SELECT kind, count(*) FROM indicator_denylist GROUP BY kind;
