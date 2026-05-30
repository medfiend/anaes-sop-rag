import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import MiniSearch from 'minisearch';
import LocationSelector, { SiteId, SITES } from '../components/LocationSelector';
import guidelinesDb from '../data/guidelines_db.json';

const SYNONYM_MATRIX: Record<string, { display: string; query: string }> = {
  "sux": { display: "Malignant Hyperthermia (Suxamethonium)", query: "Malignant Hyperthermia" },
  "scoline": { display: "Malignant Hyperthermia (Scoline)", query: "Malignant Hyperthermia" },
  "intralipid": { display: "Local Anaesthetic Toxicity (LAST) Rescue", query: "Toxicity" },
  "lipid": { display: "Local Anaesthetic Toxicity (LAST) Rescue", query: "Toxicity" },
  "dantrolene": { display: "Malignant Hyperthermia (Dantrolene)", query: "Malignant Hyperthermia" },
  "mh": { display: "Malignant Hyperthermia Guideline", query: "Malignant Hyperthermia" },
  "dex": { display: "Dexmedetomidine Awake Fibreoptic Intubation (AFOI)", query: "Dexmed" },
  "dexmed": { display: "Dexmedetomidine Awake Fibreoptic Intubation (AFOI)", query: "Dexmed" },
  "afoi": { display: "Awake Fibreoptic Intubation (AFOI) Guideline", query: "AFOI" }
};

function calculateConfidence(result: any): number {
  if (!result || !result.match) return 0;
  
  let matchesTitle = false;
  let matchesTags = false;
  let matchesSteps = false;

  Object.values(result.match).forEach((fields: any) => {
    if (fields.includes('title')) matchesTitle = true;
    if (fields.includes('tags')) matchesTags = true;
    if (fields.includes('text')) matchesSteps = true;
  });

  if (matchesTitle) return 100;
  if (matchesTags) return 85;
  if (matchesSteps) {
    const score = result.score || 0;
    const confidence = Math.min(70, Math.round((Math.log(score + 1) / Math.log(5)) * 70));
    return Math.max(40, confidence);
  }

  return 40;
}

