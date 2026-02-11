import { NextResponse } from "next/server";
import { decode } from "html-entities";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) return NextResponse.json({ error: "videoId required" });

    const results: any = {};

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
            cache: 'no-store'
        });
        const html = await res.text();

        results.ok = res.ok;
        results.status = res.status;
        results.html_length = html.length;
        results.has_ytInitialPlayerResponse = html.includes("ytInitialPlayerResponse");
        results.is_blocked = html.includes("recaptcha") || html.includes("consent.youtube.com") || html.includes("Checking your browser");

        // Find where ytInitialPlayerResponse starts
        const start = html.indexOf("ytInitialPlayerResponse");
        if (start !== -1) {
            results.snippet = html.slice(start, start + 500);

            // Try to extract the JSON anyway
            const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
            results.json_match_founds = !!match;
            if (match) {
                try {
                    const parsed = JSON.parse(match[1]);
                    results.has_captions = !!parsed.captions;
                    results.captions_type = typeof parsed.captions;
                    if (parsed.captions) {
                        results.tracks = parsed.captions.playerCaptionsTracklistRenderer?.captionTracks?.length || 0;
                    }
                } catch (e: any) {
                    results.parse_error = e.message;
                }
            }
        }

    } catch (e: any) {
        results.error = e.message;
    }

    return NextResponse.json(results);
}
