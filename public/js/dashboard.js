const TOKEN_KEY = 'cmdc_token';
const token = localStorage.getItem(TOKEN_KEY);
if (!token) window.location.href = '/login';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let state = { profile: null, links: [], user: null, tab: 'overview' };

function toast(msg) {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('unauthorized');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.error || 'İstek başarısız');
  return json;
}

async function apiUpload(path, file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'Yükleme başarısız');
  return json;
}

async function loadProfile() {
  const data = await api('/api/profile');
  state.profile = data.profile;
  state.links = data.links;
  const me = await api('/api/auth/me');
  state.user = me.user;
}

function setActiveTab(tab) {
  state.tab = tab;
  [...nav.querySelectorAll('a[data-tab]')].forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  render();
}

nav.querySelectorAll('a[data-tab]').forEach((a) => a.addEventListener('click', () => setActiveTab(a.dataset.tab)));
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login';
});

const THEME_OPTIONS = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'dark', label: 'Dark' },
  { value: 'creative', label: 'Creative' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'premium', label: 'Premium Koyu (altın, camsı)' },
  { value: 'vibrant', label: 'Modern Canlı (degrade, enerjik)' },
  { value: 'editorial', label: 'Editöryal / Bold (dergi tarzı)' },
];
const FONT_OPTIONS = [
  { value: 'inter', label: 'Inter (Modern Sans, varsayılan)' },
  { value: 'outfit', label: 'Outfit (Yuvarlak Sans)' },
  { value: 'fraunces', label: 'Fraunces (Zarif Serif)' },
  { value: 'archivo', label: 'Archivo (Kalın Grotesk)' },
  { value: 'playfair', label: 'Playfair Display (Klasik Serif)' },
];

function refreshPreview() {
  const frame = document.getElementById('previewFrame');
  if (frame) frame.src = frame.src;
}

function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

// ---------------- OVERVIEW ----------------
function renderOverview() {
  const p = state.profile;
  const cardUrl = `${window.location.origin}/${p.slug}`;
  main.innerHTML = `
    <h2>Genel Bakış</h2>
    <div class="card-box">
      <p>Public profil adresiniz:</p>
      <p><a href="${cardUrl}" target="_blank"><strong>${esc(cardUrl)}</strong></a></p>
      <p style="font-size:13px;color:#6b7280;">Bu adres kullanıcı adınıza (slug) bağlıdır. NFC/QR için değişmeyen stabil bağlantı "NFC Kartım" ve "QR Kodum" sekmelerindedir.</p>
      <p><strong>Hesap planı:</strong> ${esc((state.user && state.user.plan) || 'FREE')}</p>
    </div>
    <div class="card-box">
      <h3 style="margin-top:0;">Canlı Önizleme</h3>
      <div class="preview-frame"><iframe id="previewFrame" src="${cardUrl}"></iframe></div>
    </div>
  `;
}

