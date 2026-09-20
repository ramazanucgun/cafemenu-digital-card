require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const linksRoutes = require('./routes/links');
const qrRoutes = require('./routes/qr');
const nfcRoutes = require('./routes/nfc');
const { router: analyticsRoutes } = require('./routes/analytics');
const leadsRoutes = require('./routes/leads');
const publicRoutes = require('./routes/public');

const app = express();

app.set('trust proxy', 1); // needed for correct req.ip behind a reverse proxy / load balancer
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Security middleware ----
app.use(helmet({
  contentSecurityPolicy: false, // MVP: no inline-script hashing pipeline yet; tighten before real production launch
}));

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Global light rate limit as a safety net (route-specific limiters are stricter where it matters)
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ---- Static assets: own frontend, own uploads. No dependency on any other project. ----
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  maxAge: '7d',
  setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
}));

// App shell pages (own frontend, no build step required)
for (const page of ['login', 'register', 'dashboard', 'forgot-password', 'reset-password']) {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', `${page}.html`));
  });
}
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---- Own independent API ----
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/profile/links', linksRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/nfc', nfcRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/leads', leadsRoutes);

// ---- Public card, stable token redirect, vCard, public events/leads, and the /:slug catch-all ----
app.use('/', publicRoutes);

// ---- 404 fallback ----
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not_found' });
  }
  return res.status(404).render('not_found');
});

// ---- Error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'server_error' });
  }
  return res.status(500).send('Sunucu hatası oluştu.');
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[cafemenu-digital-card] listening on port ${PORT}`);
  });
}

module.exports = app;
