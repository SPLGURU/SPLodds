const fetch = require('node-fetch');

// Your GitHub username has been added here.
const GITHUB_USERNAME = 'fspldatacente';
const { TEAM_GIST_ID } = process.env;

// --- START of MODIFICATION ---
// Whitelist of allowed domains
const ALLOWED_ORIGINS = [
    'https://fsdc.netlify.app',    // Your LIVE site
    'https://fsdc2.netlify.app'   // Your TEST site
];
// --- END of MODIFICATION ---

exports.handler = async (event) => {
    // --- START of MODIFICATION ---
    // Dynamically set the CORS header based on the request's origin
    const origin = event.headers.origin;
    const accessControlOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]; // Default to live site

    const headers = {
        'Access-Control-Allow-Origin': accessControlOrigin,
        'Content-Type': 'application/json'
    };
    // --- END of MODIFICATION ---

    if (!TEAM_GIST_ID || !GITHUB_USERNAME) {
        const errorMessage = "Server configuration error: GIST_ID or GITHUB_USERNAME is not set.";
        console.error(errorMessage);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: errorMessage })
        };
    }

    const GIST_URL = `https://gist.githubusercontent.com/${GITHUB_USERNAME}/${TEAM_GIST_ID}/raw/team-stats.json`;

    try {
        const response = await fetch(GIST_URL);
        
        if (response.status === 404) {
            return { 
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ teams: [] }) 
            };
        }
        
        if (!response.ok) {
            throw new Error(`Failed to fetch team-stats.json Gist: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify(data),
        };

    } catch (error) {
        console.error("Error in get-team-stats:", error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: error.message }),
        };
    }
};