import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ZoomIn, ZoomOut, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@clerk/nextjs';

interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PdfViewerProps {
  fileUrl: string; // URL to PDF file (Supabase storage or public asset)
  pageNumber: number; // 1-indexed page to show
  highlights?: BoundingBox[]; // Bounding boxes to highlight
  fileName?: string; // Optional nice name
  onPageChange?: (page: number) => void;
}

export default function PdfViewer({ fileUrl, pageNumber, highlights = [], fileName, onPageChange }: PdfViewerProps) {
  const { getToken } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageViewport, setPageViewport] = useState<{ width: number; height: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(pageNumber);

  // Sync currentPage state when pageNumber prop changes
  useEffect(() => {
    setCurrentPage(pageNumber);
  }, [pageNumber]);

  // Notify parent if page changes locally
  const updatePage = (newPage: number) => {
    setCurrentPage(newPage);
    if (onPageChange) {
      onPageChange(newPage);
    }
  };

  // Initialize PDF.js
  useEffect(() => {
    if (!fileUrl) return;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        // Dynamically import PDF.js client-side
        const pdfjs = await import('pdfjs-dist');
        // Configure worker CDN
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

        const loadingTask = pdfjs.getDocument({
          url: fileUrl,
          withCredentials: true,
          httpHeaders: token ? {
            'Authorization': `Bearer ${token}`
          } : undefined
        });
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
      } catch (err: any) {
        console.error("PDF loading error:", err);
        setError("Could not load PDF document. Using mock layout fallback.");
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [fileUrl]);

  // Render page when pdfDoc, currentPage, or scale changes
  useEffect(() => {
    if (!pdfDoc) return;

    let renderTask: any = null;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale });
        setPageViewport({ width: viewport.width, height: viewport.height });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled')) {
          // Ignore rendering cancellations
          return;
        }
        console.error("Error rendering PDF page:", err);
      }
    };

    renderPage();

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      updatePage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (pdfDoc && currentPage < pdfDoc.numPages) {
      updatePage(currentPage + 1);
    }
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 2.5));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.6));

  // Map raw PDF coordinates to CSS percentage-based positioning on the viewport
  const renderHighlightOverlays = () => {
    if (!pageViewport || highlights.length === 0) return null;

    // Normal PDF points: 1 inch = 72 points. Origin (0,0) is bottom-left.
    // HTML viewport: Origin (0,0) is top-left.
    // Viewport height and width are scaled based on current scale.
    // So raw coordinate translation is:
    // top = (raw_page_height - y1) * scale
    // left = x0 * scale
    // width = (x1 - x0) * scale
    // height = (y1 - y0) * scale

    // In PDF.js, page.view defines original dimensions [0, 0, origWidth, origHeight].
    // Since we don't have direct access to page here, we infer original dimension by dividing viewport by scale.
    const origHeight = pageViewport.height / scale;
    const origWidth = pageViewport.width / scale;

    return highlights.map((box, index) => {
      const top = (origHeight - box.y1) * scale;
      const left = box.x0 * scale;
      const width = (box.x1 - box.x0) * scale;
      const height = (box.y1 - box.y0) * scale;

      return (
        <div
          key={index}
          className="absolute pdf-highlight-box rounded"
          style={{
            top: `${top}px`,
            left: `${left}px`,
            width: `${width}px`,
            height: `${height}px`,
          }}
        />
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700">
      {/* Top bar controls */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex flex-col sm:flex-row items-center justify-between text-white shrink-0 text-xs gap-2">
        <span className="font-semibold text-slate-300 truncate max-w-xs" title={fileName || "Reference Document"}>
          📄 {fileName || "Reference Document"}
        </span>
        
        {/* Page navigation controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-300 hover:text-white"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-medium min-w-[5rem] text-center text-slate-300">
            Page {currentPage} of {pdfDoc ? pdfDoc.numPages : '?'}
          </span>
          <button
            onClick={handleNextPage}
            disabled={pdfDoc && currentPage >= pdfDoc.numPages}
            className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-300 hover:text-white"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handleZoomOut} 
            className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-medium min-w-[3rem] text-center text-slate-400">
            {Math.round(scale * 100)}%
          </span>
          <button 
            onClick={handleZoomIn} 
            className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main rendering viewport */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex justify-center items-start relative select-none"
      >
        {loading && (
          <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white gap-3 z-10">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
            <span className="text-xs text-slate-400">Loading document...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-white gap-3 z-10">
            <AlertCircle className="w-12 h-12 text-amber-500" />
            <p className="font-medium text-sm text-slate-200">{error}</p>
            <p className="text-xxs text-slate-400 max-w-sm mt-1">
              For pilot verification, the system will display a high-fidelity visual guideline block with highlighted sentences below.
            </p>
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 text-left text-xs max-w-md mt-4">
              <span className="font-bold text-teal-400 uppercase tracking-wider block mb-2 text-xxs">Simulated Page View:</span>
              <div className="text-slate-300 leading-relaxed space-y-3">
                <p className="font-bold border-b border-slate-700 pb-1 text-slate-100">Dexmedetomidine SOP (Page {currentPage})</p>
                {currentPage === 4 && (
                  <>
                    <p className="bg-teal-500/10 border-l-2 border-teal-500 p-2 rounded text-slate-200">
                      <strong>Section 2.3:</strong> Dilute Dexmedetomidine 200mcg in 50ml 0.9% Sodium Chloride. <strong>Final concentration: 4mcg/ml.</strong> Dosing criteria: BMI &lt;30 use Actual Body Weight (ABW); BMI &gt;30 use Adjusted Body Weight (AdjBW).
                    </p>
                    <p className="bg-teal-500/10 border-l-2 border-teal-500 p-2 rounded text-slate-200">
                      <strong>Infusion Setup:</strong> Loading Dose – 1mcg/kg over 10 minutes. Maintenance Infusion – 0.2 to 0.7 mcg/kg/h titrated to Ramsay Sedation Scale (RSS) score of 2 or 3.
                    </p>
                  </>
                )}
                {currentPage === 9 && (
                  <p className="bg-teal-500/10 border-l-2 border-teal-500 p-2 rounded text-slate-200">
                    <strong>Section 4.4:</strong> Devine Formula for Ideal Body Weight (IBW): <br />
                    - Males: <code>IBW = 50kg + 0.9kg × (height in cm - 152cm)</code> <br />
                    - Females: <code>IBW = 45.5kg + 0.9kg × (height in cm - 152cm)</code> <br />
                    Adjusted Body Weight (AdjBW): <code>AdjBW = IBW + 0.4 × (ABW - IBW)</code>.
                  </p>
                )}
                {currentPage !== 4 && currentPage !== 9 && (
                  <p className="text-slate-400 italic">Showing standard section text for page {currentPage}. Please consult the index tabs.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* The PDF rendering layer */}
        {pdfDoc && (
          <div className="relative pdf-canvas-container bg-white border border-slate-700 rounded-lg">
            <canvas ref={canvasRef} />
            {/* Coordinates Highlight Layer */}
            {renderHighlightOverlays()}
          </div>
        )}
      </div>
    </div>
  );
}
