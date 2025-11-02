const fetch = require('node-fetch');

// Your GitHub username has been updated here.
const GITHUB_USERNAME = 'SPLGURU'; 
const { SCHEDULE_GIST_ID } = process.env;

// --- START of MODIFICATION ---
// Whitelist of allowed domains has been updated with your new site URLs.
const ALLOWED_ORIGINS = [
    'https://splpredictor.netlify.app',    // Your NEW LIVE site
    'https://splpredictor2.netlify.app'   // Your NEW TEST site
];
// --- END of MODIFICATION ---

exports.handler = async (event) => {
    const origin = event.headers.origin;
    const accessControlOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const headers = {
        'Access-Control-Allow-Origin': accessControlOrigin,
        'Content-Type': 'application/json'
    };

    if (!SCHEDULE_GIST_ID || !GITHUB_USERNAME) {
        const errorMessage = "Server configuration error: GIST_ID or GITHUB_USERNAME is not set.";
        console.error(errorMessage);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: errorMessage })
        };
    }

    const GIST_URL = `https://gist.githubusercontent.com/${GITHUB_USERNAME}/${SCHEDULE_GIST_ID}/raw/schedule.json`;

    try {
        const response = await fetch(GIST_URL);

        if (response.status === 404) {
            return { 
                statusCode: 200, 
                headers: headers,
                body: JSON.stringify({ schedule: [] }) 
            };
        }
        
        if (!response.ok) {
            throw new Error(`Failed to fetch schedule Gist: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify(data),
        };

    } catch (error) {
        console.error("Error in get-schedule:", error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: error.message }),
        };
    }
};