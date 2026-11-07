/**
 * ScriptFlow Google Workspace authentication broker.
 *
 * Deploy as a Bilendi-domain-restricted Web App:
 *   Execute as: Me
 *   Who has access: Anyone within bilendi.com
 *
 * Script Properties:
 *   SCRIPT_FLOW_DATABASE_ID - created by setupScriptFlowDatabase()
 *   AUTH_TOKEN_SECRET       - shared with the separate ScriptFlow API project
 *   VERCEL_CALLBACK_URL     - https://scriptflow-bice.vercel.app/
 */

var AUTH_CONFIG = {
  COMPANY_DOMAIN: 'bilendi.com',
  INITIAL_ADMIN: 'a.nesta@bilendi.com',
  DEFAULT_ROLE: 'scripter',
  TOKEN_LIFETIME_SECONDS: 120
};

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.loginError = '';
  return template.evaluate()
    .setTitle('ScriptFlow secure sign-in')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Trusts only the Workspace identity supplied by Apps Script.
 * New @bilendi.com employees are registered on first sign-in.
 */
function getAuthenticatedEmployee_() {
  var email = String(Session.getActiveUser().getEmail() || '')
    .toLowerCase().trim();

  if (!email || email.indexOf('@') < 1) {
    throw new Error('Google Workspace could not identify your account. Sign in with your Bilendi account.');
  }

  if (email.split('@')[1] !== AUTH_CONFIG.COMPANY_DOMAIN) {
    throw new Error('Access denied. A Bilendi Google Workspace account is required.');
  }

  var spreadsheet = getAuthDatabase_();
  var sheet = spreadsheet.getSheetByName('Users');
  if (!sheet) throw new Error('The Users tab is missing from ScriptFlow Database.');

  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('The Users tab has no header row.');
  var headers = values[0];
  var emailCol = headers.indexOf('email');
  var idCol = headers.indexOf('user_id');
  var nameCol = headers.indexOf('full_name');
  var roleCol = headers.indexOf('role');
  var statusCol = headers.indexOf('status');
  var loginCol = headers.indexOf('last_login_at');
  var updatedCol = headers.indexOf('updated_at');

  if (emailCol < 0 || idCol < 0 || roleCol < 0 || statusCol < 0) {
    throw new Error('The Users tab is missing required columns.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    values = sheet.getDataRange().getValues();
    var rowNumber = 0;
    var user = null;

    for (var i = 1; i < values.length; i++) {
      if (String(values[i][emailCol]).toLowerCase().trim() === email) {
        rowNumber = i + 1;
        user = values[i];
        break;
      }
    }

    var now = new Date().toISOString();

    if (!user) {
      var role = email === AUTH_CONFIG.INITIAL_ADMIN ? 'admin' : AUTH_CONFIG.DEFAULT_ROLE;
      var fullName = email.split('@')[0].replace(/[._-]+/g, ' ');
      var newRow = headers.map(function(header) {
        if (header === 'user_id') return Utilities.getUuid();
        if (header === 'email') return email;
        if (header === 'full_name') return fullName;
        if (header === 'role') return role;
        if (header === 'status') return 'active';
        if (header === 'created_at' || header === 'updated_at') return now;
        if (header === 'last_login_at') return now;
        return '';
      });
      sheet.appendRow(newRow);
      user = newRow;
    } else {
      if (String(user[statusCol]).toLowerCase() !== 'active') {
        throw new Error('Your ScriptFlow account is inactive. Please contact your administrator.');
      }
      if (loginCol >= 0) sheet.getRange(rowNumber, loginCol + 1).setValue(now);
      if (updatedCol >= 0) sheet.getRange(rowNumber, updatedCol + 1).setValue(now);
    }

    var roleValue = String(user[roleCol] || AUTH_CONFIG.DEFAULT_ROLE);
    if (email === AUTH_CONFIG.INITIAL_ADMIN && roleValue !== 'admin') {
      roleValue = 'admin';
      sheet.getRange(rowNumber || sheet.getLastRow(), roleCol + 1).setValue('admin');
    }

    return {
      user_id: String(user[idCol] || ''),
      email: email,
      full_name: nameCol >= 0 ? String(user[nameCol] || '') : '',
      role: roleValue,
      status: 'active'
    };
  } finally {
    lock.releaseLock();
  }
}

function getAuthDatabase_() {
  var id = PropertiesService.getScriptProperties()
    .getProperty('SCRIPT_FLOW_DATABASE_ID');
  if (!id) throw new Error('SCRIPT_FLOW_DATABASE_ID is not configured. Run setupScriptFlowDatabase() in this project first.');
  return SpreadsheetApp.openById(id);
}

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
    encodedPayload, secret, Utilities.Charset.UTF_8
  );

  return {
    token: encodedPayload + '.' + base64UrlEncodeBytes_(signature),
    callbackUrl: callbackUrl,
    expiresIn: AUTH_CONFIG.TOKEN_LIFETIME_SECONDS
  };
}

function getSignInIdentity() {
  var employee = getAuthenticatedEmployee_();
  return {
    success: true,
    email: employee.email,
    full_name: employee.full_name,
    role: employee.role
  };
}

function base64UrlEncode_(value) {
  return Utilities.base64EncodeWebSafe(
    Utilities.newBlob(value).getBytes()
  ).replace(/=+$/g, '');
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}
