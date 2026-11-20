// COMMOON SOCIETY v0.4 — all configurable content. Numbers are PLAY-TEST DEFAULTS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ───────────── School status (5 areas) ─────────────
export const STATUS_KEYS = ['safety', 'trust', 'belonging', 'cooperation', 'wellbeing'];
export const STATUS_META = {
  safety: { th: 'ความปลอดภัย', icon: '🛡' },
  trust: { th: 'ความไว้วางใจ', icon: '🤝' },
  belonging: { th: 'ความรู้สึกเป็นส่วนหนึ่ง', icon: '🏠' },
  cooperation: { th: 'ความร่วมมือ', icon: '🧩' },
  wellbeing: { th: 'สุขภาวะของชุมชน', icon: '💚' },
};
export const STATUS_START = 50;
export const COLLAPSE_AT = 20;       // 2 areas ≤ 20 → school collapses (red wins)
export const COLLAPSE_COUNT = 2;

// ───────────── Modes & time ─────────────
// 1 game day = 60 s of game clock. Reading pauses (story, morning card, votes) do not count.
export const MODES = {
  short:    { th: 'ระยะสั้น', days: 7,    missions: false, endAvg: 65, costX: 0.85 },
  medium:   { th: 'ระยะกลาง', days: 15,   missions: true, needSuccess: 3, failLimit: 3, endAvg: 66, costX: 1.5 },
  marathon: { th: 'มาราธอน', days: null, missions: true, needSuccess: 3, failLimit: 3, marathonAvg: 72, costX: 1.6 },
};
export const T = {
  story: 45, card: 45,             // pauses (not game time)
  day: 40, night: 20,              // normal day = 60 s
  propose: 15, teamVote: 10, mission: 10, missionNight: 25, // mission day = 60 s (+ extra proposals if rejected)
  voteTalk: 45, voteCast: 5, voteResult: 6, voteCooldown: 45,
};
export const MISSION_EVERY = 2;      // a diplomatic mission every 2nd day (medium/marathon)
export const MAX_REJECTS = 3;
export const REPORTS_TO_OPEN = 4;    // 4 reports in one day open a vote
export const PLAYER_MIN = 5, PLAYER_MAX = 50;

// ───────────── Player will-power (พลังใจ) ─────────────
export const WILL = { start: 70, max: 100, curse: 5, bully: 15, heal: 15, gangHeal: 10, low: 20 };
export const HEARTS_PER_DAY = 3;
export const PAIR_UNLOCK = 5;        // hearts between two players → shared card

// ───────────── Story ─────────────
export const STORY = {
  title: 'คำสาปแสงจันทร์',
  school: 'โรงเรียนมูนสคูล',
  lines: [
    'เมื่อหลายสิบปีก่อน มีนักเรียนคนหนึ่งยืนรอหน้าประตูโรงเรียนมูนสคูลในคืนพระจันทร์เต็มดวง แต่ไม่มีใครเปิดประตูให้เขา',
    'ตั้งแต่คืนนั้น ทุกครั้งที่แสงจันทร์ส่องถึงรั้วโรงเรียน คนในรั้วจะค่อย ๆ หมดแรงใจ',
    'ทุกรุ่นมีคนหนึ่งที่รู้ความจริง แต่ไม่มีใครกล้าพูดออกมา',
    'วันนี้ตำนานนั้นกลับมาอีกครั้ง พร้อมกับข่าวลือที่ไม่มีใครรู้ว่าจริงหรือไม่',
    'ถ้าอยากให้แสงพระอาทิตย์กลับมาส่องถึงโรงเรียน ทุกคนต้องเลือกว่าจะเปิดประตูให้ใคร',
  ],
  acts: [
    { at: 0.0, th: 'องก์ 1 · แสงจันทร์แรก', text: 'ทุกคนเริ่มเห็นว่าแสงจันทร์ทำให้เพื่อนหมดแรงใจ แต่ยังไม่มีใครรู้ว่าใครเป็นต้นเหตุ' },
    { at: 0.34, th: 'องก์ 2 · ข่าวลือลามทั้งโรงเรียน', text: 'ข่าวลือแพร่ไปทั่วโรงเรียน ทุกคนต้องเลือกว่าจะเชื่อใครและจะช่วยใคร' },
    { at: 0.67, th: 'องก์ 3 · ก่อนรุ่งสาง', text: 'ความจริงใกล้ถูกเปิดเผย แสงพระอาทิตย์จะกลับมาหรือไม่ ขึ้นอยู่กับทางเลือกของทุกคน' },
  ],
};

