import React, { useState, useEffect } from 'react';
import {
  X, Briefcase, CloudRain, Plus, CheckSquare, Square
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PackingItem } from '@/types';

interface SmartPackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: string;
  travelMode?: string;
  onToast: (msg: string) => void;
}

export function SmartPackingModal({
  isOpen,
  onClose,
  destination = 'Munnar',
  onToast,
}: SmartPackingModalProps) {
  const [purpose, setPurpose] = useState<'commute' | 'client_meeting' | 'overnight' | 'airport' | 'leisure'>('client_meeting');
  const [weatherCondition, setWeatherCondition] = useState<string>('Syncing weather...');
  const [items, setItems] = useState<PackingItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCat, setNewItemCat] = useState<PackingItem['category']>('Essentials');

  useEffect(() => {
    if (!isOpen) return;
    void loadWeatherAndBuildChecklist();
  }, [isOpen, destination, purpose]);

  const loadWeatherAndBuildChecklist = async () => {
    let rainy = false;
    let temp = 22;
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=9.93&longitude=76.26&current=temperature_2m,weather_code,precipitation&timezone=auto'
      );
      if (res.ok) {
        const d = await res.json();
        const code = d.current?.weather_code ?? 0;
        rainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
        temp = Math.round(d.current?.temperature_2m ?? 22);
        setWeatherCondition(`${rainy ? 'Rain likely' : 'Clear weather'}, ${temp}°C`);
      }
    } catch {
      setWeatherCondition('Weather estimated (22°C)');
    }

    const generated: PackingItem[] = [
      { id: '1', name: 'Mobile Phone & Fast Charger', category: 'Essentials', packed: false, required: true },
      { id: '2', name: 'Wallet, Driver License & Payment Cards', category: 'Essentials', packed: false, required: true },
      { id: '3', name: 'Prescription Eyewear / Sunglasses', category: 'Essentials', packed: false, required: false },
      ...(rainy
        ? [
            {
              id: 'w-1',
              name: 'Compact Travel Umbrella',
              category: 'Weather' as const,
              packed: false,
              required: true,
              reason: 'Rain likely at destination based on Open-Meteo telemetry',
            },
            {
              id: 'w-2',
              name: 'Waterproof Rain Jacket / Packable Shell',
              category: 'Weather' as const,
              packed: false,
              required: true,
              reason: 'Precipitation expected during route transit',
            },
          ]
        : [
            {
              id: 'w-3',
              name: 'UV Protection Sunscreen',
              category: 'Weather' as const,
              packed: false,
              required: false,
              reason: 'Clear daylight forecast',
            },
          ]),
      ...(purpose === 'client_meeting'
        ? [
            { id: 'wk-1', name: 'Laptop & Power Adapter', category: 'Work' as const, packed: false, required: true, reason: 'Client meeting itinerary' },
            { id: 'wk-2', name: 'Business Cards / Portfolio Materials', category: 'Work' as const, packed: false, required: false },
          ]
        : []),
      { id: 'h-1', name: 'Personal Medications & Pain Relief', category: 'Health', packed: false, required: true },
      { id: 'h-2', name: 'Hand Sanitizer & Pocket Tissues', category: 'Health', packed: false, required: false },
      { id: 'd-1', name: 'Vehicle Registration & Insurance Copy', category: 'Documents', packed: false, required: true, reason: 'Required for active road transit' },
      ...(purpose === 'airport'
        ? [{ id: 'd-2', name: 'Boarding Pass & Government Photo ID', category: 'Documents' as const, packed: false, required: true }]
        : []),
      { id: 'o-1', name: 'Noise-Cancelling Earbuds / Headphones', category: 'Optional', packed: false, required: false },
    ];

    setItems(generated);

    if (supabase) {
      const { data } = await supabase
        .from('packing_checklists')
        .select('*')
        .eq('destination', destination)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && Array.isArray(data.items) && data.items.length > 0) {
        setItems(data.items as PackingItem[]);
      }
    }
  };

  const toggleItem = async (id: string) => {
    const next = items.map((it) => (it.id === id ? { ...it, packed: !it.packed } : it));
    setItems(next);

    if (supabase) {
      await supabase.from('packing_checklists').upsert({
        destination,
        purpose,
        items: next,
        updated_at: new Date().toISOString(),
      });
    }
  };

  const addItem = () => {
    if (!newItemName.trim()) return;
    const item: PackingItem = {
      id: `custom-${Date.now()}`,
      name: newItemName.trim(),
      category: newItemCat,
      packed: false,
      required: false,
    };
    const next = [...items, item];
    setItems(next);
    setNewItemName('');
    onToast(`Added ${item.name}`);
  };

  if (!isOpen) return null;

  const categories: PackingItem['category'][] = ['Essentials', 'Weather', 'Work', 'Health', 'Documents', 'Optional'];
  const packedCount = items.filter((i) => i.packed).length;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="late-modal-panel" style={{ width: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="late-modal-head">
          <div className="late-brand">
            <span className="late-icon-badge" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))' }}>
              <Briefcase size={18} />
            </span>
            <div>
              <h3>Smart Packing Checklist</h3>
              <p>Dynamic gear recommendations customized to weather, transit, and trip purpose</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px', background: 'var(--surface2)', border: '1px solid var(--line)', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text)' }}>
            <CloudRain size={14} style={{ color: 'var(--accent)' }} />
            <strong>{destination}:</strong>
            <span>{weatherCondition}</span>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 600, color: packedCount === items.length ? 'var(--green)' : 'var(--accent)' }}>
            {packedCount} of {items.length} Packed
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '14px' }}>
          {[
            { id: 'client_meeting', label: 'Client Meeting' },
            { id: 'commute', label: 'Commute' },
            { id: 'overnight', label: 'Overnight' },
            { id: 'airport', label: 'Airport' },
            { id: 'leisure', label: 'Leisure' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              className={`late-rel-btn ${purpose === p.id ? 'active' : ''}`}
              onClick={() => setPurpose(p.id as any)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '360px', overflowY: 'auto', paddingRight: '4px' }}>
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category === cat);
            if (catItems.length === 0) return null;

            return (
              <div key={cat} style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '10px 12px', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {cat} ({catItems.filter((x) => x.packed).length}/{catItems.length})
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: item.packed ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'var(--surface)',
                        border: '1px solid var(--line)',
                        cursor: 'pointer',
                        transition: '0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {item.packed ? (
                          <CheckSquare size={15} style={{ color: 'var(--green)' }} />
                        ) : (
                          <Square size={15} style={{ color: 'var(--muted)' }} />
                        )}
                        <span style={{ fontSize: '12px', color: item.packed ? 'var(--muted)' : 'var(--text)', textDecoration: item.packed ? 'line-through' : 'none' }}>
                          {item.name}
                        </span>
                      </div>

                      {item.reason && (
                        <span style={{ fontSize: '10px', color: 'var(--accent)', background: 'var(--glow)', padding: '2px 6px', borderRadius: '4px' }}>
                          {item.reason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <input
            type="text"
            placeholder="Add custom packing item..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '12px' }}
          />
          <select
            value={newItemCat}
            onChange={(e) => setNewItemCat(e.target.value as any)}
            style={{ padding: '8px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '11px' }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            className="photo-btn-save"
            style={{ padding: '8px 14px', flex: 'none' }}
            onClick={addItem}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}
