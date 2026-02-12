#!/usr/bin/env node

/**
 * Quick test script for the Express backend
 * Run this to verify the server is working correctly
 */

const http = require('http');

async function testHealthEndpoint() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function main() {
  console.log('🧪 Testing Express Backend...');
  console.log('📍 Testing health endpoint at http://localhost:5000/api/health');
  
  try {
    const result = await testHealthEndpoint();
    console.log('✅ Health check successful:', result);
    console.log('\n🎉 Backend server is running correctly!');
    console.log('📝 You can now test the React form submission.');
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Backend server is not running.');
      console.log('💡 Please start the server with: node server.js');
    } else {
      console.log('❌ Error testing backend:', error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testHealthEndpoint };
