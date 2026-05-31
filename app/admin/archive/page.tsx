"use client";

import React, { useState } from 'react';
import { Search, History, FileText, ArrowLeft, ArrowRight, ShieldAlert, Clock, Send } from 'lucide-react';
import Link from 'next/link';

export default function ArchiveSearch() {
  const [query, setQuery] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('all');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Array<{ title: string; version: string; date: string; content: string; changelog: string }>>([]);

  const handleArchiveSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setTimeout(() => {
      // Mock historical retrieval results based on search query
      const lowerQuery = query.toLowerCase();
      let mockResults = [];

      if (lowerQuery.includes('dexmed') || lowerQuery.includes('afoi') || lowerQuery.includes('weight')) {
        mockResults = [
          {
            title: "Dexmedetomidine Sedation for Awake Fibreoptic Intubation",
            version: "v0.9.0 (Superseded)",
            date: "Published: Oct 2022 | Archived: June 2025",
            changelog: "Replaced by v1.0.0. Major differences: Old version did NOT use Adjusted Body Weight (AdjBW) for patients with BMI > 30, risking relative overdose in morbidly obese patients.",
            content: "Old Dosing Protocol: Initiate infusion with a loading dose of 1mcg/kg over 10 minutes using actual body weight (ABW) regardless of patient BMI. Follow with a maintenance infusion of 0.2 to 1.0 mcg/kg/h titrated to sedation depth."
          }
        ];
      } else if (lowerQuery.includes('toxicity') || lowerQuery.includes('intralipid') || lowerQuery.includes('lipid')) {
        mockResults = [
          {
            title: "AAGBI Safety Guideline: Management of Local Anaesthetic Toxicity",
            version: "v2015 (Superseded)",
            date: "Published: Jan 2015 | Archived: March 2023",
            changelog: "Replaced by v2023. Major differences: Cardiopulmonary bypass triggers and arrest limits updated.",
            content: "Historical protocol specifies initial Intralipid 20% bolus of 1.5 ml/kg over 1 min. Repeat bolus up to 2 times. If cardiac arrest is prolonged, consider cardiopulmonary bypass after 30 minutes of standard CPR."
          }
        ];
      } else {
        mockResults = [
          {
            title: "No Historical Match found",
            version: "—",
            date: "Database Query Successful",
            changelog: "No records found.",
            content: "No matching text chunks exist in the superseded/historical guidelines database. Adjust your terms or selected dates."
          }
        ];
      }

      setResults(mockResults);
      setIsSearching(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-amber-500 flex items-center justify-center font-bold text-slate-950">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-none tracking-wide text-slate-100">Retrospective Version Archive</h1>
            <span className="text-xxs text-slate-400">Governance Incident Audits & Superseded Policy Search</span>
          </div>
        </div>

        <Link 
          href="/admin"
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>
      </header>

      {/* Archive Search Layout */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6 overflow-y-auto">
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex gap-2.5 items-start">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xxs text-slate-400 leading-normal">
              <strong>Incident Review Scope:</strong> Searches performed in this panel scan <strong>only</strong> text chunks of documents marked as <code>Superseded</code>. Use this to audit historical guideline rules during retroactive incident reviews.
            </p>
          </div>

          <form onSubmit={handleArchiveSearch} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Select target superseded document */}
              <div className="flex flex-col gap-1.5 md:col-span-1">
                <label className="text-xxs font-bold text-slate-500 uppercase">Audit Target Guideline</label>
                <select 
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="all">Search All Superseded Files</option>
                  <option value="dexmed-old">Dexmed SOP (v0.9.0)</option>
                  <option value="la-toxicity-old">LA Toxicity Guide (v2015)</option>
                </select>
              </div>

              {/* Semantic Query Input */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xxs font-bold text-slate-500 uppercase">Search Historical Terms</label>
                <div className="relative">
                  <input 
                    type="text"
                    required
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter audit query (e.g. 'dexmed weight calculation')..."
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white rounded-lg pl-3 pr-10 py-2.5 text-xs transition-colors"
                  />
                  <button 
                    type="submit"
                    disabled={isSearching}
                    className="absolute right-1.5 top-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold p-1.5 rounded-md transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          </form>
        </div>

        {/* Results Stream */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Retrieved Historical Chunks</h2>
          
          {isSearching ? (
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
              Quering archived guidelines database...
            </div>
          ) : results.length > 0 ? (
            results.map((res, index) => (
              <div key={index} className="bg-slate-950/60 border border-slate-850 rounded-xl p-5 space-y-4">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-850 pb-3 gap-2">
                  <div className="flex items-start gap-2.5">
                    <FileText className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-xs font-bold text-slate-200">{res.title}</h3>
                      <span className="text-xxs text-slate-500 font-medium">{res.date}</span>
                    </div>
                  </div>
                  <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded text-xxs font-bold shrink-0 self-start sm:self-center">
                    {res.version}
                  </span>
                </div>

                {/* Content */}
                <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-4 border border-slate-850 rounded-lg font-mono">
                  <span className="text-xxs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Archived Text Chunk:</span>
                  {res.content}
                </div>

                {/* Changelog Relation */}
                {res.changelog && (
                  <div className="bg-slate-900/20 rounded-lg p-3 border border-slate-850/80 flex gap-2.5 items-start">
                    <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <div className="text-xxs leading-normal">
                      <strong className="text-slate-400 font-bold block uppercase mb-1">Archived Supercession Log:</strong>
                      <span className="text-slate-400">{res.changelog}</span>
                    </div>
                  </div>
                )}

              </div>
            ))
          ) : (
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-8 text-center text-slate-600 text-xs">
              Enter a search query above to load historical guidelines.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
