# Deploying to Vercel

Quickest path when you can't run npm locally: push the code to a private GitHub repo, connect Vercel, set env vars. Vercel runs the build for you.

---

## 1. Get the code into GitHub

**Option A — GitHub web UI (no git needed):**

1. Go to https://github.com/new → create a private repo named `rfp-portal`. Don't add a README, .gitignore, or license — the repo should be empty.
2. On the new empty repo page click **"uploading an existing file"**.
3. Drag the entire contents of the `rfp-portal/` folder into the upload box (or drag the unzipped folder itself).
4. Commit directly to `main`.

**Option B — GitHub Desktop:**

1. Install GitHub Desktop → sign in.
2. File → Add local repository → point to your unzipped `rfp-portal` folder.
3. Publish repository (private).

---

## 2. Connect Vercel to the repo

1. Go to https://vercel.com/new
2. Import the `rfp-portal` repo. Vercel auto-detects Next.js — accept the defaults.
3. **DO NOT click Deploy yet** — set env vars first (step 3).

---

## 3. Set environment variables on Vercel

In the "Environment Variables" section of the import screen (or later under **Settings → Environment Variables**), add these. Get values from **Supabase dashboard → Project Settings → API**:

| Variable | Value | Environment |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ggccdjxthuvthoqaxsoy.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon public key) | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service role — KEEP SECRET) | All |
| `DEV_BYPASS_IP_ALLOWLIST` | `true` | All — **flip to false after step 6** |

Click **Deploy**. Build takes ~2 minutes.

---

## 4. Configure Supabase Auth URLs

After Vercel gives you a URL like `https://rfp-portal-abc123.vercel.app`:

1. Supabase dashboard → **Authentication → URL Configuration**
2. **Site URL** → `https://rfp-portal-abc123.vercel.app` (use the production URL, not the preview one)
3. **Redirect URLs** → add `https://rfp-portal-abc123.vercel.app/**` (with the `/**`)

Without this, login will fail with "redirect URL not allowed" errors.

---

## 5. First login

Visit the Vercel URL → you'll be redirected to `/login` → sign in with the admin user you bootstrapped earlier.

If you forgot to bootstrap, go to Supabase Auth → Users → Add user, then run in the SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'YOUR_ADMIN_EMAIL';
```

---

## 6. Add your office IPs to the allowlist

Find your office public IP at https://ipv4.icanhazip.com (do this from the office, not on cellular).

In Supabase SQL editor:

```sql
-- Single IP
insert into public.ip_allowlist (cidr, label)
values ('203.0.113.45/32', 'Mumbai office');

-- Or a range
insert into public.ip_allowlist (cidr, label)
values ('203.0.113.0/24', 'Mumbai office /24');
```

Verify it's there:

```sql
select * from public.ip_allowlist;
```

---

## 7. Turn OFF the IP bypass — IMPORTANT

This is the security step you do NOT want to skip:

1. Vercel → Project → **Settings → Environment Variables**
2. Edit `DEV_BYPASS_IP_ALLOWLIST` → change to `false` (or delete the variable entirely)
3. Vercel → **Deployments** → click the three-dot menu on the latest deploy → **Redeploy**

After redeploy, only IPs in your allowlist can reach the site. Test by:

- Loading the site from your office IP → should work
- Loading from a phone on cellular → should get **403 Forbidden — IP not allowlisted**

---

## 8. Give the admin a starter assignment (optional)

So you can smoke test `/api/analyze`:

```sql
insert into public.user_provider_assignments (user_id, provider, quota_dimension, daily_limit)
select id, 'anthropic', 'requests', 50 from public.profiles where role = 'admin';
```

---

## Things to know about Vercel

- **Preview deployments** — every push to a non-main branch gets its own URL. Same IP allowlist applies (defense in depth).
- **Edge runtime** — Next.js middleware runs at the edge; the IP check happens before the function even spins up.
- **Logs** — Vercel → your project → **Logs** tab. Filter by function to debug `/api/analyze`.
- **Rolling back** — Vercel → Deployments → find a healthy old one → **Promote to Production**.

---

## Common failures and what they mean

| Symptom | Likely cause |
|---|---|
| `403 Forbidden — IP not allowlisted` from your own browser | You forgot to add your IP, or the bypass is off and the allowlist is empty |
| `Auth session missing` after login | Supabase Auth URL config (step 4) not done |
| `Invalid email or password` after correct credentials | Profile row's `is_active` is false, or admin role not set |
| Build fails with `Cannot find module` | A `.env` value isn't set, or `package.json` lockfile mismatch — clear Vercel build cache and redeploy |
| `429 quota exceeded` immediately | Daily limit set too low (try 50+ for testing) |

---

## What changes for Phase 3

Phase 3 keeps the same Vercel deploy flow — `git push` to main = auto-deploy. The new pieces are:

- Provider API call code in `lib/providers/`
- Admin CRUD forms (no more disabled buttons)
- Token + cost tracking written to `usage_log`

No infra changes, no new env vars (until Phase 4 might need Apollo / ZoomInfo MCP URLs).
