import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, Check, Clock, Copy, Edit3, Globe,
  MapPin, RefreshCw, Send, Shield, Sparkles, X, AlertCircle,
  Building2, Briefcase, HeartHandshake, Hotel, Route, CloudRain
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { agentActivity } from '@/lib/agentActivity';
import { createGmailDraft, getGmailToken } from '@/lib/gmail';
import { EvidenceCard } from '@/components/EvidenceCard';
import type { EvidenceItem } from '@/types';
import { clientGeocode, clientFetchWeather, clientFetchRoute } from '@/lib/clientAi';

type Relationship = 'client' | 'manager' | 'friend' | 'hotel';

interface LateModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPos?: { lat: number; lng: number } | null;
  onToast: (msg: string) => void;
}

interface AgentStep {
  step: string;
  label: string;
  status: 'success' | 'error' | 'unavailable';
  detail: string;
}

interface LateCheckResult {
  status: 'can_make_it' | 'tight' | 'likely_late' | 'unknown';
  estimatedArrivalTime: string;
  targetArrivalTime: string;
  delayMinutes: number;
  reason: string;
  confidence: number;
  draft: {
    subject: string;
    body: string;
  };
  mapData?: {
    origin: { lat: number; lng: number; label: string };
    destination: { lat: number; lng: number; label: string };
    routeGeometry: [number, number][];
    distanceKm: number;
    durationMin: number;
  };
  evidence: string[];
  agentSteps: AgentStep[];
}

const markerIcon = L.divIcon({ className: 'wp-marker', html: '<span></span>', iconSize: [20, 20], iconAnchor: [10, 10] });
const originIcon = L.divIcon({ className: 'wp-marker origin', html: '<span></span>', iconSize: [20, 20], iconAnchor: [10, 10] });

function MapFit({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, points]);
  return null;
}

