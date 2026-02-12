#!/usr/bin/env node

/**
 * Simple test to verify Express server is running
 */

const http = require('http');

function testServer() {
  console.log('🧪 Testing Express server at http://localhost:5000...');
  
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/health',
    method: 'GET',
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    console.log(`📡 Response status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log('✅ Server is running!');
        console.log('📄 Response:', JSON.stringify(response, null, 2));
        console.log('\n🎉 You can now test the React form!');
      } catch (error) {
        console.log('❌ Invalid JSON response:', data);
      }
    });
  });

  req.on('error', (error) => {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ ERR_CONNECTION_REFUSED: Server is not running');
      console.log('💡 Start the server with: node server-minimal.js');
    } else {
      console.log('❌ Error:', error.message);
    }
    process.exit(1);
  });

  req.on('timeout', () => {
    console.log('❌ Request timed out');
    req.destroy();
    process.exit(1);
  });

  req.end();
}

testServer();
