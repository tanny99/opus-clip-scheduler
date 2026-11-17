import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://api.opus.pro/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Build payload — only include fields that are set
    const payload: Record<string, unknown> = {
      videoUrl: body.videoUrl,
    };

    if (body.title)         payload.title          = body.title;
    if (body.skipSlicing)   payload.skipSlicing    = true;
    if (body.skipCurate)    payload.skipCurate     = true;
    if (body.aspectRatio)   payload.aspectRatio    = body.aspectRatio;
    if (body.enableCaption != null) payload.enableCaption = body.enableCaption;
    if (body.enableAutoHook)        payload.enableAutoHook = true;
    if (body.removeFiller)          payload.removeFiller   = true;
    if (body.customPrompt)  payload.customPrompt   = body.customPrompt;
    if (body.genre)         payload.genre          = body.genre;
    if (body.model)         payload.model          = body.model;
    if (body.sourceLang)    payload.sourceLang     = body.sourceLang;
    if (body.targetLang)    payload.targetLang     = body.targetLang;
    if (body.webhookUrl)    payload.webhookUrl     = body.webhookUrl;
    if (body.brandTemplateId) payload.brandTemplateId = body.brandTemplateId;
    if (body.rangeStart != null && body.rangeStart !== "") payload.rangeStart = Number(body.rangeStart);
    if (body.rangeEnd   != null && body.rangeEnd   !== "") payload.rangeEnd   = Number(body.rangeEnd);
    if (body.clipMinSec != null && body.clipMaxSec != null && body.clipMinSec !== "" && body.clipMaxSec !== "") {
      payload.clipDurationsSec = [[Number(body.clipMinSec), Number(body.clipMaxSec)]];
    }

    const res = await fetch(`${BASE_URL}/clip-projects`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPUSCLIP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data.errorMessage || data.message || data.error || JSON.stringify(data);
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    return NextResponse.json({ projectId: data.data?.projectId || data.projectId || data.data, raw: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
