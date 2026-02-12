import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { decode } from "html-entities";

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get("videoId") || "dQw4w9WgXcQ";
    const results: any = { videoId, tests: {} };

    // Test 1: youtube-transcript npm
    try {
        const items = await YoutubeTranscript.fetchTranscript(videoId);
        if (items && items.length > 0) {
            const text = items.map((i: any) => decode(i.text)).join(" ");
            results.tests.youtubeTranscriptNpm = {
                success: true,
                itemCount: items.length,
                textLength: text.length,
                preview: text.substring(0, 150)
            };
        } else {
            results.tests.youtubeTranscriptNpm = { success: false, reason: "empty items" };
        }
    } catch (e: any) {
        results.tests.youtubeTranscriptNpm = { success: false, error: e.message };
    }

    // Test 2: youtube-captions-scraper
    try {
        const { getSubtitles } = require('youtube-captions-scraper');
        const captions = await getSubtitles({ videoID: videoId, lang: 'en' });
        if (captions && captions.length > 0) {
            const text = captions.map((c: any) => decode(c.text)).join(" ");
            results.tests.captionsScraper = {
                success: true,
                itemCount: captions.length,
                textLength: text.length,
                preview: text.substring(0, 150)
            };
        } else {
            results.tests.captionsScraper = { success: false, reason: "empty captions" };
        }
    } catch (e: any) {
        results.tests.captionsScraper = { success: false, error: e.message };
    }

    // Test 3: ANDROID InnerTube with proper caption URL handling (XML format)
    try {
        const payload = {
            videoId,
            context: { client: { hl: "en", gl: "US", clientName: "ANDROID", clientVersion: "19.09.37" } },
            playbackContext: { contentCheckOk: true, racyCheckOk: true }
        };
        const res = await fetch("https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w", {
            method: "POST", body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        const playStatus = data?.playabilityStatus?.status;

        results.tests.androidInnerTube = {
            playabilityStatus: playStatus,
            trackCount: tracks ? tracks.length : 0
        };

        if (tracks && tracks.length > 0) {
            const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
            // Try XML format (not json3) since ANDROID returns XML
            const capRes = await fetch(track.baseUrl);
            const capText = await capRes.text();
            // Parse XML
            const textParts: string[] = [];
            const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
            let m;
            while ((m = re.exec(capText)) !== null) {
                textParts.push(decode(m[1]));
            }
            if (textParts.length > 0) {
                const fullText = textParts.join(" ");
                results.tests.androidInnerTube.captionSuccess = true;
                results.tests.androidInnerTube.textLength = fullText.length;
                results.tests.androidInnerTube.preview = fullText.substring(0, 150);
            } else {
                results.tests.androidInnerTube.captionSuccess = false;
                results.tests.androidInnerTube.rawPreview = capText.substring(0, 200);
            }
        }
    } catch (e: any) {
        results.tests.androidInnerTube = { error: e.message };
    }

    results.env = { hasApiKey: !!process.env.OPENROUTER_API_KEY };
    return NextResponse.json(results);
}
