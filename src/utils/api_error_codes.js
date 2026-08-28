'use strict';

/** Stable codes returned in API JSON — localized on the client. */
const API_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NAME_REQUIRED: 'NAME_REQUIRED',
  IMAGE_REQUIRED: 'IMAGE_REQUIRED',
  AVATAR_INVALID_TYPE: 'AVATAR_INVALID_TYPE',
  AVATAR_EMPTY: 'AVATAR_EMPTY',
  AVATAR_TOO_LARGE: 'AVATAR_TOO_LARGE',
  NOTIFICATIONS_REQUIRED: 'NOTIFICATIONS_REQUIRED',
  PREMIUM_REQUIRED: 'PREMIUM_REQUIRED',
  LEVEL_REQUIRED: 'LEVEL_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

function apiError(message, { status = 400, code = API_ERROR_CODES.VALIDATION_FAILED } = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

module.exports = { API_ERROR_CODES, apiError };
