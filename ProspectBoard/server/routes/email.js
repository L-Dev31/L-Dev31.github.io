import express from 'express';

import { runQuery, getAllRows, getRow } from '../database/init.js';
import emailService from '../services/email.js';
import { getAllTemplates, getTemplate } from '../services/emailTemplates.js';

const router = express.Router();

// Test email configuration
router.post('/test', async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({ error: 'Test email address is required' });
    }

    // Test the configuration
    const testResult = await emailService.testConfiguration();
    if (!testResult.success) {
      return res.status(500).json({ error: testResult.message });
    }

    // Send test email
    const result = await emailService.sendEmail({
      to: testEmail,
      subject: 'Test ProspectBoard - Configuration Email',
      html: emailService.generateHtmlTemplate(`
        <h3>✅ Test réussi !</h3>
        <p>Félicitations ! Votre configuration email fonctionne parfaitement.</p>
        <p>Vous pouvez maintenant envoyer des campagnes emails via ProspectBoard.</p>
        <ul>
          <li>✅ Connexion SMTP établie</li>
          <li>✅ Email envoyé avec succès</li>
          <li>✅ Configuration validée</li>
        </ul>
      `, { subject: 'Test ProspectBoard' }),
      text: 'Test réussi ! Votre configuration email fonctionne parfaitement.'
    });

    if (result.success) {
      res.json({
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ error: 'Failed to test email configuration' });
  }
});

// Get email campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await getAllRows(
      `SELECT ec.*, pl.name as playlist_name
       FROM email_campaigns ec
       JOIN playlists pl ON ec.playlist_id = pl.id
       WHERE ec.user_id = ?
       ORDER BY ec.created_at DESC`,
      []
    );

    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching email campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch email campaigns' });
  }
});

