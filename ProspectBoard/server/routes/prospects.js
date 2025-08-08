import express from 'express';
import { runQuery, getAllRows, getRow } from '../database/init.js';

const router = express.Router();

// Get all prospects (not in playlists)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, category, hasWebsite, status = 'active' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['p.status = ?'];
    let queryParams = [status];

    // Exclude prospects that are in playlists
    whereConditions.push(`p.id NOT IN (
      SELECT pp.prospect_id FROM prospect_playlists pp 
      JOIN playlists pl ON pl.id = pp.playlist_id
    )`);

    // Add search filter
    if (search) {
      whereConditions.push('(p.name LIKE ? OR p.category LIKE ? OR p.city LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Add category filter
    if (category) {
      whereConditions.push('p.category LIKE ?');
      queryParams.push(`%${category}%`);
    }

    // Add website filter
    if (hasWebsite !== undefined) {
      whereConditions.push('p.has_website = ?');
      queryParams.push(hasWebsite === 'true' ? 1 : 0);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get prospects
    const prospects = await getAllRows(
      `SELECT p.*, 
              COUNT(*) OVER() as total_count
       FROM prospects p
       WHERE ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const totalCount = prospects.length > 0 ? prospects[0].total_count : 0;

    // Remove total_count from individual records
    const cleanedProspects = prospects.map(({ total_count, ...prospect }) => prospect);

    res.json({
      prospects: cleanedProspects,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(totalCount / limit),
        total_count: totalCount,
        per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching prospects:', error);
    res.status(500).json({ error: 'Failed to fetch prospects' });
  }
});

// Get prospect statistics
router.get('/stats', async (req, res) => {
  try {
    // Total prospects
    const totalResult = await getRow(
      'SELECT COUNT(*) as count FROM prospects WHERE status = ?',
      ['active']
    );

    // Prospects with websites
    const withWebsiteResult = await getRow(
      'SELECT COUNT(*) as count FROM prospects WHERE status = ? AND has_website = 1',
      ['active']
    );

    // Prospects with email
    const withEmailResult = await getRow(
      'SELECT COUNT(*) as count FROM prospects WHERE status = ? AND email IS NOT NULL',
      ['active']
    );

    // Prospects with phone
    const withPhoneResult = await getRow(
      'SELECT COUNT(*) as count FROM prospects WHERE status = ? AND phone IS NOT NULL',
      ['active']
    );

    res.json({
      totalProspects: totalResult.count,
      withWebsite: withWebsiteResult.count,
      withEmail: withEmailResult.count,
      withPhone: withPhoneResult.count,
      hiddenProspects: 0,
      emailsSent: 0
    });
  } catch (error) {
    console.error('Error fetching prospect statistics:', error);
    res.status(500).json({ error: 'Failed to fetch prospect statistics' });
  }
});

// Get recent prospects
router.get('/recent', async (req, res) => {
  try {
    const recentProspects = await getAllRows(
      `SELECT id, name, category, rating, address, created_at
       FROM prospects 
       WHERE status = ?
       ORDER BY created_at DESC 
       LIMIT 10`,
      ['active']
    );

    res.json(recentProspects);
  } catch (error) {
    console.error('Error fetching recent prospects:', error);
    res.status(500).json({ error: 'Failed to fetch recent prospects' });
  }
});

// Get single prospect
router.get('/:id', async (req, res) => {
  try {
    const prospect = await getRow(
      'SELECT * FROM prospects WHERE id = ?',
      [req.params.id]
    );

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Get playlists this prospect is in
    const playlists = await getAllRows(
      `SELECT pl.id, pl.name, pl.color 
       FROM playlists pl
       JOIN prospect_playlists pp ON pp.playlist_id = pl.id
       WHERE pp.prospect_id = ?`,
      [prospect.id]
    );

    res.json({
      ...prospect,
      playlists
    });
  } catch (error) {
    console.error('Error fetching prospect:', error);
    res.status(500).json({ error: 'Failed to fetch prospect' });
  }
});

// Update prospect
router.put('/:id', async (req, res) => {
  try {
    const { name, category, phone, email, website_url, address } = req.body;
    
    // Verify prospect belongs to user
    const existingProspect = await getRow(
      'SELECT id FROM prospects WHERE id = ?',
      [req.params.id]
    );

    if (!existingProspect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    await runQuery(
      `UPDATE prospects 
       SET name = ?, category = ?, phone = ?, email = ?, website_url = ?, address = ?,
           has_website = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name,
        category, 
        phone,
        email,
        website_url,
        address,
        website_url ? 1 : 0,
        req.params.id
      ]
    );

    // Return updated prospect
    const updatedProspect = await getRow(
      'SELECT * FROM prospects WHERE id = ?',
      [req.params.id]
    );

    res.json(updatedProspect);
  } catch (error) {
    console.error('Error updating prospect:', error);
    res.status(500).json({ error: 'Failed to update prospect' });
  }
});

