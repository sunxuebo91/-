const https = require('https');
const crypto = require('crypto');

const SQB = {
  API_DOMAIN: 'vsi-api.shouqianba.com',
  VENDOR_SN: '91803277',
  VENDOR_KEY: '8740db8e9790eecbbc861443cda99807',
  APP_ID: '2026040200010986',
  DEVICE_ID: 'andecrm-nestjs-01',
  ACTIVATE_CODE: '76295386',
};

function sqbRequest(apiPath, body, creds) {
  const bodyStr = JSON.stringify(body);
  const sign = crypto.createHash('md5').update(bodyStr + creds.key, 'utf8').digest('hex');
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: SQB.API_DOMAIN,
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
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const body = { app_id: SQB.APP_ID, code: SQB.ACTIVATE_CODE, device_id: SQB.DEVICE_ID };
  console.log('Requesting activate with:', body);
  const res = await sqbRequest('/terminal/activate', body, {
    sn: SQB.VENDOR_SN, key: SQB.VENDOR_KEY,
  });
  console.log('Response:', res);
}
main().catch(console.error);