require('dotenv').config({ path: '/home/ubuntu/andejiazhengcrm/backend/.env' });
const crypto = require('crypto');
const https = require('https');

const SN = process.env.SQB_INITIAL_TERMINAL_SN;
const KEY = process.env.SQB_INITIAL_TERMINAL_KEY;

function sqbRequest(apiPath, body, creds) {
  const bodyStr = JSON.stringify(body);
  const sign = crypto.createHash('md5').update(bodyStr + creds.key, 'utf8').digest('hex');
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'vsi-api.shouqianba.com',
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Authorization': creds.sn + ' ' + sign,
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

(async () => {
  const body = { terminal_sn: SN, device_id: 'andecrm-nestjs-01' };
  const res = await sqbRequest('/terminal/checkin', body, { sn: SN, key: KEY });
  // redact any key-looking field before printing
  if (res && res.biz_response && res.biz_response.terminal_key) {
    res.biz_response.terminal_key = '[REDACTED len=' + res.biz_response.terminal_key.length + ']';
  }
  console.log(JSON.stringify(res));
})().catch(e => console.error('ERR', e.message));
