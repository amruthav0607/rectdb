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

        console.log("Fetching transcript for ID:", videoId);
        const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId).catch(() => []);
        const fullText = transcriptItems
            .map((item) => decode(item.text))
            .join(" ");

        if (!fullText || transcriptItems.length === 0) {
            console.error("No transcript found for ID:", videoId);
            return { error: "No transcript available for this video. Please ensure the video has subtitles/captions enabled." };
        }

        console.log("Transcript fetched. Length:", fullText.length);
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
