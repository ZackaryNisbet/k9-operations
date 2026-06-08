import React, { useMemo } from "react";
import { I } from "../../../shared/icons";
import {
  DEFAULT_ENRICHMENT_NOTES,
  ENRICHMENT_AUDIENCES,
  ENRICHMENT_FOCUS_LABELS,
  formatEventDate,
  getMonthLabel,
} from "../../enrichments/enrichmentData";
import { GRAPHIC_AUDIENCES } from "./constants";
import { getLinkedProducts, getProductHref } from "./productLinks";
import { formatFileSize } from "./formatters";

export function MarketingHandoff({ monthDate, events, audience, setAudience, graphics, graphicUrls, loading, uploading, canManage, onUpload, onCopyBrief, onDownloadCsv }) {
  const linkedProducts = useMemo(() => getLinkedProducts(events), [events]);
  return (
    <div className="handoff-grid">
      <div className="handoff-controls">
        <div className="section-title">Marketing Handoff</div>
        <h2>{getMonthLabel(monthDate)}</h2>
        <p>Use K9 Operations for event entry, SOP/product prep, and final graphic storage. Marketing can build the polished K9 Resorts graphic separately, then upload the employee and customer versions here.</p>
        <div className="audience-options">
          {ENRICHMENT_AUDIENCES.map((item) => (
            <button key={item.id} type="button" className={audience === item.id ? "audience active" : "audience"} onClick={() => setAudience(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="primary-btn wide" onClick={onCopyBrief}><I.Clipboard /> Copy Event Brief</button>
        <button type="button" className="secondary-btn wide" onClick={onDownloadCsv}><I.Download /> Download CSV</button>
        <div className="notes-box">
          {DEFAULT_ENRICHMENT_NOTES.map((note) => <p key={note}>{note}</p>)}
        </div>
        <div className="product-link-panel">
          <div className="section-title">Product Links</div>
          {linkedProducts.length ? (
            linkedProducts.slice(0, 8).map((product, index) => (
              <a key={`${product.name}_${index}`} href={getProductHref(product)} target="_blank" rel="noreferrer">
                <I.Link />
                <span>{product.name}</span>
              </a>
            ))
          ) : (
            <p>Add product links in Create / Edit.</p>
          )}
        </div>
      </div>
      <div className="handoff-main">
        <div className="graphic-upload-grid">
          {GRAPHIC_AUDIENCES.map((item) => (
            <GraphicUploadCard
              key={item.id}
              audience={item}
              graphic={graphics[item.id]}
              signedUrl={graphicUrls[item.id]}
              loading={loading}
              uploading={uploading === item.id}
              canManage={canManage}
              onUpload={onUpload}
            />
          ))}
        </div>
        <div className="handoff-event-list">
          <div className="section-title">Events for Marketing</div>
          {events.length ? events.map((event) => (
            <article key={event.id} className="handoff-event">
              <div>
                <strong>{formatEventDate(event.event_date)} - {event.title}</strong>
                <p>{event.summary || event.sop_details || "No summary added."}</p>
              </div>
              <div className="handoff-event-meta">
                <span>{event.customer_visible ? "Customer" : "Staff only"}</span>
                <span>{ENRICHMENT_FOCUS_LABELS[event.focus_area] || event.focus_area}</span>
              </div>
            </article>
          )) : (
            <div className="empty-state compact">
              <I.Calendar />
              <h2>No events this month</h2>
              <p>Add events in Create / Edit, then hand the list to marketing.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GraphicUploadCard({ audience, graphic, signedUrl, loading, uploading, canManage, onUpload }) {
  const isImage = (graphic?.content_type || "").startsWith("image/");
  return (
    <section className="graphic-upload-card">
      <div className="graphic-upload-head">
        <div>
          <div className="section-title">{audience.label}</div>
          <p>{audience.description}</p>
        </div>
        {graphic ? <span className="graphic-status">Uploaded</span> : <span className="graphic-status missing">Missing</span>}
      </div>
      {signedUrl ? (
        <div className="graphic-viewer">
          {isImage ? (
            <img src={signedUrl} alt={`${audience.label} preview`} />
          ) : (
            <a href={signedUrl} target="_blank" rel="noreferrer"><I.FileText /> View uploaded file</a>
          )}
        </div>
      ) : (
        <div className="graphic-empty">
          <I.FileText />
          <p>{loading ? "Checking uploaded graphics..." : "No uploaded graphic for this month yet."}</p>
        </div>
      )}
      {graphic ? (
        <div className="graphic-file-meta">
          <span>{graphic.file_name}</span>
          <span>{formatFileSize(graphic.file_size_bytes)}</span>
        </div>
      ) : null}
      {canManage ? (
        <label className="secondary-btn wide upload-btn">
          <I.Download /> {uploading ? "Uploading..." : graphic ? "Replace Graphic" : "Upload Graphic"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              event.target.value = "";
              Promise.resolve(onUpload(audience.id, file)).catch((uploadError) => {
                console.error("Enrichment graphic upload action failed:", uploadError);
              });
            }}
          />
        </label>
      ) : null}
    </section>
  );
}
