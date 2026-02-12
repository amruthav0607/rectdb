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

        // Phase 1: InnerTube API (Fastest & Most Resilient)
        // We try this first sequentially because it's usually the best bet and low overhead.
        console.log("[summarize] Phase 1: InnerTube API...");
        fullText = await fetchFromInnerTube(videoId);

        if (fullText) {
            console.log("[summarize] Phase 1 Success.");
        } else {
            console.log("[summarize] Phase 1 Failed. Starting Phase 2 (Parallel Race)...");

            // Phase 2: Parallel Race (The "Thunder Run")
            // Race multiple strategies against each other. First one to succeed wins.
            // This is crucial for Vercel's 10s limit.

            try {
                fullText = await Promise.any([
                    fetchFromProxy(videoId),           // Strategy A: Proxy Rotation
                    fetchFromPythonAPI(videoId),       // Strategy B: Python API (Self-hosted)
                    fetchFromYoutubeTranscriptLib(videoId), // Strategy C: npm lib
                    fetchFromScraper(videoId)          // Strategy D: Direct Scraper
                ]);
                console.log("[summarize] Phase 2 Race Won!");
            } catch (aggregateError: any) {
                console.error("[summarize] Phase 2 Race Failed (All methods failed).", aggregateError);
            }
        }

        if (!fullText) {
            console.error("[summarize] All methods failed.");
            return {
                error: "[TRANSCRIPT_BLOCKED] Could not fetch the transcript. YouTube may be blocking our requests from this server IP. Please try a different video or try again later."
            };
        }

        // Phase 3: AI Summarization
        console.log("[summarize] Phase 3: AI Summarization...");
        try {
            const summary = await getAISummary(fullText);
            return { success: summary };
        } catch (aiError: any) {
            console.error("[summarize] Phase 3 Failure:", aiError.message);
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

// --- Strategy A: InnerTube API ---
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
                console.log(`[InnerTube] ${client.name} success`);
                return await fetchFromTrack(tracks);
            }
        } catch (e: any) {
            console.error(`[InnerTube] ${client.name} error`);
        }
    }
    return "";
}

// --- Strategy B: Proxy Rotation ---
async function fetchFromProxy(videoId: string): Promise<string> {
    console.log("[Proxy] Starting rotation...");
    const proxies = [
        "https://pipedapi.kavin.rocks", "https://api.piped.privacy.com.de", "https://pipedapi.drgns.space",
        "https://pipedapi.in.projectsegfau.lt", "https://pipedapi.smnz.de", "https://pipedapi.adminforge.de",
        "https://pipedapi.astartes.nl", "https://api.piped.yt", "https://pipedapi.ducks.party",
        "https://inv.nadeko.net", "https://invidious.fdn.fr", "https://vid.puffyan.us",
        "https://invidious.kavin.rocks", "https://invidious.drgns.space", "https://invidious.privacyredirect.com",
        "https://invidious.rhysd.net", "https://yt.artemislena.eu", "https://invidious.flokinet.to", "https://yewtu.be"
    ];

    const shuffled = proxies.sort(() => 0.5 - Math.random());
    const MAX_TIME = 7000; // 7s limit for proxy phase
    const startTime = Date.now();

    for (const host of shuffled) {
        if (Date.now() - startTime > MAX_TIME) break;
        try {
            const isPiped = host.includes("piped");
            const url = isPiped ? `${host}/streams/${videoId}` : `${host}/api/v1/captions/${videoId}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s per proxy

            const res = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": "Mozilla/5.0" }
            });
            clearTimeout(timeoutId);

            if (!res.ok) continue;
            const data = await res.json();

            if (isPiped && data.subtitles?.length) {
                const enSub = data.subtitles.find((s: any) => s.code?.startsWith("en"));
                if (enSub) {
                    const subRes = await fetch(enSub.url);
                    if (subRes.ok) return await subRes.text();
                }
            } else if (!isPiped && data.captions?.length) {
                const cap = data.captions[0];
                const subRes = await fetch(`${host}${cap.url}`);
                if (subRes.ok) return await subRes.text();
            }
        } catch (e) { /* ignore */ }
    }
    throw new Error("All proxies failed");
}

// --- Strategy C: Python API ---
async function fetchFromPythonAPI(videoId: string): Promise<string> {
    console.log("[Python] Attempting...");
    const headerList = await headers();
    const host = headerList.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";

    try {
        const apiUrl = `${protocol}://${host}/api/simple?videoId=${videoId}`;
        const res = await fetch(apiUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const result = await res.json();
        if (result.success && result.text && result.text.length > 50) {
            console.log("[Python] Success");
            return result.text;
        }
    } catch (e: any) {
        console.error("[Python] Error:", e.message);
    }
    throw new Error("Python API failed");
}

// --- Strategy D: Node Library (youtube-transcript) ---
async function fetchFromYoutubeTranscriptLib(videoId: string): Promise<string> {
    console.log("[NodeLib] Attempting...");
    try {
        const items = await YoutubeTranscript.fetchTranscript(videoId);
        if (items && items.length > 0) {
            console.log("[NodeLib] Success");
            return items.map((item: any) => decode(item.text)).join(" ");
        }
    } catch (e: any) {
        console.error("[NodeLib] Error:", e.message);
    }
    throw new Error("Node Lib failed");
}

// --- Strategy E: Direct Scraper (youtube-captions-scraper) ---
async function fetchFromScraper(videoId: string): Promise<string> {
    console.log("[Scraper] Attempting...");
    try {
        const captions = await getSubtitlesScraper({ videoID: videoId, lang: 'en' });
        if (captions && captions.length > 0) {
            console.log("[Scraper] Success");
            return captions.map((c: any) => decode(c.text)).join(" ");
        }
    } catch (e: any) {
        console.error("[Scraper] Error:", e.message);
    }
    throw new Error("Scraper failed");
}

// --- Helper: Fetch formatted track ---
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

async function getAISummary(text: string) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return "Error: OpenRouter API key not found.";

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
