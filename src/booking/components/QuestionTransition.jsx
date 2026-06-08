// ═══════════════════════════════════════════════════════════════════════════
// QUESTION TRANSITION (fade out old → fade in new)
// ═══════════════════════════════════════════════════════════════════════════
export function QuestionTransition({ questionKey, children }) {
  return (
    <div className="bk-question-enter" key={questionKey}>
      {children}
    </div>
  );
}
