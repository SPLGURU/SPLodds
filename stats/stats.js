document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    // Raw data fetched from Gists
    let rawTeamData = [];
    let rawPlayerData = [];
    let rawGkData = [];
    let buildReport = [];

    // UI State
    let currentView = 'overall';
    let currentTeamSort = { column: 'standings', direction: 'asc' };
    let currentPlayerSort = { column: 'g', direction: 'desc' };
    let currentGkSort = { column: 'cs', direction: 'desc' };
    let currentPlayerPage = 1;
    const ROWS_PER_PAGE = 20;

    // --- Main Rendering Orchestrator ---
    const renderAllTables = () => {
        // Calculate metrics on the fly using the new calculator module
        const calculatedTeams = rawTeamData.map(team => StatsCalculator.calculateTeamMetrics(team, currentView));
        const calculatedPlayers = rawPlayerData.map(player => StatsCalculator.calculatePlayerMetrics(player, currentView));
        const calculatedGks = rawGkData.map(gk => StatsCalculator.calculateGkMetrics(gk, currentView));
        
        // Render tables using the new renderer module
        TableRenderer.renderTeamTable(calculatedTeams, currentTeamSort);
        TableRenderer.renderPlayerTable(calculatedPlayers, currentPlayerSort, currentPlayerPage, ROWS_PER_PAGE);
        TableRenderer.renderGkTable(calculatedGks, currentGkSort);
        TableRenderer.renderBuildReport(buildReport);
        TableRenderer.renderCorrectionsTable(buildReport);
    };
    
    // --- Tab Switching Logic ---
    document.querySelectorAll('.tab-link').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.tab-link.active').classList.remove('active');
            document.querySelector('.tab-content.active').classList.remove('active');
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // --- Unified Sub-Tab Logic ---
    const setupSubTabs = (containerId) => {
        document.querySelectorAll(`#${containerId} .sub-tab-link`).forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll(`#${containerId} .sub-tab-link`).forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentView = tab.dataset.subTab;
                if (containerId === 'players-sub-tabs') {
                    currentPlayerPage = 1;
                }
                renderAllTables(); // Re-render everything with the new view
            });
        });
    };
    setupSubTabs('teams-sub-tabs');
    setupSubTabs('players-sub-tabs');
    setupSubTabs('gks-sub-tabs');
    
    // --- Data Loading ---
    const fetchAllTeamsBtn = document.getElementById('fetch-all-teams-button');
    async function loadTeamData() {
        const statusEl = document.getElementById('status-teams');
        statusEl.textContent = 'Loading...';
        statusEl.className = 'status-pending';
        if (fetchAllTeamsBtn) fetchAllTeamsBtn.disabled = true;

        try {
            const response = await fetch('/.netlify/functions/get-team-stats');
            if (!response.ok) throw new Error('Failed to fetch team data file');
            const data = await response.json();

            rawTeamData = data.teams || [];
            renderAllTables();

            statusEl.textContent = 'Success';
            statusEl.className = 'status-success';
        } catch (error) {
            console.error("Error fetching team stats:", error);
            statusEl.textContent = `Failed: ${error.message}`;
            statusEl.className = 'status-failed';
        } finally {
            if (fetchAllTeamsBtn) fetchAllTeamsBtn.disabled = false;
        }
    }

    const fetchPlayersBtn = document.getElementById('fetch-players-button');
    async function loadPlayerData() {
        const statusPlayersEl = document.getElementById('status-players');
        const statusGksEl = document.getElementById('status-gks');
        statusPlayersEl.textContent = 'Loading stats...';
        statusPlayersEl.className = 'status-pending';
        statusGksEl.textContent = 'Loading stats...';
        statusGksEl.className = 'status-pending';
        if (fetchPlayersBtn) fetchPlayersBtn.disabled = true;

        try {
            const response = await fetch('/.netlify/functions/get-player-stats');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to fetch data');
            
            rawPlayerData = data.players || [];
            rawGkData = data.goalkeepers || [];
            buildReport = data.buildReport || [];
            currentPlayerPage = 1;

            renderAllTables();
            
            statusPlayersEl.textContent = 'Success';
            statusPlayersEl.className = 'status-success';
            statusGksEl.textContent = 'Success';
            statusGksEl.className = 'status-success';
        } catch (error) {
            console.error("Error fetching player/gk stats:", error);
            const failMsg = `Failed: ${error.message}`;
            statusPlayersEl.textContent = failMsg;
            statusPlayersEl.className = 'status-failed';
            statusGksEl.textContent = failMsg;
            statusGksEl.className = 'status-failed';
        } finally {
            if (fetchPlayersBtn) fetchPlayersBtn.disabled = false;
        }
    }

    if (fetchAllTeamsBtn) fetchAllTeamsBtn.addEventListener('click', loadTeamData);
    if (fetchPlayersBtn) fetchPlayersBtn.addEventListener('click', loadPlayerData);
    
    // --- Initial Data Load on Page Visit ---
    loadTeamData();
    loadPlayerData();

    // --- Player Pagination Controls ---
    document.getElementById('player-prev-btn').addEventListener('click', () => {
        if (currentPlayerPage > 1) {
            currentPlayerPage--;
            renderAllTables();
        }
    });

    document.getElementById('player-next-btn').addEventListener('click', () => {
        const totalPages = Math.ceil(rawPlayerData.length / ROWS_PER_PAGE);
        if (currentPlayerPage < totalPages) {
            currentPlayerPage++;
            renderAllTables();
        }
    });

    // --- Sorting Logic Setup ---
    const setupSorting = (tableId, sortState) => {
        document.querySelectorAll(`#${tableId} th.sortable`).forEach(header => {
            header.addEventListener('click', () => {
                const sortColumn = header.dataset.sort;
                if (sortState.column === sortColumn) {
                    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    sortState.column = sortColumn;
                    sortState.direction = (sortColumn === 'standings') ? 'asc' : 'desc';
                }
                
                if (tableId === 'Players') {
                    currentPlayerPage = 1;
                }
                renderAllTables();
            });
        });
    };
    setupSorting('Teams', currentTeamSort);
    setupSorting('Players', currentPlayerSort);
    setupSorting('GKs', currentGkSort);
});