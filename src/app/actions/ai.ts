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

        // Phase 1: The "Thunder Run"
        // fast: InnerTube (4s), Python (5s), Scraper (5s)
        // slow: Proxy (8s), Lib (8s)
        // Race ALL of them. First to succeed wins.
        // We wrap each in a timeout to ensure they don't hang the Vercel function.
        console.log("[summarize] Starting Parallel Thunder Run...");

        try {
            fullText = await Promise.any([
                withTimeout(fetchFromInnerTube(videoId), 4000).then(res => { console.log("Winner: InnerTube"); return res; }).catch(e => { console.error("InnerTube Failed:", e.message); throw new Error(`InnerTube(${e.message})`) }),
                withTimeout(fetchFromProxy(videoId), 5000).then(res => { console.log("Winner: Proxy"); return res; }).catch(e => { console.error("Proxy Failed:", e.message); throw new Error(`Proxy(${e.message})`) }),
                withTimeout(fetchFromPythonAPI(videoId), 5000).then(res => { console.log("Winner: Python"); return res; }).catch(e => { console.error("Python Failed:", e.message); throw new Error(`Python(${e.message})`) }),
                withTimeout(fetchFromYoutubeTranscriptLib(videoId), 5000).then(res => { console.log("Winner: Lib"); return res; }).catch(e => { console.error("Lib Failed:", e.message); throw new Error(`Lib(${e.message})`) }),
                withTimeout(fetchFromScraper(videoId), 5000).then(res => { console.log("Winner: Scraper"); return res; }).catch(e => { console.error("Scraper Failed:", e.message); throw new Error(`Scraper(${e.message})`) })
            ]);
            console.log("[summarize] Thunder Run Won!");
        } catch (aggregateError: any) {
            const errors = aggregateError.errors.map((e: any) => e.message).join(" | ");
            console.error("[summarize] Thunder Run Failed ALL:", errors);
            return {
                error: `[TRANSCRIPT_FAILED] All methods failed. Debug Trace: ${errors}`
            };
        }

        if (!fullText) {
            return {
                error: "[TRANSCRIPT_BLOCKED] Could not fetch transcript. YouTube blocked all requests."
            };
        }

        // Phase 2: AI Summarization
        console.log("[summarize] Phase 2: AI Summarization...");
        try {
            const summary = await getAISummary(fullText);
            return { success: summary };
        } catch (aiError: any) {
            console.error("[summarize] Phase 2 Failure:", aiError.message);
            return { error: `[AI_FAIL] ${aiError.message}` };
        }

    } catch (error: any) {
        console.error("[summarize] Unexpected Global Error:", error);
        return { error: `[GLOBAL_ERR] ${error.message || "Unknown error"}` };
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
    ]);
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
                headers: { "Content-Type": "application/json" },
                signal: AbortSignal.timeout(3000) // 3s max per InnerTube request
            });

            if (!res.ok) continue;
            const data = await res.json();
            const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (tracks && tracks.length > 0) {
                const text = await fetchFromTrack(tracks);
                if (text && text.length > 50) {
                    console.log(`[InnerTube] ${client.name} success`);
                    return text;
                }
                console.error(`[InnerTube] ${client.name} empty track`);
            }
        } catch (e: any) {
            console.error(`[InnerTube] ${client.name} error`);
        }
    }
    throw new Error("InnerTube failed");
}

// --- Strategy B: Proxy Rotation ---
async function fetchFromProxy(videoId: string): Promise<string> {
    console.log("[Proxy] Starting rotation...");
    const proxies = [
        "https://pipedapi.kavin.rocks", "https://api.piped.privacy.com.de", "https://pipedapi.drgns.space",
        "https://pipedapi.in.projectsegfau.lt", "https://pipedapi.smnz.de", "https://pipedapi.adminforge.de",
        "https://invidious.fdn.fr", "https://vid.puffyan.us", "https://invidious.kavin.rocks"
    ];

    const shuffled = proxies.sort(() => 0.5 - Math.random()).slice(0, 3); // ONLY try 3 proxies max to save time
    const MAX_TIME = 4500; // 4.5s hard limit for proxy phase
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
                    if (subRes.ok) {
                        const text = await subRes.text();
                        if (text.length > 50) return text;
                    }
                }
            } else if (!isPiped && data.captions?.length) {
                const cap = data.captions[0];
                const subRes = await fetch(`${host}${cap.url}`);
                if (subRes.ok) {
                    const text = await subRes.text();
                    if (text.length > 50) return text;
                }
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
