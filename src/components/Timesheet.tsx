import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Clock, Pencil, Trash2, Save, X, CheckCircle2, XCircle, AlertCircle, FileText } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";

const fmtHM = (mins: number) => { const h = Math.floor(mins / 60), m = mins % 60; return h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}`.trim() : `${m}m`; };

const StatusBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, { label: string; cls: string; icon: any }> = {
    pending:  { label: "Pending",  cls: "bg-yellow-400/10 text-yellow-500 border-yellow-400/30",  icon: AlertCircle },
    approved: { label: "Approved", cls: "bg-green-500/10 text-green-500 border-green-500/30",   icon: CheckCircle2 },
    rejected: { label: "Rejected", cls: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  };
  const c = cfg[status] || cfg.pending;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${c.cls}`}>
      <Icon className="h-3 w-3" /> {c.label}
    </span>
  );
};

const Timesheet = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Form state
  const [fDate, setFDate] = useState(new Date().toISOString().split("T")[0]);
  const [fStart, setFStart] = useState("09:00");
  const [fEnd, setFEnd] = useState("17:00");
  const [fTaskId, setFTaskId] = useState("none");
  const [fDesc, setFDesc] = useState("");

  const weekStart = startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
  const weekEnd = endOfWeek(weekStart);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks_all"],
    queryFn: async () => { const { data } = await supabase.from("tasks").select("id, name, category").eq("is_completed", false).order("name"); return data || []; },
    enabled: !!user,
  });

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["my_time_logs", weekOffset],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_time_logs")
        .select("*, tasks(name, category)")
        .eq("user_id", user!.id)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date").order("start_time");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: allLogs = [] } = useQuery({
    queryKey: ["my_all_time_logs"],
    queryFn: async () => {
      const { data } = await supabase.from("manual_time_logs").select("*, tasks(name, category)").eq("user_id", user!.id).order("date", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const calcMins = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  };

  const submitLog = useMutation({
    mutationFn: async () => {
      const mins = calcMins(fStart, fEnd);
      if (mins <= 0) throw new Error("End time must be after start time");
      const payload = {
        user_id: user!.id, date: fDate, start_time: fStart, end_time: fEnd,
        duration_minutes: mins, task_id: fTaskId !== "none" ? fTaskId : null,
        description: fDesc || null, status: "pending",
      };
      if (editingId) {
        const { error } = await supabase.from("manual_time_logs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manual_time_logs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_time_logs"] });
      qc.invalidateQueries({ queryKey: ["my_all_time_logs"] });
      resetForm();
      toast({ title: editingId ? "Log updated — pending approval" : "Time log submitted for approval" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manual_time_logs").delete().eq("id", id).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my_time_logs"] }); qc.invalidateQueries({ queryKey: ["my_all_time_logs"] }); toast({ title: "Log deleted" }); },
  });

  const resetForm = () => {
    setShowForm(false); setEditingId(null);
    setFDate(new Date().toISOString().split("T")[0]); setFStart("09:00"); setFEnd("17:00");
    setFTaskId("none"); setFDesc("");
  };

  const openEdit = (log: any) => {
    setEditingId(log.id); setFDate(log.date); setFStart(log.start_time.slice(0, 5));
    setFEnd(log.end_time.slice(0, 5)); setFTaskId(log.task_id || "none"); setFDesc(log.description || "");
    setShowForm(true);
  };

  const totalWeekMins = logs.reduce((s: number, l: any) => s + (l.duration_minutes || 0), 0);
  const approvedWeekMins = logs.filter((l: any) => l.status === "approved").reduce((s: number, l: any) => s + (l.duration_minutes || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Timesheet
        </h2>
        <Button size="sm" className="gradient-primary gap-1" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Log Time
        </Button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="glass-card p-4 space-y-3 border border-primary/30">
          <p className="text-sm font-semibold text-foreground">{editingId ? "Edit Time Log" : "New Time Log"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Date</p>
              <Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="bg-secondary border-border text-sm h-8" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Task</p>
              <Select value={fTaskId} onValueChange={setFTaskId}>
                <SelectTrigger className="bg-secondary border-border text-sm h-8"><SelectValue placeholder="Select task" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No task</SelectItem>
                  {(tasks as any[]).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Start time</p>
              <Input type="time" value={fStart} onChange={e => setFStart(e.target.value)} className="bg-secondary border-border text-sm h-8" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">End time</p>
              <Input type="time" value={fEnd} onChange={e => setFEnd(e.target.value)} className="bg-secondary border-border text-sm h-8" />
            </div>
          </div>
          {fStart && fEnd && calcMins(fStart, fEnd) > 0 && (
            <p className="text-xs text-primary">Duration: {fmtHM(calcMins(fStart, fEnd))}</p>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Description (optional)</p>
            <Input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="What did you work on?" className="bg-secondary border-border text-sm h-8" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="gradient-primary gap-1" onClick={() => submitLog.mutate()} disabled={submitLog.isPending}>
              <Save className="h-3 w-3" /> {editingId ? "Update" : "Submit for Approval"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}><X className="h-3 w-3" /></Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="week">
        <TabsList className="bg-secondary">
          <TabsTrigger value="week" className="text-xs">Weekly View</TabsTrigger>
          <TabsTrigger value="all" className="text-xs">All Logs</TabsTrigger>
        </TabsList>

        {/* Weekly view */}
        <TabsContent value="week" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekOffset(o => o - 1)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-secondary">‹ Prev</button>
              <span className="text-sm text-foreground font-medium">{format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}</span>
              <button onClick={() => setWeekOffset(o => o + 1)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-secondary">Next ›</button>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total: <span className="text-foreground font-medium">{fmtHM(totalWeekMins)}</span></p>
              <p className="text-xs text-muted-foreground">Approved: <span className="text-green-500 font-medium">{fmtHM(approvedWeekMins)}</span></p>
            </div>
          </div>

          {weekDays.map(day => {
            const dayStr = format(day, "yyyy-MM-dd");
            const dayLogs = logs.filter((l: any) => l.date === dayStr);
            return (
              <div key={dayStr} className="glass-card p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">{format(day, "EEEE, MMM d")}</p>
                {dayLogs.length === 0
                  ? <p className="text-xs text-muted-foreground/50 py-1">No logs</p>
                  : dayLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/50 group">
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{(log.tasks as any)?.name || log.description || "Manual log"}</p>
                          <p className="text-xs text-muted-foreground">{log.start_time?.slice(0,5)} – {log.end_time?.slice(0,5)} · {fmtHM(log.duration_minutes)}</p>
                          {log.admin_note && <p className="text-xs text-muted-foreground italic">Admin: {log.admin_note}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={log.status} />
                        {log.status === "pending" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => openEdit(log)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => deleteLog.mutate(log.id)}><Trash2 className="h-3 w-3" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            );
          })}
        </TabsContent>

        {/* All logs */}
        <TabsContent value="all" className="pt-2">
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {(allLogs as any[]).map((log: any) => (
              <div key={log.id} className="glass-card p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{(log.tasks as any)?.name || log.description || "Manual log"}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(log.date), "MMM d, yyyy")} · {log.start_time?.slice(0,5)} – {log.end_time?.slice(0,5)} · {fmtHM(log.duration_minutes)}</p>
                    {log.admin_note && <p className="text-xs text-muted-foreground italic">Admin note: {log.admin_note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={log.status} />
                  {log.status === "pending" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(log)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteLog.mutate(log.id)}><Trash2 className="h-3 w-3" /></Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {(allLogs as any[]).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No time logs yet</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Timesheet;
