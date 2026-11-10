/**
 * SCRIPT FLOW — UNIFIED GOOGLE APPS SCRIPT PROJECT
 *
 * Deploy this SAME project twice:
 *
 * AUTH deployment:
 *   Execute as: Me
 *   Who has access: Anyone within bilendi.com
 *   Use URL in Vercel GOOGLE_WORKSPACE_AUTH_URL.
 *
 * API deployment:
 *   Execute as: Me
 *   Who has access: Anyone
 *   Use URL in Vercel SCRIPT_FLOW_API_URL.
 *   Every POST is HMAC authenticated; never remove that check.
 *
 * Script Properties (one set, shared by both deployments):
 *   AUTH_TOKEN_SECRET       shared with Vercel for signed employee assertions
 *   SCRIPT_FLOW_API_SECRET  shared with Vercel for signed API requests
 *   VERCEL_CALLBACK_URL     https://scriptflow-bice.vercel.app/
 *   KPI_SPREADSHEET_ID      optional; must point to the spreadsheet containing the KPI Migration tab
 *   SCRIPT_FLOW_USER_ROLES  optional JSON email-to-role overrides
 *
 * There is NO ScriptFlow database. KPI Weekly is the only data store.
 */

var SF = {
  DOMAIN: 'bilendi.com',
  KPI_ID: '1Ew-1cROn4Q2XpEV4t3b5jrgjP3MRUB50MDg6ofpuDQY',
  KPI_TAB: 'KPI weekly',
  ID_HEADER: '__ScriptFlow_ID',
  TOKEN_SECONDS: 120,
  DEFAULT_ROLE: 'scripter',
  ROLES: {
    'a.nesta@bilendi.com': 'admin',
    'g.sardoo@bilendi.com': 'team_lead',
    'n.latreille@bilendi.com': 'scripter'
  }
};

