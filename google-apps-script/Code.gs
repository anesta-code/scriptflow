/**
 * ScriptFlow -> Google Sheets synchronisation.
 * Deploy as a Web App, execute as the spreadsheet owner, and store
 * SCRIPT_FLOW_SYNC_SECRET in Script Properties before deployment.
 */
const SPREADSHEET_ID = '1Ew-1cROn4Q2XpEV4t3b5jrgjP3MRUB50MDg6ofpuDQY';
const SHEET_NAME = 'KPI weekly';
const ID_HEADER = '__ScriptFlow_ID';

function doGet() {
  return jsonOutput({ ok: true, service: 'ScriptFlow Google Sheets sync' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('SCRIPT_FLOW_SYNC_SECRET');
    if (!expectedSecret) throw new Error('SCRIPT_FLOW_SYNC_SECRET is not configured in Apps Script properties.');

    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!body.secret || body.secret !== expectedSecret) {
      return jsonOutput({ ok: false, error: 'Unauthorized' });
    }
    if (!body.job || !body.job.id) throw new Error('Missing job.id in request.');

    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Worksheet "' + SHEET_NAME + '" was not found.');

    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    let idColumn = headers.indexOf(ID_HEADER) + 1;
    if (!idColumn) {
      idColumn = lastColumn + 1;
      sheet.getRange(1, idColumn).setValue(ID_HEADER);
      sheet.hideColumns(idColumn);
    }

    const job = body.job;
    const rowValues = headers.map(function(header) {
      if (header === ID_HEADER) return job.id;
      return valueForHeader(header, job);
    });
    // Include the hidden ID column, even if it was just added.
    while (rowValues.length < idColumn) rowValues.push('');
    rowValues[idColumn - 1] = job.id;

    const lastRow = sheet.getLastRow();
    let targetRow = 0;
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === String(job.id)) {
          targetRow = i + 2;
          break;
        }
      }
    }
    if (!targetRow) targetRow = Math.max(lastRow + 1, 2);

    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    return jsonOutput({ ok: true, action: targetRow <= lastRow ? 'updated' : 'inserted', row: targetRow, job_id: job.id });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

function valueForHeader(header, job) {
  const key = normalizeHeader(header);
  const aliases = {
    'sw': function() { return job.sw; },
    'projects number': function() { return job.project_number; },
    'project number': function() { return job.project_number; },
    'spm project number': function() { return job.spm_project_number; },
    'projects name': function() { return job.project_name; },
    'project name': function() { return job.project_name; },
    'status': function() { return job.status_label || job.status; },
    'questions': function() { return job.questions; },
    'level': function() { return job.level; },
    'qnr received on': function() { return job.qnr_received_on; },
    'launch date': function() { return job.launch_date; },
    'pm': function() { return job.main_pm_name; },
    'project manager': function() { return job.main_pm_name; },
    'tester': function() { return job.main_tester_name; },
    'test link': function() { return job.test_link; },
    'scripting time hrs': function() { return job.scripting_time_hours; },
    'test link scripting time per hrs': function() {
      const parts = [];
      if (job.test_link) parts.push(job.test_link);
      if (job.scripting_time_hours !== null && job.scripting_time_hours !== undefined && job.scripting_time_hours !== '') {
        parts.push(String(job.scripting_time_hours) + ' hrs');
      }
      return parts.join(' | ');
    },
    'test link scripting time hrs': function() {
      const parts = [];
      if (job.test_link) parts.push(job.test_link);
      if (job.scripting_time_hours !== null && job.scripting_time_hours !== undefined && job.scripting_time_hours !== '') {
        parts.push(String(job.scripting_time_hours) + ' hrs');
      }
      return parts.join(' | ');
    },
    'changes': function() { return job.changes; },
    'testing': function() { return job.testing; },
    'mailing time': function() { return job.mailing_time_hours; },
    'mailing time hrs': function() { return job.mailing_time_hours; },
    'hours worked': function() { return job.hours_worked; },
    'commissioning country': function() { return job.commissioning_country; },
    'overlay': function() { return job.overlay; },
    'price scripting': function() { return job.price_scripting; },
    'hours commissioned': function() { return job.hours_commissioned; },
    'client': function() { return job.client; },
    'bari oe checks': function() { return job.bari_oe_checks; },
    'bari moderations': function() { return job.bari_moderations; },
    'bari scripting': function() { return job.bari_scripting; },
    'bsurvey': function() { return job.bsurvey; },
    'complexity as spm': function() { return job.complexity_as_spm; }
  };
  return Object.prototype.hasOwnProperty.call(aliases, key) ? (aliases[key]() ?? '') : '';
}

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
