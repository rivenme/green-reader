// === SCORING ENGINE (pure, testable — see test/scoring.test.mjs) ============
// Result tier from strokes vs par; a one-putt (1 stroke) is its own top tier.
function resultTier(strokes, par){
  if(strokes <= 1) return 'onePutt';
  if(strokes < par) return 'birdie';
  if(strokes === par) return 'par';
  return 'over';
}
// Proper golf score name for strokes vs par (a 1-stroke hole is a Hole in One).
function golfTerm(strokes, par){
  if(strokes===1) return 'Hole in One!';
  const d=strokes-par;
  return ({'-4':'Condor!','-3':'Albatross!','-2':'Eagle!','-1':'Birdie!',
    '0':'Par','1':'Bogey','2':'Double Bogey','3':'Triple Bogey'})[d]
    || (d<0 ? 'Great!' : '+'+d+' Over');
}
const STROKE_MULT = { onePutt:3.0, birdie:2.0, par:1.2, over:0.5 };
// streak = consecutive holes finished at par-or-better; multiplier capped ×3.
function streakMultiplier(streak){ return Math.min(3.0, 1 + 0.2*streak); }
// par-or-better continues the streak; over par resets it.
function nextStreak(streak, strokes, par){ return strokes <= par ? streak+1 : 0; }
// Points for one hole. `streak` is the post-update streak count this hole earns.
function holeScore({distFt, diff, stimp, strokes, par, streak,firstLeave=null}){
  const tier = resultTier(strokes, par);
  const base = distFt * 12;
  const difficulty = (0.7 + 0.3*diff) * (stimp/10);   // green-speed-weighted hole difficulty
  const isBomb = (tier === 'onePutt' && distFt > 25);
  const pts = base * difficulty * STROKE_MULT[tier] * streakMultiplier(streak) * (isBomb?1.5:1.0);
  const lagBonus=distFt>=10 && strokes===2 && firstLeave!==null && firstLeave<=2?50:0;
  return { tier, bomb:isBomb, points: Math.round(pts)+lagBonus,lagBonus };
}
// === END SCORING ENGINE =====================================================

// === CAREER META (pure progression — see test/career.test.mjs) ==============
// Ranks by lifetime XP (= lifetime points scored).
const RANKS=[
  {xp:0,      name:'Weekend Hacker'},
  {xp:5000,   name:'Bogey Golfer'},
  {xp:20000,  name:'Scratch'},
  {xp:60000,  name:'Club Champion'},
  {xp:150000, name:'Tour Pro'},
  {xp:400000, name:'Legend'},
];
function rankFor(xp){ let r=RANKS[0]; for(const k of RANKS) if(xp>=k.xp) r=k; return r; }
function nextRank(xp){ for(const k of RANKS) if(xp<k.xp) return k; return null; }
// Achievements: each tests a "ctx" of accumulated run/event facts.
const ACHIEVEMENTS=[
  {id:'firstBirdie', label:'First Birdie',            test:c=>c.tier==='birdie'||c.tier==='onePutt'},
  {id:'firstOnePutt',label:'First One-Putt',          test:c=>c.tier==='onePutt'},
  {id:'bomb',        label:'Bomber · 25ft+ drain',    test:c=>c.bomb},
  {id:'streak3',     label:'On Fire · 3 streak',      test:c=>c.streak>=3},
  {id:'streak5',     label:'Unconscious · 5 streak',  test:c=>c.streak>=5},
  {id:'onePutt3',    label:'Hot Putter · 3 one-putts',test:c=>c.onePuttStreak>=3},
  {id:'reach25',     label:'Halfway · level 25',      test:c=>c.level>=25},
  {id:'clear50',     label:'Course Conqueror · lvl 50',test:c=>c.cleared50},
  {id:'streak8',     label:'Locked In · 8 streak',    test:c=>c.streak>=8},
  {id:'run5k',       label:'5,000 in a run',          test:c=>c.runScore>=5000},
  {id:'run15k',      label:'15,000 in a run',         test:c=>c.runScore>=15000},
  {id:'tourPro',     label:'Tour Pro',                test:c=>c.xp>=150000},
];
// Returns the achievement ids newly earned given ctx and already-earned list.
function newlyEarned(ctx, owned){
  return ACHIEVEMENTS.filter(a=>!owned.includes(a.id) && a.test(ctx)).map(a=>a.id);
}
// Cosmetic unlocks gated by lifetime XP.
const BALL_SKINS=[
  {id:'white', name:'Classic', xp:0,      color:'#ffffff', trail:'#ffffff'},
  {id:'sunset',name:'Sunset',  xp:5000,   color:'#ff9a4a', trail:'#ffce5a'},
  {id:'flame', name:'Flame',   xp:20000,  color:'#ff5a4a', trail:'#ff8a5a'},
  {id:'ice',   name:'Ice',     xp:60000,  color:'#7fd0ff', trail:'#bfe8ff'},
  {id:'gold',  name:'Gold',    xp:150000, color:'#ffd84a', trail:'#fff0a0'},
];
const GREEN_THEMES=[
  {id:'classic', name:'Bentgrass', xp:0,      tint:[1,1,1],       bg:0x0c120d},
  {id:'twilight',name:'Twilight',  xp:10000,  tint:[0.8,0.85,1.2],bg:0x0b0f1a},
  {id:'desert',  name:'Desert',    xp:40000,  tint:[1.2,1.05,0.7],bg:0x161008},
  {id:'augusta', name:'Augusta',   xp:100000, tint:[0.85,1.2,0.8],bg:0x081207},
];
function isUnlocked(item, xp){ return xp>=item.xp; }
// === END CAREER META ========================================================


export { resultTier, golfTerm, streakMultiplier, nextStreak, holeScore, RANKS, rankFor, nextRank, ACHIEVEMENTS, newlyEarned, BALL_SKINS, GREEN_THEMES, isUnlocked };
