"use server";

import { decode } from "html-entities";
import { headers } from "next/headers";
import { YoutubeTranscript } from "youtube-transcript";

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

        // Phase 2: Try Python API at /api/simple (works on Vercel)
        if (!fullText) {
            try {
                const apiUrl = `${protocol}://${host}/api/simple?videoId=${videoId}`;
                console.log("[summarize] Phase 2: Python API (simple):", apiUrl);
                const apiResponse = await fetch(apiUrl, { cache: "no-store" });
                const result = await apiResponse.json();
                if (result.success && result.text && result.text.length > 50) {
                    fullText = result.text;
                    console.log("[summarize] Phase 2 Success. Text length:", fullText.length);
                } else {
                    console.error("[summarize] Phase 2 error:", result.error);
                }
            } catch (fetchError: any) {
                console.error("[summarize] Phase 2 Exception:", fetchError.message);
            }
        }

        // Phase 2.5: Try youtube-transcript npm library
        if (!fullText) {
            console.log("[summarize] Phase 2.5: youtube-transcript library...");
            try {
                const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
                if (transcriptItems && transcriptItems.length > 0) {
                    fullText = transcriptItems.map((item: any) => decode(item.text)).join(" ");
                    console.log("[summarize] Phase 2.5 Success. Text length:", fullText.length);
                }
            } catch (libError: any) {
                console.error("[summarize] Phase 2.5 Failure:", libError.message);
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
    try {
        console.log("[fetchCaptionsDirect] Attempting direct scrape for:", videoId);

        // Try both Desktop and Mobile User Agents
        const userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
        ];

        for (const ua of userAgents) {
            try {
                const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
                    headers: {
                        "User-Agent": ua,
                        "Accept-Language": "en-US,en;q=0.9",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    },
                    cache: 'no-store'
                });

                if (!res.ok) continue;

                const html = await res.text();

                // Robust regex for captionTracks
                const captionsMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/) ||
                    html.match(/\\?"captionTracks\\?"\s*:\s*(\\?\[.*?\\?\])/);

                if (!captionsMatch) continue;

                let tracksStr = captionsMatch[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');

                let tracks = JSON.parse(tracksStr);
                if (!tracks || tracks.length === 0) continue;

                let captionUrl = tracks.find((t: any) => t.languageCode === "en" || t.languageCode === "en-US")?.baseUrl ||
                    tracks[0].baseUrl;

                if (!captionUrl) continue;

                if (!captionUrl.includes("fmt=")) {
                    captionUrl += "&fmt=vtt";
                }

                console.log("[fetchCaptionsDirect] Success with UA:", ua.slice(0, 30));
                const captionsRes = await fetch(captionUrl);
                const text = await captionsRes.text();

                // Basic VTT/XML/Plain extractor
                const parts = text.split('\n')
                    .filter(line => !line.match(/^\d+$/) && !line.includes('-->') && line.trim() !== '' && !line.startsWith('WEBVTT'))
                    .map(line => decode(line.replace(/<[^>]*>/g, '').trim()))
                    .filter(line => line.length > 0);

                return parts.join(" ");
            } catch (innerE) {
                console.error("[fetchCaptionsDirect] UA attempt failed:", innerE);
            }
        }

        return "";

    } catch (error: any) {
        console.error("[fetchCaptionsDirect] Global Error:", error.message);
        return "";
    }
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
