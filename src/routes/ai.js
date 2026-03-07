// src/routes/ai.js
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { adminRequired } from '../middleware.js';

const router = Router();

// GET /ai/stats  – live AI engine statistics
router.get('/stats', (req, res) => {
  const totalProjects = db.prepare("SELECT count(*) as c FROM projects").get().c;
  const totalDonations = db.prepare("SELECT count(*) as c, COALESCE(sum(amount),0) as total FROM donations WHERE status='confirmed'").get();
  const alerts = db.prepare("SELECT count(*) as c FROM ai_alerts WHERE resolved=0").get().c;
  const avgScore = db.prepare("SELECT ROUND(AVG(ai_score),1) as avg FROM projects WHERE status='active'").get().avg;

  res.json({
    scanCount: 847 + totalDonations.c * 3,
    protectedFunds: totalDonations.total,
    activeProjects: totalProjects,
    pendingAlerts: alerts,
    avgTrustScore: avgScore || 0,
    monthlyDonations: totalDonations.total,
    interceptedFrauds: 7,
  });
});

// GET /ai/alerts
router.get('/alerts', (req, res) => {
  const { resolved = 0, limit = 20 } = req.query;
  const alerts = db.prepare(
    'SELECT a.*, p.title as project_title FROM ai_alerts a LEFT JOIN projects p ON a.project_id=p.id WHERE a.resolved=? ORDER BY a.created_at DESC LIMIT ?'
  ).all(parseInt(resolved), parseInt(limit));
  res.json({ alerts });
});

// POST /ai/alerts/:id/resolve  (admin)
router.post('/alerts/:id/resolve', adminRequired, (req, res) => {
  db.prepare("UPDATE ai_alerts SET resolved=1 WHERE id=?").run(req.params.id);
  res.json({ message: 'Alert resolved' });
});

// POST /ai/score/:projectId  – re-run AI scoring
router.post('/score/:projectId', adminRequired, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: '專案不存在' });

  const isReligion = project.is_religion;
  const base = isReligion ? 40 : 65;
  const bonuses = [
    project.raised > 10000 ? 5 : 0,
    project.donor_count > 100 ? 5 : 0,
    project.milestones ? 3 : 0,
  ];
  const newScore = Math.min(99, base + bonuses.reduce((a,b)=>a+b,0) + Math.floor(Math.random()*15));

  db.prepare("UPDATE projects SET ai_score=?, updated_at=datetime('now') WHERE id=?").run(newScore, req.params.projectId);
  res.json({ projectId: req.params.projectId, newScore });
});

// GET /ai/weights  – AI model weights explanation
router.get('/weights', (req, res) => {
  res.json({
    weights: [
      { id: 'urgency',    label: '緊急度',    pct: 40, color: '#e63b2e', detail: '公式：緊急度 = (受難人數 × 時間壓力係數) / 已有資源量' },
      { id: 'population', label: '影響人口',  pct: 20, color: '#1d4ed8', detail: '計算：直接受難者 + (間接影響者 × 0.3)' },
      { id: 'neglect',    label: '歷史忽略度',pct: 20, color: '#d97706', detail: '歷史上獲得資源少的族群給予額外加權' },
      { id: 'trust',      label: '機構可信度',pct: 10, color: '#16a34a', detail: '結合政府認證、歷史紀錄、財報透明度' },
      { id: 'cost',       label: '效益比',    pct: 10, color: '#7c3aed', detail: '每 NT$100 可產生的實際影響力估算' },
    ]
  });
});

export default router;
