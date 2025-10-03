// =============================================================================
// web/app/api/[...path]/route.ts
// =============================================================================
// API Proxy Layer - Routes all Next.js frontend API calls to the Go backend
//
// PURPOSE:
// This file implements a smart proxy that sits between the Next.js frontend
// and the Go API backend. It serves several critical functions:
//
// 1. URL ROUTING: Forwards frontend API calls (/api/mempool, /api/track/tx/0x123, etc.)
//    to the Go backend server running on a different port
//
// 2. CACHING LAYER: Implements intelligent 30-second caching to handle upstream
//    API rate limits from Ethereum data providers (Beaconcha.in, Flashbots relays)
//
// 3. RESILIENCE: Serves stale cached data when upstream APIs fail, providing
//    better UX during rate limiting or temporary outages
//
// 4. ENVIRONMENT CONFIG: Uses GOAPI_ORIGIN env var to determine where the Go
//    backend is running (default: http://localhost:8080)
//
// ARCHITECTURE:
// Next.js Frontend (/api/*) -> This Proxy -> Go Backend (localhost:8080/api/*)
//                                   ↓
//                            [In-Memory Cache]
//                            (30s TTL, stale-on-error)
//
// EDUCATIONAL NOTE:
// This proxy pattern is common in microservices architecture. The Next.js app
// handles UI rendering and routing, while the Go backend focuses on data fetching.
// The proxy provides a clean separation of concerns and adds caching/resilience.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Go API backend origin - where our data-fetching server lives
// Example: http://localhost:8080 (development) or https://api.example.com (production)
const GOAPI_ORIGIN = process.env.GOAPI_ORIGIN || 'http://localhost:8080';

// =============================================================================
// CACHING INFRASTRUCTURE
// =============================================================================

// Cache entry structure - stores response body and expiration timestamp
type CacheEntry = {
  body: string;     // JSON response from Go API
  expires: number;  // Unix timestamp (ms) when this entry expires
};

// In-memory cache map - key is full URL, value is cached response
// This persists across requests but is lost on server restart
const memoryCache = new Map<string, CacheEntry>();

// Cache time-to-live in milliseconds (default: 30 seconds)
// Why 30 seconds? Balance between:
// - Reducing load on upstream APIs (Beaconcha.in, Flashbots have rate limits)
// - Keeping data fresh enough for educational purposes
// - Providing resilience during temporary API outages
const WEB_PROXY_CACHE_TTL_MS = Number(process.env.WEB_PROXY_CACHE_TTL_MS ?? '30000') || 30000;

