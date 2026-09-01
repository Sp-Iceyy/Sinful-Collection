const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');

const projectRoot = path.join(__dirname, '..');
const dataRoot = path.join(app.getPath('appData'), 'SinfulCollection');
const mediaConfigPath = path.join(dataRoot, 'media-location.json');
let mediaRoot = path.join(dataRoot, 'Media');
const metadataPath = path.join(dataRoot, 'metadata.json');
let server;

function showSplashScreen() {
  const splash = new BrowserWindow({
    width: 520,
    height: 340,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#0b090b',
    titleBarStyle: 'hidden',
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  splash.loadFile(path.join(projectRoot, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());
  return splash;
}

function ensureData() {
  fs.mkdirSync(path.join(mediaRoot, 'Images'), { recursive: true });
  fs.mkdirSync(path.join(mediaRoot, 'Videos'), { recursive: true });
  if (!fs.existsSync(metadataPath)) {
    fs.writeFileSync(metadataPath, '[]\n');
  } else {
    const records = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (!Array.isArray(records) && (!records || typeof records !== 'object')) fs.writeFileSync(metadataPath, '{"version":1,"profiles":{}}\n');
    if (Array.isArray(records)) fs.writeFileSync(metadataPath, JSON.stringify({ version: 1, profiles: {} }, null, 2));
    if (!Array.isArray(records)) return;
    const cleaned = records.filter((item) => item.id !== 'folder-video' && item.title !== 'Fischl x Slime' && item.filename !== 'fischl-x-slime-a-special-delivery-4k-60fps2_720p.mp4');
    if (cleaned.length !== records.length) fs.writeFileSync(metadataPath, JSON.stringify(cleaned, null, 2));
  }
}
async function chooseMediaLocation() {
  fs.mkdirSync(dataRoot, { recursive: true });
  if (fs.existsSync(mediaConfigPath)) {
    try { const saved = JSON.parse(fs.readFileSync(mediaConfigPath, 'utf8')); if (saved.path) mediaRoot = path.resolve(saved.path); } catch { /* use the default location */ }
  } else {
    const result = await dialog.showOpenDialog({ title: 'Choose media storage location', message: 'Choose where Sinful Collection should store imported images and videos.', buttonLabel: 'Use this folder', properties: ['openDirectory', 'createDirectory'] });
    if (!result.canceled && result.filePaths[0]) mediaRoot = path.resolve(result.filePaths[0]);
    fs.writeFileSync(mediaConfigPath, JSON.stringify({ path: mediaRoot }, null, 2));
  }
}
function readMetadata() { const data = JSON.parse(fs.readFileSync(metadataPath, 'utf8')); return Array.isArray(data) ? { version: 1, profiles: {} } : data; }
function writeMetadata(records) { fs.writeFileSync(metadataPath, JSON.stringify(records, null, 2)); }
async function changeMediaLocation(nextRoot) {
  const targetRoot = path.resolve(nextRoot);
  if (!targetRoot || targetRoot === mediaRoot) return mediaRoot;
  const data = readMetadata();
  fs.mkdirSync(path.join(targetRoot, 'Images'), { recursive: true });
  fs.mkdirSync(path.join(targetRoot, 'Videos'), { recursive: true });
  const moved = new Set();
  for (const profile of Object.values(data.profiles || {})) {
    for (const item of profile.media || []) {
      const filename = String(item.filename || item.src?.split('/').pop() || '').trim();
      if (!filename) continue;
      const physicalFolder = item.storageFolder || (item.type === 'video' ? 'Videos' : 'Images');
      const source = path.resolve(mediaRoot, physicalFolder, decodeURIComponent(filename));
      const target = path.resolve(targetRoot, item.type === 'video' ? 'Videos' : 'Images', path.basename(filename));
      if (moved.has(source) || !fs.existsSync(source)) continue;
      if (!target.startsWith(targetRoot)) throw new Error('Invalid media filename.');
      if (source !== target) {
        try { fs.renameSync(source, target); } catch (error) {
          if (!['EXDEV', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
          fs.copyFileSync(source, target);
          if (fs.statSync(source).size !== fs.statSync(target).size) { fs.unlinkSync(target); throw new Error(`Unable to verify ${filename}.`); }
          try { fs.unlinkSync(source); } catch (deleteError) { if (!['EBUSY', 'EPERM', 'EACCES'].includes(deleteError.code)) throw deleteError; }
        }
      }
      moved.add(source);
    }
  }
  mediaRoot = targetRoot;
  fs.writeFileSync(mediaConfigPath, JSON.stringify({ path: mediaRoot }, null, 2));
  return mediaRoot;
}
function sendJson(res, status, payload) { const body = JSON.stringify(payload); res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }); res.end(body); }
function safeFileName(name) { return `${name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload'}-${crypto.randomBytes(4).toString('hex')}${path.extname(name).toLowerCase()}`; }
function serveFile(req, res) { const requested = decodeURIComponent(req.url.slice(1).split('?')[0]); const file = path.resolve(projectRoot, requested); if (!file.startsWith(projectRoot) || !fs.existsSync(file)) return sendJson(res, 404, { error: 'Not found' }); res.writeHead(200, { 'Content-Type': requested.endsWith('.css') ? 'text/css' : requested.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(file).pipe(res); }
function serveMediaFile(req, res) {
  const requested = decodeURIComponent(req.url.slice('/media/'.length).split('?')[0]);
  const file = path.resolve(mediaRoot, requested);
  if (!file.startsWith(mediaRoot) || !fs.existsSync(file)) return sendJson(res, 404, { error: 'Media not found' });
  const size = fs.statSync(file).size;
  const contentType = path.extname(file).toLowerCase() === '.mp4' ? 'video/mp4' : path.extname(file).toLowerCase() === '.webm' ? 'video/webm' : 'application/octet-stream';
  const range = req.headers.range;
  if (!range) { res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': size, 'Accept-Ranges': 'bytes' }); return fs.createReadStream(file).pipe(res); }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  res.writeHead(206, { 'Content-Type': contentType, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file, { start, end }).pipe(res);
}
function handleUpload(req, res) {
  const parser = Busboy({ headers: req.headers }); let result; let sourcePath = ''; let writePromise = Promise.resolve();
  parser.on('field', (field, value) => { if (field === 'sourcePath') sourcePath = value; });
  parser.on('file', (field, stream, info) => {
    const isVideo = info.mimeType.startsWith('video/'), folder = isVideo ? 'Videos' : 'Images';
    if (!info.mimeType.startsWith('image/') && !isVideo) { stream.resume(); parser.emit('error', new Error('Only image and video files are supported')); return; }
    const filename = safeFileName(info.filename); const target = path.join(mediaRoot, folder, filename); const temporary = `${target}.uploading`;
    const output = fs.createWriteStream(temporary); writePromise = new Promise((resolve, reject) => { output.on('finish', resolve); output.on('error', reject); stream.on('error', reject); }); stream.pipe(output); result = { temporary, target, filename, folder, type: isVideo ? 'video' : 'image', src: `/media/${folder}/${encodeURIComponent(filename)}` };
  });
  parser.on('finish', async () => {
    if (!result) return sendJson(res, 400, { error: 'No file was provided' });
    try {
      await writePromise;
      if (sourcePath) {
        const source = path.resolve(sourcePath);
        if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error('The selected file is no longer available.');
        fs.unlinkSync(result.temporary);
        try {
          fs.renameSync(source, result.target);
        } catch (error) {
          if (!['EXDEV', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
          fs.copyFileSync(source, result.target);
          if (fs.statSync(result.target).size !== fs.statSync(source).size) { fs.unlinkSync(result.target); throw new Error('The moved file could not be verified.'); }
          try { fs.unlinkSync(source); } catch (deleteError) { if (!['EBUSY', 'EPERM', 'EACCES'].includes(deleteError.code)) throw deleteError; }
        }
        result.src = `/media/${result.folder}/${encodeURIComponent(result.filename)}`;
      }
      else fs.renameSync(result.temporary, result.target);
      delete result.temporary; delete result.target;
      sendJson(res, 200, result);
    } catch (error) { sendJson(res, 400, { error: error.message || 'Unable to move the selected file' }); }
  });
  parser.on('error', (error) => sendJson(res, 400, { error: error.message })); req.pipe(parser);
}
function deleteMediaFile(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const payload = JSON.parse(body || '{}');
      const folder = String(payload.folder || '').trim();
      const filename = String(payload.filename || '').trim();
      if (!filename) return sendJson(res, 400, { error: 'Filename is required' });
      const target = path.resolve(mediaRoot, folder || '', filename);
      if (!target.startsWith(mediaRoot) || !fs.existsSync(target)) return sendJson(res, 404, { error: 'Media not found' });
      fs.unlinkSync(target);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Unable to remove media file' });
    }
  });
}
function startServer() {
  server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.startsWith('/api/catalog')) { const profile = decodeURIComponent(new URL(req.url, 'http://localhost').searchParams.get('profile') || ''); const data = readMetadata(); return sendJson(res, 200, { profiles: data.profiles || {}, media: data.profiles?.[profile]?.media || [] }); }
    if (req.method === 'PUT' && req.url === '/api/catalog') { let body = ''; req.on('data', (chunk) => { body += chunk; }); req.on('end', () => { try { const payload = JSON.parse(body); const data = readMetadata(); data.profiles = data.profiles || {}; data.profiles[payload.profile] = { username: payload.profile, media: payload.media || [], favoriteTags: payload.favoriteTags || [], artists: payload.artists || [] }; writeMetadata(data); sendJson(res, 200, { ok: true }); } catch { sendJson(res, 400, { error: 'Invalid catalog' }); } }); return; }
    if (req.method === 'DELETE' && req.url === '/api/catalog') { let body = ''; req.on('data', (chunk) => { body += chunk; }); req.on('end', () => { try { const payload = JSON.parse(body); const data = readMetadata(); delete data.profiles?.[payload.profile]; writeMetadata(data); sendJson(res, 200, { ok: true }); } catch { sendJson(res, 400, { error: 'Invalid profile' }); } }); return; }
    if (req.method === 'POST' && req.url === '/api/upload') return handleUpload(req, res);
    if (req.method === 'DELETE' && req.url === '/api/media/file') return deleteMediaFile(req, res);
    if (req.method === 'PUT' && req.url === '/api/media') { let body = ''; req.on('data', (chunk) => { body += chunk; }); req.on('end', () => { try { writeMetadata(JSON.parse(body)); sendJson(res, 200, { ok: true }); } catch { sendJson(res, 400, { error: 'Invalid metadata' }); } }); return; }
    if (req.method === 'GET' && req.url.startsWith('/media/')) return serveMediaFile(req, res);
    if (req.method === 'GET') return serveFile(req, res);
    sendJson(res, 404, { error: 'Unsupported request' });
  }).listen(0, '127.0.0.1');
  return new Promise((resolve) => server.on('listening', () => resolve(server.address().port)));
}
async function createWindow() {
  await chooseMediaLocation();
  ensureData();
  const port = await startServer();
  const splash = showSplashScreen();
  const win = new BrowserWindow({ width: 1280, height: 900, backgroundColor: '#0b090b', webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') } });

  setTimeout(async () => {
    await win.loadURL(`http://127.0.0.1:${port}/index.html`);
    splash.close();
    win.show();
  }, 1500);
}
ipcMain.handle('open-media-location', () => shell.openPath(mediaRoot));
ipcMain.handle('open-external', (_event, url) => shell.openExternal(String(url)));
ipcMain.handle('show-media-in-folder', (_event, payload) => { const folder = payload?.type === 'video' ? 'Videos' : 'Images'; const filename = path.basename(String(payload?.filename || '')); const target = path.resolve(mediaRoot, folder, filename); if (!filename || !target.startsWith(path.resolve(mediaRoot)) || !fs.existsSync(target)) throw new Error('Stored media file was not found.'); shell.showItemInFolder(target); return true; });
ipcMain.handle('change-media-location', async () => { const result = await dialog.showOpenDialog({ title: 'Choose media storage location', message: 'Choose where Sinful Collection should store imported images and videos.', buttonLabel: 'Move media here', properties: ['openDirectory', 'createDirectory'] }); if (result.canceled || !result.filePaths[0]) return { canceled: true }; return { path: await changeMediaLocation(result.filePaths[0]) }; });
app.whenReady().then(createWindow); app.on('window-all-closed', () => { if (server) server.close(); if (process.platform !== 'darwin') app.quit(); });
