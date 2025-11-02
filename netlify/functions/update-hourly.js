const fetch = require('node-fetch');
const { processGame } = require('./shared/game-processor');

// --- Helper Functions ---
const getGistContent = async (gistId, fileName) => {
    const { GITHUB_GIST_TOKEN } = process.env;
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: { 'Authorization': `token ${GITHUB_GIST_TOKEN}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch Gist ${gistId}. Status: ${response.status}`);
    const gistData = await response.json();
    return JSON.parse(gistData.files[fileName]?.content || '{}');
};

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
exports.handler = async () => {
    console.log("[Step 1/7] Starting HOURLY stats update (Harvester)...");
    const { PLAYER_GIST_ID, TEAM_GIST_ID } = process.env;

    try {
        console.log("[Step 2/7] Fetching existing data from Gists...");
        const playerExistingData = await getGistContent(PLAYER_GIST_ID, 'player-stats.json');
        const teamExistingData = await getGistContent(TEAM_GIST_ID, 'team-stats.json');

        const aggregatedPlayers = new Map((playerExistingData.players || []).map(p => [p.player_name, p]));
        const aggregatedGks = new Map((playerExistingData.goalkeepers || []).map(p => [p.player_name, p]));
        const processedGameIds = new Set(playerExistingData.processedGameIds || []);
        const aggregatedTeams = new Map((teamExistingData.teams || []).map(t => [t.team_name, t]));
        let buildReportLog = playerExistingData.buildReport || [];
        console.log(`[DIAGNOSTIC] Found ${processedGameIds.size} processed game IDs in the Gist.`);

        console.log("[Step 3/7] Fetching all game data from the source API...");
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
        console.log(`[DIAGNOSTIC] Total games fetched from API: ${allGamesFromAPI.length}`);

        console.log("[Step 4/7] Filtering games for the current season...");
        const gamesThisSeason = allGamesFromAPI.filter(game => game.seasonNum === CURRENT_SEASON_NUM);
        console.log(`[DIAGNOSTIC] Found ${gamesThisSeason.length} games matching the current season number (${CURRENT_SEASON_NUM}).`);

        console.log("[Step 5/7] Evaluating each game from the current season individually...");
        const newGamesToProcess = [];
        gamesThisSeason.forEach(game => {
            const gameName = `${game.homeCompetitor.name} vs ${game.awayCompetitor.name}`;
            console.log(`---`);
            console.log(`[EVALUATING] Game ID: ${game.id}, Round: ${game.roundNum}, Match: ${gameName}`);
            
            const statusCheckPass = game.statusText === 'Ended';
            console.log(`  - Status Check: Is game status '${game.statusText}' equal to 'Ended'? -> ${statusCheckPass ? 'PASS' : 'FAIL'}`);

            const uniquenessCheckPass = !processedGameIds.has(game.id);
            console.log(`  - Uniqueness Check: Is game ID ${game.id} NOT in the processed list? -> ${uniquenessCheckPass ? 'PASS' : 'FAIL'}`);

            if (statusCheckPass && uniquenessCheckPass) {
                newGamesToProcess.push(game);
                console.log(`  [RESULT] SUCCESS: This game will be processed.`);
            } else {
                console.log(`  [RESULT] SKIP: This game will be ignored.`);
            }
        });
        console.log(`---`);
        
        if (newGamesToProcess.length === 0) {
            console.log("[Final Result] No new games found to process. Function will now exit.");
            return { statusCode: 200, body: "No new games to process." };
        }
        
        console.log(`[Final Result] Found ${newGamesToProcess.length} new game(s) to process. IDs: ${newGamesToProcess.map(g => g.id).join(', ')}`);
        console.log("[Step 6/7] Processing new games...");
        const aggregatedMaps = { aggregatedPlayers, aggregatedGks, aggregatedTeams, buildReportLog };

        for (const game of newGamesToProcess) {
            try {
                await processGame(game, aggregatedMaps, false);
                processedGameIds.add(game.id);
                console.log(`[DIAGNOSTIC] Successfully processed and added gameId to set: ${game.id}`);
            } catch (error) {
                console.error(`[ERROR] Could not process gameId: ${game.id}. Error: ${error.message}`);
                buildReportLog.push({ type: 'error', message: `Failed to process gameId ${game.id}. It will be retried later.` });
            }
        }
        
        console.log("[Step 7/7] Updating Gists with new data...");
        // ... (rest of the function is unchanged)
        const overallRanks = await fetchStandings(1);
        const homeRanks = await fetchStandings(2);
        const awayRanks = await fetchStandings(3);

        aggregatedTeams.forEach((team, teamName) => {
            if (!team.standings) team.standings = {};
            team.standings.overall = overallRanks.get(teamName) || 0;
            team.standings.home = homeRanks.get(teamName) || 0;
            team.standings.away = awayRanks.get(teamName) || 0;
        });

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
        
        await Promise.all([
            updateGist(PLAYER_GIST_ID, 'player-stats.json', finalPlayerData),
            updateGist(TEAM_GIST_ID, 'team-stats.json', finalTeamData)
        ]);

        console.log("[Success] Hourly stats update successful.");
        return { statusCode: 200, body: "Hourly stats update successful." };

    } catch (error) {
        console.error("[CRITICAL ERROR] Overall error during HOURLY stats update:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};