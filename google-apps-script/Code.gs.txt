/**
 * US Debt Support — append leads to the bound spreadsheet.
 *
 * Setup:
 * 1. Create a Sheet; name the tab "Leads"; set row 1 headers as in HEADERS.txt.
 * 2. Extensions → Apps Script; paste this file.
 * 3. Project Settings → Script properties → SHEET_SHARED_SECRET = long random string.
 * 4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * 5. Copy the /exec URL into server env GOOGLE_APPS_SCRIPT_URL.
 */
function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty('SHEET_SHARED_SECRET');
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'invalid_json' });
  }

  if (!secret || data.sheet_shared_secret !== secret) {
    return jsonResponse({ ok: false, error: 'unauthorized' });
  }

  var row = [
    data.received_at_utc || new Date().toISOString(),
    data.first_name || '',
    data.last_name || '',
    data.email || '',
    data.phone || '',
    data.debt_amount || '',
    data.brand || '',
    data.source_domain || '',
    data.landing_page_url || '',
    data.referrer || '',
    data.utm_source || '',
    data.utm_medium || '',
    data.utm_campaign || '',
    data.utm_content || '',
    data.utm_term || '',
    data.user_agent || '',
    data.screen_resolution || '',
    data.language || '',
    data.maid || '',
    data.page_load_time || '',
    data.consent_timestamp || '',
    data.submission_time || '',
    data.tcpa_consent || '',
    data.tcpa_language || '',
    data.sub1 || '',
    data.sub2 || '',
    data.sub3 || '',
    data.sub4 || '',
    data.sub54 || ''
  ];

  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads').appendRow(row);
  return jsonResponse({ ok: true });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
