const BASE_URL = "https://api.opus.pro/api";
const API_KEY = process.env.OPUSCLIP_API_KEY!;

const headers = () => ({
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
});

export interface Project {
  id: string;
  projectId: string;
  title: string;
  stage: string;
  clipCount: number;
  createdAt: string;
  sourceInfo?: {
    thumbnailUrl?: string;
    type?: string;
  };
}

export interface Clip {
  id: string;
  projectId: string;
  curationId: string;
  title: string;
  description: string;
  durationMs: number;
  uriForThumbnail: string;
  uriForPreview: string;
}

export interface PostTask {
  postId: string;
  projectId: string;
  clipId: string;
  scheduleId: string | null;
  platform: string;
  postAccountId?: string;
  status: "posted" | "scheduled" | "failed" | "pending";
  publishAt: string;
  postDetail: {
    title: string;
    custom?: { description?: string; privacy?: string };
  };
  extVideoLink?: string;
}

export interface SocialAccount {
  postAccountId: string;
  platform: string;
  name: string;
  profileUrl: string;
  subAccountId?: string;
}

export async function listSocialAccounts(): Promise<SocialAccount[]> {
  try {
    const res = await fetch(`${BASE_URL}/post-accounts`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list: Record<string, unknown>[] = data.list || data.data || data.accounts || [];
    return list
      .map((a) => ({
        postAccountId: (a.postAccountId || a.post_account_id) as string,
        platform: a.platform as string,
        name: a.name as string,
        profileUrl: (a.profileUrl || a.profile_url || "") as string,
        subAccountId: (a.subAccountId || a.sub_account_id) as string | undefined,
      }))
      .filter((a) => a.postAccountId);
  } catch {
    return [];
  }
}

export async function listProjects(page = 0, pageSize = 100): Promise<{ projects: Project[]; total: number }> {
  const res = await fetch(`${BASE_URL}/clip-projects?page=${page}&pageSize=${pageSize}`, {
    headers: headers(),
    cache: "no-store",
  });
  const data = await res.json();
  return {
    projects: (data.list || []).filter((p: Project) => p.stage === "COMPLETE"),
    total: data.paging?.totalCount || 0,
  };
}

export async function listClips(projectId: string): Promise<Clip[]> {
  const res = await fetch(
    `${BASE_URL}/exportable-clips?q=findByProjectId&projectId=${projectId}`,
    { headers: headers(), cache: "no-store" }
  );
  const data = await res.json();
  return (data.data || []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    projectId: c.projectId as string,
    curationId: (c.id as string).split(".")[1],
    title: c.title as string,
    description: c.description as string,
    durationMs: c.durationMs as number,
    uriForThumbnail: c.uriForThumbnail as string,
    uriForPreview: c.uriForPreview as string,
  }));
}

export async function listPostTasks(projectId: string): Promise<PostTask[]> {
  const res = await fetch(
    `${BASE_URL}/post-tasks?q=findByProjectId&projectId=${projectId}`,
    { headers: headers(), cache: "no-store" }
  );
  const data = await res.json();
  return data.data?.data || [];
}

export async function scheduleClip(params: {
  projectId: string;
  clipId: string; // curation ID (without project prefix)
  postAccountId: string;
  subAccountId?: string;
  publishAt: string; // ISO 8601 UTC
  title: string;
  description?: string;
  privacy?: string;
}, retries = 5): Promise<{ scheduleId: string; postId: string; publishAt: string }> {
  const body: Record<string, unknown> = {
    projectId: params.projectId,
    clipId: params.clipId,
    postAccountId: params.postAccountId,
    publishAt: params.publishAt,
    postDetail: {
      title: params.title,
      custom: {
        privacy: params.privacy || "public",
        ...(params.description ? { description: params.description } : {}),
      },
    },
  };
  if (params.subAccountId) body.subAccountId = params.subAccountId;

  const res = await fetch(`${BASE_URL}/publish-schedules`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 429 && retries > 0) {
      const base = typeof data.retryAfter === "number" ? data.retryAfter : 1200;
      const attempt = 6 - retries; // 1st retry = 1, 2nd = 2, ...
      // Jitter (0–600ms random) prevents concurrent workers from thundering-herding
      // on the same retry window and depleting the token bucket again
      const jitter = Math.floor(Math.random() * 600);
      const waitMs = base * attempt + 300 + jitter;
      await new Promise((r) => setTimeout(r, waitMs));
      return scheduleClip(params, retries - 1);
    }
    const raw = data.errorMessage ?? data.message ?? data.error ?? data;
    // Prefer a plain string message; for objects extract .message; last resort JSON
    const detail = typeof raw === "string"
      ? raw
      : typeof raw?.message === "string"
      ? raw.message
      : JSON.stringify(raw);
    throw new Error(`[${res.status}] ${detail}`);
  }
  return data.data;
}

export async function cancelSchedule(scheduleId: string): Promise<void> {
  await fetch(`${BASE_URL}/publish-schedules/${scheduleId}`, {
    method: "DELETE",
    headers: headers(),
  });
}
