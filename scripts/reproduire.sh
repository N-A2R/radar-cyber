#!/usr/bin/env bash
# Reproduit, sans réseau et depuis un clone propre, le chiffre et l'empreinte
# publiés de la couverture du corpus consolidé. Voir docs/reproduction-couverture.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIXTURE="bench/couverture/reproduction-fixture.sql"
RAPPORT_PUBLIE="bench/results/couverture-mesuree.json"
HASH_FICHIER="bench/couverture/HASH"
TSX="apps/api/node_modules/.bin/tsx"

HASH_ATTENDU="fee9681c3869baffa645ac20b1679edb82c45597433185923734c4cdf0397c26"
TAUX_ATTENDU="0"
VUS_ATTENDU="0"
TOTAL_ATTENDU="50"
PUBLIABLE_ATTENDU="true"

die() { printf 'ÉCHEC reproduction : %s\n' "$*" >&2; exit 1; }

for fichier in "$FIXTURE" "$RAPPORT_PUBLIE" "$HASH_FICHIER" "$TSX"; do
	[[ -f "$fichier" ]] || die "fichier absent : $fichier"
done
for cmd in node psql createdb dropdb pg_isready; do
	command -v "$cmd" >/dev/null 2>&1 || die "commande absente : $cmd"
done

export PGHOST="${REPRO_PGHOST:-127.0.0.1}"
export PGPORT="${REPRO_PGPORT:-5433}"
export PGUSER="${REPRO_PGUSER:-radar}"
export PGPASSWORD="${REPRO_PGPASSWORD:-radar}"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/couv-repro.XXXXXX")"
DB="couv_repro_$$_$(date +%s)"
DB_CREEE=0
PG_PID=""

nettoyer() {
	local code=$?
	set +e
	if [[ "$DB_CREEE" == "1" ]]; then
		psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -q -c \
			"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1
		dropdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --if-exists "$DB" >/dev/null 2>&1 \
			|| printf 'attention : base éphémère %s non supprimée\n' "$DB" >&2
	fi
	if [[ -n "$PG_PID" ]]; then
		kill "$PG_PID" >/dev/null 2>&1
		wait "$PG_PID" >/dev/null 2>&1
	fi
	[[ -d "$TMP" ]] && rm -rf "$TMP"
	exit "$code"
}
trap nettoyer EXIT

if ! pg_isready -q -h "$PGHOST" -p "$PGPORT"; then
	command -v pnpm >/dev/null 2>&1 || die "PostgreSQL absent et pnpm introuvable"
	printf '→ démarrage du PostgreSQL intégré (aucun téléchargement)…\n'
	PGDATA="$TMP/pgdata" PGPORT="$PGPORT" pnpm db:up >"$TMP/pg.log" 2>&1 &
	PG_PID=$!
	pret=0
	for _ in $(seq 1 120); do
		if pg_isready -q -h "$PGHOST" -p "$PGPORT"; then pret=1; break; fi
		if ! kill -0 "$PG_PID" >/dev/null 2>&1; then cat "$TMP/pg.log" >&2; die "PostgreSQL intégré arrêté"; fi
		sleep 0.5
	done
	if [[ "$pret" != "1" ]]; then cat "$TMP/pg.log" >&2; die "PostgreSQL intégré non prêt"; fi
fi

printf '→ base éphémère %s\n' "$DB"
createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DB" >/dev/null
DB_CREEE=1
psql -v ON_ERROR_STOP=1 -q -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -f "$FIXTURE" >/dev/null

URL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${DB}"
printf '→ rejeu et comparaison au rapport publié…\n'
SORTIE="$(DATABASE_URL="$URL" "$TSX" scripts/mesure-couverture-systeme.mts --check)"
printf '%s\n' "$SORTIE"
CONFORME="couverture conforme : ${TAUX_ATTENDU} % (${VUS_ATTENDU}/${TOTAL_ATTENDU})"
[[ "$SORTIE" == *"$CONFORME"* ]] || die "chiffre inattendu : $SORTIE"

lire() {
	node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
	  const v=process.argv[2].split(".").reduce((o,k)=>o==null?undefined:o[k],r);
	  if (v===undefined) process.exit(2); process.stdout.write(String(v));' "$1" "$2"
}

CALCULE="$TMP/rapport.json"
DATABASE_URL="$URL" "$TSX" scripts/mesure-couverture-systeme.mts --json="$CALCULE" >/dev/null

HASH_CALCULE="$(lire "$CALCULE" hashCorpus)"
HASH_RAPPORT="$(lire "$RAPPORT_PUBLIE" hashCorpus)"
HASH_FIXE="$(tr -d '[:space:]' <"$HASH_FICHIER")"
[[ "$HASH_CALCULE" == "$HASH_ATTENDU" ]] || die "empreinte recalculée $HASH_CALCULE"
[[ "$HASH_RAPPORT" == "$HASH_ATTENDU" ]] || die "empreinte du rapport publié $HASH_RAPPORT"
[[ "$HASH_FIXE" == "$HASH_ATTENDU" ]] || die "empreinte du fichier HASH $HASH_FIXE"

for cle in global.vus global.total global.taux publication.publiable; do
	valeur="$(lire "$CALCULE" "$cle")"
	attendu=""
	case "$cle" in
		global.vus) attendu="$VUS_ATTENDU" ;;
		global.total) attendu="$TOTAL_ATTENDU" ;;
		global.taux) attendu="$TAUX_ATTENDU" ;;
		publication.publiable) attendu="$PUBLIABLE_ATTENDU" ;;
	esac
	[[ "$valeur" == "$attendu" ]] || die "$cle : publié $attendu / recalculé $valeur"
done

printf 'empreinte SHA-256 : %s\n' "$HASH_CALCULE"
printf 'couverture : %s %% (%s/%s)\n' "$TAUX_ATTENDU" "$VUS_ATTENDU" "$TOTAL_ATTENDU"
printf 'publiable : %s\n' "$PUBLIABLE_ATTENDU"
printf 'reproduction conforme\n'
exit 0
