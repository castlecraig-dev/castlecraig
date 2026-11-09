// Characters, items and quests, placed on the real map of the estate.
// Positions are world x/z in metres (+x east, +z south, origin at the main house).
//
// Quest types:
//   fetch  - find the listed items and hand them to the quest giver
//   timed  - reach each checkpoint in order before the clock runs out
//   sneak  - pick up the item and carry it to the target without the patrol seeing you
import { houseToWorld } from './layout.js';

const hw = (lx, lz) => houseToWorld(lx, lz);

export const ITEMS = {
  vodka: { name: 'Empty vodka bottle', kind: 'bottle', x: -100, z: 370 },
  drugs: { name: 'Bag of drugs', kind: 'bag', x: 50.5, z: 466 },
  vape: { name: 'Vape', kind: 'vape', x: 95, z: 180 },
  cigarettes: { name: 'Pack of cigarettes', kind: 'cigarettes', x: 110, z: 404 },
};

const [doorX, doorZ] = hw(0, -6);
export const CASTLE_DOOR = { x: doorX, z: doorZ, r: 3, name: 'the front door of the house' };
export const DINING = { id: 399619664, x: 54.5, z: 297.9, r: 3.2, name: 'the dining hall' };

// The smoking shelter, across the forecourt from the house and facing its front door.
const [shX, shZ] = hw(16, -48), [fdX, fdZ] = hw(0, -2.3);
export const SHELTER = { x: shX, z: shZ, ry: Math.atan2(fdX - shX, fdZ - shZ) };
const shelterPt = (x, z) => [SHELTER.x + x * Math.cos(SHELTER.ry) + z * Math.sin(SHELTER.ry), SHELTER.z - x * Math.sin(SHELTER.ry) + z * Math.cos(SHELTER.ry)];

// The alpaca paddock in the meadow north of the house, with a gate on the house side.
export const PADDOCK = { minX: -40, maxX: 40, minZ: -200, maxZ: -140, gate: [0, -140] };

const [cookX, cookZ] = hw(14, 14.5);
const [regX, regZ] = shelterPt(0.2, 1.9);

export const NPCS = [
  {
    id: 'groundskeeper', name: 'The Groundskeeper', model: 'groundskeeper', x: -6, z: -48, facing: Math.PI,
    quest: {
      type: 'fetch', title: 'Find the empty vodka bottle', items: ['vodka'],
      reward: { points: 100, badge: 'Clean Grounds' },
      intro: "Someone's stashed an empty vodka bottle somewhere on the estate. Somewhere quiet, I'd guess, where nobody walks. Find it and bring it back so it can go in the bin.",
      waiting: "No sign of the bottle yet? Think about where you'd hide something you didn't want found.",
      done: "That's it. Into the recycling it goes. Thanks for keeping the place clear.",
    },
  },
  {
    id: 'nurse', name: 'The Nurse', model: 'guide', tint: '#9cc3ff', x: 28, z: 446, facing: 0,
    quest: {
      type: 'fetch', title: 'Find the bag of drugs', items: ['drugs'],
      reward: { points: 150, badge: 'Honesty' },
      intro: "We've had word that a bag of drugs has been hidden somewhere near here. Please find it and bring it straight to me.",
      waiting: "Keep looking. Whoever hid it won't have gone far.",
      done: "Thank you for bringing it in. That took courage. It'll be disposed of safely.",
    },
  },
  {
    id: 'cook', name: 'The Cook', model: 'cook', x: cookX, z: cookZ, facing: 0,
    quest: {
      type: 'timed', title: 'Dining hall dash', timeLimit: 90,
      reward: { points: 120, badge: 'Quick Feet', perk: 'shoes', perkText: 'New running shoes: you now run 15% faster.' },
      checkpoints: [DINING, CASTLE_DOOR],
      intro: "Supper bell's about to go! Run down to the dining hall in the Recovery Gardens and back to the front door of the house in 90 seconds. Hold Shift to run. Ready? Go!",
      retry: 'Want another go at the dining hall dash? Off you go, the clock is running!',
      failed: "Too slow that time! Come and talk to me when you're ready to try again.",
      done: 'Made it with time to spare! You can eat with the best of them.',
    },
  },
  {
    id: 'resident', name: 'The Resident', model: 'gardener', x: 100, z: 228, facing: 0,
    quest: {
      type: 'sneak', title: 'Sneak a vape into the house', item: 'vape', target: CASTLE_DOOR,
      reward: { points: 120, badge: 'Ghost' },
      intro: "Psst. I hid a vape outside, somewhere near these walls. Can you get it to the front door of the house without the Night Porter seeing you? Stay out of their line of sight.",
      waiting: "It's not inside the garden, I'll say that much. And keep out of the Night Porter's view on the way to the front door.",
      caught: 'Spotted! The Night Porter confiscated the vape and put it back where it was found.',
      done: 'You made it in without being seen! Nobody needs to know.',
    },
  },
  {
    id: 'smokers', name: 'A Shelter Regular', model: 'groundskeeper', tint: '#d6b08a', x: regX, z: regZ, facing: SHELTER.ry,
    quest: {
      type: 'fetch', title: 'Find the pack of cigarettes', items: ['cigarettes'],
      reward: { points: 100, badge: 'Good Neighbour' },
      intro: "We're down to our last few smokes. Somebody dropped our pack of cigarettes on a walk this morning. Could you find it and bring it to the shelter? We'll share them round.",
      waiting: "Still no cigarettes? Whoever dropped them likes a walk by the old buildings down south.",
      done: "Legend! The whole shelter thanks you. Pull up a bench any time.",
    },
  },
  {
    id: 'keeper', name: 'The Alpaca Keeper', model: 'gardener', tint: '#e8d0a8', x: 4, z: -135, facing: Math.PI,
    quest: {
      type: 'herd', title: 'Find the 3 lost alpacas', count: 3,
      reward: { points: 150, badge: 'Alpaca Whisperer' },
      intro: "Somebody left the paddock gate open and three of my alpacas have wandered off! They could be anywhere on the estate. Give each one a pat and it'll follow you. Bring them back through the gate.",
      waiting: 'Still missing some alpacas. Pat them and lead them back into the paddock.',
      done: "All three home safe! They'll be humming about you for weeks.",
    },
  },
];

