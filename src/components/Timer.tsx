import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Square, Coffee, LogIn, LogOut as LogOutIcon, Plus, CheckCircle2, Circle, Trash2 } from "lucide-react";

interface TimerProps {
  projectId?: string;
  onEntryCreated?: () => void;
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
};
const formatHM = (seconds: number) => {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const Timer = ({ projectId, onEntryCreated }: TimerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [mode, setMode] = useState<"work" | "break">("work");
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [newTaskName, setNewTaskName] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [timeInElapsed, setTimeInElapsed] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeInIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenshotTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Attendance: fully DB-driven, cross-device ──
  const { data: attendance, refetch: refetchAttendance } = useQuery({
    queryKey: ["my_attendance", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("time_in_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const timedIn = !!attendance?.time_in_at;
  const timeInStamp = attendance?.time_in_at ? new Date(attendance.time_in_at) : null;

  // Live ticker for Time In elapsed — recalculates from DB timestamp every second
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

  const timeInMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("attendance")
        .upsert({ user_id: user!.id, time_in_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_attendance"] });
      refetchAttendance();
      toast({ title: "Timed In!", description: `Started at ${new Date().toLocaleTimeString()}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const timeOutMutation = useMutation({
    mutationFn: async () => {
      if (!timeInStamp || !user) throw new Error("Not timed in");
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - timeInStamp.getTime()) / 1000);

      // Save the full attendance session as a time entry
      const { error: entryError } = await supabase.from("time_entries").insert({
        user_id: user.id,
        task_id: null,
        project_id: projectId || null,
        start_time: timeInStamp.toISOString(),
        end_time: endTime.toISOString(),
        duration_seconds: durationSeconds,
        description: "Attendance: Time In / Time Out",
      });
      if (entryError) throw entryError;

      // Remove attendance row
      const { error: delError } = await supabase.from("attendance").delete().eq("user_id", user.id);
      if (delError) throw delError;

      return durationSeconds;
    },
    onSuccess: (durationSeconds) => {
      queryClient.invalidateQueries({ queryKey: ["my_attendance"] });
      refetchAttendance();
      onEntryCreated?.();
      toast({ title: "Timed Out!", description: `Total: ${formatTime(durationSeconds)}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Screenshot interval ──
  const { data: screenshotInterval = 600 } = useQuery({
    queryKey: ["profile_screenshot_interval", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("screenshot_interval").eq("user_id", user!.id).single();
      if (error) return 600;
      return data.screenshot_interval ?? 600;
    },
    enabled: !!user,
  });

  // ── Tasks ──
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*").order("created_at", { ascending: false });
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

  const createTaskMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("tasks").insert({ user_id: user.id, name, category: "Other", project_id: projectId || null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setNewTaskName(""); setShowAddTask(false);
      toast({ title: "Task added!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from("tasks").update({ is_completed: completed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  // ── Work timer ──
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

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
    setStartTime(new Date()); setElapsed(0); setIsRunning(true);
    if (user) {
      await supabase.from("active_timers").upsert({
        user_id: user.id, started_at: new Date().toISOString(),
        task_id: activeTaskId || null, project_id: projectId || null, mode,
      }, { onConflict: "user_id" });
    }
  };

  const handleStop = async () => {
    setIsRunning(false);
    if (user) await supabase.from("active_timers").delete().eq("user_id", user.id);
    if (!startTime || !user) return;
    if (mode === "work") {
      const endTime = new Date();
      const { error } = await supabase.from("time_entries").insert({
        user_id: user.id, task_id: activeTaskId || null, project_id: projectId || null,
        start_time: startTime.toISOString(), end_time: endTime.toISOString(),
        duration_seconds: elapsed, screenshot_interval: screenshotInterval,
      });
      if (error) { toast({ title: "Error saving", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Time entry saved!" }); queryClient.invalidateQueries({ queryKey: ["task_durations"] }); onEntryCreated?.(); }
    } else {
      toast({ title: "Break ended", description: `Break lasted ${formatTime(elapsed)}` });
    }
    setElapsed(0); setStartTime(null);
  };

  const isBreak = mode === "break";

  return (
    <div className="glass-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Cadence Clock</h3>
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

      {/* Controls */}
      <div className="flex justify-center gap-3">
        {isRunning ? (
          <Button onClick={handleStop} variant="destructive" size="lg" className="gap-2"><Square className="h-4 w-4" /> Stop</Button>
        ) : (
          <Button onClick={handleStart} size="lg" className={`gap-2 ${isBreak ? "bg-warning text-warning-foreground hover:bg-warning/90" : "gradient-primary"}`}>
            <Play className="h-4 w-4" /> {isBreak ? "Start Break" : "Start"}
          </Button>
        )}
      </div>

      {/* Tasks */}
      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Tasks</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddTask((v) => !v)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {showAddTask && (
          <div className="flex gap-2">
            <Input placeholder="New task name..." value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newTaskName.trim() && createTaskMutation.mutate(newTaskName.trim())}
              className="bg-secondary border-border text-sm h-8" autoFocus />
            <Button size="sm" onClick={() => newTaskName.trim() && createTaskMutation.mutate(newTaskName.trim())} disabled={!newTaskName.trim()} className="gradient-primary h-8 px-3">Add</Button>
          </div>
        )}
        <div className="space-y-1 max-h-[260px] overflow-y-auto">
          {tasks.map((t) => {
            const tracked = ((taskDurations as any)[t.id] || 0) + (isRunning && activeTaskId === t.id ? elapsed : 0);
            const isActive = activeTaskId === t.id;
            return (
              <div key={t.id} className={`flex items-center group gap-2 px-2 py-1.5 rounded-md transition-colors ${isActive ? "bg-accent" : "hover:bg-secondary"}`}>
                <button onClick={() => toggleTaskMutation.mutate({ id: t.id, completed: !t.is_completed })} className="flex-shrink-0">
                  {t.is_completed ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                </button>
                <button onClick={() => setActiveTaskId(isActive ? undefined : t.id)} className="flex-1 text-left">
                  <span className={`text-sm ${isActive ? "text-accent-foreground font-medium" : "text-foreground"}`}>{t.name}</span>
                  {t.category && <span className="block text-xs text-muted-foreground">{t.category}</span>}
                </button>
                {tracked > 0 && <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{formatHM(tracked)}</span>}
                <Button variant="ghost" size="icon" onClick={() => deleteTaskMutation.mutate(t.id)} className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
          {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks yet — add one above</p>}
        </div>
        {activeTaskId && <p className="text-xs text-primary text-center">Tracking: <span className="font-medium">{tasks.find(t => t.id === activeTaskId)?.name}</span></p>}
      </div>

      {/* Attendance — fully DB-driven, works across devices */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Attendance</p>
            {timedIn && timeInStamp ? (
              <div>
                <p className="text-xs text-muted-foreground">In since {timeInStamp.toLocaleTimeString()}</p>
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
