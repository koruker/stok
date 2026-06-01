# StokPro — Google Sheets Stok Takip Sistemi

Google Sheets entegrasyonlu, rol tabanlı stok yönetim uygulaması. Tüm veriler gerçek zamanlı olarak Google Sheets'te saklanır.

---

## 🚀 Kurulum Adımları

### 1. Google Cloud Console Ayarları

1. [Google Cloud Console](https://console.cloud.google.com) adresine gidin.
2. **Yeni proje oluşturun** (veya mevcut bir proje seçin).
3. Sol menüden **APIs & Services > Library** kısmına gidin ve şu iki API'yi etkinleştirin:
   - ✅ **Google Sheets API**
   - ✅ **Google Drive API**

### 2. OAuth 2.0 Client ID Oluşturma

1. **APIs & Services > Credentials** sayfasına gidin.
2. **+ CREATE CREDENTIALS > OAuth client ID** seçin.
3. Application type: **Web application** seçin.
4. **Authorized JavaScript origins** bölümüne ekleyin:
   ```
   http://localhost:8080
   ```
5. **CREATE** butonuna tıklayın.
6. Oluşturulan **Client ID** değerini kopyalayın.

### 3. config.js Dosyasını Düzenleyin

`config.js` dosyasını açın ve `CLIENT_ID` alanını doldurun:

```javascript
const CONFIG = {
  CLIENT_ID: 'BURAYA_CLIENT_ID_YAPISTIRIN',
  SPREADSHEET_ID: '',        // Boş bırakın, otomatik oluşturulur
  INITIAL_ADMIN_EMAIL: 'admin@sirket.com',  // İlk admin email
  // ...
};
```

### 4. Uygulamayı Başlatın

**Windows için:**
```
start.bat dosyasına çift tıklayın
```

**Manuel olarak:**
```bash
python -m http.server 8080
# Tarayıcıda açın: http://localhost:8080
```

### 5. İlk Giriş

1. `http://localhost:8080` adresine gidin.
2. **Google ile Giriş** butonuna tıklayın.
3. Hesabınızı seçin ve izinleri onaylayın.
4. Uygulama otomatik olarak yeni bir Google Spreadsheet oluşturacak.

---

## 👥 Kullanıcı Rolleri

### Normal Kullanıcı
- Ürün listesini görüntüler
- Stoktan ürün çeker (stok azalır)
- Kendi işlem geçmişini görür

### Yönetici (Admin)
- Normal kullanıcı + tüm yetkiler
- Yeni ürün ekler
- Mevcut ürünlere stok girer
- Ürünleri düzenler / siler
- Tüm kullanıcıların işlem geçmişini görür
- Kullanıcıları admin yapar / adminlikten çıkarır

---

## 📊 Google Sheets Yapısı

Uygulama otomatik olarak 4 sekmeli bir Spreadsheet oluşturur:

| Sekme | Açıklama |
|-------|----------|
| `Products` | Tüm ürünler ve stok miktarları |
| `Transactions` | Kim, ne zaman, kaç adet aldı/ekledi |
| `Users` | Giriş yapan kullanıcı bilgileri |
| `Admins` | Admin listesi |

---

## 🔒 Güvenlik Notları

- **config.js** dosyasını Git'e commit etmeyin (CLIENT_ID içerir).
- Spreadsheet ID'sini tüm kullanıcılarla paylaşın (config.js'ye yazın veya kurulum ekranından girin).
- Google Sheets belgesi varsayılan olarak **özeldir** — sadece izin verilen kullanıcılar erişir.

---

## 🛠️ Teknik Detaylar

- **Kimlik Doğrulama**: Google Identity Services (GIS) OAuth 2.0
- **Veritabanı**: Google Sheets API v4
- **Frontend**: Vanilla HTML/CSS/JavaScript (tek sayfalı uygulama)
- **Otomatik Yenileme**: Her 30 saniyede bir (ayarlanabilir)
- **Stok Uyarıları**: Sarı ≤ 10, Kırmızı ≤ 5 (ayarlanabilir)
