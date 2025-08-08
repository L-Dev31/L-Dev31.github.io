import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import sqlite3 from 'sqlite3';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

console.log('\n🎯 Starting Seal the Deal v2.0...\n');

// Database initialization
const db = new sqlite3.Database('database.db');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    google_maps_url TEXT,
    image_url TEXT,
    rating REAL,
    reviews_count INTEGER,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS playlist_prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    prospect_id INTEGER NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, prospect_id)
  )`);
});

console.log('✅ Database initialized successfully');

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Prospects Routes
app.get('/api/prospects', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = 'SELECT * FROM prospects';
  let countQuery = 'SELECT COUNT(*) as count FROM prospects';
  let params = [];

  if (search) {
    query += ' WHERE name LIKE ? OR address LIKE ? OR email LIKE ?';
    countQuery += ' WHERE name LIKE ? OR address LIKE ? OR email LIKE ?';
    params = [`%${search}%`, `%${search}%`, `%${search}%`];
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      console.error('❌ Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    db.all(query, [...params, limit, offset], (err, prospects) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        prospects,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(countResult.count / limit),
          totalProspects: countResult.count,
          limit
        }
      });
    });
  });
});

app.get('/api/prospects/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM prospects WHERE id = ?', [id], (err, prospect) => {
    if (err) {
      console.error('❌ Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    
    res.json(prospect);
  });
});

app.delete('/api/prospects/:id', (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️ Attempting to delete prospect with ID: ${id}`);
  
  // First check if prospect exists in any playlists
  db.get('SELECT COUNT(*) as count FROM playlist_prospects WHERE prospect_id = ?', [id], (err, result) => {
    if (err) {
      console.error('❌ Database error checking playlists:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (result.count > 0) {
      console.log(`⚠️ Prospect ${id} is in ${result.count} playlist(s), removing from playlists first`);
      // Remove from all playlists first
      db.run('DELETE FROM playlist_prospects WHERE prospect_id = ?', [id], (err) => {
        if (err) {
          console.error('❌ Error removing from playlists:', err);
          return res.status(500).json({ error: 'Error removing from playlists' });
        }
        
        // Now delete the prospect
        deleteProspect(id, res);
      });
    } else {
      // Delete the prospect directly
      deleteProspect(id, res);
    }
  });
});

function deleteProspect(id, res) {
  db.run('DELETE FROM prospects WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('❌ Database error deleting prospect:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      console.log(`⚠️ Prospect ${id} not found`);
      return res.status(404).json({ error: 'Prospect not found' });
    }
    
    console.log(`✅ Prospect ${id} deleted successfully`);
    res.json({ 
      success: true, 
      message: 'Prospect deleted successfully',
      deletedId: id 
    });
  });
}

// Playlists Routes
app.get('/api/playlists', (req, res) => {
  db.all('SELECT * FROM playlists ORDER BY created_at DESC', [], (err, playlists) => {
    if (err) {
      console.error('❌ Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(playlists);
  });
});

app.post('/api/playlists', (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  db.run('INSERT INTO playlists (name, description) VALUES (?, ?)', [name, description], function(err) {
    if (err) {
      console.error('❌ Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ id: this.lastID, name, description });
  });
});

// Scraping Routes
app.post('/api/scraping/start', async (req, res) => {
  const { query, maxResults = 20 } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  
  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    sendEvent({ type: 'progress', message: 'Initializing browser...', progress: 0 });
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    sendEvent({ type: 'progress', message: 'Navigating to Google Maps...', progress: 10 });
    
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    
    // Wait for search results
    await page.waitForSelector('[data-value="Search results"]', { timeout: 10000 });
    
    sendEvent({ type: 'progress', message: 'Extracting business information...', progress: 30 });
    
    const prospects = [];
    let processed = 0;
    
    // Get all business listings
    const businesses = await page.$$('[data-result-index]');
    const totalBusinesses = Math.min(businesses.length, maxResults);
    
    for (let i = 0; i < totalBusinesses; i++) {
      try {
        const business = businesses[i];
        await business.click();
        await page.waitForTimeout(2000); // Wait for details to load
        
        // Extract business data
        const businessData = await page.evaluate(() => {
          const nameElement = document.querySelector('h1[data-attrid="title"]') || 
                             document.querySelector('[data-attrid="title"] span') ||
                             document.querySelector('h1');
          
          const addressElement = document.querySelector('[data-item-id="address"] .rogA2c') ||
                                document.querySelector('[data-attrid="kc:/location/location:address"]');
          
          const phoneElement = document.querySelector('[data-item-id*="phone"] .rogA2c') ||
                              document.querySelector('[aria-label*="phone" i]');
          
          const websiteElement = document.querySelector('[data-item-id="authority"] a') ||
                                document.querySelector('a[href*="http"]:not([href*="google"])');
          
          const ratingElement = document.querySelector('[data-attrid="kc:/collection/knowledge_panels/local_reviewable:star_score"]') ||
                               document.querySelector('.F7nice span');
          
          return {
            name: nameElement?.textContent?.trim() || '',
            address: addressElement?.textContent?.trim() || '',
            phone: phoneElement?.textContent?.trim() || '',
            website: websiteElement?.href || '',
            rating: ratingElement?.textContent?.trim() || '',
            google_maps_url: window.location.href
          };
        });
        
        if (businessData.name) {
          // Save to database
          db.run(`INSERT INTO prospects (name, address, phone, website, rating, google_maps_url) 
                  VALUES (?, ?, ?, ?, ?, ?)`, 
                 [businessData.name, businessData.address, businessData.phone, 
                  businessData.website, businessData.rating, businessData.google_maps_url], 
                 function(err) {
                   if (!err) {
                     prospects.push({ id: this.lastID, ...businessData });
                   }
                 });
        }
        
        processed++;
        const progress = 30 + (processed / totalBusinesses) * 60;
        sendEvent({ 
          type: 'progress', 
          message: `Processing business ${processed}/${totalBusinesses}...`, 
          progress: Math.round(progress) 
        });
        
      } catch (error) {
        console.error('Error processing business:', error);
      }
    }
    
    await browser.close();
    
    sendEvent({ 
      type: 'complete', 
      message: `Scraping completed! Found ${prospects.length} prospects.`, 
      progress: 100,
      results: prospects
    });
    
  } catch (error) {
    console.error('❌ Scraping error:', error);
    sendEvent({ 
      type: 'error', 
      message: 'An error occurred during scraping', 
      error: error.message 
    });
  }
  
  res.end();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Seal the Deal API v2.0',
    timestamp: new Date().toISOString()
  });
});

// Stats endpoints
app.get('/api/prospects/stats', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM prospects', [], (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({
      total: result.total,
      hidden: 0,
      emailsSent: 0
    });
  });
});

app.get('/api/playlists/stats', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM playlists', [], (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({
      total: result.total
    });
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Seal the Deal API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log('🎯 Ready to seal some deals!\n');
});
