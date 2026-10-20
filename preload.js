const { ipcRenderer, clipboard } = require('electron');
const os = require('os');
const path = require('path');

const userHome = os.homedir();
const userMusicDir = path.join(userHome, 'Music');
const userCacheDir = path.join(userHome, '.cache', 'netease-cloud-music');

window._enterAppTime = Date.now();
window.withDevServer = false;
window.isElectron = true;
window.DESKTOP_SOURCE = 'pc';

// Intercept window.fetch to capture QR code login cookies
const origFetch = window.fetch;
window.fetch = async function(...args) {
  const res = await origFetch.apply(this, args);
  try {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    if (url.includes('/api/login/qrcode/client/login') || url.includes('/api/login')) {
      const clone = res.clone();
      clone.json().then(data => {
        if (data && (data.code === 803 || data.code === 200) && data.cookie) {
          ipcRenderer.invoke('cookie-inject-raw', data.cookie);
        }
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
      if (url.includes('/api/login') || url.includes('/api/w/login')) {
        const text = this.responseText;
        if (text && (text.startsWith('{') || text.startsWith('['))) {
          const data = JSON.parse(text);
          if (data && (data.code === 803 || data.code === 200) && data.cookie) {
            ipcRenderer.invoke('cookie-inject-raw', data.cookie);
          }
        }
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

const eventListeners = {};

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
  encodeAnonymousId: function(id) { return id || 'centos-stream-anon-001'; },
  deSerialData: function(data) { return data || ''; },
  serialData: function(data) { return data || ''; },
  serialKey: function(key) { return key || ''; },
  encryptId: function(id) { return id || ''; },

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
        version: 'CentOS Stream 10',
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

    if (command === 'os.queryOsVer') {
      return cb('10.15.7');
    }

    if (command === 'os.getDeviceId' || command === 'os.getADDeviceID') {
      return cb('centos-stream-linux-device-001');
    }

    if (command === 'os.getDeviceInfo') {
      const devInfo = {
        model: 'PC',
        brand: 'Linux',
        os: 'linux',
        arch: 'x64',
        name: 'CentOS-Stream-Linux'
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
      return cb(['宋体', '微软雅黑', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei']);
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

    if (command === 'winhelper.getWindowInfo' || command === 'winhelper.getNativeWindowRect') {
      return cb({
        status: 'normal',
        isMaxWindow: false,
        isMinimizeWindow: false,
        width: window.innerWidth || 1022,
        height: window.innerHeight || 670,
        x: 100,
        y: 100
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

    if (command === 'storage.readfromfile') {
      const id = params[0];
      setTimeout(() => {
        channelObj.emit('storage.onreadfromfiledone', id, 0, '');
      }, 0);
      return cb(true);
    }

    if (command === 'storage.savetofile') {
      const id = params[0];
      setTimeout(() => {
        channelObj.emit('storage.onsavetofiledone', id, 0);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.deletefile') {
      const id = params[0];
      setTimeout(() => {
        channelObj.emit('storage.ondeletefiledone', id, 0, true);
      }, 0);
      return cb(true);
    }

    if (command === 'storage.queryCacheTracks' || command === 'storage.queryNewCacheTracks') {
      setTimeout(() => {
        channelObj.emit(
          command === 'storage.queryCacheTracks' ? 'storage.onquerycachetracks' : 'storage.onquerynewcachetracks',
          { cachedTrackMap: {}, cachedVoiceMap: {}, total: 0 }
        );
      }, 0);
      return cb(true);
    }

    if (command === 'storage.getSystemDir') {
      return cb({ path: userMusicDir });
    }

    if (command === 'storage.playCacheInfo') {
      return cb({ size: 0, max: 1024 * 1024 * 1024 });
    }

    if (command === 'storage.setPlayCacheConfig' || command === 'trayicon.wasInstall') {
      return cb(true);
    }

    if (command === 'update.getCachedInstallPackageVersion') {
      return cb('');
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
