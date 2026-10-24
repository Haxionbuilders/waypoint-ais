import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, Camera, Check, Filter, MapPin, Plus,
  RefreshCw, Shield, Sparkles, Tag, X, ChevronRight, Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ReportItem {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  location_name: string;
  created_at: string;
  safety_notes?: string | null;
  source?: string | null;
  ai_confidence?: number | null;
}

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPhotoReport: () => void;
  onToast: (msg: string) => void;
}

export function ReportsModal({
  isOpen,
  onClose,
  onOpenPhotoReport,
  onToast,
}: ReportsModalProps) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    if (!isOpen) return;
    void loadReports();
  }, [isOpen]);

  const loadReports = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (data) {
        setReports(data as ReportItem[]);
      }
    } catch (err) {
      console.warn('Could not load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const categories = ['all', 'pothole', 'flooding', 'accident', 'debris', 'construction'];

  const filtered = reports.filter(r => {
    if (filterCategory === 'all') return true;
    return r.category?.toLowerCase() === filterCategory.toLowerCase();
  });

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="reports-panel-wrap" onClick={e => e.stopPropagation()}>
        {/* Head */}
        <div className="reports-panel-head">
          <div className="reports-head-title">
            <span className="reports-icon-badge">
              <AlertTriangle size={18} />
            </span>
            <div>
              <h2>Community Road Reports</h2>
              <p>Live hazard tracking, community incident reports, and AI vision submissions</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Action Header Banner */}
        <div className="reports-action-banner">
          <div className="reports-banner-copy">
            <strong>See a hazard on the road?</strong>
            <span>Snap a photo and our neural vision model will auto-classify the hazard.</span>
          </div>
          <button
            type="button"
            className="btn-launch-photo-report"
            onClick={() => {
              onClose();
              onOpenPhotoReport();
            }}
          >
            <Camera size={15} />
            <span>Submit Photo Report</span>
            <Sparkles size={13} className="sparkle-accent" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="reports-filters-bar">
          <div className="reports-filter-chips">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                className={filterCategory === cat ? 'active' : ''}
                onClick={() => setFilterCategory(cat)}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="reports-refresh-btn"
            onClick={loadReports}
            title="Refresh reports"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Reports Content List */}
        <div className="reports-panel-body">
          {loading ? (
            <div className="panel-loading-wrap">
              <div className="panel-spinner" />
              <span>Syncing community road reports...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <AlertTriangle size={36} />
              <p>No reports found in this category</p>
              <small>Be the first to report an incident or hazard to keep other travelers safe.</small>
              <button
                type="button"
                className="btn-launch-photo-report"
                style={{ marginTop: '16px' }}
                onClick={() => {
                  onClose();
                  onOpenPhotoReport();
                }}
              >
                <Camera size={14} />
                <span>Submit Photo Report</span>
              </button>
            </div>
          ) : (
            filtered.map(r => (
              <div key={r.id} className="report-item-card">
                <div className="report-card-top">
                  <div className="report-title-group">
                    <span className={`report-sev-dot ${r.severity?.toLowerCase() || 'medium'}`} />
                    <strong>{r.title}</strong>
                    {r.source === 'ai_vision' && (
                      <span className="ai-verified-tag">
                        <Sparkles size={10} /> VISION AI
                      </span>
                    )}
                  </div>
                  <em className={`report-sev-tag ${r.severity?.toLowerCase() || 'medium'}`}>
                    {r.severity}
                  </em>
                </div>

                {r.description && (
                  <p className="report-card-desc">{r.description}</p>
                )}

                {r.safety_notes && (
                  <div className="report-card-safety-note">
                    <Shield size={12} />
                    <span>{r.safety_notes}</span>
                  </div>
                )}

                <div className="report-card-meta">
                  <span>
                    <MapPin size={11} /> {r.location_name || 'Unspecified location'}
                  </span>
                  <span>
                    <Tag size={11} /> {r.category?.toUpperCase()}
                  </span>
                  <small>
                    {new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </small>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
