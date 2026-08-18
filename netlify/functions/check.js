const { detectService } = require('../../services/bypasser');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
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
      body: JSON.stringify({ valid: false, error: err.message })
    };
  }
};
