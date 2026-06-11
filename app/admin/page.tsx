"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useClerk, useAuth } from '@clerk/nextjs';
import { 
  FileText, Upload, Calendar, AlertTriangle, ShieldCheck, Mail, 
  Trash2, User, Clock, CheckCircle, HelpCircle, ChevronRight, Calculator, Activity,
  LogOut, ArrowRight, Search
} from 'lucide-react';
import DoseCalculator from '../../components/DoseCalculator';

// Manually curated guidelines bundled with the app — their calculators were
// hand-verified, so they are exempt from the dynamic approval workflow.
const STATIC_GUIDELINE_IDS = [
  'la-toxicity', 'malignant-hyperthermia', 'resus-als', 'dexmed-sop-afoi', 'post-op-fossa',
  'key-basic-plan', 'hypoxia', 'increased-airway-pressure', 'hypotension', 'hypertension',
  'bradycardia', 'tachycardia', 'peri-operative-hyperthermia', 'anaphylaxis', 'massive-blood-loss',
  'cico', 'bronchospasm', 'circulatory-embolus', 'laryngospasm', 'patient-fire',
  'cardiac-tamponade', 'high-central-neuraxial-block', 'cardiac-ischaemia', 'neuroprotection-post-arrest',
  'sepsis', 'mains-oxygen-failure', 'mains-electricity-failure', 'emergency-evacuation'
];

