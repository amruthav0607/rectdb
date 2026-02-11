import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(request: Request) {
    const headerList = await headers();
    const host = headerList.get("host");
    const forwardedHost = headerList.get("x-forwarded-host");
    const proto = headerList.get("x-forwarded-proto");

    return NextResponse.json({
        host,
        forwardedHost,
        proto,
        env_node: process.env.NODE_ENV,
        vercel_url: process.env.VERCEL_URL,
        all_headers: Object.fromEntries(headerList.entries())
    });
}
