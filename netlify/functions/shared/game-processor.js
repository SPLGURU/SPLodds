const fetch = require('node-fetch');

// --- Helper Functions for Stat Calculation ---
const getStatValue = (player, type, statName, opponent, playerName, logArray, logOnMissing = true) => {
    const stat = player.stats?.find(s => s.type === type);
    if (stat && typeof stat.value !== 'undefined') {
        if (statName === 'Penalties Saved') {
            const parts = stat.value.split('/');
            return { saved: parseInt(parts[0], 10) || 0, faced: parseInt(parts[1], 10) || 0 };
        }
        return parseFloat(stat.value) || 0;
    }
    if (logOnMissing) logArray.push({ type: 'warning', message: `Player '${playerName}' missing '${statName}' vs ${opponent}. Defaulted to 0.` });
    return (statName === 'Penalties Saved') ? { saved: 0, faced: 0 } : 0;
};

const getPenaltiesScored = (player) => {
    const goalsStat = player.stats?.find(s => s.type === 27);
    if (goalsStat?.value?.includes('Pk')) {
        const match = goalsStat.value.match(/(\d+)Pk/);
        return match ? parseInt(match[1], 10) : 0;
    }
    return 0;
};

// --- The Main Exported Processor Function ---
exports.processGame = async (game, aggregatedMaps, isAudit = false) => {
    const { aggregatedPlayers, aggregatedGks, aggregatedTeams, buildReportLog } = aggregatedMaps;
    
    console.log(`[DIAGNOSTIC] --- Starting processGame for Game ID: ${game.id} ---`);

    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/5.0 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' };
    const gameUrl = `https://webws.365scores.com/web/game/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1&gameId=${game.id}`;
    const gameResponse = await fetch(gameUrl, { headers });
    if (!gameResponse.ok) throw new Error(`Failed to fetch details for gameId ${game.id}`);
    const gameData = await gameResponse.json();
    if (!gameData?.game) {
        console.log(`[DIAGNOSTIC] Game ID ${game.id}: No game data found in response. Exiting.`);
        return;
    }

    const memberNameMap = new Map(gameData.game.members.map(m => [m.id, m.name]));
    const { homeCompetitor, awayCompetitor } = gameData.game;
    const matchTeamStats = { 
        home: { xg: 0, npxg: 0, penalties_scored: 0, penalties_missed: 0 }, 
        away: { xg: 0, npxg: 0, penalties_scored: 0, penalties_missed: 0 } 
    };
    const gamePenaltyXgMap = new Map();
    const gamePenaltyMissedMap = new Map();

    gameData.game.chartEvents?.events?.filter(e => e.subType === 9).forEach(event => {
        const playerId = String(event.playerId);
        gamePenaltyXgMap.set(playerId, (gamePenaltyXgMap.get(playerId) || 0) + (parseFloat(event.xg) || 0));
        if (event.outcome?.name !== 'Goal') {
            gamePenaltyMissedMap.set(playerId, (gamePenaltyMissedMap.get(playerId) || 0) + 1);
        }
    });
    console.log(`[DIAGNOSTIC] Game ID ${game.id}: Penalty maps created.`);

    const processPlayerList = (playerList, teamName, venue, opponentName) => {
        playerList.forEach(player => {
            if (parseInt(player.stats?.find(s => s.type === 30)?.value || 0, 10) === 0) return;
            const playerName = memberNameMap.get(player.id) || 'Unknown Player';
            const playerIdStr = String(player.id);

            if (player.position?.id === 1) { // is GK
                const current = aggregatedGks.get(playerName) || { player_name: playerName, team_name: teamName, rounds: {} };
                current.team_name = teamName;
                
                const pensData = getStatValue(player, 44, 'Penalties Saved', opponentName, playerName, buildReportLog, false);
                const roundStats = {
                    game_id: game.id,
                    game_timestamp: game.startTime,
                    venue: venue,
                    mp: 1, // matches_played
                    cs: getStatValue(player, 35, 'Goals Conceded', opponentName, playerName, buildReportLog, !isAudit) === 0 ? 1 : 0,
                    s: getStatValue(player, 23, 'Saves', opponentName, playerName, buildReportLog, !isAudit),
                    xgp: getStatValue(player, 83, 'xG Prevented', opponentName, playerName, buildReportLog, false),
                    ps: pensData.saved,
                    pf: pensData.faced,
                };
                
                current.rounds[game.roundNum] = roundStats;
                aggregatedGks.set(playerName, current);

            } else { // is outfield player
                const current = aggregatedPlayers.get(playerName) || { player_name: playerName, team_name: teamName, rounds: {} };
                current.team_name = teamName;

                const xg = getStatValue(player, 76, 'xG', opponentName, playerName, buildReportLog, false);
                const penaltyXg = gamePenaltyXgMap.get(playerIdStr) || 0;

                const roundStats = {
                    game_id: game.id,
                    game_timestamp: game.startTime,
                    venue: venue,
                    mp: 1, // matches_played
                    g: getStatValue(player, 27, 'Goals', opponentName, playerName, buildReportLog, false),
                    xg: xg,
                    npxg: xg - penaltyXg,
                    xa: getStatValue(player, 78, 'xA', opponentName, playerName, buildReportLog, false),
                    a: getStatValue(player, 26, 'Assists', opponentName, playerName, buildReportLog, false),
                    ps: getPenaltiesScored(player),
                    pm: gamePenaltyMissedMap.get(playerIdStr) || 0
                };

                current.rounds[game.roundNum] = roundStats;
                aggregatedPlayers.set(playerName, current);
                
                matchTeamStats[venue].xg += roundStats.xg;
                matchTeamStats[venue].npxg += roundStats.npxg;
                matchTeamStats[venue].penalties_scored += roundStats.ps;
                matchTeamStats[venue].penalties_missed += roundStats.pm;
            }
        });
    };

    processPlayerList(homeCompetitor?.lineups?.members || [], homeCompetitor.name, 'home', awayCompetitor.name);
    processPlayerList(awayCompetitor?.lineups?.members || [], awayCompetitor.name, 'away', homeCompetitor.name);
    
    console.log(`[DIAGNOSTIC] Game ID ${game.id}: Finished processing players. matchTeamStats calculated as: ${JSON.stringify(matchTeamStats, null, 2)}`);

    const processTeam = (team, venue, teamStats, opponentStats, opponentScore) => {
        const teamName = team.name;
        const current = aggregatedTeams.get(teamName) || { team_name: teamName, standings: { overall: 0, home: 0, away: 0 }, rounds: {} };

        // Calculate non-penalty scores
        const teamNpScore = team.score - teamStats.penalties_scored;
        const opponentNpScore = opponentScore - opponentStats.penalties_scored;

        const roundStats = {
            game_id: game.id,
            game_timestamp: game.startTime,
            venue: venue,
            mp: 1,
            gf: team.score,
            ga: opponentScore,
            ps: teamStats.penalties_scored,
            pm: teamStats.penalties_missed,
            pc: opponentStats.penalties_scored, // Penalties Conceded
            xg: teamStats.xg,
            npxg: teamStats.npxg,
            xgc: opponentStats.xg, 
            npxgc: opponentStats.npxg,
            score_str: venue === 'home' ? `${team.score}-${opponentScore}` : `${opponentScore}-${team.score}`,
            npscore_str: venue === 'home' ? `${teamNpScore}-${opponentNpScore}` : `${opponentNpScore}-${teamNpScore}`
        };
        
        current.rounds[game.roundNum] = roundStats;
        aggregatedTeams.set(teamName, current);
    };

    processTeam(homeCompetitor, 'home', matchTeamStats.home, matchTeamStats.away, awayCompetitor.score);
    processTeam(awayCompetitor, 'away', matchTeamStats.away, matchTeamStats.home, homeCompetitor.score);
    
    console.log(`[DIAGNOSTIC] --- Finished processGame for Game ID: ${game.id} ---`);
};