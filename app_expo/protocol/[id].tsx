import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DoseCalculator from '../../components/DoseCalculator';
import LocationSelector, { SITES, SiteId } from '../../components/LocationSelector';
import guidelinesDb from '../../data/guidelines_db.json';
import { mockCalculator } from '../../lib/supabaseClient';

export default function ProtocolDetail() {
  const router = useRouter();
  const { id, siteId } = useLocalSearchParams();
  
  // Find guideline in static db
  const guideline = guidelinesDb.find(g => g.protocol_id === id);
  const activeSiteId = (siteId as SiteId) || 'site_1';
  const siteDetails = guideline?.site_logistics?.[activeSiteId] || SITES[activeSiteId];

  if (!guideline) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Clinical guideline not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Return to Directory</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Bind calculator if it exists in the compiled schema
  const calculatorSchema = guideline.calculator || null;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Navigation Back */}
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>← Back to Guidelines</Text>
        </TouchableOpacity>

        {/* Title Block */}
        <View style={styles.titleBlock}>
          <View style={styles.badgeRow}>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE SOP</Text>
            </View>
            <Text style={styles.versionText}>Ver: {guideline.metadata.version_hash}</Text>
          </View>
          <Text style={styles.titleText}>{guideline.clinical.title}</Text>
          <TouchableOpacity 
            style={styles.openPdfLink}
            onPress={() => {
              // Production: Check local cache, download on-demand if missing (via expo-file-system),
              // then open using Expo WebBrowser or a local PDF component.
              Linking.openURL(`https://nhs-clinical-portal.net/guidelines/${guideline.pdf_name}`);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.openPdfLinkText}>📄 View Actual Source Guideline Document</Text>
          </TouchableOpacity>
        </View>

        {/* Site Logistics Block */}
        <View style={styles.logisticsCard}>
          <Text style={styles.logisticsHeader}>SITE-SPECIFIC LOGISTICS ({SITES[activeSiteId].name})</Text>
          
          <View style={styles.logisticsGrid}>
            <View style={styles.logisticsRow}>
              <Text style={styles.logisticsLabel}>🚨 EMERGENCY EXTENSION:</Text>
              <Text style={styles.logisticsValueHighlight}>
                {siteDetails.emergency_extension || '2222'}
              </Text>
            </View>
            
            <View style={styles.logisticsDivider} />

            <View style={styles.logisticsRow}>
              <Text style={styles.logisticsLabel}>📦 LOCAL DRUG STORAGE:</Text>
              <Text style={styles.logisticsValue}>
                {siteDetails.drug_location || 'Not Specified'}
              </Text>
            </View>

            {siteDetails.referral_pathway ? (
              <>
                <View style={styles.logisticsDivider} />
                <TouchableOpacity 
                  style={styles.pathwayButton}
                  onPress={() => Linking.openURL(siteDetails.referral_pathway)}
                >
                  <Text style={styles.pathwayButtonText}>🌐 Open Local Pathway Intranet Link</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>

        {/* Dose Calculator Mounting */}
        {calculatorSchema ? (
          <View style={styles.calculatorWrapper}>
            <DoseCalculator schema={calculatorSchema} />
          </View>
        ) : null}

        {/* Protocol Steps */}
        <View style={styles.stepsSection}>
          <Text style={styles.stepsSectionHeader}>CLINICAL PATHWAY STEPS</Text>
          
          {guideline.clinical.steps.map((step: any, index: number) => (
            <View key={index} style={styles.stepCard}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumberText}>{step.step_number}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Metadata Footer */}
        <View style={styles.metaFooter}>
          <Text style={styles.metaText}>Document Owner: {guideline.metadata.owner_email}</Text>
          <Text style={styles.metaText}>Compiled: {new Date(guideline.metadata.compiled_at).toLocaleDateString()}</Text>
          <Text style={styles.metaText}>Next Review Due: {new Date(guideline.metadata.review_due_at).toLocaleDateString()}</Text>
          <Text style={styles.metaWarn}>
            Disclaimer: Pre-verified departmental resource. Verify critical dosing independently.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#0b0f19', // Dark slate background
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  backLink: {
    marginBottom: 16,
    paddingVertical: 4,
  },
  backLinkText: {
    color: '#38bdf8', // Sky 400
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '700',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#334155',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  titleBlock: {
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  activeBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  activeBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  versionText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 28,
  },
  openPdfLink: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  openPdfLinkText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  logisticsCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  logisticsHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38bdf8',
    letterSpacing: 1,
    marginBottom: 12,
  },
  logisticsGrid: {
    gap: 12,
  },
  logisticsRow: {
    gap: 4,
  },
  logisticsLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  logisticsValueHighlight: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ef4444', // Warning red
  },
  logisticsValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  logisticsDivider: {
    height: 1,
    backgroundColor: '#1e293b',
  },
  pathwayButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  pathwayButtonText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  calculatorWrapper: {
    marginBottom: 20,
  },
  stepsSection: {
    marginBottom: 24,
  },
  stepsSectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 12,
  },
  stepCard: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumberBadge: {
    backgroundColor: '#334155',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
  },
  stepText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18,
  },
  metaFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 16,
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#475569',
  },
  metaWarn: {
    fontSize: 10,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 14,
  }
});
