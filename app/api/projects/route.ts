import { NextResponse } from "next/server";
import { listProjects } from "@/lib/opusclip";

export async function GET() {
  try {
    const result = await listProjects(0, 100);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
