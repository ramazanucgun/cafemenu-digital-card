const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function getOwnProfileId(userId) {
  const { rows } = await pool.query(
    'SELECT id FROM digital_profiles WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  return rows[0] ? rows[0].id : null;
}

// GET /api/leads - list this user's own leads only (IDOR-safe)
router.get('/', requireAuth, async (req, res) => {
  const profileId = await getOwnProfileId(req.user.id);
  if (!profileId) return res.status(404).json({ error: 'not_found' });
  const { rows } = await pool.query(
    'SELECT * FROM digital_leads WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 200',
    [profileId]
  );
  return res.json({ leads: rows });
});

module.exports = router;
