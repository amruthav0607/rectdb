const https = require('https');

const hosts = [
    // Piped Instances (often more reliable for API)
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacy.com.de',
    'https://pipedapi.drgns.space',
    'https://pipedapi.in.projectsegfau.lt',
    'https://pipedapi.smnz.de',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.astartes.nl',
    'https://api.piped.yt',
    'https://pipedapi.ducks.party',
    'https://pipedapi.lunar.icu',
    // Invidious Instances
    'https://inv.nadeko.net',
    'https://invidious.fdn.fr',
    'https://vid.puffyan.us',
    'https://invidious.kavin.rocks',
    'https://invidious.drgns.space',
    'https://invidious.privacyredirect.com',
    'https://invidious.rhysd.net',
    'https://yt.artemislena.eu',
    'https://invidious.flokinet.to',
    'https://invidious.lunar.icu',
    'https://yewtu.be',
    'https://invidious.io.lol',
    'https://invidious.tyil.nl',
    'https://invidious.snopyta.org'
];

const videoId = 'Ks-_Mh1QhMc';

async function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data }));
        });
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT' }); });
    });
}

(async () => {
    console.log(`Testing ${hosts.length} instances...`);
    const working = [];

    for (const host of hosts) {
        try {
            const isPiped = host.includes('piped');
            const url = isPiped ? `${host}/streams/${videoId}` : `${host}/api/v1/captions/${videoId}`;

            const res = await fetchUrl(url);

            if (res.ok) {
                try {
                    const json = JSON.parse(res.data);

                    if (isPiped) {
                        if (json.subtitles && json.subtitles.length > 0) {
                            console.log(`[PASS] ${host} (Piped) - Found ${json.subtitles.length} subs`);
                            const enSub = json.subtitles.find(s => s.code && s.code.startsWith('en'));
                            if (enSub) {
                                const subRes = await fetchUrl(enSub.url);
                                if (subRes.ok && subRes.data.length > 0) {
                                    console.log(`       -> CONTENT CHECK: OK (${subRes.data.length} chars)`);
                                    working.push({ host, type: 'piped' });
                                } else {
                                    console.log(`       -> CONTENT CHECK: FAIL (${subRes.status})`);
                                }
                            } else {
                                console.log(`       -> No EN subtitle found`);
                            }
                        } else {
                            console.log(`[FAIL] ${host} (Piped) - No subtitles`);
                        }
                    } else {
                        // Invidious
                        if (json.captions && json.captions.length > 0) {
                            console.log(`[PASS] ${host} (Invidious) - Found ${json.captions.length} captions`);
                            const first = json.captions[0];
                            const capUrl = `${host}${first.url}`;
                            const capRes = await fetchUrl(capUrl);
                            if (capRes.ok && capRes.data.length > 0) {
                                console.log(`       -> CONTENT CHECK: OK (${capRes.data.length} chars)`);
                                working.push({ host, type: 'invidious' });
                            } else {
                                console.log(`       -> CONTENT CHECK: FAIL (${capRes.status})`);
                            }
                        } else {
                            console.log(`[FAIL] ${host} (Invidious) - No captions in list`);
                        }
                    }
                } catch (e) {
                    console.log(`[FAIL] ${host} - Invalid JSON`);
                }
            } else {
                console.log(`[FAIL] ${host} - Status ${res.status || res.error}`);
            }
        } catch (e) {
            console.log(`[ERR] ${host}: ${e.message}`);
        }
    }

    console.log('\n--- SUMMARY ---');
    console.log('Working instances:', working);
})();
