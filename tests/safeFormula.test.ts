import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFormula, evaluateCalculations, FormulaError } from '../lib/safeFormula.ts';

test('basic arithmetic', () => {
  assert.equal(evaluateFormula('weight * 15', { weight: 10 }), 150);
  assert.equal(evaluateFormula('weight / 2 + 1', { weight: 10 }), 6);
  assert.equal(evaluateFormula('(weight + 5) * 2', { weight: 10 }), 30);
  assert.equal(evaluateFormula('10 % 3', {}), 1);
  assert.equal(evaluateFormula('-weight + 100', { weight: 30 }), 70);
});

test('operator precedence', () => {
  assert.equal(evaluateFormula('2 + 3 * 4', {}), 14);
  assert.equal(evaluateFormula('2 * 3 + 4 * 5', {}), 26);
  assert.equal(evaluateFormula('10 - 4 - 2', {}), 4);
});

test('ternary and comparisons', () => {
  assert.equal(evaluateFormula('weight >= 20 ? 20 : 10', { weight: 25 }), 20);
  assert.equal(evaluateFormula('weight >= 20 ? 20 : 10', { weight: 15 }), 10);
  assert.equal(evaluateFormula('bmi > 30 ? 1 : 0', { bmi: 30 }), 0);
  assert.equal(evaluateFormula('a < b ? "low" : "high"', { a: 1, b: 2 }), 'low');
  // Nested ternaries
  assert.equal(
    evaluateFormula('age < 1 ? 5 : age < 12 ? 10 : 20', { age: 8 }),
    10
  );
});

test('string equality (gender-based dosing)', () => {
  const male = evaluateFormula(
    "gender === 'Male' ? 50 + 0.9 * (height - 152) : 45.5 + 0.9 * (height - 152)",
    { gender: 'Male', height: 170 }
  );
  const female = evaluateFormula(
    "gender === 'Male' ? 50 + 0.9 * (height - 152) : 45.5 + 0.9 * (height - 152)",
    { gender: 'Female', height: 170 }
  );
  assert.equal(male, 50 + 0.9 * 18);
  assert.equal(female, 45.5 + 0.9 * 18);
});

test('logical operators', () => {
  assert.equal(evaluateFormula('weight > 10 && weight < 100 ? 1 : 0', { weight: 50 }), 1);
  assert.equal(evaluateFormula('weight < 10 || weight > 100 ? 1 : 0', { weight: 50 }), 0);
});

test('Math function allowlist', () => {
  assert.equal(evaluateFormula('Math.round(weight * 0.15)', { weight: 71 }), 11);
  assert.equal(evaluateFormula('Math.ceil(2.1)', {}), 3);
  assert.equal(evaluateFormula('Math.min(weight, 20)', { weight: 35 }), 20);
  assert.equal(evaluateFormula('Math.max(5, 10, 2)', {}), 10);
  assert.throws(() => evaluateFormula('Math.random()', {}), FormulaError);
});

test('rejects code injection attempts', () => {
  assert.throws(() => evaluateFormula('fetch("https://evil.example")', {}), FormulaError);
  assert.throws(() => evaluateFormula('window.location', {}), FormulaError);
  assert.throws(() => evaluateFormula('constructor.constructor("alert(1)")()', {}), FormulaError);
  assert.throws(() => evaluateFormula('weight; alert(1)', { weight: 10 }), FormulaError);
  assert.throws(() => evaluateFormula('this.process', {}), FormulaError);
  assert.throws(() => evaluateFormula('weight.toString()', { weight: 10 }), FormulaError);
  assert.throws(() => evaluateFormula('`${weight}`', { weight: 10 }), FormulaError);
  assert.throws(() => evaluateFormula('weight = 5', { weight: 10 }), FormulaError);
  assert.throws(() => evaluateFormula('[1,2,3]', {}), FormulaError);
});

test('rejects unknown variables and malformed input', () => {
  assert.throws(() => evaluateFormula('unknown_var * 2', { weight: 10 }), FormulaError);
  assert.throws(() => evaluateFormula('', {}), FormulaError);
  assert.throws(() => evaluateFormula('1 +', {}), FormulaError);
  assert.throws(() => evaluateFormula('(1 + 2', {}), FormulaError);
  assert.throws(() => evaluateFormula("'unterminated", {}), FormulaError);
});

test('dexmedetomidine calculator chain (dependent calculations)', () => {
  // Mirrors the worker's fallback dexmedetomidine schema: later formulas
  // reference earlier results (ibw → bmi → dosing_weight → doses).
  const calculations = [
    { id: 'ibw', formula: "gender === 'Male' ? 50 + 0.9 * (height - 152) : 45.5 + 0.9 * (height - 152)" },
    { id: 'bmi', formula: 'weight / ((height/100) * (height/100))' },
    { id: 'dosing_weight', formula: 'bmi > 30 ? ibw + 0.4 * (weight - ibw) : weight' },
    { id: 'loading_dose', formula: 'dosing_weight * 1' },
    { id: 'infusion_rate_low', formula: 'dosing_weight * 0.2' },
    { id: 'infusion_rate_high', formula: 'dosing_weight * 0.7' },
  ];

  // Non-obese patient: dosing weight = actual weight
  const lean = evaluateCalculations(calculations, { gender: 'Male', height: 170, weight: 70 });
  assert.equal(lean.dosing_weight, 70);
  assert.equal(lean.loading_dose, 70);
  assert.equal(lean.infusion_rate_low, 14);
  assert.equal(lean.infusion_rate_high, 49);

  // Obese patient (BMI > 30): adjusted body weight
  const obese = evaluateCalculations(calculations, { gender: 'Male', height: 170, weight: 120 });
  const ibw = 50 + 0.9 * (170 - 152);
  const adjBw = ibw + 0.4 * (120 - ibw);
  assert.equal(obese.dosing_weight, adjBw);
  assert.equal(obese.loading_dose, adjBw);
});

test('evaluateCalculations marks bad formulas as Error without breaking others', () => {
  const results = evaluateCalculations(
    [
      { id: 'good', formula: 'weight * 2' },
      { id: 'bad', formula: 'eval("hack")' },
      { id: 'alsoGood', formula: 'good + 1' },
    ],
    { weight: 10 }
  );
  assert.equal(results.good, 20);
  assert.equal(results.bad, 'Error');
  assert.equal(results.alsoGood, 21);
});

test('AVOID-style string outputs survive the pipeline', () => {
  const results = evaluateCalculations(
    [{ id: 'diclofenac_dose', formula: "age < 16 ? 'AVOID' : weight * 1" }],
    { age: 12, weight: 40 }
  );
  assert.equal(results.diclofenac_dose, 'AVOID');
});
