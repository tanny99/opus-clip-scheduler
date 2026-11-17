import { NextResponse } from "next/server";
import { listProjects, listClips, listPostTasks, listSocialAccounts } from "@/lib/opusclip";
import { SOCIAL_ACCOUNTS } from "@/lib/accounts";

export async function GET() {
  try {
    const [{ projects }, apiAccounts] = await Promise.all([
      listProjects(0, 100),
      listSocialAccounts(),
    ]);

    const accounts = apiAccounts.length > 0
      ? apiAccounts.map((a) => {
          const h = SOCIAL_ACCOUNTS.find((h) => h.postAccountId === a.postAccountId);
          return { ...a, subAccountId: a.subAccountId || h?.subAccountId };
        })
      : SOCIAL_ACCOUNTS;

    // Fetch all clips + post tasks in parallel across all projects
    const projectData = await Promise.all(
      projects.map(async (project) => {
        const [clips, postTasks] = await Promise.all([
          listClips(project.projectId),
          listPostTasks(project.projectId),
        ]);
        return { project, clips, postTasks };
      })
    );

    let totalClips = 0;
    let posted = 0;
    let scheduled = 0;
    let unscheduled = 0;

    // Per-account: how many clips are scheduled vs not for each account
    const perAccount: Record<string, { name: string; platform: string; scheduled: number; unscheduled: number }> = {};
    for (const acc of accounts) {
      perAccount[acc.postAccountId] = { name: acc.name, platform: acc.platform, scheduled: 0, unscheduled: 0 };
    }

    for (const { clips, postTasks } of projectData) {
      totalClips += clips.length;

      // Overall clip status (best across all accounts)
      const clipBestStatus = new Map<string, string>();
      for (const clip of clips) clipBestStatus.set(clip.curationId, "unscheduled");
      for (const task of postTasks) {
        const current = clipBestStatus.get(task.clipId);
        if (current === undefined) continue;
        if (task.status === "posted") clipBestStatus.set(task.clipId, "posted");
        else if (task.status === "scheduled" && current !== "posted") clipBestStatus.set(task.clipId, "scheduled");
      }
      for (const status of clipBestStatus.values()) {
        if (status === "posted") posted++;
        else if (status === "scheduled") scheduled++;
        else unscheduled++;
      }

      // Per-account clip status
      for (const acc of accounts) {
        const doneForAccount = new Set<string>();
        for (const task of postTasks) {
          // Match by postAccountId if available, otherwise by platform
          const matches = task.postAccountId
            ? task.postAccountId === acc.postAccountId
            : task.platform === acc.platform;
          if (matches && (task.status === "posted" || task.status === "scheduled" || task.status === "pending")) {
            doneForAccount.add(task.clipId);
          }
        }
        for (const clip of clips) {
          if (doneForAccount.has(clip.curationId)) {
            perAccount[acc.postAccountId].scheduled++;
          } else {
            perAccount[acc.postAccountId].unscheduled++;
          }
        }
      }
    }

    return NextResponse.json({ totalClips, posted, scheduled, unscheduled, projectCount: projects.length, perAccount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
