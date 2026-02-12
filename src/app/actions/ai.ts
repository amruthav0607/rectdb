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
        const isLocal = host.includes("localhost");

        // Phase 1: Try local yt-dlp-based route (works on localhost, needs more time)
        try {
            const apiUrl = `${protocol}://${host}/api/yt-transcript?videoId=${videoId}`;
            console.log("[summarize] Phase 1: yt-dlp route:", apiUrl);
            const apiResponse = await fetch(apiUrl, {
                cache: "no-store",
                signal: AbortSignal.timeout(isLocal ? 25000 : 3000)
            });
            const result = await apiResponse.json();
            if (result.success && result.text && result.text.length > 50) {
                fullText = result.text;
                console.log("[summarize] Phase 1 Success.");
            }
        } catch (fetchError: any) {
            console.error("[summarize] Phase 1 Exception:", fetchError.message);
        }

        // Phase 2: InnerTube API (FAST & RESILIENT)
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
        // Phase 2.5: Proxy Rotation (Invidious/Piped) - The "Nuclear Option"
        if (!fullText) {
            console.log("[summarize] Phase 2.5: Proxy Rotation...");
            fullText = await fetchFromProxy(videoId);
            if (fullText) {
                console.log("[summarize] Phase 2.5 Success.");
            }
        }

        // Phase 3: Try Python API at /api/simple (works on Vercel)
        if (!fullText) {
            try {
                const apiUrl = `${protocol}://${host}/api/simple?videoId=${videoId}`;
                console.log("[summarize] Phase 3: Python API (simple):", apiUrl);
                const apiResponse = await fetch(apiUrl, {
                    cache: "no-store",
                    signal: AbortSignal.timeout(isLocal ? 10000 : 4000)
                });
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

        // Phase 4: youtube-transcript lib
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

        // Phase 5: Ultimate Direct Scrape
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

        // Phase 6: youtube-captions-scraper
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
                error: "[TRANSCRIPT_BLOCKED] Could not fetch the transcript for this video. The video may not have captions enabled, or YouTube is blocking our request. Please try a different video."
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
                const res = await fetch(url, { headers, cache: 'no-store' });
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
            } catch (innerE: any) {
                console.error("[fetchCaptionsDirect] Attempt failed:", innerE.message);
            }
        }
        return "";
    } catch (e: any) {
        return "";
    }
}

