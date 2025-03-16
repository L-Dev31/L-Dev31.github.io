let familyData = [];
let countryData = {};
let religionData = {};
let familyInfoData = {};

const centuryFiles = [
    "DB/familyDatas/data_2000.json",
    "DB/familyDatas/data_1900.json",
    "DB/familyDatas/data_1800.json",
    "DB/familyDatas/data_1700.json",
    "DB/familyDatas/data_1600.json",
    "DB/familyDatas/data_1500.json",
];

const fetchAllCenturies = async () => {
    try {
        const fetchPromises = centuryFiles.map(file => 
            fetch(file).then(res => {
                if (!res.ok) throw new Error(`Erreur de chargement ${file}`);
                return res.json();
            })
        );
        const centuryData = await Promise.all(fetchPromises);
        return centuryData.flat();
    } catch (error) {
        console.error("Erreur lors de la récupération des siècles:", error);
        return [];
    }
};

async function loadExternalData() {
    try {
        const [familyRes, countryRes, religionRes, familyInfoRes] = await Promise.all([
            fetchAllCenturies(),
            fetch('DB/country.json'),
            fetch('DB/religion.json'),
            fetch('DB/family.json')
        ]);
  
        if (!countryRes.ok) throw new Error('Erreur de chargement de country.json');
        if (!religionRes.ok) throw new Error('Erreur de chargement de religion.json');
        if (!familyInfoRes.ok) throw new Error('Erreur de chargement de family.json');
  
        familyData = familyRes;
        countryData = await countryRes.json();
        religionData = await religionRes.json();
        familyInfoData = await familyInfoRes.json();
        
    } catch (error) {
        console.error('Erreur de chargement:', error);
    }
}

function getCountryInfo(countryCode) {
    const country = countryData[countryCode] || { 
        name: 'Inconnu',
        nativeName: 'Inconnu',
        anthem: 'Hymne inconnu'
    };
    return {
        name: country.name,
        nativeName: country.nativeName,
        anthem: country.anthem,
        flag: `Images/Countries/Flags/${countryCode || 'unknown'}.png`,
        banner: `Images/Countries/Banner/${countryCode || 'unknown'}.png`,
        images: Array.from({length: 4}, (_, i) => 
            `Images/Countries/Images/${countryCode}-${i + 1}.png`),
        anthemFile: `Music/Anthem/${countryCode}.mp3`
    };
}

function getReligionInfo(religionCode) {
    return religionData[religionCode] || {
        name: 'Inconnue',
        icon: '/Images/Icons/unknown.png'
    };
}

function getFamilyInfo(familyCode) {
    return familyInfoData[familyCode] || null;
}

function showPersonDetails(personId) {
    const person = familyData.find(p => p.id === personId);
    const infoPanel = document.getElementById('info-panel');
    
    if (!person) {
        infoPanel.style.display = 'none';
        return;
    }

    const country = getCountryInfo(person.country);
    const religion = getReligionInfo(person.religion);
    const family = getFamilyInfo(person.family);

    infoPanel.classList.toggle('male', person.gender === 'male');
    infoPanel.classList.toggle('female', person.gender === 'female');

    document.getElementById('infoPhoto').src = person.img || 'Images/Persons/Unknown.jpg';
    document.getElementById('infoName').textContent = person.name || 'Inconnu';
    
    const born = person.born === 'Inconnu' ? '?' : person.born;
    const death = ['null', 'inconnu'].includes(person.death?.toLowerCase()) ? '?' : person.death;
    document.getElementById('infoDates').textContent = `${born || '?'} - ${death || '?'}`;

    document.getElementById('infoCity').textContent = person.city || 'Inconnue';
    document.getElementById('infoCountry').innerHTML = `
        ${country.name} 
        <svg class="info-icon" onclick="showCountryPopup('${person.country}')" 
            style="width:12px;height:12px;cursor:pointer;margin-left:5px;" 
            viewBox="0 0 24 24">
            <path fill="currentColor" d="M13 9h-2V7h2m0 10h-2v-6h2m-1-9A10 10 0 002 12a10 10 0 0010 10 10 10 0 0010-10A10 10 0 0012 2z"/>
        </svg>
    `;
    document.getElementById('infoFlag').src = country.flag;
    
    document.getElementById('infoReligion').textContent = religion.name;
    document.getElementById('infoReligionIcon').src = religion.icon;

    const familyInfoElement = document.getElementById('infoFamily');
    if (family) {
        familyInfoElement.innerHTML = `
            <div class="info-row">
                <span class="info-label">Famille :</span>
                <img src="${family.icon}" class="info-blason" alt="Blason de la famille ${family.name}" />
                <span>${family.name}</span>
            </div>
        `;
        familyInfoElement.style.display = 'block';
    } else {
        familyInfoElement.style.display = 'none';
    }

    const handleImageError = (img, fallback) => {
        img.onerror = null; 
        img.src = fallback;
    };
    
    document.querySelectorAll('#info-panel img').forEach(img => {
        img.onerror = () => handleImageError(img, '/Images/Icons/unknown.png');
    });

    infoPanel.style.display = 'block';
}

function showCountryPopup(countryCode) {
    const country = getCountryInfo(countryCode);
    const popup = document.getElementById('countryPopup');
    
    popup.querySelector('.country-banner').src = country.banner;
    popup.querySelector('.country-popup-flag').src = country.flag;
    popup.querySelector('.country-name').textContent = country.name;
    popup.querySelector('.country-native-name').textContent = `"${country.nativeName}"`;
    popup.querySelector('.anthem-title').textContent = country.anthem;

    const gallery = popup.querySelector('.country-gallery');
    gallery.innerHTML = '';
    country.images.forEach(imgSrc => {
        const img = document.createElement('img');
        img.src = imgSrc;
        img.onerror = () => img.style.display = 'none';
        gallery.appendChild(img);
    });

    const audio = popup.querySelector('audio');
    audio.querySelector('source').src = country.anthemFile;
    audio.load();
    
    popup.style.display = 'flex';
}

document.querySelector('.close-popup').addEventListener('click', () => {
    document.getElementById('countryPopup').style.display = 'none';
});

document.getElementById('countryPopup').addEventListener('click', (e) => {
    if(e.target === document.getElementById('countryPopup')) {
        document.getElementById('countryPopup').style.display = 'none';
    }
});

async function initializeFamilyTree() {
    await loadExternalData();
    
    const chart = new FamilyTree(document.getElementById("tree"), {
        mouseScroll: FamilyTree.none,
        nodeBinding: {
            field_0: "name",
            field_1: "born",
            field_2: "death",
            img_0: "img",
            gender: "gender"
        }
    });

    chart.load(familyData);

    chart.on('click', function(sender, args) {
        const personId = args.node?.id || args.data?.id;
        personId ? showPersonDetails(personId) : infoPanel.style.display = 'none';
    });
}

initializeFamilyTree().catch(console.error);