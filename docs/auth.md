# Authentication

## Roles
- `admin` : full access, can register users.
- `analyste` : read + mutate.
- `lecteur` : read only.

## Create first admin
Set `RADAR_ADMIN_PASSWORD` and run:
```
RADAR_ADMIN_PASSWORD=secret npx tsx scripts/create-admin.mts admin@example.com
```
First registered user becomes admin automatically.

## Login
POST /api/auth/login { email, password } -> { token, user }.
Send `Authorization: Bearer <token>` on subsequent requests.
