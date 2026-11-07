/**
 * ScriptFlow database bootstrap.
 *
 * Run setupScriptFlowDatabase() once from the ScriptFlow authentication
 * Apps Script project while signed in as the intended spreadsheet owner.
 *
 * The spreadsheet is private by default. Share it only with the service
 * owner/admins who need direct spreadsheet access. The app accesses it
 * through Apps Script, not directly from the browser.
 */

var SCRIPT_FLOW_DB = {
  NAME: 'ScriptFlow Database',
  PROPERTY_KEY: 'SCRIPT_FLOW_DATABASE_ID',
  INITIAL_ADMIN: 'a.nesta@bilendi.com',
  SHEETS: {
    Users: [
      'user_id', 'email', 'full_name', 'role', 'status',
      'created_at', 'last_login_at', 'updated_at'
    ],
    Projects: [
      'project_id', 'project_number', 'spm_project_number', 'project_name',
      'client', 'pm_id', 'status', 'priority', 'qnr_received_at',
      'launch_date', 'created_by', 'created_at', 'updated_at'
    ],
    Tasks: [
      'task_id', 'project_id', 'title', 'task_type', 'status', 'priority',
      'assigned_to', 'due_date', 'started_at', 'completed_at', 'notes',
      'created_by', 'created_at', 'updated_at'
    ],
    Assignments: [
      'assignment_id', 'project_id', 'task_id', 'user_id',
      'assignment_role', 'assigned_by', 'assigned_at'
    ],
    ActivityLogs: [
      'log_id', 'entity_type', 'entity_id', 'action', 'actor_id',
      'actor_email', 'details_json', 'created_at'
    ],
    Reports: [
      'report_id', 'report_type', 'period_start', 'period_end',
      'generated_by', 'created_at', 'data_json'
    ],
    Settings: ['key', 'value', 'description', 'updated_at']
  }
};

/**
 * Creates the private spreadsheet and all required tabs.
 * Safe to run again: existing tabs and records are retained.
 */
function setupScriptFlowDatabase() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty(SCRIPT_FLOW_DB.PROPERTY_KEY);
  var spreadsheet;

  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create(SCRIPT_FLOW_DB.NAME);
    properties.setProperty(SCRIPT_FLOW_DB.PROPERTY_KEY, spreadsheet.getId());
  }

  var sheetNames = Object.keys(SCRIPT_FLOW_DB.SHEETS);
  var firstSheet = spreadsheet.getSheets()[0];

  sheetNames.forEach(function(sheetName, index) {
    var sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      if (index === 0 && firstSheet &&
          firstSheet.getLastRow() === 0 &&
          firstSheet.getLastColumn() === 0) {
        firstSheet.setName(sheetName);
        sheet = firstSheet;
      } else {
        sheet = spreadsheet.insertSheet(sheetName);
      }
    }

    var headers = SCRIPT_FLOW_DB.SHEETS[sheetName];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.autoResizeColumns(1, headers.length);
    } else {
      var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
        .getDisplayValues()[0];
      headers.forEach(function(header) {
        if (existingHeaders.indexOf(header) === -1) {
          throw new Error(
            'The ' + sheetName + ' tab already contains data but is missing ' +
            'the expected column "' + header + '". No columns were changed.'
          );
        }
      });
    }
  });

  seedInitialAdmin_(spreadsheet);

  var settings = spreadsheet.getSheetByName('Settings');
  upsertSetting_(settings, 'company_domain', 'bilendi.com',
    'Only verified Bilendi Workspace accounts may sign in.');
  upsertSetting_(settings, 'default_role', 'scripter',
    'Role assigned automatically to newly registered users.');
  upsertSetting_(settings, 'initial_admin_email', SCRIPT_FLOW_DB.INITIAL_ADMIN,
    'Initial ScriptFlow administrator account.');

  Logger.log('ScriptFlow Database created/verified: ' + spreadsheet.getUrl());
  return {
    success: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    tabs: sheetNames
  };
}

function seedInitialAdmin_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('Users');
  var email = SCRIPT_FLOW_DB.INITIAL_ADMIN.toLowerCase();
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var emailIndex = headers.indexOf('email');
  var roleIndex = headers.indexOf('role');
  var statusIndex = headers.indexOf('status');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][emailIndex]).toLowerCase().trim() === email) {
      // Promote only the designated initial admin; do not reset other users.
      sheet.getRange(i + 1, roleIndex + 1).setValue('admin');
      sheet.getRange(i + 1, statusIndex + 1).setValue('active');
      return;
    }
  }

  var now = new Date().toISOString();
  var row = headers.map(function(header) {
    if (header === 'user_id') return Utilities.getUuid();
    if (header === 'email') return email;
    if (header === 'full_name') return 'ScriptFlow Administrator';
    if (header === 'role') return 'admin';
    if (header === 'status') return 'active';
    if (header === 'created_at' || header === 'updated_at') return now;
    return '';
  });

  sheet.appendRow(row);
}

function upsertSetting_(sheet, key, value, description) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var keyIndex = headers.indexOf('key');
  var valueIndex = headers.indexOf('value');
  var descriptionIndex = headers.indexOf('description');
  var updatedIndex = headers.indexOf('updated_at');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][keyIndex]) === key) {
      sheet.getRange(i + 1, valueIndex + 1).setValue(value);
      sheet.getRange(i + 1, descriptionIndex + 1).setValue(description);
      sheet.getRange(i + 1, updatedIndex + 1).setValue(new Date().toISOString());
      return;
    }
  }

  var row = [];
  row[keyIndex] = key;
  row[valueIndex] = value;
  row[descriptionIndex] = description;
  row[updatedIndex] = new Date().toISOString();
  sheet.appendRow(headers.map(function(header, index) {
    return row[index] === undefined ? '' : row[index];
  }));
}

/** Returns the spreadsheet URL for the project owner during setup. */
function getScriptFlowDatabaseInfo() {
  var id = PropertiesService.getScriptProperties()
    .getProperty(SCRIPT_FLOW_DB.PROPERTY_KEY);
  if (!id) throw new Error('Run setupScriptFlowDatabase() first.');
  var spreadsheet = SpreadsheetApp.openById(id);
  return {
    spreadsheetId: id,
    spreadsheetUrl: spreadsheet.getUrl(),
    tabs: Object.keys(SCRIPT_FLOW_DB.SHEETS)
  };
}
