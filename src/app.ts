import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes/api.router.js';
import { errorHandler } from './middleware/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows inline script evaluation for local UI views
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend assets
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Versioned REST API
app.use('/api/v1', apiRouter);

// Health alias
app.get('/health', (req, res) => res.redirect('/api/v1/health'));

// Global error handler
app.use(errorHandler);
