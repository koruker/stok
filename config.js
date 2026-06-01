/**
 * StokPro - Yapılandırma Dosyası
 * ================================
 * Bu dosyayı Google API bilgilerinizle doldurun.
 * Kurulum talimatları için README.md dosyasına bakın.
 *
 * ADIMLAR:
 * 1. https://console.cloud.google.com adresine gidin
 * 2. Yeni proje oluşturun
 * 3. "Google Sheets API" ve "Google Drive API" etkinleştirin
 * 4. Credentials > OAuth 2.0 Client ID oluşturun (Web Application)
 *    - Authorized JavaScript origins: http://localhost:8080
 *    - Authorized redirect URIs: http://localhost:8080
 * 5. Client ID'yi aşağıya yapıştırın
 */

const CONFIG = {
  /**
   * Google OAuth 2.0 Client ID
   * Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs
   * Örnek: '123456789-abcdefgh.apps.googleusercontent.com'
   */
  CLIENT_ID: '48721393532-h3phnsf14rj4mpdfsg11l26h4mt64qdr.apps.googleusercontent.com',

  /**
   * Google Sheets Spreadsheet ID (opsiyonel)
   * Boş bırakırsanız uygulama ilk admin girişinde otomatik oluşturur.
   * URL'den alınır: https://docs.google.com/spreadsheets/d/[BURASI_ID]/edit
   */
  SPREADSHEET_ID: '',

  /**
   * İlk admin e-posta adresi
   * Yeni spreadsheet oluşturulduğunda bu e-posta otomatik admin yapılır.
   * Boş bırakırsanız ilk giriş yapan kullanıcı admin olur.
   */
  INITIAL_ADMIN_EMAIL: 'mertkoruker@gmail.com',

  /**
   * Uygulama adı (isteğe bağlı)
   */
  APP_NAME: 'Stok Takibi',

  /**
   * Stok uyarı eşikleri
   */
  STOCK_WARNING_THRESHOLD: 10,   // Sarı uyarı (bu değer veya altı)
  STOCK_CRITICAL_THRESHOLD: 5,   // Kırmızı uyarı (bu değer veya altı)

  /**
   * Otomatik veri yenileme süresi (milisaniye)
   * 0 yazarsanız otomatik yenileme kapalı olur.
   */
  REFRESH_INTERVAL: 30000, // 30 saniye
};
