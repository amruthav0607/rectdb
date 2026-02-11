import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get("videoId") || "UF8uR6Z6KLc";

    try {
        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
            cache: 'no-store'
        });

        const status = res.status;
        const headers = Object.fromEntries(res.headers.entries());
        const body = await res.text();
        const bodySnippet = body.substring(0, 1000);

        return NextResponse.json({
            success: true,
            status,
            headers,
            bodySnippet,
            hasCaptions: body.includes('captionTracks')
        });
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            error: e.message
        });
    }
}
