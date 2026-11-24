"""Lance les tests Python du dépôt sans dépendance pytest (stdlib uniquement)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_online_fdr import test_fdr_en_ligne_sur_rejeu_90_jours  # noqa: E402


def main() -> int:
    try:
        test_fdr_en_ligne_sur_rejeu_90_jours()
    except AssertionError as erreur:
        print(f"ÉCHEC test_online_fdr : {erreur}", file=sys.stderr)
        return 1
    print("OK: test_online_fdr (FDR en ligne, 90 jours)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
