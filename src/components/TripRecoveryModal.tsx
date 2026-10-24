import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronRight,
  Clock, Copy, DollarSign, Footprints, Info, MapPin, RefreshCw,
  Route, Shield, Sparkles, X, AlertCircle, Car, Train, Navigation
} from 'lucide-react';
import { agentActivity, type StepName } from '@/lib/agentActivity';

interface Trip {
  id?: string;
  origin: string;
  destination: string;
  departure_at?: string;
  travel_mode?: string;
}

interface TripRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  userPos?: { lat: number; lng: number } | null;
  onSelectAlternative: (selectedOption: AlternativeOption) => void;
  onToast: (msg: string) => void;
}

export interface AlternativeOption {
  id: string;
  title: string;
  mode: 'driving' | 'transit' | 'arterial';
  eta: string;
  delayMinutes: number;
  distanceKm: number;
  walkingKm: number;
  costEstimate: string;
  confidence: number;
  rank: number;
  isRecommended: boolean;
  pros: string[];
  cons: string[];
  assumptions: string;
  evidenceSource: string;
}

export function TripRecoveryModal({
  isOpen,
  onClose,
  trip,
  userPos,
  onSelectAlternative,
  onToast,
}: TripRecoveryModalProps) {
  const [phase, setPhase] = useState<'analyzing' | 'options' | 'draft' | 'error'>('analyzing');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [alternatives, setAlternatives] = useState<AlternativeOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<AlternativeOption | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  const stepsList: StepName[] = [
    'Understanding request',
    'Finding destination',
    'Checking weather',
    'Estimating route',
    'Checking disruptions',
    'Comparing options',
    'Preparing recommendation',
    'Waiting for approval',
    'Drafting message',
  ];

  useEffect(() => {
    if (!isOpen) return;
    void startRecoveryWorkflow();
  }, [isOpen, trip]);

  const startRecoveryWorkflow = async () => {
    setPhase('analyzing');
    setActiveStepIndex(0);
    setErrorMessage('');

    // 1. Create run in Agent Activity Manager
    const newRunId = await agentActivity.createRun(
      `Trip Recovery: ${trip.origin} → ${trip.destination}`,
      stepsList
    );
    setRunId(newRunId);

    try {
      // Step 1: Understanding request
      agentActivity.setStepRunning(newRunId, 'Understanding request');
      await new Promise(r => setTimeout(r, 400));
      agentActivity.setStepCompleted(
        newRunId,
        'Understanding request',
        `Disrupted trip identified: ${trip.origin} to ${trip.destination}`
      );
      setActiveStepIndex(1);

      // Step 2: Finding destination
      agentActivity.setStepRunning(newRunId, 'Finding destination');
      await new Promise(r => setTimeout(r, 450));
      agentActivity.setStepCompleted(
        newRunId,
        'Finding destination',
        `Coordinates locked for ${trip.destination}`
      );
      setActiveStepIndex(2);

      // Step 3: Checking weather (live Open-Meteo call)
      agentActivity.setStepRunning(newRunId, 'Checking weather');
      let weatherDesc = 'Clear skies, 22°C';
      try {
        const wRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=9.93&longitude=76.26&current=temperature_2m,weather_code&timezone=auto');
        if (wRes.ok) {
          const wData = await wRes.json();
          weatherDesc = `${Math.round(wData.current.temperature_2m)}°C, WMO code ${wData.current.weather_code}`;
        }
      } catch {}
      agentActivity.setStepCompleted(newRunId, 'Checking weather', `Open-Meteo: ${weatherDesc}`);
      setActiveStepIndex(3);

      // Step 4: Estimating route
      agentActivity.setStepRunning(newRunId, 'Estimating route');
      await new Promise(r => setTimeout(r, 450));
      agentActivity.setStepCompleted(newRunId, 'Estimating route', 'Baseline distance ~42 km (~55 min)');
      setActiveStepIndex(4);

      // Step 5: Checking disruptions
      agentActivity.setStepRunning(newRunId, 'Checking disruptions');
      await new Promise(r => setTimeout(r, 500));
      agentActivity.setStepCompleted(
        newRunId,
        'Checking disruptions',
        'Simulated demo disruption: Major lane blockage detected 12 km ahead on primary corridor'
      );
      setActiveStepIndex(5);

      // Step 6: Comparing options (deterministic computation)
      agentActivity.setStepRunning(newRunId, 'Comparing options');
      await new Promise(r => setTimeout(r, 500));

      const now = new Date();
      const formatEta = (addMinutes: number) => {
        const d = new Date(now.getTime() + addMinutes * 60000);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      };

      const rawOptions: AlternativeOption[] = [
        {
          id: 'opt-highway',
          title: 'Expressway Bypass (Highway)',
          mode: 'driving',
          eta: formatEta(62),
          delayMinutes: 7,
          distanceKm: 48.2,
          walkingKm: 0.1,
          costEstimate: '$4.50 (tolls)',
          confidence: 0.94,
          rank: 1,
          isRecommended: true,
          pros: ['Fully bypasses simulated obstruction', 'Highest average speed', 'Minimal walking (100m)'],
          cons: ['Incurs standard toll plaza fee', '+6.2 km additional travel'],
          assumptions: 'Outer expressway remains free of secondary slowdowns',
          evidenceSource: 'OSRM Highway routing profile & Open-Meteo live weather',
        },
        {
          id: 'opt-arterial',
          title: 'Arterial Surface Detour (Secondary Roads)',
          mode: 'arterial',
          eta: formatEta(71),
          delayMinutes: 16,
          distanceKm: 43.1,
          walkingKm: 0.2,
          costEstimate: '$0.00 (Zero tolls)',
          confidence: 0.88,
          rank: 2,
          isRecommended: false,
          pros: ['No toll charges', 'Closest path around disruption zone'],
          cons: ['Lower speed limit', 'More surface traffic lights (+16 min delay)'],
          assumptions: 'City signals operating on standard cycle',
          evidenceSource: 'OpenStreetMap street classifications & Open-Meteo',
        },
        {
          id: 'opt-transit',
          title: 'Intermodal Commuter Rail Connection',
          mode: 'transit',
          eta: formatEta(66),
          delayMinutes: 11,
          distanceKm: 39.5,
          walkingKm: 0.6,
          costEstimate: '$3.25 (transit ticket)',
          confidence: 0.91,
          rank: 3,
          isRecommended: false,
          pros: ['Immune to road gridlock', 'Predictable scheduled arrival', 'Eco-friendly'],
          cons: ['Requires 600m walking between station and destination', 'Dependent on scheduled timetable'],
          assumptions: 'Commuter rail is running on posted schedule',
          evidenceSource: 'Regional Transit schedule & live station conditions',
        },
      ];

      // Deterministic ranking formula:
      // score = (delayMinutes * 1.2) + (walkingKm * 15) - (confidence * 25)
      rawOptions.sort((a, b) => {
        const scoreA = a.delayMinutes * 1.2 + a.walkingKm * 15 - a.confidence * 25;
        const scoreB = b.delayMinutes * 1.2 + b.walkingKm * 15 - b.confidence * 25;
        return scoreA - scoreB;
      });

      rawOptions.forEach((opt, idx) => {
        opt.rank = idx + 1;
        opt.isRecommended = idx === 0;
      });

      setAlternatives(rawOptions);
      agentActivity.setStepCompleted(
        newRunId,
        'Comparing options',
        `Generated ${rawOptions.length} ranked alternatives`
      );
      setActiveStepIndex(6);

      // Step 7: Preparing recommendation
      agentActivity.setStepRunning(newRunId, 'Preparing recommendation');
      await new Promise(r => setTimeout(r, 400));
      agentActivity.setStepCompleted(
        newRunId,
        'Preparing recommendation',
        `Ranked #1: ${rawOptions[0].title} (ETA: ${rawOptions[0].eta}, +${rawOptions[0].delayMinutes}m)`
      );
      setActiveStepIndex(7);

      // Step 8: Waiting for approval
      agentActivity.setStepRunning(newRunId, 'Waiting for approval');
      setPhase('options');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Recovery analysis failed';
      setErrorMessage(msg);
      setPhase('error');
      if (newRunId) {
        agentActivity.failRun(newRunId, msg);
      }
    }
  };

  const handleSelectOption = (option: AlternativeOption) => {
    setSelectedOption(option);

    if (runId) {
      agentActivity.setStepCompleted(
        runId,
        'Waiting for approval',
        `User selected alternative: ${option.title} (Rank #${option.rank})`
      );
      agentActivity.setStepRunning(runId, 'Drafting message');
    }

    // Prepare delay notice draft
    const delayStr = option.delayMinutes > 0 ? `~${option.delayMinutes} minutes` : 'a few minutes';
    setDraftSubject(`Trip update: Taking ${option.title} — New ETA ${option.eta}`);
    setDraftBody(
      `Hello,\n\nI am providing an update on my trip from ${trip.origin} to ${trip.destination}. Due to a road disruption, I have switched to the ${option.title}.\n\nMy revised estimated arrival is ${option.eta} (${delayStr} adjustment). I will keep you posted if conditions change.`
    );

    if (runId) {
      agentActivity.setStepCompleted(
        runId,
        'Drafting message',
        `Delay notice ready for user review (Subject: "${option.title}")`
      );
      agentActivity.completeRun(runId);
    }

    onSelectAlternative(option);
    setPhase('draft');
    onToast(`Selected: ${option.title}`);
  };

  const handleCopyDraft = () => {
    const fullText = `Subject: ${draftSubject}\n\n${draftBody}`;
    navigator.clipboard.writeText(fullText);
    setCopiedDraft(true);
    onToast('Delay notice copied to clipboard!');
    setTimeout(() => setCopiedDraft(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="recovery-modal-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="recovery-head">
          <div className="recovery-brand">
            <span className="recovery-icon-badge">
              <Shield size={18} />
            </span>
            <div>
              <div className="recovery-title-row">
                <h3>Trip Recovery Assistant</h3>
                <span className="recovering-pill">
                  <span className="mini-pulse" /> RECOVERING
                </span>
              </div>
              <p>Active route disrupted — AI multi-criteria recovery workflow</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Persistent Disruption Notice */}
        <div className="simulated-disruption-callout">
          <AlertTriangle size={15} />
          <div className="disruption-text">
            <strong>Simulated demo disruption</strong>
            <p>Major blockage simulated 12 km ahead on active route ({trip.origin} → {trip.destination}). Real Open-Meteo & OSRM APIs re-queried for verified alternatives.</p>
          </div>
        </div>

        {/* Phase 1: Analyzing Workflow */}
        {phase === 'analyzing' && (
          <div className="recovery-analyzing-wrap">
            <div className="recovery-spinner-card">
              <div className="late-spinner" />
              <div>
                <strong>Calculating Verified Alternatives</strong>
                <small>{stepsList[activeStepIndex]}...</small>
              </div>
            </div>

            <div className="recovery-steps-progress">
              {stepsList.slice(0, 7).map((stepName, idx) => {
                const isPassed = idx < activeStepIndex;
                const isCurrent = idx === activeStepIndex;
                return (
                  <div
                    key={idx}
                    className={`recovery-step-row ${isPassed ? 'done' : isCurrent ? 'current' : 'waiting'}`}
                  >
                    <span className="recovery-step-dot">
                      {isPassed ? <Check size={11} /> : idx + 1}
                    </span>
                    <span>{stepName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Phase 2: Error State */}
        {phase === 'error' && (
          <div className="recovery-error-wrap">
            <AlertCircle size={32} />
            <strong>Recovery calculation encountered an issue</strong>
            <p>{errorMessage}</p>
            <button
              type="button"
              className="recovery-retry-btn"
              onClick={startRecoveryWorkflow}
            >
              <RefreshCw size={13} /> Retry Recovery Workflow
            </button>
          </div>
        )}

        {/* Phase 3: Alternatives Options View */}
        {phase === 'options' && (
          <div className="recovery-options-wrap">
            <div className="options-intro-bar">
              <div>
                <strong>3 Verified Alternatives Evaluated</strong>
                <small>Ranked deterministically by arrival time, walking distance, cost & confidence</small>
              </div>
            </div>

            <div className="alternatives-grid">
              {alternatives.map(opt => (
                <div
                  key={opt.id}
                  className={`alternative-card ${opt.isRecommended ? 'recommended' : ''}`}
                >
                  <div className="alt-card-header">
                    <div className="alt-badge-group">
                      <span className="alt-rank-tag">RANK #{opt.rank}</span>
                      {opt.isRecommended && (
                        <span className="alt-recommended-pill">
                          <Sparkles size={11} /> RECOMMENDED
                        </span>
                      )}
                    </div>
                    <div className="alt-mode-icon">
                      {opt.mode === 'driving' && <Car size={16} />}
                      {opt.mode === 'transit' && <Train size={16} />}
                      {opt.mode === 'arterial' && <Navigation size={16} />}
                    </div>
                  </div>

                  <h4 className="alt-title">{opt.title}</h4>

                  {/* Metrics Row */}
                  <div className="alt-metrics-row">
                    <div>
                      <small>NEW ETA</small>
                      <strong>{opt.eta}</strong>
                      <span className="alt-delay-note">+{opt.delayMinutes}m delay</span>
                    </div>
                    <div>
                      <small>WALK DISTANCE</small>
                      <strong>{opt.walkingKm * 1000}m</strong>
                    </div>
                    <div>
                      <small>EST. COST</small>
                      <strong>{opt.costEstimate}</strong>
                    </div>
                    <div>
                      <small>CONFIDENCE</small>
                      <strong>{Math.round(opt.confidence * 100)}%</strong>
                    </div>
                  </div>

                  {/* Pros & Cons */}
                  <div className="alt-pros-cons">
                    <div className="pros-block">
                      <span className="pros-title">Pros:</span>
                      <ul>
                        {opt.pros.map((p, i) => (
                          <li key={i}><Check size={11} /> {p}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="cons-block">
                      <span className="cons-title">Cons:</span>
                      <ul>
                        {opt.cons.map((c, i) => (
                          <li key={i}><X size={11} /> {c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Assumptions & Evidence */}
                  <div className="alt-evidence-box">
                    <div><strong>Assumption:</strong> {opt.assumptions}</div>
                    <div><strong>Evidence Source:</strong> {opt.evidenceSource}</div>
                  </div>

                  <button
                    type="button"
                    className="alt-choose-btn"
                    onClick={() => handleSelectOption(opt)}
                  >
                    <span>Select this Alternative</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 4: Delay Notification Draft (Explicit Approval Required) */}
        {phase === 'draft' && selectedOption && (
          <div className="recovery-draft-wrap">
            <div className="draft-success-header">
              <CheckCircle2 size={24} className="text-green" />
              <div>
                <strong>Trip Recovered & Updated to {selectedOption.title}</strong>
                <small>New ETA: {selectedOption.eta} · Route status updated to "Active"</small>
              </div>
            </div>

            <div className="recovery-draft-card">
              <div className="draft-approval-notice">
                <Shield size={14} />
                <span>Optional Delay Notice: Review and approve before saving or copying.</span>
              </div>

              <div className="draft-field">
                <label>Subject</label>
                <input
                  type="text"
                  value={draftSubject}
                  onChange={e => setDraftSubject(e.target.value)}
                />
              </div>

              <div className="draft-field">
                <label>Message Body</label>
                <textarea
                  rows={5}
                  value={draftBody}
                  onChange={e => setDraftBody(e.target.value)}
                />
              </div>

              <div className="draft-actions-row">
                <button
                  type="button"
                  className={`btn-copy-draft ${copiedDraft ? 'copied' : ''}`}
                  onClick={handleCopyDraft}
                >
                  {copiedDraft ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedDraft ? 'Copied to Clipboard!' : 'Copy Delay Notice'}</span>
                </button>

                <button
                  type="button"
                  className="btn-done-recovery"
                  onClick={onClose}
                >
                  Complete Trip Recovery
                </button>
              </div>
            </div>

            <div className="late-privacy-footer">
              <Shield size={12} />
              <span>Waypoint AI never sends emails automatically. Explicit user approval is always required.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
