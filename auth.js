/**
 * StokPro - Google Authentication (auth.js)
 * Google Identity Services (GIS) ile OAuth 2.0
 */

const Auth = (() => {
  let tokenClient = null;
  let currentUser = null;
  let accessToken = null;
  let tokenExpiry = 0;
  let onSignInCallback = null;
  let onSignOutCallback = null;
  let pendingTokenResolve = null;

  // JWT payload'ını decode eder (user info için)
  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('JWT decode hatası:', e);
      return null;
    }
  }

  // GIS kütüphanesinin yüklenmesini bekler
  function waitForGIS() {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.accounts) {
        resolve();
        return;
      }
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof google !== 'undefined' && google.accounts) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 50) {
          clearInterval(interval);
          reject(new Error('Google Identity Services yüklenemedi. İnternet bağlantınızı kontrol edin.'));
        }
      }, 200);
    });
  }

  async function init(onSignIn, onSignOut) {
    onSignInCallback = onSignIn;
    onSignOutCallback = onSignOut;

    await waitForGIS();

    if (!CONFIG.CLIENT_ID) {
      console.warn('CLIENT_ID yapılandırılmamış!');
      return;
    }

    // Google Sign-In başlatma (id_token için)
    google.accounts.id.initialize({
      client_id: CONFIG.CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: false,
    });

    // OAuth Token Client (Sheets API erişimi için)
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
        'openid',
        'email',
        'profile',
      ].join(' '),
      callback: handleTokenResponse,
    });

    // Oturum açma butonunu render et
    renderSignInButton();
  }

  function renderSignInButton() {
    const btnContainer = document.getElementById('google-signin-btn');
    if (btnContainer && typeof google !== 'undefined') {
      google.accounts.id.renderButton(btnContainer, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        locale: 'tr',
        width: 280,
      });
    }
  }

  // Google Sign-In callback (credential = id_token)
  async function handleCredentialResponse(response) {
    const payload = parseJwt(response.credential);
    if (!payload) {
      App.showToast('Kimlik doğrulama hatası!', 'error');
      return;
    }

    currentUser = {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      googleId: payload.sub,
    };

    // Şimdi API erişim tokeni iste
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  }

  // OAuth Token callback
  async function handleTokenResponse(tokenResponse) {
    if (tokenResponse.error) {
      console.error('Token hatası:', tokenResponse);
      App.showToast('API erişimi reddedildi: ' + tokenResponse.error, 'error');
      if (pendingTokenResolve) {
        pendingTokenResolve(false);
        pendingTokenResolve = null;
      }
      return;
    }

    accessToken = tokenResponse.access_token;
    tokenExpiry = Date.now() + (parseInt(tokenResponse.expires_in) * 1000);

    if (pendingTokenResolve) {
      pendingTokenResolve(true);
      pendingTokenResolve = null;
    }

    if (onSignInCallback && currentUser) {
      await onSignInCallback(currentUser);
    }
  }

  // Manuel token yenileme (tokenın süresi dolmuşsa)
  async function refreshToken() {
    return new Promise((resolve) => {
      pendingTokenResolve = resolve;
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  // Geçerli bir token döndürür (yoksa yeniler)
  async function ensureValidToken() {
    const bufferMs = 120 * 1000; // 2 dakika buffer
    if (accessToken && Date.now() < tokenExpiry - bufferMs) {
      return accessToken;
    }
    const success = await refreshToken();
    if (!success) throw new Error('Token yenilenemedi. Lütfen yeniden giriş yapın.');
    return accessToken;
  }

  function signIn() {
    if (!CONFIG.CLIENT_ID) {
      App.showToast('Lütfen önce config.js dosyasını yapılandırın!', 'error');
      return;
    }
    // Eğer GIS butonu render edildiyse, direkt token client'i tetikle
    if (tokenClient) {
      // Önce id prompt göster
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback: direkt token iste
          tokenClient.requestAccessToken({ prompt: 'select_account' });
        }
      });
    }
  }

  function signOut() {
    if (currentUser) {
      try {
        google.accounts.id.revoke(currentUser.email, () => {});
      } catch (e) { /* ignore */ }
    }
    if (accessToken) {
      try {
        google.accounts.oauth2.revoke(accessToken, () => {});
      } catch (e) { /* ignore */ }
    }

    currentUser = null;
    accessToken = null;
    tokenExpiry = 0;

    if (onSignOutCallback) onSignOutCallback();
  }

  function getUser() { return currentUser; }
  function getToken() { return accessToken; }
  function isAuthenticated() { return !!(currentUser && accessToken); }

  return {
    init,
    signIn,
    signOut,
    getUser,
    getToken,
    isAuthenticated,
    ensureValidToken,
    renderSignInButton,
  };
})();
