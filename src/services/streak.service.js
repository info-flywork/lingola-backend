'use strict';

const { pool } = require('../config/db');

const WEEK_LABELS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function utcTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateValue(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const text = String(val);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function addUtcDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function mondayOfUtcWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function fetchActiveDates(userId) {
  const [rows] = await pool.query(
    `
    SELECT DISTINCT activity_date
    FROM (
      SELECT activity_date
      FROM user_daily_activity
      WHERE user_id = ?
      UNION
      SELECT DATE(completed_at) AS activity_date
      FROM user_lesson_progress
      WHERE user_id = ? AND completed_at IS NOT NULL
      UNION
      SELECT DATE(m.created_at) AS activity_date
      FROM tutor_chat_messages m
      INNER JOIN tutor_chat_sessions s ON s.id = m.session_id
      WHERE s.user_id = ? AND m.role = 'user'
      UNION
      SELECT DATE(last_seen_at) AS activity_date
      FROM user_word_encounters
      WHERE user_id = ?
    ) merged
    WHERE activity_date IS NOT NULL
    `,
    [userId, userId, userId, userId],
  );

  const set = new Set();
  for (const row of rows) {
    const day = formatDateValue(row.activity_date);
    if (day) set.add(day);
  }
  return set;
}

function streakEndingOn(activeDates, endDate) {
  let streak = 0;
  let cursor = endDate;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = addUtcDays(cursor, -1);
  }
  return streak;
}

function computeCurrentStreak(activeDates, today) {
  const includingToday = streakEndingOn(activeDates, today);
  const beforeToday = streakEndingOn(activeDates, addUtcDays(today, -1));

  // Streak sayacı: en az 3 ardışık gün tamamlandıktan sonra devreye girer.
  if (activeDates.has(today)) {
    return includingToday >= 3 ? includingToday : 0;
  }
  return beforeToday >= 3 ? beforeToday : 0;
}

function computeLongestStreak(activeDates) {
  if (!activeDates.size) return 0;

  const sorted = [...activeDates].sort();
  let longest = 1;
  let run = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (addUtcDays(prev, 1) === cur) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  return longest;
}

function buildWeekDays(activeDates, today) {
  const weekStart = mondayOfUtcWeek(today);
  const streakBeforeToday = streakEndingOn(activeDates, addUtcDays(today, -1));
  const days = [];

  for (let i = 0; i < 7; i += 1) {
    const date = addUtcDays(weekStart, i);
    const worked = activeDates.has(date);
    let state;

    if (date > today) {
      state = 'idle';
    } else if (worked) {
      // Çalışılan her gün tik.
      state = 'done';
    } else if (date === today && streakBeforeToday >= 3) {
      // 3 ardışık gün tamamlandıysa 4. gün alev.
      state = 'today';
    } else {
      state = 'idle';
    }

    days.push({
      date,
      label: WEEK_LABELS[i],
      state,
      worked,
    });
  }

  return days;
}

async function recordActivity(userId, source) {
  if (!userId || !source) return;
  const today = utcTodayStr();
  await pool.query(
    `INSERT INTO user_daily_activity
       (user_id, activity_date, source, event_count, first_at, last_at)
     VALUES (?, ?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       event_count = event_count + 1,
       last_at = UTC_TIMESTAMP(3)`,
    [userId, today, source],
  );
}

async function getStreakForUser(userId) {
  const today = utcTodayStr();
  const activeDates = await fetchActiveDates(userId);
  const currentStreak = computeCurrentStreak(activeDates, today);
  const longestStreak = computeLongestStreak(activeDates);
  const days = buildWeekDays(activeDates, today);

  return {
    currentStreak,
    longestStreak,
    todayWorked: activeDates.has(today),
    weekStart: mondayOfUtcWeek(today),
    days,
  };
}

module.exports = {
  recordActivity,
  getStreakForUser,
};
