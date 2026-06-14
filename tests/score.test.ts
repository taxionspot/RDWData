import test from "node:test";
import assert from "node:assert/strict";
import { buildScoreResult } from "../lib/vehicle/score";
import type { BuildScoreArgs } from "../lib/vehicle/score";

const baseArgs: BuildScoreArgs = {
  defects: 0,
  riskScore: 4,
  apkPassChance: 87,
  wok: false,
  imported: false,
  napOnlogisch: false,
  openRecall: false,
  locale: "nl"
};

test("buildScoreResult: clean vehicle scores in the strong range", () => {
  const result = buildScoreResult(baseArgs);
  assert.ok(result.score >= 80, `expected score >= 80, got ${result.score}`);
  assert.equal(result.tone, "strong");
  assert.equal(result.label, "Sterk resultaat");
  assert.ok(result.breakdown.length > 0);
  assert.ok(result.breakdown[0].label === "Basisscore");
  assert.equal(result.breakdown[0].points, 82);
});

test("buildScoreResult: WOK caps score at 35", () => {
  const result = buildScoreResult({ ...baseArgs, wok: true });
  assert.ok(result.score <= 35, `WOK must cap score at 35, got ${result.score}`);
  assert.equal(result.tone, "caution");
  const wokEntry = result.breakdown.find((b) => b.label.includes("WOK"));
  assert.ok(wokEntry, "breakdown must include WOK entry");
});

test("buildScoreResult: NAP onlogisch applies 20-point penalty", () => {
  const clean = buildScoreResult(baseArgs);
  const nap = buildScoreResult({ ...baseArgs, napOnlogisch: true });
  assert.ok(clean.score - nap.score >= 20, "NAP penalty must be at least 20");
  const napEntry = nap.breakdown.find((b) => b.label.includes("NAP") || b.label.includes("onlogisch"));
  assert.ok(napEntry, "breakdown must include NAP entry");
  assert.equal(napEntry?.points, -20);
});

test("buildScoreResult: 4 defects apply penalty up to 10 points", () => {
  const clean = buildScoreResult(baseArgs);
  const withDefects = buildScoreResult({ ...baseArgs, defects: 4 });
  assert.ok(clean.score > withDefects.score, "defects must lower the score");
  const defectEntry = withDefects.breakdown.find((b) => b.label.includes("gebrek") || b.label.includes("defect"));
  assert.ok(defectEntry, "breakdown must include defect entry");
  assert.ok(defectEntry.points < 0);
});

test("buildScoreResult: 8 defects cap at 20-point penalty", () => {
  const withMaxDefects = buildScoreResult({ ...baseArgs, defects: 8 });
  const defectEntry = withMaxDefects.breakdown.find((b) => b.label.includes("gebrek") || b.label.includes("defect"));
  assert.ok(defectEntry, "breakdown must include defect entry for 8 defects");
  // 8 * 2.5 = 20 -> cap at 20
  assert.equal(Math.abs(defectEntry?.points ?? 0), 20);
});

test("buildScoreResult: import applies 6-point penalty", () => {
  const clean = buildScoreResult(baseArgs);
  const imported = buildScoreResult({ ...baseArgs, imported: true });
  assert.ok(clean.score - imported.score === 6, `import penalty must be exactly 6, diff=${clean.score - imported.score}`);
});

test("buildScoreResult: open recall applies 5-point penalty", () => {
  const clean = buildScoreResult(baseArgs);
  const recall = buildScoreResult({ ...baseArgs, openRecall: true });
  assert.ok(clean.score - recall.score >= 5, `recall penalty must be at least 5`);
});

test("buildScoreResult: score is always clamped between 20 and 95", () => {
  // Very bad vehicle
  const terrible = buildScoreResult({ ...baseArgs, wok: true, napOnlogisch: true, defects: 8, imported: true, openRecall: true, riskScore: 10 });
  assert.ok(terrible.score >= 20 && terrible.score <= 35, `WOK-capped score must be 20-35, got ${terrible.score}`);
  // Perfect vehicle
  const perfect = buildScoreResult({ ...baseArgs, apkPassChance: 100 });
  assert.ok(perfect.score <= 95, `score must not exceed 95, got ${perfect.score}`);
});

test("buildScoreResult: APK pass chance above 70 gives bonus", () => {
  const noChance = buildScoreResult({ ...baseArgs, apkPassChance: null });
  const highChance = buildScoreResult({ ...baseArgs, apkPassChance: 95 });
  assert.ok(highChance.score >= noChance.score, "high APK chance should not hurt score");
});

test("buildScoreResult: English locale produces English labels", () => {
  const result = buildScoreResult({ ...baseArgs, locale: "en" });
  assert.ok(result.label === "Strong result" || result.label === "Steady profile" || result.label === "Mixed signals" || result.label === "Needs review");
  assert.equal(result.breakdown[0].label, "Base score");
});

test("buildScoreResult: confidence and riskFlag are set correctly for clean vehicle", () => {
  const result = buildScoreResult(baseArgs);
  assert.equal(result.confidence, "Hoog");
  assert.equal(result.riskFlag, "Laag");
});

test("buildScoreResult: riskFlag is Verhoogd when wok=true", () => {
  const result = buildScoreResult({ ...baseArgs, wok: true });
  assert.equal(result.riskFlag, "Verhoogd");
});

test("buildScoreResult: riskFlag is Verhoogd when defects > 4", () => {
  const result = buildScoreResult({ ...baseArgs, defects: 5 });
  assert.equal(result.riskFlag, "Verhoogd");
});
