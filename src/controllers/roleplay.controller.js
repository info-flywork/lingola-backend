'use strict';

const roleplay = require('../services/roleplay.service');

async function listScenarios(req, res, next) {
  try {
    const scenarios = await roleplay.listScenariosForUser(req.user.id);
    res.json({ ok: true, scenarios });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listScenarios,
};
