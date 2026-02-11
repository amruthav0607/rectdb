import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) return NextResponse.json({ error: "videoId required" });

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            },
            cache: 'no-store'
        });
        const html = await res.text();

        return new Response(html, {
            headers: { "Content-Type": "text/html" }
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
