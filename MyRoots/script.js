let familyData = [];
let countryData = {};
let religionData = {};
let familyInfoData = {};

async function loadExternalData() {
    try {
        const [familyRes, countryRes, religionRes, familyInfoRes] = await Promise.all([
            fetch('DB/data.json'),
            fetch('DB/country.json'),
            fetch('DB/religion.json'),
            fetch('DB/family.json')
        ]);
  
        if (!familyRes.ok) throw new Error('Erreur de chargement de data.json');
        if (!countryRes.ok) throw new Error('Erreur de chargement de country.json');
        if (!religionRes.ok) throw new Error('Erreur de chargement de religion.json');
        if (!familyInfoRes.ok) throw new Error('Erreur de chargement de family.json');
  
        familyData = await familyRes.json();
        countryData = await countryRes.json();
        religionData = await religionRes.json();
        familyInfoData = await familyInfoRes.json();
        
    } catch (error) {
        console.error('Erreur de chargement:', error);
    }
  }

function getCountryInfo(countryCode) {
  return countryData[countryCode] || { 
      name: 'Inconnu', 
      flag: '/Images/Flags/unknown.png' 
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
  document.getElementById('infoCountry').textContent = country.name;
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
