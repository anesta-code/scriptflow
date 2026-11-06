/**
 * ScriptFlow KPI Weekly -> Google Sheets connector.
 * Deploy as a Web App executing as the spreadsheet owner.
 * Store SCRIPT_FLOW_SYNC_SECRET in Apps Script Script Properties.
 */
const SPREADSHEET_ID = '1Ew-1cROn4Q2XpEV4t3b5jrgjP3MRUB50MDg6ofpuDQY';
const SHEET_NAME = 'KPI weekly';
const ID_HEADER = '__ScriptFlow_ID';

function doGet() {
  return jsonOutput({ ok: true, service: 'ScriptFlow KPI Weekly connector' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var expectedSecret = PropertiesService.getScriptProperties().getProperty('SCRIPT_FLOW_SYNC_SECRET');
    if (!expectedSecret) throw new Error('SCRIPT_FLOW_SYNC_SECRET is not configured.');
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!body.secret || body.secret !== expectedSecret) return jsonOutput({ ok: false, error: 'Unauthorized request.' });
    if (!body.record || !body.record.id || !body.record.projectName) throw new Error('Missing record ID or Project Name.');

    lock.waitLock(20000);
    locked = true;
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Worksheet "' + SHEET_NAME + '" was not found.');
    var lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) throw new Error('The KPI Weekly sheet has no header row.');
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var idColumn = headers.indexOf(ID_HEADER) + 1;
    if (!idColumn) {
      idColumn = lastColumn + 1;
      sheet.getRange(1, idColumn).setValue(ID_HEADER);
      sheet.hideColumns(idColumn);
    }

    var record = body.record;
    var lastRow = sheet.getLastRow();
    var targetRow = 0;
    if (lastRow >= 2) {
      var ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === String(record.id)) { targetRow = i + 2; break; }
      }
    }
    var action = targetRow ? 'updated' : 'inserted';
    if (!targetRow) targetRow = Math.max(lastRow + 1, 2);

    // Write only recognised columns: management columns, unknown headers and
    // existing formulas in unmapped columns are not overwritten.
    for (var col = 0; col < headers.length; col++) {
      if (headers[col] === ID_HEADER) continue;
      var mapped = valueForHeader(headers[col], record);
      if (mapped.found) sheet.getRange(targetRow, col + 1).setValue(mapped.value);
    }
    sheet.getRange(targetRow, idColumn).setValue(record.id);
    return jsonOutput({ ok: true, action: action, row: targetRow, record_id: record.id });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (ignored) {} }
  }
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

function valueForHeader(header, record) {
  var key = normalizeHeader(header);
  var combined = [record.testLink || '',
    record.scriptingTime !== '' && record.scriptingTime !== null && record.scriptingTime !== undefined
      ? String(record.scriptingTime) + ' hrs' : ''
  ].filter(function(v) { return v !== ''; }).join(' | ');
  var aliases = {
    'sw':'sw',
    'project number':'projectNumber','projects number':'projectNumber',
    'spm project number':'spmProjectNumber',
    'project name':'projectName','projects name':'projectName',
    'tester':'tester','pm':'pm','project manager':'pm','status':'status',
    'questions':'questions','loi':'loi','level':'level',
    'qnr received on':'qnrReceivedOn','date sent to qa':'dateSentToQa',
    'date sent to pm':'dateSentToPm','launch date':'launchDate',
    'test link':'testLink','scripting time hrs':'scriptingTime','scripting time hours':'scriptingTime',
    'changes time hours':'changesTime','changes':'changesTime',
    'testing time hours':'testingTime','testing':'testingTime',
    'mailing time':'mailingTime','mailing time hours':'mailingTime',
    'total estimated hours':'totalEstimatedHours','hours worked':'hoursWorked',
    'commissioning country':'commissioningCountry','overlay':'overlay',
    'price scripting':'priceScripting','hours commissioned':'hoursCommissioned',
    'client':'client','bari oe checks':'bariOeChecks',
    'bari moderations':'bariModerations','bari scripting':'bariScripting',
    'bsurvey':'bsurvey','complexity as spm':'complexityAsSpm'
  };
  if (key === 'test link scripting time per hrs' || key === 'test link scripting time hrs') {
    return { found: true, value: combined };
  }
  if (!Object.prototype.hasOwnProperty.call(aliases, key)) return { found: false, value: '' };
  var value = record[aliases[key]];
  return { found: true, value: value === null || value === undefined ? '' : value };
}

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
