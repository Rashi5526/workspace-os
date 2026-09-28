# Workspace OS API

Base URL: `http://localhost:4000`. JSON in/out. All routes except `/auth/signup|login|refresh|logout|forgot-password|reset-password` and `/health` require `Authorization: Bearer <accessToken>`.

Errors: `{ "error": { "code": "not_found", "message": "..." } }`. 401 = missing/expired token, 403 = your role is too low, 404 = doesn't exist **or you are not a member** (private worlds never confirm their existence), 409 = conflict, 400 = validation.

Roles (`owner > editor > commenter > viewer`): viewer reads; commenter also comments and updates tasks/people/ideas; editor creates/edits/deletes content and invites; owner also changes access, archives/deletes the world, manages roles.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | /auth/signup | `{name,email,password(min 8)}` | returns `{user,accessToken,refreshToken}` |
| POST | /auth/login | `{email,password}` | rate limited |
| POST | /auth/refresh | `{refreshToken}` | rotates: old token becomes invalid |
| POST | /auth/logout | `{refreshToken}` | revokes it |
| POST | /auth/forgot-password | `{email}` | always 200; token is logged in non-production (no email provider wired) |
| POST | /auth/reset-password | `{token,newPassword}` | revokes all sessions |
| GET | /auth/me | | |

## Worlds & members
| Method | Path | Min role |
|---|---|---|
| GET | /worlds | member (lists yours) |
| POST | /worlds `{id?,name,icon,accent,description,access,sandbox}` | any user |
| GET | /worlds/:worldId | viewer |
| PATCH | /worlds/:worldId `{name,icon,accent,description}` | editor |
| PATCH | /worlds/:worldId `{access,archived}` | owner |
| DELETE | /worlds/:worldId (soft delete) | owner |
| GET | /worlds/:worldId/members | viewer |
| POST | /worlds/:worldId/members/invites `{email,role}` | editor → `{inviteLink}` |
| POST | /invites/:token/accept | the invited user |
| PATCH | /worlds/:worldId/members/:userId `{role}` | owner (last owner can't be demoted) |
| DELETE | /worlds/:worldId/members/:userId | owner |

## World-scoped resources (`/worlds/:worldId/...`)
Reads need viewer. IDs may be supplied by the client on create (used for optimistic UI). Any `:id` in the path must belong to `:worldId`, else 404.

| Resource | Endpoints |
|---|---|
| pages | GET / · POST / `{id?,title,icon,tags,pinned,isTemplate,blocks:[{id?,type,content}]}` · GET /:id · PATCH /:id (commenter+ role check, editor to modify; `blocks` replaces the list in order) · DELETE /:id · POST /:id/duplicate · POST /:id/restore |
| versions | GET /pages/:id/versions · POST /pages/:id/versions (create) · GET /pages/:id/versions/:vid · POST /pages/:id/versions/:vid/restore |
| projects | GET / · POST / · PATCH /:id · DELETE /:id |
| tasks | GET / · POST / `{title,description,status,priority,assigneeId,projectId,due(ISO),tags}` · PATCH /:id · DELETE /:id · POST /:id/subtasks · PATCH/DELETE /:id/subtasks/:sid |
| transactions | GET / · POST / · PATCH /:id · DELETE /:id · GET /balances · POST /settle |
| people | GET / · POST / (`companyName` creates/links a Company) · PATCH /:id · DELETE /:id |
| files | GET / · POST /upload (multipart: `file`, optional `folderName`, `projectId`) · GET /:id/download · PATCH /:id `{name,folderName,archived}` · DELETE /:id |
| ideas | GET / · POST / · PATCH /:id · DELETE /:id |
| calendar | GET / · POST / · PATCH /:id · DELETE /:id |
| comments | GET /?entityType&entityId · POST / `{entityType,entityId,body}` · DELETE /:id |
| templates | GET / · POST / · POST /:id/use · DELETE /:id |
| activity | GET / (latest 80) |

Global: `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`.

Transaction types: `income | expense | investment | reimbursement | settlement`. To split, send
`"split": {"shares": {"<payerUserId>": 50, "<otherUserId>": 50}}` (must include the payer, be world members, and sum to 100). The server computes each `owedAmount`; e.g. ₹4,500 paid by A split 50/50 → B's row has `owedAmount: 2250`. `GET /balances` derives who-owes-whom from unsettled splits; `POST /settle` stamps `settledAt`.

## Realtime (Socket.IO, same origin)
Connect with `io(API_URL, { auth: { token: accessToken } })`, then `emit("world:join", worldId)` (server verifies membership). Events: `<entity>.upserted` / `<entity>.deleted` for page, project, task, transaction, person, file, idea, world, plus `activity.created` and `comment.created`.
