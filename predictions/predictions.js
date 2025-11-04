document.addEventListener('DOMContentLoaded', () => {
    const roundSelector = document.getElementById('round-selector');
    const fixturesContainer = document.getElementById('fixtures-container');
    const filterButtonsContainer = document.querySelector('.stats-filter-buttons');
    const resultFormatButtonsContainer = document.querySelector('.result-format-buttons');
    const modelDetailsLink = document.querySelector('.model-details-link');
    const modelExplanationPanel = document.getElementById('model-explanation-panel');
    const scoreSuccessRateEl = document.getElementById('score-success-rate');
    const resultSuccessRateEl = document.getElementById('result-success-rate');
    
    let fullSchedule = null;
    let rawTeamData = null;
    let currentFilter = { type: 'lastN', value: 3 };
    let currentResultFormat = 'rounded';
    let currentModel = 'attack_vs_defense';

    // --- HELPER FUNCTIONS ---
    const customRound = (numStr) => {
        const num = parseFloat(numStr);
        if (isNaN(num)) return 'N/A';
        const decimalPart = num % 1;
        if (decimalPart <= 0.50) {
            return Math.floor(num);
        } else {
            return Math.ceil(num);
        }
    };

    const getOutcome = (scoreStr) => {
        if (!scoreStr || typeof scoreStr !== 'string') return 'invalid';
        const parts = scoreStr.split('-').map(s => parseFloat(s.trim()));
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 'invalid';
        if (parts[0] > parts[1]) return 'homeWin';
        if (parts[1] > parts[0]) return 'awayWin';
        return 'draw';
    };

    // --- DATA LOADING ---
    const loadSchedule = async () => {
        fixturesContainer.innerHTML = '<p style="text-align: center;">Loading schedule...</p>';
        try {
            const response = await fetch('/.netlify/functions/get-schedule');
            if (!response.ok) throw new Error('Schedule network response was not ok.');
            const data = await response.json();
            fullSchedule = data.schedule || [];
            fixturesContainer.innerHTML = ''; 
        } catch (error) {
            handleError(error, "schedule");
        }
    };

    const loadTeamData = async () => {
        try {
            const response = await fetch('/.netlify/functions/get-team-stats');
            if (!response.ok) throw new Error('Team stats network response was not ok.');
            const data = await response.json();
            rawTeamData = data.teams || [];
        } catch (error) {
            handleError(error, "team stats");
        }
    };
    
    const handleError = (error, type) => {
        console.error(`Error fetching ${type}:`, error);
        fixturesContainer.innerHTML = `<p style="text-align: center; color: #dc3545;">Error loading ${type} data. Please try again later.</p>`;
    };

    // --- UI RENDERING & SUCCESS RATE CALCULATION ---
    const renderFixturesForRound = (roundNum) => {
        if (!fullSchedule || !rawTeamData) return;
        const gamesForRound = fullSchedule.filter(game => String(game.roundNum) === String(roundNum));

        fixturesContainer.innerHTML = '';
        if (gamesForRound.length === 0) {
            fixturesContainer.innerHTML = '<p style="text-align: center;">No fixture data available for this round.</p>';
            return;
        }

        const header = document.createElement('div');
        header.className = 'fixtures-header';
        header.innerHTML = `<div class="fixture-col">Home</div><div class="prediction-score-col">Scores</div><div class="fixture-col">Away</div><div class="details-col"></div>`;
        fixturesContainer.appendChild(header);

        gamesForRound.forEach(game => {
            const homeTeamName = game.homeTeam;
            const awayTeamName = game.awayTeam;

            const homeStats = calculateStatsForTeam(homeTeamName, 'home', roundNum, currentFilter);
            const awayStats = calculateStatsForTeam(awayTeamName, 'away', roundNum, currentFilter);
            const predictedScore = calculatePredictedScore(homeStats, awayStats);

            let displayHome, displayAway;
            if (currentResultFormat === 'rounded') {
                displayHome = customRound(predictedScore.home);
                displayAway = customRound(predictedScore.away);
            } else {
                displayHome = predictedScore.home;
                displayAway = predictedScore.away;
            }
            
            let scoreBlockHTML = `
                <div class="score-line score-large">
                    <span class="score-label">Predicted Score:</span>
                    <span class="score-value">${displayHome} - ${displayAway}</span>
                </div>
            `;

            const homeTeamData = rawTeamData.find(t => t.team_name === homeTeamName);
            const finishedMatchData = homeTeamData?.rounds?.[roundNum];

            if (finishedMatchData) {
                scoreBlockHTML += `
                    <div class="score-line score-large actual-score">
                        <span class="score-label">Actual Score:</span>
                        <span class="score-value">${finishedMatchData.score_str}</span>
                    </div>
                `;
            }

            let detailedScoresHTML = '';
            let differenceHTML = '';
            if (predictedScore.home !== 'N/A' && predictedScore.away !== 'N/A') {
                const homeScoreNum = parseFloat(predictedScore.home);
                const awayScoreNum = parseFloat(predictedScore.away);
                if (homeScoreNum !== awayScoreNum) {
                    const difference = Math.abs(homeScoreNum - awayScoreNum).toFixed(2);
                    const winnerIndicator = homeScoreNum > awayScoreNum ? '(H)' : '(A)';
                    differenceHTML = `<div class="score-difference">Difference: ${winnerIndicator} -${difference}</div>`;
                }
            }

            if (differenceHTML) {
                detailedScoresHTML += differenceHTML;
            }
            
            detailedScoresHTML += `
                <div class="score-line">
                    <span class="score-label">Decimal Predicted Score:</span>
                    <span class="score-value">${predictedScore.home} - ${predictedScore.away}</span>
                </div>
            `;

            if (finishedMatchData) {
                detailedScoresHTML += `
                    <div class="score-line">
                        <span class="score-label">np Score:</span>
                        <span class="score-value">${finishedMatchData.npscore_str}</span>
                    </div>
                `;
            }

            scoreBlockHTML += `<div class="detailed-scores">${detailedScoresHTML}</div>`;
            scoreBlockHTML += `<span class="expand-link">Expand</span>`;

            const row = document.createElement('div');
            row.className = 'fixture-row';
            row.dataset.homeTeam = homeTeamName;
            row.dataset.awayTeam = awayTeamName;
            row.innerHTML = `
                <div class="fixture-col">${homeTeamName}</div>
                <div class="prediction-score-col">${scoreBlockHTML}</div>
                <div class="fixture-col">${awayTeamName}</div>
                <div class="details-col"><span class="details-link">Details</span></div>
                <div class="details-panel" style="display: none;"></div>
            `;
            fixturesContainer.appendChild(row);
        });

        calculateAndDisplaySuccessRates();
    };
    
    const calculateAndDisplaySuccessRates = () => {
        if (!rawTeamData || !fullSchedule) {
            scoreSuccessRateEl.textContent = `--%`;
            resultSuccessRateEl.textContent = `--%`;
            return;
        }

        let totalValidPredictions = 0;
        let scoreSuccesses = 0;
        let resultSuccesses = 0;

        const allFinishedGames = [];
        const seenGameIds = new Set();

        rawTeamData.forEach(team => {
            for (const roundNum in team.rounds) {
                const roundData = team.rounds[roundNum];
                if (parseInt(roundNum) >= 6 && !seenGameIds.has(roundData.game_id)) {
                    allFinishedGames.push({ team: team.team_name, round: roundNum, ...roundData });
                    seenGameIds.add(roundData.game_id);
                }
            }
        });

        allFinishedGames.forEach(game => {
            const fixture = fullSchedule.find(s => s.roundNum == game.round && (s.homeTeam === game.team || s.awayTeam === game.team));
            if (!fixture) return;

            const homeTeamName = fixture.homeTeam;
            const awayTeamName = fixture.awayTeam;
            
            const homeStats = calculateStatsForTeam(homeTeamName, 'home', game.round, currentFilter);
            const awayStats = calculateStatsForTeam(awayTeamName, 'away', game.round, currentFilter);
            const predictedScore = calculatePredictedScore(homeStats, awayStats);

            if (predictedScore.home === 'N/A' || predictedScore.away === 'N/A') {
                return;
            }
            
            totalValidPredictions++;

            const actualScoreData = rawTeamData.find(t => t.team_name === homeTeamName)?.rounds?.[game.round];
            if (!actualScoreData) return;

            const decimalPredictionStr = `${predictedScore.home}-${predictedScore.away}`;
            if (getOutcome(decimalPredictionStr) === getOutcome(actualScoreData.score_str)) {
                resultSuccesses++;
            }
            
            if (currentResultFormat === 'rounded') {
                const roundedHome = customRound(predictedScore.home);
                const roundedAway = customRound(predictedScore.away);
                const roundedScoreStr = `${roundedHome}-${roundedAway}`;
                if (roundedScoreStr === actualScoreData.score_str) {
                    scoreSuccesses++;
                }
            }
        });

        if (currentResultFormat === 'decimal') {
            scoreSuccessRateEl.textContent = 'N/A';
        } else {
            const scoreRate = totalValidPredictions > 0 ? ((scoreSuccesses / totalValidPredictions) * 100).toFixed(1) : 0;
            scoreSuccessRateEl.textContent = `${scoreRate}%`;
        }
        
        const resultRate = totalValidPredictions > 0 ? ((resultSuccesses / totalValidPredictions) * 100).toFixed(1) : 0;
        resultSuccessRateEl.textContent = `${resultRate}%`;
    };

    // --- CORE CALCULATION LOGIC ---
    const calculatePredictedScore = (homeStats, awayStats) => {
        if (homeStats.message || awayStats.message) {
            return { home: 'N/A', away: 'N/A' };
        }

        if (isNaN(homeStats.npxGneededToScore) || isNaN(awayStats.npxGneededToScore)) {
            return { home: 'N/A', away: 'N/A' };
        }

        const homeFinishing = parseFloat(homeStats.npxGneededToScore);
        const awayFinishing = parseFloat(awayStats.npxGneededToScore);

        const predHomeNpxG = (parseFloat(homeStats.AvgnpxG) + parseFloat(awayStats.AvgnpxGC)) / 2;
        const predAwayNpxG = (parseFloat(awayStats.AvgnpxG) + parseFloat(homeStats.AvgnpxGC)) / 2;

        const predHomeScore = homeFinishing > 0 ? (predHomeNpxG / homeFinishing).toFixed(2) : 'N/A';
        const predAwayScore = awayFinishing > 0 ? (predAwayNpxG / awayFinishing).toFixed(2) : 'N/A';
        
        return { home: predHomeScore, away: predAwayScore };
    };
    
    const formatFilterName = (filter, venue) => {
        if (filter.type === 'overall') return 'overall games';
        if (filter.type === 'lastN') return `last ${filter.value} ${venue} games`;
        return 'the selected filter';
    };

    const calculateStatsForTeam = (teamName, venue, beforeRound, filter) => {
        const team = rawTeamData.find(t => t.team_name === teamName);
        if (!team || !team.rounds) return { message: "No data found for team." };
        
        const pastGames = Object.entries(team.rounds)
            .map(([roundNum, roundData]) => ({ roundNum: parseInt(roundNum), ...roundData }))
            .filter(round => {
                const isBeforeSelectedRound = round.roundNum < beforeRound;
                if (filter.type === 'overall') {
                    return isBeforeSelectedRound;
                }
                return isBeforeSelectedRound && round.venue === venue;
            })
            .sort((a, b) => b.roundNum - a.roundNum);

        let gamesToCalculate = [];
        if (filter.type === 'overall') {
            gamesToCalculate = pastGames;
        } else if (filter.type === 'lastN') {
            if (pastGames.length < filter.value) {
                return { message: `Insufficient data: Only ${pastGames.length} ${venue} games played.` };
            }
            gamesToCalculate = pastGames.slice(0, filter.value);
        }

        if (gamesToCalculate.length === 0) return { message: `No past ${filter.type === 'overall' ? '' : venue} games found.` };

        const numMatches = gamesToCalculate.length;

        const totals = gamesToCalculate.reduce((acc, game) => {
            acc.npxg += game.npxg || 0;
            acc.gf += game.gf || 0;
            acc.ps += game.ps || 0;
            acc.npxgc += game.npxgc || 0;
            acc.ga += game.ga || 0;
            acc.pc += game.pc || 0;
            return acc;
        }, { npxg: 0, gf: 0, ps: 0, npxgc: 0, ga: 0, pc: 0 });

        const npG = totals.gf - totals.ps;
        const npGC = totals.ga - totals.pc;
        const filterName = formatFilterName(filter, venue);

        const npxGneededToScore = (npG > 0) ? (totals.npxg / npG).toFixed(2) : `Cannot calculate: ${teamName} did not score a non-penalty goal in the ${filterName}.`;
        const npxGCneededToConceed = (npGC > 0) ? (totals.npxgc / npGC).toFixed(2) : `Cannot calculate: ${teamName} did not concede a non-penalty goal in the ${filterName}.`;

        const AvgnpxG = (numMatches > 0) ? (totals.npxg / numMatches).toFixed(2) : 'N/A';
        const AvgnpxGC = (numMatches > 0) ? (totals.npxgc / numMatches).toFixed(2) : 'N/A';

        return {
            npxg: totals.npxg.toFixed(2),
            npG: npG,
            npxgc: totals.npxgc.toFixed(2),
            npGC: npGC,
            npxGneededToScore: npxGneededToScore,
            npxGCneededToConceed: npxGCneededToConceed,
            AvgnpxG: AvgnpxG,
            AvgnpxGC: AvgnpxGC
        };
    };

    const generateStatsHTML = (stats) => {
        if (stats.message) return `<p class="error-message">${stats.message}</p>`;

        const scoreHTML = (isNaN(stats.npxGneededToScore)) 
            ? `<p class="error-message">${stats.npxGneededToScore}</p>` 
            : `<span>${stats.npxGneededToScore}</span>`;

        const concedeHTML = (isNaN(stats.npxGCneededToConceed))
            ? `<p class="error-message">${stats.npxGCneededToConceed}</p>`
            : `<span>${stats.npxGCneededToConceed}</span>`;

        return `
            <div class="stat-item"><span>npxG:</span><span>${stats.npxg}</span></div>
            <div class="stat-item"><span>npG:</span><span>${stats.npG}</span></div>
            <div class="stat-item"><span>npxGC:</span><span>${stats.npxgc}</span></div>
            <div class="stat-item"><span>npGC:</span><span>${stats.npGC}</span></div>
            <div class="stat-item separator"><span>Avg npxG:</span><span>${stats.AvgnpxG}</span></div>
            <div class="stat-item"><span>Avg npxGC:</span><span>${stats.AvgnpxGC}</span></div>
            <div class="stat-item separator"><span>npxG To Score:</span>${scoreHTML}</div>
            <div class="stat-item"><span>npxGC To Concede:</span>${concedeHTML}</div>
        `;
    };

    // --- EVENT LISTENERS ---
    roundSelector.addEventListener('change', () => {
        const selectedRound = roundSelector.value;
        if (!selectedRound) return;
        renderFixturesForRound(selectedRound);
    });

    filterButtonsContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelector('.stats-filter-buttons button.active').classList.remove('active');
            e.target.classList.add('active');
            
            const filterType = e.target.dataset.filter;
            currentFilter = { type: filterType };
            if (filterType === 'lastN') {
                currentFilter.value = parseInt(e.target.dataset.value);
            }
            const selectedRound = roundSelector.value;
            if (selectedRound) {
                renderFixturesForRound(selectedRound);
            }
        }
    });

    resultFormatButtonsContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelector('.result-format-buttons button.active').classList.remove('active');
            e.target.classList.add('active');
            currentResultFormat = e.target.dataset.format;
            const selectedRound = roundSelector.value;
            if (selectedRound) {
                renderFixturesForRound(selectedRound);
            }
        }
    });

    modelDetailsLink.addEventListener('click', () => {
        const panel = modelExplanationPanel;
        panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    });

    fixturesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('details-link')) {
            const row = e.target.closest('.fixture-row');
            const detailsPanel = row.querySelector('.details-panel');
            const selectedRound = parseInt(roundSelector.value);

            if (detailsPanel.style.display === 'flex') {
                detailsPanel.style.display = 'none';
                return;
            }

            const homeTeamName = row.dataset.homeTeam;
            const awayTeamName = row.dataset.awayTeam;
            const homeStats = calculateStatsForTeam(homeTeamName, 'home', selectedRound, currentFilter);
            const awayStats = calculateStatsForTeam(awayTeamName, 'away', selectedRound, currentFilter);
            
            document.querySelectorAll('.details-panel').forEach(panel => panel.style.display = 'none');
            
            detailsPanel.innerHTML = `
                <div class="details-stats-col">${generateStatsHTML(homeStats)}</div>
                <div class="details-stats-col">${generateStatsHTML(awayStats)}</div>
            `;
            detailsPanel.style.display = 'flex';
        }
        
        if (e.target.classList.contains('expand-link')) {
            const scoreCol = e.target.closest('.prediction-score-col');
            const details = scoreCol.querySelector('.detailed-scores');
            if (details) {
                const isHidden = details.style.display === 'none';
                details.style.display = isHidden ? 'block' : 'none';
                e.target.textContent = isHidden ? 'Collapse' : 'Expand';
            }
        }
    });

    // --- INITIAL DATA LOAD ---
    const findAndSelectNextRound = () => {
        if (!fullSchedule || !rawTeamData) return;

        // Create a map of game IDs that are finished
        const finishedGameIds = new Set();
        rawTeamData.forEach(team => {
            Object.values(team.rounds).forEach(roundData => {
                if (roundData.game_id) {
                    finishedGameIds.add(roundData.game_id);
                }
            });
        });

        // Get all unique rounds from the schedule
        const allRounds = [...new Set(fullSchedule.map(g => g.roundNum))].sort((a,b) => a-b);
        
        let nextUnfinishedRound = null;

        // Find the first round that is not fully completed
        for (const roundNum of allRounds) {
            const gamesInScheduleForRound = fullSchedule.filter(g => g.roundNum === roundNum);
            let finishedGamesInRoundCount = 0;
            gamesInScheduleForRound.forEach(game => {
                // To find a game's ID in the team data, we need to check both teams, but schedule gives us both names
                const homeTeam = rawTeamData.find(t => t.team_name === game.homeTeam);
                const gameData = homeTeam?.rounds?.[roundNum];
                if(gameData) {
                    finishedGamesInRoundCount++;
                }
            });

            if (finishedGamesInRoundCount < gamesInScheduleForRound.length) {
                nextUnfinishedRound = roundNum;
                break;
            }
        }

        if (nextUnfinishedRound) {
            roundSelector.value = nextUnfinishedRound;
            renderFixturesForRound(nextUnfinishedRound);
        } else if (allRounds.length > 0) {
            // If all rounds are finished, select the last one
            const lastRound = allRounds[allRounds.length - 1];
            roundSelector.value = lastRound;
            renderFixturesForRound(lastRound);
        }
    };

    const initializePage = async () => {
        await loadSchedule();
        await loadTeamData();
        findAndSelectNextRound();
    };

    initializePage();
});