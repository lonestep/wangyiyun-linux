const { ipcRenderer, clipboard } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const EAPI_KEY = Buffer.from('e82ckenh8dichen8', 'utf8');
const CACHE_KEY = Buffer.from(')(13daqP@ssw0rd~', 'utf8');

const userHome = os.homedir();
const userMusicDir = path.join(userHome, 'Music');
const userCacheDir = path.join(userHome, '.cache', 'netease-cloud-music');

function detectLinuxDistro() {
  const info = {
    prettyName: 'Linux',
    id: 'linux',
    versionId: ''
  };
  try {
    if (fs.existsSync('/etc/os-release')) {
      const content = fs.readFileSync('/etc/os-release', 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const [k, ...rest] = line.split('=');
        if (!k || !rest.length) continue;
        const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
        if (k === 'PRETTY_NAME' && val) info.prettyName = val;
        if (k === 'ID' && val) info.id = val.toLowerCase();
        if (k === 'VERSION_ID' && val) info.versionId = val;
      }
    }
  } catch (e) {}
  return info;
}

const linuxDistro = detectLinuxDistro();
const distroSlug = `${linuxDistro.id}${linuxDistro.versionId ? '-' + linuxDistro.versionId : ''}`.replace(/[^a-z0-9.-]/gi, '-');

window._enterAppTime = Date.now();
window.withDevServer = false;
window.isElectron = true;
window.DESKTOP_SOURCE = 'pc';

function tryExtractLoginCookies(text) {
  try {
    if (!text || typeof text !== 'string') return;
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
    const data = JSON.parse(trimmed);
    if (data && (data.code === 803 || data.code === 200) && data.cookie) {
      ipcRenderer.invoke('cookie-inject-raw', data.cookie).catch(() => {});
    }
  } catch (e) {}
}

// Intercept window.fetch to capture QR code login cookies
const origFetch = window.fetch;
window.fetch = async function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
  const res = await origFetch.apply(this, args);
  try {
    if (url.includes('/login') || url.includes('/cellphone') || url.includes('/qr')) {
      const clone = res.clone();
      clone.text().then(text => {
        tryExtractLoginCookies(text);
      }).catch(() => {});
    }
  } catch (e) {}
  return res;
};

// Intercept XMLHttpRequest to capture login cookies
const origXHROpen = XMLHttpRequest.prototype.open;
const origXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  this._reqUrl = url;
  this._reqMethod = method;
  return origXHROpen.call(this, method, url, ...rest);
};
XMLHttpRequest.prototype.send = function(body) {
  this.addEventListener('load', function() {
    try {
      const url = String(this._reqUrl || '');
      if (url.includes('/login')) {
        tryExtractLoginCookies(this.responseText);
      }
    } catch (e) {}
  });
  return origXHRSend.call(this, body);
};

const configStorage = {};
try {
  const saved = localStorage.getItem('ncm_config_store');
  if (saved) Object.assign(configStorage, JSON.parse(saved));
} catch (e) {}

const tempStorage = new Map();
const fileStorage = new Map();

const eventListeners = {};

// Desktop Lyric Floating Overlay Engine
let desktopLyricVisible = false;
let desktopLyricLocked = false;
let desktopLyricLines = [];
let desktopTransLines = [];
let desktopLyricOffsetMs = 0;
let desktopLyricSlogan = '网易云音乐';
let desktopLyricSongTitle = '';
let desktopLyricEl = null;
let desktopLyricMainTextEl = null;
let desktopLyricSubTextEl = null;

