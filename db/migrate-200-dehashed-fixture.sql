-- 200 : cinq réponses DeHashed simulées, sans abonnement ni appel réseau.
--
-- Ce jeu de données est un fixture : il n'a aucun lien avec une fuite réelle
-- et aucune source nationale n'est présentée comme locale. Seules des
-- métadonnées sont conservées (nom, domaine fictif, date, nombre de comptes,
-- URL de preuve). Aucun courriel, mot de passe, IP ou secret n'est stocké.
-- Les identifiants sont stables pour que l'adaptateur et la base décrivent
-- exactement les mêmes cinq références.
DELETE FROM fuite_reference WHERE source = 'dehashed-fixture';

INSERT INTO fuite_reference (id, source, name, domain, breach_date, accounts, source_url, evidence)
VALUES
  ('dehashed-fixture:dh-001', 'dehashed-fixture', 'Fuite simulée 01 — service alpha',
   'alpha.example', '2024-01-15', 1200, 'https://example.invalid/dehashed-fixture/01',
   '{"fixture":"01-service-alpha.json","mode":"fixture"}'::jsonb),
  ('dehashed-fixture:dh-002', 'dehashed-fixture', 'Fuite simulée 02 — association beta',
   'beta.example', '2024-03-22', 340, 'https://example.invalid/dehashed-fixture/02',
   '{"fixture":"02-association-beta.json","mode":"fixture"}'::jsonb),
  ('dehashed-fixture:dh-003', 'dehashed-fixture', 'Fuite simulée 03 — coopérative gamma',
   'gamma.example', '2024-05-07', 8900, 'https://example.invalid/dehashed-fixture/03',
   '{"fixture":"03-cooperative-gamma.json","mode":"fixture"}'::jsonb),
  ('dehashed-fixture:dh-004', 'dehashed-fixture', 'Fuite simulée 04 — collectivité delta',
   'delta.example', '2024-08-30', 65, 'https://example.invalid/dehashed-fixture/04',
   '{"fixture":"04-collectivite-delta.json","mode":"fixture"}'::jsonb),
  ('dehashed-fixture:dh-005', 'dehashed-fixture', 'Fuite simulée 05 — fournisseur epsilon',
   'epsilon.example', NULL, NULL, 'https://example.invalid/dehashed-fixture/05',
   '{"fixture":"05-fournisseur-epsilon.json","mode":"fixture"}'::jsonb);
