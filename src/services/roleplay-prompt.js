'use strict';

const {
  characterBlurb,
  characterLockRule,
  flavorRule,
  naturalEnglishRule,
} = require('./tutor-personality');
const { learnerAddressingRule } = require('./prompt_helpers');

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
];

function sceneFor(title) {
  const raw = String(title || '');
  const scenario = raw.replace(/^Role Play:\s*/i, '').trim();
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

function displayTutorName(tutor) {
  const raw = String(tutor?.nameKey || tutor?.slug || 'Lingola');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function rolePlaySystemPrompt(sessionTitle, { user, tutor } = {}) {
  const scene = sceneFor(sessionTitle);
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

  return `You are ${tutorName}, a friendly English tutor running a ROLE-PLAY lesson.
${character}
${naturalEnglishRule('A2')}
${learnerAddressingRule(user || {})}
Scenario: "${scene.title}".

CRITICAL LANGUAGE RULE:
- Speak ONLY English in every message (briefing, role-play, feedback).
- Never reply in Turkish or any other language. The app UI translates for the learner separately.

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

Never jump straight into "Welcome, what can I get you?" at the start. Brief and teach first.`;
}

module.exports = { rolePlaySystemPrompt, sceneFor };