// ---------------- PROFILE EDITOR ----------------
function renderProfileForm() {
  const p = state.profile;
  main.innerHTML = `
    <h2>Profilimi Düzenle</h2>
    <div class="card-box">
      <h3 style="margin-top:0;">Kullanıcı Adı (Slug)</h3>
      <div class="link-row">
        <span>card.cafemenu.com.tr/</span>
        <input id="slugInput" value="${esc(p.slug)}" maxlength="40">
        <button class="btn secondary" id="checkSlugBtn" type="button">Kontrol Et</button>
        <button class="btn" id="saveSlugBtn" type="button">Kaydet</button>
      </div>
      <p id="slugMsg" style="font-size:13px;color:#6b7280;"></p>
      <p style="font-size:13px;color:#6b7280;">Not: kullanıcı adınızı değiştirseniz bile NFC/QR bağlantınız (<code>/c/${esc(p.token)}</code>) bozulmaz.</p>
    </div>

    <div class="card-box">
      <h3 style="margin-top:0;">Kişisel Bilgiler</h3>
      <form id="profileForm">
        <div class="grid-2">
          <div class="field"><label>Ad</label><input name="first_name" value="${esc(p.first_name)}"></div>
          <div class="field"><label>Soyad</label><input name="last_name" value="${esc(p.last_name)}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Ünvan</label><input name="title" value="${esc(p.title)}"></div>
          <div class="field"><label>Firma</label><input name="company_name" value="${esc(p.company_name)}"></div>
        </div>
        <div class="field"><label>Hakkında</label><textarea name="bio" rows="3">${esc(p.bio)}</textarea></div>

        <h4>İletişim</h4>
        <div class="grid-2">
          <div class="field"><label>Telefon</label><input name="phone" value="${esc(p.phone)}"></div>
          <div class="field"><label>WhatsApp</label><input name="whatsapp" value="${esc(p.whatsapp)}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>E-posta</label><input name="email" value="${esc(p.email)}"></div>
          <div class="field"><label>Website</label><input name="website" value="${esc(p.website)}"></div>
        </div>
        <div class="field"><label>Adres</label><input name="address" value="${esc(p.address)}"></div>
        <div class="field"><label>Google Değerlendirme URL</label><input name="google_review_url" value="${esc(p.google_review_url)}"></div>

        <h4>Tema ve Görünüm</h4>
        <div class="grid-2">
          <div class="field"><label>Tema</label>
            <select name="theme" id="themeSelect">
              ${THEME_OPTIONS.map((t) => `<option value="${t.value}" ${p.theme === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Font</label>
            <select name="font_family">
              ${FONT_OPTIONS.map((f) => `<option value="${f.value}" ${(p.font_family || 'inter') === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Ana Renk (vurgu rengi)</label><input type="color" name="primary_color" value="${esc(p.primary_color)}"></div>
          <div class="field"><label>İkincil Renk (alt metinler)</label><input type="color" name="secondary_color" value="${esc(p.secondary_color)}"></div>
        </div>
        <p style="font-size:12.5px;color:#6b7280;margin-top:-4px;">Not: "Premium Koyu", "Modern Canlı" ve "Editöryal/Bold" temaları kendi özel renk paletiyle gelir; Ana/İkincil Renk esas olarak Minimal, Corporate, Dark, Creative gibi klasik temalarda etkilidir.</p>

        <div class="field">
          <label><input type="checkbox" name="lead_form_enabled" ${p.lead_form_enabled ? 'checked' : ''}> "Bana Ulaşın" formunu göster</label>
        </div>
        <div class="field">
          <label><input type="checkbox" name="is_public" ${p.is_public ? 'checked' : ''}> Profil herkese açık (public)</label>
        </div>

        <button class="btn" type="submit">Kaydet</button>
      </form>
    </div>

    <div class="card-box">
      <h3 style="margin-top:0;">Görseller</h3>
      <div class="grid-2">
        <div class="field"><label>Profil Fotoğrafı</label><input type="file" id="photoInput" accept="image/png,image/jpeg,image/webp"></div>
        <div class="field"><label>Cover</label><input type="file" id="coverInput" accept="image/png,image/jpeg,image/webp"></div>
      </div>
      <div class="field"><label>Logo</label><input type="file" id="logoInput" accept="image/png,image/jpeg,image/webp"></div>
    </div>

    <div class="card-box">
      <h3 style="margin-top:0;">Canlı Önizleme</h3>
      <p style="font-size:12.5px;color:#6b7280;margin-top:-6px;">Kaydettiğinizde otomatik güncellenir.</p>
      <div class="preview-frame"><iframe id="previewFrame" src="${window.location.origin}/${p.slug}"></iframe></div>
    </div>
  `;

  document.getElementById('checkSlugBtn').addEventListener('click', async () => {
    const slug = document.getElementById('slugInput').value.trim();
    const msg = document.getElementById('slugMsg');
    try {
      const data = await api(`/api/profile/slug-available?slug=${encodeURIComponent(slug)}`);
      msg.style.color = data.available ? '#059669' : '#b91c1c';
      msg.textContent = data.available ? 'Bu kullanıcı adı uygun.' : `Uygun değil (${data.reason})`;
    } catch (e) { msg.textContent = e.message; }
  });

  document.getElementById('saveSlugBtn').addEventListener('click', async () => {
    const slug = document.getElementById('slugInput').value.trim();
    try {
      const data = await api('/api/profile/slug', { method: 'PUT', body: JSON.stringify({ slug }) });
      state.profile = data.profile;
      toast('Kullanıcı adı güncellendi.');
      renderProfileForm();
    } catch (e) { document.getElementById('slugMsg').textContent = e.message; document.getElementById('slugMsg').style.color = '#b91c1c'; }
  });

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.lead_form_enabled = fd.has('lead_form_enabled');
    body.is_public = fd.has('is_public');
    try {
      const data = await api('/api/profile', { method: 'PUT', body: JSON.stringify(body) });
      state.profile = data.profile;
      toast('Profil güncellendi.');
      refreshPreview();
    } catch (e2) { toast(e2.message); }
  });

  const bindUpload = (inputId, endpoint) => {
    document.getElementById(inputId).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = await apiUpload(endpoint, file);
        state.profile = data.profile;
        toast('Görsel yüklendi.');
        refreshPreview();
      } catch (err) { toast(err.message); }
    });
  };
  bindUpload('photoInput', '/api/profile/upload/profile-photo');
  bindUpload('coverInput', '/api/profile/upload/cover');
  bindUpload('logoInput', '/api/profile/upload/logo');
}

