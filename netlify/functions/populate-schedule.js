const fetch = require('node-fetch');

const updateGist = async (gistId, fileName, data) => {
    const { GITHUB_GIST_TOKEN } = process.env;
    await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `token ${GITHUB_GIST_TOKEN}` },
        body: JSON.stringify({ files: { [fileName]: { content: JSON.stringify(data, null, 2) } } })
    });
};

exports.handler = async () => {
    console.log("--- STARTING ONE-TIME SCHEDULE POPULATION ---");
    const { SCHEDULE_GIST_ID } = process.env;

    if (!SCHEDULE_GIST_ID) {
        return { statusCode: 500, body: "Server configuration error: SCHEDULE_GIST_ID is not set." };
    }

    try {
        console.log("Fetching all game data from the source API...");
        const BASE_URL = 'https://webws.365scores.com';
        const CURRENT_SEASON_NUM = 53;
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' };

        let allGamesFromAPI = [];
        const resultsUrl = '/web/games/results/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1&competitions=649';
        const fixturesUrl = '/web/games/fixtures/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1&competitions=649';

        let nextResultsPage = resultsUrl;
        while (nextResultsPage) {
            const response = await fetch(`${BASE_URL}${nextResultsPage}`, { headers });
            if (!response.ok) break;
            const data = await response.json();
            if (data && Array.isArray(data.games)) { allGamesFromAPI.push(...data.games); }
            nextResultsPage = data.paging?.previousPage || null;
        }
        
        let nextFixturesPage = fixturesUrl;
        while (nextFixturesPage) {
            const response = await fetch(`${BASE_URL}${nextFixturesPage}`, { headers });
            if (!response.ok) break;
            const data = await response.json();
            if (data && Array.isArray(data.games)) { allGamesFromAPI.push(...data.games); }
            nextFixturesPage = data.paging?.nextPage || null;
        }

        const gamesThisSeason = allGamesFromAPI.filter(game => game.seasonNum === CURRENT_SEASON_NUM);
        
        const schedule = gamesThisSeason.map(game => ({
            roundNum: game.roundNum,
            homeTeam: game.homeCompetitor.name,
            awayTeam: game.awayCompetitor.name,
        })).sort((a, b) => a.roundNum - b.roundNum);

        const finalScheduleData = { schedule };

        console.log(`Found ${schedule.length} total games. Updating Gist...`);
        await updateGist(SCHEDULE_GIST_ID, 'schedule.json', finalScheduleData);
        
        const successMessage = `--- SCHEDULE POPULATION COMPLETE --- Successfully processed ${schedule.length} games and updated the Gist.`;
        console.log(successMessage);
        return { statusCode: 200, body: successMessage };

    } catch (error) {
        console.error("CRITICAL ERROR during schedule population:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};