export function briefing(mode) {
  const pages = [
    { title: 'วันที่ 1 ที่โรงเรียนมูนสคูล', text: 'วันนี้ยังไม่มีไพ่สถานการณ์ 1 วันในเกมคือ 1 นาที ทุกเช้าจะมีสถานการณ์ใหม่ให้ทุกคนเลือกบนมือถือ' },
    { title: 'โรงเรียนมี 5 ด้านที่ต้องดูแล', text: 'ความปลอดภัย · ความไว้วางใจ · ความรู้สึกเป็นส่วนหนึ่ง · ความร่วมมือ · สุขภาวะของชุมชน เริ่มที่ 50 ถ้า 2 ด้านลดถึง 20 โรงเรียนพังทันที' },
    { title: 'ภารกิจร่วม: สร้างโรงเรียนปลอดภัย', text: 'ช่วยกันลงขันพลังใจทำโครงการให้ครบทั้ง 5 ด้าน แสงพระอาทิตย์จึงจะกลับมา' },
    { title: 'บทบาทและคุณลักษณะ', text: 'บทบาทเปิดเผยให้ทุกคนเห็น ส่วนคุณลักษณะซ่อนอยู่ในมือถือ อย่าเปิดให้เพื่อนดู' },
    { title: 'โหวตและแจ้งเหตุ', text: 'ประธานเปิดโหวตได้ทันที คนอื่นต้องกดแจ้งเหตุรวมกัน 4 คนในวันเดียว คนที่ได้คะแนนสูงสุดคนเดียวจะใช้ความสามารถของคุณลักษณะไม่ได้อีกจนจบเกม' },
  ];
  if (MODES[mode].missions) pages.splice(3, 0, {
    title: 'ภารกิจทูตสัมพันธไมตรี (ทุก 2 วัน)',
    text: 'ผู้นำรอบเลือกทีมทูต ทุกคนโหวตเห็นชอบหรือไม่ ไม่ผ่าน 3 ครั้ง ทีมสุดท้ายถูกส่งไปเลย ทีมทูตเลือกการ์ดลับ สำเร็จได้ทรัพยากรไปทำโครงการ ล้มเหลวครบ 3 ครั้งฝ่ายแดงชนะ',
  });
  return pages;
}

// ───────────── Public roles (บทบาท) — everyone sees these ─────────────
export const ROLES = {
  president:  { th: 'ประธานนักเรียน', unique: true, skill: 'เปิดโหวตได้ทันที · เลือกโครงการ · ถือคลังทรัพยากร' },
  vice:       { th: 'รองประธานนักเรียน', unique: true, skill: 'ลงขันได้ ×1.5 · ขึ้นเป็นรักษาการประธานถ้าประธานถูกถอด' },
  opposition: { th: 'คณะกรรมการฝ่ายค้าน', unique: true, skill: 'กดแจ้งเหตุหรือยื่นญัตตินับเป็น 2 เสียง' },
  rep:        { th: 'ตัวแทนระดับชั้น', unique: true, skill: 'Voice of the Grade: เสียงเลือกในไพ่สถานการณ์นับ 2' },
  celeb:      { th: 'เซเลบ', unique: true, skill: 'Social Influence: เสียงเลือกนับ 2 · Backlash: ถ้าทางเลือกที่ชนะแย่ที่สุด ผลลบเพิ่ม 1 เท่า' },
  academic:   { th: 'นักเรียนสายวิชาการ', skill: 'วันละครั้ง วิเคราะห์ 1 คนว่าเมื่อคืนทำร้ายใครไหม (แม่น 70%)' },
  athlete:    { th: 'นักกีฬา', skill: 'Team Spirit: ถ้านักกีฬา 2 คนขึ้นไปลงขันวันเดียวกัน ทุกคนได้โบนัส +20%' },
  angel:      { th: 'แก๊งนางฟ้า', skill: 'Friendship Circle: รู้ว่าใครเป็นแก๊ง · No One Left Behind: คืนละครั้งดูแลเพื่อน +10 พลังใจ' },
  student:    { th: 'นักเรียนทั่วไป', skill: 'ให้หัวใจได้วันละ 4 ครั้ง (คนอื่น 3)' },
};