// ---------------- LINKS ----------------
const LINK_TYPES = ['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'telegram', 'pinterest', 'menu', 'catalog', 'pricelist', 'appointment', 'campaign', 'products', 'portfolio', 'custom'];

function renderLinks() {
  main.innerHTML = `
    <h2>Bağlantılar</h2>
    <div class="card-box">
      <h3 style="margin-top:0;">Yeni Bağlantı Ekle</h3>
      <form id="addLinkForm">
        <div class="grid-2">
          <div class="field"><label>Tür</label>
            <select name="type">${LINK_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Başlık</label><input name="label" maxlength="120" placeholder="Örn: Menü"></div>
        </div>
        <div class="field"><label>URL</label><input name="url" required placeholder="https://..."></div>
        <button class="btn" type="submit">Ekle</button>
      </form>
    </div>
    <div class="card-box">
      <h3 style="margin-top:0;">Mevcut Bağlantılar</h3>
      <div id="linksList"></div>
    </div>
  `;
  renderLinksList();

  document.getElementById('addLinkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/api/profile/links', { method: 'POST', body: JSON.stringify(body) });
      const data = await api('/api/profile'); state.links = data.links;
      renderLinks();
      toast('Bağlantı eklendi.');
    } catch (err) { toast(err.message); }
  });
}

function renderLinksList() {
  const host = document.getElementById('linksList');
  if (!state.links.length) { host.innerHTML = '<p style="color:#6b7280;font-size:14px;">Henüz bağlantı eklenmedi.</p>'; return; }
  host.innerHTML = state.links.map((l) => `
    <div class="link-row" data-id="${l.id}">
      <span style="width:80px;font-size:12px;color:#6b7280;">${esc(l.type)}</span>
      <input class="linkUrl" value="${esc(l.url)}">
      <label style="font-size:12px;"><input type="checkbox" class="linkVisible" ${l.is_visible ? 'checked' : ''}> Görünür</label>
      <button class="btn secondary saveLinkBtn" type="button">Kaydet</button>
      <button class="btn danger delLinkBtn" type="button">Sil</button>
    </div>
  `).join('');

  host.querySelectorAll('.saveLinkBtn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const row = e.target.closest('.link-row');
    const id = row.dataset.id;
    const url = row.querySelector('.linkUrl').value;
    const is_visible = row.querySelector('.linkVisible').checked;
    try {
      await api(`/api/profile/links/${id}`, { method: 'PUT', body: JSON.stringify({ url, is_visible }) });
      toast('Bağlantı güncellendi.');
    } catch (err) { toast(err.message); }
  }));

  host.querySelectorAll('.delLinkBtn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const row = e.target.closest('.link-row');
    const id = row.dataset.id;
    try {
      await api(`/api/profile/links/${id}`, { method: 'DELETE' });
      state.links = state.links.filter((l) => l.id !== id);
      renderLinksList();
      toast('Bağlantı silindi.');
    } catch (err) { toast(err.message); }
  }));
}

// ---------------- QR ----------------
async function renderQr() {
  main.innerHTML = '<h2>QR Kodum</h2><p>Yükleniyor...</p>';
  const data = await api('/api/qr');
  main.innerHTML = `
    <h2>QR Kodum</h2>
    <div class="card-box">
      <p>QR kodunuz her zaman şu stabil adrese yönlenir (kullanıcı adınızı değiştirseniz bile değişmez):</p>
      <p><strong>${esc(data.target_url)}</strong></p>
      <img src="/api/qr/image.png" alt="QR kod" style="width:220px;height:220px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="margin-top:12px;display:flex;gap:10px;">
        <a class="btn secondary" href="/api/qr/image.png" download="qr.png">PNG indir</a>
        <a class="btn secondary" href="/api/qr/image.svg" download="qr.svg">SVG indir</a>
      </div>
    </div>
  `;
}