export default function Home() {
  const router = useRouter();
  const [activeSiteId, setActiveSiteId] = useState<SiteId>('site_1');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ doc: any; confidence: number }>>([]);
  const [suggestions, setSuggestions] = useState<Array<{ display: string; query: string }>>([]);

  // Initialize MiniSearch for offline client-side searching
  const miniSearch = useMemo(() => {
    const ms = new MiniSearch({
      fields: ['title', 'text', 'tags'],
      storeFields: ['protocol_id'],
      idField: 'protocol_id',
      extractField: (document: any, fieldName: string) => {
        if (fieldName === 'title') return document.clinical.title;
        if (fieldName === 'text') return document.clinical.steps.map((s: any) => s.text).join(' ');
        if (fieldName === 'tags') return document.search_tags.join(' ');
        return document[fieldName];
      },
      searchOptions: {
        prefix: true,
        fuzzy: (term: string) => {
          if (term.length < 4) return false;
          if (term.length <= 7) return 1;
          return 2;
        }
      }
    });
    ms.addAll(guidelinesDb);
    return ms;
  }, []);

  // Update search results whenever query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(guidelinesDb.map(doc => ({ doc, confidence: 100 })));
      setSuggestions([]);
      return;
    }

    const results = miniSearch.search(searchQuery);
    const matchedDocs = results.map(res => {
      const doc = guidelinesDb.find(d => d.protocol_id === res.id);
      if (!doc) return null;
      const confidence = calculateConfidence(res);
      return { doc, confidence };
    }).filter((item): item is { doc: any; confidence: number } => {
      return item !== null && item.confidence >= 40; // Filter out results with <40% confidence
    });

    setSearchResults(matchedDocs);

    // If search returns 0 results, calculate synonyms suggestions
    if (matchedDocs.length === 0) {
      const queryLower = searchQuery.toLowerCase().trim();
      const matchedSuggestions: Array<{ display: string; query: string }> = [];
      
      if (SYNONYM_MATRIX[queryLower]) {
        matchedSuggestions.push(SYNONYM_MATRIX[queryLower]);
      } else {
        Object.keys(SYNONYM_MATRIX).forEach(key => {
          if (key.includes(queryLower) || queryLower.includes(key)) {
            matchedSuggestions.push(SYNONYM_MATRIX[key]);
          }
        });
      }
      setSuggestions(matchedSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery, miniSearch]);

  const handleQuickSearch = (tag: string) => {
    setSearchQuery(tag);
  };

  const handleProtocolPress = (protocolId: string) => {
    router.push({
      pathname: `/protocol/${protocolId}`,
      params: { siteId: activeSiteId }
    });
  };

  const activeSite = SITES[activeSiteId];

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Header Block */}
        <View style={styles.headerBlock}>
          <Text style={styles.headerSubtitle}>NHS ANAESTHETICS CLINICAL PORTAL</Text>
          <Text style={styles.headerTitle}>AnaesSOP</Text>
          <Text style={styles.headerDesc}>
            100% offline verified guidelines. Eliminating point-of-care LLM hallucinations through compile-time verification.
          </Text>
        </View>

        {/* Location Selector */}
        <LocationSelector 
          currentSiteId={activeSiteId} 
          onSiteChange={setActiveSiteId} 
        />

        {/* Search Panel */}
        <View style={styles.searchCard}>
          <Text style={styles.cardLabel}>SEARCH DIRECTORY</Text>
          <View style={styles.searchInputWrapper}>
            <Text style={styles.searchEmoji}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by keyword, drug, or shortcut (e.g. 'dex', 'afoi')..."
              placeholderTextColor="#64748b"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearEmoji}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Quick Filters */}
          <View style={styles.quickFiltersContainer}>
            <Text style={styles.filtersLabel}>QUICK SHORTCUTS:</Text>
            <View style={styles.badgeRow}>
              {['Dexmed', 'AFOI', 'Sedation', 'Emergency', 'Toxicity', 'Paediatric', 'Renal'].map(tag => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.badge, searchQuery.toLowerCase() === tag.toLowerCase() && styles.badgeActive]}
                  onPress={() => handleQuickSearch(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.badgeText, searchQuery.toLowerCase() === tag.toLowerCase() && styles.badgeTextActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Guidelines List */}
        <View style={styles.listSection}>
          <Text style={styles.sectionHeader}>
            {searchQuery ? `SEARCH RESULTS (${searchResults.length})` : 'ALL ACTIVE GUIDELINES'}
          </Text>

          {searchResults.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No guidelines found matching "{searchQuery}"</Text>
              <Text style={styles.emptySubtext}>
                Double-check spelling or enter broad clinical terms like "sedation" or "intubation".
              </Text>
              
              {suggestions.length > 0 ? (
                <View style={styles.suggestionsContainer}>
                  <Text style={styles.suggestionsLabel}>Did you mean...?</Text>
                  <View style={styles.suggestionsRow}>
                    {suggestions.map(s => (
                      <TouchableOpacity
                        key={s.query}
                        style={styles.suggestionChip}
                        onPress={() => setSearchQuery(s.query)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.suggestionText}>{s.display}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            searchResults.map(item => {
              const doc = item.doc;
              const confidence = item.confidence;
              const isLowConfidence = confidence >= 40 && confidence <= 70;
              return (
                <TouchableOpacity
                  key={doc.protocol_id}
                  style={[
                    styles.protocolCard,
                    isLowConfidence && styles.protocolCardWarning
                  ]}
                  onPress={() => handleProtocolPress(doc.protocol_id)}
                  activeOpacity={0.8}
                >
                  {isLowConfidence && (
                    <View style={styles.warningBanner}>
                      <Text style={styles.warningBannerText}>
                        ⚠️ Low-Confidence Match ({confidence}%). Verify guideline source before proceeding.
                      </Text>
                    </View>
                  )}
                  <View style={styles.protocolCardHeader}>
                    <View style={styles.protocolTitleCol}>
                      <Text style={styles.protocolTitle}>{doc.clinical.title}</Text>
                      <Text style={styles.protocolMeta}>
                        Ver: {doc.metadata.version_hash} | Confidence: {confidence}%
                      </Text>
                    </View>
                    <Text style={styles.chevron}>→</Text>
                  </View>
  
                  {/* Local site information overlay */}
                  <View style={[
                    styles.siteInfoOverlay,
                    isLowConfidence && styles.siteInfoOverlayWarning
                  ]}>
                    <Text style={[
                      styles.overlayLabel,
                      isLowConfidence && styles.overlayLabelWarning
                    ]}>
                      LOCAL STOCK LOCATION ({activeSite.shortName}):
                    </Text>
                    <Text style={styles.overlayText}>
                      {doc.site_logistics[activeSiteId]?.drug_location || 'Refer to main guideline'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
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
  headerBlock: {
    marginBottom: 20,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#38bdf8', // Sky blue
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  headerDesc: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
  },
  searchCard: {
    backgroundColor: '#0f172a', // Slate 900
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 20,
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 8,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchEmoji: {
    marginRight: 8,
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 10,
  },
  clearEmoji: {
    marginLeft: 8,
    color: '#94a3b8',
    fontSize: 14,
    padding: 4,
  },
  quickFiltersContainer: {
    marginTop: 12,
  },
  filtersLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    backgroundColor: '#1e293b',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  badgeActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  badgeText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  badgeTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  listSection: {
    marginTop: 10,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 12,
  },
  emptyContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  emptyText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  protocolCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 12,
  },
  protocolCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  protocolTitleCol: {
    flex: 1,
    marginRight: 12,
  },
  protocolTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  protocolMeta: {
    fontSize: 11,
    color: '#64748b',
  },
  chevron: {
    fontSize: 18,
    color: '#38bdf8',
    fontWeight: 'bold',
  },
  siteInfoOverlay: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
  },
  overlayLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#38bdf8',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  overlayText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#cbd5e1',
  },
  protocolCardWarning: {
    borderColor: '#d97706',
    borderWidth: 1.5,
  },
  warningBanner: {
    backgroundColor: '#d9770615',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9770630',
    marginBottom: 12,
  },
  warningBannerText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  siteInfoOverlayWarning: {
    borderLeftColor: '#d97706',
  },
  overlayLabelWarning: {
    color: '#d97706',
  },
  suggestionsContainer: {
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  suggestionsLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  suggestionChip: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  suggestionText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  }
});
