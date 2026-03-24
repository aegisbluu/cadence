import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Play, Square, Coffee, LogIn, LogOut as LogOutIcon, ChevronDown, CheckCircle2, Circle } from "lucide-react";

interface TimerProps {
  projectId?: string;
  onEntryCreated?: () => void;
}

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
};
const formatHM = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const Timer = ({ projectId, onEntryCreated }: TimerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Work timer — DB-persisted so it survives logout/device switch
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState<"work" | "break">("work");
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [taskDropdownOpen, setTaskDropdownOpen] = useState(false);
  const [timeInElapsed, setTimeInElapsed] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeInIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenshotTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Cadence Clock: restore from active_timers on mount (cross-device) ──
  const { data: activeTimer, refetch: refetchActiveTimer } = useQuery({
    queryKey: ["my_active_timer", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("active_timers")
        .select("*, tasks(name)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // On load: if there's a running timer in DB, restore it
  useEffect(() => {
    if (activeTimer && !isRunning) {
      const secondsElapsed = Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000);
      setElapsed(secondsElapsed);
      setMode(activeTimer.mode as "work" | "break");
      setActiveTaskId(activeTimer.task_id || undefined);
      setIsRunning(true);
    }
  }, [activeTimer]);

  // ── Attendance: DB-driven, cross-device ──
  const { data: attendance, refetch: refetchAttendance } = useQuery({
    queryKey: ["my_attendance", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("time_in_at").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const timedIn = !!attendance?.time_in_at;
  const timeInStamp = attendance?.time_in_at ? new Date(attendance.time_in_at) : null;

  // Time In live ticker
  useEffect(() => {
    if (timedIn && timeInStamp) {
      const tick = () => setTimeInElapsed(Math.floor((Date.now() - timeInStamp.getTime()) / 1000));
      tick();
      timeInIntervalRef.current = setInterval(tick, 1000);
    } else {
      if (timeInIntervalRef.current) clearInterval(timeInIntervalRef.current);
      setTimeInElapsed(0);
    }
    return () => { if (timeInIntervalRef.current) clearInterval(timeInIntervalRef.current); };
  }, [timedIn, timeInStamp?.toISOString()]);

  // Work timer tick
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setTaskDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: screenshotInterval = 600 } = useQuery({
    queryKey: ["profile_screenshot_interval", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("screenshot_interval").eq("user_id", user!.id).single();
      if (error) return 600;
      return data.screenshot_interval ?? 600;
    },
    enabled: !!user,
  });

  // Tasks from admin panel (all tasks, filtered by project if selected)
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*").eq("is_completed", false).order("created_at", { ascending: false });
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: taskDurations = {} } = useQuery({
    queryKey: ["task_durations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("time_entries").select("task_id, duration_seconds").eq("user_id", user!.id).not("task_id", "is", null);
      if (error) return {};
      const totals: Record<string, number> = {};
      for (const entry of data) {
        if (entry.task_id) totals[entry.task_id] = (totals[entry.task_id] || 0) + (entry.duration_seconds || 0);
      }
      return totals;
    },
    enabled: !!user,
  });

  const takeScreenshot = useCallback(async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#1a1a2e"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff"; ctx.font = "20px Inter";
        ctx.fillText(`Screenshot taken at ${new Date().toLocaleTimeString()}`, 20, 40);
        ctx.fillText(`Timer: ${formatTime(elapsed)}`, 20, 70);
      }
      toast({ title: "Screenshot captured", description: `Next in ${screenshotInterval / 60} min` });
    } catch { toast({ title: "Screenshot failed", variant: "destructive" }); }
  }, [elapsed, screenshotInterval, toast]);

  useEffect(() => {
    if (isRunning && mode === "work" && screenshotInterval > 0) {
      screenshotTimerRef.current = setInterval(takeScreenshot, screenshotInterval * 1000);
    }
    return () => { if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current); };
  }, [isRunning, mode, screenshotInterval, takeScreenshot]);

  const handleStart = async () => {
    if (!activeTaskId && mode === "work") {
      toast({ title: "Select a task first", description: "Please pick a task before starting the timer.", variant: "destructive" });
      return;
    }
    const now = new Date();
    setElapsed(0); setIsRunning(true);
    if (user) {
      await supabase.from("active_timers").upsert({
        user_id: user.id, started_at: now.toISOString(),
        task_id: activeTaskId || null, project_id: projectId || null, mode,
      }, { onConflict: "user_id" });
    }
  };

  const handleStop = async () => {
    if (!activeTaskId && mode === "work") return; // guard: can't stop without a task
    setIsRunning(false);
    const startedAt = activeTimer?.started_at ? new Date(activeTimer.started_at) : new Date(Date.now() - elapsed * 1000);
    if (user) await supabase.from("active_timers").delete().eq("user_id", user.id);
    if (!user) return;
    if (mode === "work") {
      const endTime = new Date();
      const { error } = await supabase.from("time_entries").insert({
        user_id: user.id, task_id: activeTaskId || null, project_id: projectId || null,
        start_time: startedAt.toISOString(), end_time: endTime.toISOString(),
        duration_seconds: elapsed, screenshot_interval: screenshotInterval,
      });
      if (error) { toast({ title: "Error saving", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Time entry saved!" }); queryClient.invalidateQueries({ queryKey: ["task_durations"] }); onEntryCreated?.(); }
    } else { toast({ title: "Break ended", description: `Break lasted ${formatTime(elapsed)}` }); }
    setElapsed(0);
    refetchActiveTimer();
  };

  const timeInMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("attendance").upsert({ user_id: user!.id, time_in_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["my_attendance"] }); refetchAttendance(); toast({ title: "Timed In!", description: `Started at ${new Date().toLocaleTimeString()}` }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const timeOutMutation = useMutation({
    mutationFn: async () => {
      if (!timeInStamp || !user) throw new Error("Not timed in");
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - timeInStamp.getTime()) / 1000);
      const { error: entryError } = await supabase.from("time_entries").insert({
        user_id: user.id, task_id: null, project_id: projectId || null,
        start_time: timeInStamp.toISOString(), end_time: endTime.toISOString(),
        duration_seconds: durationSeconds, description: "Attendance: Time In / Time Out",
      });
      if (entryError) throw entryError;
      const { error: delError } = await supabase.from("attendance").delete().eq("user_id", user.id);
      if (delError) throw delError;
      return durationSeconds;
    },
    onSuccess: (dur) => { queryClient.invalidateQueries({ queryKey: ["my_attendance"] }); refetchAttendance(); onEntryCreated?.(); toast({ title: "Timed Out!", description: `Total: ${formatTime(dur)}` }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isBreak = mode === "break";
  const activeTask = tasks.find(t => t.id === activeTaskId);
  const canStop = isBreak || !!activeTaskId;

  return (
    <div className="glass-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">Cadence Clock</h3>
          {/* Online indicator: green if timed in + clock running, yellow if timed in but clock idle, grey if not timed in */}
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            !timedIn ? "bg-muted-foreground/40" :
            isRunning ? "bg-green-500 animate-pulse" :
            "bg-yellow-400"
          }`} title={!timedIn ? "Offline" : isRunning ? "Online — tracking" : "Online — idle"} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant={!isBreak ? "default" : "outline"} size="sm" onClick={() => { if (!isRunning) setMode("work"); }} disabled={isRunning} className={!isBreak ? "gradient-primary" : ""}>
            <Play className="h-3 w-3 mr-1" /> Work
          </Button>
          <Button variant={isBreak ? "default" : "outline"} size="sm" onClick={() => { if (!isRunning) setMode("break"); }} disabled={isRunning} className={isBreak ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}>
            <Coffee className="h-3 w-3 mr-1" /> Break
          </Button>
        </div>
      </div>

      {/* Clock */}
      <div className="text-center">
        <div className={`timer-display text-5xl font-bold rounded-lg p-4 ${isRunning ? isBreak ? "text-warning animate-pulse" : "text-primary animate-pulse-glow glow-primary" : "text-foreground"}`}>
          {formatTime(elapsed)}
        </div>
        {isBreak && <p className="text-sm text-warning mt-1">☕ Break Mode</p>}
      </div>

      {/* Task dropdown — required before starting (work mode) */}
      {!isBreak && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setTaskDropdownOpen(v => !v)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
              activeTask ? "border-primary/50 bg-accent/30 text-foreground" : "border-border bg-secondary text-muted-foreground"
            } ${isRunning ? "opacity-60 cursor-not-allowed" : "hover:bg-secondary/80 cursor-pointer"}`}
            disabled={isRunning}
          >
            <div className="flex items-center gap-2 min-w-0">
              {activeTask
                ? <><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /><span className="truncate font-medium text-foreground">{activeTask.name}</span></>
                : <><Circle className="h-4 w-4 flex-shrink-0" /><span>Select a task to track…</span></>
              }
            </div>
            <ChevronDown className={`h-4 w-4 flex-shrink-0 ml-2 transition-transform ${taskDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {taskDropdownOpen && !isRunning && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              <div className="max-h-52 overflow-y-auto">
                <button
                  onClick={() => { setActiveTaskId(undefined); setTaskDropdownOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-secondary ${!activeTaskId ? "bg-accent/30 text-primary" : "text-muted-foreground"}`}
                >
                  <Circle className="h-3.5 w-3.5" /> None
                </button>
                {tasks.map(t => {
                  const tracked = ((taskDurations as any)[t.id] || 0);
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setActiveTaskId(t.id); setTaskDropdownOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-secondary ${activeTaskId === t.id ? "bg-accent/30 text-primary" : "text-foreground"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className={`h-3.5 w-3.5 flex-shrink-0 ${activeTaskId === t.id ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="truncate">{t.name}</span>
                        {t.category && <span className="text-xs text-muted-foreground flex-shrink-0">· {t.category}</span>}
                      </div>
                      {tracked > 0 && <span className="text-xs font-mono text-muted-foreground ml-2 flex-shrink-0">{formatHM(tracked)}</span>}
                    </button>
                  );
                })}
                {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks — add them in Admin Panel</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-3">
        {isRunning ? (
          <Button
            onClick={handleStop}
            variant="destructive"
            size="lg"
            className="gap-2"
            disabled={!canStop}
            title={!canStop ? "Select a task before stopping" : undefined}
          >
            <Square className="h-4 w-4" /> Stop
          </Button>
        ) : (
          <Button
            onClick={handleStart}
            size="lg"
            className={`gap-2 ${isBreak ? "bg-warning text-warning-foreground hover:bg-warning/90" : "gradient-primary"}`}
            disabled={!isBreak && !activeTaskId}
            title={!isBreak && !activeTaskId ? "Select a task first" : undefined}
          >
            <Play className="h-4 w-4" /> {isBreak ? "Start Break" : "Start"}
          </Button>
        )}
      </div>

      {/* Active task tracker info */}
      {isRunning && activeTask && (
        <p className="text-xs text-primary text-center">
          Tracking: <span className="font-medium">{activeTask.name}</span>
          {activeTaskId && (taskDurations as any)[activeTaskId] > 0 && (
            <span className="text-muted-foreground"> · {formatHM(((taskDurations as any)[activeTaskId] || 0) + elapsed)} total</span>
          )}
        </p>
      )}

      {/* Attendance — DB-driven, persists across devices & logout */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Attendance</p>
            {timedIn && timeInStamp ? (
              <div>
                <p className="text-xs text-muted-foreground">In since {timeInStamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                <p className="text-sm font-mono text-primary font-medium">{formatTime(timeInElapsed)}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not timed in</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => timeInMutation.mutate()} disabled={timedIn || timeInMutation.isPending} size="sm" className="gap-1 gradient-primary">
              <LogIn className="h-3 w-3" /> Time In
            </Button>
            <Button onClick={() => timeOutMutation.mutate()} disabled={!timedIn || timeOutMutation.isPending} size="sm" variant="destructive" className="gap-1">
              <LogOutIcon className="h-3 w-3" /> Time Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timer;
