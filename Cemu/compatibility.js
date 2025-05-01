document.addEventListener('DOMContentLoaded', function() {
    // Header scroll effect
    const header = document.querySelector('header');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Load and display games list
    const gamesTableBody = document.getElementById('gamesTableBody');
    if (gamesTableBody) {
        loadGamesList();

        // Add search and filter functionality
        const searchBar = document.getElementById('gameSearch');
        const regionFilter = document.getElementById('regionFilter');
        const statusFilter = document.getElementById('statusFilter');

        function filterGames() {
            const searchText = searchBar.value.toLowerCase();
            const selectedRegion = regionFilter.value.toLowerCase();
            const selectedStatus = statusFilter.value.toLowerCase();
            const rows = gamesTableBody.getElementsByTagName('tr');
            
            for (let row of rows) {
                const title = row.cells[0].textContent.toLowerCase();
                const regionImg = row.cells[2].querySelector('img');
                const region = regionImg ? regionImg.getAttribute('alt').toLowerCase() : '';
                const status = row.cells[3].querySelector('.status').classList[1].toLowerCase();
                
                const matchesSearch = title.includes(searchText);
                const matchesRegion = !selectedRegion || region === selectedRegion;
                const matchesStatus = !selectedStatus || status === selectedStatus;
                
                row.style.display = (matchesSearch && matchesRegion && matchesStatus) ? '' : 'none';
            }
        }

        // Add event listeners for all filter inputs
        searchBar.addEventListener('input', filterGames);
        regionFilter.addEventListener('change', filterGames);
        statusFilter.addEventListener('change', filterGames);
    }
});

function getRegionFlag(region) {
    const flags = {
        'USA': 'usa_flag.png',
        'EUR': 'eur_flag.png',
        'JPN': 'jpn_flag.png',
        'UNK': 'unk_flag.png'
    };
    return flags[region] || flags['UNK'];
}

async function loadGamesList() {
    try {
        const response = await fetch('compatibility-list.json');
        const data = await response.json();
        const games = data.games; // Access the nested games array
        const gamesTableBody = document.getElementById('gamesTableBody');
        
        if (gamesTableBody) {
            gamesTableBody.innerHTML = '';
            
            games.forEach(game => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${game.title}</td>
                    <td>${game.version}</td>
                    <td><img src="assets/images/${getRegionFlag(game.region)}" alt="${game.region}" title="${game.region}" class="region-flag"></td>
                    <td><span class="status ${game.status.toLowerCase()}">${game.status}</span></td>
                `;
                gamesTableBody.appendChild(row);
            });

            updateCompatibilityStats(games);
        }
    } catch (error) {
        console.error('Error loading games list:', error);
        const gamesTableBody = document.getElementById('gamesTableBody');
        if (gamesTableBody) {
            gamesTableBody.innerHTML = '<tr><td colspan="4">Error loading games list. Please try again later.</td></tr>';
        }
    }
}

function updateCompatibilityStats(games) {
    const stats = {
        perfect: games.filter(game => game.status.toLowerCase() === 'perfect').length,
        playable: games.filter(game => game.status.toLowerCase() === 'playable').length,
        developing: games.filter(game => ['runs', 'loads'].includes(game.status.toLowerCase())).length
    };

    document.querySelectorAll('.stat-count').forEach(stat => {
        if (stat.parentElement.classList.contains('perfect')) {
            stat.textContent = stats.perfect + '+';
        } else if (stat.parentElement.classList.contains('playable')) {
            stat.textContent = stats.playable + '+';
        } else if (stat.parentElement.classList.contains('developing')) {
            stat.textContent = stats.developing + '+';
        }
    });
}