// Where the three escaped alpacas are wandering.
export const LOST_ALPACAS = [[-160, -100], [200, -150], [-60, 250]];

// Bonus for finishing everything.
export const FINAL_REWARD = { points: 250, badge: 'Castle Craig Graduate' };

// Residents who hang about the smoking shelter (no quest, just a chat).
export const AMBIENT = [
  { name: 'Resident', model: 'guide', tint: '#e0c9a8', at: shelterPt(-1.3, -0.95), facing: SHELTER.ry, sit: true },
  { name: 'Resident', model: 'gardener', tint: '#b8c8a8', at: shelterPt(1.1, -0.95), facing: SHELTER.ry, sit: true },
  { name: 'Resident', model: 'cook', tint: '#c8b0d8', at: shelterPt(1.9, 1.2), facing: SHELTER.ry + 2.6 },
].map((a, i) => ({ ...a, x: a.at[0], z: a.at[1], lines: [
  ['Lovely day for it. Have you met the alpacas yet?', 'Group is at two. Do not be late, they notice.', "Best view on the estate is from the lake. Honest."][i],
] }));

// The Night Porter walks this loop across the forecourt in front of the house.
export const PATROL = {
  name: 'The Night Porter', model: 'guide',
  route: [hw(-14, -12), hw(14, -12), hw(14, -30), hw(-14, -30)],
  speed: 2.4, viewRange: 13, viewAngle: (70 * Math.PI) / 180,
};

export const START = { at: hw(0, -34), facing: 0.138 }; // facing the house

// Areas kept free of trees: [x, z, radius]
export const KEEP_CLEAR = [
  [...hw(0, -20), 22], [START.at[0], START.at[1], 6], [SHELTER.x, SHELTER.z, 7], [DINING.x, DINING.z, 5],
];

export const PLACES = [
  { name: 'Castle Craig', x: 0, z: 0, h: 22 },
  { name: 'Walled Garden', x: 100, z: 225, h: 6 },
  { name: 'Dining Hall', x: 45, z: 299, h: 10 },
  { name: 'Smoking Shelter', x: SHELTER.x, z: SHELTER.z, h: 4.5 },
  { name: 'Alpaca Paddock', x: 0, z: -175, h: 4 },
  { name: 'Lake', x: 30, z: 492, h: 4 },
  { name: 'Old Watermill', x: 94, z: 383, h: 9 },
  { name: 'Hopeburn House', x: -116, z: 12, h: 10 },
  { name: 'Craigurd House', x: -288, z: -15, h: 12 },
];
