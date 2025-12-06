import React, { useState } from 'react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import {
  Upload,
  FileText,
  Check,
  Zap,
  Terminal,
  CheckCircle2,
  XCircle,
  RotateCw
} from 'lucide-react';

// --- CONFIGURATION ---
// UPDATED: All sizes are now strictly 4:5 aspect ratio to match 16x20" inputs.
const SPECS = [
  // Print Sizes (PNG, 300 DPI)
  { id: 'small',  w: 1200, h: 1500, suffix: '4x5',      format: 'image/png', quality: 1.0, dpi: 300 },
  { id: 'medium', w: 2400, h: 3000, suffix: '8x10',     format: 'image/png', quality: 1.0, dpi: 300 },
  { id: 'large',  w: 4800, h: 6000, suffix: '16x20',    format: 'image/png', quality: 1.0, dpi: 300 },
  { id: 'euro',   w: 4724, h: 5906, suffix: '40x50cm',  format: 'image/png', quality: 1.0, dpi: 300 },
  
  // Web Previews (UPDATED to 4:5 Ratio to prevent padding on web images)
  { id: 'card',   w: 600,  h: 750,  suffix: 'card',     format: 'image/webp', quality: 0.85, dpi: 72, folder: 'card' },
  { id: 'detail', w: 1200, h: 1500, suffix: 'detail',   format: 'image/webp', quality: 0.90, dpi: 72, folder: 'detail' },
];

// --- UTILS: DPI INJECTION (Binary Editing) ---
const injectDpi = async (blob, dpi) => {
  if (dpi <= 72 || blob.type !== 'image/png') return blob;
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const buffer = await blob.arrayBuffer();
  
  // Create pHYs chunk
  const physChunk = new Uint8Array(21);
  const physView = new DataView(physChunk.buffer);
  physView.setUint32(0, 9); 
  physChunk.set([112, 72, 89, 115], 4); // "pHYs"
  physView.setUint32(8, pixelsPerMeter); // X
  physView.setUint32(12, pixelsPerMeter); // Y
  physChunk[16] = 1; // Meter unit

  // Construct new buffer (inserting after IHDR approx 33 bytes)
  const newBuffer = new Uint8Array(buffer.byteLength + 21);
  newBuffer.set(new Uint8Array(buffer.slice(0, 33)), 0);
  newBuffer.set(physChunk, 33);
  newBuffer.set(new Uint8Array(buffer.slice(33)), 54);
  
  return new Blob([newBuffer], { type: 'image/png' });
};

