import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');

    if (!videoId) {
        return NextResponse.json({ success: false, error: 'Missing videoId' }, { status: 400 });
    }

    // Path to the python script
    // Assuming get_transcript.py is in the project root
    const scriptPath = path.join(process.cwd(), 'get_transcript.py');

    try {
        const { stdout, stderr } = await execAsync(`python "${scriptPath}" ${videoId}`);

        if (stderr) {
            console.error(`[Python API] Script stderr: ${stderr}`);
        }

        try {
            // The python script prints JSON to stdout
            const result = JSON.parse(stdout);
            return NextResponse.json(result);
        } catch (e) {
            console.error(`[Python API] Failed to parse JSON output: ${stdout}`);
            return NextResponse.json({ success: false, error: 'Invalid output from script' }, { status: 500 });
        }
    } catch (error: any) {
        console.error(`[Python API] Error executing script: ${error.message}`);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
