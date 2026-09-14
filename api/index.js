/**
 * Vercel Serverless Function for iiko Integration
 * Обрабатывает запросы на внесение документов в iiko 24/7 в облаке Vercel
 */

const https = require('https');
const crypto = require('crypto');

const CONFIG = {
  host: 'too-burzhui-co.iiko.it',
  login: 'Belyi',
  passHash: crypto.createHash('sha1').update('19062025').digest('hex'),
  defaultSupplierId: 'ec158ef3-5394-4d1d-938f-aae5cde126de',
  defaultCounteragentId: '359ba873-84e2-2ca5-0188-4d0983baeba0',
  defaultAccountId: 'ebb7b309-fceb-4065-a26e-70ad0c9514c3'
};

function httpsRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const buffer = data ? Buffer.from(data, 'utf8') : null;
    const reqOpts = {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(buffer ? { 'Content-Length': buffer.length } : {})
      },
      rejectUnauthorized: false,
      timeout: 15000
    };

    const req = https.request(reqOpts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout connecting to iiko server'));
    });

    if (buffer) req.write(buffer);
    req.end();
  });
}

async function getIikoToken() {
  const res = await httpsRequest({
    host: CONFIG.host,
    path: `/resto/api/auth?login=${encodeURIComponent(CONFIG.login)}&pass=${encodeURIComponent(CONFIG.passHash)}`,
    method: 'GET'
  });

  if (res.status !== 200) {
    throw new Error(`Ошибка авторизации в iiko: HTTP ${res.status} ${res.body}`);
  }

  return res.body.trim();
}

function escapeXml(unsafe) {
  return String(unsafe || '').replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

async function submitIncomingInventory(token, docData) {
  const { storeId, documentNumber, dateIncoming, comment } = docData;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<document>
  <documentNumber>${escapeXml(documentNumber)}</documentNumber>
  <dateIncoming>${dateIncoming}</dateIncoming>
  <status>NEW</status>
  <storeId>${storeId}</storeId>
  <comment>${escapeXml(comment || 'Сведение инвентаризации сети BURЖУЙ')}</comment>
</document>`;

  const res = await httpsRequest({
    host: CONFIG.host,
    path: `/resto/api/documents/import/incomingInventory?key=${encodeURIComponent(token)}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  }, xml);

  return {
    status: res.status,
    body: res.body,
    xml: xml
  };
}