// =============================================================================
// GET HANDLER - Main proxy endpoint for read operations
// =============================================================================
// Handles all GET requests to /api/* routes in the Next.js app
//
// FLOW:
// 1. Parse the incoming request path and query parameters
// 2. Check in-memory cache for fresh response (within 30s TTL)
// 3. If cache miss, forward request to Go backend
// 4. If upstream fails, serve stale cache (stale-on-error pattern)
// 5. If upstream succeeds, cache response and return to frontend
//
// PARAMETERS:
// - request: Next.js request object with URL, headers, etc.
// - params: Dynamic route segments from [...path] catch-all route
//           Example: /api/track/tx/0x123 -> params.path = ['track', 'tx', '0x123']
//
// EXAMPLE REQUESTS:
// - /api/mempool -> http://localhost:8080/api/mempool
// - /api/track/tx/0xabc123 -> http://localhost:8080/api/track/tx/0xabc123
// - /api/mev/sandwich?block=latest -> http://localhost:8080/api/mev/sandwich?block=latest
// =============================================================================
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // -------------------------------------------------------------------------
  // STEP 1: Build Target URL
  // -------------------------------------------------------------------------
  // Reconstruct the full URL path from the dynamic route segments
  // Example: ['track', 'tx', '0x123'] -> 'track/tx/0x123'
  const path = params.path.join('/');

  // Extract query parameters from the original request
  // Example: ?block=latest&format=json -> 'block=latest&format=json'
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : '';

  // Construct the full target URL for the Go backend
  // Example: http://localhost:8080/api/track/tx/0x123?block=latest
  const targetUrl = `${GOAPI_ORIGIN}/api/${path}${queryString}`;

  // Development logging - helps debug routing issues
  console.log('API Route called:', path);
  console.log('GOAPI_ORIGIN:', GOAPI_ORIGIN);
  console.log('Target URL:', targetUrl);

  // -------------------------------------------------------------------------
  // STEP 2: Check Cache
  // -------------------------------------------------------------------------
  // Look up the full URL in our in-memory cache
  const cacheKey = targetUrl;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  // If we have a cached entry and it hasn't expired yet, return it immediately
  // This avoids hitting the Go backend and upstream APIs unnecessarily
  if (cached && cached.expires > now) {
    // Cache HIT - serve from memory
    // Include x-proxy-cache header so frontend can detect cached responses
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-cache': 'HIT'  // Indicates this came from cache
      },
    });
  }

  // -------------------------------------------------------------------------
  // STEP 3: Forward Request to Go Backend
  // -------------------------------------------------------------------------
  // Cache miss or expired - fetch fresh data from Go API
  try {
    // Make HTTP request to Go backend with same method and headers
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Get response body as text (JSON string)
    const data = await response.text();
    const trimmed = (data || '').trim();

    // -------------------------------------------------------------------------
    // STEP 4: Handle Upstream Failures (Stale-on-Error Pattern)
    // -------------------------------------------------------------------------
    // If the Go backend returns empty or error response, try serving stale cache
    // This is critical for handling rate limits from Beaconcha.in, Flashbots, etc.
    //
    // EDUCATIONAL NOTE:
    // The "stale-on-error" pattern means: when upstream fails, serve old cached
    // data even if expired, rather than showing an error. This provides better UX
    // because users can still see recent data during temporary API outages.
    if (!trimmed || !response.ok) {
      if (cached) {
        // We have stale cached data - serve it with STALE header
        // Frontend can display a "data may be outdated" warning if needed
        return new NextResponse(cached.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-proxy-cache': 'STALE'  // Indicates this is expired but served anyway
          },
        });
      }

      // No cache available at all - return a friendly error message
      // Still use 200 status so frontend doesn't treat as hard failure
      return NextResponse.json({
        error: {
          kind: !trimmed ? 'UPSTREAM_EMPTY' : 'UPSTREAM_STATUS',
          message: !trimmed
            ? 'Upstream returned empty body'
            : `Upstream error ${response.status}`,
          hint: 'Service may be warming up or rate limited. Retry shortly.'
        }
      }, { status: 200 });
    }

    // -------------------------------------------------------------------------
    // STEP 5: Cache and Return Success Response
    // -------------------------------------------------------------------------
    // Upstream request succeeded - cache the response for future requests
    // Set expiration to current time + TTL (30 seconds by default)
    memoryCache.set(cacheKey, {
      body: trimmed,
      expires: now + WEB_PROXY_CACHE_TTL_MS
    });

    // Return fresh data to frontend with MISS header
    return new NextResponse(trimmed, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-cache': 'MISS',  // Indicates this is fresh data, not cached
      },
    });

  } catch (error) {
    // -------------------------------------------------------------------------
    // STEP 6: Handle Network/Connection Errors
    // -------------------------------------------------------------------------
    // If fetch() throws (network error, timeout, etc.), log and return 500
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request' },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST HANDLER - Proxy endpoint for write operations
// =============================================================================
// Handles POST requests to /api/* routes (form submissions, mutations, etc.)
//
// CURRENT USAGE:
// This handler is currently unused in the educational Ethereum visualizer
// because all operations are read-only (fetching mempool, blocks, etc.)
//
// FUTURE USE CASES:
// - User preferences storage (theme, favorite validators, etc.)
// - Educational quiz submissions
// - Custom transaction simulations
// - Bookmark/save transaction searches
//
// IMPORTANT NOTE:
// Unlike GET requests, POST requests are NOT cached. Each POST creates
// a fresh request to the Go backend. This is correct behavior for write
// operations that should not be served from stale data.
//
// FLOW:
// 1. Parse request path and query parameters
// 2. Extract request body (JSON payload)
// 3. Forward to Go backend with POST method
// 4. Return response directly (no caching)
// =============================================================================
export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // -------------------------------------------------------------------------
  // STEP 1: Build Target URL
  // -------------------------------------------------------------------------
  // Same URL construction as GET handler
  const path = params.path.join('/');
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : '';

  const targetUrl = `${GOAPI_ORIGIN}/api/${path}${queryString}`;

  try {
    // -------------------------------------------------------------------------
    // STEP 2: Extract Request Body
    // -------------------------------------------------------------------------
    // Read the POST body (JSON string) from the incoming request
    // Example: {"transaction": "0x123", "action": "track"}
    const body = await request.text();

    // -------------------------------------------------------------------------
    // STEP 3: Forward POST Request to Go Backend
    // -------------------------------------------------------------------------
    // Send the POST request to Go API with original body intact
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,  // Forward the original request body
    });

    // Get response from Go backend
    const data = await response.text();

    // -------------------------------------------------------------------------
    // STEP 4: Return Response (No Caching)
    // -------------------------------------------------------------------------
    // Return the response directly without caching
    // Preserve the original status code from Go backend (200, 400, 500, etc.)
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    // -------------------------------------------------------------------------
    // Handle Network/Connection Errors
    // -------------------------------------------------------------------------
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request' },
      { status: 500 }
    );
  }
}
