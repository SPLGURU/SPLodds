// /modules/table-renderer.js

const renderTeamTable = (teams, sortState) => {
    const tbodyEl = document.getElementById('teams-tbody');
    if (!tbodyEl) return;

    // Sort the pre-calculated data
    teams.sort((a, b) => {
        const col = sortState.column;
        let valA = (col === 'standings') ? (a[col] === '-' ? 999 : a[col]) : a[col];
        let valB = (col === 'standings') ? (b[col] === '-' ? 999 : b[col]) : b[col];
        return sortState.direction === 'asc' ? valA - valB : valB - valA;
    });
    
    tbodyEl.innerHTML = '';
    teams.forEach((team, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${team.standings}</td>
            <td>${index + 1}</td>
            <td>${team.team_name}</td>
            <td>${team.mp}</td>
            <td>${team.gf}</td>
            <td>${team.ga}</td>
            <td>${team.xg.toFixed(2)}</td>
            <td>${team.xgc.toFixed(2)}</td>
            <td>${team.npxg.toFixed(2)}</td>
            <td>${team.npxgc.toFixed(2)}</td>
            <td>${team.xg_delta.toFixed(2)}</td>
            <td>${team.npxg_delta.toFixed(2)}</td>
            <td>${team.ps}</td>
            <td>${team.pm}</td>
            <td>${team.pc}</td>
        `;
        tbodyEl.appendChild(row);
    });
    tbodyEl.parentElement.classList.remove('hidden');
};

const renderPlayerTable = (players, sortState, currentPage, rowsPerPage) => {
    const tbodyEl = document.getElementById('players-tbody');
    if (!tbodyEl) return;

    // Sort the pre-calculated data
    players.sort((a, b) => {
        const valA = a[sortState.column] || 0;
        const valB = b[sortState.column] || 0;
        return sortState.direction === 'asc' ? valA - valB : valB - valA;
    });

    tbodyEl.innerHTML = '';
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedPlayers = players.slice(startIndex, endIndex);

    paginatedPlayers.forEach((player, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${startIndex + index + 1}</td>
            <td>${player.player_name}</td>
            <td>${player.team_name}</td>
            <td>${player.mp}</td>
            <td>${player.g}</td>
            <td>${player.ps}</td>
            <td>${player.pm}</td>
            <td>${player.xg.toFixed(2)}</td>
            <td>${player.npxg.toFixed(2)}</td>
            <td>${player.xa.toFixed(2)}</td>
            <td>${player.a}</td>
            <td>${player.xg_delta.toFixed(2)}</td>
            <td>${player.npxg_delta.toFixed(2)}</td>
        `;
        tbodyEl.appendChild(row);
    });
    tbodyEl.parentElement.classList.remove('hidden');
    updatePlayerPagination(players.length, currentPage, rowsPerPage);
};

const updatePlayerPagination = (totalRows, currentPage, rowsPerPage) => {
    const paginationContainer = document.getElementById('player-pagination');
    const prevBtn = document.getElementById('player-prev-btn');
    const nextBtn = document.getElementById('player-next-btn');
    const pageInfo = document.getElementById('player-page-info');
    
    const totalPages = Math.ceil(totalRows / rowsPerPage);

    if (totalPages <= 1) {
        paginationContainer.classList.add('hidden');
        return;
    }
    
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    paginationContainer.classList.remove('hidden');
};

const renderGkTable = (gks, sortState) => {
    const tbodyEl = document.getElementById('gks-tbody');
    if (!tbodyEl) return;
    
    // Sort the pre-calculated data
    gks.sort((a, b) => {
        const valA = a[sortState.column] || 0;
        const valB = b[sortState.column] || 0;
        return sortState.direction === 'asc' ? valA - valB : valB - valA;
    });

    tbodyEl.innerHTML = '';
    gks.forEach((gk, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${gk.player_name}</td>
            <td>${gk.team_name}</td>
            <td>${gk.cs}</td>
            <td>${gk.s}</td>
            <td>${gk.xgp.toFixed(2)}</td>
            <td>${gk.ps} / ${gk.pf}</td>
        `;
        tbodyEl.appendChild(row);
    });
    tbodyEl.parentElement.classList.remove('hidden');
};

const renderBuildReport = (reportLog) => {
    const reportEl = document.getElementById('build-report-content');
    if (!reportEl) return;

    const textLogs = reportLog.filter(log => typeof log === 'string' || !log.type || log.type !== 'correction');
    const reportText = (textLogs && textLogs.length > 0)
        ? textLogs.map(log => (typeof log === 'object' ? log.message : log)).join('\n')
        : "No issues or warnings found in the last data build.";
    
    reportEl.textContent = reportText;
    reportEl.parentElement.classList.remove('hidden');
};

const renderCorrectionsTable = (reportLog) => {
    const tbodyEl = document.getElementById('corrections-tbody');
    if (!tbodyEl) return;

    const corrections = reportLog.filter(log => log && log.type === 'correction');

    tbodyEl.innerHTML = '';
    if (corrections.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5">No corrections found in the last daily audit.</td>`;
        tbodyEl.appendChild(row);
    } else {
        corrections.forEach(correction => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${correction.name}</td>
                <td>${correction.statName}</td>
                <td>${correction.oldValue}</td>
                <td>${correction.newValue}</td>
                <td>${correction.roundNum}</td>
            `;
            tbodyEl.appendChild(row);
        });
    }
};

window.TableRenderer = {
    renderTeamTable,
    renderPlayerTable,
    renderGkTable,
    renderBuildReport,
    renderCorrectionsTable
};