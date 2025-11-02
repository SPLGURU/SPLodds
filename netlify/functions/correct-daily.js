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

// --- Main Handler ---
exports.handler = async () => {
    console.log("Starting DAILY stats correction (Auditor)...");
    const { PLAYER_GIST_ID, TEAM_GIST_ID } = process.env;

    try {
        const now = new Date();
        const startOfYesterday = new Date(now.getTime() - (48 * 60 * 60 * 1000));
        const endOfYesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        const BASE_URL = 'https://webws.365scores.com';
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

        const gamesToAudit = allGamesFromAPI.filter(game => {
            const gameTime = new Date(game.startTime);
            return game.statusText === 'Ended' && gameTime > startOfYesterday && gameTime < endOfYesterday;
        });

        if (gamesToAudit.length === 0) {
            console.log("No games from yesterday to audit. Exiting.");
            return { statusCode: 200, body: "No games from yesterday to audit." };
        }
        console.log(`Auditing ${gamesToAudit.length} games from yesterday.`);

        const storedPlayerData = await getGistContent(PLAYER_GIST_ID, 'player-stats.json');
        const storedTeamData = await getGistContent(TEAM_GIST_ID, 'team-stats.json');
        
        const aggregatedPlayers = new Map((storedPlayerData.players || []).map(p => [p.player_name, p]));
        const aggregatedGks = new Map((storedPlayerData.goalkeepers || []).map(p => [p.player_name, p]));
        const aggregatedTeams = new Map((storedTeamData.teams || []).map(t => [t.team_name, t]));
        
        let correctionsLog = [];
        const auditMaps = { aggregatedPlayers, aggregatedGks, aggregatedTeams, buildReportLog: [] };

        for (const game of gamesToAudit) {
            const playersBefore = new Map(JSON.parse(JSON.stringify(Array.from(aggregatedPlayers))));
            const gksBefore = new Map(JSON.parse(JSON.stringify(Array.from(aggregatedGks))));
            const teamsBefore = new Map(JSON.parse(JSON.stringify(Array.from(aggregatedTeams))));
            
            try {
                await processGame(game, auditMaps, true); 
                
                const checkAndLogCorrections = (afterMap, beforeMap, statList, keyMap) => {
                    afterMap.forEach((freshEntity, name) => {
                        const storedEntity = beforeMap.get(name);
                        if (!storedEntity) return;

                        statList.forEach(statName => {
                            const shortKey = keyMap[statName];
                            const oldValue = storedEntity.rounds?.[game.roundNum]?.[shortKey];
                            const newValue = freshEntity.rounds?.[game.roundNum]?.[shortKey];
                            
                            if (oldValue !== undefined && newValue !== undefined && oldValue !== newValue) {
                                correctionsLog.push({ type: "correction", name, statName: statName.toUpperCase(), oldValue, newValue, roundNum: game.roundNum });
                            }
                        });
                    });
                };
                
                const playerKeyMap = { goals: 'g', penalties_scored: 'ps', penalties_missed: 'pm', xg: 'xg', npxg: 'npxg', xa: 'xa', assists: 'a', matches_played: 'mp' };
                const playerStatsToCompare = Object.keys(playerKeyMap);

                const gkKeyMap = { clean_sheets: 'cs', saves: 's', xg_prevented: 'xgp', penalties_saved: 'ps', penalties_faced: 'pf', matches_played: 'mp' };
                const gkStatsToCompare = Object.keys(gkKeyMap);

                const teamKeyMap = { xg: 'xg', npxg: 'npxg', xgc: 'xgc', npxgc: 'npxgc', goals_for: 'gf', penalties_scored: 'ps', penalties_missed: 'pm', matches_played: 'mp' };
                const teamStatsToCompare = Object.keys(teamKeyMap);

                checkAndLogCorrections(auditMaps.aggregatedPlayers, playersBefore, playerStatsToCompare, playerKeyMap);
                checkAndLogCorrections(auditMaps.aggregatedGks, gksBefore, gkStatsToCompare, gkKeyMap);
                checkAndLogCorrections(auditMaps.aggregatedTeams, teamsBefore, teamStatsToCompare, teamKeyMap);

            } catch (error) {
                console.error(`Could not process gameId ${game.id} during audit. Error: ${error.message}`);
            }
        }

        if (correctionsLog.length === 0) {
            console.log("Audit complete. No corrections needed.");
            return { statusCode: 200, body: "No corrections needed." };
        }

        console.log(`Found ${correctionsLog.length} corrections. Updating Gists...`);
        
        const nonCorrectionLogs = (storedPlayerData.buildReport || []).filter(log => log.type !== 'correction');
        const finalBuildReport = [...nonCorrectionLogs, ...correctionsLog];
        
        const finalPlayers = Array.from(aggregatedPlayers.values());
        const finalGks = Array.from(aggregatedGks.values());
        const finalTeams = Array.from(aggregatedTeams.values());

        const finalPlayerData = { ...storedPlayerData, players: finalPlayers, goalkeepers: finalGks, buildReport: finalBuildReport };
        const finalTeamData = { ...storedTeamData, teams: finalTeams };

        await Promise.all([
            updateGist(PLAYER_GIST_ID, 'player-stats.json', finalPlayerData),
            updateGist(TEAM_GIST_ID, 'team-stats.json', finalTeamData)
        ]);

        return { statusCode: 200, body: `Daily correction audit complete. Found ${correctionsLog.length} corrections.` };

    } catch (error) {
        console.error("Overall error during DAILY stats correction:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};