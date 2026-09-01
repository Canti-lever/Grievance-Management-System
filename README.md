# Grievance Management System

Production-oriented grievance management application with three role-based workspaces:

- **Residents** submit and track grievances, upload a supporting attachment, receive notifications, and accept resolutions.
- **Officers** work an assigned queue, update statuses, and post resolutions.
- **Administrators** manage the full queue, assignments, people, service categories, and audit history.

## Demo accounts

The API seeds these accounts on first startup when the users table is empty:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@gms.demo` | `Admin@123` |
| Officer | `officer@gms.demo` | `Officer@123` |
| Resident | `user@gms.demo` | `User@12345` |

Change or remove these demo credentials before using the application with real users.

## Local development

1. Configure `DATABASE_URL` and `SESSION_SECRET` in Replit Secrets.
2. Apply the database schema:

   ```bash
   pnpm --filter @workspace/db run push
   ```

3. Start the managed workflows:

   ```bash
   pnpm --filter @workspace/api-server run dev
   pnpm --filter @workspace/grievance-management-system run dev
   ```

4. Validate the workspace:

   ```bash
   pnpm run typecheck
   pnpm run build
   ```

The API exposes `GET /api/healthz`. The browser app is the registered
`grievance-management-system` artifact.

## API and data model

`lib/api-spec/openapi.yaml` is the source of truth for the API. Regenerate the
typed React Query client and Zod schemas after contract changes:

```bash
pnpm --filter @workspace/api-spec run codegen
```

The database schema is in `lib/db/src/schema/grievances.ts` and includes users,
sessions, categories, grievances, status history, notifications, and audit logs.
Authorization is enforced on the server for every role-specific route.

## Security notes

- Passwords are stored as salted `scrypt` hashes.
- Session cookies are httpOnly and signed with `SESSION_SECRET`.
- Admin, officer, and resident access is enforced server-side; hiding a link in
  the UI is not used as an authorization boundary.
- Attachments are served through an authenticated grievance attachment route.