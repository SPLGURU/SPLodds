// /modules/data-calculator.js

const calculateEntityStats = (entity, view, statKeys, isTeam = false) => {
    const metrics = {};
    // Initialize all potential metrics to 0
    statKeys.forEach(key => metrics[key] = 0);
    metrics.mp = 0; // matches played

    if (!entity.rounds) return metrics;

    for (const roundNum in entity.rounds) {
        const round = entity.rounds[roundNum];
        const isInView = (view === 'overall' || round.venue === view);

        if (isInView) {
            metrics.mp += 1;
            statKeys.forEach(key => {
                metrics[key] += (round[key] || 0);
            });
        }
    }

    // Post-calculation metrics
    if (isTeam) {
        metrics.xg_delta = (metrics.gf - metrics.xg);
        metrics.npxg_delta = (metrics.gf - metrics.ps - metrics.npxg);
    } else {
        metrics.xg_delta = (metrics.g - metrics.xg);
        metrics.npxg_delta = (metrics.g - metrics.ps - metrics.npxg);
    }
    
    return metrics;
};

const STAT_KEYS = {
    player: ['g', 'ps', 'pm', 'xg', 'npxg', 'xa', 'a'],
    gk: ['cs', 's', 'xgp', 'ps', 'pf'],
    team: ['gf', 'ga', 'ps', 'pm', 'pc', 'xg', 'npxg', 'xgc', 'npxgc']
};

window.StatsCalculator = {
    calculatePlayerMetrics: (player, view) => {
        const stats = calculateEntityStats(player, view, STAT_KEYS.player);
        return {
            player_name: player.player_name,
            team_name: player.team_name,
            ...stats
        };
    },
    calculateGkMetrics: (gk, view) => {
        const stats = calculateEntityStats(gk, view, STAT_KEYS.gk);
        return {
            player_name: gk.player_name,
            team_name: gk.team_name,
            ...stats
        };
    },
    calculateTeamMetrics: (team, view) => {
        const stats = calculateEntityStats(team, view, STAT_KEYS.team, true);
        return {
            team_name: team.team_name,
            standings: team.standings?.[view] || '-',
            ...stats
        };
    }
};