export default function AdminDashboard() {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();

  // Demo Mode state
  const [demoAuth, setDemoAuth] = useState<boolean>(false);
  const [isDemoLoaded, setIsDemoLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDemoAuth(sessionStorage.getItem('demo-auth') === 'true');
      setIsDemoLoaded(true);
    }
  }, []);

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const loaded = isDemoMode ? isDemoLoaded : isLoaded;

  const rawEmail = clerkUser ? (clerkUser.primaryEmailAddress?.emailAddress || '') : (isDemoMode && demoAuth ? 'audit.lead@nhs.net' : '');
  const isAdmin = (clerkUser && (rawEmail === 'audit.lead@nhs.net' || rawEmail === 's.parashar1@nhs.net')) || (isDemoMode && demoAuth);

  const handleLogout = async () => {
    if (isDemoMode) {
      sessionStorage.removeItem('demo-auth');
      document.cookie = 'demo_passcode=; path=/; Max-Age=0;';
      window.location.href = '/';
    } else {
      await signOut();
    }
  };

  const [activeTab, setActiveTab] = useState<'policies' | 'upload' | 'sandbox' | 'gaps' | 'feedbacks' | 'mtir'>('policies');
  
  // MTIR simulation study states
  const [mtirStats, setMtirStats] = useState<any>(null);
  const [isLoadingMtir, setIsLoadingMtir] = useState<boolean>(false);
  const [mtirRole, setMtirRole] = useState('ST4');
  const [mtirTask, setMtirTask] = useState('la-toxicity');
  const [mtirTimeSec, setMtirTimeSec] = useState('');
  const [mtirAccuracy, setMtirAccuracy] = useState('1.0');
  const [mtirSuccess, setMtirSuccess] = useState(true);
  const [mtirDevice, setMtirDevice] = useState('mobile');
  const [isSubmittingMtir, setIsSubmittingMtir] = useState(false);

  const fetchMtirStats = async () => {
    setIsLoadingMtir(true);
    try {
      const res = await fetch('/api/analytics/mtir');
      const data = await res.json();
      if (data.success && data.stats) {
        setMtirStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch MTIR stats:", err);
    } finally {
      setIsLoadingMtir(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'mtir' && isAdmin) {
      fetchMtirStats();
    }
  }, [activeTab, isAdmin]);

  const handleMtirSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mtirTimeSec) return;
    setIsSubmittingMtir(true);
    try {
      const res = await fetch('/api/analytics/mtir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_arm: 'baseline',
          registrar_role: mtirRole,
          task_id: mtirTask,
          time_taken_ms: parseFloat(mtirTimeSec) * 1000,
          is_successful: mtirSuccess ? 1 : 0,
          accuracy_score: parseFloat(mtirAccuracy),
          device_platform: mtirDevice,
          connection_status: 'online'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Baseline simulation run logged successfully!", "success");
        setMtirTimeSec('');
        fetchMtirStats();
      } else {
        showToast(data.error || "Failed to log run.", "error");
      }
    } catch (err) {
      console.error("Failed to log MTIR baseline run:", err);
      showToast("Error submitting baseline run.", "error");
    } finally {
      setIsSubmittingMtir(false);
    }
  };
  
  // Guidelines state
  const [guidelines, setGuidelines] = useState<any[]>([]);
  const [isLoadingGuidelines, setIsLoadingGuidelines] = useState(false);

  const fetchGuidelines = async () => {
    setIsLoadingGuidelines(true);
    try {
      const res = await fetch('/api/guidelines');
      const data = await res.json();
      if (data.success && data.guidelines) {
        setGuidelines(data.guidelines);
      }
    } catch (err) {
      console.error("Failed to fetch guidelines:", err);
    } finally {
      setIsLoadingGuidelines(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchGuidelines();
    }
  }, [isAdmin]);

  // State for upload form
  const [docName, setDocName] = useState('');
  const [version, setVersion] = useState('v1.0.0');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [changelog, setChangelog] = useState('');
  const [nextReview, setNextReview] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [isReplacement, setIsReplacement] = useState(false);
  const [supersedesId, setSupersedesId] = useState('');

  useEffect(() => {
    if (rawEmail) {
      setOwnerEmail(rawEmail);
    }
  }, [rawEmail]);

  // Upload/Ingestion telemetry & progress tracking states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadMsg, setUploadMsg] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<{
    inputTokens: number;
    outputTokens: number;
    neurons: number;
    costGbp: number;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  const [policySearch, setPolicySearch] = useState('');
  const [policyStatusFilter, setPolicyStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [policySort, setPolicySort] = useState<'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'>('date-desc');

  const filteredAndSortedGuidelines = useMemo(() => {
    return guidelines
      .filter(doc => {
        // Name Search
        const nameMatches = doc.name.toLowerCase().includes(policySearch.toLowerCase());
        
        // Status Filter
        const isSuperseded = doc.status === 'superseded' || doc.status === 'Superseded';
        let statusMatches = true;
        if (policyStatusFilter === 'active') {
          statusMatches = !isSuperseded;
        } else if (policyStatusFilter === 'inactive') {
          statusMatches = isSuperseded;
        }
        
        return nameMatches && statusMatches;
      })
      .sort((a, b) => {
        if (policySort === 'name-asc') {
          return a.name.localeCompare(b.name);
        } else if (policySort === 'name-desc') {
          return b.name.localeCompare(a.name);
        } else if (policySort === 'date-desc') {
          const dateA = new Date(a.date_published || a.created_at || 0).getTime();
          const dateB = new Date(b.date_published || b.created_at || 0).getTime();
          return dateB - dateA;
        } else if (policySort === 'date-asc') {
          const dateA = new Date(a.date_published || a.created_at || 0).getTime();
          const dateB = new Date(b.date_published || b.created_at || 0).getTime();
          return dateA - dateB;
        }
        return 0;
      });
  }, [guidelines, policySearch, policyStatusFilter, policySort]);


  // Review-date governance: flag guidelines overdue or approaching their review date
  const REVIEW_SOON_DAYS = 90;
  const reviewStatusFor = (doc: any): 'overdue' | 'due-soon' | 'ok' | 'unknown' => {
    const raw = doc.date_next_review || doc.next_review;
    if (!raw) return 'unknown';
    const due = new Date(raw).getTime();
    if (Number.isNaN(due)) return 'unknown';
    const now = Date.now();
    if (due < now) return 'overdue';
    if (due - now < REVIEW_SOON_DAYS * 24 * 60 * 60 * 1000) return 'due-soon';
    return 'ok';
  };

  const activeGuidelinesList = useMemo(
    () => guidelines.filter(g => g.status !== 'superseded' && g.status !== 'Superseded'),
    [guidelines]
  );
  const overdueGuidelines = useMemo(
    () => activeGuidelinesList.filter(g => reviewStatusFor(g) === 'overdue'),
    [activeGuidelinesList]
  );
  const dueSoonGuidelines = useMemo(
    () => activeGuidelinesList.filter(g => reviewStatusFor(g) === 'due-soon'),
    [activeGuidelinesList]
  );

  // Sandbox state: real dynamically-ingested calculators awaiting clinical sign-off
  const [sandboxSelectedId, setSandboxSelectedId] = useState<string>('');
  const [sandboxGuideline, setSandboxGuideline] = useState<any>(null);
  const [isLoadingSandbox, setIsLoadingSandbox] = useState(false);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Custom guidelines with calculators, partitioned by approval state
  const calculatorGuidelines = useMemo(
    () => guidelines.filter(g =>
      !STATIC_GUIDELINE_IDS.includes(g.id) &&
      (g.hasCalculator || g.calculator)
    ),
    [guidelines]
  );
  const pendingCalculators = calculatorGuidelines.filter(g => g.calculator_approved !== true);
  const approvedCalculators = calculatorGuidelines.filter(g => g.calculator_approved === true);

  // Pull the full guideline (incl. calculator schema) when one is selected
  useEffect(() => {
    if (!sandboxSelectedId) {
      setSandboxGuideline(null);
      return;
    }
    let cancelled = false;
    const fetchFull = async () => {
      setIsLoadingSandbox(true);
      try {
        const res = await fetch(`/api/guidelines?id=${encodeURIComponent(sandboxSelectedId)}`);
        const data = await res.json();
        if (!cancelled && data.success && data.guideline) {
          setSandboxGuideline(data.guideline);
        }
      } catch (err) {
        console.error('Failed to load guideline for sandbox:', err);
      } finally {
        if (!cancelled) setIsLoadingSandbox(false);
      }
    };
    fetchFull();
    return () => { cancelled = true; };
  }, [sandboxSelectedId]);

  // Resolve an auth token (Clerk JWT, or demo passcode in demo mode)
  const getAuthToken = async (): Promise<string | null> => {
    if (isDemoMode) {
      const match = document.cookie.match(/(^|;)\s*demo_passcode\s*=\s*([^;]+)/);
      return match ? match[2] : null;
    }
    return await getToken();
  };

  // Mock search gaps (guideline gaps log)
  const [searchGaps, setSearchGaps] = useState([
    { id: 1, query: "pediatric dantrolene infusion dose", count: 8, lastSearched: "2026-05-24" },
    { id: 2, query: "bronchospasm crisis checklist", count: 5, lastSearched: "2026-05-22" },
    { id: 3, query: "high-flow nasal oxygen limits", count: 3, lastSearched: "2026-05-19" },
    { id: 4, query: "maternal cardiac arrest tilt angle", count: 2, lastSearched: "2026-05-15" }
  ]);

  // Mock user feedbacks for pilot dashboard
  const [feedbacks, setFeedbacks] = useState([
    { id: 1, email: "john.doe@nhs.net", category: "Feature Request", feedback: "Would love a quick weight calculator for pediatric ALS doses as well!", date: "2026-05-24" },
    { id: 2, email: "sarah.smith@nhs.net", category: "General Feedback", feedback: "The side-by-side view works beautifully on the iPad in our theatres. The PDF jumps instantly to the correct page, which saves a lot of time.", date: "2026-05-23" },
    { id: 3, email: "robert.jones@nhs.net", category: "Bug Report", feedback: "On the Malignant Hyperthermia aid, the cooling rate displays in Fahrenheit in one text section but Celsius in the main algorithm. Can we double check?", date: "2026-05-20" }
  ]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      showToast("Please select a guideline PDF file first.", "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStep('R2 Upload');
    setUploadMsg('Initializing network streaming...');
    setTelemetry(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('docName', docName);
      formData.append('version', version);
      formData.append('ownerEmail', ownerEmail);
      formData.append('changelog', changelog);
      formData.append('nextReview', nextReview);
      formData.append('isEmergency', isEmergency ? 'true' : 'false');
      formData.append('isReplacement', isReplacement ? 'true' : 'false');
      formData.append('supersedesId', supersedesId);

      const token = await getAuthToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = "Failed to upload guideline.";
        try {
          const parsed = JSON.parse(errorText);
          errorMsg = parsed.error || errorMsg;
        } catch {
          errorMsg = errorText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error("Failed to initialize server streaming response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.error) {
              streamError = data.error;
              break;
            }
            if (data.step) {
              setUploadStep(data.step);
              if (data.progress !== undefined) setUploadProgress(data.progress);
              if (data.msg) setUploadMsg(data.msg);
              if (data.telemetry) {
                setTelemetry(data.telemetry);
              }
            }
          } catch (jsonErr) {
            console.error("NDJSON stream parsing error on line:", jsonErr);
          }
        }
        
        if (streamError) {
          throw new Error(streamError);
        }
      }

      // Ingestion successfully finished
      setIsUploading(false);
      fetchGuidelines(); // Refresh list to reflect updates and replacement states!
      
      // Show Success Toast
      showToast("Guideline successfully uploaded, parsed and published live!", "success");
      
      // Reset Form State to blank for new guideline uploads
      setDocName('');
      setVersion('v1.0.0');
      setChangelog('');
      setNextReview('');
      setIsEmergency(false);
      setIsReplacement(false);
      setSupersedesId('');
      setUploadFile(null);
      
    } catch (err: any) {
      console.error(err);
      showToast(`Ingestion Pipeline Failure: ${err.message}`, "error");
      setIsUploading(false);
    }
  };

  const handleSetCalculatorApproval = async (documentId: string, approved: boolean) => {
    setIsSubmittingApproval(true);
    try {
      const token = await getAuthToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/calculator-approval', {
        method: 'POST',
        headers,
        body: JSON.stringify({ documentId, approved })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Approval request failed.');
      }

      // Reflect the new state locally
      setGuidelines(prev => prev.map(g => g.id === documentId ? { ...g, calculator_approved: approved } : g));
      setSandboxGuideline((prev: any) => prev && prev.id === documentId ? { ...prev, calculator_approved: approved } : prev);
      showToast(
        approved
          ? "Dose Calculator approved & published. Clinicians will now see the calculator when viewing this guideline."
          : "Calculator approval revoked. The calculator is hidden from clinicians until re-approved.",
        "success"
      );
    } catch (err: any) {
      console.error('Calculator approval failed:', err);
      showToast(`Approval failed: ${err.message}`, "error");
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-teal-400 font-bold text-xs animate-pulse">
          Loading Governance Session...
        </div>
      </div>
    );
  }

  if (loaded && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-center shadow-2xl">
          <ShieldCheck className="w-12 h-12 text-red-500 mx-auto mb-4 animate-pulse" />
          <h2 className="text-base font-bold text-red-500 uppercase tracking-wide mb-2">Access Denied</h2>
          <p className="text-xs text-slate-300 mb-4 leading-relaxed">
            You do not have the required permissions to view the clinical governance portal. Only the Governance Audit Lead (<strong>audit.lead@nhs.net</strong>) can access this page.
          </p>
          {clerkUser || isDemoMode ? (
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 hover:bg-red-750 text-white font-bold p-2.5 rounded-lg text-xs transition-colors"
            >
              Sign Out & Use Admin Account
            </button>
          ) : (
            <a
              href="/#"
              className="w-full bg-teal-500 hover:bg-teal-650 text-slate-950 font-bold p-2.5 rounded-lg text-xs transition-colors block text-center"
            >
              Return to Homepage
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-teal-500 flex items-center justify-center font-bold text-slate-950">
            GOV
          </div>
          <div>
            <h1 className="text-base font-bold leading-none tracking-wide">Governance Dashboard</h1>
            <span className="text-xxs text-slate-400">Clinical Lifecycle & Policy Administration</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-500"></span>
            <span>Logged in as: <strong>{rawEmail}</strong> (Admin)</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800 flex items-center justify-center"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Admin Body Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Sidebar Navigation */}
        <nav className="w-full md:w-60 bg-slate-950 border-r border-slate-800 p-4 space-y-1.5 shrink-0">
          <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest block px-3 mb-2">Controls</span>
          
          <button
            onClick={() => setActiveTab('policies')}
            className={`w-full text-left p-3 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors ${
              activeTab === 'policies' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Active Policies
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`w-full text-left p-3 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors ${
              activeTab === 'upload' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Guideline
          </button>

          <button
            onClick={() => setActiveTab('sandbox')}
            className={`w-full text-left p-3 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors ${
              activeTab === 'sandbox' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Calculator className="w-4 h-4" />
            Calculator Sandbox
          </button>

          <button
            onClick={() => setActiveTab('gaps')}
            className={`w-full text-left p-3 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors ${
              activeTab === 'gaps' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Search Gap Log
          </button>

          <button
            onClick={() => setActiveTab('feedbacks')}
            className={`w-full text-left p-3 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors ${
              activeTab === 'feedbacks' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Mail className="w-4 h-4" />
            Clinician Feedback
          </button>

          <button
            onClick={() => setActiveTab('mtir')}
            className={`w-full text-left p-3 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors ${
              activeTab === 'mtir' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            MTIR Simulation Study
          </button>
        </nav>

        {/* Right Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900/40">
          
          {/* Tab 1: Policies Listing & Expiry Alerts */}
          {activeTab === 'policies' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3 gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Department Guidelines</h2>
                <div className="flex gap-2">
                  <span className="bg-red-500/10 border border-red-500/20 text-red-500 px-2.5 py-1 rounded text-xxs font-medium flex items-center gap-1">
                    {guidelines.filter(g => g.status === 'superseded' || g.status === 'Superseded').length} Superseded
                  </span>
                  <span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2.5 py-1 rounded text-xxs font-medium flex items-center gap-1">
                    {overdueGuidelines.length} Review Overdue
                  </span>
                  <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2.5 py-1 rounded text-xxs font-medium flex items-center gap-1">
                    {dueSoonGuidelines.length} Due ≤{REVIEW_SOON_DAYS}d
                  </span>
                </div>
              </div>

              {/* Review-date governance banner */}
              {(overdueGuidelines.length > 0 || dueSoonGuidelines.length > 0) && (
                <div className="bg-slate-950/60 border border-amber-500/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-amber-500 uppercase tracking-wide">Review schedule attention required</span>
                  </div>
                  {overdueGuidelines.length > 0 && (
                    <p className="text-xxs text-slate-300 leading-relaxed">
                      <strong className="text-red-400">Overdue:</strong>{' '}
                      {overdueGuidelines.map(g => `${g.name} (due ${new Date(g.date_next_review || g.next_review).toLocaleDateString()})`).join('; ')}
                    </p>
                  )}
                  {dueSoonGuidelines.length > 0 && (
                    <p className="text-xxs text-slate-300 leading-relaxed">
                      <strong className="text-amber-400">Due within {REVIEW_SOON_DAYS} days:</strong>{' '}
                      {dueSoonGuidelines.map(g => `${g.name} (due ${new Date(g.date_next_review || g.next_review).toLocaleDateString()})`).join('; ')}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500">
                    Contact the named owner to re-validate, then upload the revised version with "Replaces existing guideline" checked.
                  </p>
                </div>
              )}

              {/* Filters Toolbar */}
              <div className="flex flex-col sm:flex-row gap-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                {/* Search field */}
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={policySearch}
                    onChange={(e) => setPolicySearch(e.target.value)}
                    placeholder="Search policies by name..."
                    className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg pl-9 pr-3 py-2.5 text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                
                {/* Status Dropdown */}
                <div className="w-full sm:w-44">
                  <select
                    value={policyStatusFilter}
                    onChange={(e) => setPolicyStatusFilter(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="active">Active Only</option>
                    <option value="inactive">Superseded Only</option>
                    <option value="all">All Policies</option>
                  </select>
                </div>

                {/* Sort Dropdown */}
                <div className="w-full sm:w-48">
                  <select
                    value={policySort}
                    onChange={(e) => setPolicySort(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                  </select>
                </div>
              </div>

              {/* Policy Table Grid */}
              <div className="grid grid-cols-1 gap-4">
                {isLoadingGuidelines ? (
                  <div className="text-center py-6 text-xs text-slate-500 animate-pulse">
                    Loading policies from D1 database...
                  </div>
                ) : filteredAndSortedGuidelines.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    No matching clinical guidelines found.
                  </div>
                ) : (
                  filteredAndSortedGuidelines.map(doc => {
                    const reviewStatus = reviewStatusFor(doc);
                    const isSuperseded = doc.status === 'superseded' || doc.status === 'Superseded';
                    return (
                      <div
                        key={doc.id}
                        className={`bg-slate-950/60 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-200 ${
                          isSuperseded
                            ? 'border-red-950/50 bg-red-950/5 opacity-60'
                            : reviewStatus === 'overdue'
                            ? 'border-red-500/40 bg-red-500/5'
                            : reviewStatus === 'due-soon'
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex gap-3 items-start">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            doc.is_emergency ? 'bg-red-600 text-white font-bold' : 'bg-slate-800 text-teal-400'
                          }`}>
                            {doc.is_emergency ? '🚨' : '📄'}
                          </div>
                          <div>
                            <h3 className="text-xs font-semibold text-slate-200 leading-snug">{doc.name}</h3>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xxs text-slate-500 font-medium">
                              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Version: {doc.version}</span>
                              <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Owner: {doc.owner_email}</span>
                              {isSuperseded && <span className="text-red-400 font-bold bg-red-500/10 px-1 rounded uppercase tracking-wider text-[8px] border border-red-500/20">Superseded</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 border-t border-slate-800 sm:border-0 pt-3 sm:pt-0 justify-between shrink-0">
                          <div className="text-right">
                            <span className="text-xxs text-slate-500 block uppercase">Review Required</span>
                            <span className={`text-xs font-semibold ${
                              reviewStatus === 'overdue' ? 'text-red-400' : reviewStatus === 'due-soon' ? 'text-amber-500' : 'text-slate-300'
                            }`}>
                              {doc.date_next_review || doc.next_review
                                ? new Date(doc.date_next_review || doc.next_review).toLocaleDateString()
                                : 'Not set'}
                              {reviewStatus === 'overdue' && <span className="block text-[9px] uppercase tracking-wider font-bold text-red-400">Overdue</span>}
                              {reviewStatus === 'due-soon' && <span className="block text-[9px] uppercase tracking-wider font-bold text-amber-500">Due soon</span>}
                            </span>
                          </div>

                          <div>
                            {isSuperseded ? (
                              <span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2.5 py-1.5 rounded-lg text-xxs font-medium flex items-center gap-1">
                                🚫 Superseded
                              </span>
                            ) : reviewStatus === 'overdue' ? (
                              <span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2.5 py-1.5 rounded-lg text-xxs font-medium flex items-center gap-1">
                                ⚠️ Review Overdue
                              </span>
                            ) : reviewStatus === 'due-soon' ? (
                              <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2.5 py-1.5 rounded-lg text-xxs font-medium flex items-center gap-1">
                                ⚠️ Review Due Soon
                              </span>
                            ) : (
                              <span className="bg-teal-500/10 border border-teal-500/20 text-teal-400 px-2.5 py-1.5 rounded-lg text-xxs font-medium flex items-center gap-1">
                                ✔️ Active {doc.status === 'Active' ? 'policies' : doc.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Smart Ingestion Upload Form */}
          {activeTab === 'upload' && (
            <div className="max-w-2xl bg-slate-950/60 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 border-b border-slate-800 pb-3 mb-6">
                Ingest New Clinical Policy
              </h2>

              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xxs font-bold text-slate-400 uppercase">Guideline Name</label>
                    <input 
                      type="text" 
                      required
                      value={docName} 
                      onChange={(e) => setDocName(e.target.value)} 
                      placeholder="e.g. Dexmedetomidine Sedation SOP"
                      className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xxs font-bold text-slate-400 uppercase">Version Tag</label>
                    <input 
                      type="text" 
                      required
                      value={version} 
                      onChange={(e) => setVersion(e.target.value)} 
                      placeholder="e.g. v2.0.0"
                      className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xxs font-bold text-slate-400 uppercase">Owner Email</label>
                    <input 
                      type="email" 
                      required
                      value={ownerEmail} 
                      onChange={(e) => setOwnerEmail(e.target.value)} 
                      placeholder="e.g. lead.doctor@nhs.net"
                      className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xxs font-bold text-slate-400 uppercase">Next Review Date</label>
                    <input 
                      type="date" 
                      required
                      value={nextReview} 
                      onChange={(e) => setNextReview(e.target.value)} 
                      className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                {/* Genealogy: Superseded mapping */}
                <div className="border border-slate-850 bg-slate-900/30 rounded-xl p-4 space-y-3.5 my-3">
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      id="isReplacement" 
                      checked={isReplacement} 
                      onChange={(e) => setIsReplacement(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-800 text-teal-500 bg-slate-900 focus:ring-teal-500"
                    />
                    <label htmlFor="isReplacement" className="text-xs font-semibold text-slate-300">
                      This guideline replaces/supersedes an older active guideline
                    </label>
                  </div>

                  {isReplacement && (
                    <div className="flex flex-col gap-1.5 animate-pulse-soft">
                      <label className="text-xxs font-bold text-slate-400 uppercase">Target Guideline to Supersede</label>
                      <select
                        value={supersedesId}
                        onChange={(e) => setSupersedesId(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="">-- Choose Guideline to Mark as Superseded --</option>
                        {guidelines.filter(g => g.status === 'live' || g.status === 'Active' || g.status === 'Active policies').map(g => (
                          <option key={g.id} value={g.id}>{g.name} ({g.version})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Emergency Bypass Flag */}
                <div className="flex items-center gap-3 py-1">
                  <input 
                    type="checkbox" 
                    id="isEmergency" 
                    checked={isEmergency} 
                    onChange={(e) => setIsEmergency(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 text-red-500 bg-slate-900 focus:ring-red-500"
                  />
                  <label htmlFor="isEmergency" className="text-xs font-semibold text-slate-300">
                    Flag as Emergency Bypass guide (Zero-auth accessible)
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xxs font-bold text-slate-400 uppercase">Changelog Summary Notes (Mandated)</label>
                  <textarea 
                    required
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    placeholder="Describe what has changed in this policy revision..."
                    rows={3}
                    className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>

                {/* PDF Drag / Select Area */}
                <div className="border-2 border-dashed border-slate-800 rounded-xl p-6 text-center hover:border-slate-700 transition-colors relative cursor-pointer">
                  <input 
                    type="file"
                    accept="application/pdf"
                    required
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <span className="text-xs font-semibold text-slate-300 block">
                    {uploadFile ? uploadFile.name : "Select guideline PDF"}
                  </span>
                  <span className="text-xxs text-slate-500 mt-0.5">
                    {uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB` : "Maximum file size: 50MB"}
                  </span>
                </div>

                <button 
                  type="submit"
                  disabled={isUploading}
                  className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-teal-800 disabled:text-slate-500 text-slate-950 font-bold p-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {isUploading ? "Processing Guidelines Ingestion..." : "Publish & Parse Guideline"} <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Linear Ingestion Progress Status Tracker */}
              {isUploading && (
                <div className="mt-6 border border-slate-800 bg-slate-950/80 rounded-xl p-5 space-y-4 animate-pulse-soft">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-teal-400 uppercase tracking-wide">Ingestion Step: {uploadStep}</span>
                    <span className="text-slate-400 font-mono font-bold">{uploadProgress}%</span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div 
                      className="bg-teal-500 h-full transition-all duration-300 rounded-full" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-[10px] text-slate-400 italic leading-normal">{uploadMsg}</p>

                  {/* Progressive indicator icons */}
                  <div className="grid grid-cols-5 gap-1 text-center pt-2">
                    {['R2 Upload', 'Multi-Register Extraction', 'Qwen Vector Calculation', 'Orama Compiling', 'Live'].map((step, idx) => {
                      const stepNum = idx + 1;
                      const stepsList = ['R2 Upload', 'Multi-Register Extraction', 'Qwen Vector Calculation', 'Orama Compiling', 'Live'];
                      const currentStepIdx = stepsList.indexOf(uploadStep);
                      const isActive = step === uploadStep;
                      const isCompleted = idx < currentStepIdx || uploadStep === 'Live';
                      return (
                        <div key={step} className="flex flex-col items-center gap-1">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                            isCompleted 
                              ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/10' 
                              : isActive 
                              ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40 animate-pulse' 
                              : 'bg-slate-900 text-slate-600 border border-slate-850'
                          }`}>
                            {isCompleted ? '✓' : stepNum}
                          </div>
                          <span className={`text-[8px] font-semibold tracking-tight transition-all ${
                            isCompleted || isActive ? 'text-slate-300' : 'text-slate-600'
                          }`}>
                            {step.split(' ')[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Edge Ingestion Telemetry Output Dashboard */}
              {telemetry && (
                <div className="mt-6 border border-teal-500/20 bg-teal-950/10 rounded-xl p-5 space-y-3">
                  <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-4 h-4" /> Cloudflare Edge Telemetry
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div className="bg-slate-950/40 border border-slate-850 rounded-lg p-2.5 text-center">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-tight">Input Tokens</span>
                      <span className="text-xs font-bold text-slate-200">{telemetry.inputTokens}</span>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-850 rounded-lg p-2.5 text-center">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-tight">Output Tokens</span>
                      <span className="text-xs font-bold text-slate-200">{telemetry.outputTokens}</span>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-850 rounded-lg p-2.5 text-center">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-tight">Neurons Used</span>
                      <span className="text-xs font-bold text-slate-200">{telemetry.neurons.toFixed(4)}</span>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-850 rounded-lg p-2.5 text-center">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-tight">Estimated Cost</span>
                      <span className="text-xs font-bold text-teal-400 font-mono">£{telemetry.costGbp.toFixed(6)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Dose Calculator Sandbox & Clinical Approval */}
          {activeTab === 'sandbox' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Calculator Sandbox</h2>
                  <p className="text-xxs text-slate-500 mt-1">
                    AI-scaffolded calculators are hidden from clinicians until verified and approved here (DCB0129 gate).
                  </p>
                </div>
                {pendingCalculators.length > 0 && (
                  <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2.5 py-1 rounded text-xxs font-medium">
                    {pendingCalculators.length} Awaiting Approval
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left: Pending / approved calculator list */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-bold text-slate-200 border-b border-slate-850 pb-2">Dynamic Calculators</h3>

                  {calculatorGuidelines.length === 0 && (
                    <p className="text-xxs text-slate-500 leading-relaxed">
                      No dynamically generated calculators yet. Upload a guideline containing dosing
                      instructions and the AI compiler will scaffold one for review here.
                    </p>
                  )}

                  {pendingCalculators.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Awaiting clinical sign-off</span>
                      {pendingCalculators.map(g => (
                        <button
                          key={g.id}
                          onClick={() => setSandboxSelectedId(g.id)}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                            sandboxSelectedId === g.id
                              ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                              : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-amber-500/30'
                          }`}
                        >
                          <span className="font-semibold block truncate">{g.name}</span>
                          <span className="text-[10px] text-slate-500">v{(g.version || '1.0.0').replace(/^v/, '')} • {g.owner_email}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {approvedCalculators.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-teal-500 uppercase tracking-wider">Approved & live</span>
                      {approvedCalculators.map(g => (
                        <button
                          key={g.id}
                          onClick={() => setSandboxSelectedId(g.id)}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                            sandboxSelectedId === g.id
                              ? 'border-teal-500/50 bg-teal-500/10 text-teal-300'
                              : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-teal-500/30'
                          }`}
                        >
                          <span className="font-semibold block truncate">{g.name}</span>
                          <span className="text-[10px] text-slate-500">
                            Approved {g.calculator_approved_at ? new Date(g.calculator_approved_at).toLocaleDateString() : ''}
                            {g.calculator_approved_by ? ` by ${g.calculator_approved_by}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="bg-slate-900 border border-slate-850 rounded-xl p-4 text-xxs text-slate-500 space-y-2 leading-relaxed mt-4">
                    <span className="font-bold text-amber-500 uppercase block mb-1">Verification Instructions:</span>
                    <p>1. Select a calculator and open the interactive preview on the right.</p>
                    <p>2. Enter boundary test values (min/max weight, both genders where relevant).</p>
                    <p>3. Cross-check every output row against the formulas in the source PDF.</p>
                    <p>4. Only click <strong>Approve &amp; Publish</strong> once every figure matches the SOP exactly.</p>
                    <p>5. Approvals are written to the audit log with your email and timestamp.</p>
                  </div>
                </div>

                {/* Right: Interactive sandbox preview + approval actions */}
                <div className="lg:col-span-2 space-y-4">
                  {!sandboxSelectedId && (
                    <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-xs">
                      Select a calculator from the list to preview and verify it.
                    </div>
                  )}

                  {sandboxSelectedId && isLoadingSandbox && (
                    <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-10 text-center">
                      <span className="text-teal-400 text-xs font-bold animate-pulse">Loading calculator schema from edge…</span>
                    </div>
                  )}

                  {sandboxSelectedId && !isLoadingSandbox && sandboxGuideline && !sandboxGuideline.calculator && (
                    <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-xs">
                      This guideline has no calculator schema in its compiled index.
                    </div>
                  )}

                  {sandboxSelectedId && !isLoadingSandbox && sandboxGuideline?.calculator && (
                    <>
                      <DoseCalculator
                        schema={sandboxGuideline.calculator as any}
                        isSandbox={true}
                        onApprove={() => handleSetCalculatorApproval(sandboxGuideline.id, true)}
                        isApproved={sandboxGuideline.calculator_approved === true}
                      />
                      <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                        <span className="text-xxs text-slate-500">
                          {sandboxGuideline.calculator_approved === true
                            ? 'This calculator is live for all clinicians.'
                            : 'This calculator is hidden from clinicians until approved.'}
                        </span>
                        {sandboxGuideline.calculator_approved === true ? (
                          <button
                            disabled={isSubmittingApproval}
                            onClick={() => handleSetCalculatorApproval(sandboxGuideline.id, false)}
                            className="bg-red-600/80 hover:bg-red-600 text-white text-xxs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isSubmittingApproval ? 'Updating…' : 'Revoke Approval'}
                          </button>
                        ) : (
                          <button
                            disabled={isSubmittingApproval}
                            onClick={() => handleSetCalculatorApproval(sandboxGuideline.id, true)}
                            className="bg-teal-500 hover:bg-teal-400 text-slate-950 text-xxs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isSubmittingApproval ? 'Publishing…' : 'Approve & Publish'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* Tab 4: Search Gaps Log (Guideline Audit) */}
          {activeTab === 'gaps' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Guideline Gaps Log</h2>
                  <p className="text-xxs text-slate-500 mt-1">
                    Searches resulting in "I don't know" are logged here. Auditing these identifies missing protocols in the department knowledge base.
                  </p>
                </div>
                <span className="bg-red-500/10 border border-red-500/20 text-red-500 px-2.5 py-1 rounded text-xxs font-medium">
                  {searchGaps.length} Unique Gaps Logged
                </span>
              </div>

              {/* Gaps List */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-850 bg-slate-900/40 text-slate-400 text-xxs tracking-wider uppercase font-bold">
                      <th className="p-4">Failed Search Query</th>
                      <th className="p-4 text-center">Friction Count</th>
                      <th className="p-4">Last Attempted</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {searchGaps.map(gap => (
                      <tr key={gap.id} className="hover:bg-slate-900/20 text-slate-300">
                        <td className="p-4 font-semibold text-slate-200 font-mono text-xxs">"{gap.query}"</td>
                        <td className="p-4 text-center font-bold text-red-400">{gap.count} times</td>
                        <td className="p-4 text-slate-500">{gap.lastSearched}</td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => {
                              showToast(`Setting up upload parameters for "${gap.query}"...`, "success");
                              setActiveTab('upload');
                              setDocName(gap.query.replace(/\b\w/g, c => c.toUpperCase()));
                            }}
                            className="bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-slate-950 border border-teal-500/20 hover:border-teal-500 px-2.5 py-1 rounded transition-colors text-xxs font-bold"
                          >
                            Upload Guideline
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 5: Clinician Feedback log */}
          {activeTab === 'feedbacks' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Clinician Feedback</h2>
                  <p className="text-xxs text-slate-500 mt-1">
                    Review suggestions, feature requests, and bug reports submitted by pilot users.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {feedbacks.map(fb => (
                  <div key={fb.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-850 pb-2.5">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-bold text-slate-200">{fb.email}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className={`text-xxs px-2 py-0.5 rounded font-bold uppercase border ${
                          fb.category === 'Bug Report' 
                            ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                            : fb.category === 'Feature Request'
                            ? 'bg-teal-500/10 border-teal-500/20 text-teal-400'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                          {fb.category}
                        </span>
                        <span className="text-xxs text-slate-500">{fb.date}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">
                      "{fb.feedback}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 6: MTIR Simulation Study */}
          {activeTab === 'mtir' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3 gap-2">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">MTIR Simulation Study</h2>
                  <p className="text-xxs text-slate-500 mt-1">
                    Compare Mean Time to Information Retrieval (MTIR) and look-up accuracy between traditional intranet/binders and the AnaesSOP RAG system.
                  </p>
                </div>
                <button
                  onClick={fetchMtirStats}
                  disabled={isLoadingMtir}
                  className="bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-300 font-semibold px-3 py-1.5 rounded-lg text-xxs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Activity className={`w-3.5 h-3.5 ${isLoadingMtir ? 'animate-spin' : ''}`} />
                  Refresh Stats
                </button>
              </div>

              {isLoadingMtir && !mtirStats ? (
                <div className="text-center py-12 text-xs text-slate-500 animate-pulse">
                  Loading MTIR telemetry from D1 database...
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left: Baseline Entry Form */}
                  <div className="lg:col-span-1 bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Log Baseline Run</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Record look-up times using traditional desktop intranet or physical folders.</p>
                    </div>

                    <form onSubmit={handleMtirSubmit} className="space-y-3.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Registrar Role</label>
                        <select
                          value={mtirRole}
                          onChange={(e) => setMtirRole(e.target.value)}
                          className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2 text-xs focus:ring-1 focus:ring-teal-500"
                        >
                          <option value="ST3">ST3 (Junior Registrar)</option>
                          <option value="ST4">ST4 (Junior Registrar)</option>
                          <option value="ST5-7">ST5-7 (Senior Registrar)</option>
                          <option value="Consultant">Consultant</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Scenario Task</label>
                        <select
                          value={mtirTask}
                          onChange={(e) => setMtirTask(e.target.value)}
                          className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2 text-xs focus:ring-1 focus:ring-teal-500"
                        >
                          <optgroup label="Default Mock Scenarios">
                            <option value="la-toxicity">Local Anaesthetic Toxicity Guideline</option>
                            <option value="dexmed-dosing">Dexmedetomidine Dosing Formula</option>
                            <option value="malignant-hyperthermia">Malignant Hyperthermia checklist</option>
                          </optgroup>
                          {guidelines && guidelines.length > 0 && (
                            <optgroup label="Active Uploaded Guidelines">
                              {guidelines
                                .filter(g => g.status !== 'superseded' && g.status !== 'Superseded')
                                .map((g: any) => (
                                  <option key={g.id} value={g.id}>{g.name} ({g.version})</option>
                                ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Device Used</label>
                          <select
                            value={mtirDevice}
                            onChange={(e) => setMtirDevice(e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2 text-xs focus:ring-1 focus:ring-teal-500"
                          >
                            <option value="desktop">PC Terminal</option>
                            <option value="mobile">Mobile PWA</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Time Taken (seconds)</label>
                          <input
                            type="number"
                            required
                            min="1"
                            max="600"
                            placeholder="e.g. 180"
                            value={mtirTimeSec}
                            onChange={(e) => setMtirTimeSec(e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2 text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Accuracy Score</label>
                          <select
                            value={mtirAccuracy}
                            onChange={(e) => setMtirAccuracy(e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2 text-xs focus:ring-1 focus:ring-teal-500"
                          >
                            <option value="1.0">1.0 (Exact Info)</option>
                            <option value="0.8">0.8 (Close Match)</option>
                            <option value="0.5">0.5 (Partial Info)</option>
                            <option value="0.0">0.0 (Failed/Wrong)</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5 pt-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="mtirSuccess"
                              checked={mtirSuccess}
                              onChange={(e) => setMtirSuccess(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-800 text-teal-500 bg-slate-900 focus:ring-teal-500"
                            />
                            <label htmlFor="mtirSuccess" className="text-xs font-semibold text-slate-300">
                              Task Successful
                            </label>
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmittingMtir}
                        className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-teal-800 text-slate-950 font-bold p-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 mt-2"
                      >
                        {isSubmittingMtir ? "Submitting..." : "Submit Baseline Run"}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>

                  {/* Right: Telemetry Dashboard */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* KPI Cards */}
                    {mtirStats && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-tight">Avg Baseline Time</span>
                          <span className="text-base font-bold text-slate-200 mt-2 font-mono">{mtirStats.avgBaselineTimeSec ? `${mtirStats.avgBaselineTimeSec}s` : '0s'}</span>
                          <span className="text-[9px] text-slate-500 mt-1">Sample Size: {mtirStats.totalBaseline || 0} runs</span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-tight">Avg App Time</span>
                          <span className="text-base font-bold text-teal-400 mt-2 font-mono">{mtirStats.avgAppTimeSec ? `${mtirStats.avgAppTimeSec}s` : '0s'}</span>
                          <span className="text-[9px] text-slate-500 mt-1">Sample Size: {mtirStats.totalApp || 0} runs</span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-tight">Speedup Factor</span>
                          <span className="text-base font-extrabold text-teal-400 mt-2 font-mono">{mtirStats.speedupFactor ? `${mtirStats.speedupFactor}x` : '0.0x'}</span>
                          <span className="text-[9px] text-teal-400/70 font-semibold mt-1">SOP Look-Up Speedup</span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-tight">Success Rates</span>
                          <div className="mt-1 flex flex-col">
                            <span className="text-xxs font-semibold text-slate-400">
                              Intranet: <span className="text-red-400 font-mono">{mtirStats.baselineSuccessRate || 0}%</span>
                            </span>
                            <span className="text-xxs font-semibold text-slate-400">
                              App: <span className="text-teal-400 font-mono">{mtirStats.appSuccessRate || 0}%</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Role Breakdown Table */}
                    {mtirStats && mtirStats.roleBreakdown && mtirStats.roleBreakdown.length > 0 && (
                      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">Registrar Cohort Breakdown</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-300">
                            <thead>
                              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                                <th className="pb-2 font-bold">Role</th>
                                <th className="pb-2 text-center font-bold">Baseline Runs</th>
                                <th className="pb-2 text-center font-bold">App Runs</th>
                                <th className="pb-2 text-right font-bold">Baseline Avg</th>
                                <th className="pb-2 text-right font-bold">App Avg</th>
                                <th className="pb-2 text-right font-bold text-teal-400">Speedup</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mtirStats.roleBreakdown.map((row: any) => (
                                <tr key={row.role} className="border-b border-slate-900/50 last:border-0 hover:bg-slate-900/20">
                                  <td className="py-2.5 font-semibold text-slate-200">{row.role}</td>
                                  <td className="py-2.5 text-center">{row.baselineCount}</td>
                                  <td className="py-2.5 text-center">{row.appCount}</td>
                                  <td className="py-2.5 text-right font-mono">{row.avgBaselineSec ? `${row.avgBaselineSec.toFixed(1)}s` : '-'}</td>
                                  <td className="py-2.5 text-right font-mono text-teal-400 font-semibold">{row.avgAppSec ? `${row.avgAppSec.toFixed(2)}s` : '-'}</td>
                                  <td className="py-2.5 text-right font-mono text-teal-400 font-bold">{row.speedup ? `${row.speedup.toFixed(1)}x` : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Recent Trial Logs */}
                    {mtirStats && mtirStats.recentLogs && mtirStats.recentLogs.length > 0 && (
                      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">Recent Study Run Logs</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {mtirStats.recentLogs.map((log: any) => (
                            <div key={log.id} className="bg-slate-900/40 border border-slate-850 rounded-lg p-2.5 flex justify-between items-center text-xxs">
                              <div>
                                <span className={`px-1.5 py-0.5 rounded font-bold uppercase mr-2 text-[8px] ${
                                  log.study_arm === 'baseline' 
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                    : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                }`}>
                                  {log.study_arm === 'baseline' ? 'Baseline' : 'App (SOP RAG)'}
                                </span>
                                <span className="font-semibold text-slate-200">{log.registrar_role}</span>
                                <span className="text-slate-500 mx-1.5">|</span>
                                <span className="text-slate-400">{log.task_id}</span>
                              </div>
                              <div className="text-right">
                                <span className={`font-bold font-mono ${log.study_arm === 'baseline' ? 'text-slate-300' : 'text-teal-400'}`}>
                                  {(log.time_taken_ms / 1000).toFixed(2)}s
                                </span>
                                <span className="text-slate-500 mx-1.5">|</span>
                                <span className={log.is_successful ? 'text-teal-500' : 'text-red-500'}>
                                  {log.is_successful ? '✓ Success' : '✗ Failed'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3.5 rounded-xl border shadow-2xl transition-all duration-300 transform translate-y-0 animate-slide-in ${
          toast.type === 'success'
            ? 'bg-teal-950/95 border-teal-500/30 text-teal-200 shadow-teal-950/50'
            : 'bg-red-950/95 border-red-500/30 text-red-200 shadow-red-950/50'
        }`}>
          <div className={`w-2.5 h-2.5 rounded-full ${toast.type === 'success' ? 'bg-teal-400 animate-pulse' : 'bg-red-400 animate-pulse'}`}></div>
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
