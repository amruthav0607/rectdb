import { NextRequest, NextResponse } from "next/server";
import { decode } from "html-entities";

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get("videoId") || "dQw4w9WgXcQ";
    const results: any = { videoId, tests: {} };

    // Test 1: ANDROID InnerTube
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
        results.tests.android = {
            status: res.status,
            trackCount: tracks ? tracks.length : 0,
            tracks: tracks ? tracks.map((t: any) => ({ lang: t.languageCode, label: t.name?.simpleText })) : [],
            hasPlayability: !!data?.playabilityStatus,
            playabilityStatus: data?.playabilityStatus?.status
        };

        // If tracks found, try to fetch actual captions
        if (tracks && tracks.length > 0) {
            const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
            const capRes = await fetch(track.baseUrl + "&fmt=json3");
            const capJson = await capRes.json();
            if (capJson.events) {
                const text = capJson.events
                    .filter((e: any) => e.segs)
                    .map((e: any) => e.segs.map((s: any) => s.utf8).join("")).join(" ");
                results.tests.android.captionTextLength = decode(text).length;
                results.tests.android.captionPreview = decode(text).substring(0, 100);
            }
        }
    } catch (e: any) {
        results.tests.android = { error: e.message };
    }

    // Test 2: IOS InnerTube
    try {
        const payload = {
            videoId,
            context: { client: { hl: "en", gl: "US", clientName: "IOS", clientVersion: "19.09.3" } },
            playbackContext: { contentCheckOk: true, racyCheckOk: true }
        };
        const res = await fetch("https://www.youtube.com/youtubei/v1/player?key=AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc", {
            method: "POST", body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        results.tests.ios = {
            status: res.status,
            trackCount: tracks ? tracks.length : 0,
            playabilityStatus: data?.playabilityStatus?.status
        };
    } catch (e: any) {
        results.tests.ios = { error: e.message };
    }

    // Test 3: WEB InnerTube
    try {
        const payload = {
            videoId,
            context: { client: { hl: "en", gl: "US", clientName: "WEB", clientVersion: "2.20241113.01.00" } },
            playbackContext: { contentCheckOk: true, racyCheckOk: true }
        };
        const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
            method: "POST", body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        results.tests.web = {
            status: res.status,
            trackCount: tracks ? tracks.length : 0,
            playabilityStatus: data?.playabilityStatus?.status
        };
    } catch (e: any) {
        results.tests.web = { error: e.message };
    }

    // Test 4: Check env
    results.env = {
        hasApiKey: !!process.env.OPENROUTER_API_KEY,
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV || "not-set"
    };

    return NextResponse.json(results);
}
