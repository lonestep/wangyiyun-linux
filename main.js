const { app, BrowserWindow, protocol, ipcMain, shell, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isDebug = process.env.DEBUG || process.argv.includes('--debug');
const log = (...args) => { if (isDebug) console.log(...args); };
const logError = (...args) => console.error(...args);

app.setName('netease-cloud-music');
const userDataPath = path.join(app.getPath('appData'), 'netease-cloud-music');
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);

const imageCacheDir = path.join(userDataPath, 'ImageCache');
fs.mkdirSync(imageCacheDir, { recursive: true });

const cookiesFile = path.join(userDataPath, 'cookies.json');
const cookieJar = new Map();

function loadCookies() {
  try {
    if (fs.existsSync(cookiesFile)) {
      const data = JSON.parse(fs.readFileSync(cookiesFile, 'utf-8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.Name && item.Value) {
            cookieJar.set(item.Name, item);
          }
        }
      }
    }
  } catch (err) {
    logError('Failed to load cookies:', err.message);
  }
}

function saveCookies() {
  try {
    fs.writeFileSync(cookiesFile, JSON.stringify(Array.from(cookieJar.values()), null, 2), 'utf-8');
  } catch (err) {
    logError('Failed to save cookies:', err.message);
  }
}

function parseSetCookie(headerStr, defaultDomain = '.music.163.com') {
  if (!headerStr || typeof headerStr !== 'string') return null;
  const parts = headerStr.split(';').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;

  const [name, ...valParts] = parts[0].split('=');
  const value = valParts.join('=');
  let domain = defaultDomain;
  let cookiePath = '/';

  for (let i = 1; i < parts.length; i++) {
    const [k, ...v] = parts[i].split('=');
    const key = (k || '').trim().toLowerCase();
    const val = v.join('=').trim();
    if (key === 'domain' && val) domain = val.startsWith('.') ? val : '.' + val;
    if (key === 'path' && val) cookiePath = val || '/';
  }

  const cleanDomain = domain.replace(/^\./, '');
  return {
    Domain: domain,
    Path: cookiePath,
    Url: `https://${cleanDomain}${cookiePath}`,
    Name: name.trim(),
    Value: value.trim()
  };
}

function storeCookie(item) {
  if (!item || !item.Name) return;
  cookieJar.set(item.Name, item);
  saveCookies();
  try {
    const cleanDomain = item.Domain.replace(/^\./, '');
    session.defaultSession.cookies.set({
      url: item.Url || `https://${cleanDomain}${item.Path || '/'}`,
      name: item.Name,
      value: item.Value,
      domain: item.Domain,
      path: item.Path || '/',
      sameSite: 'no_restriction',
      secure: true
    }).catch(() => {});
  } catch (e) {}
}

function syncCookiesToSession() {
  for (const item of cookieJar.values()) {
    try {
      const cleanDomain = item.Domain.replace(/^\./, '');
      session.defaultSession.cookies.set({
        url: item.Url || `https://${cleanDomain}${item.Path || '/'}`,
        name: item.Name,
        value: item.Value,
        domain: item.Domain,
        path: item.Path || '/',
        sameSite: 'no_restriction',
        secure: true
      }).catch(() => {});
    } catch (e) {}
  }
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('ozone-platform', 'x11');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
  process.exit(0);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'orpheus',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

const BASE_DIR = path.join(__dirname);
const PUB_DIR = path.join(__dirname, 'pub');

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

let mainWindow = null;
const subWindows = new Set();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1022,
    height: 670,
    minWidth: 900,
    minHeight: 600,
    title: '网易云音乐',
    icon: path.join(__dirname, 'icon.png'),
    frame: true,
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  mainWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NMusic/3.1.40.205461 NeteaseMusicDesktop/3.1.40.205461'
  );

  let presented = false;
  const showMainWindow = () => {
    if (!presented && mainWindow && !mainWindow.isDestroyed()) {
      presented = true;
      mainWindow.show();
      mainWindow.focus();
    }
  };

  ipcMain.on('loading-finished', () => showMainWindow());

  mainWindow.webContents.on('did-finish-load', () => {
    const timer = setInterval(async () => {
      try {
        if (!mainWindow || mainWindow.isDestroyed()) {
          clearInterval(timer);
          return;
        }
        const hasContent = await mainWindow.webContents.executeJavaScript(
          'Boolean(document.getElementById("root") && document.getElementById("root").children.length > 0)'
        );
        if (hasContent) {
          clearInterval(timer);
          showMainWindow();
        }
      } catch (e) {
        clearInterval(timer);
        showMainWindow();
      }
    }, 200);

    setTimeout(() => {
      clearInterval(timer);
      showMainWindow();
    }, 4000);
  });

  mainWindow.loadURL('orpheus://orpheus/pub/app.html');
}

