// Characters, items and quests. Positions are world x/z in metres.
//
// Quest types:
//   fetch  - find the listed items and hand them to the quest giver
//   timed  - reach each checkpoint in order before the clock runs out
//   sneak  - pick up the item and carry it to the target without the patrol seeing you

export const ITEMS = {
  vodka: { name: 'Empty vodka bottle', kind: 'bottle', x: -40, z: 67 },
  drugs: { name: 'Bag of drugs', kind: 'bag', x: 68, z: -24 },
  vape: { name: 'Vape', kind: 'vape', x: -66, z: -42 },
};

export const CASTLE_DOOR = { x: 0, z: -12, r: 2.6, name: 'the castle door' };
export const DINING_DOOR = { x: 70, z: 1.8, r: 2.8, name: 'the dining hall' };

export const NPCS = [
  {
    id: 'groundskeeper', name: 'The Groundskeeper', model: 'groundskeeper', x: 5, z: 14, facing: Math.PI,
    quest: {
      type: 'fetch', title: 'Find the empty vodka bottle', items: ['vodka'],
      intro: "Someone's stashed an empty vodka bottle somewhere on the grounds. I think it's out in the woods across the river. Find it and bring it back so it can go in the bin.",
      waiting: 'No sign of the bottle yet? Try the woods south of the bridge.',
      done: "That's it. Into the recycling it goes. Thanks for keeping the place clear.",
    },
  },
  {
    id: 'nurse', name: 'The Nurse', model: 'guide', tint: '#9cc3ff', x: 44, z: -13, facing: 0,
    quest: {
      type: 'fetch', title: 'Find the bag of drugs', items: ['drugs'],
      intro: "We've had word that a bag of drugs has been hidden near the pond. Please find it and bring it straight to me.",
      waiting: "The bag is somewhere around the pond's edge. Have a look by the reeds.",
      done: "Thank you for bringing it in. That took courage. It'll be disposed of safely.",
    },
  },
  {
    id: 'cook', name: 'The Cook', model: 'cook', x: 16, z: -17, facing: 0,
    quest: {
      type: 'timed', title: 'Dining hall dash', timeLimit: 28,
      checkpoints: [DINING_DOOR, CASTLE_DOOR],
      intro: 'Supper bell goes any second! Run to the dining hall and get back to the castle door in 28 seconds. Hold Shift to run. Ready? Go!',
      retry: 'Want another go at the dining hall dash? Off you go, the clock is running!',
      failed: "Too slow that time! Come and talk to me when you're ready to try again.",
      done: 'Made it with time to spare! You can eat with the best of them.',
    },
  },
  {
    id: 'resident', name: 'The Resident', model: 'gardener', x: -50, z: -30, facing: 0,
    quest: {
      type: 'sneak', title: 'Sneak a vape into the castle', item: 'vape', target: CASTLE_DOOR,
      intro: "Psst. I hid a vape behind the walled garden, by the far corner. Can you get it into the castle without the Night Porter seeing you? Stay out of their line of sight.",
      waiting: "The vape is behind the walled garden. Keep out of the Night Porter's view on the way to the castle door.",
      caught: 'Spotted! The Night Porter confiscated the vape and put it back where it was found.',
      done: "You made it in without being seen! Nobody needs to know.",
    },
  },
];

// The Night Porter walks this loop in front of the castle.
export const PATROL = {
  name: 'The Night Porter', model: 'guide',
  route: [[-15, -7], [15, -7], [15, 5], [-15, 5]],
  speed: 2.4, viewRange: 13, viewAngle: (70 * Math.PI) / 180,
};

export const PLACES = [
  { name: 'Castle Craig', x: 0, y: 24, z: -24 },
  { name: 'Walled Garden', x: -50, y: 5, z: -26 },
  { name: 'Pond', x: 50, y: 4, z: -28 },
  { name: 'Dining Hall', x: 70, y: 9, z: -4 },
  { name: 'River', x: -30, y: 3, z: 34 },
  { name: 'South Woods', x: 0, y: 6, z: 62 },
];