/* Both deployments use this same doGet. Only the AUTH URL is used by users. */
function doGet(e) {
  var state = e && e.parameter && e.parameter.state ? String(e.parameter.state) : '';
  var template = HtmlService.createTemplateFromFile('Index');
  template.signInState = JSON.stringify(state);
  return template.evaluate()
    .setTitle('ScriptFlow secure sign-in')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* The API deployment accepts POST only after validating the HMAC envelope. */
function doPost(e) {
  try {
    var envelope = JSON.parse(e && e.postData && e.postData.contents || '{}');
    verifyApiEnvelope_(envelope);
    var p = envelope.payload || {};

    if (p.operation === 'redeem_auth_token') {
      return json_(redeemAuthToken_(p));
    }
    if (p.operation === 'list_kpi_records') {
      var reader = verifyUser_(p.user);
      return json_(listKpiRecords_(reader));
    }
    if (p.operation === 'sync_job') {
      var writer = verifyUser_(p.user);
      requireRole_(writer, ['scripter', 'team_lead', 'admin'], 'You do not have permission to create or edit records.');
      return json_(saveKpiRecord_(p.job));
    }
    if (p.operation === 'delete_kpi_record') {
      var deleter = verifyUser_(p.user);
      requireRole_(deleter, ['team_lead', 'admin'], 'Only team leaders and admins can delete records.');
      return json_(deleteKpiRecord_(p.id));
    }
    if (p.operation === 'list_forms') {
      var formReader = verifyUser_(p.user);
      return json_(listForms_(formReader));
    }
    if (p.operation === 'add_form') {
      var formAdmin = verifyUser_(p.user);
      requireRole_(formAdmin, ['admin'], 'Only admins can add forms.');
      return json_(addForm_(p.form, formAdmin));
    }
    if (p.operation === 'update_form') {
      var updateAdmin = verifyUser_(p.user);
      requireRole_(updateAdmin, ['admin'], 'Only admins can update forms.');
      return json_(updateForm_(p.form, updateAdmin));
    }
    if (p.operation === 'deactivate_form') {
      var removeAdmin = verifyUser_(p.user);
      requireRole_(removeAdmin, ['admin'], 'Only admins can remove forms.');
      return json_(deactivateForm_(p.formId, removeAdmin));
    }
    if (p.operation === 'list_form_records') {
      var formRecordReader = verifyUser_(p.user);
      return json_(listFormRecords_(p.formId, formRecordReader));
    }
    if (p.operation === 'save_form_record') {
      var formRecordWriter = verifyUser_(p.user);
      requireRole_(formRecordWriter, ['scripter', 'team_lead', 'admin'], 'You do not have permission to create or edit records.');
      return json_(saveFormRecord_(p.formId, p.record));
    }
    if (p.operation === 'delete_form_record') {
      var formRecordDeleter = verifyUser_(p.user);
      requireRole_(formRecordDeleter, ['team_lead', 'admin'], 'Only team leaders and admins can delete records.');
      return json_(deleteFormRecord_(p.formId, p.id));
    }
    throw new Error('Unsupported operation.');
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* -------------------- Workspace authentication -------------------- */

function getSignInIdentity() {
  var user = authenticatedEmployee_();
  return { success: true, email: user.email, role: user.role };
}

function issueAuthToken(state) {
  var user = authenticatedEmployee_();
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('AUTH_TOKEN_SECRET');
  var callback = props.getProperty('VERCEL_CALLBACK_URL');

  if (!secret || secret.length < 32) throw new Error('AUTH_TOKEN_SECRET is not configured correctly.');
  if (!callback || !/^https:\/\//i.test(callback)) throw new Error('VERCEL_CALLBACK_URL is not configured.');
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,160}$/.test(state)) {
    throw new Error('Invalid sign-in state. Return to ScriptFlow and try again.');
  }

  var now = Math.floor(Date.now() / 1000);
  var assertion = {
    iss: 'scriptflow-bilendi-auth',
    aud: 'scriptflow-vercel',
    sub: user.email,
    role: user.role,
    iat: now,
    exp: now + SF.TOKEN_SECONDS,
    jti: Utilities.getUuid(),
    state: state
  };
  var encoded = b64url_(JSON.stringify(assertion));
  var signature = Utilities.computeHmacSha256Signature(encoded, secret, Utilities.Charset.UTF_8);
  return {
    token: encoded + '.' + b64urlBytes_(signature),
    callbackUrl: callback,
    expiresIn: SF.TOKEN_SECONDS
  };
}

function authenticatedEmployee_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  if (!email || email.indexOf('@') < 1) {
    throw new Error('Google Workspace could not identify your account. Sign in with your Bilendi account.');
  }
  if (email.split('@')[1] !== SF.DOMAIN) {
    throw new Error('Access denied. A Bilendi Google Workspace account is required.');
  }
  return { email: email, role: roleFor_(email) };
}

/* Explicit roles are held in Script Properties; unknown company users are scripters. */
function roleFor_(email) {
  var roles = {};
  Object.keys(SF.ROLES).forEach(function(k) { roles[k.toLowerCase()] = SF.ROLES[k]; });

  var raw = PropertiesService.getScriptProperties().getProperty('SCRIPT_FLOW_USER_ROLES');
  if (raw) {
    var extra;
    try { extra = JSON.parse(raw); }
    catch (e) { throw new Error('SCRIPT_FLOW_USER_ROLES must be valid JSON.'); }
    Object.keys(extra || {}).forEach(function(k) { roles[k.toLowerCase()] = String(extra[k]); });
  }

  var role = roles[email] || SF.DEFAULT_ROLE;
  if (['scripter', 'team_lead', 'admin'].indexOf(role) < 0) {
    throw new Error('Invalid ScriptFlow role configured for ' + email + '.');
  }
  return role;
}

/* ------------------------- Signed API ------------------------------ */

function verifyApiEnvelope_(body) {
  var secret = PropertiesService.getScriptProperties().getProperty('SCRIPT_FLOW_API_SECRET');
  if (!secret || secret.length < 32) throw new Error('SCRIPT_FLOW_API_SECRET is not configured.');

  var timestamp = String(body.timestamp || '');
  var nonce = String(body.nonce || '');
  if (!/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) {
    throw new Error('Invalid request authentication fields.');
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 60) {
    throw new Error('Request expired.');
  }
  if (!body.payload || typeof body.payload !== 'object') throw new Error('Missing payload.');

  var canonical = timestamp + '\n' + nonce + '\n' + JSON.stringify(body.payload);
  var expected = hex_(Utilities.computeHmacSha256Signature(canonical, secret, Utilities.Charset.UTF_8));
  if (!constantEqual_(expected, String(body.signature || '').toLowerCase())) {
    throw new Error('Unauthorized.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var key = 'sf_req_' + nonce;
    if (cache.get(key)) throw new Error('Duplicate request.');
    cache.put(key, '1', 180);
  } finally {
    lock.releaseLock();
  }
}

function redeemAuthToken_(p) {
  var secret = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN_SECRET');
  if (!secret || secret.length < 32) throw new Error('AUTH_TOKEN_SECRET is not configured.');
  var parts = String(p.token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid sign-in assertion.');

  var signature = b64urlBytes_(Utilities.computeHmacSha256Signature(parts[0], secret, Utilities.Charset.UTF_8));
  if (!constantEqual_(signature, parts[1])) throw new Error('Invalid sign-in signature.');

  var assertion;
  try {
    assertion = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (e) { throw new Error('Invalid sign-in assertion payload.'); }

  var now = Math.floor(Date.now() / 1000);
  if (assertion.iss !== 'scriptflow-bilendi-auth' ||
      assertion.aud !== 'scriptflow-vercel' ||
      !assertion.exp || assertion.exp <= now ||
      !assertion.iat || assertion.iat > now + 30 ||
      assertion.exp - assertion.iat > 180 || !assertion.jti) {
    throw new Error('Sign-in assertion expired or invalid.');
  }
  if (!p.expected_state || !constantEqual_(String(assertion.state || ''), String(p.expected_state))) {
    throw new Error('Sign-in state mismatch.');
  }

  var email = String(assertion.sub || '').toLowerCase().trim();
  if (email.split('@')[1] !== SF.DOMAIN) throw new Error('A Bilendi Workspace account is required.');
  var role = roleFor_(email);
  if (role !== assertion.role) throw new Error('Your ScriptFlow role changed during sign-in. Please try again.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var key = 'sf_auth_' + String(assertion.jti).replace(/[^A-Za-z0-9_-]/g, '');
    if (cache.get(key)) throw new Error('Sign-in assertion already used.');
    cache.put(key, '1', Math.max(1, Math.min(180, assertion.exp - now)));
  } finally {
    lock.releaseLock();
  }
  return { ok: true, user: { email: email, role: role } };
}

function verifyUser_(context) {
  if (!context || !context.email || !context.role) throw new Error('Missing user context.');
  var email = String(context.email).toLowerCase().trim();
  if (email.split('@')[1] !== SF.DOMAIN) throw new Error('User is not authorised.');
  var role = roleFor_(email);
  if (role !== context.role) throw new Error('User role has changed. Please sign in again.');
  return { email: email, role: role };
}

/* ------------------------- KPI Weekly ------------------------------ */

function saveKpiRecord_(job) {
  if (!job || !job.id || !String(job.project_name || '').trim()) {
    throw new Error('Missing KPI record ID or Project Name.');
  }

  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('KPI_SPREADSHEET_ID') || SF.KPI_ID;
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(SF.KPI_TAB);
  if (!sheet) throw new Error('KPI Migration worksheet was not found.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var idColumn = headers.indexOf(SF.ID_HEADER) + 1;
    if (!idColumn) {
      idColumn = lastColumn + 1;
      sheet.getRange(1, idColumn).setValue(SF.ID_HEADER);
      sheet.hideColumns(idColumn);
      headers.push(SF.ID_HEADER);
    }

    var lastRow = sheet.getLastRow();
    var target = 0;
    if (lastRow >= 2) {
      var ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === String(job.id)) { target = i + 2; break; }
      }
    }
    var action = target ? 'updated' : 'inserted';
    if (!target) target = Math.max(lastRow + 1, 2);

    for (var c = 0; c < headers.length; c++) {
      if (headers[c] === SF.ID_HEADER) continue;
      var mapped = fieldForHeader_(headers[c], job);
      if (mapped.found) sheet.getRange(target, c + 1).setValue(safeCell_(mapped.value));
    }
    sheet.getRange(target, idColumn).setValue(job.id);
    return { ok: true, action: action, row: target };
  } finally {
    lock.releaseLock();
  }
}

function fieldForHeader_(header, job) {
  var key = String(header || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

  var map = {
    'sw':'sw',
    'project number':'project_number',
    'spm project number':'spm_project_number',
    'project name':'project_name',
    'tester':'tester',
    'pm':'pm',
    'status':'status',
    'questions':'questions',
    'loi':'loi',
    'level':'level',
    'qnr received on':'qnr_received_on',
    'date sent to qa':'date_sent_to_qa',
    'date sent to pm':'date_sent_to_pm',
    'launch date':'launch_date',
    'changes time hours':'changes_time_hours',
    'testing time hours':'testing_time_hours',
    'mailing time':'mailing_time_hours',
    'mailing time hours':'mailing_time_hours',
    'total estimated hours':'total_estimated_hours',
    'hours worked':'hours_worked',
    'commissioning country':'commissioning_country',
    'overlay':'overlay',
    'price scripting':'price_scripting',
    'hours commissioned':'hours_commissioned',
    'client':'client',
    'bari oe checks':'bari_oe_checks',
    'bari moderations':'bari_moderations',
    'bari scripting':'bari_scripting',
    'bsurvey':'bsurvey',
    'complexity as spm':'complexity_as_spm'
  };

  if (key === 'test link scripting time per hrs' || key === 'test link scripting time hrs') {
    var bits = [];
    if (job.test_link) bits.push(String(job.test_link));
    if (job.scripting_time_hours !== '' && job.scripting_time_hours !== null &&
        job.scripting_time_hours !== undefined) bits.push(String(job.scripting_time_hours) + ' hrs');
    return { found: true, value: bits.join(' | ') };
  }
  if (key === 'test link') return { found: true, value: job.test_link || '' };

  var field = map[key];
  if (!field) return { found: false, value: '' };
  var value = job[field];
  return { found: true, value: value === null || value === undefined ? '' : value };
}

 
function listKpiRecords_(user) {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('KPI_SPREADSHEET_ID') || SF.KPI_ID;
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(SF.KPI_TAB);
  if (!sheet) {
    var availableTabs = SpreadsheetApp.openById(spreadsheetId).getSheets()
      .map(function(tab) { return '[' + tab.getName() + ']'; }).join(', ');
    throw new Error('KPI Migration worksheet was not found. Available tabs in the configured spreadsheet: ' + availableTabs);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var idColumn = headers.indexOf(SF.ID_HEADER) + 1;
    if (!idColumn) {
      idColumn = lastColumn + 1;
      sheet.getRange(1, idColumn).setValue(SF.ID_HEADER);
      sheet.hideColumns(idColumn);
      headers.push(SF.ID_HEADER);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, records: [] };

    var range = sheet.getRange(2, 1, lastRow - 1, headers.length);
    var values = range.getValues();
    var display = range.getDisplayValues();
    var ids = [];
    for (var i = 0; i < values.length; i++) {
      var hasProjectName = String(display[i][headers.indexOf('Project Name')] || '').trim();
      if (!hasProjectName) continue;
      var id = String(display[i][idColumn - 1] || '').trim();
      if (!id) {
        id = Utilities.getUuid();
        sheet.getRange(i + 2, idColumn).setValue(id);
      }
      ids.push(recordFromSheetRow_(headers, values[i], display[i], id, i + 2));
    }
    return { ok: true, records: ids };
  } finally {
    lock.releaseLock();
  }
}

function recordFromSheetRow_(headers, values, display, id, rowNumber) {
  var record = { id: id, sheetRow: rowNumber };
  var fields = {
    'sw':'sw', 'project number':'projectNumber',
    'spm project number':'spmProjectNumber', 'project name':'projectName',
    'tester':'tester', 'pm':'pm', 'status':'status',
    'questions':'questions', 'loi':'loi', 'level':'level',
    'qnr received on':'qnrReceivedOn', 'date sent to qa':'dateSentToQa',
    'date sent to pm':'dateSentToPm', 'launch date':'launchDate',
    'changes time hours':'changesTime', 'testing time hours':'testingTime',
    'mailing time':'mailingTime', 'mailing time hours':'mailingTime',
    'total estimated hours':'totalEstimatedHours', 'hours worked':'hoursWorked',
    'commissioning country':'commissioningCountry', 'overlay':'overlay',
    'price scripting':'priceScripting', 'hours commissioned':'hoursCommissioned',
    'client':'client', 'bari oe checks':'bariOeChecks',
    'bari moderations':'bariModerations', 'bari scripting':'bariScripting',
    'bsurvey':'bsurvey', 'complexity as spm':'complexityAsSpm'
  };
  for (var c = 0; c < headers.length; c++) {
    var key = String(headers[c] || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    var field = fields[key];
    if (field) record[field] = sheetValueForForm_(values[c], display[c]);
    if (key === 'test link scripting time per hrs' || key === 'test link scripting time hrs') {
      var combined = String(display[c] || '').trim();
      var match = combined.match(/^(.*?)(?:\s*\|\s*([0-9]+(?:\.[0-9]+)?)\s*hrs?)?$/i);
      record.testLink = match ? String(match[1] || '').trim() : combined;
      record.scriptingTime = match && match[2] ? match[2] : '';
    }
  }
  return record;
}

function sheetValueForForm_(value, display) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (value === null || value === undefined) return '';
  return String(display === null || display === undefined ? value : display);
}


/* ----------------------- Record deletion --------------------------- */

function requireRole_(user, allowed, message) {
  if (!user || allowed.indexOf(user.role) < 0) throw new Error(message || 'You are not allowed to perform this action.');
}

function deleteKpiRecord_(recordId) {
  var id = String(recordId || '').trim();
  if (!id) throw new Error('A KPI record ID is required.');
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('KPI_SPREADSHEET_ID') || SF.KPI_ID;
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(SF.KPI_TAB);
  if (!sheet) throw new Error('KPI weekly worksheet was not found.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var idColumn = headers.indexOf(SF.ID_HEADER) + 1;
    if (!idColumn) throw new Error('The KPI record ID column has not been initialized.');
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('The KPI record was not found.');
    var ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) {
        sheet.deleteRow(i + 2);
        return { ok: true, deleted: true };
      }
    }
    throw new Error('The KPI record was not found. Refresh the list and try again.');
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------- Form configuration ------------------------- */

var SF_FORMS_PROPERTY = 'SCRIPT_FLOW_FORMS';
var SF_FORM_ID_HEADER = '__ScriptFlow_ID';

function readFormRegistry_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(SF_FORMS_PROPERTY);
  if (!raw) {
    var count = Number(props.getProperty(SF_FORMS_PROPERTY + '_CHUNKS') || 0);
    if (!count) return [];
    raw = '';
    for (var i = 0; i < count; i++) {
      var part = props.getProperty(SF_FORMS_PROPERTY + '_' + i);
      if (part === null) throw new Error('The ScriptFlow form registry is incomplete. Contact the admin.');
      raw += part;
    }
  }
  var forms;
  try { forms = JSON.parse(raw); }
  catch (e) { throw new Error('SCRIPT_FLOW_FORMS contains invalid JSON. Contact the ScriptFlow admin.'); }
  if (!Array.isArray(forms)) throw new Error('SCRIPT_FLOW_FORMS must contain a JSON array.');
  return forms;
}

function writeFormRegistry_(forms) {
  var props = PropertiesService.getScriptProperties();
  var raw = JSON.stringify(forms);
  var chunkSize = 7000;
  var chunks = [];
  for (var i = 0; i < raw.length; i += chunkSize) chunks.push(raw.substring(i, i + chunkSize));
  var oldCount = Number(props.getProperty(SF_FORMS_PROPERTY + '_CHUNKS') || 0);
  var updates = {};
  chunks.forEach(function(part, index) { updates[SF_FORMS_PROPERTY + '_' + index] = part; });
  updates[SF_FORMS_PROPERTY + '_CHUNKS'] = String(chunks.length);
  props.setProperties(updates, false);
  for (var j = chunks.length; j < oldCount; j++) props.deleteProperty(SF_FORMS_PROPERTY + '_' + j);
  props.deleteProperty(SF_FORMS_PROPERTY);
}

function parseSpreadsheetId_(url) {
  var match = String(url || '').match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error('Enter a valid Google Sheets spreadsheet URL.');
  return match[1];
}

function getFormSheet_(form) {
  var spreadsheet;
  try { spreadsheet = SpreadsheetApp.openById(form.spreadsheetId); }
  catch (e) { throw new Error('ScriptFlow cannot access this spreadsheet. Share it with the Google account that owns the Apps Script deployment.'); }
  var sheet = spreadsheet.getSheetByName(form.sheetName);
  if (!sheet) throw new Error('The worksheet "' + form.sheetName + '" was not found in the source spreadsheet.');
  return sheet;
}

function inferFormFieldType_(header) {
  var key = String(header || '').toLowerCase();
  if (/(date|started on|completed on|received on)/.test(key)) return 'date';
  if (/email/.test(key)) return 'email';
  if (/(url|link|website)/.test(key)) return 'url';
  if (/(question|hours|loi|number|count|price|cost|amount|weight)/.test(key)) return 'number';
  if (/(comment|notes|description)/.test(key)) return 'textarea';
  return 'text';
}

function readFormHeaders_(sheet, headerRow) {
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error('The selected worksheet does not contain any column headers.');
  if (lastColumn > 150) throw new Error('A form can contain up to 150 columns.');
  var headers = sheet.getRange(headerRow, 1, 1, lastColumn).getDisplayValues()[0];
  var result = [];
  var seen = {};
  headers.forEach(function(value, index) {
    var name = String(value || '').trim();
    if (!name || name === SF_FORM_ID_HEADER) return;
    var key = name.toLowerCase();
    if (seen[key]) throw new Error('Duplicate column header found: "' + name + '". Please make headers unique.');
    seen[key] = true;
    result.push({ name: name, type: inferFormFieldType_(name), required: false, column: index + 1 });
  });
  if (!result.length) throw new Error('No usable column headers were found in the selected header row.');
  return result;
}

function listForms_(user) {
  var forms = readFormRegistry_().filter(function(form) { return form.active !== false; });
  return { ok: true, forms: forms.map(function(form) {
    return { id: form.id, name: form.name, sheetName: form.sheetName, headerRow: form.headerRow, fields: form.fields || [], createdAt: form.createdAt || '' };
  }) };
}

function addForm_(input, user) {
  if (!input || !String(input.name || '').trim()) throw new Error('A form name is required.');
  var spreadsheetId = parseSpreadsheetId_(input.spreadsheetUrl);
  var sheetName = String(input.sheetName || '').trim();
  var headerRow = Number(input.headerRow || 1);
  if (!sheetName) throw new Error('A worksheet tab name is required.');
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100) throw new Error('Header row must be between 1 and 100.');
  var form = {
    id: Utilities.getUuid(), name: String(input.name).trim(), spreadsheetId: spreadsheetId,
    sheetName: sheetName, headerRow: headerRow, active: true, fields: [],
    createdAt: new Date().toISOString(), createdBy: user.email, updatedAt: new Date().toISOString()
  };
  form.fields = readFormHeaders_(getFormSheet_(form), headerRow);
  var forms = readFormRegistry_();
  if (forms.some(function(item) { return item.active !== false && item.spreadsheetId === spreadsheetId && item.sheetName === sheetName; })) {
    throw new Error('This spreadsheet worksheet is already registered as an active ScriptFlow form.');
  }
  forms.push(form);
  writeFormRegistry_(forms);
  return { ok: true, form: { id: form.id, name: form.name, sheetName: form.sheetName, headerRow: form.headerRow, fields: form.fields } };
}

function updateForm_(input, user) {
  if (!input || !input.id) throw new Error('A form ID is required.');
  var forms = readFormRegistry_();
  var form = null;
  for (var i = 0; i < forms.length; i++) if (forms[i].id === String(input.id)) { form = forms[i]; break; }
  if (!form || form.active === false) throw new Error('The active form was not found.');
  if (input.name !== undefined) {
    if (!String(input.name || '').trim()) throw new Error('A form name is required.');
    form.name = String(input.name).trim();
  }
  if (input.spreadsheetUrl) form.spreadsheetId = parseSpreadsheetId_(input.spreadsheetUrl);
  if (input.sheetName !== undefined) form.sheetName = String(input.sheetName || '').trim();
  if (input.headerRow !== undefined) form.headerRow = Number(input.headerRow);
  if (!form.sheetName) throw new Error('A worksheet tab name is required.');
  if (!Number.isInteger(form.headerRow) || form.headerRow < 1 || form.headerRow > 100) throw new Error('Header row must be between 1 and 100.');
  form.fields = readFormHeaders_(getFormSheet_(form), form.headerRow);
  form.updatedAt = new Date().toISOString();
  form.updatedBy = user.email;
  writeFormRegistry_(forms);
  return { ok: true, form: { id: form.id, name: form.name, sheetName: form.sheetName, headerRow: form.headerRow, fields: form.fields } };
}

function deactivateForm_(formId, user) {
  var id = String(formId || '').trim();
  if (!id) throw new Error('A form ID is required.');
  var forms = readFormRegistry_();
  var found = false;
  forms.forEach(function(form) {
    if (form.id === id && form.active !== false) {
      form.active = false;
      form.removedAt = new Date().toISOString();
      form.removedBy = user.email;
      found = true;
    }
  });
  if (!found) throw new Error('The active form was not found.');
  writeFormRegistry_(forms);
  return { ok: true, deactivated: true, spreadsheetPreserved: true };
}

function activeForm_(formId) {
  var forms = readFormRegistry_();
  for (var i = 0; i < forms.length; i++) if (forms[i].id === String(formId) && forms[i].active !== false) return forms[i];
  throw new Error('This form is no longer active in ScriptFlow.');
}

function ensureFormIdColumn_(sheet, headerRow) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(headerRow, 1, 1, lastColumn).getDisplayValues()[0];
  var idColumn = headers.indexOf(SF_FORM_ID_HEADER) + 1;
  if (!idColumn) {
    idColumn = lastColumn + 1;
    sheet.getRange(headerRow, idColumn).setValue(SF_FORM_ID_HEADER);
    sheet.hideColumns(idColumn);
  }
  return idColumn;
}

