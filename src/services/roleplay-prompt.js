'use strict';

const {
  characterBlurb,
  characterLockRule,
  flavorRule,
  naturalEnglishRule,
} = require('./tutor-personality');
const {
  learnerAddressingRule,
  resolveExplanationLanguage,
} = require('./prompt_helpers');
const { normalizeLangCode, languageDisplayName } = require('../utils/locale');

const SCENES = [
  {
    match: /coffee|kahve|cafe|kafede/i,
    title: 'Ordering at the Coffee Shop',
    roleATutor: 'barista (coffee-shop worker)',
    roleAUser: 'customer',
    roleBTutor: 'customer',
    roleBUser: 'barista',
    phrases: [
      'Hi! What can I get for you today?',
      "I'd like a medium latte, please.",
      'Can I get a large cappuccino?',
      'What sizes do you have?',
      'Can I have oat milk / almond milk?',
      'Is there a lactose-free option?',
      'Decaf, please.',
      'No sugar, please. / Can I have less sugar?',
      'An extra shot, please.',
      'For here or to go?',
      'Can I have that iced?',
      'Do you have any pastries?',
      'How much is that?',
      "That's all, thanks.",
      'Can I pay by card?',
    ],
    rolePlayChecks: [
      'milk type (oat, almond, skim, lactose-free)',
      'sugar / sweetener preference',
      'size and for here or to go',
      'price and payment',
    ],
  },
  {
    match: /direction|yol|street|sokak/i,
    title: 'Asking for Directions on the Street',
    roleATutor: 'helpful local person',
    roleAUser: 'visitor who is a bit lost',
    roleBTutor: 'visitor who is a bit lost',
    roleBUser: 'helpful local person',
    phrases: [
      'Excuse me, how do I get to the subway?',
      'Is it far from here?',
      'Go straight two blocks, then turn left.',
      "It's next to the pharmacy.",
      'You can also take the bus — the stop is on the corner.',
      'Thank you so much!',
    ],
    rolePlayChecks: ['distance', 'landmarks', 'transport option'],
  },
  {
    match: /interview|görüşme|job/i,
    title: 'Job Interview',
    roleATutor: 'interviewer / hiring manager',
    roleAUser: 'job candidate',
    roleBTutor: 'job candidate',
    roleBUser: 'interviewer / hiring manager',
    phrases: [
      'Tell me a little about yourself.',
      'What are your main strengths?',
      'Why do you want this job?',
      'Describe a challenge you solved at work.',
      'How many hours per week can you work?',
      'Do you prefer office or remote work?',
      'What are your salary expectations?',
      'Do you have any questions for us?',
      "I'm excited to be here.",
      'What are the next steps?',
    ],
    rolePlayChecks: [
      'experience and skills',
      'schedule and availability',
      'strengths with examples',
    ],
  },
  {
    match: /missed.*train|train.*miss|tren.*kaç/i,
    title: 'You Missed Your Train',
    roleATutor: 'station staff member',
    roleAUser: 'passenger who missed their train',
    roleBTutor: 'passenger who missed their train',
    roleBUser: 'station staff member',
    phrases: [
      'Hello, where are you trying to go?',
      'What time was your original train?',
      'Do you already have a ticket?',
      'Do you know why you missed the train?',
      'Would you like me to check the next available train?',
      'Would you prefer the fastest or cheapest option?',
      'Are you okay with changing trains?',
      'Would you like a seat reservation?',
      'Do you need directions to the correct platform?',
      'Thank you for your help.',
    ],
    rolePlayChecks: [
      'destination and original train time',
      'ticket status',
      'next train options (fast vs cheap)',
      'platform directions',
    ],
  },
  {
    match: /flight attendant|hostes|uçak|plane|boarding pass/i,
    title: 'Talking to a Flight Attendant',
    roleATutor: 'flight attendant',
    roleAUser: 'passenger',
    roleBTutor: 'passenger',
    roleBUser: 'flight attendant',
    phrases: [
      'Hello! May I see your boarding pass, please?',
      'Would you like some help finding your seat?',
      'Do you need help with your luggage?',
      'Would you like to put your bag in the overhead compartment?',
      'Would you like something to drink?',
      'Would you prefer water, juice, coffee, or tea?',
      'Would you like something to eat?',
      'Would you prefer the chicken or the pasta?',
      'Do you have any food allergies?',
      'Is everything okay with your seat?',
      'Would you like a blanket or a pillow?',
      'Is there anything else I can help you with?',
    ],
    rolePlayChecks: [
      'seat and boarding pass',
      'luggage / overhead bin',
      'drink and meal choices',
      'allergies and comfort items',
    ],
  },
  {
    match: /train ticket|bilet|ticket clerk|gişe/i,
    title: 'Buying a Train Ticket',
    roleATutor: 'ticket clerk',
    roleAUser: 'passenger',
    roleBTutor: 'passenger',
    roleBUser: 'ticket clerk',
    phrases: [
      'Hello! Where would you like to go?',
      'When would you like to travel?',
      'Would you like a one-way or return ticket?',
      'What time would you like to leave?',
      'Would you prefer the fastest or the cheapest train?',
      'Would you like a standard or first-class ticket?',
      'How many tickets do you need?',
      'Would you like a window or an aisle seat?',
      'Will you be traveling with any large luggage?',
      'Would you like a flexible ticket?',
      'How would you like to pay?',
      'Would you like me to confirm your ticket?',
    ],
    rolePlayChecks: [
      'destination and travel date',
      'one-way vs return',
      'class and seat preference',
      'payment and confirmation',
    ],
  },
  {
    match: /restaurant reservation|restoran|masa ayır/i,
    title: 'Making a Restaurant Reservation',
    roleATutor: 'restaurant host',
    roleAUser: 'customer',
    roleBTutor: 'customer',
    roleBUser: 'restaurant host',
    phrases: [
      'Hello! How can I help you?',
      'What day would you like to make a reservation for?',
      'What time would you like to come?',
      'How many people will be joining you?',
      'Would you prefer indoor or outdoor seating?',
      'Do you have any special seating requests?',
      'Are you celebrating a special occasion?',
      'Do you or any of your guests have any food allergies?',
      'May I have your name for the reservation?',
      'Could I have a phone number for the booking?',
      'Is there anything else you\'d like us to prepare?',
      'Would you like me to confirm your reservation?',
    ],
    rolePlayChecks: [
      'date, time, and party size',
      'seating preference',
      'allergies and special occasion',
      'name and confirmation',
    ],
  },
  {
    match: /doctor.*appointment|clinic|randevu|receptionist/i,
    title: "Making a Doctor's Appointment",
    roleATutor: 'clinic receptionist',
    roleAUser: 'patient',
    roleBTutor: 'patient',
    roleBUser: 'clinic receptionist',
    phrases: [
      'Hello! How can I help you today?',
      'Have you visited our clinic before?',
      'What would you like to see the doctor about?',
      'How long have you been experiencing this problem?',
      'Would you like the first available appointment?',
      'What day would work best for you?',
      'Would you prefer a morning or afternoon appointment?',
      'Would 2:30 PM on Wednesday work for you?',
      'May I have your full name, please?',
      'Could I have your phone number?',
      'Is there anything else you\'d like us to know before your appointment?',
      'Would you like me to confirm your appointment?',
    ],
    rolePlayChecks: [
      'reason for visit',
      'preferred day and time',
      'name and contact details',
      'appointment confirmation',
    ],
  },
  {
    match: /shopping.*clothes|clothes|mağaza|sales assistant/i,
    title: 'Shopping for Clothes',
    roleATutor: 'sales assistant',
    roleAUser: 'customer',
    roleBTutor: 'customer',
    roleBUser: 'sales assistant',
    phrases: [
      'Hello! Can I help you find something?',
      'What are you looking for today?',
      'What size do you usually wear?',
      'Is there a particular color you\'re looking for?',
      'Would you prefer something casual or more formal?',
      'What\'s your budget?',
      'Would you like to try this one on?',
      'Would you like a different size?',
      'How does it fit?',
      'Would you like to see it in another color?',
      'Are you looking for anything to go with it?',
      'Would you like to buy it?',
    ],
    rolePlayChecks: [
      'item type and size',
      'color and style preference',
      'trying on and fit',
      'purchase decision',
    ],
  },
  {
    match: /taxi|taksi|cab driver/i,
    title: 'Taking a Taxi',
    roleATutor: 'taxi driver',
    roleAUser: 'passenger',
    roleBTutor: 'passenger',
    roleBUser: 'taxi driver',
    phrases: [
      'Hello! Where would you like to go?',
      'Do you have the exact address?',
      'Have you been there before?',
      'Would you prefer the fastest route?',
      'Are you in a hurry?',
      'Is this your first time in the city?',
      'Are you here for work or vacation?',
      'How long are you staying?',
      'Would you like me to drop you off at the main entrance?',
      'Would you like some help with your luggage?',
      'Will you be paying by cash or card?',
      'Would you like a receipt?',
    ],
    rolePlayChecks: [
      'destination and address',
      'route preference',
      'payment method',
      'receipt and luggage',
    ],
  },
  {
    match: /rent.*apartment|landlord|ev sahibi|kira/i,
    title: 'Renting an Apartment',
    roleATutor: 'landlord',
    roleAUser: 'prospective tenant',
    roleBTutor: 'prospective tenant',
    roleBUser: 'landlord',
    phrases: [
      'Hello! Are you interested in renting the apartment?',
      'When are you looking to move in?',
      'How long are you planning to stay?',
      'Will you be living alone or with someone?',
      'What do you do for work?',
      'Have you rented an apartment before?',
      'Do you have any pets?',
      'Do you need a furnished or unfurnished apartment?',
      'Would you need a parking space?',
      'Is the monthly rent within your budget?',
      'Would you be comfortable paying a security deposit?',
      'Do you have any questions about the apartment?',
      'Would you like to see the apartment in person?',
      'What day would be convenient for a viewing?',
    ],
    rolePlayChecks: [
      'move-in date and stay length',
      'furnished vs unfurnished, pets',
      'rent, deposit, and parking',
      'viewing appointment',
    ],
  },
  {
    match: /birthday party|doğum günü|party plan/i,
    title: 'Planning a Birthday Party',
    roleATutor: 'friend helping plan the party',
    roleAUser: 'you (planner)',
    roleBTutor: 'you (planner)',
    roleBUser: 'friend helping plan the party',
    phrases: [
      'So, whose birthday are we planning?',
      'When should we have the party?',
      'How many people should we invite?',
      'Where do you think we should have it?',
      'Would you rather have the party at home or at a restaurant?',
      'What\'s our budget for the party?',
      'What kind of food should we serve?',
      'What kind of birthday cake should we get?',
      'Do you know their favorite flavor?',
      'Should we have a theme for the party?',
      'What kind of music should we play?',
      'Should we plan any games or activities?',
      'Who should we invite?',
      'How should we send the invitations?',
      'What gift do you think we should get?',
      'Who will bring the birthday cake?',
      'What time should the party start?',
      'Is there anything else we need to organize?',
    ],
    rolePlayChecks: [
      'date, venue, and guest count',
      'food, cake, and theme',
      'invitations and activities',
      'budget and gift',
    ],
  },
];

