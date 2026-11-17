import { NextResponse } from "next/server";
import { SOCIAL_ACCOUNTS } from "@/lib/accounts";

const BASE_URL = "https://api.opus.pro/api";

// Probe OpusClip quota without consuming it:
// Use a deliberately bogus clip ID — if quota is OK we get a 4xx validation error,
// if the daily limit is hit we get 429 {"window":"DAY"} before validation even runs.
export async function GET() {
  try {
    const account = SOCIAL_ACCOUNTS[0];
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await fetch(`${BASE_URL}/publish-schedules`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPUSCLIP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: "__probe__",
        clipId: "__probe__",
        postAccountId: account.postAccountId,
        publishAt: future,
        postDetail: { title: "probe", custom: { privacy: "public" } },
      }),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    // If daily limit hit, the API returns 429 with window=DAY before validating the payload
    if (res.status === 429 && (data?.error?.window === "DAY" || data?.window === "DAY")) {
      return NextResponse.json({
        exhausted: true,
        limit: data?.error?.limit ?? data?.limit ?? 500,
        resetsAt: nextMidnightUTC(),
        message: "Daily publish quota exhausted. Resets at midnight UTC.",
      });
    }

    // Any other response (400, 404, 422 for bad clip, even 200) = quota available
    return NextResponse.json({
      exhausted: false,
      limit: 500,
      resetsAt: null,
      message: "Quota available",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function nextMidnightUTC(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}
