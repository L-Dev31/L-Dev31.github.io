import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

console.log('\n🎯 Starting ProspectBoard Personal Edition...\n');

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Mock database - in-memory storage for demo
let prospects = [];
let playlists = [];
let hiddenProspects = [];

console.log('✅ Database initialized successfully');

// API Routes
app.get('/api/prospects/stats', (req, res) => {
  res.json({
    total: prospects.length,
    hidden: hiddenProspects.length,
    emailsSent: 0
  });
});

app.get('/api/playlists/stats', (req, res) => {
  res.json({
    total: playlists.length
  });
});

app.get('/api/prospects/recent', (req, res) => {
  const recent = prospects.slice(-5).reverse();
  res.json(recent);
});

app.get('/api/prospects', (req, res) => {
  res.json(prospects);
});

app.get('/api/playlists', (req, res) => {
  res.json(playlists);
});

app.get('/api/hidden', (req, res) => {
  res.json(hiddenProspects);
});

app.post('/api/scraping/start', (req, res) => {
  res.status(400).json({
    error: 'Scraping functionality requires additional setup. This is a demo version.'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ProspectBoard Personal Edition API',
    version: '2.0.0'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const startServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
      console.log('✨ ProspectBoard Personal Edition is ready!\n');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