function parseLrcText(rawLrc) {
  if (!rawLrc || typeof rawLrc !== 'string') return [];
  const result = [];
  const lines = rawLrc.split(/\r?\n/);
  const timeReg = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of lines) {
    const text = line.replace(timeReg, '').trim();
    let match;
    timeReg.lastIndex = 0;
    while ((match = timeReg.exec(line)) !== null) {
      const min = parseInt(match[1], 10) || 0;
      const sec = parseInt(match[2], 10) || 0;
      const fracStr = match[3] || '0';
      const frac = parseInt(fracStr.padEnd(3, '0').slice(0, 3), 10) || 0;
      const timeSec = min * 60 + sec + frac / 1000;
      if (text) {
        result.push({ time: timeSec, text });
      }
    }
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

function ensureDesktopLyricDom() {
  if (desktopLyricEl || !document.body) return desktopLyricEl;

  const container = document.createElement('div');
  container.id = 'ncm-linux-desktop-lyric';
  container.style.cssText = [
    'position: fixed',
    'left: 50%',
    'bottom: 84px',
    'transform: translateX(-50%)',
    'min-width: 420px',
    'max-width: 78vw',
    'padding: 10px 28px',
    'border-radius: 10px',
    'background: rgba(20, 20, 24, 0.72)',
    'backdrop-filter: blur(8px)',
    'box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35)',
    'z-index: 99999',
    'text-align: center',
    'user-select: none',
    'cursor: move',
    'display: none',
    'transition: background 0.2s ease'
  ].join(';');

  const closeBtn = document.createElement('div');
  closeBtn.textContent = '×';
  closeBtn.title = '关闭桌面歌词';
  closeBtn.style.cssText = [
    'position: absolute',
    'top: 4px',
    'right: 10px',
    'font-size: 18px',
    'line-height: 18px',
    'color: rgba(255, 255, 255, 0.65)',
    'cursor: pointer',
    'padding: 2px 4px'
  ].join(';');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setDesktopLyricVisible(false);
    channelObj.emit('player.ondesktoplyricaction', 'close');
  });

  const mainLine = document.createElement('div');
  mainLine.style.cssText = [
    'font-size: 20px',
    'font-weight: 600',
    'line-height: 1.4',
    'color: #ff6b6b',
    'text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85)',
    'white-space: nowrap',
    'overflow: hidden',
    'text-overflow: ellipsis'
  ].join(';');
  mainLine.textContent = desktopLyricSlogan;

  const subLine = document.createElement('div');
  subLine.style.cssText = [
    'font-size: 14px',
    'font-weight: 400',
    'line-height: 1.35',
    'margin-top: 4px',
    'color: rgba(255, 255, 255, 0.85)',
    'text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8)',
    'white-space: nowrap',
    'overflow: hidden',
    'text-overflow: ellipsis'
  ].join(';');

  container.appendChild(closeBtn);
  container.appendChild(mainLine);
  container.appendChild(subLine);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  container.addEventListener('mousedown', (e) => {
    if (desktopLyricLocked || e.target === closeBtn) return;
    dragging = true;
    const rect = container.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    container.style.transform = 'none';
    container.style.left = `${origLeft}px`;
    container.style.top = `${origTop}px`;
    container.style.bottom = 'auto';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    container.style.left = `${Math.max(0, Math.min(window.innerWidth - 100, origLeft + dx))}px`;
    container.style.top = `${Math.max(0, Math.min(window.innerHeight - 50, origTop + dy))}px`;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  document.body.appendChild(container);
  desktopLyricEl = container;
  desktopLyricMainTextEl = mainLine;
  desktopLyricSubTextEl = subLine;
  return desktopLyricEl;
}

function setDesktopLyricVisible(visible) {
  desktopLyricVisible = Boolean(visible);
  const el = ensureDesktopLyricDom();
  if (el) {
    el.style.display = desktopLyricVisible ? 'block' : 'none';
    if (desktopLyricVisible) updateDesktopLyricProgress(audioEl ? audioEl.currentTime : 0);
  }
}

function updateDesktopLyricProgress(curSec) {
  if (!desktopLyricVisible) return;
  const el = ensureDesktopLyricDom();
  if (!el || !desktopLyricMainTextEl || !desktopLyricSubTextEl) return;

  if (!desktopLyricLines.length) {
    desktopLyricMainTextEl.textContent = desktopLyricSongTitle || desktopLyricSlogan || '网易云音乐';
    desktopLyricSubTextEl.textContent = '';
    return;
  }

  const effectiveTime = (curSec || 0) - (desktopLyricOffsetMs / 1000);
  let idx = -1;
  for (let i = 0; i < desktopLyricLines.length; i++) {
    if (effectiveTime >= desktopLyricLines[i].time) {
      idx = i;
    } else {
      break;
    }
  }

  if (idx === -1) {
    desktopLyricMainTextEl.textContent = desktopLyricLines[0].text;
    desktopLyricSubTextEl.textContent = desktopLyricLines[1] ? desktopLyricLines[1].text : '';
    return;
  }

  const curLine = desktopLyricLines[idx];
  desktopLyricMainTextEl.textContent = curLine ? curLine.text : '';

  if (desktopTransLines.length > 0 && curLine) {
    let transText = '';
    for (let j = 0; j < desktopTransLines.length; j++) {
      if (Math.abs(desktopTransLines[j].time - curLine.time) < 0.8) {
        transText = desktopTransLines[j].text;
        break;
      }
    }
    desktopLyricSubTextEl.textContent = transText || (desktopLyricLines[idx + 1] ? desktopLyricLines[idx + 1].text : '');
  } else {
    desktopLyricSubTextEl.textContent = desktopLyricLines[idx + 1] ? desktopLyricLines[idx + 1].text : '';
  }
}

// HTML5 Audio Engine for Linux
let audioEl = null;
let currentPlayId = '';
let currentDuration = 0;
let currentVolume = 0.8;

function getAudio() {
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.preload = 'auto';
    audioEl.autoplay = false;
    audioEl.volume = currentVolume;

    audioEl.addEventListener('play', () => {
      channelObj.emit('audioplayer.onPlayState', currentPlayId, 0, 1);
    });

    audioEl.addEventListener('pause', () => {
      channelObj.emit('audioplayer.onPlayState', currentPlayId, 0, 2);
    });

    audioEl.addEventListener('ended', () => {
      channelObj.emit('audioplayer.onPlayState', currentPlayId, 0, 0);
      channelObj.emit('audioplayer.onEnd', currentPlayId, {
        code: 0,
        playedTime: Math.round(audioEl.currentTime || 0)
      });
    });

    audioEl.addEventListener('timeupdate', () => {
      const curSec = audioEl.currentTime || 0;
      channelObj.emit('audioplayer.onPlayProgress', currentPlayId, curSec, 1.0, false);
      updateDesktopLyricProgress(curSec);
    });

    audioEl.addEventListener('seeked', () => {
      const curSec = audioEl.currentTime || 0;
      channelObj.emit('audioplayer.onPlayProgress', currentPlayId, curSec, 1.0, true);
      updateDesktopLyricProgress(curSec);
    });

    audioEl.addEventListener('loadedmetadata', () => {
      currentDuration = audioEl.duration || 0;
      channelObj.emit('audioplayer.onLoad', currentPlayId, {
        code: 0,
        duration: Math.round(currentDuration)
      });
    });

    audioEl.addEventListener('error', () => {
      channelObj.emit('audioplayer.onLoad', currentPlayId, {
        code: -1,
        duration: 0
      });
    });
  }
  return audioEl;
}

