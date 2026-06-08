import { Btn, Card } from "../components/ui";
import { C } from "../constants/colors";
import { DogFormFields } from "../components/DogFormFields";
import { I } from "../icons";
import { gid } from "../lib/format";
import { useState } from "react";
import { validateFields } from "../lib/fieldRules";

function NewDogPage({ data, save, clientId, nav }) {
  const client = data.clients.find(c=>c.id===clientId);
  const [fields, setFields] = useState({});
  const [tags, setTags] = useState([]);
  const [errors, setErrors] = useState({});
  const [feedingSchedules, setFeedingSchedules] = useState([]);
  const [medSchedules, setMedSchedules] = useState([]);
  if(!client)return null;

  const toggleTag = (tagId) => setTags(prev => prev.includes(tagId) ? prev.filter(t=>t!==tagId) : [...prev, tagId]);
  const updateField = (fid, v) => { setFields(prev => ({ ...prev, [fid]: v })); setErrors(prev => ({ ...prev, [fid]: undefined })); };

  const handleSave = async () => {
    const errs=validateFields(data.dogFields, fields, "reservation");
    if(Object.keys(errs).length>0){setErrors(errs);return;}
    const nd={id:gid(),clientId,fields:{...fields, feedingSchedules, medicationSchedules: medSchedules},tags};
    await save({...data,dogs:[...data.dogs,nd]});
    nav("client-detail",{clientId});
  };
  return (
    <div>
      <button onClick={()=>nav("client-detail",{clientId})} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.textSec,fontSize:14,fontWeight:600,padding:0,marginBottom:20,fontFamily:"inherit"}}><I.Back/> Back to {client.fields.first_name}</button>
      <h1 style={{margin:"0 0 24px",fontSize:26,fontWeight:800,color:C.text}}>Add Dog</h1>
      <Card style={{padding:28}}>
        <DogFormFields fields={fields} dogFields={data.dogFields} data={data} errors={errors} onChange={updateField} action="reservation"
          feedingSchedules={feedingSchedules} onFeedingChange={setFeedingSchedules}
          medSchedules={medSchedules} onMedChange={setMedSchedules} onWeightUpdate={(wt) => {
            updateField("weight", String(wt));
            updateField("weightLastUpdated", new Date().toISOString().slice(0,10));
          }} />
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:28}}><Btn variant="secondary" onClick={()=>nav("client-detail",{clientId})}>Cancel</Btn><Btn onClick={handleSave}>Add Dog</Btn></div>
      </Card>
    </div>
  );
}

export { NewDogPage };
