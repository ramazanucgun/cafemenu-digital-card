const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const isConfigured = !!(
  process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID
  && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_URL
);

let s3 = null;
if (isConfigured) {
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Uploads an image buffer to Cloudflare R2 and returns its public URL.
 * subdir groups objects by purpose, e.g. "profile", "cover", "logo".
 */
async function uploadImageBuffer(buffer, mimetype, subdir) {
  if (!isConfigured) {
    throw new Error('R2_NOT_CONFIGURED');
  }
  const ext = EXT_BY_MIME[mimetype] || 'bin';
  const key = `${subdir}/${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Best-effort delete of a previously uploaded image, given its public URL.
 * Silently no-ops if the URL doesn't belong to this bucket or R2 isn't configured.
 */
async function deleteImageByUrl(url) {
  if (!isConfigured || !url || !url.startsWith(PUBLIC_URL)) return;
  const key = url.slice(PUBLIC_URL.length + 1);
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error('[storage] failed to delete old image (non-fatal):', err.message);
  }
}

module.exports = { uploadImageBuffer, deleteImageByUrl, isConfigured };
