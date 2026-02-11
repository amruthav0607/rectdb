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
                console.log("[summarize] Phase 1 Success.");
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
                    console.log("[summarize] Phase 2 Success.");
                } else {
                    console.error("[summarize] Phase 2 result:", result.error);
                }
            } catch (fetchError: any) {
                console.error("[summarize] Phase 2 Exception:", fetchError.message);
            }
        }

        // Phase 2.5: youtube-transcript lib
        if (!fullText) {
            console.log("[summarize] Phase 2.5: youtube-transcript...");
            try {
                const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
                if (transcriptItems && transcriptItems.length > 0) {
                    fullText = transcriptItems.map((item: any) => decode(item.text)).join(" ");
                    console.log("[summarize] Phase 2.5 Success.");
                }
            } catch (libError: any) {
                console.error("[summarize] Phase 2.5 Failure:", libError.message);
            }
        }

        // Phase 2.6: youtube-captions-scraper
        if (!fullText) {
            console.log("[summarize] Phase 2.6: youtube-captions-scraper...");
            try {
                const captions = await getSubtitles({ videoID: videoId, lang: 'en' });
                if (captions && captions.length > 0) {
                    fullText = captions.map((c: any) => decode(c.text)).join(" ");
                    console.log("[summarize] Phase 2.6 Success.");
                }
            } catch (scraperErr: any) {
                console.error("[summarize] Phase 2.6 Failure:", scraperErr.message);
            }
        }

        // Phase 2.7: InnerTube API (Resilient)
        if (!fullText) {
            console.log("[summarize] Phase 2.7: InnerTube API...");
            try {
                fullText = await fetchFromInnerTube(videoId);
                if (fullText) {
                    console.log("[summarize] Phase 2.7 Success.");
                }
            } catch (innerErr: any) {
                console.error("[summarize] Phase 2.7 Failure:", innerErr.message);
            }
        }

        // Phase 3: Ultimate Direct Scrape (Mobile-Friendly)
        if (!fullText) {
            console.log("[summarize] Phase 3: Ultimate Scraper...");
            try {
                fullText = await fetchCaptionsDirect(videoId);
                if (fullText) {
                    console.log("[summarize] Phase 3 Success.");
                }
            } catch (directError: any) {
                console.error("[summarize] Phase 3 Failure:", directError.message);
            }
        }

        if (!fullText) {
            console.error("[summarize] All methods failed.");
            return {
                error: "[TRANSCRIPT_BLOCKED] YouTube is temporarily restricting our server's IP address. This is common for very new or viral videos. Please try a different video or use your local development server which is currently working."
            };
        }

        // Phase 4: AI Summarization
        console.log("[summarize] Phase 4: AI Summarization...");
        try {
            const summary = await getAISummary(fullText);
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

/**
 * Enhanced fetchCaptionsDirect for cloud environments
 */
async function fetchCaptionsDirect(videoId: string): Promise<string> {
    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        const headersSet = [
            {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
            {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
                "Accept-Language": "en-US,en;q=0.9",
            }
        ];

        for (const headers of headersSet) {
            try {
                const res = await fetch(url, { headers, cache: 'no-store' });
                if (!res.ok) continue;
                const html = await res.text();

                const patterns = [
                    /ytInitialPlayerResponse\s*=\s*({.+?});/s,
                    /ytInitialPlayerResponse\s*:\s*({.+?})\s*,\s*responseContext/s,
                    /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/s,
                    /ytInitialPlayerResponse\s*=\s*({.+?})\s*(?:;|\n|<\/script>)/s
                ];

                for (const pattern of patterns) {
                    const match = html.match(pattern);
                    if (match) {
                        try {
                            const parsed = JSON.parse(match[1]);
                            const tracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                            if (tracks && Array.isArray(tracks) && tracks.length > 0) {
                                return await fetchFromTrack(tracks);
                            }
                        } catch { }
                    }
                }

                if (html.includes("captionTracks")) {
                    const tracksMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);
                    if (tracksMatch) {
                        try {
                            const tracks = JSON.parse(tracksMatch[1]);
                            return await fetchFromTrack(tracks);
                        } catch { }
                    }
                }
            } catch (innerE) {
                console.error("[fetchCaptionsDirect] Attempt failed:", innerE.message);
            }
        }

        return "";
    } catch (e: any) {
        console.error("[fetchCaptionsDirect] Global failure:", e.message);
        return "";
    }
}

/**
 * Direct InnerTube Player API call
 * Using WEB client with better bypass params
 */
async function fetchFromInnerTube(videoId: string): Promise<string> {
    try {
        const payload = {
            videoId: videoId,
            context: {
                client: {
                    hl: "en",
                    gl: "US",
                    clientName: "WEB",
                    clientVersion: "2.20241113.01.00",
                    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    utcOffsetMinutes: 0
                }
            },
            playbackContext: {
                contentCheckOk: true,
                racyCheckOk: true
            }
        };

        const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
            method: "POST",
            body: JSON.stringify(payload),
            headers: {
                "Content-Type": "application/json",
                "X-Youtube-Client-Name": "1",
                "X-Youtube-Client-Version": "2.20241113.01.00"
            }
        });

        if (!res.ok) return "";
        const data = await res.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (tracks && tracks.length > 0) {
            return await fetchFromTrack(tracks);
        }
        return "";
    } catch (e: any) {
        console.error("[fetchFromInnerTube] Error:", e.message);
        return "";
    }
}

async function fetchFromTrack(tracks: any[]): Promise<string> {
    const track = tracks.find((t: any) => t.languageCode === 'en' || t.languageCode === 'en-US') || tracks[0];
    const captionUrl = track.baseUrl;
    if (!captionUrl) return "";

    const timedTextRes = await fetch(captionUrl + "&fmt=json3");
    const json = await timedTextRes.json();
    if (json.events) {
        const text = json.events
            .filter((event: any) => event.segs)
            .map((event: any) => event.segs.map((seg: any) => seg.utf8).join(""))
            .join(" ");
        return decode(text);
    }
    return "";
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
