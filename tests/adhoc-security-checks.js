const BASE = 'http://localhost:3000';

async function main() {
  // Register a fresh user with an XSS payload in bio/first name
  const email = `xsstest.${Date.now()}@example.com`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123', first_name: 'Cagri', last_name: 'Sahin' }),
  }).then((r) => r.json());
  const token = reg.token;
  const slug = reg.profile_slug;

  await fetch(`${BASE}/api/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bio: '<script>alert(1)</script> Merhaba & "test"', is_public: true }),
  }).then((r) => r.json());

  const html = await fetch(`${BASE}/${slug}`).then((r) => r.text());
  const xssEscaped = !html.includes('<script>alert(1)</script>') && html.includes('&lt;script&gt;');
  console.log('XSS bio escaped correctly:', xssEscaped);

  // Invalid MIME upload (text file disguised)
  const fd = new FormData();
  fd.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'evil.txt');
  const uploadRes = await fetch(`${BASE}/api/profile/upload/profile-photo`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  console.log('Invalid MIME upload rejected (expect 400):', uploadRes.status);

  // Security headers check
  const headResp = await fetch(`${BASE}/`);
  console.log('X-Content-Type-Options:', headResp.headers.get('x-content-type-options'));
  console.log('X-Frame-Options:', headResp.headers.get('x-frame-options'));
  console.log('Strict-Transport-Security (helmet default, may be absent over http):', headResp.headers.get('strict-transport-security'));

  // CORS: disallowed origin should not get credentials header equal to that origin
  const corsResp = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil-example.com' },
  });
  console.log('CORS: Access-Control-Allow-Origin for disallowed origin:', corsResp.headers.get('access-control-allow-origin'));

  // Slug format rejection (special chars / too short)
  const badSlug = await fetch(`${BASE}/api/profile/slug`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ slug: 'ab' }),
  });
  console.log('Slug too short rejected (expect 400):', badSlug.status);

  // SQLi-ish input in slug query param should just be treated as invalid slug, not error 500
  const sqli = await fetch(`${BASE}/api/profile/slug-available?slug=${encodeURIComponent("'; DROP TABLE users; --")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const sqliJson = await sqli.json();
  console.log('SQLi-style slug query handled safely (expect 200, available:false):', sqli.status, sqliJson.available);
}

main().catch((e) => console.error('CRASH', e));
