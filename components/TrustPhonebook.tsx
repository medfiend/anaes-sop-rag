import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Phone,
  X,
  Copy,
  ShieldAlert,
  Info,
  Check,
  Building,
  SlidersHorizontal
} from 'lucide-react';
import { SITES, SiteId } from '../lib/sitesConfig';

interface TrustPhonebookProps {
  currentSiteId: SiteId;
  onSiteChange?: (siteId: SiteId) => void;
}

interface Contact {
  name: string;
  jobTitle: string;
  department: string;
  extn: string;
  altExtn: string;
  bleep: string;
  room: string;
  site: string;
}

// Maps site abbreviations from HTML to our site keys
const SITE_MAPPING: Record<string, SiteId> = {
  'ST.G': 'site_1',
  'STG': 'site_1',
  'ST5.G': 'site_1',
  'ST,G': 'site_1',
  'ST. G': 'site_1',
  'MS': 'site_1',
  'ST.J': 'site_1',
  'FHSCS': 'site_1',
  'QMH': 'site_2',
  'QMHR': 'site_2',
  'EPSOM SH': 'site_3',
  'EPSOM & ST HELIERS': 'site_3',
  'EPSOM': 'site_3',
};

// Helper to compute Levenshtein distance
function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        tmp[i][j] = tmp[i - 1][j - 1];
      } else {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1, // deletion
          tmp[i][j - 1] + 1, // insertion
          tmp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  return tmp[a.length][b.length];
}

// Token-based fuzzy match checking
function isFuzzyMatch(text: string, query: string): boolean {
  if (!text) return false;
  const targetText = text.toLowerCase();
  const searchWord = query.toLowerCase();
  
  if (targetText.includes(searchWord)) return true;
  
  const textWords = targetText.split(/[^a-z0-9]+/);
  const queryWords = searchWord.split(/[^a-z0-9]+/);
  
  // Check if all query words match at least one text word fuzzy-style
  return queryWords.every(qWord => {
    if (qWord.length <= 2) {
      // For short words (like bleeps/exts), require exact substring or exact match
      return textWords.some(tWord => tWord.includes(qWord));
    }
    
    return textWords.some(tWord => {
      // Exact substring match
      if (tWord.includes(qWord)) return true;
      
      // Calculate Levenshtein distance
      // Allow 1 edit for 3-5 chars, 2 edits for 6+ chars
      const maxDistance = qWord.length <= 5 ? 1 : 2;
      const distance = getLevenshteinDistance(tWord, qWord);
      return distance <= maxDistance;
    });
  });
}

