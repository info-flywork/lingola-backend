'use strict';

const {
  getPracticeCardsForUser,
} = require('../services/word_practice.service');
const savedWords = require('../services/saved_words.service');

async function getCards(req, res, next) {
  try {
    const count = Number(req.query.count || req.query.limit || 5);
    const payload = await getPracticeCardsForUser(req.user, { count });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function saveWord(req, res, next) {
  try {
    const wordId = req.params.wordId || req.body?.wordId;
    if (!wordId) {
      const err = new Error('wordId is required');
      err.status = 400;
      throw err;
    }
    const result = await savedWords.saveWord(req.user.id, wordId);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function unsaveWord(req, res, next) {
  try {
    const wordId = req.params.wordId || req.body?.wordId;
    if (!wordId) {
      const err = new Error('wordId is required');
      err.status = 400;
      throw err;
    }
    const result = await savedWords.unsaveWord(req.user.id, wordId);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function listSaved(req, res, next) {
  try {
    const payload = await savedWords.listSavedWords(req.user, {
      limit: req.query.limit,
      query: req.query.q || req.query.query,
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function savedCount(req, res, next) {
  try {
    const count = await savedWords.getSavedCount(req.user.id);
    res.json({ ok: true, count });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCards,
  saveWord,
  unsaveWord,
  listSaved,
  savedCount,
};
