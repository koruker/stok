/**
 * StokPro - Google Sheets API Katmanı (sheets.js)
 * Tüm veri okuma/yazma işlemleri burada yapılır.
 */

const Sheets = (() => {
  const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

  let spreadsheetId = null;

  const SHEET = {
    PRODUCTS:     'Products',
    TRANSACTIONS: 'Transactions',
    USERS:        'Users',
    ADMINS:       'Admins',
  };

  const HEADERS = {
    PRODUCTS:     ['ID', 'Ürün Adı', 'Kategori', 'Birim', 'Stok', 'Açıklama', 'Son Güncelleme'],
    TRANSACTIONS: ['ID', 'Tarih/Saat', 'Kullanıcı Adı', 'E-posta', 'Ürün ID', 'Ürün Adı', 'İşlem Tipi', 'Miktar', 'Stok Önce', 'Stok Sonra', 'Açıklama'],
    USERS:        ['E-posta', 'Ad Soyad', 'Fotoğraf', 'İlk Giriş', 'Son Giriş', 'Toplam İşlem'],
    ADMINS:       ['E-posta', 'Ad Soyad', 'Eklenme Tarihi', 'Ekleyen'],
  };

  // ─────────────────────────────────────────
  // API İstek Yardımcısı
  // ─────────────────────────────────────────

  async function apiRequest(method, url, body = null) {
    const token = await Auth.ensureValidToken();

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    if (body !== null) options.body = JSON.stringify(body);

    const response = await fetch(url, options);

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        msg = err?.error?.message || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // Sheets batchUpdate (satır sil, format vs.)
  async function batchUpdate(requests) {
    return apiRequest('POST',
      `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
      { requests }
    );
  }

  // Değer okuma
  async function getValues(range) {
    const data = await apiRequest('GET',
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`
    );
    return data?.values || [];
  }

  // Toplu değer okuma
  async function batchGetValues(ranges) {
    const q = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
    const data = await apiRequest('GET',
      `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${q}`
    );
    return data?.valueRanges || [];
  }

  // Değer güncelleme (PUT)
  async function updateValues(range, values) {
    return apiRequest('PUT',
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { values }
    );
  }

  // Satır ekleme (append)
  async function appendValues(range, values) {
    return apiRequest('POST',
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values }
    );
  }

  // Tüm sekme bilgilerini çek (sheetId bulmak için)
  async function getSheetMetadata() {
    const data = await apiRequest('GET', `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties`);
    return data?.sheets || [];
  }

  async function getSheetId(sheetName) {
    const sheets = await getSheetMetadata();
    const found = sheets.find(s => s.properties.title === sheetName);
    if (!found) throw new Error(`"${sheetName}" sekmesi bulunamadı`);
    return found.properties.sheetId;
  }

  // ─────────────────────────────────────────
  // Spreadsheet Başlatma
  // ─────────────────────────────────────────

  async function createSpreadsheet() {
    const token = await Auth.ensureValidToken();
    const response = await fetch(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${CONFIG.APP_NAME} - Stok Takip Sistemi`,
          locale: 'tr_TR',
          timeZone: 'Europe/Istanbul',
        },
        sheets: Object.values(SHEET).map(title => ({
          properties: { title }
        })),
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || 'Spreadsheet oluşturulamadı');
    }

    const data = await response.json();
    return data.spreadsheetId;
  }

  async function writeHeaders() {
    const batchData = Object.entries(HEADERS).map(([key, headers]) => ({
      range: `${SHEET[key]}!A1:${columnLetter(headers.length)}1`,
      values: [headers],
    }));

    return apiRequest('POST',
      `${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`,
      { valueInputOption: 'RAW', data: batchData }
    );
  }

  async function isInitialized() {
    try {
      const rows = await getValues(`${SHEET.ADMINS}!A1:A1`);
      return rows?.[0]?.[0] === 'E-posta';
    } catch (_) {
      return false;
    }
  }

  async function init() {
    // Önce localStorage'a bak, sonra config'e
    let storedId = localStorage.getItem('stokpro_spreadsheet_id');
    if (CONFIG.SPREADSHEET_ID) {
      storedId = CONFIG.SPREADSHEET_ID;
      localStorage.setItem('stokpro_spreadsheet_id', storedId);
    }

    if (storedId) {
      spreadsheetId = storedId;
      const initialized = await isInitialized();
      if (!initialized) {
        await writeHeaders();
        const user = Auth.getUser();
        const adminEmail = CONFIG.INITIAL_ADMIN_EMAIL || (user && user.email) || '';
        if (adminEmail) {
          await _addAdminRow(adminEmail, user?.name || 'İlk Admin', 'Sistem');
        }
      }
      return spreadsheetId;
    }

    // Yeni spreadsheet oluştur
    App.showToast('Yeni spreadsheet oluşturuluyor...', 'info', 5000);
    const newId = await createSpreadsheet();
    spreadsheetId = newId;
    localStorage.setItem('stokpro_spreadsheet_id', newId);

    await writeHeaders();

    const user = Auth.getUser();
    const adminEmail = CONFIG.INITIAL_ADMIN_EMAIL || (user && user.email) || '';
    if (adminEmail) {
      await _addAdminRow(adminEmail, user?.name || 'İlk Admin', 'Sistem');
    }

    return newId;
  }

  function getSpreadsheetId() { return spreadsheetId; }

  function getSpreadsheetUrl() {
    return spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
      : null;
  }

  // ─────────────────────────────────────────
  // ÜRÜNLER (Products)
  // ─────────────────────────────────────────

  function rowToProduct(row) {
    return {
      id:          row[0] || '',
      name:        row[1] || '',
      category:    row[2] || '',
      unit:        row[3] || 'adet',
      stock:       parseInt(row[4]) || 0,
      description: row[5] || '',
      lastUpdated: row[6] || '',
    };
  }

  async function getProducts() {
    const rows = await getValues(`${SHEET.PRODUCTS}!A:G`);
    if (rows.length <= 1) return [];
    return rows.slice(1).map(rowToProduct).filter(p => p.id);
  }

  async function addProduct(product) {
    const id = generateId();
    const now = nowStr();

    await appendValues(`${SHEET.PRODUCTS}!A:G`, [[
      id,
      product.name,
      product.category || '',
      product.unit || 'adet',
      product.stock || 0,
      product.description || '',
      now,
    ]]);

    return { id, ...product, stock: product.stock || 0, lastUpdated: now };
  }

  async function updateProduct(productId, updates) {
    const rows = await getValues(`${SHEET.PRODUCTS}!A:G`);
    const rowIdx = rows.findIndex(r => r[0] === productId);
    if (rowIdx === -1) throw new Error('Ürün bulunamadı');

    const sheetRow = rowIdx + 1;
    const existing = rows[rowIdx];

    await updateValues(`${SHEET.PRODUCTS}!A${sheetRow}:G${sheetRow}`, [[
      existing[0],
      updates.name        ?? existing[1] ?? '',
      updates.category    ?? existing[2] ?? '',
      updates.unit        ?? existing[3] ?? 'adet',
      updates.stock !== undefined ? updates.stock : (parseInt(existing[4]) || 0),
      updates.description ?? existing[5] ?? '',
      nowStr(),
    ]]);
  }

  async function updateProductStockOnly(productId, newStock) {
    const rows = await getValues(`${SHEET.PRODUCTS}!A:G`);
    const rowIdx = rows.findIndex(r => r[0] === productId);
    if (rowIdx === -1) throw new Error('Ürün bulunamadı');
    const sheetRow = rowIdx + 1;
    await updateValues(`${SHEET.PRODUCTS}!E${sheetRow}:G${sheetRow}`, [[
      newStock,
      rows[rowIdx][5] || '',
      nowStr(),
    ]]);
  }

  async function deleteProduct(productId) {
    const rows = await getValues(`${SHEET.PRODUCTS}!A:G`);
    const rowIdx = rows.findIndex(r => r[0] === productId);
    if (rowIdx === -1) throw new Error('Ürün bulunamadı');

    const sheetId = await getSheetId(SHEET.PRODUCTS);
    await batchUpdate([{
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 }
      }
    }]);
  }

  // ─────────────────────────────────────────
  // İŞLEMLER (Transactions)
  // ─────────────────────────────────────────

  function rowToTransaction(row) {
    return {
      id:           row[0]  || '',
      dateTime:     row[1]  || '',
      userName:     row[2]  || '',
      userEmail:    row[3]  || '',
      productId:    row[4]  || '',
      productName:  row[5]  || '',
      type:         row[6]  || '',
      quantity:     parseInt(row[7])  || 0,
      stockBefore:  parseInt(row[8])  || 0,
      stockAfter:   parseInt(row[9])  || 0,
      description:  row[10] || '',
    };
  }

  async function getTransactions(filters = {}) {
    const rows = await getValues(`${SHEET.TRANSACTIONS}!A:K`);
    if (rows.length <= 1) return [];

    let list = rows.slice(1).map(rowToTransaction).filter(t => t.id);

    if (filters.userEmail)  list = list.filter(t => t.userEmail === filters.userEmail);
    if (filters.productId)  list = list.filter(t => t.productId === filters.productId);
    if (filters.type)       list = list.filter(t => t.type === filters.type);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(t =>
        t.productName.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        t.userEmail.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    }

    return list.reverse(); // En yeni üstte
  }

  async function _addTransactionRow(data) {
    const id  = generateId();
    const now = nowStr();

    await appendValues(`${SHEET.TRANSACTIONS}!A:K`, [[
      id,
      now,
      data.userName,
      data.userEmail,
      data.productId,
      data.productName,
      data.type,
      data.quantity,
      data.stockBefore,
      data.stockAfter,
      data.description || '',
    ]]);

    return { id, dateTime: now, ...data };
  }

  // ─────────────────────────────────────────
  // KULLANICILAR (Users)
  // ─────────────────────────────────────────

  function rowToUser(row) {
    return {
      email:             row[0] || '',
      name:              row[1] || '',
      picture:           row[2] || '',
      firstLogin:        row[3] || '',
      lastLogin:         row[4] || '',
      totalTransactions: parseInt(row[5]) || 0,
    };
  }

  async function getUsers() {
    const rows = await getValues(`${SHEET.USERS}!A:F`);
    if (rows.length <= 1) return [];
    return rows.slice(1).map(rowToUser).filter(u => u.email);
  }

  async function upsertUser(userData) {
    const rows = await getValues(`${SHEET.USERS}!A:F`);
    const now  = nowStr();

    const existIdx = rows.findIndex(r => r[0]?.toLowerCase() === userData.email.toLowerCase());

    if (existIdx === -1) {
      await appendValues(`${SHEET.USERS}!A:F`, [[
        userData.email,
        userData.name,
        userData.picture || '',
        now,
        now,
        0,
      ]]);
    } else {
      const sheetRow = existIdx + 1;
      const existing = rows[existIdx];
      await updateValues(`${SHEET.USERS}!A${sheetRow}:F${sheetRow}`, [[
        userData.email,
        userData.name,
        userData.picture || existing[2] || '',
        existing[3] || now,
        now,
        parseInt(existing[5]) || 0,
      ]]);
    }
  }

  async function incrementUserTxCount(email) {
    const rows = await getValues(`${SHEET.USERS}!A:F`);
    const idx  = rows.findIndex(r => r[0]?.toLowerCase() === email.toLowerCase());
    if (idx === -1) return;
    const sheetRow = idx + 1;
    const current  = parseInt(rows[idx][5]) || 0;
    await updateValues(`${SHEET.USERS}!F${sheetRow}`, [[current + 1]]);
  }

  // ─────────────────────────────────────────
  // ADMİNLER (Admins)
  // ─────────────────────────────────────────

  function rowToAdmin(row) {
    return {
      email:      row[0] || '',
      name:       row[1] || '',
      addedDate:  row[2] || '',
      addedBy:    row[3] || '',
    };
  }

  async function getAdmins() {
    const rows = await getValues(`${SHEET.ADMINS}!A:D`);
    if (rows.length <= 1) return [];
    return rows.slice(1).map(rowToAdmin).filter(a => a.email);
  }

  async function isAdmin(email) {
    const admins = await getAdmins();
    return admins.some(a => a.email.toLowerCase() === email.toLowerCase());
  }

  async function _addAdminRow(email, name, addedBy) {
    const now = nowStr();
    await appendValues(`${SHEET.ADMINS}!A:D`, [[email, name || '', now, addedBy || '']]);
  }

  async function addAdmin(email, name, addedBy) {
    const already = await isAdmin(email);
    if (already) throw new Error('Bu kullanıcı zaten admin');
    await _addAdminRow(email, name, addedBy);
  }

  async function removeAdmin(email) {
    const rows = await getValues(`${SHEET.ADMINS}!A:D`);
    const rowIdx = rows.findIndex(r => r[0]?.toLowerCase() === email.toLowerCase());
    if (rowIdx === -1) throw new Error('Admin bulunamadı');
    if (rowIdx === 0) throw new Error('Başlık satırı silinemez');

    const sheetId = await getSheetId(SHEET.ADMINS);
    await batchUpdate([{
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 }
      }
    }]);
  }

  // ─────────────────────────────────────────
  // STOK İŞLEMLERİ
  // ─────────────────────────────────────────

  async function stockIn(productId, quantity, description, user) {
    if (quantity <= 0) throw new Error('Miktar 0\'dan büyük olmalı');

    const products = await getProducts();
    const product  = products.find(p => p.id === productId);
    if (!product) throw new Error('Ürün bulunamadı');

    const stockBefore = product.stock;
    const stockAfter  = stockBefore + quantity;

    await updateProductStockOnly(productId, stockAfter);

    const tx = await _addTransactionRow({
      userName:    user.name,
      userEmail:   user.email,
      productId,
      productName: product.name,
      type:        'GİRİŞ',
      quantity,
      stockBefore,
      stockAfter,
      description,
    });

    await incrementUserTxCount(user.email);

    return { product: { ...product, stock: stockAfter }, transaction: tx };
  }

  async function stockOut(productId, quantity, description, user) {
    if (quantity <= 0) throw new Error('Miktar 0\'dan büyük olmalı');

    const products = await getProducts();
    const product  = products.find(p => p.id === productId);
    if (!product) throw new Error('Ürün bulunamadı');

    if (product.stock < quantity) {
      throw new Error(`Yetersiz stok! Mevcut: ${product.stock} ${product.unit}, Talep: ${quantity}`);
    }

    const stockBefore = product.stock;
    const stockAfter  = stockBefore - quantity;

    await updateProductStockOnly(productId, stockAfter);

    const tx = await _addTransactionRow({
      userName:    user.name,
      userEmail:   user.email,
      productId,
      productName: product.name,
      type:        'ÇIKIŞ',
      quantity,
      stockBefore,
      stockAfter,
      description,
    });

    await incrementUserTxCount(user.email);

    return { product: { ...product, stock: stockAfter }, transaction: tx };
  }

  // ─────────────────────────────────────────
  // YARDIMCILAR
  // ─────────────────────────────────────────

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function columnLetter(n) {
    let result = '';
    while (n > 0) {
      result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }

  function nowStr() {
    return new Date().toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  return {
    init,
    getSpreadsheetId,
    getSpreadsheetUrl,
    // Products
    getProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    // Transactions
    getTransactions,
    // Users
    getUsers,
    upsertUser,
    // Admins
    getAdmins,
    isAdmin,
    addAdmin,
    removeAdmin,
    // Stock ops
    stockIn,
    stockOut,
  };
})();
