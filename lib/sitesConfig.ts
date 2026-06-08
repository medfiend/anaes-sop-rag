// Coordinates and details for the 3 hospital sites
export const SITES = {
  site_1: {
    id: 'site_1' as const,
    name: "St George's Hospital",
    shortName: "St George's",
    lat: 51.4273,
    lon: -0.1745,
    emergency_extension: "2222",
    drug_location: "Obstetric Theatre Cupboard (Code 4532)",
    extn_prefix: "0208725",
    switchboard: "02086721255"
  },
  site_2: {
    id: 'site_2' as const,
    name: "Queen Mary's Hospital",
    shortName: "Queen Mary's",
    lat: 51.4552,
    lon: -0.2447,
    emergency_extension: "3333",
    drug_location: "Main Theatre Fridge (Key with ODP)",
    extn_prefix: "0208487",
    switchboard: "02084876000"
  },
  site_3: {
    id: 'site_3' as const,
    name: "Nelson Community Hospital",
    shortName: "Nelson Community",
    lat: 51.4024,
    lon: -0.2078,
    emergency_extension: "9999",
    drug_location: "Emergency Drug Trolley 2",
    extn_prefix: "0208296",
    switchboard: "02082962000"
  }
} as const;

export type SiteId = keyof typeof SITES;
