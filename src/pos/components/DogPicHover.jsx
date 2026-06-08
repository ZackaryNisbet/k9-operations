import { useRef, useState } from "react";

function DogPicHover({ dog, size = 20 }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  const name = dog?.fields?.name || "?";
  const breed = dog?.fields?.breed || "";
  const pic = dog?.profilePic;
  const handleEnter = () => {
    if (ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ x: r.left + r.width / 2, y: r.top }); }
    setShow(true);
  };
  const smallIcon = Math.round(size * 0.55);
  return (
    <span ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)} style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0 }}>
      {pic
        ? <img src={pic} alt={name} style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: "cover" }} />
        : <div style={{ width: size, height: size, borderRadius: size * 0.3, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={smallIcon} height={smallIcon} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
      }
      {show && <div style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)", zIndex: 9999, pointerEvents: "none" }}>
        <div style={{ background: "#1a1a2e", borderRadius: 14, padding: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {pic
            ? <img src={pic} alt={name} style={{ width: 120, height: 120, borderRadius: 12, objectFit: "cover" }} />
            : <div style={{ width: 120, height: 120, borderRadius: 12, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
          }
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "#fff" }}>{name}</div>
          {breed && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>{breed}</div>}
        </div>
        <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #1a1a2e", margin: "0 auto" }} />
      </div>}
    </span>
  );
}

export { DogPicHover };
