"use client";

import React, { useState, useEffect } from 'react';
import { 
  Search, ShieldAlert, FileText, UserCheck, LogOut, ArrowRight, 
  Menu, HelpCircle, Activity, Sparkles, Send, Calculator, History, ChevronRight 
} from 'lucide-react';
import PdfViewer from '../components/PdfViewer';
import DoseCalculator from '../components/DoseCalculator';
import { mockGuidelines, mockChunks, mockCalculator } from '../lib/supabaseClient';

export default function Home() {
  // Auth state
  const [email, setEmail] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [user, setUser] = useState<{ email: string; role: 'Clinician' | 'Admin' } | null>(null);
  
  // Feedback state
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState('Feature Request');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Workspace state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'bot'; text: string; citations?: any[] }>>([]);
  
  // PDF / Citations synchronization
  const [activePdfUrl, setActivePdfUrl] = useState<string>('');
  const [activePdfName, setActivePdfName] = useState<string>('');
  const [activePage, setActivePage] = useState<number>(1);
  const [activeHighlights, setActiveHighlights] = useState<any[]>([]);
  
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

  // Handler for emergency bypass guides
  const handleOpenEmergencyAid = (fileName: string, name: string) => {
    setActivePdfUrl(`/assets/${fileName}`); // mock local path
    setActivePdfName(name);
    setActivePage(1);
    setActiveHighlights([]);
    if (isMobile) {
      setMobileTab('pdf');
    }
  };

  // Mock Login Handler
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.endsWith('@nhs.net') || email.endsWith('.nhs.uk') || email === 'audit.lead@nhs.net') {
      setIsOtpSent(true);
    } else {
      alert("Invalid domain. Access restricted strictly to NHS email domains.");
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode === '123456') {
      const role = email === 'audit.lead@nhs.net' ? 'Admin' : 'Clinician';
      setUser({ email, role });
      
      // Seed welcome message
      setChatHistory([
        {
          sender: 'bot',
          text: `Welcome to **AnaesSOP** clinical governance database. Search or query active guidelines above. For high-stress events, you can access the emergency aid buttons anytime.`
        }
      ]);
    } else {
      alert("Invalid OTP code. For pilot testing, use '123456'.");
    }
  };

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

  const handleLogout = () => {
    setUser(null);
    setEmail('');
    setIsOtpSent(false);
    setOtpCode('');
    setChatHistory([]);
    setActivePdfUrl('');
  };

  // RAG Search simulation (Pilot Grounding demonstration)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const query = searchQuery.toLowerCase();
    
    // Add user query to chat history
    setChatHistory(prev => [...prev, { sender: 'user', text: searchQuery }]);
    setIsSearching(true);
    setSearchQuery('');

    // Simulate Streaming LLM Grounding
    setTimeout(() => {
      let botResponse = "";
      let citations: any[] = [];

      const dexmedKeywords = ['dex', 'dexmed', 'afoi', 'sedation', 'intubation', 'weight', 'bmi', 'ibw', 'adjbw', 'abw', 'devine', 'dilute', 'ramsay', 'st george', 'fibreoptic', 'awake', 'infusion', 'loading', 'dose', 'regime', 'olivia', 'kourteli', 'soba', 'concentration'];
      if (dexmedKeywords.some(kw => query.includes(kw) || kw.includes(query))) {
        botResponse = "For **Awake Fibreoptic Intubation (AFOI)** using **Dexmedetomidine** sedation at St George's Hospital:\n\n" +
          "1. **Infusion Setup:** Dilute Dexmedetomidine 200mcg in 50ml 0.9% NaCl, giving a final concentration of **4mcg/ml** [Page 4].\n" +
          "2. **Dosing Weight:** Weight-based dosing should use patient's actual body weight (ABW) if BMI < 30. If BMI > 30, Adjusted Body Weight (AdjBW) must be calculated using the Devine formula [Page 9].\n" +
          "3. **Regime:** Give a **loading dose of 1mcg/kg** over 10 minutes, followed by a **maintenance infusion of 0.2 to 0.7 mcg/kg/h**, titrating to a Ramsay Sedation Scale (RSS) target score of 2 or 3 [Page 4].";
        
        citations = [
          { docId: 'dexmed-sop-afoi-uuid', docName: 'Dexmed SOP for AFOI', page: 4, text: 'Dilute Dexmedetomidine 200mcg in 50ml 0.9% NaCl... concentration 4mcg/ml', highlight: { x0: 10, y0: 600, x1: 500, y1: 760 } },
          { docId: 'dexmed-sop-afoi-uuid', docName: 'Dexmed SOP for AFOI', page: 9, text: 'Devine formula for Ideal Body Weight...', highlight: { x0: 10, y0: 250, x1: 500, y1: 450 } }
        ];

        // Auto load the Dexmed PDF in the viewer
        setActivePdfUrl('Dexmed SOP for AFOI.KD..pdf');
        setActivePdfName('Dexmed SOP for AFOI.KD..pdf');
        setActivePage(4);
        setActiveHighlights([{ x0: 10, y0: 600, x1: 500, y1: 760 }]);
      } 
      else if (query.includes('toxicity') || query.includes('intralipid') || query.includes('local anaesthetic')) {
        botResponse = "In the event of **Local Anaesthetic Toxicity (LAST)**:\n\n" +
          "1. **Immediate Action:** Stop injecting the local anaesthetic, call for help, and manage the airway with 100% oxygen [Page 1].\n" +
          "2. **Fat Emulsion Therapy:** Administer **Intralipid 20%** lipid rescue:\n" +
          "   - Give an immediate **IV bolus of 1.5 ml/kg** over 1 minute [Page 1].\n" +
          "   - Start an **IV infusion of 15 ml/kg/h** [Page 1].\n" +
          "   - Repeat bolus twice at 5-minute intervals if cardiovascular stability is not restored [Page 2].";
        
        citations = [
          { docId: 'la-toxicity-guideline-uuid', docName: 'AAGBI LA Toxicity Guide', page: 1, text: 'Stop injecting LA... Give Intralipid 20% bolus 1.5 ml/kg', highlight: { x0: 20, y0: 300, x1: 480, y1: 450 } }
        ];
      } 
      else if (query.includes('hyperthermia') || query.includes('malignant')) {
        botResponse = "For **Malignant Hyperthermia Crisis** management:\n\n" +
          "1. **Trigger Stop:** Discontinue all volatile anaesthetics and succinylcholine immediately. Hyperventilate with 100% oxygen at high flows [Page 1].\n" +
          "2. **Antidote:** Administer **Dantrolene** immediately (2.5 mg/kg IV bolus, repeating as necessary up to 10 mg/kg) [Page 2].\n" +
          "3. **Cooling:** Active cooling of patient using iced saline IV infusions, body cavity lavage, and surface ice packs [Page 3].";
        
        citations = [
          { docId: 'malignant-hyperthermia-uuid', docName: 'AAGBI Malignant Hyperthermia Guide', page: 1, text: 'Stop volatile agents... Give Dantrolene', highlight: { x0: 15, y0: 200, x1: 490, y1: 350 } }
        ];
      } 
      else {
        // Falling back to "I don't know" - which triggers gap logging
        botResponse = "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel.";
      }

      setChatHistory(prev => [...prev, { sender: 'bot', text: botResponse, citations }]);
      setIsSearching(false);
    }, 1200);
  };

  const handleCitationClick = (cit: any) => {
    setActivePdfUrl(cit.docId === 'dexmed-sop-afoi-uuid' ? 'Dexmed SOP for AFOI.KD..pdf' : cit.docName + '.pdf');
    setActivePdfName(cit.docName);
    setActivePage(cit.page);
    setActiveHighlights([cit.highlight]);
    
    if (isMobile) {
      setMobileTab('pdf');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col font-sans">
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

              {/* Right Column: Secure NHS Authentication Portal */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <UserCheck className="w-5 h-5 text-teal-400" />
                    <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide">NHS Staff Login</h2>
                  </div>
                  <p className="text-xxs text-slate-400 mb-6 leading-relaxed">
                    Log in with your NHS email domain to access full semantic guidelines searching, custom dosing calculators, and administrative uploads.
                  </p>

                  {!isOtpSent ? (
                    <form onSubmit={handleSendOtp} className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xxs font-semibold text-slate-400 uppercase">NHS Email Address</label>
                        <input 
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="e.g. yourname@nhs.net"
                          className="bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-white rounded-lg p-2.5 text-xs transition-colors"
                        />
                      </div>
                      <button 
                        type="submit"
                        className="w-full bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold p-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        Request Passwordless OTP <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xxs font-semibold text-slate-400 uppercase">6-Digit Verification Code</label>
                        <input 
                          type="text"
                          required
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="Enter 123456 to test"
                          className="bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-white rounded-lg p-2.5 text-xs text-center font-mono tracking-widest transition-colors"
                        />
                      </div>
                      <button 
                        type="submit"
                        className="w-full bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold p-2.5 rounded-lg text-xs transition-colors"
                      >
                        Verify & Access Database
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setIsOtpSent(false)}
                        className="w-full text-center text-xxs text-slate-500 hover:text-slate-400 transition-colors"
                      >
                        Change Email
                      </button>
                    </form>
                  )}
                </div>

                <div className="text-slate-600 text-xxs leading-normal mt-6">
                  * For the pilot verification sandbox, type any email ending in <code>@nhs.net</code> and verify with <code>123456</code>. To test Admin permissions, use <code>audit.lead@nhs.net</code>.
                </div>
              </div>

            </div>

            {/* Emergency PDF Backdrop if active */}
            {activePdfUrl && (
              <div className="fixed inset-0 bg-slate-950/90 z-40 flex items-center justify-center p-4">
                <div className="w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden flex flex-col relative">
                  <button 
                    onClick={() => setActivePdfUrl('')}
                    className="absolute top-4 right-4 bg-red-600 hover:bg-red-750 text-white px-3 py-1 rounded text-xs font-bold z-50 transition-colors"
                  >
                    Close Emergency Aid
                  </button>
                  <div className="flex-1">
                    <PdfViewer fileUrl={activePdfUrl} pageNumber={activePage} highlights={activeHighlights} fileName={activePdfName} />
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
              <div className="bg-slate-950 p-4 border-b border-slate-800 shrink-0">
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
                      className="space-y-2 whitespace-pre-line"
                      dangerouslySetInnerHTML={{ 
                        __html: msg.text
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\[Page (.*?)\]/g, '<span class="text-teal-400 font-bold underline cursor-pointer">[Pg $1]</span>')
                      }}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
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

              {/* Bottom: Dynamic Calculator Mount (Triggered when guideline is active) */}
              {activePdfUrl === 'Dexmed SOP for AFOI.KD..pdf' && (
                <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Calculator className="w-4 h-4 text-teal-400" />
                    <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Interactive Dose Calculator Linked</span>
                  </div>
                  <DoseCalculator schema={mockCalculator.schema} isApproved={true} />
                </div>
              )}

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
