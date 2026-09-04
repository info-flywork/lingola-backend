'use strict';

/**
 * Role-play katalogu.
 * Her taban senaryo beginner / easy / medium / hard varyantına açılır.
 * categoryKey → ana filtre; Lingola RolePlay = kullanıcı custom’ları (DB).
 */

const BASE_SCENARIOS = [
  {
    id: 'coffee',
    titleKey: 'coffee',
    imageAsset: 'assets/images/roleplay/orderingcoffe.png',
    categoryKey: 'shopping',
    minutes: 8,
  },
  {
    id: 'shoppingClothes',
    titleKey: 'shoppingClothes',
    imageAsset: 'assets/images/roleplay/shoppingclothes.png',
    categoryKey: 'shopping',
    minutes: 6,
  },
  {
    id: 'flirtingMeet',
    titleKey: 'flirtingMeet',
    imageAsset: 'assets/images/roleplay/orderingcoffe.png',
    categoryKey: 'flirting',
    minutes: 7,
  },
  {
    id: 'directions',
    titleKey: 'directions',
    imageAsset: 'assets/images/roleplay/askingdirection.png',
    categoryKey: 'lifeInTheUs',
    minutes: 8,
  },
  {
    id: 'takingTaxi',
    titleKey: 'takingTaxi',
    imageAsset: 'assets/images/roleplay/takingtaxi.png',
    categoryKey: 'lifeInTheUs',
    minutes: 6,
  },
  {
    id: 'missedTrain',
    titleKey: 'missedTrain',
    imageAsset: 'assets/images/roleplay/missedtrain.png',
    categoryKey: 'lifeInTheUs',
    minutes: 5,
  },
  {
    id: 'freeTalkHobby',
    titleKey: 'freeTalkHobby',
    imageAsset: 'assets/images/roleplay/birthdayparty.png',
    categoryKey: 'freeDiscussion',
    minutes: 7,
  },
  {
    id: 'interview',
    titleKey: 'interview',
    imageAsset: 'assets/images/roleplay/jobinterview.png',
    categoryKey: 'jobInterview',
    minutes: 8,
  },
  {
    id: 'doctorAppointment',
    titleKey: 'doctorAppointment',
    imageAsset: 'assets/images/roleplay/doctorappointment.png',
    categoryKey: 'dailyInteractions',
    minutes: 6,
  },
  {
    id: 'birthdayParty',
    titleKey: 'birthdayParty',
    imageAsset: 'assets/images/roleplay/birthdayparty.png',
    categoryKey: 'dailyInteractions',
    minutes: 7,
  },
  {
    id: 'rentingApartment',
    titleKey: 'rentingApartment',
    imageAsset: 'assets/images/roleplay/rentingapartment.png',
    categoryKey: 'socialDynamics',
    minutes: 7,
  },
  {
    id: 'restaurantReservation',
    titleKey: 'restaurantReservation',
    imageAsset: 'assets/images/roleplay/restaurantreservation.png',
    categoryKey: 'restaurant',
    minutes: 6,
  },
  {
    id: 'flightAttendant',
    titleKey: 'flightAttendant',
    imageAsset: 'assets/images/roleplay/flightattendant.png',
    categoryKey: 'travel',
    minutes: 6,
  },
  {
    id: 'trainTicket',
    titleKey: 'trainTicket',
    imageAsset: 'assets/images/roleplay/trainticket.png',
    categoryKey: 'travel',
    minutes: 6,
  },
];

/** Ana sayfa filtre sırası (All + Lingola RolePlay FE’de eklenir). */
const CATEGORY_KEYS = [
  'shopping',
  'flirting',
  'lifeInTheUs',
  'freeDiscussion',
  'jobInterview',
  'dailyInteractions',
  'socialDynamics',
  'restaurant',
  'travel',
];

const DIFFICULTIES = [
  { key: 'beginner', idSuffix: '', minuteDelta: 0 },
  { key: 'easy', idSuffix: '-easy', minuteDelta: 0 },
  { key: 'medium', idSuffix: '-medium', minuteDelta: 1 },
  { key: 'hard', idSuffix: '-hard', minuteDelta: 2 },
];

function listScenarios() {
  const out = [];
  let sortOrder = 0;
  for (const base of BASE_SCENARIOS) {
    for (const diff of DIFFICULTIES) {
      out.push({
        id: `${base.id}${diff.idSuffix}`,
        titleKey: base.titleKey,
        imageAsset: base.imageAsset,
        categoryKey: base.categoryKey,
        // FE geriye uyum: sectionKey = category
        sectionKey: base.categoryKey,
        minutes: base.minutes + diff.minuteDelta,
        levelKey: diff.key,
        sortOrder: sortOrder++,
        baseId: base.id,
      });
    }
  }
  return out;
}

function listCategories() {
  return CATEGORY_KEYS.slice();
}

function baseIdFromScenarioId(scenarioId) {
  const id = String(scenarioId || '');
  return id.replace(/-(easy|medium|hard)$/i, '');
}

module.exports = {
  listScenarios,
  listCategories,
  baseIdFromScenarioId,
  CATEGORY_KEYS,
  DIFFICULTIES,
};
