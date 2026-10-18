import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { IconButton } from '../design-system';
import { usePreviewWidth } from './usePreviewWidth';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ data, zoom }: { data: ArrayBuffer; zoom: number }) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [rendering, setRendering] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { ref, width } = usePreviewWidth();
  useEffect(() => {
    let cancelled = false;
    // Give the worker its own buffer; StrictMode may remount the same data.
    const task = getDocument({
      data: new Uint8Array(data.slice(0)),
      enableXfa: false,
      useSystemFonts: true,
    });
    task.promise
      .then((pdf) => {
        if (!cancelled) setDocument(pdf);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [data]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setRendering(true);
    document
      .getPage(page)
      .then(async (pdfPage) => {
        if (cancelled || !canvas.current) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const scale = (width / natural.width) * zoom;
        // Bound raster memory for unusually large PDF pages and high-DPI screens.
        const density = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(16_000_000 / (natural.width * natural.height * scale * scale)),
        );
        const viewport = pdfPage.getViewport({ scale: scale * density });
        const element = canvas.current;
        element.width = Math.ceil(viewport.width);
        element.height = Math.ceil(viewport.height);
        element.style.width = `${natural.width * scale}px`;
        element.style.height = `${natural.height * scale}px`;
        task = pdfPage.render({ canvas: element, viewport });
        await task.promise;
        if (!cancelled) setRendering(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setRendering(false);
        }
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, page, zoom, width]);
  return (
    <>
      {document && (
        <div className="attachment-page-controls">
          <IconButton
            label="Previous page"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft size={18} />
          </IconButton>
          <span aria-live="polite">
            Page {page} of {document.numPages}
          </span>
          <IconButton
            label="Next page"
            disabled={page === document.numPages}
            onClick={() => setPage((value) => value + 1)}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
      )}
      <div className="attachment-preview-viewport" ref={ref} aria-busy={rendering && !error}>
        {error ? (
          <p className="attachment-preview-message" role="alert">
            This PDF can’t be previewed. It may be damaged or password protected. You can download
            it instead.
          </p>
        ) : (
          <>
            {rendering && (
              <p className="attachment-render-status" role="status">
                Rendering PDF…
              </p>
            )}
            <canvas
              ref={canvas}
              role="img"
              aria-label={`PDF page ${page}`}
              style={{ visibility: rendering ? 'hidden' : 'visible' }}
            />
          </>
        )}
      </div>
    </>
  );
}
