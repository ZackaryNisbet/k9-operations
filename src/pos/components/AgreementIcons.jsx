import { C } from "../constants/colors";
import { Tip } from "./ui";
import { agrSigned } from "../lib/agreements";

function AgreementIcons({ client, agreements }) {
  if (!agreements || agreements.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {agreements.map(agr => {
        const info = agrSigned(client, agr.id);
        const done = !!info;
        const dateFmt = info && info.date ? new Date(info.date + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : null;
        const tipText = done
          ? `${agr.name} — Signed${dateFmt ? ` ${dateFmt}` : ""}`
          : `${agr.name} — Not signed`;
        return (
          <Tip key={agr.id} text={tipText}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: done ? C.sucLt : C.danLt, color: done ? C.suc : C.dan, cursor: "default", flexShrink: 0 }}>
              {done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
            </div>
          </Tip>
        );
      })}
    </div>
  );
}

export { AgreementIcons };
