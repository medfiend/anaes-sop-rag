"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { evaluateCalculations, FormulaValue } from '../lib/safeFormula';

interface InputField {
  id: string;
  label: string;
  type: 'number' | 'select';
  defaultValue?: any;
  min?: number;
  max?: number;
  options?: string[];
  unit?: string;
}

interface Calculation {
  id: string;
  label: string;
  formula: string;
  unit: string;
}

interface CalculatorSchema {
  calculator_name: string;
  inputs: InputField[];
  calculations: Calculation[];
}

interface DoseCalculatorProps {
  schema: CalculatorSchema;
  isSandbox?: boolean;
  onApprove?: () => void;
  isApproved?: boolean;
}

const ROW_HEIGHT = 44;

const HIGHLIGHTED_CALC_IDS = [
  'loading_rate', 'maintenance_rate_04', 'dosing_weight',
  'bolus_vol', 'infusion_rate', 'repeat_bolus',
  'bolus_dose', 'vials_needed', 'water_vol',
  'ett_cuffed', 'ett_oral_len', 'ett_nasal_len',
  'fentanyl_dose', 'ketamine_dose', 'rocuronium_dose',
  'atropine_dose', 'adrenaline_bolus', 'fluid_bolus',
  'ondansetron_dose', 'omeprazole_dose', 'morphine_rate_max',
  'ibuprofen_max_24h', 'diclofenac_dose', 'diazepam_range',
  'oromorph_dose', 'dihydrocodeine_dose', 'naloxone_dose',
  'csl_bolus', 'csl_maintenance', 'methylprednisolone_dose',
  'basiliximab_dose', 'co_amoxiclav_dose', 'bupivacaine_rate',
  'sux_alert'
];

function displayValue(value: FormulaValue | 'Error' | undefined): string {
  if (value === undefined) return '—';
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  return String(value);
}

