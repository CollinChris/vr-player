const { app, BrowserWindow, protocol, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const net = require('net');
const os = require('os');

// The UI and the videos are both served from app://local/ so WebGL can use the
// video frames as a texture (file:// URLs would be treated as cross-origin).
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
}]);

const VIDEO_EXT = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'ogv'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.ogv': 'video/ogg'
};
const SRC_DIR = path.join(__dirname, 'src');
const allowed = new Set(); // only files the user opened can be served
let win = null;
let pendingFile = null;

const isVideo = p => typeof p === 'string' && VIDEO_EXT.includes(path.extname(p).slice(1).toLowerCase());
const fileFromArgs = argv => argv.slice(1).find(a => isVideo(a) && fs.existsSync(a));

function describe(p) {
  const full = path.resolve(p);
  allowed.add(full);
  const { size } = fs.statSync(full);
  return { url: 'app://local/media?p=' + encodeURIComponent(full), name: path.basename(full), size, path: full };
}

async function serveMedia(req, file) {
  if (!allowed.has(file)) return new Response('Forbidden', { status: 403 });
  const { size } = await fs.promises.stat(file);
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.get('range');
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m && (m[1] || m[2])) {
    let start, end;
    if (m[1]) { start = +m[1]; end = m[2] ? Math.min(+m[2], size - 1) : size - 1; }
    else { start = Math.max(0, size - +m[2]); end = size - 1; }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' }
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
  });
}

async function serveStatic(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  const full = path.normalize(path.join(SRC_DIR, rel));
  if (!full.startsWith(SRC_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
  try {
    const data = await fs.promises.readFile(full);
    return new Response(data, { headers: { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

let rendererReady = false;
function sendFile(p) {
  if (!p) return;
  if (win && rendererReady) win.webContents.send('open-file', describe(p));
  else pendingFile = p;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 400,
    backgroundColor: '#0b0b0d', title: 'VR Player',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  win.loadURL('app://local/index.html');
  win.webContents.on('did-start-loading', () => { rendererReady = false; });
  // Never navigate away or open popups inside the player; send links to the browser
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

// Single-instance handling with a timeout. Electron's built-in lock waits forever when the
// other copy is frozen, so we use our own named pipe and give up after a short wait.
const PIPE = path.join('\\\\?\\pipe', 'vr-player-' + os.userInfo().username.replace(/[^\w.-]/g, '_'));

function handOffToRunningCopy(file) {
  return new Promise(resolve => {
    const sock = net.connect(PIPE);
    let finished = false;
    const done = ok => { if (finished) return; finished = true; clearTimeout(timer); sock.destroy(); resolve(ok); };
    const timer = setTimeout(() => done(false), 1500);
    sock.on('connect', () => sock.write(JSON.stringify({ file: file || null }) + '\n'));
    sock.on('data', d => { if (String(d).includes('ok')) done(true); });
    sock.on('error', () => done(false));
  });
}

function startPipeServer() {
  const server = net.createServer(sock => {
    let buf = '';
    sock.on('data', d => {
      buf += d;
      if (!buf.includes('\n')) return;
      let msg = {};
      try { msg = JSON.parse(buf.split('\n')[0]); } catch {}
      sock.end('ok\n');
      app.whenReady().then(() => {
        if (msg.file && fs.existsSync(msg.file)) sendFile(msg.file);
        if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
      });
    });
    sock.on('error', () => {});
  });
  server.on('error', () => {}); // name held by an unresponsive copy: just run on our own
  server.listen(PIPE);
}

function setupApp() {
  Menu.setApplicationMenu(null);
  protocol.handle('app', req => {
    const url = new URL(req.url);
    if (url.host !== 'local') return new Response('Not found', { status: 404 });
    if (url.pathname === '/media') return serveMedia(req, url.searchParams.get('p'));
    return serveStatic(url.pathname);
  });

  ipcMain.handle('open-dialog', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Open video', properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: VIDEO_EXT }, { name: 'All files', extensions: ['*'] }]
    });
    return r.canceled || !r.filePaths[0] ? null : describe(r.filePaths[0]);
  });
  // The page calls this once its handlers are set up, and gets any file passed on the command line
  ipcMain.handle('renderer-ready', () => {
    rendererReady = true;
    const p = pendingFile; pendingFile = null;
    return p ? describe(p) : null;
  });
  ipcMain.handle('register-file', (_e, p) => (p && fs.existsSync(p) ? describe(p) : null));
  ipcMain.on('set-fullscreen', (_e, on) => win && win.setFullScreen(!!on));
  ipcMain.handle('is-fullscreen', () => !!(win && win.isFullScreen()));

  createWindow();
}

app.on('window-all-closed', () => app.quit());

(async () => {
  const startFile = fileFromArgs(process.argv) || null;
  const handed = await handOffToRunningCopy(startFile);
  if (handed) { app.exit(0); return; }
  pendingFile = startFile;
  startPipeServer();
  await app.whenReady();
  setupApp();
})();
