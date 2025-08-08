import express from 'express';

import { GoogleMapsScraper } from '../services/scraper.js';
import { runQuery, getAllRows, getRow } from '../database/init.js';

const router = express.Router();

// Get scraping sessions history
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await getAllRows(
      `SELECT id, keyword, city, radius, total_found, new_prospects, status, 
              error_message, started_at, completed_at 
       FROM scraping_sessions 
       ORDER BY started_at DESC 
       LIMIT 20`
    );

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching scraping sessions:', error);
    res.status(500).json({ error: 'Failed to fetch scraping sessions' });
  }
});

// Start new scraping session
router.post('/start', async (req, res) => {
  try {
    const { keyword, city, radius = 10, maxResults = 20 } = req.body;

    if (!keyword || !city) {
      return res.status(400).json({ error: 'Keyword and city are required' });
    }

    // Create scraping session
    const sessionResult = await runQuery(
      `INSERT INTO scraping_sessions (keyword, city, radius, status) 
       VALUES (?, ?, ?, 'running')`,
      [keyword, city, radius]
    );

    const sessionId = sessionResult.id;

    // Start scraping in background
    scrapeInBackground(sessionId, keyword, city, maxResults, radius);

    res.json({
      message: 'Scraping started',
      sessionId,
      keyword,
      city,
      radius,
      maxResults
    });
  } catch (error) {
    console.error('Error starting scraping:', error);
    res.status(500).json({ error: 'Failed to start scraping' });
  }
});

// Get scraping session status
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await getRow(
      `SELECT id, keyword, city, radius, total_found, new_prospects, status, 
              error_message, started_at, completed_at, progress_percentage, current_step
       FROM scraping_sessions 
       WHERE id = ?`,
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Scraping session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching scraping session:', error);
    res.status(500).json({ error: 'Failed to fetch scraping session' });
  }
});

// Server-Sent Events for real-time progress
router.get('/sessions/:sessionId/progress', async (req, res) => {
  const { sessionId } = req.params;
  
  // Set headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial data
  try {
    const session = await getRow(
      `SELECT id, keyword, city, radius, total_found, new_prospects, status, 
              error_message, started_at, completed_at, progress_percentage, current_step
       FROM scraping_sessions 
       WHERE id = ?`,
      [sessionId]
    );

    if (session) {
      res.write(`data: ${JSON.stringify(session)}\n\n`);
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: 'Session not found' })}\n\n`);
  }

  // Poll for updates every 2 seconds
  const intervalId = setInterval(async () => {
    try {
      const session = await getRow(
        `SELECT id, keyword, city, radius, total_found, new_prospects, status, 
                error_message, started_at, completed_at, progress_percentage, current_step
         FROM scraping_sessions 
         WHERE id = ?`,
        [sessionId]
      );

      if (session) {
        res.write(`data: ${JSON.stringify(session)}\n\n`);
        
        // Stop polling if session is completed or failed
        if (session.status === 'completed' || session.status === 'failed') {
          clearInterval(intervalId);
          res.end();
        }
      }
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: 'Failed to fetch session' })}\n\n`);
    }
  }, 2000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(intervalId);
  });
});

// Background scraping function
async function scrapeInBackground(sessionId, keyword, city, maxResults, radius = 10) {
  const scraper = new GoogleMapsScraper();
  
  try {
    console.log(`🚀 Starting scraping session ${sessionId}: ${keyword} in ${city}`);
    
    // Update progress: Initializing
    await updateSessionProgress(sessionId, 5, 'Initializing browser...');
    
    // Scrape businesses with progress tracking
    await updateSessionProgress(sessionId, 10, 'Searching on Google Maps...');
    
    const businesses = await scraper.scrapeBusinesses(keyword, city, maxResults, (progress) => {
      // Update progress during scraping (10% to 70%)
      const scrapingProgress = Math.min(70, 10 + (progress * 0.6));
      updateSessionProgress(sessionId, scrapingProgress, `Scraping in progress... ${Math.round(progress)}%`);
    }, radius);
    
    await updateSessionProgress(sessionId, 75, 'Processing results...');
    
    let newProspectsCount = 0;
    const totalBusinesses = businesses.length;
    
    // Process each business with progress
    for (let i = 0; i < businesses.length; i++) {
      const business = businesses[i];
      const processingProgress = 75 + (i / totalBusinesses) * 20; // 75% to 95%
      
      await updateSessionProgress(sessionId, processingProgress, `Processing ${business.name}...`);
      
      try {
        // Check if prospect already exists (by google_maps_id or name + city)
        const existingProspect = await getRow(
          `SELECT id, status FROM prospects 
           WHERE (google_maps_id = ? OR (name = ? AND city = ?))`,
          [business.google_maps_id, business.name, business.city]
        );

        if (existingProspect) {
          // If prospect was deleted, reactivate it
          if (existingProspect.status === 'deleted') {
            await runQuery(
              `UPDATE prospects 
               SET status = 'active', updated_at = CURRENT_TIMESTAMP 
               WHERE id = ?`,
              [existingProspect.id]
            );
            newProspectsCount++;
            console.log(`🔄 Reactivated prospect: ${business.name}`);
          }
          continue;
        }

        // Check if prospect is in any playlist (shouldn't appear again)
        const inPlaylist = await getRow(
          `SELECT pp.id FROM prospect_playlists pp 
           JOIN prospects p ON p.id = pp.prospect_id 
           WHERE p.google_maps_id = ?`,
          [business.google_maps_id]
        );

        if (inPlaylist) {
          console.log(`⏭️  Skipping prospect in playlist: ${business.name}`);
          continue;
        }

        // Add new prospect
        await runQuery(
          `INSERT INTO prospects 
           (name, category, rating, phone, email, website_url, has_website, 
            google_maps_url, address, image_url, city, search_keyword, 
            google_maps_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            business.name,
            business.category,
            business.rating,
            business.phone,
            business.email,
            business.website_url,
            business.has_website,
            business.google_maps_url,
            business.address,
            business.image_url,
            business.city,
            business.search_keyword,
            business.google_maps_id
          ]
        );

        newProspectsCount++;
        console.log(`✅ Added new prospect: ${business.name}`);
        
      } catch (prospectError) {
        console.error(`Error processing prospect ${business.name}:`, prospectError);
      }
    }

    // Final update: completed
    await updateSessionProgress(sessionId, 100, 'Completed successfully!');

    // Update scraping session as completed
    await runQuery(
      `UPDATE scraping_sessions 
       SET status = 'completed', total_found = ?, new_prospects = ?, completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [businesses.length, newProspectsCount, sessionId]
    );

    console.log(`✅ Scraping session ${sessionId} completed: ${newProspectsCount} new prospects`);
    
  } catch (error) {
    console.error(`❌ Scraping session ${sessionId} failed:`, error);
    
    // Update scraping session as failed
    await updateSessionProgress(sessionId, 0, `Error: ${error.message}`);
    await runQuery(
      `UPDATE scraping_sessions 
       SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [error.message, sessionId]
    );
  } finally {
    await scraper.close();
  }
}

// Helper function to update session progress
async function updateSessionProgress(sessionId, percentage, step) {
  try {
    await runQuery(
      `UPDATE scraping_sessions 
       SET progress_percentage = ?, current_step = ? 
       WHERE id = ?`,
      [Math.round(percentage), step, sessionId]
    );
  } catch (error) {
    console.error('Error updating session progress:', error);
  }
}

export default router;
