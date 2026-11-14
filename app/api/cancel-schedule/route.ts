import { NextRequest, NextResponse } from "next/server";
import { cancelSchedule } from "@/lib/opusclip";

export async function POST(req: NextRequest) {
  try {
    const { scheduleId } = await req.json();
    if (!scheduleId) return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    await cancelSchedule(scheduleId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
