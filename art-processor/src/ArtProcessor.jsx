import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import {
  Upload,
  FileText,
  CheckCircle2,
  Zap,
  Terminal,
  RotateCw,
  Image as ImageIcon,
  XCircle
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

  const fileInputRef = useRef(null);

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
        let targetW = spec.w;
        let targetH = spec.h;

        if (isInputLandscape && targetH > targetW) {
             targetW = spec.h;
             targetH = spec.w;
             addLog(`Auto-rotating ${spec.suffix} to Landscape...`);
        } else {
             addLog(`Generating: ${spec.suffix}...`);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let blob = await new Promise(resolve => {
          canvas.toBlob(resolve, spec.format, spec.quality);
        });

        if (spec.format === 'image/png') {
          blob = await injectDpi(blob, spec.dpi);
        }

        const fileName = `${artworkId}-${spec.suffix}.${spec.format === 'image/png' ? 'png' : 'webp'}`;
        const path = spec.folder ? `${spec.folder}/${fileName}` : fileName;

        zip.file(path, blob);
      }

      addLog('Compressing bundle...');
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${artworkId}-print-ready.zip`);

      addLog('DONE! Download started.');

    } catch (err) {
      console.error(err);
      addLog('ERROR: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <ImageIcon className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Art Processor</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full">
        {!file ? (
          // STATE A: No File Uploaded - Centered Card with Drop Zone
          <div className="flex items-center justify-center min-h-[calc(100vh-80px)] p-6">
            <div className="w-full max-w-xl">
              <div className="bg-white rounded-2xl shadow-lg p-8">
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Drop Zone */}
                <div
                  onClick={triggerFileInput}
                  className="border-3 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
                >
                  <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-700 mb-2">
                    Upload Your Artwork
                  </h2>
                  <p className="text-gray-500 mb-4">
                    Click to browse or drag and drop
                  </p>
                  <p className="text-sm text-gray-400">
                    Supports: JPG, PNG, WebP (16x20 or 20x16 recommended)
                  </p>
                </div>

                {/* Info Section */}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">
                    What this tool does:
                  </h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>Generates multiple print sizes (4x5, 8x10, 16x20, 40x50cm)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>Auto-detects orientation (portrait/landscape)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>300 DPI for print, optimized WebP for web</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // STATE B: File Uploaded - Two Column Grid
          <div className="w-full p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              {/* LEFT COLUMN (1/3) - Inputs */}
              <div className="lg:col-span-1 space-y-6">
                {/* Upload Preview Card */}
                <div className="bg-white rounded-xl shadow-md p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    Uploaded File
                  </h3>
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full h-auto object-contain bg-gray-50 border border-gray-200 rounded-lg mb-3"
                    />
                  )}
                  <button
                    onClick={triggerFileInput}
                    className="w-full py-2 px-4 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Change File
                  </button>
                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* Artwork ID Card */}
                <div className="bg-white rounded-xl shadow-md p-6">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Artwork ID
                  </label>
                  <input
                    type="text"
                    value={artworkId}
                    onChange={(e) => setArtworkId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 text-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="artwork-name"
                  />
                </div>

                {/* Generate Button */}
                <button
                  onClick={processImages}
                  disabled={!file || !artworkId || isProcessing}
                  className={`w-full py-3 px-6 rounded-xl text-white font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
                    !file || !artworkId || isProcessing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <RotateCw className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Generate ZIP
                    </>
                  )}
                </button>
              </div>

              {/* RIGHT COLUMN (2/3) - Preview & Logs */}
              <div className="lg:col-span-2 space-y-6">
                {/* Large Preview Image */}
                {previewUrl && (
                  <div className="bg-white rounded-xl shadow-md p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-blue-600" />
                      Preview
                    </h3>
                    <div className="flex justify-center">
                      <img
                        src={previewUrl}
                        alt="Large Preview"
                        className="max-w-full h-auto max-h-[500px] object-contain bg-gray-50 border-2 border-gray-200 rounded-lg shadow-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Console Logs */}
                {logs.length > 0 && (
                  <div className="bg-gray-900 rounded-xl shadow-md overflow-hidden">
                    <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-semibold text-gray-200">Processing Log</span>
                    </div>
                    <div className="p-4 text-green-400 font-mono text-sm h-64 overflow-y-auto">
                      {logs.map((log, i) => {
                        let displayLog = log;
                        let icon = null;

                        if (log.includes('DONE')) {
                          icon = <CheckCircle2 className="w-4 h-4 inline-block mr-1 text-green-400" />;
                        } else if (log.includes('ERROR')) {
                          icon = <XCircle className="w-4 h-4 inline-block mr-1 text-red-400" />;
                        } else if (log.includes('Auto-rotating')) {
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
        )}
      </main>
    </div>
  );
}
