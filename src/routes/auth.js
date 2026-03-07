// src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authRequired } from '../middleware.js';

const router = Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  );
}

function sanitizeUser(u) {
  const { password, ...safe } = u;
  return safe;
}

// POST /auth/register
router.post('/register', (req, res) => {
  const { name, email, phone, password, provider = 'email' } = req.body;
  if (!name) return res.status(400).json({ error: '姓名為必填' });

  const id = 'usr_' + uuid().replace(/-/g,'').slice(0,12);
  const hashed = password ? bcrypt.hashSync(password, 10) : null;

  try {
    db.prepare(
      'INSERT INTO users (id, name, email, phone, password, provider) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, email || null, phone || null, hashed, provider);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json({ token: signToken(user), user: sanitizeUser(user) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '此信箱或手機已被使用' });
    }
    throw e;
  }
});

// POST /auth/login
router.post('/login', (req, res) => {
  const { email, phone, password, provider = 'email', name: socialName } = req.body;

  let user;
  if (provider === 'email') {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password || '', user.password || '')) {
      return res.status(401).json({ error: '信箱或密碼錯誤' });
    }
  } else if (provider === 'phone') {
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get('+886' + phone);
    if (!user) return res.status(401).json({ error: '此手機號碼尚未註冊，請先驗證 OTP' });
  } else {
    // Social: find or auto-create
    user = db.prepare('SELECT * FROM users WHERE email = ? AND provider = ?').get(email, provider);
    if (!user) {
      const id = 'usr_' + uuid().replace(/-/g,'').slice(0,12);
      db.prepare('INSERT INTO users (id,name,email,provider) VALUES (?,?,?,?)').run(id, socialName || email, email, provider);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
  }

  res.json({ token: signToken(user), user: sanitizeUser(user) });
});

// POST /auth/send-otp
router.post('/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: '請輸入手機號碼' });
  // Production: use Twilio/AWS SNS. Demo: return otp in response.
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('[OTP] +886 ' + phone + ' => ' + otp);
  res.json({ message: 'OTP 已發送', debug_otp: otp });
});

// POST /auth/verify-otp
router.post('/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  if (!otp || otp.length !== 6) return res.status(400).json({ error: '驗證碼格式錯誤' });

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get('+886' + phone);
  if (!user) {
    const id = 'usr_' + uuid().replace(/-/g,'').slice(0,12);
    const name = '手機用戶 ' + phone.slice(-4);
    db.prepare('INSERT INTO users (id,name,phone,provider) VALUES (?,?,?,?)').run(id, name, '+886'+phone, 'phone');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  res.json({ token: signToken(user), user: sanitizeUser(user) });
});

// GET /auth/me
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用戶不存在' });
  const badges = db.prepare('SELECT * FROM badges WHERE user_id = ?').all(req.user.id);
  const stats = db.prepare(
    "SELECT count(*) as count, COALESCE(sum(amount),0) as total FROM donations WHERE user_id = ? AND status = 'confirmed'"
  ).get(req.user.id);
  res.json({ user: sanitizeUser(user), badges, stats });
});

// PATCH /auth/me
router.patch('/me', authRequired, (req, res) => {
  const { name, is_elder } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (is_elder !== undefined) { updates.push('is_elder = ?'); params.push(is_elder ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  updates.push("updated_at = datetime('now')");
  params.push(req.user.id);
  db.prepare('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sanitizeUser(user) });
});

export default router;
