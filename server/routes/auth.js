const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { generateToken, hashValue } = require('../utils/token');
const { suggestUniqueSlug } = require('../utils/slug');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.' },
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, isAdmin: user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function setAuthCookie(res, token) {
  res.cookie('cmdc_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body || {};
    if (!email || !validator.isEmail(String(email))) {
      return res.status(400).json({ error: 'validation', message: 'Geçerli bir e-posta girin.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'validation', message: 'Şifre en az 8 karakter olmalı.' });
    }
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'validation', message: 'Ad ve soyad zorunludur.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'duplicate_email', message: 'Bu e-posta zaten kayıtlı.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name, is_admin, plan`,
      [normalizedEmail, passwordHash, first_name.trim(), last_name.trim()]
    );
    const user = userResult.rows[0];

    // Auto-create a default (private-until-published) digital profile for convenience
    const slug = await suggestUniqueSlug(first_name, last_name);
    const token = generateToken();
    await pool.query(
      `INSERT INTO digital_profiles (user_id, slug, token, first_name, last_name, email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, slug, token, first_name.trim(), last_name.trim(), normalizedEmail]
    );

    const jwtToken = signToken(user);
    setAuthCookie(res, jwtToken);
    return res.status(201).json({ token: jwtToken, user, profile_slug: slug });
  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'server_error', message: 'Kayıt sırasında bir hata oluştu.' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'validation', message: 'E-posta ve şifre zorunludur.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [normalizedEmail]
    );
    // Constant-shape response to avoid user enumeration via timing/content differences
    const user = rows[0];
    const hashToCompare = user ? user.password_hash : '$2a$12$invalidsaltinvalidsaltinvalidsaltinva';
    const valid = await bcrypt.compare(String(password), hashToCompare);

    if (!user || !valid) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'E-posta veya şifre hatalı.' });
    }

    const jwtToken = signToken(user);
    setAuthCookie(res, jwtToken);
    return res.json({
      token: jwtToken,
      user: {
        id: user.id, email: user.email, first_name: user.first_name,
        last_name: user.last_name, is_admin: user.is_admin, plan: user.plan,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'server_error', message: 'Giriş sırasında bir hata oluştu.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('cmdc_token');
  return res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, first_name, last_name, is_admin, plan FROM users WHERE id = $1 AND deleted_at IS NULL',
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  return res.json({ user: rows[0] });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body || {};
  // Always respond the same way, regardless of whether the account exists,
  // to avoid leaking which emails are registered.
  if (email && validator.isEmail(String(email))) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (rows[0]) {
      const rawToken = generateToken();
      const tokenHash = hashValue(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await pool.query(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [rows[0].id, tokenHash, expiresAt]
      );
      // In production this would be emailed, not returned. No real email service
      // is wired up in this MVP, so we log it server-side for manual testing only.
      console.log(`[auth/forgot-password] reset token for ${normalizedEmail}: ${rawToken}`);
    }
  }
  return res.json({ ok: true, message: 'Eğer bu e-posta kayıtlıysa, sıfırlama bağlantısı gönderildi.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'validation', message: 'Geçersiz istek.' });
    }
    const tokenHash = hashValue(String(token));
    const { rows } = await pool.query(
      `SELECT * FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash]
    );
    if (!rows[0]) {
      return res.status(400).json({ error: 'invalid_token', message: 'Bağlantı geçersiz veya süresi dolmuş.' });
    }
    const passwordHash = await bcrypt.hash(String(password), 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
      passwordHash, rows[0].user_id,
    ]);
    await pool.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [rows[0].id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
