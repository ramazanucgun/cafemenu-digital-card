# CafeMenu Digital Card

NFC + QR dijital kartvizit SaaS'ı. **Mevcut CafeMenu (`qrmenu-saas`) projesinden tamamen bağımsız**, kendi backend'i, kendi PostgreSQL veritabanı, kendi kimlik doğrulama sistemi ve kendi frontend'ine sahip yeni bir projedir.

Bu proje mevcut CafeMenu production sistemine (`cafemenu.com.tr`, `app.cafemenu.com.tr`) hiçbir şekilde bağlanmaz, onun veritabanını kullanmaz, onun API'sini çağırmaz ve onun dosyalarını değiştirmez.

## Özellikler

- E-posta/şifre ile kayıt & giriş (bcrypt + JWT, kendi auth sistemi)
- `card.cafemenu.com.tr/kullaniciadi` formatında public dijital kartvizit
- Türkçe karakter normalizasyonlu slug sistemi + reserved slug koruması
- **Stabil NFC/QR token'ı**: kullanıcı adı (slug) değişse bile `/c/TOKEN` adresi bozulmaz; eski slug yeni slug'a 301 ile yönlendirilir
- QR kod üretimi (PNG + SVG, baskıya uygun)
- NFC kart kaydı ve "NFC'ye yazılacak adres" gösterimi
- vCard indirme ("Rehbere Kaydet")
- WhatsApp / telefon / e-posta / website / sosyal medya / özel bağlantılar
- Canlı önizlemeli profil editörü ve dashboard
- Analytics: profil görüntüleme, NFC/QR kaynak takibi, buton tıklamaları, paylaşım, lead
- "Bana Ulaşın" lead formu + rate limiting
- 6 tema: Minimal, Corporate, Luxury, Dark, Creative, Restaurant
- Güvenlik: Helmet, CORS whitelist, rate limiting, parametrized SQL, IDOR koruması, güvenli rastgele token'lar, upload MIME/boyut kontrolü

## Mimari

```
cafemenu-digital-card/
├── server/
│   ├── index.js            # Express app, route wiring, security middleware
│   ├── db.js                # PostgreSQL connection pool (kendi DB'si)
│   ├── migrate.js           # Migration runner
│   ├── migrations/001_init.sql
│   ├── routes/               # auth, profile, links, qr, nfc, analytics, leads, public
│   ├── middleware/auth.js    # JWT doğrulama
│   ├── utils/slug.js         # Türkçe normalizasyon + benzersizlik
│   ├── utils/token.js        # Güvenli rastgele token üretimi
│   └── views/                # card.ejs (public profil), not_found.ejs
├── public/                   # Statik frontend (build adımı gerektirmez)
│   ├── index.html, login.html, register.html, dashboard.html, ...
│   ├── css/ (app.css, themes.css, card.css)
│   └── js/dashboard.js
├── uploads/                   # Kendi görsel depolama alanı
├── tests/run-tests.js         # Otomatik entegrasyon test paketi (47 test)
├── .env.example
└── package.json
```

## Kurulum (Local)

```bash
npm install
cp .env.example .env   # değerleri kendi ortamınıza göre doldurun
createdb cafemenu_digital_card
npm run migrate
npm run dev
```

Uygulama varsayılan olarak `http://localhost:3000` üzerinde çalışır.

## Ortam Değişkenleri

`.env.example` dosyasına bakın. En kritik olanlar:

- `DATABASE_URL` — **sadece bu projeye ait** PostgreSQL veritabanı. Mevcut CafeMenu veritabanını asla göstermeyin.
- `JWT_SECRET` — uzun, rastgele bir değer. Production'da mutlaka değiştirin.
- `APP_URL` — production'da `https://card.cafemenu.com.tr`
- `CORS_ORIGIN` — virgülle ayrılmış izinli origin listesi

## Testler

```bash
npm test
```

`tests/run-tests.js` şunları kapsar: kayıt/giriş, yetkisiz erişim, profil CRUD, Türkçe slug normalizasyonu, reserved/duplicate slug, QR/NFC üretimi ve stabil token yönlendirmesi, **kritik slug değişikliği sonrası QR/NFC/analytics stabilite testi**, lead gönderimi + rate limiting, IDOR koruması, XSS/upload güvenliği (bkz. `tests/adhoc-security-checks.js`).

## Görsel Depolama (Cloudflare R2)

Profil fotoğrafı, cover ve logo yüklemeleri **Cloudflare R2**'ye (S3-uyumlu nesne depolama) gider — sunucunun kendi diskine yazılmaz. Bunun nedeni: Render gibi platformlarda disk "ephemeral"dır (her deploy/restart'ta silinir); R2 kalıcıdır ve Render'ın ücretsiz planında bile çalışır.

`.env` dosyasında `R2_*` değişkenleri tanımlı değilse, uygulamanın geri kalanı normal çalışır ama görsel yükleme uçları `503 storage_not_configured` döner. Kurulum adımları için `.env.example`'daki değişken listesine bakın.


## Production Deploy Notu

- Bu proje mevcut CafeMenu deployment'ından **bağımsız yeni bir servis** olarak deploy edilmelidir (örn. ayrı bir Render/Vercel/Cloudflare servisi).
- `card.cafemenu.com.tr` domaini bu yeni servise yönlendirilmelidir.
- Gerçek bir SMTP/e-posta servisi bağlanmadan şifre sıfırlama e-postaları gönderilmez (MVP'de token sunucu loguna yazılır — bkz. `server/routes/auth.js`).
- `helmet`'in `contentSecurityPolicy` ayarı MVP'de kapalıdır; production'a çıkmadan önce sıkılaştırılmalıdır.
- Görsel yükleme MVP'de resize/EXIF temizleme yapmaz; sadece MIME/uzantı/boyut kontrolü uygular (bkz. "Kalan Sorunlar" final raporda).
