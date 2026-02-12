import { NextRequest, NextResponse } from "next/server";
import { decode } from "html-entities";
import { YoutubeTranscript } from "youtube-transcript";

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get("videoId") || "Ks-_Mh1QhMc";
    const results: any = { videoId, timestamp: new Date().toISOString(), phases: {} };

    // Phase 2: ANDROID InnerTube
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

        results.phases.android = {
            httpStatus: res.status,
            playability: data?.playabilityStatus?.status,
            trackCount: tracks ? tracks.length : 0
        };

        if (tracks && tracks.length > 0) {
            const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
            results.phases.android.selectedTrack = { lang: track.languageCode, url: track.baseUrl?.substring(0, 80) };

            // Try JSON3
            try {
                const jr = await fetch(track.baseUrl + "&fmt=json3");
                const jt = await jr.text();
                results.phases.android.json3 = { status: jr.status, length: jt.length, preview: jt.substring(0, 100) };
            } catch (e: any) {
                results.phases.android.json3 = { error: e.message };
            }

            // Try raw XML
            try {
                const xr = await fetch(track.baseUrl);
                const xt = await xr.text();
                const parts: string[] = [];
                const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
                let m;
                while ((m = re.exec(xt)) !== null) parts.push(decode(m[1]));
                results.phases.android.xml = { status: xr.status, rawLength: xt.length, parsedParts: parts.length, preview: parts.join(" ").substring(0, 100) };
            } catch (e: any) {
                results.phases.android.xml = { error: e.message };
            }
        }
    } catch (e: any) {
        results.phases.android = { error: e.message };
    }

    // Phase 4: youtube-transcript npm
    try {
        const items = await YoutubeTranscript.fetchTranscript(videoId);
        if (items && items.length > 0) {
            const text = items.map((i: any) => decode(i.text)).join(" ");
            results.phases.youtubeTranscriptNpm = { success: true, items: items.length, textLen: text.length, preview: text.substring(0, 100) };
        } else {
            results.phases.youtubeTranscriptNpm = { success: false, reason: "empty" };
        }
    } catch (e: any) {
        results.phases.youtubeTranscriptNpm = { success: false, error: e.message };
    }

    // Check env
    results.env = {
        hasApiKey: !!process.env.OPENROUTER_API_KEY,
        keyPrefix: process.env.OPENROUTER_API_KEY?.substring(0, 8) || "none"
    };

    return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
