// src/routes/projects.js
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authRequired, optionalAuth, adminRequired } from '../middleware.js';

const router = Router();

// GET /projects  – list all (with optional filter)
router.get('/', optionalAuth, (req, res) => {
  const { category, status = 'active', search, sort = 'raised' } = req.query;

  let query = 'SELECT * FROM projects WHERE 1=1';
  const params = [];

  if (status !== 'all') { query += ' AND status = ?'; params.push(status); }
  if (category && category !== 'all') { query += ' AND category = ?'; params.push(category); }
  if (search) { query += ' AND (title LIKE ? OR org LIKE ? OR description LIKE ?)'; params.push('%'+search+'%','%'+search+'%','%'+search+'%'); }

  const sortMap = { raised: 'raised DESC', score: 'ai_score DESC', new: 'created_at DESC', urgent: 'deadline ASC' };
  query += ' ORDER BY ' + (sortMap[sort] || 'raised DESC');

  const projects = db.prepare(query).all(...params);
  res.json({ projects: projects.map(enrichProject) });
});

// GET /projects/:id
router.get('/:id', optionalAuth, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: '專案不存在' });

  const milestones = db.prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY target_amount').all(req.params.id);
  const recentDonors = db.prepare(
    "SELECT d.amount, d.method, d.is_anonymous, d.created_at, CASE WHEN d.is_anonymous=1 THEN '匿名善心人士' ELSE u.name END as donor_name FROM donations d LEFT JOIN users u ON d.user_id=u.id WHERE d.project_id=? AND d.status='confirmed' ORDER BY d.created_at DESC LIMIT 10"
  ).all(req.params.id);

  res.json({ project: enrichProject(project), milestones, recentDonors });
});

// POST /projects  – create new project
router.post('/', authRequired, (req, res) => {
  const { title, org, description, category, emoji, goal, deadline } = req.body;
  if (!title || !org || !description || !category || !goal) {
    return res.status(400).json({ error: '必填欄位缺少' });
  }

  const id = 'proj_' + uuid().replace(/-/g,'').slice(0,10);
  const isReligion = category === '宗教文化' ? 1 : 0;

  // Simulate AI scoring
  const aiScore = isReligion
    ? Math.floor(50 + Math.random() * 20)
    : Math.floor(70 + Math.random() * 25);
  const aiDesc = isReligion
    ? '⚠️ 宗教高風險類別 · 需 DAO 投票通過'
    : '已通過初步 AI 審核 · 等待文件驗證';
  const status = isReligion ? 'pending_dao' : 'active';

  db.prepare(
    'INSERT INTO projects (id,title,org,description,category,emoji,goal,ai_score,ai_desc,is_religion,status,deadline,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, title, org, description, category, emoji||'🌟', parseInt(goal), aiScore, aiDesc, isReligion, status, deadline||null, req.user.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);

  // If religion, auto-create DAO proposal
  if (isReligion) {
    const propId = 'prop_' + uuid().replace(/-/g,'').slice(0,10);
    db.prepare(
      'INSERT INTO dao_proposals (id,project_id,title,description,type,status,deadline,created_by) VALUES (?,?,?,?,?,?,?,?)'
    ).run(propId, id, '審核：' + title, '新宗教類專案審核投票，請社群審查資料並決定是否上線。', 'review', 'active', new Date(Date.now()+3*864e5).toISOString(), req.user.id);
  }

  res.status(201).json({ project: enrichProject(project) });
});

// PATCH /projects/:id  – update (admin or owner)
router.patch('/:id', authRequired, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: '專案不存在' });
  if (project.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '無權限修改此專案' });
  }

  const { title, description, status } = req.body;
  const updates = [];
  const params = [];
  if (title) { updates.push('title = ?'); params.push(title); }
  if (description) { updates.push('description = ?'); params.push(description); }
  if (status && req.user.role === 'admin') { updates.push('status = ?'); params.push(status); }
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare('UPDATE projects SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json({ project: enrichProject(updated) });
});

// GET /projects/:id/milestones
router.get('/:id/milestones', (req, res) => {
  const ms = db.prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY target_amount').all(req.params.id);
  res.json({ milestones: ms });
});

// POST /projects/:id/milestones/:msId/complete  – mark milestone done (admin)
router.post('/:id/milestones/:msId/complete', adminRequired, (req, res) => {
  db.prepare(
    "UPDATE milestones SET completed = 1, completed_at = datetime('now'), photo_url = ? WHERE id = ? AND project_id = ?"
  ).run(req.body.photo_url || null, req.params.msId, req.params.id);
  const ms = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.msId);
  res.json({ milestone: ms });
});

function enrichProject(p) {
  const pct = p.goal > 0 ? Math.min(100, Math.round(p.raised / p.goal * 100)) : 0;
  const daysLeft = p.deadline
    ? Math.max(0, Math.ceil((new Date(p.deadline) - Date.now()) / 864e5))
    : null;
  return { ...p, pct, daysLeft, raisedFormatted: 'NT$' + p.raised.toLocaleString(), goalFormatted: 'NT$' + p.goal.toLocaleString() };
}

export default router;
