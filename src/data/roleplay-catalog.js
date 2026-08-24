'use strict';

const SCENARIOS = [
  {
    id: 'coffee',
    titleKey: 'coffee',
    imageAsset: 'assets/images/roleplay/orderingcoffe.png',
    sectionKey: null,
    minutes: 8,
    levelKey: 'beginner',
    sortOrder: 0,
  },
  {
    id: 'directions',
    titleKey: 'directions',
    imageAsset: 'assets/images/roleplay/askingdirection.png',
    sectionKey: 'dailyInteractions',
    minutes: 8,
    levelKey: 'beginner',
    sortOrder: 1,
  },
  {
    id: 'interview',
    titleKey: 'interview',
    imageAsset: 'assets/images/roleplay/jobinterview.png',
    sectionKey: 'business',
    minutes: 8,
    levelKey: 'beginner',
    sortOrder: 2,
  },
];

function listScenarios() {
  return SCENARIOS.map((row) => ({ ...row }));
}

module.exports = { listScenarios };
