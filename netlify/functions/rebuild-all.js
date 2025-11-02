/*
 * =================================================================================================
 * --- IMPORTANT: ONE-TIME DATA REBUILD FUNCTION ---
 * =================================================================================================
* [PURPOSE]
 * This function was originally created to perform a full, one-time data rebuild. Its primary job
 * is to re-process every single finished match from the current season from scratch.
 *
 * [THE PROBLEM IT SOLVES]
 * When a new statistic is added to the main 'game-processor.js' file (e.g., 'Matches Played'),
 * the normal hourly and daily functions will only calculate that new stat for *future* or
 * *very recent* games. They will NOT go back and update all the historical data for matches
 * that were processed weeks or months ago. This function solves that problem by wiping the slate
 * clean and rebuilding the entire dataset with the new, complete logic.
 *
 * [FUTURE USE]
 * KEEP THIS FILE in the project. If you ever decide to add more stats in the future, you will
 * face the same historical data gap. This function will be your tool to fix it again.
 *
 * [HOW TO USE - SAFETY INSTRUCTIONS]
 * This function is intentionally dormant and CANNOT be run accidentally. To execute it, you must
 * provide a secret key in the URL's query string.
 *
 * 1. Change the placeholder value for 'REBUILD_SECRET' below to a long, random, secret phrase.
 * 2. Deploy the function with your new secret.
 * 3. To run it, visit the URL:
 *    https://fsdc-data-fetcher.netlify.app/.netlify/functions/rebuild-all?key=YOUR_SECRET_PHRASE_HERE
 *
 * If the key is incorrect or missing, the function will immediately stop with an "Access Denied" error.
 *

 */

const fetch = require('node-fetch');
const { processGame } = require('./shared/game-processor');

// --- Helper Functions ---
const updateGist = async (gistId, fileName, data) => {
    const { GITHUB_GIST_TOKEN } = process.env;
    await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `token ${GITHUB_GIST_TOKEN}` },
        body: JSON.stringify({ files: { [fileName]: { content: JSON.stringify(data, null, 2) } } })
    });
};

// --- Standings Fetcher ---
const fetchStandings = async (type) => {
    const STANDINGS_URL = `https://webws.365scores.com/web/standings/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1&competitions=649&type=${type}`;
    const response = await fetch(STANDINGS_URL);
    if (!response.ok) throw new Error(`Failed to fetch standings type ${type}`);
    const data = await response.json();
    const rankMap = new Map();
    data.standings[0].rows.forEach(row => {
        rankMap.set(row.competitor.name, row.position);
    });
    return rankMap;
};

// --- Main Handler ---
exports.handler = async (event) => {
    const REBUILD_SECRET = 'start';
    const providedKey = event.queryStringParameters?.key;

    if (providedKey !== REBUILD_SECRET) {
        return { statusCode: 403, body: "Forbidden: You do not have permission to run this function." };
    }

    console.log("--- STARTING ONE-TIME FULL DATA REBUILD ---");
    const { PLAYER_GIST_ID, TEAM_GIST_ID } = process.env;

    try {
        console.log("Initializing fresh data sets...");
        const aggregatedPlayers = new Map();
        const aggregatedGks = new Map();
        const aggregatedTeams = new Map();
        const processedGameIds = new Set();
        let buildReportLog = [];

        console.log("Fetching all game data from the source API...");
        const BASE_URL = 'https://webws.365scores.com';
        const CURRENT_SEASON_NUM = 53;
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' };

        let nextPagePath = '/web/games/results/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1&competitions=649';
        let allGamesFromAPI = [];
        while (nextPagePath) {
            const response = await fetch(`${BASE_URL}${nextPagePath}`, { headers });
            if (!response.ok) break;
            const fixturesData = await response.json();
            if (fixturesData && Array.isArray(fixturesData.games)) { allGamesFromAPI.push(...fixturesData.games); }
            nextPagePath = fixturesData.paging?.previousPage || null;
        }

        const gamesToProcess = allGamesFromAPI.filter(game => game.seasonNum === CURRENT_SEASON_NUM && game.statusText === 'Ended');
        
        console.log(`Found ${gamesToProcess.length} total finished games to process.`);
        if (gamesToProcess.length === 0) {
            return { statusCode: 200, body: "No games found to process. Exiting." };
        }
        
        const aggregatedMaps = { aggregatedPlayers, aggregatedGks, aggregatedTeams, buildReportLog };
        for (const game of gamesToProcess) {
            try {
                await processGame(game, aggregatedMaps, false); 
                processedGameIds.add(game.id);
            } catch (error) {
                console.error(`Could not process gameId: ${game.id}. Error: ${error.message}`);
                buildReportLog.push({ type: 'error', message: `Failed to process gameId ${game.id} during rebuild.` });
            }
        }
        console.log(`Successfully processed ${gamesToProcess.length} games.`);
        
        console.log("Fetching and updating league standings...");
        const overallRanks = await fetchStandings(1);
        const homeRanks = await fetchStandings(2);
        const awayRanks = await fetchStandings(3);

        aggregatedTeams.forEach((team, teamName) => {
            if (!team.standings) team.standings = {};
            team.standings.overall = overallRanks.get(teamName) || 0;
            team.standings.home = homeRanks.get(teamName) || 0;
            team.standings.away = awayRanks.get(teamName) || 0;
        });

        console.log("Formatting final data arrays...");
        const finalPlayersArray = Array.from(aggregatedPlayers.values());
        const finalGksArray = Array.from(aggregatedGks.values());
        const finalTeamsArray = Array.from(aggregatedTeams.values());

        const finalPlayerData = {
            processedGameIds: Array.from(processedGameIds),
            players: finalPlayersArray,
            goalkeepers: finalGksArray,
            buildReport: buildReportLog
        };
        const finalTeamData = { teams: finalTeamsArray };
        
        console.log("Updating Gists with the completely rebuilt data...");
        await Promise.all([
            updateGist(PLAYER_GIST_ID, 'player-stats.json', finalPlayerData),
            updateGist(TEAM_GIST_ID, 'team-stats.json', finalTeamData)
        ]);

        const successMessage = `--- ONE-TIME FULL DATA REBUILD COMPLETE --- Successfully processed ${gamesToProcess.length} games.`;
        console.log(successMessage);
        return { statusCode: 200, body: successMessage };

    } catch (error) {
        console.error("CRITICAL ERROR during the full rebuild process:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};