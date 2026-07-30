const http = require('http');
function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve({raw: data}); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
async function test() {
  try {
    // First send verification code
    const sendResult = await makeRequest('/api/auth/send-code', 'POST', {phone:'13800138000'});
    console.log('Send code:', sendResult.code === 0 ? 'OK' : sendResult.message);
    
    // Then login with fixed dev code
    const loginResult = await makeRequest('/api/auth/login', 'POST', {login:'13800138000',code:'123456'});
    console.log('Login:', loginResult.code === 0 ? 'OK' : loginResult.message);
    
    if (loginResult.data && loginResult.data.token) {
      const token = loginResult.data.token;
      console.log('Token: ' + token.substring(0, 30) + '...');
      
      // Test chat/messages
      const messagesResult = await makeRequest('/api/chat/messages?conversation_id=10&limit=50', 'GET', null);
      // Need to add auth header for messages
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/chat/messages?conversation_id=10&limit=50',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        }
      };
      const messagesData = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
      });
      console.log('Messages code:', messagesData.code);
      console.log('Messages count:', messagesData.data ? messagesData.data.length : 0);
      if (messagesData.data && messagesData.data.length > 0) {
        console.log('First message sender_nickname:', messagesData.data[0].sender_nickname);
        console.log('First message content:', messagesData.data[0].content);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
