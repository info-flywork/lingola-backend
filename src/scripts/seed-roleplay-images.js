'use strict';

/**
 * Her statik role-play senaryosu (zorluk varyantları dahil) için
 * benzersiz illüstrasyon üret → Bunny CDN → roleplay_scenario_images.
 *
 * Usage:
 *   node src/scripts/seed-roleplay-images.js
 *   node src/scripts/seed-roleplay-images.js --force
 *   node src/scripts/seed-roleplay-images.js --only=interview-easy,coffee-hard
 */
require('dotenv').config();

const { pool } = require('../config/db');
const { uploadBuffer } = require('../services/bunny.service');
const { listScenarios } = require('../data/roleplay-catalog');

const STYLE = [
  'Bright colorful modern 2D vector illustration for a language-learning app card.',
  'Friendly soft shading, clean edges, warm inviting palette (peach, cream, blues, greens).',
  'Over-the-shoulder view: learner in foreground with back partly to camera,',
  'facing a smiling conversation partner across a desk/counter.',
  'Square 1:1 crop, vivid setting details unique to this exact scene.',
  'No text, no letters, no logos, no watermarks, no UI chrome, no photorealism.',
].join(' ');

/** scenarioId → unique visual scene (topic-specific). */
const SCENE_BY_ID = {
  coffee:
    'Ordering coffee at a bright café counter: barista in apron, espresso machine, pastry case, coffee cups.',
  'coffee-easy':
    'Waiting in a long busy café queue: people ahead, menu board, takeaway cups, polite small talk vibe.',
  'coffee-medium':
    'Barista recommending specialty drinks: tasting spoons, latte art samples, milk options on counter.',
  'coffee-hard':
    'Customer receiving the wrong coffee order: two different cups on counter, confused but friendly exchange.',

  shoppingClothes:
    'Clothes shopping in a bright boutique: racks of colorful outfits, fitting-room curtains, shopping bags.',
  'shoppingClothes-easy':
    'Trying clothes in a fitting room area: mirror, curtain, pile of garments, attendant helping nearby.',
  'shoppingClothes-medium':
    'Returning an item at a clothing store counter: receipt, folded shirt, returns desk, polite clerk.',
  'shoppingClothes-hard':
    'Asking for a discount at checkout: price tags, sale signs (no readable text), negotiation at register.',

  flirtingMeet:
    'Meeting someone new at a cozy café table: two drinks, warm lighting, friendly first conversation.',
  'flirtingMeet-easy':
    'Giving a compliment near a bookstore café: bookshelves, soft smiles, casual stylish outfits.',
  'flirtingMeet-medium':
    'Asking someone out at a park café terrace: outdoor tables, trees, nervous-but-hopeful mood.',
  'flirtingMeet-hard':
    'Awkward but polite recovery after a clumsy flirt: spilled drink, napkins, embarrassed laughs.',

  directions:
    'Asking for directions on a sunny city sidewalk: map phone, street signs, helpful local pointing.',
  'directions-easy':
    'Feeling lost at a busy intersection: looking around, tourist backpack, local pointing the way.',
  'directions-medium':
    'Asking about public transit: subway entrance, metro map board (no readable text), ticket machines.',
  'directions-hard':
    'Realizing you went the wrong way: backtracking on a street, confused look, local correcting kindly.',

  takingTaxi:
    'Getting into a yellow taxi at a city curb: open door, driver, skyline, suitcase beside curb.',
  'takingTaxi-easy':
    'Discussing taxi fare with driver: meter area, city traffic through windows, cash/card payment vibe.',
  'takingTaxi-medium':
    'Stuck in heavy traffic in a taxi: congested cars, impatient but polite chat with driver.',
  'takingTaxi-hard':
    'Politely complaining about a taxi route: wrong turn vibes, GPS phone, calm assertive passenger.',

  missedTrain:
    'Just missing a departing train on a station platform: closing doors, timetable board, luggage.',
  'missedTrain-easy':
    'Asking staff about the next train: station desk, departure board, traveler with backpack.',
  'missedTrain-medium':
    'Sorting a missed-train ticket issue at a counter: tickets, agent window, busy station hall.',
  'missedTrain-hard':
    'Requesting a refund after missing a train: ticket office window, paperwork, frustrated-but-polite traveler.',

  freeTalkHobby:
    'Casual chat about hobbies in a bright living room: craft supplies, plant, two friends on sofa.',
  'freeTalkHobby-easy':
    'Talking weekend plans over brunch: calendar phone, outdoor café patio, weekend energy.',
  'freeTalkHobby-medium':
    'Discussing movies on a couch: TV screen glow, popcorn bowl, film posters (no readable text).',
  'freeTalkHobby-hard':
    'Politely disagreeing about hobbies: board game vs sports gear on table, friendly debate gestures.',

  interview:
    'Classic job interview in a modern office: HR across desk, resume papers, city window view.',
  'interview-easy':
    'Explaining personal strengths in an interview: confident gestures, notepad, professional desk setup.',
  'interview-medium':
    'Describing work experience with a portfolio: laptop open, project printouts, interviewer listening.',
  'interview-hard':
    'Discussing salary expectations: offer letter envelope, calculator notepad, serious but friendly tone.',

  doctorAppointment:
    'Doctor appointment in a bright clinic room: white coat, stethoscope, exam table, calm mood.',
  'doctorAppointment-easy':
    'Describing symptoms to a doctor: throat/chest gesture, tissue box, medical chart clipboard.',
  'doctorAppointment-medium':
    'Getting a prescription: pharmacy counter nearby, medicine bottle silhouette, doctor explaining.',
  'doctorAppointment-hard':
    'Follow-up visit discussing recovery: bandage/check-up notes, reassuring doctor, patient relieved.',

  birthdayParty:
    'Birthday party toast: cake with candles, balloons, gifts, friends celebrating indoors.',
  'birthdayParty-easy':
    'Inviting someone to a birthday party: invitation card (no text), phone, party decorations nearby.',
  'birthdayParty-medium':
    'Talking about birthday gifts: wrapped presents, gift bags, curious smiles around a table.',
  'birthdayParty-hard':
    'Planning a surprise birthday party: hiding gifts, whispering guests, balloons being prepared.',

  rentingApartment:
    'Meeting a landlord about renting an apartment: keys, lease papers, bright empty living room.',
  'rentingApartment-easy':
    'Touring an empty apartment: open rooms, large windows, realtor showing kitchen and living space.',
  'rentingApartment-medium':
    'Talking with a real-estate agent in lobby: building brochure folder, lobby plants, professional attire.',
  'rentingApartment-hard':
    'Negotiating rent/deposit at a table: lease document, calculator, keys, serious friendly bargaining.',

  restaurantReservation:
    'Making a restaurant reservation at a host stand: menus, waiting area, elegant dining room behind.',
  'restaurantReservation-easy':
    'Changing a reservation time: host checking tablet, calendar, polite customer at entrance.',
  'restaurantReservation-medium':
    'Discussing food allergies with waiter: menu, allergen icons (no text), careful conversation.',
  'restaurantReservation-hard':
    'Politely complaining about a restaurant issue: unfinished plate, manager listening calmly.',

  flightAttendant:
    'Talking to a flight attendant on a plane: airplane seats, overhead bins, friendly crew uniform.',
  'flightAttendant-easy':
    'Requesting a seat change on a plane: aisle seats, boarding pass silhouette, attendant helping.',
  'flightAttendant-medium':
    'Asking for a special meal onboard: tray table, meal cart, attendant with friendly explanation.',
  'flightAttendant-hard':
    'Discussing a flight delay at the gate: departure screens (no readable text), weary travelers, crew.',

  trainTicket:
    'Buying a train ticket at a station window: ticket counter, suitcase, departure hall.',
  'trainTicket-easy':
    'Changing a train ticket: agent window, tickets swapped, traveler with backpack.',
  'trainTicket-medium':
    'Asking which platform to use: platform signs (no readable text), clocks, rushing travelers.',
  'trainTicket-hard':
    'Upgrading a train ticket to first class: premium seat area, ticket upgrade, polite negotiation.',
};