// ───────────── Personal stats (ค่าสถานะของแต่ละคน) ─────────────
// will = พลังใจ (WILL above). str = ความแข็งแรง, eco = เศรษฐกิจ, acc = การยอมรับและการมีส่วนร่วม.
export const STATS = {
  str: { th: 'ความแข็งแรง', start: 50, regen: 5, low: 30 },         // < low → ลงขันได้แค่ 5
  eco: { th: 'เศรษฐกิจ', start: 50, daily: 5, studentDaily: 8, mission: 10, donateBack: 3, cap: 15, rich: 70 },
  acc: { th: 'การยอมรับและการมีส่วนร่วม', start: 50, heartGive: 3, heartGet: 1, vote: 2, report: 5, pair: 5, cap: 15, lonely: 30, craverWin: 70 },
};
export const ecoMultiplier = (eco) => 0.8 + Math.max(0, Math.min(100, eco)) / 250; // eco 0 → ×0.8 · 50 → ×1.0 · 100 → ×1.2

// ───────────── Hidden traits (คุณลักษณะ) — 21 assignable ─────────────
export const COLORS = {
  blue: { th: 'สีน้ำเงิน', goal: 'สร้างโรงเรียนปลอดภัย: ทำโครงการครบ 5 ด้าน (และภารกิจทูตสำเร็จ 3 ครั้งในโหมดที่มีทูต) หรือจบเกมโดยสถานะเฉลี่ยถึงเป้า' },
  red: { th: 'สีแดง', goal: 'ทำให้โรงเรียนพัง (2 ด้าน ≤ 20) หรือภารกิจทูตล้มเหลว 3 ครั้ง หรือสถานะเฉลี่ยไม่ถึงเป้าตอนจบ · ภารกิจส่วนตัวของคุณเป็นแค่การแกล้งทำ ทำไปเพื่อบังหน้าได้ แต่ไม่ช่วยโรงเรียน' },
  yellow: { th: 'สีเหลือง', goal: 'ทำเป้าหมายส่วนตัวของคุณลักษณะให้สำเร็จ ชนะได้พร้อมฝ่ายใดก็ได้' },
};
// action: night skill id · limit: uses per game · every: nights between uses · passive: morning info
export const TRAITS = {
  // 🔵 blue
  caring:     { color: 'blue', th: 'ใจดีเอื้ออาทร', skill: 'กลางคืน: ฟื้นพลังใจเพื่อน 1 คนจนเต็มหลอด', limitTh: 'เกมละ 1 ครั้ง', action: 'restore', limit: 1 },
  brave:      { color: 'blue', th: 'กล้าหาญ', skill: 'กลางคืน: เลือกเพื่อน 1 คน ถ้ามีคนรังแกเขาคืนนั้น คุณหยุดได้และประกาศว่าเป็นการรังแกประเภทไหน', limitTh: 'เกมละ 1 ครั้ง · ตัวเองพลังใจ −10', action: 'brave', limit: 1 },
  protector:  { color: 'blue', th: 'ปกป้อง', skill: 'กลางคืน: คุ้มครองเพื่อน 1 คนจากการรังแก', limitTh: 'ห้ามเลือกคนเดิมสองคืนติดกัน', action: 'protect' },
  just:       { color: 'blue', th: 'ยุติธรรม', skill: 'กลางคืน: ดูสีคุณลักษณะของ 1 คน', limitTh: 'ใช้ได้ทุก 2 คืน', action: 'investigate', every: 2 },
  observant:  { color: 'blue', th: 'ช่างสังเกต', skill: 'ทุกเช้ารู้ว่าเมื่อคืนใครโดนรังแกแบบไหน', limitTh: 'ไม่รู้ว่าใครเป็นคนทำ', passive: 'victims' },
  alert:      { color: 'blue', th: 'ตื่นตัว', skill: 'ทุกเช้ารู้ว่าเมื่อคืนมี 1 คนลงมือทำอะไร (สุ่ม 1 คน)', limitTh: 'ถ้าคุณโดนฝ่ายสีแดงกระทำ สีแดงทุกคนจะรู้ตัวตนคุณ', passive: 'actor' },
  compromise: { color: 'blue', th: 'ประนีประนอม', skill: 'ตอนเช้า: ลดผลเสียของไพ่สถานการณ์วันนั้นลงครึ่งหนึ่ง', limitTh: 'เกมละ 2 ครั้ง', day: 'compromise', limit: 2 },
  honest:     { color: 'blue', th: 'ซื่อสัตย์', skill: 'รู้ว่าเพื่อนซื่อสัตย์อีกคนเป็นสีน้ำเงินแน่นอน', limitTh: 'มาเป็นคู่ 2 คน (ห้องตั้งแต่ 8 คน)', pair: true },
  changemaker:{ color: 'blue', th: 'ผู้สร้างการเปลี่ยนแปลง', skill: 'กลางคืน: เปลี่ยน 1 คนให้กลายเป็นสีน้ำเงิน (เลือกและสังเกตให้ดี)', limitTh: 'เกมละ 1 ครั้ง', action: 'convert', limit: 1 },
  // 🔴 red — each habit leads to a different type of bullying
  aggressive: { color: 'red', th: 'ก้าวร้าว', skill: 'กลางคืน: รังแกทางกาย 1 คน ความแข็งแรง −15 · ความปลอดภัย −4', limitTh: 'ทิ้งเบาะแสสีเสื้อของคุณไว้ให้คนที่โดน', action: 'bully', kind: 'physical' },
  mocking:    { color: 'red', th: 'ชอบเยาะเย้ย', skill: 'กลางคืน: รังแกทางวาจา 1 คน พลังใจ −10 · สุขภาวะ −3', limitTh: 'คนที่ช่างสังเกตจะรู้ว่าใครโดน', action: 'bully', kind: 'verbal' },
  excluder:   { color: 'red', th: 'ชอบกีดกัน', skill: 'กลางคืน: กีดกัน 1 คน การยอมรับ −10 · ความเป็นส่วนหนึ่ง −4 · ไปภารกิจทูตรอบหน้าไม่ได้', limitTh: 'ห้ามเลือกคนเดิมสองคืนติดกัน', action: 'bully', kind: 'exclude' },
  rumor:      { color: 'red', th: 'ชอบปล่อยข่าว', skill: 'กลางคืน: ปล่อยข่าวลือขึ้นจอเกี่ยวกับ 1 คน การยอมรับ −10 · ความไว้วางใจ −5', limitTh: 'เกมละ 2 ครั้ง', action: 'rumor', limit: 2 },
  manipulator:{ color: 'red', th: 'ชอบบงการ', skill: 'กลางคืน: กดดัน 1 คน คืนนั้นเขาใช้ความสามารถช่วยใครไม่ได้', limitTh: 'ไม่ทำร้ายโดยตรง', action: 'pressure' },
  pretender:  { color: 'red', th: 'เสแสร้ง', skill: 'ถ้ามีคนตรวจสีคุณ จะเห็นเป็นสีน้ำเงิน · ขัดขวางภารกิจทูตได้', limitTh: 'ไม่มีสกิลโจมตี', appears: 'blue' },
  persuader:  { color: 'red', th: 'ชักจูง', skill: 'กลางคืน: ชวนคนที่การยอมรับต่ำกว่า 30 มาเป็นสีแดง', limitTh: 'เกมละ 1 ครั้ง · เป้าหมายปฏิเสธได้', action: 'recruit', limit: 1 },
  // 🟡 yellow — personal goals
  timid:      { color: 'yellow', th: 'ขี้กลัว', skill: 'กลางคืน: ซ่อนตัว 1 คืน ไม่มีใครทำอะไรคุณได้', limitTh: 'เกมละ 1 ครั้ง', action: 'hide', limit: 1, win: 'ชนะถ้าไม่เคยโดนรังแก และไม่เคยช่วยใครเลย (ไม่ให้หัวใจ ไม่ลงขัน ไม่ใช้สกิลช่วย)' },
  craver:     { color: 'yellow', th: 'โหยหาการยอมรับ', skill: 'ได้รับหัวใจหรือการ์ดคู่ ค่าการยอมรับเพิ่มสองเท่า', limitTh: '-', win: 'ชนะถ้าตอนจบค่าการยอมรับตั้งแต่ 70' },
  peaceful:   { color: 'yellow', th: 'รักสงบ', skill: 'ลดความตึงเครียด: เช้าถัดไปไม่มีไพ่วิกฤต และด้านที่ต่ำที่สุดของโรงเรียน +3', limitTh: 'เกมละ 1 ครั้ง', day: 'calm', limit: 1, win: 'ชนะถ้าตอนจบไม่มีสถานะโรงเรียนด้านไหนต่ำกว่า 30' },
  attention:  { color: 'yellow', th: 'ชอบเป็นจุดสนใจ', skill: 'ถ้ามีคนตรวจสีคุณ จะเห็นเป็นสีแดง', limitTh: '-', appears: 'red', win: 'ชนะถ้าถูกโหวตลงโทษ' },
  newsie:     { color: 'yellow', th: 'กระจายข่าว', skill: 'กลางคืน: ตรวจสีของ 1 คน · กลางวัน: ส่งข่าวนิรนามขึ้นจอได้ (จริงหรือเท็จก็ได้)', limitTh: 'ส่งข่าววันละครั้ง', action: 'investigate', win: 'ชนะถ้าพลังใจ ≥ 20 ตอนจบเกม' },
  // states reached during play (never dealt at the start)
  reformed:   { color: 'blue', th: 'กลับใจ', skill: 'คุณเปลี่ยนใจมาช่วยโรงเรียน ไม่มีความสามารถลับ แต่การตัดสินใจของคุณสำคัญ', limitTh: '-', hidden: true },
  recruited:  { color: 'red', th: 'ถูกชักจูง', skill: 'คุณเข้าแก๊งสีแดงแล้ว ไม่มีสกิลโจมตี แต่ขัดขวางภารกิจทูตได้', limitTh: '-', hidden: true },
};
// ───────── daytime: personal tasks (ภารกิจส่วนตัว) and red sabotage (ป่วน) ─────────
// Each player gets a list of personal tasks for the whole game. They unlock a little each day.
// A real task done adds points to its school area and chips in to the open project.
// Red players get the same-looking list, but their tasks never help the school (Among Us style).
export const TASK_TYPES = {
  math:    { th: 'การบ้านคณิตศาสตร์', icon: '➗', area: 'cooperation', kind: 'quiz' },
  english: { th: 'เรียนภาษาอังกฤษ', icon: '🔤', area: 'belonging', kind: 'quiz' },
  thai:    { th: 'โจทย์ภาษาไทย', icon: '📝', area: 'trust', kind: 'quiz' },
  science: { th: 'โจทย์วิทยาศาสตร์', icon: '🔬', area: 'safety', kind: 'quiz' },
  bully:   { th: 'ทบทวนเรื่องการกลั่นแกล้ง', icon: '🛡', area: 'safety', kind: 'quiz' },
  kind:    { th: 'เลือกคำพูดที่ใจดี', icon: '💬', area: 'wellbeing', kind: 'quiz' },
  tap:     { th: 'ตรวจจุดเสี่ยงในโรงเรียน', icon: '🚸', area: 'safety', kind: 'game' },
  order:   { th: 'จัดชั้นหนังสือห้องสมุด', icon: '📚', area: 'cooperation', kind: 'game' },
  match:   { th: 'ดูแลรุ่นน้อง', icon: '🤝', area: 'belonging', kind: 'game' },
  clean:   { th: 'ทำความสะอาดห้องเรียน', icon: '🧹', area: 'wellbeing', kind: 'game' },
};
export const TASKS = {
  perMode: { short: 4, medium: 7, marathon: 12 },
  pace: { short: 7, medium: 15, marathon: 14 },   // days over which the list unlocks
  areaEvery: 0.4,       // every (players × 0.4) real tasks in one area → that area +1
  project: 4,           // each real task chips in this much to the open project
  milestones: [0.5, 1], // school-wide real progress → every area +2
  milestoneBonus: 2,
  eco: 2, acc: 1,
};
export const SABOTAGE = { steal: 0.2, wreck: 0.15, witness: 0.35 };   // once a day for the whole red team: steal 20% of project cost, or wreck tasks worth 15% of the players · 35% someone saw
export const CURSE_STATUS = -1;                                          // moonlight erodes every area each night

