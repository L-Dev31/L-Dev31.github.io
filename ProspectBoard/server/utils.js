#!/usr/bin/env node

/**
 * Utilitaires et scripts pour ProspectBoard
 * Usage: npm run utils <command>
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { config, logConfigStatus } from './config/index.js';
import { initializeDatabase, getDatabase } from './database/init.js';
import emailService from './services/email.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Commandes disponibles
const commands = {
  'config': showConfig,
  'test-email': testEmail,
  'db-info': showDbInfo,
  'db-reset': resetDatabase,
  'create-admin': createAdminUser,
  'help': showHelp
};

// Fonction principale
async function main() {
  const command = process.argv[2];
  
  if (!command || !commands[command]) {
    showHelp();
    return;
  }
  
  try {
    await commands[command]();
  } catch (error) {
    console.error(`❌ Error executing command '${command}':`, error.message);
    process.exit(1);
  }
}

// Affiche la configuration
async function showConfig() {
  console.log('\n📋 Configuration ProspectBoard\n');
  logConfigStatus();
  
  // Test de la base de données
  try {
    await initializeDatabase();
    console.log('✅ Database connection: OK');
  } catch (error) {
    console.log('❌ Database connection: FAILED');
    console.log(`   Error: ${error.message}`);
  }
  
  // Test de l'email
  if (config.email.isConfigured) {
    try {
      const result = await emailService.testConfiguration();
      console.log(`${result.success ? '✅' : '❌'} Email service: ${result.success ? 'OK' : 'FAILED'}`);
      if (!result.success) {
        console.log(`   Error: ${result.message}`);
      }
    } catch (error) {
      console.log('❌ Email service: FAILED');
      console.log(`   Error: ${error.message}`);
    }
  }
}

// Test d'envoi d'email
async function testEmail() {
  if (!config.email.isConfigured) {
    console.log('❌ Email service not configured. Please set SMTP_* environment variables.');
    return;
  }
  
  const testEmailAddress = process.argv[3];
  if (!testEmailAddress) {
    console.log('❌ Please provide a test email address: npm run utils test-email your@email.com');
    return;
  }
  
  console.log(`📧 Sending test email to ${testEmailAddress}...`);
  
  try {
    const result = await emailService.sendEmail({
      to: testEmailAddress,
      subject: 'Test ProspectBoard - Configuration Email',
      html: `
        <h2>🎯 Test ProspectBoard</h2>
        <p>Félicitations ! Votre configuration email fonctionne parfaitement.</p>
        <p>✅ Serveur SMTP : ${config.email.host}:${config.email.port}</p>
        <p>✅ Utilisateur : ${config.email.user}</p>
        <p>✅ Connexion sécurisée : ${config.email.secure ? 'Oui' : 'Non'}</p>
        <p>Vous pouvez maintenant utiliser ProspectBoard pour envoyer des campagnes email.</p>
      `,
      text: 'Test ProspectBoard - Votre configuration email fonctionne parfaitement !'
    });
    
    if (result.success) {
      console.log('✅ Test email sent successfully!');
      console.log(`   Message ID: ${result.messageId}`);
    } else {
      console.log('❌ Failed to send test email');
      console.log(`   Error: ${result.error}`);
    }
  } catch (error) {
    console.log('❌ Email test failed');
    console.log(`   Error: ${error.message}`);
  }
}

// Informations sur la base de données
async function showDbInfo() {
  console.log('\n💾 Database Information\n');
  console.log(`Path: ${config.database.path}`);
  
  try {
    await initializeDatabase();
    
    const db = getDatabase();
    
    // Statistiques des tables
    const tables = [
      { name: 'users', label: 'Users' },
      { name: 'prospects', label: 'Prospects' },
      { name: 'playlists', label: 'Playlists' },
      { name: 'prospect_playlists', label: 'Prospect-Playlist relations' },
      { name: 'email_campaigns', label: 'Email campaigns' },
      { name: 'email_sends', label: 'Email sends' },
      { name: 'scraping_sessions', label: 'Scraping sessions' }
    ];
    
    for (const table of tables) {
      try {
        const result = await new Promise((resolve, reject) => {
          db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        console.log(`${table.label}: ${result.count} records`);
      } catch (error) {
        console.log(`${table.label}: Error - ${error.message}`);
      }
    }
    
    db.close();
    
  } catch (error) {
    console.log('❌ Failed to get database info');
    console.log(`   Error: ${error.message}`);
  }
}

// Reset de la base de données
async function resetDatabase() {
  const confirm = process.argv[3];
  
  if (confirm !== '--confirm') {
    console.log('⚠️  This will delete ALL data in the database!');
    console.log('To confirm, run: npm run utils db-reset --confirm');
    return;
  }
  
  try {
    // Supprimer le fichier de base de données
    await fs.unlink(config.database.path);
    console.log('🗑️  Database file deleted');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    console.log('📝 Database file does not exist');
  }
  
  // Recréer la base de données
  await initializeDatabase();
  console.log('✅ Database recreated with empty tables');
}

// Créer un utilisateur administrateur
async function createAdminUser() {
  const email = process.argv[3];
  const password = process.argv[4];
  
  if (!email || !password) {
    console.log('Usage: npm run utils create-admin <email> <password>');
    return;
  }
  
  try {
    await initializeDatabase();
    
    // Import bcryptjs ici pour éviter les erreurs si pas installé
    const bcrypt = await import('bcryptjs');
    const { runQuery } = await import('./database/init.js');
    
    const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);
    
    const result = await runQuery(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, hashedPassword]
    );
    
    console.log(`✅ Admin user created successfully!`);
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${result.id}`);
    console.log(`   Password: ${password}`);
    
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      console.log('❌ User with this email already exists');
    } else {
      throw error;
    }
  }
}

// Aide
function showHelp() {
  console.log(`
🔧 ProspectBoard Utilities

Available commands:
  config        Show current configuration and test services
  test-email    Send test email: npm run utils test-email <email>
  db-info       Show database statistics
  db-reset      Reset database (WARNING: deletes all data)
  create-admin  Create admin user: npm run utils create-admin <email> <password>
  help          Show this help message

Examples:
  npm run utils config
  npm run utils test-email test@example.com
  npm run utils db-info
  npm run utils create-admin admin@example.com mypassword
`);
}

// Lancer le script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { commands };
