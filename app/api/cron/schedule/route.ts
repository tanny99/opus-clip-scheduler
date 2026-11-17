import { NextRequest, NextResponse } from "next/server";
import { listProjects, listClips, listPostTasks, scheduleClip, listSocialAccounts } from "@/lib/opusclip";
import { SOCIAL_ACCOUNTS } from "@/lib/accounts";
import { generateScheduleSlots } from "@/lib/scheduler";

export const maxDuration = 300;

// 5 concurrent workers with jittered backoff on 429 (same as schedule route).
// At ~1.5s average per clip with 5 workers = ~3.3 clips/sec → ~800 clips/250s.
const CONCURRENCY = 5;
const MAX_PER_RUN = 800; // process up to 800 clips per invocation (fits in 250s)

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel cron or with the cron secret
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    // Get all accounts
    const apiAccounts = await listSocialAccounts();
    const allAccounts = apiAccounts.length > 0
      ? apiAccounts.map((a) => {
          const h = SOCIAL_ACCOUNTS.find((h) => h.postAccountId === a.postAccountId);
          return { ...a, subAccountId: a.subAccountId || h?.subAccountId };
        })
      : SOCIAL_ACCOUNTS;

    // Fetch all projects + clips + post tasks
    const { projects } = await listProjects(0, 100);
    const projectData = await Promise.all(
      projects.map(async (project) => {
        const [clips, postTasks] = await Promise.all([
          listClips(project.projectId),
          listPostTasks(project.projectId),
        ]);
        return { project, clips, postTasks };
      })
    );

    // Build list of unscheduled clip+account pairs
    type Item = {
      projectId: string;
      clipId: string;
      postAccountId: string;
      subAccountId?: string;
      title: string;
      description: string;
    };
    const toSchedule: Item[] = [];

    for (const { project, clips, postTasks } of projectData) {
      const postedSet = new Set<string>();
      for (const task of postTasks) {
        if (task.status === "posted" || task.status === "scheduled" || task.status === "pending") {
          postedSet.add(`${task.clipId}::${task.postAccountId || task.platform}`);
          postedSet.add(`${task.clipId}::${task.platform}`);
        }
      }
      for (const clip of clips) {
        for (const acc of allAccounts) {
          if (postedSet.has(`${clip.curationId}::${acc.postAccountId}`)) continue;
          if (postedSet.has(`${clip.curationId}::${acc.platform}`)) continue;
          toSchedule.push({
            projectId: project.projectId,
            clipId: clip.curationId,
            postAccountId: acc.postAccountId,
            subAccountId: acc.subAccountId,
            title: clip.title,
            description: clip.description,
          });
        }
      }
    }

    const totalUnscheduled = toSchedule.length;
    if (totalUnscheduled === 0) {
      return NextResponse.json({
        message: "Nothing to schedule",
        scheduled: 0,
        failed: 0,
        remaining: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    // Schedule up to MAX_PER_RUN clips using concurrent workers
    const toProcess = toSchedule.slice(0, MAX_PER_RUN);
    const remaining = toSchedule.length - toProcess.length;
    const slots = generateScheduleSlots(toProcess.length, new Date());

    let scheduled = 0;
    let failed = 0;
    const errors: string[] = [];

    let next = 0;
    async function worker() {
      while (true) {
        const idx = next++;
        if (idx >= toProcess.length) return;
        const item = toProcess[idx];
        try {
          await scheduleClip({
            projectId: item.projectId,
            clipId: item.clipId,
            postAccountId: item.postAccountId,
            subAccountId: item.subAccountId,
            publishAt: slots[idx].toISOString(),
            title: item.title,
            description: item.description,
            privacy: "public",
          });
          scheduled++;
        } catch (err) {
          failed++;
          if (errors.length < 10) {
            errors.push(`${item.title.slice(0, 40)} → ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toProcess.length) }, () => worker()));

    return NextResponse.json({
      message: `Scheduled ${scheduled} clips${remaining > 0 ? `, ${remaining} remaining for next run` : " — all done!"}`,
      scheduled,
      failed,
      remaining,
      totalUnscheduled,
      durationMs: Date.now() - startedAt,
      errors,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), durationMs: Date.now() - startedAt }, { status: 500 });
  }
}
