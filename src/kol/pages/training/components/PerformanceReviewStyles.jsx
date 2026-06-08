// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

export function PerformanceReviewStyles() {
  return (
    <style>{`
      @keyframes performanceReviewPanelEnter {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes performanceReviewStatusPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.16); }
        50% { box-shadow: 0 0 0 5px rgba(217, 119, 6, 0); }
      }
      .performance-review-detail-shell {
        animation: performanceReviewPanelEnter 260ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .performance-review-sync-panel {
        animation: performanceReviewPanelEnter 300ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .performance-review-sync-dot {
        animation: performanceReviewStatusPulse 2.4s ease-in-out infinite;
      }
      .performance-review-surface {
        transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease, border-color 180ms ease;
      }
      .performance-review-surface:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
      }
      .performance-review-rating-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .performance-review-rating-option {
        min-height: 42px;
        border-radius: 8px;
        border: 1.5px solid #E2E8F0;
        background: #FFFFFF;
        color: #1E293B;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.2;
        padding: 9px 10px;
        text-align: center;
        transition: transform 150ms ease, border-color 150ms ease, background 150ms ease, color 150ms ease;
      }
      .performance-review-rating-option:hover {
        transform: translateY(-1px);
        border-color: rgba(20, 83, 45, 0.4);
      }
      .performance-review-rating-option.is-selected {
        background: #F7FEE7;
        border-color: #14532D;
        color: #14532D;
        box-shadow: inset 0 0 0 1px rgba(20, 83, 45, 0.08);
      }
      .performance-review-item-shell {
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        padding: 16px;
        background: #FFFFFF;
        transition: border-color 160ms ease, box-shadow 160ms ease;
      }
      .performance-review-item-shell.is-dirty {
        border-color: rgba(217, 119, 6, 0.34);
        box-shadow: 0 10px 24px rgba(217, 119, 6, 0.06);
      }
      .performance-review-queue-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 14px;
      }
      .performance-review-queue-stat {
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        background: #FFFFFF;
        padding: 12px 14px;
      }
      @media (max-width: 960px) {
        .performance-review-detail-grid {
          grid-template-columns: 1fr !important;
        }
        .performance-review-sync-panel {
          grid-template-columns: 1fr !important;
        }
        .performance-review-side-panel {
          position: static !important;
        }
        .performance-review-queue-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 620px) {
        .performance-review-rating-grid,
        .performance-review-queue-grid {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}