// Window Management IPC
ipcMain.on('window-min', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.on('window-max', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.on('window-restore', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) win.unmaximize();
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    if (win === mainWindow) app.quit();
    else win.close();
  }
});

ipcMain.on('open-external', (_, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

ipcMain.on('launch-window', (_, { url, options }) => {
  const subWin = new BrowserWindow({
    width: (options && options.width) || 400,
    height: (options && options.height) || 550,
    parent: mainWindow,
    modal: false,
    show: true,
    autoHideMenuBar: true,
    title: (options && options.title) || '网易云音乐',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  subWindows.add(subWin);
  subWin.on('closed', () => subWindows.delete(subWin));
  subWin.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NMusic/3.1.40.205461 NeteaseMusicDesktop/3.1.40.205461'
  );
  subWin.loadURL(url);
});

// Cookie Synchronization IPC
ipcMain.handle('cookie-get-all', async () => {
  return Array.from(cookieJar.values()).map(c => ({
    Domain: c.Domain,
    Path: c.Path,
    Url: c.Url,
    Name: c.Name,
    Value: c.Value,
    domain: c.Domain,
    path: c.Path,
    url: c.Url,
    name: c.Name,
    value: c.Value
  }));
});

ipcMain.handle('cookie-get', async () => {
  const obj = {};
  for (const [name, item] of cookieJar.entries()) {
    obj[name] = item.Value;
  }
  return obj;
});

ipcMain.handle('cookie-set', async (_, cookie) => {
  if (!cookie) return false;
  const name = cookie.Name || cookie.name;
  const value = cookie.Value !== undefined ? cookie.Value : cookie.value;
  if (!name) return false;

  const domain = cookie.Domain || cookie.domain || '.music.163.com';
  const cookiePath = cookie.Path || cookie.path || '/';
  const cleanDomain = domain.replace(/^\./, '');

  storeCookie({
    Domain: domain.startsWith('.') ? domain : '.' + domain,
    Path: cookiePath,
    Url: cookie.Url || cookie.url || `https://${cleanDomain}${cookiePath}`,
    Name: name,
    Value: value || ''
  });
  return true;
});

ipcMain.handle('cookie-remove', async (_, url, name) => {
  if (name) {
    cookieJar.delete(name);
    saveCookies();
    session.defaultSession.cookies.remove(url || 'https://music.163.com', name).catch(() => {});
  }
  return true;
});

ipcMain.handle('cookie-inject-raw', async (_, rawStr) => {
  if (!rawStr || typeof rawStr !== 'string') return false;
  const entries = rawStr.split(/;;|\n/);
  for (const entry of entries) {
    const parts = entry.split(';').map(s => s.trim()).filter(Boolean);
    if (!parts.length) continue;

    let domain = '.music.163.com';
    let cookiePath = '/';
    const pairs = [];

    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      const lk = k.toLowerCase();
      if (['path', 'expires', 'max-age', 'domain', 'samesite', 'priority', 'httponly', 'secure'].includes(lk)) {
        if (lk === 'domain' && v) domain = v.startsWith('.') ? v : '.' + v;
        if (lk === 'path' && v) cookiePath = v || '/';
      } else {
        pairs.push({ k, v });
      }
    }

    const cleanDomain = domain.replace(/^\./, '');
    for (const { k, v } of pairs) {
      storeCookie({
        Domain: domain,
        Path: cookiePath,
        Url: `https://${cleanDomain}${cookiePath}`,
        Name: k,
        Value: v
      });
    }
  }
  return true;
});

// Native HTTP Fetch proxy
ipcMain.handle('net-fetch', async (_, opts) => {
  try {
    const reqHeaders = {};
    if (Array.isArray(opts.headers)) {
      opts.headers.forEach(h => {
        if (h && h.key) reqHeaders[h.key] = h.value;
      });
    } else if (typeof opts.headers === 'object') {
      Object.assign(reqHeaders, opts.headers);
    }

    const res = await net.fetch(opts.url, {
      method: opts.method || 'GET',
      headers: reqHeaders,
      body: opts.method && !['GET', 'HEAD'].includes(opts.method.toUpperCase()) ? opts.body : undefined
    });

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const headersList = [];
    res.headers.forEach((v, k) => headersList.push({ key: k, value: v }));

    return {
      status: res.status,
      headers: headersList,
      blob: base64,
      error: null
    };
  } catch (err) {
    return {
      status: 500,
      headers: [],
      blob: '',
      error: err.message
    };
  }
});

app.whenReady().then(() => {
  loadCookies();
  syncCookiesToSession();

  // Intercept Set-Cookie responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders;
    if (headers) {
      const cookieKey = Object.keys(headers).find(k => k.toLowerCase() === 'set-cookie');
      const rawCookies = cookieKey ? headers[cookieKey] : null;
      if (rawCookies) {
        const arr = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
        for (const line of arr) {
          for (const sub of line.split(/\r?\n/)) {
            const parsed = parseSetCookie(sub);
            if (parsed && parsed.Name) storeCookie(parsed);
          }
        }
      }
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  // Inject cookies into outgoing 163/126 requests
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    if (details.url.includes('163.com') || details.url.includes('126.net')) {
      const existing = headers['Cookie'] || headers['cookie'] || '';
      const map = new Map();
      if (existing) {
        existing.split(';').forEach(p => {
          const eq = p.indexOf('=');
          if (eq !== -1) {
            const k = p.slice(0, eq).trim();
            const v = p.slice(eq + 1).trim();
            if (k) map.set(k, v);
          }
        });
      }
      for (const [name, item] of cookieJar.entries()) {
        if (!map.has(name) && item.Value) {
          map.set(name, item.Value);
        }
      }
      delete headers['cookie'];
      headers['Cookie'] = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    }
    callback({ requestHeaders: headers });
  });

  // Handle orpheus:// protocol
  protocol.handle('orpheus', async (request) => {
    try {
      // 1. Remote Image Cache: orpheus://cache/?http...
      if (request.url.startsWith('orpheus://cache/?') || request.url.startsWith('orpheus://cache?')) {
        let targetUrl = request.url.replace(/^orpheus:\/\/cache\/?\??/, '');
        if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
          targetUrl = 'http://' + targetUrl.slice('http:/'.length);
        } else if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
          targetUrl = 'https://' + targetUrl.slice('https:/'.length);
        }

        if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
          const cacheKey = crypto.createHash('md5').update(targetUrl).digest('hex');
          const cacheFile = path.join(imageCacheDir, cacheKey);

          if (fs.existsSync(cacheFile)) {
            try {
              const data = fs.readFileSync(cacheFile);
              let mime = 'image/jpeg';
              if (data[0] === 0x89 && data[1] === 0x50) mime = 'image/png';
              else if (data[0] === 0x52 && data[1] === 0x49) mime = 'image/webp';
              else if (data[0] === 0x47 && data[1] === 0x49) mime = 'image/gif';
              return new Response(data, {
                status: 200,
                headers: {
                  'Content-Type': mime,
                  'Access-Control-Allow-Origin': '*',
                  'Cache-Control': 'public, max-age=31536000'
                }
              });
            } catch (e) {}
          }

          try {
            const resp = await net.fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NMusic/3.1.40.205461'
              }
            });
            if (resp.ok) {
              const arrayBuf = await resp.arrayBuffer();
              const buf = Buffer.from(arrayBuf);
              fs.promises.writeFile(cacheFile, buf).catch(() => {});
              const contentType = resp.headers.get('content-type') || 'image/jpeg';
              return new Response(buf, {
                status: 200,
                headers: {
                  'Content-Type': contentType,
                  'Access-Control-Allow-Origin': '*',
                  'Cache-Control': 'public, max-age=31536000'
                }
              });
            }
          } catch (err) {
            logError('Image cache fetch error:', targetUrl, err.message);
          }
        }
      }

      // 2. Local Image: orpheus://image/?path=...
      if (request.url.startsWith('orpheus://image/?path=') || request.url.startsWith('orpheus://image?path=')) {
        const localPath = decodeURIComponent(request.url.replace(/^orpheus:\/\/image\/?\??path=/, ''));
        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
          return new Response(fs.readFileSync(localPath), {
            status: 200,
            headers: {
              'Content-Type': getMime(localPath),
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }

      // 3. Local File: orpheus://file/...
      if (request.url.startsWith('orpheus://file/')) {
        const localPath = decodeURIComponent(request.url.replace(/^orpheus:\/\/file\//, '/'));
        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
          return new Response(fs.readFileSync(localPath), {
            status: 200,
            headers: {
              'Content-Type': getMime(localPath),
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }

      // 4. Static assets
      const urlObj = new URL(request.url);
      let pathname = decodeURIComponent(urlObj.pathname);
      if (pathname.startsWith('/')) pathname = pathname.slice(1);

      let resolvedPath = pathname.startsWith('pub/')
        ? path.join(BASE_DIR, pathname)
        : path.join(PUB_DIR, pathname);

      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        return new Response(fs.readFileSync(resolvedPath), {
          status: 200,
          headers: {
            'Content-Type': getMime(resolvedPath),
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      const directPub = path.join(PUB_DIR, path.basename(pathname));
      if (fs.existsSync(directPub) && fs.statSync(directPub).isFile()) {
        return new Response(fs.readFileSync(directPub), {
          status: 200,
          headers: {
            'Content-Type': getMime(directPub),
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      logError('Protocol error:', err);
      return new Response('Server Error', { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
