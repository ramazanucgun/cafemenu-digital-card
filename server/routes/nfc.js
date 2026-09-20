const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { generateToken } = require('../utils/token');

const router = express.Router();

const PRODUCT_TYPES = new Set(['PVC', 'METAL', 'WOOD', 'ACRYLIC', 'STICKER', 'KEYCHAIN', 'STAND']);

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

// GET /api/nfc - list this user's NFC cards + the URL that should be written to any of them.
// NFC uses its OWN stable token (distinct from the QR token) so analytics can tell
// "someone tapped the physical card" apart from "someone scanned the QR code".
router.get('/', requireAuth, async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'not_found' });

  let { rows } = await pool.query(
    'SELECT * FROM nfc_cards WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC',
    [profile.id]
  );
  if (rows.length === 0) {
    const insert = await pool.query(
      `INSERT INTO nfc_cards (profile_id, name, product_type, token) VALUES ($1, $2, $3, $4) RETURNING *`,
      [profile.id, 'NFC Kart', 'PVC', generateToken()]
    );
    rows = insert.rows;
  }
  const defaultCard = rows[0];
  return res.json({ cards: rows, write_url: stableCardUrl(defaultCard.token) });
});

// POST /api/nfc - register a new (virtual, MVP) NFC card record for this profile
router.post('/', requireAuth, async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'not_found' });

  const { name, product_type, uid } = req.body || {};
  const safeType = PRODUCT_TYPES.has(product_type) ? product_type : 'PVC';
  const token = generateToken();

  const { rows } = await pool.query(
    `INSERT INTO nfc_cards (profile_id, uid, name, product_type, token)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [profile.id, (uid || '').slice(0, 120) || null, (name || 'NFC Kart').slice(0, 120), safeType, token]
  );
  return res.status(201).json({ card: rows[0], write_url: stableCardUrl(rows[0].token) });
});

module.exports = router;
