// Configuration for ProspectBoard Personal Edition v2.0
// Simplified configuration without authentication

export const config = {
  // Scraping configuration
  scraping: {
    maxResults: 50,
    delayBetweenActions: 2000,
    timeout: 30000,
    headless: true,
    maxRetries: 3
  },
  
  // Database configuration
  database: {
    path: './database/prospectboard.db'
  },
  
  // Email configuration (will be overridden by environment variables)
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    }
  },
  
  // Server configuration
  server: {
    port: parseInt(process.env.PORT) || 3001,
    env: process.env.NODE_ENV || 'development'
  }
};