const channelObj = {
  viewCall: function(...args) {
    return channelObj.call(...args);
  },

  enData: function(data) { return data || ''; },
  deData: function(data) { return data || ''; },
  encodeAnonymousId: function(id) {
    try {
      const deviceId = String(id || `${distroSlug}-linux-device-001`);
      const key = Buffer.from('3go8&$8*3*3h0k(2)2', 'utf8');
      const idBuf = Buffer.from(deviceId, 'utf8');
      const xored = Buffer.alloc(idBuf.length);
      for (let i = 0; i < idBuf.length; i++) {
        xored[i] = idBuf[i] ^ key[i % key.length];
      }
      const md5Base64 = crypto.createHash('md5').update(xored).digest('base64');
      return Buffer.from(`${deviceId} ${md5Base64}`, 'utf8').toString('base64');
    } catch (e) {
      return id || `${distroSlug}-anon-001`;
    }
  },

  deSerialData: function(data) {
    if (!data) return '{}';
    try {
      if (typeof data === 'string') {
        const trimmed = data.trim();
        if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && (parsed.code === 803 || parsed.code === 200) && parsed.cookie) {
              return ipcRenderer.invoke('cookie-inject-raw', parsed.cookie).catch(() => {}).then(() => trimmed);
            }
            return trimmed;
          } catch (e) {}
        }
      }

      let buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'latin1');
      let out = '';
      try {
        const decipher = crypto.createDecipheriv('aes-128-ecb', EAPI_KEY, null);
        out = Buffer.concat([decipher.update(buf), decipher.final()]).toString('utf8');
      } catch (e1) {
        if (typeof data === 'string' && /^[0-9a-fA-F]+$/.test(data.trim())) {
          const hexBuf = Buffer.from(data.trim(), 'hex');
          const decipher = crypto.createDecipheriv('aes-128-ecb', EAPI_KEY, null);
          out = Buffer.concat([decipher.update(hexBuf), decipher.final()]).toString('utf8');
        } else {
          return typeof data === 'string' ? data : '{}';
        }
      }

      try {
        const parsed = JSON.parse(out);
        if (parsed && (parsed.code === 803 || parsed.code === 200) && parsed.cookie) {
          return ipcRenderer.invoke('cookie-inject-raw', parsed.cookie).catch(() => {}).then(() => out);
        }
      } catch (e) {}

      return out;
    } catch (e) {
      return typeof data === 'string' ? data : '{}';
    }
  },

  serialData: function(args) {
    try {
      if (!args) return '';
      let url = '';
      let text = '';
      if (Array.isArray(args)) {
        url = String(args[0] || '');
        text = typeof args[1] === 'string' ? args[1] : JSON.stringify(args[1] || {});
      } else if (typeof args === 'string') {
        return args;
      } else {
        text = JSON.stringify(args);
      }
      url = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/eapi\//, '/api/');
      if (/^\/(?:e?api\/)?batch(?:\/|\?|$)/.test(url)) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            let modified = false;
            for (const [k, v] of Object.entries(parsed)) {
              if (k !== 'header' && k !== 'batchOrder' && typeof v === 'object' && v !== null) {
                parsed[k] = JSON.stringify(v);
                modified = true;
              }
            }
            if (modified) {
              text = JSON.stringify(parsed);
            }
          }
        } catch (e) {}
      }
      const message = `nobody${url}use${text}md5forencrypt`;
      const digest = crypto.createHash('md5').update(message, 'utf8').digest('hex');
      const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
      const cipher = crypto.createCipheriv('aes-128-ecb', EAPI_KEY, null);
      return Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]).toString('hex').toUpperCase();
    } catch (e) {
      return '';
    }
  },

  serialKey: function(key) {
    try {
      if (!key) return '';
      const text = typeof key === 'string' ? key : JSON.stringify(key);
      const cipher = crypto.createCipheriv('aes-128-ecb', CACHE_KEY, null);
      return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
    } catch (e) {
      return '';
    }
  },

  encryptId: function(id) {
    try {
      if (!id) return '';
      const magic = Buffer.from('3go8&$8*3*3h0k(2)2', 'utf8');
      const bytes = Buffer.from(String(id), 'utf8');
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = bytes[i] ^ magic[i % magic.length];
      }
      return crypto.createHash('md5').update(bytes).digest('base64').replace(/\//g, '_').replace(/\+/g, '-');
    } catch (e) {
      return String(id || '');
    }
  },

  registerCall: function(cmdEvent, callback) {
    if (!eventListeners[cmdEvent]) eventListeners[cmdEvent] = [];
    eventListeners[cmdEvent].push(callback);
    return true;
  },

  emit: function(cmdEvent, ...eventArgs) {
    if (eventListeners[cmdEvent]) {
      eventListeners[cmdEvent].forEach(cb => {
        try { cb(...eventArgs); } catch (e) {}
      });
    }
  },

  call: function(command, ...args) {
    let callback = null;
    let params = [];

    const fn = args.find(a => typeof a === 'function');
    if (fn) callback = fn;

    const nonFnArgs = args.filter(a => typeof a !== 'function');
    if (nonFnArgs.length === 1 && Array.isArray(nonFnArgs[0])) {
      params = [...nonFnArgs[0]];
    } else {
      params = nonFnArgs;
    }

    const cb = typeof callback === 'function' ? callback : () => {};

    // Version
    if (command === 'update.getVersion' || command === 'update.getVisualVersion' || command === 'app.osVesion') {
      return cb('3.1.40.205461', '64');
    }

    // OS & System
    if (command === 'os.getSystemInfo' || command === 'os.computerSystemInfo') {
      return cb({
        os: 'linux',
        version: linuxDistro.prettyName,
        arch: 'x64',
        platform: 'linux',
        workArea: {
          x: 0,
          y: 0,
          width: window.screen ? window.screen.availWidth : 1920,
          height: window.screen ? window.screen.availHeight : 1080
        }
      });
    }

    if (command === 'os.queryOs') {
      return cb('pc');
    }

    if (command === 'os.queryOsVer') {
      return cb('10.15.7');
    }

    if (command === 'os.getDeviceId' || command === 'os.getADDeviceID') {
      return cb(`${distroSlug}-linux-device-001`);
    }

    if (command === 'os.getDeviceInfo') {
      const devInfo = {
        model: 'PC',
        brand: 'Linux',
        os: 'linux',
        arch: 'x64',
        name: os.hostname() || `${distroSlug}-Linux`
      };
      setTimeout(() => {
        channelObj.emit('os.onGetDeviceInfo', devInfo);
      }, 0);
      return cb(devInfo);
    }

    if (command === 'os.isOnLine') {
      return cb(navigator.onLine);
    }

    if (command === 'os.shellOpen' || command === 'os.navigateExternal') {
      if (params[0]) ipcRenderer.send('open-external', params[0]);
      return cb(true);
    }

    if (command === 'os.isFileExist') {
      return cb(false);
    }

    if (command === 'os.getAllDisplayInfo') {
      return cb([{ id: 1, primary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]);
    }

    if (command === 'os.checkNativeSupportFonts') {
      return cb([
        '宋体',
        '微软雅黑',
        'Noto Sans CJK SC',
        'Ubuntu',
        'Droid Sans Fallback',
        'WenQuanYi Micro Hei',
        'WenQuanYi Zen Hei'
      ]);
    }

    // App Lifecycle
    if (command === 'app.getCooperation') {
      return cb({ main: 'netease', sub: '' });
    }

    if (command === 'app.getDefaultMusicPlayPath') {
      return cb(userMusicDir);
    }

    if (command === 'app.getAppStartCommand') {
      return cb({});
    }

    if (command === 'app.getAppStartTime') {
      return cb(window._enterAppTime || Date.now());
    }

    if (command === 'app.appStartUpEnd' || command === 'app.onBootFinish') {
      setTimeout(() => channelObj.emit('app.onAppStartUpEnd', true), 0);
      return cb(true);
    }

    if (command === 'app.getLocalConfig') {
      const [key, subKey] = params;
      const fullKey = (key || '') + ':' + (subKey || '');
      const val = configStorage[fullKey];
      return cb(val !== undefined ? val : '{}');
    }

    if (command === 'app.setLocalConfig') {
      const [key, subKey, val] = params;
      const fullKey = (key || '') + ':' + (subKey || '');
      configStorage[fullKey] = typeof val === 'string' ? val : JSON.stringify(val);
      try {
        localStorage.setItem('ncm_config_store', JSON.stringify(configStorage));
      } catch (e) {}
      return cb(true);
    }

    if (command === 'app.initConfig' || command === 'app.loadSkinPackets') {
      return cb(true);
    }

    if (command === 'app.featuresSwitch') {
      return cb({
        enableH5Audio: true,
        enableWebAudio: true,
        enableLyricEffect: true,
        hdpi: true
      });
    }

    if (command === 'app.abtestSwitch' || command === 'app.abtestSwitchV2') {
      return cb({});
    }

    if (command === 'app.getABTestKeys') {
      return cb([]);
    }

    if (command === 'app.getAppStartType' || command === 'app.getAutoRunState') {
      return cb(0);
    }

    if (command === 'app.exit') {
      ipcRenderer.send('window-close');
      return cb(true);
    }

    if (command === 'app.log' || command === 'app.statis' || command === 'app.statisV2' || command === 'app.perfReport') {
      return cb(true);
    }

    // Window Management
    if (command === 'winhelper.initMainWindow') {
      return cb(true);
    }

    if (command === 'winhelper.getWindowInfo' || command === 'winhelper.getNativeWindowRect' || command === 'winhelper.getWindowPosition') {
      return cb({
        status: 'normal',
        isMaxWindow: false,
        isMinimizeWindow: false,
        width: window.innerWidth || 1022,
        height: window.innerHeight || 670,
        x: window.screenX || 100,
        y: window.screenY || 100
      });
    }

    if (command === 'winhelper.showWindow') {
      const act = params[0];
      if (act === 'min') ipcRenderer.send('window-min');
      else if (act === 'max') ipcRenderer.send('window-max');
      else if (act === 'restore') ipcRenderer.send('window-restore');
      else if (act === 'close') ipcRenderer.send('window-close');
      return cb(true);
    }

    if (command === 'winhelper.SetNativeWindowShow' || command === 'winhelper.setNativeWindowShow') {
      const [name, visible] = params;
      if (name === 'desktop_lyrics' || name === 'inline_lyrics') {
        setDesktopLyricVisible(Boolean(visible));
        return cb(true);
      }
      if (visible === false) ipcRenderer.send('window-min');
      else ipcRenderer.send('window-restore');
      return cb(true);
    }

    if (command === 'winhelper.destroyWindow' || command === 'winhelper.closeWindow') {
      ipcRenderer.send('window-close');
      return cb(true);
    }

    if (command === 'winhelper.loadingFinished') {
      ipcRenderer.send('loading-finished');
      return cb(true);
    }

    if (command === 'winhelper.bringWindowToTop' || command === 'winhelper.setWindowSizeLimit') {
      return cb(true);
    }

    if (command === 'winhelper.launchWindow') {
      const url = params[0];
      const opts = params[1] || {};
      ipcRenderer.send('launch-window', { url, options: opts });
      return cb(true);
    }

    if (command === 'winhelper.setClipBoardData') {
      if (params[0]) clipboard.writeText(String(params[0]));
      return cb(true);
    }

    if (command === 'winhelper.getClipBoardData') {
      return cb(clipboard.readText());
    }

    // Storage & Database
    if (command === 'storage.init') {
      return cb(userMusicDir, userCacheDir);
    }

    if (command === 'storage.execsql' || command === 'storage.exectransaction') {
      const queryId = params[0];
      setTimeout(() => {
        channelObj.emit('storage.onexecsqldone', queryId, 0, []);
      }, 0);
      return cb(true);
    }

    if (command === 'musiclibrary.execSql') {
      const queryId = params[0];
      setTimeout(() => {
        channelObj.emit('musiclibrary.onexecsql', { id: queryId, error: 0, rows: [] });
      }, 0);
      return cb(true);
    }

    if (command === 'storage.updatetemp') {
      const [key, content] = params;
      if (key !== undefined && key !== null) {
        if (tempStorage.size >= 200) {
          const firstKey = tempStorage.keys().next().value;
          if (firstKey !== undefined) tempStorage.delete(firstKey);
        }
        tempStorage.set(String(key), typeof content === 'string' ? content : JSON.stringify(content || {}));
      }
      return cb(true);
    }

    if (command === 'storage.getTempFile') {
      const key = String(params[0] !== undefined ? params[0] : '');
      const cached = tempStorage.get(key);
      setTimeout(() => {
        if (cached !== undefined) {
          channelObj.emit('storage.ongettempfile', params[0], 0, cached);
        } else {
          channelObj.emit('storage.ongettempfile', params[0], 404, '');
        }
      }, 0);
      return cb(true);
    }

    if (command === 'storage.readfromfile') {
      const id = params[0];
      const filePath = String(params[1] || '');
      const content = fileStorage.has(filePath) ? fileStorage.get(filePath) : '';
      setTimeout(() => {
        channelObj.emit('storage.onreadfromfiledone', id, 0, content);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.savetofile') {
      const id = params[0];
      const content = String(params[1] || '');
      const filePath = String(params[3] || '');
      if (filePath) {
        fileStorage.set(filePath, content);
      }
      setTimeout(() => {
        channelObj.emit('storage.onsavetofiledone', id, 0);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.deletefile') {
      const id = params[0];
      const filePath = String(params[3] || '');
      if (filePath) fileStorage.delete(filePath);
      setTimeout(() => {
        channelObj.emit('storage.ondeletefilesdone', id, 0, filePath || true);
        channelObj.emit('storage.ondeletefiledone', id, 0, true);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.listFile') {
      const id = params[0];
      setTimeout(() => {
        channelObj.emit('storage.onlistfile', id, 0, []);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.clearCache') {
      setTimeout(() => {
        channelObj.emit('storage.onclearcache', true);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.imagesInfo') {
      const id = params[0];
      setTimeout(() => {
        channelObj.emit('storage.onImagesInfo', id, []);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.checkFilesExist') {
      const id = params[0];
      setTimeout(() => {
        channelObj.emit('storage.oncheckfilesexist', id, true, []);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.queryCacheTracks' || command === 'storage.queryNewCacheTracks') {
      const id = params[0];
      setTimeout(() => {
        if (command === 'storage.queryCacheTracks') {
          channelObj.emit('storage.onquerycachetracks', { cachedTrackMap: {}, cachedVoiceMap: {}, total: 0 });
        } else {
          channelObj.emit('storage.onquerynewcachetracks', id, []);
        }
      }, 0);
      return cb(true);
    }

    if (command === 'storage.getSystemDir') {
      return cb({ path: userMusicDir });
    }

    if (command === 'storage.playCacheInfo') {
      return cb({ size: 0, max: 1024 * 1024 * 1024 });
    }

    if (command === 'storage.setPlayCacheConfig') {
      setTimeout(() => {
        channelObj.emit('storage.onsetPlayCacheConfig', { code: 0 });
      }, 0);
      return cb(true);
    }

    if (command === 'trayicon.wasInstall') {
      return cb(true);
    }

    if (command === 'update.getCachedInstallPackageVersion') {
      return cb('');
    }

    if (command === 'update.getDownloadVersion') {
      const id = params[0];
      setTimeout(() => {
        channelObj.emit('update.onGetDownloadVersion', id, '');
      }, 0);
      return cb(true);
    }

    // Desktop Lyric & Player Lyric Bridge
    if (command === 'player.setLyrics') {
      const data = params[0] || {};
      desktopLyricLines = parseLrcText(data.lrc || '');
      desktopTransLines = parseLrcText(data.tlrc || '');
      updateDesktopLyricProgress(audioEl ? audioEl.currentTime : 0);
      return cb(true);
    }

    if (command === 'player.setInfo') {
      const info = params[0] || {};
      if (info.songName) {
        desktopLyricSongTitle = info.artistName ? `${info.songName} - ${info.artistName}` : info.songName;
      }
      updateDesktopLyricProgress(audioEl ? audioEl.currentTime : 0);
      return cb(true);
    }

    if (command === 'player.setOffset') {
      desktopLyricOffsetMs = Number(params[0]) || 0;
      updateDesktopLyricProgress(audioEl ? audioEl.currentTime : 0);
      return cb(true);
    }

    if (command === 'player.setLRCSlogan') {
      desktopLyricSlogan = String(params[0] || '网易云音乐');
      desktopLyricLines = [];
      desktopTransLines = [];
      updateDesktopLyricProgress(0);
      return cb(true);
    }

    if (command === 'player.setLRCEmpty' || command === 'player.setMusicOnly' || command === 'player.setLRCDJ') {
      desktopLyricSlogan = command === 'player.setMusicOnly' ? '纯音乐，请欣赏' : '暂无歌词';
      desktopLyricLines = [];
      desktopTransLines = [];
      updateDesktopLyricProgress(0);
      return cb(true);
    }

    if (command === 'player.showHorizontalLyric') {
      return cb(true);
    }

    if (command === 'player.setLock') {
      desktopLyricLocked = Boolean(params[0]);
      return cb(true);
    }

    if (command === 'player.renderLRCImage') {
      const imgPath = params[1] || '';
      setTimeout(() => {
        channelObj.emit('player.onRenderLRCImageResult', imgPath, true, 400, 80);
      }, 0);
      return cb(true);
    }

    if (command.startsWith('player.')) {
      return cb(true);
    }

    // Audio Playback
    if (command === 'audioplayer.load') {
      const playId = params[0];
      const opts = params[1] || {};
      currentPlayId = playId;

      const url = opts.musicurl || opts.url || opts.songUrl || opts.path || opts.src;
      const audio = getAudio();
      if (url) {
        audio.src = url;
        audio.load();
      }

      setTimeout(() => {
        channelObj.emit('audioplayer.onLoad', currentPlayId, {
          code: 0,
          duration: Math.round(audio.duration || currentDuration || (Number(opts.songDuration) / 1000) || 0)
        });
      }, 200);
      return cb(true);
    }

    if (command === 'audioplayer.play') {
      const audio = getAudio();
      audio.play().then(() => {
        channelObj.emit('audioplayer.onPlayState', currentPlayId, 0, 1);
      }).catch(() => {});
      return cb(true);
    }

    if (command === 'audioplayer.pause') {
      const audio = getAudio();
      audio.pause();
      channelObj.emit('audioplayer.onPlayState', currentPlayId, 0, 2);
      return cb(true);
    }

    if (command === 'audioplayer.stop') {
      const audio = getAudio();
      audio.pause();
      audio.currentTime = 0;
      channelObj.emit('audioplayer.onPlayState', currentPlayId, 0, 0);
      channelObj.emit('audioplayer.onEnd', currentPlayId, { code: -2, playedTime: 0 });
      return cb(true);
    }

    if (command === 'audioplayer.seek') {
      const playId = params[0] || currentPlayId;
      const seekId = params[1] || '';
      const audio = getAudio();
      let seekSec = 0;
      if (typeof params[2] === 'number' && !isNaN(params[2])) {
        seekSec = params[2];
      } else {
        for (const p of params) {
          if (typeof p === 'number' && !isNaN(p)) { seekSec = p; }
        }
      }
      if (seekSec > 1000 && audio.duration && seekSec > audio.duration) {
        seekSec = seekSec / 1000;
      }
      audio.currentTime = seekSec;
      channelObj.emit('audioplayer.onSeek', playId, seekId, 0, seekSec);
      return cb(true);
    }

    if (command === 'audioplayer.setVolume') {
      let vol = NaN;
      for (const p of params) {
        if (typeof p === 'number' && !isNaN(p)) { vol = p; break; }
        if (typeof p === 'string' && p.trim() !== '' && !isNaN(Number(p))) { vol = Number(p); break; }
      }
      if (!isNaN(vol)) {
        currentVolume = vol > 1 ? vol / 100 : vol;
        const audio = getAudio();
        audio.volume = Math.max(0, Math.min(1, currentVolume));
        channelObj.emit('audioplayer.onVolume', currentVolume);
      }
      return cb(true);
    }

    if (command === 'audioplayer.isDeviceMute') {
      setTimeout(() => {
        channelObj.emit('audioplayer.onCheckDeviceMute', false, false);
      }, 0);
      return cb(false);
    }

    if (command === 'audioplayer.enmeratorDevices') {
      const act = params[0] || 'getOutDevices';
      setTimeout(() => {
        channelObj.emit('audioplayer.onEnmeratorDevices', act, [], 'default');
      }, 0);
      return cb(true);
    }

    if (command === 'audioplayer.getSystemMasterVolume' || command === 'audioplayer.getApplicationVolume') {
      return cb(Math.round(currentVolume * 100));
    }

    if (command === 'audioplayer.getPlaybackInfo') {
      const audio = getAudio();
      const state = audio.paused ? (audio.currentTime === 0 ? 'stop' : 'pause') : 'playing';
      return cb({
        state: state,
        time: Math.round(audio.currentTime || 0),
        duration: Math.round(audio.duration || currentDuration || 0),
        wholeCached: true
      });
    }

    if (command === 'audioplayer.getPlayedTime') {
      const curSec = Math.round(getAudio().currentTime || 0);
      return cb({ result: true, playedTime: curSec, playedAudioTime: curSec });
    }

    if (command === 'audioplayer.immerseSurroundSupport' || command === 'audioplayer.immerseSurroundSupportWatch') {
      return cb({ result: false });
    }

    if (command.startsWith('audioplayer.') || command.startsWith('audioeffect.')) {
      return cb(true);
    }

    // Cookies & Browser
    if (command === 'browser.getFullCookies' || command === 'browser.getAllCookies') {
      const url = typeof params[0] === 'string' ? params[0] : (params[0] && params[0].url) || '';
      ipcRenderer.invoke('cookie-get-all', url).then(list => {
        cb(Array.isArray(list) ? list : []);
      }).catch(() => cb([]));
      return;
    }

    if (command === 'browser.getCookies') {
      const url = params[0] || '';
      ipcRenderer.invoke('cookie-get', url).then(cookieObj => {
        cb(cookieObj || {});
      }).catch(() => cb({}));
      return;
    }

    if (command === 'browser.setCookie') {
      const cookie = params[0] || {};
      ipcRenderer.invoke('cookie-set', cookie).then(res => cb(res)).catch(() => cb(false));
      return;
    }

    if (command === 'browser.removeCookie' || command === 'browser.deleteCookie') {
      let url = '';
      let name = '';
      if (typeof params[0] === 'object' && params[0]) {
        url = params[0].url || '';
        name = params[0].name || '';
      } else {
        url = params[0] || '';
        name = params[1] || '';
      }
      ipcRenderer.invoke('cookie-remove', url, name).then(res => cb(res)).catch(() => cb(false));
      return;
    }

    if (command === 'desktop.support') {
      return cb(false);
    }

    // Native HTTP Proxy
    if (command === 'storage.fetch') {
      const opts = params[0] || {};
      ipcRenderer.invoke('net-fetch', opts).then(res => {
        cb(res);
      }).catch(err => {
        cb({ error: err.message, status: 500, blob: '', headers: [] });
      });
      return;
    }

    setTimeout(() => cb(true), 0);
  }
};

window.channel = channelObj;
window.legacyNativeCmder = window.channel;
window.WebViewBridge = { postMessage: function() {} };
