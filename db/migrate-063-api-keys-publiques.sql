-- Clés d'API publiques : empreinte SHA-256 seulement, quota par fenêtre,
-- portée lecture/écriture. Le secret n'est jamais stocké en clair : il n'est
-- renvoyé qu'une fois, à la création.
CREATE TABLE IF NOT EXISTS api_key (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  scope text NOT NULL DEFAULT 'read' CHECK (scope IN ('read', 'write')),
  quota integer NOT NULL DEFAULT 60 CHECK (quota >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  window_start timestamptz,
  used integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_key_user ON api_key (user_id) WHERE revoked_at IS NULL;
COMMENT ON COLUMN api_key.quota IS 'Nombre maximal de requêtes par fenêtre de 60 secondes. 0 = clé sans quota.';
