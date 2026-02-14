import { summarizeYouTubeVideo } from "@/app/actions/ai";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) {
        return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
    }

    console.log(`[DebugAPI] Testing video: ${videoId}`);
    const result = await summarizeYouTubeVideo(`https://www.youtube.com/watch?v=${videoId}`);

    return NextResponse.json({
        success: result.success ? true : false,
        data: result
    });
}
