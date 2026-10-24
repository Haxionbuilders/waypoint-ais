import React, { useState } from 'react';
import { Database, Clock, HelpCircle } from 'lucide-react';

export type EvidenceSourceType = 'official' | 'forecast' | 'estimate' | 'user-provided' | 'simulated' | 'unavailable';
export type EvidenceConfidence = 'low' | 'medium' | 'high';

export interface EvidenceItem {
  id: string;
  source_name: string;
  data_type: EvidenceSourceType;
  claim: string;
  confidence: EvidenceConfidence;
  raw_reference?: string | null;
  retrieved_at: string;
  expires_at?: string | null;
}

interface EvidenceCardProps {
  evidence: EvidenceItem[];
  title?: string;
}

type FilterMode = 'all' | 'verified_only' | 'includes_estimates';

export function EvidenceCard({ evidence = [], title = 'Verified Evidence Sources' }: EvidenceCardProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  const filtered = evidence.filter((item) => {
    if (filter === 'verified_only') return item.data_type === 'official' || item.data_type === 'user-provided';
    if (filter === 'includes_estimates') return item.data_type === 'estimate' || item.data_type === 'forecast';
    return true;
  });

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  };

  const typeClass = (type: string) => {
    const map: Record<string, string> = {
      official: 'type-badge official', forecast: 'type-badge forecast',
      estimate: 'type-badge estimate', 'user-provided': 'type-badge user-provided',
      simulated: 'type-badge simulated',
    };
    return map[type] || 'type-badge unavailable';
  };

  return (
    <div className="card evidence-card-container">
      <div className="card-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={15} style={{ color: 'var(--accent)' }} />
          <span>{title}</span>
          <span className="confidence-pill" style={{ marginLeft: '6px' }}>{evidence.length} Cited</span>
        </div>
        <div className="evidence-filter-chips">
          {(['all', 'verified_only', 'includes_estimates'] as FilterMode[]).map(f => (
            <button key={f} type="button" className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? `All (${evidence.length})` : f === 'verified_only' ? 'Verified only' : 'Estimates / Forecasts'}
            </button>
          ))}
        </div>
      </div>
      <div className="evidence-card-body">
        {filtered.length === 0 ? (
          <div className="evidence-empty-box"><HelpCircle size={20} /><span>No verified source available matching current filter.</span></div>
        ) : filtered.map((ev) => (
          <div key={ev.id} className="evidence-item-row">
            <div className="evidence-item-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong className="evidence-source-name">{ev.source_name}</strong>
                <span className={typeClass(ev.data_type)}>{ev.data_type.toUpperCase()}</span>
              </div>
              <span className={`evidence-conf-pill ${ev.confidence}`}>{ev.confidence.toUpperCase()} CONFIDENCE</span>
            </div>
            <p className="evidence-claim-text">{ev.claim}</p>
            <div className="evidence-item-bottom">
              <div className="evidence-time-meta">
                <Clock size={11} /><span>Retrieved: {formatTime(ev.retrieved_at)}</span>
                {ev.expires_at && <span style={{ color: 'var(--muted)' }}> · Valid until: {formatTime(ev.expires_at)}</span>}
              </div>
              {ev.raw_reference && <span className="evidence-raw-ref" title={ev.raw_reference}>Ref: {ev.raw_reference}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
