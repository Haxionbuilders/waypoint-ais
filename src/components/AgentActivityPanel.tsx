import React, { useEffect, useState } from 'react';
import {
  Activity, Check, ChevronDown, ChevronRight, Clock,
  Play, RefreshCw, RotateCcw, Sparkles, Trash2, X, AlertCircle
} from 'lucide-react';
import { agentActivity, type AgentRunItem, type AgentStepItem } from '@/lib/agentActivity';

interface AgentActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onRetryStep?: (runId: string, stepName: string) => void;
}

export function AgentActivityPanel({ isOpen, onClose, onRetryStep }: AgentActivityPanelProps) {
  const [runs, setRuns] = useState<AgentRunItem[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  useEffect(() => {
    const unsub = agentActivity.subscribe(updatedRuns => {
      setRuns(updatedRuns);
      if (updatedRuns.length > 0 && !expandedRunId) {
        setExpandedRunId(updatedRuns[0].id);
      }
    });
    return unsub;
  }, [expandedRunId]);

  if (!isOpen) return null;

  const filteredRuns = runs.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getDuration = (startIso: string, endIso?: string | null) => {
    if (!endIso) return 'Running...';
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="activity-panel-wrap" onClick={e => e.stopPropagation()}>
        <div className="activity-panel-head">
          <div className="activity-head-title">
            <span className="activity-icon-glow"><Activity size={18} /></span>
            <div>
              <h2>Agent Activity & Timeline</h2>
              <p>Transparent step-by-step verification of AI tool calls & reasoning</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose} aria-label="Close activity panel">
            <X size={18} />
          </button>
        </div>

        {/* Filters & Actions */}
        <div className="activity-filters-bar">
          <div className="activity-chips">
            <button
              type="button"
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All ({runs.length})
            </button>
            <button
              type="button"
              className={filter === 'running' ? 'active' : ''}
              onClick={() => setFilter('running')}
            >
              Running ({runs.filter(r => r.status === 'running').length})
            </button>
            <button
              type="button"
              className={filter === 'completed' ? 'active' : ''}
              onClick={() => setFilter('completed')}
            >
              Completed ({runs.filter(r => r.status === 'completed').length})
            </button>
            <button
              type="button"
              className={filter === 'failed' ? 'active' : ''}
              onClick={() => setFilter('failed')}
            >
              Failed ({runs.filter(r => r.status === 'failed').length})
            </button>
          </div>

          {runs.length > 0 && (
            <button
              type="button"
              className="activity-clear-btn"
              onClick={() => agentActivity.clearLocal()}
              title="Clear activity log"
            >
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>

        {/* Content list */}
        <div className="activity-panel-body">
          {filteredRuns.length === 0 ? (
            <div className="empty-state">
              <Activity size={32} />
              <p>No agent runs recorded yet</p>
              <small>Tasks from trip recovery, delay checks, or journey investigation will appear here in real time.</small>
            </div>
          ) : (
            filteredRuns.map(run => {
              const isExpanded = expandedRunId === run.id;
              return (
                <div key={run.id} className={`activity-run-card ${run.status}`}>
                  <div
                    className="activity-run-header"
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                  >
                    <div className="activity-run-meta">
                      <span className={`run-status-pill ${run.status}`}>
                        {run.status === 'running' && <span className="mini-spinner" />}
                        {run.status.toUpperCase()}
                      </span>
                      <strong>{run.goal}</strong>
                    </div>

                    <div className="activity-run-time-meta">
                      <small><Clock size={11} /> {formatTime(run.started_at)} ({getDuration(run.started_at, run.finished_at)})</small>
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </div>
                  </div>

                  {run.error && (
                    <div className="run-error-msg">
                      <AlertCircle size={13} />
                      <span>{run.error}</span>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="activity-steps-timeline">
                      <div className="steps-subhead">
                        <span>Agent Execution Steps ({run.steps.length})</span>
                        <small>{run.provider.toUpperCase()} · {run.model}</small>
                      </div>

                      <div className="steps-vertical-flow">
                        {run.steps.map((step, idx) => (
                          <div key={step.id || idx} className={`step-node ${step.status}`}>
                            <div className="step-node-spine">
                              <span className={`step-node-badge ${step.status}`}>
                                {step.status === 'completed' && <Check size={11} />}
                                {step.status === 'running' && <span className="mini-spinner" />}
                                {step.status === 'failed' && <X size={11} />}
                                {step.status === 'skipped' && '—'}
                                {step.status === 'pending' && idx + 1}
                              </span>
                              {idx < run.steps.length - 1 && <span className="step-spine-line" />}
                            </div>

                            <div className="step-node-content">
                              <div className="step-node-title-row">
                                <strong className="step-node-label">{step.name}</strong>
                                <span className={`step-status-tag ${step.status}`}>
                                  {step.status}
                                </span>
                              </div>

                              {step.result && (
                                <div className="step-node-result">
                                  {step.result}
                                </div>
                              )}

                              {step.error && (
                                <div className="step-node-error">
                                  <span>Error: {step.error}</span>
                                  {onRetryStep && (
                                    <button
                                      type="button"
                                      className="step-retry-btn"
                                      onClick={e => {
                                        e.stopPropagation();
                                        onRetryStep(run.id, step.name);
                                      }}
                                    >
                                      <RotateCcw size={11} /> Retry step
                                    </button>
                                  )}
                                </div>
                              )}

                              <div className="step-node-timestamp">
                                <span>{formatTime(step.started_at)}</span>
                                {step.finished_at && (
                                  <span> · Duration: {getDuration(step.started_at, step.finished_at)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
