// Aiz — Bankai's on-device workout assistant.
// Pure logic (no DOM): respond(text, ctx, mem) -> { text, actions, chips }.
// Order matters: safety checks always run before anything else.
import { EXERCISES, TOPICS, APP_HELP } from './aiz-kb.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MAX_INPUT = 500;

export function norm(s) {
  return String(s || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9'\s×x/.-]/g, ' ').replace(/\s+/g, ' ').trim();
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (t, phrase) => new RegExp(`(^|[^a-z0-9])${esc(phrase)}([^a-z0-9]|$)`).test(t);
const any = (t, list) => list.some((k) => hasWord(t, k));
const title = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

// ---------------- safety ----------------
const RX = {
  crisis: /\b(kill(ing)? myself|suicid\w*|end(ing)? (my|it all|my life)|want to die|wanna die|don'?t want to (live|be alive|be here|exist)|self[- ]?harm\w*|hurt(ing)? myself|cut(ting)? myself|no reason to live|better off dead|unalive)\b/,
  ed: /\b(purg\w*|throw(ing)? up (after|my food)|make myself (throw up|vomit|sick)|laxative\w*|starv\w*|stop eating|not eat(ing)? (at all|for)|skip(ping)? (all )?(my )?meals|eat(ing)? nothing|barely eat\w*|fast(ing)? for (days|a week|\d+ days)|thinspo|pro ?ana|pro ?mia|binge\w*|hate my body|i'?m (so )?(fat|disgusting)|feel(ing)? (so )?fat|under \d{3,4} calories|only \d{3} calories|\d{3} calories a day)\b/,
  rapid: /\b(lose \d+ ?(lbs?|pounds|kg|kilos)? in (a|one|1|2|two|3|three) (days?|weeks?)|lose weight (super |really )?(fast|quick\w*)|fastest way to lose|drop weight fast|cut weight fast|sweat (it|the weight|weight) off|lose \d+ ?(lbs?|pounds|kg) (by|before) (tomorrow|next week|friday|the weekend))\b/,
  emergency: /\b(chest (pain|hurts|tight\w*)|can'?t breathe|cannot breathe|trouble breathing|hard to breathe|pass(ed)? out|faint\w*|black(ed)? out|heart (is )?(racing|pounding|skipping)|irregular heart\w*|coughing (up )?blood|(dark|brown|cola)[- ]colou?red (pee|urine)|blood in (my )?(pee|urine)|rhabdo\w*|numb (arm|face|side))\b/,
  injury: /\b(pain|painful|hurts?|hurting|injur\w*|pulled|strain\w*|sprain\w*|torn|tear(ed)?|popped|swollen|swelling|tingl\w*|pinched|tendon\w*|tendinitis|dislocat\w*|fractur\w*|broke|broken|concussion|sciatica|herniat\w*)\b/,
  injuryEx: /\b(no pain no gain|growing pains)\b/,
  peds: /\b(steroids?|roids|anabolic\w*|sarms?|trt|test(osterone)? (cycle|injection\w*|shots?|boost\w*)|tren|dianabol|dbol|anavar|winstrol|hgh|growth hormone|clenbuterol|clen|dnp|peptides?|insulin|diuretics?|water pills?|adderall|ephedrine|ozempic|semaglutide|tirzepatide|wegovy|mounjaro|pct|prohormones?)\b/,
  condition: /\b(asthma|diabet\w*|heart (condition|problem|disease|murmur)|high blood pressure|blood pressure|pregnan\w*|epilep\w*|seizures?|surgery|scoliosis|hernia|arthritis|osteoporosis)\b/,
  minor: /\b(i'?m|i am) (1[0-7]|[89])\b|\b(1[0-7]|[89]) ?(years? old|yo|y\/o)\b|\b(middle|high) school(er)?\b|\b(freshman|sophomore) in high\b/,
};

function crisisReply() {
  return {
    text: 'I’m really sorry you’re feeling this way. You deserve support from a real person right now.\n• **Call or text 988** (Suicide & Crisis Lifeline, US) — free, any time\n• If you might act on these thoughts or you’re in danger, **call 911** now\n• Tell someone you trust — a parent, friend, teacher or school counselor\nOutside the US, contact your local emergency number or crisis line.\nI’m only a workout assistant, so I can’t help with this the way a person can — please reach out to one of them.',
    safety: 'crisis',
  };
}
function edReply() {
  return {
    text: 'It sounds like food or your body might feel really hard right now, and that matters.\nI can’t help with eating less, skipping meals, or getting rid of food — those can seriously hurt your body.\n• Talking with someone you trust, or a doctor, is a strong first step\n• **National Alliance for Eating Disorders helpline: 1-866-662-1235** (US)\n• If you ever feel unsafe, **call or text 988**\nI’m still here for workout questions whenever you want.',
    safety: 'ed',
  };
}
function rapidReply() {
  return {
    text: 'Losing weight very fast mostly drops water and muscle, can leave you dizzy and weak, and usually comes right back — so I won’t help with crash approaches.\nWhat actually works and lasts:\n• Strength training a few times a week\n• Regular cardio and daily walking\n• Mostly whole foods, protein at meals, fewer sugary drinks\n• Good sleep\nFor a personal target and pace, a doctor or registered dietitian is the right person.',
    chips: ['Make me a fat loss plan', 'Cardio tips'],
    safety: 'rapid',
  };
}
function emergencyReply() {
  return {
    text: '**Stop exercising now.** Chest pain, trouble breathing, fainting, a racing or irregular heartbeat, or dark/brown urine after training can be serious.\n• **Call 911** (or your local emergency number), or get someone to help you right away\n• Don’t drive yourself if you feel faint\n• Don’t keep training to “push through” it\nI can’t assess symptoms — a medical professional needs to.',
    safety: 'emergency',
  };
}
function injuryReply(exName) {
  return {
    text: `I can’t diagnose injuries, and I don’t want you pushing through pain.\n• Stop any exercise that causes sharp, stabbing or joint pain${exName ? ` — skip **${exName}** for now` : ''}\n• Pain that’s severe, swollen, numb or tingly, or not getting better in a few days → see a doctor or physical therapist\n• You can usually keep training body parts that feel completely fine\n• Normal muscle soreness 1–3 days after a workout is different from sharp pain\nIf it’s a sudden, severe injury, get medical help now.`,
    safety: 'injury',
  };
}
function pedsReply() {
  return {
    text: 'I can’t help with steroids, SARMs, hormones, or drugs for building muscle or losing weight. They carry real risks to your heart, liver, hormones and mental health — and for teens they can permanently affect growth and development. Prescription medicines are a conversation for you and your doctor.\nI’m happy to help you build muscle or lose fat the natural way.',
    chips: ['Make me a muscle plan', 'How do I build muscle?'],
    safety: 'peds',
  };
}
function conditionReply(what) {
  return {
    text: `Because you mentioned **${what}**, please check with your doctor about what kind of exercise is right for you before starting or changing a program — they know your health, I don’t.\nOnce you have the OK, I can help with technique, plans and staying consistent. Starting easier and building up slowly is always a good idea.`,
    chips: ['Make me a beginner plan', 'How do I warm up?'],
    safety: 'condition',
  };
}

// ---------------- context helpers ----------------
function exerciseIndex(ctx) {
  const idx = [];
  for (const [key, ex] of Object.entries(EXERCISES)) {
    for (const a of [ex.name, ...ex.aliases]) idx.push({ alias: norm(a), key, kb: ex });
  }
  for (const e of ctx.exercises || []) {
    const n = norm(e.name);
    if (!n || n.length < 3) continue;
    if (idx.some((x) => x.alias === n)) { idx.filter((x) => x.alias === n).forEach((x) => { x.lib = e; }); continue; }
    idx.push({ alias: n, key: null, kb: null, lib: e });
  }
  idx.sort((a, b) => b.alias.length - a.alias.length);
  return idx;
}
function findExercise(t, ctx) {
  for (const x of exerciseIndex(ctx)) if (hasWord(t, x.alias)) {
    const lib = x.lib || (ctx.exercises || []).find((e) => norm(e.name) === norm(x.kb?.name || ''));
    return { ...x, lib };
  }
  return null;
}
function kbByName(name) {
  const n = norm(name);
  return Object.values(EXERCISES).find((e) => norm(e.name) === n || e.aliases.some((a) => norm(a) === n));
}
function findPlan(t, ctx) {
  let best = null;
  for (const p of ctx.plans || []) {
    const n = norm(p.name).replace(/\bday\b/g, '').trim();
    if (n.length < 3) continue;
    if (hasWord(t, n) || hasWord(t, n + "'s") || hasWord(t, n + 's')) if (!best || n.length > norm(best.name).length) best = p;
  }
  return best;
}
const fmtT = (it) => it.dur ? `${it.sets && it.sets > 1 ? it.sets + '×' : ''}${it.dur >= 60 && it.dur % 60 === 0 ? it.dur / 60 + ' min' : it.dur + 's'}` : it.sets && it.reps ? `${it.sets}×${it.reps}` : it.sets ? `${it.sets} sets` : it.reps ? `${it.reps} reps` : '';
const SR = (s) => s.replace(/\b(\d+)-(\d+)\b/g, '$1–$2');

// ---------------- plan builder ----------------
const POOL = {
  gym: { chest: ['Bench Press', 'Incline Chest Press', 'Chest Flies', 'Dips'], back_v: ['Pulldowns', 'Pull Ups'], back_h: ['Close Grip Rows', 'Upper Back Rows'], shoulders: ['Shoulder Press'], side: ['Lateral Raises'], rear: ['Rear Delt Flies', 'Face Pulls'], biceps: ['Preacher Curls', 'Hammer Curls', 'Bicep Curls'], triceps: ['Pushdowns', 'Triceps Extensions', 'JM Press'], quads: ['Squat Pattern', 'Leg Press', 'Leg Extensions'], hinge: ["SLDL's", 'Hamstring Curls', 'Deadlift'], glutes: ['Hip Thrust', 'Lunges'], calves: ['Straight Leg Calf Raises'], core: ['Cable Crunches', 'Hanging Leg Raises', 'Plank'], cardio: ['Jump Rope', 'Burpees'] },
  db: { chest: ['Push Ups', 'Chest Flies'], back_v: ['Dumbbell Row'], back_h: ['Dumbbell Row', 'Superman Hold'], shoulders: ['Shoulder Press'], side: ['Lateral Raises'], rear: ['Rear Delt Flies'], biceps: ['Bicep Curls', 'Hammer Curls'], triceps: ['Triceps Extensions'], quads: ['Goblet Squat', 'Bulgarian Split Squat', 'Lunges'], hinge: ['Romanian Deadlift'], glutes: ['Glute Bridge', 'Lunges'], calves: ['Straight Leg Calf Raises'], core: ['Plank', 'Sit Ups', 'Crunches'], cardio: ['Jumping Jacks', 'Burpees'] },
  bw: { chest: ['Push Ups'], back_v: ['Superman Hold'], back_h: ['Superman Hold'], shoulders: ['Pike Push Ups'], side: ['Pike Push Ups'], rear: ['Superman Hold'], biceps: [], triceps: ['Dips'], quads: ['Bodyweight Squats', 'Lunges', 'Squat Jumps'], hinge: ['Glute Bridge'], glutes: ['Glute Bridge', 'Lunges'], calves: ['Straight Leg Calf Raises'], core: ['Plank', 'Sit Ups', 'Mountain Climbers', 'Crunches'], cardio: ['Jumping Jacks', 'Mountain Climbers', 'Burpees', 'Lateral Jumps'] },
};
const SESSIONS = {
  full: { label: 'Full Body', desc: 'Whole body', slots: ['quads', 'chest', 'back_h', 'hinge', 'shoulders', 'back_v', 'core'] },
  upper: { label: 'Upper Body', desc: 'Chest, back, shoulders, arms', slots: ['chest', 'back_v', 'shoulders', 'back_h', 'chest', 'side', 'biceps', 'triceps'] },
  lower: { label: 'Lower Body', desc: 'Quads, hamstrings, glutes, calves', slots: ['quads', 'hinge', 'quads', 'glutes', 'calves', 'core'] },
  push: { label: 'Push', desc: 'Chest, shoulders, triceps', slots: ['chest', 'chest', 'shoulders', 'side', 'triceps', 'triceps'] },
  pull: { label: 'Pull', desc: 'Back, biceps, rear shoulders', slots: ['back_v', 'back_h', 'back_h', 'rear', 'biceps', 'biceps'] },
  legs: { label: 'Legs', desc: 'Quads, hamstrings, glutes, calves', slots: ['quads', 'hinge', 'quads', 'hinge', 'calves', 'core'] },
  arms: { label: 'Arms', desc: 'Biceps, triceps, shoulders', slots: ['biceps', 'triceps', 'biceps', 'triceps', 'side'] },
  core: { label: 'Core', desc: 'Abs and core', slots: ['core', 'core', 'core', 'core'] },
  cond: { label: 'Conditioning', desc: 'Cardio circuit', slots: ['cardio', 'quads', 'chest', 'cardio', 'core', 'cardio', 'glutes'] },
};
const TIMED = { 'Plank': 30, 'Mountain Climbers': 30, 'Jumping Jacks': 45, 'Superman Hold': 20, 'Jump Rope': 60 };
const ISOLATION = new Set(['Chest Flies', 'Lateral Raises', 'Rear Delt Flies', 'Face Pulls', 'Preacher Curls', 'Hammer Curls', 'Bicep Curls', 'Pushdowns', 'Triceps Extensions', 'Leg Extensions', 'Hamstring Curls', 'Straight Leg Calf Raises', 'Cable Crunches', 'Crunches', 'Sit Ups', 'Hanging Leg Raises']);
const DAYSETS = { 1: [[1]], 2: [[1], [4]], 3: [[1], [3], [5]], 4: [[1], [2], [4], [5]], 5: [[1], [2], [3], [4], [5]], 6: [[1], [2], [3], [4], [5], [6]] };

function target(name, i, req) {
  const { goal, level } = req;
  const beginner = level === 'beginner';
  if (TIMED[name]) return { sets: goal === 'cond' ? 3 : 2, reps: '', dur: TIMED[name] + (beginner ? 0 : 15), rest: goal === 'cond' ? 30 : 45 };
  const iso = ISOLATION.has(name);
  if (goal === 'strength' && !iso && i < 2) return { sets: beginner ? 3 : 4, reps: beginner ? '6-8' : '4-6', dur: null, rest: 150 };
  if (goal === 'strength') return { sets: 3, reps: '8-10', dur: null, rest: 90 };
  if (goal === 'muscle') return { sets: beginner ? 3 : (iso ? 3 : 4), reps: iso ? '10-15' : '8-12', dur: null, rest: iso ? 60 : 90 };
  if (goal === 'cond') return { sets: 3, reps: name === 'Burpees' ? '8-10' : '12-15', dur: null, rest: 30 };
  return { sets: beginner ? 2 : 3, reps: iso ? '12' : '10', dur: null, rest: 60 };
}

const BEGINNER_SKIP = new Set(['Pull Ups', 'Deadlift', 'JM Press', 'Dips', 'Hanging Leg Raises', 'Squat Jumps', 'Burpees']);
function buildSession(type, variant, req) {
  const def = SESSIONS[type];
  const base = POOL[req.equip];
  const pool = {};
  for (const [k, list] of Object.entries(base)) {
    const f = req.level === 'beginner' ? list.filter((x) => !BEGINNER_SKIP.has(x)) : list;
    pool[k] = f.length ? f : list;
  }
  const used = new Set();
  const slotCount = {};
  let items = [];
  for (const slot of def.slots) {
    const list = pool[slot] || [];
    if (!list.length) continue;
    const n = (slotCount[slot] = (slotCount[slot] || 0) + 1) - 1;
    let pick = null;
    for (let k = 0; k < list.length; k++) { const c = list[(variant + n + k) % list.length]; if (!used.has(c)) { pick = c; break; } }
    if (!pick) continue;
    used.add(pick);
    items.push(pick);
  }
  if (req.level === 'beginner' && items.length > 6) items = items.slice(0, 6);
  let built = items.map((name, i) => ({ name, ...target(name, i, req), note: '' }));
  if (req.minutes) built = fitMinutes(built, req.minutes);
  return { type, label: def.label, desc: def.desc, items: built };
}

function estMinutes(items) {
  return 5 + items.reduce((a, it) => a + (it.sets || 1) * (((it.dur || 40) + (it.rest || 60)) / 60), 0);
}
function fitMinutes(items, minutes) {
  let out = items.map((x) => ({ ...x }));
  while (estMinutes(out) > minutes && out.some((x) => (x.sets || 1) > 2)) { const big = out.reduce((m, x) => ((x.sets || 1) > (m.sets || 1) ? x : m)); big.sets -= 1; }
  while (estMinutes(out) > minutes && out.length > 3) out.pop();
  return out;
}

function splitFor(req) {
  const { days, focus, split } = req;
  if (focus) return [focus];
  if (req.equip === 'bw') {
    // Bodyweight-only has too few back/arm options for body-part splits.
    const n = Math.min(days, 5);
    return req.goal === 'cond' ? Array(n).fill(0).map((_, i) => (i % 2 ? 'full' : 'cond')) : Array(Math.min(n, 4)).fill('full');
  }
  if (split === 'ppl') return days >= 6 ? ['push', 'pull', 'legs', 'push', 'pull', 'legs'] : days >= 3 ? ['push', 'pull', 'legs'] : ['push', 'pull'];
  if (split === 'ul') return days >= 4 ? ['upper', 'lower', 'upper', 'lower'] : ['upper', 'lower'];
  if (split === 'full') return Array(Math.min(days, 4)).fill('full');
  if (req.goal === 'cond') return Array(Math.min(days, 5)).fill('cond').map((x, i) => (i % 2 ? 'full' : 'cond'));
  if (days <= 2) return Array(days).fill('full');
  if (days === 3) return req.level === 'beginner' || req.goal === 'general' ? ['full', 'full', 'full'] : ['push', 'pull', 'legs'];
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

const GOAL_LABEL = { strength: 'strength', muscle: 'muscle building', cond: 'fat loss & conditioning', general: 'general fitness' };
const EQUIP_LABEL = { gym: 'gym', db: 'dumbbells at home', bw: 'no equipment' };

export function buildPlans(req) {
  const types = splitFor(req);
  const counts = {};
  const dayList = req.focus ? [[]] : (DAYSETS[types.length] || DAYSETS[3]);
  const plans = types.map((type, i) => {
    const v = (counts[type] = (counts[type] || 0) + 1) - 1;
    const s = buildSession(type, v, req);
    const multi = types.filter((x) => x === type).length > 1;
    const name = multi ? `${s.label} ${String.fromCharCode(65 + v)}` : s.label;
    const days = dayList[i] || [];
    return { name, desc: s.desc, days, items: s.items };
  });
  const label = req.focus ? SESSIONS[req.focus].label : `${types.length}-Day ${req.split === 'ppl' || (types[0] === 'push') ? 'Push/Pull/Legs' : types[0] === 'upper' ? 'Upper/Lower' : types.includes('cond') ? 'Conditioning' : 'Full Body'}`;
  return { group: `Aiz · ${label}`, label, plans };
}

const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
function parseReq(t, base = {}) {
  const r = { days: 3, goal: 'general', equip: 'gym', level: 'beginner', minutes: null, focus: null, split: null, ...base };
  const d = t.match(/\b(\d|one|two|three|four|five|six|seven)[ -]?(day|days|x|times)\b/);
  if (d) r.days = Math.max(1, Math.min(6, NUMW[d[1]] || Number(d[1])));
  if (/\bevery ?day\b|\bdaily\b/.test(t)) r.days = 6;
  if (/\b(home|no equipment|bodyweight|body weight|calisthenics|no gym|without equipment|without a gym)\b/.test(t)) r.equip = 'bw';
  if (/\bdumbbells?\b|\bdb\b/.test(t)) r.equip = 'db';
  if (/\b(gym|machines?|barbell|cable)\b/.test(t)) r.equip = 'gym';
  if (/\b(strength|stronger|powerlift\w*|strong)\b/.test(t)) r.goal = 'strength';
  else if (/\b(muscle|bulk\w*|size|bigger|hypertrophy|tone|toned|mass|jacked|buff|aesthetic)\b/.test(t)) r.goal = 'muscle';
  else if (/\b(lose weight|weight loss|fat loss|lose fat|burn fat|lean|cut|cutting|cardio|conditioning|endurance|stamina|hiit|shred\w*)\b/.test(t)) r.goal = 'cond';
  else if (/\b(general|overall|healthy|health|fit|fitness)\b/.test(t) && !base.goal) r.goal = 'general';
  if (/\b(intermediate|advanced|experienced|harder|hard|intense)\b/.test(t)) r.level = 'intermediate';
  if (/\b(beginner|new|newbie|easy|easier|starting|start out|first)\b/.test(t)) r.level = 'beginner';
  const m = t.match(/\b(\d{2,3}) ?(min|mins|minute|minutes)\b/);
  if (m) r.minutes = Math.max(15, Math.min(120, Number(m[1])));
  if (/\b(short|shorter|quick|quicker|fast workout|less time)\b/.test(t) && !m) r.minutes = 30;
  if (/\blonger\b/.test(t)) r.minutes = null;
  const namesSplit = /\bppl\b|push ?pull ?legs?|\bupper ?(\/|and|&)? ?lower\b|\bu ?\/ ?l\b|\bfull ?body\b/.test(t);
  if (d && !namesSplit) r.split = null;
  if (/\bppl\b|push ?pull ?legs?/.test(t)) r.split = 'ppl';
  else if (/\bupper ?(\/|and|&)? ?lower\b|\bu ?\/ ?l\b/.test(t)) r.split = 'ul';
  else if (/\bfull ?body\b/.test(t) && d) r.split = 'full';
  if (!d) {
    if (/\b(leg day|legs? (day|workout)|lower body (day|workout))\b/.test(t)) r.focus = /lower body/.test(t) ? 'lower' : 'legs';
    else if (/\barms?( day| workout)\b/.test(t)) r.focus = 'arms';
    else if (/\b(chest|push)( day| workout)\b/.test(t)) r.focus = 'push';
    else if (/\b(back|pull)( day| workout)\b/.test(t)) r.focus = 'pull';
    else if (/\bupper body( day| workout)?\b/.test(t)) r.focus = 'upper';
    else if (/\b(abs?|core)( day| workout| routine)\b/.test(t)) r.focus = 'core';
    else if (/\bfull ?body (workout|session|day)\b/.test(t) || /\ba (single )?workout\b/.test(t)) r.focus = 'full';
    else if (/\b(cardio|hiit|conditioning) (workout|session|circuit)\b/.test(t)) r.focus = 'cond';
  }
  if (r.focus === 'arms' && r.equip === 'bw') r.equip = 'db';
  return r;
}

function planProposal(req, mem, ctx) {
  const built = buildPlans(req);
  mem.lastReq = req;
  const lines = built.plans.map((p) => `• **${p.days.length ? DAY_NAMES[p.days[0]] + ' — ' : ''}${p.name}:** ${p.items.map((it) => `${it.name} ${SR(fmtT(it))}`).join(', ')}`);
  const assumed = [`${req.days ? (req.focus ? 'single workout' : `${built.plans.length} days a week`) : ''}`, req.level, EQUIP_LABEL[req.equip], GOAL_LABEL[req.goal], req.minutes ? `about ${req.minutes} min` : ''].filter(Boolean).join(' · ');
  const chips = [];
  if (!req.focus) chips.push(built.plans.length === 3 ? 'Make it 4 days' : 'Make it 3 days');
  chips.push(req.equip === 'bw' ? 'Gym version' : 'Home version');
  chips.push(req.minutes ? 'Longer workouts' : 'Shorter workouts');
  chips.push(req.goal === 'strength' ? 'Focus on muscle' : 'Focus on strength');
  const exists = (ctx.plans || []).some((p) => p.group === built.group);
  return {
    text: `Here’s a **${built.label}** plan:\n${lines.join('\n')}${req.equip === 'bw' && (req.split === 'ppl' || req.split === 'ul' || req.days > 4) && !req.focus ? '\nWithout equipment there aren’t enough back and arm exercises for a body-part split, so I used full-body days.' : ''}\n${req.focus ? '' : 'Rest days in between. '}Warm up first, and pick weights that leave 1–3 reps in the tank.${mem.minor ? '\nSince you’re under 18: focus on form, keep weights moderate, and have a coach or adult around for heavy lifts.' : ''}\n_Based on: ${assumed}._ Tap a button to change it.${exists ? '\n(You already have a plan with this name — saving adds a second copy.)' : ''}`,
    actions: [{ type: 'create_plans', group: built.group, plans: built.plans, summary: `${built.plans.length} workout${built.plans.length === 1 ? '' : 's'} · ${built.plans.reduce((a, p) => a + p.items.length, 0)} exercises` }],
    chips,
  };
}

const MOD_RX = /\b(make it|instead|what about|how about|change it|switch|can it be|version|rather)\b|^(shorter|longer|harder|easier|home|gym|dumbbells?|strength|muscle|\d) /;
function isModification(t, mem) {
  if (!mem.lastReq) return false;
  const words = t.split(' ').length;
  const modWords = /\b(\d|one|two|three|four|five|six)[ -]?days?\b|\b(home|gym|dumbbells?|bodyweight|no equipment|shorter|longer|quicker|harder|easier|strength|muscle|fat loss|cardio|beginner|intermediate|advanced|minutes?|ppl|upper ?lower|full ?body)\b/;
  if (/^(what|how|why|when|tell|explain|is|are|can you explain|should|does|do)\b/.test(t)) return false;
  return modWords.test(t) && (MOD_RX.test(t + ' ') || words <= 4);
}

// ---------------- adjust an existing plan ----------------
function adjustPlan(t, plan, ctx, mem) {
  const items = plan.items.map((x) => ({ ...x }));
  const changes = [];
  let ok = false;
  const addM = t.match(/\badd (?:some |a |an |in )?(.+?) (?:to|into|in) /);
  const remM = t.match(/\b(?:remove|take out|delete|drop|get rid of) (?:the )?(.+?) (?:from|in|out of) /);
  if (addM) {
    const f = findExercise(addM[1], ctx);
    const name = f ? (f.kb?.name || f.lib?.name) : title(addM[1].replace(/\b(exercise|exercises)\b/g, '').trim()).slice(0, 60);
    if (name && name.length >= 3) {
      const tg = target(name, items.length, { goal: 'general', level: 'beginner' });
      items.push({ exerciseId: f?.lib?.id || null, name, ...tg, rest: tg.rest, note: '' });
      changes.push(`Add **${name}** (${SR(fmtT(tg))})`); ok = true;
    }
  }
  if (remM) {
    const q = norm(remM[1]);
    const f = findExercise(q, ctx);
    const idx = items.findIndex((x) => norm(x.name) === q || (f && (norm(x.name) === norm(f.kb?.name || '') || norm(x.name) === norm(f.lib?.name || ''))) || norm(x.name).includes(q));
    if (idx >= 0) { changes.push(`Remove **${items[idx].name}**`); items.splice(idx, 1); ok = true; }
    else return { text: `I couldn’t find “${remM[1]}” in **${plan.name}**. Its exercises are: ${plan.items.map((x) => x.name).join(', ')}.` };
  }
  const minM = t.match(/\b(\d{2,3}) ?(min|mins|minutes)\b/);
  if (/\b(shorter|quicker|less time|faster|short on time|cut down)\b/.test(t) || minM) {
    const mins = minM ? Math.max(15, Math.min(120, Number(minM[1]))) : 30;
    const before = items.length; const beforeSets = items.reduce((a, x) => a + (x.sets || 1), 0);
    const fit = fitMinutes(items, mins);
    const afterSets = fit.reduce((a, x) => a + (x.sets || 1), 0);
    if (fit.length === before && afterSets === beforeSets) {
      const est = Math.round(estMinutes(items));
      return { text: `**${plan.name}** already takes about **${est} minutes** (with warm-up), so it fits in ${mins}. Want it even shorter?`, chips: [`Make ${plan.name} 20 minutes`, `Make ${plan.name} easier`] };
    }
    items.length = 0; items.push(...fit);
    changes.push(`Fit into about **${mins} minutes** (${before} → ${items.length} exercises, ${beforeSets} → ${afterSets} sets)`); ok = true;
  } else if (/\b(harder|tougher|more intense|more challenging|more volume)\b/.test(t)) {
    items.forEach((x) => { x.sets = Math.min(5, (x.sets || 1) + 1); });
    changes.push('Add **1 set** to each exercise (max 5)'); ok = true;
  } else if (/\b(easier|lighter|less intense|too hard|beginner)\b/.test(t)) {
    items.forEach((x) => {
      if (x.sets && x.sets > 1) x.sets -= 1;
      else if (x.dur) x.dur = Math.max(10, Math.round((x.dur * 0.75) / 5) * 5);
      else if (/^\d+$/.test(x.reps || '')) x.reps = String(Math.max(1, Math.round(Number(x.reps) * 0.75)));
    });
    changes.push('Ease off: **1 set less** each, or shorter holds / fewer reps where there’s only one set'); ok = true;
  }
  if (!ok) {
    return {
      text: `What would you like to change in **${plan.name}**? I can make it shorter, harder or easier, or add or remove an exercise.`,
      chips: [`Make ${plan.name} shorter`, `Make ${plan.name} harder`, `Add face pulls to ${plan.name}`],
    };
  }
  mem.lastPlanId = plan.id;
  return {
    text: `Here’s my suggestion for **${plan.name}**:\n${changes.map((c) => '• ' + c).join('\n')}\nNew list: ${items.map((x) => `${x.name} ${SR(fmtT(x))}`).join(', ')}.`,
    actions: [{ type: 'update_plan', planId: plan.id, planName: plan.name, items, summary: changes.map((c) => c.replace(/\*\*/g, '')).join(' · ') }],
  };
}

// ---------------- personal data ----------------
function todayAnswer(ctx) {
  const tp = ctx.todayPlans || [];
  if (ctx.activePlanName) return { text: `You have **${ctx.activePlanName}** in progress. Tap **Resume** on Home to jump back in.` };
  if (!tp.length) return { text: `Nothing is scheduled for today (${DAY_NAMES[ctx.now.getDay()]}). Take a rest day, or start any workout from **Plans**. To schedule one, edit a workout and tap its days.`, chips: ['Make me a plan', 'How important are rest days?'] };
  return { text: `Today’s workout: ${tp.map((p) => `**${p.name}** (${p.items.length} exercises)`).join(', ')}. Tap **Start workout** on Home when you’re ready.` };
}
function statsAnswer(ctx) {
  const s = ctx.sessions || [];
  const now = ctx.now;
  const wk = new Date(now); wk.setHours(0, 0, 0, 0); wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const w = s.filter((x) => x.endedAt >= wk.getTime()).length;
  const mo = s.filter((x) => x.endedAt >= month.getTime()).length;
  if (!s.length) return { text: 'You haven’t logged a workout yet. Finish one in workout mode and it’ll show up in **Progress**.' };
  return { text: `You’ve done **${w}** workout${w === 1 ? '' : 's'} this week, **${mo}** this month, and **${s.length}** in total. ${w ? 'Nice work — keep it rolling.' : 'A good week starts with one session.'}` };
}
function lastAnswer(ctx) {
  const s = (ctx.sessions || []).slice().sort((a, b) => b.endedAt - a.endedAt)[0];
  if (!s) return { text: 'No workouts logged yet.' };
  const d = new Date(s.endedAt);
  const done = s.items.filter((i) => i.done).length;
  return { text: `Your last workout was **${s.planName}** on ${DAY_NAMES[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} — ${done} of ${s.items.length} exercises done.` };
}
function exHistory(f, ctx) {
  const name = norm(f.lib?.name || f.kb?.name || '');
  const ss = (ctx.sessions || []).slice().sort((a, b) => b.endedAt - a.endedAt);
  for (const s of ss) {
    const it = s.items.find((i) => norm(i.name) === name);
    if (!it) continue;
    const logged = it.sets.filter((x) => x.done);
    if (!logged.length) continue;
    const d = new Date(s.endedAt);
    const parts = logged.map((x) => [x.weight ? `${x.weight} ${ctx.units}` : '', x.reps ? `${x.reps} reps` : ''].filter(Boolean).join(' × ') || 'done');
    return { text: `Last time you did **${it.name}** (${DAY_NAMES[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}): ${parts.join(', ')}.` };
  }
  return { text: `I don’t see **${f.lib?.name || f.kb?.name}** in your workout history yet. Log weights in workout mode (“Log weight & reps”) and I can tell you next time.` };
}

// ---------------- exercise answers ----------------
function exerciseAnswer(f, t) {
  const kb = f.kb;
  if (!kb) {
    const lib = f.lib;
    const cues = (lib.instructions || '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (cues.length) return { text: `Your notes for **${lib.name}**:\n${cues.map((c, i) => `${i + 1}. ${c}`).join('\n')}` };
    return { text: `I don’t have technique info for **${lib.name}** yet. Add a demo video and your own cues in the exercise’s editor (✏️), and I’ll read them back to you here.` };
  }
  const actions = [];
  if (f.lib && !(f.lib.instructions || '').trim()) actions.push({ type: 'set_instructions', exerciseId: f.lib.id, name: f.lib.name, text: kb.cues.join('\n'), summary: `Save ${kb.cues.length} technique cues to ${f.lib.name}` });
  if (/\b(muscles?|work|works|target|targets|hit|hits)\b/.test(t) && !/\bhow (do|to|should)\b/.test(t)) return { text: `**${kb.name}** mainly works your **${kb.muscles}**.`, chips: [`How do I do ${kb.name.toLowerCase()}?`] };
  if (/\b(easier|alternative|instead|substitute|swap|replace|regress\w*|can'?t do)\b/.test(t)) return { text: `**Easier option for ${kb.name}:** ${kb.easier}.\n**When you’re ready for more:** ${kb.harder}.`, actions };
  if (/\b(harder|progress\w*|more challenging|level up)\b/.test(t)) return { text: `**Make ${kb.name} harder:** ${kb.harder}.`, actions };
  if (/\b(mistakes?|wrong|errors?|avoid)\b/.test(t)) return { text: `**Common ${kb.name} mistakes:**\n${kb.mistakes.map((m) => '• ' + m).join('\n')}`, actions };
  return {
    text: `**${kb.name}** — works your ${kb.muscles}.\n${kb.cues.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n**Avoid:** ${kb.mistakes.join('; ').toLowerCase()}.\n**Easier:** ${kb.easier}. **Harder:** ${kb.harder}.`,
    actions,
  };
}

// ---------------- topics ----------------
function bestTopic(t, list) {
  let best = null, score = 0;
  for (const tp of list) {
    let s = 0;
    for (const k of tp.keys) if (k.includes(' ') ? t.includes(k) : hasWord(t, k) || (k.length > 5 && t.includes(k))) s += k.split(' ').length;
    if (s > score) { score = s; best = tp; }
  }
  return best;
}

const FIT_WORDS = /\b(work ?out\w*|exercis\w*|gym|lift\w*|train\w*|muscle\w*|reps?|sets?|cardio|run\w*|stretch\w*|protein|abs|core|legs?|arms?|chest|back|shoulders?|biceps?|triceps?|glutes?|hamstrings?|quads?|calves|plan\w*|routine|split|weights?|fit|fitness|strength|stronger|sore|bankai|aiz|squat\w*|press|curl\w*|row\w*|deadlift\w*|plank\w*|push ?ups?|pull ?ups?|jump\w*|rest|recover\w*|warm\w*|body|health\w*|fat|diet|eat\w*|sleep|calorie\w*|bulk|cut|tone|flexib\w*|mobility|posture|form|technique|athlet\w*|sport\w*|program\w*|timer|video|backup|install)\b/;

const CAPABILITIES = 'I’m **Aiz**, Bankai’s built-in workout assistant. I can:\n• Explain how to do exercises — form cues, muscles, easier and harder versions\n• Build you a plan (“make me a 4 day gym plan for muscle”)\n• Adjust your plans (“make Push shorter”, “add face pulls to Pull”)\n• Answer training questions — sets, reps, rest, warm-ups, soreness, recovery\n• Tell you what’s on today and how your week is going\n• Help you use Bankai\nI run right on your phone, free and offline. I’m not a general chatbot, so I stick to fitness.';
const STARTER_CHIPS = ['Make me a 3 day beginner plan', 'How do I do a squat?', 'What’s my workout today?', 'How long should I rest?'];

// ================= main =================
export function respond(raw, ctx, mem = {}) {
  const input = String(raw || '').slice(0, MAX_INPUT);
  const t = norm(input);
  const out = (r) => ({ text: r.text, actions: r.actions || [], chips: r.chips || [], safety: r.safety || null });
  if (!t) return out({ text: 'Ask me anything about workouts, exercises or your plans.', chips: STARTER_CHIPS });

  if (RX.minor.test(t)) mem.minor = true;

  // 1. Safety first — these always win.
  if (RX.crisis.test(t)) return out(crisisReply());
  if (RX.ed.test(t)) { mem.ed = true; return out(edReply()); }
  if (RX.emergency.test(t)) return out(emergencyReply());
  if (RX.peds.test(t)) return out(pedsReply());
  const sorenessOnly = /\b(sore|soreness|doms)\b/.test(t) && !/\b(sharp|stabbing|joint|swollen|swelling|popped|numb|tingl\w*|can'?t move|bruis\w*)\b/.test(t);
  if (RX.injury.test(t) && !RX.injuryEx.test(t) && !sorenessOnly && !/\bmuscles? hurt after\b/.test(t)) {
    const f = findExercise(t, ctx);
    return out(injuryReply(f ? (f.kb?.name || f.lib?.name) : ''));
  }
  if (RX.rapid.test(t)) return out(rapidReply());
  const cond = t.match(RX.condition);
  if (cond && !/\bplan\b/.test(t)) return out(conditionReply(cond[0]));
  if (mem.ed && /\b(calorie\w*|lose weight|weight loss|fat loss|cut|cutting|diet|deficit|skinny|thinner)\b/.test(t)) {
    return out({ text: 'I’d rather not get into food amounts or weight-loss targets. A doctor or registered dietitian can help with that safely. I’m glad to help with how you train — technique, plans, or staying consistent.', chips: ['How do I do a squat?', 'Make me a beginner plan'] });
  }

  // 2. Small talk & identity
  if (/^(hi|hey|hello|yo|sup|hiya|howdy|good (morning|afternoon|evening)|what'?s up)\b/.test(t) && t.split(' ').length <= 5) return out({ text: `Hey${ctx.name ? ' ' + ctx.name : ''}! I’m Aiz. What are we working on?`, chips: STARTER_CHIPS });
  if (/\b(thank(s| you)|thx|ty|appreciate (it|you))\b/.test(t) && t.split(' ').length <= 7) return out({ text: 'Anytime. Go get it.' });
  if (/\b(who are you|what are you|your name|are you (an? )?(ai|bot|robot|human|real|person|chatgpt|claude)|are you smart)\b/.test(t)) return out({ text: CAPABILITIES, chips: STARTER_CHIPS });
  if (/^(help|commands|menu|options)$|\bwhat can (you|i) (do|ask)\b|\bhow do you work\b|\bwhat do you do\b/.test(t)) return out({ text: CAPABILITIES, chips: STARTER_CHIPS });

  // 3. Personal data
  const f = findExercise(t, ctx);
  if (f && /\b(last time|last week|previous(ly)?|my best|personal best|\bpr\b|what did i (lift|do|use)|how much did i)\b/.test(t)) return out(exHistory(f, ctx));
  if (/\b(today|tonight)\b/.test(t) && /\b(work ?out|plan|scheduled|doing|train\w*|do)\b/.test(t) && !/\b(make|build|create|give)\b/.test(t)) return out(todayAnswer(ctx));
  if (/\b(how many|count|number of)\b.*\b(work ?outs?|sessions?)\b|\bmy (progress|streak|stats)\b|\bthis (week|month)\b.*\b(work ?outs?|done)\b/.test(t)) return out(statsAnswer(ctx));
  if (/\b(last|previous|most recent) (work ?out|session)\b|\bwhat did i do (last|yesterday)\b/.test(t)) return out(lastAnswer(ctx));
  if (/\b(what|list|show)( are)? (all )?my (plans|work ?outs|routines)\b|\bwhat plans do i have\b/.test(t)) {
    const ps = ctx.plans || [];
    return out({ text: ps.length ? `Your workouts: ${ps.map((p) => `**${p.name}**${p.days.length ? ` (${p.days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ')})` : ''}`).join(', ')}.` : 'You don’t have any workouts yet. Want me to build some?', chips: ps.length ? [] : ['Make me a 3 day beginner plan'] });
  }

  // 4. Adjust an existing plan (named in the message)
  const plan = findPlan(t, ctx);
  const wantsCreate = /\b(make|build|create|give|design|write|generate|need|want|recommend|suggest)\b.*\b(plan|routine|program|split|work ?out|schedule)s?\b|\bplan for\b/.test(t) && !/\bmake (my|the) /.test(t);
  if (plan && !wantsCreate && /\b(add|remove|take out|delete|drop|get rid of|shorter|quicker|less time|faster|harder|tougher|easier|lighter|more intense|change|adjust|edit|modify|update|\d{2,3} ?min\w*|cut down)\b/.test(t)) return out(adjustPlan(t, plan, ctx, mem));

  // 5. Modify the last plan Aiz suggested
  if (isModification(t, mem) && !wantsCreate) {
    const base = { ...mem.lastReq };
    const upd = parseReq(t, base);
    if (/\bgym\b/.test(t)) upd.equip = 'gym';
    if (/\b(longer)\b/.test(t)) upd.minutes = null;
    return out(planProposal(upd, mem, ctx));
  }

  // 6. Create a plan
  const splitAsk = /\b(ppl|push ?pull ?legs?|upper ?(\/|and|&)? ?lower|full ?body)\b.*\b(split|plan|routine|program|days?)\b|\b\d[ -]?day (split|plan|routine|program)\b/.test(t);
  if (wantsCreate || splitAsk || /^(plan|routine|program|split)\b/.test(t)) {
    if (/\b(meal|diet|food|eating|nutrition|calorie)\b/.test(t)) return out({ text: 'I don’t make meal or diet plans — a doctor or registered dietitian can do that safely for you. I can build your **workout** plan though!', chips: ['Make me a 3 day beginner plan', 'Food basics for training'] });
    return out(planProposal(parseReq(t), mem, ctx));
  }

  // 7. Exercise technique
  if (f) return out(exerciseAnswer(f, t));

  // 8. App help, then training topics
  const ah = bestTopic(t, APP_HELP.map((x, i) => ({ ...x, id: 'app' + i })));
  const tp = bestTopic(t, TOPICS);
  if (ah && /\b(how|where|can i|add|backup|back up|install|restore|tutorial|schedule|delete|units|kg|lbs)\b/.test(t) && (!tp || /\b(app|bankai|add|backup|back up|install|restore|tutorial|tour)\b/.test(t))) return out({ text: ah.text });
  if (tp) {
    if (mem.ed && ['nutrition', 'loseweight', 'supplements'].includes(tp.id)) return out({ text: 'For food and body-weight questions, a doctor or registered dietitian is the best person to help. I’m here for training — technique, plans and consistency.' });
    const chips = tp.id === 'beginner' ? ['Make me a 3 day beginner plan'] : tp.id === 'gainmuscle' ? ['Make me a 4 day muscle plan'] : tp.id === 'loseweight' ? ['Make me a fat loss plan'] : [];
    return out({ text: tp.text, chips });
  }
  if (ah) return out({ text: ah.text });

  // 9. Fallbacks
  if (FIT_WORDS.test(t)) return out({ text: 'I’m not sure about that one yet. Try asking about an exercise (“how do I do a deadlift?”), a training topic (“how long should I rest?”), or ask me to build or change a plan.', chips: STARTER_CHIPS });
  return out({ text: 'I stick to workouts and fitness, so I can’t help with that one. Here’s what I’m good at:', chips: STARTER_CHIPS });
}
