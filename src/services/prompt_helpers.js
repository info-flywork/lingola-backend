'use strict';

const {
  normalizeLangCode,
  languageDisplayName,
} = require('../utils/locale');

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

function resolveExplanationLanguage(user, session) {
  const raw =
    user?.onboarding?.explanationLanguage ??
    session?.explanationLanguage ??
    'native';
  return String(raw).trim().toLowerCase() === 'english' ? 'english' : 'native';
}

function explanationLanguageRule(user, session) {
  const nativeCode = normalizeLangCode(
    user?.onboarding?.nativeLanguageCode ?? session?.nativeLanguageCode,
    'tr',
  );
  const nativeName = languageDisplayName(nativeCode, nativeCode);
  const mode = resolveExplanationLanguage(user, session);

  const sttIntentRule = `- Speech-to-text may garble short English attempts (e.g. "hay" for "Hi", "high" for "Hi"). Infer the learner's intended English phrase charitably — never mock or echo offensive mis-transcriptions.
- When teaching greetings, always show correct spelling: Hi, Hello, Hey — never Hay or homophone misspellings.`;

  if (mode === 'english') {
    return `- The learner prefers explanations in English only.
- Even if they write in ${nativeName}, explain in simple clear English (A1–A2).
- Do not switch to ${nativeName} for explanations or answers.
${sttIntentRule}`;
  }

  return `- The learner prefers explanations in their native language (${nativeName}) when they ask in ${nativeName}.
- If they write in ${nativeName}, reply in ${nativeName} to explain, encourage, or answer — then gently invite them back to English practice in the same reply.
- For English practice parts, keep using simple spoken English.
${sttIntentRule}`;
}

/** Whisper prompt — İngilizce selamlaşma + anadil karışık konuşmayı doğru yazmaya yardım eder. */
function englishLearnerWhisperPrompt(nativeCode = 'tr') {
  const nativeName = languageDisplayName(nativeCode, nativeCode);
  return (
    'English language learning lesson. Common phrases: Hi, Hello, Hey, Good morning. ' +
    'I am good. How are you? Nice to meet you. ' +
    `Learner may also speak ${nativeName} for questions.`
  );
}

/** Kısa İngilizce selamlaşmalarda yaygın STT hatalarını düzelt. */
function normalizeLearnerSpeechTranscript(text) {
  let t = String(text || '').trim();
  if (!t) return t;

  const words = t.split(/\s+/);
  if (words.length === 1) {
    const solo = t.replace(/[!.?,…]+$/g, '');
    const lower = solo.toLowerCase();
    const punct = t.slice(solo.length);
    if (lower === 'hay' || lower === 'high' || lower === 'helo') {
      return `Hi${punct || ''}`;
    }
    if (lower === 'hallo') return `Hello${punct || ''}`;
  }

  if (words.length <= 5) {
    t = t.replace(/\bhay\b/gi, (m) => (m[0] === m[0].toUpperCase() ? 'Hi' : 'hi'));
    t = t.replace(/\bhigh\b/gi, (m) => (m[0] === m[0].toUpperCase() ? 'Hi' : 'hi'));
    t = t.replace(/\bhelo\b/gi, (m) =>
      m[0] === m[0].toUpperCase() ? 'Hello' : 'hello',
    );
    // Whisper bazen İngilizce "I am good"u fonetik bozar.
    t = t.replace(/\b(?:i\s+)?am\s+g[oö]t\b/gi, 'I am good');
    t = t.replace(/\b(?:i\s+)?am\s+gud\b/gi, 'I am good');
    t = t.replace(/\bim\s+g[oö]od\b/gi, "I'm good");
  }

  return t.trim();
}

module.exports = {
  learnerFirstName,
  learnerAddressingRule,
  goalContext,
  topicTeachingHints,
  lessonPedagogyRules,
  resolveExplanationLanguage,
  explanationLanguageRule,
  englishLearnerWhisperPrompt,
  normalizeLearnerSpeechTranscript,
};
