// web/app/api/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const GOAPI_ORIGIN = process.env.GOAPI_ORIGIN || 'http://localhost:8081';

// Simple in-memory cache to smooth over transient upstream empties and rate limits
type CacheEntry = { body: string; expires: number };
const memoryCache = new Map<string, CacheEntry>();
const WEB_PROXY_CACHE_TTL_MS = Number(process.env.WEB_PROXY_CACHE_TTL_MS ?? '30000') || 30000;

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : '';
  
  const targetUrl = `${GOAPI_ORIGIN}/api/${path}${queryString}`;
  
  console.log('API Route called:', path);
  console.log('GOAPI_ORIGIN:', GOAPI_ORIGIN);
  console.log('Target URL:', targetUrl);
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
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.text();
    const trimmed = (data || '').trim();
    // Treat empty body or non-2xx upstream as a soft error; serve stale if available, else return error envelope with 200
    if (!trimmed || !response.ok) {
      if (cached && cached.expires > now) {
        return new NextResponse(cached.body, {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'x-proxy-cache': 'STALE' },
        });
      }
      return NextResponse.json({
        error: {
          kind: !trimmed ? 'UPSTREAM_EMPTY' : 'UPSTREAM_STATUS',
          message: !trimmed ? 'Upstream returned empty body' : `Upstream error ${response.status}`,
          hint: 'Service may be warming up or rate limited. Retry shortly.'
        }
      }, { status: 200 });
    }
    // Cache fresh good body and return 200
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
