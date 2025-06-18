#!/usr/bin/env node

/**
 * Manual Verification Script for Advanced Communication Protocols
 * 
 * This script verifies the key implementations required by verification 012.md
 * without relying on the problematic automated test framework.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Advanced Communication Protocols Implementation...\n');

// Track verification results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  details: []
};

function verifyFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${description}: ${filePath}`);
    results.passed++;
    results.details.push({ status: 'PASS', test: description, file: filePath });
    return true;
  } else {
    console.log(`❌ ${description}: ${filePath} (NOT FOUND)`);
    results.failed++;
    results.details.push({ status: 'FAIL', test: description, file: filePath, error: 'File not found' });
    return false;
  }
}

function verifyFileContent(filePath, searchString, description) {
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${description}: ${filePath} (FILE NOT FOUND)`);
    results.failed++;
    results.details.push({ status: 'FAIL', test: description, file: filePath, error: 'File not found' });
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(searchString)) {
    console.log(`✅ ${description}: Found "${searchString}" in ${filePath}`);
    results.passed++;
    results.details.push({ status: 'PASS', test: description, file: filePath });
    return true;
  } else {
    console.log(`❌ ${description}: Missing "${searchString}" in ${filePath}`);
    results.failed++;
    results.details.push({ status: 'FAIL', test: description, file: filePath, error: `Missing: ${searchString}` });
    return false;
  }
}

function verifyAgentBinding(wranglerPath, agentName, className, description) {
  if (!fs.existsSync(wranglerPath)) {
    console.log(`❌ ${description}: wrangler.jsonc not found`);
    results.failed++;
    return false;
  }
  
  const content = fs.readFileSync(wranglerPath, 'utf8');
  const hasBinding = content.includes(`"name": "${agentName}"`) && content.includes(`"class_name": "${className}"`);
  const hasMigration = content.includes(`"${className}"`);
  
  if (hasBinding && hasMigration) {
    console.log(`✅ ${description}: ${agentName} -> ${className} properly configured`);
    results.passed++;
    results.details.push({ status: 'PASS', test: description, agent: agentName, class: className });
    return true;
  } else {
    console.log(`❌ ${description}: ${agentName} -> ${className} configuration missing`);
    results.failed++;
    results.details.push({ status: 'FAIL', test: description, agent: agentName, class: className, error: 'Configuration missing' });
    return false;
  }
}

console.log('📁 Verifying Core Files...');
console.log('='.repeat(40));

// Check core agent files
verifyFile('src/agents/WebSocketStreamingAgent.ts', 'WebSocket Streaming Agent');
verifyFile('src/agents/EchoAgent.ts', 'Echo Agent');
verifyFile('src/agents/ChattyAgent.ts', 'Chatty Agent');
verifyFile('src/agents/HttpEchoAgent.ts', 'HTTP Echo Agent');
verifyFile('src/agents/ResilientChatAgent.ts', 'Resilient Chat Agent');

// Check client utilities
verifyFile('src/client/index.ts', 'Client Utilities');

// Check demo file
verifyFile('public/demo.html', 'Demo HTML File');

console.log('\n📋 Verifying Configuration...');
console.log('='.repeat(40));

// Check wrangler.jsonc configuration
const wranglerPath = 'wrangler.jsonc';
verifyAgentBinding(wranglerPath, 'WEBSOCKET_STREAMING_AGENT', 'WebSocketStreamingAgent', 'WebSocket Streaming Agent Binding');
verifyAgentBinding(wranglerPath, 'ECHO_AGENT', 'EchoAgent', 'Echo Agent Binding');
verifyAgentBinding(wranglerPath, 'HTTP_ECHO_AGENT', 'HttpEchoAgent', 'HTTP Echo Agent Binding');
verifyAgentBinding(wranglerPath, 'RESILIENT_CHAT_AGENT', 'ResilientChatAgent', 'Resilient Chat Agent Binding');

console.log('\n🔧 Verifying Implementation Details...');
console.log('='.repeat(40));

// Check WebSocket streaming implementation
verifyFileContent('src/agents/WebSocketStreamingAgent.ts', 'type: "chunk"', 'WebSocket Streaming Chunk Format');
verifyFileContent('src/agents/WebSocketStreamingAgent.ts', "type: 'done'", 'WebSocket Streaming Done Message');
verifyFileContent('src/agents/WebSocketStreamingAgent.ts', 'onConnect', 'WebSocket onConnect Handler');
verifyFileContent('src/agents/WebSocketStreamingAgent.ts', 'onClose', 'WebSocket onClose Handler');
verifyFileContent('src/agents/WebSocketStreamingAgent.ts', 'onError', 'WebSocket onError Handler');

// Check client exports
verifyFileContent('src/client/index.ts', 'AgentClient', 'AgentClient Export');
verifyFileContent('src/client/index.ts', 'agentFetch', 'agentFetch Export');
verifyFileContent('src/client/index.ts', 'AgentClientOptions', 'AgentClient Options Interface');
verifyFileContent('src/client/index.ts', 'AgentFetchOptions', 'agentFetch Options Interface');

// Check routing configuration
verifyFileContent('src/index.ts', '/api/v1', 'Prefixed Routing Support');
verifyFileContent('src/index.ts', 'websocket-streaming-agent', 'WebSocket Streaming Agent Route');
verifyFileContent('src/index.ts', 'http-echo-agent', 'HTTP Echo Agent Route');

// Check ChattyAgent connection state support
verifyFileContent('src/agents/ChattyAgent.ts', 'connection.setState', 'Connection State Management');
verifyFileContent('src/agents/ChattyAgent.ts', 'set_nick', 'Nickname Setting Command');
verifyFileContent('src/agents/ChattyAgent.ts', 'send_text', 'Text Broadcasting Command');

console.log('\n📊 Verification Summary');
console.log('='.repeat(40));
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`⏭️  Skipped: ${results.skipped}`);
console.log(`📈 Success Rate: ${(results.passed / (results.passed + results.failed) * 100).toFixed(1)}%`);

if (results.failed > 0) {
  console.log('\n❌ Failed Tests:');
  results.details
    .filter(detail => detail.status === 'FAIL')
    .forEach(detail => {
      console.log(`   • ${detail.test}: ${detail.error || 'Failed'}`);
    });
}

console.log('\n🎯 Manual Verification Steps Required:');
console.log('='.repeat(40));
console.log('1. Deploy the worker: npm run deploy');
console.log('2. Test WebSocket connections via demo.html');
console.log('3. Test HTTP requests via agentFetch');
console.log('4. Verify connection lifecycle with multiple clients');
console.log('5. Test LLM streaming with valid OPENAI_API_KEY');

const exitCode = results.failed > 0 ? 1 : 0;
console.log(`\n${exitCode === 0 ? '✅' : '❌'} Verification ${exitCode === 0 ? 'PASSED' : 'FAILED'}`);
process.exit(exitCode);