// Delete prospect (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    // Verify prospect belongs to user
    const existingProspect = await getRow(
      'SELECT id FROM prospects WHERE id = ?',
      [req.params.id]
    );

    if (!existingProspect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Remove from all playlists
    await runQuery(
      `DELETE FROM prospect_playlists 
       WHERE prospect_id = ?`,
      [req.params.id]
    );

    // Soft delete prospect
    await runQuery(
      'UPDATE prospects SET status = \'deleted\', updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.params.id]
    );

    res.json({ message: 'Prospect deleted successfully' });
  } catch (error) {
    console.error('Error deleting prospect:', error);
    res.status(500).json({ error: 'Failed to delete prospect' });
  }
});

// Add prospect to playlist
router.post('/:id/playlists/:playlistId', async (req, res) => {
  try {
    // Verify prospect belongs to user
    const prospect = await getRow(
      'SELECT id FROM prospects WHERE id = ?',
      [req.params.id]
    );

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Verify playlist belongs to user
    const playlist = await getRow(
      'SELECT id FROM playlists WHERE id = ?',
      [req.params.playlistId]
    );

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check if already in playlist
    const existing = await getRow(
      'SELECT id FROM prospect_playlists WHERE prospect_id = ? AND playlist_id = ?',
      [req.params.id, req.params.playlistId]
    );

    if (existing) {
      return res.status(400).json({ error: 'Prospect already in this playlist' });
    }

    // Add to playlist
    await runQuery(
      'INSERT INTO prospect_playlists (prospect_id, playlist_id) VALUES (?, ?)',
      [req.params.id, req.params.playlistId]
    );

    res.json({ message: 'Prospect added to playlist successfully' });
  } catch (error) {
    console.error('Error adding prospect to playlist:', error);
    res.status(500).json({ error: 'Failed to add prospect to playlist' });
  }
});

