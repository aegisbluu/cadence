import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, ListTodo, Trash2, Pencil, Plus, Camera, Activity, Clock,
  CheckCircle2, Building2, Save, X, Shield, FileText, UserMinus, AlertTriangle
} from "lucide-react";
import { format } from "date-fns";

const ROLES = ["admin", "user"];
const fmtT = (s: number) => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const fmtHM = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

const AdminPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Task state
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string|null>(null);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskCategory, setEditTaskCategory] = useState("");

  // Department/member editing state
  const [editingDeptUserId, setEditingDeptUserId] = useState<string|null>(null);
  const [editName, setEditName] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editDepartment, setEditDepartment] = useState("");

  // Roles state
  const [editingRoleId, setEditingRoleId] = useState<string|null>(null);
  const [editRole, setEditRole] = useState("user");

  // Screenshot state
  const [expandedSs, setExpandedSs] = useState<string|null>(null);
  const [ssUserFilter, setSsUserFilter] = useState("all");

  // Administration state
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string|null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // DTR state
  const [dtrDate, setDtrDate] = useState(new Date().toISOString().split("T")[0]);

  // Live clock ticker
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // ── Queries ──
  const { data: allTasks = [] } = useQuery({
    queryKey: ["admin_tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*, projects(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["admin_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin_roles"],
    queryFn: async () => { const { data } = await supabase.from("user_roles").select("*"); return data || []; },
    enabled: !!user,
  });

  // Fetch auth user list to get emails (admin only via service key not available client-side)
  // We store emails in profiles via the handle_new_user trigger — add email column query
  const { data: authEmails = {} } = useQuery({
    queryKey: ["admin_auth_emails"],
    queryFn: async () => {
      // We get emails from auth.users via the profiles which stores user_id
      // Use a workaround: fetch from time_entries or dtr_log which have user_id
      // Best approach: fetch profiles and use display_name; for email we need RPC
      // Since Supabase admin API isn't available client-side, we'll use a raw query
      const { data } = await supabase.rpc("get_user_emails");
      if (!data) return {} as Record<string, string>;
      if (data) {
        const map: Record<string, string> = {};
        for (const u of data) map[u.id] = u.email;
        return map;
      }
      return {} as Record<string, string>;
    },
    enabled: !!user,
  });

  const { data: memberStats = {} } = useQuery({
    queryKey: ["admin_member_stats"],
    queryFn: async () => {
      const { data } = await supabase.from("time_entries").select("user_id,duration_seconds,start_time");
      const stats: Record<string, any> = {};
      const tod = new Date().toDateString();
      for (const e of data || []) {
        if (!stats[e.user_id]) stats[e.user_id] = { total: 0, today: 0, sessions: 0 };
        stats[e.user_id].total += e.duration_seconds || 0;
        stats[e.user_id].sessions += 1;
        if (new Date(e.start_time).toDateString() === tod) stats[e.user_id].today += e.duration_seconds || 0;
      }
      return stats;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: activeTimers = [] } = useQuery({
    queryKey: ["admin_active_timers"],
    queryFn: async () => { const { data } = await supabase.from("active_timers").select("*, tasks(name)"); return data || []; },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: allAttendance = [] } = useQuery({
    queryKey: ["admin_attendance"],
    queryFn: async () => { const { data } = await supabase.from("attendance").select("*"); return data || []; },
    enabled: !!user,
    refetchInterval: 5000,
  });

  // DTR — fetch records for selected date, join profiles manually
  const { data: dtrLogs = [] } = useQuery({
    queryKey: ["admin_dtr", dtrDate, (allProfiles as any[]).length],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dtr_log")
        .select("id, user_id, time_in, time_out, duration_seconds, date")
        .eq("date", dtrDate)
        .order("time_in", { ascending: true });
      if (error) throw error;
      const profileMap: Record<string, string> = {};
      for (const p of allProfiles as any[]) profileMap[p.user_id] = p.display_name || "Unknown";
      return (data || []).map(d => ({ ...d, display_name: profileMap[d.user_id] || "Unknown" }));
    },
    enabled: !!user && (allProfiles as any[]).length > 0,
  });

  // Screenshots — filter by user
  const { data: screenshots = [], refetch: refetchSs } = useQuery({
    queryKey: ["admin_screenshots", ssUserFilter],
    queryFn: async () => {
      let q = supabase
        .from("screenshots")
        .select("id, user_id, taken_at, timer_elapsed, task_id, image_data, tasks(name)")
        .order("taken_at", { ascending: false })
        .limit(100);
      if (ssUserFilter !== "all") q = q.eq("user_id", ssUserFilter);
      const { data } = await q;
      const profileMap: Record<string, string> = {};
      for (const p of allProfiles as any[]) profileMap[p.user_id] = p.display_name || "Unknown";
      return (data || []).map(s => ({ ...s, display_name: profileMap[s.user_id] || "Unknown" }));
    },
    enabled: !!user && (allProfiles as any[]).length > 0,
  });

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase.channel("admin-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_timers" }, () => qc.invalidateQueries({ queryKey: ["admin_active_timers"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => qc.invalidateQueries({ queryKey: ["admin_attendance"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Derived maps
  const timerMap: Record<string, any> = {};
  for (const t of activeTimers as any[]) timerMap[t.user_id] = t;
  const attMap: Record<string, any> = {};
  for (const a of allAttendance as any[]) attMap[a.user_id] = a;
  const getRoleForUser = (uid: string) => (allRoles as any[]).find(r => r.user_id === uid)?.role || "user";
  const departments = Array.from(new Set((allProfiles as any[]).map((p: any) => p.department || "Unassigned"))).sort() as string[];

  // ── Mutations ──
  const createTask = useMutation({
    mutationFn: async () => {
      const tid = (allProfiles[0] as any)?.user_id || user!.id;
      const { error } = await supabase.from("tasks").insert({ user_id: tid, name: newTaskName, category: newTaskCategory || "Other" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin_tasks"] }); qc.invalidateQueries({ queryKey: ["tasks_all"] }); setNewTaskName(""); setNewTaskCategory(""); toast({ title: "Task created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, name, category }: { id: string; name: string; category: string }) => {
      const { error } = await supabase.from("tasks").update({ name, category: category || "Other" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin_tasks"] }); qc.invalidateQueries({ queryKey: ["tasks_all"] }); setEditingTaskId(null); toast({ title: "Task updated" }); },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tasks").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin_tasks"] }); qc.invalidateQueries({ queryKey: ["tasks_all"] }); toast({ title: "Deleted" }); },
  });

  const updateMemberProfile = useMutation({
    mutationFn: async ({ userId, name, jobTitle, department }: { userId: string; name: string; jobTitle: string; department: string }) => {
      const { error } = await supabase.from("profiles").update({ display_name: name, job_title: jobTitle, department }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin_profiles"] }); setEditingDeptUserId(null); toast({ title: "Profile updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateUserRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "user" }) => {
      await supabase.from("user_roles").upsert({ user_id: userId, role: role as any }, { onConflict: "user_id,role" });
      await supabase.from("user_roles").delete().eq("user_id", userId).neq("role", role);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin_roles"] }); setEditingRoleId(null); toast({ title: "Role updated" }); },
  });

  const updateScreenshot = useMutation({
    mutationFn: async ({ userId, interval }: { userId: string; interval: number }) => {
      const { error } = await supabase.from("profiles").update({ screenshot_interval: interval }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin_profiles"] }); toast({ title: "Saved!" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAllScreenshots = useMutation({
    mutationFn: async () => {
      let q = supabase.from("screenshots").delete();
      if (ssUserFilter !== "all") q = (q as any).eq("user_id", ssUserFilter);
      else q = (q as any).neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { refetchSs(); toast({ title: "Screenshots deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSingleScreenshot = useMutation({
    mutationFn: async (id: string) => { await supabase.from("screenshots").delete().eq("id", id); },
    onSuccess: () => refetchSs(),
  });

  const deleteAccount = useMutation({
    mutationFn: async (userId: string) => {
      // Delete in dependency order so FK constraints don't block
      await supabase.from("active_timers").delete().eq("user_id", userId);
      await supabase.from("attendance").delete().eq("user_id", userId);
      await supabase.from("dtr_log").delete().eq("user_id", userId);
      await supabase.from("screenshots").delete().eq("user_id", userId);
      await supabase.from("task_notes").delete().eq("user_id", userId);
      await supabase.from("time_entries").delete().eq("user_id", userId);
      await supabase.from("tasks").delete().eq("user_id", userId);
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("profiles").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: (userId: string) => {
      // Optimistically remove from cache immediately so UI updates right away
      qc.setQueryData(["admin_profiles"], (old: any[]) => (old || []).filter((p: any) => p.user_id !== userId));
      qc.setQueryData(["admin_roles"], (old: any[]) => (old || []).filter((r: any) => r.user_id !== userId));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_profiles"] });
      qc.invalidateQueries({ queryKey: ["admin_roles"] });
      setDeleteConfirmUserId(null);
      setDeleteConfirmName("");
      toast({ title: "Account deleted", description: "This action cannot be undone." });
    },
    onError: (e: any) => {
      // Refetch on error to restore correct state
      qc.invalidateQueries({ queryKey: ["admin_profiles"] });
      toast({ title: "Error deleting account", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      {/* Delete account confirm dialog — rendered at root level so it's never clipped */}
      {deleteConfirmUserId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-destructive/50 rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4 mx-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive flex-shrink-0" />
              <div>
                <h3 className="text-base font-semibold text-foreground">Delete account permanently?</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  This will delete <span className="font-medium text-foreground">{deleteConfirmName}</span> and all their data. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="destructive" className="flex-1 gap-2"
                onClick={() => deleteAccount.mutate(deleteConfirmUserId)}
                disabled={deleteAccount.isPending}>
                <Trash2 className="h-4 w-4" /> {deleteAccount.isPending ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => { setDeleteConfirmUserId(null); setDeleteConfirmName(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot expanded lightbox */}
      {expandedSs && (() => {
        const s = (screenshots as any[]).find((x: any) => x.id === expandedSs);
        if (!s) return null;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm" onClick={() => setExpandedSs(null)}>
            <div className="bg-card border border-border rounded-xl p-3 max-w-4xl w-full mx-4 space-y-2" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{s.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(s.taken_at), "MMM d, yyyy h:mm a")}
                    {s.tasks?.name ? ` · ${s.tasks.name}` : ""}
                    {s.timer_elapsed ? ` · ${fmtHM(s.timer_elapsed)}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setExpandedSs(null)}><X className="h-4 w-4" /></Button>
              </div>
              {s.image_data
                ? <img src={s.image_data} alt="Screenshot" className="w-full rounded border border-border/30 max-h-[70vh] object-contain" />
                : <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No image data available</div>
              }
            </div>
          </div>
        );
      })()}

      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" /> Admin Dashboard
      </h2>

      <Tabs defaultValue="departments">
        <TabsList className="bg-secondary mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="departments" className="gap-1 text-xs"><Building2 className="h-3 w-3" /> Departments</TabsTrigger>
          <TabsTrigger value="live" className="gap-1 text-xs"><Activity className="h-3 w-3" /> Live</TabsTrigger>
          <TabsTrigger value="dtr" className="gap-1 text-xs"><FileText className="h-3 w-3" /> DTR</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1 text-xs"><Shield className="h-3 w-3" /> Roles</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1 text-xs"><ListTodo className="h-3 w-3" /> Tasks</TabsTrigger>
          <TabsTrigger value="screenshots" className="gap-1 text-xs"><Camera className="h-3 w-3" /> Screenshots</TabsTrigger>
          <TabsTrigger value="administration" className="gap-1 text-xs"><UserMinus className="h-3 w-3" /> Administration</TabsTrigger>
        </TabsList>

        {/* ── DEPARTMENTS ── */}
        <TabsContent value="departments" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total members", value: (allProfiles as any[]).length },
              { label: "Online now", value: (allAttendance as any[]).length },
              { label: "Departments", value: departments.filter(d => d !== "Unassigned").length },
              { label: "Tracking", value: (activeTimers as any[]).filter((t: any) => t.mode === "work").length },
            ].map(({ label, value }) => (
              <div key={label} className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-bold text-primary">{value}</p>
              </div>
            ))}
          </div>

          {departments.map(dept => {
            const members = (allProfiles as any[]).filter((p: any) => (p.department || "Unassigned") === dept);
            return (
              <div key={dept} className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{dept}</h3>
                  <span className="text-xs text-muted-foreground">({members.length})</span>
                </div>
                {members.map((p: any) => {
                  const stats = (memberStats as any)[p.user_id] || { total: 0, today: 0, sessions: 0 };
                  const timer = timerMap[p.user_id];
                  const isEditing = editingDeptUserId === p.user_id;
                  const liveEl = timer ? Math.floor((now - new Date(timer.started_at).getTime()) / 1000) : 0;
                  return (
                    <div key={p.id} className={`rounded-lg border p-3 ${timer ? "border-primary/30 bg-accent/20" : "border-border bg-secondary/40"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${!attMap[p.user_id] ? "bg-muted-foreground/40" : timer ? "bg-green-500 animate-pulse" : "bg-yellow-400"}`} />
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <Input placeholder="Display name" value={editName} onChange={e => setEditName(e.target.value)} className="bg-card border-border text-xs h-7" />
                                <Input placeholder="Job title" value={editJobTitle} onChange={e => setEditJobTitle(e.target.value)} className="bg-card border-border text-xs h-7" />
                                <Input placeholder="Department" value={editDepartment} onChange={e => setEditDepartment(e.target.value)} className="bg-card border-border text-xs h-7" />
                                <div className="flex gap-1">
                                  <Button size="sm" className="h-6 text-xs gradient-primary px-2" onClick={() => updateMemberProfile.mutate({ userId: p.user_id, name: editName, jobTitle: editJobTitle, department: editDepartment })}>
                                    <Save className="h-3 w-3 mr-1" /> Save
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditingDeptUserId(null)}><X className="h-3 w-3" /></Button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-medium text-foreground">{p.display_name || "Unnamed"}</p>
                                <p className="text-xs text-muted-foreground">{p.job_title || "No title"}</p>
                                <p className="text-xs text-muted-foreground">{p.department || "No dept"}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-1 flex-shrink-0">
                          <div className="text-right space-y-0.5">
                            <div className="flex items-center gap-1 justify-end">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Today: <span className="text-foreground font-medium">{fmtHM(stats.today)}</span></span>
                            </div>
                            <div className="flex items-center gap-1 justify-end">
                              <Activity className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Total: <span className="text-foreground font-medium">{fmtHM(stats.total)}</span></span>
                            </div>
                            <div className="flex items-center gap-1 justify-end">
                              <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Sessions: <span className="text-foreground font-medium">{stats.sessions}</span></span>
                            </div>
                            {timer && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">● {fmtT(liveEl)}</span>}
                          </div>
                          {!isEditing && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingDeptUserId(p.user_id); setEditName(p.display_name || ""); setEditJobTitle(p.job_title || ""); setEditDepartment(p.department || ""); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {timer && (
                        <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          <span className="text-xs text-primary">{(timer.tasks as any)?.name || "Working"}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </TabsContent>

        {/* ── LIVE — only online users ── */}
        <TabsContent value="live" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Live Tracking
              </h3>
              <span className="text-xs text-muted-foreground">
                {(activeTimers as any[]).filter((t: any) => t.mode === "work").length} working · {(activeTimers as any[]).filter((t: any) => t.mode === "break").length} on break
              </span>
            </div>
            {/* Only show users who are online (have attendance record) */}
            {(allProfiles as any[]).filter((p: any) => attMap[p.user_id]).map((p: any) => {
              const timer = timerMap[p.user_id];
              const onBreak = timer?.mode === "break";
              const liveEl = timer ? Math.floor((now - new Date(timer.started_at).getTime()) / 1000) : 0;
              return (
                <div key={p.user_id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${timer ? onBreak ? "border-yellow-400/40 bg-yellow-400/5" : "border-primary/30 bg-accent/20" : "border-yellow-400/30 bg-yellow-400/5"}`}>
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${timer ? onBreak ? "bg-yellow-400 animate-pulse" : "bg-green-500 animate-pulse" : "bg-yellow-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.display_name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.job_title || "—"}{p.department ? ` · ${p.department}` : ""}</p>
                  </div>
                  {timer ? (
                    <div className="text-right flex-shrink-0">
                      <p className={`font-mono text-sm font-medium ${onBreak ? "text-yellow-400" : "text-primary"}`}>{fmtT(liveEl)}</p>
                      <p className="text-xs text-muted-foreground">{onBreak ? "☕ Break" : (timer.tasks as any)?.name || "Working"}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-yellow-400">Idle</span>
                  )}
                </div>
              );
            })}
            {(allProfiles as any[]).filter((p: any) => attMap[p.user_id]).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No users online right now</p>
            )}
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Today's Summary</h3>
            <div className="space-y-2">
              {[...(allProfiles as any[])].sort((a: any, b: any) => {
                // Sort by today tracked + live Time In elapsed
                const sa = (memberStats as any)[a.user_id]?.today || 0;
                const sb = (memberStats as any)[b.user_id]?.today || 0;
                const la = attMap[a.user_id] ? Math.floor((now - new Date(attMap[a.user_id].time_in_at).getTime()) / 1000) : 0;
                const lb = attMap[b.user_id] ? Math.floor((now - new Date(attMap[b.user_id].time_in_at).getTime()) / 1000) : 0;
                return (sb + lb) - (sa + la);
              }).map((p: any) => {
                const s = (memberStats as any)[p.user_id] || { today: 0 };
                // Add live Time In duration if user is currently timed in
                const liveTimeIn = attMap[p.user_id]
                  ? Math.floor((now - new Date(attMap[p.user_id].time_in_at).getTime()) / 1000)
                  : 0;
                const totalToday = s.today + liveTimeIn;
                const pct = totalToday > 0 ? Math.min(100, Math.round((totalToday / 28800) * 100)) : 0;
                return (
                  <div key={p.user_id}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-foreground">{p.display_name || "Unnamed"}</span>
                      <span className="text-xs font-mono text-muted-foreground">{fmtHM(totalToday)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: "hsl(270,70%,60%)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── DTR ── */}
        <TabsContent value="dtr" className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Daily Time Record
              </h3>
              <input type="date" value={dtrDate} onChange={e => setDtrDate(e.target.value)} className="bg-secondary border border-border rounded-md px-2 py-1 text-xs text-foreground" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Name</th>
                    <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Time In</th>
                    <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Time Out</th>
                    <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {(dtrLogs as any[]).map((d: any) => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-3 text-foreground font-medium">{d.display_name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{d.time_in ? format(new Date(d.time_in), "h:mm a") : "—"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{d.time_out ? format(new Date(d.time_out), "h:mm a") : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono text-foreground">{d.duration_seconds ? fmtHM(d.duration_seconds) : "—"}</td>
                    </tr>
                  ))}
                  {(dtrLogs as any[]).length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No records for {dtrDate}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── ROLES ── */}
        <TabsContent value="roles" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> User Roles
            </h3>
            {(allProfiles as any[]).map((p: any) => {
              const cur = getRoleForUser(p.user_id);
              const isEd = editingRoleId === p.user_id;
              return (
                <div key={p.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{(p.display_name || "?").charAt(0).toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.display_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{p.job_title || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEd ? (
                      <>
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger className="bg-card border-border text-xs h-7 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button size="sm" className="h-7 text-xs gradient-primary px-2" onClick={() => updateUserRole.mutate({ userId: p.user_id, role: editRole })}><Save className="h-3 w-3 mr-1" />Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => setEditingRoleId(null)}><X className="h-3 w-3" /></Button>
                      </>
                    ) : (
                      <>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cur === "admin" ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>{cur}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingRoleId(p.user_id); setEditRole(cur); }}><Pencil className="h-3 w-3" /></Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── TASKS ── */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add Task</h3>
            <Input placeholder="Task name" value={newTaskName} onChange={e => setNewTaskName(e.target.value)} className="bg-secondary border-border text-sm" />
            <Input placeholder="Category (e.g. Development, Design, Meeting…)" value={newTaskCategory} onChange={e => setNewTaskCategory(e.target.value)} className="bg-secondary border-border text-sm" />
            <Button size="sm" onClick={() => createTask.mutate()} disabled={!newTaskName.trim()} className="gradient-primary text-sm">
              <Plus className="h-3 w-3 mr-1" /> Add Task
            </Button>
          </div>
          <div className="glass-card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">All Tasks</h3>
            {(allTasks as any[]).map((t: any) => (
              <div key={t.id} className="rounded-lg bg-secondary/50 border border-border/50 p-3">
                {editingTaskId === t.id ? (
                  <div className="space-y-2">
                    <Input value={editTaskName} onChange={e => setEditTaskName(e.target.value)} className="bg-card border-border text-sm h-8" placeholder="Task name" />
                    <Input value={editTaskCategory} onChange={e => setEditTaskCategory(e.target.value)} className="bg-card border-border text-xs h-7" placeholder="Category" />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-xs gradient-primary px-2" onClick={() => updateTask.mutate({ id: t.id, name: editTaskName, category: editTaskCategory })}><Save className="h-3 w-3 mr-1" />Save</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditingTaskId(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.category}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingTaskId(t.id); setEditTaskName(t.name); setEditTaskCategory(t.category || ""); }}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteTask.mutate(t.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            ))}
            {(allTasks as any[]).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>}
          </div>
        </TabsContent>

        {/* ── SCREENSHOTS — grid layout ── */}
        <TabsContent value="screenshots" className="space-y-4">
          {/* Capture interval settings — shown first */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Capture Intervals</h3>
            {(allProfiles as any[]).map((p: any) => (
              <ScreenshotRow key={p.user_id} profile={p} onSave={interval => updateScreenshot.mutate({ userId: p.user_id, interval })} />
            ))}
          </div>

          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" /> Screenshots
              </h3>
              <div className="flex gap-2 items-center">
                <Select value={ssUserFilter} onValueChange={setSsUserFilter}>
                  <SelectTrigger className="bg-secondary border-border text-xs h-7 w-36"><SelectValue placeholder="Filter by user" /></SelectTrigger>
                  <SelectContent>
                    {(allProfiles as any[]).map((p: any) => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || "Unnamed"}</SelectItem>)}
                  </SelectContent>
                </Select>
                {ssUserFilter !== "all" && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setSsUserFilter("all")}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => deleteAllScreenshots.mutate()}
                  disabled={deleteAllScreenshots.isPending}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete all
                </Button>
              </div>
            </div>

            {/* Grid layout */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(screenshots as any[]).map((s: any) => (
                <div key={s.id} className="group relative rounded-lg border border-border/50 overflow-hidden bg-secondary/50 cursor-pointer"
                  onClick={() => setExpandedSs(expandedSs === s.id ? null : s.id)}>
                  {/* Thumbnail */}
                  <div className="aspect-video bg-secondary flex items-center justify-center overflow-hidden">
                    {s.image_data ? (
                      <img
                        src={s.image_data}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <Camera className="h-8 w-8 text-muted-foreground/30" />
                    )}
                  </div>
                  {/* Info overlay */}
                  <div className="p-2">
                    <p className="text-xs font-medium text-foreground truncate">{s.display_name}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(s.taken_at), "MMM d, h:mm a")}</p>
                    {s.tasks?.name && <p className="text-xs text-primary truncate">↳ {s.tasks.name}</p>}
                  </div>
                  {/* Delete button on hover */}
                  <button
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-white rounded p-1"
                    onClick={e => { e.stopPropagation(); deleteSingleScreenshot.mutate(s.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {(screenshots as any[]).length === 0 && (
                <div className="col-span-full py-10 text-center text-muted-foreground text-xs">No screenshots found</div>
              )}
            </div>

            {/* Expanded view — rendered outside the grid so it always has full data */}
          </div>

        </TabsContent>

        {/* ── ADMINISTRATION ── */}
        <TabsContent value="administration" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <UserMinus className="h-4 w-4 text-destructive" />
              <h3 className="text-sm font-semibold text-foreground">Delete Accounts</h3>
            </div>
            <p className="text-xs text-muted-foreground border border-destructive/30 bg-destructive/5 rounded-lg px-3 py-2">
              ⚠ Deleted accounts and all associated data (time entries, screenshots, DTR records) are permanently removed and cannot be restored.
            </p>
            <div className="space-y-2">
              {(allProfiles as any[]).filter((p: any) => p.user_id !== user?.id).map((p: any) => (
                <div key={p.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50 border border-border/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                      {(p.display_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.display_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground truncate">{(authEmails as any)[p.user_id] || p.job_title || "—"}</p>
                      {p.department && <p className="text-xs text-muted-foreground truncate">{p.department}</p>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0 gap-1"
                    onClick={() => { setDeleteConfirmUserId(p.user_id); setDeleteConfirmName(p.display_name || "this user"); }}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              ))}
              {(allProfiles as any[]).filter((p: any) => p.user_id !== user?.id).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No other accounts to manage</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Your own account is not listed and cannot be self-deleted.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const ScreenshotRow = ({ profile, onSave }: { profile: any; onSave: (n: number) => void }) => {
  const [val, setVal] = useState(String(profile.screenshot_interval ?? 600));
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{profile.display_name || "Unnamed"}</p>
        <p className="text-xs text-muted-foreground">{profile.job_title || "—"}</p>
      </div>
      <Select value={val} onValueChange={setVal}>
        <SelectTrigger className="bg-card border-border text-xs h-7 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="0">No screenshots</SelectItem>
          <SelectItem value="60">Every 1 min</SelectItem>
          <SelectItem value="300">Every 5 min</SelectItem>
          <SelectItem value="600">Every 10 min</SelectItem>
          <SelectItem value="900">Every 15 min</SelectItem>
          <SelectItem value="1800">Every 30 min</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" className={`h-7 text-xs px-3 ${saved ? "bg-green-600 hover:bg-green-600" : "gradient-primary"}`}
        onClick={() => { onSave(parseInt(val)); setSaved(true); setTimeout(() => setSaved(false), 2000); }}>
        {saved ? "Saved!" : "Save"}
      </Button>
    </div>
  );
};

export default AdminPanel;
