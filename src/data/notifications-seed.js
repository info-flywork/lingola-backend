'use strict';

const SEED = [
  {
    id: 'practice',
    type: 'practice',
    titleKey: 'practice.title',
    bodyKey: 'practice.body',
    iconAsset: 'assets/images/notifications/icon_translation.svg',
    iconBg: '#1A2D46FF',
    titleColor: null,
    sortOrder: 0,
  },
  {
    id: 'streak',
    type: 'streak',
    titleKey: 'streak.title',
    bodyKey: 'streak.body',
    iconAsset: 'assets/images/notifications/icon_stories.svg',
    iconBg: '#1A34C759',
    titleColor: null,
    sortOrder: 1,
  },
  {
    id: 'premium',
    type: 'premium',
    titleKey: 'premium.title',
    bodyKey: 'premium.body',
    iconAsset: 'assets/images/notifications/icon_offer.svg',
    iconBg: '#1AFF8A00',
    titleColor: '#FF8A00',
    sortOrder: 2,
  },
];

function listSeedNotifications() {
  return SEED.map((row) => ({ ...row }));
}

module.exports = { listSeedNotifications };
