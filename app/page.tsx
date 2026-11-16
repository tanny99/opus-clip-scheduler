"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Project, Clip, PostTask, SocialAccount } from "@/lib/opusclip";
import { type ScheduleItem } from "@/app/api/schedule/route";
import Link from "next/link";
import { PLATFORM_ICONS } from "@/lib/accounts";

type EnrichedClip = Clip & { postTasks: PostTask[] };
type ProjectWithClips = Project & { clips?: EnrichedClip[]; loading?: boolean };

type AccountStat = { name: string; platform: string; scheduled: number; unscheduled: number };

type Stats = {
  totalClips: number;
  posted: number;
  scheduled: number;
  unscheduled: number;
  projectCount: number;
  perAccount: Record<string, AccountStat>;
};

type ScheduleProgress = {
  total: number;
  scheduled: number;
  failed: number;
  done: boolean;
  errors: string[];
};

// ── Local cache (localStorage) ────────────────────────────────────────────────
type PairItem = Omit<ScheduleItem, "publishAt">;
const CACHE_KEY = "opusclip_schedule_cache";
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

function saveScheduleCache(pairs: PairItem[], accountIds: string[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), pairs, accountIds }));
  } catch {}
}

function loadScheduleCache(accountIds: string[]): { pairs: PairItem[]; ageMs: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { t, pairs, accountIds: cachedIds } = JSON.parse(raw) as {
      t: number; pairs: PairItem[]; accountIds: string[];
    };
    const ageMs = Date.now() - t;
    if (ageMs > CACHE_TTL_MS) return null;
    // Only reuse cache if same set of accounts
    if (JSON.stringify([...accountIds].sort()) !== JSON.stringify([...cachedIds].sort())) return null;
    return { pairs, ageMs };
  } catch {
    return null;
  }
}

function clearScheduleCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    posted: "bg-green-500/20 text-green-400 border border-green-500/30",
    scheduled: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    pending: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    failed: "bg-red-500/20 text-red-400 border border-red-500/30",
  };
  return colors[status] || "bg-gray-500/20 text-gray-400 border border-gray-500/30";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function durationStr(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectWithClips[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<string>("");
  const [progress, setProgress] = useState<ScheduleProgress | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pendingItems, setPendingItems] = useState<ScheduleItem[]>([]);
  const pauseRef = useRef(false);
  const haltRef = useRef(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null);
  const [rateLimitHits, setRateLimitHits] = useState(0);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      setStats(data);
    } catch {
      // non-critical
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      const accs: SocialAccount[] = data.accounts || [];
      setAccounts(accs);
      setSelectedAccounts(accs.map((a) => a.postAccountId));
    } catch {}
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      setError("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchAccounts();
    fetchStats();
  }, [fetchProjects, fetchAccounts, fetchStats]);

  const loadClips = useCallback(async (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => p.projectId === projectId ? { ...p, loading: true } : p)
    );
    try {
      const res = await fetch(`/api/clips?projectId=${projectId}`);
      const data = await res.json();
      setProjects((prev) =>
        prev.map((p) =>
          p.projectId === projectId ? { ...p, clips: data.clips, loading: false } : p
        )
      );
    } catch {
      setProjects((prev) =>
        prev.map((p) => p.projectId === projectId ? { ...p, loading: false } : p)
      );
    }
  }, []);

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
        const project = projects.find((p) => p.projectId === projectId);
        if (!project?.clips) loadClips(projectId);
      }
      return next;
    });
  }, [projects, loadClips]);

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const CHUNK_SIZE = 30;

  // Execute a list of items in chunks. Respects pauseRef / haltRef between chunks.
  const executeItems = async (
    items: ScheduleItem[],
    startScheduled: number,
    startFailed: number,
    total: number,
    lastErrs: string[],
  ) => {
    let scheduled = startScheduled;
    let failed = startFailed;
    let lastErrors = lastErrs;

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      // Check halt first
      if (haltRef.current) {
        haltRef.current = false;
        setPendingItems([]);
        setIsPaused(false);
        setScheduling(false);
        setProgress((prev) => prev ? { ...prev, done: true } : null);
        fetchStats();
        return;
      }
      // Check pause
      if (pauseRef.current) {
        setPendingItems(items.slice(i));
        setIsPaused(true);
        setScheduling(false);
        return; // leave progress as-is (not done)
      }

      const chunk = items.slice(i, i + CHUNK_SIZE);
      // Retry on network errors (TypeError: Failed to fetch) up to 3 times
      let attempt = 0;
      let data: { scheduled: number; failed: number; errors: string[]; rateLimitHits?: number } | null = null;
      while (attempt <= 3) {
        try {
          const res = await fetch("/api/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "execute", items: chunk }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.json();
          break;
        } catch (err) {
          if (err instanceof TypeError && attempt < 3) {
            attempt++;
            setScheduleStatus(`Network error — retrying (${attempt}/3)...`);
            await new Promise((r) => setTimeout(r, attempt * 3000));
            continue;
          }
          setError(String(err));
          setPendingItems(items.slice(i));
          setIsPaused(true);
          setScheduling(false);
          return;
        }
      }
      if (!data) continue;
      scheduled += data.scheduled;
      failed += data.failed;
      if (data.rateLimitHits) setRateLimitHits((prev) => prev + data!.rateLimitHits!);
      lastErrors = data.errors?.length ? data.errors : lastErrors;
      setScheduleStatus("");
      setProgress({ total, scheduled, failed, done: false, errors: lastErrors });
    }

    // All items processed — cache is now stale, clear it
    clearScheduleCache();
    setCacheAgeMs(null);
    setProgress((prev) => prev ? { ...prev, done: true } : null);
    setPendingItems([]);
    setIsPaused(false);
    setScheduling(false);
    fetchStats();
    for (const pid of expandedProjects) loadClips(pid);
  };

  const stopSchedule = () => { pauseRef.current = true; };

  const haltSchedule = () => {
    haltRef.current = true;
    pauseRef.current = false;
  };

  const continueSchedule = async () => {
    if (pendingItems.length === 0) return;
    pauseRef.current = false;
    setIsPaused(false);
    setScheduling(true);
    await executeItems(
      pendingItems,
      progress?.scheduled ?? 0,
      progress?.failed ?? 0,
      progress?.total ?? pendingItems.length,
      progress?.errors ?? [],
    );
  };

  const runSchedule = async (accountIds: string[], failedOnly = false, forceRefresh = false) => {
    setScheduling(true);
    setProgress(null);
    setError(null);
    setShowErrors(false);
    setIsPaused(false);
    setPendingItems([]);
    setRateLimitHits(0);
    pauseRef.current = false;
    haltRef.current = false;

    try {
      let prepBody: Record<string, unknown>;

      // Try cache first (skip for failedOnly or forceRefresh)
      const cached = !failedOnly && !forceRefresh ? loadScheduleCache(accountIds) : null;
      if (cached) {
        setCacheAgeMs(cached.ageMs);
        setScheduleStatus("Loading from cache...");
        prepBody = { cachedPairs: cached.pairs };
      } else {
        setCacheAgeMs(null);
        setScheduleStatus("Fetching clips from OpusClip...");
        prepBody = { selectedAccounts: accountIds, failedOnly };
      }

      const prepRes = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepBody),
      });
      if (!prepRes.ok) throw new Error(`Prepare failed: HTTP ${prepRes.status}`);
      const result = await prepRes.json();
      const items: ScheduleItem[] = result.items;

      // If we fetched fresh, save pairs to cache for next time
      if (!cached && !failedOnly) {
        const pairs = items.map(({ publishAt: _p, ...pair }) => pair);
        saveScheduleCache(pairs, accountIds);
      }

      setScheduleStatus("");

      if (items.length === 0) {
        setProgress({ total: 0, scheduled: 0, failed: 0, done: true, errors: [] });
        setScheduling(false);
        return;
      }

      setProgress({ total: items.length, scheduled: 0, failed: 0, done: false, errors: [] });
      await executeItems(items, 0, 0, items.length, []);
    } catch (err) {
      setError(String(err));
      setScheduling(false);
      setScheduleStatus("");
    } finally {
      setScheduleStatus("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">OpusClip Scheduler</h1>
            <p className="text-sm text-gray-400">{projects.length} projects · Auto-schedules at peak engagement times</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/submit"
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              + Submit Video
            </Link>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Auto-schedule: daily 9 AM
            </div>
            {progress?.done && progress.failed > 0 && (
              <button
                onClick={() => runSchedule(selectedAccounts, false, true)}
                disabled={scheduling}
                className="px-4 py-2.5 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500
                  text-white font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer text-sm"
              >
                Retry {progress.failed} Failed
              </button>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => runSchedule(selectedAccounts)}
                disabled={scheduling || isPaused || selectedAccounts.length === 0}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500
                  text-white font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
              >
                {scheduling ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Scheduling...
                  </>
                ) : (
                  "Schedule All Unposted"
                )}
              </button>
              <button
                onClick={() => runSchedule(selectedAccounts, false, true)}
                disabled={scheduling || isPaused || selectedAccounts.length === 0}
                title="Force fresh fetch from OpusClip (clears cache)"
                className="px-2 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-700 disabled:text-gray-500
                  text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer text-sm border border-gray-700"
              >
                ↺
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {([
            { label: "Projects", value: stats?.projectCount, color: "text-white" },
            { label: "Total Clips", value: stats?.totalClips, color: "text-white" },
            { label: "Posted", value: stats?.posted, color: "text-green-400" },
            { label: "Scheduled", value: stats?.scheduled, color: "text-blue-400" },
            { label: "Not Uploaded Yet", value: stats?.unscheduled, color: "text-yellow-400" },
          ] as const).map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>
                {statsLoading ? <span className="text-gray-600 text-lg">...</span> : (value ?? 0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Per-account cards */}
        <div>
          <p className="text-sm font-medium text-gray-300 mb-3">Accounts</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {accounts.map((account) => {
              const stat = stats?.perAccount?.[account.postAccountId];
              return (
                <div key={account.postAccountId} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{PLATFORM_ICONS[account.platform] || "📱"}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{account.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{account.platform.replace("_", " ").toLowerCase()}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-blue-400">
                        {statsLoading ? <span className="text-gray-600 text-sm">...</span> : (stat?.scheduled ?? 0)}
                      </div>
                      <div className="text-xs text-gray-500">Scheduled</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-yellow-400">
                        {statsLoading ? <span className="text-gray-600 text-sm">...</span> : (stat?.unscheduled ?? 0)}
                      </div>
                      <div className="text-xs text-gray-500">Not Uploaded</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Peak hours: Weekdays 12–2 PM & 6–9 PM · Weekends 10 AM–2 PM & 7–9 PM
          </p>
        </div>

        {/* Live scheduling progress */}
        {(scheduling || progress) && (
          <div className={`rounded-xl border p-4 ${
            progress?.done && progress.failed === 0
              ? "bg-green-900/20 border-green-700/40"
              : progress?.done
              ? "bg-yellow-900/20 border-yellow-700/40"
              : "bg-gray-900 border-gray-700"
          }`}>
            {!progress ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <svg className="animate-spin h-4 w-4 text-purple-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {scheduleStatus || "Fetching unscheduled clips..."}
                </div>
                {cacheAgeMs !== null && (
                  <p className="text-xs text-blue-400/70 ml-7">
                    Using cached data ({Math.round(cacheAgeMs / 60000)}m old) — skipping {Math.round(cacheAgeMs / 60000) < 1 ? "seconds" : ""} of API calls
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {!progress.done && !isPaused && (
                      <svg className="animate-spin h-4 w-4 text-purple-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    <span className="text-sm font-medium text-white">
                      {progress.done
                        ? "Scheduling complete"
                        : isPaused
                        ? `Paused — ${pendingItems.length} clips remaining`
                        : "Scheduling in progress..."}
                    </span>
                  </div>
                  {/* Control buttons */}
                  {!progress.done && (
                    <div className="flex gap-2 flex-shrink-0">
                      {isPaused ? (
                        <button
                          onClick={continueSchedule}
                          className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                        >
                          ▶ Continue
                        </button>
                      ) : (
                        <button
                          onClick={stopSchedule}
                          className="px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                        >
                          ⏸ Stop
                        </button>
                      )}
                      <button
                        onClick={haltSchedule}
                        className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        ⏹ Halt
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-400">{progress.scheduled}</div>
                    <div className="text-xs text-gray-500">Scheduled</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-400">{progress.failed}</div>
                    <div className="text-xs text-gray-500">Failed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-300">
                      {Math.max(0, progress.total - progress.scheduled - progress.failed)}
                    </div>
                    <div className="text-xs text-gray-500">Left</div>
                  </div>
                </div>
                {progress.total > 0 && (
                  <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${((progress.scheduled + progress.failed) / progress.total) * 100}%` }}
                    />
                  </div>
                )}
                {/* Rate limit + cache info row */}
                <div className="mt-2 flex flex-wrap gap-3 items-center">
                  {rateLimitHits > 0 && (
                    <span className="text-xs text-orange-400 bg-orange-900/20 border border-orange-700/30 px-2 py-0.5 rounded-full">
                      ⚠ Rate limited {rateLimitHits}× — auto-retried
                    </span>
                  )}
                  {scheduleStatus && (
                    <span className="text-xs text-yellow-400 animate-pulse">{scheduleStatus}</span>
                  )}
                  {cacheAgeMs !== null && !progress.done && (
                    <span className="text-xs text-blue-400/60">
                      Using cached data ({Math.round(cacheAgeMs / 60000)}m old)
                    </span>
                  )}
                </div>
                {progress.done && progress.errors.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowErrors((v) => !v)}
                      className="text-xs text-red-400 hover:text-red-300 underline cursor-pointer"
                    >
                      {showErrors ? "Hide" : "Show"} error details ({progress.errors.length} samples)
                    </button>
                    {showErrors && (
                      <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                        {progress.errors.map((e, i) => (
                          <p key={i} className="text-xs text-red-300 font-mono bg-red-900/20 px-2 py-1 rounded">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/40 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Projects */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading projects...</div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => {
              const expanded = expandedProjects.has(project.projectId);
              return (
                <div key={project.projectId} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <button
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-800/50 transition-colors text-left cursor-pointer"
                    onClick={() => toggleProject(project.projectId)}
                  >
                    <span className="text-gray-400 text-sm">{expanded ? "▼" : "▶"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{project.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {project.clipCount} clips · {new Date(project.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                      {project.stage}
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-800">
                      {project.loading ? (
                        <div className="text-center py-8 text-gray-500 text-sm">Loading clips...</div>
                      ) : !project.clips?.length ? (
                        <div className="text-center py-8 text-gray-500 text-sm">No clips found</div>
                      ) : (
                        <div className="divide-y divide-gray-800">
                          {project.clips.map((clip) => (
                            <div key={clip.id} className="flex gap-4 p-4">
                              {clip.uriForThumbnail && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={clip.uriForThumbnail}
                                  alt=""
                                  className="w-24 h-14 object-cover rounded-lg flex-shrink-0 bg-gray-800"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{clip.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{durationStr(clip.durationMs)}</p>
                                {clip.postTasks.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {clip.postTasks.map((task) => (
                                      <div
                                        key={task.postId}
                                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusBadge(task.status)}`}
                                      >
                                        <span>{PLATFORM_ICONS[task.platform] || "📱"}</span>
                                        <span className="capitalize">{task.status}</span>
                                        <span className="opacity-60">· {formatDate(task.publishAt)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="inline-block mt-2 text-xs text-gray-500 italic">Not scheduled</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="fixed bottom-3 right-4 text-xs text-gray-600">
        Last updated:{" "}
        {new Date(process.env.NEXT_PUBLIC_BUILD_TIME!).toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZoneName: "short",
        })}
      </div>
    </div>
  );
}
