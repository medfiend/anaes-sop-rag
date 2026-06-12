"use client";

import React, { useState, useEffect } from 'react';
import { useUser, useClerk, SignIn } from '@clerk/nextjs';
import { 
  Search, ShieldAlert, FileText, UserCheck, LogOut, ArrowRight, ArrowLeft,
  Menu, HelpCircle, Activity, Sparkles, Send, Calculator, History, ChevronRight, X, Pin
} from 'lucide-react';
import PdfViewer from '../components/PdfViewer';
import DoseCalculator from '../components/DoseCalculator';
import { useSearch, MATCH_STRENGTH_LABELS } from './hooks/useSearch';
import staticGuidelines from '../data/guidelines_db.json';
import TrustPhonebook from '../components/TrustPhonebook';
import { SiteId } from '../lib/sitesConfig';
import { formatMessageText } from '../lib/markdownFormat';

const WELCOME_MESSAGE = {
  sender: 'bot' as const,
  text: `Welcome to **AnaesSOP** clinical governance database. Search or query active guidelines above. For high-stress events, you can access the emergency aid buttons anytime.`
};

// Manually curated guidelines bundled with the app. Their calculators were
// hand-verified, so they bypass the dynamic-calculator approval gate.
const STATIC_GUIDELINE_IDS = [
  'la-toxicity', 'malignant-hyperthermia', 'resus-als', 'dexmed-sop-afoi', 'post-op-fossa',
  'key-basic-plan', 'hypoxia', 'increased-airway-pressure', 'hypotension', 'hypertension',
  'bradycardia', 'tachycardia', 'peri-operative-hyperthermia', 'anaphylaxis', 'massive-blood-loss',
  'cico', 'bronchospasm', 'circulatory-embolus', 'laryngospasm', 'patient-fire',
  'cardiac-tamponade', 'high-central-neuraxial-block', 'cardiac-ischaemia', 'neuroprotection-post-arrest',
  'sepsis', 'mains-oxygen-failure', 'mains-electricity-failure', 'emergency-evacuation'
];

