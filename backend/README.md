# Workspace OS — backend

Node.js · TypeScript · Express · PostgreSQL · Prisma · Socket.IO. JWT auth (short-lived access token + rotating refresh token). Files go through a storage abstraction (local disk, or any S3-compatible bucket). API reference: [docs/API.md](docs/API.md).

## Architecture
```mermaid
flowchart LR
  subgraph Browser
    UI[Existing React UI<br/>App / views / blocks] --> Store[store.tsx<br/>set() + SyncEngine]
    Store -->|REST + Bearer| API
    Store <-->|Socket.IO| RT
  end
  subgraph Backend
    API[Express routes<br/>zod validation] --> AZ[requireWorldRole + scopeParam<br/>server-side authz]
    AZ --> Svc[services: split, versions, activity]
    Svc --> DB[(PostgreSQL via Prisma)]
    API --> FS[(Storage: local / S3)]
    Svc --> RT[Socket.IO rooms per world]
  end
```
The UI still mutates state through `set(draft => …)`. `store.tsx` applies that optimistically, diffs before/after, and the `SyncEngine` (`src/api/sync.ts`) sends debounced create/update/delete calls in dependency order. Remote changes arrive over Socket.IO and are merged in without being echoed back.

## Setup
```bash
# 1. PostgreSQL (example)
docker run -d --name wos-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=workspace_os postgres:16

# 2. Backend
cd backend
cp .env.example .env            # set JWT secrets: openssl rand -hex 32
npm install
npx prisma migrate dev --name init   # generates the client and creates the first migration (commit prisma/migrations)
npm run seed                    # optional demo accounts + sample data
npm run dev                     # http://localhost:4000

# 3. Frontend (repo root)
pnpm install        # or: npm install --legacy-peer-deps
echo 'VITE_API_URL=http://localhost:4000' > .env.local
pnpm dev            # http://localhost:8443
```
Production: `npm run build && npx prisma migrate deploy && npm start`; frontend `pnpm build`. Add your frontend origin to `CORS_ORIGINS`.

Seed logins (dev only): `owner@workspace.local` / `collaborator@workspace.local`, password `password123`.

## Environment variables
See `.env.example`: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `PORT`, `NODE_ENV`, `CORS_ORIGINS` (must include `http://localhost:8443`), `STORAGE_PROVIDER` (`local`|`s3`), `STORAGE_LOCAL_DIR`, `S3_*`, `AUTH_RATE_LIMIT_MAX`. Frontend: `VITE_API_URL`.

## Tests
Use a **dedicated** database whose URL contains `test` — the suite truncates all tables and refuses to run otherwise.
```bash
createdb workspace_os_test   # or a second docker DB
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/workspace_os_test" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/workspace_os_test" npm test
```
Covers auth, world permissions (including "User A cannot access User B's private world" and cross-world ID tampering), pages/blocks/versions, projects/tasks, transactions and split math, files.

## Known limitations
See the end of the delivery notes; in short: tests and the backend build have not been run in the authoring sandbox, no email provider, page edits are last-write-wins, no offline queue across reloads.
