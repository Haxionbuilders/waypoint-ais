import {
  AlertTriangle,
  Droplets,
  CarFront,
  HardHat,
  ShieldAlert,
  Lightbulb,
  Package,
  TrafficCone,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';
import type {
  HazardCategory,
  Severity,
  ReportStatus,
  AuthorityEntry,
} from '@/types';

export const CATEGORIES: HazardCategory[] = [
  'pothole',
  'flooding',
  'accident',
  'construction',
  'crime',
  'lighting',
  'debris',
  'traffic',
  'other',
];

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  hex: string;
}

export const CATEGORY_META: Record<HazardCategory, CategoryMeta> = {
  pothole: { label: 'Pothole', icon: AlertTriangle, color: 'amber', hex: '#f59e0b' },
  flooding: { label: 'Flooding', icon: Droplets, color: 'sky', hex: '#0ea5e9' },
  accident: { label: 'Accident', icon: CarFront, color: 'red', hex: '#ef4444' },
  construction: { label: 'Construction', icon: HardHat, color: 'orange', hex: '#f97316' },
  crime: { label: 'Crime / Safety', icon: ShieldAlert, color: 'rose', hex: '#e11d48' },
  lighting: { label: 'Street Lighting', icon: Lightbulb, color: 'yellow', hex: '#eab308' },
  debris: { label: 'Debris / Obstruction', icon: Package, color: 'lime', hex: '#84cc16' },
  traffic: { label: 'Traffic', icon: TrafficCone, color: 'violet', hex: '#8b5cf6' },
  other: { label: 'Other', icon: CircleHelp, color: 'slate', hex: '#64748b' },
};

export const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];

export interface SeverityMeta {
  color: string;
  hex: string;
  softBg: string;
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  Low: { color: 'green', hex: '#22c55e', softBg: 'rgb(var(--success-soft))' },
  Medium: { color: 'amber', hex: '#f59e0b', softBg: 'rgb(var(--warning-soft))' },
  High: { color: 'orange', hex: '#f97316', softBg: 'rgb(var(--warning-soft))' },
  Critical: { color: 'red', hex: '#ef4444', softBg: 'rgb(var(--danger-soft))' },
};

export const STATUSES: ReportStatus[] = ['Open', 'Verified', 'In Progress', 'Resolved', 'Rejected'];

export interface StatusMeta {
  color: string;
  softBg: string;
}

export const STATUS_META: Record<ReportStatus, StatusMeta> = {
  Open: { color: 'rgb(var(--info))', softBg: 'rgb(var(--info-soft))' },
  Verified: { color: 'rgb(var(--accent-strong))', softBg: 'rgb(var(--accent-soft))' },
  'In Progress': { color: 'rgb(var(--warning))', softBg: 'rgb(var(--warning-soft))' },
  Resolved: { color: 'rgb(var(--success))', softBg: 'rgb(var(--success-soft))' },
  Rejected: { color: 'rgb(var(--danger))', softBg: 'rgb(var(--danger-soft))' },
};

export const AUTHORITY_DIRECTORY: AuthorityEntry[] = [
  {
    name: 'Local Municipal Corporation',
    jurisdiction: 'City / Town',
    category: 'general',
    channel: 'Online Grievance Portal',
    contact: 'Visit your city municipal website',
    verified: false,
  },
  {
    name: 'Public Works Department (PWD)',
    jurisdiction: 'State',
    category: 'pothole',
    channel: 'Online / Phone',
    contact: 'State PWD helpline — check state PWD website',
    verified: false,
  },
  {
    name: 'Traffic Police Control Room',
    jurisdiction: 'City',
    category: 'traffic',
    channel: 'Phone',
    contact: 'Dial 112 or local traffic helpline',
    verified: false,
  },
  {
    name: 'National Highways Authority of India (NHAI)',
    jurisdiction: 'National Highways',
    category: 'pothole',
    channel: 'Email / Online',
    contact: 'helpdesk@nhai.org',
    verified: false,
  },
  {
    name: 'Disaster Management Authority',
    jurisdiction: 'State / District',
    category: 'flooding',
    channel: 'Phone',
    contact: 'Dial 112 or state SDMA helpline',
    verified: false,
  },
];

export const WMO_WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}
