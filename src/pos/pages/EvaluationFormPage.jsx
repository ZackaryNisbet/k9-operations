import { Badge, Btn, Card } from "../components/ui";
import { C, TAG_COLORS } from "../constants/colors";
import { CLASSIFICATION_TAG_IDS, DEF_DOG_TAGS } from "../constants/forms";
import { DogAvatar, buildAuditEntry } from "../components/widgets";
import { EVAL_SCORE_PTS, calcEvalSectionPts, getEvalMaxScore, getEvalResult, getEvalTotalScore, getEvalVisibleQuestions, getEvalVisibleSections, scoreEvalAge } from "../lib/evaluation";
import { I } from "../icons";
import { calcAge } from "../lib/dogHelpers";
import { fmtDate, gid, todayStr } from "../lib/format";
import { useEffect, useState } from "react";

function EvaluationFormPage({ data, save, reservationId, nav, profile }) {
  const reservation = (data.reservations || []).find(r => r.id === reservationId);
  const dog = reservation ? (data.dogs || []).find(d => d.id === reservation.dogId) : null;
  const client = reservation ? (data.clients || []).find(c => c.id === reservation.clientId) : null;
  const existingEval = (data.evaluations || []).find(e => e.reservationId === reservationId && e.locked);

  const [evalType, setEvalType] = useState("daycare");
  const [answers, setAnswers] = useState({});
  const [hasExperience, setHasExperience] = useState(null);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedClassTag, setSelectedClassTag] = useState(null); // "tag_lp" | "tag_sp" | "tag_pp"

  // Compute scores
  const visibleSections = getEvalVisibleSections(evalType);
  const visibleQuestions = getEvalVisibleQuestions(evalType);
  const maxScore = getEvalMaxScore(evalType);
  const totalScore = getEvalTotalScore(answers, evalType);
  const answeredCount = visibleQuestions.filter(q => answers[q.id]).length;
  const allAnswered = answeredCount === visibleQuestions.length;
  const result = allAnswered ? getEvalResult(totalScore, evalType, answers) : null;

  // Auto-score age when toggle changes
  useEffect(() => {
    if (hasExperience !== null && dog?.fields?.dob) {
      const ageResult = scoreEvalAge(dog.fields.dob, hasExperience);
      if (ageResult) setAnswers(prev => ({ ...prev, age: ageResult }));
    }
  }, [hasExperience, dog?.fields?.dob]);

  const handleAnswer = (qid, val) => {
    setAnswers(prev => ({ ...prev, [qid]: val }));
    setErrors(prev => ({ ...prev, [qid]: undefined }));
  };

  // Auto-recommend classification tag based on eval result
  const dogWeight = parseFloat(dog?.fields?.weight) || 0;
  const recommendedTag = result === "red" ? "tag_pp" : result === "green" ? (dogWeight > 0 ? (dogWeight >= 35 ? "tag_lp" : "tag_sp") : null) : null;
  useEffect(() => {
    if (recommendedTag && !selectedClassTag) setSelectedClassTag(recommendedTag);
  }, [recommendedTag]);

  const handleSubmit = async () => {
    const errs = {};
    visibleQuestions.forEach(q => { if (!answers[q.id]) errs[q.id] = "Required"; });
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    const subtotals = {};
    visibleSections.forEach(s => { subtotals[s.id] = calcEvalSectionPts(answers, s.questions); });
    const finalResult = getEvalResult(totalScore, evalType, answers);
    const evalObj = {
      id: "eval_" + gid(), dogId: dog.id, clientId: client?.id || "", reservationId,
      date: todayStr(), evaluatorName: profile?.full_name || "",
      evalType, hasExperience: !!hasExperience, answers: { ...answers },
      subtotals, totalScore, maxScore, result: finalResult,
      notes, locked: true, createdAt: new Date().toISOString(),
    };
    const evalResult = finalResult === "green" ? "passed_group" : "pending";
    // Remove tag_eval, add classification tag, remove other classification tags
    let newDogTags = [...data.dogTags];
    if (selectedClassTag && !newDogTags.find(t => t.id === selectedClassTag)) {
      const def = DEF_DOG_TAGS.find(t => t.id === selectedClassTag);
      if (def) newDogTags.push({ ...def });
    }
    const updatedDogs = data.dogs.map(d => {
      if (d.id !== dog.id) return d;
      let tags = (d.tags || []).filter(t => t !== "tag_eval" && !CLASSIFICATION_TAG_IDS.includes(t));
      if (selectedClassTag) tags = [...tags, selectedClassTag];
      return { ...d, tags };
    });
    const evalAudit = buildAuditEntry(reservationId, "Evaluation Completed", [{field:"Result",oldVal:"Pending",newVal:finalResult==="green"?"Passed Group":finalResult==="yellow"?"Passed Private":"Needs Work"},{field:"Score",oldVal:"",newVal:`${totalScore}/${maxScore}`},{field:"Evaluator",oldVal:"",newVal:profile?.full_name||"Staff"}], profile);
    const newData = {
      ...data,
      dogs: updatedDogs,
      dogTags: newDogTags,
      evaluations: [...(data.evaluations || []), evalObj],
      reservations: data.reservations.map(r => {
        if (r.id !== reservationId) return r;
        const upd = { ...r, evalResult, ...(r.needsEval ? { needsEval: false } : {}) };
        // If eval assigns Private Play mid-stay, stamp surcharge start date
        if (selectedClassTag === "tag_pp" && r.status === "checked-in" && r.type === "boarding") {
          upd.privatePlayStartDate = todayStr();
        }
        return upd;
      }),
      auditLog: [...(data.auditLog || []), evalAudit],
    };
    // ── Auto-feed to Conversion from Eval ──
    if (client) {
      const cRes = data.reservations.filter(r => r.clientId === client.id);
      const totalSpent = cRes.reduce((s, r) => s + ((r.pricing && r.pricing.total) || 0), 0);
      const hasUpcoming = cRes.some(r => r.checkIn >= todayStr() && r.status === "upcoming" && r.id !== reservationId);
      if (totalSpent === 0 && !hasUpcoming) {
        const addD = (base, n) => { const d = new Date((base || todayStr()) + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
        newData.clients = (newData.clients || data.clients).map(c => {
          if (c.id !== client.id) return c;
          const lc = c.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
          return {
            ...c,
            lifecycle: { ...lc, conversion: { ...lc.conversion, followUpDate: addD(todayStr(), 1), source: "eval", sourceDate: todayStr(), sourceReservationId: reservationId } },
            lifecycleEvents: [...(c.lifecycleEvents || []), { event: "auto_fed_from_eval", date: todayStr(), details: "Auto-fed to Conversion from Evaluation", reservationId }],
          };
        });
      }
    }
    await save(newData);
    setSubmitting(false);
    nav("dashboard");
  };

  if (!reservation || !dog) return <div style={{ padding: 40, textAlign: "center", color: C.textMut }}>Reservation or dog not found.</div>;

  // Read-only view for completed eval
  if (existingEval) {
    const ev = existingEval;
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <button onClick={() => nav("dashboard")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px 0", marginBottom: 16, fontFamily: "inherit" }}>
          <I.Back size={16}/> Dashboard
        </button>
        <Card style={{ padding: "24px 28px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <DogAvatar dog={dog} size={56}/>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>{dog.fields.name} — Evaluation</h2>
              <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>{dog.fields.breed}{dog.fields.dob ? ` · ${calcAge(dog.fields.dob)}` : ""} · {client?.fields?.first_name} {client?.fields?.last_name}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 12, background: ev.result === "green" ? C.sucLt : C.danLt, border: `1.5px solid ${ev.result === "green" ? C.suc : C.dan}30` }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: ev.result === "green" ? C.suc : C.dan, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}>
              {ev.result === "green" ? "\u2713" : "\u2717"}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: ev.result === "green" ? C.suc : C.dan }}>
                {ev.result === "green" ? "Green Dog — Approved" : "Red Dog — Not Approved"}
              </div>
              <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>
                Score: {ev.totalScore}/{ev.maxScore} · {ev.evalType === "dayboarding" ? "Day Boarding" : "Daycare"} · {fmtDate(ev.date)} · {ev.evaluatorName}
              </div>
            </div>
          </div>
        </Card>
        {/* Read-only sections */}
        {getEvalVisibleSections(ev.evalType).map((sec, si) => (
          <Card key={sec.id} style={{ padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{si + 1}. {sec.name}</h3>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>{ev.subtotals[sec.id] || 0}/{sec.maxScore} pts</span>
            </div>
            {sec.questions.map(q => {
              const ans = ev.answers[q.id];
              const color = ans === "green" ? C.suc : ans === "yellow" ? C.warn : ans === "red" ? C.dan : C.textMut;
              const bg = ans === "green" ? C.sucLt : ans === "yellow" ? C.warnLt : ans === "red" ? C.danLt : C.bg;
              const opt = (q.options || []).find(o => o.value === ans);
              return (
                <div key={q.id} style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 8, background: bg, border: `1.5px solid ${color}30` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{q.label}</div>
                      <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{opt ? opt.label : ans || "—"}</div>
                    </div>
                    <Badge color={ans === "green" ? "success" : ans === "yellow" ? "warning" : "danger"} size="sm">{EVAL_SCORE_PTS[ans] || 0} pts</Badge>
                  </div>
                </div>
              );
            })}
          </Card>
        ))}
        {ev.notes && <Card style={{ padding: "16px 20px", marginBottom: 16 }}><div style={{ fontSize: 12, fontWeight: 700, color: C.textMut, marginBottom: 6 }}>NOTES</div><div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{ev.notes}</div></Card>}
        <div style={{ textAlign: "right", marginTop: 12 }}>
          <Btn variant="secondary" onClick={() => nav("dashboard")}>Back to Dashboard</Btn>
        </div>
      </div>
    );
  }

  // Active form
  const ageDisplay = dog.fields.dob ? calcAge(dog.fields.dob) : "Unknown";
  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <button onClick={() => nav("dashboard")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px 0", marginBottom: 16, fontFamily: "inherit" }}>
        <I.Back size={16}/> Dashboard
      </button>

      {/* Header card */}
      <Card style={{ padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <DogAvatar dog={dog} size={56}/>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>{dog.fields.name} — Evaluation</h2>
            <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>{dog.fields.breed}{dog.fields.dob ? ` · ${ageDisplay}` : ""} · {client?.fields?.first_name} {client?.fields?.last_name}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMut }}>PROGRESS</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{answeredCount}/{visibleQuestions.length}</div>
          </div>
        </div>
        {/* Eval type toggle */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: "0.05em", marginBottom: 8 }}>EVALUATION TYPE</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[{ v: "daycare", l: "Full Daycare Evaluation" }, { v: "dayboarding", l: "Day Boarding Evaluation" }].map(opt => (
              <button key={opt.v} onClick={() => setEvalType(opt.v)} style={{
                flex: 1, padding: "10px 14px", borderRadius: 10, fontFamily: "inherit",
                border: `2px solid ${evalType === opt.v ? C.pri : C.border}`,
                background: evalType === opt.v ? C.priLt : "transparent",
                color: evalType === opt.v ? C.pri : C.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}>{opt.l}</button>
            ))}
          </div>
        </div>
      </Card>

      {/* Sections */}
      {visibleSections.map((sec, si) => {
        const secPts = calcEvalSectionPts(answers, sec.questions);
        return (
          <Card key={sec.id} style={{ padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{si + 1}. {sec.name}</h3>
              <span style={{ fontSize: 14, fontWeight: 800, color: secPts > 0 ? C.pri : C.textMut }}>{secPts}/{sec.maxScore} pts</span>
            </div>

            {sec.questions.map(q => (
              <div key={q.id} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{q.label}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 10 }}>{q.background}</div>

                {/* Age toggle question */}
                {q.type === "age-toggle" && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textMut, marginBottom: 8 }}>Has prior off-leash play experience?</div>
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                      {[{ v: true, l: "Yes \u2014 Has Experience" }, { v: false, l: "No \u2014 No Experience" }].map(opt => (
                        <button key={String(opt.v)} onClick={() => setHasExperience(opt.v)} style={{
                          flex: 1, padding: "10px 14px", borderRadius: 10, fontFamily: "inherit",
                          border: `2px solid ${hasExperience === opt.v ? C.pri : C.border}`,
                          background: hasExperience === opt.v ? C.priLt : "transparent",
                          color: hasExperience === opt.v ? C.pri : C.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}>{opt.l}</button>
                      ))}
                    </div>
                    {/* DOB exists: auto-score and display */}
                    {hasExperience !== null && dog?.fields?.dob && (
                      <div style={{ padding: "10px 14px", borderRadius: 10, background: answers.age === "green" ? C.sucLt : answers.age === "yellow" ? C.warnLt : answers.age === "red" ? C.danLt : C.bg, border: `1.5px solid ${answers.age === "green" ? C.suc : answers.age === "yellow" ? C.warn : answers.age === "red" ? C.dan : C.border}30` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: answers.age === "green" ? C.suc : answers.age === "yellow" ? C.warn : C.dan }}>
                          Auto-scored: {(answers.age || "").toUpperCase()} ({EVAL_SCORE_PTS[answers.age] || 0} pts)
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                          Dog age: {ageDisplay} · {hasExperience ? "Has" : "No"} prior off-leash experience
                        </div>
                      </div>
                    )}
                    {/* No DOB: manual selection with age-range labels */}
                    {hasExperience !== null && !dog?.fields?.dob && (
                      <div>
                        <div style={{ padding: "8px 12px", borderRadius: 8, background: C.warnLt, border: `1px solid ${C.warn}30`, marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.warn }}>No date of birth on file &mdash; select age score manually</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[{ value: "green", label: hasExperience ? "6 months \u2013 3 years" : "Under 5 months", description: hasExperience ? "Young dog with off-leash experience" : "Very young puppy, no experience needed yet" },
                            { value: "yellow", label: hasExperience ? "3 \u2013 7 years" : "6 months \u2013 3 years", description: hasExperience ? "Middle-aged with experience" : "Young dog, no prior off-leash experience" },
                            { value: "red", label: hasExperience ? "8+ years" : "Over 3 years", description: hasExperience ? "Senior dog" : "Adult dog with no off-leash experience" },
                          ].map(opt => {
                            const sel = answers.age === opt.value;
                            const oc = opt.value === "green" ? C.suc : opt.value === "yellow" ? C.warn : C.dan;
                            const ob = opt.value === "green" ? C.sucLt : opt.value === "yellow" ? C.warnLt : C.danLt;
                            return (
                              <button key={opt.value} onClick={() => handleAnswer("age", opt.value)} style={{
                                padding: "12px 16px", borderRadius: 10, fontFamily: "inherit", textAlign: "left",
                                border: `2px solid ${sel ? oc : C.border}`, background: sel ? ob : "transparent",
                                cursor: "pointer", transition: "all 0.15s",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: oc, flexShrink: 0 }}/>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: sel ? oc : C.text }}>{opt.label}</div>
                                  {sel && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: oc }}>{EVAL_SCORE_PTS[opt.value]} pts</span>}
                                </div>
                                <div style={{ fontSize: 12, color: C.textSec, marginTop: 4, marginLeft: 18 }}>{opt.description}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {errors.age && <div style={{ color: C.dan, fontSize: 12, marginTop: 6, fontWeight: 600 }}>{errors.age}</div>}
                  </div>
                )}

                {/* Binary (handling) questions */}
                {q.type === "binary" && (
                  <div>
                    <div style={{ display: "flex", gap: 10 }}>
                      {q.options.map(opt => {
                        const sel = answers[q.id] === opt.value;
                        const oc = opt.value === "green" ? C.suc : C.dan;
                        const ob = opt.value === "green" ? C.sucLt : C.danLt;
                        return (
                          <button key={opt.value} onClick={() => handleAnswer(q.id, opt.value)} style={{
                            flex: 1, padding: "14px 16px", borderRadius: 10, fontFamily: "inherit", textAlign: "left",
                            border: `2px solid ${sel ? oc : C.border}`, background: sel ? ob : "transparent",
                            cursor: "pointer", transition: "all 0.15s",
                          }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: sel ? oc : C.text }}>{opt.label}</div>
                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{opt.description}</div>
                          </button>
                        );
                      })}
                    </div>
                    {errors[q.id] && <div style={{ color: C.dan, fontSize: 12, marginTop: 6, fontWeight: 600 }}>{errors[q.id]}</div>}
                  </div>
                )}

                {/* Standard radio (green/yellow/red) */}
                {q.type === "radio" && (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {q.options.map(opt => {
                        const sel = answers[q.id] === opt.value;
                        const oc = opt.value === "green" ? C.suc : opt.value === "yellow" ? C.warn : C.dan;
                        const ob = opt.value === "green" ? C.sucLt : opt.value === "yellow" ? C.warnLt : C.danLt;
                        return (
                          <button key={opt.value} onClick={() => handleAnswer(q.id, opt.value)} style={{
                            padding: "12px 16px", borderRadius: 10, fontFamily: "inherit", textAlign: "left",
                            border: `2px solid ${sel ? oc : C.border}`, background: sel ? ob : "transparent",
                            cursor: "pointer", transition: "all 0.15s",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 10, height: 10, borderRadius: "50%", background: oc, flexShrink: 0 }}/>
                              <div style={{ fontSize: 13, fontWeight: 700, color: sel ? oc : C.text }}>{opt.label}</div>
                              {sel && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: oc }}>{EVAL_SCORE_PTS[opt.value]} pts</span>}
                            </div>
                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 4, marginLeft: 18 }}>{opt.description}</div>
                          </button>
                        );
                      })}
                    </div>
                    {errors[q.id] && <div style={{ color: C.dan, fontSize: 12, marginTop: 6, fontWeight: 600 }}>{errors[q.id]}</div>}
                  </div>
                )}
              </div>
            ))}

            {/* Day boarding stop banner */}
            {sec.stopForDayboarding && evalType === "dayboarding" && (
              <div style={{ padding: "14px 18px", borderRadius: 10, background: C.warnLt, border: `1.5px solid ${C.warn}30`, marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.warn }}>Day Boarding Evaluation Complete</div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>If all handling questions are answered YES, the dog is approved for day boarding.</div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Score summary */}
      <Card style={{ padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: "0.05em", marginBottom: 6 }}>TOTAL SCORE</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.text }}>{totalScore} <span style={{ fontSize: 18, fontWeight: 600, color: C.textMut }}>/ {maxScore}</span></div>
            {allAnswered && (
              <div style={{ fontSize: 15, fontWeight: 700, color: result === "green" ? C.suc : C.dan, marginTop: 8 }}>
                {result === "green" ? `Green Dog \u2014 Approved for ${evalType === "dayboarding" ? "Day Boarding" : "Daycare"}` : "Red Dog \u2014 Not Approved"}
              </div>
            )}
          </div>
          {allAnswered && (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: result === "green" ? C.sucLt : C.danLt, border: `3px solid ${result === "green" ? C.suc : C.dan}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: result === "green" ? C.suc : C.dan }}>{result === "green" ? "\u2713" : "\u2717"}</span>
            </div>
          )}
        </div>
        {/* Progress bar */}
        <div style={{ marginTop: 16, height: 6, borderRadius: 3, background: C.border }}>
          <div style={{ height: 6, borderRadius: 3, background: allAnswered ? (result === "green" ? C.suc : C.dan) : C.pri, width: `${maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0}%`, transition: "width 0.3s" }}/>
        </div>
        {/* Notes */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: "0.05em", marginBottom: 6 }}>NOTES (OPTIONAL)</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional observations..." rows={3} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", background: C.bg }} onFocus={e => e.target.style.borderColor = C.pri} onBlur={e => e.target.style.borderColor = C.border}/>
        </div>
      </Card>

      {/* Tag Classification */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: "0.05em", marginBottom: 14, textTransform: "uppercase" }}>Update Dog Tag</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {/* Current Tag */}
          <div style={{ textAlign: "center" }}>
            {(() => { const evalTag = data.dogTags.find(t => t.id === "tag_eval"); const tc = evalTag ? TAG_COLORS[evalTag.colorIdx % TAG_COLORS.length] : TAG_COLORS[2]; return (
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 32, height: 32, borderRadius: 6, fontSize: 13, fontWeight: 800, background: tc.text, color: "#fff", padding: "0 8px" }}>EV</span>
            ); })()}
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, marginTop: 4 }}>Current</div>
          </div>
          {/* Arrow */}
          <span style={{ fontSize: 22, color: C.textMut, fontWeight: 700 }}>&rarr;</span>
          {/* Classification options */}
          {[
            { id: "tag_sp", name: "Small Playgroup", short: "S", colorIdx: 0 },
            { id: "tag_lp", name: "Large Playgroup", short: "L", colorIdx: 1 },
            { id: "tag_pp", name: "Private Play", short: "PP", colorIdx: 3 },
          ].map(opt => {
            const tc = TAG_COLORS[opt.colorIdx % TAG_COLORS.length];
            const isSel = selectedClassTag === opt.id;
            const isRec = recommendedTag === opt.id;
            const passed = result === "green";
            const isDimmed = passed && dogWeight === 0 && opt.id === "tag_pp";
            return (
              <button key={opt.id} onClick={() => setSelectedClassTag(opt.id)} style={{
                position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                background: isSel ? tc.bg : C.bg,
                border: `2.5px solid ${isSel ? tc.text : C.border}`,
                opacity: isDimmed ? 0.5 : 1,
                transition: "all 0.15s",
              }}>
                {isRec && (
                  <div style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", background: passed ? C.suc : C.warn, color: "#fff", fontSize: 8, fontWeight: 800, padding: "1px 6px", borderRadius: 8, whiteSpace: "nowrap", letterSpacing: "0.05em", textTransform: "uppercase" }}>Recommended</div>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, height: 28, borderRadius: 5, fontSize: 12, fontWeight: 800, background: tc.text, color: "#fff", padding: "0 5px" }}>{opt.short}</span>
                <div style={{ fontSize: 10, fontWeight: 700, color: isSel ? tc.text : C.textSec, whiteSpace: "nowrap" }}>{opt.name}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginBottom: 40 }}>
        <Btn variant="secondary" onClick={() => nav("dashboard")}>Cancel</Btn>
        <Btn onClick={handleSubmit} disabled={submitting || !allAnswered}>
          {submitting ? "Saving..." : selectedClassTag ? "Submit and Update Tags" : "Submit Evaluation"}
        </Btn>
      </div>
    </div>
  );
}

export { EvaluationFormPage };
