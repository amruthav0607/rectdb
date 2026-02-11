import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
const { getSubtitles } = require('youtube-captions-scraper');
import { decode } from "html-entities";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) return NextResponse.json({ error: "videoId required" });

    const results: any = {};

    // 1. Library Test
    try {
        const items = await YoutubeTranscript.fetchTranscript(videoId);
        results.youtube_transcript_lib = { success: !!items, count: items?.length };
    } catch (e: any) {
        results.youtube_transcript_lib = { success: false, error: e.message };
    }

    // 2. Scraper-Scraper Test
    try {
        const captions = await getSubtitles({ videoID: videoId, lang: 'en' });
        results.captions_scraper_lib = { success: !!captions, count: captions?.length };
    } catch (e: any) {
        results.captions_scraper_lib = { success: false, error: e.message };
    }

    // 3. Ultimate Scraper Deep Dive
    try {
        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
            cache: 'no-store'
        });
        const html = await res.text();

        const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
        results.ultimate_scraper = {
            html_length: html.length,
            has_player_response: !!playerResponseMatch,
        };

        if (playerResponseMatch) {
            const playerResponse = JSON.parse(playerResponseMatch[1]);
            const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            results.ultimate_scraper.has_captions_field = !!playerResponse?.captions;
            results.ultimate_scraper.track_count = captions?.length || 0;
            if (captions && captions.length > 0) {
                results.ultimate_scraper.first_track_url_snippet = captions[0].baseUrl.slice(0, 50);
            }
        }
    } catch (e: any) {
        results.ultimate_scraper_err = e.message;
    }

    return NextResponse.json(results);
}
