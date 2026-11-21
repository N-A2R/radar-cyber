-- 061: role-level referential of public office holders in Nouvelle-Aquitaine.
-- A row describes a public office attached to an organisation, never a person:
-- no name, contact detail, identifier or victim information is stored.
CREATE TABLE IF NOT EXISTS public_mandate (
  id bigserial PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES org (id) ON DELETE CASCADE,
  mandate_role text NOT NULL CHECK (mandate_role IN (
    'mayor', 'epci_president', 'department_president', 'region_president'
  )),
  jurisdiction_kind text NOT NULL CHECK (jurisdiction_kind IN (
    'commune', 'epci', 'departement', 'region'
  )),
  jurisdiction_code text NOT NULL,
  siren text,
  dept text,
  source text NOT NULL,
  proof_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, mandate_role)
);
CREATE INDEX IF NOT EXISTS public_mandate_role_idx ON public_mandate (mandate_role);
CREATE INDEX IF NOT EXISTS public_mandate_dept_idx ON public_mandate (dept);
CREATE INDEX IF NOT EXISTS public_mandate_jurisdiction_idx
  ON public_mandate (jurisdiction_kind, jurisdiction_code);
