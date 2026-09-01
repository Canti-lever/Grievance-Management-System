# Grievance Management System

An end-to-end civic service workspace for submitting, routing, resolving, and auditing grievances.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (managed port)
- `pnpm --filter @workspace/grievance-management-system run dev` — run the responsive React portal
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `SESSION_SECRET` — cookie-session signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/api-client-react` and `lib/api-zod` — generated client hooks and validation schemas
- `lib/db/src/schema/grievances.ts` — PostgreSQL/Drizzle schema for users, grievances, workflow history, notifications, and audit logs
- `artifacts/api-server/src/routes/grievances.ts` — authenticated grievance and administration routes
- `artifacts/api-server/src/seed.ts` — idempotent demo bootstrap data
- `artifacts/grievance-management-system/src/App.tsx` — role-aware citizen, officer, and admin portal
- `artifacts/grievance-management-system/src/index.css` — visual theme and responsive styles

## Architecture decisions

- PostgreSQL and Drizzle follow the workspace's managed database setup; no second database technology is introduced.
- Sessions use secure, httpOnly cookies with Node `scrypt` password hashing to support the specification's password login and role model.
- Attachments are accepted as data URLs for the first production slice and served through an authenticated attachment endpoint.
- OpenAPI is generated before client work so the React app uses typed React Query hooks rather than hand-written API calls.

## Product

- Residents can register, submit grievances with an attachment, search and track their own cases, view a status timeline, receive notifications, update their profile, and accept resolutions.
- Officers can review assigned queues, update workflow status, and post resolutions.
- Administrators can view dashboards, assign officers, manage users and categories, review audit logs, and operate any grievance.
- Statuses progress through `SUBMITTED`, `ACKNOWLEDGED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`.

## User preferences

No project-specific user preferences recorded.

## Gotchas

- Run `pnpm run typecheck:libs` after schema changes so generated database declarations are refreshed before API typechecking.
- The frontend Vite config requires `PORT` and `BASE_PATH` when running a production build outside the managed workflow.
- The API seeds only when the users table is empty; it does not overwrite existing data.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
