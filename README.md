# RFP Portal

Multi-user portal for the RFP Intelligence Suite. 10 users + 1 admin, with admin-managed Claude / Gemini / Groq keys, per-user daily quotas, IP allowlist, and an append-only audit log. Apollo and ZoomInfo go through Anthropic-hosted MCP — no keys stored locally.

**Status: Phase 2 — Next.js scaffold with auth, middleware, admin panel skeleton, and `/api/analyze` stub.**

---

## Architecture

```
Browser  ──HTTPS──▶  Next.js middleware (session + IP allowlist)
                          │
                          ▼
                    /api/analyze ──▶  RLS check (user reads own assignment)
                          │
                          ▼
                    service-role: quota check + key decrypt + audit log
                          │
                          ▼
                    Claude / Gemini / Groq  (+ MCP for Claude)
```

Provider keys live in Supabase Vault and never leave the server.

---

## Project layout

```
rfp-portal/
├── app/
│   ├── layout.tsx           Root layout
│   ├── page.tsx             Redirect by role
│   ├── globals.css
│   ├── login/
│   │   ├── page.tsx         Login form
│   │   └── actions.ts       loginAction + logoutAction (server actions, audited)
│   ├── portal/              User-facing portal
│   │   ├── layout.tsx       Header w/ sign-out
│   │   └── page.tsx         Placeholder for RFP Suite (Phase 4)
│   ├── admin/               Admin area — hard role gate in layout
│   │   ├── layout.tsx       Tab nav + role check
│   │   ├── page.tsx         Overview dashboard
│   │   ├── users/           User list
│   │   ├── providers/       Provider keys (stub)
│   │   ├── assignments/     Per-user quota (stub)
│   │   ├── ip-allowlist/    CIDR list
│   │   └── audit/           Audit log viewer
│   └── api/
│       └── analyze/         POST /api/analyze — stub w/ quota check
├── lib/
│   ├── audit.ts             Append-only audit writer
│   └── supabase/
│       ├── client.ts        Browser (anon)
│       ├── server.ts        Server w/ cookies (user JWT)
│       └── service.ts       Service-role (server-only, bypasses RLS)
├── middleware.ts            Session refresh + IP allowlist
├── supabase/migrations/     0001 → 0004 SQL (already applied)
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
└── .env.example
```

---

## Run it locally

### 1. Install deps

```bash
cd rfp-portal
npm install
```

### 2. Fill in `.env.local`

Copy `.env.example` → `.env.local` and paste your values from Supabase dashboard → Project Settings → API:

- `NEXT_PUBLIC_SUPABASE_URL` — already set to your project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — **secret** service-role key
- `DEV_BYPASS_IP_ALLOWLIST=true` — keep for local dev

### 3. Bootstrap an admin (if you haven't yet)

In Supabase dashboard → Authentication → Add user → create with email + password.
Then in the SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'YOUR_ADMIN_EMAIL';
```

### 4. Boot the app

```bash
npm run dev
```

Open http://localhost:3000 → you'll be redirected to `/login`. Sign in with the admin user. You should land on `/admin`.

---

## What's enforced right now

| Layer | Check |
|---|---|
| Middleware | Active session for everything except `/login` and `/api/auth/*` |
| Middleware | IP must match an enabled CIDR in `ip_allowlist` (skipped when `DEV_BYPASS_IP_ALLOWLIST=true`) |
| `app/admin/layout.tsx` | DB-confirmed `role = 'admin'` and `is_active = true` — not just a cookie claim |
| Login server action | Active-user check + audit log entry on success/failure |
| `/api/analyze` | Cookie session check, RLS-scoped assignment lookup, server-side quota check via service-role RPC |
| Database | RLS on all 6 tables; `get_provider_key` and `user_daily_usage` locked from `authenticated`; audit_log has no INSERT/UPDATE/DELETE policy (writes via service-role only) |
| HTTP | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, restrictive Permissions-Policy |

---

## Smoke test the analyze stub

After signing in as admin, give yourself an assignment so the stub works end-to-end:

```sql
insert into public.user_provider_assignments (user_id, provider, quota_dimension, daily_limit)
select id, 'anthropic', 'requests', 50 from public.profiles where role = 'admin';
```

Then in the browser console on `/admin`:

```js
fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rfp: 'Target HR Directors at US tech companies for an HR demo campaign.' })
}).then(r => r.json()).then(console.log);
```

Should return `{ ok: true, note: 'Phase 2 stub...', assigned: {...} }`.

---

## What's next — Phase 3

- Provider abstraction (`callProvider({provider, messages, mcpServers})`) covering Anthropic, Gemini, Groq
- Admin CRUD: add user, store provider key in Vault, set assignment, manage IP allowlist
- Per-call token + cost accounting written to `usage_log`

After that:

- **Phase 4** — Port the RFP Suite UI into `/portal`, wire MCP for Apollo + ZoomInfo
- **Phase 5** — Per-user usage dashboards, cost breakdown
- **Phase 6** — Rate limits, CSRF, key rotation, backup verification
