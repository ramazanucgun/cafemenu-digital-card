const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { hashValue } = require('../utils/token');

const router = express.Router();

const VALID_EVENTS = new Set([
  'profile_view', 'nfc_visit', 'qr_scan', 'phone_click', 'whatsapp_click',
  'email_click', 'website_click', 'instagram_click', 'linkedin_click',
  'facebook_click', 'google_click', 'save_contact', 'share', 'lead_submit',
]);
const VALID_SOURCES = new Set(['nfc', 'qr', 'direct', 'share']);

function ipHashFrom(req) {
  // Minimum data collection: only a salted hash of the IP is stored, never the raw IP.
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return hashValue(`${process.env.JWT_SECRET || 'salt'}:${ip}`);
}

function deviceTypeFrom(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (/mobile|iphone|android/.test(ua)) return 'mobile';
  if (/ipad|tablet/.test(ua)) return 'tablet';
  return 'desktop';
}

async function recordEvent(profileId, eventType, source, req) {
  if (!VALID_EVENTS.has(eventType)) return;
  const safeSource = VALID_SOURCES.has(source) ? source : 'direct';
  await pool.query(
    `INSERT INTO digital_analytics_events
      (profile_id, event_type, source, device_type, user_agent, referrer, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      profileId, eventType, safeSource,
      deviceTypeFrom(req.headers['user-agent']),
      (req.headers['user-agent'] || '').slice(0, 500),
      (req.headers['referer'] || '').slice(0, 500),
      ipHashFrom(req),
    ]
  );
}

async function getOwnProfileId(userId) {
  const { rows } = await pool.query(
    'SELECT id FROM digital_profiles WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  return rows[0] ? rows[0].id : null;
}

// POST /api/analytics/events/:slugOrToken - public endpoint used by the public card page (button clicks)
// Mounted separately in index.js at a public path; see server/index.js

// GET /api/analytics - dashboard summary for the logged-in user's profile
router.get('/', requireAuth, async (req, res) => {
  const profileId = await getOwnProfileId(req.user.id);
  if (!profileId) return res.status(404).json({ error: 'not_found' });

  const range = req.query.range || '30d';
  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90 }[range] || 30;

  const totals = await pool.query(
    `SELECT event_type, COUNT(*)::int AS count
     FROM digital_analytics_events
     WHERE profile_id = $1 AND created_at >= now() - ($2 || ' days')::interval
     GROUP BY event_type`,
    [profileId, String(days)]
  );

  const bySource = await pool.query(
    `SELECT source, COUNT(*)::int AS count
     FROM digital_analytics_events
     WHERE profile_id = $1 AND created_at >= now() - ($2 || ' days')::interval
     GROUP BY source`,
    [profileId, String(days)]
  );

  const daily = await pool.query(
    `SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
     FROM digital_analytics_events
     WHERE profile_id = $1 AND event_type = 'profile_view'
       AND created_at >= now() - ($2 || ' days')::interval
     GROUP BY day ORDER BY day ASC`,
    [profileId, String(days)]
  );

  return res.json({
    range,
    totals: totals.rows,
    by_source: bySource.rows,
    daily_views: daily.rows,
  });
});

module.exports = { router, recordEvent };
