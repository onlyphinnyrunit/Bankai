// Starter templates. Content transcribed from the plans Phinehas provided;
// nothing here is invented: blank targets stay blank (null).
// Exercise keys reference EX below. Item fields: sets, reps, dur (seconds), rest (seconds), note.

const EX = {
  situps: { name: 'Sit Ups', category: 'Core' },
  pushups: { name: 'Push Ups', category: 'Chest' },
  squatjumps: { name: 'Squat Jumps', category: 'Legs' },
  plank: { name: 'Plank', category: 'Core' },
  climbers: { name: 'Mountain Climbers', category: 'Core' },
  jumprope: { name: 'Jump Rope', category: 'Cardio' },
  jacks: { name: 'Jumping Jacks', category: 'Cardio' },
  latjumps: { name: 'Lateral Jumps', category: 'Legs' },

  inclinepress: { name: 'Incline Chest Press', category: 'Chest' },
  chestflies: { name: 'Chest Flies', category: 'Chest' },
  jmpress: { name: 'JM Press', category: 'Triceps' },
  shoulderpress: { name: 'Shoulder Press', category: 'Shoulders' },
  latraises: { name: 'Lateral Raises', category: 'Shoulders' },
  triext: { name: 'Triceps Extensions', category: 'Triceps' },
  pulldowns: { name: 'Pulldowns', category: 'Back' },
  upperrows: { name: 'Upper Back Rows', category: 'Back' },
  closerows: { name: 'Close Grip Rows', category: 'Back' },
  preacher: { name: 'Preacher Curls', category: 'Biceps' },
  hammer: { name: 'Hammer Curls', category: 'Biceps' },
  reardelt: { name: 'Rear Delt Flies', category: 'Shoulders' },
  adductors: { name: 'Adductors', category: 'Legs' },
  squat: { name: 'Squat Pattern', category: 'Legs' },
  sldl: { name: "SLDL's", category: 'Hamstrings' },
  calves: { name: 'Straight Leg Calf Raises', category: 'Calves' },
  legext: { name: 'Leg Extensions', category: 'Quads' },
  hamcurls: { name: 'Hamstring Curls', category: 'Hamstrings' },
  legcurls: { name: 'Leg Curls', category: 'Hamstrings' },
  crunches: { name: 'Cable Crunches', category: 'Core' },
  hlr: { name: 'Hanging Leg Raises', category: 'Core' },
  pushdowns: { name: 'Pushdowns', category: 'Triceps' },
};

const r = (ex, reps) => ({ ex, reps: String(reps) });
const t = (ex, dur) => ({ ex, dur });
const s = (ex, sets, note) => ({ ex, sets, note: note || '' });

export const TEMPLATES = [
  {
    id: 'home-beginner',
    name: 'Beginner Home Plan',
    blurb: 'No equipment. Monday, Wednesday, Thursday, Friday. Weekends are rest days.',
    plans: [
      { name: 'Monday', days: [1], items: [r('situps', 20), r('pushups', 10), r('squatjumps', 20), t('plank', 30), r('climbers', 20), t('jumprope', 60), r('jacks', 30), r('latjumps', 20)] },
      { name: 'Wednesday', days: [3], items: [r('situps', 40), r('pushups', 20), r('squatjumps', 30), t('plank', 40), r('climbers', 30), t('jumprope', 180), r('jacks', 50), r('latjumps', 40)] },
      { name: 'Thursday', days: [4], items: [r('situps', 30), r('pushups', 20), r('squatjumps', 30), t('plank', 30), r('climbers', 30), t('jumprope', 60), r('jacks', 40), r('latjumps', 20)] },
      { name: 'Friday', days: [5], items: [r('situps', 50), r('pushups', 20), r('squatjumps', 50), t('plank', 60), r('climbers', 50), t('jumprope', 240), r('jacks', 50), r('latjumps', 45)] },
    ],
  },
  {
    id: 'ppl-ul',
    name: 'PPL × U/L Split',
    blurb: 'Push, Pull, Legs, Upper Body, Legs. Gym machines and free weights. Sets listed; add your own reps and days.',
    plans: [
      { name: 'Push', desc: 'Chest, shoulders, triceps', items: [s('inclinepress', 2), s('chestflies', 2), s('jmpress', 2), s('shoulderpress', 2), s('latraises', 2), s('triext', 2)] },
      { name: 'Pull', desc: 'Back, biceps, forearms', items: [s('pulldowns', 2, 'Wide grip'), s('upperrows', 2), s('closerows', 2), s('preacher', 2), s('hammer', 2), s('reardelt', 1)] },
      { name: 'Legs A', desc: 'Quads, hamstrings, glutes, calves', items: [s('adductors', 1), s('squat', 2), s('sldl', 2), s('calves', 2), s('legext', 2), s('hamcurls', 2), s('crunches', 2), s('hlr', 1)] },
      { name: 'Upper Body', desc: 'Chest, back, shoulders, biceps, triceps', items: [s('shoulderpress', 2), s('chestflies', 2), s('upperrows', 2), s('inclinepress', 2), s('pulldowns', 2), s('latraises', 1), s('preacher', 2), s('jmpress', 1), s('pushdowns', 2), s('reardelt', 1)] },
      { name: 'Legs B', desc: 'Quads, hamstrings, glutes, calves', items: [s('adductors', 1), s('legext', 2), s('legcurls', 2), s('squat', 2), s('sldl', null), s('calves', 2), s('hlr', 2), s('crunches', 1)] },
    ],
  },
];

export const TEMPLATE_EXERCISES = EX;
