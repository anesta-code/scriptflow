/**
 * ScriptFlow application API.
 *
 * This is a SEPARATE Apps Script Web App from the Workspace sign-in broker.
 * Deploy as Web App, execute as owner. Access policy must permit Vercel
 * server-to-server requests; all POST requests are HMAC authenticated.
 *
 * Script Properties required:
 *   SCRIPT_FLOW_DATABASE_ID - 1-c0mTR52H3AIDJRQ1IC9c055w-Vm3fap_0PmIa1ejDs
 *   SCRIPT_FLOW_API_SECRET  - same secret as Vercel SCRIPT_FLOW_API_SECRET
 *   AUTH_TOKEN_SECRET       - same secret as auth project's AUTH_TOKEN_SECRET
 *
 * KPI Weekly remains a separate spreadsheet integration.
 */
var CFG = {
  DATABASE_ID: '1-c0mTR52H3AIDJRQ1IC9c055w-Vm3fap_0PmIa1ejDs',
  KPI_SPREADSHEET_ID: '1Ew-1cROn4Q2XpEV4t3b5jrgjP3MRUB50MDg6ofpuDQY',
  KPI_SHEET_NAME: 'KPI weekly',
  ID_HEADER: '__ScriptFlow_ID',
  DOMAIN: 'bilendi.com'
};

