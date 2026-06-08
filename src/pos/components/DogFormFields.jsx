import { BreedSearch } from "./BreedSearch";
import { C } from "../constants/colors";
import { DEF_BATH_TYPE_OPTIONS, DEF_BREED_OPTIONS } from "../constants/dropdowns";
import { FeedingScheduleEditor } from "./FeedingScheduleEditor";
import { Inp } from "./ui";
import { MedicationScheduleEditor } from "./MedicationScheduleEditor";
import { calcAge } from "../lib/dogHelpers";
import { isFieldRequired } from "../lib/fieldRules";

function DogFormFields({ fields, dogFields, data, errors, onChange, feedingSchedules, onFeedingChange, medSchedules, onMedChange, autoFocusBreed, action, dogId, onWeightUpdate }) {
  const sex = fields.sex || "";
  const spayLabel = sex === "Female" ? "Spayed / Intact" : sex === "Male" ? "Neutered / Intact" : "Spayed/Neutered";
  const spayOpts = sex === "Female" ? ["Spayed", "Intact"] : sex === "Male" ? ["Neutered", "Intact"] : ["Neutered", "Spayed", "Intact"];
  const breeds = data.breedOptions || DEF_BREED_OPTIONS;
  const bathOpts = data.bathTypeOptions || DEF_BATH_TYPE_OPTIONS;
  const SPECIAL = new Set(["breed", "spayed_neutered", "bath_type"]);

  return (
    <>
      {/* Generic fields in grid — skip special ones & textareas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {dogFields.filter(f => f.type !== "textarea" && !SPECIAL.has(f.id)).map(f => (
          <div key={f.id} style={f.type === "checkbox" ? { display: "flex", alignItems: "end" } : {}}>
            {f.id === "breed" ? null : (
              <Inp label={f.name} type={f.type} value={fields[f.id] || ""} onChange={v => onChange(f.id, v)} required={isFieldRequired(f, action || "reservation")} options={f.options} />
            )}
            {f.id === "dob" && fields.dob && calcAge(fields.dob) && (
              <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <span>🎂</span> {calcAge(fields.dob)} old
              </div>
            )}
            {errors[f.id] && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{errors[f.id]}</div>}
          </div>
        ))}
        {/* Breed — searchable dropdown */}
        <div>
          <BreedSearch value={fields.breed || ""} onChange={v => onChange("breed", v)} breeds={breeds} autoFocus={autoFocusBreed} />
          {errors.breed && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{errors.breed}</div>}
        </div>
        {/* Spayed/Neutered — dynamic based on sex */}
        <div>
          <Inp label={spayLabel} type="select" value={fields.spayed_neutered || ""} onChange={v => onChange("spayed_neutered", v)} options={["", ...spayOpts]} />
        </div>
        {/* Bath type */}
        <div>
          <Inp label="Preferred Bath Type" type="select" value={fields.bath_type || ""} onChange={v => onChange("bath_type", v)} options={["", ...bathOpts]} />
        </div>
      </div>
      {/* Textareas */}
      {dogFields.filter(f => f.type === "textarea").map(f => (
        <div key={f.id} style={{ marginTop: 12 }}>
          <Inp label={f.name} type="textarea" value={fields[f.id] || ""} onChange={v => onChange(f.id, v)} />
        </div>
      ))}
      {/* Feeding schedules */}
      <div style={{ marginTop: 16 }}>
        <FeedingScheduleEditor schedules={feedingSchedules} onChange={onFeedingChange} data={data} dogWeight={parseFloat(fields.weight) || 0} dogName={fields.name || ""} dogId={dogId} onWeightUpdate={onWeightUpdate} />
      </div>
      {/* Medication schedules */}
      <div style={{ marginTop: 16 }}>
        <MedicationScheduleEditor schedules={medSchedules} onChange={onMedChange} data={data} />
      </div>
    </>
  );
}

export { DogFormFields };
