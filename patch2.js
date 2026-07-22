const fs = require('fs');
const file = '/home/ubuntu/andejiazhengcrm/backend/src/modules/payment-qr/payment-qr.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /notifyUrl:\s*\\\\$\\\{baseUrl\\\}\\/api\\/payment-callback\,\s*undefined/g,
  "notifyUrl: \\/api/payment-callback\"
);

fs.writeFileSync(file, code);
console.log('Fixed undefined in patch');