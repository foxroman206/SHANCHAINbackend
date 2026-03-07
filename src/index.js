// src/index.js  – Main Express server entry point
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { errorHandler } from './middleware.js';
import authRouter      from './routes/auth.js';
import projectsRouter  from './routes/projects.js';
import donationsRouter from './routes/donations.js';
import daoRouter       from './routes/dao.js';
import aiRouter        from './routes/ai-proxy.js';
// Note: ai.js kept for reference; ai-proxy.js adds Python AI service integration
import db              from './db.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',      authRouter);
app.use('/projects',  projectsRouter);
app.use('/donations', donationsRouter);
app.use('/dao',       daoRouter);
app.use('/ai',        aiRouter);

// Health check
app.get('/health', (req, res) => {
  const stats = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    db: {
      users:     db.prepare('SELECT count(*) as c FROM users').get().c,
      projects:  db.prepare('SELECT count(*) as c FROM projects').get().c,
      donations: db.prepare('SELECT count(*) as c FROM donations').get().c,
    }
  };
  res.json(stats);
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found: ' + req.path }));

// Error handler
app.use(errorHandler);

// ── WebSocket – real-time donation feed ───────────────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  // Send latest stats on connect
  ws.send(JSON.stringify({ type: 'connected', message: '善鏈即時連線已建立' }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'subscribe' && msg.projectId) {
        ws.subscribedProject = msg.projectId;
      }
    } catch {}
  });

  ws.on('close', () => console.log('[WS] Client disconnected'));
});

// Broadcast donation events to all connected clients
export function broadcastDonation(donation) {
  const payload = JSON.stringify({ type: 'donation', donation });
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(payload);
  });
}

// Simulate live ticker every 30 seconds
setInterval(() => {
  const messages = [
    { type: 'ticker', msg: '🟢 新捐款：花蓮水災緊急救援 +NT$500' },
    { type: 'ticker', msg: '🛡 AI 攔截：疑似異常捐款集群已凍結' },
    { type: 'ticker', msg: '📊 里程碑達成：第一批物資已確認送達' },
    { type: 'ticker', msg: '🏛️ DAO 投票進行中：宮廟合約凍結提案' },
  ];
  const msg = JSON.stringify(messages[Math.floor(Math.random() * messages.length)]);
  wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}, 30000);

server.listen(PORT, () => {
  console.log('');
  console.log('  ⛓️  GoodChain Backend Server');
  console.log('  ─────────────────────────────────────');
  console.log('  HTTP  → http://localhost:' + PORT);
  console.log('  AI    → ' + (process.env.AI_SERVICE_URL || 'http://localhost:5001') + ' (Python AI service)');
  console.log('  WS    → ws://localhost:' + PORT + '/ws');
  console.log('  ─────────────────────────────────────');
  console.log('  Routes:');
  console.log('    POST   /auth/register      建立帳號');
  console.log('    POST   /auth/login         登入');
  console.log('    POST   /auth/send-otp      發送 OTP');
  console.log('    POST   /auth/verify-otp    驗證 OTP');
  console.log('    GET    /auth/me            我的資料');
  console.log('    GET    /projects           所有專案');
  console.log('    GET    /projects/:id       專案詳情');
  console.log('    POST   /projects           新增專案');
  console.log('    POST   /donations          捐款');
  console.log('    GET    /donations          我的捐款記錄');
  console.log('    GET    /dao/proposals      DAO 提案');
  console.log('    POST   /dao/proposals/:id/vote  投票');
  console.log('    GET    /ai/stats           AI 引擎統計');
  console.log('    GET    /ai/alerts          風險警報');
  console.log('    GET    /health             健康檢查');
  console.log('  ─────────────────────────────────────');
  console.log('  Demo accounts:');
  console.log('    admin@goodchain.tw / demo1234  (admin)');
  console.log('    demo@goodchain.tw  / demo1234  (user)');
  console.log('  ─────────────────────────────────────');
  console.log('');
});
