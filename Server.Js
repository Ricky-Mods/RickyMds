'use strict';

/*
 * RICKY MDs — backend server
 *
 * Run with:
 *   npm install express multer cors cookie-parser
 *   node server.js
 *
 * Then open:   http://localhost:3000
 * Admin login: admin / Ricky2024
 *
 * Contacts (defaults seeded into data/db.json on first run):
 *   Telegram:  https://t.me/RickyMods
 *   WhatsApp:  +256793510510  →  https://wa.me/256793510510
 */

const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

for (const dir of [UPLOAD_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function hashPassword(password, salt) { return crypto.scryptSync(String(password), String(salt), 64).toString('hex'); }
function uid() { return crypto.randomBytes(9).toString('hex'); }

const CONTACT_DEFAULTS = {
  siteName: 'RICKY MDs',
  tagline: 'Premium modded apps, safe and fast.',
  announcement: 'Welcome to RICKY MDs. New modded apps land every day. Chat us on WhatsApp or join the Telegram channel for early drops and update alerts.',
  contact: 'support@rickymds.app',
  telegram: 'RickyMods',
  whatsapp: '+256793510510'
};

const SAMPLE_APPS = [
  { name: 'Spotify Premium', packageName: 'com.spotify.music', version: '8.9.44', category: 'Music', developer: 'Spotify AB', rating: 4.8, description: 'Stream millions of tracks and podcasts with the full premium experience unlocked.', whatsNew: 'Premium unlocked, ads removed, unlimited skips, extreme quality, offline downloads.', downloads: 184320, featured: true },
  { name: 'WhatsApp Plus', packageName: 'com.whatsapp.plus', version: '17.30', category: 'Social', developer: 'RICKY MDs', rating: 4.7, description: 'A customised WhatsApp build with extra privacy controls, themes and media tools.', whatsNew: 'Anti delete, hide blue ticks, custom themes, status saver, freeze last seen.', downloads: 152880, featured: true },
  { name: 'YouTube ReVanced', packageName: 'app.revanced.android.youtube', version: '19.16.39', category: 'Video', developer: 'ReVanced Team', rating: 4.9, description: 'The full YouTube experience with interruptions stripped out.', whatsNew: 'Zero ads, background play, sponsor block, speed controls, video downloads.', downloads: 231400, featured: true },
  { name: 'CapCut Pro', packageName: 'com.lemon.lvoverseas', version: '11.4.0', category: 'Video', developer: 'Bytedance', rating: 4.6, description: 'Professional video editing on your phone with every premium template unlocked.', whatsNew: 'Pro unlocked, watermark removed, all effects, 4K export.', downloads: 98760, featured: false },
  { name: 'Instagram Pro', packageName: 'com.instagram.android', version: '300.0.0.0', category: 'Social', developer: 'RICKY MDs', rating: 4.5, description: 'Browse Instagram without limits and save any photo, reel or story.', whatsNew: 'Media downloads, hide seen, hide typing, copy captions, no suggested posts.', downloads: 76420, featured: false },
  { name: 'PUBG Mobile', packageName: 'com.tencent.ig', version: '3.2.0', category: 'Games', developer: 'Level Infinite', rating: 4.4, description: 'Battle royale action with a tuned build for smoother aiming.', whatsNew: 'Aim assist, no recoil, extended view, unlocked skins.', downloads: 64190, featured: false }
];

function defaultDb() {
  const salt = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  return {
    settings: { ...CONTACT_DEFAULTS },
    admin: { username: 'admin', salt, hash: hashPassword('Ricky2024', salt) },
    apps: SAMPLE_APPS.map((item, index) => ({
      id: uid(),
      name: item.name, packageName: item.packageName, version: item.version,
      category: item.category, developer: item.developer, rating: item.rating,
      description: item.description, whatsNew: item.whatsNew,
      iconUrl: '', apkUrl: '', apkName: '',
      featured: item.featured, downloads: item.downloads,
      createdAt: new Date(now - index * 86400000).toISOString()
    })),
    requests: []
  };
}

let db;
function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = defaultDb(); }
  } else { db = defaultDb(); }
  if (!Array.isArray(db.apps)) db.apps = [];
  if (!Array.isArray(db.requests)) db.requests = [];
  if (!db.admin) db.admin = defaultDb().admin;
  if (!db.settings) db.settings = { ...CONTACT_DEFAULTS };
  else for (const k of Object.keys(CONTACT_DEFAULTS)) if (db.settings[k] === undefined || db.settings[k] === '') db.settings[k] = CONTACT_DEFAULTS[k];
  saveDb();
}
function saveDb() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
loadDb();

