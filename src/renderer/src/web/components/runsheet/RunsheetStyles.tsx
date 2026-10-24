// components/runsheet/RunsheetStyles.tsx
// Keyframes and hover/focus rules for the chain rail. Rendered by the rail itself (a
// duplicate <style> is harmless), so it works wherever a rail is used. Motion is
// switched off for people who ask their system for reduced motion.

export function RunsheetStyles() {
  return (
    <style>{`
      @keyframes rsPing { 0% { transform: scale(1); opacity: .55; } 80%, 100% { transform: scale(1.75); opacity: 0; } }
      @keyframes rsGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(201,162,77,.0), 0 1px 1px rgba(38,37,30,.04); } 50% { box-shadow: 0 0 0 4px rgba(201,162,77,.28), 0 1px 1px rgba(38,37,30,.04); } }
      @keyframes rsGlowAmber { 0%, 100% { box-shadow: 0 0 0 0 rgba(217,160,106,.0); } 50% { box-shadow: 0 0 0 4px rgba(217,160,106,.3); } }
      @keyframes rsSpin { to { transform: rotate(360deg); } }
      @keyframes rsPop { 0% { transform: scale(.35); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
      @keyframes rsFlow { from { background-position: 0 0; } to { background-position: 28px 0; } }
      @keyframes rsDash { from { background-position: 0 0; } to { background-position: 12px 0; } }
      @keyframes rsBreathe { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
      @keyframes rsSlide { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes rsDot1 { 0%, 24% { opacity: 0; } 25%, 100% { opacity: 1; } }
      @keyframes rsDot2 { 0%, 49% { opacity: 0; } 50%, 100% { opacity: 1; } }
      @keyframes rsDot3 { 0%, 74% { opacity: 0; } 75%, 100% { opacity: 1; } }
      .rs-bead { transition: transform .14s ease, box-shadow .14s ease; cursor: pointer; }
      .rs-bead:hover { transform: translateY(-1px); }
      .rs-bead:focus-visible { outline: 2px solid #26251E; outline-offset: 2px; }
      .rs-rail { scrollbar-width: none; }
      .rs-rail::-webkit-scrollbar { display: none; }
      .rs-dot { opacity: 0; animation-duration: 1.4s; animation-iteration-count: infinite; animation-timing-function: steps(1); }
      .rs-dot1 { animation-name: rsDot1; }
      .rs-dot2 { animation-name: rsDot2; }
      .rs-dot3 { animation-name: rsDot3; }
      @media (prefers-reduced-motion: reduce) {
        .rs-anim, .rs-bead { animation: none !important; transition: none !important; }
        .rs-dot { animation: none !important; opacity: 1; }
      }
    `}</style>
  );
}
