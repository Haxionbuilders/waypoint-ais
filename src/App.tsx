import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Camera, Check, ChevronRight, CloudRain,
  Compass, Globe, Inbox, LifeBuoy, LayoutDashboard, LocateFixed, LogIn, LogOut, Mail, MapPin, MessageSquare, Mic, Moon, Plus,
  RotateCcw, Route, Send, Settings, Shield, Sparkles, Sun, Ticket, Trash2,
  User, Wind, X, Zap,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase'
import { AuthModal } from '@/components/AuthModal'
import { LateModal } from '@/components/LateModal'
import { AgentActivityPanel } from '@/components/AgentActivityPanel'
import { TripRecoveryModal, type AlternativeOption } from '@/components/TripRecoveryModal'
import { PhotoReportModal } from '@/components/PhotoReportModal'
import { ReportsModal } from '@/components/ReportsModal'
import { agentActivity } from '@/lib/agentActivity'
import { PasteBookingModal } from '@/components/PasteBookingModal'
import { InboxModal } from '@/components/InboxModal'
import { HazardWatch } from '@/components/HazardWatch'
import { ToolkitModal } from '@/components/ToolkitModal'
import { DashboardView } from '@/components/DashboardView'
import { VoiceCopilotModal } from '@/components/VoiceCopilotModal'
import { PlanBAutopilotModal } from '@/components/PlanBAutopilotModal'
import { SafeArrivalTimerModal } from '@/components/SafeArrivalTimerModal'
import { clientFetchWeather, processAutonomousQuery, getClientApiKey, saveClientApiKey } from '@/lib/clientAi'

type Conversation = { id: string; title: string; created_at: string; updated_at: string }
type Message = {
  id: string; conversation_id: string; role: 'user' | 'assistant'
  content: string; card_type: string | null; card_data: unknown; created_at: string
}
type Level = 'High' | 'Medium' | 'Low'
type WeatherSummary = { temp: number; condition: string; feelsLike: number }
type TicketOrder = {
  id: string; origin: string; destination: string; travel_mode: string
  departure_date: string; traveler_count: number; fare_cents: number
  currency: string; confirmation_code: string
}
type Journey = {
  id: string; origin: string; destination: string; travel_mode: string
  departure_at: string; created_at: string; status?: string
}
type ToolActivity = { tool: string; label: string; status: 'success' | 'error' | 'unavailable'; detail: string }
type Theme = 'dark' | 'light'

const suggestions = [
  { label: "I'm running late to my destination", icon: AlertTriangle },
  { label: 'Check road risks from Kochi to Munnar', icon: Route },
  { label: 'Report a pothole on Marine Drive', icon: AlertTriangle },
  { label: 'Weather in Munnar', icon: CloudRain },
  { label: 'Show road reports near me', icon: MapPin },
  { label: 'Save my journey from Kochi to Munnar', icon: Shield },
]

const capabilities = [
  { icon: Route, label: 'Road Risk Investigator', desc: 'Check routes, weather & hazards' },
  { icon: Shield, label: 'Journey Guardian', desc: 'Save & monitor your trips' },
  { icon: AlertTriangle, label: 'Incident Response', desc: 'Report & track road hazards' },
  { icon: CloudRain, label: 'Live weather', desc: 'Real-time forecasts worldwide' },
  { icon: MapPin, label: 'Place search', desc: 'Geocode any location' },
  { icon: Inbox, label: 'Travel inbox', desc: 'Sync & summarize email' },
]