const sessions = new Map();
const SESSION_TTL = 1000 * 60 * 60 * 8;
const COOKIE_NAME = 'rickymds_session';

function createSession(username) { const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, { username, expires: Date.now() + SESSION_TTL }); return token; }
function readSession(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  s.expires = Date.now() + SESSION_TTL;
  return s;
}
function requireAdmin(req, res, next) { if (!readSession(req)) return res.status(401).json({ error: 'Admin sign in required' }); next(); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = path.basename(file.originalname || 'file', ext).replace(/[^a-zA-Z0-9]/g, '').slice(0, 28) || 'file';
    cb(null, base + '_' + Date.now() + '_' + uid().slice(0, 6) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'icon' && !/^image\//i.test(file.mimetype)) return cb(new Error('The icon must be an image file'));
    if (file.fieldname === 'apk' && !/\.(apk|xapk|apks|zip)$/i.test(file.originalname || '')) return cb(new Error('The package must be an apk, xapk, apks or zip file'));
    cb(null, true);
  }
});

const app = express();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : null;
app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (!ALLOWED_ORIGINS) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed'));
  },
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* API routes first */
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get('/api/settings', (req, res) => res.json(db.settings));
app.get('/api/apps', (req, res) => res.json(db.apps.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))));
app.get('/api/apps/:id', (req, res) => { const item = db.apps.find(e => e.id === req.params.id); if (!item) return res.status(404).json({ error: 'App not found' }); res.json(item); });

app.get('/api/download/:id', (req, res) => {
  const item = db.apps.find(e => e.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'App not found' });
  if (!item.apkUrl) return res.status(404).json({ error: 'The APK file is not uploaded yet' });
  item.downloads = (Number(item.downloads) || 0) + 1;
  saveDb();
  if (item.apkUrl.startsWith('/uploads/')) {
    const filePath = path.join(UPLOAD_DIR, path.basename(item.apkUrl));
    if (fs.existsSync(filePath)) return res.download(filePath, item.apkName || path.basename(filePath));
  }
  return res.redirect(item.apkUrl);
});

app.post('/api/requests', (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const contact = String(body.contact || '').trim();
  const appName = String(body.appName || '').trim();
  if (!name || !contact || !appName) return res.status(400).json({ error: 'Name, contact and app name are required' });
  const request = { id: uid(), name: name.slice(0, 80), contact: contact.slice(0, 140), appName: appName.slice(0, 140), note: String(body.note || '').slice(0, 800), status: 'open', createdAt: new Date().toISOString() };
  db.requests.unshift(request);
  saveDb();
  res.json({ ok: true, request });
});

app.post('/api/login', (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '');
  const password = String(body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const rec = db.admin;
  const incoming = Buffer.from(hashPassword(password, rec.salt), 'hex');
  const stored = Buffer.from(rec.hash, 'hex');
  const ok = username === rec.username && incoming.length === stored.length && crypto.timingSafeEqual(incoming, stored);
  if (!ok) return res.status(401).json({ error: 'Wrong username or password' });
  const token = createSession(rec.username);
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: isHttps ? 'none' : 'lax', secure: isHttps, maxAge: SESSION_TTL, path: '/' });
  res.json({ ok: true, username: rec.username });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (token) sessions.delete(token);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  const s = readSession(req);
  res.json({ authenticated: Boolean(s), username: s ? s.username : '' });
});

app.get('/api/admin/apps', requireAdmin, (req, res) => res.json(db.apps.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))));

