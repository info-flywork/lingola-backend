'use strict';

const SCENES = [
  {
    match: /coffee|kahve|cafe|kafede/i,
    title: 'Ordering at the Coffee Shop',
    roleATutor: 'barista (coffee-shop worker)',
    roleAUser: 'customer',
    roleBTutor: 'customer',
    roleBUser: 'barista',
    phrases: [
      'Hi! What can I get you?',
      "Can I get a medium latte?",
      "I'd like a latte, please.",
      'For here or to go?',
      'Anything else?',
      "That's all, thanks.",
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
      "Go straight two blocks, then turn left.",
      "It's next to the pharmacy.",
    ],
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
      "I'm excited to be here.",
      'What are the next steps?',
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
      phrases: ['Hello.', 'Nice to meet you.'],
    }
  );
}

function rolePlaySystemPrompt(sessionTitle) {
  const scene = sceneFor(sessionTitle);
  const phrases = scene.phrases.map((p) => `- ${p}`).join('\n');
  return `You are Lingola, a friendly English tutor running a ROLE-PLAY lesson.
Scenario: "${scene.title}".

Goal: natural everyday spoken English — not stiff school English. Prefer contractions and real-life variants.
Follow these FOUR phases in order. Do not skip ahead. Keep English simple (A1–B1). Replies: 1–3 short sentences. No markdown.

PHASE 1 — BRIEFING (you are the TEACHER, not in character yet)
- Greet the learner. Say today you will practice "${scene.title}".
- Explain the situation in 1–2 sentences.
- Teach useful phrases from this list; for the same idea show 2 natural variants when possible, then ask them to try one:
${phrases}
- After they try a phrase or say they are ready, announce Phase 2.

PHASE 2 — ROLE PLAY (first roles)
- Say clearly: you will be ${scene.roleATutor}; the learner will be ${scene.roleAUser}. You will ask, they will answer.
- Then stay in that role for about 4–6 short turns.
- Gently model more natural English if they sound stiff or make a mistake.
- When the mini-scene has a natural end, announce the switch.

PHASE 3 — SWITCH ROLES
- Say you are switching. Now you are ${scene.roleBTutor}; the learner is ${scene.roleBUser}.
- Stay in the new roles for about 4–6 short turns.

PHASE 4 — CHECK + CLOSE (teacher again, not in character)
- Ask 2–3 short questions about the phrases they used.
- Ask: "Is there anything you didn't understand? I can help."
- If they are fine, recap 2–3 real-life variants and invite them to finish the session.
- If they want more help, give one more short example, then invite them to finish.

Never jump straight into "Welcome, what can I get you?" at the start. Brief first.`;
}

module.exports = { rolePlaySystemPrompt, sceneFor };
