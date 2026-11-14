"use client";

import { useEffect, useState, useCallback } from "react";
import { Project, Clip, PostTask } from "@/lib/opusclip";
import { SOCIAL_ACCOUNTS, PLATFORM_ICONS } from "@/lib/accounts";

type EnrichedClip = Clip & { postTasks: PostTask[] };
type ProjectWithClips = Project & { clips?: EnrichedClip[]; loading?: boolean };

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
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<{ scheduled: number; errors: number } | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    SOCIAL_ACCOUNTS.map((a) => a.postAccountId)
  );
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

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

  const scheduleAll = async () => {
    setScheduling(true);
    setScheduleResult(null);
    setError(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedAccounts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScheduleResult({ scheduled: data.scheduled?.length || 0, errors: data.errors?.length || 0 });
      // Reload all expanded projects
      for (const pid of expandedProjects) {
        loadClips(pid);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setScheduling(false);
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
          <button
            onClick={scheduleAll}
            disabled={scheduling || selectedAccounts.length === 0}
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
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Status banner */}
        {scheduleResult && (
          <div className="bg-green-900/30 border border-green-700/40 rounded-lg px-4 py-3 text-sm text-green-300">
            Scheduled {scheduleResult.scheduled} clip{scheduleResult.scheduled !== 1 ? "s" : ""}
            {scheduleResult.errors > 0 && ` · ${scheduleResult.errors} failed`}
          </div>
        )}
        {error && (
          <div className="bg-red-900/30 border border-red-700/40 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Account selector */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-sm font-medium text-gray-300 mb-3">Post to accounts:</p>
          <div className="flex flex-wrap gap-2">
            {SOCIAL_ACCOUNTS.map((account) => {
              const active = selectedAccounts.includes(account.postAccountId);
              return (
                <button
                  key={account.postAccountId}
                  onClick={() => toggleAccount(account.postAccountId)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors cursor-pointer border ${
                    active
                      ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                      : "bg-gray-800 border-gray-700 text-gray-500"
                  }`}
                >
                  <span>{PLATFORM_ICONS[account.platform]}</span>
                  <span>{account.name}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Schedules during peak hours: Weekdays 12–2 PM & 6–9 PM · Weekends 10 AM–2 PM & 7–9 PM
          </p>
        </div>

        {/* Projects */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading projects...</div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => {
              const expanded = expandedProjects.has(project.projectId);
              return (
                <div key={project.projectId} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  {/* Project header */}
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

                  {/* Clips list */}
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
                                        <span>{PLATFORM_ICONS[task.platform]}</span>
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
      {/* Build timestamp */}
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