function buildAppFromBody(body, files, existing) {
  const iconFile = files.icon && files.icon[0];
  const apkFile = files.apk && files.apk[0];
  const rating = Number(body.rating);
  const record = {
    name: String(body.name || '').slice(0, 120),
    packageName: String(body.packageName || '').slice(0, 120),
    version: String(body.version || '1.0').slice(0, 40),
    category: String(body.category || 'Tools').slice(0, 40),
    developer: String(body.developer || 'RICKY MDs').slice(0, 80),
    rating: Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 4.5,
    description: String(body.description || '').slice(0, 3000),
    whatsNew: String(body.whatsNew || '').slice(0, 3000),
    iconUrl: iconFile ? '/uploads/' + iconFile.filename : String(body.iconUrl || '').slice(0, 600),
    featured: body.featured === 'true' || body.featured === 'on' || body.featured === true
  };
  if (apkFile) { record.apkUrl = '/uploads/' + apkFile.filename; record.apkName = String(apkFile.originalname || '').slice(0, 200); }
  else if (existing) { record.apkUrl = existing.apkUrl || ''; record.apkName = existing.apkName || ''; }
  else { record.apkUrl = ''; record.apkName = ''; }
  if (!record.iconUrl && existing) record.iconUrl = existing.iconUrl || '';
  return record;
}

const appUpload = upload.fields([{ name: 'apk', maxCount: 1 }, { name: 'icon', maxCount: 1 }]);

app.post('/api/admin/apps', requireAdmin, appUpload, (req, res) => {
  const body = req.body || {};
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'App name is required' });
  const record = buildAppFromBody(body, req.files || {}, null);
  record.id = uid();
  record.downloads = 0;
  record.createdAt = new Date().toISOString();
  db.apps.unshift(record);
  saveDb();
  res.json(record);
});

app.put('/api/admin/apps/:id', requireAdmin, appUpload, (req, res) => {
  const existing = db.apps.find(e => e.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'App not found' });
  const body = req.body || {};
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'App name is required' });
  Object.assign(existing, buildAppFromBody(body, req.files || {}, existing));
  saveDb();
  res.json(existing);
});

app.delete('/api/admin/apps/:id', requireAdmin, (req, res) => {
  const index = db.apps.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'App not found' });
  const [removed] = db.apps.splice(index, 1);
  for (const url of [removed.apkUrl, removed.iconUrl]) {
    if (url && url.startsWith('/uploads/')) fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(url))).catch(() => {});
  }
  saveDb();
  res.json({ ok: true });
});

app.get('/api/admin/requests', requireAdmin, (req, res) => res.json(db.requests));
app.delete('/api/admin/requests/:id', requireAdmin, (req, res) => {
  const index = db.requests.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Request not found' });
  db.requests.splice(index, 1);
  saveDb();
  res.json({ ok: true });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const body = req.body || {};
  db.settings = {
    siteName: String(body.siteName || db.settings.siteName).slice(0, 60),
    tagline: String(body.tagline || '').slice(0, 160),
    announcement: String(body.announcement || '').slice(0, 600),
    contact: String(body.contact || '').slice(0, 160),
    telegram: String(body.telegram || '').slice(0, 160),
    whatsapp: String(body.whatsapp || '').slice(0, 40)
  };
  saveDb();
  res.json(db.settings);
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const body = req.body || {};
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const incoming = Buffer.from(hashPassword(currentPassword, db.admin.salt), 'hex');
  const stored = Buffer.from(db.admin.hash, 'hex');
  const ok = incoming.length === stored.length && crypto.timingSafeEqual(incoming, stored);
  if (!ok) return res.status(401).json({ error: 'Current password is not correct' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.admin.salt = salt;
  db.admin.hash = hashPassword(newPassword, salt);
  saveDb();
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));

/* Static frontend */
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

/* Fallback */
app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  res.status(404).type('text').send('Not found');
});

/* Error handler */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Upload failed: ' + err.message });
  return res.status(400).json({ error: err.message || 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('RICKY MDs running at http://localhost:' + PORT);
  console.log('Telegram: https://t.me/RickyMods');
  console.log('WhatsApp: https://wa.me/256793510510');
  console.log('Admin login starts as admin with password Ricky2024');
});
