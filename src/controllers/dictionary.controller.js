'use strict';

const {
  listDictionaryWords,
  searchDictionaryWords,
} = require('../services/word_bank.service');

async function listWords(req, res, next) {
  try {
    const payload = await listDictionaryWords(req.user, {
      limit: req.query.limit || req.query.count || 20,
      offset: req.query.offset || 0,
      query: req.query.q || req.query.query || '',
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function searchWords(req, res, next) {
  try {
    const payload = await searchDictionaryWords(req.user, {
      limit: req.query.limit || req.query.count || 20,
      offset: req.query.offset || 0,
      query: req.query.q || req.query.query || '',
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

module.exports = { listWords, searchWords };
