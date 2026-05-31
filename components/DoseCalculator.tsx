import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

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

export default function DoseCalculator({ schema, isSandbox = false, onApprove, isApproved = false }: DoseCalculatorProps) {
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [results, setResults] = useState<Record<string, any>>({});

  // Initialize inputs with default values
  useEffect(() => {
    const initialValues: Record<string, any> = {};
    schema.inputs.forEach(input => {
      initialValues[input.id] = input.defaultValue !== undefined 
        ? input.defaultValue 
        : (input.type === 'select' ? input.options?.[0] : 0);
    });
    setInputs(initialValues);
  }, [schema]);

  // Recalculate whenever inputs change
  useEffect(() => {
    if (Object.keys(inputs).length === 0) return;

    const scope = { ...inputs };
    const calculatedResults: Record<string, any> = {};

    schema.calculations.forEach(calc => {
      let expression = calc.formula;
      
      // Substitute values from scope
      Object.entries(scope).forEach(([key, value]) => {
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Replace variable tokens
        expression = expression.replace(
          new RegExp(`\\b${escapedKey}\\b`, 'g'), 
          typeof value === 'string' ? `'${value}'` : String(value)
        );
      });

      try {
        // Evaluate the formula locally
        const evalFn = new Function(`return (${expression})`);
        const value = evalFn();
        
        // Round to 2 decimal places if number
        const roundedValue = typeof value === 'number' 
          ? Math.round(value * 100) / 100 
          : value;
          
        calculatedResults[calc.id] = roundedValue;
        
        // Add to scope so subsequent formulas can reference this result
        scope[calc.id] = roundedValue;
      } catch (err) {
        console.error(`Error calculating ${calc.id}:`, err);
        calculatedResults[calc.id] = 'Error';
      }
    });

    setResults(calculatedResults);
  }, [inputs, schema]);

  const handleInputChange = (id: string, val: any) => {
    setInputs(prev => ({
      ...prev,
      [id]: val
    }));
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerEmoji}>🧮</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{schema.calculator_name}</Text>
        </View>
        {isSandbox && (
          <View>
            {isApproved ? (
              <View style={styles.badgeSuccess}>
                <Text style={styles.badgeText}>✓ Published</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.badgeApprove} onPress={onApprove} activeOpacity={0.7}>
                <Text style={styles.badgeApproveText}>Approve & Publish</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* Left: Input Panel */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionHeader}>PATIENT PARAMETERS</Text>
          
          {schema.inputs.map(input => (
            <View key={input.id} style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{input.label}</Text>
              
              {input.type === 'select' ? (
                <View style={styles.segmentContainer}>
                  {input.options?.map(opt => {
                    const isSelected = inputs[input.id] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.segmentButton, isSelected && styles.segmentButtonActive]}
                        onPress={() => handleInputChange(input.id, opt)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.segmentText, isSelected && styles.segmentTextActive]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.numericInput}
                    keyboardType="numeric"
                    value={inputs[input.id] !== undefined ? String(inputs[input.id]) : ''}
                    onChangeText={(text) => {
                      const val = parseFloat(text);
                      handleInputChange(input.id, isNaN(val) ? '' : val);
                    }}
                  />
                  {input.unit && (
                    <Text style={styles.unitText}>{input.unit}</Text>
                  )}
                </View>
              )}
            </View>
          ))}
          
          <View style={styles.warningContainer}>
            <Text style={styles.warningEmoji}>⚠️</Text>
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningTitle}>Clinical Safety Warning</Text>
              <Text style={styles.warningText}>
                Always verify weight-based calculations manually or with an official alternative device before administering vasoactive or sedative infusions.
              </Text>
            </View>
          </View>
        </View>

        {/* Right: Results Panel */}
        <View style={styles.resultsSection}>
          <Text style={styles.sectionHeader}>DOSING OUTPUTS</Text>
          
          <View style={styles.resultsList}>
            {schema.calculations.map(calc => {
              const isSpecial = [
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
              ].includes(calc.id);
              const isAvoid = results[calc.id] === 'AVOID';
              return (
                <View 
                  key={calc.id} 
                  style={[
                    styles.resultRow, 
                    isSpecial ? styles.resultRowSpecial : null,
                    isAvoid ? { backgroundColor: '#fef2f2', borderLeftColor: '#ef4444', borderLeftWidth: 3 } : null
                  ]}
                >
                  <Text style={[
                    styles.resultLabel, 
                    isSpecial ? styles.resultLabelSpecial : null,
                    isAvoid ? { color: '#991b1b', fontWeight: '700' } : null
                  ]}>{calc.label}</Text>
                  <View style={styles.resultValueContainer}>
                    <Text style={[
                      styles.resultValue, 
                      isSpecial ? styles.resultValueSpecial : null,
                      isAvoid ? { color: '#ef4444', fontSize: 16, fontWeight: '800' } : null
                    ]}>
                      {results[calc.id] !== undefined ? results[calc.id] : '—'}
                    </Text>
                    <Text style={styles.resultUnit}>{calc.unit}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Formula: Deterministic SOP Wiki</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    backgroundColor: '#1e293b', // Slate 800
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badgeSuccess: {
    backgroundColor: '#0d9488', // Teal 600
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  badgeApprove: {
    backgroundColor: '#f59e0b', // Amber 500
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeApproveText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    flexDirection: 'column',
    gap: 20,
  },
  inputSection: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 6,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  segmentTextActive: {
    color: '#0f172a',
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  numericInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  unitText: {
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  warningContainer: {
    flexDirection: 'row',
    backgroundColor: '#fffbeb', // Amber 50
    borderWidth: 1,
    borderColor: '#fde68a', // Amber 200
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  warningEmoji: {
    fontSize: 16,
    marginTop: 2,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309', // Amber 700
    marginBottom: 2,
  },
  warningText: {
    fontSize: 10,
    color: '#d97706', // Amber 600
    lineHeight: 14,
  },
  resultsSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  resultsList: {
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  resultRowSpecial: {
    backgroundColor: '#e6f4f1', // Teal tint
    borderLeftWidth: 3,
    borderLeftColor: '#0d9488',
  },
  resultLabel: {
    fontSize: 12,
    color: '#475569',
  },
  resultLabelSpecial: {
    fontWeight: '600',
    color: '#0f3a38',
  },
  resultValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  resultValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  resultValueSpecial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f766e', // Teal 700
  },
  resultUnit: {
    fontSize: 10,
    color: '#94a3b8',
  },
  footerRow: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 10,
    color: '#94a3b8',
  }
});