async function fetchFromInnerTube(videoId: string): Promise<string> {
    // Try multiple InnerTube clients - ANDROID works from cloud IPs, WEB does not
    const clients = [
        { name: "ANDROID", version: "19.09.37", key: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w" },
        { name: "IOS", version: "19.09.3", key: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc" },
        { name: "WEB", version: "2.20241113.01.00", key: "" }
    ];

    for (const client of clients) {
        try {
            const payload = {
                videoId: videoId,
                context: {
                    client: {
                        hl: "en", gl: "US",
                        clientName: client.name,
                        clientVersion: client.version
                    }
                },
                playbackContext: { contentCheckOk: true, racyCheckOk: true }
            };

            const apiUrl = "https://www.youtube.com/youtubei/v1/player" + (client.key ? `?key=${client.key}` : "");
            const res = await fetch(apiUrl, {
                method: "POST",
                body: JSON.stringify(payload),
                headers: { "Content-Type": "application/json" }
            });

            if (!res.ok) continue;
            const data = await res.json();
            const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (tracks && tracks.length > 0) {
                console.log(`[InnerTube] ${client.name} returned ${tracks.length} tracks`);
                return await fetchFromTrack(tracks);
            }
            console.log(`[InnerTube] ${client.name}: 0 tracks`);
        } catch (e: any) {
            console.error(`[InnerTube] ${client.name} failed:`, e.message);
        }
    }
    return "";
}

async function fetchFromTrack(tracks: any[]): Promise<string> {
    const track = tracks.find((t: any) => t.languageCode === 'en' || t.languageCode === 'en-US') || tracks[0];
    const captionUrl = track.baseUrl;
    if (!captionUrl) return "";

    // Try JSON format first
    try {
        const jsonRes = await fetch(captionUrl + "&fmt=json3");
        const json = await jsonRes.json();
        if (json.events) {
            const text = json.events
                .filter((event: any) => event.segs)
                .map((event: any) => event.segs.map((seg: any) => seg.utf8).join(""))
                .join(" ");
            const decoded = decode(text);
            if (decoded.length > 50) return decoded;
        }
    } catch { /* JSON parsing failed, try XML */ }

    // Fallback to XML format (ANDROID client returns XML)
    try {
        const xmlRes = await fetch(captionUrl);
        const xml = await xmlRes.text();
        const textParts: string[] = [];
        const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
        let m;
        while ((m = re.exec(xml)) !== null) {
            const t = decode(m[1]).trim();
            if (t) textParts.push(t);
        }
        if (textParts.length > 0) return textParts.join(" ");
    } catch { /* XML parsing also failed */ }

    return "";
}

async function fetchFromProxy(videoId: string): Promise<string> {
    const proxies = [
        // Piped Instances (often more reliable for API)
        "https://pipedapi.kavin.rocks",
        "https://api.piped.privacy.com.de",
        "https://pipedapi.drgns.space",
        "https://pipedapi.in.projectsegfau.lt",
        "https://pipedapi.smnz.de",
        "https://pipedapi.adminforge.de",
        "https://pipedapi.astartes.nl",
        "https://api.piped.yt",
        "https://pipedapi.ducks.party",
        "https://pipedapi.lunar.icu",
        // Invidious Instances
        "https://inv.nadeko.net",
        "https://invidious.fdn.fr",
        "https://vid.puffyan.us",
        "https://invidious.kavin.rocks",
        "https://invidious.drgns.space",
        "https://invidious.privacyredirect.com",
        "https://invidious.rhysd.net",
        "https://yt.artemislena.eu",
        "https://invidious.flokinet.to",
        "https://invidious.lunar.icu",
        "https://yewtu.be"
    ];

    // Shuffle proxies to load balance and avoid hitting same dead ones first
    const shuffled = proxies.sort(() => 0.5 - Math.random());
    const MAX_total_TIME_MS = 8000; // Stop after 8 seconds total
    const startTime = Date.now();

    for (const host of shuffled) {
        if (Date.now() - startTime > MAX_total_TIME_MS) break;

        try {
            const isPiped = host.includes("piped");
            const url = isPiped ? `${host}/streams/${videoId}` : `${host}/api/v1/captions/${videoId}`;

            const controller = new AbortController();
            // Short timeout: 1.5s per proxy
            const timeoutId = setTimeout(() => controller.abort(), 1500);

            const res = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": "Mozilla/5.0" }
            });
            clearTimeout(timeoutId);

            if (!res.ok) continue;
            const data = await res.json();

            if (isPiped) {
                if (data.subtitles && data.subtitles.length > 0) {
                    const enSub = data.subtitles.find((s: any) => s.code && s.code.startsWith("en"));
                    if (enSub) {
                        const subRes = await fetch(enSub.url);
                        if (subRes.ok) {
                            return await subRes.text();
                        }
                    }
                }
            } else {
                // Invidious
                if (data.captions && data.captions.length > 0) {
                    const cap = data.captions[0];
                    const capUrl = `${host}${cap.url}`;
                    const subRes = await fetch(capUrl);
                    if (subRes.ok) {
                        return await subRes.text();
                    }
                }
            }
        } catch (e) {
            // Ignore errors and try next proxy
        }
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
                { role: "system", content: "You are an expert educational assistant. Your task is to summarize the following YouTube video transcript and generate clean, structured study notes. Use markdown for formatting, including headers, bullet points, and bold text." },
                { role: "user", content: `Please summarize this transcript and create study notes:\n\n${truncatedText}` }
            ],
        }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "AI failed.");
    return data.choices?.[0]?.message?.content || "No summary.";
}
