import { supabase } from '@/lib/supabase';

export type StepName =
  | 'Understanding request'
  | 'Finding destination'
  | 'Checking weather'
  | 'Estimating route'
  | 'Checking disruptions'
  | 'Comparing options'
  | 'Preparing recommendation'
  | 'Drafting message'
  | 'Waiting for approval';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type RunStatus = 'running' | 'completed' | 'failed' | 'recovering';

export interface AgentStepItem {
  id: string;
  run_id: string;
  sequence: number;
  name: StepName;
  status: StepStatus;
  result?: string | null;
  error?: string | null;
  started_at: string;
  finished_at?: string | null;
}

export interface AgentRunItem {
  id: string;
  user_id?: string | null;
  goal: string;
  status: RunStatus;
  started_at: string;
  finished_at?: string | null;
  provider: string;
  model: string;
  error?: string | null;
  steps: AgentStepItem[];
}

type ActivityListener = (runs: AgentRunItem[]) => void;

class AgentActivityManager {
  private runs: AgentRunItem[] = [];
  private listeners: Set<ActivityListener> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('waypoint_agent_runs');
      if (stored) {
        this.runs = JSON.parse(stored);
      }
    } catch {
      this.runs = [];
    }
  }

  private persistLocal() {
    try {
      localStorage.setItem('waypoint_agent_runs', JSON.stringify(this.runs.slice(0, 30)));
    } catch {}
    this.notify();
  }

  public subscribe(listener: ActivityListener): () => void {
    this.listeners.add(listener);
    listener(this.runs);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const copy = [...this.runs];
    this.listeners.forEach(fn => fn(copy));
  }

  public getRuns(): AgentRunItem[] {
    return [...this.runs];
  }

  public async fetchDbRuns(userId?: string | null) {
    if (!supabase) return;
    try {
      let query = supabase.from('agent_runs').select('*').order('created_at', { ascending: false }).limit(20);
      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.is('user_id', null);
      }
      const { data: runsData } = await query;
      if (runsData && runsData.length > 0) {
        const runIds = runsData.map(r => r.id);
        const { data: stepsData } = await supabase
          .from('agent_steps')
          .select('*')
          .in('run_id', runIds)
          .order('sequence', { ascending: true });

        const mapped: AgentRunItem[] = runsData.map(r => ({
          id: r.id,
          user_id: r.user_id,
          goal: r.goal,
          status: r.status as RunStatus,
          started_at: r.started_at,
          finished_at: r.finished_at,
          provider: r.provider || 'gemini',
          model: r.model || 'gemini-1.5-flash',
          error: r.error,
          steps: (stepsData || []).filter(s => s.run_id === r.id).map(s => ({
            id: s.id,
            run_id: s.run_id,
            sequence: s.sequence,
            name: s.name as StepName,
            status: s.status as StepStatus,
            result: s.result,
            error: s.error,
            started_at: s.started_at,
            finished_at: s.finished_at,
          })),
        }));

        this.runs = mapped;
        this.persistLocal();
      }
    } catch (err) {
      console.warn('Could not sync agent runs from Supabase:', err);
    }
  }

  public async createRun(goal: string, stepNames: StepName[], userId?: string | null, provider = 'gemini', model = 'gemini-1.5-flash'): Promise<string> {
    const runId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const initialSteps: AgentStepItem[] = stepNames.map((name, idx) => ({
      id: crypto.randomUUID(),
      run_id: runId,
      sequence: idx + 1,
      name,
      status: idx === 0 ? 'running' : 'pending',
      result: null,
      error: null,
      started_at: nowIso,
      finished_at: null,
    }));

    const newRun: AgentRunItem = {
      id: runId,
      user_id: userId || null,
      goal,
      status: 'running',
      started_at: nowIso,
      finished_at: null,
      provider,
      model,
      error: null,
      steps: initialSteps,
    };

    this.runs = [newRun, ...this.runs];
    this.persistLocal();

    // Persist to Supabase in background
    if (supabase) {
      void supabase.from('agent_runs').insert({
        id: runId,
        user_id: userId || null,
        goal,
        status: 'running',
        started_at: nowIso,
        provider,
        model,
      }).then(async () => {
        if (!supabase) return;
        await supabase.from('agent_steps').insert(
          initialSteps.map(s => ({
            id: s.id,
            run_id: runId,
            sequence: s.sequence,
            name: s.name,
            status: s.status,
            started_at: s.started_at,
          }))
        );
      });
    }

    return runId;
  }

  public setStepRunning(runId: string, name: StepName) {
    const run = this.runs.find(r => r.id === runId);
    if (!run) return;
    const step = run.steps.find(s => s.name === name);
    if (!step) return;

    step.status = 'running';
    step.started_at = new Date().toISOString();
    this.persistLocal();

    if (supabase) {
      void supabase.from('agent_steps').update({
        status: 'running',
        started_at: step.started_at,
      }).eq('id', step.id);
    }
  }

  public setStepCompleted(runId: string, name: StepName, resultMessage?: string) {
    const run = this.runs.find(r => r.id === runId);
    if (!run) return;
    const step = run.steps.find(s => s.name === name);
    if (!step) return;

    step.status = 'completed';
    step.result = resultMessage || 'Done';
    step.finished_at = new Date().toISOString();
    this.persistLocal();

    if (supabase) {
      void supabase.from('agent_steps').update({
        status: 'completed',
        result: step.result,
        finished_at: step.finished_at,
      }).eq('id', step.id);
    }
  }

  public setStepFailed(runId: string, name: StepName, errorMessage: string) {
    const run = this.runs.find(r => r.id === runId);
    if (!run) return;
    const step = run.steps.find(s => s.name === name);
    if (!step) return;

    step.status = 'failed';
    step.error = errorMessage;
    step.finished_at = new Date().toISOString();
    run.status = 'failed';
    run.error = `Failed at step "${name}": ${errorMessage}`;
    this.persistLocal();

    if (supabase) {
      void supabase.from('agent_steps').update({
        status: 'failed',
        error: errorMessage,
        finished_at: step.finished_at,
      }).eq('id', step.id);

      void supabase.from('agent_runs').update({
        status: 'failed',
        error: run.error,
        finished_at: step.finished_at,
      }).eq('id', runId);
    }
  }

  public setStepSkipped(runId: string, name: StepName, reason = 'Skipped') {
    const run = this.runs.find(r => r.id === runId);
    if (!run) return;
    const step = run.steps.find(s => s.name === name);
    if (!step) return;

    step.status = 'skipped';
    step.result = reason;
    step.finished_at = new Date().toISOString();
    this.persistLocal();

    if (supabase) {
      void supabase.from('agent_steps').update({
        status: 'skipped',
        result: reason,
        finished_at: step.finished_at,
      }).eq('id', step.id);
    }
  }

  public completeRun(runId: string) {
    const run = this.runs.find(r => r.id === runId);
    if (!run) return;

    run.status = 'completed';
    run.finished_at = new Date().toISOString();
    this.persistLocal();

    if (supabase) {
      void supabase.from('agent_runs').update({
        status: 'completed',
        finished_at: run.finished_at,
      }).eq('id', runId);
    }
  }

  public failRun(runId: string, error: string) {
    const run = this.runs.find(r => r.id === runId);
    if (!run) return;

    run.status = 'failed';
    run.error = error;
    run.finished_at = new Date().toISOString();
    this.persistLocal();

    if (supabase) {
      void supabase.from('agent_runs').update({
        status: 'failed',
        error,
        finished_at: run.finished_at,
      }).eq('id', runId);
    }
  }

  public clearLocal() {
    this.runs = [];
    localStorage.removeItem('waypoint_agent_runs');
    this.notify();
  }
}

export const agentActivity = new AgentActivityManager();
