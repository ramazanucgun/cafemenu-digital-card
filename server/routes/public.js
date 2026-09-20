const express = require('express');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const { pool } = require('../db');
const { recordEvent } = require('./analytics');
const { hashValue } = require('../utils/token');

const router = express.Router();

const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Çok fazla mesaj gönderildi. Lütfen daha sonra tekrar deneyin.' },
});

const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

async function findProfileBySlug(slug) {
  const { rows } = await pool.query(
    'SELECT * FROM digital_profiles WHERE slug = $1 AND deleted_at IS NULL',
    [slug]
  );
  return rows[0] || null;
}

async function findProfileByToken(token) {
  // 1) Direct profile.token match
  let { rows } = await pool.query(
    'SELECT *, \'direct\' AS matched_source FROM digital_profiles WHERE token = $1 AND deleted_at IS NULL',
    [token]
  );
  if (rows[0]) return { profile: rows[0], source: 'qr' };

  // 2) NFC card token match
  ({ rows } = await pool.query(
    `SELECT p.* FROM nfc_cards n
     JOIN digital_profiles p ON p.id = n.profile_id
     WHERE n.token = $1 AND n.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [token]
  ));
  if (rows[0]) return { profile: rows[0], source: 'nfc' };

  // 3) QR code token match
  ({ rows } = await pool.query(
    `SELECT p.* FROM digital_qr_codes q
     JOIN digital_profiles p ON p.id = q.profile_id
     WHERE q.token = $1 AND p.deleted_at IS NULL`,
    [token]
  ));
  if (rows[0]) return { profile: rows[0], source: 'qr' };

  return null;
}

async function loadLinksAndCounts(profileId) {
  const links = await pool.query(
    'SELECT * FROM digital_profile_links WHERE profile_id = $1 AND is_visible = true ORDER BY sort_order ASC, created_at ASC',
    [profileId]
  );
  return links.rows;
}

function renderCard(res, profile, links, source) {
  res.set('X-Robots-Tag', profile.is_public ? 'index, follow' : 'noindex, nofollow');
  return res.render('card', {
    profile,
    links,
    source: source || 'direct',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
  });
}

// GET /c/:token - stable NFC/QR entry point. Never changes even if the slug changes.
router.get('/c/:token', async (req, res) => {
  const found = await findProfileByToken(req.params.token);
  if (!found || !found.profile.is_public) {
    return res.status(404).render('not_found');
  }
  const { profile, source } = found;
  await recordEvent(profile.id, source === 'nfc' ? 'nfc_visit' : 'qr_scan', source, req);
  // Redirect to the current slug so the address bar reflects the latest username,
  // while the physical NFC/QR asset itself never needs to change.
  return res.redirect(302, `/${profile.slug}?src=${source}`);
});

// GET /:slug/vcard.vcf - downloadable vCard
router.get('/:slug/vcard.vcf', async (req, res) => {
  const profile = await findProfileBySlug(req.params.slug);
  if (!profile || !profile.is_public) return res.status(404).send('Not found');

  const escape = (s) => String(s || '').replace(/([,;])/g, '\\$1');
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escape(profile.last_name)};${escape(profile.first_name)};;;`,
    `FN:${escape(`${profile.first_name || ''} ${profile.last_name || ''}`.trim())}`,
    profile.company_name ? `ORG:${escape(profile.company_name)}` : null,
    profile.title ? `TITLE:${escape(profile.title)}` : null,
    profile.phone ? `TEL;TYPE=CELL:${escape(profile.phone)}` : null,
    profile.email ? `EMAIL:${escape(profile.email)}` : null,
    profile.website ? `URL:${escape(profile.website)}` : null,
    profile.address ? `ADR:;;${escape(profile.address)};;;;` : null,
    'END:VCARD',
  ].filter(Boolean).join('\r\n');

  await recordEvent(profile.id, 'save_contact', req.query.src, req);
  res.set('Content-Type', 'text/vcard; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${profile.slug}.vcf"`);
  return res.send(vcard);
});

// POST /api/public/:slug/events - public event tracking used by the card page's JS
router.post('/api/public/:slug/events', eventLimiter, async (req, res) => {
  const profile = await findProfileBySlug(req.params.slug);
  if (!profile) return res.status(404).json({ error: 'not_found' });
  const { event_type, source } = req.body || {};
  await recordEvent(profile.id, event_type, source, req);
  return res.json({ ok: true });
});

// POST /api/public/:slug/leads - public "Bana Ulaşın" form submission
router.post('/api/public/:slug/leads', leadLimiter, async (req, res) => {
  const profile = await findProfileBySlug(req.params.slug);
  if (!profile) return res.status(404).json({ error: 'not_found' });
  if (!profile.lead_form_enabled) return res.status(403).json({ error: 'disabled' });

  const { name, phone, email, message, source } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'validation', message: 'Ad Soyad zorunludur.' });
  }
  if (email && !validator.isEmail(String(email))) {
    return res.status(400).json({ error: 'validation', message: 'Geçersiz e-posta.' });
  }
  const ip = req.ip || 'unknown';
  const ipHash = hashValue(`${process.env.JWT_SECRET || 'salt'}:${ip}`);

  await pool.query(
    `INSERT INTO digital_leads (profile_id, name, phone, email, message, source, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [profile.id, String(name).trim().slice(0, 160), (phone || '').slice(0, 40),
      (email || '').slice(0, 255), (message || '').slice(0, 2000),
      ['nfc', 'qr', 'direct', 'share'].includes(source) ? source : 'direct', ipHash]
  );
  await recordEvent(profile.id, 'lead_submit', source, req);
  return res.status(201).json({ ok: true });
});

// GET /:slug - the public digital card itself. MUST be registered last (catch-all).
router.get('/:slug', async (req, res, next) => {
  const slug = req.params.slug;
  const profile = await findProfileBySlug(slug);

  if (!profile) {
    // Check slug history: if this used to be someone's slug, 301 to their current one.
    const { rows } = await pool.query(
      `SELECT p.slug AS current_slug, p.is_public FROM slug_history h
       JOIN digital_profiles p ON p.id = h.profile_id
       WHERE h.slug = $1 AND p.deleted_at IS NULL
       ORDER BY h.released_at DESC LIMIT 1`,
      [slug]
    );
    if (rows[0] && rows[0].is_public) {
      return res.redirect(301, `/${rows[0].current_slug}`);
    }
    return next(); // fall through to 404 handler
  }

  if (!profile.is_public) {
    return res.status(404).render('not_found');
  }

  const links = await loadLinksAndCounts(profile.id);
  const source = ['nfc', 'qr', 'share'].includes(req.query.src) ? req.query.src : 'direct';
  await recordEvent(profile.id, 'profile_view', source, req);
  return renderCard(res, profile, links, source);
});

module.exports = router;
