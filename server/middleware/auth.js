const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const cookieToken = req.cookies ? req.cookies.cmdc_token : null;
  const token = bearer || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Giriş yapmanız gerekiyor.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, isAdmin }
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: 'Oturum geçersiz veya süresi dolmuş.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'forbidden', message: 'Yönetici yetkisi gerekli.' });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