export const DEALT_TRAITS = Object.keys(TRAITS).filter((k) => !TRAITS[k].hidden);
export const BULLY_FX = {
  physical: { stat: 'str', amount: 15, status: { safety: -4 }, th: 'มีคนถูกรังแกทางกาย', typeTh: 'ทางกาย' },
  verbal: { stat: 'will', amount: 10, status: { wellbeing: -3 }, th: 'มีคนถูกรังแกทางวาจา', typeTh: 'ทางวาจา' },
  exclude: { stat: 'acc', amount: 10, status: { belonging: -4 }, th: 'มีคนถูกกีดกันจากกลุ่ม', typeTh: 'การกีดกัน' },
  rumor: { stat: 'acc', amount: 10, status: { trust: -5 }, th: 'มีคนถูกปล่อยข่าวลือ', typeTh: 'การปล่อยข่าวลือ' },
};
export const SHIRT_TH = { '#2457A7': 'น้ำเงิน', '#43B96D': 'เขียว', '#FF9B35': 'ส้ม', '#EF5350': 'แดง', '#8E5BD6': 'ม่วง', '#38A9E8': 'ฟ้า', '#F2C14E': 'เหลือง', '#1FA59A': 'เขียวอมฟ้า' };
export const NEWS_FORMS = [
  { id: 'suspect', text: (n) => `มีคนบอกว่า ${n} น่าสงสัย` },
  { id: 'trust', text: (n) => `มีคนบอกว่า ${n} ไว้ใจได้` },
  { id: 'red', text: (n) => `ข่าวลือ: ${n} อยู่สีแดง` },
  { id: 'blue', text: (n) => `ข่าวลือ: ${n} อยู่สีน้ำเงิน` },
];

