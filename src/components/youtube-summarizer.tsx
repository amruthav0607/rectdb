"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { summarizeYouTubeVideo } from "@/app/actions/ai";
import ReactMarkdown from "react-markdown";
import { Loader2, Youtube, BookOpen, Copy, Check } from "lucide-react";

export function YouTubeSummarizer() {
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [notes, setNotes] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSummarize = async () => {
        if (!url) return;
        setIsLoading(true);
        setError(null);
        setNotes(null);

        try {
            const result = await summarizeYouTubeVideo(url);
            if (result.error) {
                setError(result.error);
            } else if (result.success) {
                setNotes(result.success);
            }
        } catch (e: any) {
            console.error("UI Error:", e);
            setError(e.message || "Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (!notes) return;
        navigator.clipboard.writeText(notes);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Card className="w-full border-2 border-primary/10 shadow-lg">
            <CardHeader className="bg-primary/5">
                <CardTitle className="flex items-center gap-2">
                    <Youtube className="text-red-600" />
                    YouTube Study AI
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Paste a YouTube link below to generate structured study notes instantly.
                </p>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="flex-1"
                        disabled={isLoading}
                    />
                    <Button
                        onClick={handleSummarize}
                        disabled={isLoading || !url}
                        className="min-w-[120px]"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Analyzing...
                            </>
                        ) : (
                            "Summarize"
                        )}
                    </Button>
                </div>

                {error && (
                    <div className="p-3 text-sm bg-red-50 text-red-600 rounded-lg border border-red-100">
                        {error}
                    </div>
                )}

                {notes && (
                    <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between border-b pb-2">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-primary" />
                                Study Notes
                            </h3>
                            <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-8 gap-1">
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        </div>
                        <div className="prose prose-sm max-w-none bg-slate-50 p-6 rounded-xl border border-slate-200 h-[400px] overflow-auto">
                            <ReactMarkdown>{notes}</ReactMarkdown>
                        </div>
                    </div>
                )}
            </CardContent>
            {!notes && !isLoading && (
                <CardFooter className="bg-slate-50/50 text-xs text-muted-foreground flex-col gap-1 py-4 italic text-center">
                    <p>Best for tutorials, lectures, and educational content.</p>
                    <p className="text-[10px] opacity-70 font-sans NOT-italic">Note: Please use videos with Captions/Subtitles enabled.</p>
                </CardFooter>
            )}
        </Card>
    );
}
