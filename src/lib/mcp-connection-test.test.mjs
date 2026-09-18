import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testMcpConnection } from './mcp-connection-test.ts';

test('test sends key only to fixed same-origin endpoint and discovers tools without invocation', async () => {
  const methods = [];
  const result = await testMcpConnection('oc_live_test', async (url, options) => {
    assert.equal(url, '/mcp');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer oc_live_test');
    const request = JSON.parse(options.body);
    methods.push(request.method);
    return Response.json({jsonrpc:'2.0', id:request.id, result: request.method === 'initialize'
      ? {serverInfo:{name:'open-connect'},protocolVersion:'2025-06-18'} : {tools:[{name:'search'}]}});
  });
  assert.deepEqual(methods, ['initialize','tools/list']);
  assert.equal(result.toolCount, 1);
});

test('rejects invalid/revoked token and never displays response body', async () => {
  await assert.rejects(testMcpConnection('oc_live_test', async () => new Response('sensitive', {status:401})), /invalid or revoked/);
});

test('rejects unsuccessful JSON-RPC responses', async () => {
  await assert.rejects(testMcpConnection('oc_live_test', async () => Response.json({jsonrpc:'2.0',id:1,error:{message:'sensitive'}})), /invalid or unsuccessful/);
});

test('rejects malformed discovery instead of reporting success', async () => {
  await assert.rejects(testMcpConnection('oc_live_test', async (_,options) => {
    const req=JSON.parse(options.body);
    return Response.json({jsonrpc:'2.0',id:req.id,result:req.id===1 ? {serverInfo:{name:'open-connect'},protocolVersion:'2025-06-18'} : {}});
  }), /discovery failed/);
});
