'use strict';

/**
 * Role-play katalogu.
 * Her taban senaryo beginner / easy / medium / hard varyantına açılır.
 * categoryKey → ana filtre; Lingola RolePlay = kullanıcı custom’ları (DB).
 * Zorluk başına farklı titleKey → FE i18n çeşitliliği.
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
  {
    id: 'pharmacy',
    titleKey: 'pharmacy',
    imageAsset: 'assets/images/roleplay/doctorappointment.png',
    categoryKey: 'dailyInteractions',
    minutes: 6,
  },
  {
    id: 'shoppingMall',
    titleKey: 'shoppingMall',
    imageAsset: 'assets/images/roleplay/shoppingclothes.png',
    categoryKey: 'shopping',
    minutes: 6,
  },
  {
    id: 'gym',
    titleKey: 'gym',
    imageAsset: 'assets/images/roleplay/birthdayparty.png',
    categoryKey: 'dailyInteractions',
    minutes: 6,
  },
  {
    id: 'library',
    titleKey: 'library',
    imageAsset: 'assets/images/roleplay/jobinterview.png',
    categoryKey: 'dailyInteractions',
    minutes: 6,
  },
  {
    id: 'bank',
    titleKey: 'bank',
    imageAsset: 'assets/images/roleplay/rentingapartment.png',
    categoryKey: 'dailyInteractions',
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

/** Taban → zorluk başına farklı senaryo başlığı (FE i18n key). */
const VARIANT_TITLE_KEYS = {
  coffee: {
    beginner: 'coffee',
    easy: 'coffeeQueue',
    medium: 'coffeeRecommendation',
    hard: 'coffeeWrongOrder',
  },
  shoppingClothes: {
    beginner: 'shoppingClothes',
    easy: 'shoppingFittingRoom',
    medium: 'shoppingReturn',
    hard: 'shoppingDiscount',
  },
  flirtingMeet: {
    beginner: 'flirtingMeet',
    easy: 'flirtingCompliment',
    medium: 'flirtingAskOut',
    hard: 'flirtingAwkward',
  },
  directions: {
    beginner: 'directions',
    easy: 'directionsLost',
    medium: 'directionsTransit',
    hard: 'directionsWrongWay',
  },
  takingTaxi: {
    beginner: 'takingTaxi',
    easy: 'taxiFare',
    medium: 'taxiTraffic',
    hard: 'taxiComplaint',
  },
  missedTrain: {
    beginner: 'missedTrain',
    easy: 'missedTrainNext',
    medium: 'missedTrainTicket',
    hard: 'missedTrainRefund',
  },
  freeTalkHobby: {
    beginner: 'freeTalkHobby',
    easy: 'freeTalkWeekend',
    medium: 'freeTalkMovies',
    hard: 'freeTalkDisagree',
  },
  interview: {
    beginner: 'interview',
    easy: 'interviewStrengths',
    medium: 'interviewExperience',
    hard: 'interviewSalary',
  },
  doctorAppointment: {
    beginner: 'doctorAppointment',
    easy: 'doctorSymptoms',
    medium: 'doctorPrescription',
    hard: 'doctorFollowUp',
  },
  birthdayParty: {
    beginner: 'birthdayParty',
    easy: 'birthdayInvite',
    medium: 'birthdayGifts',
    hard: 'birthdaySurprise',
  },
  rentingApartment: {
    beginner: 'rentingApartment',
    easy: 'rentingApartmentTour',
    medium: 'rentingApartmentAgent',
    hard: 'rentingApartmentNegotiate',
  },
  restaurantReservation: {
    beginner: 'restaurantReservation',
    easy: 'restaurantChange',
    medium: 'restaurantAllergy',
    hard: 'restaurantComplaint',
  },
  flightAttendant: {
    beginner: 'flightAttendant',
    easy: 'flightSeat',
    medium: 'flightSpecialMeal',
    hard: 'flightDelay',
  },
  trainTicket: {
    beginner: 'trainTicket',
    easy: 'trainTicketChange',
    medium: 'trainTicketPlatform',
    hard: 'trainTicketUpgrade',
  },
  pharmacy: {
    beginner: 'pharmacy',
    easy: 'pharmacySymptoms',
    medium: 'pharmacyDosage',
    hard: 'pharmacyAllergy',
  },
  shoppingMall: {
    beginner: 'shoppingMall',
    easy: 'shoppingMallDirections',
    medium: 'shoppingMallHours',
    hard: 'shoppingMallLost',
  },
  gym: {
    beginner: 'gym',
    easy: 'gymMembership',
    medium: 'gymTrainer',
    hard: 'gymTour',
  },
  library: {
    beginner: 'library',
    easy: 'libraryCard',
    medium: 'libraryEbook',
    hard: 'libraryStudyRoom',
  },
  bank: {
    beginner: 'bank',
    easy: 'bankDebitCard',
    medium: 'bankMobile',
    hard: 'bankFees',
  },
};

function titleKeyFor(base, levelKey) {
  const map = VARIANT_TITLE_KEYS[base.id];
  if (map && map[levelKey]) return map[levelKey];
  return base.titleKey;
}

function listScenarios() {
  const out = [];
  let sortOrder = 0;
  for (const base of BASE_SCENARIOS) {
    for (const diff of DIFFICULTIES) {
      out.push({
        id: `${base.id}${diff.idSuffix}`,
        titleKey: titleKeyFor(base, diff.key),
        imageAsset: base.imageAsset,
        categoryKey: base.categoryKey,
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
  VARIANT_TITLE_KEYS,
};
