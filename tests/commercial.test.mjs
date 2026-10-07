import test from "node:test";
import assert from "node:assert/strict";
import {
  commercialStats,
  localDay,
  localInput,
  timestamp,
} from "../src/crm/model.js";

test("CRM calcula semana de segunda-feira e mês no horário de Brasília", () => {
  const now = new Date("2026-10-07T01:30:00Z"); // 6 October, 22:30 in São Paulo
  assert.equal(localDay(now), "2026-10-06");
  const clients = [
    { stage: "won" },
    { stage: "won" },
    { stage: "lost" },
    { stage: "proposal" },
    { stage: "negotiation" },
  ];
  const activities = [
    "2026-10-07T01:00:00Z",
    "2026-10-06T03:00:00Z",
    "2026-10-05T15:00:00Z",
    "2026-10-04T15:00:00Z",
    "2026-09-30T15:00:00Z",
  ].map((occurred_at) => ({ occurred_at }));
  const result = commercialStats(
    clients,
    activities,
    [{ completed_at: null }, { completed_at: "2026-10-01T12:00:00Z" }],
    now,
  );
  assert.equal(result.today, 2);
  assert.equal(result.week, 3);
  assert.equal(result.month, 4);
  assert.equal(result.conversion, 67);
  assert.equal(result.pending, 1);
  assert.equal(result.proposals, 1);
  assert.equal(result.negotiating, 1);
});
test("CRM trata base vazia sem taxas inventadas e preserva horário local nos formulários", () => {
  const result = commercialStats([], [], [], new Date("2026-10-06T15:00:00Z"));
  assert.equal(result.total, 0);
  assert.equal(result.conversion, 0);
  assert.equal(localInput("2026-10-06T15:00:00Z"), "2026-10-06T12:00");
  assert.equal(timestamp("2026-10-06T12:00"), "2026-10-06T15:00:00.000Z");
  assert.equal(timestamp(""), null);
});
