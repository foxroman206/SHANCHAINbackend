// src/routes/donations.js
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authRequired, optionalAuth } from '../middleware.js';

const router = Router();

// POST /donations  – create a donation (simulates payment gateway)
router.post('/', optionalAuth, (req, res) => {
  const { project_id, amount, method, method_tab = 'fiat', is_anonymous = false, want_nft = true } = req.body;

  if (!project_id || !amount || !method) {
    return res.status(400).json({ error: '缺少必要欄位：project_id, amount, method' });
  }
  if (amount < 10 || amount > 1000000) {
    return res.status(400).json({ error: '金額需介於 NT$10 ~ NT$1,000,000' });
  }

  const project = db.prepare("SELECT * FROM projects WHERE id = ? AND status = 'active'").get(project_id);
  if (!project) return res.status(404).json({ error: '專案不存在或已關閉' });

  // Simulate payment processing delay + success
  const txHash = '0x' + uuid().replace(/-/g,'').slice(0,16) + '...' + uuid().replace(/-/g,'').slice(0,4);
  const donationId = 'don_' + uuid().replace(/-/g,'').slice(0,12);
  const nftMinted = (want_nft && amount >= 100) ? 1 : 0;

  // Check KYC requirement
  if (amount > 10000 && (!req.user)) {
    return res.status(400).json({ error: 'KYC_REQUIRED', message: '單筆超過 NT$10,000 需要身份驗證，請先登入' });
  }

  // Insert donation record (status: pending -> confirmed after simulate)
  db.prepare(
    'INSERT INTO donations (id,user_id,project_id,amount,method,method_tab,is_anonymous,nft_minted,tx_hash,status) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(donationId, req.user?.id || null, project_id, amount, method, method_tab, is_anonymous?1:0, nftMinted, txHash, 'confirmed');

  // Update project raised amount and donor count
  db.prepare(
    'UPDATE projects SET raised = raised + ?, donor_count = donor_count + 1, updated_at = datetime("now") WHERE id = ?'
  ).run(amount, project_id);

  // Award points and badges to logged-in user
  if (req.user) {
    const points = Math.floor(amount / 10);
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(points, req.user.id);

    // First donation badge
    const donCount = db.prepare("SELECT count(*) as c FROM donations WHERE user_id = ? AND status='confirmed'").get(req.user.id).c;
    if (donCount === 1) {
      try { db.prepare('INSERT INTO badges (id,user_id,badge_key,badge_name,badge_emoji) VALUES (?,?,?,?,?)').run(uuid(), req.user.id, 'first_donate', '初次捐款', '🌱'); } catch(e) {}
    }
    if (donCount === 3) {
      try { db.prepare('INSERT INTO badges (id,user_id,badge_key,badge_name,badge_emoji) VALUES (?,?,?,?,?)').run(uuid(), req.user.id, 'streak_3', '連續捐款3次', '🔥'); } catch(e) {}
    }
    if (nftMinted) {
      try { db.prepare('INSERT INTO badges (id,user_id,badge_key,badge_name,badge_emoji) VALUES (?,?,?,?,?)').run(uuid(), req.user.id, 'nft_holder', 'NFT 持有者', '🎨'); } catch(e) {}
    }
  }

  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(donationId);
  const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);

  res.status(201).json({
    donation,
    txHash,
    nftMinted: nftMinted === 1,
    project: { raised: updatedProject.raised, donor_count: updatedProject.donor_count, pct: Math.min(100, Math.round(updatedProject.raised / updatedProject.goal * 100)) },
    message: '捐款成功！已鎖入智能合約',
  });
});

// GET /donations  – current user's donation history
router.get('/', authRequired, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const donations = db.prepare(
    'SELECT d.*, p.title as project_title, p.emoji as project_emoji FROM donations d JOIN projects p ON d.project_id=p.id WHERE d.user_id=? ORDER BY d.created_at DESC LIMIT ? OFFSET ?'
  ).all(req.user.id, parseInt(limit), parseInt(offset));

  const total = db.prepare("SELECT count(*) as c, COALESCE(sum(amount),0) as sum FROM donations WHERE user_id=? AND status='confirmed'").get(req.user.id);

  res.json({ donations, total: total.c, totalAmount: total.sum, page: parseInt(page) });
});

// GET /donations/project/:projectId  – public donation feed for a project
router.get('/project/:projectId', (req, res) => {
  const donors = db.prepare(
    "SELECT d.amount, d.method, d.is_anonymous, d.created_at, CASE WHEN d.is_anonymous=1 THEN '匿名善心人士' ELSE u.name END as donor_name FROM donations d LEFT JOIN users u ON d.user_id=u.id WHERE d.project_id=? AND d.status='confirmed' ORDER BY d.created_at DESC LIMIT 20"
  ).all(req.params.projectId);
  res.json({ donors });
});

export default router;
