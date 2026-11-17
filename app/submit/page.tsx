"use client";

import { useState } from "react";
import Link from "next/link";

const ASPECT_RATIOS = [
  { value: "portrait",   label: "Portrait  9:16 (default)" },
  { value: "square",     label: "Square    1:1" },
  { value: "landscape",  label: "Landscape 16:9" },
  { value: "four_five",  label: "4:5" },
];

const LANGUAGES = [
  { value: "",   label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
  { value: "ru", label: "Russian" },
];

type Mode = "clip" | "reframe" | "passthrough";

export default function SubmitPage() {
  const [videoUrl, setVideoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("clip");
  const [aspectRatio, setAspectRatio] = useState("portrait");
  const [enableCaption, setEnableCaption] = useState(true);
  const [enableAutoHook, setEnableAutoHook] = useState(false);
  const [removeFiller, setRemoveFiller] = useState(false);
  const [clipMinSec, setClipMinSec] = useState("");
  const [clipMaxSec, setClipMaxSec] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [sourceLang, setSourceLang] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [genre, setGenre] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ projectId?: string; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          title: title.trim() || undefined,
          skipSlicing:  mode === "reframe",
          skipCurate:   mode === "passthrough",
          aspectRatio,
          enableCaption,
          enableAutoHook: mode === "clip" ? enableAutoHook : undefined,
          removeFiller,
          clipMinSec:   mode === "clip" ? clipMinSec : "",
          clipMaxSec:   mode === "clip" ? clipMaxSec : "",
          rangeStart:   mode === "clip" ? rangeStart : "",
          rangeEnd:     mode === "clip" ? rangeEnd   : "",
          sourceLang:   sourceLang || undefined,
          targetLang:   targetLang || undefined,
          customPrompt: mode !== "passthrough" ? customPrompt.trim() : undefined,
          genre:        mode === "clip" ? genre.trim() : undefined,
          webhookUrl:   webhookUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors";
  const labelCls = "block text-sm font-medium text-gray-300 mb-1";
  const hintCls  = "text-xs text-gray-500 mt-1";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm cursor-pointer">
            ← Back
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Submit Video</h1>
            <p className="text-sm text-gray-400">Submit a URL to OpusClip for AI clipping</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Success result */}
        {result?.projectId && (
          <div className="mb-6 bg-green-900/30 border border-green-700/40 rounded-xl p-5">
            <p className="text-green-400 font-semibold text-sm mb-1">Submitted successfully!</p>
            <p className="text-green-300 text-sm">Project ID: <span className="font-mono">{result.projectId}</span></p>
            <p className="text-gray-400 text-xs mt-2">OpusClip is now processing the video. Once clips are ready they will appear in the dashboard automatically.</p>
            <div className="flex gap-3 mt-4">
              <Link href="/" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer">
                Go to Dashboard
              </Link>
              <button
                onClick={() => { setResult(null); setVideoUrl(""); setTitle(""); }}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                Submit Another
              </button>
            </div>
          </div>
        )}

        {/* Error result */}
        {result?.error && (
          <div className="mb-6 bg-red-900/30 border border-red-700/40 rounded-xl px-4 py-3 text-sm text-red-300">
            {result.error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Video URL */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="mb-4">
              <label className={labelCls}>Video URL <span className="text-red-400">*</span></label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className={inputCls}
                required
              />
              <p className={hintCls}>YouTube, Google Drive, Vimeo, Zoom, Rumble, Twitch, Facebook, LinkedIn, X, Dropbox, Riverside, Loom, Frame.io, StreamYard, or any public S3 mp4 (up to 10 GB)</p>
            </div>
            <div>
              <label className={labelCls}>Title <span className="text-gray-600">(optional)</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My video title"
                className={inputCls}
              />
            </div>
          </div>

          {/* Clipping Mode */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <p className={labelCls}>Clipping Mode</p>
            <div className="space-y-3">
              {([
                { v: "clip",        label: "AI Clipping",           desc: "Cuts the video into short, ranked, curated clips (default)" },
                { v: "reframe",     label: "Full Video Reframe",     desc: "Keeps the FULL video as one output — reframe + captions, no cutting" },
                { v: "passthrough", label: "No Curation Passthrough",desc: "Skips curation entirely, returns one full-length output without ranking" },
              ] as const).map(({ v, label, desc }) => (
                <label key={v} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="mode"
                    value={v}
                    checked={mode === v}
                    onChange={() => setMode(v)}
                    className="mt-0.5 accent-purple-500"
                  />
                  <div>
                    <span className="text-sm text-white">{label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Output Settings */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <p className={labelCls}>Output Settings</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Aspect Ratio</label>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className={inputCls}>
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={enableCaption} onChange={(e) => setEnableCaption(e.target.checked)} className="accent-purple-500" />
                <div>
                  <span className="text-sm text-white">Enable Captions</span>
                  <p className={hintCls}>Render captions onto the clips</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 cursor-pointer ${mode !== "clip" ? "opacity-40 pointer-events-none" : ""}`}>
                <input type="checkbox" checked={enableAutoHook} onChange={(e) => setEnableAutoHook(e.target.checked)} disabled={mode !== "clip"} className="accent-purple-500" />
                <div>
                  <span className="text-sm text-white">Enable Auto Hook</span>
                  <p className={hintCls}>Add an AI-generated hook to the start of each clip (AI Clipping only)</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={removeFiller} onChange={(e) => setRemoveFiller(e.target.checked)} className="accent-purple-500" />
                <div>
                  <span className="text-sm text-white">Remove Filler Words</span>
                  <p className={hintCls}>Cut out "um", "uh", "like", etc. from the rendered clips</p>
                </div>
              </label>
            </div>
          </div>

          {/* Clip Duration + Range (AI Clipping only) */}
          {mode === "clip" && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="mb-4">
                <p className={labelCls}>Clip Duration Range <span className="text-gray-600">(optional)</span></p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input type="number" min={0} max={600} value={clipMinSec} onChange={(e) => setClipMinSec(e.target.value)} placeholder="Min sec" className={inputCls} />
                  </div>
                  <span className="text-gray-500 text-sm">to</span>
                  <div className="flex-1">
                    <input type="number" min={0} max={600} value={clipMaxSec} onChange={(e) => setClipMaxSec(e.target.value)} placeholder="Max sec" className={inputCls} />
                  </div>
                </div>
                <p className={hintCls}>Leave empty to let OpusClip choose. Example: 0–30s for short clips, 30–60s for medium.</p>
              </div>
              <div>
                <p className={labelCls}>Source Video Range <span className="text-gray-600">(optional)</span></p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input type="number" min={0} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} placeholder="Start (sec)" className={inputCls} />
                  </div>
                  <span className="text-gray-500 text-sm">to</span>
                  <div className="flex-1">
                    <input type="number" min={0} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} placeholder="End (sec)" className={inputCls} />
                  </div>
                </div>
                <p className={hintCls}>Only clip from this segment of the source video. Leave empty to process the whole video.</p>
              </div>
            </div>
          )}

          {/* Language */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <p className={labelCls}>Language</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Source Language</label>
                <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className={inputCls}>
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Translate To</label>
                <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className={inputCls}>
                  <option value="">Same as source</option>
                  {LANGUAGES.filter(l => l.value).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <p className={hintCls}>Translates captions and text (not voice)</p>
              </div>
            </div>
          </div>

          {/* Advanced */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800/50 transition-colors cursor-pointer text-left"
            >
              <span>Advanced Options</span>
              <span className="text-gray-500">{showAdvanced ? "▲" : "▼"}</span>
            </button>
            {showAdvanced && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-800 pt-4">
                <div className={mode === "passthrough" ? "opacity-40 pointer-events-none" : ""}>
                  <label className={labelCls}>Custom Prompt</label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="e.g. Focus on the most emotional and surprising moments"
                    rows={3}
                    className={`${inputCls} resize-none`}
                    disabled={mode === "passthrough"}
                  />
                  <p className={hintCls}>Steers which moments get clipped. Replaces the deprecated topic keywords.</p>
                </div>
                <div className={mode !== "clip" ? "opacity-40 pointer-events-none" : ""}>
                  <label className={labelCls}>Genre / Topic Hint</label>
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="e.g. Tech, Comedy, Finance, Fitness"
                    className={inputCls}
                    disabled={mode !== "clip"}
                  />
                  <p className={hintCls}>Helps OpusClip optimise curation for the content type (AI Clipping only)</p>
                </div>
                <div>
                  <label className={labelCls}>Webhook URL</label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-server.com/webhook"
                    className={inputCls}
                  />
                  <p className={hintCls}>Called by OpusClip when the project finishes processing</p>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !videoUrl.trim()}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500
              text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer text-sm"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </>
            ) : (
              "Submit for Clipping"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
