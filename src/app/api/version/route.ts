import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        version: "0.1.1-stabilized-timeout-fix",
        timestamp: new Date().toISOString()
    });
}
