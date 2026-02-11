"use server";

import { decode } from "html-entities";
import { headers } from "next/headers";

export async function summarizeYouTubeVideo(videoUrl: string) {
    if (!videoUrl) return { error: "Please provide a YouTube URL." };

    try {
        console.log("[summarize] Starting for URL:", videoUrl);
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            console.error("[summarize] Invalid Video ID:", videoUrl);
            return { error: "[INVALID_URL] Please use a valid YouTube video link." };
        }

        let fullText = "";
        const headerList = await headers();
        const host = headerList.get("host") || "localhost:3000";
        const protocol = host.includes("localhost") ? "http" : "https";

        // Phase 1: Try local yt-dlp-based route (works on localhost)
        try {
            const apiUrl = `${protocol}://${host}/api/yt-transcript?videoId=${videoId}`;
            console.log("[summarize] Phase 1: yt-dlp route:", apiUrl);
            const apiResponse = await fetch(apiUrl, { cache: "no-store" });
            const result = await apiResponse.json();
            if (result.success && result.text && result.text.length > 50) {
                fullText = result.text;
                console.log("[summarize] Phase 1 Success. Text length:", fullText.length);
            } else {
                console.error("[summarize] Phase 1 returned no text:", result.error);
            }
        } catch (fetchError: any) {
            console.error("[summarize] Phase 1 Exception:", fetchError.message);
        }

        // Phase 2: Try Python API at /api/yt_api (works on Vercel)
        if (!fullText) {
            try {
                // We try both /api/yt_api (new name) and /api/transcript (fallback)
                const apiUrl = `${protocol}://${host}/api/yt_api?videoId=${videoId}`;
                console.log("[summarize] Phase 2: Python API (yt_api):", apiUrl);
                const apiResponse = await fetch(apiUrl, { cache: "no-store" });
                const result = await apiResponse.json();
                if (result.success && result.text && result.text.length > 50) {
                    fullText = result.text;
                    console.log("[summarize] Phase 2 (yt_api) Success. Text length:", fullText.length);
                } else {
                    console.error("[summarize] Phase 2 (yt_api) error:", result.error);
                }
            } catch (fetchError: any) {
                console.error("[summarize] Phase 2 Exception:", fetchError.message);
            }
        }

        // Phase 3: Direct YouTube captions scrape (final fallback)
        if (!fullText) {
            console.log("[summarize] Phase 3: Direct captions scrape...");
            try {
                fullText = await fetchCaptionsDirect(videoId);
                if (fullText) {
                    console.log("[summarize] Phase 3 Success. Text length:", fullText.length);
                }
            } catch (directError: any) {
                console.error("[summarize] Phase 3 Failure:", directError.message);
            }
        }

        if (!fullText) {
            console.error("[summarize] All methods failed.");
            return {
                error: "[TRANSCRIPT_BLOCKED] Could not fetch this video's subtitles. Please make sure the video has Captions/CC enabled, or try a different video."
            };
        }

        // Phase 4: AI Summarization
        console.log("[summarize] Phase 4: AI Summarization...");
        try {
            const summary = await getAISummary(fullText);
            console.log("[summarize] Success!");
            return { success: summary };
        } catch (aiError: any) {
            console.error("[summarize] Phase 4 Failure:", aiError.message);
            return { error: `[AI_FAIL] ${aiError.message}` };
        }

    } catch (error: any) {
        console.error("[summarize] Unexpected Error:", error);
        return { error: `[GLOBAL_ERR] ${error.message || "Unknown error"}` };
    }
}

function extractVideoId(url: string) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

async function fetchCaptionsDirect(videoId: string): Promise<string> {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });
    const html = await res.text();

    const captionsMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);
    if (!captionsMatch) return "";

    let tracks;
    try {
        tracks = JSON.parse(captionsMatch[1]);
    } catch {
        return "";
    }
    if (!tracks || tracks.length === 0) return "";

    let captionUrl = null;
    for (const t of tracks) {
        if (t.languageCode === "en" || t.languageCode === "en-US") {
            captionUrl = t.baseUrl;
            break;
        }
    }
    if (!captionUrl) captionUrl = tracks[0].baseUrl;
    if (!captionUrl) return "";

    const captionsRes = await fetch(captionUrl);
    const xml = await captionsRes.text();

    const parts: string[] = [];
    const re = /<text[^>]*>(.*?)<\/text>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        parts.push(decode(m[1]));
    }

    return parts.join(" ");
}

async function getAISummary(text: string) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OpenRouter API key not found in environment.");

    const truncatedText = text.slice(0, 15000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://neon-admin-dashboard-two.vercel.app",
            "X-Title": "Neon Admin Dashboard",
        },
        body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [
                {
                    role: "system",
                    content: "You are an expert educational assistant. Your task is to summarize the following YouTube video transcript and generate clean, structured study notes. Use markdown for formatting, including headers, bullet points, and bold text."
                },
                {
                    role: "user",
                    content: `Please summarize this transcript and create study notes:\n\n${truncatedText}`
                }
            ],
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || "OpenRouter API request failed.");
    }

    return data.choices?.[0]?.message?.content || "No summary generated.";
}