function requireOpenAi() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY');
  return key;
}

async function requestImageGeneration(apiKey, body) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI image failed (${res.status}): ${raw.slice(0, 400)}`);
  }
  return JSON.parse(raw);
}

async function bufferFromImageResponse(data) {
  const item = data?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error('OpenAI image download failed');
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error('OpenAI image payload missing');
}

async function generateImageBuffer(prompt) {
  const apiKey = requireOpenAi();
  try {
    const data = await requestImageGeneration(apiKey, {
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
    });
    return bufferFromImageResponse(data);
  } catch (firstErr) {
    console.warn(`[seed-roleplay-images] gpt-image-1 failed, dall-e-3: ${firstErr.message}`);
    const data = await requestImageGeneration(apiKey, {
      model: 'dall-e-3',
      prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    });
    return bufferFromImageResponse(data);
  }
}

function buildPrompt(scenario) {
  const scene =
    SCENE_BY_ID[scenario.id] ||
    `Unique scene for role-play "${scenario.titleKey}" (${scenario.id}), clearly different setting and props.`;
  return `${STYLE} Unique scene: ${scene}`.slice(0, 3500);
}

function parseArgs(argv) {
  const force = argv.includes('--force');
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const only = onlyArg
    ? onlyArg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  return { force, only };
}

async function fetchExistingMap() {
  const [rows] = await pool.query(
    'SELECT scenario_id, image_url FROM roleplay_scenario_images',
  );
  const map = {};
  for (const row of rows) map[row.scenario_id] = row.image_url;
  return map;
}

async function upsertImage(scenarioId, titleKey, imageUrl) {
  await pool.query(
    `INSERT INTO roleplay_scenario_images (scenario_id, title_key, image_url)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title_key = VALUES(title_key),
       image_url = VALUES(image_url),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [scenarioId, titleKey, imageUrl],
  );
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { force, only } = parseArgs(process.argv.slice(2));
  let scenarios = listScenarios();
  if (only?.length) {
    const set = new Set(only);
    scenarios = scenarios.filter((s) => set.has(s.id));
  }

  console.log(
    `[seed-roleplay-images] ${scenarios.length} scenarios (force=${force})`,
  );

  const existing = await fetchExistingMap();
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const label = `[${i + 1}/${scenarios.length}] ${scenario.id}`;

    if (!force && existing[scenario.id]) {
      console.log(`${label} skip (already in DB)`);
      skipped++;
      continue;
    }

    const prompt = buildPrompt(scenario);
    console.log(`${label} generating...`);

    try {
      const buffer = await generateImageBuffer(prompt);
      const dest = `roleplay/static/${scenario.id}.png`;
      const url = await uploadBuffer(dest, buffer, 'image/png');
      await upsertImage(scenario.id, scenario.titleKey, url);
      console.log(`${label} ✓ ${url} (${buffer.length} bytes)`);
      ok++;
      await sleep(800);
    } catch (err) {
      failed++;
      console.error(`${label} ✗ ${err.message}`);
      await sleep(1500);
    }
  }

  console.log(
    `[seed-roleplay-images] done ok=${ok} skipped=${skipped} failed=${failed}`,
  );
  await pool.end();
  if (failed) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('[seed-roleplay-images] fatal:', err);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
