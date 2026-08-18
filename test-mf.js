const axios = require('axios');
const cheerio = require('cheerio');
const { resolveBypass } = require('./services/bypasser');

(async () => {
  const url = 'https://www.mediafire.com/file/u5p8w9sk9j09vin/GKsTIeO-S2-07-FULLHD-MP4-SAMEHADAKU.CARE.rar/file';
  const res = await resolveBypass(url);
  console.log('MediaFire Bypass Result:', JSON.stringify(res, null, 2));
})();