function sceneFor(title) {
  const raw = String(title || '');
  const scenario = raw
    .replace(/^Role Play:\s*/i, '')
    .replace(/\s*#custom:[a-f0-9-]{36}$/i, '')
    .trim();
  const found = SCENES.find((s) => s.match.test(scenario) || s.match.test(raw));
  return (
    found || {
      title: scenario || 'everyday conversation',
      roleATutor: 'the other person in the scene',
      roleAUser: 'the learner',
      roleBTutor: 'the learner role',
      roleBUser: 'the other person',
      phrases: ['Hello.', 'Nice to meet you.', 'Could you help me?', 'Thank you.'],
      rolePlayChecks: ['polite requests', 'thanks and closing'],
    }
  );
}

function sceneFromPayload(payload = {}, fallbackTitle = 'everyday conversation') {
  return {
    title: payload.title || fallbackTitle,
    roleATutor: payload.roleATutor || 'the other person in the scene',
    roleAUser: payload.roleAUser || 'the learner',
    roleBTutor: payload.roleBTutor || 'the learner role',
    roleBUser: payload.roleBUser || 'the other person',
    phrases:
      Array.isArray(payload.phrases) && payload.phrases.length
        ? payload.phrases
        : ['Hello.', 'Nice to meet you.', 'Could you help me?', 'Thank you.'],
    rolePlayChecks:
      Array.isArray(payload.rolePlayChecks) && payload.rolePlayChecks.length
        ? payload.rolePlayChecks
        : ['polite requests', 'thanks and closing'],
  };
}

function displayTutorName(tutor) {
  const raw = String(tutor?.nameKey || tutor?.slug || 'Lingola');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function rolePlayLanguageRule(user) {
  const nativeCode = normalizeLangCode(
    user?.onboarding?.nativeLanguageCode,
    'tr',
  );
  const nativeName = languageDisplayName(nativeCode, nativeCode);
  const strictEnglishOnly =
    resolveExplanationLanguage(user, null) === 'english';

  if (strictEnglishOnly) {
    return `CRITICAL LANGUAGE RULE:
- Speak and write ONLY in English in every message (briefing, role-play, feedback).
- Never reply in ${nativeName} or any other language. The app UI translates separately if needed.`;
  }

  return `CRITICAL LANGUAGE RULE:
- DEFAULT: Start in English and keep briefing, role-play dialogue, and feedback in English.
- The chat bubble text MUST match the language you are speaking for that sentence.
- Use ${nativeName} ONLY when the learner's latest message is clearly in ${nativeName} (they asked for help, meaning, grammar, or wrote in ${nativeName}).
- Do NOT open with ${nativeName}. Do NOT write ${nativeName} while the voice speaks English.
- After a short ${nativeName} explanation, return to English practice in the same reply (one English phrase or question).
- In-character role-play lines are always English.`;
}

function buildRolePlayPrompt(scene, { user, tutor, resuming = false } = {}) {
  const phrases = scene.phrases.map((p) => `- ${p}`).join('\n');
  const checks = (scene.rolePlayChecks || [])
    .map((c) => `- ${c}`)
    .join('\n');
  const tutorName = displayTutorName(tutor || { slug: 'lingola' });
  const character =
    tutor && tutor.slug
      ? `${characterBlurb(tutor)}
${characterLockRule(tutor)}
${flavorRule(tutor)}`
      : `You are Lingola, a friendly robot English tutor running this role-play.`;

  const languageRule = rolePlayLanguageRule(user);

  const resumeRule = resuming
    ? `
RESUME RULE (chat history already exists — learner returned to this scenario):
- Do NOT restart Phase 1 or repeat the opening briefing ("Hi! Today we'll practice...").
- Welcome them back briefly (one short sentence) and continue from the last phase you were in.
- Pick up naturally from prior messages; do not re-teach phrases they already practiced unless they ask.
`
    : `
Never jump straight into "Welcome, what can I get you?" at the start. Brief and teach first.`;

  return `You are ${tutorName}, a friendly English tutor running a ROLE-PLAY lesson.
${character}
${naturalEnglishRule('A2')}
${learnerAddressingRule(user || {})}
Scenario: "${scene.title}".

${languageRule}

CRITICAL VOICE RULE:
- Stay the SAME character and voice from start to finish. Do not switch to another persona mid-lesson.

Goal: natural everyday spoken English — not stiff school English. Prefer contractions and real-life variants.
Follow these FOUR phases in order. Do not skip ahead. Replies: 1–3 short sentences. No markdown.

PHASE 1 — BRIEFING (you are the TEACHER, not in character yet)
- Greet the learner by name if you know it. Say today you will practice "${scene.title}".
- Explain the situation in 1–2 sentences.
- Teach phrases in 2–3 small batches (not all at once). For each idea show 2 natural variants.
- Minimum: cover at least 8 phrases from this list before Phase 2:
${phrases}
- After each batch, ask the learner to repeat or try one phrase.
- When they have tried several phrases or say they are ready, announce Phase 2.

PHASE 2 — ROLE PLAY (first roles)
- Say clearly: you will be ${scene.roleATutor}; the learner will be ${scene.roleAUser}. You ask, they answer.
- Stay in that role for 5–7 short turns.
- You MUST cover these real-life details during the scene (not only the first order line):
${checks}
- Gently model more natural English if they sound stiff or make a mistake. Give brief specific praise when good.

PHASE 3 — SWITCH ROLES
- Say you are switching. Now you are ${scene.roleBTutor}; the learner is ${scene.roleBUser}.
- Stay in the new roles for 5–7 short turns. Cover any checklist items not practiced yet.

PHASE 4 — CHECK + CLOSE (teacher again, not in character)
- Use the learner's name. Recap 4–6 phrases they can use in real life (with variants).
- Ask 2 short comprehension questions about the scenario.
- Ask: "Is there anything you didn't understand?"
- If fine, encourage them warmly and invite them to finish the session.

${resumeRule}`;
}

function rolePlaySystemPrompt(sessionTitle, { user, tutor, customPayload, resuming = false } = {}) {
  const scene = customPayload
    ? sceneFromPayload(customPayload, customPayload.title)
    : sceneFor(sessionTitle);
  return buildRolePlayPrompt(scene, { user, tutor, resuming });
}

function parseCustomScenarioId(title) {
  const match = String(title || '').match(/#custom:([a-f0-9-]{36})/i);
  return match ? match[1] : null;
}

module.exports = {
  rolePlaySystemPrompt,
  sceneFor,
  sceneFromPayload,
  buildRolePlayPrompt,
  parseCustomScenarioId,
};
