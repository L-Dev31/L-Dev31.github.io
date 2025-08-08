import puppeteer from 'puppeteer';

export class GoogleMapsScraper {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = {
      headless: true, // Mode invisible
      timeout: options.timeout || 60000,
      maxRetries: options.maxRetries || 3,
      ...options
    };
  }

  async init() {
    try {
      console.log('🚀 Initializing browser...');
      
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-blink-features=AutomationControlled',
          '--disable-extensions',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-infobars',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        defaultViewport: { width: 1366, height: 768 },
        ignoreDefaultArgs: ['--enable-automation']
      });
      
      this.page = await this.browser.newPage();
      
      // Anti-détection avancé
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['fr-FR', 'fr', 'en-US', 'en']
        });
      });

      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document'
      });

      // Définir des cookies Google pour éviter la page de consentement
      const googleCookies = [
        {
          name: 'CONSENT',
          value: 'PENDING+987',
          domain: '.google.com',
          path: '/',
          httpOnly: false,
          secure: true
        },
        {
          name: 'SOCS',
          value: 'CAISHAgBEhJnd3NfMjAyMzEyMDQtMF9SQzIaAmZyIAEaBgiA_dGpBg',
          domain: '.google.com',
          path: '/',
          httpOnly: false,
          secure: true
        }
      ];

      try {
        await this.page.setCookie(...googleCookies);
        console.log('🍪 Google cookies set to bypass consent');
      } catch (e) {
        console.log('⚠️ Could not set all cookies:', e.message);
      }

      console.log('✅ Browser initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize browser:', error);
      throw new Error(`Browser initialization failed: ${error.message}`);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async randomDelay(min = 1000, max = 3000) {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async scrapeBusinesses(keyword, city, maxResults = 20, progressCallback = null, radius = null) {
    if (!this.browser || !this.page) {
      await this.init();
    }

    const searchQuery = `${keyword} ${city}`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
    
    let attempts = 0;
    
    while (attempts < this.options.maxRetries) {
      try {
        console.log(`🔍 Searching: ${searchQuery} (attempt ${attempts + 1}/${this.options.maxRetries})`);
        
        if (progressCallback) progressCallback(10);
        
        // Navigation vers Google Maps
        await this.randomDelay(1000, 3000);
        await this.page.goto(searchUrl, { 
          waitUntil: 'networkidle0', 
          timeout: this.options.timeout 
        });

        console.log('⏳ Waiting for page to load...');
        await this.randomDelay(3000, 5000);

        // Gérer les cookies et la page de consentement Google
        try {
          const currentUrl = this.page.url();
          console.log('📍 Current URL:', currentUrl);
          
          // Vérifier si on est sur la page de consentement Google
          if (currentUrl.includes('consent.google.com') || await this.page.$('form[action*="consent"]')) {
            console.log('🍪 Detected Google consent page, handling...');
            
            const consentButtons = [
              'button[aria-label*="Accept"]',
              'button[aria-label*="Accepter"]',
              'button:contains("Accept all")',
              'button:contains("Tout accepter")',
              'button[data-ved]', // Bouton Google générique
              'form[action*="consent"] button[type="submit"]',
              '#L2AGLb',
              'button[jsname="b3VHJd"]', // Bouton "Tout accepter" Google
              'button[jsname="tHlp8d"]'  // Bouton "Tout refuser" Google
            ];

            let consentHandled = false;
            for (const selector of consentButtons) {
              try {
                const elements = await this.page.$$(selector);
                if (elements.length > 0) {
                  console.log(`🔘 Found consent button: ${selector}`);
                  await elements[0].click();
                  console.log('✅ Consent button clicked');
                  await this.randomDelay(3000, 5000);
                  consentHandled = true;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
            
            // Si les boutons ne fonctionnent pas, essayer de naviguer directement
            if (!consentHandled) {
              console.log('🔄 Trying direct navigation to bypass consent...');
              await this.page.goto(searchUrl.replace(/\s/g, '+'), { 
                waitUntil: 'networkidle0', 
                timeout: this.options.timeout 
              });
              await this.randomDelay(3000, 5000);
            }
          }

          // Gérer d'autres types de bannières de cookies
          const otherCookieButtons = [
            'button[aria-label*="Accept"]',
            'button[aria-label*="Accepter"]', 
            'button:has-text("Accept all")',
            'button:has-text("Tout accepter")',
            '#L2AGLb',
            '.VfPpkd-LgbsSe[aria-label*="Accept"]'
          ];

          for (const selector of otherCookieButtons) {
            try {
              const element = await this.page.$(selector);
              if (element) {
                await element.click();
                console.log('✅ Additional cookies accepted');
                await this.randomDelay(2000, 3000);
                break;
              }
            } catch (e) {
              continue;
            }
          }
        } catch (e) {
          console.log('ℹ️ Cookie handling completed with minor issues');
        }

        if (progressCallback) progressCallback(30);

        // Attendre les résultats - sélecteurs mis à jour pour 2025
        console.log('🔍 Looking for search results...');
        
        let resultsFound = false;
        const resultWaitSelectors = [
          // Nouveaux sélecteurs Google Maps 2025
          '[data-result-index]',
          '[role="feed"] [role="article"]',
          '[data-value="Directions"]',
          '.Nv2PK',
          '.hfpxzc',
          '[jsaction*="pane.card.click"]',
          '.m6QErb',
          '[data-cid]',
          // Anciens sélecteurs de fallback
          'div[role="main"] [jsaction*="pane.card.click"]',
          'a[data-value="Directions"]',
          '[role="article"]'
        ];

        // Essayer chaque sélecteur
        for (const selector of resultWaitSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 10000 });
            const elements = await this.page.$$(selector);
            if (elements.length > 0) {
              console.log(`✅ Found ${elements.length} results with selector: ${selector}`);
              resultsFound = true;
              break;
            }
          } catch (e) {
            console.log(`❌ Selector ${selector} failed`);
            continue;
          }
        }

        // Si aucun sélecteur n'a fonctionné, essayer une approche plus générale
        if (!resultsFound) {
          console.log('🔄 Trying fallback method - waiting for page content...');
          try {
            // Attendre que la page soit stable (utilisation correcte)
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Vérifier s'il y a du contenu chargé
            const hasContent = await this.page.evaluate(() => {
              const bodyText = document.body.innerText;
              return bodyText.length > 1000; // Page avec du contenu
            });
            
            if (hasContent) {
              console.log('✅ Page content loaded successfully (fallback method)');
              resultsFound = true;
            }
          } catch (fallbackError) {
            console.log('❌ Fallback method failed:', fallbackError.message);
          }
        }

        if (!resultsFound) {
          // Capturer le HTML pour debug
          try {
            const pageContent = await this.page.content();
            console.log('📄 Page title:', await this.page.title());
            console.log('📄 Page URL:', this.page.url());
            console.log('📄 Page content preview:', pageContent.substring(0, 500));
          } catch (debugError) {
            console.log('❌ Could not capture debug info');
          }
          throw new Error('No search results found on page');
        }

        if (progressCallback) progressCallback(50);

        // Scroll pour charger plus de résultats
        await this.scrollToLoadResults(maxResults, progressCallback);
        
        // Extraire les données avec détails complets
        const businesses = await this.extractBusinessData(keyword, city, maxResults, progressCallback);
        
        console.log(`✅ Successfully scraped ${businesses.length} businesses`);
        return businesses;
        
      } catch (error) {
        attempts++;
        console.error(`❌ Scraping attempt ${attempts} failed:`, error.message);
        
        if (attempts >= this.options.maxRetries) {
          // Screenshot de debug
          try {
            const debugPath = `debug-screenshot-${Date.now()}.png`;
            await this.page.screenshot({ path: debugPath, fullPage: true });
            console.log(`📸 Debug screenshot saved: ${debugPath}`);
          } catch (screenshotError) {
            console.log('❌ Could not save debug screenshot');
          }
          
          throw new Error(`Failed after ${this.options.maxRetries} attempts: ${error.message}`);
        }
        
        console.log(`⏳ Waiting ${5 + attempts * 2} seconds before retry...`);
        await this.randomDelay((5 + attempts * 2) * 1000, (7 + attempts * 2) * 1000);
        
        // Nouvelle page pour le retry
        try {
          await this.page.close();
          this.page = await this.browser.newPage();
          await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
          });
        } catch (e) {
          console.warn('Could not reset page for retry');
        }
      }
    }
  }

  async scrollToLoadResults(maxResults, progressCallback = null) {
    console.log('📜 Scrolling to load more results...');
    
    try {
      let scrollAttempts = 0;
      const maxScrollAttempts = Math.min(10, Math.ceil(maxResults / 3));

      while (scrollAttempts < maxScrollAttempts) {
        // Scroll dans le panneau latéral Google Maps
        await this.page.evaluate(() => {
          // Trouver le conteneur de résultats
          const containers = [
            document.querySelector('div[role="main"]'),
            document.querySelector('.m6QErb'),
            document.querySelector('[aria-label*="Results for"]'),
            document.querySelector('.Nv2PK'),
            document.querySelector('#pane')
          ];
          
          let scrolled = false;
          for (const container of containers) {
            if (container) {
              container.scrollTop = container.scrollHeight;
              scrolled = true;
              break;
            }
          }
          
          // Fallback: scroll global
          if (!scrolled) {
            window.scrollTo(0, document.body.scrollHeight);
          }
        });

        await this.randomDelay(2000, 4000);
        
        // Vérifier combien de résultats on a maintenant
        const currentCount = await this.page.evaluate(() => {
          const selectors = [
            'div[role="main"] [jsaction*="pane.card.click"]',
            'a[data-value="Directions"]',
            '[role="article"]',
            '.hfpxzc'
          ];
          
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              return elements.length;
            }
          }
          return 0;
        });
        
        console.log(`📊 Currently loaded: ${currentCount} results`);
        
        if (progressCallback) {
          const progress = Math.min(80, 50 + (currentCount / maxResults) * 30);
          progressCallback(progress);
        }
        
        if (currentCount >= maxResults) {
          console.log(`✅ Loaded enough results: ${currentCount}`);
          break;
        }
        
        scrollAttempts++;
      }

    } catch (error) {
      console.warn('⚠️ Scrolling error:', error.message);
    }
  }

  async extractBusinessData(keyword, city, maxResults, progressCallback = null) {
    console.log('📋 Extracting business data...');
    
    try {
      await this.randomDelay(2000, 3000);
      
      // D'abord, obtenir la liste des businesses visibles
      const businessLinks = await this.page.evaluate((maxResults) => {
        const results = [];
        
        // Sélecteurs pour les éléments business Google Maps 2024
        const businessSelectors = [
          '.hfpxzc',
          'div[role="main"] [jsaction*="pane.card.click"]',
          'a[data-value="Directions"]',
          '[role="article"]',
          'div[data-result-index]'
        ];
        
        let businessElements = [];
        for (const selector of businessSelectors) {
          businessElements = document.querySelectorAll(selector);
          if (businessElements.length > 0) {
            console.log(`Using selector: ${selector} (${businessElements.length} found)`);
            break;
          }
        }
        
        // Extraire les noms et URLs de base
        for (let i = 0; i < Math.min(businessElements.length, maxResults); i++) {
          const element = businessElements[i];
          
          try {
            let name = null;
            let url = null;
            
            // Extraction du nom
            const nameSelectors = [
              '.qBF1Pd.fontHeadlineSmall', // Sélecteur principal Google Maps 2025
              '.fontHeadlineSmall',
              '.fontHeadlineMedium', 
              '.qBF1Pd',
              '.DUwDvf',
              'h3',
              '.place-name',
              '[data-value*="title"]',
              'span[role="img"] + div div',
              'a[href*="place"] span'
            ];
            
            for (const selector of nameSelectors) {
              const nameEl = element.querySelector(selector);
              if (nameEl && nameEl.textContent.trim()) {
                name = nameEl.textContent.trim();
                console.log(`✅ Found name "${name}" with selector: ${selector}`);
                break;
              }
            }
            
            // Si aucun nom n'est trouvé, essayer d'extraire depuis le contenu général
            if (!name) {
              const allText = element.textContent || '';
              const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
              // Prendre la première ligne qui ressemble à un nom de business (pas trop courte, pas de chiffres au début)
              for (const line of lines) {
                if (line.length > 2 && line.length < 100 && !/^\d/.test(line) && 
                    !line.includes('étoiles') && !line.includes('€') && !line.includes('km')) {
                  name = line;
                  console.log(`✅ Found name from text: "${name}"`);
                  break;
                }
              }
            }
            
            // URL depuis href ou data-attribute
            if (element.href) {
              url = element.href;
            } else {
              const linkEl = element.querySelector('a[href*="maps"]');
              if (linkEl) url = linkEl.href;
            }
            
            // Fallback nom depuis aria-label
            if (!name && element.getAttribute('aria-label')) {
              name = element.getAttribute('aria-label').split(',')[0].trim();
            }
            
            if (name && name.length > 2) {
              results.push({ name, url, elementIndex: i });
            }
            
          } catch (error) {
            console.error(`Error processing business ${i}:`, error);
          }
        }
        
        return results;
      }, maxResults);
      
      console.log(`📊 Found ${businessLinks.length} businesses to process`);
      
      const detailedBusinesses = [];
      
      // Maintenant, cliquer sur chaque business pour obtenir les détails
      for (let i = 0; i < businessLinks.length; i++) {
        const businessInfo = businessLinks[i];
        
        if (progressCallback) {
          const progress = 50 + (i / businessLinks.length) * 45; // 50% à 95%
          progressCallback(progress);
        }
        
        console.log(`🔍 Processing business ${i + 1}/${businessLinks.length}: ${businessInfo.name}`);
        
        try {
          const businessDetails = await this.extractSingleBusinessDetails(businessInfo, keyword, city);
          if (businessDetails) {
            detailedBusinesses.push(businessDetails);
            console.log(`✅ Extracted details for: ${businessDetails.name}`);
            if (businessDetails.email) console.log(`📧 Found email: ${businessDetails.email}`);
            if (businessDetails.phone) console.log(`📞 Found phone: ${businessDetails.phone}`);
            if (businessDetails.website_url) console.log(`🌐 Found website: ${businessDetails.website_url}`);
            if (businessDetails.image_url) console.log(`🖼️ Found image: ${businessDetails.image_url}`);
          }
          
          // Délai entre chaque business plus long pour éviter la détection
          await this.randomDelay(2000, 4000);
          
        } catch (error) {
          console.error(`❌ Error processing ${businessInfo.name}:`, error);
          
          // Continuer avec les données de base si l'extraction détaillée échoue
          detailedBusinesses.push({
            search_keyword: keyword,
            city: city,
            name: businessInfo.name,
            category: null,
            rating: null,
            address: null,
            phone: null,
            email: null,
            website_url: businessInfo.url,
            has_website: !!businessInfo.url,
            google_maps_url: businessInfo.url,
            google_maps_id: businessInfo.url ? businessInfo.url.split('/maps/place/')[1]?.split('/')[0] || null : null,
            image_url: null
          });
        }
      }
      
      console.log(`📊 Extracted ${detailedBusinesses.length} businesses with details`);
      
      if (progressCallback) {
        progressCallback(95);
      }
      
      return detailedBusinesses;
      
    } catch (error) {
      console.error('❌ Error in extraction:', error);
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  async extractSingleBusinessDetails(businessInfo, keyword, city) {
    try {
      console.log(`🔍 Clicking on business "${businessInfo.name}" (index ${businessInfo.elementIndex})`);
      
      // Cliquer sur le business pour ouvrir ses détails - approche ultra simple
      await this.page.evaluate((elementIndex, businessName) => {
        const businessSelectors = [
          '.hfpxzc',
          'div[role="main"] [jsaction*="pane.card.click"]',
          '[role="article"]'
        ];
        
        let clicked = false;
        for (const selector of businessSelectors) {
          const businessElements = document.querySelectorAll(selector);
          if (businessElements.length > elementIndex && businessElements[elementIndex]) {
            console.log(`Clicking on element ${elementIndex} with selector ${selector}`);
            businessElements[elementIndex].click();
            clicked = true;
            break;
          }
        }
        
        if (!clicked) {
          console.error(`Could not click on business ${elementIndex}: ${businessName}`);
        }
        
        return clicked;
      }, businessInfo.elementIndex, businessInfo.name);
      
      // Attendre que les détails se chargent avec vérification de changement de contenu
      console.log(`⏳ Waiting for details to load for "${businessInfo.name}"...`);
      
      // Attente plus longue avec vérification que le contenu change
      try {
        // D'abord une attente réseau
        await this.page.waitForNetworkIdle({ timeout: 8000, idleTime: 2000 });
        console.log(`✅ Network is idle for "${businessInfo.name}".`);
      } catch (e) {
        console.warn(`⚠️ Timed out waiting for network idle for "${businessInfo.name}".`);
      }
      
      // Attente supplémentaire pour laisser le temps au panneau de se mettre à jour
      await this.randomDelay(6000, 8000);
      console.log(`⏳ Additional delay completed for "${businessInfo.name}".`);
      
      // Extraire toutes les informations détaillées
      const businessDetails = await this.page.evaluate((keyword, city, baseName) => {
        const business = {
          search_keyword: keyword,
          city: city,
          name: baseName, // Utiliser le nom de la liste comme base
          category: null,
          rating: null,
          address: null,
          phone: null,
          email: null,
          website_url: null,
          has_website: false,
          google_maps_url: window.location.href,
          google_maps_id: null,
          image_url: null
        };
        
        try {
          // Nom - Essayer d'abord de trouver le nom dans le panneau de détails
          let detailName = null;
          
          // Sélecteurs pour le nom dans le panneau de détails (ordre de priorité) - Version étendue 2025
          const nameSelectors = [
            'h1[data-attrid="title"]',
            '.x3AX1-LfntMc-header-title-title',
            '.DUwDvf.fontHeadlineLarge', 
            '.qBF1Pd.fontHeadlineSmall',
            'h1.fontHeadlineLarge',
            'h1.fontHeadlineSmall',
            'h1',
            '.fontHeadlineLarge',
            '.fontHeadlineSmall',
            '[data-attrid*="title"] h1',
            'div[role="main"] h1',
            'section h1',
            '.section-hero-header-title h1',
            '.section-hero-header-title',
            '[aria-level="1"]',
            'div[jsaction*="pane"] h1',
            'div[class*="title"] h1',
            'div[class*="header"] h1'
          ];
          
          console.log('🔍 Searching for business name in detail panel...');
          console.log('📄 Page title:', document.title);
          console.log('🔗 Page URL:', window.location.href);
          console.log('� Base name from list:', baseName);
          
          for (const selector of nameSelectors) {
            try {
              const nameEl = document.querySelector(selector);
              if (nameEl && nameEl.textContent.trim()) {
                const name = nameEl.textContent.trim();
                console.log(`🔍 Checking selector "${selector}": "${name}"`);
                
                if (name !== 'Résultats' && 
                    name !== 'Results' &&
                    name !== 'Google Maps' &&
                    name.length > 2 &&
                    name.length < 100 &&
                    !name.includes('Directions') &&
                    !name.includes('Itinéraire')) {
                  detailName = name;
                  console.log(`✅ Found detail name: "${detailName}" using selector: ${selector}`);
                  break;
                }
              } else {
                console.log(`❌ Selector "${selector}": no element or empty text`);
              }
            } catch (e) {
              console.log(`❌ Error with selector ${selector}:`, e.message);
            }
          }
          
          // FORCER L'UTILISATION DU NOM DE LA LISTE UNIQUEMENT
          // Le panneau de détails ne se met pas à jour assez rapidement, créant de la confusion
          business.name = baseName;
          console.log(`✅ FORCED using base name from list: "${business.name}" (ignoring detail panel name: "${detailName || 'none found'}")`);
          
          // Vérification de sécurité : si le nom de la liste est invalide, on utilise le détail
          if (!baseName || baseName.length < 3 || baseName === 'Résultats' || baseName === 'Results') {
            if (detailName && detailName.length > 2) {
              business.name = detailName;
              console.log(`⚠️ Base name invalid, using detail name: "${business.name}"`);
            }
          }
          
          // Image principale (recherche étendue avec nouveaux sélecteurs 2025)
          const imageSelectors = [
            'button[data-value="Photo"] img',
            '[data-attrid="kc:/location:media"] img',
            'img[src*="googleusercontent.com"]:not([src*="avatar"]):not([src*="icon"])',
            'img[src*="maps.googleapis.com"]',
            'img[data-src*="googleusercontent.com"]',
            '.section-hero-header-image img',
            '.gallery img',
            '[role="img"] img',
            'img[alt]:not([alt=""]):not([alt*="Google"])',
            'img[width]:not([width="16"]):not([width="24"])',
            'div[style*="background-image"] img'
          ];
          
          for (const selector of imageSelectors) {
            const imgEl = document.querySelector(selector);
            if (imgEl && (imgEl.src || imgEl.dataset.src)) {
              const imgSrc = imgEl.src || imgEl.dataset.src;
              if (imgSrc && imgSrc.includes('http') && 
                  !imgSrc.includes('data:image') && 
                  !imgSrc.includes('avatar') && 
                  !imgSrc.includes('icon') &&
                  imgSrc.length > 50) {
                business.image_url = imgSrc;
                console.log(`✅ Found image: ${imgSrc} using selector: ${selector}`);
                break;
              }
            }
          }
          
          // Catégorie (sélecteurs mis à jour)
          const categorySelectors = [
            'button[data-value*="search_category"]',
            '.YhemCb',
            '.fontBodyMedium span',
            '[data-attrid*="category"] span',
            '[data-attrid*="business_type"] span',
            '.place-descriptor-container span',
            'div[data-value="Category"] span'
          ];
          
          for (const selector of categorySelectors) {
            const catEl = document.querySelector(selector);
            if (catEl && catEl.textContent.trim() && 
                !catEl.textContent.includes('★') && 
                !catEl.textContent.includes('€') &&
                catEl.textContent.trim().length > 2 &&
                catEl.textContent.trim().length < 50) {
              business.category = catEl.textContent.trim();
              console.log(`✅ Found category: "${business.category}" using selector: ${selector}`);
              break;
            }
          }
          
          // Rating (sélecteurs mis à jour)
          const ratingSelectors = [
            'span[aria-label*="star"]',
            '.Aq14fc',
            '.ceNzKf', 
            'span[role="img"][aria-label*="star"]',
            '[data-attrid*="star_score"] span',
            'div[data-value="Rating"] span',
            'span.fontBodyMedium:contains("★")',
            'span[title*="star"]'
          ];
          
          for (const selector of ratingSelectors) {
            const ratingEl = document.querySelector(selector);
            if (ratingEl) {
              const ratingText = ratingEl.textContent || ratingEl.getAttribute('aria-label') || ratingEl.getAttribute('title') || '';
              const ratingMatch = ratingText.match(/(\d+[.,]\d+)/);
              if (ratingMatch) {
                business.rating = parseFloat(ratingMatch[1].replace(',', '.'));
                console.log(`✅ Found rating: ${business.rating} using selector: ${selector}`);
                break;
              }
            }
          }
          
          // Adresse (sélecteurs mis à jour)
          const addressSelectors = [
            'button[data-value="Directions"] .fontBodyMedium',
            'button[data-value="Directions"] span',
            '[data-attrid*="address"] span',
            '.Io6YTe',
            'div[data-value="Address"] span',
            'button[aria-label*="Address"] span',
            'span[data-item-id*="address"]',
            '.rogA2c'
          ];
          
          for (const selector of addressSelectors) {
            const addrEl = document.querySelector(selector);
            if (addrEl && addrEl.textContent.trim() && addrEl.textContent.trim().length > 5) {
              business.address = addrEl.textContent.trim();
              console.log(`✅ Found address: "${business.address}" using selector: ${selector}`);
              break;
            }
          }
          
          // Téléphone (sélecteurs mis à jour et recherche étendue)
          const phoneSelectors = [
            'button[data-value^="tel:"]',
            'a[href^="tel:"]',
            'button[aria-label*="Call"]',
            'button[aria-label*="phone" i]',
            'button[aria-label*="téléphone" i]',
            'div[data-value="Phone"] button',
            'span[data-item-id*="phone"]',
            '[data-attrid*="phone"] span',
            'button[jsaction*="phone"]',
            '.rogA2c[data-value^="tel:"]'
          ];
          
          for (const selector of phoneSelectors) {
            const phoneEl = document.querySelector(selector);
            if (phoneEl) {
              let phone = phoneEl.getAttribute('data-value') || 
                          phoneEl.getAttribute('href') || 
                          phoneEl.textContent || 
                          phoneEl.getAttribute('aria-label');
              if (phone) {
                if (phone.includes('tel:')) {
                  phone = phone.replace('tel:', '');
                }
                // Extraire le numéro de téléphone du texte
                const phoneMatch = phone.match(/[\d\+\-\s\(\)\.]{8,}/);
                if (phoneMatch && phoneMatch[0].replace(/[\s\-\(\)\.]/g, '').length >= 8) {
                  business.phone = phoneMatch[0].trim();
                  console.log(`✅ Found phone: "${business.phone}" using selector: ${selector}`);
                  break;
                }
              }
            }
          }
          
          // Si pas de téléphone trouvé, chercher dans le texte
          if (!business.phone) {
            const textContent = document.body.textContent || document.body.innerText || '';
            const phoneMatches = textContent.match(/(?:\+33|0)[1-9](?:[0-9]{8}|\s[0-9]{2}\s[0-9]{2}\s[0-9]{2}\s[0-9]{2})/g);
            if (phoneMatches && phoneMatches[0]) {
              business.phone = phoneMatches[0].trim();
            }
          }
          
          // Site web (sélecteurs mis à jour et recherche étendue)
          const websiteSelectors = [
            'a[data-value^="http"]:not([data-value*="google"]):not([data-value*="maps"])',
            'button[data-value^="http"]:not([data-value*="google"]):not([data-value*="maps"])',
            'a[href^="http"]:not([href*="google"]):not([href*="maps"]):not([href*="facebook"]):not([href*="instagram"]):not([href*="twitter"])',
            'div[data-value="Website"] a',
            'button[aria-label*="website" i]',
            'button[aria-label*="site" i]',
            '[data-attrid*="website"] a[href^="http"]',
            'span[data-item-id*="website"] a',
            '.rogA2c[data-value^="http"]'
          ];
          
          for (const selector of websiteSelectors) {
            const webEl = document.querySelector(selector);
            if (webEl) {
              let website = webEl.getAttribute('data-value') || 
                           webEl.getAttribute('href') || 
                           webEl.textContent;
              if (website && website.startsWith('http') && 
                  !website.includes('google.com') && 
                  !website.includes('maps') && 
                  !website.includes('facebook') &&
                  !website.includes('instagram') &&
                  !website.includes('twitter') &&
                  !website.includes('youtube')) {
                business.website_url = website;
                business.has_website = true;
                console.log(`✅ Found website: "${website}" using selector: ${selector}`);
                break;
              }
            }
          }
          
          // Email (sélecteurs mis à jour et recherche avancée)
          const emailSelectors = [
            'a[href^="mailto:"]',
            'button[data-value^="mailto:"]',
            'div[data-value="Email"] a',
            'span[data-item-id*="email"] a',
            '[data-attrid*="email"] a',
            'button[aria-label*="email" i]',
            '.rogA2c[data-value^="mailto:"]'
          ];
          
          for (const selector of emailSelectors) {
            const emailEl = document.querySelector(selector);
            if (emailEl) {
              let email = emailEl.getAttribute('href') || 
                         emailEl.getAttribute('data-value') || 
                         emailEl.textContent;
              if (email && email.includes('mailto:')) {
                email = email.replace('mailto:', '');
              }
              if (email && email.includes('@') && email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                business.email = email.trim();
                console.log(`✅ Found email: "${business.email}" using selector: ${selector}`);
                break;
              }
            }
          }
          
          // Si pas d'email trouvé, chercher dans tout le texte de la page
          if (!business.email) {
            const textContent = document.body.textContent || document.body.innerText || '';
            const emailMatches = textContent.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
            if (emailMatches) {
              for (const emailMatch of emailMatches) {
                // Filtrer les emails génériques/inutiles
                if (!emailMatch.includes('example') && 
                    !emailMatch.includes('test') && 
                    !emailMatch.includes('google') &&
                    !emailMatch.includes('maps') &&
                    !emailMatch.includes('noreply')) {
                  business.email = emailMatch;
                  break;
                }
              }
            }
          }
          
          // Google Maps ID depuis l'URL
          if (business.google_maps_url) {
            const placeMatch = business.google_maps_url.match(/\/maps\/place\/([^\/\?]+)/);
            if (placeMatch) {
              business.google_maps_id = decodeURIComponent(placeMatch[1]);
            }
          }
          
        } catch (error) {
          console.error('Error extracting business details:', error);
        }
        
        return business;
        
      }, keyword, city, businessInfo.name); // Passer le nom de la liste
      
      return businessDetails;
      
    } catch (error) {
      console.error('Error in extractSingleBusinessDetails:', error);
      return null;
    }
  }
}
