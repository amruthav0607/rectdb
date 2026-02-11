import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { decode } from "html-entities";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) return NextResponse.json({ error: "videoId required" });

    const results: any = {};

    // Test Phase 2.5: Library
    try {
        const items = await YoutubeTranscript.fetchTranscript(videoId);
        results.phase2_5 = { success: !!items, length: items?.length };
    } catch (e: any) {
        results.phase2_5 = { success: false, error: e.message };
    }

    // Test Phase 3: Enhanced Scraper
    try {
        const userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
        ];

        results.phase3 = [];
        for (const ua of userAgents) {
            try {
                const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
                    headers: {
                        "User-Agent": ua,
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                    cache: 'no-store'
                });
                const html = await res.text();
                const captionsMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);
                results.phase3.push({
                    ua: ua.slice(0, 20),
                    ok: res.ok,
                    hasTracks: !!captionsMatch,
                    blocked: html.includes("recaptcha") || html.includes("consent.youtube.com")
                });
            } catch (innerE: any) {
                results.phase3.push({ ua: ua.slice(0, 20), error: innerE.message });
            }
        }
    } catch (e: any) {
        results.phase3_global = { error: e.message };
    }

    return NextResponse.json(results);
}
