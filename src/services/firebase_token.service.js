'use strict';

const { createRemoteJWKSet, jwtVerify, decodeJwt } = require('jose');
const { env } = require('../config/env');

const FIREBASE_PROJECT_ID = env.firebase.projectId;
const firebaseJwks = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);
const appleJwks = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);
const googleJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

function asAudienceList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/**
 * Verify Firebase ID token (from FirebaseAuth.currentUser.getIdToken()).
 */
async function verifyFirebaseIdToken(idToken) {
  const { payload } = await jwtVerify(idToken, firebaseJwks, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });

  if (!payload.sub) {
    const err = new Error('Invalid Firebase token: missing sub');
    err.status = 401;
    throw err;
  }

  const firebase = payload.firebase || {};
  const identities = firebase.identities || {};
  let provider = 'google';
  if (Array.isArray(identities['apple.com']) || firebase.sign_in_provider === 'apple.com') {
    provider = 'apple';
  } else if (
    Array.isArray(identities['google.com']) ||
    firebase.sign_in_provider === 'google.com'
  ) {
    provider = 'google';
  }

  return {
    provider,
    subject: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : null,
    displayName: typeof payload.name === 'string' ? payload.name : null,
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : null,
    emailVerified: Boolean(payload.email_verified),
  };
}

/**
 * Verify native Google ID token (google_sign_in → backend).
 */
async function verifyGoogleIdToken(idToken) {
  const audiences = env.firebase.googleClientIds;
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: audiences.length ? audiences : undefined,
  });

  if (!payload.sub) {
    const err = new Error('Invalid Google token: missing sub');
    err.status = 401;
    throw err;
  }

  if (audiences.length) {
    const aud = asAudienceList(payload.aud);
    const ok = aud.some((a) => audiences.includes(a));
    if (!ok) {
      const err = new Error('Invalid Google token audience');
      err.status = 401;
      throw err;
    }
  }

  return {
    provider: 'google',
    subject: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : null,
    displayName: typeof payload.name === 'string' ? payload.name : null,
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : null,
    emailVerified: Boolean(payload.email_verified),
  };
}

/**
 * Verify native Apple identity token (Sign in with Apple → backend).
 */
async function verifyAppleIdentityToken(idToken) {
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
  });

  if (!payload.sub) {
    const err = new Error('Invalid Apple token: missing sub');
    err.status = 401;
    throw err;
  }

  // Optional audience check when APPLE_CLIENT_ID is set (bundle id / Services ID).
  if (env.firebase.appleClientId) {
    const aud = asAudienceList(payload.aud);
    if (!aud.includes(env.firebase.appleClientId)) {
      const err = new Error('Invalid Apple token audience');
      err.status = 401;
      throw err;
    }
  }

  return {
    provider: 'apple',
    subject: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : null,
    displayName: null,
    avatarUrl: null,
    emailVerified: true,
  };
}

/**
 * Resolve provider identity from Firebase / Google / Apple tokens.
 */
async function resolveIdentity(idToken, expectedProvider) {
  let lastError;

  try {
    const identity = await verifyFirebaseIdToken(idToken);
    if (identity.provider === expectedProvider) return identity;
    lastError = new Error(
      `Firebase token provider mismatch: ${identity.provider}`,
    );
  } catch (err) {
    lastError = err;
  }

  if (expectedProvider === 'google') {
    try {
      return await verifyGoogleIdToken(idToken);
    } catch (err) {
      lastError = err;
    }
  }

  if (expectedProvider === 'apple') {
    try {
      return await verifyAppleIdentityToken(idToken);
    } catch (err) {
      lastError = err;
    }
  }

  // Helpful debug: which issuer did we get?
  try {
    const preview = decodeJwt(idToken);
    const err = new Error(
      lastError?.message ||
        `Invalid ${expectedProvider} token (iss=${preview.iss || 'unknown'})`,
    );
    err.status = 401;
    throw err;
  } catch (err) {
    if (err.status) throw err;
    const wrapped = new Error(lastError?.message || 'Invalid idToken');
    wrapped.status = 401;
    throw wrapped;
  }
}

module.exports = {
  verifyFirebaseIdToken,
  verifyGoogleIdToken,
  verifyAppleIdentityToken,
  resolveIdentity,
};
