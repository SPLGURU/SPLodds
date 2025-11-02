const fetch = require('node-fetch');

const GITHUB_USERNAME = 'fspldatacente'; 
const { SCHEDULE_GIST_ID } = process.env;

const ALLOWED_ORIGINS = [
    'https://fsdc.netlify.app',
    'https://fsdc2.netlify.app'
];

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