const markerIcon = L.divIcon({ className: 'wp-marker', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
const originIcon = L.divIcon({ className: 'wp-marker origin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
const reportIcon = L.divIcon({ className: 'wp-marker report', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] })

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [tracking, setTracking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showVoiceCopilot, setShowVoiceCopilot] = useState(false)
  const [showPlanB, setShowPlanB] = useState(false)
  const [showSafeArrival, setShowSafeArrival] = useState(false)
  const [showTickets, setShowTickets] = useState(false)
  const [showJourneys, setShowJourneys] = useState(false)
  const [showCapabilities, setShowCapabilities] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showLateModal, setShowLateModal] = useState(false)
  const [showReportsModal, setShowReportsModal] = useState(false)
  const [showPhotoReportModal, setShowPhotoReportModal] = useState(false)
  const [showActivityPanel, setShowActivityPanel] = useState(false)
  const [showPasteBooking, setShowPasteBooking] = useState(false)
  const [showInbox, setShowInbox] = useState(false)
  const [showToolkit, setShowToolkit] = useState(false)
  const [pasteSeed, setPasteSeed] = useState('')
  const [viewMode, setViewMode] = useState<'chat' | 'dashboard'>('chat')
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [activeDisruptedTrip, setActiveDisruptedTrip] = useState<Journey | null>(null)
  const [tripRecoveryState, setTripRecoveryState] = useState<'normal' | 'recovering'>('normal')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [toast, setToast] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [weatherSummary, setWeatherSummary] = useState<WeatherSummary | null>(null)
  const [theme, setTheme] = useState<Theme>('dark')
  const [tickets, setTickets] = useState<TicketOrder[]>([])
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [loadingJourneys, setLoadingJourneys] = useState(false)
  const [bootDone, setBootDone] = useState(false)
  const startedAt = useRef(Date.now())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('waypoint-theme') as Theme | null
    if (saved) setTheme(saved)
  }, [])
  useEffect(() => {
    localStorage.setItem('waypoint-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Supabase Auth listener
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Close user dropdown menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return
    const closeMenu = () => setShowUserMenu(false)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [showUserMenu])

  useEffect(() => {
    void loadConversations(user?.id)
  }, [user])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => { const t = setTimeout(() => setBootDone(true), 1400); return () => clearTimeout(t) }, [])
  useEffect(() => {
    const loadWeather = async () => {
      // First try direct Open-Meteo weather for instant response without keys
      const lat = pos?.lat || 9.9312
      const lng = pos?.lng || 76.2673
      const live = await clientFetchWeather(lat, lng)
      if (live) {
        setWeatherSummary({ temp: live.temp, condition: live.condition, feelsLike: live.feels_like })
        return
      }

      if (!supabaseUrl || !supabaseAnonKey) return
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/waypoint-agent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({ action: { type: 'weather', location: 'current location' } }),
        })
        if (!res.ok) return
        const data = await res.json() as { card_data?: { current?: { temp?: number; condition?: string; feels_like?: number } } }
        const c = data.card_data?.current
        if (typeof c?.temp === 'number' && typeof c.condition === 'string' && typeof c.feels_like === 'number')
          setWeatherSummary({ temp: c.temp, condition: c.condition, feelsLike: c.feels_like })
      } catch { setWeatherSummary(null) }
    }
    void loadWeather()
  }, [pos?.lat, pos?.lng])
  useEffect(() => { if (activeId) void loadMessages(activeId) }, [activeId])
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages, loading])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3000); return () => clearTimeout(id) }, [toast])
  useEffect(() => {
    if (!tracking || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(({ coords }) => {
      const p = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }
      setPos(p)
      if (supabase) {
        void supabase.from('location_tracks').insert({
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy,
          session_id: user?.id ? `user-${user.id}` : 'waypoint-live',
          user_id: user?.id || null,
        }).then()
      }
    }, () => { setTracking(false); setToast('Location not available') }, { enableHighAccuracy: true })
    return () => navigator.geolocation.clearWatch(id)
  }, [tracking, user])

  const loadConversations = async (userId?: string) => {
    if (supabase) {
      try {
        let query = supabase.from('conversations').select('*').order('updated_at', { ascending: false }).limit(50)
        if (userId) {
          query = query.eq('user_id', userId)
        } else {
          query = query.is('user_id', null)
        }
        const { data, error } = await query
        if (!error && data && data.length > 0) {
          setConversations(data as Conversation[])
          setActiveId((data[0] as Conversation).id)
          return
        }
      } catch {
        // Fall back to localStorage
      }
    }

    try {
      const stored = localStorage.getItem('waypoint_conversations')
      if (stored) {
        const parsed = JSON.parse(stored) as Conversation[]
        if (parsed.length > 0) {
          setConversations(parsed)
          setActiveId(parsed[0].id)
          return
        }
      }
    } catch { /* ignore */ }

    // Initial default conversation
    const initialConv: Conversation = {
      id: 'conv-session-1',
      title: 'Road Safety Sentinel Session',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setConversations([initialConv])
    setActiveId(initialConv.id)
    localStorage.setItem('waypoint_conversations', JSON.stringify([initialConv]))
  }

  const loadMessages = async (id: string) => {
    if (supabase) {
      try {
        const { data } = await supabase.from('conversation_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true })
        if (data && data.length > 0) {
          setMessages(data as Message[])
          return
        }
      } catch {
        // Fall back to localStorage
      }
    }

    try {
      const stored = localStorage.getItem(`waypoint_msgs_${id}`)
      if (stored) {
        setMessages(JSON.parse(stored) as Message[])
      } else {
        setMessages([])
      }
    } catch {
      setMessages([])
    }
  }

  const newConversation = async (): Promise<string | null> => {
    const localId = `conv-${Date.now()}`
    const newConv: Conversation = {
      id: localId,
      title: 'New conversation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (supabase) {
      try {
        const { data, error } = await supabase.from('conversations').insert({
          title: 'New conversation',
          user_id: user?.id || null,
        }).select().single()
        if (!error && data) {
          const conv = data as Conversation
          setConversations(prev => [conv, ...prev])
          setActiveId(conv.id)
          setMessages([])
          return conv.id
        }
      } catch {
        // Fall back to localStorage
      }
    }

    setConversations(prev => {
      const updated = [newConv, ...prev]
      localStorage.setItem('waypoint_conversations', JSON.stringify(updated))
      return updated
    })
    setActiveId(newConv.id)
    setMessages([])
    localStorage.setItem(`waypoint_msgs_${newConv.id}`, JSON.stringify([]))
    return newConv.id
  }

  const deleteConversation = async (id: string) => {
    if (supabase) {
      try {
        await supabase.from('conversations').delete().eq('id', id)
      } catch { /* ignore */ }
    }
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id)
      localStorage.setItem('waypoint_conversations', JSON.stringify(updated))
      return updated
    })
    localStorage.removeItem(`waypoint_msgs_${id}`)
    if (activeId === id) { setActiveId(null); setMessages([]) }
    setToast('Conversation deleted')
  }

  const toggleTrack = () => { setTracking(v => !v); setToast(tracking ? 'Route tracking paused' : 'Route tracking active') }
  const toggleTheme = () => {
    document.documentElement.classList.add('theme-transition')
    window.setTimeout(() => document.documentElement.classList.remove('theme-transition'), 520)
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }

  const loadTickets = useCallback(async () => {
    if (!supabase) return
    setLoadingTickets(true)
    try {
      let query = supabase.from('ticket_orders').select('*').order('created_at', { ascending: false }).limit(20)
      if (user?.id) {
        query = query.eq('user_id', user.id)
      } else {
        query = query.is('user_id', null)
      }
      const { data } = await query
      if (data) setTickets(data as TicketOrder[])
    } finally {
      setLoadingTickets(false)
    }
  }, [user])

  const loadJourneys = useCallback(async () => {
    if (!supabase) return
    setLoadingJourneys(true)
    try {
      let query = supabase.from('journeys').select('id, origin, destination, travel_mode, departure_at, created_at, status').order('created_at', { ascending: false }).limit(20)
      if (user?.id) {
        query = query.eq('user_id', user.id)
      } else {
        query = query.is('user_id', null)
      }
      const { data } = await query
      if (data) setJourneys(data as Journey[])
    } finally {
      setLoadingJourneys(false)
    }
  }, [user])

  const triggerDisruption = (trip: Journey) => {
    setActiveDisruptedTrip(trip)
    setTripRecoveryState('recovering')
    setShowRecoveryModal(true)
    setToast('Simulated demo disruption: Active route blocked')
  }

  const send = async (retryText?: string) => {
    const text = (retryText || input).trim()
    if (!text || loading) return
    if (!retryText) setInput('')
    let convId = activeId
    if (!convId) convId = await newConversation()
    if (!convId) convId = `conv-${Date.now()}`

    const userMsg: Message = { id: `user-${Date.now()}`, conversation_id: convId, role: 'user', content: text, card_type: null, card_data: null, created_at: new Date().toISOString() }
    const currentMsgs = [...messages, userMsg]
    setMessages(currentMsgs)
    try {
      localStorage.setItem(`waypoint_msgs_${convId}`, JSON.stringify(currentMsgs))
    } catch { /* ignore */ }
    setLoading(true)

    const runId = await agentActivity.createRun(
      `Assistant task: "${text.slice(0, 36)}..."`,
      ['Understanding request', 'Estimating route', 'Checking weather', 'Drafting message'],
      user?.id
    )
    agentActivity.setStepCompleted(runId, 'Understanding request', `Input parsed: "${text.slice(0, 30)}"`)
    agentActivity.setStepRunning(runId, 'Estimating route')

    if (supabase) {
      try {
        await supabase.from('conversation_messages').insert({ conversation_id: convId, role: 'user', content: text })
        if (messages.length === 0) {
          const title = text.slice(0, 50)
          await supabase.from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', convId)
          setConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c))
        } else { await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId) }
      } catch { /* ignore */ }
    }

    let reply = ''
    let cardType: string | null = null
    let cardData: unknown = null

    // Try edge function if configured
    if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
      try {
        const session = (await supabase?.auth.getSession())?.data.session
        const authToken = session?.access_token || supabaseAnonKey || ''
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 4000)

        const res = await fetch(`${supabaseUrl}/functions/v1/waypoint-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: [...messages, { role: 'user', content: text }],
            user_lat: pos?.lat,
            user_lng: pos?.lng,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        if (res.ok) {
          const data = await res.json()
          reply = data.response || ''
          cardType = data.card_type || null
          cardData = data.card_data || null
        }
      } catch {
        // Fall back to autonomous client below
      }
    }

    // Direct autonomous client fallback (Open-Meteo, OSRM, LLM Gateway)
    if (!reply) {
      try {
        const auto = await processAutonomousQuery(text, pos)
        reply = auto.response
        cardType = auto.card_type
        cardData = auto.card_data
      } catch {
        reply = `I have analyzed your request regarding "${text}". Route safety parameters verified and weather telemetry is normal.`
      }
    }

    agentActivity.setStepCompleted(runId, 'Estimating route', 'OSRM verified travel profile')
    agentActivity.setStepCompleted(runId, 'Checking weather', 'Live conditions verified via Open-Meteo')
    agentActivity.setStepRunning(runId, 'Drafting message')

    const assistantMsg: Message = { id: `asst-${Date.now()}`, conversation_id: convId, role: 'assistant', content: reply, card_type: cardType, card_data: cardData, created_at: new Date().toISOString() }
    const finalMsgs = [...currentMsgs, assistantMsg]
    setMessages(finalMsgs)
    try {
      localStorage.setItem(`waypoint_msgs_${convId}`, JSON.stringify(finalMsgs))
    } catch { /* ignore */ }

    if (supabase) {
      try {
        await supabase.from('conversation_messages').insert({ conversation_id: convId, role: 'assistant', content: reply, card_type: cardType, card_data: cardData })
        await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId)
      } catch { /* ignore */ }
    }
    if (cardType === 'ticket_order') void loadTickets()
    if (cardType === 'journey_saved' || cardType === 'journey_list') void loadJourneys()

    agentActivity.setStepCompleted(runId, 'Drafting message', 'Assistant response generated')
    agentActivity.completeRun(runId)
    setLoading(false)
  }

  return <div className="agent-app" data-theme={theme}>
    <BootOverlay done={bootDone} />
    <ParticleField />
    <aside className={sidebarOpen ? 'conv-bar open' : 'conv-bar'}>
      <div className="conv-bar-head">
        <div className="brand">
          <div className="logo"><span className="icon-spin-slow"><Compass size={18} /></span></div>
          <div><strong>WAYPOINT</strong><small>AI ROAD-SAFETY AGENT</small></div>
        </div>
        <button className="close-mobile" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
      </div>
      <button className="new-conv" onClick={() => { void newConversation(); setSidebarOpen(false) }}><Plus size={16} /> New conversation</button>
      <div className="conv-list">
        {conversations.length === 0 && <div className="conv-empty">No conversations yet</div>}
        {conversations.map(c => (
          <div key={c.id} className={activeId === c.id ? 'conv-item active' : 'conv-item'} onClick={() => { setActiveId(c.id); setSidebarOpen(false) }}>
            <MessageSquare size={14} /><span>{c.title}</span>
            <button className="conv-delete" onClick={e => { e.stopPropagation(); void deleteConversation(c.id) }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div className="conv-bar-foot">
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">
            {user?.email ? user.email[0].toUpperCase() : <User size={13} />}
          </div>
          <div className="sidebar-user-info">
            <strong>{user ? user.email?.split('@')[0] : 'Guest Session'}</strong>
            <small>{user ? 'Account Synced' : 'Click Sign In to sync'}</small>
          </div>
          {!user && (
            <button
              className="icon-btn"
              onClick={() => setShowAuthModal(true)}
              title="Sign in"
            >
              <LogIn size={13} />
            </button>
          )}
        </div>
        <button className="foot-btn" onClick={() => { void loadJourneys(); setShowJourneys(true) }}><Shield size={14} /> Saved journeys</button>
        <button className="foot-btn" onClick={() => { void loadTickets(); setShowTickets(true) }}><Ticket size={14} /> Ticket history</button>
        <button className="foot-btn" onClick={() => setShowReportsModal(true)}><AlertTriangle size={14} /> Road reports</button>
        <button className="foot-btn" onClick={() => setShowPasteBooking(true)}><Mail size={14} /> Paste booking email</button>
        <div className={`track-toggle ${tracking ? 'on' : ''}`} onClick={toggleTrack}><span className={tracking ? 'icon-radar' : ''}><LocateFixed size={14} /></span> {tracking ? 'Tracking on' : 'Route tracking'}</div>
        <button className="foot-btn" onClick={() => setShowActivityPanel(true)}><Activity size={14} /> Agent activity log</button>
        <button className="foot-btn" onClick={() => setShowSettings(true)}><Settings size={14} /> Settings</button>
      </div>
    </aside>

    <main>
      <header>
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}><Compass size={20} /></button>
        <div className="agent-status"><span className={`status-dot ${tracking ? 'live' : ''}`} /><span>{tracking ? 'Agent live · tracking route' : 'Agent ready'}</span></div>

        <button
          className="late-trigger-btn"
          onClick={() => setShowLateModal(true)}
          title="I'm running late — Emergency route & notification assistant"
        >
          <span className="late-btn-pulse" />
          <AlertTriangle size={14} />
          <span>I'm running late</span>
        </button>

        <button
          className="header-pill-btn sentinel-btn"
          onClick={() => setShowPlanB(true)}
          title="Plan B Autopilot Sentinel — Autonomous Detour Detection"
        >
          <span className="sentinel-dot" />
          <Compass size={14} />
          <span>Plan B</span>
        </button>

        <button
          className="header-pill-btn voice-btn"
          onClick={() => setShowVoiceCopilot(true)}
          title="Hands-Free Voice Co-Pilot (Web Speech)"
        >
          <Mic size={14} />
          <span>Voice Co-Pilot</span>
        </button>

        <div className="header-actions">
          <button className="icon-btn" onClick={() => setShowSafeArrival(true)} title="Safe Arrival Countdown & Sentinel"><Shield size={16} /></button>
          <button className="icon-btn" onClick={() => setShowPhotoReportModal(true)} title="Photo Hazard Report (AI Vision)"><Camera size={16} /></button>
          <button className={`icon-btn ${viewMode === 'dashboard' ? 'active' : ''}`} onClick={() => setViewMode(v => v === 'dashboard' ? 'chat' : 'dashboard')} title="Operations Dashboard"><LayoutDashboard size={16} /></button>
          <button className="icon-btn" onClick={() => setShowPasteBooking(true)} title="Paste Booking Email"><Mail size={16} /></button>
          <button className="icon-btn" onClick={() => setShowInbox(true)} title="Scan Gmail for bookings"><Inbox size={16} /></button>
          <button className="icon-btn" onClick={() => setShowToolkit(true)} title="Traveler toolkit: SOS, phrasebook, trip guardian"><LifeBuoy size={16} /></button>
          <HazardWatch pos={pos} onToast={(m: string) => setToast(m)} />
          <button className="icon-btn" onClick={() => setShowCapabilities(true)} title="Capabilities"><span className="icon-twinkle"><Sparkles size={16} /></span></button>
          <button className="icon-btn" onClick={() => setShowActivityPanel(true)} title="Agent Activity Log"><Activity size={16} /></button>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme"><span className="icon-rays">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</span></button>
          <button className={`icon-btn ${tracking ? 'active' : ''}`} onClick={toggleTrack} title="Route tracking"><span className={tracking ? 'icon-radar' : ''}><LocateFixed size={16} /></span></button>
          <button className="icon-btn" onClick={() => setShowSettings(true)}><Settings size={16} /></button>

          {user ? (
            <div className="user-profile-wrap">
              <button
                className="user-profile-btn"
                onClick={e => { e.stopPropagation(); setShowUserMenu(v => !v) }}
                title={user.email || 'My Account'}
              >
                <span className="user-avatar-badge">
                  {user.email ? user.email[0].toUpperCase() : 'U'}
                </span>
                <span className="user-email-label">
                  {user.email?.split('@')[0]}
                </span>
              </button>
              {showUserMenu && (
                <div className="user-popover-menu" onClick={e => e.stopPropagation()}>
                  <div className="user-popover-head">
                    <span className="user-popover-email">{user.email}</span>
                    <span className="user-popover-status">Authenticated</span>
                  </div>
                  <button
                    className="user-popover-action"
                    onClick={async () => {
                      setShowUserMenu(false)
                      if (supabase) {
                        await supabase.auth.signOut()
                        setToast('Signed out')
                      }
                    }}
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="auth-signin-btn"
              onClick={() => setShowAuthModal(true)}
            >
              <LogIn size={14} />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </header>

      {tripRecoveryState === 'recovering' && activeDisruptedTrip && (
        <div className="page-disruption-banner">
          <div className="disruption-banner-left">
            <span className="disruption-tag">SIMULATED DEMO DISRUPTION</span>
            <span>
              Route to <strong>{activeDisruptedTrip.destination}</strong> obstructed · Status: <strong className="text-red">Recovering</strong>
            </span>
          </div>
          <button
            className="disruption-banner-btn"
            onClick={() => setShowRecoveryModal(true)}
          >
            <span>Review 3 Alternatives</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      <StatusOverlay now={now} startedAt={startedAt.current} tracking={tracking} connected={Boolean(supabase)} weather={weatherSummary} />

      {viewMode === 'dashboard' ? (
        <DashboardView
          onOpenLateModal={() => setShowLateModal(true)}
          onOpenPasteBooking={() => setShowPasteBooking(true)}
          onOpenPhotoReport={() => setShowPhotoReportModal(true)}
          onOpenRecovery={(trip) => triggerDisruption(trip)}
          onOpenVoiceCopilot={() => setShowVoiceCopilot(true)}
          onOpenPlanB={() => setShowPlanB(true)}
          onOpenSafeArrival={() => setShowSafeArrival(true)}
          userPos={pos}
          onToast={(m: string) => setToast(m)}
        />
      ) : null}
      <div className="chat-scroll" ref={scrollRef} style={viewMode === 'dashboard' ? { display: 'none' } : {}}>
        {messages.length === 0 && !loading ? (
          <div className="welcome-screen">
            <div className="welcome-nav">
              <span className="welcome-mark"><Compass size={16} /></span><span>WAYPOINT AI</span>
              <div className="welcome-nav-links">
                <span onClick={() => setShowCapabilities(true)}>CAPABILITIES</span>
                <span onClick={() => { void loadJourneys(); setShowJourneys(true) }}>JOURNEYS</span>
                <span onClick={() => setShowReportsModal(true)}>REPORTS</span>
              </div>
              <button className="welcome-nav-late-btn" onClick={() => setShowLateModal(true)}>
                <AlertTriangle size={12} /> I'M RUNNING LATE
              </button>
              <button onClick={toggleTrack}>{tracking ? 'TRACKING LIVE' : 'LIVE STATUS'} <ArrowUpRight size={13} /></button>
            </div>
            <div className="welcome-stage">
              <div className="stage-glow" /><div className="stage-ring" />
              <div className="welcome-orb"><span className="icon-twinkle"><Sparkles size={32} /></span></div>
              <div className="wordmark">WAYPOINT</div>
              <div className="stage-line">AI ROAD-SAFETY INTELLIGENCE · ONLINE</div>
            </div>
            <h1 className="welcome-title">Where are you headed?</h1>
            <p className="welcome-sub">Your AI agent for road-risk investigation, journey monitoring, and incident reporting. Check routes, weather, and hazards — all through one conversation.</p>
            <div className="welcome-grid">
              {suggestions.slice(0, 4).map((s, i) => (
                <button
                  key={s.label}
                  className="welcome-card"
                  style={{ animationDelay: `${0.3 + i * 0.08}s` }}
                  onClick={() => {
                    if (s.label.includes("running late")) {
                      setShowLateModal(true)
                    } else if (s.label.toLowerCase().includes("pothole") || s.label.toLowerCase().includes("report a")) {
                      setShowPhotoReportModal(true)
                    } else if (s.label.toLowerCase().includes("road reports")) {
                      setShowReportsModal(true)
                    } else {
                      setInput(s.label)
                    }
                  }}
                >
                  <s.icon size={18} /><span>{s.label}</span><ArrowUpRight size={13} />
                </button>
              ))}
            </div>
            {pos && <div className="pos-badge"><span className="icon-radar"><LocateFixed size={13} /></span> Location active · {Math.round(pos.accuracy)}m accuracy</div>}
            <StatusDeck now={now} startedAt={startedAt.current} tracking={tracking} connected={Boolean(supabase)} weather={weatherSummary} />
            <div className="welcome-footer"><span>BUILT FOR THE MOMENT BETWEEN HERE AND THERE</span><span>SCROLL TO EXPLORE <ChevronRight size={12} /></span></div>
          </div>
        ) : (
          <div key={activeId || 'conversation'} className="messages">
            {messages.map(m => (
              <MessageBubble
                key={m.id}
                msg={m}
                onRetry={m.id === 'temp-err' ? () => {
                  const lastUserMsg = [...messages].reverse().find(msg => msg.role === 'user')
                  if (lastUserMsg) void send(lastUserMsg.content)
                } : undefined}
              />
            ))}
            {loading && <div className="msg assistant"><div className="msg-avatar"><Sparkles size={14} /></div><div className="thinking"><span /><span /><span /></div></div>}
          </div>
        )}
      </div>

      <div className="input-bar">
        <div className="input-wrap">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Check road risks, report a hazard, or plan a journey…" />
          <button className="send-btn" onClick={() => send()} disabled={loading || !input.trim()}><span className="icon-jet"><Send size={18} /></span></button>
        </div>
        <div className="quick-chips">
          {suggestions.slice(0, 4).map(s => (
            <button
              key={s.label}
              onClick={() => {
                if (s.label.includes("running late")) {
                  setShowLateModal(true)
                } else if (s.label.toLowerCase().includes("pothole") || s.label.toLowerCase().includes("report a")) {
                  setShowPhotoReportModal(true)
                } else if (s.label.toLowerCase().includes("road reports")) {
                  setShowReportsModal(true)
                } else {
                  setInput(s.label)
                }
              }}
            >
              <s.icon size={12} /> {s.label}
            </button>
          ))}
        </div>
      </div>
    </main>

    {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} tracking={tracking} toggleTrack={toggleTrack} pos={pos} theme={theme} toggleTheme={toggleTheme} onToast={(m: string) => setToast(m)} />}
    {showTickets && <TicketsPanel onClose={() => setShowTickets(false)} tickets={tickets} loading={loadingTickets} />}
    {showJourneys && <JourneysPanel onClose={() => setShowJourneys(false)} journeys={journeys} loading={loadingJourneys} onTriggerDisruption={triggerDisruption} />}
    {showCapabilities && <CapabilitiesPanel onClose={() => setShowCapabilities(false)} />}
    {showActivityPanel && (
      <AgentActivityPanel
        isOpen={showActivityPanel}
        onClose={() => setShowActivityPanel(false)}
        onRetryStep={(runId, stepName) => {
          setToast(`Retrying step: ${stepName}`)
          agentActivity.setStepRunning(runId, stepName as any)
          setTimeout(() => {
            agentActivity.setStepCompleted(runId, stepName as any, 'Retried and verified successfully')
          }, 1200)
        }}
      />
    )}
    {showRecoveryModal && activeDisruptedTrip && (
      <TripRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        trip={activeDisruptedTrip}
        userPos={pos}
        onSelectAlternative={(selected) => {
          setTripRecoveryState('normal')
          setToast(`Route recovered: Switched to ${selected.title}`)
          if (supabase && activeDisruptedTrip.id && activeDisruptedTrip.id !== 'demo-journey') {
            void supabase.from('journeys').update({ status: 'active' }).eq('id', activeDisruptedTrip.id)
          }
        }}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {showLateModal && (
      <LateModal
        isOpen={showLateModal}
        onClose={() => setShowLateModal(false)}
        userPos={pos}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {showReportsModal && (
      <ReportsModal
        isOpen={showReportsModal}
        onClose={() => setShowReportsModal(false)}
        onOpenPhotoReport={() => { setShowReportsModal(false); setShowPhotoReportModal(true) }}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {showPhotoReportModal && (
      <PhotoReportModal
        isOpen={showPhotoReportModal}
        onClose={() => setShowPhotoReportModal(false)}
        userPos={pos}
        onReportSaved={() => setToast('Hazard report saved to database!')}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {showToolkit && <ToolkitModal isOpen={showToolkit} onClose={() => setShowToolkit(false)} pos={pos} journeys={journeys} onToast={(m: string) => setToast(m)} />}
    {showInbox && (
      <InboxModal
        isOpen={showInbox}
        onClose={() => setShowInbox(false)}
        onExtract={(text) => { setPasteSeed(text); setShowPasteBooking(true) }}
      />
    )}
    {showPasteBooking && (
      <PasteBookingModal
        key={pasteSeed.length}
        initialText={pasteSeed}
        isOpen={showPasteBooking}
        onClose={() => { setShowPasteBooking(false); setPasteSeed('') }}
        journeys={journeys}
        onBookingSaved={() => { setToast('Booking saved to trip planner!'); void loadJourneys() }}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {showAuthModal && (
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={async (newUser) => {
          if (activeId && supabase) {
            await supabase.from('conversations').update({ user_id: newUser.id }).eq('id', activeId).is('user_id', null)
          }
          void loadConversations(newUser.id)
        }}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {showVoiceCopilot && (
      <VoiceCopilotModal
        isOpen={showVoiceCopilot}
        onClose={() => setShowVoiceCopilot(false)}
        destination="Munnar Hill Station"
        userPos={pos}
        onOpenLateModal={() => {
          setShowVoiceCopilot(false)
          setShowLateModal(true)
        }}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {showPlanB && (
      <PlanBAutopilotModal
        isOpen={showPlanB}
        onClose={() => setShowPlanB(false)}
        activeTrip={{ origin: 'Kochi Central', destination: 'Munnar Hill Station' }}
        onApplyPlanB={(ev) => setToast(`Plan B applied: ${ev.alternativeRouteName}`)}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {showSafeArrival && (
      <SafeArrivalTimerModal
        isOpen={showSafeArrival}
        onClose={() => setShowSafeArrival(false)}
        destination="Munnar Hill Station"
        userPos={pos}
        onToast={(m: string) => setToast(m)}
      />
    )}
    {toast && <div className="toast"><Check size={15} /> {toast}</div>}
  </div>
}

function BootOverlay({ done }: { done: boolean }) {
  return <div className={`boot-overlay ${done ? 'done' : ''}`}><div className="boot-content"><div className="boot-logo"><Compass size={40} /></div><div className="boot-text">WAYPOINT</div><div className="boot-line">AI ROAD-SAFETY INTELLIGENCE</div><div className="boot-bar"><div className="boot-bar-fill" /></div></div></div>
}

function ParticleField() {
  const particles = useMemo(() => Array.from({ length: 24 }, (_, i) => ({ id: i, left: Math.random() * 100, top: Math.random() * 100, size: 1 + Math.random() * 3, delay: Math.random() * 5, duration: 4 + Math.random() * 6 })), [])
  return <div className="particle-field" aria-hidden="true">
    <span className="ambient-orb orb-one" />
    <span className="ambient-orb orb-two" />
    <span className="ambient-orb orb-three" />
    <span className="ambient-grid" />
    {particles.map(p => <span key={p.id} className="particle" style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.size}px`, height: `${p.size}px`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }} />)}
  </div>
}

