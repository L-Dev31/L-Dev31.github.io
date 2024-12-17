const images = [
    {
        url: 'images/BG/8957663.jpg',
        title: 'Сочи, Краснодарский край',
        creator: 'Илья Бунин',
        date: '2019'
    },
    {
        url: 'images/BG/393773.jpg',
        title: 'Man Doing Hand Stand on Mountain',
        creator: 'Sam Kolder',
        date: '2016'
    },
    {
        url: 'images/BG/417173.jpg',
        title: 'Montagne Grise Et Brune',
        creator: 'Pixabay',
        date: '2016'
    },
    {
        url: 'images/BG/2187662.jpg',
        title: 'Chemin Entre Les Maisons Traditionnelles',
        creator: 'Evgeny Tchebotarev',
        date: '2019'
    },
    {
        url: 'images/BG/402028.jpg',
        title: 'Temple Rouge Et Noir Entouré D\'arbres',
        creator: 'Belle Co',
        date: '2017'
    },
    {
        url: 'images/BG/15989756.jpg',
        title: 'Racoon',
        creator: 'Chris F',
        date: '2023'
    },
    {
        url: 'images/BG/3647545.jpg',
        title: 'Saut d\'Acomat',
        creator: 'Greg Galas',
        date: '2019'
    },
    {
        url: 'images/BG/3386540.jpg',
        title: 'Vue Aérienne De La Ville De Belo Horizonte à L\'aube',
        creator: 'André Moura',
        date: '2019'
    },
    {
        url: 'images/BG/219692.jpg',
        title: 'Bâtiments De Grande Hauteur Pendant La Photo De Nuit',
        creator: 'Pixabay',
        date: '2016'
    },
    {
        url: 'images/BG/7704801.jpg',
        title: 'Deep sea creature',
        creator: 'Tyna Janoch',
        date: '2023'
    },
    {
        url: 'images/BG/247599.jpg',
        title: 'Vue panoramique du riz paddy',
        creator: 'Pixabay',
        date: '2016'
    },
    {
        url: 'images/BG/210186.jpg',
        title: 'Cascade',
        creator: 'Pixabay',
        date: '2015'
    },
    {
        url: 'images/BG/1146709.jpg',
        title: 'Trees in the mist',
        creator: 'Oleg Magni',
        date: '2019'
    },
    {
        url: 'images/BG/1029604.jpg',
        title: 'Pebbles',
        creator: 'Eberhard Grossgasteiger',
        date: '2018'
    }
];

let imageIndex = 0;
const background = document.getElementById('background');
const metadataDisplay = document.getElementById('metadata');

function initBackground() {
    const { url, title, creator, date } = images[imageIndex];
    background.style.backgroundImage = `url(${url})`;
    metadataDisplay.textContent = `"${title}" par ${creator}, ${date}`;
}

function changeBackground() {
    background.style.opacity = '0';
    setTimeout(() => {
        imageIndex = (imageIndex + 1) % images.length;
        const { url, title, creator, date } = images[imageIndex];
        background.style.backgroundImage = `url(${url})`;
        metadataDisplay.textContent = `"${title}" par ${creator}, ${date}`;
        background.style.opacity = '1';
    }, 1000);
}

initBackground();
setInterval(changeBackground, 30000);

function updateTimeAndDate() {
    const now = new Date();
    const optionsTime = { timeZone: 'America/Guadeloupe', hour: '2-digit', minute: '2-digit' };
    document.getElementById('time').textContent = new Intl.DateTimeFormat('fr-FR', optionsTime).format(now);
    const optionsDate = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('date').textContent = new Intl.DateTimeFormat('fr-FR', optionsDate).format(now);
}
setInterval(updateTimeAndDate, 1000);
updateTimeAndDate();

async function fetchWeather() {
    try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=16.3&longitude=-61.8&current_weather=true');
        const data = await response.json();
        const temperature = Math.round(data.current_weather.temperature);
        const weatherCode = data.current_weather.weathercode;
        document.getElementById('temperature').textContent = `${temperature}°`;
        const weatherIcon = document.getElementById('weather-icon');
        weatherIcon.className = `fa-solid ${getWeatherIcon(weatherCode)}`;
    } catch (error) {
        console.error("Failed to fetch weather data:", error);
    }
}

function getWeatherIcon(weatherCode) {
    switch (weatherCode) {
        case 0: return 'fa-sun';
        case 1: case 2: case 3: return 'fa-cloud-sun';
        case 45: case 48: return 'fa-smog';
        case 51: case 53: case 55: return 'fa-cloud-drizzle';
        case 61: case 63: case 65: return 'fa-cloud-rain';
        case 71: case 73: case 75: return 'fa-snowflake';
        case 80: case 81: case 82: return 'fa-cloud-showers-heavy';
        case 95: case 96: case 99: return 'fa-poo-storm';
        default: return 'fa-cloud';
    }
}

fetchWeather();
setInterval(fetchWeather, 1800000);

