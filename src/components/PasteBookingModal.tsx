import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Mail,
  MapPin,
  Check,
  Loader2,
  AlertTriangle,
  Copy,
  Edit3,
  Plus,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Journey {
  id: string;
  origin: string;
  destination: string;
  travel_mode: string;
  departure_at: string;
  created_at: string;
  status?: string;
}

interface ExtractedBooking {
  booking_type: string;
  provider: string;
  confirmation_number: string;
  start_time: string;
  end_time: string;
  location: string;
  address: string;
  deadline: string;
  action_required: string;
  confidence: number;
}

interface GeoResult {
  lat: number;
  lng: number;
  display_name: string;
}

type ModalState = 'idle' | 'extracting' | 'review' | 'geocoding' | 'saved';

interface PasteBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  journeys: Journey[];
  onBookingSaved: () => void;
  onToast: (msg: string) => void;
  initialText?: string;
}

/* ------------------------------------------------------------------ */
/*  Leaflet marker                                                     */
/* ------------------------------------------------------------------ */

const waypointIcon = L.divIcon({
  className: 'wp-marker',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/* ------------------------------------------------------------------ */
/*  Booking‑type options                                               */
/* ------------------------------------------------------------------ */

const BOOKING_TYPES = [
  'flight',
  'hotel',
  'car_rental',
  'train',
  'bus',
  'ferry',
  'activity',
  'restaurant',
  'other',
];

/* ------------------------------------------------------------------ */
/*  Confidence pill colour helper                                      */
/* ------------------------------------------------------------------ */

function confidenceLabel(c: number): string {
  if (c >= 0.8) return 'High';
  if (c >= 0.5) return 'Medium';
  return 'Low';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PasteBookingModal({
  isOpen,
  onClose,
  journeys,
  onBookingSaved,
  onToast,
  initialText,
}: PasteBookingModalProps) {
  /* ---- state ---- */
  const [state, setState] = useState<ModalState>('idle');
  const [rawText, setRawText] = useState(initialText ?? '');
  const [booking, setBooking] = useState<ExtractedBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string>('');
  const [geo, setGeo] = useState<GeoResult | null>(null);

  /* ---- reset when modal opens / closes ---- */
  useEffect(() => {
    if (!isOpen) {
      setState('idle');
      setRawText('');
      setBooking(null);
      setError(null);
      setSelectedJourneyId('');
      setGeo(null);
    }
  }, [isOpen]);

  /* ---- extract booking via Supabase Edge Function ---- */
  const handleExtract = useCallback(async () => {
    if (!rawText.trim()) return;
    setState('extracting');
    setError(null);

    try {
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');
      const res = await fetch(`${supabaseUrl}/functions/v1/extract-booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ text: rawText }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(errBody || `Extraction failed (${res.status})`);
      }

      const data: ExtractedBooking = await res.json();
      setBooking(data);
      setState('review');
    } catch (err: any) {
      setError(
        err instanceof TypeError
          ? 'Could not reach the extract-booking function. Check that it is deployed to your Supabase project.'
          : (err?.message ?? 'Extraction failed')
      );
      setState('idle');
    }
  }, [rawText]);

  /* ---- field change helper ---- */
  const updateField = (field: keyof ExtractedBooking, value: string | number) => {
    setBooking((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  /* ---- geocode address ---- */
  const geocodeAddress = useCallback(async (address: string): Promise<GeoResult | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          address
        )}&limit=1`
      );
      const results = await res.json();
      if (results.length === 0) return null;
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
        display_name: results[0].display_name,
      };
    } catch {
      return null;
    }
  }, []);

  /* ---- confirm & save ---- */
  const handleConfirm = useCallback(
    async (createNew: boolean) => {
      if (!booking) return;

      setState('geocoding');
      setError(null);

      try {
        if (!supabase) throw new Error('Supabase is not configured.');
        /* Geocode */
        const geoResult = await geocodeAddress(booking.address || booking.location);
        setGeo(geoResult);

        /* Determine journey id */
        let journeyId = selectedJourneyId;

        if (createNew) {
          const { data, error: insertErr } = await supabase
            .from('journeys')
            .insert({
              origin: booking.location,
              destination: booking.location,
              travel_mode: 'other',
              departure_at: booking.start_time || new Date().toISOString(),
              status: 'draft',
            })
            .select('id')
            .single();

          if (insertErr) throw insertErr;
          journeyId = data.id;
        }

        if (!journeyId) {
          setError('Please select a trip or create a new one.');
          setState('review');
          return;
        }

        /* Save waypoint */
        const { error: wpErr } = await supabase.from('waypoints').insert({
          journey_id: journeyId,
          label: `${booking.provider} — ${booking.booking_type}`,
          booking_type: booking.booking_type,
          provider: booking.provider,
          confirmation_number: booking.confirmation_number,
          start_time: booking.start_time || null,
          end_time: booking.end_time || null,
          location: booking.location,
          address: booking.address,
          deadline: booking.deadline || null,
          action_required: booking.action_required || null,
          confidence: booking.confidence,
          lat: geoResult?.lat ?? null,
          lng: geoResult?.lng ?? null,
        });

        if (wpErr) throw wpErr;

        setState('saved');
        onToast('Booking saved to trip');
        onBookingSaved();
      } catch (err: any) {
        setError(err.message ?? 'Failed to save booking');
        setState('review');
      }
    },
    [booking, selectedJourneyId, geocodeAddress, onBookingSaved, onToast]
  );

  /* ---- don't render when closed ---- */
  if (!isOpen) return null;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="tickets-panel" onClick={(e) => e.stopPropagation()}>
        {/* ---------- header ---------- */}
        <div className="panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={18} />
            <span>Paste Booking</span>
          </div>
          <button className="btn-danger-sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* ---------- body ---------- */}
        <div className="panel-body">
          {/* ---- idle / extracting ---- */}
          {(state === 'idle' || state === 'extracting') && (
            <>
              <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 15 }}>
                <Sparkles size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                Paste email — no inbox connection
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.7 }}>
                Paste a booking confirmation email or text below and we'll extract the details.
              </p>

              <textarea
                rows={8}
                placeholder="Paste your booking email / confirmation text here…"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid var(--border, #333)',
                  background: 'var(--bg-input, #1a1a2e)',
                  color: 'inherit',
                  boxSizing: 'border-box',
                }}
                disabled={state === 'extracting'}
              />

              {error && (
                <div className="empty-state" style={{ marginTop: 8, color: '#f87171' }}>
                  <AlertTriangle size={16} style={{ marginRight: 6 }} />
                  {error}
                </div>
              )}

              {state === 'extracting' ? (
                <div className="panel-loading-wrap" style={{ marginTop: 16 }}>
                  <div className="panel-spinner" />
                  <span style={{ marginLeft: 8, fontSize: 13 }}>Extracting booking details…</span>
                </div>
              ) : (
                <button
                  className="confirmed-pill"
                  style={{
                    marginTop: 12,
                    cursor: rawText.trim() ? 'pointer' : 'not-allowed',
                    opacity: rawText.trim() ? 1 : 0.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  disabled={!rawText.trim()}
                  onClick={handleExtract}
                >
                  <Sparkles size={14} />
                  Extract
                </button>
              )}
            </>
          )}

          {/* ---- review ---- */}
          {state === 'review' && booking && (
            <>
              <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 15 }}>
                <Edit3 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                Review &amp; edit extracted fields
              </p>

              {error && (
                <div className="empty-state" style={{ marginBottom: 10, color: '#f87171' }}>
                  <AlertTriangle size={16} style={{ marginRight: 6 }} />
                  {error}
                </div>
              )}

              {/* confidence pill */}
              <div style={{ marginBottom: 12 }}>
                <span className="confidence-pill">
                  {confidenceLabel(booking.confidence)} confidence (
                  {Math.round(booking.confidence * 100)}%)
                </span>
              </div>

              {/* editable fields */}
              <div style={{ display: 'grid', gap: 10 }}>
                {/* booking_type */}
                <label style={{ fontSize: 12, fontWeight: 500 }}>
                  Booking type
                  <select
                    value={booking.booking_type}
                    onChange={(e) => updateField('booking_type', e.target.value)}
                    style={fieldStyle}
                  >
                    {BOOKING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </label>

                {/* provider */}
                <FieldInput
                  label="Provider"
                  value={booking.provider}
                  onChange={(v) => updateField('provider', v)}
                />

                {/* confirmation_number */}
                <FieldInput
                  label="Confirmation #"
                  value={booking.confirmation_number}
                  onChange={(v) => updateField('confirmation_number', v)}
                  copyable
                />

                {/* start_time */}
                <FieldInput
                  label="Start time"
                  value={booking.start_time}
                  onChange={(v) => updateField('start_time', v)}
                  type="datetime-local"
                />

                {/* end_time */}
                <FieldInput
                  label="End time"
                  value={booking.end_time}
                  onChange={(v) => updateField('end_time', v)}
                  type="datetime-local"
                />

                {/* location */}
                <FieldInput
                  label="Location"
                  value={booking.location}
                  onChange={(v) => updateField('location', v)}
                />

                {/* address */}
                <FieldInput
                  label="Address"
                  value={booking.address}
                  onChange={(v) => updateField('address', v)}
                />

                {/* deadline */}
                <FieldInput
                  label="Deadline"
                  value={booking.deadline}
                  onChange={(v) => updateField('deadline', v)}
                  type="datetime-local"
                />

                {/* action_required */}
                <FieldInput
                  label="Action required"
                  value={booking.action_required}
                  onChange={(v) => updateField('action_required', v)}
                />
              </div>

              {/* trip assignment */}
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  <ArrowRight size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Assign to trip
                </p>

                {journeys.length > 0 && (
                  <select
                    value={selectedJourneyId}
                    onChange={(e) => setSelectedJourneyId(e.target.value)}
                    style={{ ...fieldStyle, marginBottom: 8 }}
                  >
                    <option value="">— Select existing trip —</option>
                    {journeys.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.origin} → {j.destination} ({j.travel_mode})
                      </option>
                    ))}
                  </select>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selectedJourneyId && (
                    <button
                      className="confirmed-pill"
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleConfirm(false)}
                    >
                      <Check size={14} />
                      Add to selected trip
                    </button>
                  )}

                  <button
                    className="confirmed-pill"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleConfirm(true)}
                  >
                    <Plus size={14} />
                    Create new trip
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ---- geocoding ---- */}
          {state === 'geocoding' && (
            <div className="panel-loading-wrap">
              <div className="panel-spinner" />
              <span style={{ marginLeft: 8, fontSize: 13 }}>Geocoding &amp; saving…</span>
            </div>
          )}

          {/* ---- saved ---- */}
          {state === 'saved' && (
            <>
              <div
                className="empty-state"
                style={{ color: '#34d399', flexDirection: 'column', alignItems: 'center' }}
              >
                <Check size={28} style={{ marginBottom: 8 }} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>Booking saved!</span>
              </div>

              {/* Mini map */}
              {geo && (
                <div style={{ marginTop: 16, borderRadius: 10, overflow: 'hidden', height: 200 }}>
                  <MapContainer
                    center={[geo.lat, geo.lng]}
                    zoom={14}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}
                    dragging={false}
                    attributionControl={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[geo.lat, geo.lng]} icon={waypointIcon} />
                  </MapContainer>
                  <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} />
                    {geo.display_name}
                  </p>
                </div>
              )}

              <button
                className="confirmed-pill"
                style={{ marginTop: 16, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={onClose}
              >
                <Check size={14} />
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared field‑level input                                           */
/* ------------------------------------------------------------------ */

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 13,
  borderRadius: 6,
  border: '1px solid var(--border, #333)',
  background: 'var(--bg-input, #1a1a2e)',
  color: 'inherit',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  marginTop: 2,
};

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  copyable = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  copyable?: boolean;
}) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
  };

  return (
    <label style={{ fontSize: 12, fontWeight: 500, position: 'relative' }}>
      {label}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          style={fieldStyle}
        />
        {copyable && value && (
          <button
            onClick={handleCopy}
            aria-label="Copy"
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: 2,
              flexShrink: 0,
            }}
          >
            <Copy size={14} />
          </button>
        )}
      </div>
    </label>
  );
}