// ───────────── Projects (Front A) ─────────────
// cost = พลังใจ + ทรัพยากร needed. huge: once per game.
export const PROJECTS = [
  { id: 'safe_box', area: 'safety', size: 'small', th: 'ตู้รับเรื่อง/จุดปลอดภัย', fx: { safety: 8 } },
  { id: 'patrol', area: 'safety', size: 'large', th: 'เวรเดินตรวจจุดเสี่ยง', fx: { safety: 15 } },
  { id: 'voice_box', area: 'trust', size: 'small', th: 'กล่องเสียงนิรนาม', fx: { trust: 8 } },
  { id: 'circle', area: 'trust', size: 'large', th: 'วงพูดคุยสร้างความเข้าใจ', fx: { trust: 15 } },
  { id: 'welcome', area: 'belonging', size: 'small', th: 'กิจกรรมต้อนรับเพื่อนใหม่', fx: { belonging: 8 } },
  { id: 'festival', area: 'belonging', size: 'large', th: 'เทศกาลวัฒนธรรมโรงเรียน', fx: { belonging: 15 } },
  { id: 'buddy', area: 'cooperation', size: 'small', th: 'ทีมอาสาเพื่อนช่วยเพื่อน', fx: { cooperation: 8 } },
  { id: 'crossgrade', area: 'cooperation', size: 'large', th: 'โครงงานข้ามชั้นปี', fx: { cooperation: 15 } },
  { id: 'listen', area: 'wellbeing', size: 'small', th: 'โครงการรับฟัง/มุมพักใจ', fx: { wellbeing: 8 } },
  { id: 'mindweek', area: 'wellbeing', size: 'large', th: 'สัปดาห์สุขภาพใจ', fx: { wellbeing: 15 } },
  { id: 'safety_center', area: 'safety', size: 'huge', th: 'ศูนย์ความปลอดภัยครบวงจร', fx: { safety: 25 } },
  { id: 'council', area: 'trust', size: 'huge', th: 'สภาเปิดใจทั้งโรงเรียน', fx: { trust: 15, belonging: 15 } },
  { id: 'care_center', area: 'wellbeing', size: 'huge', th: 'ศูนย์สุขภาวะและเพื่อนช่วยเพื่อน', fx: { wellbeing: 15, cooperation: 15 } },
];
export const PROJECT_COST = { small: 110, large: 200, huge: 320 }; // × players/10 in game.js
export const DONATE_PER_DAY = 1;      // each player may chip in once per day (5 or 10 พลังใจ)
export const PROJECT_DONE_WILL = 5;   // everyone regains hope when a project completes
export const PROJECT_OFFERS = 3;
export const MISSION_RESOURCE = 50;   // per successful mission, into the treasury

