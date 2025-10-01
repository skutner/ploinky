// AgentClient: minimal MCP client wrapper used by RoutingServer.
// Not a class; exposes factory returning concrete methods for MCP interactions.

import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

function createAgentClient(baseUrl) {
  let client = null;
  let transport = null;
  let connected = false;

  async function connect() {
    if (connected && client && transport) return;
    transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    client = new Client({ name: 'ploinky-router', version: '1.0.0' });
    await client.connect(transport);
    connected = true;
  }

  async function listTools() {
    await connect();
    const { tools } = await client.listTools({});
    return tools || [];
  }

  async function callTool(name, args) {
    await connect();
    const result = await client.callTool({ name, arguments: args || {} });
    return result;
  }

  async function listResources() {
    await connect();
    const { resources } = await client.listResources({});
    return resources || [];
  }

  async function readResource(uri) {
    await connect();
    const res = await client.readResource({ uri });
    return res;
  }

  async function close() {
    try { if (client) await client.close(); } catch (_) {}
    try { if (transport) await transport.close?.(); } catch (_) {}
    connected = false; client = null; transport = null;
  }

  return { connect, listTools, callTool, listResources, readResource, close };
}

export { createAgentClient };
