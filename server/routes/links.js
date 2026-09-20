const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_TYPES = new Set([
  'instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'telegram',
  'pinterest', 'website', 'location', 'menu', 'catalog', 'pricelist',
  'appointment', 'campaign', 'products', 'portfolio', 'custom',
]);

async function getOwnProfileId(userId) {
  const { rows } = await pool.query(
    'SELECT id FROM digital_profiles WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  return rows[0] ? rows[0].id : null;
}

async function assertOwnsLink(userId, linkId) {
  const { rows } = await pool.query(
    `SELECT l.id FROM digital_profile_links l
     JOIN digital_profiles p ON p.id = l.profile_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [linkId, userId]
  );
  return rows.length > 0;
}

// GET /api/profile/links
router.get('/', requireAuth, async (req, res) => {
  const profileId = await getOwnProfileId(req.user.id);
  if (!profileId) return res.status(404).json({ error: 'not_found' });
  const { rows } = await pool.query(
    'SELECT * FROM digital_profile_links WHERE profile_id = $1 ORDER BY sort_order ASC, created_at ASC',
    [profileId]
  );
  return res.json({ links: rows });
});

// POST /api/profile/links
router.post('/', requireAuth, async (req, res) => {
  const profileId = await getOwnProfileId(req.user.id);
  if (!profileId) return res.status(404).json({ error: 'not_found' });

  const { type, label, url, icon, sort_order, is_visible } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'validation', message: 'Geçerli bir URL girin (http/https).' });
  }
  const safeType = ALLOWED_TYPES.has(type) ? type : 'custom';

  const { rows } = await pool.query(
    `INSERT INTO digital_profile_links (profile_id, type, label, url, icon, sort_order, is_visible)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [profileId, safeType, (label || '').slice(0, 120), url.slice(0, 500), (icon || '').slice(0, 60),
      Number.isInteger(sort_order) ? sort_order : 0, is_visible !== false]
  );
  return res.status(201).json({ link: rows[0] });
});

// PUT /api/profile/links/:id
router.put('/:id', requireAuth, async (req, res) => {
  const owns = await assertOwnsLink(req.user.id, req.params.id);
  if (!owns) return res.status(404).json({ error: 'not_found' });

  const fields = ['type', 'label', 'url', 'icon', 'sort_order', 'is_visible'];
  const updates = [];
  const values = [];
  let i = 1;
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, f)) {
      let val = req.body[f];
      if (f === 'type' && !ALLOWED_TYPES.has(val)) val = 'custom';
      if (f === 'url' && val && !/^https?:\/\//i.test(val)) {
        return res.status(400).json({ error: 'validation', message: 'Geçerli bir URL girin.' });
      }
      updates.push(`${f} = $${i}`);
      values.push(val);
      i += 1;
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'validation' });
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE digital_profile_links SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`,
    values
  );
  return res.json({ link: rows[0] });
});

// DELETE /api/profile/links/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const owns = await assertOwnsLink(req.user.id, req.params.id);
  if (!owns) return res.status(404).json({ error: 'not_found' });
  await pool.query('DELETE FROM digital_profile_links WHERE id = $1', [req.params.id]);
  return res.json({ ok: true });
});

module.exports = router;
