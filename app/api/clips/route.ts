import { NextRequest, NextResponse } from "next/server";
import { listClips, listPostTasks } from "@/lib/opusclip";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    const [clips, postTasks] = await Promise.all([
      listClips(projectId),
      listPostTasks(projectId),
    ]);

    // Map clip curation IDs to their post tasks
    const tasksByClipId: Record<string, typeof postTasks[0][]> = {};
    for (const task of postTasks) {
      if (!tasksByClipId[task.clipId]) tasksByClipId[task.clipId] = [];
      tasksByClipId[task.clipId].push(task);
    }

    const enriched = clips.map((clip) => ({
      ...clip,
      postTasks: tasksByClipId[clip.curationId] || [],
    }));

    return NextResponse.json({ clips: enriched });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
