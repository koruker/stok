/**
 * StokPro - Ana Uygulama Mantığı (app.js)
 */

const App = (() => {
  // ─── DURUM ────────────────────────────────────────────────────────────────
  const state = {
    user:           null,
    isAdmin:        false,
    products:       [],
    transactions:   [],
    users:          [],
    admins:         [],
    currentPage:    'dashboard',
    loading:        false,
    refreshTimer:   null,
    txFilter:       { type: '', search: '', userEmail: '' },
    productSearch:  '',
    productCategory: '',
  };

  // ─── BAŞLANGIÇ ────────────────────────────────────────────────────────────

  async function bootstrap() {
    // config.js yoksa veya CLIENT_ID boşsa setup ekranını göster
    if (typeof CONFIG === 'undefined' || !CONFIG.CLIENT_ID) {
      showScreen('setup');
      setupSetupScreen();
      return;
    }

    showScreen('login');

    await Auth.init(
      onSignIn,    // giriş callback
      onSignOut,   // çıkış callback
    );
  }

  function setupSetupScreen() {
    const form = document.getElementById('setup-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const clientId = document.getElementById('setup-client-id').value.trim();
      const sheetId  = document.getElementById('setup-sheet-id').value.trim();
      const adminEmail = document.getElementById('setup-admin-email').value.trim();

      if (!clientId) {
        showToast('Lütfen Client ID girin!', 'error');
        return;
      }

      localStorage.setItem('stokpro_client_id', clientId);
      if (sheetId)    localStorage.setItem('stokpro_spreadsheet_id', sheetId);
      if (adminEmail) localStorage.setItem('stokpro_initial_admin', adminEmail);

      showToast('Yapılandırma kaydedildi. Sayfa yenileniyor...', 'success');
      setTimeout(() => location.reload(), 1500);
    });

    // localStorage'dan dolu değerler varsa form'a doldur
    const savedClientId = localStorage.getItem('stokpro_client_id');
    if (savedClientId) {
      const el = document.getElementById('setup-client-id');
      if (el) el.value = savedClientId;
    }
  }

  // ─── GİRİŞ / ÇIKIŞ ───────────────────────────────────────────────────────

  async function onSignIn(user) {
    showLoading(true, 'Hesap doğrulanıyor...');
    try {
      state.user = user;

      // Sheets'i başlat
      await Sheets.init();

      // Kullanıcıyı kaydet / güncelle
      await Sheets.upsertUser(user);

      // Admin kontrolü
      state.isAdmin = await Sheets.isAdmin(user.email);

      // İlk veri yükleme
      await loadAllData();

      showScreen('app');
      renderApp();
      navigateTo('dashboard');

      if (state.isAdmin) {
        showToast(`Hoş geldiniz, ${user.name}! (Admin)`, 'success');
      } else {
        showToast(`Hoş geldiniz, ${user.name}!`, 'success');
      }

      // Otomatik yenileme
      startAutoRefresh();

    } catch (err) {
      console.error('Giriş hatası:', err);
      showToast('Giriş başarısız: ' + err.message, 'error');
      Auth.signOut();
    } finally {
      showLoading(false);
    }
  }

  function onSignOut() {
    state.user = null;
    state.isAdmin = false;
    state.products = [];
    state.transactions = [];
    state.users = [];
    state.admins = [];
    stopAutoRefresh();
    showScreen('login');
    showToast('Çıkış yapıldı.', 'info');
  }

  function signOut() {
    Auth.signOut();
  }

  // ─── VERİ YÜKLEME ─────────────────────────────────────────────────────────

  async function loadAllData() {
    const [products, transactions, users] = await Promise.all([
      Sheets.getProducts(),
      Sheets.getTransactions(),
      Sheets.getUsers(),
    ]);
    state.products     = products;
    state.transactions = transactions;
    state.users        = users;

    if (state.isAdmin) {
      state.admins = await Sheets.getAdmins();
    }
  }

  async function refreshData() {
    try {
      await loadAllData();
      renderCurrentPage();
    } catch (err) {
      console.warn('Veri yenileme hatası:', err.message);
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    if (CONFIG.REFRESH_INTERVAL > 0) {
      state.refreshTimer = setInterval(refreshData, CONFIG.REFRESH_INTERVAL);
    }
  }

  function stopAutoRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  // ─── NAVİGASYON ──────────────────────────────────────────────────────────

  function navigateTo(page) {
    state.currentPage = page;

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    document.querySelectorAll('.page').forEach(el => {
      el.classList.toggle('hidden', el.id !== `page-${page}`);
    });

    renderCurrentPage();
  }

  function renderCurrentPage() {
    switch (state.currentPage) {
      case 'dashboard':    renderDashboard();    break;
      case 'products':     renderProducts();     break;
      case 'transactions': renderTransactions(); break;
      case 'admin':        renderAdminPanel();   break;
    }
  }

  // ─── ANA UYGULAMA RENDER ─────────────────────────────────────────────────

  function renderApp() {
    const user = state.user;

    // Kullanıcı bilgilerini güncelle
    qs('#user-name').textContent    = user.name;
    qs('#user-email').textContent   = user.email;
    qs('#user-role').textContent    = state.isAdmin ? 'Yönetici' : 'Kullanıcı';
    qs('#user-role').className      = 'role-badge ' + (state.isAdmin ? 'admin' : 'user');

    const avatarEl = qs('#user-avatar');
    if (avatarEl) {
      avatarEl.innerHTML = user.picture
        ? `<img src="${user.picture}" alt="${user.name}" class="avatar-img">`
        : `<div class="avatar-initial">${user.name.charAt(0).toUpperCase()}</div>`;
    }

    const avatarTopEl = qs('#topbar-avatar');
    if (avatarTopEl) {
      avatarTopEl.innerHTML = user.picture
        ? `<img src="${user.picture}" alt="${user.name}" class="avatar-img">`
        : `<div class="avatar-initial">${user.name.charAt(0).toUpperCase()}</div>`;
    }

    // Admin menüsünü göster/gizle
    // Kullanıcı e-posta filtresi (sadece admin görür)
    const txUserFilter = qs('#tx-user-filter');
    if (txUserFilter) txUserFilter.style.display = state.isAdmin ? 'block' : 'none';

    // Ürün ekleme butonu (sadece admin görür)
    const addProductWrapper = qs('#admin-add-product-wrapper');
    if (addProductWrapper) addProductWrapper.style.display = state.isAdmin ? 'block' : 'none';

    const adminNavItem = qs('.nav-item[data-page="admin"]');
    if (adminNavItem) {
      adminNavItem.style.display = state.isAdmin ? 'flex' : 'none';
    }

    // Sheets URL
    const sheetsLink = qs('#sheets-link');
    if (sheetsLink) {
      const url = Sheets.getSpreadsheetUrl();
      if (url) {
        sheetsLink.href = url;
        sheetsLink.style.display = 'flex';
      }
    }
  }

  // ─── DASHBOARD ───────────────────────────────────────────────────────────

  function renderDashboard() {
    const { products, transactions, users } = state;

    const totalProducts  = products.length;
    const totalStock     = products.reduce((s, p) => s + p.stock, 0);
    const lowStockCount  = products.filter(p => p.stock <= CONFIG.STOCK_WARNING_THRESHOLD).length;
    const criticalCount  = products.filter(p => p.stock <= CONFIG.STOCK_CRITICAL_THRESHOLD).length;
    const todayTxCount   = transactions.filter(t => isToday(t.dateTime)).length;

    qs('#stat-total-products').textContent   = totalProducts;
    qs('#stat-total-stock').textContent      = totalStock.toLocaleString('tr-TR');
    qs('#stat-low-stock').textContent        = lowStockCount;
    qs('#stat-today-tx').textContent         = todayTxCount;

    // Kritik stok uyarısı
    const criticalEl = qs('#critical-stock-banner');
    if (criticalEl) {
      if (criticalCount > 0) {
        criticalEl.style.display = 'flex';
        criticalEl.querySelector('.banner-text').textContent =
          `${criticalCount} ürünün stoğu kritik seviyede (${CONFIG.STOCK_CRITICAL_THRESHOLD} veya altı)!`;
      } else {
        criticalEl.style.display = 'none';
      }
    }

    // Son işlemler
    const recentTx = transactions.slice(0, 8);
    const recentEl = qs('#recent-transactions');
    if (recentEl) {
      recentEl.innerHTML = recentTx.length
        ? recentTx.map(txRow).join('')
        : '<tr><td colspan="6" class="empty-cell">Henüz işlem yok</td></tr>';
    }

    // En düşük stoklular
    const lowProducts = [...products]
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 5);
    const lowEl = qs('#low-stock-list');
    if (lowEl) {
      lowEl.innerHTML = lowProducts.map(p => `
        <div class="low-stock-item">
          <div class="lsi-info">
            <span class="lsi-name">${esc(p.name)}</span>
            <span class="lsi-cat">${esc(p.category || 'Genel')}</span>
          </div>
          <span class="stock-badge ${stockClass(p.stock)}">${p.stock} ${esc(p.unit)}</span>
        </div>
      `).join('') || '<p class="empty-cell">Ürün yok</p>';
    }
  }

  // ─── ÜRÜNLER ─────────────────────────────────────────────────────────────

  function renderProducts() {
    let products = state.products;

    // Arama filtresi
    if (state.productSearch) {
      const q = state.productSearch.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }

    // Kategori filtresi
    if (state.productCategory) {
      products = products.filter(p => p.category === state.productCategory);
    }

    // Kategorileri hesapla (filtre dropdown için)
    const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
    const catFilter  = qs('#product-category-filter');
    if (catFilter) {
      const current = catFilter.value;
      catFilter.innerHTML = `<option value="">Tüm Kategoriler</option>` +
        categories.map(c => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('');
    }

    const tbody = qs('#products-tbody');
    if (!tbody) return;

    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Ürün bulunamadı</td></tr>';
      return;
    }

    tbody.innerHTML = products.map(p => `
      <tr class="product-row" data-id="${p.id}">
        <td>
          <div class="product-name-cell">
            <span class="product-icon">${categoryIcon(p.category)}</span>
            <div>
              <div class="fw-500">${esc(p.name)}</div>
              ${p.description ? `<div class="text-muted text-sm">${esc(p.description)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><span class="category-tag">${esc(p.category || 'Genel')}</span></td>
        <td>${esc(p.unit)}</td>
        <td>
          <span class="stock-badge ${stockClass(p.stock)}">${p.stock.toLocaleString('tr-TR')} ${esc(p.unit)}</span>
        </td>
        <td class="text-muted text-sm">${esc(p.lastUpdated)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-danger" onclick="App.openStockOutModal('${p.id}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12H4M4 12l8 8M4 12l8-8"/></svg>
              Stok Çek
            </button>
            ${state.isAdmin ? `
            <button class="btn btn-sm btn-success" onclick="App.openStockInModal('${p.id}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M16 4l8 8-8 8"/></svg>
              Stok Gir
            </button>
            <button class="btn btn-sm btn-ghost" onclick="App.openEditProductModal('${p.id}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-sm btn-danger-ghost" onclick="App.confirmDeleteProduct('${p.id}', '${esc(p.name).replace(/'/g, "\\'")}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ─── İŞLEM GEÇMİŞİ ──────────────────────────────────────────────────────

  function renderTransactions() {
    let { type, search, userEmail } = state.txFilter;

    // Admin değilse sadece kendi işlemlerini görsün
    let filtered = state.transactions;
    if (!state.isAdmin) {
      filtered = filtered.filter(t => t.userEmail === state.user.email);
    } else if (userEmail) {
      filtered = filtered.filter(t => t.userEmail === userEmail);
    }
    if (type)   filtered = filtered.filter(t => t.type === type);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t =>
        t.productName.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    }

    const tbody = qs('#transactions-tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">İşlem bulunamadı</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(txRow).join('');
  }

  function txRow(t) {
    const typeClass = t.type === 'GİRİŞ' ? 'badge-success' : 'badge-danger';
    const typeIcon  = t.type === 'GİRİŞ'
      ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M16 4l8 8-8 8"/></svg>'
      : '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12H4M4 12l8 8M4 12l8-8"/></svg>';

    return `
      <tr>
        <td class="text-muted text-sm">${esc(t.dateTime)}</td>
        <td>
          <div class="user-cell">
            <div class="mini-avatar">${t.userName ? t.userName.charAt(0).toUpperCase() : '?'}</div>
            <div>
              <div class="fw-500">${esc(t.userName)}</div>
              <div class="text-muted text-sm">${esc(t.userEmail)}</div>
            </div>
          </div>
        </td>
        <td class="fw-500">${esc(t.productName)}</td>
        <td>
          <span class="badge ${typeClass}">${typeIcon} ${t.type}</span>
        </td>
        <td class="fw-600 text-center">${t.quantity.toLocaleString('tr-TR')}</td>
        <td class="text-center text-muted text-sm">${t.stockBefore} → ${t.stockAfter}</td>
        <td class="text-muted text-sm">${esc(t.description)}</td>
      </tr>
    `;
  }

  // ─── ADMİN PANELİ ────────────────────────────────────────────────────────

  function renderAdminPanel() {
    if (!state.isAdmin) return;

    // Kullanıcı listesi
    const usersEl = qs('#admin-users-list');
    if (usersEl) {
      usersEl.innerHTML = state.users.map(u => `
        <div class="admin-user-card">
          <div class="mini-avatar">${u.name ? u.name.charAt(0).toUpperCase() : '?'}</div>
          <div class="user-info-group">
            <div class="fw-500">${esc(u.name)}</div>
            <div class="text-muted text-sm">${esc(u.email)}</div>
            <div class="text-muted text-sm">Son giriş: ${esc(u.lastLogin)}</div>
          </div>
          <div class="user-stats">
            <span class="stat-chip">${u.totalTransactions} işlem</span>
            ${state.admins.some(a => a.email === u.email)
              ? '<span class="badge badge-warning">Admin</span>'
              : `<button class="btn btn-sm btn-ghost" onclick="App.makeAdmin('${esc(u.email)}', '${esc(u.name)}')">Admin Yap</button>`
            }
          </div>
        </div>
      `).join('') || '<p class="empty-cell">Henüz kayıtlı kullanıcı yok</p>';
    }

    // Admin listesi
    const adminsEl = qs('#admin-admins-list');
    if (adminsEl) {
      adminsEl.innerHTML = state.admins.map(a => `
        <div class="admin-user-card">
          <div class="mini-avatar admin-avatar">${a.name ? a.name.charAt(0).toUpperCase() : '?'}</div>
          <div class="user-info-group">
            <div class="fw-500">${esc(a.name)}</div>
            <div class="text-muted text-sm">${esc(a.email)}</div>
            <div class="text-muted text-sm">Eklendi: ${esc(a.addedDate)}</div>
          </div>
          ${state.admins.length > 1
            ? `<button class="btn btn-sm btn-danger-ghost" onclick="App.removeAdmin('${esc(a.email)}', '${esc(a.name)}')">Adminliği Kaldır</button>`
            : '<span class="badge badge-warning">Son Admin</span>'
          }
        </div>
      `).join('') || '<p class="empty-cell">Admin bulunamadı</p>';
    }

    // Spreadsheet ID bilgisi
    const sheetIdEl = qs('#admin-sheet-id');
    if (sheetIdEl) sheetIdEl.textContent = Sheets.getSpreadsheetId() || 'Yükleniyor...';
  }

  // ─── MODALLAR ─────────────────────────────────────────────────────────────

  function openModal(id) {
    qs('#modal-overlay').classList.remove('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    qs(`#${id}`).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    qs('#modal-overlay').classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.body.style.overflow = '';
  }

  // Stok Çekme Modal
  function openStockOutModal(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    qs('#modal-stock-out-title').textContent = `Stok Çek: ${product.name}`;
    qs('#modal-stock-out-available').textContent = `Mevcut stok: ${product.stock} ${product.unit}`;
    qs('#modal-stock-out-qty').max = product.stock;
    qs('#modal-stock-out-qty').value = 1;
    qs('#modal-stock-out-desc').value = '';
    qs('#modal-stock-out-product-id').value = productId;

    openModal('modal-stock-out');
    qs('#modal-stock-out-qty').focus();
  }

  // Stok Girişi Modal (Admin)
  function openStockInModal(productId) {
    if (!state.isAdmin) return;
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    qs('#modal-stock-in-title').textContent = `Stok Gir: ${product.name}`;
    qs('#modal-stock-in-available').textContent = `Mevcut stok: ${product.stock} ${product.unit}`;
    qs('#modal-stock-in-qty').value = 1;
    qs('#modal-stock-in-desc').value = '';
    qs('#modal-stock-in-product-id').value = productId;

    openModal('modal-stock-in');
    qs('#modal-stock-in-qty').focus();
  }

  // Yeni Ürün Modal (Admin)
  function openAddProductModal() {
    if (!state.isAdmin) return;
    qs('#form-add-product').reset();
    openModal('modal-add-product');
    qs('#add-product-name').focus();
  }

  // Ürün Düzenleme Modal (Admin)
  function openEditProductModal(productId) {
    if (!state.isAdmin) return;
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    qs('#edit-product-id').value          = productId;
    qs('#edit-product-name').value        = product.name;
    qs('#edit-product-category').value    = product.category;
    qs('#edit-product-unit').value        = product.unit;
    qs('#edit-product-description').value = product.description;

    openModal('modal-edit-product');
    qs('#edit-product-name').focus();
  }

  function confirmDeleteProduct(productId, name) {
    if (!state.isAdmin) return;
    qs('#confirm-delete-product-name').textContent = name;
    qs('#confirm-delete-product-id').value = productId;
    openModal('modal-confirm-delete');
  }

  // ─── İŞLEM FORMLARI ──────────────────────────────────────────────────────

  async function handleStockOut(e) {
    e.preventDefault();
    const productId = qs('#modal-stock-out-product-id').value;
    const qty       = parseInt(qs('#modal-stock-out-qty').value);
    const desc      = qs('#modal-stock-out-desc').value.trim();

    if (!qty || qty <= 0) { showToast('Geçerli bir miktar girin', 'error'); return; }

    showLoading(true, 'Stok düşülüyor...');
    closeModal();
    try {
      const result = await Sheets.stockOut(productId, qty, desc, state.user);
      const idx = state.products.findIndex(p => p.id === productId);
      if (idx !== -1) state.products[idx] = result.product;
      state.transactions.unshift(result.transaction);
      renderCurrentPage();
      showToast(`${result.product.name} - ${qty} adet stoktan düşüldü`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function handleStockIn(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const productId = qs('#modal-stock-in-product-id').value;
    const qty       = parseInt(qs('#modal-stock-in-qty').value);
    const desc      = qs('#modal-stock-in-desc').value.trim();

    if (!qty || qty <= 0) { showToast('Geçerli bir miktar girin', 'error'); return; }

    showLoading(true, 'Stok giriliyor...');
    closeModal();
    try {
      const result = await Sheets.stockIn(productId, qty, desc, state.user);
      const idx = state.products.findIndex(p => p.id === productId);
      if (idx !== -1) state.products[idx] = result.product;
      state.transactions.unshift(result.transaction);
      renderCurrentPage();
      showToast(`${result.product.name} - ${qty} adet stok eklendi`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function handleAddProduct(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const name        = qs('#add-product-name').value.trim();
    const category    = qs('#add-product-category').value.trim();
    const unit        = qs('#add-product-unit').value.trim() || 'adet';
    const stock       = parseInt(qs('#add-product-stock').value) || 0;
    const description = qs('#add-product-description').value.trim();

    if (!name) { showToast('Ürün adı zorunlu', 'error'); return; }

    showLoading(true, 'Ürün ekleniyor...');
    closeModal();
    try {
      const product = await Sheets.addProduct({ name, category, unit, stock, description });

      // Eğer stok > 0 ise giriş işlemi de kaydet
      if (stock > 0) {
        const rows = await Sheets.getProducts();
        const created = rows.find(p => p.name === name && p.category === category);
        if (created) {
          // Transaction log for initial stock
          await Sheets._addTransactionRow?.({ // internal – fallback: just skip
            userName: state.user.name, userEmail: state.user.email,
            productId: created.id, productName: created.name,
            type: 'GİRİŞ', quantity: stock, stockBefore: 0, stockAfter: stock,
            description: 'Açılış stoğu',
          });
        }
      }

      state.products.push(product);
      renderCurrentPage();
      showToast(`"${name}" ürünü eklendi`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function handleEditProduct(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const productId   = qs('#edit-product-id').value;
    const name        = qs('#edit-product-name').value.trim();
    const category    = qs('#edit-product-category').value.trim();
    const unit        = qs('#edit-product-unit').value.trim();
    const description = qs('#edit-product-description').value.trim();

    if (!name) { showToast('Ürün adı zorunlu', 'error'); return; }

    showLoading(true, 'Ürün güncelleniyor...');
    closeModal();
    try {
      await Sheets.updateProduct(productId, { name, category, unit, description });
      const idx = state.products.findIndex(p => p.id === productId);
      if (idx !== -1) {
        state.products[idx] = { ...state.products[idx], name, category, unit, description };
      }
      renderCurrentPage();
      showToast(`"${name}" güncellendi`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function handleDeleteProduct(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const productId = qs('#confirm-delete-product-id').value;
    showLoading(true, 'Ürün siliniyor...');
    closeModal();
    try {
      await Sheets.deleteProduct(productId);
      state.products = state.products.filter(p => p.id !== productId);
      renderCurrentPage();
      showToast('Ürün silindi', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function handleAddAdmin(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const email = qs('#admin-new-admin-email').value.trim().toLowerCase();
    if (!email) { showToast('E-posta zorunlu', 'error'); return; }

    showLoading(true, 'Admin ekleniyor...');
    try {
      // Kullanıcı adını bul
      const user = state.users.find(u => u.email.toLowerCase() === email);
      await Sheets.addAdmin(email, user?.name || '', state.user.email);
      state.admins = await Sheets.getAdmins();
      renderAdminPanel();
      qs('#admin-new-admin-email').value = '';
      showToast(`${email} admin yapıldı`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function makeAdmin(email, name) {
    if (!state.isAdmin) return;
    showLoading(true, 'Admin ekleniyor...');
    try {
      await Sheets.addAdmin(email, name, state.user.email);
      state.admins = await Sheets.getAdmins();
      renderAdminPanel();
      showToast(`${name} admin yapıldı`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function removeAdmin(email, name) {
    if (!state.isAdmin) return;
    if (email === state.user.email) {
      showToast('Kendi adminliğinizi kaldıramazsınız!', 'error');
      return;
    }
    showLoading(true, 'Admin kaldırılıyor...');
    try {
      await Sheets.removeAdmin(email);
      state.admins = await Sheets.getAdmins();
      renderAdminPanel();
      showToast(`${name} adminlikten çıkarıldı`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function manualRefresh() {
    showLoading(true, 'Veriler güncelleniyor...');
    try {
      await refreshData();
      showToast('Veriler güncellendi', 'success');
    } catch (err) {
      showToast('Güncelleme hatası: ' + err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // ─── UI YARDIMCILARI ──────────────────────────────────────────────────────

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = qs(`#${name}-screen`);
    if (el) el.classList.remove('hidden');
  }

  function showLoading(visible, text = 'Yükleniyor...') {
    const el = qs('#loading-overlay');
    if (!el) return;
    if (visible) {
      qs('#loading-text').textContent = text;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  let toastTimer = null;
  function showToast(message, type = 'info', duration = 3500) {
    const el = qs('#toast');
    if (!el) return;
    if (toastTimer) clearTimeout(toastTimer);

    el.className = `toast toast-${type} show`;
    el.querySelector('.toast-msg').textContent = message;

    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, duration);
  }

  function stockClass(stock) {
    if (stock <= CONFIG.STOCK_CRITICAL_THRESHOLD) return 'stock-critical';
    if (stock <= CONFIG.STOCK_WARNING_THRESHOLD)  return 'stock-warning';
    return 'stock-ok';
  }

  function categoryIcon(cat = '') {
    const icons = {
      'Elektronik': '💻', 'Kırtasiye': '📎', 'Temizlik': '🧹',
      'Gıda': '🍎', 'İlaç': '💊', 'Tekstil': '👕',
      'Araç': '🔧', 'Ofis': '🗂️', 'Güvenlik': '🔒',
    };
    return icons[cat] || '📦';
  }

  function isToday(dateStr) {
    if (!dateStr) return false;
    const today = new Date().toLocaleDateString('tr-TR');
    return dateStr.startsWith(today);
  }

  function esc(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  // ─── EVENT LISTENER KURULUMU ──────────────────────────────────────────────

  function setupEventListeners() {
    // Navigasyon
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => navigateTo(el.dataset.page));
    });

    // Çıkış
    qs('#btn-signout')?.addEventListener('click', signOut);

    // Modal kapat
    qs('#modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === qs('#modal-overlay')) closeModal();
    });
    document.querySelectorAll('.modal-close').forEach(el => {
      el.addEventListener('click', closeModal);
    });

    // ESC tuşu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Stok çekme formu
    qs('#form-stock-out')?.addEventListener('submit', handleStockOut);

    // Stok girişi formu
    qs('#form-stock-in')?.addEventListener('submit', handleStockIn);

    // Yeni ürün formu
    qs('#form-add-product')?.addEventListener('submit', handleAddProduct);

    // Ürün düzenleme formu
    qs('#form-edit-product')?.addEventListener('submit', handleEditProduct);

    // Ürün silme onayı
    qs('#form-confirm-delete')?.addEventListener('submit', handleDeleteProduct);

    // Admin ekleme formu
    qs('#form-add-admin')?.addEventListener('submit', handleAddAdmin);

    // Ürün arama
    qs('#product-search')?.addEventListener('input', (e) => {
      state.productSearch = e.target.value.trim();
      renderProducts();
    });

    // Kategori filtresi
    qs('#product-category-filter')?.addEventListener('change', (e) => {
      state.productCategory = e.target.value;
      renderProducts();
    });

    // İşlem tipi filtresi
    qs('#tx-type-filter')?.addEventListener('change', (e) => {
      state.txFilter.type = e.target.value;
      renderTransactions();
    });

    // İşlem arama
    qs('#tx-search')?.addEventListener('input', (e) => {
      state.txFilter.search = e.target.value.trim();
      renderTransactions();
    });

    // Kullanıcı filtresi (admin için)
    qs('#tx-user-filter')?.addEventListener('input', (e) => {
      state.txFilter.userEmail = e.target.value.trim();
      renderTransactions();
    });

    // Manuel yenile
    qs('#btn-refresh')?.addEventListener('click', manualRefresh);

    // Admin paneli: yeni ürün butonu
    qs('#btn-add-product')?.addEventListener('click', openAddProductModal);

    // Spreadsheet ID kopyalama
    qs('#btn-copy-sheet-id')?.addEventListener('click', () => {
      const id = Sheets.getSpreadsheetId();
      if (id) {
        navigator.clipboard.writeText(id).then(() => showToast('Spreadsheet ID kopyalandı!', 'success'));
      }
    });
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────

  return {
    init: async () => {
      setupEventListeners();
      await bootstrap();
    },
    // Exposed for inline onclick handlers
    openStockOutModal,
    openStockInModal,
    openEditProductModal,
    confirmDeleteProduct,
    makeAdmin,
    removeAdmin,
    manualRefresh,
    showToast,
    navigateTo,
    openAddProductModal,
  };
})();

// Uygulama başlat
document.addEventListener('DOMContentLoaded', () => App.init());
