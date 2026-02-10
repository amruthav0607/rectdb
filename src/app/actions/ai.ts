"use server";

import { YoutubeTranscript } from "youtube-transcript";
import { decode } from "html-entities";

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

        // Phase 1: Try Refined Python API
        const host = "neon-admin-dashboard-two.vercel.app";
        const apiUrl = `https://${host}/api/transcript?videoId=${videoId}`;

        console.log("[summarize] Phase 1: Fetching from Refined API:", apiUrl);
        try {
            const apiResponse = await fetch(apiUrl, { cache: 'no-store' });
            const result = await apiResponse.json();
            if (result.success) {
                fullText = result.text;
                console.log("[summarize] API Success. Text length:", fullText.length);
            } else {
                console.error("[summarize] API Business logic error:", result.error);
                // Keep trying Phase 2
            }
        } catch (fetchError: any) {
            console.error("[summarize] Phase 1 Network/Parse Exception:", fetchError.message);
        }

        // Phase 2: Fallback to JS Library
        if (!fullText) {
            console.log("[summarize] Phase 2: Falling back to JS Library...");
            try {
                const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
                fullText = transcriptItems
                    .map((item) => decode(item.text))
                    .join(" ");
                console.log("[summarize] JS Library Success. Text length:", fullText.length);
            } catch (jsError: any) {
                console.error("[summarize] Phase 2 Failure:", jsError.message);
            }
        }

        if (!fullText) {
            console.error("[summarize] All cloud methods blocked.");
            return {
                error: "[TRANSCRIPT_BLOCKED] YouTube is temporarily restricting our server's access to this video's subtitles. This is common for popular videos or due to bot detection in cloud environments. Please try a different video (like a tutorial) or try again later."
            };
        }

        // Phase 3: AI Summarization
        console.log("[summarize] Phase 3: AI Summarization...");
        try {
            const summary = await getAISummary(fullText);
            console.log("[summarize] Success!");
            return { success: summary };
        } catch (aiError: any) {
            console.error("[summarize] Phase 3 Failure:", aiError.message);
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

async function getAISummary(text: string) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OpenRouter API key not found in environment.");

    const truncatedText = text.slice(0, 15000); // Simple truncation to stay within reasonable limits

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://neon-admin-dashboard-two.vercel.app", // Optional
            "X-Title": "Neon Admin Dashboard", // Optional
        },
        body: JSON.stringify({
            model: "google/gemini-2.0-flash-001", // Using a reliable and fast model
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
