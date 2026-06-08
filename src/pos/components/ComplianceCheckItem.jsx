import { C } from "../constants/colors";

function ComplianceCheckItem({ok, warn, label, detail, expandKey, expanded, onToggle, children}) {
  return (
    <div style={{flex:"1 1 0",minWidth:0}}>
      <button onClick={()=>onToggle(expandKey)} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid ${ok?C.suc+"60":warn?C.acc+"60":C.dan+"60"}`,background:ok?C.suc+"12":warn?C.acc+"12":C.dan+"12",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:14}}>{ok?"✓":warn?"⚠":"✗"}</span>
          <span style={{fontSize:12,fontWeight:700,color:ok?C.suc:warn?C.acc:C.dan}}>{label}</span>
          <span style={{fontSize:9,color:C.textMut,marginLeft:"auto"}}>{expanded?"▲":"▼"}</span>
        </div>
        <div style={{fontSize:10,color:C.textSec,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>
      </button>
      {expanded&&children&&<div style={{marginTop:6,padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface}}>{children}</div>}
    </div>
  );
}

export { ComplianceCheckItem };
