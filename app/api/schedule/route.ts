import { NextRequest, NextResponse } from "next/server";
import { listProjects, listClips, listPostTasks, scheduleClip, listSocialAccounts } from "@/lib/opusclip";
import { SOCIAL_ACCOUNTS } from "@/lib/accounts";
import { generateScheduleSlots } from "@/lib/scheduler";

export const maxDuration = 300;

// 5 concurrent workers + jittered retry = ~5× throughput vs sequential.
// scheduleClip() handles 429s internally with exponential backoff + random jitter
// so workers naturally de-sync and stop thundering-herding the token bucket.
const CONCURRENCY = 5;

export interface ScheduleItem {
  projectId: string;
  clipId: string;
  postAccountId: string;
  subAccountId?: string;
  publishAt: string;
  title: string;
  description: string;
}

// ── PREPARE ──────────────────────────────────────────────────────────────────
// Fetches all projects/clips/tasks and returns the full work list with pre-assigned
// publishAt slots. Called once — the client then executes in small chunks.
// If `cachedPairs` is provided, skips fetching and just assigns fresh publishAt slots.
async function handlePrepare(body: {
  selectedAccounts?: string[];
  failedOnly?: boolean;
  cachedPairs?: Array<Omit<ScheduleItem, "publishAt">>;
}) {
  // Fast path: client has cached pairs, just re-assign slots from now
  if (body.cachedPairs && body.cachedPairs.length > 0) {
    const slots = generateScheduleSlots(body.cachedPairs.length, new Date());
    const items: ScheduleItem[] = body.cachedPairs.map((pair, i) => ({
      ...pair,
      publishAt: slots[i].toISOString(),
    }));
    return NextResponse.json({ items, fromCache: true });
  }
  const selectedAccountIds = body.selectedAccounts || SOCIAL_ACCOUNTS.map((a) => a.postAccountId);
  const failedOnly = body.failedOnly || false;

  const apiAccounts = await listSocialAccounts();
  const allAccounts = apiAccounts.length > 0
    ? apiAccounts.map((a) => {
        const h = SOCIAL_ACCOUNTS.find((h) => h.postAccountId === a.postAccountId);
        return { ...a, subAccountId: a.subAccountId || h?.subAccountId };
      })
    : SOCIAL_ACCOUNTS;
  const accounts = allAccounts.filter((a) => selectedAccountIds.includes(a.postAccountId));

  if (accounts.length === 0) return NextResponse.json({ items: [] });

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

  const toSchedule: Omit<ScheduleItem, "publishAt">[] = [];

  for (const { project, clips, postTasks } of projectData) {
    const postedSet = new Set<string>();
    const failedSet = new Set<string>();
    for (const task of postTasks) {
      const key = `${task.clipId}::${task.postAccountId || task.platform}`;
      if (task.status === "posted" || task.status === "scheduled" || task.status === "pending") {
        postedSet.add(key);
        // also match by platform for older tasks without postAccountId
        postedSet.add(`${task.clipId}::${task.platform}`);
      }
      if (task.status === "failed") failedSet.add(key);
    }

    for (const clip of clips) {
      for (const acc of accounts) {
        const keyById = `${clip.curationId}::${acc.postAccountId}`;
        const keyByPlatform = `${clip.curationId}::${acc.platform}`;
        if (postedSet.has(keyById) || postedSet.has(keyByPlatform)) continue;
        if (failedOnly && !failedSet.has(keyById)) continue;
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

  // Pre-assign publishAt slots for the entire list so there are no collisions
  const slots = generateScheduleSlots(toSchedule.length, new Date());
  const items: ScheduleItem[] = toSchedule.map((item, i) => ({
    ...item,
    publishAt: slots[i].toISOString(),
  }));

  return NextResponse.json({ items });
}

export type ItemResult = {
  title: string;
  postAccountId: string;
  status: "ok" | "failed";
  error?: string;
};

// ── EXECUTE ───────────────────────────────────────────────────────────────────
// Runs CONCURRENCY workers in parallel. Each worker calls scheduleClip() which
// has jittered exponential backoff on 429 — workers naturally de-sync so they
// don't all retry at the same instant and deplete the token bucket again.
async function handleExecute(body: { items: ScheduleItem[] }) {
  const items = body.items || [];
  if (items.length === 0) return NextResponse.json({ scheduled: 0, failed: 0, errors: [], results: [], rateLimitHits: 0 });

  let scheduled = 0;
  let failed = 0;
  const errors: string[] = [];
  const itemResults: ItemResult[] = new Array(items.length);

  let next = 0;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      const item = items[idx];
      try {
        await scheduleClip({
          projectId: item.projectId,
          clipId: item.clipId,
          postAccountId: item.postAccountId,
          subAccountId: item.subAccountId,
          publishAt: item.publishAt,
          title: item.title,
          description: item.description,
          privacy: "public",
        });
        scheduled++;
        itemResults[idx] = { title: item.title, postAccountId: item.postAccountId, status: "ok" };
      } catch (err) {
        failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errors.length < 20) errors.push(`${item.title.slice(0, 40)} → ${errMsg}`);
        itemResults[idx] = { title: item.title, postAccountId: item.postAccountId, status: "failed", error: errMsg };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));

  const rateLimitHits = errors.filter((e) => e.includes("[429]")).length;
  return NextResponse.json({ scheduled, failed, errors, rateLimitHits, results: itemResults });
}

// ── ROUTER ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.action === "execute") return handleExecute(body);
  return handlePrepare(body); // default: prepare
}
