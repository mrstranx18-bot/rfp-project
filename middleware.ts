// Edge middleware — runs before every request.
//
// Two jobs:
//   1. Refresh the Supabase session cookie if needed
//   2. Block requests from IPs not in public.ip_allowlist
//
// The IP check uses the service-role client because ip_allowlist is
// admin-only RLS. We can't query it as an anonymous browser visitor.
//
// Public routes (no auth/IP check): /login, /api/auth/*, static files.

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

async function ipAllowed(ip: string | null): Promise<boolean> {
  if (process.env.DEV_BYPASS_IP_ALLOWLIST === 'true') return true;
  if (!ip) return false;

  // Service-role used here because ip_allowlist has admin-only RLS.
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Postgres `cidr >>= inet` operator — does the allowlist range contain this IP?
  const { data, error } = await sb.rpc('ip_in_allowlist', { p_ip: ip });
  if (error || !data) return false;
  return data === true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── IP allowlist ──────────────────────────────────────────────────────
  const ip = getClientIp(request);
  if (!isPublicPath(pathname) && !(await ipAllowed(ip))) {
    return new NextResponse('Forbidden — IP not allowlisted', {
      status: 403,
    });
  }

  // ── Refresh session cookie ────────────────────────────────────────────
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Auth gate ─────────────────────────────────────────────────────────
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already logged in and visiting /login? Send them to the app.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/portal', request.url));
  }

  return response;
}

export const config = {
  // Run on everything except Next.js internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
