function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const body = JSON.parse(e.postData.contents);
    if (!props.getProperty('RELAY_KEY') || body.key !== props.getProperty('RELAY_KEY')) {
      return json_({ ok: false, error: 'Clé de passerelle invalide.' });
    }
    const pdf = Utilities.base64Decode(body.pdf);
    const url = props.getProperty('PA_INVOICES_URL') + '?external_id=' + encodeURIComponent(body.invoiceNumber);
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/pdf',
      payload: pdf,
      headers: { Authorization: 'Bearer ' + token_(props) },
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const data = parse_(res.getContentText()) || {};
    if (code >= 300) {
      return json_({ ok: false, error: data.message || data.error || 'Refus de la plateforme (HTTP ' + code + ').' });
    }
    return json_({ ok: true, id: data.id || data.flowId || '', status: data.status || 'déposée' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function token_(props) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('pa_token');
  if (cached) return cached;
  const res = UrlFetchApp.fetch(props.getProperty('PA_TOKEN_URL'), {
    method: 'post',
    payload: {
      grant_type: 'client_credentials',
      client_id: props.getProperty('PA_CLIENT_ID'),
      client_secret: props.getProperty('PA_CLIENT_SECRET')
    },
    muteHttpExceptions: true
  });
  const data = parse_(res.getContentText()) || {};
  if (!data.access_token) throw new Error('Authentification à la plateforme agréée refusée.');
  cache.put('pa_token', data.access_token, Math.min(21600, Math.max(60, (data.expires_in || 3600) - 120)));
  return data.access_token;
}

function parse_(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