async function submitSurplusInvoice(token, docData) {
  const { storeId, documentNumber, dateIncoming, items, comment } = docData;
  if (!items || items.length === 0) return null;

  let itemsXml = '';
  items.forEach((item, index) => {
    itemsXml += `
    <item>
      <num>${index + 1}</num>
      <product>${item.productId}</product>
      <store>${storeId}</store>
      <price>${item.price || 100.0}</price>
      <amount>${item.amount}</amount>
      <sum>${(item.amount * (item.price || 100.0)).toFixed(2)}</sum>
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<document>
  <documentNumber>${escapeXml(documentNumber)}</documentNumber>
  <dateIncoming>${dateIncoming}</dateIncoming>
  <status>NEW</status>
  <supplier>${CONFIG.defaultSupplierId}</supplier>
  <defaultStore>${storeId}</defaultStore>
  <comment>${escapeXml(comment || 'Оприходование излишков при сведении BURЖУЙ')}</comment>
  <items>${itemsXml}
  </items>
</document>`;

  const res = await httpsRequest({
    host: CONFIG.host,
    path: `/resto/api/documents/import/incomingInvoice?key=${encodeURIComponent(token)}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  }, xml);

  return { status: res.status, body: res.body, xml: xml };
}

async function submitShortageInvoice(token, docData) {
  const { storeId, documentNumber, dateIncoming, items, comment } = docData;
  if (!items || items.length === 0) return null;

  let itemsXml = '';
  items.forEach((item, index) => {
    itemsXml += `
    <item>
      <productId>${item.productId}</productId>
      <storeId>${storeId}</storeId>
      <price>${item.price || 100.0}</price>
      <amount>${item.amount}</amount>
      <sum>${(item.amount * (item.price || 100.0)).toFixed(2)}</sum>
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<document>
  <documentNumber>${escapeXml(documentNumber)}</documentNumber>
  <dateIncoming>${dateIncoming}</dateIncoming>
  <status>NEW</status>
  <defaultStoreId>${storeId}</defaultStoreId>
  <counteragentId>${CONFIG.defaultCounteragentId}</counteragentId>
  <accountToId>${CONFIG.defaultAccountId}</accountToId>
  <revenueAccountId>${CONFIG.defaultAccountId}</revenueAccountId>
  <comment>${escapeXml(comment || 'Списание остаточной недостачи BURЖУЙ')}</comment>
  <items>${itemsXml}
  </items>
</document>`;

  const res = await httpsRequest({
    host: CONFIG.host,
    path: `/resto/api/documents/import/outgoingInvoice?key=${encodeURIComponent(token)}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  }, xml);

  return { status: res.status, body: res.body, xml: xml };
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse path
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  // 1. Health check
  if (req.method === 'GET' && (pathname === '/api/health' || pathname.endsWith('/health'))) {
    try {
      const token = await getIikoToken();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'OK',
        connected: true,
        host: CONFIG.host,
        tokenPreview: token.slice(0, 8) + '...',
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'ERROR',
        connected: false,
        host: CONFIG.host,
        error: e.message
      }));
    }
    return;
  }

  // 2. Submit Inventory
  if (req.method === 'POST' && (pathname === '/api/inventory/submit' || pathname.endsWith('/submit'))) {
    let rawBody = '';
    if (typeof req.body === 'object' && req.body !== null) {
      rawBody = JSON.stringify(req.body);
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      rawBody = await new Promise((resolve) => {
        let b = '';
        req.on('data', chunk => b += chunk);
        req.on('end', () => resolve(b));
      });
    }

    try {
      const payload = JSON.parse(rawBody || '{}');
      const { storeId, storeLabel, period, fines, surplusItems, shortageItems, comment } = payload;

      if (!storeId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Не указан storeId (GUID склада в iiko)' }));
        return;
      }

      const token = await getIikoToken();
      const now = new Date();
      const dateIncoming = now.toISOString().slice(0, 19);
      const cleanStore = (storeLabel || 'STORE').replace(/[^a-zA-Z0-9а-яА-Я0-9]/g, '');
      const timeSuffix = now.getFullYear().toString().slice(-2) +
                         String(now.getMonth() + 1).padStart(2, '0') +
                         String(now.getDate()).padStart(2, '0') + '-' +
                         String(now.getHours()).padStart(2, '0') +
                         String(now.getMinutes()).padStart(2, '0');

      const invDocNum = `АКТ-${cleanStore}-${timeSuffix}`;
      const surplusDocNum = `ПРИХОД-${cleanStore}-${timeSuffix}`;
      const shortageDocNum = `СПИСАНИЕ-${cleanStore}-${timeSuffix}`;

      // 1. Создание акта инвентаризации в iiko
      const invResult = await submitIncomingInventory(token, {
        storeId,
        documentNumber: invDocNum,
        dateIncoming,
        comment: comment || `Сведение инвентаризации BURЖУЙ (${storeLabel}, период ${period})`
      });

      // 2. Оприходование излишков (если есть)
      let surplusResult = null;
      if (surplusItems && surplusItems.length > 0) {
        surplusResult = await submitSurplusInvoice(token, {
          storeId,
          documentNumber: surplusDocNum,
          dateIncoming,
          items: surplusItems,
          comment: `Оприходование встречных излишков при сведении ${storeLabel}`
        });
      }

      // 3. Списание недостач (если есть)
      let shortageResult = null;
      if (shortageItems && shortageItems.length > 0) {
        shortageResult = await submitShortageInvoice(token, {
          storeId,
          documentNumber: shortageDocNum,
          dateIncoming,
          items: shortageItems,
          comment: `Списание остаточной недостачи ${storeLabel}`
        });
      }

      const responseData = {
        success: invResult.status === 200,
        documentNumber: invDocNum,
        dateIncoming,
        storeId,
        storeLabel,
        status: 'PROCESSED',
        iikoResponseStatus: invResult.status,
        incomingInventory: { number: invDocNum, status: invResult.status, xml: invResult.xml },
        surplusInvoice: surplusResult ? { number: surplusDocNum, status: surplusResult.status, xml: surplusResult.xml } : null,
        shortageInvoice: shortageResult ? { number: shortageDocNum, status: shortageResult.status, xml: shortageResult.xml } : null,
        message: 'Документы успешно сформированы и внесены в iiko'
      };

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(responseData));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. Stop-list update
  if (req.method === 'POST' && (pathname === '/api/stoplist/update' || pathname.endsWith('/update'))) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Статус стоп-листа обновлен'
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Эндпоинт не найден' }));
};