export default function DoseCalculator({ schema, isSandbox = false, onApprove, isApproved = false }: DoseCalculatorProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // 1. Identify input types
  const numericInput = schema.inputs.find(i => i.type === 'number');
  const selectInputs = schema.inputs.filter(i => i.type === 'select');

  // 2. Track select inputs state and active weight selection
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [activeWeight, setActiveWeight] = useState<number>(numericInput?.defaultValue || 70);

  // Initialize inputs with default values (for select types)
  useEffect(() => {
    const initialValues: Record<string, any> = {};
    schema.inputs.forEach(input => {
      if (input.type === 'select') {
        initialValues[input.id] = input.defaultValue !== undefined
          ? input.defaultValue
          : input.options?.[0];
      }
    });
    setInputs(initialValues);
    if (numericInput) {
      setActiveWeight(numericInput.defaultValue || 70);
    }
  }, [schema]);

  const handleInputChange = (id: string, val: any) => {
    setInputs(prev => ({
      ...prev,
      [id]: val
    }));
  };

  // 3. Precalculate calculations for every weight step in the range.
  // Formulas are evaluated by the safe expression parser (never eval/Function),
  // sequentially, so later formulas can reference earlier results.
  const lookupData = useMemo(() => {
    if (!numericInput) return [];
    const minVal = numericInput.min !== undefined ? numericInput.min : 10;
    const maxVal = numericInput.max !== undefined ? numericInput.max : 200;
    const data: Array<{ weight: number; calculations: Record<string, FormulaValue | 'Error'> }> = [];

    for (let w = minVal; w <= maxVal; w++) {
      const scope: Record<string, any> = { ...inputs, [numericInput.id]: w };
      data.push({ weight: w, calculations: evaluateCalculations(schema.calculations, scope) });
    }
    return data;
  }, [inputs, schema, numericInput]);

  // Retrieve calculations for the focused active weight
  const currentResults = useMemo(() => {
    if (!numericInput) {
      return evaluateCalculations(schema.calculations, { ...inputs });
    }
    const activeRow = lookupData.find(r => r.weight === activeWeight);
    return activeRow ? activeRow.calculations : {};
  }, [inputs, lookupData, activeWeight, numericInput, schema]);

  // Scroll to default weight value on load
  useEffect(() => {
    if (numericInput && scrollerRef.current) {
      const minVal = numericInput.min !== undefined ? numericInput.min : 10;
      const defaultVal = numericInput.defaultValue || 70;
      const timer = setTimeout(() => {
        scrollerRef.current?.scrollTo({ top: (defaultVal - minVal) * ROW_HEIGHT, behavior: 'auto' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [schema, numericInput]);

  // Scroll handler to track the focused weight row in the viewport center
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!numericInput) return;
    const y = event.currentTarget.scrollTop;
    const index = Math.round(y / ROW_HEIGHT);
    const minVal = numericInput.min !== undefined ? numericInput.min : 10;
    const maxVal = numericInput.max !== undefined ? numericInput.max : 200;
    const weightVal = Math.max(minVal, Math.min(maxVal, minVal + index));
    if (activeWeight !== weightVal) {
      setActiveWeight(weightVal);
    }
  };

  const handleRowPress = (weight: number) => {
    if (!numericInput) return;
    const minVal = numericInput.min !== undefined ? numericInput.min : 10;
    scrollerRef.current?.scrollTo({ top: (weight - minVal) * ROW_HEIGHT, behavior: 'smooth' });
    setActiveWeight(weight);
  };

  return (
    <div className="bg-[#0b1329] rounded-xl border border-slate-800 overflow-hidden my-3 shadow-lg">
      {/* Header */}
      <div className="bg-slate-950 py-3 px-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center flex-1 mr-3 min-w-0">
          <span className="text-lg mr-2">🧮</span>
          <span className="text-xs font-bold text-teal-400 tracking-wide uppercase truncate">
            {schema.calculator_name}
          </span>
        </div>
        {isSandbox && (
          isApproved ? (
            <span className="bg-teal-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0">
              ✓ Published
            </span>
          ) : (
            <button
              type="button"
              onClick={onApprove}
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors shrink-0"
            >
              Approve &amp; Publish
            </button>
          )
        )}
      </div>

      <div className="p-4 flex flex-col md:flex-row flex-wrap gap-4">
        {/* Left: Input Panel (Passive Highlight scroller) */}
        <div className="flex-1 min-w-[240px]">
          <h4 className="text-[11px] font-bold text-teal-600 tracking-widest border-b border-slate-800 pb-1.5 mb-3">
            PATIENT PARAMETERS
          </h4>

          {selectInputs.map(input => (
            <div key={input.id} className="mb-3.5">
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">{input.label}</label>
              <div className="flex bg-[#090f1e] rounded-lg p-[3px] border border-slate-800">
                {input.options?.map(opt => {
                  const isSelected = inputs[input.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleInputChange(input.id, opt)}
                      className={`flex-1 py-2 rounded-md text-[13px] transition-colors ${
                        isSelected
                          ? 'bg-slate-800 text-teal-400 font-semibold shadow-sm'
                          : 'text-slate-500 font-medium hover:text-slate-300'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Scrollable tape-scroller for the numeric parameter */}
          {numericInput && (
            <div className="mb-3.5">
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">
                {numericInput.label}: <span className="text-teal-400 font-bold">{activeWeight} kg</span>
              </label>

              <div
                className="relative overflow-hidden bg-[#090f1e] rounded-lg border border-slate-800"
                style={{ height: ROW_HEIGHT * 3 }}
              >
                {/* Horizontal Highlight Reticle Bar */}
                <div
                  className="absolute left-0 right-0 z-10 pointer-events-none border-y"
                  style={{
                    top: ROW_HEIGHT,
                    height: ROW_HEIGHT,
                    backgroundColor: '#2dd4bf15',
                    borderColor: '#2dd4bf40',
                  }}
                />

                <div
                  ref={scrollerRef}
                  onScroll={handleScroll}
                  className="h-full overflow-y-auto scrollbar-none"
                  style={{
                    scrollSnapType: 'y mandatory',
                    paddingTop: ROW_HEIGHT,
                    paddingBottom: ROW_HEIGHT,
                  }}
                >
                  {lookupData.map(row => {
                    const isActive = row.weight === activeWeight;
                    const firstCalc = schema.calculations[0];
                    return (
                      <button
                        key={row.weight}
                        type="button"
                        onClick={() => handleRowPress(row.weight)}
                        className="w-full flex items-center justify-between px-4 text-left cursor-pointer"
                        style={{ height: ROW_HEIGHT, scrollSnapAlign: 'center' }}
                      >
                        <span className={`font-mono ${isActive ? 'text-teal-400 font-extrabold text-sm' : 'text-slate-500 text-xs'}`}>
                          {row.weight} kg
                        </span>
                        {/* Display primary calculation for visual trend verification */}
                        <span className={`font-mono ${isActive ? 'text-slate-50 font-bold text-[13px]' : 'text-slate-600 text-[11px]'}`}>
                          {firstCalc && row.calculations[firstCalc.id] !== undefined
                            ? `${displayValue(row.calculations[firstCalc.id])} ${firstCalc.unit}`
                            : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 rounded-lg border p-2.5 mt-3" style={{ backgroundColor: '#78350f15', borderColor: '#b4530940' }}>
            <span className="text-base mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-[11px] font-bold text-amber-500 mb-0.5">DCB0129 Clinical Safety Alert</p>
              <p className="text-[10px] text-amber-600 leading-snug">
                Identify your patient's weight on the scrolling list. Cross-reference the dosage progression visually with adjacent rows to verify mathematical accuracy before administration.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Results Panel */}
        <div className="flex-1 min-w-[240px] bg-slate-950 rounded-lg p-3 border border-slate-800">
          <h4 className="text-[11px] font-bold text-teal-600 tracking-widest border-b border-slate-800 pb-1.5 mb-3">
            DOSING OUTPUTS
          </h4>

          <div className="flex flex-col gap-2">
            {schema.calculations.map(calc => {
              const isSpecial = HIGHLIGHTED_CALC_IDS.includes(calc.id);
              const isAvoid = currentResults[calc.id] === 'AVOID';
              return (
                <div
                  key={calc.id}
                  className={`flex justify-between items-center py-1.5 px-2 rounded-md ${
                    isAvoid
                      ? 'bg-red-50 border-l-[3px] border-red-500'
                      : isSpecial
                        ? 'border-l-[3px] border-teal-600'
                        : ''
                  }`}
                  style={isSpecial && !isAvoid ? { backgroundColor: '#0d948810' } : undefined}
                >
                  <span className={`text-xs ${
                    isAvoid ? 'text-red-800 font-bold' : isSpecial ? 'text-slate-200 font-semibold' : 'text-slate-400'
                  }`}>
                    {calc.label}
                  </span>
                  <span className="flex items-baseline gap-0.5">
                    <span className={
                      isAvoid
                        ? 'text-red-500 text-base font-extrabold'
                        : isSpecial
                          ? 'text-teal-400 text-[15px] font-bold'
                          : 'text-slate-50 text-[13px] font-semibold'
                    }>
                      {displayValue(currentResults[calc.id])}
                    </span>
                    <span className="text-[10px] text-slate-500">{calc.unit}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800 flex justify-between">
            <span className="text-[10px] text-slate-600">Passive Reference Matrix (SaMD Exempt)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
