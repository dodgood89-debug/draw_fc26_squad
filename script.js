
document.addEventListener('DOMContentLoaded', () => {
    let allPlayers = [];
    let state = {
        squad: {}, // { positionKey: playerObject }
        usedPlayerIds: new Set(),
        totalOvr: 0
    };

    // DOM Elements
    const board = document.querySelector('.formation-board');
    const modal = document.getElementById('draft-modal');
    const modalTitle = document.getElementById('modal-pos-title');
    const draftOptions = document.getElementById('draft-options');
    const closeModalBtn = document.getElementById('close-modal');
    const teamOvrDisplay = document.getElementById('team-ovr');
    const resetBtn = document.getElementById('reset-btn');
    const chemistryBoard = document.getElementById('chemistry-board');

    // Position Rules (Strict Main Position Only)
    const slotRules = {
        'LW': ['LW', 'LM'],
        'ST': ['ST', 'CF'],
        'RW': ['RW', 'RM'],
        'CM_L': ['CM', 'CDM', 'CAM', 'LM'],
        'CM_C': ['CM', 'CDM', 'CAM'],
        'CM_R': ['CM', 'CDM', 'CAM', 'RM'],
        'LB': ['LB', 'LWB'],
        'CB_L': ['CB'],
        'CB_R': ['CB'],
        'RB': ['RB', 'RWB'],
        'GK': ['GK']
    };

    /**
     * Load Data based on Selection
     */
    function init() {
        const sourceRadios = document.querySelectorAll('input[name="db_source"]');

        const loadSelectedData = () => {
            const selected = document.querySelector('input[name="db_source"]:checked').value;
            if (selected === '5world') {
                allPlayers = window.DATA_5WORLD || [];
                console.log(`Loaded 5 World Leagues: ${allPlayers.length} players`);
            } else {
                allPlayers = window.DATA_ALL || [];
                console.log(`Loaded All Players: ${allPlayers.length} players`);
            }

            if (allPlayers.length === 0) {
                alert('데이터 로드 실패 (변수 없음)');
            }
        };

        // Initial Load
        loadSelectedData();

        // Listen for changes
        sourceRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (confirm('리그 설정을 변경하면 현재 스쿼드가 초기화됩니다. 계속하시겠습니까?')) {
                    loadSelectedData();
                    // Full Reset excluding the alert part handled in resetSquad usually
                    state.squad = {};
                    state.usedPlayerIds.clear();
                    state.totalOvr = 0;
                    updateStats();

                    document.querySelectorAll('.player-slot').forEach(slot => {
                        slot.classList.remove('filled');
                        const posLabel = slot.dataset.position.split('_')[0];
                        slot.innerHTML = `
                            <div class="card-placeholder">+</div>
                            <span class="pos-label">${posLabel}</span>
                        `;
                    });
                } else {
                    // Revert selection if cancelled
                    // (Implementation complex to revert radio, but minor UX issue)
                    // Simply reloading data to be safe with UI state matching is better
                    loadSelectedData();
                }
            });
        });
    }

    /**
     * Get Candidates
     */
    function getCandidates(role, inputPosKey, count = 3) {
        let allowedPos = slotRules[inputPosKey];
        if (!allowedPos) {
            const baseKey = inputPosKey.split('_')[0];
            allowedPos = slotRules[baseKey] || [baseKey];
        }

        const pool = allPlayers.filter(p => {
            if (state.usedPlayerIds.has(p.ID)) return false;
            return allowedPos.includes(p.Position);
        });

        if (pool.length === 0) return [];

        // --- Dynamic Guarantee Logic ---
        const squadValues = Object.values(state.squad);
        const currentSum = squadValues.reduce((acc, p) => acc + p.OVR, 0);
        const currentAvg = squadValues.length > 0 ? Math.round(currentSum / squadValues.length) : 0;

        // Default: 1st pick >= 80
        let reqs = [80];

        // Rule 1: Boost (Squad >= 3 && Avg <= 83) -> Upgrade 1st pick to 85
        if (squadValues.length >= 3 && currentAvg <= 83) {
            reqs[0] = 85;
            console.log(`[Draft Boost] Rule 1 Active (Avg <= 83): First pick >= 85`);
        }

        // Rule 2: Hidden Boost (Squad >= 6 && Avg <= 81) -> Add 2nd pick >= 80
        if (squadValues.length >= 6 && currentAvg <= 81) {
            reqs.push(80);
            console.log(`[Hidden Boost] Rule 2 Active (Avg <= 81): Second pick >= 80 added`);
        } else {
            // Fill the rest with 0 (meaning no guarantee, purely random)
            // But we handle random filling separately below.
        }

        const selectedIds = new Set();
        const candidates = [];

        const pickRandom = (arr) => {
            const valid = arr.filter(p => !selectedIds.has(p.ID));
            if (valid.length === 0) return null;
            return valid[Math.floor(Math.random() * valid.length)];
        };

        // 1. Fulfilling Guarantees
        for (let minOvr of reqs) {
            if (candidates.length >= count) break;

            // Try to find pool >= minOvr
            const highPool = pool.filter(p => p.OVR >= minOvr);
            // Fallback to full pool if highPool is empty
            const targetPool = highPool.length > 0 ? highPool : pool;

            const p = pickRandom(targetPool);
            if (p) {
                candidates.push(p);
                selectedIds.add(p.ID);
            }
        }

        // 2. Fill Rest with Random (Normal Pool)
        while (candidates.length < count) {
            const p = pickRandom(pool);
            if (!p) break;
            candidates.push(p);
            selectedIds.add(p.ID);
        }

        return candidates.sort(() => 0.5 - Math.random());
    }

    /**
     * Open Draft Modal OR View Detail
     */
    function openDraft(slot) {
        if (slot.classList.contains('filled')) {
            const posKey = slot.dataset.position;
            const player = state.squad[posKey];
            if (player) {
                showPlayerDetail(player);
                return;
            }
        }

        const posKey = slot.dataset.position;
        const role = slot.dataset.role;

        modalTitle.innerText = `Select ${posKey}`;
        draftOptions.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">Scouting...</div>';

        modal.classList.remove('hidden');

        setTimeout(() => {
            const candidates = getCandidates(role, posKey, 3);
            renderDraftOptions(candidates, slot);
        }, 300);
    }

    /**
     * Show Player Detail (Big Card Config)
     */
    function showPlayerDetail(player) {
        modalTitle.innerText = `${player.Name}`;

        const imgSrc = player.localimg || player.card;

        draftOptions.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; width: 100%; padding: 1rem; height: 100%;">
                <img src="${imgSrc}" alt="${player.Name}" 
                    style="width: 200px; max-width: 80%; border-radius: 12px; box-shadow: 0 0 20px rgba(0,0,0,0.5);"
                    onerror="this.onerror=null; this.src='${player.card}';">
                
                <div style="text-align: center;">
                    <h2 style="color: var(--gold); margin-bottom: 0.5rem; font-size: 2rem;">${player.OVR}</h2>
                    <p style="color: var(--text-primary); font-size: 1.2rem; font-weight: bold;">${player.Position}</p>
                    <p style="color: var(--text-secondary); margin-top: 5px;">${player.Nation}</p>
                    <p style="color: var(--text-secondary);">${player.Team}</p>
                    <p style="color: var(--text-secondary); font-size: 0.8rem;">${player.League}</p>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    }


    /**
     * Render Draft Cards
     */
    function renderDraftOptions(candidates, targetSlot) {
        draftOptions.innerHTML = '';

        if (candidates.length === 0) {
            draftOptions.innerHTML = '<div style="text-align: center; width: 100%;">No players found available.</div>';
            return;
        }

        candidates.forEach(player => {
            const card = document.createElement('div');
            card.className = 'draft-card';

            const imgSrc = player.localimg || player.card;

            card.innerHTML = `
                <img src="${imgSrc}" alt="${player.Name}" onerror="this.onerror=null; this.src='${player.card}';">
                <div class="info">
                    <div class="ovr">${player.OVR}</div>
                    <div class="name">${player.Name}</div>
                    <div class="meta">${player.Position} | ${player.Nation} | ${player.League} | ${player.Team}</div>
                </div>
            `;

            card.addEventListener('click', () => {
                selectPlayer(player, targetSlot);
                modal.classList.add('hidden');
            });

            draftOptions.appendChild(card);
        });
    }

    /**
     * Select Player & Update Slot
     */
    function selectPlayer(player, slot) {
        const posKey = slot.dataset.position;

        state.squad[posKey] = player;
        state.usedPlayerIds.add(player.ID);

        slot.classList.add('filled');
        const imgSrc = player.localimg || player.card;

        slot.innerHTML = `
            <div class="slot-content">
                <img src="${imgSrc}" class="slot-bg-img" onerror="this.onerror=null; this.src='${player.card}';">
                <span class="slot-ovr">${player.OVR}</span>
                <div class="slot-info">
                    <span class="slot-name">${player.Name}</span>
                </div>
            </div>
        `;

        updateStats();
    }

    /**
     * Update Team Stats & Chemistry
     */
    function updateStats() {
        const squadValues = Object.values(state.squad);
        if (squadValues.length === 0) {
            state.totalOvr = 0;
            teamOvrDisplay.innerText = 0;
            if (chemistryBoard) chemistryBoard.style.display = 'none';
            return;
        }

        const sum = squadValues.reduce((acc, p) => acc + p.OVR, 0);
        const currentAvg = Math.round(sum / squadValues.length);

        teamOvrDisplay.innerText = currentAvg;
        updateChemistry(squadValues);
    }

    /**
     * Update Chemistry (Most Frequent Team/Nation/League)
     */
    function updateChemistry(squad) {
        if (!chemistryBoard) return;

        const counts = { Team: {}, Nation: {}, League: {} };

        squad.forEach(p => {
            counts.Team[p.Team] = (counts.Team[p.Team] || 0) + 1;
            counts.Nation[p.Nation] = (counts.Nation[p.Nation] || 0) + 1;
            counts.League[p.League] = (counts.League[p.League] || 0) + 1;
        });

        const getTop = (obj) => {
            let topKey = null;
            let topVal = 0;
            for (const [key, val] of Object.entries(obj)) {
                if (val > topVal) {
                    topVal = val;
                    topKey = key;
                }
            }
            return topVal >= 3 ? { key: topKey, val: topVal } : null;
        };

        const topTeam = getTop(counts.Team);
        const topNation = getTop(counts.Nation);
        const topLeague = getTop(counts.League);

        let html = '';
        if (topTeam) html += `<span class="chem-item">🛡️ ${topTeam.key} <strong>(${topTeam.val})</strong></span>`;
        if (topNation) html += `<span class="chem-item">🏳️ ${topNation.key} <strong>(${topNation.val})</strong></span>`;
        if (topLeague) html += `<span class="chem-item">🌍 ${topLeague.key} <strong>(${topLeague.val})</strong></span>`;

        if (html === '') {
            chemistryBoard.style.display = 'none';
        } else {
            chemistryBoard.style.display = 'flex';
            chemistryBoard.innerHTML = html;
        }
    }

    /**
     * Reset Squad
     */
    function resetSquad() {
        if (!confirm('Reset your squad?')) return;

        state.squad = {};
        state.usedPlayerIds.clear();
        state.totalOvr = 0;
        updateStats();

        document.querySelectorAll('.player-slot').forEach(slot => {
            slot.classList.remove('filled');
            const posLabel = slot.dataset.position.split('_')[0];
            slot.innerHTML = `
                <div class="card-placeholder">+</div>
                <span class="pos-label">${posLabel}</span>
            `;
        });
    }

    // Event Listeners
    board.addEventListener('click', (e) => {
        const slot = e.target.closest('.player-slot');
        if (slot) {
            openDraft(slot);
        }
    });

    closeModalBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    resetBtn.addEventListener('click', resetSquad);

    init();
});
