require('dotenv').config({ path: '/home/ubuntu/andejiazhengcrm/backend/.env' });
function info(name) {
  const v = process.env[name] || '';
  return { name, len: v.length, tail: v.slice(-4) };
}
console.log(JSON.stringify([
  info('SQB_VENDOR_SN'),
  info('SQB_VENDOR_KEY'),
  info('SQB_APP_ID'),
  info('SQB_WX_APPID'),
  info('SQB_INITIAL_TERMINAL_SN'),
  info('SQB_INITIAL_TERMINAL_KEY'),
]));