export default function Home() {
  const { executeSearch, guidelines, setGuidelines } = useSearch();
  const [pullingThroughGuidelineId, setPullingThroughGuidelineId] = useState<string>('');
  
  // Clerk Auth state
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();

  // Demo Mode state
  const [demoAuth, setDemoAuth] = useState<boolean>(false);
  const [demoPasscode, setDemoPasscode] = useState<string>('');
  const [demoError, setDemoError] = useState<string>('');
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);


  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDemoAuth(sessionStorage.getItem('demo-auth') === 'true');
    }
  }, []);

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  const rawEmail = clerkUser?.primaryEmailAddress?.emailAddress || (isDemoMode && demoAuth ? 'audit.lead@nhs.net' : '');
  const isNhsEmail = rawEmail.endsWith('@nhs.net') || rawEmail.endsWith('.nhs.uk') || rawEmail === 'audit.lead@nhs.net' || rawEmail === 's.parashar1@nhs.net';
  const isAdminEmail = rawEmail === 'audit.lead@nhs.net' || rawEmail === 's.parashar1@nhs.net';

  const user = (clerkUser && isNhsEmail) || (isDemoMode && demoAuth) ? {
    email: rawEmail || 'audit.lead@nhs.net',
    role: (isAdminEmail || (isDemoMode && demoAuth) ? 'Admin' : 'Clinician') as 'Clinician' | 'Admin'
  } : null;

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // No hardcoded fallback: demo login is impossible unless the deployment
    // explicitly configures a passcode.
    const expected = process.env.NEXT_PUBLIC_DEMO_PASSCODE;
    if (!expected) {
      setDemoError('Demo mode is not configured on this deployment. Contact the administrator.');
      return;
    }
    if (demoPasscode === expected) {
      sessionStorage.setItem('demo-auth', 'true');
      document.cookie = `demo_passcode=${demoPasscode}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      setDemoAuth(true);
      setDemoError('');
    } else {
      setDemoError('Invalid passcode. Please try again.');
    }
  };
  
  // Feedback state
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState('Feature Request');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Workspace state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'bot'; text: string; citations?: any[]; queryText?: string; guidelineId?: string }>>([]);

  // Seed welcome message when page loads
  useEffect(() => {
    if (chatHistory.length === 0) {
      setChatHistory([WELCOME_MESSAGE]);
    }
  }, [chatHistory.length]);

  // Close login modal when user logs in successfully
  useEffect(() => {
    if (user) {
      setIsLoginOpen(false);
    }
  }, [user]);

  
  // PDF / Citations synchronization
  const [activePdfUrl, setActivePdfUrl] = useState<string>('');
  const [activePdfName, setActivePdfName] = useState<string>('');
  const [activePage, setActivePage] = useState<number>(1);
  const [activeHighlights, setActiveHighlights] = useState<any[]>([]);
  const [activeGuidelineId, setActiveGuidelineId] = useState<string>('');
  const [instantResults, setInstantResults] = useState<any[]>([]);
  const [directoryFilter, setDirectoryFilter] = useState('');
  const [showSummary, setShowSummary] = useState(true);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  
  // Mobile responsive layout
  const [mobileTab, setMobileTab] = useState<'search' | 'pdf' | 'phonebook'>('search');
  const [leftPanelTab, setLeftPanelTab] = useState<'search' | 'phonebook'>('search');
  const [currentSiteId, setCurrentSiteId] = useState<SiteId>('site_1');
  const [isMobile, setIsMobile] = useState(false);

  // Guideline pinning and offline cache state
  const [pinnedGuidelineIds, setPinnedGuidelineIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pinnedGuidelineIds');
      if (saved) {
        try {
          setPinnedGuidelineIds(JSON.parse(saved));
        } catch (e) {
          console.error("Error parsing pinnedGuidelineIds", e);
        }
      }
    }
  }, []);

  const togglePinGuideline = async (id: string, pdfName?: string) => {
    let newPinned: string[];
    const isPinned = pinnedGuidelineIds.includes(id);
    
    if (isPinned) {
      newPinned = pinnedGuidelineIds.filter(x => x !== id);
      if (pdfName) {
        const { removePdfFromCache } = await import('../lib/cacheHelper');
        await removePdfFromCache(pdfName);
      }
    } else {
      if (pinnedGuidelineIds.length >= 3) {
        alert("You can pin up to 3 guidelines for offline access. Please unpin another guideline first.");
        return;
      }
      newPinned = [...pinnedGuidelineIds, id];
      if (pdfName) {
        const { cachePdfOffline } = await import('../lib/cacheHelper');
        await cachePdfOffline(pdfName);
      }
    }
    
    setPinnedGuidelineIds(newPinned);
    localStorage.setItem('pinnedGuidelineIds', JSON.stringify(newPinned));
  };

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isKeyboardActive, setIsKeyboardActive] = useState(false);

  useEffect(() => {
    const handleFocusChange = () => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );
      setIsKeyboardActive(!!isInput);
    };

    document.addEventListener('focusin', handleFocusChange);
    document.addEventListener('focusout', handleFocusChange);
    return () => {
      document.removeEventListener('focusin', handleFocusChange);
      document.removeEventListener('focusout', handleFocusChange);
    };
  }, []);

  // Run fast client-side instant search on query change
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setInstantResults([]);
      return;
    }

    const runInstantSearch = async () => {
      try {
        const res = await executeSearch(trimmed);
        if (res && res.results && !res.isNegativeResult) {
          setInstantResults(res.results.slice(0, 5)); // show top 5 matches
        } else {
          setInstantResults([]);
        }
      } catch (err) {
        console.error("Instant search error:", err);
      }
    };

    // Debounce search slightly to avoid excessive CPU load
    const timer = setTimeout(runInstantSearch, 150);
    return () => clearTimeout(timer);
  }, [searchQuery, executeSearch]);

  // Dynamic Pull-Through on active guideline selection
  useEffect(() => {
    if (!activeGuidelineId) return;
    
    // Find guideline in current state
    const current = guidelines.find(g => g.id === activeGuidelineId);
    if (!current) return;
    
    // If it's a custom guideline and records aren't loaded yet
    const isStatic = STATIC_GUIDELINE_IDS.includes(activeGuidelineId);
    const isAagbi = current.pdf_name?.startsWith('http');
    const hasRecords = current.records && current.records.length > 0;
    
    if (!isStatic && !isAagbi && !hasRecords) {
      const fetchFullGuideline = async () => {
        setPullingThroughGuidelineId(activeGuidelineId);
        try {
          const res = await fetch(`/api/guidelines?id=${activeGuidelineId}`);
          const data = await res.json();
          if (data.success && data.guideline) {
            // Update guidelines state in search hook
            setGuidelines(prev => prev.map(g => g.id === activeGuidelineId ? { ...g, ...data.guideline } : g));
          }
        } catch (err) {
          console.error("Failed to pull through guideline:", err);
        } finally {
          setPullingThroughGuidelineId('');
        }
      };
      
      fetchFullGuideline();
    }
  }, [activeGuidelineId, guidelines, setGuidelines]);

  // Helper to resolve PDF URL dynamically (QRH is served locally, others stream from R2, AAGBI links directly)
  const getPdfUrl = (filename: string) => {
    if (!filename) return '';
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename;
    }
    if (filename === 'QRH_complete_June_2023.pdf') {
      return '/QRH_complete_June_2023.pdf';
    }
    return `/api/pdf?file=${encodeURIComponent(filename)}`;
  };

  // Handler for emergency bypass guides
  const handleOpenEmergencyAid = (fileName: string, name: string) => {
    // Map the mock filenames to the actual existing files in public folder
    let targetFile = fileName;
    let targetPage = 1;
    let targetGuidelineId = '';
    
    if (fileName === 'la_toxicity_aagbi.pdf') {
      targetFile = 'QRH_complete_June_2023.pdf';
      targetPage = 23;
      targetGuidelineId = 'la-toxicity';
    } else if (fileName === 'malignant_hyperthermia.pdf') {
      targetFile = 'QRH_complete_June_2023.pdf';
      targetPage = 21;
      targetGuidelineId = 'malignant-hyperthermia';
    } else if (fileName === 'resus_als.pdf') {
      targetFile = 'QRH_complete_June_2023.pdf';
      targetPage = 6;
      targetGuidelineId = 'resus-als';
    }
    
    setActivePdfUrl(getPdfUrl(targetFile));
    setActivePdfName(name);
    setActivePage(targetPage);
    setActiveGuidelineId(targetGuidelineId);
    setActiveHighlights([]);
    if (isMobile) {
      setMobileTab('pdf');
    }
  };

  const handleSelectGuideline = (id: string, name: string, pdfName?: string, defaultPage: number = 1) => {
    const targetFile = pdfName || 'QRH_complete_June_2023.pdf';
    
    // Reset panel toggle states on new selection
    setShowSummary(true);
    setShowCalculator(false);
    setShowPdf(false);
    
    // Check if pdfName starts with http (AAGBI remote link)
    if (targetFile.startsWith('http://') || targetFile.startsWith('https://')) {
      window.open(targetFile, '_blank');
      
      setChatHistory([
        WELCOME_MESSAGE,
        { sender: 'user', text: `Selected guideline: ${name}` },
        { 
          sender: 'bot', 
          text: `**Result from Guideline: ${name}** (loaded directly from AAGBI server)`, 
          citations: [{
            docId: id,
            docName: name,
            pdfName: targetFile,
            page: defaultPage
          }],
          guidelineId: id
        }
      ]);
      setActivePdfUrl('');
      setActiveGuidelineId(id);
      setSearchQuery('');
      setInstantResults([]);
      if (isMobile) {
        setMobileTab('pdf');
      }
      return;
    }

    const citations = [{
      docId: id,
      docName: name,
      pdfName: targetFile,
      page: defaultPage
    }];

    setChatHistory([
      WELCOME_MESSAGE,
      { sender: 'user', text: `Selected guideline: ${name}` },
      { 
        sender: 'bot', 
        text: `**Result from Guideline: ${name}**`, 
        citations,
        guidelineId: id
      }
    ]);
    
    setActivePdfUrl(getPdfUrl(targetFile));
    setActivePdfName(name);
    setActivePage(defaultPage);
    setActiveGuidelineId(id);
    setActiveHighlights([]);
    setSearchQuery('');
    setInstantResults([]);
    
    if (isMobile) {
      setMobileTab('pdf');
    }
  };

  const handleResetToHome = () => {
    setChatHistory([WELCOME_MESSAGE]);
    setActiveGuidelineId('');
    setActivePdfUrl('');
    setSearchQuery('');
    setInstantResults([]);
    setMobileTab('search');
    setShowSummary(true);
    setShowCalculator(false);
    setShowPdf(false);
  };

  // Filter guidelines for the browse directory on the landing page
  const filteredDirectoryGuidelines = guidelines
    .filter(g => {
      if (!g.name) return false;
      const searchStr = (g.name + ' ' + (g.search_tags || []).join(' ')).toLowerCase();
      return searchStr.includes(directoryFilter.toLowerCase());
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Clerk handles sending and verifying OTP codes natively.

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setIsSubmittingFeedback(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email || 'emergency-user',
          feedback: feedbackText,
          category: feedbackCategory
        })
      });
      alert("Thank you for your feedback! The governance audit lead has been notified.");
      setFeedbackText('');
      setIsFeedbackOpen(false);
    } catch (err) {
      console.error(err);
      alert("Error submitting feedback.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleLogout = async () => {
    if (isDemoMode) {
      sessionStorage.removeItem('demo-auth');
      document.cookie = 'demo_passcode=; path=/; Max-Age=0;';
      setDemoAuth(false);
    } else {
      await signOut();
    }
    setChatHistory([]);
    setActivePdfUrl('');
  };

  // RAG Search via local Orama index and Cloudflare query vectorizer
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const query = searchQuery;
    // Reset layout for new search: clear history except welcome greeting, clear active PDF and active guideline ID
    setChatHistory([
      WELCOME_MESSAGE,
      { sender: 'user', text: query }
    ]);
    setActivePdfUrl('');
    setActiveGuidelineId('');
    setIsSearching(true);
    setSearchQuery('');

    try {
      const searchRes = await executeSearch(query);
      let botResponse = "";
      let citations: any[] = [];

      if (searchRes.isNegativeResult) {
        botResponse = "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel.";
        if (user) {
          botResponse += "\n\n[Online AI Search](/ask-online-ai)";
        }
      } else {
        const topMatch = searchRes.results[0];

        botResponse = `**Result from Guideline: ${topMatch.title}** (${MATCH_STRENGTH_LABELS[topMatch.matchStrength]})`;

        if (searchRes.isLowConfidence) {
          botResponse += `\n\n⚠️ **Weak match:** This result is based on limited keyword overlap with your query — verify it is the right guideline before acting on it.`;
          if (user) {
            botResponse += ` You may run a deep AI search on the server using the button below.\n\n[Online AI Search](/ask-online-ai)`;
          }
        }

        // Map matching guidelines to citations
        citations = searchRes.results.slice(0, 3).map(match => ({
          docId: match.docId,
          docName: match.title,
          pdfName: match.pdfName,
          page: match.defaultPage || 1 // Jump to the correct page of the guideline!
        }));

        // Auto select the active guideline for the calculator widget
        setActiveGuidelineId(topMatch.docId);
      }

      setChatHistory(prev => [...prev, { 
        sender: 'bot', 
        text: botResponse, 
        citations,
        queryText: query, // Preserve query context to allow escalation
        guidelineId: searchRes.isNegativeResult ? undefined : searchRes.results[0].docId
      }]);
    } catch (err: any) {
      console.error("Local search engine execution error:", err);
      setChatHistory(prev => [...prev, { sender: 'bot', text: `Search engine error: ${err.message}` }]);
    } finally {
      setIsSearching(false);
    }
  };

  // Perform deeper search using frontier LLM (Gemini Pro) on the server
  const handleOnlineSearch = async (queryText: string, chatIndex: number) => {
    // Modify bot message to indicate processing state
    setChatHistory(prev => {
      const copy = [...prev];
      copy[chatIndex] = {
        sender: 'bot',
        text: "⚡ Running deep online search against guidelines bucket via Cloudflare Workers AI & Gemini Pro... please stand by..."
      };
      return copy;
    });

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText })
      });
      if (!response.ok) {
        throw new Error(`HTTP API error: ${response.statusText}`);
      }
      const data = await response.json();
      
      setChatHistory(prev => {
        const copy = [...prev];
        copy[chatIndex] = {
          sender: 'bot',
          text: data.text,
          citations: data.citations
        };
        return copy;
      });
    } catch (err: any) {
      console.error("Online escalation search failed:", err);
      setChatHistory(prev => {
        const copy = [...prev];
        copy[chatIndex] = {
          sender: 'bot',
          text: `Online search failed: ${err.message}. Please verify network connection or consult hardcopy manuals.`
        };
        return copy;
      });
    }
  };

  const handleCitationClick = (cit: any) => {
    const targetFile = cit.pdfName || 'QRH_complete_June_2023.pdf';
    setActiveGuidelineId(cit.docId);
    
    // Open native browser PDF viewer in a new tab at the exact page
    const targetUrl = targetFile.startsWith('http') ? targetFile : `${getPdfUrl(targetFile)}#page=${cit.page}`;
    window.open(targetUrl, '_blank');
    
    if (isMobile) {
      setMobileTab('pdf');
    }
  };

  return (
    <div className="min-h-screen md:h-screen bg-slate-900 flex flex-col font-sans md:overflow-hidden">
      {/* Global Clinical Header */}
      <header className="bg-slate-950 border-b border-slate-800 text-white px-4 py-3 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-slate-950 shadow-md">
            AS
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none tracking-wide text-slate-100 flex items-center gap-1">
              AnaesSOP <span className="text-xxs px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 font-normal border border-teal-500/30">PILOT</span>
            </h1>
            <span className="text-xxs text-slate-400 hidden sm:block">Anaesthetic Clinical Governance Database</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {user.role === 'Admin' && (
                <a 
                  href="/admin"
                  className="bg-teal-500 hover:bg-teal-650 active:scale-95 text-slate-950 font-bold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-md shadow-teal-500/10 animate-fade-in"
                  title="Admin Panel"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Admin Panel</span>
                </a>
              )}
              <button 
                onClick={() => setIsFeedbackOpen(true)}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-teal-400 hover:text-teal-300 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                title="Feedback"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Feedback</span>
              </button>
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-300">{user.email}</span>
                <span className="text-xxs text-teal-400">{user.role} Access</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xxs text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 flex items-center gap-1">
                <Activity className="w-3 h-3 animate-pulse-soft" /> Emergency Bypass Mode Active
              </span>
              <button 
                onClick={() => setIsLoginOpen(true)}
                className="bg-teal-500 hover:bg-teal-650 active:scale-95 text-slate-950 font-bold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-md shadow-teal-500/10"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main body area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {/* Full Interactive Workspace (Emergency Bypass/Signed In) */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Split Screen Panel 1: RAG Chat, Calculators & Phonebook */}
            <div className={`flex-1 md:w-1/2 flex flex-col overflow-hidden border-r border-slate-800 ${
              mobileTab === 'pdf' ? 'hidden md:flex' : 'flex'
            }`}>
              {/* Desktop Tab Switcher */}
              <div className="hidden md:flex bg-slate-950 border-b border-slate-800 shrink-0">
                <button
                  onClick={() => setLeftPanelTab('search')}
                  className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 ${
                    leftPanelTab === 'search'
                      ? 'border-teal-500 text-teal-400 bg-slate-900/40'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
                  }`}
                >
                  Chat & Search
                </button>
                <button
                  onClick={() => setLeftPanelTab('phonebook')}
                  className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 ${
                    leftPanelTab === 'phonebook'
                      ? 'border-teal-500 text-teal-400 bg-slate-900/40'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
                  }`}
                >
                  Trust Phonebook
                </button>
              </div>

              {(isMobile ? mobileTab === 'phonebook' : leftPanelTab === 'phonebook') ? (
                user ? (
                  <TrustPhonebook currentSiteId={currentSiteId} onSiteChange={setCurrentSiteId} />
                ) : (
                  <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none text-slate-500">
                    <ShieldAlert className="w-12 h-12 text-slate-800 mb-3" />
                    <p className="font-medium text-slate-400 text-sm">NHS Trust Phonebook Locked</p>
                    <p className="text-xxs text-slate-650 max-w-xs mt-1 leading-normal mb-4">
                      Access to the internal NHS trust phonebook is restricted. Please sign in with your secure NHS email to view.
                    </p>
                    <button
                      onClick={() => setIsLoginOpen(true)}
                      className="bg-teal-500 hover:bg-teal-650 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors"
                    >
                      Sign In to View
                    </button>
                  </div>
                )
              ) : (
                <>
                  {/* Search Bar Block */}
                  <div className="bg-slate-950 p-4 border-b border-slate-800 shrink-0 relative z-30">
                    {!user && (
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xxs p-2.5 rounded-lg mb-3 flex items-start gap-2 leading-relaxed">
                        <Activity className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                        <div>
                          <strong>Emergency Bypass Mode Active:</strong> You are searching cached national QRH guidelines. NHS staff can <button onClick={() => setIsLoginOpen(true)} className="underline font-bold text-teal-400 hover:text-teal-350">Sign In</button> to access the complete hospital SOP database, internal phonebook, and admin uploads.
                        </div>
                      </div>
                    )}
                    <form onSubmit={handleSearchSubmit} className="relative">
                  <input
                    type="text"
                    required
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={user 
                      ? "Search all hospital SOPs and guidelines (e.g. 'dexmed', 'LA toxicity')..." 
                      : "Search all 26 emergency QRH guidelines (e.g. 'anaphylaxis', 'hypoxia')..."
                    }
                    className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-100 rounded-xl pl-10 pr-4 py-3 text-xs transition-colors"
                  />
                  <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                  <button 
                    type="submit" 
                    disabled={isSearching}
                    className="absolute right-2 top-2 bg-teal-500 hover:bg-teal-600 text-slate-950 font-semibold px-3 py-1.5 rounded-lg text-xxs transition-colors disabled:opacity-50"
                  >
                    {isSearching ? "Searching..." : <Send className="w-3.5 h-3.5" />}
                  </button>

                  {/* Instant Dropdown Search Results */}
                  {instantResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-40 overflow-hidden max-h-60 overflow-y-auto">
                      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider flex justify-between">
                        <span>Matching SOP Guidelines</span>
                        <span>Instant Search</span>
                      </div>
                      <div className="divide-y divide-slate-900">
                        {instantResults.map((match) => (
                          <div
                            key={match.docId}
                            className="w-full hover:bg-slate-900/40 transition-colors flex items-center justify-between border-b border-slate-900 group/item"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectGuideline(match.docId, match.title, match.pdfName, match.defaultPage)}
                              className="flex-1 text-left px-4 py-3 text-xs text-slate-200 group flex items-center justify-between truncate"
                            >
                              <div className="flex flex-col gap-0.5 truncate pr-4">
                                <span className="font-semibold text-slate-200 group-hover:text-teal-400 transition-colors truncate flex items-center gap-1.5">
                                  {match.title}
                                  {(() => {
                                    const gl = guidelines.find(g => g.id === match.docId);
                                    if (gl?.calculator) {
                                      return (
                                        <span className="inline-flex items-center gap-0.5 bg-teal-500/10 text-teal-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-teal-500/20 shadow-sm shrink-0">
                                          <Calculator className="w-2.5 h-2.5" /> CALC
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </span>
                                <span className="text-[10px] text-slate-500 truncate">
                                  {match.context.substring(0, 80)}...
                                </span>
                              </div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 font-medium shrink-0 capitalize">
                                {match.matchStrength} match
                              </span>
                            </button>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePinGuideline(match.docId, match.pdfName);
                              }}
                              className="p-3 mr-1 text-slate-500 hover:text-teal-400 transition-colors"
                              title={pinnedGuidelineIds.includes(match.docId) ? "Unpin Guideline" : "Pin Guideline"}
                            >
                              <Pin className={`w-4 h-4 ${pinnedGuidelineIds.includes(match.docId) ? 'text-teal-400 fill-teal-400' : ''}`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </form>

                  {(chatHistory.length > 1 || activeGuidelineId) && (
                    <button
                      type="button"
                      onClick={handleResetToHome}
                      className="mt-2.5 w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-teal-500/30 text-teal-400 hover:text-teal-300 font-semibold py-2 px-3 rounded-lg text-[10px] flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to Main Dashboard (Clear Chat)
                    </button>
                  )}

                {/* Pinned Quick-Access Shortcuts */}
                {pinnedGuidelineIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 px-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider self-center mr-1">Pinned:</span>
                    {pinnedGuidelineIds.map(id => {
                      const gl = guidelines.find(g => g.id === id) || staticGuidelines.find((g: any) => g.protocol_id === id);
                      if (!gl) return null;
                      const name = gl.name || gl.clinical?.title || id;
                      const pdfName = gl.pdf_name;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleSelectGuideline(id, name, pdfName, gl.default_page || 1)}
                          className="bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-[10px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 transition-all"
                        >
                          <Pin className="w-2.5 h-2.5 fill-teal-400" />
                          <span>{name}</span>
                          {gl.calculator && (
                            <span title="Calculator available">
                              <Calculator className="w-2.5 h-2.5 text-teal-400 shrink-0 ml-0.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RAG Conversational Output stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/60">
                {chatHistory.map((msg, index) => (
                  <div 
                    key={index}
                    className={`flex flex-col rounded-2xl p-4 text-xs leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-teal-500/10 border border-teal-500/20 text-teal-100 self-end ml-auto max-w-[85%]' 
                        : 'bg-slate-950/80 border border-slate-850 text-slate-300 self-start mr-auto w-full max-w-[95%]'
                    }`}
                  >
                    {/* Render text with basic markdown tags */}
                    <div 
                      className="space-y-2 whitespace-pre-line font-sans"
                      dangerouslySetInnerHTML={{ 
                        __html: formatMessageText(msg.text)
                      }}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.classList.contains('online-search-btn')) {
                          if (msg.queryText) {
                            handleOnlineSearch(msg.queryText, index);
                          }
                          return;
                        }
                        if (target.tagName === 'SPAN') {
                          const page = parseInt(target.textContent?.replace(/[^\d]/g, '') || '1');
                          // Link target PDF depending on context
                          const cit = msg.citations?.find(c => c.page === page);
                          if (cit) {
                            handleCitationClick(cit);
                          } else {
                            const activeGuideline = guidelines.find(g => g.id === activeGuidelineId);
                            if (activeGuideline?.pdf_name) {
                              const targetUrl = activeGuideline.pdf_name.startsWith('http') ? activeGuideline.pdf_name : `${getPdfUrl(activeGuideline.pdf_name)}#page=${page}`;
                              window.open(targetUrl, '_blank');
                            }
                          }
                        }
                      }}
                    />

                    {/* Citations Box */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-800">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">References & Citations:</span>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((cit, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleCitationClick(cit)}
                              className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-teal-400 hover:text-teal-300 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 min-h-[40px] focus-visible:ring-2 focus-visible:ring-teal-500"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              {cit.docName} [Pg {cit.page}]
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </>
          )}



              {/* Mobile View Tab Controls (Only shown on small screens) */}
              <div className={`flex md:hidden bg-slate-950 border-t border-slate-800 p-3 gap-2 shrink-0 ${
                isKeyboardActive ? 'hidden' : ''
              }`}>
                <button 
                  onClick={() => setMobileTab('search')}
                  className={`flex-1 p-2 rounded-lg font-bold text-[11px] text-center transition-colors ${
                    mobileTab === 'search' ? 'bg-teal-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  Search
                </button>
                <button 
                  disabled={!activeGuidelineId}
                  onClick={() => setMobileTab('pdf')}
                  className={`flex-1 p-2 rounded-lg font-bold text-[11px] text-center transition-colors ${
                    !activeGuidelineId ? 'opacity-40' : (mobileTab === 'pdf' ? 'bg-teal-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800')
                  }`}
                >
                  Guideline
                </button>
                <button 
                  onClick={() => setMobileTab('phonebook')}
                  className={`flex-1 p-2 rounded-lg font-bold text-[11px] text-center transition-colors ${
                    mobileTab === 'phonebook' ? 'bg-teal-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  Phonebook
                </button>
              </div>
            </div>

            {/* Split Screen Panel 2: Guideline Summary & Details */}
            <div className={`flex-1 md:w-1/2 flex flex-col overflow-hidden relative border-l border-slate-800 bg-slate-950 ${
              mobileTab !== 'pdf' ? 'hidden md:flex' : 'flex'
            }`}>
              {(() => {
                const activeGuideline = guidelines.find(g => g.id === activeGuidelineId);
                if (activeGuideline) {
                  const calcSchema = activeGuideline.calculator;
                  const hasCalculator = !!calcSchema;
                  const calcApproved = STATIC_GUIDELINE_IDS.includes(activeGuideline.id)
                    || activeGuideline.calculator_approved === true;

                  const summaryMarkdown = activeGuideline.summaryText 
                    || activeGuideline.clinical?.summaryText
                    || activeGuideline.clinical?.steps?.map((s: any) => `### Step ${s.step_number}\n${s.text}`).join('\n\n')
                    || "No clinical summary available for this guideline.";

                  const considerations = activeGuideline.records 
                    ? activeGuideline.records 
                    : (activeGuideline.clinical?.steps?.map((s: any) => ({
                        title: `Step ${s.step_number}`,
                        context: s.text,
                        summaryText: s.text
                      })) || []);

                  return (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Header */}
                      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={handleResetToHome}
                          className="p-2 bg-slate-850 hover:bg-slate-750 text-slate-400 hover:text-teal-400 rounded-lg transition-colors border border-slate-750 hover:border-teal-500/30 flex items-center justify-center shrink-0"
                          title="Back to Dashboard"
                        >
                          <ArrowLeft className="w-4 h-4 text-teal-400" />
                        </button>
                        <div className="flex-1 min-w-0 pr-2">
                          <h2 className="text-xs font-bold text-slate-100 truncate flex items-center gap-1.5">
                            {activeGuideline.name || activeGuideline.clinical?.title}
                          </h2>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                            <span>Version: <strong className="text-slate-350">{activeGuideline.version || 'v1.0.0'}</strong></span>
                            <span>•</span>
                            <span>Review: <strong className="text-slate-350">{activeGuideline.date_next_review || activeGuideline.dateNextReview ? new Date(activeGuideline.date_next_review || activeGuideline.dateNextReview).toLocaleDateString() : 'N/A'}</strong></span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => togglePinGuideline(activeGuideline.id, activeGuideline.pdf_name)}
                            className={`px-3 py-1.5 rounded-lg text-xxs flex items-center gap-1.5 transition-colors border font-bold focus-visible:ring-2 focus-visible:ring-teal-500 ${
                              pinnedGuidelineIds.includes(activeGuideline.id)
                                ? 'bg-teal-500/20 text-teal-400 border-teal-500/40 hover:bg-teal-500/30'
                                : 'bg-slate-850 hover:bg-slate-750 text-slate-400 border-slate-750 hover:border-teal-500/30'
                            }`}
                            title={pinnedGuidelineIds.includes(activeGuideline.id) ? "Unpin Guideline for Offline" : "Pin Guideline for Offline"}
                          >
                            <Pin className={`w-3.5 h-3.5 ${pinnedGuidelineIds.includes(activeGuideline.id) ? 'fill-teal-400 text-teal-400' : 'text-slate-400'}`} />
                            {pinnedGuidelineIds.includes(activeGuideline.id) ? 'Pinned' : 'Pin'}
                          </button>
                          {activeGuideline.pdf_name && (
                            <a
                              href={activeGuideline.pdf_name.startsWith('http') ? activeGuideline.pdf_name : `${getPdfUrl(activeGuideline.pdf_name)}#page=${activePage || activeGuideline.default_page || 1}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-slate-850 hover:bg-slate-750 text-teal-400 font-bold px-3 py-1.5 rounded-lg text-xxs flex items-center gap-1.5 transition-colors border border-slate-750 hover:border-teal-500/30 shadow-sm"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Source PDF ↗
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Control Toggle Bar */}
                      <div className="bg-slate-900 border-b border-slate-800 p-2 flex flex-wrap gap-2 items-center justify-between shrink-0 relative z-10">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowSummary(prev => !prev)}
                            className={`px-3 py-1.5 rounded-lg text-xxs font-bold flex items-center gap-1.5 transition-all border cursor-pointer ${
                              showSummary
                                ? 'bg-teal-500 text-slate-950 border-teal-500 font-extrabold shadow-sm'
                                : 'bg-slate-950 text-slate-400 border-slate-850 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Clinical Summary
                          </button>

                          {hasCalculator && (
                            <button
                              type="button"
                              onClick={() => setShowCalculator(prev => !prev)}
                              className={`px-3 py-1.5 rounded-lg text-xxs font-bold flex items-center gap-1.5 transition-all border relative cursor-pointer ${
                                showCalculator
                                  ? 'bg-teal-500 text-slate-950 border-teal-500 font-extrabold shadow-sm'
                                  : 'bg-slate-950 text-slate-400 border-slate-850 hover:text-slate-200 hover:border-slate-700'
                              }`}
                            >
                              <Calculator className="w-3.5 h-3.5" />
                              Dose Calculator
                              {/* Pulse badge to show calculator is available when not shown */}
                              {!showCalculator && (
                                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                                </span>
                              )}
                            </button>
                          )}

                          {activeGuideline.pdf_name && (
                            <button
                              type="button"
                              onClick={() => {
                                if (activeGuideline.pdf_name.startsWith('http')) {
                                  window.open(activeGuideline.pdf_name, '_blank');
                                } else {
                                  setShowPdf(prev => !prev);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xxs font-bold flex items-center gap-1.5 transition-all border cursor-pointer ${
                                showPdf && !activeGuideline.pdf_name.startsWith('http')
                                  ? 'bg-teal-500 text-slate-950 border-teal-500 font-extrabold shadow-sm'
                                  : 'bg-slate-950 text-slate-400 border-slate-850 hover:text-slate-200 hover:border-slate-700'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {activeGuideline.pdf_name.startsWith('http') ? 'Source PDF ↗' : 'View Source PDF'}
                            </button>
                          )}
                        </div>

                        {showPdf && !activeGuideline.pdf_name.startsWith('http') && (
                          <span className="text-[10px] text-slate-400 bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-md">
                            Page: <strong className="text-teal-400">{activePage}</strong>
                          </span>
                        )}
                      </div>

                      {/* Content Area */}
                      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-950">
                        {/* Summary / Calculator Column */}
                        {(showSummary || (showCalculator && hasCalculator)) && (
                          <div className={`flex-1 flex-col overflow-y-auto p-5 space-y-4 ${
                            showPdf && !activeGuideline.pdf_name.startsWith('http')
                              ? 'hidden md:flex md:w-1/2 md:max-w-[50%] border-r border-slate-800'
                              : 'flex w-full'
                          }`}>
                            
                            {/* Dose Calculator block */}
                            {showCalculator && hasCalculator && calcSchema && (
                              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg text-left">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                  <div className="flex items-center gap-1.5">
                                    <Calculator className="w-4 h-4 text-teal-400 animate-pulse-soft" />
                                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                                      Dose Calculator: {calcSchema.calculator_name || calcSchema.calculatorName}
                                    </span>
                                  </div>
                                  {!calcApproved && (
                                    <span className="bg-amber-500/10 text-amber-500 text-[9px] font-bold px-2 py-0.5 rounded border border-amber-500/20">
                                      Awaiting Approval
                                    </span>
                                  )}
                                </div>
                                <DoseCalculator schema={calcSchema as any} isApproved={calcApproved} />
                              </div>
                            )}

                            {/* Clinical Summary block */}
                            {showSummary && (
                              <div className="space-y-4">
                                <div className="prose prose-invert max-w-none text-xs leading-relaxed text-slate-350 bg-slate-900/40 border border-slate-850 rounded-xl p-4 text-left">
                                  <div className="flex items-center gap-2 mb-3 text-teal-405 border-b border-slate-850 pb-2">
                                    <Sparkles className="w-4 h-4 text-teal-400 animate-pulse-soft" />
                                    <h3 className="text-xxs font-bold uppercase tracking-wider">Clinical Guidance Summary</h3>
                                  </div>
                                  
                                  <div 
                                    className="space-y-3 whitespace-pre-line text-slate-300 markdown-summary font-sans text-xs"
                                    dangerouslySetInnerHTML={{ 
                                      __html: formatMessageText(summaryMarkdown) 
                                    }}
                                  />
                                </div>

                                {/* Key Considerations Checklist block */}
                                <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-4 text-left">
                                  <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-slate-850">
                                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                                    <span className="text-xxs font-bold text-slate-300 uppercase tracking-wider">
                                      Key Clinical SOP Considerations
                                    </span>
                                  </div>
                                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto scrollbar-thin">
                                    {considerations.length > 0 ? (
                                      considerations.map((rec: any, idx: number) => (
                                        <div key={idx} className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-lg">
                                          <h4 className="text-teal-400 font-bold text-[10px] mb-1 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                                            {rec.title}
                                          </h4>
                                          <p className="text-slate-350 text-[10px] leading-relaxed whitespace-pre-line">
                                            {rec.context}
                                          </p>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-slate-500 text-xxs text-center py-2">No structured considerations available.</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                          </div>
                        )}

                        {/* Embedded PDF Viewer Column */}
                        {showPdf && !activeGuideline.pdf_name.startsWith('http') && (
                          <div className="flex-1 h-full min-w-[320px]">
                            <PdfViewer 
                              fileUrl={getPdfUrl(activeGuideline.pdf_name)} 
                              pageNumber={activePage || activeGuideline.default_page || 1}
                              fileName={activeGuideline.name || activeGuideline.clinical?.title}
                              onPageChange={(p) => setActivePage(p)}
                            />
                          </div>
                        )}

                        {/* Fallback if all are toggled off */}
                        {!showSummary && (!showCalculator || !hasCalculator) && (!showPdf || activeGuideline.pdf_name.startsWith('http')) && (
                          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none text-slate-500">
                            <FileText className="w-12 h-12 text-slate-800 mb-3" />
                            <p className="font-medium text-slate-400 text-sm">All Panels Hidden</p>
                            <p className="text-xxs text-slate-600 max-w-xs mt-1 leading-normal">
                              Toggle the buttons above to display the clinical summary, calculator, or source PDF.
                            </p>
                          </div>
                        )}

                      </div>

                      <button 
                        onClick={() => setMobileTab('search')}
                        className="md:hidden absolute bottom-6 right-6 bg-teal-500 hover:bg-teal-650 text-slate-950 font-bold px-4 py-2.5 rounded-full shadow-lg text-xs flex items-center gap-1 border border-teal-600 transition-transform active:scale-95 z-10"
                      >
                        ↩ Return to Search
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="flex-1 bg-slate-950 flex flex-col items-center justify-start p-6 text-center overflow-y-auto">
                    <div className="max-w-md w-full py-6 space-y-5">
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 rounded-full bg-teal-500/10 border border-teal-500/25 flex items-center justify-center mb-2.5 text-teal-400">
                          <Activity className="w-6 h-6 animate-pulse-soft" />
                        </div>
                        <h2 className="text-slate-200 text-sm font-bold uppercase tracking-wider">
                          QRH Emergency Portal Active
                        </h2>
                        <p className="text-[11px] text-slate-450 mt-1 max-w-xs leading-normal">
                          All 26 Quick Reference Handbook (QRH) emergency guidelines are fully indexed, searchable, and whitelisted for offline use.
                        </p>
                      </div>

                      <div className="border-t border-slate-900 pt-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2.5">
                          Quick-Access Emergency Aid
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleSelectGuideline('resus-als', 'Cardiac Arrest (ALS)', 'QRH_complete_June_2023.pdf', 6)}
                            className="bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-500/50 text-red-200 hover:text-white font-bold p-3 rounded-xl text-xxs transition-all flex flex-col items-center gap-1 cursor-pointer"
                          >
                            <ShieldAlert className="w-4 h-4 text-red-500" />
                            <span>1. Cardiac Arrest (ALS)</span>
                          </button>

                          <button
                            onClick={() => handleSelectGuideline('la-toxicity', 'LA Toxicity (LAST)', 'QRH_complete_June_2023.pdf', 23)}
                            className="bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-500/50 text-red-200 hover:text-white font-bold p-3 rounded-xl text-xxs transition-all flex flex-col items-center gap-1 cursor-pointer"
                          >
                            <ShieldAlert className="w-4 h-4 text-red-500" />
                            <span>2. LA Toxicity (LAST)</span>
                          </button>

                          <button
                            onClick={() => handleSelectGuideline('malignant-hyperthermia', 'Malignant Hyperthermia', 'QRH_complete_June_2023.pdf', 21)}
                            className="bg-orange-950/20 hover:bg-orange-950/40 border border-orange-900/30 hover:border-orange-500/50 text-orange-200 hover:text-white font-bold p-3 rounded-xl text-xxs transition-all flex flex-col items-center gap-1 cursor-pointer"
                          >
                            <Activity className="w-4 h-4 text-orange-500" />
                            <span>3. Malignant Hyperthermia</span>
                          </button>

                          <button
                            onClick={() => handleSelectGuideline('anaphylaxis', 'Anaphylaxis', 'QRH_complete_June_2023.pdf', 14)}
                            className="bg-teal-950/20 hover:bg-teal-950/40 border border-teal-900/30 hover:border-teal-500/50 text-teal-200 hover:text-white font-bold p-3 rounded-xl text-xxs transition-all flex flex-col items-center gap-1 cursor-pointer"
                          >
                            <Activity className="w-4 h-4 text-teal-400" />
                            <span>4. Anaphylaxis</span>
                          </button>

                          <button
                            onClick={() => handleSelectGuideline('cico', 'CICO Emergency', 'QRH_complete_June_2023.pdf', 16)}
                            className="bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-500/50 text-red-200 hover:text-white font-bold p-3 rounded-xl text-xxs transition-all flex flex-col items-center gap-1 cursor-pointer"
                          >
                            <ShieldAlert className="w-4 h-4 text-red-500" />
                            <span>5. CICO Emergency</span>
                          </button>

                          <button
                            onClick={() => handleSelectGuideline('hypoxia', 'Hypoxia', 'QRH_complete_June_2023.pdf', 7)}
                            className="bg-teal-950/20 hover:bg-teal-950/40 border border-teal-900/30 hover:border-teal-500/50 text-teal-200 hover:text-white font-bold p-3 rounded-xl text-xxs transition-all flex flex-col items-center gap-1 cursor-pointer"
                          >
                            <Activity className="w-4 h-4 text-teal-400" />
                            <span>6. Hypoxia</span>
                          </button>
                        </div>
                      </div>

                      {/* Searchable Guideline Directory Section */}
                      <div className="border-t border-slate-900 pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Full Guideline Directory
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-teal-400 font-bold">
                            {filteredDirectoryGuidelines.length} Indexed
                          </span>
                        </div>
                        
                        {/* Search directory filter */}
                        <div className="relative mb-2">
                          <input
                            type="text"
                            placeholder="Filter directory by title (e.g. 'sepsis', 'bronchospasm')..."
                            value={directoryFilter}
                            onChange={(e) => setDirectoryFilter(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 text-slate-200 rounded-lg pl-8 pr-8 py-1.5 text-xxs transition-colors"
                          />
                          <Search className="absolute left-2.5 top-2.5 w-3 h-3 text-slate-500" />
                          {directoryFilter && (
                            <button 
                              type="button"
                              onClick={() => setDirectoryFilter('')} 
                              className="absolute right-2.5 top-2 hover:text-teal-400 transition-colors text-slate-500 text-xxs p-0.5"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Scrollable list of guidelines */}
                        <div className="bg-slate-900 border border-slate-800/80 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-850 text-left scrollbar-thin">
                          {filteredDirectoryGuidelines.map((gl) => {
                            const isQRH = STATIC_GUIDELINE_IDS.includes(gl.id);
                            return (
                              <button
                                key={gl.id}
                                type="button"
                                onClick={() => handleSelectGuideline(gl.id, gl.name, gl.pdf_name, gl.default_page || 1)}
                                className="w-full px-3 py-2 hover:bg-slate-850/40 text-left transition-colors flex items-center justify-between group"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 transition-colors shrink-0" />
                                  <span className="text-xxs text-slate-300 group-hover:text-slate-100 transition-colors truncate">
                                    {gl.name}
                                  </span>
                                  {gl.calculator && (
                                    <span className="inline-flex items-center gap-0.5 bg-teal-500/10 text-teal-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-teal-500/20 shadow-sm shrink-0" title="Dose Calculator available">
                                      <Calculator className="w-2.5 h-2.5" /> CALC
                                    </span>
                                  )}
                                </div>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ml-2 ${
                                  isQRH 
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/10' 
                                    : 'bg-teal-500/10 text-teal-400 border border-teal-500/10'
                                }`}>
                                  {isQRH ? 'QRH' : 'AAGBI'}
                                </span>
                              </button>
                            );
                          })}
                          {filteredDirectoryGuidelines.length === 0 && (
                            <div className="p-4 text-center text-[10px] text-slate-500">
                              No guidelines match "{directoryFilter}"
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 leading-normal max-w-xs mx-auto border-t border-slate-900 pt-3.5">
                        Type queries in the search box to run RAG search, compute weight-based drug doses, and view references.
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

      </main>

      {/* Feedback Modal Overlay */}
      {isFeedbackOpen && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setIsFeedbackOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-xs font-semibold"
            >
              ✕
            </button>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-teal-400" /> Help Improve AnaesSOP
            </h2>
            <p className="text-xxs text-slate-400 mb-4 leading-relaxed">
              We are gathering user suggestions during the pilot phase. Request new calculators, report bugs, or suggest guidelines we should upload next.
            </p>
            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xxs font-bold text-slate-400 uppercase">Category</label>
                <select
                  value={feedbackCategory}
                  onChange={(e) => setFeedbackCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 w-full"
                >
                  <option value="Feature Request">💡 Suggest a Feature / Dosing Calculator</option>
                  <option value="Missing Guideline">📄 Request a Missing SOP / Protocol</option>
                  <option value="Bug Report">🐛 Report a Bug / Wrong Formula</option>
                  <option value="General Feedback">💬 General Usability Suggestion</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xxs font-bold text-slate-400 uppercase">Your Message</label>
                <textarea
                  required
                  rows={4}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Tell us what tool or layout features would make this app more useful on shift..."
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 w-full"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingFeedback}
                className="w-full bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold p-2.5 rounded-lg text-xs transition-colors"
              >
                {isSubmittingFeedback ? "Submitting..." : "Send Feedback"}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* NHS Auth / Login Modal Overlay */}
      {isLoginOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 relative shadow-2xl overflow-y-auto max-h-[90vh]">
            <button 
              onClick={() => {
                setIsLoginOpen(false);
                setDemoError('');
              }}
              className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
            >
              ✕ Close
            </button>
            
            {clerkUser && !isNhsEmail ? (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
                  <h2 className="text-base font-bold text-red-500 uppercase tracking-wide">Access Denied</h2>
                </div>
                <p className="text-xs text-slate-350 mb-4 leading-relaxed">
                  Authentication was successful, but the account <strong className="text-white">{rawEmail}</strong> does not belong to a permitted NHS email domain.
                </p>
                <p className="text-xxs text-slate-400 mb-6 leading-relaxed">
                  Access to the full clinical database and dose calculators is strictly restricted to NHS staff (domain ending with <code>@nhs.net</code> or <code>.nhs.uk</code>).
                </p>
                <button
                  onClick={handleLogout}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold p-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out & Try Another Account
                </button>
              </div>
            ) : isDemoMode ? (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-4">
                  <UserCheck className="w-5 h-5 text-teal-400" />
                  <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide">NHS Demo Mode Portal</h2>
                </div>
                <p className="text-xxs text-slate-400 mb-6 leading-relaxed">
                  This application is running in <strong>Demo Mode</strong>. Enter the pre-shared passcode to access search engines and calculators.
                </p>
                
                <form onSubmit={handleDemoSubmit} className="space-y-4">
                  <div>
                    <label className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1 block">
                      Passcode
                    </label>
                    <input
                      type="password"
                      value={demoPasscode}
                      onChange={(e) => setDemoPasscode(e.target.value)}
                      placeholder="Enter passcode..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-white rounded-lg p-2.5 text-xs transition-colors"
                    />
                    {demoError && (
                      <p className="text-red-400 text-xxs mt-1">{demoError}</p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-teal-500 hover:bg-teal-650 text-slate-950 font-bold p-2.5 rounded-lg text-xs transition-colors shadow-md shadow-teal-500/10"
                  >
                    Access Demo
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-4">
                  <UserCheck className="w-5 h-5 text-teal-400" />
                  <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide">NHS Staff Login</h2>
                </div>
                <p className="text-xxs text-slate-400 mb-6 leading-relaxed">
                  Sign in with your NHS email to access full semantic guidelines searching, custom dosing calculators, and administrative uploads.
                </p>
                
                <div className="flex justify-center cl-override">
                  <SignIn 
                    routing="hash"
                    appearance={{
                      variables: {
                        colorPrimary: '#0d9488',
                        colorBackground: 'transparent',
                        colorForeground: '#f1f5f9',
                        colorMutedForeground: '#94a3b8',
                        colorInput: '#0f172a',
                        colorInputForeground: '#ffffff',
                        colorBorder: '#1e293b',
                      },
                      elements: {
                        card: 'shadow-none border-0 bg-transparent p-0 w-full max-w-sm',
                        header: 'hidden',
                        formButtonPrimary: 'w-full bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold p-2.5 rounded-lg text-xs transition-colors shadow-none',
                        formFieldInput: 'bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-white rounded-lg p-2.5 text-xs transition-colors',
                        footer: 'bg-transparent',
                        footerActionText: 'text-slate-400 text-xxs',
                        footerActionLink: 'text-teal-400 hover:text-teal-300 text-xxs font-bold',
                        identityPreviewText: 'text-slate-100',
                        formFieldLabel: 'text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1',
                        formFieldLabelRow: 'mb-1',
                        formFieldAction: 'text-teal-400 hover:text-teal-300 text-[10px]',
                        dividerText: 'text-slate-500 text-xxs',
                        dividerLine: 'bg-slate-800',
                        formFieldErrorText: 'text-red-400 text-xxs mt-1',
                        alert: 'bg-red-500/10 border border-red-500/20 text-red-200 text-xxs rounded-lg p-3',
                        alertText: 'text-red-400 text-xxs',
                        formFieldInputCode: 'bg-slate-950 border border-slate-800 text-white font-mono text-center text-lg rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 w-10 h-10',
                        formFieldInput__code: 'bg-slate-950 border border-slate-800 text-white font-mono text-center text-lg rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 w-10 h-10',
                        formFieldInputShowCode: 'text-white bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500',
                      }
                    }}
                  />
                </div>
              </div>
            )}
            
            <div className="text-slate-500 text-xxs leading-normal mt-6 border-t border-slate-800/50 pt-4">
              * Access requires a secure passwordless OTP code sent to your verified NHS email.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
