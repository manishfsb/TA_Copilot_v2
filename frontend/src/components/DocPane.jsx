import { useState, useRef, useEffect } from 'react'
import { pdfjs, Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

// PDF.js worker, resolved by Vite from the installed pdfjs-dist.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const STEP = 0.25

/**
 * Single-document pane. PDFs are rendered with react-pdf (PDF.js) into a scroll
 * container WE own, so the scrollbar is a normal, always-visible one that matches the
 * document length, and zooming scrolls both vertically AND horizontally.
 *
 * Zoom is via the corner −/+ buttons (a wheel/pinch gesture is avoided because on macOS
 * trackpad pinch fires ctrl+wheel, which fights the browser's own page zoom). Pages
 * render stacked, fit to the pane width at 100%, wider when zoomed in.
 *
 * `src` may be a backend URL or a blob: object URL (a not-yet-saved upload). `.docx`
 * (passed as `unavailable`) shows a placeholder; anything PDF.js can't parse (e.g. a
 * JPG/PNG student paper) falls back to an <img>.
 */
export default function DocPane({
  src,
  title = 'Document',
  unavailable = false,
  heightClass = 'lg:sticky lg:top-4 h-[60vh] lg:h-[calc(100vh-7rem)]',
}) {
  const scrollRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1)
  const [notPdf, setNotPdf] = useState(false)

  // Reset per-document state whenever the source changes.
  useEffect(() => { setNumPages(0); setScale(1); setNotPdf(false) }, [src])

  // Track the scroll container's content width so pages render fit-to-width at 100%.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clamp = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100))
  const zoomIn = () => setScale((s) => clamp(s + STEP))
  const zoomOut = () => setScale((s) => clamp(s - STEP))

  // At 100% a page fits the pane width; zooming makes it wider so it overflows and the
  // container scrolls horizontally too. (-1 leaves room so 100% never forces a scrollbar.)
  const pageWidth = width ? Math.max(1, Math.floor(width * scale) - 1) : undefined
  const showZoom = !unavailable && (numPages > 0 || notPdf)

  return (
    <div className={`relative ${heightClass}`}>
      <div
        ref={scrollRef}
        className="absolute inset-0 bg-white border border-gray-200 rounded-xl overflow-auto shadow-sm"
      >
        {unavailable ? (
          <Placeholder text="This file isn't a PDF or image, so it can't be shown here." />
        ) : notPdf ? (
          // PDF.js couldn't parse it — most likely a JPG/PNG submission.
          <img src={src} alt={title} style={{ width: pageWidth }} className="block max-w-none" />
        ) : (
          <Document
            file={src}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={() => setNotPdf(true)}
            loading={<Loading />}
            error={<Loading />}
            // w-max + min-w-full: grow to the widest page so horizontal scroll reaches
            // the full width (no left-edge clipping), but never narrower than the pane.
            className="w-max min-w-full flex flex-col items-center gap-2 py-2"
          >
            {Array.from({ length: numPages }, (_, i) => (
              <Page
                key={i}
                pageNumber={i + 1}
                width={pageWidth}
                className="shadow-sm"
                renderAnnotationLayer={false}
              />
            ))}
          </Document>
        )}
      </div>

      {showZoom && (
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 bg-white/95 border border-gray-200 rounded-lg shadow-sm px-1 py-0.5">
          <ZoomBtn onClick={zoomOut} disabled={scale <= MIN_SCALE} label="Zoom out">−</ZoomBtn>
          <button
            type="button"
            onClick={() => setScale(1)}
            title="Reset zoom"
            className="text-xs text-gray-500 hover:text-blue-600 w-11 text-center tabular-nums"
          >
            {Math.round(scale * 100)}%
          </button>
          <ZoomBtn onClick={zoomIn} disabled={scale >= MAX_SCALE} label="Zoom in">+</ZoomBtn>
        </div>
      )}
    </div>
  )
}

function ZoomBtn({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-600 text-base leading-none hover:bg-gray-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function Loading() {
  return (
    <div className="w-full h-40 flex items-center justify-center text-sm text-gray-400">
      Loading…
    </div>
  )
}

function Placeholder({ text }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-2 text-gray-400 px-6">
      <div className="text-4xl">📄</div>
      <p className="text-sm font-medium text-gray-500">Inline preview unavailable</p>
      <p className="text-xs">{text}</p>
    </div>
  )
}
