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

// Fixed: timeSeries must be a top-level key alongside request, not nested inside it
function buildTimeSeriesAggregation({ source, filters = [], groupBy, fields, startDate, endDate, period, rowsPerPage = 50 }) {
  const pipeline = [{ source }];
  if (filters.length) filters.forEach(f => pipeline.push({ filter: f }));
  if (groupBy || fields) {
    pipeline.push({
      group: {
        group: groupBy || [],
        fields: fields || [{ count: null, alias: "count" }]
      }
    });
  }

  return {
    response: { mimeType: "application/json" },
    // timeSeries at TOP level — this is the fix
    timeSeries: {
      period: period || "dayRange",
      first: startDate,
      last: endDate,
    },
    request: {
      pipeline,
      requestId: `mcp-${Date.now()}`,
      sort: [{ field: "count", order: -1 }],
    },
    rowsPerPage,
  };
}

const server = new McpServer({
  name: "pendo",
  version: "1.1.0",
  description: "Pendo product analytics — features, pages, guides, NPS, segments, accounts",
});

server.tool("list_features", "List all tracked Pendo features. Use appId=-323232 for SOCi.",
  { appId: z.string().optional() },
  async ({ appId }) => {
    const data = await pendoGet("/feature", appId ? { appId } : {});
    const features = Array.isArray(data) ? data : Object.values(data);
    const rows = features.slice(0, 100).map((f) => ({
      id: f.id, name: f.name, appId: f.appId, kind: f.kind,
    }));
    return { content: [{ type: "text", text: JSON.stringify({ total: features.length, features: rows }, null, 2) }] };
  }
);

