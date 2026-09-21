const express = require('express');
const multer = require('multer');
const validator = require('validator');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isSlugAvailable, slugify } = require('../utils/slug');
const { uploadImageBuffer, deleteImageByUrl, isConfigured: r2Configured } = require('../utils/storage');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

// Files are held in memory just long enough to stream them to Cloudflare R2 —
// nothing is written to the server's local (ephemeral) disk.
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('invalid_mime'));
    return cb(null, true);
  },
});

async function getOwnProfile(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM digital_profiles WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

// GET /api/profile - the logged-in user's own profile (IDOR-safe: always scoped to req.user.id)
router.get('/', requireAuth, async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'not_found' });
  const links = await pool.query(
    'SELECT * FROM digital_profile_links WHERE profile_id = $1 ORDER BY sort_order ASC, created_at ASC',
    [profile.id]
  );
  return res.json({ profile, links: links.rows });
});

const EDITABLE_FIELDS = [
  'first_name', 'last_name', 'title', 'company_name', 'bio',
  'phone', 'whatsapp', 'email', 'website', 'address',
  'google_review_url', 'theme', 'font_family', 'primary_color', 'secondary_color',
  'lead_form_enabled', 'is_public',
];

const ALLOWED_THEMES = new Set([
  'minimal', 'corporate', 'luxury', 'dark', 'creative', 'restaurant',
  'premium', 'vibrant', 'editorial',
]);
const ALLOWED_FONTS = new Set(['inter', 'outfit', 'fraunces', 'archivo', 'playfair']);

// PUT /api/profile - update own profile fields (not slug; see /slug endpoint)
router.put('/', requireAuth, async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const values = [];
  let i = 1;
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      let val = req.body[field];
      if (typeof val === 'string') val = val.trim().slice(0, 2000);
      if (field === 'website' && val && !/^https?:\/\//i.test(val)) val = `https://${val}`;
      if (field === 'email' && val && !validator.isEmail(val)) {
        return res.status(400).json({ error: 'validation', message: 'Geçersiz e-posta.' });
      }
      if (field === 'theme' && !ALLOWED_THEMES.has(val)) {
        return res.status(400).json({ error: 'validation', message: 'Geçersiz tema.' });
      }
      if (field === 'font_family' && !ALLOWED_FONTS.has(val)) {
        return res.status(400).json({ error: 'validation', message: 'Geçersiz font.' });
      }
      updates.push(`${field} = $${i}`);
      values.push(val);
      i += 1;
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'validation', message: 'Güncellenecek alan yok.' });

  values.push(profile.id);
  const { rows } = await pool.query(
    `UPDATE digital_profiles SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`,
    values
  );
  return res.json({ profile: rows[0] });
});

// PUT /api/profile/slug - change slug, preserving history + stable token
router.put('/slug', requireAuth, async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'not_found' });

  const requested = slugify(req.body && req.body.slug);
  if (!requested || requested.length < 3) {
    return res.status(400).json({ error: 'validation', message: 'Kullanıcı adı en az 3 karakter olmalı.' });
  }
  if (requested === profile.slug) {
    return res.json({ profile }); // no-op
  }

  const check = await isSlugAvailable(requested, profile.id);
  if (!check.available) {
    return res.status(409).json({ error: 'slug_unavailable', reason: check.reason });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO slug_history (profile_id, slug) VALUES ($1, $2)',
      [profile.id, profile.slug]
    );
    const { rows } = await client.query(
      'UPDATE digital_profiles SET slug = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [requested, profile.id]
    );
    await client.query('COMMIT');
    return res.json({ profile: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[profile/slug]', err);
    return res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

// GET /api/profile/slug-available?slug=xxx
router.get('/slug-available', requireAuth, async (req, res) => {
  const requested = slugify(req.query.slug);
  const profile = await getOwnProfile(req.user.id);
  const check = await isSlugAvailable(requested, profile ? profile.id : null);
  return res.json({ slug: requested, ...check });
});

function uploadHandler(field, column) {
  return [
    (req, res, next) => {
      if (!r2Configured) {
        return res.status(503).json({
          error: 'storage_not_configured',
          message: 'Görsel depolama (Cloudflare R2) henüz yapılandırılmamış. Ortam değişkenlerini kontrol edin.',
        });
      }
      uploader.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ error: 'upload_error', message: 'Görsel yüklenemedi (tip/boyut kontrolü).' });
        return next();
      });
    },
    async (req, res) => {
      const profile = await getOwnProfile(req.user.id);
      if (!profile) return res.status(404).json({ error: 'not_found' });
      if (!req.file) return res.status(400).json({ error: 'validation', message: 'Dosya bulunamadı.' });

      const subdir = { profile_photo: 'profile', cover: 'cover', logo: 'logo' }[field];
      let url;
      try {
        url = await uploadImageBuffer(req.file.buffer, req.file.mimetype, subdir);
      } catch (err) {
        console.error('[upload] R2 upload failed:', err);
        return res.status(502).json({ error: 'upload_failed', message: 'Görsel depolama servisine ulaşılamadı.' });
      }

      const oldUrl = profile[column];
      const { rows } = await pool.query(
        `UPDATE digital_profiles SET ${column} = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [url, profile.id]
      );
      deleteImageByUrl(oldUrl).catch(() => {}); // best-effort cleanup of the replaced image
      return res.json({ profile: rows[0] });
    },
  ];
}

router.post('/upload/profile-photo', requireAuth, ...uploadHandler('profile_photo', 'profile_photo_url'));
router.post('/upload/cover', requireAuth, ...uploadHandler('cover', 'cover_image_url'));
router.post('/upload/logo', requireAuth, ...uploadHandler('logo', 'logo_url'));

module.exports = router;