// ---------------- NFC ----------------
async function renderNfc() {
  main.innerHTML = '<h2>NFC Kartım</h2><p>Yükleniyor...</p>';
  const data = await api('/api/nfc');
  main.innerHTML = `
    <h2>NFC Kartım</h2>
    <div class="card-box">
      <p>NFC'ye yazılacak adres (bu adres kullanıcı adınız değişse bile aynı kalır):</p>
      <div class="link-row"><input readonly value="${esc(data.write_url)}" id="nfcUrlInput"><button class="btn secondary" id="copyNfcBtn" type="button">Kopyala</button></div>
    </div>
    <div class="card-box">
      <h3 style="margin-top:0;">Kayıtlı NFC Kartları</h3>
      <table>
        <thead><tr><th>Ad</th><th>Ürün Tipi</th><th>Durum</th></tr></thead>
        <tbody>${data.cards.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.product_type)}</td><td>${esc(c.status)}</td></tr>`).join('') || '<tr><td colspan="3" style="color:#6b7280;">Henüz NFC kart kaydı yok.</td></tr>'}</tbody>
      </table>
      <form id="addNfcForm" style="margin-top:14px;">
        <div class="grid-2">
          <div class="field"><label>Kart Adı</label><input name="name" value="NFC Kart" maxlength="120"></div>
          <div class="field"><label>Ürün Tipi</label>
            <select name="product_type">
              ${['PVC', 'METAL', 'WOOD', 'ACRYLIC', 'STICKER', 'KEYCHAIN', 'STAND'].map((t) => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn" type="submit">Kart Kaydı Ekle</button>
      </form>
    </div>
  `;
  document.getElementById('copyNfcBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(data.write_url);
    toast('Kopyalandı.');
  });
  document.getElementById('addNfcForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try { await api('/api/nfc', { method: 'POST', body: JSON.stringify(body) }); toast('NFC kart kaydı eklendi.'); renderNfc(); }
    catch (err) { toast(err.message); }
  });
}

// ---------------- ANALYTICS ----------------
async function renderAnalytics(range = '30d') {
  main.innerHTML = '<h2>İstatistikler</h2><p>Yükleniyor...</p>';
  const data = await api(`/api/analytics?range=${range}`);
  const totalsMap = Object.fromEntries(data.totals.map((t) => [t.event_type, t.count]));
  const stat = (label, key) => `<div class="stat-box"><div class="num">${totalsMap[key] || 0}</div><div class="label">${label}</div></div>`;
  main.innerHTML = `
    <h2>İstatistikler</h2>
    <div class="card-box">
      <div style="margin-bottom:14px;">
        ${['today', '7d', '30d', '90d'].map((r) => `<button class="btn ${r === range ? '' : 'secondary'} rangeBtn" data-range="${r}" style="margin-right:6px;">${{ today: 'Bugün', '7d': '7 Gün', '30d': '30 Gün', '90d': '90 Gün' }[r]}</button>`).join('')}
      </div>
      <div class="stat-row">
        ${stat('Profil Görüntüleme', 'profile_view')}
        ${stat('NFC Ziyaret', 'nfc_visit')}
        ${stat('QR Tarama', 'qr_scan')}
        ${stat('WhatsApp Tıklama', 'whatsapp_click')}
        ${stat('Telefon Tıklama', 'phone_click')}
        ${stat('Rehbere Kaydetme', 'save_contact')}
        ${stat('Paylaşım', 'share')}
        ${stat('Talep', 'lead_submit')}
      </div>
    </div>
  `;
  main.querySelectorAll('.rangeBtn').forEach((b) => b.addEventListener('click', () => renderAnalytics(b.dataset.range)));
}

// ---------------- LEADS ----------------
async function renderLeads() {
  main.innerHTML = '<h2>Gelen Talepler</h2><p>Yükleniyor...</p>';
  const data = await api('/api/leads');
  main.innerHTML = `
    <h2>Gelen Talepler</h2>
    <div class="card-box">
      <table>
        <thead><tr><th>Ad Soyad</th><th>Telefon</th><th>E-posta</th><th>Mesaj</th><th>Kaynak</th><th>Tarih</th></tr></thead>
        <tbody>
          ${data.leads.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.phone)}</td><td>${esc(l.email)}</td><td>${esc(l.message)}</td><td>${esc(l.source)}</td><td>${new Date(l.created_at).toLocaleString('tr-TR')}</td></tr>`).join('') || '<tr><td colspan="6" style="color:#6b7280;">Henüz talep yok.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// ---------------- SETTINGS ----------------
function renderSettings() {
  main.innerHTML = `
    <h2>Ayarlar</h2>
    <div class="card-box">
      <h3 style="margin-top:0;">Hesap</h3>
      <p>E-posta: ${esc((state.user && state.user.email) || '')}</p>
      <p>Plan: ${esc((state.user && state.user.plan) || 'FREE')}</p>
    </div>
  `;
}

async function render() {
  if (!state.profile) {
    try { await loadProfile(); } catch (e) { toast(e.message); return; }
  }
  if (state.tab === 'overview') return renderOverview();
  if (state.tab === 'profile') return renderProfileForm();
  if (state.tab === 'links') return renderLinks();
  if (state.tab === 'qr') return renderQr();
  if (state.tab === 'nfc') return renderNfc();
  if (state.tab === 'analytics') return renderAnalytics();
  if (state.tab === 'leads') return renderLeads();
  if (state.tab === 'settings') return renderSettings();
}

render();