server.tool("get_feature_adoption",
  "Get adoption metrics for a Pendo feature over a date range. Returns clicks and unique visitors per day/week/month.",
  {
    featureId: z.string().describe("Pendo feature ID"),
    startDate: z.string().describe("Start date YYYY-MM-DD"),
    endDate: z.string().describe("End date YYYY-MM-DD"),
    granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  },
  async ({ featureId, startDate, endDate, granularity }) => {
    const periodMap = { daily: "dayRange", weekly: "weekRange", monthly: "monthRange" };

    // Fixed aggregation structure
    const body = {
      response: { mimeType: "application/json" },
      timeSeries: {
        period: periodMap[granularity],
        first: startDate,
        last: endDate,
      },
      request: {
        pipeline: [
          { source: { featureEvents: { featureId } } },
          {
            group: {
              group: ["visitorId", "accountId"],
              fields: [
                { count: null, alias: "numClicks" },
              ],
            },
          },
        ],
        requestId: `feature-adoption-${Date.now()}`,
      },
      rowsPerPage: 500,
    };

    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("get_top_features",
  "Get the most-used features by total clicks in a date range. Best tool for ranking feature usage.",
  {
    startDate: z.string().describe("Start date YYYY-MM-DD"),
    endDate: z.string().describe("End date YYYY-MM-DD"),
    appId: z.string().optional().describe("App ID — use -323232 for SOCi"),
    limit: z.number().int().min(1).max(100).default(20),
  },
  async ({ startDate, endDate, appId, limit }) => {
    const pipeline = [
      { source: { featureEvents: appId ? { appId } : null } },
      {
        group: {
          group: ["featureId"],
          fields: [
            { count: null, alias: "totalClicks" },
            { countDistinct: "visitorId", alias: "uniqueVisitors" },
            { countDistinct: "accountId", alias: "uniqueAccounts" },
          ],
        },
      },
      { sort: { field: "totalClicks", order: -1 } },
      { limit },
    ];

    const body = {
      response: { mimeType: "application/json" },
      timeSeries: {
        period: "dayRange",
        first: startDate,
        last: endDate,
      },
      request: {
        pipeline,
        requestId: `top-features-${Date.now()}`,
      },
      rowsPerPage: limit,
    };

    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("list_pages", "List all tracked Pendo pages.",
  { appId: z.string().optional() },
  async ({ appId }) => {
    const data = await pendoGet("/page", appId ? { appId } : {});
    const pages = Array.isArray(data) ? data : Object.values(data);
    const rows = pages.slice(0, 100).map((p) => ({ id: p.id, name: p.name, appId: p.appId }));
    return { content: [{ type: "text", text: JSON.stringify({ total: pages.length, pages: rows }, null, 2) }] };
  }
);

server.tool("get_page_analytics", "Get page view metrics for a date range.",
  {
    pageId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  },
  async ({ pageId, startDate, endDate, granularity }) => {
    const periodMap = { daily: "dayRange", weekly: "weekRange", monthly: "monthRange" };
    const body = {
      response: { mimeType: "application/json" },
      timeSeries: {
        period: periodMap[granularity],
        first: startDate,
        last: endDate,
      },
      request: {
        pipeline: [
          { source: { pageEvents: { pageId } } },
          {
            group: {
              group: ["visitorId", "accountId"],
              fields: [{ count: null, alias: "numViews" }],
            },
          },
        ],
        requestId: `page-analytics-${Date.now()}`,
      },
      rowsPerPage: 500,
    };
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("list_guides", "List all Pendo in-app guides.",
  { state: z.enum(["public", "staged", "draft", "disabled"]).optional() },
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
    const body = {
      response: { mimeType: "application/json" },
      timeSeries: { period: "dayRange", first: startDate, last: endDate },
      request: {
        pipeline: [
          { source: { guideEvents: { guideId } } },
          {
            group: {
              group: ["type"],
              fields: [
                { count: null, alias: "count" },
                { countDistinct: "visitorId", alias: "uniqueVisitors" },
              ],
            },
          },
        ],
        requestId: `guide-metrics-${Date.now()}`,
      },
      rowsPerPage: 100,
    };
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
    const body = {
      response: { mimeType: "application/json" },
      request: { pipeline, requestId: `accounts-${Date.now()}` },
      rowsPerPage: limit,
    };
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
  {
    startDate: z.string(),
    endDate: z.string(),
    granularity: z.enum(["daily", "weekly", "monthly"]).default("monthly"),
  },
  async ({ startDate, endDate, granularity }) => {
    const periodMap = { daily: "dayRange", weekly: "weekRange", monthly: "monthRange" };
    const body = {
      response: { mimeType: "application/json" },
      timeSeries: {
        period: periodMap[granularity],
        first: startDate,
        last: endDate,
      },
      request: {
        pipeline: [
          { source: { pollSubmissions: null } },
          {
            group: {
              group: ["rating"],
              fields: [
                { count: null, alias: "responses" },
                { countDistinct: "visitorId", alias: "uniqueRespondents" },
              ],
            },
          },
        ],
        requestId: `nps-${Date.now()}`,
      },
      rowsPerPage: 100,
    };
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool("run_aggregation", "Run a raw Pendo aggregation. timeSeries is optional for event sources.",
  {
    pipeline: z.array(z.record(z.unknown())),
    startDate: z.string().optional().describe("Required for time-series sources like featureEvents, pageEvents"),
    endDate: z.string().optional().describe("Required for time-series sources"),
    period: z.enum(["dayRange", "weekRange", "monthRange"]).optional().default("dayRange"),
    rowsPerPage: z.number().int().default(100),
  },
  async ({ pipeline, startDate, endDate, period, rowsPerPage }) => {
    const body = {
      response: { mimeType: "application/json" },
      request: { pipeline, requestId: `raw-${Date.now()}` },
      rowsPerPage,
    };
    // Only add timeSeries if dates provided
    if (startDate && endDate) {
      body.timeSeries = { period: period || "dayRange", first: startDate, last: endDate };
    }
    const data = await pendoPost("/aggregation", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[pendo-mcp] Server v1.1.0 running on stdio");