function doGet() {
  return out({ ok: true, service: 'ScriptFlow Database API', database: 'connected' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e && e.postData && e.postData.contents || '{}');
    verifyRequest(body);
    var payload = body.payload || {};

    if (payload.operation === 'redeem_auth_token') return out(redeemToken(payload));
    if (payload.operation === 'sync_job') {
      var user = verifyUser(payload.user);
      if (user.role !== 'admin' && user.role !== 'team_lead') {
        throw new Error('Only administrators and team leads can submit KPI records.');
      }
      return out(syncJob(payload.job, user));
    }
    if (payload.operation === 'get_database_status') {
      return out({ ok: true, database: 'connected', user: verifyUser(payload.user).email });
    }
    throw new Error('Unsupported operation.');
  } catch (error) {
    return out({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function getDatabase_() {
  var id = PropertiesService.getScriptProperties().getProperty('SCRIPT_FLOW_DATABASE_ID') || CFG.DATABASE_ID;
  return SpreadsheetApp.openById(id);
}

function verifyRequest(body) {
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
  var expected = hex(Utilities.computeHmacSha256Signature(canonical, secret, Utilities.Charset.UTF_8));
  if (!equal(expected, String(body.signature || '').toLowerCase())) throw new Error('Unauthorized.');

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

function redeemToken(payload) {
  var secret = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN_SECRET');
  if (!secret || secret.length < 32) throw new Error('AUTH_TOKEN_SECRET is not configured in the API project.');
  var parts = String(payload.token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid sign-in assertion.');
  var signature = b64(Utilities.computeHmacSha256Signature(parts[0], secret, Utilities.Charset.UTF_8));
  if (!equal(signature, parts[1])) throw new Error('Invalid sign-in signature.');

  var assertion = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  var now = Math.floor(Date.now() / 1000);
  if (assertion.iss !== 'scriptflow-bilendi-auth' ||
      assertion.aud !== 'scriptflow-vercel' ||
      !assertion.exp || assertion.exp <= now ||
      !assertion.iat || assertion.iat > now + 30 ||
      assertion.exp - assertion.iat > 180 ||
      !assertion.jti) {
    throw new Error('Sign-in assertion expired or invalid.');
  }
  if (!payload.expected_state || !equal(String(assertion.state || ''), String(payload.expected_state))) {
    throw new Error('Sign-in state mismatch.');
  }

  var email = String(assertion.sub || '').toLowerCase().trim();
  if (email.split('@')[1] !== CFG.DOMAIN) throw new Error('A Bilendi Workspace account is required.');

  var user = findUser_(email);
  if (!user || user.status !== 'active') throw new Error('Your ScriptFlow account is inactive or missing.');
  if (user.role !== assertion.role) throw new Error('Your ScriptFlow role changed during sign-in. Please try again.');

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

  return { ok: true, user: { id: user.user_id, email: email, full_name: user.full_name, role: user.role } };
}

function findUser_(email) {
  var sheet = getDatabase_().getSheetByName('Users');
  if (!sheet) throw new Error('Users tab was not found in ScriptFlow Database.');
  var rows = sheet.getDataRange().getValues();
  if (!rows.length) return null;
  var headers = rows[0];
  var emailIndex = headers.indexOf('email');
  var map = {};
  for (var i = 0; i < headers.length; i++) map[headers[i]] = i;
  for (var r = 1; r < rows.length; r++) {
    if (String(rows[r][emailIndex]).toLowerCase().trim() === email) {
      return {
        user_id: rows[r][map.user_id],
        email: rows[r][map.email],
        full_name: rows[r][map.full_name],
        role: rows[r][map.role],
        status: rows[r][map.status]
      };
    }
  }
  return null;
}

function verifyUser(context) {
  if (!context || !context.email || !context.role) throw new Error('Missing user context.');
  var email = String(context.email).toLowerCase().trim();
  if (email.split('@')[1] !== CFG.DOMAIN) throw new Error('User is not authorised.');
  var user = findUser_(email);
  if (!user || user.status !== 'active' || user.role !== context.role) {
    throw new Error('User is inactive or their ScriptFlow role has changed.');
  }
  return user;
}

/**
 * Saves the project record in ScriptFlow Database first, then mirrors it
 * into the existing KPI Weekly spreadsheet. The two spreadsheets remain
 * independent; KPI sync failure does not erase the database record.
 */
function syncJob(job, user) {
  if (!job || !job.id || !String(job.project_name || '').trim()) {
    throw new Error('Missing job ID or Project Name.');
  }

  var db = getDatabase_();
  var projects = db.getSheetByName('Projects');
  if (!projects) throw new Error('Projects tab was not found in ScriptFlow Database.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var dbAction = 'inserted';
  try {
    var values = projects.getDataRange().getValues();
    var headers = values[0];
    var col = {};
    headers.forEach(function(header, index) { col[header] = index; });
    var target = 0;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][col.project_id]) === String(job.id)) {
        target = i + 1;
        dbAction = 'updated';
        break;
      }
    }

    var now = new Date().toISOString();
    var existing = target ? values[target - 1] : [];
    var row = headers.map(function(header, index) {
      if (header === 'project_id') return job.id;
      if (header === 'project_number') return job.project_number || '';
      if (header === 'spm_project_number') return job.spm_project_number || '';
      if (header === 'project_name') return job.project_name || '';
      if (header === 'client') return job.client || '';
      if (header === 'pm_id') return job.pm || '';
      if (header === 'status') return job.status || '';
      if (header === 'priority') return job.priority || '';
      if (header === 'qnr_received_at') return job.qnr_received_on || '';
      if (header === 'launch_date') return job.launch_date || '';
      if (header === 'created_by') return target && col.created_by !== undefined ? existing[col.created_by] : user.user_id;
      if (header === 'created_at') return target && col.created_at !== undefined ? existing[col.created_at] : now;
      if (header === 'updated_at') return now;
      return target && index < existing.length ? existing[index] : '';
    });

    if (target) projects.getRange(target, 1, 1, row.length).setValues([row]);
    else projects.appendRow(row);

    logActivity_(db, user, 'Project', job.id, dbAction, {
      project_name: job.project_name,
      project_number: job.project_number || '',
      source: 'KPI Weekly form'
    });
  } finally {
    lock.releaseLock();
  }

  var sheetResult = { ok: false, error: '' };
  try {
    sheetResult = syncKpiSheet_(job);
  } catch (error) {
    sheetResult = { ok: false, error: String(error.message || error) };
  }

  return {
    ok: true,
    action: dbAction,
    row: sheetResult.row || null,
    database: 'saved',
    kpi_sheet: sheetResult.ok ? 'synced' : 'pending',
    kpi_error: sheetResult.error || ''
  };
}

function logActivity_(db, user, entityType, entityId, action, details) {
  var sheet = db.getSheetByName('ActivityLogs');
  if (!sheet) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var now = new Date().toISOString();
  var row = headers.map(function(header) {
    if (header === 'log_id') return Utilities.getUuid();
    if (header === 'entity_type') return entityType;
    if (header === 'entity_id') return entityId;
    if (header === 'action') return action;
    if (header === 'actor_id') return user.user_id;
    if (header === 'actor_email') return user.email;
    if (header === 'details_json') return JSON.stringify(details || {});
    if (header === 'created_at') return now;
    return '';
  });
  sheet.appendRow(row);
}

function syncKpiSheet_(job) {
  var sheet = SpreadsheetApp.openById(CFG.KPI_SPREADSHEET_ID).getSheetByName(CFG.KPI_SHEET_NAME);
  if (!sheet) throw new Error('KPI Weekly worksheet was not found.');
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var idColumn = headers.indexOf(CFG.ID_HEADER) + 1;
  if (!idColumn) {
    idColumn = lastColumn + 1;
    sheet.getRange(1, idColumn).setValue(CFG.ID_HEADER);
    sheet.hideColumns(idColumn);
    headers.push(CFG.ID_HEADER);
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
  for (var col = 0; col < headers.length; col++) {
    if (headers[col] === CFG.ID_HEADER) continue;
    var mapped = valueForHeader_(headers[col], job);
    if (mapped.found) sheet.getRange(target, col + 1).setValue(mapped.value);
  }
  sheet.getRange(target, idColumn).setValue(job.id);
  return { ok: true, action: action, row: target };
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

function valueForHeader_(header, job) {
  var key = normalizeHeader_(header);
  var aliases = {
    'sw':'sw',
    'project number':'project_number','projects number':'project_number',
    'spm project number':'spm_project_number',
    'project name':'project_name','projects name':'project_name',
    'tester':'tester','pm':'pm','project manager':'pm','status':'status',
    'questions':'questions','loi':'loi','level':'level',
    'qnr received on':'qnr_received_on','date sent to qa':'date_sent_to_qa',
    'date sent to pm':'date_sent_to_pm','launch date':'launch_date',
    'test link':'test_link','scripting time hrs':'scripting_time_hours',
    'scripting time hours':'scripting_time_hours','changes time hours':'changes_time_hours',
    'changes':'changes_time_hours','testing time hours':'testing_time_hours',
    'testing':'testing_time_hours','mailing time':'mailing_time_hours',
    'mailing time hours':'mailing_time_hours','total estimated hours':'total_estimated_hours',
    'hours worked':'hours_worked','commissioning country':'commissioning_country',
    'overlay':'overlay','price scripting':'price_scripting',
    'hours commissioned':'hours_commissioned','client':'client',
    'bari oe checks':'bari_oe_checks','bari moderations':'bari_moderations',
    'bari scripting':'bari_scripting','bsurvey':'bsurvey',
    'complexity as spm':'complexity_as_spm'
  };
  if (key === 'test link scripting time per hrs' || key === 'test link scripting time hrs') {
    var parts = [];
    if (job.test_link) parts.push(String(job.test_link));
    if (job.scripting_time_hours !== '' && job.scripting_time_hours !== null && job.scripting_time_hours !== undefined) {
      parts.push(String(job.scripting_time_hours) + ' hrs');
    }
    return { found: true, value: parts.join(' | ') };
  }
  var field = aliases[key];
  if (!field) return { found: false, value: '' };
  return { found: true, value: job[field] === null || job[field] === undefined ? '' : job[field] };
}

function hex(bytes) {
  return bytes.map(function(value) {
    value = value < 0 ? value + 256 : value;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function b64(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function equal(left, right) {
  left = String(left);
  right = String(right);
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function out(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
