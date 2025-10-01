// web/app/api/[...path]/route.ts
// Proxy for our Go API. This lets the Next.js frontend call /api/mempool etc
// and we forward it to the Go server. We also add some smart caching here to
// handle rate limits from public APIs (beacon/relay providers can be flaky).
import { NextRequest, NextResponse } from 'next/server';

const GOAPI_ORIGIN = process.env.GOAPI_ORIGIN || 'http://localhost:8080';

// We cache responses for 30 seconds to reduce load on upstream APIs
// and provide better UX when relays/beacon APIs are rate limiting
type CacheEntry = { body: string; expires: number };
const memoryCache = new Map<string, CacheEntry>();
const WEB_PROXY_CACHE_TTL_MS = Number(process.env.WEB_PROXY_CACHE_TTL_MS ?? '30000') || 30000;

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // Build the target URL from the dynamic path segments
  const path = params.path.join('/');
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : '';

  const targetUrl = `${GOAPI_ORIGIN}/api/${path}${queryString}`;

  console.log('API Route called:', path);
  console.log('GOAPI_ORIGIN:', GOAPI_ORIGIN);
  console.log('Target URL:', targetUrl);

  // Check if we have a fresh cached response
  const cacheKey = targetUrl;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-proxy-cache': 'HIT' },
    });
  }

  try {
    // Forward the request to our Go API
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.text();
    const trimmed = (data || '').trim();

    // If upstream fails or returns empty, try serving stale cache
    // This helps when relays/beacon APIs are rate limiting
    if (!trimmed || !response.ok) {
      if (cached) {
        // Serve stale data rather than failing completely
        return new NextResponse(cached.body, {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'x-proxy-cache': 'STALE' },
        });
      }
      // No cache available, return a friendly error
      return NextResponse.json({
        error: {
          kind: !trimmed ? 'UPSTREAM_EMPTY' : 'UPSTREAM_STATUS',
          message: !trimmed ? 'Upstream returned empty body' : `Upstream error ${response.status}`,
          hint: 'Service may be warming up or rate limited. Retry shortly.'
        }
      }, { status: 200 });
    }

    // Success! Cache it and send it back
    memoryCache.set(cacheKey, { body: trimmed, expires: now + WEB_PROXY_CACHE_TTL_MS });
    return new NextResponse(trimmed, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request' },
      { status: 500 }
    );
  }
}

// POST handler for form submissions or other write operations
// Currently not used much, but here for completeness
export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : '';

  const targetUrl = `${GOAPI_ORIGIN}/api/${path}${queryString}`;

  try {
    const body = await request.text();

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    const data = await response.text();

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request' },
      { status: 500 }
    );
  }
}
