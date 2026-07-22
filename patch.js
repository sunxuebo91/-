const fs = require('fs');
const file = '/home/ubuntu/andejiazhengcrm/backend/src/modules/payment-qr/payment-qr.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /\/\/\s*显式指定支付宝扫码模式[\s\S]*?payway:\s*'1',\s*subPayway:\s*'4',/g,
  // 注释掉硬编码的 payway，让收钱吧的网关(wap2)根据扫码客户端自动路由\n      // payway: '1',\n      // subPayway: '4',
);

fs.writeFileSync(file, code);
console.log('Patched backend payment service');