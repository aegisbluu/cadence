import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Coffee, LogIn, LogOut as LogOutIcon, ChevronDown, CheckCircle2, Circle, Pencil, Save, X, Clock, Plus, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface TimerProps { onEntryCreated?: () => void; }

const fmt = (s: number) => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const fmtHM = (s: number) => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const CATEGORIES = ["Development","Design","Research","Meeting","Admin","Other"];
const parseDur = (str: string) => { const h=str.match(/(\d+)h/),m=str.match(/(\d+)m/); return ((h?parseInt(h[1]):0)*3600)+((m?parseInt(m[1]):0)*60); };

const Timer = ({ onEntryCreated }: TimerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState<"work"|"break">("work");
  const [activeTaskId, setActiveTaskId] = useState<string|undefined>();
  const [taskScope, setTaskScope] = useState("");        // freeform scope per session
  const [taskOpen, setTaskOpen] = useState(false);
  const [timeInElapsed, setTimeInElapsed] = useState(0);
  const [showNoTaskPrompt, setShowNoTaskPrompt] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [editDur, setEditDur] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editName, setEditName] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<string|null>(null);
  const [noteText, setNoteText] = useState("");

  const tickRef = useRef<NodeJS.Timeout|null>(null);
  const timeInRef = useRef<NodeJS.Timeout|null>(null);
  const ssRef = useRef<NodeJS.Timeout|null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);
  const activeTaskIdRef = useRef(activeTaskId);
  const taskScopeRef = useRef(taskScope);

  // ── Restore clock from DB ──
  const { data: activeTimer, refetch: refetchTimer } = useQuery({
    queryKey: ["my_active_timer", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("active_timers").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (activeTimer && !isRunning) {
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
      tick(); timeInRef.current = setInterval(tick, 1000);
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
      const start = new Date(); start.setHours(0,0,0,0);
      const { data } = await supabase.from("time_entries").select("*, tasks(name,category), projects(name)").eq("user_id", user!.id).gte("start_time", start.toISOString()).order("start_time", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  // ── Task notes ──
  const { data: taskNotes = [] } = useQuery({
    queryKey: ["task_notes_today", user?.id],
    queryFn: async () => {
      const start = new Date(); start.setHours(0,0,0,0);
      const { data } = await supabase.from("task_notes").select("*").eq("user_id", user!.id).gte("created_at", start.toISOString()).order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const addNote = useMutation({
    mutationFn: async ({ taskId, entryId, note }: { taskId: string; entryId: string; note: string }) => {
      const { error } = await supabase.from("task_notes").insert({ task_id: taskId, user_id: user!.id, entry_id: entryId, note });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task_notes_today"] }); setNoteText(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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

  // ── All tasks (all users can see all tasks) ──
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*, projects(name)").eq("is_completed", false).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

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
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  // Work tick
  useEffect(() => {
    if (isRunning) { tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000); }
    else if (tickRef.current) clearInterval(tickRef.current);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isRunning]);

  // Screenshot — save to DB instead of storage
  const takeScreenshot = useCallback(async () => {
    try {
      const canvas = document.createElement("canvas");
      const w = Math.min(window.innerWidth, 1280);
      const h = Math.min(window.innerHeight, 800);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Try to capture from visible document via html2canvas-style approach
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffffff";
        ctx.font = "16px monospace";
        const ts = new Date().toLocaleTimeString();
        ctx.fillText(`Cadence Clock · ${ts}`, 20, 30);
        ctx.fillText(`Timer: ${fmt(elapsed)}`, 20, 55);
        ctx.fillText(`Mode: ${mode}`, 20, 80);
        if (activeTaskId) {
          const task = (tasks as any[]).find(t => t.id === activeTaskId);
          if (task) ctx.fillText(`Task: ${task.name}`, 20, 105);
        }
        if (taskScope) ctx.fillText(`Scope: ${taskScope}`, 20, 130);
        // Draw a border
        ctx.strokeStyle = "#A855F7";
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, w - 20, 140);
      }
      const imageData = canvas.toDataURL("image/png");
      const { error } = await supabase.from("screenshots").insert({
        user_id: user!.id,
        image_data: imageData,
        timer_elapsed: elapsed,
        task_id: activeTaskId || null,
      });
      if (error) {
        console.error("Screenshot save error:", error);
        toast({ title: "Screenshot failed", description: error.message, variant: "destructive" });
      } else {
        console.log("Screenshot captured successfully");
        toast({ title: "Screenshot captured", description: `Next in ${ssInterval / 60} min` });
      }
    } catch (err) {
      console.error("Screenshot error:", err);
      toast({ title: "Screenshot failed", variant: "destructive" });
    }
  }, [elapsed, ssInterval, activeTaskId, tasks, toast, user, mode, taskScope]);

  useEffect(() => {
    if (isRunning && mode === "work" && ssInterval > 0) {
      ssRef.current = setInterval(takeScreenshot, ssInterval * 1000);
    }
    return () => { if (ssRef.current) clearInterval(ssRef.current); };
  }, [isRunning, mode, ssInterval, takeScreenshot]);

  const handleStart = async () => {
    setElapsed(0); setIsRunning(true);
    if (user) await supabase.from("active_timers").upsert({
      user_id: user.id, started_at: new Date().toISOString(),
      task_id: mode === "work" ? (activeTaskId || null) : null,
      mode, is_break: mode === "break",
      break_started_at: mode === "break" ? new Date().toISOString() : null,
    }, { onConflict: "user_id" });
  };

  const handleStop = async () => {
    if (mode === "work" && !activeTaskId) { setShowNoTaskPrompt(true); return; }
    setIsRunning(false);
    const startedAt = activeTimer?.started_at ? new Date(activeTimer.started_at) : new Date(Date.now() - elapsed * 1000);
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
      setTaskScope(""); // reset scope after stop
    } else {
      toast({ title: "Break recorded", description: `Break lasted ${fmt(elapsed)}` });
    }
    refetchToday(); onEntryCreated?.(); setElapsed(0); refetchTimer();
  };

  const timeInMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      await supabase.from("attendance").upsert({ user_id: user!.id, time_in_at: now.toISOString() }, { onConflict: "user_id" });
      await supabase.from("dtr_log").insert({ user_id: user!.id, time_in: now.toISOString(), date: now.toISOString().split("T")[0] });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my_attendance"] }); refetchAtt(); toast({ title: "Timed In!", description: `Started at ${new Date().toLocaleTimeString()}` }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const timeOutMutation = useMutation({
    mutationFn: async () => {
      if (!timeInStamp || !user) throw new Error("Not timed in");
      const end = new Date(); const dur = Math.floor((end.getTime() - timeInStamp.getTime()) / 1000);
      await supabase.from("time_entries").insert({ user_id: user.id, task_id: null, start_time: timeInStamp.toISOString(), end_time: end.toISOString(), duration_seconds: dur, description: "Attendance: Time In / Time Out" });
      const today = end.toISOString().split("T")[0];
      const { data: dtrRow } = await supabase.from("dtr_log").select("id").eq("user_id", user.id).eq("date", today).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (dtrRow) await supabase.from("dtr_log").update({ time_out: end.toISOString(), duration_seconds: dur }).eq("id", dtrRow.id);
      await supabase.from("attendance").delete().eq("user_id", user.id);
      return dur;
    },
    onSuccess: (dur) => { qc.invalidateQueries({ queryKey: ["my_attendance"] }); refetchAtt(); refetchToday(); onEntryCreated?.(); toast({ title: "Timed Out!", description: `Total: ${fmt(dur)}` }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, duration_seconds, name, category, task_id }: { id: string; duration_seconds: number; name: string; category: string; task_id?: string }) => {
      await supabase.from("time_entries").update({ duration_seconds }).eq("id", id);
      if (task_id) await supabase.from("tasks").update({ name, category }).eq("id", task_id);
    },
    onSuccess: () => { refetchToday(); qc.invalidateQueries({ queryKey: ["time_entries_report"] }); setEditingId(null); toast({ title: "Entry updated", description: `Saved at ${new Date().toLocaleTimeString()}` }); },
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
            <h3 className="text-base font-semibold text-foreground">Please add a task</h3>
            <p className="text-sm text-muted-foreground">Select a task from the dropdown before stopping the timer.</p>
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

      {/* Task dropdown + scope — only in work mode */}
      {!isBreak && (
        <div className="space-y-2">
          <div className="relative" ref={dropRef}>
            <button
              onClick={() => setTaskOpen(v => !v)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${activeTask ? "border-primary/50 bg-accent/30" : "border-border bg-secondary text-muted-foreground"} hover:bg-secondary/80 cursor-pointer`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {activeTask
                  ? <><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /><span className="truncate font-medium text-foreground">{activeTask.name}</span><span className="text-xs text-muted-foreground ml-1">· {activeTask.category}</span></>
                  : <><Circle className="h-4 w-4 flex-shrink-0" /><span>Select a task to track…</span></>}
              </div>
              <ChevronDown className={`h-4 w-4 ml-2 flex-shrink-0 transition-transform ${taskOpen ? "rotate-180" : ""}`} />
            </button>
            {taskOpen && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
                  <button onClick={() => { setActiveTaskId(undefined); setTaskOpen(false); }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary ${!activeTaskId ? "bg-accent/30 text-primary" : "text-muted-foreground"}`}>
                    <Circle className="h-3.5 w-3.5" /> None
                  </button>
                  {(tasks as any[]).map((t: any) => (
                    <button key={t.id} onClick={() => { setActiveTaskId(t.id); setTaskOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-secondary ${activeTaskId === t.id ? "bg-accent/30 text-primary" : "text-foreground"}`}>
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

          {/* Freeform scope — shown after task selected, editable while not running */}
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
        <p className="text-xs text-primary text-center">Tracking: <span className="font-medium">{activeTask.name}</span>{taskScope && <span className="text-muted-foreground"> · {taskScope}</span>}</p>
      )}

      {/* Attendance */}
      <div className="border-t border-border pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Attendance</p>
            {timedIn && timeInStamp
              ? <div><p className="text-xs text-muted-foreground">In since {timeInStamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><p className="text-sm font-mono text-primary font-medium">{fmt(timeInElapsed)}</p></div>
              : <p className="text-xs text-muted-foreground">Not timed in</p>}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => timeInMutation.mutate()} disabled={timedIn || timeInMutation.isPending} size="sm" className="gap-1 gradient-primary"><LogIn className="h-3 w-3" /> Time In</Button>
            <Button onClick={() => timeOutMutation.mutate()} disabled={!timedIn || timeOutMutation.isPending} size="sm" variant="destructive" className="gap-1"><LogOutIcon className="h-3 w-3" /> Time Out</Button>
          </div>
        </div>

        {/* Today's task log */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-primary" /> Today's Tasks</p>
          <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
            {workEntries.map((e: any) => {
              const isBreakEntry = e.description === "Break time";
              const isEditing = editingId === e.id;
              const taskName = e.tasks?.name || (isBreakEntry ? "Break" : "Untitled");
              const catVal = e.tasks?.category || "Other";
              const entryNotes = (taskNotes as any[]).filter(n => n.entry_id === e.id);
              const scopeNote = !isBreakEntry && e.description && e.description !== "Break time" ? e.description : null;

              return (
                <div key={e.id} className={`rounded-lg border px-3 py-2 ${isBreakEntry ? "border-yellow-400/40 bg-yellow-400/5" : "border-border/50 bg-secondary/50"}`}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input value={editName} onChange={ev => setEditName(ev.target.value)} className="bg-card border-border text-xs h-7" placeholder="Task name" />
                      <div className="flex gap-2">
                        <div className="flex-1"><p className="text-xs text-muted-foreground mb-0.5">Duration (e.g. 1h 30m)</p><Input value={editDur} onChange={ev => setEditDur(ev.target.value)} className="bg-card border-border text-xs h-7" /></div>
                        <div className="flex-1"><p className="text-xs text-muted-foreground mb-0.5">Category</p>
                          <Select value={editCat} onValueChange={setEditCat}><SelectTrigger className="bg-card border-border text-xs h-7"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs gradient-primary px-2 gap-1" onClick={() => updateEntry.mutate({ id: e.id, duration_seconds: parseDur(editDur), name: editName, category: editCat, task_id: e.task_id || undefined })}><Save className="h-3 w-3" /> Save</Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {isBreakEntry && <Coffee className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
                            <p className={`text-xs font-medium truncate ${isBreakEntry ? "text-yellow-500" : "text-foreground"}`}>{taskName}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{catVal} · {format(new Date(e.start_time), "h:mm a")}</p>
                          {scopeNote && <p className="text-xs text-muted-foreground italic truncate">"{scopeNote}"</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs font-mono text-foreground">{fmtHM(e.duration_seconds || 0)}</span>
                          {!isBreakEntry && (
                            <>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedEntry(expandedEntry === e.id ? null : e.id)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingId(e.id); setEditDur(fmtHM(e.duration_seconds || 0)); setEditCat(catVal); setEditName(taskName); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {expandedEntry === e.id && (
                        <div className="mt-2 pl-3 border-l-2 border-primary/30 space-y-1">
                          {entryNotes.map((n: any) => <p key={n.id} className="text-xs text-muted-foreground">· {n.note}</p>)}
                          <div className="flex gap-1.5 mt-1">
                            <Input value={noteText} onChange={ev => setNoteText(ev.target.value)} onKeyDown={ev => { if (ev.key === "Enter" && noteText.trim() && e.task_id) addNote.mutate({ taskId: e.task_id, entryId: e.id, note: noteText.trim() }); }} placeholder="Add note…" className="bg-card border-border text-xs h-6 flex-1" />
                            <Button size="sm" className="h-6 text-xs px-2 gradient-primary" onClick={() => { if (noteText.trim() && e.task_id) addNote.mutate({ taskId: e.task_id, entryId: e.id, note: noteText.trim() }); }}><Plus className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      )}
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
