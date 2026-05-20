/**
 * Calming, centered loading state with a self-drawing bell curve animation.
 * Used during initial page load and while Claude is grading a submission.
 *
 * Props:
 *   - title:    main message (e.g. "Grading paper", "Loading…")
 *   - subtitle: small detail (e.g. "Currently on Problem 3 (b)", student name)
 */
export default function StatsLoader({ title = 'Loading…', subtitle = null }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] gap-8 select-none">
      <BellCurveAnimation />

      <div className="text-center flex flex-col gap-1">
        <p className="text-lg font-medium text-gray-700">
          {title}<AnimatedDots />
        </p>
        {subtitle && (
          <p className="text-sm text-gray-400 font-mono">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

/**
 * SVG bell curve that draws itself across ~2.5 seconds and loops.
 * Histogram bars rise and fall underneath. Pure CSS/SVG animation, no JS.
 */
function BellCurveAnimation() {
  return (
    <div className="relative w-64 h-40">
      <svg
        viewBox="0 0 240 140"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        {/* Axis */}
        <line x1="20" y1="120" x2="220" y2="120" stroke="#cbd5e1" strokeWidth="1" />

        {/* Histogram bars underneath — gentle rise-fall */}
        {[
          { x: 40,  delay: 0.0, h: 25 },
          { x: 65,  delay: 0.2, h: 55 },
          { x: 90,  delay: 0.4, h: 80 },
          { x: 115, delay: 0.6, h: 92 },
          { x: 140, delay: 0.8, h: 80 },
          { x: 165, delay: 1.0, h: 55 },
          { x: 190, delay: 1.2, h: 25 },
        ].map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={120 - bar.h}
            width="18"
            height={bar.h}
            fill="#dbeafe"
            stroke="#93c5fd"
            strokeWidth="1"
            opacity="0"
            style={{
              animation: `bar-rise 3s ease-in-out ${bar.delay}s infinite`,
            }}
          />
        ))}

        {/* The bell curve itself, drawing across the histogram */}
        <path
          d="M 20 120 Q 60 120 95 60 T 170 60 Q 200 60 220 120"
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="280"
          strokeDashoffset="280"
          style={{
            animation: 'curve-draw 3s ease-in-out infinite',
          }}
        />
      </svg>

      <style>{`
        @keyframes curve-draw {
          0%   { stroke-dashoffset: 280; opacity: 0.4; }
          50%  { stroke-dashoffset: 0;   opacity: 1; }
          100% { stroke-dashoffset: -280; opacity: 0.4; }
        }
        @keyframes bar-rise {
          0%, 100% { opacity: 0.3; transform: translateY(20px); }
          50%      { opacity: 1;   transform: translateY(0); }
        }
        rect[style*="bar-rise"] {
          transform-origin: bottom;
        }
      `}</style>
    </div>
  )
}

function AnimatedDots() {
  return (
    <span className="inline-block w-8 text-left">
      <span className="inline-block animate-pulse" style={{ animationDelay: '0ms' }}>.</span>
      <span className="inline-block animate-pulse" style={{ animationDelay: '200ms' }}>.</span>
      <span className="inline-block animate-pulse" style={{ animationDelay: '400ms' }}>.</span>
    </span>
  )
}
