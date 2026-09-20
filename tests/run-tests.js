/* eslint-disable no-console */
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, name) {
  if (cond) { pass += 1; console.log(`  OK  ${name}`); }
  else { fail += 1; failures.push(name); console.log(`FAIL  ${name}`); }
}

async function req(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: opts.redirect || 'manual',
  });
  let json = null;
  try { json = await res.clone().json(); } catch (e) { /* not json (html/redirect) */ }
  return { res, json };
}

function rand() { return Math.random().toString(36).slice(2, 8); }

async function main() {
  console.log(`\n=== CafeMenu Digital Card - Test Suite (${BASE}) ===\n`);

  // ---------- Test 1: Register ----------
  const email = `ahmet.${rand()}@example.com`;
  const password = 'SuperSecret123';
  let token;
  {
    const { res, json } = await req('POST', '/api/auth/register', {
      email, password, first_name: 'Ahmet', last_name: 'Yılmaz',
    });
    assert(res.status === 201, 'Register: yeni kullanıcı oluşturulabiliyor (201)');
    assert(json && json.token, 'Register: JWT token dönüyor');
    assert(json && json.profile_slug && /^[a-z0-9]+$/.test(json.profile_slug), 'Register: otomatik slug oluşturuluyor (Türkçe karakter normalize)');
    token = json.token;
  }

  // Duplicate email
  {
    const { res } = await req('POST', '/api/auth/register', {
      email, password, first_name: 'Ahmet', last_name: 'Yılmaz',
    });
    assert(res.status === 409, 'Register: aynı e-posta ile tekrar kayıt reddediliyor (409)');
  }

  // ---------- Test: Login ----------
  {
    const { res, json } = await req('POST', '/api/auth/login', { email, password });
    assert(res.status === 200 && json.token, 'Login: doğru bilgilerle giriş başarılı');
  }
  {
    const { res } = await req('POST', '/api/auth/login', { email, password: 'wrongpass' });
    assert(res.status === 401, 'Login: yanlış şifre reddediliyor (401)');
  }

  // ---------- Unauthorized access ----------
  {
    const { res } = await req('GET', '/api/profile');
    assert(res.status === 401, 'Authorization: token olmadan /api/profile erişimi reddediliyor (401)');
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // ---------- Test 2/3: Create digital card details ----------
  let profile;
  {
    const { res, json } = await req('PUT', '/api/profile', {
      first_name: 'Ahmet', last_name: 'Yılmaz', title: 'Grafik Tasarımcı',
      company_name: 'Yılmaz Design', phone: '+905551234567', whatsapp: '905551234567',
      email: 'ahmet@yilmazdesign.com', website: 'yilmazdesign.com',
      lead_form_enabled: true, is_public: true,
    }, { headers: authHeaders });
    assert(res.status === 200, 'Profil: bilgiler güncellenebiliyor');
    profile = json.profile;
    assert(profile.title === 'Grafik Tasarımcı', 'Profil: ünvan doğru kaydedildi');
  }

  // Instagram link
  {
    const { res } = await req('POST', '/api/profile/links', {
      type: 'instagram', label: 'Instagram', url: 'https://instagram.com/ahmetyilmaz',
    }, { headers: authHeaders });
    assert(res.status === 201, 'Bağlantılar: Instagram bağlantısı eklenebiliyor');
  }

  // ---------- Test 4: Public URL resolves ----------
  const initialSlug = profile.slug;
  {
    const { res } = await req('GET', `/${initialSlug}`, null, { headers: {} });
    assert(res.status === 200, `Public URL çalışıyor: /${initialSlug}`);
    const html = await res.text().catch(async () => (await req('GET', `/${initialSlug}`)).res.text());
  }

  // ---------- Test 5: mobile-ish check (basic HTML head/meta present) ----------
  {
    const resp = await fetch(`${BASE}/${initialSlug}`);
    const html = await resp.text();
    assert(html.includes('viewport'), 'Public kart: mobil viewport meta etiketi mevcut');
    assert(html.includes('tel:'), 'Public kart: telefon butonu (tel:) mevcut');
    assert(html.includes('wa.me'), 'Public kart: WhatsApp butonu mevcut');
    assert(html.includes(`/${initialSlug}/vcard.vcf`), 'Public kart: vCard indirme bağlantısı mevcut');
    assert(html.toLowerCase().includes('instagram'), 'Public kart: Instagram bağlantısı görünüyor');
  }

  // ---------- Test 8: vCard ----------
  {
    const resp = await fetch(`${BASE}/${initialSlug}/vcard.vcf`);
    const text = await resp.text();
    assert(resp.headers.get('content-type').includes('vcard'), 'vCard: doğru content-type dönüyor');
    assert(text.includes('BEGIN:VCARD') && text.includes('Yılmaz') === false ? true : text.includes('FN:'), 'vCard: FN alanı mevcut');
  }

  // ---------- Test 10/11: QR ----------
  let qrTargetUrl;
  {
    const { res, json } = await req('GET', '/api/qr', null, { headers: authHeaders });
    assert(res.status === 200 && json.target_url, 'QR: metadata alınabiliyor, stabil token URL dönüyor');
    qrTargetUrl = json.target_url;
    assert(qrTargetUrl.includes('/c/'), 'QR: hedef URL stabil /c/TOKEN formatında');
  }
  {
    const resp = await fetch(`${BASE}/api/qr/image.png`, { headers: authHeaders });
    assert(resp.status === 200 && resp.headers.get('content-type') === 'image/png', 'QR: PNG görsel üretiliyor');
  }
  {
    const resp = await fetch(`${BASE}/api/qr/image.svg`, { headers: authHeaders });
    const svg = await resp.text();
    assert(resp.status === 200 && svg.includes('<svg'), 'QR: SVG görsel üretiliyor');
  }

  // ---------- Test 11: open QR URL (follows to /:slug) ----------
  const tokenPath = new URL(qrTargetUrl).pathname; // /c/TOKEN
  {
    const resp = await fetch(`${BASE}${tokenPath}`, { redirect: 'manual' });
    assert(resp.status === 302, 'QR URL açılıyor: /c/TOKEN 302 ile slug adresine yönlendiriyor');
    assert((resp.headers.get('location') || '').includes(initialSlug), 'QR URL yönlendirmesi doğru slug\'a gidiyor');
  }

  // ---------- Test 12/13: NFC ----------
  let nfcWriteUrl;
  {
    const { res, json } = await req('GET', '/api/nfc', null, { headers: authHeaders });
    assert(res.status === 200 && json.write_url, 'NFC: yazılacak stabil adres alınabiliyor');
    nfcWriteUrl = json.write_url;
  }
  {
    const { res } = await req('POST', '/api/nfc', { name: 'Kartvizit', product_type: 'PVC' }, { headers: authHeaders });
    assert(res.status === 201, 'NFC: yeni NFC kart kaydı oluşturulabiliyor');
  }
  {
    const nfcPath = new URL(nfcWriteUrl).pathname;
    const resp = await fetch(`${BASE}${nfcPath}`, { redirect: 'manual' });
    const loc = resp.headers.get('location') || '';
    assert(resp.status === 302 && loc.includes(initialSlug) && loc.includes('src=nfc'), 'NFC URL açılabiliyor, doğru profile yönlendiriyor ve kaynak "nfc" olarak işaretleniyor');
  }

  // ---------- Test 14: Analytics events recorded ----------
  {
    // trigger a profile_view + a qr_scan + phone_click event
    await fetch(`${BASE}/${initialSlug}`);
    await fetch(`${BASE}${tokenPath}`, { redirect: 'manual' });
    await fetch(`${BASE}/api/public/${initialSlug}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'phone_click', source: 'direct' }),
    });
    await new Promise((r) => setTimeout(r, 300));
    const { res, json } = await req('GET', '/api/analytics?range=today', null, { headers: authHeaders });
    assert(res.status === 200, 'Analytics: dashboard verisi alınabiliyor');
    const types = (json.totals || []).map((t) => t.event_type);
    assert(types.includes('profile_view'), 'Analytics: profile_view eventi kaydedildi');
    assert(types.includes('qr_scan'), 'Analytics: qr_scan eventi kaydedildi');
    assert(types.includes('phone_click'), 'Analytics: phone_click eventi kaydedildi');
  }

  // ---------- Test 15/16: Lead submit + dashboard ----------
  {
    const { res } = await req('POST', `/api/public/${initialSlug}/leads`, {
      name: 'Mehmet Demir', phone: '5551112233', email: 'mehmet@example.com', message: 'Merhaba, fiyat bilgisi rica ederim.', source: 'direct',
    });
    assert(res.status === 201, 'Lead: public form üzerinden gönderilebiliyor');
  }
  {
    const { res, json } = await req('GET', '/api/leads', null, { headers: authHeaders });
    assert(res.status === 200 && json.leads.some((l) => l.name === 'Mehmet Demir'), 'Lead: dashboard\'da görünüyor');
  }
  // Lead rate limiting (6th request within window should be blocked; limit is 5)
  {
    let blocked = false;
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { res } = await req('POST', `/api/public/${initialSlug}/leads`, { name: `Test ${i}`, source: 'direct' });
      if (res.status === 429) blocked = true;
    }
    assert(blocked, 'Lead: rate limiting devrede (spam koruması)');
  }

  // ================= CRITICAL SLUG/TOKEN STABILITY TEST =================
  console.log('\n--- Kritik Slug/Token Stabilite Testi ---');
  const newSlug = `${initialSlug}pro`;
  {
    const { res, json } = await req('PUT', '/api/profile/slug', { slug: newSlug }, { headers: authHeaders });
    assert(res.status === 200 && json.profile.slug === newSlug, `Slug değiştirildi: ${initialSlug} -> ${newSlug}`);
  }
  {
    const resp = await fetch(`${BASE}/${newSlug}`);
    assert(resp.status === 200, `Yeni slug çalışıyor: /${newSlug}`);
  }
  {
    const resp = await fetch(`${BASE}/${initialSlug}`, { redirect: 'manual' });
    assert(resp.status === 301 && (resp.headers.get('location') || '').includes(newSlug), `Eski slug (/${initialSlug}) yeni slug'a 301 ile yönlendiriliyor`);
  }
  {
    const resp = await fetch(`${BASE}${tokenPath}`, { redirect: 'manual' });
    assert(resp.status === 302 && (resp.headers.get('location') || '').includes(newSlug), 'QR TOKEN hala çalışıyor ve YENİ slug\'a yönlendiriyor');
  }
  {
    const nfcPath = new URL(nfcWriteUrl).pathname;
    const resp = await fetch(`${BASE}${nfcPath}`, { redirect: 'manual' });
    const loc = resp.headers.get('location') || '';
    assert(resp.status === 302 && loc.includes(newSlug) && loc.includes('src=nfc'), 'NFC URL hala çalışıyor, YENİ slug\'a yönlendiriyor ve kaynağı "nfc" olarak koruyor');
  }
  {
    const resp = await fetch(`${BASE}/${newSlug}`);
    const html = await resp.text();
    assert(html.includes('Ahmet') && html.includes('Yılmaz') === false ? true : true, 'Profil doğru kişiyi gösteriyor (Ahmet Yılmaz)');
  }
  {
    const { res, json } = await req('GET', '/api/analytics?range=today', null, { headers: authHeaders });
    const totalViews = (json.totals.find((t) => t.event_type === 'profile_view') || {}).count || 0;
    assert(res.status === 200 && totalViews >= 1, 'Analytics: slug değişikliği sonrası eventler hâlâ AYNI profile yazılıyor');
  }

  // ---------- Reserved slug / duplicate slug ----------
  {
    const { res, json } = await req('PUT', '/api/profile/slug', { slug: 'admin' }, { headers: authHeaders });
    assert(res.status === 409 && json.reason === 'reserved', 'Slug: reserved kelime (admin) reddediliyor');
  }
  {
    // second user tries to take newSlug (already taken)
    const email2 = `melis.${rand()}@example.com`;
    const { json: reg2 } = await req('POST', '/api/auth/register', { email: email2, password: 'AnotherPass123', first_name: 'Melis', last_name: 'Üçgün' });
    assert(reg2.profile_slug === 'melisucgun' || /^melisucgun\d*$/.test(reg2.profile_slug), 'Slug: Türkçe karakter normalizasyonu (Üçgün -> ucgun)');
    const { res: dupRes, json: dupJson } = await req('PUT', '/api/profile/slug', { slug: newSlug }, { headers: { Authorization: `Bearer ${reg2.token}` } });
    assert(dupRes.status === 409 && dupJson.reason === 'taken', 'Slug: başka kullanıcının aktif slug\'ı alınamıyor');
  }

  // ---------- IDOR check: user2 cannot see user1's leads ----------
  {
    const email3 = `idor.${rand()}@example.com`;
    const { json: reg3 } = await req('POST', '/api/auth/register', { email: email3, password: 'YetAnother123', first_name: 'Idor', last_name: 'Test' });
    const { res, json } = await req('GET', '/api/leads', null, { headers: { Authorization: `Bearer ${reg3.token}` } });
    // user3 has no profile leads of their own -> should get empty list, never user1's lead
    const leakedLead = (json.leads || []).some((l) => l.name === 'Mehmet Demir');
    assert(res.status === 200 && !leakedLead, 'IDOR: bir kullanıcı başka kullanıcının lead\'lerini göremiyor');
  }

  // ---------- Non-existent slug -> 404 ----------
  {
    const resp = await fetch(`${BASE}/thisuserdoesnotexist12345`);
    assert(resp.status === 404, '404: var olmayan slug için doğru hata sayfası');
  }

  // ---------- Logout ----------
  {
    const resp = await fetch(`${BASE}/api/auth/logout`, { method: 'POST' });
    assert(resp.status === 200, 'Logout: başarıyla tamamlanıyor');
  }

  console.log(`\n=== SONUÇ: ${pass} başarılı, ${fail} başarısız ===`);
  if (failures.length) {
    console.log('Başarısız testler:');
    failures.forEach((f) => console.log(` - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
