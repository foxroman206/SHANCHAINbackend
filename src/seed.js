// src/seed.js – seed realistic demo data
import db from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

console.log('Seeding database...');

// ── Users ────────────────────────────────────────────────────────────────────
const pw = bcrypt.hashSync('demo1234', 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id,name,email,phone,password,provider,role,points,level)
  VALUES (?,?,?,?,?,?,?,?,?)
`);

const users = [
  ['usr_admin','管理員 Admin','admin@goodchain.tw',null,pw,'email','admin',9999,10],
  ['usr_demo', '陳小明','demo@goodchain.tw',null,pw,'email','user',1250,3],
  ['usr_ngo',  '台灣紅十字會','ngo@redcross.org.tw',null,pw,'email','ngo',500,2],
];
users.forEach(u => insertUser.run(...u));

// ── Projects ─────────────────────────────────────────────────────────────────
const insertProject = db.prepare(`
  INSERT OR IGNORE INTO projects
  (id,title,org,description,category,emoji,goal,raised,donor_count,deadline,ai_score,ai_desc,is_religion,status,contract_addr,created_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const projects = [
  ['proj_flood',
   '花蓮水災緊急救援物資',
   '台灣紅十字會',
   '花蓮縣受強颱侵襲，超過 2,300 名居民被迫撤離家園。本計畫緊急採購飲用水、食品包、禦寒衣物及醫療耗材，由當地 NGO 協同發放，所有款項通過智能合約鎖定。',
   '災害救援','🌊',500000,365000,892,
   new Date(Date.now()+3*864e5).toISOString(),
   94,'緊急度極高 · 影響人口 2,300+
詐騙風險：極低 · 可信度：頂級',
   0,'active','0x7f3a9b2c4d8e1f5a','usr_ngo'],

  ['proj_school',
   '偏鄉學童數位教育設備',
   '未來種子基金會',
   '為台東、花蓮偏鄉 480 名學童提供平板電腦、網路設備及數位課程訂閱，縮短城鄉數位落差。本計畫與教育部合作，持續追蹤學習成效。',
   '教育','💻',300000,135000,341,
   new Date(Date.now()+14*864e5).toISOString(),
   87,'長期影響高 · 受益學童 480 人
詐騙風險：極低 · 可信度：優良',
   0,'active','0x3c9d2e1f4a8b7c6d','usr_admin'],

  ['proj_elder',
   '獨居老人冬季送暖計畫',
   '台北市社會局',
   '台北市 150 位獨居老人將在寒冬中面臨禦寒困難。本計畫提供保暖衣物組合、電熱毯、緊急聯絡設備及定期訪視服務，由社工師實地確認每份物資的送達。',
   '老人關懷','❤️',200000,24000,89,
   new Date(Date.now()+21*864e5).toISOString(),
   79,'社會影響重要 · 受益長者 150 人
詐騙風險：無 · 可信度：政府機構',
   0,'active','0x1a2b3c4d5e6f0a1b','usr_admin'],

  ['proj_temple',
   '大甲媽祖宮廟修繕工程',
   '大甲鎮瀾宮',
   '大甲鎮瀾宮為台灣重要文化資產，本次修繕工程包含主殿屋頂整修及防水處理。注意：本專案為宗教類高風險，每 NT0,000 一個里程碑，需上傳實地照片方可解鎖。',
   '宗教文化','⛩️',500000,140000,203,
   new Date(Date.now()+30*864e5).toISOString(),
   61,'⚠️ 宗教高風險類別 · 可信度：審核中
需 DAO 投票通過 · 詐騙風險：中',
   1,'active','0x4a8b2c9d3e6f1b7e','usr_admin'],
];
projects.forEach(p => insertProject.run(...p));

// ── Milestones ────────────────────────────────────────────────────────────────
const insertMS = db.prepare(`
  INSERT OR IGNORE INTO milestones (id,project_id,title,target_amount,completed,completed_at)
  VALUES (?,?,?,?,?,?)
`);
const milestones = [
  ['ms1','proj_flood','第一批物資發放',150000,1,new Date(Date.now()-2*864e5).toISOString()],
  ['ms2','proj_flood','醫療物資採購',300000,0,null],
  ['ms3','proj_flood','臨時住所安置',500000,0,null],
  ['ms4','proj_school','首批平板採購',100000,1,new Date(Date.now()-7*864e5).toISOString()],
  ['ms5','proj_school','網路設備安裝',200000,0,null],
  ['ms6','proj_temple','施工前審計',50000,1,new Date(Date.now()-5*864e5).toISOString()],
  ['ms7','proj_temple','主殿修繕工程',100000,0,null],
];
milestones.forEach(m => insertMS.run(...m));

// ── Donations ────────────────────────────────────────────────────────────────
const insertDon = db.prepare(`
  INSERT OR IGNORE INTO donations (id,user_id,project_id,amount,method,method_tab,is_anonymous,nft_minted,tx_hash,status)
  VALUES (?,?,?,?,?,?,?,?,?,?)
`);
const donations = [
  [uuid(),'usr_demo','proj_flood',1000,'card','fiat',0,1,'0xabc...001','confirmed'],
  [uuid(),'usr_demo','proj_flood',500,'linepay','fiat',0,1,'0xabc...002','confirmed'],
  [uuid(),'usr_demo','proj_school',3000,'card','fiat',0,1,'0xabc...003','confirmed'],
  [uuid(),'usr_demo','proj_elder',500,'cvs','fiat',1,0,'0xabc...004','confirmed'],
  [uuid(),'usr_demo','proj_temple',2000,'usdt','crypto',0,1,'0xabc...005','confirmed'],
];
donations.forEach(d => insertDon.run(...d));

// ── DAO Proposals ─────────────────────────────────────────────────────────────
const insertProp = db.prepare(`
  INSERT OR IGNORE INTO dao_proposals (id,project_id,title,description,type,yes_votes,no_votes,total_voters,status,deadline,created_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)
`);
const proposals = [
  ['prop_temple_freeze','proj_temple',
   '凍結大甲鎮瀾宮合約',
   '因第一里程碑照片疑似偽造，提議凍結合約並退款所有捐款人（203位，共NT40,000）。',
   'freeze',144,63,207,'active',
   new Date(Date.now()+2*864e5).toISOString(),'usr_admin'],
  ['prop_school_verify','proj_school',
   '增加教育類審核標準',
   '提議對所有教育類專案新增「學校公文認證」要求，防範假冒偏鄉學校詐騙。',
   'policy',89,23,112,'active',
   new Date(Date.now()+5*864e5).toISOString(),'usr_demo'],
  ['prop_flood_ms2','proj_flood',
   '授權花蓮計畫第二里程碑撥款',
   '第一批物資已確認發放（有照片存證），提議授權撥出第二里程碑資金 NT50,000。',
   'milestone',312,8,320,'active',
   new Date(Date.now()+1*864e5).toISOString(),'usr_ngo'],
];
proposals.forEach(p => insertProp.run(...p));

// ── AI Alerts ─────────────────────────────────────────────────────────────────
const insertAlert = db.prepare(`
  INSERT OR IGNORE INTO ai_alerts (id,type,title,body,severity,project_id)
  VALUES (?,?,?,?,?,?)
`);
const alerts = [
  [uuid(),'fraud','偵測到可疑宮廟捐款集群','發現 12 個帳號在 3 分鐘內從同一 IP 對 proj_temple 進行小額測試性捐款，懷疑洗錢偵測規避。','critical','proj_temple'],
  [uuid(),'milestone','花蓮計畫里程碑照片已驗證','AI 圖像比對確認照片與 GPS 坐標吻合，建議 DAO 通過第二里程碑撥款。','success','proj_flood'],
  [uuid(),'risk','新上線教育類專案需人工審核','偏鄉學童數位計畫缺少教育部公文，已自動降低 AI 評分至 67/100 等待補件。','warning','proj_school'],
  [uuid(),'system','本月 AI 掃描完成統計','本月共掃描 1,284 個捐款事件，攔截 7 起疑似詐騙，保護資金 NT23,000。','info',null],
];
alerts.forEach(a => insertAlert.run(...a));

// ── Badges ────────────────────────────────────────────────────────────────────
const insertBadge = db.prepare(`
  INSERT OR IGNORE INTO badges (id,user_id,badge_key,badge_name,badge_emoji)
  VALUES (?,?,?,?,?)
`);
const badges = [
  [uuid(),'usr_demo','first_donate','初次捐款','🌱'],
  [uuid(),'usr_demo','streak_3','連續捐款3次','🔥'],
  [uuid(),'usr_demo','guardian_lv3','守護者 Lv.3','⭐'],
  [uuid(),'usr_demo','nft_holder','NFT 持有者','🎨'],
];
badges.forEach(b => insertBadge.run(...b));

console.log('Seed complete!');
console.log('  users:', db.prepare('SELECT count(*) as c FROM users').get().c);
console.log('  projects:', db.prepare('SELECT count(*) as c FROM projects').get().c);
console.log('  donations:', db.prepare('SELECT count(*) as c FROM donations').get().c);
console.log('  proposals:', db.prepare('SELECT count(*) as c FROM dao_proposals').get().c);
console.log('  alerts:', db.prepare('SELECT count(*) as c FROM ai_alerts').get().c);
