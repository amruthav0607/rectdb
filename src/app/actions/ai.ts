"use server";

import { decode } from "html-entities";
import { headers } from "next/headers";
import { YoutubeTranscript } from "youtube-transcript";
const getSubtitlesScraper = require('youtube-captions-scraper').getSubtitles;

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
            const apiResponse = await fetch(apiUrl, { cache: "no-store", signal: AbortSignal.timeout(3000) });
            const result = await apiResponse.json();
            if (result.success && result.text && result.text.length > 50) {
                fullText = result.text;
                console.log("[summarize] Phase 1 Success.");
            }
        } catch (fetchError: any) {
            console.error("[summarize] Phase 1 Attempt skipped/failed:", fetchError.message);
        }

        // Phase 2: InnerTube API (FAST & RESILIENT) - Moved up for Vercel 10s limit
        if (!fullText) {
            console.log("[summarize] Phase 2: InnerTube API...");
            try {
                fullText = await fetchFromInnerTube(videoId);
                if (fullText) {
                    console.log("[summarize] Phase 2 Success.");
                }
            } catch (innerErr: any) {
                console.error("[summarize] Phase 2 Failure:", innerErr.message);
            }
        }

        // Phase 3: Try Python API at /api/simple (works on Vercel)
        if (!fullText) {
            try {
                const apiUrl = `${protocol}://${host}/api/simple?videoId=${videoId}`;
                console.log("[summarize] Phase 3: Python API (simple):", apiUrl);
                const apiResponse = await fetch(apiUrl, { cache: "no-store", signal: AbortSignal.timeout(4000) });
                const result = await apiResponse.json();
                if (result.success && result.text && result.text.length > 50) {
                    fullText = result.text;
                    console.log("[summarize] Phase 3 Success.");
                } else {
                    console.error("[summarize] Phase 3 result:", result.error);
                }
            } catch (fetchError: any) {
                console.error("[summarize] Phase 3 Exception:", fetchError.message);
            }
        }

        // Phase 4: youtube-transcript lib (FAST)
        if (!fullText) {
            console.log("[summarize] Phase 4: youtube-transcript...");
            try {
                const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
                if (transcriptItems && transcriptItems.length > 0) {
                    fullText = transcriptItems.map((item: any) => decode(item.text)).join(" ");
                    console.log("[summarize] Phase 4 Success.");
                }
            } catch (libError: any) {
                console.error("[summarize] Phase 4 Failure:", libError.message);
            }
        }

        // Phase 5: Ultimate Direct Scrape (Mobile-Friendly)
        if (!fullText) {
            console.log("[summarize] Phase 5: Ultimate Scraper...");
            try {
                fullText = await fetchCaptionsDirect(videoId);
                if (fullText) {
                    console.log("[summarize] Phase 5 Success.");
                }
            } catch (directError: any) {
                console.error("[summarize] Phase 5 Failure:", directError.message);
            }
        }

        // Phase 6: youtube-captions-scraper (Final fallback)
        if (!fullText) {
            console.log("[summarize] Phase 6: youtube-captions-scraper...");
            try {
                const captions = await getSubtitlesScraper({ videoID: videoId, lang: 'en' });
                if (captions && captions.length > 0) {
                    fullText = captions.map((c: any) => decode(c.text)).join(" ");
                    console.log("[summarize] Phase 6 Success.");
                }
            } catch (scraperErr: any) {
                console.error("[summarize] Phase 6 Failure:", scraperErr.message);
            }
        }

        if (!fullText) {
            console.error("[summarize] All methods failed.");
            return {
                error: "[TRANSCRIPT_BLOCKED] YouTube is temporarily restricting our server's IP address for this video. Use the local development server (localhost:3000) to summarize this video, or try another video link."
            };
        }

        // Phase 7: AI Summarization
        console.log("[summarize] Phase 7: AI Summarization...");
        try {
            const summary = await getAISummary(fullText);
            return { success: summary };
        } catch (aiError: any) {
            console.error("[summarize] Phase 7 Failure:", aiError.message);
            return { error: `[AI_FAIL] ${aiError.message}` };
        }

    } catch (error: any) {
        console.error("[summarize] Unexpected Global Error:", error);
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
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const headersSet = [
            { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
            { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" }
        ];

        for (const headers of headersSet) {
            try {
                const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(3000) });
                if (!res.ok) continue;
                const html = await res.text();

                const patterns = [
                    /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});/m,
                    /ytInitialPlayerResponse\s*:\s*(\{[\s\S]+?\})\s*,\s*responseContext/m,
                    /var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});/m,
                    /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*(?:;|\n|<\/script>)/m
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
            } catch (innerE) {
                console.error("[fetchCaptionsDirect] Attempt failed:", (innerE as any).message);
            }
        }
        return "";
    } catch (e: any) {
        return "";
    }
}

async function fetchFromInnerTube(videoId: string): Promise<string> {
    try {
        const payload = {
            videoId: videoId,
            context: {
                client: {
                    hl: "en", gl: "US", clientName: "WEB", clientVersion: "2.20241113.01.00",
                    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    utcOffsetMinutes: 0
                }
            },
            playbackContext: { contentCheckOk: true, racyCheckOk: true }
        };

        const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
            method: "POST",
            body: JSON.stringify(payload),
            headers: {
                "Content-Type": "application/json",
                "X-Youtube-Client-Name": "1",
                "X-Youtube-Client-Version": "2.20241113.01.00"
            },
            signal: AbortSignal.timeout(4000)
        });

        if (!res.ok) return "";
        const data = await res.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length > 0) return await fetchFromTrack(tracks);
        return "";
    } catch (e: any) {
        return "";
    }
}

async function fetchFromTrack(tracks: any[]): Promise<string> {
    const track = tracks.find((t: any) => t.languageCode === 'en' || t.languageCode === 'en-US') || tracks[0];
    const captionUrl = track.baseUrl;
    if (!captionUrl) return "";

    const timedTextRes = await fetch(captionUrl + "&fmt=json3", { signal: AbortSignal.timeout(3000) });
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
    if (!apiKey) return "Error: OpenRouter API key not found in Vercel environment.";

    const truncatedText = text.slice(0, 15000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://neon-admin-dashboard-two.vercel.app",
        },
        body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [
                { role: "system", content: "You are an expert summarizer. Create clear study notes in markdown." },
                { role: "user", content: `Please summarize:\n\n${truncatedText}` }
            ],
        }),
        signal: AbortSignal.timeout(8000)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "AI failed.");
    return data.choices?.[0]?.message?.content || "No summary.";
}
