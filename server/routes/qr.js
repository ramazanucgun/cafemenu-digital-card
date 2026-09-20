const express = require('express');
const QRCode = require('qrcode');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function getOwnProfile(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM digital_profiles WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

function stableCardUrl(token) {
  const base = process.env.APP_URL || 'http://localhost:3000';
  return `${base}/c/${token}`;
}

// GET /api/qr - metadata (the stable token URL the QR encodes)
router.get('/', requireAuth, async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'not_found' });

  let { rows } = await pool.query(
    'SELECT * FROM digital_qr_codes WHERE profile_id = $1 ORDER BY created_at ASC LIMIT 1',
    [profile.id]
  );
  if (rows.length === 0) {
    const insert = await pool.query(
      `INSERT INTO digital_qr_codes (profile_id, token) VALUES ($1, $2) RETURNING *`,
      [profile.id, profile.token]
    );
    rows = insert.rows;
  }
  return res.json({ qr: rows[0], target_url: stableCardUrl(profile.token) });
});

// GET /api/qr/image.png - PNG QR image, print-ready
router.get('/image.png', requireAuth, async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'not_found' });
  const url = stableCardUrl(profile.token);
  res.setHeader('Content-Type', 'image/png');
  await QRCode.toFileStream(res, url, {
    type: 'png',
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'H', // high EC level so it stays scannable if a logo overlay is added later
    color: { dark: '#111827', light: '#FFFFFFFF' },
  });
});

// GET /api/qr/image.svg - SVG QR image (print / vector)
router.get('/image.svg', requireAuth, async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'not_found' });
  const url = stableCardUrl(profile.token);
  const svg = await QRCode.toString(url, {
    type: 'svg',
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#111827', light: '#FFFFFFFF' },
  });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

module.exports = router;
