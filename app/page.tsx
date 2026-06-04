"use client";

import React, { useState, useEffect } from 'react';
import { useUser, useClerk, SignIn } from '@clerk/nextjs';
import { 
  Search, ShieldAlert, FileText, UserCheck, LogOut, ArrowRight, 
  Menu, HelpCircle, Activity, Sparkles, Send, Calculator, History, ChevronRight, X, Pin
} from 'lucide-react';
import PdfViewer from '../components/PdfViewer';
import DoseCalculator from '../components/DoseCalculator';
import { mockGuidelines, mockChunks, mockCalculator } from '../lib/supabaseClient';
import { useSearch } from './hooks/useSearch';
import staticGuidelines from '../data/guidelines_db.json';

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
    const expected = process.env.NEXT_PUBLIC_DEMO_PASSCODE || 'NHS2026';
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
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'bot'; text: string; citations?: any[]; queryText?: string }>>([]);

  // Seed welcome message when user logs in
  useEffect(() => {
    if (user && chatHistory.length === 0) {
      setChatHistory([
        {
          sender: 'bot',
          text: `Welcome to **AnaesSOP** clinical governance database. Search or query active guidelines above. For high-stress events, you can access the emergency aid buttons anytime.`
        }
      ]);
    }
  }, [user, chatHistory.length]);
  
  // PDF / Citations synchronization
  const [activePdfUrl, setActivePdfUrl] = useState<string>('');
  const [activePdfName, setActivePdfName] = useState<string>('');
  const [activePage, setActivePage] = useState<number>(1);
  const [activeHighlights, setActiveHighlights] = useState<any[]>([]);
  const [activeGuidelineId, setActiveGuidelineId] = useState<string>('');
  const [instantResults, setInstantResults] = useState<any[]>([]);
  
  // Mobile responsive layout
  const [mobileTab, setMobileTab] = useState<'search' | 'pdf'>('search');
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

  // Run fast client-side instant search on query change
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setInstantResults([]);
      return;
    }

    const runInstantSearch = async () => {
      try {
        const res = await executeSearch(trimmed, true); // skip embedding for instant typing speed!
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
  }, [searchQuery]);

  // Dynamic Pull-Through on active guideline selection
  useEffect(() => {
    if (!activeGuidelineId) return;
    
    // Find guideline in current state
    const current = guidelines.find(g => g.id === activeGuidelineId);
    if (!current) return;
    
    // If it's a custom guideline and records aren't loaded yet
    const isStatic = ['la-toxicity', 'malignant-hyperthermia', 'resus-als', 'dexmed-sop-afoi', 'post-op-fossa'].includes(activeGuidelineId);
    const hasRecords = current.records && current.records.length > 0;
    
    if (!isStatic && !hasRecords) {
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

  // Helper to resolve PDF URL dynamically (QRH is served locally, others stream from R2)
  const getPdfUrl = (filename: string) => {
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

  const formatMessageText = (text: string) => {
    if (!text) return "";
    return text
      // Replace markdown headings (### and ##)
      .replace(/^###\s+(.+)$/gm, '<h3 class="text-xs font-bold text-teal-400 mt-3 mb-1.5 uppercase tracking-wider">$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2 class="text-sm font-bold text-teal-400 mt-4 mb-2 uppercase tracking-wide border-b border-slate-800 pb-1.5">$1</h2>')
      // Replace bold markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100 font-semibold">$1</strong>')
      // Replace page markdown references
      .replace(/\[Page (.*?)\]/g, '<span class="text-teal-400 font-bold underline cursor-pointer hover:text-teal-350">[Pg $1]</span>')
      // Replace online search button link format
      .replace(/\[Online AI Search\]\(\/ask-online-ai\)/g, '<button class="bg-teal-500 hover:bg-teal-650 active:scale-95 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xxs mt-2 transition-all block online-search-btn shadow-md shadow-teal-500/10">Run Edge LLM Search ⚡</button>')
      // Format bullet lists (lines starting with -, *, or •)
      .replace(/^(?:-|•|\*)\s+(.+)$/gm, '<div class="flex items-start gap-2 my-1.5 ml-2 text-slate-300"><span class="text-teal-400 mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-teal-400"></span><span class="flex-1">$1</span></div>')
      // Format numbered lists (lines starting with number followed by dot)
      .replace(/^(\d+)\.\s+(.+)$/gm, '<div class="flex items-start gap-2 my-1.5 ml-2 text-slate-300"><span class="text-teal-400 font-bold shrink-0 font-mono">$1.</span><span class="flex-1">$2</span></div>');
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
    const welcomeMsg = {
      sender: 'bot',
      text: `Welcome to **AnaesSOP** clinical governance database. Search or query active guidelines above. For high-stress events, you can access the emergency aid buttons anytime.`
    };
    setChatHistory([
      welcomeMsg as any,
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
        botResponse = "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel.\n\n[Online AI Search](/ask-online-ai)";
      } else {
        const topMatch = searchRes.results[0];
        
        botResponse = `**Result from Guideline: ${topMatch.title}** (Confidence Match: **${topMatch.confidence}%**)`;
        
        if (searchRes.isLowConfidence) {
          botResponse += `\n\n⚠️ **Low Confidence Match:** The local database matched this protocol with a confidence of ${topMatch.confidence}%. You may run a deep AI search on the server using the button below.\n\n[Online AI Search](/ask-online-ai)`;
        }

        // Map matching guidelines to citations
        citations = searchRes.results.slice(0, 3).map(match => ({
          docId: match.docId,
          docName: match.title,
          pdfName: match.pdfName,
          page: match.defaultPage || 1, // Jump to the correct page of the guideline!
          highlight: { x0: 20, y0: 100, x1: 500, y1: 150 }
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
    const targetUrl = `${getPdfUrl(targetFile)}#page=${cit.page}`;
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
            <span className="text-xxs text-slate-400">Anaesthetic Clinical Governance Database</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              {user.role === 'Admin' && (
                <a 
                  href="/admin"
                  className="bg-teal-500 hover:bg-teal-650 active:scale-95 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-md shadow-teal-500/10 animate-fade-in"
                >
                  Admin Panel
                </a>
              )}
              <button 
                onClick={() => setIsFeedbackOpen(true)}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-teal-400 hover:text-teal-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> Feedback
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
            <span className="text-xxs text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 flex items-center gap-1">
              <Activity className="w-3 h-3 animate-pulse-soft" /> Emergency Bypass Mode Active
            </span>
          )}
        </div>
      </header>

      {/* Main body area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* State A: Pre-login Landing & Emergency Bypass Portal */}
        {!user && (
          <div className="flex-1 overflow-y-auto bg-slate-900 flex flex-col items-center justify-center p-4 py-8 md:p-8">
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
              
              {/* Left Column: Zero-Auth Emergency Bypass Portal */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded bg-red-600 flex items-center justify-center text-white">
                      <ShieldAlert className="w-4 h-4 text-white" />
                    </div>
                    <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide">National Emergency Protocols</h2>
                  </div>
                  <p className="text-xs text-slate-300 mb-6 leading-relaxed">
                    High-availability crisis algorithms. Zero-authentication access for immediate clinical decision support during high-stress scenarios.
                  </p>

                  <div className="space-y-3">
                    <button 
                      onClick={() => handleOpenEmergencyAid('la_toxicity_aagbi.pdf', 'AAGBI Local Anaesthetic Toxicity Protocol')}
                      className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-red-900/50 p-3.5 rounded-xl text-left transition-all duration-200 group flex items-start justify-between"
                    >
                      <div className="flex gap-3">
                        <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-xs font-semibold text-slate-200 group-hover:text-red-400 transition-colors">LA Toxicity Management</h3>
                          <span className="text-xs text-slate-400">AAGBI Safety Guideline - Intralipid dosing</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-red-500 transition-transform group-hover:translate-x-0.5" />
                    </button>

                    <button 
                      onClick={() => handleOpenEmergencyAid('malignant_hyperthermia.pdf', 'AAGBI Malignant Hyperthermia Protocol')}
                      className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-red-900/50 p-3.5 rounded-xl text-left transition-all duration-200 group flex items-start justify-between"
                    >
                      <div className="flex gap-3">
                        <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-xs font-semibold text-slate-200 group-hover:text-red-400 transition-colors">Malignant Hyperthermia</h3>
                          <span className="text-xs text-slate-400">AAGBI Safety Guideline - Dantrolene cooling</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-red-500 transition-transform group-hover:translate-x-0.5" />
                    </button>

                    <button 
                      onClick={() => handleOpenEmergencyAid('resus_als.pdf', 'Resuscitation Council ALS Protocol')}
                      className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-red-900/50 p-3.5 rounded-xl text-left transition-all duration-200 group flex items-start justify-between"
                    >
                      <div className="flex gap-3">
                        <Activity className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-xs font-semibold text-slate-200 group-hover:text-red-400 transition-colors">Adult Advanced Life Support (ALS)</h3>
                          <span className="text-xs text-slate-400">Resuscitation Council UK algorithm</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-red-500 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-800 mt-6 pt-4 text-xs text-slate-400 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-teal-400 animate-pulse-soft"></span>
                  Offline-ready cached guidelines
                </div>
              </div>

              {/* Right Column: Secure NHS Authentication Portal / Access Denied */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                {clerkUser && !isNhsEmail ? (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
                      <h2 className="text-base font-bold text-red-500 uppercase tracking-wide">Access Denied</h2>
                    </div>
                    <p className="text-xs text-slate-300 mb-4 leading-relaxed">
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
                  <div>
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
                          className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-white rounded-lg p-2.5 text-xs transition-colors"
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
                  <div>
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
                            formFieldInput: 'bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-white rounded-lg p-2.5 text-xs transition-colors',
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
                            // Custom targets to enforce high-contrast readable style on OTP input digit blocks
                            formFieldInputCode: 'bg-slate-900 border border-slate-800 text-white font-mono text-center text-lg rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 w-10 h-10',
                            formFieldInput__code: 'bg-slate-900 border border-slate-800 text-white font-mono text-center text-lg rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 w-10 h-10',
                            formFieldInputShowCode: 'text-white bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500',
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="text-slate-600 text-xxs leading-normal mt-6 border-t border-slate-800/50 pt-4">
                  * Access requires a secure passwordless OTP code sent to your verified NHS email.
                </div>
              </div>

            </div>

            {/* Emergency PDF Backdrop if active */}
            {activePdfUrl && (
              <div className="fixed inset-0 bg-slate-950/95 z-40 flex items-center justify-center p-4">
                <div className="w-full max-w-5xl h-[90vh] rounded-2xl overflow-hidden flex flex-col bg-slate-900 border border-slate-700 shadow-2xl">
                  {/* Modal Header */}
                  <div className="bg-slate-950 px-4 py-3 flex items-center justify-between border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                      <span className="text-red-500 font-bold text-xxs uppercase tracking-wider">
                        CRITICAL EMERGENCY AID PANEL
                      </span>
                    </div>
                    <button 
                      onClick={() => {
                        setActivePdfUrl('');
                        setActiveGuidelineId('');
                      }}
                      className="bg-red-600 hover:bg-red-750 active:scale-95 text-white px-3.5 py-1.5 rounded-lg text-xxs font-bold transition-all shadow-md shadow-red-600/20"
                    >
                      Close Emergency Aid
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <PdfViewer 
                      fileUrl={activePdfUrl} 
                      pageNumber={activePage} 
                      highlights={activeHighlights} 
                      fileName={activePdfName}
                      onPageChange={(p) => setActivePage(p)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* State B: Post-login Full Interactive Workspace */}
        {user && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Split Screen Panel 1: RAG Chat & Calculators */}
            <div className={`flex-1 md:w-1/2 flex flex-col overflow-hidden border-r border-slate-800 ${
              isMobile && mobileTab !== 'search' ? 'hidden' : 'flex'
            }`}>
              
              {/* Search Bar Block */}
              <div className="bg-slate-950 p-4 border-b border-slate-800 shrink-0 relative z-30">
                <form onSubmit={handleSearchSubmit} className="relative">
                  <input
                    type="text"
                    required
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search guidelines (e.g. 'dexmed infusion', 'LA toxicity')..."
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
                              onClick={() => {
                                const targetId = match.docId;
                                
                                const botResponse = `**Result from Guideline: ${match.title}** (Confidence Match: **100%**)`;
                                
                                const citations = match.pdfName ? [{
                                  docId: match.docId,
                                  docName: match.title,
                                  pdfName: match.pdfName,
                                  page: match.defaultPage || 1,
                                  highlight: { x0: 20, y0: 100, x1: 500, y1: 150 }
                                }] : [];

                                const welcomeMsg = {
                                  sender: 'bot',
                                  text: `Welcome to **AnaesSOP** clinical governance database. Search or query active guidelines above. For high-stress events, you can access the emergency aid buttons anytime.`
                                };
                                setChatHistory([
                                  welcomeMsg as any,
                                  { sender: 'user', text: `Selected guideline: ${match.title}` },
                                  { 
                                    sender: 'bot', 
                                    text: botResponse, 
                                    citations,
                                    guidelineId: match.docId
                                  }
                                ]);
                                setActivePdfUrl('');

                                setActiveGuidelineId(match.docId);
                                setInstantResults([]);
                                setSearchQuery('');
                              }}
                              className="flex-1 text-left px-4 py-3 text-xs text-slate-200 group flex items-center justify-between truncate"
                            >
                              <div className="flex flex-col gap-0.5 truncate pr-4">
                                <span className="font-semibold text-slate-200 group-hover:text-teal-400 transition-colors truncate">
                                  {match.title}
                                </span>
                                <span className="text-[10px] text-slate-500 truncate">
                                  {match.context.substring(0, 80)}...
                                </span>
                              </div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 font-medium shrink-0">
                                {match.confidence}%
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
                          onClick={() => {
                            setActiveGuidelineId(id);
                            // Seed a chat bubble for this selection
                            const welcomeMsg = {
                              sender: 'bot',
                              text: `Welcome to **AnaesSOP** clinical governance database. Search or query active guidelines above. For high-stress events, you can access the emergency aid buttons anytime.`
                            };
                            setChatHistory([
                              welcomeMsg as any,
                              { sender: 'user', text: `Selected pinned guideline: ${name}` },
                              {
                                sender: 'bot',
                                text: `**Result from Guideline: ${name}** (Confidence Match: **100%**)`,
                                citations: pdfName ? [{
                                  docId: id,
                                  docName: name,
                                  pdfName,
                                  page: gl.default_page || 1,
                                  highlight: { x0: 20, y0: 100, x1: 500, y1: 150 }
                                }] : [],
                                guidelineId: id
                              }
                            ]);
                            setActivePdfUrl('');
                          }}
                          className="bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-[10px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 transition-all"
                        >
                          <Pin className="w-2.5 h-2.5 fill-teal-400" />
                          {name}
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
                              const targetUrl = `${getPdfUrl(activeGuideline.pdf_name)}#page=${page}`;
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
                    {/* Inline Guideline Widgets (Calculator + Key Considerations) */}
                    {msg.guidelineId && (() => {
                      if (pullingThroughGuidelineId === msg.guidelineId) {
                        return (
                          <div className="mt-4 pt-4 border-t border-slate-800 text-center flex flex-col items-center justify-center gap-2.5">
                            <div className="w-4 h-4 rounded-full border-2 border-teal-500 border-t-transparent animate-spin"></div>
                            <span className="text-xs font-bold text-teal-400 uppercase tracking-widest animate-pulse">
                              Retrieving full clinical data & calculator from edge...
                            </span>
                          </div>
                        );
                      }

                      const activeGuideline = guidelines.find(g => g.id === msg.guidelineId);
                      if (!activeGuideline) return null;

                      const hasCalc = !!activeGuideline.calculator;
                      const calcSchema = activeGuideline.calculator;
                      const considerations = activeGuideline.records 
                        ? activeGuideline.records 
                        : (activeGuideline.clinical?.steps?.map((s: any) => ({
                            title: `Step ${s.step_number}`,
                            context: s.text,
                            summaryText: s.text
                          })) || []);

                      return (
                        <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
                          {/* Calculator Block */}
                          {hasCalc && calcSchema && (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 mb-2">
                                <Calculator className="w-3.5 h-3.5 text-teal-400" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  Dose Calculator: {calcSchema.calculator_name || calcSchema.calculatorName}
                                </span>
                              </div>
                              <DoseCalculator schema={calcSchema as any} isApproved={true} />
                            </div>
                          )}

                          {/* Considerations Block */}
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 mb-2">
                              <FileText className="w-3.5 h-3.5 text-teal-400" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Key Clinical SOP Considerations
                              </span>
                            </div>
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 space-y-2.5 max-h-[320px] overflow-y-auto">
                              {considerations.length > 0 ? (
                                considerations.map((rec: any, idx: number) => (
                                  <div key={idx} className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-lg">
                                    <h4 className="text-teal-450 font-bold text-xxs mb-1 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                                      {rec.title}
                                    </h4>
                                    <p className="text-slate-300 text-[10px] leading-relaxed whitespace-pre-line">
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
                      );
                    })()}
                  </div>
                ))}
              </div>



              {/* Mobile View Tab Controls (Only shown on small screens) */}
              {isMobile && (
                <div className="bg-slate-950 border-t border-slate-800 p-3 flex gap-2 shrink-0">
                  <button 
                    onClick={() => setMobileTab('search')}
                    className={`flex-1 p-2 rounded-lg font-bold text-xs text-center transition-colors ${
                      mobileTab === 'search' ? 'bg-teal-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Chat & Search
                  </button>
                  <button 
                    disabled={!activeGuidelineId}
                    onClick={() => setMobileTab('pdf')}
                    className={`flex-1 p-2 rounded-lg font-bold text-xs text-center transition-colors ${
                      !activeGuidelineId ? 'opacity-40' : (mobileTab === 'pdf' ? 'bg-teal-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800')
                    }`}
                  >
                    Guideline Summary
                  </button>
                </div>
              )}
            </div>

            {/* Split Screen Panel 2: Guideline Summary & Details */}
            <div className={`flex-1 md:w-1/2 flex flex-col overflow-hidden relative border-l border-slate-800 bg-slate-950 ${
              isMobile && mobileTab !== 'pdf' ? 'hidden' : 'flex'
            }`}>
              {(() => {
                const activeGuideline = guidelines.find(g => g.id === activeGuidelineId);
                if (activeGuideline) {
                  const summaryMarkdown = activeGuideline.summaryText 
                    || activeGuideline.clinical?.summaryText
                    || activeGuideline.clinical?.steps?.map((s: any) => `### Step ${s.step_number}\n${s.text}`).join('\n\n')
                    || "No clinical summary available for this guideline.";

                  return (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Header */}
                      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
                        <div className="flex-1 min-w-0 pr-4">
                          <h2 className="text-xs font-bold text-slate-100 truncate flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-teal-400" />
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
                              href={getPdfUrl(activeGuideline.pdf_name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-slate-850 hover:bg-slate-750 text-teal-400 font-bold px-3 py-1.5 rounded-lg text-xxs flex items-center gap-1.5 transition-colors border border-slate-750 hover:border-teal-500/30 shadow-sm"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Source PDF ↗
                            </a>
                          )}
                          <button
                            onClick={() => {
                              setActiveGuidelineId('');
                              setActivePdfUrl('');
                            }}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800 flex items-center justify-center"
                            title="Close Summary"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Summary Content */}
                      <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        <div className="prose prose-invert max-w-none text-xs leading-relaxed text-slate-350">
                          <div className="flex items-center gap-2 mb-3 text-teal-405 border-b border-slate-800 pb-2">
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
                      </div>
                      
                      {isMobile && (
                        <button 
                          onClick={() => setMobileTab('search')}
                          className="absolute bottom-6 right-6 bg-teal-500 hover:bg-teal-650 text-slate-950 font-bold px-4 py-2.5 rounded-full shadow-lg text-xs flex items-center gap-1 border border-teal-600 transition-transform active:scale-95 z-10"
                        >
                          ↩ Return to Search
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none text-slate-500">
                    <FileText className="w-16 h-16 text-slate-800 mb-3" />
                    <p className="font-medium text-slate-400 text-sm">Clinical Guideline Summary Panel</p>
                    <p className="text-xxs text-slate-600 max-w-xs mt-1 leading-normal">
                      Search and click a guideline reference. The detailed clinical summary, warnings, and drug administration steps will load here.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
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
    </div>
  );
}
