const images = [
    {
        url: 'https://images.pexels.com/photos/8957663/pexels-photo-8957663.jpeg',
        title: 'Сочи, Краснодарский край',
        creator: 'Илья Бунин',
        date: '2019'
    },
    {
        url: 'https://images.pexels.com/photos/417173/pexels-photo-417173.jpeg',
        title: 'Montagne Grise Et Brune',
        creator: 'Pixabay',
        date: '2016'
    },
    {
        url: 'https://images.pexels.com/photos/2187662/pexels-photo-2187662.jpeg',
        title: 'Chemin Entre Les Maisons Traditionnelles',
        creator: 'Evgeny Tchebotarev',
        date: '2019'
    },
    {
        url: 'https://images.pexels.com/photos/402028/pexels-photo-402028.jpeg',
        title: 'Temple Rouge Et Noir Entouré D\'arbres',
        creator: 'Belle Co',
        date: '2017'
    },
    {
        url: 'https://images.pexels.com/photos/15989756/pexels-photo-15989756/free-photo-of-nature-eau-animal-faune.jpeg',
        title: 'Racoon',
        creator: 'Chris F',
        date: '2023'
    },
    {
        url: 'https://images.pexels.com/photos/3647545/pexels-photo-3647545.jpeg',
        title: 'Saut d\'Acomat',
        creator: 'Greg Galas',
        date: '2019'
    },
    {
        url: 'https://images.pexels.com/photos/3386540/pexels-photo-3386540.jpeg',
        title: 'Vue Aérienne De La Ville De Belo Horizonte à L\'aube',
        creator: 'André Moura',
        date: '2019'
    },
    {
        url: 'https://images.pexels.com/photos/219692/pexels-photo-219692.jpeg',
        title: 'Bâtiments De Grande Hauteur Pendant La Photo De Nuit',
        creator: 'Pixabay',
        date: '2016'
    },
    {
        url: 'https://cdn.pixabay.com/photo/2017/11/07/23/23/berchtesgaden-2928712_1280.jpg',
        title: 'Berchtesgaden',
        creator: 'Felix Mittermeier',
        date: '2014'
    },
    {
        url: 'https://cdn.pixabay.com/photo/2016/07/22/16/29/fog-1535201_1280.jpg',
        title: 'Into the mist',
        creator: 'LUM3N',
        date: '2016'
    },
    {
        url: 'https://cdn.pixabay.com/photo/2023/01/08/09/34/jellyfish-7704801_1280.jpg',
        title: 'Deep sea creature',
        creator: 'Tyna Janoch',
        date: '2023'
    },
    {
        url: 'https://cdn.pixabay.com/photo/2018/01/14/23/12/nature-3082832_1280.jpg',
        title: 'Nature, Eaux, Lac.',
        creator: 'jplenio',
        date: '2018'
    },
    {
        url: 'https://images.pexels.com/photos/247599/pexels-photo-247599.jpeg',
        title: 'Vue panoramique du riz paddy',
        creator: 'Pixabay',
        date: '2016'
    },
    {
        url: 'https://images.pexels.com/photos/210186/pexels-photo-210186.jpeg',
        title: 'Lone Tree in Desert',
        creator: 'Pixabay',
        date: '2015'
    },
    {
        url: 'https://images.pexels.com/photos/1146709/pexels-photo-1146709.jpeg',
        title: 'Aerial View of Ocean Waves',
        creator: 'Oleg Magni',
        date: '2019'
    },
    {
        url: 'https://images.pexels.com/photos/33109/fall-autumn-red-season.jpg',
        title: 'Autumn Leaves in Forest',
        creator: 'Pixabay',
        date: '2016'
    },
    {
        url: 'https://images.pexels.com/photos/1029604/pexels-photo-1029604.jpeg',
        title: 'Pebbles',
        creator: 'Eberhard Grossgasteiger',
        date: '2018'
    },
    {
        url: 'https://images.pexels.com/photos/39811/pexels-photo-39811.jpeg',
        title: 'Rainy road',
        creator: 'Pixabay',
        date: '2015'
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
        url: 'https://api.allorigins.win/get?url=https://www.bfmtv.com/rss/international/',
        logo: 'images/RSS/BFMTV.png',
        name: 'BFMTV'
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

            if (description.length > 2400) {
                description = description.substring(0, 2400) + "... [Voir la suite]";
            }
            
            if (lastItems[feed.name] !== title) {
                displayFeed(feed, title, description, link, imageUrl, pubDate);
                lastItems[feed.name] = title;
            }
        } else {
            displayFeed(feed, "Aucun article disponible", "Le flux RSS est vide ou non accessible.", "", "", "");
        }
    } catch (error) {
        console.error("Erreur de récupération du flux RSS:", error);
        displayFeed(feed, "Erreur de récupération", "Impossible de charger les données RSS.", "", "", "");
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
        " onclick="window.open('${link}', '_blank')">
            <div style="text-align: center; margin-right: 20px;">
                <img src="${feed.logo}" alt="${feed.name}" style="
                    width: 50px; 
                    height: 50px; 
                    border-radius: 50%;
                ">
                <div style="color: white; font-size: 0.8em;">${feed.name}</div>
            </div>
            <div style="color: white;">
                <div><strong>${title}</strong></div>
                <div style="font-size: 0.8em; color: white; opacity: 0.5; margin-bottom: 5px;">${pubDate}</div>
                <div style="margin-top: 10px;">${description}</div>
            </div>
            ${imageUrl ? `<img src="${imageUrl}" alt="Image de l'article" style="border-radius: 10px; margin-top: 10px; max-width: 100%; height: auto;">` : ""}
        </div>
    `;
}

function initFeedRotation() {
    setInterval(() => {
        currentFeedIndex = (currentFeedIndex + 1) % rssFeeds.length;
        fetchFeed(rssFeeds[currentFeedIndex]);
    }, 30000);
}

// Initialisation
fetchFeed(rssFeeds[currentFeedIndex]);
initFeedRotation();
