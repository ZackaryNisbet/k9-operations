import { useScrollReveal } from './useScrollReveal';

export function RevealSection({ children, style, className = '' }) {
  const ref = useScrollReveal();
  return <div ref={ref} className={`bk-reveal ${className}`} style={style}>{children}</div>;
}
