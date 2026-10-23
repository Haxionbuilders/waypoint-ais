export type HazardCategory =
  | 'pothole'
  | 'flooding'
  | 'accident'
  | 'construction'
  | 'crime'
  | 'lighting'
  | 'debris'
  | 'traffic'
  | 'other';

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
export type ReportStatus = 'Open' | 'Verified' | 'In Progress' | 'Resolved' | 'Rejected';

export interface Report {
  id: string;
  user_id?: string | null;
  title: string;
  description: string;
  category: HazardCategory;
  severity: Severity;
  status: ReportStatus;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number;
  lon?: number;
  location_name: string;
  reporter_name?: string | null;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatusHistoryEntry {
  id: string;
  report_id: string;
  status: ReportStatus;
  note: string | null;
  changed_at: string;
}

export interface ComplaintDraft {
  id: string;
  report_id: string;
  recipient: string;
  subject: string;
  body: string;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  task: string;
  tool_calls: AgentToolCall[];
  response: string;
  created_at: string;
}

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  timestamp: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AgentToolCall[];
  timestamp: string;
}

export interface WeatherData {
  temperature: number;
  windSpeed: number;
  precipitation: number;
  weatherCode: number;
  isDay: boolean;
  utcOffsetSeconds: number;
  time: string;
}

export interface TravelRisk {
  level: 'Low' | 'Moderate' | 'High' | 'Severe';
  score: number;
  factors: string[];
}

export interface AuthorityEntry {
  name: string;
  jurisdiction: string;
  category: HazardCategory | 'general';
  channel: string;
  contact: string;
  verified: boolean;
}

export interface WeatherForecastDay {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  windSpeedMax: number;
}

// --- Evidence & Booking Types ---

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

export interface BookingExtraction {
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

export interface PackingItem {
  id: string;
  name: string;
  category: 'essentials' | 'weather' | 'safety' | 'comfort' | 'documents';
  reason: string;
  packed: boolean;
}

export interface PackingChecklist {
  items: PackingItem[];
  weather_summary: string;
  trip_duration_days: number;
  generated_at: string;
}

export interface TravelBriefing {
  summary: string;
  weather_alert?: string;
  route_note?: string;
  departure_reminder: string;
  estimated_travel_time: string;
  confidence: number;
  generated_at: string;
}
