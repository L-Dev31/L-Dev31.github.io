import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes de base pour éviter les erreurs 404
app.get('/api/prospects/stats', (req, res) => {
  res.json({
    total: 0,
    hidden: 0,
    emailsSent: 0
  });
});

app.get('/api/playlists/stats', (req, res) => {
  res.json({
    total: 0
  });
});

app.get('/api/prospects/recent', (req, res) => {
  res.json([]);
});

app.post('/api/scraping/start', (req, res) => {
  res.status(400).json({
    error: 'Scraping functionality not implemented yet'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 ProspectBoard Server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
});
