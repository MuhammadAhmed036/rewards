import { NextRequest, NextResponse } from "next/server";
import { ApiKeyError, authenticateApiKey } from "@/server/services/api-keys";
import { eventsAfter } from "@/server/services/events";
import { RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";

/**
 * Catch up on events after a webhook outage: GET /events?after=<last event id>. Oldest first, 100 at a time.
 * Needs an API key with the events:read scope.
 */
export async function GET(request: NextRequest) {
  try {
    const key = await authenticateApiKey(request, "events:read");
    const events = await eventsAfter(key.tenantId, request.nextUrl.searchParams.get("after"));
    return NextResponse.json({
      data: events.map((e) => ({ id: e.id, type: e.name, created: e.createdAt, data: e.payload })),
      next: events.length > 0 ? events[events.length - 1].id : request.nextUrl.searchParams.get("after"),
    });
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitResponse(err);
    if (err instanceof ApiKeyError) return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    return NextResponse.json({ error: { code: "FAILED", message: "Could not load events." } }, { status: 500 });
  }
}
