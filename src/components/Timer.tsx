import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Square, Coffee, LogIn, LogOut as LogOutIcon, ChevronDown, CheckCircle2, Circle, Pencil, Save, X, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface TimerProps { onEntryCreated?: () => void; }

const fmt = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const fmtHM = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const parseDur = (str: string) => {
  const h = str.match(/(\d+)h/), m = str.match(/(\d+)m/);
  return ((h ? parseInt(h[1]) : 0) * 3600) + ((m ? parseInt(m[1]) : 0) * 60);
};

const Timer = ({ onEntryCreated }: TimerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState<"work" | "break">("work");
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [taskScope, setTaskScope] = useState("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [timeInElapsed, setTimeInElapsed] = useState(0);
  const [showNoTaskPrompt, setShowNoTaskPrompt] = useState(false);

  // editing today's entries
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDur, setEditDur] = useState("");
  const [editScope, setEditScope] = useState("");

  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const timeInRef = useRef<NodeJS.Timeout | null>(null);
  const ssRef = useRef<NodeJS.Timeout | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  // Track elapsed stably for screenshot callback without needing it in deps
  const elapsedRef = useRef(0);
  const activeTaskIdRef = useRef<string | undefined>(undefined);
  const tasksRef = useRef<any[]>([]);

  // Keep refs in sync
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
  useEffect(() => { activeTaskIdRef.current = activeTaskId; }, [activeTaskId]);

  // ── Restore clock from DB ──
  const { data: activeTimer, refetch: refetchTimer } = useQuery({
    queryKey: ["my_active_timer", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("active_timers").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const restoredRef = useRef(false);
  useEffect(() => {
    if (activeTimer && !restoredRef.current) {
      restoredRef.current = true;
      const s = Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000);
      setElapsed(s);
      const m = (activeTimer as any).is_break ? "break" : "work";
      setMode(m);
      if (!(activeTimer as any).is_break) setActiveTaskId((activeTimer as any).task_id || undefined);
      setIsRunning(true);
    }
  }, [activeTimer]);

  // ── Attendance ──
  const { data: attendance, refetch: refetchAtt } = useQuery({
    queryKey: ["my_attendance", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("time_in_at").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const timedIn = !!attendance?.time_in_at;
  const timeInStamp = attendance?.time_in_at ? new Date(attendance.time_in_at) : null;

  useEffect(() => {
    if (timedIn && timeInStamp) {
      const tick = () => setTimeInElapsed(Math.floor((Date.now() - timeInStamp.getTime()) / 1000));
      tick();
      timeInRef.current = setInterval(tick, 1000);
    } else {
      if (timeInRef.current) clearInterval(timeInRef.current);
      setTimeInElapsed(0);
    }
    return () => { if (timeInRef.current) clearInterval(timeInRef.current); };
  }, [timedIn, timeInStamp?.toISOString()]);

  // ── Today entries ──
  const { data: todayEntries = [], refetch: refetchToday } = useQuery({
    queryKey: ["today_entries", user?.id],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("time_entries")
        .select("*, tasks(name, category)")
        .eq("user_id", user!.id)
        .gte("start_time", start.toISOString())
        .order("start_time", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  // ── Screenshot interval ──
  const { data: ssInterval = 600 } = useQuery({
    queryKey: ["profile_screenshot_interval", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("screenshot_interval").eq("user_id", user!.id).single();
      return data?.screenshot_interval ?? 600;
    },
    enabled: !!user,
  });

  // ── All tasks ──
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*, projects(name)").eq("is_completed", false).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
  useEffect(() => { tasksRef.current = tasks as any[]; }, [tasks]);

  const { data: taskDurations = {} } = useQuery({
    queryKey: ["task_durations", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("time_entries").select("task_id, duration_seconds").eq("user_id", user!.id).not("task_id", "is", null);
      const t: Record<string, number> = {};
      for (const e of data || []) { if (e.task_id) t[e.task_id] = (t[e.task_id] || 0) + (e.duration_seconds || 0); }
      return t;
    },
    enabled: !!user,
  });

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setTaskOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Work tick
  useEffect(() => {
    if (isRunning) {
      tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isRunning]);

  // ── Screenshot — capture real desktop using getDisplayMedia ──
  const doScreenshot = async () => {
    if (!user) return;
    try {
      // Request screen capture permission
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { mediaSource: "screen", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop(); // release immediately after capture

      // Draw to canvas at half resolution
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(bitmap.width / 2);
      canvas.height = Math.floor(bitmap.height / 2);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL("image/jpeg", 0.75);
      const currentElapsed = elapsedRef.current;
      const currentTaskId = activeTaskIdRef.current;
      const { error } = await supabase.from("screenshots").insert({
        user_id: user.id,
        image_data: imageData,
        timer_elapsed: currentElapsed,
        task_id: currentTaskId || null,
      });
      if (error) throw error;
      toast({ title: "Screenshot captured", description: `Next in ${ssInterval / 60} min` });
    } catch (err: any) {
      // User denied or browser doesn't support — fall back to page capture
      try {
        if (!(window as any).html2canvas) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("html2canvas failed to load"));
            document.head.appendChild(s);
          });
        }
        const canvas = await (window as any).html2canvas(document.body, {
          scale: 0.5, useCORS: true, logging: false, backgroundColor: "#1a1a2e",
        });
        const imageData = canvas.toDataURL("image/jpeg", 0.75);
        const { error } = await supabase.from("screenshots").insert({
          user_id: user.id,
          image_data: imageData,
          timer_elapsed: elapsedRef.current,
          task_id: activeTaskIdRef.current || null,
        });
        if (error) throw error;
        toast({ title: "Screenshot captured (page only)", description: `Next in ${ssInterval / 60} min` });
      } catch (fallbackErr: any) {
        console.error("Screenshot fallback error:", fallbackErr);
        toast({ title: "Screenshot failed", description: "Please allow screen capture permission.", variant: "destructive" });
      }
    }
  };

  // Set up screenshot interval — only depends on isRunning/mode/ssInterval, not on elapsed/task
  useEffect(() => {
    if (ssRef.current) clearInterval(ssRef.current);
    if (isRunning && mode === "work" && ssInterval > 0) {
      ssRef.current = setInterval(doScreenshot, ssInterval * 1000);
    }
    return () => { if (ssRef.current) clearInterval(ssRef.current); };
  }, [isRunning, mode, ssInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    setElapsed(0);
    setIsRunning(true);
    if (user) {
      await supabase.from("active_timers").upsert({
        user_id: user.id,
        started_at: new Date().toISOString(),
        task_id: mode === "work" ? (activeTaskId || null) : null,
        mode,
        is_break: mode === "break",
        break_started_at: mode === "break" ? new Date().toISOString() : null,
      }, { onConflict: "user_id" });
    }
  };

  const handleStop = async () => {
    if (mode === "work" && !activeTaskId) { setShowNoTaskPrompt(true); return; }
    setIsRunning(false);
    const startedAt = activeTimer?.started_at
      ? new Date(activeTimer.started_at)
      : new Date(Date.now() - elapsed * 1000);
    if (user) await supabase.from("active_timers").delete().eq("user_id", user.id);
    if (!user) return;
    await supabase.from("time_entries").insert({
      user_id: user.id,
      task_id: mode === "work" ? (activeTaskId || null) : null,
      start_time: startedAt.toISOString(),
      end_time: new Date().toISOString(),
      duration_seconds: elapsed,
      screenshot_interval: ssInterval,
      description: mode === "break" ? "Break time" : (taskScope || null),
    });
    if (mode === "work") {
      toast({ title: "Time entry saved!" });
      qc.invalidateQueries({ queryKey: ["task_durations"] });
      setTaskScope("");
    } else {
      toast({ title: "Break recorded", description: `Break lasted ${fmt(elapsed)}` });
    }
    setElapsed(0);
    refetchToday();
    onEntryCreated?.();
    refetchTimer();
  };

  const timeInMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      await supabase.from("attendance").upsert({ user_id: user!.id, time_in_at: now.toISOString() }, { onConflict: "user_id" });
      await supabase.from("dtr_log").insert({ user_id: user!.id, time_in: now.toISOString(), date: now.toISOString().split("T")[0] });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_attendance"] });
      refetchAtt();
      toast({ title: "Timed In!", description: `Started at ${new Date().toLocaleTimeString()}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const timeOutMutation = useMutation({
    mutationFn: async () => {
      if (!timeInStamp || !user) throw new Error("Not timed in");
      const end = new Date();
      const dur = Math.floor((end.getTime() - timeInStamp.getTime()) / 1000);
      await supabase.from("time_entries").insert({
        user_id: user.id, task_id: null,
        start_time: timeInStamp.toISOString(), end_time: end.toISOString(),
        duration_seconds: dur, description: "Attendance: Time In / Time Out",
      });
      const today = end.toISOString().split("T")[0];
      const { data: dtrRow } = await supabase.from("dtr_log").select("id").eq("user_id", user.id).eq("date", today).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (dtrRow) await supabase.from("dtr_log").update({ time_out: end.toISOString(), duration_seconds: dur }).eq("id", dtrRow.id);
      await supabase.from("attendance").delete().eq("user_id", user.id);
      return dur;
    },
    onSuccess: (dur) => {
      qc.invalidateQueries({ queryKey: ["my_attendance"] });
      refetchAtt(); refetchToday(); onEntryCreated?.();
      toast({ title: "Timed Out!", description: `Total: ${fmt(dur)}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Update entry: duration + scope (description)
  const updateEntry = useMutation({
    mutationFn: async ({ id, duration_seconds, description }: { id: string; duration_seconds: number; description: string }) => {
      const { error } = await supabase.from("time_entries").update({ duration_seconds, description: description || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchToday();
      qc.invalidateQueries({ queryKey: ["time_entries_report"] });
      setEditingId(null);
      toast({ title: "Entry updated", description: `Saved at ${new Date().toLocaleTimeString()}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isBreak = mode === "break";
  const activeTask = (tasks as any[]).find(t => t.id === activeTaskId);
  const workEntries = (todayEntries as any[]).filter(e => e.description !== "Attendance: Time In / Time Out");

  return (
    <div className="glass-card p-6 space-y-5">
      {/* No-task modal */}
      {showNoTaskPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-xs shadow-xl text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-warning mx-auto" />
            <h3 className="text-base font-semibold text-foreground">Please select a task</h3>
            <p className="text-sm text-muted-foreground">Pick a task from the dropdown before stopping the timer.</p>
            <Button className="w-full gradient-primary" onClick={() => setShowNoTaskPrompt(false)}>Got it</Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">Cadence Clock</h3>
          <span className={`w-2.5 h-2.5 rounded-full ${!timedIn ? "bg-muted-foreground/40" : isRunning ? "bg-green-500 animate-pulse" : "bg-yellow-400"}`} />
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
          {fmt(elapsed)}
        </div>
        {isBreak && <p className="text-sm text-warning mt-1">☕ Break Mode</p>}
      </div>

      {/* Task dropdown + scope — work mode only */}
      {!isBreak && (
        <div className="space-y-2">
          <div className="relative" ref={dropRef}>
            <button
              onClick={() => setTaskOpen(v => !v)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors
                ${activeTask ? "border-primary/50 bg-accent/30" : "border-border bg-secondary text-muted-foreground"}
                hover:bg-secondary/80 cursor-pointer`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {activeTask
                  ? <><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /><span className="truncate font-medium text-foreground">{activeTask.name}</span><span className="text-xs text-muted-foreground ml-1">· {(activeTask as any).category}</span></>
                  : <><Circle className="h-4 w-4 flex-shrink-0" /><span>Select a task to track…</span></>
                }
              </div>
              <ChevronDown className={`h-4 w-4 ml-2 flex-shrink-0 transition-transform ${taskOpen ? "rotate-180" : ""}`} />
            </button>

            {taskOpen && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
                  <button onClick={async () => { setActiveTaskId(undefined); activeTaskIdRef.current = undefined; setTaskOpen(false); if (isRunning && user) { await supabase.from("active_timers").update({ task_id: null }).eq("user_id", user.id); } }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary ${!activeTaskId ? "bg-accent/30 text-primary" : "text-muted-foreground"}`}>
                    <Circle className="h-3.5 w-3.5" /> None
                  </button>
                  {(tasks as any[]).map((t: any) => (
                    <button key={t.id} onClick={async () => { setActiveTaskId(t.id); activeTaskIdRef.current = t.id; setTaskOpen(false); if (isRunning && user) { await supabase.from("active_timers").update({ task_id: t.id }).eq("user_id", user.id); } }} className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-secondary ${activeTaskId === t.id ? "bg-accent/30 text-primary" : "text-foreground"}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className={`h-3.5 w-3.5 flex-shrink-0 ${activeTaskId === t.id ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="truncate">{t.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">· {t.category}</span>
                        {t.projects?.name && <span className="text-xs text-muted-foreground flex-shrink-0">· {t.projects.name}</span>}
                      </div>
                      {(taskDurations as any)[t.id] > 0 && <span className="text-xs font-mono text-muted-foreground ml-2 flex-shrink-0">{fmtHM((taskDurations as any)[t.id])}</span>}
                    </button>
                  ))}
                  {(tasks as any[]).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks — ask admin to add them</p>}
                </div>
              </div>
            )}
          </div>

          {/* Freeform scope */}
          {activeTask && (
            <Input
              placeholder="Scope / notes for this session (optional)"
              value={taskScope}
              onChange={e => setTaskScope(e.target.value)}
              className="bg-secondary border-border text-sm h-8"
            />
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-3">
        {isRunning ? (
          <Button onClick={handleStop} variant="destructive" size="lg" className="gap-2">
            <Square className="h-4 w-4" /> Stop
          </Button>
        ) : (
          <Button onClick={handleStart} size="lg" className={`gap-2 ${isBreak ? "bg-warning text-warning-foreground hover:bg-warning/90" : "gradient-primary"}`}>
            <Play className="h-4 w-4" /> {isBreak ? "Start Break" : "Start"}
          </Button>
        )}
      </div>
      {isRunning && activeTask && (
        <p className="text-xs text-primary text-center">
          Tracking: <span className="font-medium">{(activeTask as any).name}</span>
          {taskScope && <span className="text-muted-foreground"> · {taskScope}</span>}
        </p>
      )}

      {/* Attendance */}
      <div className="border-t border-border pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Attendance</p>
            {timedIn && timeInStamp
              ? <div>
                  <p className="text-xs text-muted-foreground">In since {timeInStamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="text-sm font-mono text-primary font-medium">{fmt(timeInElapsed)}</p>
                </div>
              : <p className="text-xs text-muted-foreground">Not timed in</p>
            }
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

        {/* Today's task log — scope editable, no notes */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-primary" /> Today's Tasks
          </p>
          <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
            {workEntries.map((e: any) => {
              const isBreakEntry = e.description === "Break time";
              const isEditing = editingId === e.id;
              const taskName = e.tasks?.name || (isBreakEntry ? "Break" : "Untitled");
              const scopeVal = !isBreakEntry && e.description && e.description !== "Break time" ? e.description : "";

              return (
                <div key={e.id} className={`rounded-lg border px-3 py-2 ${isBreakEntry ? "border-yellow-400/40 bg-yellow-400/5" : "border-border/50 bg-secondary/50"}`}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-foreground flex-1 truncate">{taskName}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(e.start_time), "h:mm a")}</span>
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Duration (e.g. 1h 30m)</p>
                          <Input value={editDur} onChange={ev => setEditDur(ev.target.value)} className="bg-card border-border text-xs h-7" placeholder="1h 30m" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Scope / notes</p>
                          <Input value={editScope} onChange={ev => setEditScope(ev.target.value)} className="bg-card border-border text-xs h-7" placeholder="What did you work on?" />
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs gradient-primary px-2 gap-1"
                          onClick={() => updateEntry.mutate({ id: e.id, duration_seconds: parseDur(editDur), description: editScope })}>
                          <Save className="h-3 w-3" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isBreakEntry && <Coffee className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
                          <p className={`text-xs font-medium truncate ${isBreakEntry ? "text-yellow-500" : "text-foreground"}`}>{taskName}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{e.tasks?.category || (isBreakEntry ? "Break" : "—")} · {format(new Date(e.start_time), "h:mm a")}</p>
                        {scopeVal && <p className="text-xs text-muted-foreground italic truncate">"{scopeVal}"</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs font-mono text-foreground">{fmtHM(e.duration_seconds || 0)}</span>
                        {!isBreakEntry && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => { setEditingId(e.id); setEditDur(fmtHM(e.duration_seconds || 0)); setEditScope(scopeVal); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {workEntries.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No tasks logged today</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timer;