export default function TrustPhonebook({ currentSiteId, onSiteChange }: TrustPhonebookProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showAllSites, setShowAllSites] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Staff directory is fetched from the authenticated API instead of being
  // bundled into the client JS (it contains real staff names/extensions).
  const [phonebookData, setPhonebookData] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [contactsError, setContactsError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const loadContacts = async () => {
      try {
        const res = await fetch('/api/phonebook');
        if (!res.ok) {
          throw new Error(res.status === 401 ? 'Sign in to view the phonebook.' : 'Could not load the directory.');
        }
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.contacts)) {
          setPhonebookData(data.contacts);
        }
      } catch (err: any) {
        if (!cancelled) setContactsError(err.message || 'Could not load the directory.');
      } finally {
        if (!cancelled) setIsLoadingContacts(false);
      }
    };
    loadContacts();
    return () => { cancelled = true; };
  }, []);

  // Active site configurations
  const activeSite = SITES[currentSiteId];

  // Quick categories
  const categories = [
    { id: 'All', name: 'All' },
    { id: 'Emergency', name: '🚨 Emergencies' },
    { id: 'Anaes', name: '🎭 Anaesthetics/Theatres' },
    { id: 'ICU', name: '🏥 ICU' },
    { id: 'Maternity', name: '🍼 Maternity' },
    { id: 'Wards', name: '🚪 Wards/Other' },
  ];

  // Helper to match clinical categories by keyword
  const matchesCategory = (contact: Contact, category: string): boolean => {
    if (category === 'All') return true;

    const dept = (contact.department || '').toLowerCase();
    const title = (contact.jobTitle || '').toLowerCase();
    const name = (contact.name || '').toLowerCase();
    const bleep = contact.bleep || '';

    if (category === 'Emergency') {
      return (
        bleep !== '' && bleep.startsWith('88') ||
        name.includes('emergency') || name.includes('arrest') || name.includes('resus') || 
        name.includes('triage') || name.includes('incharge') || name.includes('crash') ||
        dept.includes('emergency') || title.includes('in charge')
      );
    }
    if (category === 'Anaes') {
      return (
        dept.includes('anaes') || dept.includes('thea') || dept.includes('scrub') || 
        dept.includes('recovery') || dept.includes('maxfax') ||
        title.includes('anaes') || title.includes('thea') || title.includes('odp') || title.includes('oda') ||
        name.includes('anaes') || name.includes('thea') || name.includes('theatres')
      );
    }
    if (category === 'ICU') {
      return (
        dept.includes('icu') || dept.includes('itu') || dept.includes('intensive') || dept.includes('critical') ||
        name.includes('icu') || name.includes('itu') || name.includes('intensive')
      );
    }
    if (category === 'Maternity') {
      return (
        dept.includes('obs') || dept.includes('gyn') || dept.includes('matern') || 
        dept.includes('deliver') || dept.includes('antenatal') || dept.includes('postnatal') || 
        dept.includes('labour') || name.includes('paed') || name.includes('child')
      );
    }
    if (category === 'Wards') {
      // Wards are entries that do not fall into the above clinical groupings
      return (
        !matchesCategory(contact, 'Emergency') &&
        !matchesCategory(contact, 'Anaes') &&
        !matchesCategory(contact, 'ICU') &&
        !matchesCategory(contact, 'Maternity')
      );
    }
    return true;
  };

  // Filter and search contact records
  const filteredContacts = useMemo(() => {
    return phonebookData.filter(contact => {
      // 1. Site Filter
      const contactSiteId = SITE_MAPPING[contact.site] || 'site_1'; // default empty/others to site_1 (St George's)
      if (!showAllSites && contactSiteId !== currentSiteId) {
        return false;
      }

      // 2. Category Filter
      if (!matchesCategory(contact, selectedCategory)) {
        return false;
      }

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim();
        const nameMatch = isFuzzyMatch(contact.name, query);
        const titleMatch = isFuzzyMatch(contact.jobTitle, query);
        const deptMatch = isFuzzyMatch(contact.department, query);
        const roomMatch = isFuzzyMatch(contact.room, query);

        // Exact substring matching for numeric codes
        const lowerQuery = query.toLowerCase();
        const extnMatch = (contact.extn || '').includes(lowerQuery);
        const altExtnMatch = (contact.altExtn || '').includes(lowerQuery);
        const bleepMatch = (contact.bleep || '').includes(lowerQuery);

        return nameMatch || titleMatch || deptMatch || roomMatch || extnMatch || altExtnMatch || bleepMatch;
      }

      return true;
    });
  }, [phonebookData, currentSiteId, selectedCategory, searchQuery, showAllSites]);

  // Clean Bleep representation (remove leading '88' for switchboard representation)
  const getDisplayBleep = (bleep: string) => {
    if (!bleep) return '';
    if (bleep.startsWith('88') && bleep.length === 6) {
      return bleep.slice(2); // return the 4-digit bleep
    }
    return bleep;
  };

  // Helper to handle extension clicking
  const handleDialExtension = (contact: Contact) => {
    if (!contact.extn) return;
    
    // Determine the prefix based on contact site, fallback to current active site
    const contactSiteId = SITE_MAPPING[contact.site] || currentSiteId;
    const siteConfig = SITES[contactSiteId] || activeSite;
    
    const prefix = siteConfig.extn_prefix;
    const fullNumber = `${prefix}${contact.extn}`;
    
    window.open(`tel:${fullNumber}`);
  };

  // Helper to copy text to clipboard
  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 font-sans">
      
      {/* Search and Filters Block */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 shrink-0 space-y-3 z-10">
        
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeSite.shortName} phonebook (name, bleep, ext)...`}
            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-100 rounded-xl pl-10 pr-10 py-3 text-xs transition-colors"
          />
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3.5 text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Categories Bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none shrink-0 -mx-4 px-4 mask-right">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xxs font-bold transition-all border shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-teal-500 text-slate-950 border-teal-400'
                  : 'bg-slate-950 hover:bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Site Filter / Toggle */}
        <div className="flex items-center justify-between text-[11px] text-slate-450 border-t border-slate-850 pt-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-teal-400" />
            <span>
              Active Site:{" "}
              <select
                value={currentSiteId}
                onChange={(e) => onSiteChange?.(e.target.value as SiteId)}
                className="bg-transparent border-0 text-teal-400 font-bold focus:ring-0 cursor-pointer ml-1 p-0.5 rounded hover:bg-slate-800 outline-none text-[11px]"
              >
                {Object.entries(SITES).map(([id, site]) => (
                  <option key={id} value={id} className="bg-slate-900 text-slate-200">
                    {site.shortName}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAllSites}
              onChange={() => setShowAllSites(!showAllSites)}
              className="rounded border-slate-800 bg-slate-950 text-teal-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
            />
            <span>Search All Sites</span>
          </label>
        </div>
      </div>

      {/* Directory List Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-900 bg-slate-950">
        {filteredContacts.length > 0 ? (
          filteredContacts.map((contact, idx) => (
            <div 
              key={idx} 
              onClick={() => setSelectedContact(contact)}
              className="p-4 hover:bg-slate-900/40 transition-colors flex items-center justify-between group cursor-pointer border-b border-slate-900/40"
            >
              <div className="min-w-0 pr-4 flex-1">
                <h3 className="text-xs font-bold text-slate-200 group-hover:text-teal-300 transition-colors truncate">
                  {contact.name}
                </h3>
                
                {contact.jobTitle && (
                  <p className="text-[10px] text-slate-400 font-semibold truncate mt-0.5 uppercase tracking-wide">
                    {contact.jobTitle}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                  {contact.department && (
                    <span className="truncate max-w-[150px]">{contact.department}</span>
                  )}
                  {contact.department && contact.room && <span>•</span>}
                  {contact.room && (
                    <span className="truncate max-w-[100px]">{contact.room}</span>
                  )}
                  {showAllSites && (
                    <>
                      <span>•</span>
                      <span className="text-teal-500 font-semibold">{contact.site || 'ST.G'}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Badges / Call Button */}
              <div className="flex items-center gap-2 shrink-0">
                {contact.bleep && (
                  <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded text-[10px] font-bold">
                    Bleep {getDisplayBleep(contact.bleep)}
                  </span>
                )}
                {contact.extn && (
                  <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-1 rounded text-[10px] font-bold">
                    Ext {contact.extn}
                  </span>
                )}
                <div className="w-8 h-8 rounded-lg bg-slate-900 group-hover:bg-teal-500 group-hover:text-slate-950 text-slate-400 border border-slate-800 transition-all flex items-center justify-center">
                  <Phone className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 text-center text-slate-600 flex flex-col items-center justify-center select-none">
            <Building className="w-12 h-12 text-slate-800 mb-3" />
            {isLoadingContacts ? (
              <>
                <p className="font-semibold text-slate-400 text-sm animate-pulse">Loading directory…</p>
                <p className="text-xxs text-slate-600 max-w-xs mt-1 leading-normal">
                  Fetching the trust phonebook over a secure connection.
                </p>
              </>
            ) : contactsError ? (
              <>
                <p className="font-semibold text-slate-400 text-sm">Directory unavailable</p>
                <p className="text-xxs text-slate-600 max-w-xs mt-1 leading-normal">{contactsError}</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-400 text-sm">No contacts found</p>
                <p className="text-xxs text-slate-600 max-w-xs mt-1 leading-normal">
                  Try adjusting your query or category filters, or toggle "Search All Sites".
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action / Bleep popup helper Modal */}
      {selectedContact && (() => {
        const contactSiteId = SITE_MAPPING[selectedContact.site] || currentSiteId;
        const siteConfig = SITES[contactSiteId] || activeSite;
        const displayBleep = getDisplayBleep(selectedContact.bleep);
        
        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-in">
              
              {/* Modal Header */}
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-teal-400" />
                  <span className="text-slate-200 font-bold text-xs uppercase tracking-wide">
                    Dial Options
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedContact(null)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-200">{selectedContact.name}</h4>
                  {selectedContact.jobTitle && (
                    <p className="text-xxs text-slate-400 font-bold uppercase mt-0.5 tracking-wide">
                      {selectedContact.jobTitle}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedContact.department || 'General'} | Site: {siteConfig.name}
                  </p>
                </div>

                {/* Direct Dial Extension */}
                {selectedContact.extn && (
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Direct Mobile Dial</span>
                      <span className="text-xs font-semibold text-slate-300">
                        {siteConfig.extn_prefix}{selectedContact.extn} (Ext: {selectedContact.extn})
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopyToClipboard(`${siteConfig.extn_prefix}${selectedContact.extn}`)}
                        className="p-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 rounded-lg transition-colors"
                        title="Copy Number"
                      >
                        {copiedText ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDialExtension(selectedContact)}
                        className="bg-teal-500 hover:bg-teal-650 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-md shadow-teal-500/10"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call
                      </button>
                    </div>
                  </div>
                )}

                {/* Bleep / Pager Instructions */}
                {selectedContact.bleep && (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider block">Hospital Bleep Code</span>
                        <span className="text-lg font-black text-slate-100">
                          Bleep {displayBleep}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-xxs text-slate-400 space-y-1.5 leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-850/50">
                      <p><strong>Option 1 (From Mobile)</strong>: Tap below to dial the switchboard. When prompted, enter bleep <strong>{displayBleep}</strong>.</p>
                      <p><strong>Option 2 (From Landline)</strong>: Dial <strong>88</strong>, wait for prompt tone, then enter <strong>{displayBleep}</strong>.</p>
                    </div>

                    <button
                      onClick={() => window.open(`tel:${siteConfig.switchboard}`)}
                      className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-red-950/40 text-red-400 hover:text-red-300 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Phone className="w-3.5 h-3.5" /> Call Switchboard ({siteConfig.switchboard})
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