// --- COMPONENT ---
export default function ArtProcessor() {
  const [file, setFile] = useState(null);
  const [artworkId, setArtworkId] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      // Auto-suggest ID
      const name = selected.name.split('.')[0].toLowerCase().replace(/\s+/g, '-');
      setArtworkId(name);
      setLogs([]);
    }
  };

  const addLog = (msg) => setLogs(prev => [...prev, msg]);

  const processImages = async () => {
    if (!file || !artworkId) return;
    setIsProcessing(true);
    setLogs(['Starting engine...', 'Mode: Smart Orientation (No Padding)']);

    try {
      const zip = new JSZip();
      const img = new Image();
      img.src = previewUrl;
      
      await new Promise(r => img.onload = r);

      // Check Input Orientation
      const isInputLandscape = img.width > img.height;
      addLog(`Input Detected: ${isInputLandscape ? 'Landscape (Landscape)' : 'Portrait (Vertical)'}`);

      for (const spec of SPECS) {
        // --- SMART ORIENTATION LOGIC ---
        // Determine target dimensions based on input orientation
        let targetW = spec.w;
        let targetH = spec.h;

        // If Input is Landscape but Spec is Portrait, SWAP them.
        if (isInputLandscape && targetH > targetW) {
             targetW = spec.h;
             targetH = spec.w;
             addLog(`🔄 Auto-rotating ${spec.suffix} to Landscape...`);
        } else {
             addLog(`Generating: ${spec.suffix}...`);
        }

        // 1. Setup Canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        // 2. High Quality Scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 3. EXACT FIT (No Padding, No Cropping)
        // Since ratios match (both are 4:5), we simply draw edge-to-edge
        ctx.drawImage(img, 0, 0, targetW, targetH);

        // 4. Export Blob
        let blob = await new Promise(resolve => {
          canvas.toBlob(resolve, spec.format, spec.quality);
        });

        // 5. Inject DPI (if PNG)
        if (spec.format === 'image/png') {
          blob = await injectDpi(blob, spec.dpi);
        }

        // 6. Add to Zip
        const fileName = `${artworkId}-${spec.suffix}.${spec.format === 'image/png' ? 'png' : 'webp'}`;
        const path = spec.folder ? `${spec.folder}/${fileName}` : fileName;
        
        zip.file(path, blob);
      }

      addLog('Compressing bundle...');
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${artworkId}-print-ready.zip`);
      
      addLog('✅ DONE! Download started.');

    } catch (err) {
      console.error(err);
      addLog('❌ ERROR: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <div className="w-full px-6 sm:px-8 lg:px-12 py-8">

        {/* Title Section */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Poster Master: Smart Fit</h1>
        </div>

        {/* Two Column Grid - only split when there's content on the right */}
        <div className={`grid gap-6 lg:gap-8 ${previewUrl || logs.length > 0 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>

          {/* LEFT COLUMN: Inputs */}
          <div className="space-y-6">

            {/* File Upload Card */}
            <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 lg:p-8">
              <label className="block text-base font-semibold text-gray-700 mb-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" />
                  <span>1. Upload 16x20 or 20x16 Art</span>
                </div>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors"
              />
            </div>

            {/* Artwork ID Card */}
            <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 lg:p-8">
              <label className="block text-base font-semibold text-gray-700 mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span>2. Artwork ID</span>
                </div>
              </label>
              <input
                type="text"
                value={artworkId}
                onChange={(e) => setArtworkId(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 text-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="artwork-name"
              />
            </div>

            {/* Process Button */}
            <button
              onClick={processImages}
              disabled={!file || !artworkId || isProcessing}
              className={`w-full py-4 px-6 rounded-xl text-white text-lg font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
                !file || !artworkId || isProcessing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 transform hover:scale-[1.01]'
              }`}
            >
              {!isProcessing && <Zap className="w-5 h-5" />}
              {isProcessing ? 'Processing...' : 'Generate ZIP'}
            </button>
          </div>

          {/* RIGHT COLUMN: Preview & Logs */}
          <div className="space-y-6">

            {/* Preview Card */}
            {previewUrl && (
              <div className="bg-white rounded-xl shadow-md p-6 lg:p-8">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Preview
                </h3>
                <div className="mb-6">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full max-w-xs mx-auto h-auto object-contain bg-gray-50 border-2 border-gray-200 rounded-lg shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-gray-700 mb-3">Processing Features:</p>
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <span>Auto-Orientation (Portrait/Landscape)</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <span>Zero Padding / Zero Cropping</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <span>300 DPI Injection</span>
                  </div>
                </div>
              </div>
            )}

            {/* Logs Console */}
            {logs.length > 0 && (
              <div className="bg-gray-900 rounded-xl shadow-md overflow-hidden">
                <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-semibold text-gray-200">Processing Log</span>
                </div>
                <div className="p-4 text-green-400 font-mono text-sm h-64 overflow-y-auto">
                  {logs.map((log, i) => {
                    // Replace emoji with icons in log messages
                    let displayLog = log;
                    let icon = null;

                    if (log.includes('✅')) {
                      displayLog = log.replace('✅', '').trim();
                      icon = <CheckCircle2 className="w-4 h-4 inline-block mr-1 text-green-400" />;
                    } else if (log.includes('❌')) {
                      displayLog = log.replace('❌', '').trim();
                      icon = <XCircle className="w-4 h-4 inline-block mr-1 text-red-400" />;
                    } else if (log.includes('🔄')) {
                      displayLog = log.replace('🔄', '').trim();
                      icon = <RotateCw className="w-4 h-4 inline-block mr-1 text-blue-400" />;
                    }

                    return (
                      <div key={i} className="leading-relaxed">
                        &gt; {icon}{displayLog}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}