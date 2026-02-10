"use server";

import { YoutubeTranscript } from "youtube-transcript";
import { decode } from "html-entities";

export async function summarizeYouTubeVideo(videoUrl: string) {
    if (!videoUrl) return { error: "Please provide a YouTube URL." };

    try {
        console.log("Starting summarization for URL:", videoUrl);
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            console.error("Invalid Video ID for URL:", videoUrl);
            return { error: "Invalid YouTube URL." };
        }

        console.log("Fetching transcript using Python API for ID:", videoId);

        // Construct the API URL. In production, we use the absolute URL.
        const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
        const host = process.env.VERCEL_URL || (process.env.NODE_ENV === "production" ? "neon-admin-dashboard-two.vercel.app" : "localhost:3003");
        // Ensure we don't have double slashes if host ends with slash
        const apiUrl = `${protocol}://${host}/api/transcript?videoId=${videoId}`;

        let fullText = "";

        try {
            const apiResponse = await fetch(apiUrl);
            if (apiResponse.ok) {
                const result = await apiResponse.json();
                if (result.success) {
                    fullText = result.text;
                } else {
                    console.warn("Python API returned error:", result.error);
                }
            }
        } catch (fetchError: any) {
            console.warn("Fetch failed:", fetchError.message);
        }

        // Fallback to local execution if API fetch failed (useful for local dev)
        if (!fullText) {
            console.log("Attempting local fallback for transcript fetching...");
            try {
                const { execSync } = require("child_process");
                const path = require("path");
                const scriptPath = path.join(process.cwd(), "get_transcript.py");
                const output = execSync(`python "${scriptPath}" ${videoId}`).toString();
                const localResult = JSON.parse(output);
                if (localResult.success) {
                    fullText = localResult.text;
                } else {
                    return { error: localResult.error || "Failed to retrieve transcript." };
                }
            } catch (localError: any) {
                console.error("Local fallback failed:", localError.message);
                return { error: "Transcript service unavailable. Please check subtitles or try again later." };
            }
        }

        console.log("Transcript obtained. Length:", fullText?.length);
        console.log("Sending to AI for summarization...");
        const summary = await getAISummary(fullText);
        console.log("AI Summary generated successfully.");
        return { success: summary };

    } catch (error: any) {
        console.error("Summarization error details:", error);
        return { error: error.message || "Failed to summarize video." };
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
