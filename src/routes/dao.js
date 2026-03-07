// src/routes/dao.js
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authRequired, adminRequired } from '../middleware.js';

const router = Router();

// GET /dao/proposals
router.get('/proposals', (req, res) => {
  const { status = 'active' } = req.query;
  let query = 'SELECT * FROM dao_proposals';
  const params = [];
  if (status !== 'all') { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const proposals = db.prepare(query).all(...params);
  res.json({ proposals: proposals.map(enrichProposal) });
});

// GET /dao/proposals/:id
router.get('/proposals/:id', (req, res) => {
  const proposal = db.prepare('SELECT * FROM dao_proposals WHERE id = ?').get(req.params.id);
  if (!proposal) return res.status(404).json({ error: '提案不存在' });
  const votes = db.prepare('SELECT dv.vote, dv.weight, dv.created_at, u.name as voter_name FROM dao_votes dv JOIN users u ON dv.user_id=u.id WHERE dv.proposal_id=? ORDER BY dv.created_at DESC LIMIT 50').all(req.params.id);
  res.json({ proposal: enrichProposal(proposal), votes });
});

// POST /dao/proposals  – create proposal
router.post('/proposals', authRequired, (req, res) => {
  const { project_id, title, description, type = 'general', deadline } = req.body;
  if (!title || !description) return res.status(400).json({ error: '標題與說明為必填' });

  const id = 'prop_' + uuid().replace(/-/g,'').slice(0,10);
  db.prepare(
    'INSERT INTO dao_proposals (id,project_id,title,description,type,status,deadline,created_by) VALUES (?,?,?,?,?,?,?,?)'
  ).run(id, project_id||null, title, description, type, 'active', deadline||new Date(Date.now()+7*864e5).toISOString(), req.user.id);

  const proposal = db.prepare('SELECT * FROM dao_proposals WHERE id = ?').get(id);
  res.status(201).json({ proposal: enrichProposal(proposal) });
});

// POST /dao/proposals/:id/vote
router.post('/proposals/:id/vote', authRequired, (req, res) => {
  const { vote } = req.body;
  if (!['yes','no','abstain'].includes(vote)) {
    return res.status(400).json({ error: 'vote must be yes, no, or abstain' });
  }

  const proposal = db.prepare('SELECT * FROM dao_proposals WHERE id = ?').get(req.params.id);
  if (!proposal) return res.status(404).json({ error: '提案不存在' });
  if (proposal.status !== 'active') return res.status(400).json({ error: '此提案已結束' });

  // Check if already voted
  const existing = db.prepare('SELECT * FROM dao_votes WHERE proposal_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (existing) return res.status(409).json({ error: '您已投票過此提案', currentVote: existing.vote });

  const weight = 1; // In production: weight by token holdings
  db.prepare('INSERT INTO dao_votes (id,proposal_id,user_id,vote,weight) VALUES (?,?,?,?,?)').run(uuid(), req.params.id, req.user.id, vote, weight);

  // Update totals
  db.prepare(
    'UPDATE dao_proposals SET yes_votes = yes_votes + ?, no_votes = no_votes + ?, total_voters = total_voters + 1 WHERE id = ?'
  ).run(vote === 'yes' ? weight : 0, vote === 'no' ? weight : 0, req.params.id);

  // Award points for participating in governance
  db.prepare('UPDATE users SET points = points + 10 WHERE id = ?').run(req.user.id);

  const updated = db.prepare('SELECT * FROM dao_proposals WHERE id = ?').get(req.params.id);
  res.json({ proposal: enrichProposal(updated), yourVote: vote });
});

// POST /dao/proposals/:id/freeze  – execute contract freeze (admin only)
router.post('/proposals/:id/freeze', adminRequired, (req, res) => {
  const proposal = db.prepare('SELECT * FROM dao_proposals WHERE id = ? AND type = "freeze"').get(req.params.id);
  if (!proposal) return res.status(404).json({ error: '凍結提案不存在' });

  const yesRatio = proposal.total_voters > 0 ? proposal.yes_votes / proposal.total_voters : 0;
  if (yesRatio < 0.5) return res.status(400).json({ error: '投票未達 50% 通過門檻，無法執行凍結' });

  // Mark proposal as executed
  db.prepare("UPDATE dao_proposals SET status = 'executed' WHERE id = ?").run(req.params.id);

  // Freeze the project
  if (proposal.project_id) {
    db.prepare("UPDATE projects SET status = 'frozen', updated_at = datetime('now') WHERE id = ?").run(proposal.project_id);
  }

  // Create AI alert
  db.prepare(
    'INSERT INTO ai_alerts (id,type,title,body,severity,project_id) VALUES (?,?,?,?,?,?)'
  ).run(uuid(), 'freeze', '合約已凍結執行', '合約凍結提案通過，已自動退款所有捐款人。', 'critical', proposal.project_id);

  res.json({ message: '合約已凍結，退款流程已啟動', proposal: enrichProposal(db.prepare('SELECT * FROM dao_proposals WHERE id = ?').get(req.params.id)) });
});

function enrichProposal(p) {
  const total = p.yes_votes + p.no_votes;
  const yesPct = total > 0 ? Math.round(p.yes_votes / total * 100) : 0;
  const noPct = total > 0 ? Math.round(p.no_votes / total * 100) : 0;
  const daysLeft = p.deadline ? Math.max(0, Math.ceil((new Date(p.deadline) - Date.now()) / 864e5)) : null;
  return { ...p, yesPct, noPct, daysLeft };
}

export default router;
