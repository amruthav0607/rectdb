import { NextResponse } from "next/server";
import { decode } from "html-entities";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) return NextResponse.json({ error: "videoId required" });

    try {
        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            },
            cache: 'no-store'
        });

        const html = await res.text();
        const captionsMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/) ||
            html.match(/\\?"captionTracks\\?"\s*:\s*(\\?\[.*?\\?\])/);

        if (!captionsMatch) {
            let reason = "No tracks found";
            if (html.includes("recaptcha")) reason = "Blocked by Captcha";
            if (html.includes("consent.youtube.com")) reason = "Blocked by Consent Page";
            return NextResponse.json({ success: false, reason, html_snip: html.slice(0, 500) });
        }

        let tracksStr = captionsMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        let tracks = JSON.parse(tracksStr);
        let captionUrl = tracks[0].baseUrl;

        const captionsRes = await fetch(captionUrl);
        const text = await captionsRes.text();

        return NextResponse.json({
            success: true,
            text_preview: text.slice(0, 100),
            track_count: tracks.length
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