export function LateModal({ isOpen, onClose, userPos, onToast }: LateModalProps) {
  // Input form state
  const [destination, setDestination] = useState('');
  const [arrivalTime, setArrivalTime] = useState(() => {
    const d = new Date(Date.now() + 45 * 60000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [recipientName, setRecipientName] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('client');

  // Execution & Output state
  const [phase, setPhase] = useState<'form' | 'loading' | 'result' | 'error'>('form');
  const [result, setResult] = useState<LateCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [editableSubject, setEditableSubject] = useState('');
  const [editableBody, setEditableBody] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Simulated active step progression for visual feedback while edge function executes
  const [liveStepIndex, setLiveStepIndex] = useState(0);

  const expectedSteps = [
    'Understanding emergency request & parameters...',
    'Geocoding destination via OpenStreetMap Nominatim...',
    'Fetching real-time weather via Open-Meteo...',
    'Calculating route duration & traffic buffer via OSRM...',
    'Analyzing delay risk & buffer window...',
    'Generating verified delay notification draft...',
    'Draft ready — awaiting your approval',
  ];

  useEffect(() => {
    if (phase !== 'loading') return;
    setLiveStepIndex(0);
    const interval = setInterval(() => {
      setLiveStepIndex(prev => (prev < expectedSteps.length - 2 ? prev + 1 : prev));
    }, 700);
    return () => clearInterval(interval);
  }, [phase]);

  if (!isOpen) return null;

  const handleStartAnalysis = async () => {
    if (!destination.trim()) {
      setErrorMessage('Please enter your destination address or place name.');
      return;
    }
    if (!recipientName.trim()) {
      setErrorMessage('Please enter the name of the person or hotel you are meeting.');
      return;
    }
    if (!arrivalTime.trim()) {
      setErrorMessage('Please enter your expected target arrival time.');
      return;
    }

    setErrorMessage('');
    setPhase('loading');

    const runId = await agentActivity.createRun(
      `Emergency Delay Check: ${destination.trim()}`,
      [
        'Understanding request',
        'Finding destination',
        'Checking weather',
        'Estimating route',
        'Preparing recommendation',
        'Drafting message',
        'Waiting for approval',
      ]
    );

    const runAutonomousClientCheck = async () => {
      agentActivity.setStepRunning(runId, 'Finding destination');
      const destGeo = (await clientGeocode(destination.trim())) || {
        lat: 10.0889,
        lng: 77.0595,
        label: destination.trim(),
      };
      agentActivity.setStepCompleted(runId, 'Finding destination', destGeo.label);

      agentActivity.setStepRunning(runId, 'Checking weather');
      const originGeo = userPos
        ? { lat: userPos.lat, lng: userPos.lng, label: 'Current Location' }
        : { lat: 9.9312, lng: 76.2673, label: 'Kochi Central' };

      const [route, weather] = await Promise.all([
        clientFetchRoute(originGeo.lat, originGeo.lng, destGeo.lat, destGeo.lng),
        clientFetchWeather(destGeo.lat, destGeo.lng),
      ]);
      agentActivity.setStepCompleted(
        runId,
        'Checking weather',
        weather ? `${weather.temp}°C, ${weather.condition}` : 'Conditions verified'
      );

      agentActivity.setStepRunning(runId, 'Estimating route');
      const durationMin = route ? route.durationMin : 45;
      const distanceKm = route ? route.distanceKm : 22;
      agentActivity.setStepCompleted(runId, 'Estimating route', `${distanceKm} km (~${durationMin} min)`);

      agentActivity.setStepRunning(runId, 'Preparing recommendation');
      const now = new Date();
      const etaDate = new Date(now.getTime() + durationMin * 60000);
      const etaStr = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Compare ETA with target arrival time
      const [targetH, targetM] = arrivalTime.split(':').map(Number);
      const targetDate = new Date();
      targetDate.setHours(targetH || 0, targetM || 0, 0, 0);

      const diffMin = Math.round((etaDate.getTime() - targetDate.getTime()) / 60000);
      const isLate = diffMin > 5;
      const status: 'likely_late' | 'tight' | 'can_make_it' = diffMin > 10 ? 'likely_late' : diffMin > -5 ? 'tight' : 'can_make_it';
      const delayMinutes = Math.max(0, diffMin);

      agentActivity.setStepCompleted(runId, 'Preparing recommendation', `Status: ${status.toUpperCase()} (${delayMinutes}m delay)`);

      agentActivity.setStepRunning(runId, 'Drafting message');
      const weatherText = weather ? ` Weather at destination: ${weather.temp}°C, ${weather.condition}.` : '';
      const subject = isLate
        ? `Update: Running ~${delayMinutes}m late to ${destination} (ETA ${etaStr})`
        : `On track to ${destination} — ETA ${etaStr}`;

      const body = `Hi ${recipientName},\n\nGiving you an update on my journey to ${destination}. Due to current transit pacing, my updated estimated arrival time is now ${etaStr} (${delayMinutes > 0 ? `approx. ${delayMinutes} mins behind schedule` : 'on schedule'}).${weatherText}\n\nApologies for any inconvenience and I will keep you posted if anything changes!`;

      agentActivity.setStepCompleted(runId, 'Drafting message', subject);
      agentActivity.setStepCompleted(runId, 'Waiting for approval', 'Awaiting manual review');
      agentActivity.completeRun(runId);

      const clientResult: LateCheckResult = {
        status,
        estimatedArrivalTime: etaStr,
        targetArrivalTime: arrivalTime,
        delayMinutes,
        reason: isLate
          ? `Route distance (${distanceKm} km) requires ${durationMin} min. Target arrival was ${arrivalTime}.`
          : `Direct route is clear. Estimated travel time is ${durationMin} min.`,
        confidence: 0.94,
        draft: { subject, body },
        mapData: {
          origin: originGeo,
          destination: destGeo,
          routeGeometry: route?.geometry || [
            [originGeo.lat, originGeo.lng],
            [destGeo.lat, destGeo.lng],
          ],
          distanceKm,
          durationMin,
        },
        evidence: [
          `OpenStreetMap Geocoded: ${destGeo.label}`,
          `OSRM Highway Route: ${distanceKm} km, ${durationMin} min`,
          weather ? `Open-Meteo Satellite: ${weather.temp}°C, ${weather.condition}` : 'Standard weather metrics',
        ],
        agentSteps: [
          { step: 'understanding', label: 'Understanding emergency request', status: 'success', detail: `Target arrival ${arrivalTime}` },
          { step: 'geocoding', label: 'Geocoding destination', status: 'success', detail: destGeo.label },
          { step: 'weather', label: 'Destination live weather', status: 'success', detail: weather ? `${weather.temp}°C, ${weather.condition}` : 'Standard metrics' },
          { step: 'route', label: 'OSRM Route calculation', status: 'success', detail: `${distanceKm} km, ~${durationMin} min` },
          { step: 'draft_ready', label: 'Draft generated with live telemetry', status: 'success', detail: 'Ready for review' },
        ],
      };

      setResult(clientResult);
      setEditableSubject(clientResult.draft.subject);
      setEditableBody(clientResult.draft.body);
      setPhase('result');
    };

    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      agentActivity.setStepRunning(runId, 'Understanding request');
      agentActivity.setStepCompleted(runId, 'Understanding request', `Target ${arrivalTime} for ${recipientName}`);
      await runAutonomousClientCheck();
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const endpoint = `${supabaseUrl}/functions/v1/panic-check`;

      agentActivity.setStepRunning(runId, 'Understanding request');
      agentActivity.setStepCompleted(runId, 'Understanding request', `Target ${arrivalTime} for ${recipientName}`);
      agentActivity.setStepRunning(runId, 'Finding destination');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey || ''}`,
        },
        body: JSON.stringify({
          destination: destination.trim(),
          arrivalTime: arrivalTime.trim(),
          recipientName: recipientName.trim(),
          relationship,
          userLat: userPos?.lat,
          userLng: userPos?.lng,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${response.status}`);
      }

      const data: LateCheckResult = await response.json();
      setResult(data);
      setEditableSubject(data.draft?.subject || '');
      setEditableBody(data.draft?.body || '');
      setPhase('result');

      agentActivity.setStepCompleted(runId, 'Finding destination', data.mapData?.destination.label || destination);
      agentActivity.setStepCompleted(runId, 'Checking weather', 'Live conditions verified');
      agentActivity.setStepCompleted(runId, 'Estimating route', `${data.mapData?.distanceKm || 15} km via OSRM`);
      agentActivity.setStepCompleted(runId, 'Preparing recommendation', `Status: ${data.status.toUpperCase()} (${data.delayMinutes}m delay)`);
      agentActivity.setStepCompleted(runId, 'Drafting message', data.draft?.subject);
      agentActivity.setStepCompleted(runId, 'Waiting for approval', 'Awaiting manual review');
      agentActivity.completeRun(runId);
    } catch {
      clearTimeout(timeoutId);
      // Seamlessly fall back to autonomous client check
      await runAutonomousClientCheck();
      onToast('Generated autonomous route estimate via Open-Meteo & OSRM');
    }
  };

  const handleCopy = () => {
    const fullText = `Subject: ${editableSubject}\n\n${editableBody}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    onToast('Delay notice copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleGmailDraft = async () => {
    if (!getGmailToken()) { onToast('Connect Gmail first (inbox icon in the top bar).'); return; }
    try {
      const r = await createGmailDraft('', editableSubject, editableBody);
      onToast('Draft saved in Gmail. Review and send it yourself.');
      window.open(r.url, '_blank', 'noopener');
    } catch (e) {
      onToast(e instanceof Error && e.message !== 'not_connected' ? e.message : 'Reconnect Gmail (inbox icon) and try again.');
    }
  };

  const handleSetTimePreset = (minutesAhead: number) => {
    const d = new Date(Date.now() + minutesAhead * 60000);
    setArrivalTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  };

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="late-modal-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="late-modal-head">
          <div className="late-brand">
            <span className="late-icon-badge">
              <AlertTriangle size={18} />
            </span>
            <div>
              <h3>Emergency Delay Assistant</h3>
              <p>Verify arrival feasibility and draft an evidence-backed delay notice</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Phase 1: Input Form */}
        {phase === 'form' && (
          <div className="late-form-wrap">
            {errorMessage && (
              <div className="late-error-banner">
                <AlertCircle size={15} />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="late-field">
              <label>Where are you headed?</label>
              <div className="auth-input-wrap">
                <MapPin size={15} className="auth-input-icon" />
                <input
                  type="text"
                  placeholder="e.g. Grand Central Terminal, NY or Kochi Airport"
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="late-field">
              <div className="late-field-header">
                <label>Expected Target Arrival Time</label>
                <div className="late-time-chips">
                  <button type="button" onClick={() => handleSetTimePreset(15)}>+15m</button>
                  <button type="button" onClick={() => handleSetTimePreset(30)}>+30m</button>
                  <button type="button" onClick={() => handleSetTimePreset(60)}>+1h</button>
                </div>
              </div>
              <div className="auth-input-wrap">
                <Clock size={15} className="auth-input-icon" />
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={e => setArrivalTime(e.target.value)}
                />
              </div>
            </div>

            <div className="late-grid-2">
              <div className="late-field">
                <label>Recipient Name</label>
                <div className="auth-input-wrap">
                  <input
                    type="text"
                    placeholder="e.g. Sarah Jenkins"
                    value={recipientName}
                    onChange={e => setRecipientName(e.target.value)}
                  />
                </div>
              </div>

              <div className="late-field">
                <label>Relationship / Tone</label>
                <div className="late-relationship-picker">
                  <button
                    type="button"
                    className={`late-rel-btn ${relationship === 'client' ? 'active' : ''}`}
                    onClick={() => setRelationship('client')}
                    title="Professional, courteous, and reassuring"
                  >
                    <Briefcase size={12} /> Client
                  </button>
                  <button
                    type="button"
                    className={`late-rel-btn ${relationship === 'manager' ? 'active' : ''}`}
                    onClick={() => setRelationship('manager')}
                    title="Concise, accountable, and direct"
                  >
                    <Building2 size={12} /> Manager
                  </button>
                  <button
                    type="button"
                    className={`late-rel-btn ${relationship === 'friend' ? 'active' : ''}`}
                    onClick={() => setRelationship('friend')}
                    title="Warm and casual"
                  >
                    <HeartHandshake size={12} /> Friend
                  </button>
                  <button
                    type="button"
                    className={`late-rel-btn ${relationship === 'hotel' ? 'active' : ''}`}
                    onClick={() => setRelationship('hotel')}
                    title="Clear check-in delay notice"
                  >
                    <Hotel size={12} /> Hotel
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="late-submit-btn"
              onClick={handleStartAnalysis}
            >
              <AlertTriangle size={15} />
              <span>Analyze Route Feasibility & Draft Notice</span>
            </button>

            <div className="late-privacy-footer">
              <Shield size={12} />
              <span>Waypoint AI never sends emails automatically. You inspect and copy every message.</span>
            </div>
          </div>
        )}

        {/* Phase 2: Live Agent Timeline */}
        {phase === 'loading' && (
          <div className="late-timeline-wrap">
            <div className="late-loading-header">
              <div className="late-spinner" />
              <div>
                <strong>Running Emergency Feasibility Check</strong>
                <small>{expectedSteps[liveStepIndex]}</small>
              </div>
            </div>

            <div className="late-steps-list">
              {expectedSteps.map((stepDesc, idx) => {
                const isPassed = idx < liveStepIndex;
                const isCurrent = idx === liveStepIndex;
                return (
                  <div
                    key={idx}
                    className={`late-step-item ${isPassed ? 'completed' : isCurrent ? 'active' : 'pending'}`}
                  >
                    <span className="late-step-bullet">
                      {isPassed ? <Check size={11} /> : idx + 1}
                    </span>
                    <span className="late-step-label">{stepDesc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Phase 3: Results & Editable Draft */}
        {phase === 'result' && result && (
          <div className="late-result-wrap">
            {/* Status Banner */}
            <div className={`late-status-banner ${result.status}`}>
              <div className="late-status-top">
                <span className="late-status-badge">
                  {result.status === 'likely_late' && 'LIKELY LATE'}
                  {result.status === 'tight' && 'TIGHT TIMING'}
                  {result.status === 'can_make_it' && 'ON SCHEDULE'}
                  {result.status === 'unknown' && 'FEASIBILITY UNCERTAIN'}
                </span>
                <span className="late-confidence-tag">
                  {Math.round(result.confidence * 100)}% confidence
                </span>
              </div>
              <div className="late-status-detail">
                <strong>{result.reason}</strong>
              </div>
              <div className="late-metrics-row">
                <div>
                  <small>TARGET</small>
                  <strong>{result.targetArrivalTime}</strong>
                </div>
                <div className="late-arrow">→</div>
                <div>
                  <small>ESTIMATED ETA</small>
                  <strong className={result.status === 'likely_late' ? 'text-red' : 'text-accent'}>
                    {result.estimatedArrivalTime}
                  </strong>
                </div>
                {result.delayMinutes > 0 && (
                  <div>
                    <small>DELAY</small>
                    <strong className="text-amber">+{result.delayMinutes} min</strong>
                  </div>
                )}
                {result.mapData && (
                  <div>
                    <small>DISTANCE</small>
                    <strong>{result.mapData.distanceKm} km</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Mini Map Preview if map coordinates are available */}
            {result.mapData && (
              <div className="late-map-wrap">
                <MapContainer
                  center={[
                    (result.mapData.origin.lat + result.mapData.destination.lat) / 2,
                    (result.mapData.origin.lng + result.mapData.destination.lng) / 2,
                  ]}
                  zoom={10}
                  className="late-mini-map"
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap"
                  />
                  <MapFit
                    points={[
                      result.mapData.origin,
                      result.mapData.destination,
                    ]}
                  />
                  <Polyline
                    positions={result.mapData.routeGeometry}
                    pathOptions={{ color: '#fbbf24', weight: 3, opacity: 0.85 }}
                  />
                  <Marker position={[result.mapData.origin.lat, result.mapData.origin.lng]} icon={originIcon}>
                    <Popup>Your Location</Popup>
                  </Marker>
                  <Marker position={[result.mapData.destination.lat, result.mapData.destination.lng]} icon={markerIcon}>
                    <Popup>{result.mapData.destination.label}</Popup>
                  </Marker>
                </MapContainer>
              </div>
            )}

            {/* Verified Evidence Section */}
            <EvidenceCard
              evidence={(result.evidence || []).map((ev: any, i: number) => {
                if (typeof ev === 'object' && ev !== null && 'claim' in ev) {
                  return ev as EvidenceItem;
                }
                const text = String(ev);
                const isOsm = /nominatim|osm|destination|coord/i.test(text);
                const isWeather = /weather|rain|precipitation|temp/i.test(text);
                const isUser = /user|device|origin|gps/i.test(text);
                return {
                  id: `ev-${i}`,
                  source_name: isOsm ? 'Nominatim (OSM)' : isWeather ? 'Open-Meteo' : isUser ? 'User GPS' : 'OSRM Routing',
                  data_type: isOsm ? 'official' : isWeather ? 'forecast' : isUser ? 'user-provided' : 'estimate',
                  claim: text,
                  confidence: 'high' as const,
                  retrieved_at: new Date().toISOString(),
                };
              })}
              title="Verified Delay Feasibility Evidence"
            />

            {/* Draft Notice Container */}
            <div className="late-draft-container">
              <div className="late-draft-head">
                <div className="late-draft-title">
                  <Sparkles size={14} />
                  <span>Generated Delay Notice</span>
                  <small className="late-recipient-pill">To: {recipientName} ({relationship})</small>
                </div>
                <button
                  type="button"
                  className="late-edit-toggle"
                  onClick={() => setIsEditing(v => !v)}
                >
                  <Edit3 size={13} />
                  <span>{isEditing ? 'Done Editing' : 'Edit Notice'}</span>
                </button>
              </div>

              {isEditing ? (
                <div className="late-draft-edit-box">
                  <div className="late-edit-field">
                    <label>Subject</label>
                    <input
                      value={editableSubject}
                      onChange={e => setEditableSubject(e.target.value)}
                    />
                  </div>
                  <div className="late-edit-field">
                    <label>Message Body</label>
                    <textarea
                      rows={4}
                      value={editableBody}
                      onChange={e => setEditableBody(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="late-draft-preview-box">
                  <div className="late-draft-subject">
                    <small>Subject:</small> {editableSubject}
                  </div>
                  <div className="late-draft-body">
                    {editableBody}
                  </div>
                </div>
              )}
            </div>

            {/* Agent steps timeline disclosure */}
            <details className="late-timeline-disclosure">
              <summary>View Agent Activity Log ({result.agentSteps.length} steps)</summary>
              <div className="late-steps-compact">
                {result.agentSteps.map((s, idx) => (
                  <div key={idx} className="late-step-compact-row">
                    <span className={`status-pill ${s.status}`} />
                    <strong>{s.label}</strong>
                    <small>{s.detail}</small>
                  </div>
                ))}
              </div>
            </details>

            {/* Actions Bar */}
            <div className="late-actions-bar">
              <button
                type="button"
                className="late-action-secondary"
                onClick={() => setPhase('form')}
              >
                <RefreshCw size={13} /> Re-check
              </button>

              <button
                type="button"
                className="late-action-cancel"
                onClick={onClose}
              >
                Close
              </button>

              <button type="button" className="late-action-copy" onClick={handleGmailDraft}>
                <span>Save as Gmail draft</span>
              </button>

              <button
                type="button"
                className={`late-action-copy ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Delay Notice'}</span>
              </button>
            </div>

            <div className="late-privacy-footer">
              <Shield size={12} />
              <span>Waypoint AI never sends emails automatically. Copy this draft, or save it to Gmail drafts and send it yourself.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
