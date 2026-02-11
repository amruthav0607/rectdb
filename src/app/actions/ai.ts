"use server";

import { decode } from "html-entities";
import { headers } from "next/headers";
import { YoutubeTranscript } from "youtube-transcript";
const { getSubtitles } = require('youtube-captions-scraper');

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

        // Phase 2.6: Try youtube-captions-scraper
        if (!fullText) {
            console.log("[summarize] Phase 2.6: youtube-captions-scraper...");
            try {
                const captions = await getSubtitles({ videoID: videoId, lang: 'en' });
                if (captions && captions.length > 0) {
                    fullText = captions.map((c: any) => decode(c.text)).join(" ");
                    console.log("[summarize] Phase 2.6 Success. Text length:", fullText.length);
                }
            } catch (scraperErr: any) {
                console.error("[summarize] Phase 2.6 Failure:", scraperErr.message);
            }
        }

        // Phase 3: Direct YouTube captions scrape (final fallback)
        if (!fullText) {
            console.log("[summarize] Phase 3: Ultimate Scraper...");
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
                error: "[TRANSCRIPT_BLOCKED] This video's subtitles are currently restricted by YouTube on cloud servers. This usually happens with very new or viral videos. Please try a different video or try again later."
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
        console.log("[fetchCaptionsDirect] Attempting ultimate search for:", videoId);

        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
            cache: 'no-store'
        });

        if (!res.ok) return "";
        const html = await res.text();

        // Find the initial player response JSON
        const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
        if (!playerResponseMatch) {
            console.warn("[fetchCaptionsDirect] Could not find ytInitialPlayerResponse");
            return "";
        }

        let playerResponse;
        try {
            playerResponse = JSON.parse(playerResponseMatch[1]);
        } catch (e) {
            console.error("[fetchCaptionsDirect] Failed to parse playerResponse JSON");
            return "";
        }

        const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!captions || !Array.isArray(captions) || captions.length === 0) {
            console.warn("[fetchCaptionsDirect] No caption tracks in playerResponse");
            return "";
        }

        // Pick English or default
        const track = captions.find((t: any) => t.languageCode === 'en' || t.languageCode === 'en-US') || captions[0];
        const captionUrl = track.baseUrl;
        if (!captionUrl) return "";

        console.log("[fetchCaptionsDirect] Fetching timed text from:", captionUrl.slice(0, 50));
        const timedTextRes = await fetch(captionUrl + "&fmt=json3");
        const timedText = await timedTextRes.json();

        // Extract text from json3 format (modern YouTube API)
        if (timedText.events) {
            const lines = timedText.events
                .filter((event: any) => event.segs)
                .map((event: any) => event.segs.map((seg: any) => seg.utf8).join(""))
                .join(" ");
            return decode(lines);
        }

        return "";

    } catch (error: any) {
        console.error("[fetchCaptionsDirect] Error:", error.message);
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
