const TRANSLATIONS = {
  en: {
    title: 'Deploy AI anywhere.<br>Maintain total control.',
    subtitle: 'Distribute, update, and secure your machine learning models on edge hardware without relying on the cloud.',
    docs: 'Docs',
    beta: 'Become a beta tester',
    connect: 'Connect',
    more: 'See more about Manta Technologies',
    contact: 'Contact us',
    hint: '[ Click to deploy your model to every device ]'
  },
  fr: {
    title: 'D\u00e9ployez l\u2019IA partout.<br>Gardez le contr\u00f4le total.',
    subtitle: 'Distribuez, mettez \u00e0 jour et s\u00e9curisez vos mod\u00e8les de machine learning sur du mat\u00e9riel edge, sans d\u00e9pendre du cloud.',
    docs: 'Docs',
    beta: 'Devenir b\u00eata-testeur',
    connect: 'Connexion',
    more: 'En savoir plus sur Manta Technologies',
    contact: 'Nous contacter',
    hint: '[ Cliquez pour d\u00e9ployer votre mod\u00e8le sur chaque appareil ]'
  }
};

const LANGUAGE_KEY = 'manta-language';

function savedLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

function detectLanguage() {
  const saved = savedLanguage();
  if (saved in TRANSLATIONS) return saved;
  return navigator.language.startsWith('fr') ? 'fr' : 'en';
}

function applyLanguage(language) {
  document.documentElement.lang = language;

  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.innerHTML = TRANSLATIONS[language][element.dataset.i18n];
  }

  for (const link of document.querySelectorAll('[data-lang]')) {
    if (link.dataset.lang === language) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }

  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {}

  document.dispatchEvent(new Event('translated'));
}

for (const link of document.querySelectorAll('[data-lang]')) {
  link.addEventListener('click', event => {
    event.preventDefault();
    applyLanguage(link.dataset.lang);
  });
}

applyLanguage(detectLanguage());
