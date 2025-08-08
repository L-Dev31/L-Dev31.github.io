import express from 'express';

import { runQuery, getAllRows, getRow } from '../database/init.js';

const router = express.Router();

// Get all playlists for user
router.get('/', async (req, res) => {
  try {
    const playlists = await getAllRows(
      `SELECT pl.*, 
              COUNT(pp.prospect_id) as prospect_count
       FROM playlists pl
       LEFT JOIN prospect_playlists pp ON pl.id = pp.playlist_id
       GROUP BY pl.id
       ORDER BY pl.created_at DESC`
    );

    res.json(playlists);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// Get playlist statistics
router.get('/stats', async (req, res) => {
  try {
    // Total playlists
    const totalResult = await getRow(
      'SELECT COUNT(*) as count FROM playlists WHERE is_hidden = 0'
    );

    // Hidden playlists
    const hiddenResult = await getRow(
      'SELECT COUNT(*) as count FROM playlists WHERE is_hidden = 1'
    );

    res.json({
      totalPlaylists: totalResult ? totalResult.count : 0,
      hiddenPlaylists: hiddenResult ? hiddenResult.count : 0
    });
  } catch (error) {
    console.error('Error fetching playlist statistics:', error);
    res.status(500).json({ error: 'Failed to fetch playlist statistics' });
  }
});

// Get single playlist with prospects
router.get('/:id', async (req, res) => {
  try {
    // Get playlist
    const playlist = await getRow(
      'SELECT * FROM playlists WHERE id = ?',
      [req.params.id]
    );

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Get prospects in this playlist
    const prospects = await getAllRows(
      `SELECT p.*, pp.added_at
       FROM prospects p
       JOIN prospect_playlists pp ON p.id = pp.prospect_id
       WHERE pp.playlist_id = ? AND p.status = 'active'
       ORDER BY pp.added_at DESC`,
      [req.params.id]
    );

    res.json({
      ...playlist,
      prospects
    });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// Create new playlist
router.post('/', async (req, res) => {
  try {
    const { name, description, color = '#3B82F6' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    // Check if playlist name already exists
    const existingPlaylist = await getRow(
      'SELECT id FROM playlists WHERE name = ? AND is_hidden = 0',
      [name]
    );

    if (existingPlaylist) {
      return res.status(400).json({ error: 'Playlist name already exists' });
    }

    const result = await runQuery(
      'INSERT INTO playlists (name, description, color, is_hidden) VALUES (?, ?, ?, 0)',
      [name, description, color]
    );

    // Return the created playlist
    const newPlaylist = await getRow(
      'SELECT * FROM playlists WHERE id = ?',
      [result.lastID]
    );

    res.status(201).json(newPlaylist);
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// Update playlist
router.put('/:id', async (req, res) => {
  try {
    const { name, description, color } = req.body;

    // Verify playlist exists
    const existingPlaylist = await getRow(
      'SELECT id, is_hidden FROM playlists WHERE id = ?',
      [req.params.id]
    );

    if (!existingPlaylist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Don't allow editing hidden playlist
    if (existingPlaylist.is_hidden) {
      return res.status(400).json({ error: 'Cannot edit hidden playlist' });
    }

    // Check if new name conflicts with existing playlist
    if (name) {
      const nameConflict = await getRow(
        'SELECT id FROM playlists WHERE name = ? AND is_hidden = 0 AND id != ?',
        [name, req.params.id]
      );

      if (nameConflict) {
        return res.status(400).json({ error: 'Playlist name already exists' });
      }
    }

    await runQuery(
      `UPDATE playlists 
       SET name = ?, description = ?, color = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, color, req.params.id]
    );

    // Return updated playlist
    const updatedPlaylist = await getRow(
      'SELECT * FROM playlists WHERE id = ?',
      [req.params.id]
    );

    res.json(updatedPlaylist);
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

// Delete playlist
router.delete('/:id', async (req, res) => {
  try {
    // Verify playlist belongs to user
    const existingPlaylist = await getRow(
      'SELECT id, is_hidden FROM playlists WHERE id = ?',
      [req.params.id]
    );

    if (!existingPlaylist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Don't allow deletion of the hidden playlist
    if (existingPlaylist.is_hidden) {
      return res.status(400).json({ error: 'Cannot delete the hidden playlist' });
    }

    // Delete playlist (this will cascade delete prospect_playlists)
    await runQuery('DELETE FROM playlists WHERE id = ?', [req.params.id]);

    res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// Add multiple prospects to playlist
router.post('/:id/prospects', async (req, res) => {
  try {
    const { prospect_ids: prospectIds } = req.body;

    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      return res.status(400).json({ error: 'prospect_ids array is required' });
    }

    // Verify playlist exists
    const playlist = await getRow(
      'SELECT id FROM playlists WHERE id = ?',
      [req.params.id]
    );

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Verify all prospects exist and are active
    const ownedProspects = await getAllRows(
      `SELECT id FROM prospects WHERE id IN (${prospectIds.map(() => '?').join(',')}) AND status = 'active'`,
      [...prospectIds]
    );

    if (ownedProspects.length !== prospectIds.length) {
      return res.status(400).json({ error: 'Some prospects not found or not active' });
    }

    let addedCount = 0;
    const errors = [];

    // Add each prospect to playlist (ignore if already exists)
    for (const prospectId of prospectIds) {
      try {
        await runQuery(
          'INSERT OR IGNORE INTO prospect_playlists (prospect_id, playlist_id) VALUES (?, ?)',
          [prospectId, req.params.id]
        );
        addedCount++;
      } catch (error) {
        errors.push({ prospectId, error: error.message });
      }
    }

    res.json({
      message: `${addedCount} prospects added to playlist`,
      addedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error adding prospects to playlist:', error);
    res.status(500).json({ error: 'Failed to add prospects to playlist' });
  }
});

// Remove prospect from playlist
router.delete('/:id/prospects/:prospectId', async (req, res) => {
  try {
    // Verify playlist exists
    const playlist = await getRow(
      'SELECT id FROM playlists WHERE id = ?',
      [req.params.id]
    );

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Verify prospect exists
    const prospect = await getRow(
      'SELECT id FROM prospects WHERE id = ?',
      [req.params.prospectId]
    );

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Remove from playlist
    const result = await runQuery(
      'DELETE FROM prospect_playlists WHERE prospect_id = ? AND playlist_id = ?',
      [req.params.prospectId, req.params.id]
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

// Get or create hidden playlist
router.get('/special/hidden', async (req, res) => {
  try {
    let hiddenPlaylist = await getRow(
      'SELECT * FROM playlists WHERE 1=1 AND is_hidden = 1',
      []
    );

    // Create hidden playlist if it doesn't exist
    if (!hiddenPlaylist) {
      const result = await runQuery(
        `INSERT INTO playlists (name, description, color, is_hidden) 
         VALUES ('Hidden', 'Prospects masqués temporairement', '#6B7280', 1)`,
        []
      );

      hiddenPlaylist = await getRow(
        'SELECT * FROM playlists WHERE id = ?',
        [result.lastID]
      );
    }

    // Get prospects in hidden playlist
    const prospects = await getAllRows(
      `SELECT p.*, pp.added_at
       FROM prospects p
       JOIN prospect_playlists pp ON p.id = pp.prospect_id
       WHERE pp.playlist_id = ? AND p.status = 'active'
       ORDER BY pp.added_at DESC`,
      [hiddenPlaylist.id]
    );

    res.json({
      ...hiddenPlaylist,
      prospects
    });
  } catch (error) {
    console.error('Error fetching/creating hidden playlist:', error);
    res.status(500).json({ error: 'Failed to fetch hidden playlist' });
  }
});

// Move prospect to hidden playlist
router.post('/special/hidden/prospects/:prospectId', async (req, res) => {
  try {
    // Get or create hidden playlist
    let hiddenPlaylist = await getRow(
      'SELECT id FROM playlists WHERE 1=1 AND is_hidden = 1',
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

    // Verify prospect exists
    const prospect = await getRow(
      'SELECT id FROM prospects WHERE id = ?',
      [req.params.prospectId]
    );

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Remove from all other playlists first
    await runQuery(
      `DELETE FROM prospect_playlists 
       WHERE prospect_id = ? AND playlist_id IN (
         SELECT id FROM playlists WHERE 1=1 AND is_hidden = 0
       )`,
      [req.params.prospectId, req.user.id]
    );

    // Add to hidden playlist
    await runQuery(
      'INSERT OR IGNORE INTO prospect_playlists (prospect_id, playlist_id) VALUES (?, ?)',
      [req.params.prospectId, hiddenPlaylist.id]
    );

    res.json({ message: 'Prospect moved to hidden playlist successfully' });
  } catch (error) {
    console.error('Error moving prospect to hidden playlist:', error);
    res.status(500).json({ error: 'Failed to move prospect to hidden playlist' });
  }
});

export default router;
