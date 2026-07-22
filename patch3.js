const fs = require('fs');
const file = '/home/ubuntu/andejiazhengcrm/backend/src/modules/payment-qr/payment-qr.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/payway:\s*'1',/g, '// payway: 1,');
code = code.replace(/subPayway:\s*'4',/g, '// subPayway: 4,');

fs.writeFileSync(file, code);
console.log('Fixed payway');