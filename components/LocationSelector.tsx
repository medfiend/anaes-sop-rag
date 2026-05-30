import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import * as Location from 'expo-location';

// Coordinates for the 3 hospital sites
export const SITES = {
  site_1: {
    id: 'site_1',
    name: "St George's Hospital",
    shortName: "St George's",
    lat: 51.4273,
    lon: -0.1745,
    emergency_extension: "2222",
    drug_location: "Obstetric Theatre Cupboard (Code 4532)"
  },
  site_2: {
    id: 'site_2',
    name: "Queen Mary's Hospital",
    shortName: "Queen Mary's",
    lat: 51.4552,
    lon: -0.2447,
    emergency_extension: "3333",
    drug_location: "Main Theatre Fridge (Key with ODP)"
  },
  site_3: {
    id: 'site_3',
    name: "Nelson Community Hospital",
    shortName: "Nelson Community",
    lat: 51.4024,
    lon: -0.2078,
    emergency_extension: "9999",
    drug_location: "Emergency Drug Trolley 2"
  }
};

export type SiteId = keyof typeof SITES;

interface LocationSelectorProps {
  onSiteChange: (siteId: SiteId) => void;
  currentSiteId: SiteId;
}

export default function LocationSelector({ onSiteChange, currentSiteId }: LocationSelectorProps) {
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'success' | 'denied' | 'error'>('idle');
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Calculate distance between two coordinates in km (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const findNearestSite = (lat: number, lon: number): SiteId => {
    let nearestSiteId: SiteId = 'site_1';
    let minDistance = Infinity;

    Object.entries(SITES).forEach(([id, site]) => {
      const dist = calculateDistance(lat, lon, site.lat, site.lon);
      if (dist < minDistance) {
        minDistance = dist;
        nearestSiteId = id as SiteId;
      }
    });

    return nearestSiteId;
  };

  const detectLocation = async (force = false) => {
    // If user has already manually overridden, and this isn't a forced click, don't run GPS
    if (isManualOverride && !force) return;

    setGpsStatus('locating');
    setErrorMessage('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsStatus('denied');
        setErrorMessage('Location permission denied. Please select site manually.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      const nearestSiteId = findNearestSite(location.coords.latitude, location.coords.longitude);
      onSiteChange(nearestSiteId);
      setGpsStatus('success');
      if (force) {
        setIsManualOverride(false); // reset override if user explicitly hits locate
      }
    } catch (error) {
      console.error('Error getting location', error);
      setGpsStatus('error');
      setErrorMessage('Could not retrieve GPS coordinates. Using manual selection.');
    }
  };

  // Run location detection on mount
  useEffect(() => {
    detectLocation();
  }, []);

  const handleManualSelect = (siteId: SiteId) => {
    onSiteChange(siteId);
    setIsManualOverride(true);
    setShowModal(false);
  };

  const activeSite = SITES[currentSiteId];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.siteInfo}>
          <Text style={styles.label}>ACTIVE SITE</Text>
          <Text style={styles.siteName}>{activeSite.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isManualOverride ? styles.overrideDot : styles.gpsDot]} />
            <Text style={styles.statusText}>
              {isManualOverride ? "Manual Selection (Locked)" : "Geofenced via GPS"}
            </Text>
          </View>
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity 
            style={styles.overrideButton} 
            onPress={() => setShowModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Change Site</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.locateButton, gpsStatus === 'locating' && styles.disabledButton]} 
            onPress={() => detectLocation(true)}
            disabled={gpsStatus === 'locating'}
            activeOpacity={0.7}
          >
            {gpsStatus === 'locating' ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>📡 GPS Sync</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      {/* Logistics Overlay Preview */}
      <View style={styles.logisticsBar}>
        <View style={styles.logisticsItem}>
          <Text style={styles.logisticsLabel}>🚨 EMERGENCY EXT</Text>
          <Text style={styles.logisticsVal}>{activeSite.emergency_extension}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.logisticsItem}>
          <Text style={styles.logisticsLabel}>📦 DRUG STORAGE</Text>
          <Text style={styles.logisticsVal} numberOfLines={1}>{activeSite.drug_location}</Text>
        </View>
      </View>

      {/* Manual Selection Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Active Clinical Site</Text>
            <Text style={styles.modalSub}>
              Choose your current hospital site. Site-specific pathways and drug stock locations will update automatically.
            </Text>

            <ScrollView style={styles.siteList}>
              {Object.entries(SITES).map(([id, site]) => {
                const isSelected = id === currentSiteId;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.siteItem, isSelected && styles.siteItemActive]}
                    onPress={() => handleManualSelect(id as SiteId)}
                  >
                    <View style={styles.siteItemTextContainer}>
                      <Text style={[styles.siteItemName, isSelected && styles.siteItemNameActive]}>
                        {site.name}
                      </Text>
                      <Text style={styles.siteItemDetails}>
                        Ext: {site.emergency_extension} | {site.drug_location}
                      </Text>
                    </View>
                    {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a', // Slate 900
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155', // Slate 700
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  siteInfo: {
    flex: 1,
    minWidth: 200,
  },
  label: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0284c7', // Sky 600
    letterSpacing: 1,
    marginBottom: 4,
  },
  siteName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc', // Slate 50
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gpsDot: {
    backgroundColor: '#10b981', // Emerald 500
  },
  overrideDot: {
    backgroundColor: '#f59e0b', // Amber 500
  },
  statusText: {
    fontSize: 11,
    color: '#94a3b8', // Slate 400
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  overrideButton: {
    backgroundColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  locateButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  disabledButton: {
    backgroundColor: '#0369a1',
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f8fafc',
  },
  errorText: {
    fontSize: 11,
    color: '#ef4444',
    marginTop: 8,
    fontWeight: '500',
  },
  logisticsBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b', // Slate 800
    borderRadius: 8,
    padding: 12,
    marginTop: 14,
    alignItems: 'center',
  },
  logisticsItem: {
    flex: 1,
  },
  divider: {
    width: 1,
    height: '100%',
    backgroundColor: '#334155',
    marginHorizontal: 12,
  },
  logisticsLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94a3b8',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  logisticsVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '750',
    color: '#f8fafc',
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 18,
  },
  siteList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  siteItem: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  siteItemActive: {
    borderColor: '#0284c7',
    backgroundColor: '#0369a120',
  },
  siteItemTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  siteItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 4,
  },
  siteItemNameActive: {
    color: '#38bdf8',
  },
  siteItemDetails: {
    fontSize: 11,
    color: '#64748b',
  },
  checkIcon: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: '#334155',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  }
});
