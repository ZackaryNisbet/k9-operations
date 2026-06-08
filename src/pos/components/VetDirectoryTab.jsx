import { Btn, Card } from "./ui";
import { C } from "../constants/colors";
import { I } from "../icons";
import { useState } from "react";

function VetDirectoryTab({ data, save, addGlobalToast }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [newVet, setNewVet] = useState({ vetName: "", clinicName: "", phone: "", email: "", notes: "" });

  const handleAddVet = async () => {
    if (!newVet.vetName.trim()) {
      addGlobalToast?.({ type: "error", message: "Vet name is required" });
      return;
    }
    const vet = {
      id: crypto.randomUUID(),
      vetName: newVet.vetName,
      clinicName: newVet.clinicName,
      phone: newVet.phone,
      email: newVet.email,
      notes: newVet.notes,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    await save({ ...data, vets: [...(data.vets || []), vet] });
    setNewVet({ vetName: "", clinicName: "", phone: "", email: "", notes: "" });
    setShowAddForm(false);
    addGlobalToast?.({ type: "success", message: "Vet added successfully" });
  };

  const handleUpdateVet = async (vetId, updates) => {
    await save({
      ...data,
      vets: (data.vets || []).map(v => v.id === vetId ? { ...v, ...updates } : v)
    });
    setEditingId(null);
  };

  const handleToggleActive = async (vetId, isActive) => {
    await handleUpdateVet(vetId, { isActive: !isActive });
  };

  const vets = (data.vets || []).filter(v => showInactive || v.isActive !== false);

  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Veterinarian Directory</div>
          <div style={{ fontSize: 13, color: C.textSec }}>Manage veterinarian contacts referenced in client and dog profiles</div>
        </div>
        <Btn onClick={() => setShowAddForm(!showAddForm)} icon={<I.Plus />} size="sm">Add Vet</Btn>
      </div>

      {showAddForm && (
        <Card style={{ padding: "20px 24px", marginBottom: 20, background: C.priLt, border: `1.5px solid ${C.pri}40` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <input type="text" placeholder="Vet Name" value={newVet.vetName} onChange={(e) => setNewVet({ ...newVet, vetName: e.target.value })} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            <input type="text" placeholder="Clinic Name" value={newVet.clinicName} onChange={(e) => setNewVet({ ...newVet, clinicName: e.target.value })} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            <input type="tel" placeholder="Phone" value={newVet.phone} onChange={(e) => setNewVet({ ...newVet, phone: e.target.value })} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            <input type="email" placeholder="Email" value={newVet.email} onChange={(e) => setNewVet({ ...newVet, email: e.target.value })} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          </div>
          <textarea placeholder="Notes" value={newVet.notes} onChange={(e) => setNewVet({ ...newVet, notes: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", minHeight: 80, marginBottom: 16, boxSizing: "border-box", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowAddForm(false)}>Cancel</Btn>
            <Btn onClick={handleAddVet}>Save Vet</Btn>
          </div>
        </Card>
      )}

      {/* Show Inactive Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "10px 14px", background: C.bg, borderRadius: 8 }}>
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          style={{ cursor: "pointer", width: 16, height: 16 }}
        />
        <label style={{ fontSize: 13, color: C.text, cursor: "pointer", flex: 1 }}>Show inactive vets</label>
      </div>

      {/* Vets Table */}
      {vets.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", background: C.bg, borderRadius: 12 }}>
          <div style={{ fontSize: 14, color: C.textSec, marginBottom: 8 }}>No veterinarians yet</div>
          <div style={{ fontSize: 12, color: C.textMut }}>Add your first vet to get started</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Vet Name</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Clinic</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Phone</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Clients Using</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vets.map(vet => {
                const clientCount = (data.clients || []).filter(c => c.preferredVetId === vet.id).length + (data.dogs || []).filter(d => d.vetId === vet.id).length;
                const isEditing = editingId === vet.id;
                return (
                  <tr key={vet.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: !vet.isActive ? `${C.danLt}20` : "transparent", transition: "background 0.15s" }}>
                    {isEditing ? (
                      <>
                        <td style={{ padding: "12px 16px" }}><input type="text" value={vet.vetName} onChange={(e) => handleUpdateVet(vet.id, { vetName: e.target.value })} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontFamily: "inherit", outline: "none" }} /></td>
                        <td style={{ padding: "12px 16px" }}><input type="text" value={vet.clinicName} onChange={(e) => handleUpdateVet(vet.id, { clinicName: e.target.value })} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontFamily: "inherit", outline: "none" }} /></td>
                        <td style={{ padding: "12px 16px" }}><input type="tel" value={vet.phone} onChange={(e) => handleUpdateVet(vet.id, { phone: e.target.value })} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontFamily: "inherit", outline: "none" }} /></td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}><span style={{ fontSize: 14, fontWeight: 700, color: C.pri }}>{clientCount}</span></td>
                        <td style={{ padding: "12px 16px" }}><button onClick={() => handleToggleActive(vet.id, vet.isActive)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: vet.isActive ? C.suc : C.dan, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{vet.isActive ? "Active" : "Inactive"}</button></td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}><Btn onClick={() => setEditingId(null)} size="xs" variant="secondary">Done</Btn></td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: C.text }}>{vet.vetName}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: C.textSec }}>{vet.clinicName || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: C.textSec }}>{vet.phone || "—"}</td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}><span style={{ fontSize: 14, fontWeight: 700, color: C.pri }}>{clientCount}</span></td>
                        <td style={{ padding: "12px 16px" }}><span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, background: vet.isActive ? C.sucLt : C.danLt, color: vet.isActive ? C.suc : C.dan, fontSize: 11, fontWeight: 600 }}>{vet.isActive ? "Active" : "Inactive"}</span></td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}><Btn onClick={() => setEditingId(vet.id)} size="xs" variant="ghost" icon={<I.Edit />}></Btn></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export { VetDirectoryTab };
