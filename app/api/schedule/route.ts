import { NextRequest, NextResponse } from "next/server";
import { listProjects, listClips, listPostTasks, scheduleClip } from "@/lib/opusclip";
import { SOCIAL_ACCOUNTS } from "@/lib/accounts";
import { generateScheduleSlots } from "@/lib/scheduler";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // selectedAccounts: array of postAccountIds to post to (optional, defaults to all)
    const selectedAccountIds: string[] = body.selectedAccounts || SOCIAL_ACCOUNTS.map((a) => a.postAccountId);
    const selectedProjectIds: string[] | null = body.projectIds || null;

    const accounts = SOCIAL_ACCOUNTS.filter((a) => selectedAccountIds.includes(a.postAccountId));
    if (accounts.length === 0) {
      return NextResponse.json({ error: "No accounts selected" }, { status: 400 });
    }

    // 1. Fetch all complete projects
    const { projects } = await listProjects(0, 100);
    const targetProjects = selectedProjectIds
      ? projects.filter((p) => selectedProjectIds.includes(p.projectId))
      : projects;

    // 2. For each project, find unscheduled clips per account
    type UnscheduledItem = {
      projectId: string;
      clipId: string; // curation ID
      title: string;
      description: string;
      account: (typeof accounts)[0];
    };

    const toSchedule: UnscheduledItem[] = [];

    for (const project of targetProjects) {
      const [clips, postTasks] = await Promise.all([
        listClips(project.projectId),
        listPostTasks(project.projectId),
      ]);

      // Build set of (clipId, platform) already posted or scheduled
      const postedSet = new Set<string>();
      for (const task of postTasks) {
        if (task.status === "posted" || task.status === "scheduled" || task.status === "pending") {
          postedSet.add(`${task.clipId}::${task.platform}`);
        }
      }

      for (const clip of clips) {
        for (const account of accounts) {
          const key = `${clip.curationId}::${account.platform}`;
          if (!postedSet.has(key)) {
            toSchedule.push({
              projectId: project.projectId,
              clipId: clip.curationId,
              title: clip.title,
              description: clip.description,
              account,
            });
          }
        }
      }
    }

    if (toSchedule.length === 0) {
      return NextResponse.json({ message: "All clips are already scheduled or posted", scheduled: [] });
    }

    // 3. Generate enough time slots
    const slots = generateScheduleSlots(toSchedule.length, new Date(), 4);
    if (slots.length < toSchedule.length) {
      return NextResponse.json(
        { error: `Could only find ${slots.length} slots for ${toSchedule.length} clips. Try reducing selection.` },
        { status: 400 }
      );
    }

    // 4. Schedule each clip
    const results: { clipId: string; account: string; publishAt: string; scheduleId: string }[] = [];
    const errors: { clipId: string; account: string; error: string }[] = [];

    for (let i = 0; i < toSchedule.length; i++) {
      const item = toSchedule[i];
      const slot = slots[i];
      try {
        const result = await scheduleClip({
          projectId: item.projectId,
          clipId: item.clipId,
          postAccountId: item.account.postAccountId,
          subAccountId: item.account.subAccountId,
          publishAt: slot.toISOString(),
          title: item.title,
          description: item.description,
          privacy: "public",
        });
        results.push({
          clipId: item.clipId,
          account: item.account.name,
          publishAt: result.publishAt,
          scheduleId: result.scheduleId,
        });
      } catch (err) {
        errors.push({ clipId: item.clipId, account: item.account.name, error: String(err) });
      }
    }

    return NextResponse.json({ scheduled: results, errors, total: toSchedule.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
