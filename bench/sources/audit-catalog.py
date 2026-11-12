#!/usr/bin/env python3
"""Audit statique du catalogue de sources — sans base, sans réseau.

Lit les `INSERT INTO source (...) VALUES (...)` de `db/*.sql` et répond à des
questions de qualité de catalogue, pas de disponibilité réseau :

  - familles inconnues du contrat partagé (leurs événements seraient rejetés) ;
  - identifiants et URL en doublon (deux sources pour le même flux) ;
  - répartition par famille, format, nature ;
  - flux .onion (nécessitent Tor) et URL non chiffrées ;
  - sources désactivées.

La disponibilité réelle (HTTP, items, rendement) ne peut pas être mesurée ici :
le réseau du sandbox est fermé. Voir `scripts/source-health.mts` pour ça.

    python bench/sources/audit-catalog.py --md docs/research/sources-audit.md
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def shared_families() -> list[str]:
    """Familles déclarées dans le contrat partagé : source de vérité unique."""
    text = (ROOT / "packages/shared/src/index.ts").read_text()
    block = re.search(r"export const FAMILIES = \[(.*?)\] as const", text, re.S)
    if not block:
        raise SystemExit("FAMILIES introuvable dans packages/shared/src/index.ts")
    return re.findall(r'"([^"]+)"', block.group(1))


def split_tuples(values: str) -> list[list[str]]:
    """Découpe une liste de tuples SQL en champs, en respectant les quotes."""
    rows: list[list[str]] = []
    field = ""
    fields: list[str] = []
    depth = 0
    in_string = False
    i = 0
    while i < len(values):
        ch = values[i]
        if in_string:
            if ch == "'" and i + 1 < len(values) and values[i + 1] == "'":
                field += "'"
                i += 2
                continue
            if ch == "'":
                in_string = False
            else:
                field += ch
        elif ch == "'":
            in_string = True
        elif ch == "(":
            depth += 1
            if depth == 1:
                fields, field = [], ""
                i += 1
                continue
            field += ch
        elif ch == ")":
            depth -= 1
            if depth == 0:
                fields.append(field.strip())
                rows.append(fields)
                fields, field = [], ""
                i += 1
                continue
            field += ch
        elif ch == "," and depth == 1:
            fields.append(field.strip())
            field = ""
        elif depth >= 1:
            field += ch
        i += 1
    return rows


def parse_catalogues() -> list[dict]:
    pattern = re.compile(
        r"INSERT\s+INTO\s+source\s*\(([^)]*)\)\s*VALUES(.*?);",
        re.S | re.I,
    )
    out: list[dict] = []
    for path in sorted((ROOT / "db").glob("*.sql")):
        text = path.read_text(errors="replace")
        # les lignes commentées ne comptent pas comme catalogue
        text = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("--"))
        for match in pattern.finditer(text):
            columns = [c.strip() for c in match.group(1).split(",")]
            for fields in split_tuples(match.group(2)):
                if len(fields) != len(columns):
                    continue
                row = dict(zip(columns, fields))
                row["_file"] = path.name
                out.append(row)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--md", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()

    families = shared_families()
    rows = parse_catalogues()
    # une source peut être réinsérée par un script de réparation : on garde la
    # dernière déclaration, mais on compte les réécritures.
    by_id: dict[str, dict] = {}
    declarations: Counter[str] = Counter()
    for row in rows:
        sid = row.get("id", "")
        declarations[sid] += 1
        by_id[sid] = row

    sources = list(by_id.values())
    family_counts = Counter(r.get("family", "?") for r in sources)
    invalid = {f: n for f, n in family_counts.items() if f not in families}

    urls: dict[str, list[str]] = defaultdict(list)
    for r in sources:
        urls[r.get("url", "")].append(r.get("id", ""))
    duplicate_urls = {u: ids for u, ids in urls.items() if len(ids) > 1}

    onion = [r for r in sources if ".onion" in r.get("url", "")]
    plaintext = [r for r in sources if r.get("url", "").startswith("http://")]
    disabled = [r for r in sources if r.get("enabled", "true").lower() == "false"]
    formats = Counter(r.get("format", "?") for r in sources)
    kinds = Counter(r.get("kind", "?") for r in sources)
    redeclared = {sid: n for sid, n in declarations.items() if n > 1}

    report = {
        "declarations_sql": len(rows),
        "sources_uniques": len(sources),
        "familles_connues": families,
        "familles_invalides": invalid,
        "repartition_familles": dict(family_counts.most_common()),
        "formats": dict(formats.most_common()),
        "natures": dict(kinds.most_common()),
        "urls_en_doublon": duplicate_urls,
        "identifiants_redeclares": redeclared,
        "onion": len(onion),
        "http_non_chiffre": len(plaintext),
        "desactivees": len(disabled),
    }

    lines = [
        "# Audit statique du catalogue de sources",
        "",
        f"**{len(sources)} sources uniques** déclarées dans `db/*.sql` "
        f"({len(rows)} insertions, les réparations réécrivent certaines lignes).",
        "",
        "Périmètre : qualité du **catalogue versionné**, pas disponibilité réseau. Le "
        "sandbox ne permet pas de sonder les flux ; les mesures de rendement restent à "
        "faire avec `scripts/source-health.mts` en environnement ouvert.",
        "",
        "**Écart avec le README.** Le README annonce 594 sources en base ; seules "
        f"**{len(sources)} sont déclarées dans le dépôt**. Le complément venait d'imports "
        "de fichiers externes absents du repo : `db/import-feeds.ts` attend "
        "`/tmp/osint-repos/.../threat-intelligence-feeds.csv` et `db/import-json-sources.ts` "
        "attend `/tmp/estorides-sources.json`. Un déploiement neuf ne reproduit donc pas "
        "le catalogue mesuré : les sources manquantes ne sont reconstituables qu'en "
        "retrouvant ces fichiers.",
        "",
        "## Familles inconnues du contrat",
        "",
    ]
    if invalid:
        lines += [
            f"Le contrat partagé (`packages/shared/src/index.ts`) déclare {len(families)} familles. "
            "Des sources en utilisent d'autres. **Vérification faite : `EventSchema` n'est "
            "appelé nulle part** (aucun `.parse()` dans l'API ni les scripts) : rien ne rejette "
            "ces événements, ils passent et la base contient bien des événements `leaks`. "
            "Le défaut est inverse et plus sournois — le contrat est décoratif, la dérive est "
            "silencieuse, et le front n'a ni libellé ni couleur pour ces familles.",
            "",
            "| Famille | Sources | Reconnue par le contrat |",
            "| --- | --- | --- |",
        ]
        for f, n in sorted(invalid.items(), key=lambda kv: -kv[1]):
            lines.append(f"| `{f}` | {n} | **non** |")
        lines += ["", "Sources concernées :", ""]
        for r in sources:
            if r.get("family") in invalid:
                lines.append(f"- `{r.get('id')}` — {r.get('name')} (`{r.get('_file')}`)")
    else:
        lines.append("Aucune : toutes les familles du catalogue sont reconnues.")

    lines += [
        "",
        "## Répartition par famille",
        "",
        "| Famille | Sources |",
        "| --- | --- |",
    ]
    for f, n in family_counts.most_common():
        mark = "" if f in families else " ⚠️ hors contrat"
        lines.append(f"| `{f}`{mark} | {n} |")

    lines += [
        "",
        "## Doublons d'URL",
        "",
    ]
    if duplicate_urls:
        lines += [
            f"**{len(duplicate_urls)} URL** sont déclarées par plusieurs identifiants : "
            "le même flux est collecté plusieurs fois, ce qui gonfle artificiellement "
            "le nombre de sources et le volume brut.",
            "",
            "| URL | Identifiants |",
            "| --- | --- |",
        ]
        for url, ids in sorted(duplicate_urls.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"| `{url}` | {', '.join(f'`{i}`' for i in ids)} |")
    else:
        lines.append("Aucun doublon d'URL.")

    lines += [
        "",
        "## Autres comptages",
        "",
        f"- Formats : {', '.join(f'`{k}` {v}' for k, v in formats.most_common())}",
        f"- Natures : {', '.join(f'`{k}` {v}' for k, v in kinds.most_common())}",
        f"- Flux `.onion` (nécessitent Tor) : **{len(onion)}**",
        f"- URL non chiffrées `http://` : **{len(plaintext)}**",
        f"- Sources désactivées : **{len(disabled)}**",
        f"- Identifiants réécrits par plusieurs scripts : **{len(redeclared)}**",
        "",
    ]

    text = "\n".join(lines)
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(text)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    print(text)


if __name__ == "__main__":
    main()
