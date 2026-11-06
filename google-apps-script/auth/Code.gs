/**
 * ScriptFlow employee authentication broker.
 *
 * Deploy this project as a domain-restricted Web App:
 *   Execute as: Me
 *   Who has access: Anyone within bilendi.com
 *
 * Script Properties required:
 *   AUTH_TOKEN_SECRET       - random secret, minimum 32 characters
 *   VERCEL_CALLBACK_URL     - exact Vercel callback URL, including /auth/callback
 *
 * Do not deploy this authentication project as a public Web App.
 */

var AUTH_CONFIG = {
  COMPANY_DOMAIN: 'bilendi.com',
  USER_ROLES: {
    'a.nesta@bilendi.com': 'team_lead',
    'g.sardoo@bilendi.com': 'scripter',
    'n.latreille@bilendi.com': 'scripter'
  },
  TOKEN_LIFETIME_SECONDS: 120
};

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.loginError = '';
  return template.evaluate()
    .setTitle('ScriptFlow secure sign-in')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getAuthenticatedEmployee_() {
  var email = String(Session.getActiveUser().getEmail() || '')
    .toLowerCase().trim();

  if (!email || email.indexOf('@') < 1) {
    throw new Error('Google Workspace could not identify your account. Sign in with your Bilendi account.');
  }

  var domain = email.split('@')[1];
  if (domain !== AUTH_CONFIG.COMPANY_DOMAIN) {
    throw new Error('Access denied. A Bilendi account is required.');
  }

  var role = AUTH_CONFIG.USER_ROLES[email];
  if (!role) {
    throw new Error('Your account is not registered in ScriptFlow. Contact your team lead.');
  }

  return {
    email: email,
    role: role,
    effectiveEmail: String(Session.getEffectiveUser().getEmail() || '').toLowerCase().trim()
  };
}

/**
 * Called only from this domain-restricted Apps Script HTML page using
 * google.script.run. The callback URL is pinned in Script Properties;
 * callers cannot choose an arbitrary redirect destination.
 */
function issueAuthToken(state) {
  var employee = getAuthenticatedEmployee_();
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty('AUTH_TOKEN_SECRET');
  var callbackUrl = properties.getProperty('VERCEL_CALLBACK_URL');

  if (!secret || secret.length < 32) {
    throw new Error('AUTH_TOKEN_SECRET is not configured correctly.');
  }
  if (!callbackUrl || !/^https:\/\//i.test(callbackUrl)) {
    throw new Error('VERCEL_CALLBACK_URL is not configured.');
  }
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,160}$/.test(state)) {
    throw new Error('Invalid sign-in state. Return to ScriptFlow and try again.');
  }

  var now = Math.floor(Date.now() / 1000);
  var payload = {
    iss: 'scriptflow-bilendi-auth',
    aud: 'scriptflow-vercel',
    sub: employee.email,
    role: employee.role,
    iat: now,
    exp: now + AUTH_CONFIG.TOKEN_LIFETIME_SECONDS,
    jti: Utilities.getUuid(),
    state: state
  };

  var encodedPayload = base64UrlEncode_(JSON.stringify(payload));
  var signature = Utilities.computeHmacSha256Signature(
    encodedPayload,
    secret,
    Utilities.Charset.UTF_8
  );
  var encodedSignature = base64UrlEncodeBytes_(signature);

  return {
    token: encodedPayload + '.' + encodedSignature,
    callbackUrl: callbackUrl,
    expiresIn: AUTH_CONFIG.TOKEN_LIFETIME_SECONDS
  };
}

function getSignInIdentity() {
  var employee = getAuthenticatedEmployee_();
  return {
    success: true,
    email: employee.email,
    role: employee.role
  };
}

function base64UrlEncode_(text) {
  return Utilities.base64EncodeWebSafe(
    Utilities.newBlob(text).getBytes()
  ).replace(/=+$/g, '');
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}