const rssFeeds = [
    {
        url: 'https://api.allorigins.win/get?url=https://feeds.feedburner.com/nintendolife/latest',
        logo: 'images/RSS/NintendoLife.png',
        name: 'Nintendo Life'
    },
    {
        url: 'https://api.allorigins.win/get?url=https://www.bfmtv.com/rss/international/',
        logo: 'images/RSS/BFMTV.png',
        name: 'BFMTV'
    },
    {
        url: 'https://api.allorigins.win/get?url=https://www.allocine.fr/rss/news.xml',
        logo: 'images/RSS/AlloCine.png',
        name: 'Allo Ciné'
    },
    {
        url: 'https://api.allorigins.win/get?url=https://www.francetvinfo.fr/france/guadeloupe.rss',
        logo: 'images/RSS/La1ere.png',
        name: 'Guadeloupe la 1ère'
    },
    {
        url: 'https://api.allorigins.win/get?url=https://www.diplomatie.gouv.fr/spip.php?page=backend-fd',
        logo: 'images/RSS/FranceDiplomacie.png',
        name: 'France Diplomacie'
    },
    {
        url: 'https://api.allorigins.win/get?url=https://www.jeuxvideo.com/rss/rss-news.xml',
        logo: 'images/RSS/Jeuxvideo.com.png',
        name: 'Jeuxvideo.com'
    },
    {
        url: 'https://api.allorigins.win/get?url=https://www.nintendo.com/fr-fr/news.xml?_gl=1*17ftptg*_gcl_au*NjM5ODI3MDg4LjE3MzAyNTQxMzk.*_ga*MTA3NDA2MTgxNC4xNzMwMjU0MTQw*_ga_8CCMZ61YS8*MTczMDI1NDEzOS4xLjAuMTczMDI1NDEzOS4wLjAuMA..&_ga=2.182971877.218097624.1730254140-1074061814.1730254140',
        logo: 'images/RSS/Nintendo.png',
        name: 'Nintendo'
    },
    {
        url: 'https://api.allorigins.win/get?url=https://www.francetvinfo.fr/monde.rss',
        logo: 'images/RSS/FranceInfo.png',
        name: 'France Info'
    },
    {
        url: 'https://api.allorigins.win/get?url=https://www.lemonde.fr/rss/une.xml',
        logo: 'images/RSS/LeMonde.png',
        name: 'Le Monde'
    }
];

let currentFeedIndex = 0;
const lastItems = {};

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('fr-FR', options);
}

async function fetchFeed(feed) {
    try {
        const response = await fetch(feed.url);
        const data = await response.json();
        const text = data.contents;
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");
        const items = xml.querySelectorAll("item");

        if (items.length > 0) {
            const firstItem = items[0];
            const title = firstItem.querySelector("title").textContent.trim();
            let description = firstItem.querySelector("description").textContent.trim();
            const link = firstItem.querySelector("link").textContent.trim();
            const imageUrl = firstItem.querySelector("media\\:thumbnail") ? firstItem.querySelector("media\\:thumbnail").getAttribute("url") : "";
            const pubDate = firstItem.querySelector("pubDate") ? formatDate(firstItem.querySelector("pubDate").textContent.trim()) : "";

            if (description.length > 1500) {
                description = description.substring(0, 1550) + "... [Voir la suite]";
            }

            // Vérifier si l'article est nouveau pour éviter les doublons
            if (lastItems[feed.name] !== title) {
                displayFeed(feed, title, description, link, imageUrl, pubDate);
                lastItems[feed.name] = title;
            }
        } else {
            // Si le flux est vide, on passe immédiatement au suivant
            skipToNextFeed();
        }
    } catch (error) {
        console.error("Erreur de récupération du flux RSS:", error);
        // En cas d'erreur, on passe au flux suivant
        skipToNextFeed();
    }
}

function displayFeed(feed, title, description, link, imageUrl, pubDate) {
    rssContainer.innerHTML = `
        <div style="
            display: flex;
            align-items: center;
            background: rgba(0, 0, 0, 0.5); 
            padding: 20px; 
            border-radius: 10px; 
            outline: 1.5px solid rgba(255, 255, 255, 0.25); 
            backdrop-filter: blur(25px); 
            position: absolute;
            top: 125px;
            left: 20px;
            right: 20px;
            cursor: pointer;
            max-height: 340px;
            overflow: hidden
        " onclick="window.open('${link}')">
            <div style="text-align: center; margin-right: 20px;">
                <img src="${feed.logo}" alt="${feed.name}" style="
                    max-width: 50px; 
                    max-height: 50px; 
                    border-radius: 50%;
                ">
                <div style="color: white; font-size: 0.8em;">${feed.name}</div>
            </div>
            <div style="color: white;">
                <div><strong>${title}</strong></div>
                <div style="font-size: 0.8em; color: white; opacity: 0.5; margin-bottom: 5px;">${pubDate}</div>
                <div class="rss-description" style="margin-top: 10px;">${description}</div>
            </div>
        </div>
    `;
}


// Fonction pour passer immédiatement au flux suivant
function skipToNextFeed() {
    currentFeedIndex = (currentFeedIndex + 1) % rssFeeds.length;
    fetchFeed(rssFeeds[currentFeedIndex]);
}

// Initialisation de la rotation des flux avec gestion des erreurs
function initFeedRotation() {
    setInterval(() => {
        currentFeedIndex = (currentFeedIndex + 1) % rssFeeds.length;
        fetchFeed(rssFeeds[currentFeedIndex]);
    }, 30000);
}

// Initialisation
fetchFeed(rssFeeds[currentFeedIndex]);
initFeedRotation();
