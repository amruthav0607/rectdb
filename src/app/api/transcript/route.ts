
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { decode } from "html-entities";
import path from "path";
import fs from "fs";
import os from "os";

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get("videoId");

    if (!videoId) {
        return NextResponse.json(
            { success: false, error: "No videoId provided" },
            { status: 400 }
        );
    }

    // Sanitize videoId to prevent command injection
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return NextResponse.json(
            { success: false, error: "Invalid video ID format" },
            { status: 400 }
        );
    }

    // Method 1: yt-dlp (most reliable - bypasses YouTube bot detection)
    try {
        console.log("[api/transcript] Method 1: yt-dlp for", videoId);
        const fullText = fetchWithYtDlp(videoId);
        if (fullText && fullText.length > 50) {
            console.log("[api/transcript] Method 1 success, length:", fullText.length);
            return NextResponse.json({ success: true, text: fullText });
        }
    } catch (e: any) {
        console.error("[api/transcript] Method 1 (yt-dlp) failed:", e.message);
    }

    // Method 2: Direct YouTube page scrape for captions
    try {
        console.log("[api/transcript] Method 2: Direct page scrape");
        const fullText = await fetchTranscriptDirect(videoId);
        if (fullText && fullText.length > 50) {
            console.log("[api/transcript] Method 2 success, length:", fullText.length);
            return NextResponse.json({ success: true, text: fullText });
        }
    } catch (e: any) {
        console.error("[api/transcript] Method 2 failed:", e.message);
    }

    return NextResponse.json(
        {
            success: false,
            error: "Could not fetch transcript. Make sure the video has captions/subtitles enabled.",
        },
        { status: 200 }
    );
}

function fetchWithYtDlp(videoId: string): string {
    const tmpDir = os.tmpdir();
    const outputPath = path.join(tmpDir, `yt_sub_${videoId}`);
    const subFile = `${outputPath}.en.srv1`;

    // Clean up any previous file
    try { fs.unlinkSync(subFile); } catch { }

    // Run yt-dlp to download subtitles
    const cmd = `yt-dlp --write-auto-sub --write-sub --sub-lang en --skip-download --sub-format srv1 -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`;

    try {
        execSync(cmd, { timeout: 30000, stdio: 'pipe' });
    } catch (e: any) {
        // yt-dlp may exit with code 1 but still download the subs
        console.log("[yt-dlp] Command finished with possible non-zero exit");
    }

    // Check for the subtitle file
    if (fs.existsSync(subFile)) {
        const xmlContent = fs.readFileSync(subFile, 'utf-8');

        // Parse XML to extract text
        const textParts: string[] = [];
        const re = /<text[^>]*>(.*?)<\/text>/gs;
        let m;
        while ((m = re.exec(xmlContent)) !== null) {
            let text = m[1];
            // Decode HTML entities
            text = decode(text);
            // Remove [Music], [Applause] etc.
            text = text.replace(/\[.*?\]/g, '').trim();
            if (text) textParts.push(text);
        }

        // Clean up
        try { fs.unlinkSync(subFile); } catch { }

        return textParts.join(" ");
    }

    // Also check without language suffix (some videos use different naming)
    const possibleFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith(`yt_sub_${videoId}`) && f.endsWith('.srv1'));
    if (possibleFiles.length > 0) {
        const foundFile = path.join(tmpDir, possibleFiles[0]);
        const xmlContent = fs.readFileSync(foundFile, 'utf-8');

        const textParts: string[] = [];
        const re = /<text[^>]*>(.*?)<\/text>/gs;
        let m;
        while ((m = re.exec(xmlContent)) !== null) {
            let text = m[1];
            text = decode(text);
            text = text.replace(/\[.*?\]/g, '').trim();
            if (text) textParts.push(text);
        }

        // Clean up
        try { fs.unlinkSync(foundFile); } catch { }

        return textParts.join(" ");
    }

    return "";
}

async function fetchTranscriptDirect(videoId: string): Promise<string | null> {
    const videoPageResponse = await fetch(
        `https://www.youtube.com/watch?v=${videoId}`,
        {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
        }
    );

    const html = await videoPageResponse.text();

    const captionsMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);
    if (!captionsMatch) return null;

    let captionTracks;
    try {
        captionTracks = JSON.parse(captionsMatch[1]);
    } catch {
        return null;
    }

    if (!captionTracks || captionTracks.length === 0) return null;

    let captionUrl = null;
    for (const track of captionTracks) {
        if (track.languageCode === "en" || track.languageCode === "en-US") {
            captionUrl = track.baseUrl;
            break;
        }
    }
    if (!captionUrl && captionTracks.length > 0) {
        captionUrl = captionTracks[0].baseUrl;
    }
    if (!captionUrl) return null;

    const captionsResponse = await fetch(captionUrl, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
    });

    const captionsXml = await captionsResponse.text();

    const textParts: string[] = [];
    const textRegex = /<text[^>]*>(.*?)<\/text>/g;
    let match;
    while ((match = textRegex.exec(captionsXml)) !== null) {
        textParts.push(decode(match[1]));
    }

    return textParts.length > 0 ? textParts.join(" ") : null;
}
