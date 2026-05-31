"use client";

import React, { useState, useEffect } from 'react';
import { useUser, useClerk, SignIn } from '@clerk/nextjs';
import { 
  Search, ShieldAlert, FileText, UserCheck, LogOut, ArrowRight, 
  Menu, HelpCircle, Activity, Sparkles, Send, Calculator, History, ChevronRight 
} from 'lucide-react';
import PdfViewer from '../components/PdfViewer';
import DoseCalculator from '../components/DoseCalculator';
import { mockGuidelines, mockChunks, mockCalculator } from '../lib/supabaseClient';
import { useSearch } from './hooks/useSearch';
import staticGuidelines from '../data/guidelines_db.json';

export default function Home() {
  const { executeSearch, guidelines } = useSearch();
  // Clerk Auth state
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();

  const rawEmail = clerkUser?.primaryEmailAddress?.emailAddress || '';
  const isNhsEmail = rawEmail.endsWith('@nhs.net') || rawEmail.endsWith('.nhs.uk') || rawEmail === 'audit.lead@nhs.net' || rawEmail === 's.parashar1@nhs.net';
  const isAdminEmail = rawEmail === 'audit.lead@nhs.net' || rawEmail === 's.parashar1@nhs.net';

  const user = clerkUser && isNhsEmail ? {
    email: rawEmail,
    role: (isAdminEmail ? 'Admin' : 'Clinician') as 'Clinician' | 'Admin'
  } : null;
  
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

  const handleLogout = async () => {
    await signOut();
    setChatHistory([]);
    setActivePdfUrl('');
  };

  // RAG Search via local Orama index and Cloudflare query vectorizer
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const query = searchQuery;
    // Add user query to chat history
    setChatHistory(prev => [...prev, { sender: 'user', text: query }]);
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
        
        // Structure a formatted output with confidence percentage
        botResponse = `**Result from Guideline: ${topMatch.title}** (Confidence Match: **${topMatch.confidence}%**)\n\n${topMatch.context}`;
        
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

        // Auto select the active guideline for the calculator widget, but do not retrieve/load the heavy PDF URL yet
        setActiveGuidelineId(topMatch.docId);
      }

      setChatHistory(prev => [...prev, { 
        sender: 'bot', 
        text: botResponse, 
        citations,
        queryText: query // Preserve query context to allow escalation
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
    setActivePdfUrl(getPdfUrl(targetFile));
    setActivePdfName(cit.docName);
    setActivePage(cit.page);
    setActiveGuidelineId(cit.docId);
    setActiveHighlights([cit.highlight]);
    
    if (isMobile) {
      setMobileTab('pdf');
    }
  };

  return (
    <div className="h-screen bg-slate-900 flex flex-col font-sans overflow-hidden">
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
                    <div className="w-7 h-7 rounded bg-red-600 flex items-center justify-center text-white font-bold text-xs">
                      🚨
                    </div>
                    <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide">National Emergency Protocols</h2>
                  </div>
                  <p className="text-xxs text-slate-400 mb-6 leading-relaxed">
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
                          <span className="text-xxs text-slate-500">AAGBI Safety Guideline - Intralipid dosing</span>
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
                          <span className="text-xxs text-slate-500">AAGBI Safety Guideline - Dantrolene cooling</span>
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
                          <span className="text-xxs text-slate-500">Resuscitation Council UK algorithm</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-red-500 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-800 mt-6 pt-4 text-xxs text-slate-500 flex items-center gap-2">
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
                          <button
                            key={match.docId}
                            type="button"
                            onClick={() => {
                              if (match.pdfName) {
                                setActivePdfUrl(getPdfUrl(match.pdfName));
                                setActivePdfName(match.title);
                                setActivePage(match.defaultPage || 1);
                                setActiveGuidelineId(match.docId);
                                setActiveHighlights([]);
                                if (isMobile) {
                                  setMobileTab('pdf');
                                }
                              }
                              setInstantResults([]);
                              setSearchQuery('');
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-900/80 transition-colors flex items-center justify-between text-xs text-slate-200 group border-b border-slate-900"
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
                        ))}
                      </div>
                    </div>
                  )}
                </form>
              </div>

              {/* RAG Conversational Output stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/60">
                {chatHistory.map((msg, index) => (
                  <div 
                    key={index}
                    className={`flex flex-col max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-teal-500/10 border border-teal-500/20 text-teal-100 self-end ml-auto' 
                        : 'bg-slate-950/80 border border-slate-850 text-slate-300 self-start mr-auto'
                    }`}
                  >
                    {/* Render text with basic markdown tags */}
                    <div 
                      className="space-y-2 whitespace-pre-line font-sans"
                      dangerouslySetInnerHTML={{ 
                        __html: msg.text
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\[Page (.*?)\]/g, '<span class="text-teal-400 font-bold underline cursor-pointer">[Pg $1]</span>')
                          .replace(/\[Online AI Search\]\(\/ask-online-ai\)/g, '<button class="bg-teal-500 hover:bg-teal-600 active:scale-95 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xxs mt-2 transition-all block online-search-btn shadow-md shadow-teal-500/10">Run Edge LLM Search ⚡</button>')
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
                            setActivePage(page);
                            if (isMobile) setMobileTab('pdf');
                          }
                        }
                      }}
                    />

                    {/* Citations Box */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-800">
                        <span className="text-xxs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">References & Citations:</span>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((cit, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleCitationClick(cit)}
                              className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-teal-400 hover:text-teal-300 text-xxs font-semibold px-2 py-1 rounded transition-colors flex items-center gap-1"
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

              {/* Bottom: Dynamic Calculator Mount (Triggered when guideline is active and has a calculator schema) */}
              {(() => {
                const activeGuideline = guidelines.find(g => g.id === activeGuidelineId);
                if (activeGuideline && activeGuideline.calculator) {
                  const calcName = activeGuideline.calculator.calculator_name || activeGuideline.calculator.calculatorName;
                  return (
                    <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Calculator className="w-4 h-4 text-teal-400" />
                        <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">
                          Interactive Dose Calculator: {calcName}
                        </span>
                      </div>
                      <DoseCalculator schema={activeGuideline.calculator as any} isApproved={true} />
                    </div>
                  );
                }
                return null;
              })()}

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
                    disabled={!activePdfUrl}
                    onClick={() => setMobileTab('pdf')}
                    className={`flex-1 p-2 rounded-lg font-bold text-xs text-center transition-colors ${
                      !activePdfUrl ? 'opacity-40' : (mobileTab === 'pdf' ? 'bg-teal-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800')
                    }`}
                  >
                    Reference PDF
                  </button>
                </div>
              )}
            </div>

            {/* Split Screen Panel 2: Synchronized PDF.js Viewer */}
            <div className={`flex-1 md:w-1/2 flex flex-col overflow-hidden relative ${
              isMobile && mobileTab !== 'pdf' ? 'hidden' : 'flex'
            }`}>
              {activePdfUrl ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <PdfViewer 
                    fileUrl={activePdfUrl} 
                    pageNumber={activePage} 
                    highlights={activeHighlights} 
                    fileName={activePdfName} 
                  />
                  {isMobile && (
                    <button 
                      onClick={() => setMobileTab('search')}
                      className="absolute bottom-6 right-6 bg-teal-500 hover:bg-teal-650 text-slate-950 font-bold px-4 py-2.5 rounded-full shadow-lg text-xs flex items-center gap-1 border border-teal-600 transition-transform active:scale-95"
                    >
                      ↩ Return to Search
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none text-slate-500">
                  <FileText className="w-16 h-16 text-slate-800 mb-3" />
                  <p className="font-medium text-slate-400 text-sm">Synchronized PDF Viewer</p>
                  <p className="text-xxs text-slate-600 max-w-xs mt-1 leading-normal">
                    Search and click a guideline reference. The source PDF will instantly load here, jump to the exact page, and highlight the citation bounding box.
                  </p>
                </div>
              )}
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
