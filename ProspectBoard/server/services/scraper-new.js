import puppeteer from 'puppeteer';

export class GoogleMapsScraper {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = {
      headless: false, // Mode visible pour debug
      timeout: options.timeout || 60000,
      maxRetries: options.maxRetries || 3,
      ...options
    };
  }

  async init() {
    try {
      console.log('🚀 Initializing browser...');
      
      this.browser = await puppeteer.launch({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
          '--disable-extensions',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-infobars',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        defaultViewport: null,
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

        // Gérer les cookies
        try {
          const cookieButtons = [
            'button[aria-label*="Accept"]',
            'button[aria-label*="Accepter"]', 
            'button:has-text("Accept all")',
            'button:has-text("Tout accepter")',
            '#L2AGLb'
          ];

          for (const selector of cookieButtons) {
            try {
              await this.page.waitForSelector(selector, { timeout: 2000 });
              await this.page.click(selector);
              console.log('✅ Cookies accepted');
              await this.randomDelay(2000, 3000);
              break;
            } catch (e) {
              continue;
            }
          }
        } catch (e) {
          console.log('ℹ️ No cookie banner found');
        }

        if (progressCallback) progressCallback(30);

        // Attendre les résultats - méthode moderne
        console.log('🔍 Looking for search results...');
        
        let resultsFound = false;
        const resultWaitSelectors = [
          'div[role="main"] [jsaction*="pane.card.click"]',
          'a[data-value="Directions"]',
          '[role="article"]', 
          '.hfpxzc',
          'div[data-result-index]',
          '.Nv2PK',
          '.m6QErb'
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

        if (!resultsFound) {
          throw new Error('No search results found on page');
        }

        if (progressCallback) progressCallback(50);

        // Scroll pour charger plus de résultats
        await this.scrollToLoadResults(maxResults, progressCallback);
        
        // Extraire les données
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
      
      const businesses = await this.page.evaluate((keyword, city, maxResults) => {
        const results = [];
        
        // Sélecteurs pour les éléments business Google Maps 2024
        const businessSelectors = [
          'div[role="main"] [jsaction*="pane.card.click"]',
          'a[data-value="Directions"]',
          '[role="article"]',
          '.hfpxzc',
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
        
        if (businessElements.length === 0) {
          // Fallback: chercher tous les liens vers des places
          businessElements = document.querySelectorAll('a[href*="/maps/place/"]');
        }
        
        // Traiter chaque élément
        for (let i = 0; i < Math.min(businessElements.length, maxResults); i++) {
          const element = businessElements[i];
          
          try {
            const business = {
              search_keyword: keyword,
              city: city,
              name: null,
              category: null,
              rating: null,
              address: null,
              phone: null,
              email: null,
              website_url: null,
              has_website: false,
              google_maps_url: null,
              google_maps_id: null,
              image_url: null
            };
            
            // Extraction du nom - plusieurs méthodes
            const nameSelectors = [
              '.fontHeadlineSmall',
              '.fontHeadlineMedium', 
              '.qBF1Pd',
              '.DUwDvf',
              'h3',
              '[role="img"][aria-label]',
              '.fontBodyMedium'
            ];
            
            for (const selector of nameSelectors) {
              const nameEl = element.querySelector(selector);
              if (nameEl && nameEl.textContent.trim()) {
                business.name = nameEl.textContent.trim();
                break;
              }
            }
            
            // Fallback nom depuis aria-label
            if (!business.name && element.getAttribute('aria-label')) {
              business.name = element.getAttribute('aria-label').split(',')[0].trim();
            }
            
            // Fallback nom depuis le texte de l'élément
            if (!business.name && element.textContent) {
              const text = element.textContent.trim();
              if (text && text.length > 2) {
                business.name = text.split('\n')[0].trim();
              }
            }
            
            // URL Google Maps
            if (element.href) {
              business.google_maps_url = element.href;
            } else {
              const linkEl = element.querySelector('a[href*="maps"]');
              if (linkEl) business.google_maps_url = linkEl.href;
            }
            
            // ID Google Maps depuis l'URL
            if (business.google_maps_url) {
              const placeMatch = business.google_maps_url.match(/\/maps\/place\/([^\/\?]+)/);
              if (placeMatch) {
                business.google_maps_id = decodeURIComponent(placeMatch[1]);
              }
            }
            
            // Adresse
            const addressSelectors = [
              '.W4Efsd:last-child .fontBodyMedium',
              '.W4Efsd .fontBodySmall',
              '.fontBodySmall',
              '.Io6YTe'
            ];
            
            for (const selector of addressSelectors) {
              const addrEl = element.querySelector(selector);
              if (addrEl && addrEl.textContent.trim() && 
                  !addrEl.textContent.includes('★') && 
                  !addrEl.textContent.includes('€')) {
                business.address = addrEl.textContent.trim();
                break;
              }
            }
            
            // Rating
            const ratingSelectors = [
              '.MW4etd',
              '[role="img"][aria-label*="star"]',
              '.fontBodySmall [aria-label*="star"]'
            ];
            
            for (const selector of ratingSelectors) {
              const ratingEl = element.querySelector(selector);
              if (ratingEl) {
                const ratingText = ratingEl.textContent || ratingEl.getAttribute('aria-label') || '';
                const ratingMatch = ratingText.match(/(\d+[.,]\d+)/);
                if (ratingMatch) {
                  business.rating = parseFloat(ratingMatch[1].replace(',', '.'));
                  break;
                }
              }
            }
            
            // Catégorie
            const categorySelectors = [
              '.W4Efsd:first-child .fontBodyMedium',
              '.DkEaL',
              '.fontBodySmall:not([aria-label*="star"])'
            ];
            
            for (const selector of categorySelectors) {
              const catEl = element.querySelector(selector);
              if (catEl && catEl.textContent.trim() && 
                  !catEl.textContent.includes('★') && 
                  !catEl.textContent.includes('€') &&
                  catEl.textContent.trim().length < 50) {
                business.category = catEl.textContent.trim();
                break;
              }
            }
            
            // Ajouter uniquement si on a un nom valide
            if (business.name && business.name.length > 2) {
              results.push(business);
            }
            
          } catch (error) {
            console.error(`Error processing business ${i}:`, error);
          }
        }
        
        return results;
        
      }, keyword, city, maxResults);
      
      console.log(`📊 Extracted ${businesses.length} businesses from page`);
      
      // Progress update
      if (progressCallback) {
        progressCallback(95);
      }
      
      return businesses;
      
    } catch (error) {
      console.error('❌ Error in extraction:', error);
      
      // Méthode de fallback très simple
      console.log('🔄 Trying simple fallback extraction...');
      try {
        const fallbackBusinesses = await this.page.evaluate((keyword, city) => {
          const results = [];
          const links = document.querySelectorAll('a[href*="/maps/place/"]');
          
          links.forEach(link => {
            const text = link.textContent.trim();
            if (text && text.length > 3) {
              results.push({
                name: text.split('\n')[0].trim(),
                google_maps_url: link.href,
                google_maps_id: link.href.split('/maps/place/')[1]?.split('/')[0] || null,
                search_keyword: keyword,
                city: city,
                category: null,
                rating: null,
                address: null,
                phone: null,
                email: null,
                website_url: null,
                has_website: false,
                image_url: null
              });
            }
          });
          
          return results.slice(0, 10);
        }, keyword, city);
        
        console.log(`📊 Fallback extraction found ${fallbackBusinesses.length} businesses`);
        return fallbackBusinesses;
        
      } catch (fallbackError) {
        throw new Error(`All extraction methods failed: ${error.message}`);
      }
    }
  }
}
