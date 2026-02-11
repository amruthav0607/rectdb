import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        has_api_key: !!process.env.OPENROUTER_API_KEY,
        api_key_prefix: process.env.OPENROUTER_API_KEY ? process.env.OPENROUTER_API_KEY.slice(0, 10) : "none",
        node_env: process.env.NODE_ENV,
        vercel_env: process.env.VERCEL_ENV || "not set"
    });
}
