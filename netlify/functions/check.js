const { detectService } = require('../../services/bypasser');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Anti-Bot Filter
  const userAgent = (event.headers['user-agent'] || '').toLowerCase();
  const blockedBots = ['python-requests', 'aiohttp', 'curl/', 'wget/', 'scrapy', 'postmanruntime'];
  if (blockedBots.some(bot => userAgent.includes(bot))) {
    return { statusCode: 403, headers, body: JSON.stringify({ valid: false, error: 'Access Denied' }) };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    if (!body.url) {
      return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'URL diperlukan' }) };
    }

    const serviceName = detectService(body.url);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ valid: true, service: serviceName, url: body.url })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: 'Internal Error' })
    };
  }
};
