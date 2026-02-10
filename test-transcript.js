const path = require('path');
const modPath = path.resolve('node_modules/ai-youtube-transcript');
const { YoutubeTranscript } = require(modPath);

async function test() {
    try {
        console.log('Fetching transcript for MFnn2zj3byA...');
        const transcript = await YoutubeTranscript.fetchTranscript('MFnn2zj3byA');
        console.log('Success! Length:', transcript.length);
        console.log('First transcript item:', transcript[0]);
    } catch (error) {
        console.error('Failed to fetch transcript:', error);
    }
}

test();