function findFormHeaderColumn_(sheet, headerRow, name) {
  var headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var index = headers.indexOf(name);
  if (index < 0) throw new Error('The column "' + name + '" no longer exists. Update the form configuration.');
  return index + 1;
}

function listFormRecords_(formId, user) {
  var form = activeForm_(formId);
  var sheet = getFormSheet_(form);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var idColumn = ensureFormIdColumn_(sheet, form.headerRow);
    var lastRow = sheet.getLastRow();
    if (lastRow <= form.headerRow) return { ok: true, records: [] };
    var lastColumn = Math.max(sheet.getLastColumn(), idColumn);
    var rowCount = lastRow - form.headerRow;
    var values = sheet.getRange(form.headerRow + 1, 1, rowCount, lastColumn).getValues();
    var display = sheet.getRange(form.headerRow + 1, 1, rowCount, lastColumn).getDisplayValues();
    var records = [];
    var columns = form.fields.map(function(field) { return findFormHeaderColumn_(sheet, form.headerRow, field.name); });
    for (var r = 0; r < rowCount; r++) {
      var hasData = columns.some(function(column) { return String(display[r][column - 1] || '').trim() !== ''; });
      if (!hasData) continue;
      var id = String(display[r][idColumn - 1] || '').trim();
      if (!id) {
        id = Utilities.getUuid();
        sheet.getRange(form.headerRow + 1 + r, idColumn).setValue(id);
      }
      var recordValues = {};
      form.fields.forEach(function(field, index) {
        recordValues[field.name] = sheetValueForForm_(values[r][columns[index] - 1], display[r][columns[index] - 1]);
      });
      records.push({ id: id, sheetRow: form.headerRow + 1 + r, values: recordValues });
    }
    return { ok: true, records: records };
  } finally { lock.releaseLock(); }
}