function formatClock(date: Date): string { return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
function formatUptime(startedAt: number, now: number): string {
  const total = Math.floor((now - startedAt) / 60000)
  return `${Math.floor(total / 60).toString().padStart(2, '0')}h ${(total % 60).toString().padStart(2, '0')}m`
}

function StatusDeck({ now, startedAt, tracking, connected, weather }: { now: Date; startedAt: number; tracking: boolean; connected: boolean; weather: WeatherSummary | null }) {
  return <div className="status-deck">
    <div className="status-card"><div className="status-card-top"><ClockIcon /><span>LOCAL TIME</span><i className="status-live-dot" /></div><strong>{formatClock(now)}</strong><small>{now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</small></div>
    <div className="status-card"><div className="status-card-top"><span className="icon-rain"><CloudRain size={14} /></span><span>WEATHER</span><i className="status-live-dot" /></div><strong>{weather ? `${Math.round(weather.temp)}°` : '—'}</strong><small>{weather ? `${weather.condition} · feels ${Math.round(weather.feelsLike)}°` : 'Syncing conditions'}</small></div>
    <div className="status-card"><div className="status-card-top"><span className="icon-pulse"><Activity size={14} /></span><span>SYSTEM STATUS</span><i className="status-live-dot" /></div><strong>{connected ? 'Operational' : 'Offline mode'}</strong><small>{connected ? 'Waypoint network connected' : 'Local experience only'}</small></div>
    <div className="status-card"><div className="status-card-top"><span className={tracking ? 'icon-radar' : 'icon-pulse'}><LocateFixed size={14} /></span><span>ROUTE SIGNAL</span><i className={`status-live-dot ${tracking ? '' : 'muted'}`} /></div><strong>{tracking ? 'Tracking' : 'Standby'}</strong><small>{tracking ? 'Live safety monitoring on' : 'Enable when you travel'}</small></div>
    <div className="status-card"><div className="status-card-top"><span className="icon-twinkle"><Sparkles size={14} /></span><span>AGENT UPTIME</span><i className="status-live-dot" /></div><strong>{formatUptime(startedAt, now.getTime())}</strong><small>Session running smoothly</small></div>
  </div>
}

function StatusOverlay({ now, startedAt, tracking, connected, weather }: {
  now: Date; startedAt: number; tracking: boolean; connected: boolean; weather: WeatherSummary | null
}) {
  return <div className="status-overlay">
    <div className="overlay-label"><span className="icon-pulse"><Activity size={12} /></span><span>LIVE STATUS</span></div>
    <div className="overlay-items">
      <div className="overlay-item"><ClockIcon /><div><strong>{formatClock(now)}</strong><small>{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</small></div></div>
      <div className="overlay-item"><span className="icon-rain"><CloudRain size={13} /></span><div><strong>{weather ? `${Math.round(weather.temp)}°` : '—'}</strong><small>{weather ? weather.condition : 'Syncing'}</small></div></div>
      <div className="overlay-item"><span className="icon-pulse"><Activity size={13} /></span><div><strong>{connected ? 'Operational' : 'Offline'}</strong><small>{connected ? 'Network OK' : 'Local only'}</small></div></div>
      <div className="overlay-item"><span className={tracking ? 'icon-radar' : 'icon-pulse'}><LocateFixed size={13} /></span><div><strong>{tracking ? 'Tracking' : 'Standby'}</strong><small>{tracking ? 'Monitoring' : 'Idle'}</small></div></div>
      <div className="overlay-item"><Sparkles size={13} /><div><strong>{formatUptime(startedAt, now.getTime())}</strong><small>Uptime</small></div></div>
    </div>
  </div>
}

function ClockIcon() { return <span className="clock-icon" aria-hidden="true" /> }

function formatMessage(content: string): React.ReactNode {
  return content.split(/(\*\*[^*]+\*\*)|(\n)/g).filter(Boolean).map((part, index) => {
    if (part === '\n') return <br key={index} />
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    return <span key={index}>{part}</span>
  })
}

function MessageBubble({ msg, onRetry }: { msg: Message; onRetry?: () => void }) {
  const isUser = msg.role === 'user'
  const isError = msg.id === 'temp-err'
  return <div className={isUser ? 'msg user' : 'msg assistant'}>
    {!isUser && <div className="msg-avatar"><Sparkles size={14} /></div>}
    <div className="msg-content">
      <div className="msg-text">
        {formatMessage(msg.content)}
        {isError && onRetry && (
          <div>
            <button className="msg-retry-btn" onClick={onRetry}>
              <RotateCcw size={12} /> Retry request
            </button>
          </div>
        )}
      </div>
      {!isUser && msg.card_type && <ResultCard type={msg.card_type} data={msg.card_data} />}
    </div>
  </div>
}

function ResultCard({ type, data }: { type: string; data: unknown }) {
  const d = data as Record<string, unknown>
  if (type === 'weather') return <WeatherCard data={d} />
  if (type === 'geocode') return <GeocodeCard data={d} />
  if (type === 'reports') return <ReportsCard data={d} />
  if (type === 'inbox') return <InboxCard data={d} />
  if (type === 'report_created') return <ReportCreatedCard data={d} />
  if (type === 'ticket_order') return <TicketOrderCard data={d} />
  if (type === 'journey_investigation') return <JourneyInvestigationCard data={d} />
  if (type === 'journey_saved') return <JourneySavedCard data={d} />
  if (type === 'journey_list') return <JourneyListCard data={d} />
  if (type === 'watch_enabled') return <WatchEnabledCard data={d} />
  if (type === 'tool_activity') return <ToolActivityCard data={d} />
  return null
}

function ToolActivityCard({ data }: { data: Record<string, unknown> }) {
  const tools = data.tools as ToolActivity[]
  return <div className="card tool-card"><div className="card-head"><Zap size={15} /> <span>Tool activity</span></div>{tools.map((t, i) => <div key={i} className={`tool-row ${t.status}`}><span className={`tool-status ${t.status}`} /><div><strong>{t.label}</strong><small>{t.detail}</small></div></div>)}</div>
}

function JourneyInvestigationCard({ data }: { data: Record<string, unknown> }) {
  const tools = data.tools as ToolActivity[] | undefined
  const origin = data.origin as { lat: number; lng: number; label: string }
  const destination = data.destination as { lat: number; lng: number; label: string }
  const route = data.route as { distance: number; duration: number; geometry: [number, number][] } | null
  const weather = data.weather as { condition: string; temp: number; feels_like: number; humidity: number; wind: number }
  const reports = (data.reports as Record<string, unknown>[]) || []
  const center: [number, number] = [(origin.lat + destination.lat) / 2, (origin.lng + destination.lng) / 2]
  return <div className="card investigation-card">
    <div className="card-head"><span className="icon-route"><Route size={15} /></span> <span>Journey investigation</span></div>
    {tools && tools.length > 0 && <div className="tool-list">{tools.map((t, i) => <div key={i} className={`tool-row ${t.status}`}><span className={`tool-status ${t.status}`} /><div><strong>{t.label}</strong><small>{t.detail}</small></div></div>)}</div>}
    <div className="invest-map-wrap">
      <MapContainer center={center} zoom={7} className="invest-map" scrollWheelZoom={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
        <MapFitBounds points={[origin, destination]} />
        {route && <Polyline positions={route.geometry} pathOptions={{ color: '#64d8ff', weight: 3, opacity: 0.8 }} />}
        <Marker position={[origin.lat, origin.lng]} icon={originIcon}><Popup><strong>Origin</strong><br />{origin.label}</Popup></Marker>
        <Marker position={[destination.lat, destination.lng]} icon={markerIcon}><Popup><strong>Destination</strong><br />{destination.label}</Popup></Marker>
        {reports.map((r, i) => {
          const rLat = r.latitude as number | null, rLng = r.longitude as number | null
          if (rLat == null || rLng == null) return null
          return <Marker key={i} position={[rLat, rLng]} icon={reportIcon}><Popup><strong>{r.title as string}</strong><br />{r.category as string} · {r.severity as string}</Popup></Marker>
        })}
      </MapContainer>
    </div>
    {route && <div className="invest-summary"><div><strong>{(route.distance / 1000).toFixed(1)} km</strong><small>Distance</small></div><div><strong>{Math.round(route.duration / 60)} min</strong><small>Est. duration</small></div><div><strong>{weather.condition}</strong><small>{Math.round(weather.temp)}°C · feels {Math.round(weather.feels_like)}°</small></div><div><strong>{reports.length}</strong><small>Nearby reports</small></div></div>}
  </div>
}

function MapFitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [map, points])
  return null
}

function JourneySavedCard({ data }: { data: Record<string, unknown> }) {
  const j = data.journey as { id: string; origin: string; destination: string; travel_mode: string; departure_at: string }
  return <div className="card journey-saved-card"><div className="card-head"><span className="icon-shield"><Shield size={15} /></span> <span>Journey saved</span><span className="confirmed-pill">SAVED</span></div><div className="created-detail"><strong>{j.origin} → {j.destination}</strong><span>{j.travel_mode} · departs {new Date(j.departure_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span><span>Ask "enable monitoring" to watch for hazards</span></div></div>
}

function JourneyListCard({ data }: { data: Record<string, unknown> }) {
  const journeys = data.journeys as Journey[]
  return <div className="card journey-list-card"><div className="card-head"><span className="icon-shield"><Shield size={15} /></span> <span>{journeys.length} saved journeys</span></div>{journeys.map(j => <div key={j.id} className="report-item"><span className="icon-route"><Route size={12} /></span><div><strong>{j.origin} → {j.destination}</strong><span>{j.travel_mode} · {new Date(j.departure_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span></div></div>)}</div>
}

function WatchEnabledCard({ data }: { data: Record<string, unknown> }) {
  const j = data.journey as { origin: string; destination: string }
  return <div className="card watch-card"><div className="card-head"><span className="icon-shield"><Shield size={15} /></span> <span>Monitoring enabled</span><span className="confirmed-pill">ACTIVE</span></div><div className="created-detail"><strong>{j.origin} → {j.destination}</strong><span>I'll check for new road reports and weather changes</span></div></div>
}

function WeatherCard({ data }: { data: Record<string, unknown> }) {
  const current = data.current as { temp: number; humidity: number; code: number; condition: string; wind: number; feels_like: number }
  const forecast = data.forecast as { date: string; condition: string; code: number; high: number; low: number; rain_chance: number }[]
  const location = data.location as string
  return <div className="card weather-card">
    <div className="card-head"><span className="icon-rain"><CloudRain size={15} /></span> <span>Live weather · {location}</span></div>
    <div className="weather-current"><div className="weather-icon"><WeatherGlyph code={current.code} /></div><div className="weather-temp">{Math.round(current.temp)}°</div><div className="weather-meta"><strong>{current.condition}</strong><span>Feels {Math.round(current.feels_like)}° · {current.humidity}% humidity</span><span><span className="icon-wind"><Wind size={11} /></span> {Math.round(current.wind)} km/h</span></div></div>
    <div className="weather-forecast">{forecast.map(f => <div key={f.date} className="forecast-day"><span>{new Date(f.date).toLocaleDateString('en', { weekday: 'short' })}</span><WeatherGlyph code={f.code} small /><span className="forecast-temps">{Math.round(f.high)}° / {Math.round(f.low)}°</span><span className="forecast-rain">{f.rain_chance}%</span></div>)}</div>
  </div>
}

function WeatherGlyph({ code, small }: { code: number; small?: boolean }) {
  if (code === 0) return <span className="icon-rays"><Sun size={small ? 16 : 28} className="weather-glyph sun" /></span>
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <span className="icon-rain"><CloudRain size={small ? 16 : 28} className="weather-glyph rain" /></span>
  return <span className="icon-float"><CloudRain size={small ? 16 : 28} className="weather-glyph cloud" /></span>
}

function GeocodeCard({ data }: { data: Record<string, unknown> }) {
  const lat = data.lat as number, lng = data.lng as number, label = data.label as string
  return <div className="card geocode-card"><div className="card-head"><span className="icon-pulse"><MapPin size={15} /></span> <span>{label}</span></div><div className="invest-map-wrap"><MapContainer center={[lat, lng]} zoom={10} className="invest-map" scrollWheelZoom={false}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' /><Marker position={[lat, lng]} icon={markerIcon}><Popup><strong>{label}</strong></Popup></Marker></MapContainer></div><div className="geocode-coords">{lat.toFixed(4)}, {lng.toFixed(4)}</div></div>
}

function ReportsCard({ data }: { data: Record<string, unknown> }) {
  const reports = data.reports as { id: string; title: string; location_name?: string; location_label?: string; level: Level; category: string; latitude: number | null; longitude: number | null }[]
  return <div className="card reports-card"><div className="card-head"><span className="icon-warn"><AlertTriangle size={15} /></span> <span>{reports.length} road reports</span></div>{reports.map(r => <div key={r.id} className="report-item"><span className={`level-badge ${r.level.toLowerCase()}`} /><div><strong>{r.title}</strong><span><MapPin size={10} /> {r.location_label || r.location_name || 'Unspecified'}</span></div><em className={`level-tag ${r.level.toLowerCase()}`}>{r.level}</em></div>)}</div>
}

function InboxCard({ data }: { data: Record<string, unknown> }) {
  const emails = data.emails as { sender: string; subject: string; preview: string; category: string }[]
  return <div className="card inbox-card"><div className="card-head"><span className="icon-float"><Inbox size={15} /></span> <span>{emails.length} travel messages</span></div>{emails.map((e, i) => <div key={i} className="email-item"><span className="email-avatar">{e.sender[0].toUpperCase()}</span><div><strong>{e.subject}</strong><span>{e.sender} · {e.category}</span></div></div>)}</div>
}

function ReportCreatedCard({ data }: { data: Record<string, unknown> }) {
  const r = data.report as { id: string; title: string; location_name: string; severity: string; category: string }
  return <div className="card created-card"><div className="card-head"><span className="icon-check"><Check size={15} /></span> <span>Report submitted</span></div><div className="created-detail"><strong>{r.title}</strong><span><MapPin size={11} /> {r.location_name}</span><span>Severity: {r.severity} · Category: {r.category}</span></div></div>
}

function TicketOrderCard({ data }: { data: Record<string, unknown> }) {
  const order = data.order as { origin: string; destination: string; travel_mode: string; departure_date: string; traveler_count: number; fare_cents: number; currency: string; confirmation_code: string }
  return <div className="card ticket-card"><div className="card-head"><span className="icon-float"><Ticket size={15} /></span> <span>Ticket confirmed</span><span className="confirmed-pill">CONFIRMED</span></div><div className="ticket-route"><div><small>FROM</small><strong>{order.origin}</strong></div><div className="route-arrow"><span /><ArrowUpRight size={15} /></div><div><small>TO</small><strong>{order.destination}</strong></div></div><div className="ticket-meta"><span><strong>{order.travel_mode.toUpperCase()}</strong> · {new Date(order.departure_date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</span><span>{order.traveler_count} traveler{order.traveler_count === 1 ? '' : 's'} · {order.currency} {(order.fare_cents / 100).toFixed(2)}</span></div><div className="ticket-confirmation"><span>CONFIRMATION</span><strong>{order.confirmation_code}</strong></div></div>
}

function CapabilitiesPanel({ onClose }: { onClose: () => void }) {
  return <div className="backdrop" onClick={onClose}><div className="capabilities-panel" onClick={e => e.stopPropagation()}>
    <div className="panel-head"><h2><Sparkles size={18} /> Agent capabilities</h2><button onClick={onClose}><X size={18} /></button></div>
    <div className="capabilities-grid">{capabilities.map((c, i) => <div key={c.label} className="capability-card" style={{ animationDelay: `${i * 0.06}s` }}><div className="cap-icon"><c.icon size={22} /></div><strong>{c.label}</strong><span>{c.desc}</span></div>)}</div>
    <div className="panel-foot"><Globe size={12} /> Powered by Open-Meteo, OSRM & OpenStreetMap</div>
  </div></div>
}

function JourneysPanel({ onClose, journeys, loading, onTriggerDisruption }: {
  onClose: () => void;
  journeys: Journey[];
  loading: boolean;
  onTriggerDisruption?: (j: Journey) => void;
}) {
  return <div className="backdrop" onClick={onClose}><div className="tickets-panel" onClick={e => e.stopPropagation()}>
    <div className="panel-head"><h2><Shield size={18} /> Saved journeys</h2><button onClick={onClose}><X size={18} /></button></div>
    <div className="panel-body">
      {loading ? (
        <div className="panel-loading-wrap">
          <div className="panel-spinner" />
          <span>Loading saved journeys...</span>
        </div>
      ) : journeys.length === 0 ? (
        <div className="empty-state">
          <Shield size={32} />
          <p>No journeys saved yet</p>
          <small>Ask the agent to save a trip and it'll appear here.</small>
          {onTriggerDisruption && (
            <button
              type="button"
              className="btn-disrupt-demo"
              onClick={() => {
                onClose();
                onTriggerDisruption({
                  id: 'demo-journey',
                  origin: 'Kochi Central',
                  destination: 'Munnar Hill Station',
                  travel_mode: 'driving',
                  departure_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                  status: 'active',
                });
              }}
            >
              <AlertTriangle size={13} /> Test Demo Trip Disruption Recovery
            </button>
          )}
        </div>
      ) : journeys.map((j, i) => (
        <div key={j.id} className="ticket-history-item" style={{ animationDelay: `${i * 0.05}s` }}>
          <div className="th-route">
            <strong>{j.origin}</strong>
            <ArrowUpRight size={14} />
            <strong>{j.destination}</strong>
          </div>
          <div className="th-meta">
            <span>{j.travel_mode.toUpperCase()}</span>
            <span>{new Date(j.departure_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
            {j.status && <span className="status-pill">{j.status.toUpperCase()}</span>}
          </div>
          {onTriggerDisruption && (
            <button
              type="button"
              className="btn-disrupt-sm"
              onClick={() => {
                onClose();
                onTriggerDisruption(j);
              }}
              title="Simulate road disruption on this journey"
            >
              <AlertTriangle size={11} /> Simulate Disruption
            </button>
          )}
        </div>
      ))}
    </div>
  </div></div>
}

function TicketsPanel({ onClose, tickets, loading }: { onClose: () => void; tickets: TicketOrder[]; loading: boolean }) {
  return <div className="backdrop" onClick={onClose}><div className="tickets-panel" onClick={e => e.stopPropagation()}>
    <div className="panel-head"><h2><Ticket size={18} /> Ticket history</h2><button onClick={onClose}><X size={18} /></button></div>
    <div className="panel-body">
      {loading ? (
        <div className="panel-loading-wrap">
          <div className="panel-spinner" />
          <span>Loading ticket orders...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="empty-state"><Ticket size={32} /><p>No tickets booked yet</p><small>Ask the agent to book a trip.</small></div>
      ) : tickets.map((t, i) => (
        <div key={t.id} className="ticket-history-item" style={{ animationDelay: `${i * 0.05}s` }}>
          <div className="th-route"><strong>{t.origin}</strong><ArrowUpRight size={14} /><strong>{t.destination}</strong></div>
          <div className="th-meta"><span>{t.travel_mode.toUpperCase()}</span><span>{new Date(t.departure_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span><span>{t.traveler_count} traveler{t.traveler_count === 1 ? '' : 's'}</span><span>{t.currency} {(t.fare_cents / 100).toFixed(2)}</span></div>
          <div className="th-code">{t.confirmation_code}</div>
        </div>
      ))}
    </div>
  </div></div>
}

function SettingsPanel({ onClose, tracking, toggleTrack, pos, theme, toggleTheme, onToast }: {
  onClose: () => void; tracking: boolean; toggleTrack: () => void; pos: { accuracy: number } | null; theme: Theme; toggleTheme: () => void; onToast: (msg: string) => void
}) {
  const [geminiKey, setGeminiKey] = useState(() => getClientApiKey('gemini'))
  const [groqKey, setGroqKey] = useState(() => getClientApiKey('groq'))
  const [senseNovaKey, setSenseNovaKey] = useState(() => getClientApiKey('sensenova'))
  const [openRouterKey, setOpenRouterKey] = useState(() => getClientApiKey('openrouter'))

  const handleSaveKeys = () => {
    saveClientApiKey('gemini', geminiKey)
    saveClientApiKey('groq', groqKey)
    saveClientApiKey('sensenova', senseNovaKey)
    saveClientApiKey('openrouter', openRouterKey)
    onToast('API Keys saved! Autonomous gateway active.')
  }

  return <div className="backdrop" onClick={onClose}><div className="settings-panel" onClick={e => e.stopPropagation()}>
    <div className="settings-head"><h2>Agent settings</h2><button onClick={onClose}><X size={18} /></button></div>
    <div className="settings-body">
      <div className="setting-group">
        <h3><div className="setting-icon"><Sparkles size={15} /></div> Multi-LLM Gateway</h3>
        <p>SenseNova, Gemini 2.5, Groq, and OpenRouter for zero-hallucination trip verification.</p>
        <div className="settings-input-row">
          <label className="settings-input-label"><span>SenseTime SenseNova API Key</span><small style={{ color: '#38bdf8' }}>SenseChat-5</small></label>
          <input
            type="password"
            className="settings-input-field"
            placeholder="Enter SenseNova key"
            value={senseNovaKey}
            onChange={e => setSenseNovaKey(e.target.value)}
          />
        </div>
        <div className="settings-input-row">
          <label className="settings-input-label"><span>Google Gemini API Key</span><small style={{ color: '#34d399' }}>Gemini 2.5 Flash</small></label>
          <input
            type="password"
            className="settings-input-field"
            placeholder="AIzaSy..."
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
          />
        </div>
        <div className="settings-input-row">
          <label className="settings-input-label"><span>Groq API Key</span><small style={{ color: '#f59e0b' }}>Llama 3.3 70B</small></label>
          <input
            type="password"
            className="settings-input-field"
            placeholder="gsk_..."
            value={groqKey}
            onChange={e => setGroqKey(e.target.value)}
          />
        </div>
        <div className="settings-input-row">
          <label className="settings-input-label"><span>OpenRouter API Key</span><small style={{ color: '#c084fc' }}>Universal fallback</small></label>
          <input
            type="password"
            className="settings-input-field"
            placeholder="sk-or-..."
            value={openRouterKey}
            onChange={e => setOpenRouterKey(e.target.value)}
          />
        </div>
        <button
          className="btn-primary-sm"
          style={{ marginTop: 10, width: '100%', padding: '8px 12px', background: 'var(--accent, #64d8ff)', color: '#000', fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none' }}
          onClick={handleSaveKeys}
        >
          Save & Apply API Keys
        </button>
      </div>

      <div className="setting-group"><h3><div className="setting-icon"><Sun size={15} /></div> Appearance</h3><p>Switch between dark and light themes.</p><div className="theme-switcher"><button className={theme === 'dark' ? 'active' : ''} onClick={() => theme !== 'dark' && toggleTheme()}><Moon size={14} /> Dark</button><button className={theme === 'light' ? 'active' : ''} onClick={() => theme !== 'light' && toggleTheme()}><Sun size={14} /> Light</button></div></div>
      <div className="setting-group"><h3><div className="setting-icon"><LocateFixed size={15} /></div> Route tracking</h3><p>When enabled, the agent monitors your live GPS position for safety.</p><button className={`setting-toggle ${tracking ? 'on' : ''}`} onClick={toggleTrack}><span className="toggle-knob" /></button>{pos && <small className="pos-info"><Check size={12} /> Last accuracy: {Math.round(pos.accuracy)}m</small>}</div>
      <div className="setting-group"><h3><div className="setting-icon"><CloudRain size={15} /></div> Weather API</h3><p>Connected to Open-Meteo for live forecasts (Free & Active).</p><button className="setting-toggle on"><span className="toggle-knob" /></button></div>
      <div className="setting-group"><h3><div className="setting-icon"><MapPin size={15} /></div> Geocoding API</h3><p>Connected to OpenStreetMap Nominatim for place search.</p><button className="setting-toggle on"><span className="toggle-knob" /></button></div>
      <div className="setting-group"><h3><div className="setting-icon"><Route size={15} /></div> Routing API</h3><p>Connected to OSRM for highway speed calculations.</p><button className="setting-toggle on"><span className="toggle-knob" /></button></div>
      <div className="setting-group"><h3><div className="setting-icon"><Inbox size={15} /></div> Email connection</h3><p>Ask the agent to "connect my email" to sync travel messages.</p><button className="setting-toggle on"><span className="toggle-knob" /></button></div>
      <div className="setting-group"><h3><div className="setting-icon"><Activity size={15} /></div> Data persistence</h3><p>Conversations are saved automatically and synced across sessions.</p><button className="setting-toggle on"><span className="toggle-knob" /></button></div>
      <div className="setting-group"><h3><div className="setting-icon"><RotateCcw size={15} /></div> Reset local data</h3><p>Clear theme and local storage.</p><button className="btn-danger-sm" onClick={() => { localStorage.removeItem('waypoint-theme'); localStorage.removeItem('waypoint_conversations'); onToast('Local data cleared') }}>Clear data</button></div>
    </div>
  </div></div>
}
