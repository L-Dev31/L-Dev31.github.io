import puppeteer from 'puppeteer';

class GoogleMapsScraper {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = {
      headless: false, // Mode visible pour debugging
      timeout: 60000,
      maxRetries: 3,
      scrollPause: 2000,
      ...options
    };
  }

  async init() {
    try {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--window-size=1280,800'
        ],
        defaultViewport: null,
        timeout: this.options.timeout
      });

      this.page = await this.browser.newPage();
      
      // Configuration du navigateur pour éviter les détections
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      
      // Gérer JavaScript global
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        
        window.chrome = {
          runtime: {},
        };
        
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
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
              'button[data-ved]',
              'form[action*="consent"] button[type="submit"]',
              '#L2AGLb',
              'button[jsname="b3VHJd"]',
              'button[jsname="tHlp8d"]'
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

        if (progressCallback) progressCallback(20);

        // Attendre que les résultats se chargent et chercher les sélecteurs
        console.log('🔍 Looking for search results...');
        const businessSelectors = [
          '[data-result-index]',
          '[role="feed"] [role="article"]',
          '[data-value="Directions"]',
          '.Nv2PK',
          '.hfpxzc',
          'div[jsaction*="pane.card.click"]'
        ];

        let businessElements = null;
        let usedSelector = null;

        for (const selector of businessSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 10000 });
            businessElements = await this.page.$$(selector);
            if (businessElements.length > 0) {
              usedSelector = selector;
              console.log(`✅ Found ${businessElements.length} results with selector: ${selector}`);
              break;
            }
          } catch (e) {
            console.log(`❌ Selector ${selector} failed`);
            continue;
          }
        }

        if (!businessElements || businessElements.length === 0) {
          throw new Error('No business results found');
        }

        if (progressCallback) progressCallback(30);

        // Scroll pour charger plus de résultats
        console.log('📜 Scrolling to load more results...');
        await this.scrollToLoadResults(maxResults, progressCallback);

        if (progressCallback) progressCallback(40);

        // Extraire les données des businesses
        const results = await this.extractBusinessData(keyword, city, maxResults, progressCallback);

        if (progressCallback) progressCallback(100);

        console.log(`✅ Successfully scraped ${results.length} businesses`);
        return results;

      } catch (error) {
        attempts++;
        console.error(`❌ Attempt ${attempts} failed:`, error.message);
        
        if (attempts >= this.options.maxRetries) {
          console.error(`❌ Max retries (${this.options.maxRetries}) reached. Final attempt failed.`);
          
          // Essayer la méthode de fallback
          try {
            console.log('🔄 Trying fallback method...');
            return await this.fallbackMethod(keyword, city, maxResults, progressCallback);
          } catch (fallbackError) {
            console.error('❌ Fallback method also failed:', fallbackError.message);
            throw new Error(`Scraping failed after ${attempts} attempts. Last error: ${error.message}`);
          }
        }
        
        console.log(`🔄 Retrying in 5 seconds... (attempt ${attempts + 1}/${this.options.maxRetries})`);
        await this.randomDelay(5000, 7000);
      }
    }
  }

  async scrollToLoadResults(maxResults, progressCallback = null) {
    let previousCount = 0;
    let stableCount = 0;
    const maxScrolls = 10;
    let scrollCount = 0;

    while (scrollCount < maxScrolls) {
      // Compter les résultats actuels
      const currentCount = await this.page.evaluate(() => {
        const selectors = ['.Nv2PK', '.hfpxzc', '[data-result-index]'];
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) return elements.length;
        }
        return 0;
      });

      console.log(`📊 Currently loaded: ${currentCount} results`);

      if (currentCount >= maxResults) {
        console.log(`✅ Target reached: ${currentCount}/${maxResults} results`);
        break;
      }

      if (currentCount === previousCount) {
        stableCount++;
        if (stableCount >= 3) {
          console.log(`⚠️ No new results loaded after 3 attempts, stopping scroll`);
          break;
        }
      } else {
        stableCount = 0;
      }

      // Scroll down
      await this.page.evaluate(() => {
        const scrollContainer = document.querySelector('[role="main"]') || document.body;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });

      await this.randomDelay(2000, 3000);
      
      previousCount = currentCount;
      scrollCount++;
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
            
            // Extraction du nom améliorée
            const nameSelectors = [
              '.qBF1Pd.fontHeadlineSmall',
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
              // Prendre la première ligne qui ressemble à un nom de business
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
          const progress = 50 + (i / businessLinks.length) * 45;
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
            website_url: null,
            has_website: false,
            google_maps_url: businessInfo.url || `https://www.google.com/maps/search/${encodeURIComponent(businessInfo.name + ' ' + city)}`,
            google_maps_id: null,
            image_url: null
          });
        }
      }
      
      console.log(`📊 Extracted ${detailedBusinesses.length} businesses with details`);
      return detailedBusinesses;
      
    } catch (error) {
      console.error('❌ Error in extraction:', error);
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  async extractSingleBusinessDetails(businessInfo, keyword, city) {
    try {
      // Cliquer sur le business pour ouvrir ses détails
      await this.page.evaluate((elementIndex) => {
        const businessSelectors = [
          '.hfpxzc',
          'div[role="main"] [jsaction*="pane.card.click"]',
          'a[data-value="Directions"]',
          '[role="article"]'
        ];
        
        let businessElements = [];
        for (const selector of businessSelectors) {
          businessElements = document.querySelectorAll(selector);
          if (businessElements.length > elementIndex) {
            businessElements[elementIndex].click();
            break;
          }
        }
      }, businessInfo.elementIndex);
      
      // Attendre que les détails se chargent
      await this.randomDelay(3000, 5000);
      
      const business = await this.page.evaluate((baseName, keyword, city) => {
        const business = {
          search_keyword: keyword,
          city: city,
          name: baseName,
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
          // Nom (mise à jour si trouvé dans les détails)
          const nameSelectors = [
            'h1[data-attrid="title"]',
            'h1.fontHeadlineLarge', 
            'h1.fontHeadlineSmall',
            '.x3AX1-LfntMc-header-title-title',
            'h1',
            '.DUwDvf.fontHeadlineLarge',
            '.qBF1Pd.fontHeadlineSmall',
            '[data-value="title"]',
            '.section-hero-header-title-title',
            'span[jstcache="1006"]'
          ];
          
          for (const selector of nameSelectors) {
            const nameEl = document.querySelector(selector);
            if (nameEl && nameEl.textContent.trim()) {
              business.name = nameEl.textContent.trim();
              console.log(`✅ Updated name to: "${business.name}" using selector: ${selector}`);
              break;
            }
          }
          
          if (business.name === baseName) {
            console.log(`⚠️ Name not updated, keeping original: "${baseName}"`);
          }

          // Téléphone
          const phoneSelectors = [
            '[data-item-id="phone:tel:"] [role="img"] + div div',
            'button[data-value*="phone"] [role="img"] + div',
            '[data-value*="phone"] div',
            'a[href^="tel:"]',
            '.section-info-phone'
          ];
          
          for (const selector of phoneSelectors) {
            const phoneEl = document.querySelector(selector);
            if (phoneEl) {
              let phone = phoneEl.textContent || phoneEl.href;
              if (phone) {
                phone = phone.replace('tel:', '').trim();
                if (phone.length > 5) {
                  business.phone = phone;
                  break;
                }
              }
            }
          }

          // Site web
          const websiteSelectors = [
            '[data-item-id*="authority"] a',
            'button[data-value*="website"] a',
            '[data-value*="website"] a',
            'a[href^="http"]:not([href*="maps.google"])',
            '.section-info-website a'
          ];
          
          for (const selector of websiteSelectors) {
            const websiteEl = document.querySelector(selector);
            if (websiteEl && websiteEl.href) {
              if (!websiteEl.href.includes('maps.google') && !websiteEl.href.includes('facebook.com/tr')) {
                business.website_url = websiteEl.href;
                business.has_website = true;
                break;
              }
            }
          }

          // Image
          const imageSelectors = [
            'button[data-value="Photo"] img',
            '.wvLcL img',
            '[data-attrid="kc:/location:media"] img',
            'img[src*="googleusercontent.com"]:not([src*="avatar"])',
            '.section-hero-header-image img',
            '.section-hero img',
            'img[src*="maps.googleapis.com"]',
            '.gallery img'
          ];
          
          for (const selector of imageSelectors) {
            const imageEl = document.querySelector(selector);
            if (imageEl && imageEl.src && imageEl.src.includes('http')) {
              business.image_url = imageEl.src.split('=')[0] + '=k-no-';
              break;
            }
          }

          // Adresse
          const addressSelectors = [
            '[data-item-id="address"] .fontBodyMedium',
            'button[data-value*="directions"] [role="img"] + div',
            '[data-value*="directions"] div',
            '.section-info-address'
          ];
          
          for (const selector of addressSelectors) {
            const addressEl = document.querySelector(selector);
            if (addressEl && addressEl.textContent && addressEl.textContent.length > 10) {
              business.address = addressEl.textContent.trim();
              break;
            }
          }

          // Note
          const ratingSelectors = [
            '.F7nice',
            '[role="img"][aria-label*="star"]',
            '.section-star-display'
          ];
          
          for (const selector of ratingSelectors) {
            const ratingEl = document.querySelector(selector);
            if (ratingEl) {
              const ratingText = ratingEl.textContent || ratingEl.getAttribute('aria-label') || '';
              const match = ratingText.match(/(\d+[.,]\d+|\d+)/);
              if (match) {
                business.rating = parseFloat(match[1].replace(',', '.'));
                break;
              }
            }
          }

          return business;
        } catch (e) {
          console.error('Error extracting business details:', e);
          return business;
        }
      }, businessInfo.name, keyword, city);

      return business;
      
    } catch (error) {
      console.error('Error in extractSingleBusinessDetails:', error);
      throw error;
    }
  }

  async fallbackMethod(keyword, city, maxResults, progressCallback = null) {
    console.log('🔄 Using fallback extraction method...');
    
    try {
      const content = await this.page.content();
      console.log('📄 Page content length:', content.length);
      
      const businesses = await this.page.evaluate((keyword, city, maxResults) => {
        const results = [];
        
        console.log('🔍 Fallback: Looking for business data in page content...');
        
        // Chercher tous les éléments qui pourraient contenir des infos business
        const possibleSelectors = [
          '[role="article"]',
          '.section-result',
          '[data-cid]',
          'div[jsaction]',
          '.ugiz4pqJLAG__primary-text',
          '.fontHeadlineSmall'
        ];
        
        const foundElements = [];
        possibleSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          foundElements.push(...Array.from(elements));
        });
        
        console.log(`🔍 Found ${foundElements.length} potential business elements`);
        
        const processedNames = new Set();
        
        foundElements.slice(0, maxResults * 2).forEach((element, index) => {
          try {
            const text = element.textContent || '';
            const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 2);
            
            if (lines.length > 0) {
              const potentialName = lines[0];
              
              // Filtrer les noms valides
              if (potentialName.length > 3 && 
                  potentialName.length < 100 &&
                  !potentialName.includes('Google') &&
                  !potentialName.includes('Maps') &&
                  !processedNames.has(potentialName)) {
                
                processedNames.add(potentialName);
                
                results.push({
                  search_keyword: keyword,
                  city: city,
                  name: potentialName,
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
                });
                
                console.log(`✅ Fallback found: ${potentialName}`);
              }
            }
          } catch (e) {
            // Continue avec l'élément suivant
          }
        });
        
        return results.slice(0, maxResults);
      }, keyword, city, maxResults);
      
      if (businesses.length > 0) {
        console.log(`✅ Fallback method found ${businesses.length} businesses`);
        return businesses;
      } else {
        throw new Error('No businesses found with fallback method');
      }
      
    } catch (error) {
      console.error('❌ Fallback method failed:', error);
      throw error;
    }
  }
}

export default GoogleMapsScraper;
