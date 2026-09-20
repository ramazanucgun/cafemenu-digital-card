const { pool } = require('../db');

const TR_MAP = {
  ç: 'c', Ç: 'c',
  ğ: 'g', Ğ: 'g',
  ı: 'i', I: 'i',
  İ: 'i',
  ö: 'o', Ö: 'o',
  ş: 's', Ş: 's',
  ü: 'u', Ü: 'u',
};

const RESERVED_FALLBACK = new Set([
  'admin', 'login', 'register', 'logout', 'dashboard', 'api', 'settings',
  'support', 'pricing', 'contact', 'about', 'privacy', 'terms', 'help',
  'c', 'assets', 'static', 'uploads', 'card', 'cafemenu', 'root', 'null',
  'undefined', 'new', 'edit', 'delete', 'public', 'private', 'test', 'www',
]);

function slugify(input) {
  if (!input) return '';
  let s = String(input);
  s = s.replace(/[çÇğĞıIİöÖşŞüÜ]/g, (ch) => TR_MAP[ch] ?? ch);
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip remaining diacritics
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, ''); // remove spaces & special chars entirely (no separators)
  s = s.slice(0, 40);
  return s;
}

async function isReserved(slug) {
  if (RESERVED_FALLBACK.has(slug)) return true;
  const { rows } = await pool.query('SELECT 1 FROM reserved_slugs WHERE slug = $1', [slug]);
  return rows.length > 0;
}

/**
 * Generates a unique, non-reserved slug suggestion based on first/last name.
 * Appends 1, 2, 3... if taken. excludeProfileId lets a profile "keep" its own slug during edits.
 */
async function suggestUniqueSlug(firstName, lastName, excludeProfileId = null) {
  const base = slugify(`${firstName || ''}${lastName || ''}`) || 'kullanici';
  let candidate = base;
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const reserved = await isReserved(candidate);
    let taken = false;
    if (!reserved) {
      const params = excludeProfileId ? [candidate, excludeProfileId] : [candidate];
      const query = excludeProfileId
        ? 'SELECT 1 FROM digital_profiles WHERE slug = $1 AND id <> $2 AND deleted_at IS NULL'
        : 'SELECT 1 FROM digital_profiles WHERE slug = $1 AND deleted_at IS NULL';
      const { rows } = await pool.query(query, params);
      taken = rows.length > 0;
      if (!taken) {
        // also can't reuse a slug still "reserved" in slug_history by ANOTHER profile
        const histParams = excludeProfileId ? [candidate, excludeProfileId] : [candidate];
        const histQuery = excludeProfileId
          ? 'SELECT 1 FROM slug_history WHERE slug = $1 AND profile_id <> $2'
          : 'SELECT 1 FROM slug_history WHERE slug = $1';
        const hist = await pool.query(histQuery, histParams);
        taken = hist.rows.length > 0;
      }
    }
    if (!reserved && !taken) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
}

async function isSlugAvailable(slug, excludeProfileId = null) {
  if (!/^[a-z0-9]{3,40}$/.test(slug)) return { available: false, reason: 'invalid_format' };
  if (await isReserved(slug)) return { available: false, reason: 'reserved' };
  const params = excludeProfileId ? [slug, excludeProfileId] : [slug];
  const query = excludeProfileId
    ? 'SELECT 1 FROM digital_profiles WHERE slug = $1 AND id <> $2 AND deleted_at IS NULL'
    : 'SELECT 1 FROM digital_profiles WHERE slug = $1 AND deleted_at IS NULL';
  const { rows } = await pool.query(query, params);
  if (rows.length > 0) return { available: false, reason: 'taken' };

  const histParams = excludeProfileId ? [slug, excludeProfileId] : [slug];
  const histQuery = excludeProfileId
    ? 'SELECT 1 FROM slug_history WHERE slug = $1 AND profile_id <> $2'
    : 'SELECT 1 FROM slug_history WHERE slug = $1';
  const hist = await pool.query(histQuery, histParams);
  if (hist.rows.length > 0) return { available: false, reason: 'recently_used' };

  return { available: true };
}

module.exports = { slugify, suggestUniqueSlug, isSlugAvailable, isReserved };
