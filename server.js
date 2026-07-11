require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'db') }),
  secret: process.env.SESSION_SECRET || 'lanka-samp-hosting-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

// Make current user available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.error = null;
  res.locals.success = null;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

const PLANS = {
  free: { name: 'Free', price: 0, slots: 10, ram: '256 MB', storage: '512 MB', subdomains: 1 },
  premium: { name: 'Premium', price: 1500, slots: 50, ram: '1 GB', storage: '5 GB', subdomains: 3 }
};

// ---------- Public routes ----------
app.get('/', (req, res) => {
  res.render('index', { title: 'Home', plans: PLANS });
});

app.get('/plans', (req, res) => {
  res.render('plans', { title: 'Hosting Plans', plans: PLANS });
});

// ---------- Auth: Register ----------
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('register', { title: 'Register', error: null });
});

app.post('/register', async (req, res) => {
  const { username, email, password, confirm_password } = req.body;

  if (!username || !email || !password) {
    return res.render('register', { title: 'Register', error: 'සියලුම කේෂ්ත්‍ර පුරවන්න.' });
  }
  if (password.length < 6) {
    return res.render('register', { title: 'Register', error: 'මුරපදය අකුරු 6 කට වඩා තිබිය යුතුයි.' });
  }
  if (password !== confirm_password) {
    return res.render('register', { title: 'Register', error: 'මුරපද දෙක සමාන නැත.' });
  }

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.render('register', { title: 'Register', error: 'මෙම username හෝ email එක දැනටමත් භාවිතයේ පවතී.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const info = db.prepare('INSERT INTO users (username, email, password_hash, plan) VALUES (?, ?, ?, ?)')
      .run(username, email, hash, 'free');

    req.session.user = { id: info.lastInsertRowid, username, email, plan: 'free' };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('register', { title: 'Register', error: 'දෝෂයක් ඇතිවිය. නැවත උත්සාහ කරන්න.' });
  }
});

// ---------- Auth: Login ----------
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Login', error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      return res.render('login', { title: 'Login', error: 'Username/Email හෝ මුරපදය වැරදියි.' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('login', { title: 'Login', error: 'Username/Email හෝ මුරපදය වැරදියි.' });
    }
    req.session.user = { id: user.id, username: user.username, email: user.email, plan: user.plan };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('login', { title: 'Login', error: 'දෝෂයක් ඇතිවිය. නැවත උත්සාහ කරන්න.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Protected: Dashboard ----------
app.get('/dashboard', requireAuth, (req, res) => {
  const servers = db.prepare('SELECT * FROM servers WHERE user_id = ?').all(req.session.user.id);
  res.render('dashboard', {
    title: 'Dashboard',
    servers,
    plan: PLANS[req.session.user.plan] || PLANS.free
  });
});

app.post('/dashboard/create-server', requireAuth, (req, res) => {
  const { server_name, subdomain } = req.body;
  const plan = PLANS[req.session.user.plan] || PLANS.free;

  try {
    const existingCount = db.prepare('SELECT COUNT(*) as c FROM servers WHERE user_id = ?').get(req.session.user.id).c;
    if (existingCount >= plan.subdomains) {
      const servers = db.prepare('SELECT * FROM servers WHERE user_id = ?').all(req.session.user.id);
      return res.render('dashboard', { title: 'Dashboard', servers, plan, error: 'ඔබගේ plan එකේ server සීමාව ඉක්මවා ඇත. Premium වෙත upgrade කරන්න.' });
    }

    const cleanSub = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    db.prepare('INSERT INTO servers (user_id, server_name, subdomain, slots, status) VALUES (?, ?, ?, ?, ?)')
      .run(req.session.user.id, server_name, cleanSub, plan.slots, 'offline');

    res.redirect('/dashboard');
  } catch (err) {
    const servers = db.prepare('SELECT * FROM servers WHERE user_id = ?').all(req.session.user.id);
    res.render('dashboard', { title: 'Dashboard', servers, plan, error: 'මෙම subdomain එක දැනටමත් භාවිතයේ පවතී.' });
  }
});

app.post('/dashboard/server/:id/toggle', requireAuth, (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(req.params.id, req.session.user.id);
  if (server) {
    const newStatus = server.status === 'online' ? 'offline' : 'online';
    db.prepare('UPDATE servers SET status = ? WHERE id = ?').run(newStatus, server.id);
  }
  res.redirect('/dashboard');
});

// ---------- Protected: File Manager ----------
function getServerForUser(serverId, userId) {
  return db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(serverId, userId);
}

app.get('/dashboard/server/:id/files', requireAuth, (req, res) => {
  const server = getServerForUser(req.params.id, req.session.user.id);
  if (!server) return res.redirect('/dashboard');

  const folderId = req.query.folder ? parseInt(req.query.folder) : null;

  let currentFolder = null;
  let breadcrumb = [];
  if (folderId) {
    currentFolder = db.prepare('SELECT * FROM server_files WHERE id = ? AND server_id = ? AND type = ?').get(folderId, server.id, 'folder');
    if (!currentFolder) return res.redirect(`/dashboard/server/${server.id}/files`);
    let node = currentFolder;
    while (node) {
      breadcrumb.unshift(node);
      node = node.parent_id ? db.prepare('SELECT * FROM server_files WHERE id = ?').get(node.parent_id) : null;
    }
  }

  const items = db.prepare('SELECT * FROM server_files WHERE server_id = ? AND parent_id IS ? ORDER BY type DESC, name ASC')
    .all(server.id, folderId);

  res.render('files', { title: 'File Manager', server, items, currentFolder, breadcrumb, error: null });
});

app.post('/dashboard/server/:id/files/create', requireAuth, (req, res) => {
  const server = getServerForUser(req.params.id, req.session.user.id);
  if (!server) return res.redirect('/dashboard');

  const { name, type, parent_id } = req.body;
  const parentId = parent_id ? parseInt(parent_id) : null;
  const cleanName = (name || '').trim();

  if (!cleanName) return res.redirect(`/dashboard/server/${server.id}/files${parentId ? '?folder=' + parentId : ''}`);

  try {
    db.prepare('INSERT INTO server_files (server_id, parent_id, name, type, content) VALUES (?, ?, ?, ?, ?)')
      .run(server.id, parentId, cleanName, type === 'folder' ? 'folder' : 'file', '');
  } catch (err) {
    console.error(err);
  }
  res.redirect(`/dashboard/server/${server.id}/files${parentId ? '?folder=' + parentId : ''}`);
});

app.get('/dashboard/server/:id/files/:fileId/edit', requireAuth, (req, res) => {
  const server = getServerForUser(req.params.id, req.session.user.id);
  if (!server) return res.redirect('/dashboard');

  const file = db.prepare('SELECT * FROM server_files WHERE id = ? AND server_id = ? AND type = ?').get(req.params.fileId, server.id, 'file');
  if (!file) return res.redirect(`/dashboard/server/${server.id}/files`);

  res.render('file-edit', { title: 'Edit File', server, file, error: null, saved: false });
});

app.post('/dashboard/server/:id/files/:fileId/edit', requireAuth, (req, res) => {
  const server = getServerForUser(req.params.id, req.session.user.id);
  if (!server) return res.redirect('/dashboard');

  const file = db.prepare('SELECT * FROM server_files WHERE id = ? AND server_id = ? AND type = ?').get(req.params.fileId, server.id, 'file');
  if (!file) return res.redirect(`/dashboard/server/${server.id}/files`);

  db.prepare('UPDATE server_files SET content = ? WHERE id = ?').run(req.body.content || '', file.id);
  const updated = db.prepare('SELECT * FROM server_files WHERE id = ?').get(file.id);
  res.render('file-edit', { title: 'Edit File', server, file: updated, error: null, saved: true });
});

app.post('/dashboard/server/:id/files/:fileId/delete', requireAuth, (req, res) => {
  const server = getServerForUser(req.params.id, req.session.user.id);
  if (!server) return res.redirect('/dashboard');

  const item = db.prepare('SELECT * FROM server_files WHERE id = ? AND server_id = ?').get(req.params.fileId, server.id);
  if (item) {
    db.prepare('DELETE FROM server_files WHERE parent_id = ?').run(item.id);
    db.prepare('DELETE FROM server_files WHERE id = ?').run(item.id);
  }
  const redirectFolder = req.body.parent_id ? `?folder=${req.body.parent_id}` : '';
  res.redirect(`/dashboard/server/${server.id}/files${redirectFolder}`);
});

app.listen(PORT, () => {
  console.log(`🚀 SA-MP Hosting server running at http://localhost:${PORT}`);
});
