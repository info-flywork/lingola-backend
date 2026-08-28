'use strict';

const GOAL_HINTS = {
  career:
    'Learner goal: career English — use workplace examples, meetings, interviews, emails-in-speech when relevant.',
  travel:
    'Learner goal: travel — use airports, hotels, directions, ordering food when relevant.',
  livingAbroad:
    'Learner goal: living abroad — daily life, housing, services, small talk with neighbors.',
  studyingAbroad:
    'Learner goal: studying abroad — campus, classmates, teachers, schedules.',
  other: '',
};

function learnerFirstName(user) {
  const raw = String(user?.displayName || '').trim();
  if (!raw || raw.toLowerCase() === 'guest') return '';
  const first = raw.split(/\s+/)[0]?.trim();
  return first || '';
}

function learnerAddressingRule(user) {
  const name = learnerFirstName(user);
  if (!name) {
    return `Address the learner warmly. Do not use a name you do not know.`;
  }
  return `The learner's first name is "${name}".
- Use their name naturally 1–2 times per phase (not every sentence).
- In feedback and recap, say "${name}" at least once (e.g. "Nice work, ${name}").`;
}

function goalContext(user) {
  const goal = user?.onboarding?.goal;
  const hint = GOAL_HINTS[goal] || '';
  return hint ? `\n${hint}` : '';
}

function topicTeachingHints(topic) {
  const t = String(topic || '').toLowerCase();

  if (/coffee|cafe|café|latte|espresso|barista/.test(t)) {
    return `
TOPIC DEPTH (coffee shop):
Teach and practice: sizes (small/medium/large), milk options (whole, skim, oat, almond, soy),
lactose-free, decaf, sugar (no sugar / less sugar / sweetener), extra shot, for here vs to go,
name on cup, price/total, allergies, "anything else?", payment.`;
  }

  if (
    /job|work|career|profession|occupation|workplace|office|shift|colleague|employee|boss|interview|resume|cv/.test(
      t,
    )
  ) {
    return `
TOPIC DEPTH (jobs & work — mandatory):
- Do NOT only ask "What do you do?" Rotate through different question types:
  role & industry, daily routine, hours/shifts, coworkers, likes/dislikes, skills, stress, goals.
- Teach 2–3 natural variants per question BEFORE the learner answers.
- Model short answers for at least 3 different jobs (e.g. nurse, software engineer, teacher, driver, barista).
- Avoid asking the same question twice. Build a mini conversation, not a loop.`;
  }

  if (/food|restaurant|order|menu|dining|eat|drink|breakfast|lunch|dinner/.test(t)) {
    return `
TOPIC DEPTH (food & ordering):
Cover: ordering politely, dietary needs (vegetarian, gluten-free, allergies, lactose-free),
spice level, sides, drinks, bill/check, takeaway, reservations when relevant.`;
  }

  if (/health|doctor|hospital|pharmacy|symptom|medicine/.test(t)) {
    return `
TOPIC DEPTH (health):
Cover: describing symptoms, duration, pain level, allergies, medications, appointments.`;
  }

  if (/travel|airport|hotel|flight|train|direction/.test(t)) {
    return `
TOPIC DEPTH (travel):
Cover: tickets, gates, delays, luggage, check-in, directions, polite requests.`;
  }

  return `
TOPIC DEPTH:
Teach at least 6–8 useful phrase patterns for this topic (with 2–3 variants each) before free conversation.
Do not repeat one question; widen the scenario step by step.`;
}

function lessonPedagogyRules() {
  return `
TEACHING PACE (15-minute segment):
- Phase A (first ~5 min): teach phrase patterns in small batches (2–3 phrases, then practice).
- Phase B (middle): role-play or Q&A using those phrases; add 1 new pattern each turn.
- Phase C (end): recap 4–6 best phrases + one encouragement using the learner's name if known.
- If the learner makes a mistake: model the natural phrase, explain in one short line, ask them to retry once.
- Feedback must be specific ("Good — 'I'd like a latte' is natural; you can also say 'Can I get a latte?'").`;
}

module.exports = {
  learnerFirstName,
  learnerAddressingRule,
  goalContext,
  topicTeachingHints,
  lessonPedagogyRules,
};
