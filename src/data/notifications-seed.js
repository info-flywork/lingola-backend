'use strict';

const SEED = [
  {
    id: 'translation',
    type: 'translation',
    titleKey: 'translation.title',
    bodyKey: 'translation.body',
    iconAsset: 'assets/images/notifications/icon_translation.svg',
    iconBg: '#1A2D46FF',
    titleColor: null,
    sortOrder: 0,
  },
  {
    id: 'offer',
    type: 'offer',
    titleKey: 'offer.title',
    bodyKey: 'offer.body',
    iconAsset: 'assets/images/notifications/icon_offer.svg',
    iconBg: '#1AFF8A00',
    titleColor: '#FF8A00',
    sortOrder: 1,
  },
  {
    id: 'stories',
    type: 'stories',
    titleKey: 'stories.title',
    bodyKey: 'stories.body',
    iconAsset: 'assets/images/notifications/icon_stories.svg',
    iconBg: '#1A34C759',
    titleColor: null,
    sortOrder: 2,
  },
];

function listSeedNotifications() {
  return SEED.map((row) => ({ ...row }));
}

module.exports = { listSeedNotifications };
