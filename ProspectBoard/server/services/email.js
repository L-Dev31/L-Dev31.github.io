import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

export class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeFromConfig();
  }

  // Initialize from config if available
  initializeFromConfig() {
    if (config.email.isConfigured) {
      try {
        this.configure({
          host: config.email.host,
          port: config.email.port,
          secure: config.email.secure,
          user: config.email.user,
          pass: config.email.pass
        });
      } catch (error) {
        console.warn('⚠️  Failed to initialize email service from config:', error.message);
      }
    }
  }

  // Configure email transporter
  configure(emailConfig) {
    const { host, port, secure, user, pass } = emailConfig;

    if (!host || !port || !user || !pass) {
      throw new Error('Email configuration is incomplete');
    }

    this.transporter = nodemailer.createTransporter({
      host,
      port: parseInt(port),
      secure: secure === 'true' || secure === true, // true for 465, false for other ports
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false // Accept self-signed certificates
      },
      pool: true, // Use pooled connections
      maxConnections: 5, // Limit concurrent connections
      maxMessages: 100, // Limit messages per connection
      rateLimit: 14 // Send max 14 emails per second
    });

    this.isConfigured = true;
    console.log('✅ Email service configured successfully');
  }

  // Test email configuration
  async testConfiguration() {
    if (!this.transporter) {
      throw new Error('Email service not configured');
    }

    try {
      await this.transporter.verify();
      return { success: true, message: 'Email configuration is valid' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Send single email
  async sendEmail({ to, subject, html, text, attachments = [] }) {
    if (!this.isConfigured) {
      throw new Error('Email service not configured');
    }

    // Validate email address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return {
        success: false,
        error: 'Invalid email address format'
      };
    }

    try {
      const mailOptions = {
        from: `"ProspectBoard" <${config.email.user}>`,
        to,
        subject,
        text: text || this.htmlToPlainText(html),
        html,
        attachments
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected
      };
    } catch (error) {
      console.error('Email sending error:', error);
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Get user-friendly error message
  getErrorMessage(error) {
    if (error.code === 'EAUTH') {
      return 'Authentication failed - please check your email credentials';
    } else if (error.code === 'ECONNECTION') {
      return 'Connection failed - please check your SMTP settings';
    } else if (error.code === 'ETIMEDOUT') {
      return 'Connection timeout - please try again later';
    } else if (error.responseCode === 550) {
      return 'Email rejected by recipient server';
    } else if (error.responseCode === 553) {
      return 'Invalid recipient email address';
    } else {
      return error.message || 'Unknown email error';
    }
  }

  // Process email template variables
  processTemplate(template, variables) {
    let processedTemplate = template;

    // Support both {{VARIABLE}} and {variable} formats
    Object.keys(variables).forEach(key => {
      const upperPlaceholder = `{{${key.toUpperCase()}}}`;
      const lowerPlaceholder = `{{${key.toLowerCase()}}}`;
      const bracePlaceholder = `{${key}}`;
      
      const value = variables[key] || '';
      
      // Replace all variations
      processedTemplate = processedTemplate
        .replace(new RegExp(upperPlaceholder.replace(/[{}]/g, '\\$&'), 'g'), value)
        .replace(new RegExp(lowerPlaceholder.replace(/[{}]/g, '\\$&'), 'g'), value)
        .replace(new RegExp(bracePlaceholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    return processedTemplate;
  }

  // Get available template variables
  getAvailableVariables() {
    return {
      nom_entreprise: 'Nom de l\'entreprise',
      categorie: 'Catégorie de l\'entreprise',
      ville: 'Ville de recherche',
      email: 'Email du prospect',
      telephone: 'Numéro de téléphone',
      adresse: 'Adresse complète',
      sender_name: 'Nom de l\'expéditeur',
      site_web: 'URL du site web'
    };
  }

  // Validate template variables
  validateTemplate(template) {
    const variables = this.getAvailableVariables();
    const usedVariables = [];
    const unknownVariables = [];

    // Find all variables in template
    const variableRegex = /\{\{([^}]+)\}\}/g;
    let match;
    
    while ((match = variableRegex.exec(template)) !== null) {
      const variable = match[1].toLowerCase();
      if (variables[variable]) {
        if (!usedVariables.includes(variable)) {
          usedVariables.push(variable);
        }
      } else {
        if (!unknownVariables.includes(variable)) {
          unknownVariables.push(variable);
        }
      }
    }

    return {
      valid: unknownVariables.length === 0,
      usedVariables,
      unknownVariables,
      availableVariables: Object.keys(variables)
    };
  }

  // Send bulk emails with rate limiting
  async sendBulkEmails(emails, options = {}) {
    const {
      delayBetweenEmails = 1000,
      maxRetries = 2,
      onProgress = null,
      onError = null
    } = options;
    
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      let retries = 0;
      let result = null;
      
      while (retries <= maxRetries) {
        try {
          result = await this.sendEmail(email);
          
          if (result.success) {
            successCount++;
            break; // Success, no need to retry
          } else {
            retries++;
            if (retries <= maxRetries) {
              console.log(`🔄 Retrying email ${i + 1}/${emails.length} to ${email.to} (attempt ${retries}/${maxRetries})`);
              await this.delay(delayBetweenEmails * retries); // Exponential backoff
            }
          }
        } catch (error) {
          retries++;
          result = {
            success: false,
            error: error.message
          };
        }
      }

      if (!result.success) {
        failedCount++;
        if (onError) {
          onError(email, result, i);
        }
      }

      results.push({
        ...result,
        to: email.to,
        index: i,
        retries: retries
      });

      // Progress callback
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: emails.length,
          success: successCount,
          failed: failedCount,
          percentage: Math.round(((i + 1) / emails.length) * 100)
        });
      }

      console.log(`📧 Email ${i + 1}/${emails.length} to ${email.to}: ${result.success ? 'SUCCESS' : 'FAILED'} ${!result.success ? `(${result.error})` : ''}`);
      
      // Add delay between emails to avoid rate limiting
      if (i < emails.length - 1 && delayBetweenEmails > 0) {
        await this.delay(delayBetweenEmails);
      }
    }

    return {
      results,
      summary: {
        total: emails.length,
        success: successCount,
        failed: failedCount,
        successRate: Math.round((successCount / emails.length) * 100)
      }
    };
  }

  // Delay helper
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Generate HTML email template
  generateHtmlTemplate(content, variables = {}) {
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${variables.subject || 'ProspectBoard Email'}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            line-height: 1.6;
            color: #333333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8fafc;
        }
        .email-container {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .header {
            border-bottom: 2px solid #3b82f6;
            margin-bottom: 25px;
            padding-bottom: 15px;
        }
        .content {
            margin-bottom: 25px;
        }
        .footer {
            font-size: 12px;
            color: #6b7280;
            text-align: center;
            border-top: 1px solid #e5e7eb;
            padding-top: 15px;
            margin-top: 25px;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 10px 0;
        }
        .signature {
            margin-top: 20px;
            font-size: 14px;
            color: #4b5563;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h2 style="margin: 0; color: #1f2937;">ProspectBoard</h2>
        </div>
        
        <div class="content">
            ${content}
        </div>
        
        <div class="signature">
            <p>Cordialement,<br>
            ${variables.sender_name || 'L\'équipe ProspectBoard'}</p>
        </div>
        
        <div class="footer">
            <p>Cet email a été envoyé via ProspectBoard<br>
            Si vous ne souhaitez plus recevoir ces emails, 
            <a href="#" style="color: #6b7280;">cliquez ici pour vous désabonner</a></p>
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  // Convert HTML to plain text (basic)
  htmlToPlainText(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }
}

// Default instance
const emailService = new EmailService();

export default emailService;
