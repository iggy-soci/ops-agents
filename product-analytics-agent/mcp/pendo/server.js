#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PENDO_API_KEY = process.env.PENDO_API_KEY;
const PENDO_BASE_URL = "https://app.pendo.io/api/v1";

if (!PENDO_API_KEY) {
  console.error("[pendo-mcp] PENDO_API_KEY environment variable is required");
  process.exit(1);
}

async function pendoGet(path, params = {}) {
  const url = new URL(`${PENDO_BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: {
      "x-pendo-integration-key": PENDO_API_KEY,
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pendo GET ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function pendoPost(path, body) {
  const res = await fetch(`${PENDO_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "x-pendo-integration-key": PENDO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pendo POST ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

function buildAggregation({ pipeline, timeSeries, rowsPerPage = 50 } = {}) {
  const body = { response: { mimeType: "application/json" } };
  if (timeSeries) body.timeSeries = timeSeries;
  if (pipeline) body.request = { pipeline, requestId: `mcp-${Date.now()}` };
  if (rowsPerPage) body.rowsPerPage = rowsPerPage;
  return body;
}

const server = new McpServer({
  name: "pendo",
  version: "1.0.0",
  description: "Pendo product analytics",
});

server.tool("list_features", "List all tracked Pendo features.", { appId: z.string().optional() },
  async ({ appId }) => {
    const data = await pendoGet("/feature", appId ? { appId } : {});
    const features = Array.isArray(data) ? data : Object.values(data);
    const rows = features.slice(0, 100).map((f) => ({ id: f.id, name: f.name, appId: f.appId, kind: f.kind }));
    return { content: [{ type: "text", text: JSON.stringify({ total: features.length, features: rows }, null, 2) }] };
  }
);

server.tool("get_feature_adoption", "Get adoption metrics for a Pendo feature.",
  { featureId: z.string(), startDate: z.string(), endDate: z.string(), granularity: z.enum(["daily","weekly","monthly"]).default("daily") },
  async ({ featureId, startDate, endDate, granularity }) => {
    const granMap = { daily: "dayRange", weekly: "weekRange", monthly: "monthRange" };
    const body = buildAggregation({
      pipeline: [
        { source: { featureEvents: { featureId } } },
        { group: { group: ["visitorId", "accountId", "day"], fields: [{ count: null, alias: "numEvents" }] } },
      ],
      timeSeries: { period: granMap[granularity], first: startDate, last: endDate },
    });
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("list_pages", "List all tracked Pendo pages.", { appId: z.string().optional() },
  async ({ appId }) => {
    const data = await pendoGet("/page", appId ? { appId } : {});
    const pages = Array.isArray(data) ? data : Object.values(data);
    const rows = pages.slice(0, 100).map((p) => ({ id: p.id, name: p.name, appId: p.appId }));
    return { content: [{ type: "text", text: JSON.stringify({ total: pages.length, pages: rows }, null, 2) }] };
  }
);

server.tool("get_page_analytics", "Get page view metrics for a Pendo page.",
  { pageId: z.string(), startDate: z.string(), endDate: z.string(), granularity: z.enum(["daily","weekly","monthly"]).default("daily") },
  async ({ pageId, startDate, endDate, granularity }) => {
    const granMap = { daily: "dayRange", weekly: "weekRange", monthly: "monthRange" };
    const body = buildAggregation({
      pipeline: [
        { source: { pageEvents: { pageId } } },
        { group: { group: ["visitorId", "accountId", "day"], fields: [{ count: null, alias: "numViews" }] } },
      ],
      timeSeries: { period: granMap[granularity], first: startDate, last: endDate },
    });
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("list_guides", "List all Pendo in-app guides.", { state: z.enum(["public","staged","draft","disabled"]).optional() },
  async ({ state }) => {
    const data = await pendoGet("/guide");
    const guides = Array.isArray(data) ? data : Object.values(data);
    const filtered = state ? guides.filter((g) => g.state === state) : guides;
    const rows = filtered.slice(0, 100).map((g) => ({ id: g.id, name: g.name, state: g.state, appId: g.appId }));
    return { content: [{ type: "text", text: JSON.stringify({ total: filtered.length, guides: rows }, null, 2) }] };
  }
);

server.tool("get_guide_metrics", "Get display and completion metrics for a Pendo guide.",
  { guideId: z.string(), startDate: z.string(), endDate: z.string() },
  async ({ guideId, startDate, endDate }) => {
    const body = buildAggregation({
      pipeline: [
        { source: { guideEvents: { guideId } } },
        { group: { group: ["type"], fields: [{ count: null, alias: "count" }, { countDistinct: "visitorId", alias: "uniqueVisitors" }] } },
      ],
      timeSeries: { period: "dayRange", first: startDate, last: endDate },
    });
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("list_segments", "List all Pendo segments.", {},
  async () => {
    const data = await pendoGet("/segment");
    const segs = Array.isArray(data) ? data : Object.values(data);
    const rows = segs.map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
    return { content: [{ type: "text", text: JSON.stringify({ total: rows.length, segments: rows }, null, 2) }] };
  }
);

server.tool("list_accounts", "List Pendo accounts with optional filtering.",
  { limit: z.number().int().min(1).max(500).default(50), filter: z.string().optional() },
  async ({ limit, filter }) => {
    const pipeline = [{ source: { accounts: null } }];
    if (filter) pipeline.push({ filter });
    const body = buildAggregation({ pipeline, rowsPerPage: limit });
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("get_account_details", "Get full details for a specific Pendo account.",
  { accountId: z.string() },
  async ({ accountId }) => {
    const data = await pendoGet(`/account/${accountId}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("get_nps_data", "Get NPS survey responses and trends.",
  { startDate: z.string(), endDate: z.string(), granularity: z.enum(["daily","weekly","monthly"]).default("monthly") },
  async ({ startDate, endDate, granularity }) => {
    const granMap = { daily: "dayRange", weekly: "weekRange", monthly: "monthRange" };
    const body = buildAggregation({
      pipeline: [
        { source: { pollSubmissions: null } },
        { group: { group: ["rating"], fields: [{ count: null, alias: "responses" }, { countDistinct: "visitorId", alias: "uniqueRespondents" }] } },
      ],
      timeSeries: { period: granMap[granularity], first: startDate, last: endDate },
    });
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("run_aggregation", "Run a raw Pendo aggregation pipeline for custom metrics.",
  { pipeline: z.array(z.record(z.unknown())), timeSeries: z.record(z.unknown()).optional(), rowsPerPage: z.number().int().default(100) },
  async ({ pipeline, timeSeries, rowsPerPage }) => {
    const body = buildAggregation({ pipeline, timeSeries, rowsPerPage });
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[pendo-mcp] Server running on stdio");
