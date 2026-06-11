import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { evaluateCalculations } from '../lib/safeFormula.ts';

const dataDir = path.join(process.cwd(), 'data');

function verifyDb(fileName: string) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`Database file ${fileName} does not exist yet.`);
    return;
  }
  const dbContent = fs.readFileSync(filePath, 'utf8');
  const guidelines = JSON.parse(dbContent);

  console.log(`\n=== Verifying Calculators in ${fileName} (${guidelines.length} guidelines) ===`);

  let totalCalculators = 0;
  let errorCount = 0;

  for (const gl of guidelines) {
    const calc = gl.calculator;
    if (!calc) continue;

    totalCalculators++;
    console.log(`Guideline: [${gl.id}] - ${gl.name || (gl.clinical && gl.clinical.title) || 'Untitled'}`);
    console.log(`  Calculator Name: ${calc.calculator_name || calc.calculatorName}`);
    
    // Get required inputs
    const inputs = calc.inputs || [];
    console.log(`  Inputs: ${inputs.map((i: any) => `${i.id} (${i.type}, default: ${i.defaultValue})`).join(', ')}`);

    // Build mock scope
    const testScope: any = {};
    for (const input of inputs) {
      if (input.type === 'number') {
        testScope[input.id] = input.defaultValue !== undefined && input.defaultValue !== null ? Number(input.defaultValue) : 70;
      } else if (input.type === 'choice' || input.type === 'select') {
        const optionVal = input.options?.[0];
        const defaultOpt = typeof optionVal === 'object' && optionVal !== null ? optionVal.value : optionVal;
        testScope[input.id] = input.defaultValue !== undefined && input.defaultValue !== null ? input.defaultValue : (defaultOpt || 'Adult');
      } else if (input.type === 'boolean') {
        testScope[input.id] = input.defaultValue !== undefined && input.defaultValue !== null ? Boolean(input.defaultValue) : true;
      } else {
        testScope[input.id] = 70;
      }
    }
    // Make sure we have some fallback defaults
    if (!('weight' in testScope)) testScope.weight = 70;
    if (!('height' in testScope)) testScope.height = 175;
    if (!('gender' in testScope)) testScope.gender = 'Male';
    if (!('age' in testScope)) testScope.age = 45;

    // Verify each calculation formula
    const calculations = calc.calculations || [];
    console.log(`  Calculations (${calculations.length}):`);
    const results = evaluateCalculations(calculations, testScope);
    
    for (const key of Object.keys(results)) {
      const val = results[key];
      const formulaItem = calculations.find((c: any) => c.id === key);
      const formulaText = formulaItem ? formulaItem.formula : '';
      if (val === 'Error') {
        console.log(`    ❌ Calculation [${key}] failed to evaluate: "${formulaText}"`);
        errorCount++;
      } else {
        console.log(`    ✔ Calculation [${key}] evaluated to: ${val} ("${formulaText}")`);
      }
    }
  }

  console.log(`\nFinished ${fileName}: verified ${totalCalculators} calculators, found ${errorCount} errors.`);
  assert.equal(errorCount, 0, `Expected 0 calculator evaluation errors in ${fileName}`);
}

test('verify guidelines_db.json calculators', () => {
  verifyDb('guidelines_db.json');
});

test('verify aagbi_guidelines_db.json calculators', () => {
  verifyDb('aagbi_guidelines_db.json');
});
