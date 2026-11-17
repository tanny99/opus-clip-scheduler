import { NextResponse } from "next/server";

const REPO = "tanny99/opus-clip-scheduler";
const WORKFLOW_FILE = "auto-schedule.yml";

export async function GET() {
  try {
    const url = `https://api.github.com/repos/${REPO}/actions/runs?workflow_id=${WORKFLOW_FILE}&per_page=1`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "opus-clip-scheduler",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `GitHub API: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    const run = data.workflow_runs?.[0];

    if (!run) {
      return NextResponse.json({ running: false, status: "never_run", runUrl: null, startedAt: null });
    }

    const running = run.status === "in_progress" || run.status === "queued";
    return NextResponse.json({
      running,
      status: run.status,        // "in_progress" | "queued" | "completed"
      conclusion: run.conclusion, // "success" | "failure" | null
      startedAt: run.created_at,
      updatedAt: run.updated_at,
      runUrl: run.html_url,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
