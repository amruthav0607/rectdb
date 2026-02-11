"use server";

import { decode } from "html-entities";
import { headers } from "next/headers";

export async function summarizeYouTubeVideo(videoUrl: string) {
    if (!videoUrl) return { error: "Please provide a YouTube URL." };

    try {
        const startTime = Date.now();
        console.log("[summarize] Starting for URL:", videoUrl);
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            console.error("[summarize] Invalid Video ID:", videoUrl);
            return { error: "[INVALID_URL] Please use a valid YouTube video link." };
        }

        let fullText = "";
        const headerList = await headers();
        const host = headerList.get("host") || "neon-admin-dashboard-two.vercel.app";
        const protocol = host.includes("localhost") ? "http" : "https";

        // Phase 1: Try Direct YouTube captions scrape (Fastest & most robust on Vercel)
        if (!fullText) {
            console.log("[summarize] Phase 1: Direct captions scrape...");
            try {
                const s1 = Date.now();
                fullText = await fetchCaptionsDirect(videoId);
                const d1 = Date.now() - s1;
                if (fullText && fullText.length > 50) {
                    console.log(`[summarize] Phase 1 Success (${d1}ms). Text length:`, fullText.length);
                } else {
                    console.error(`[summarize] Phase 1 failed or empty (${d1}ms)`);
                }
            } catch (directError: any) {
                console.error("[summarize] Phase 1 Exception:", directError.message);
            }
        }

        // Phase 2: Try Python API at /api/simple (Backup fetching)
        if (!fullText) {
            try {
                const s2 = Date.now();
                const apiUrl = `${protocol}://${host}/api/simple?videoId=${videoId}`;
                console.log("[summarize] Phase 2: Calling Python API:", apiUrl);
                const apiResponse = await fetch(apiUrl, { cache: "no-store" });
                const result = await apiResponse.json();
                const d2 = Date.now() - s2;
                if (result.success && result.text && result.text.length > 50) {
                    fullText = result.text;
                    console.log(`[summarize] Phase 2 Success (${d2}ms). Text length:`, fullText.length);
                } else {
                    console.log(`[summarize] Phase 2 failed (${d2}ms):`, result.error || "No text");
                }
            } catch (fetchError: any) {
                console.error("[summarize] Phase 2 Exception:", fetchError.message);
            }
        }

        // Phase 3: Try local yt-dlp-based route (ONLY on localhost/dev)
        if (!fullText && host.includes("localhost")) {
            try {
                const s3 = Date.now();
                const apiUrl = `${protocol}://${host}/api/yt-transcript?videoId=${videoId}`;
                const apiResponse = await fetch(apiUrl, { cache: "no-store" });
                const result = await apiResponse.json();
                const d3 = Date.now() - s3;
                if (result.success && result.text && result.text.length > 50) {
                    fullText = result.text;
                    console.log(`[summarize] Phase 3 Success (${d3}ms).`);
                }
            } catch (fetchError: any) {
                console.error("[summarize] Phase 3 Exception:", fetchError.message);
            }
        }

        if (!fullText) {
            console.error("[summarize] All methods failed.");
            return {
                error: "[TRANSCRIPT_BLOCKED] Could not fetch subtitles. YouTube may be limiting access to this video from our server. Please try again in a moment or try another video."
            };
        }

        const transcriptTime = Date.now() - startTime;
        console.log(`[summarize] Transcript fetched in ${transcriptTime}ms. Moving to AI summary.`);

        // Phase 4: AI Summarization
        try {
            const aiStart = Date.now();
            const summary = await getAISummary(fullText);
            const aiTime = Date.now() - aiStart;
            const totalTime = Date.now() - startTime;
            console.log(`[summarize] AI Success in ${aiTime}ms. Total: ${totalTime}ms.`);
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
