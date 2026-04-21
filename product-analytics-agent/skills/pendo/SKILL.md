---
description: >
  Pendo analytics expertise. Use when working with Pendo feature adoption,
  page analytics, guide performance, NPS data, segments, or accounts.
  Invoked automatically when Pendo MCP tools are used.
---

# Working with Pendo Data

## Data Model Primer

| Concept | What it means |
|---|---|
| Feature | A tagged UI element (button, link, form) that Pendo tracks clicks on |
| Page | A URL pattern Pendo tracks visits to |
| Guide | An in-app tooltip, walkthrough, or banner |
| Visitor | An individual user identified by visitorId |
| Account | An organization a visitor belongs to |
| Segment | A saved filter of visitors or accounts |
| Poll | An NPS or custom survey |

## ID Lookup Pattern

Pendo APIs use internal IDs, not names. Always resolve names to IDs first.

## Metric Definitions

| Metric | How to compute |
|---|---|
| Adoption rate | unique visitors who clicked / total visitors in period |
| Account adoption | accounts with 1 or more clicks / total active accounts |
| Guide CTR | guideSeen events / guideDisplayed events |
| NPS score | ((Promoters - Detractors) / Total) x 100 |

## Date Handling

Pendo expects dates in YYYY-MM-DD format.
When the user says last quarter, compute the actual start and end dates.

## Presenting Results

Always translate data into sentences and tables.
Raw JSON is only acceptable when the user explicitly asks for it.