function saveFormRecord_(formId, record) {
  var form = activeForm_(formId);
  if (!record || !record.values || typeof record.values !== 'object') throw new Error('Form record values are required.');
  var sheet = getFormSheet_(form);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var idColumn = ensureFormIdColumn_(sheet, form.headerRow);
    var lastRow = sheet.getLastRow();
    var target = 0;
    if (record.id && lastRow > form.headerRow) {
      var ids = sheet.getRange(form.headerRow + 1, idColumn, lastRow - form.headerRow, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === String(record.id)) { target = form.headerRow + 1 + i; break; }
    }
    var action = target ? 'updated' : 'inserted';
    if (!target) target = Math.max(lastRow + 1, form.headerRow + 1);
    form.fields.forEach(function(field) {
      var value = Object.prototype.hasOwnProperty.call(record.values, field.name) ? record.values[field.name] : '';
      if (field.required && String(value || '').trim() === '') throw new Error('"' + field.name + '" is required.');
      sheet.getRange(target, findFormHeaderColumn_(sheet, form.headerRow, field.name))
        .setValue(safeCell_(value === null || value === undefined ? '' : value));
    });
    var id = record.id || Utilities.getUuid();
    sheet.getRange(target, idColumn).setValue(id);
    return { ok: true, action: action, id: id, row: target };
  } finally { lock.releaseLock(); }
}

function deleteFormRecord_(formId, recordId) {
  var form = activeForm_(formId);
  var id = String(recordId || '').trim();
  if (!id) throw new Error('A record ID is required.');
  var sheet = getFormSheet_(form);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= form.headerRow) throw new Error('The record was not found.');
    var idColumn = ensureFormIdColumn_(sheet, form.headerRow);
    var ids = sheet.getRange(form.headerRow + 1, idColumn, lastRow - form.headerRow, 1).getDisplayValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) {
        sheet.deleteRow(form.headerRow + 1 + i);
        return { ok: true, deleted: true };
      }
    }
    throw new Error('The record was not found. Refresh the list and try again.');
  } finally { lock.releaseLock(); }
}

/* ----------------------------- Helpers ----------------------------- */

function safeCell_(value) {
  if (typeof value === 'string' && /^[=+@]/.test(value)) return "'" + value;
  if (typeof value === 'string' && /^-/.test(value) && isNaN(Number(value))) return "'" + value;
  return value;
}

function b64url_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(value).getBytes()).replace(/=+$/g, '');
}
function b64urlBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}
function hex_(bytes) {
  return bytes.map(function(v) {
    v = v < 0 ? v + 256 : v;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}
function constantEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}