// Get campaign details with sends
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await getRow(
      `SELECT ec.*, pl.name as playlist_name
       FROM email_campaigns ec
       JOIN playlists pl ON ec.playlist_id = pl.id
       WHERE ec.id = ? AND ec.user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const sends = await getAllRows(
      `SELECT es.*, p.name as prospect_name, p.category
       FROM email_sends es
       JOIN prospects p ON es.prospect_id = p.id
       WHERE es.campaign_id = ?
       ORDER BY es.created_at DESC`,
      [req.params.id]
    );

    res.json({
      ...campaign,
      sends
    });
  } catch (error) {
    console.error('Error fetching campaign details:', error);
    res.status(500).json({ error: 'Failed to fetch campaign details' });
  }
});

// Send email campaign to playlist
router.post('/campaigns/send', async (req, res) => {
  try {
    const { playlistId, subject, template, senderName } = req.body;

    if (!playlistId || !subject || !template) {
      return res.status(400).json({ error: 'Playlist ID, subject, and template are required' });
    }

    // Verify playlist belongs to user
    const playlist = await getRow(
      'SELECT * FROM playlists WHERE id = ? AND user_id = ?',
      [playlistId, req.user.id]
    );

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Get prospects with emails in this playlist
    const prospects = await getAllRows(
      `SELECT p.*
       FROM prospects p
       JOIN prospect_playlists pp ON p.id = pp.prospect_id
       WHERE pp.playlist_id = ? AND p.email IS NOT NULL AND p.email != '' AND p.status = 'active'`,
      [playlistId]
    );

    if (prospects.length === 0) {
      return res.status(400).json({ error: 'No prospects with email addresses found in this playlist' });
    }

    // Create email campaign
    const campaignResult = await runQuery(
      `INSERT INTO email_campaigns (playlist_id, subject, template, total_recipients, user_id) 
       VALUES (?, ?, ?, ?, ?)`,
      [playlistId, subject, template, prospects.length, req.user.id]
    );

    const campaignId = campaignResult.id;

    // Create email send records
    for (const prospect of prospects) {
      await runQuery(
        `INSERT INTO email_sends (campaign_id, prospect_id, email_address) 
         VALUES (?, ?, ?)`,
        [campaignId, prospect.id, prospect.email]
      );
    }

    // Start sending emails in background
    sendCampaignInBackground(campaignId, prospects, subject, template, senderName, playlist);

    res.json({
      message: 'Email campaign started',
      campaignId,
      totalRecipients: prospects.length
    });
  } catch (error) {
    console.error('Error starting email campaign:', error);
    res.status(500).json({ error: 'Failed to start email campaign' });
  }
});

// Get email templates
router.get('/templates', async (req, res) => {
  try {
    const templates = getAllTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

// Get specific email template
router.get('/templates/:id', async (req, res) => {
  try {
    const template = getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Error fetching email template:', error);
    res.status(500).json({ error: 'Failed to fetch email template' });
  }
});

// Validate email template
router.post('/templates/validate', async (req, res) => {
  try {
    const { template } = req.body;
    if (!template) {
      return res.status(400).json({ error: 'Template is required' });
    }

    const validation = emailService.validateTemplate(template);
    res.json(validation);
  } catch (error) {
    console.error('Error validating template:', error);
    res.status(500).json({ error: 'Failed to validate template' });
  }
});

// Preview email template
router.post('/preview', async (req, res) => {
  try {
    const { template, sampleData } = req.body;

    if (!template) {
      return res.status(400).json({ error: 'Template is required' });
    }

    // Use sample data or defaults
    const variables = {
      nom_entreprise: sampleData?.name || 'Restaurant Le Gourmet',
      categorie: sampleData?.category || 'Restaurant',
      ville: sampleData?.city || 'Paris',
      email: sampleData?.email || 'contact@legourmet.fr',
      telephone: sampleData?.phone || '01 23 45 67 89',
      adresse: sampleData?.address || '123 rue de la Paix, 75001 Paris',
      ...sampleData
    };

    const processedTemplate = emailService.processTemplate(template, variables);
    const htmlContent = emailService.generateHtmlTemplate(processedTemplate, variables);
    const plainText = emailService.htmlToPlainText(processedTemplate);

    res.json({
      html: htmlContent,
      text: plainText,
      variables: variables
    });
  } catch (error) {
    console.error('Error previewing email template:', error);
    res.status(500).json({ error: 'Failed to preview email template' });
  }
});

// Background email sending function
async function sendCampaignInBackground(campaignId, prospects, subject, template, senderName, playlist) {
  try {
    console.log(`📧 Starting email campaign ${campaignId} with ${prospects.length} recipients`);

    // Update campaign status
    await runQuery(
      'UPDATE email_campaigns SET status = \'sending\' WHERE id = ?',
      [campaignId]
    );

    let sentCount = 0;
    let failedCount = 0;

    // Process each prospect
    for (const prospect of prospects) {
      try {
        // Process template variables
        const variables = {
          nom_entreprise: prospect.name,
          categorie: prospect.category || 'Entreprise',
          ville: prospect.city || '',
          email: prospect.email,
          telephone: prospect.phone || 'Non renseigné',
          adresse: prospect.address || 'Non renseignée',
          sender_name: senderName || 'ProspectBoard'
        };

        const processedTemplate = emailService.processTemplate(template, variables);
        const htmlContent = emailService.generateHtmlTemplate(processedTemplate, variables);
        const plainText = emailService.htmlToPlainText(processedTemplate);

        // Send email
        const result = await emailService.sendEmail({
          to: prospect.email,
          subject: emailService.processTemplate(subject, variables),
          html: htmlContent,
          text: plainText
        });

        // Update send record
        if (result.success) {
          await runQuery(
            `UPDATE email_sends 
             SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
             WHERE campaign_id = ? AND prospect_id = ?`,
            [campaignId, prospect.id]
          );
          sentCount++;
          console.log(`✅ Email sent to ${prospect.name} (${prospect.email})`);
        } else {
          await runQuery(
            `UPDATE email_sends 
             SET status = 'failed', error_message = ? 
             WHERE campaign_id = ? AND prospect_id = ?`,
            [result.error, campaignId, prospect.id]
          );
          failedCount++;
          console.log(`❌ Failed to send email to ${prospect.name}: ${result.error}`);
        }

        // Add delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error sending email to prospect ${prospect.id}:`, error);
        failedCount++;
      }
    }

    // Update campaign as completed
    await runQuery(
      `UPDATE email_campaigns 
       SET status = 'completed', sent_count = ?, failed_count = ?, completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [sentCount, failedCount, campaignId]
    );

    console.log(`✅ Email campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`);
    
  } catch (error) {
    console.error(`❌ Email campaign ${campaignId} failed:`, error);
    
    // Update campaign as failed
    await runQuery(
      `UPDATE email_campaigns 
       SET status = 'failed', completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [campaignId]
    );
  }
}

export default router;