// ───────────── Pair card ─────────────
export const PAIR_CARD = { th: 'การ์ดช่วยเหลือร่วมกัน', will: 15, status: { belonging: 3, cooperation: 2 } };

// ───────────── Vote reason cards ─────────────
export const REASONS = [
  { id: 'saw', th: 'เห็นกับตา' },
  { id: 'heard', th: 'ได้ยินมา' },
  { id: 'odd', th: 'รู้สึกว่าแปลก' },
  { id: 'news', th: 'ข่าวบนจอ' },
];

// ───────────── Scenario cards (CSV) ─────────────
const AREA_TH = { ปลอดภัย: 'safety', ไว้วางใจ: 'trust', เป็นส่วนหนึ่ง: 'belonging', ร่วมมือ: 'cooperation', สุขภาวะ: 'wellbeing' };
const MODE_TH = { สั้น: 'short', กลาง: 'medium', มาราธอน: 'marathon' };

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}
export function parseFx(s) {
  const fx = {};
  if (!s || s.trim() === 'ไม่มี') return fx;
  for (const part of s.split(';')) {
    const m = part.trim().match(/^(.+?)([+-]\d+)$/);
    if (m && AREA_TH[m[1].trim()]) fx[AREA_TH[m[1].trim()]] = Number(m[2]);
  }
  return fx;
}
export function loadScenarios(file = path.join(__dirname, 'data', 'scenarios.csv')) {
  const [head, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const ix = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  return rows.map((r) => {
    const choices = [];
    for (let k = 1; k <= 3; k++) {
      const label = r[ix[`choice${k}`]]?.trim();
      if (label && label !== 'ไม่มี') choices.push({ id: `c${k}`, label, fx: parseFx(r[ix[`effect${k}`]]) });
    }
    return {
      id: r[ix.id], tier: r[ix.tier] === 'วิกฤต' ? 'crisis' : 'normal',
      modes: r[ix.modes].split('|').map((m) => MODE_TH[m.trim()]).filter(Boolean),
      category: r[ix.category], title: r[ix.title], story: r[ix.story],
      choices, fact: r[ix.fact], source: r[ix.source],
    };
  }).filter((c) => c.choices.length >= 2);
}
export const SCENARIOS = loadScenarios();

export const REFLECTION_PROMPTS = [
  'เหตุการณ์ไหนในเกมที่ทำให้คุณรู้สึกมากที่สุด เพราะอะไร',
  'ถ้าเจอการกลั่นแกล้งแบบในเกมในชีวิตจริง คุณจะทำอะไรได้บ้าง',
  'การโหวตโดยไม่มีหลักฐานส่งผลอย่างไรกับโรงเรียนมูนสคูล',
];
