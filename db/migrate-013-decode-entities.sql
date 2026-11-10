-- Décode les entités HTML échappées deux fois par certains flux RSS.
-- Diagnostic du 2026-11-10 : 186 événements affichaient « d&#xE9;fectueux ».
-- La correction à la source est dans `collectors/generic.ts` (`decodeEntities`);
-- ce script répare l'existant. Idempotent.

/** Convertit un nombre hexadécimal en entier (Postgres n'a pas de cast fiable). */
CREATE OR REPLACE FUNCTION hex_to_int(hex text) RETURNS integer AS $$
DECLARE
  digits text := '0123456789ABCDEF';
  h text := upper(btrim(hex));
  total integer := 0;
  i integer;
BEGIN
  IF hex IS NULL OR length(h) = 0 THEN RETURN NULL; END IF;
  FOR i IN 1..length(h) LOOP
    total := total * 16 + (strpos(digits, substr(h, i, 1)) - 1);
  END LOOP;
  RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION decode_numeric_entities(txt text) RETURNS text AS $$
DECLARE
  out text := '';
  i integer := 1;
  num text;
  code integer;
BEGIN
  IF txt IS NULL OR position('&#' IN txt) = 0 THEN RETURN txt; END IF;
  WHILE i <= length(txt) LOOP
    IF substr(txt, i, 2) = '&#' THEN
      num := '';
      i := i + 2;
      WHILE i <= length(txt) AND substr(txt, i, 1) <> ';' LOOP
        num := num || substr(txt, i, 1);
        i := i + 1;
      END LOOP;
      IF i <= length(txt) THEN i := i + 1; END IF; -- saute le « ; »
      BEGIN
        IF lower(left(num, 1)) = 'x' THEN
          code := hex_to_int(substr(num, 2));
        ELSE
          code := num::integer;
        END IF;
        out := out || chr(code);
      EXCEPTION WHEN OTHERS THEN
        out := out || '&#' || num || ';';
      END;
    ELSE
      out := out || substr(txt, i, 1);
      i := i + 1;
    END IF;
  END LOOP;
  RETURN out;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Entités nommées courantes (le reste est laissé tel quel : mieux vaut un
-- « &eacute; » résiduel qu'un « &notanentity; » transformé en charabia).
UPDATE event
SET title = replace(replace(replace(replace(replace(
      title, '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&apos;', '''')
WHERE title LIKE '%&amp;%' OR title LIKE '%&lt;%' OR title LIKE '%&gt;%'
   OR title LIKE '%&quot;%' OR title LIKE '%&apos;%';

UPDATE event SET title = decode_numeric_entities(title) WHERE title LIKE '%&#%';

UPDATE event
SET summary = replace(replace(replace(replace(replace(
      summary, '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&apos;', '''')
WHERE summary LIKE '%&amp;%' OR summary LIKE '%&lt;%' OR summary LIKE '%&gt;%'
   OR summary LIKE '%&quot;%' OR summary LIKE '%&apos;%';

UPDATE event SET summary = decode_numeric_entities(summary) WHERE summary LIKE '%&#%';