// Remove prospect from playlist
router.delete('/:id/playlists/:playlistId', async (req, res) => {
  try {
    // Verify prospect belongs to user
    const prospect = await getRow(
      'SELECT id FROM prospects WHERE id = ?',
      [req.params.id]
    );

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Remove from playlist
    const result = await runQuery(
      'DELETE FROM prospect_playlists WHERE prospect_id = ? AND playlist_id = ?',
      [req.params.id, req.params.playlistId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Prospect not found in this playlist' });
    }

    res.json({ message: 'Prospect removed from playlist successfully' });
  } catch (error) {
    console.error('Error removing prospect from playlist:', error);
    res.status(500).json({ error: 'Failed to remove prospect from playlist' });
  }
});

// Hide/Show prospect (move to/from hidden playlist)
router.patch('/:id/hide', async (req, res) => {
  try {
    const prospectId = req.params.id;

    // Check if prospect exists
    const prospect = await getRow(
      'SELECT id FROM prospects WHERE id = ? AND status = ?',
      [prospectId, 'active']
    );

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Get or create hidden playlist
    let hiddenPlaylist = await getRow(
      'SELECT id FROM playlists WHERE is_hidden = 1',
      []
    );

    if (!hiddenPlaylist) {
      const result = await runQuery(
        `INSERT INTO playlists (name, description, color, is_hidden) 
         VALUES ('Hidden', 'Prospects masqués temporairement', '#6B7280', 1)`,
        []
      );
      hiddenPlaylist = { id: result.lastID };
    }

    // Remove from all other playlists first
    await runQuery(
      `DELETE FROM prospect_playlists 
       WHERE prospect_id = ? AND playlist_id IN (
         SELECT id FROM playlists WHERE is_hidden = 0
       )`,
      [prospectId]
    );

    // Add to hidden playlist
    await runQuery(
      'INSERT OR IGNORE INTO prospect_playlists (prospect_id, playlist_id) VALUES (?, ?)',
      [prospectId, hiddenPlaylist.id]
    );

    res.json({ message: 'Prospect hidden successfully' });
  } catch (error) {
    console.error('Error hiding prospect:', error);
    res.status(500).json({ error: 'Failed to hide prospect' });
  }
});

// Delete a prospect (only if not in any playlist)
router.delete('/:id', async (req, res) => {
  try {
    const prospectId = req.params.id;

    // Check if prospect exists
    const prospect = await getRow(
      'SELECT id FROM prospects WHERE id = ? AND status = ?',
      [prospectId, 'active']
    );

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Check if prospect is in any playlist
    const inPlaylist = await getRow(
      'SELECT id FROM prospect_playlists WHERE prospect_id = ?',
      [prospectId]
    );

    if (inPlaylist) {
      return res.status(400).json({ 
        error: 'Cannot delete prospect: it is already in a playlist. Remove it from playlists first.' 
      });
    }

    // Delete the prospect
    const result = await runQuery(
      'UPDATE prospects SET status = ? WHERE id = ?',
      ['deleted', prospectId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    res.json({ message: 'Prospect deleted successfully' });
  } catch (error) {
    console.error('Error deleting prospect:', error);
    res.status(500).json({ error: 'Failed to delete prospect' });
  }
});

// Get prospect statistics
router.get('/stats/overview', async (req, res) => {
  try {
    // Total prospects
    const totalResult = await getRow(
      'SELECT COUNT(*) as count FROM prospects WHERE status = ?',
      ['active']
    );

    // Prospects with websites
    const withWebsiteResult = await getRow(
      'SELECT COUNT(*) as count FROM prospects WHERE status = ? AND has_website = 1',
      ['active']
    );

    // Prospects with email
    const withEmailResult = await getRow(
      'SELECT COUNT(*) as count FROM prospects WHERE status = ? AND email IS NOT NULL',
      ['active']
    );

    // Prospects with phone
    const withPhoneResult = await getRow(
      'SELECT COUNT(*) as count FROM prospects WHERE status = ? AND phone IS NOT NULL',
      ['active']
    );

    // Prospects in playlists
    const inPlaylistsResult = await getRow(
      `SELECT COUNT(DISTINCT p.id) as count 
       FROM prospects p 
       JOIN prospect_playlists pp ON p.id = pp.prospect_id 
       JOIN playlists pl ON pl.id = pp.playlist_id 
       WHERE p.status = ?`,
      ['active']
    );

    // Top categories
    const topCategories = await getAllRows(
      `SELECT category, COUNT(*) as count 
       FROM prospects 
       WHERE status = ? AND category IS NOT NULL 
       GROUP BY category 
       ORDER BY count DESC 
       LIMIT 10`,
      ['active']
    );

    res.json({
      total_prospects: totalResult.count,
      with_website: withWebsiteResult.count,
      with_email: withEmailResult.count,
      with_phone: withPhoneResult.count,
      in_playlists: inPlaylistsResult.count,
      available_prospects: totalResult.count - inPlaylistsResult.count,
      top_categories: topCategories
    });
  } catch (error) {
    console.error('Error fetching prospect statistics:', error);
    res.status(500).json({ error: 'Failed to fetch prospect statistics' });
  }
});

export default router;
