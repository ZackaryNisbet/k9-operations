import { Btn, Card, Inp } from "../components/ui";
import { C } from "../constants/colors";
import { I } from "../icons";
import { gid, titleCase, todayStr } from "../lib/format";
import { isFieldRequired, validateFields } from "../lib/fieldRules";
import { useState } from "react";

function NewClientPage({ data, save, nav, prefill, addGlobalToast }) {
  const [fields, setFields] = useState(() => {
    if (!prefill) return {};
    const v = prefill.trim();
    // Detect type: email, phone, or name
    if (v.includes("@")) return { email: v };
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 7) return { phone: digits };
    // Looks like a name — title-case each word
    const parts = v.split(/\s+/);
    if (parts.length >= 2) return { first_name: titleCase(parts[0]), last_name: titleCase(parts.slice(1).join(" ")) };
    return { first_name: titleCase(v) };
  });
  const [errors, setErrors] = useState({});
  const handleSave = async () => {
    const errs=validateFields(data.clientFields, fields, "create");
    if(fields.phone){const ex=data.clients.find(c=>c.fields.phone===(fields.phone||"").replace(/\D/g,""));if(ex)errs.phone="Phone already exists";}
    if(Object.keys(errs).length>0){setErrors(errs);return;}
    const nc={id:gid(),fields:{...fields,phone:(fields.phone||"").replace(/\D/g,"")},createdAt:todayStr(),agreements:{}};
    await save({...data,clients:[...data.clients,nc]});
    const name = `${nc.fields.first_name||""} ${nc.fields.last_name||""}`.trim();
    if (addGlobalToast) addGlobalToast({ message: `Client "${name}" created`, actionLabel: "Book Reservation", onAction: () => nav("new-reservation", { clientId: nc.id }) });
    nav("client-detail",{clientId:nc.id});
  };
  return (
    <div>
      <button onClick={()=>nav("clients")} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.textSec,fontSize:14,fontWeight:600,padding:0,marginBottom:20,fontFamily:"inherit"}}><I.Back/> Back</button>
      <h1 style={{margin:"0 0 24px",fontSize:26,fontWeight:800,color:C.text}}>New Client</h1>
      <Card style={{padding:28}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {data.clientFields.filter(f=>f.type!=="textarea").map(f=>(<div key={f.id}><Inp label={f.name} type={f.type} value={fields[f.id]||""} onChange={v=>{setFields({...fields,[f.id]:v});setErrors({...errors,[f.id]:undefined});}} required={isFieldRequired(f,"create")} placeholder={f.isKey?"Primary key - must be unique":""} options={f.options}/>{errors[f.id]&&<div style={{color:C.dan,fontSize:12,marginTop:4,fontWeight:600}}>{errors[f.id]}</div>}</div>))}
        </div>
        {data.clientFields.filter(f=>f.type==="textarea").map(f=>(<div key={f.id} style={{marginTop:16}}><Inp label={f.name} type="textarea" value={fields[f.id]||""} onChange={v=>setFields({...fields,[f.id]:v})}/></div>))}
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:28}}><Btn variant="secondary" onClick={()=>nav("clients")}>Cancel</Btn><Btn onClick={handleSave}>Create Client</Btn></div>
      </Card>
    </div>
  );
}

export { NewClientPage };
