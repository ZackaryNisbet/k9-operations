import { AgreementIcons } from "../components/AgreementIcons";
import { Badge, Btn, Card, Inp, Modal } from "../components/ui";
import { C } from "../constants/colors";
import { I } from "../icons";
import { agrSigned } from "../lib/agreements";
import { fmtDate, gid, todayStr } from "../lib/format";
import { useState } from "react";

function AgreementsPage({ data, save }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newReq, setNewReq] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [viewId, setViewId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editReq, setEditReq] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const agr = { id: "agr_" + gid(), name: newName.trim(), required: newReq, order: data.agreements.length, body: newBody, updatedAt: todayStr() };
    await save({ ...data, agreements: [...data.agreements, agr] });
    setNewName(""); setNewReq(true); setNewBody(""); setShowAdd(false);
  };

  const handleRemove = async (agrId) => {
    const newAgrs = data.agreements.filter(a => a.id !== agrId);
    const newClients = data.clients.map(c => {
      const agrs = { ...(c.agreements || {}) };
      delete agrs[agrId];
      return { ...c, agreements: agrs };
    });
    await save({ ...data, agreements: newAgrs, clients: newClients });
    setConfirmDelete(null);
    if (viewId === agrId) setViewId(null);
  };

  const toggleReq = async (agrId) => {
    await save({ ...data, agreements: data.agreements.map(a => a.id === agrId ? { ...a, required: !a.required } : a) });
  };

  const startEditView = (agr) => {
    setEditName(agr.name); setEditBody(agr.body || ""); setEditReq(agr.required); setEditMode(true);
  };

  const saveEditView = async () => {
    await save({ ...data, agreements: data.agreements.map(a => a.id === viewId ? { ...a, name: editName.trim() || a.name, body: editBody, required: editReq, updatedAt: todayStr() } : a) });
    setEditMode(false);
  };

  const getStats = (agrId) => {
    const completed = data.clients.filter(c => !!agrSigned(c, agrId)).length;
    return { completed, total: data.clients.length };
  };

  const viewAgr = viewId ? data.agreements.find(a => a.id === viewId) : null;

  // ── Detail View ──
  if (viewAgr) {
    const stats = getStats(viewAgr.id);
    const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    const bodyLines = (viewAgr.body || "").split("\n");
    const wordCount = (viewAgr.body || "").split(/\s+/).filter(Boolean).length;
    return (
      <div>
        <button onClick={() => { setViewId(null); setEditMode(false); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.textSec, fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 20, fontFamily: "inherit" }}><I.Back /> Back to Agreements</button>

        <Card style={{ marginBottom: 20, padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri, flexShrink: 0 }}><I.FileText /></div>
              <div>
                {editMode
                  ? <input value={editName} onChange={e => setEditName(e.target.value)} style={{ fontSize: 22, fontWeight: 800, color: C.text, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontFamily: "inherit", outline: "none", background: C.surface, width: 350 }} />
                  : <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>{viewAgr.name}</h2>
                }
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  {viewAgr.required ? <Badge color="danger" size="sm">Required</Badge> : <Badge color="default" size="sm">Optional</Badge>}
                  <span style={{ fontSize: 12, color: C.textMut }}>{wordCount} words</span>
                  {viewAgr.updatedAt && <span style={{ fontSize: 12, color: C.textMut }}>· Last updated {fmtDate(viewAgr.updatedAt)}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {editMode ? (
                <>
                  <Btn variant="secondary" size="sm" onClick={() => setEditMode(false)}>Cancel</Btn>
                  <Btn size="sm" onClick={saveEditView} icon={<I.Check />}>Save Changes</Btn>
                </>
              ) : (
                <>
                  <Btn variant="secondary" size="sm" onClick={() => startEditView(viewAgr)} icon={<I.Edit />}>Edit</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => toggleReq(viewAgr.id)}>{viewAgr.required ? "Make Optional" : "Make Required"}</Btn>
                  <Btn variant="danger" size="sm" onClick={() => setConfirmDelete(viewAgr.id)} icon={<I.Trash />}>Delete</Btn>
                </>
              )}
            </div>
          </div>

          {/* Completion stats bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 16px", background: C.bg, borderRadius: 10 }}>
            <div style={{ flex: 1, maxWidth: 300, height: 8, borderRadius: 4, background: C.surfaceHover, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: pct === 100 ? C.suc : C.acc, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? C.suc : C.textSec }}>{stats.completed}/{stats.total} clients signed ({pct}%)</span>
          </div>

          {/* Agreement body */}
          {editMode ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.03em" }}>Agreement Text</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <div onClick={() => setEditReq(!editReq)} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${editReq ? C.pri : C.border}`, background: editReq ? C.pri : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", cursor: "pointer", flexShrink: 0, color: "#fff" }}>{editReq && <I.Check />}</div>
                  <span style={{ fontSize: 12, color: C.textSec }}>Required for all clients</span>
                </label>
              </div>
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} placeholder="Paste or type the full agreement text here..." rows={20} style={{ width: "100%", padding: "16px 18px", border: `1.5px solid ${C.border}`, borderRadius: 12, fontSize: 13, fontFamily: "'Outfit', -apple-system, sans-serif", color: C.text, background: C.surface, outline: "none", resize: "vertical", minHeight: 300, lineHeight: 1.7, boxSizing: "border-box", whiteSpace: "pre-wrap" }} onFocus={e => e.target.style.borderColor = C.pri} onBlur={e => e.target.style.borderColor = C.border} />
            </div>
          ) : (
            <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.borderLight}`, padding: "24px 28px", maxHeight: 600, overflow: "auto" }}>
              {(viewAgr.body || "").trim() ? (
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "'Outfit', -apple-system, sans-serif" }}>{viewAgr.body}</div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: 14, color: C.textMut, marginBottom: 12 }}>No agreement text yet</div>
                  <Btn size="sm" onClick={() => startEditView(viewAgr)} icon={<I.Edit />}>Add Agreement Text</Btn>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Confirm delete modal */}
        {confirmDelete && (
          <Modal title="Delete Agreement" onClose={() => setConfirmDelete(null)}>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, margin: "0 0 8px" }}>Are you sure you want to delete <strong>{viewAgr.name}</strong>?</p>
            <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5, margin: "0 0 20px" }}>This will remove the agreement and clear all client signature records for it. This cannot be undone.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleRemove(confirmDelete)} icon={<I.Trash />}>Delete Agreement</Btn>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── List View ──
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text }}>Agreements & Forms</h1>
        <Btn onClick={() => setShowAdd(true)} icon={<I.Plus />}>Add Agreement</Btn>
      </div>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec }}>Create and manage customer agreements. Each agreement shows as a status icon on client records and the dashboard. Eventually these will be textable for e-signatures.</p>

      {data.agreements.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 48 }}>
          <div style={{ display: "inline-flex", width: 56, height: 56, borderRadius: 16, background: C.priLt, alignItems: "center", justifyContent: "center", color: C.pri, marginBottom: 16 }}><I.FileText /></div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>No agreements configured</div>
          <div style={{ fontSize: 14, color: C.textSec, marginBottom: 16 }}>Add agreements that customers need to sign</div>
          <Btn onClick={() => setShowAdd(true)} icon={<I.Plus />}>Add Agreement</Btn>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.agreements.map(agr => {
            const stats = getStats(agr.id);
            const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            const preview = (agr.body || "").trim();
            const previewTrunc = preview.length > 120 ? preview.slice(0, 120).replace(/\s+\S*$/, "") + "…" : preview;
            const wordCount = preview.split(/\s+/).filter(Boolean).length;
            return (
              <Card key={agr.id} style={{ padding: "18px 24px", cursor: "pointer" }} hoverable onClick={() => setViewId(agr.id)}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri, flexShrink: 0, marginTop: 2 }}><I.FileText /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{agr.name}</span>
                      {agr.required ? <Badge color="danger" size="sm">Required</Badge> : <Badge color="default" size="sm">Optional</Badge>}
                    </div>
                    {previewTrunc ? (
                      <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5, marginBottom: 6 }}>{previewTrunc}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: C.dan, fontStyle: "italic", marginBottom: 6 }}>No agreement text — click to add content</div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, maxWidth: 160, height: 6, borderRadius: 3, background: C.surfaceHover, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: pct === 100 ? C.suc : C.acc, transition: "width 0.3s" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: pct === 100 ? C.suc : C.textSec }}>{stats.completed}/{stats.total} signed</span>
                      {wordCount > 0 && <span style={{ fontSize: 11, color: C.textMut }}>{wordCount} words</span>}
                      {agr.updatedAt && <span style={{ fontSize: 11, color: C.textMut }}>Updated {fmtDate(agr.updatedAt)}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", color: C.textMut, flexShrink: 0, marginTop: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Clients missing agreements */}
      {data.agreements.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: C.text }}>Clients with Incomplete Agreements</h3>
          {(() => {
            const incomplete = data.clients.filter(c => data.agreements.some(a => a.required && !agrSigned(c, a.id)));
            if (incomplete.length === 0) return <Card style={{ textAlign: "center", padding: 24 }}><div style={{ color: C.suc, fontWeight: 600, fontSize: 14 }}>All clients have completed required agreements</div></Card>;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {incomplete.slice(0, 20).map(c => (
                  <Card key={c.id} style={{ padding: "12px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: C.danLt, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: C.dan }}>{(c.fields.first_name||"?")[0]}{(c.fields.last_name||"?")[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{c.fields.first_name} {c.fields.last_name}</div>
                        <AgreementIcons client={c} agreements={data.agreements} />
                      </div>
                    </div>
                  </Card>
                ))}
                {incomplete.length > 20 && <div style={{ fontSize: 13, color: C.textMut, textAlign: "center", padding: 8 }}>+ {incomplete.length - 20} more clients</div>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Add Agreement Modal */}
      {showAdd && (
        <Modal title="New Agreement" onClose={() => { setShowAdd(false); setNewName(""); setNewBody(""); setNewReq(true); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Inp label="Agreement Name" value={newName} onChange={setNewName} placeholder="e.g. Boarding & Daycare Agreement" required autoFocus />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Agreement Text</div>
              <textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="Paste or type the full agreement text here...&#10;&#10;You can include sections, numbered clauses, signature lines — anything you need customers to agree to." rows={14} style={{ width: "100%", padding: "14px 16px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontFamily: "'Outfit', -apple-system, sans-serif", color: C.text, background: C.surface, outline: "none", resize: "vertical", minHeight: 200, lineHeight: 1.7, boxSizing: "border-box", whiteSpace: "pre-wrap" }} onFocus={e => e.target.style.borderColor = C.pri} onBlur={e => e.target.style.borderColor = C.border} />
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>Tip: You can always edit this later. Paste an existing agreement or start from scratch.</div>
            </div>
            <Inp type="checkbox" label="Required for all clients" value={newReq} onChange={setNewReq} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <Btn variant="secondary" onClick={() => { setShowAdd(false); setNewName(""); setNewBody(""); setNewReq(true); }}>Cancel</Btn>
            <Btn onClick={handleAdd} icon={<I.Plus />}>Create Agreement</Btn>
          </div>
        </Modal>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (() => {
        const delAgr = data.agreements.find(a => a.id === confirmDelete);
        return (
          <Modal title="Delete Agreement" onClose={() => setConfirmDelete(null)}>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, margin: "0 0 8px" }}>Are you sure you want to delete <strong>{delAgr?.name}</strong>?</p>
            <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5, margin: "0 0 20px" }}>This will remove the agreement and clear all client signature records for it. This cannot be undone.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleRemove(confirmDelete)} icon={<I.Trash />}>Delete Agreement</Btn>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

export { AgreementsPage };
