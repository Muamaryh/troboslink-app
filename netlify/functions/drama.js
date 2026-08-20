const { getSources, getFeed, searchDramas, getDramaDetail, getDramaEpisode } = require('../../services/anichin');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path || '';
  const query = event.queryStringParameters || {};
  const action = query.action || path.split('/').pop();

  try {
    if (action === 'sources') {
      const sources = getSources();
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, sources }) };
    }

    if (action === 'feed') {
      const { source = 'dramabox', type = 'trending', page = 1 } = query;
      const feed = await getFeed(source, type, Number(page));
      return { statusCode: 200, headers, body: JSON.stringify(feed) };
    }

    if (action === 'search') {
      const { source = 'dramabox', q = query.query || '' } = query;
      const results = await searchDramas(source, q);
      return { statusCode: 200, headers, body: JSON.stringify(results) };
    }

    if (action === 'detail') {
      const { source = 'dramabox', id } = query;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'ID drama diperlukan' }) };
      const detail = await getDramaDetail(source, id);
      return { statusCode: 200, headers, body: JSON.stringify(detail) };
    }

    if (action === 'episode') {
      const { source = 'dramabox', id, ep = 1 } = query;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'ID drama diperlukan' }) };
      const episode = await getDramaEpisode(source, id, Number(ep));
      return { statusCode: 200, headers, body: JSON.stringify(episode) };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Invalid drama action' })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
