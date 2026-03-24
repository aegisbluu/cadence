import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Folder, ListTodo, Users, Trash2, Pencil, Plus, Camera, Activity, Clock, CheckCircle2, Building2, Save, X, Shield } from "lucide-react";

const PROJECT_COLORS = ["#A855F7", "#3B82F6", "#10B981", "#F97316", "#EF4444", "#EC4899", "#06B6D4", "#F59E0B"];
const CATEGORIES = ["Development", "Design", "Research", "Meeting", "Admin", "Other"];
const ROLES = ["admin", "user"];

const fmt = (s: number) => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const fmtHM = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

const AdminPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("Other");
  const [newTaskProjectId, setNewTaskProjectId] = useState<string>("none");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskName, setEditTaskName] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("user");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: allProjects = [] } = useQuery({
    queryKey: ["admin_projects"],
    queryFn: async () => { const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; },
    enabled: !!user,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ["admin_tasks"],
    queryFn: async () => { const { data, error } = await supabase.from("tasks").select("*, projects(name)").order("created_at", { ascending: false }); if (error) throw error; return data; },
    enabled: !!user,
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["admin_profiles"],
    queryFn: async () => { const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; },
    enabled: !!user,
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin_roles"],
    queryFn: async () => { const { data, error } = await supabase.from("user_roles").select("*"); if (error) throw error; return data; },
    enabled: !!user,
  });

  const { data: memberStats = {} } = useQuery({
    queryKey: ["admin_member_stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("time_entries").select("user_id, duration_seconds, start_time");
      if (error) throw error;
      const stats: Record<string, { total: number; today: number; sessions: number }> = {};
      const todayStr = new Date().toDateString();
      for (const e of data) {
        if (!stats[e.user_id]) stats[e.user_id] = { total: 0, today: 0, sessions: 0 };
        stats[e.user_id].total += e.duration_seconds || 0;
        stats[e.user_id].sessions += 1;
        if (new Date(e.start_time).toDateString() === todayStr) stats[e.user_id].today += e.duration_seconds || 0;
      }
      return stats;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: activeTimers = [] } = useQuery({
    queryKey: ["admin_active_timers"],
    queryFn: async () => { const { data, error } = await supabase.from("active_timers").select("*, tasks(name), projects(name)"); if (error) return []; return data; },
    enabled: !!user,
    refetchInterval: 5000,
  });

  useEffect(() => {
    const channel = supabase.channel("admin-active-timers")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_timers" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin_active_timers"] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Mutations
  const createProject = useMutation({
    mutationFn: async () => { const tid = (allProfiles[0] as any)?.user_id || user!.id; const { error } = await supabase.from("projects").insert({ user_id: tid, name: newProjectName, color: newProjectColor }); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_projects"] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); setNewProjectName(""); toast({ title: "Project created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateProject = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => { const { error } = await supabase.from("projects").update({ name }).eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_projects"] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); setEditingProjectId(null); toast({ title: "Project updated" }); },
  });
  const deleteProject = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("projects").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_projects"] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); toast({ title: "Project deleted" }); },
  });
  const createTask = useMutation({
    mutationFn: async () => { const tid = (allProfiles[0] as any)?.user_id || user!.id; const { error } = await supabase.from("tasks").insert({ user_id: tid, name: newTaskName, category: newTaskCategory, project_id: newTaskProjectId === "none" ? null : newTaskProjectId }); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_tasks"] }); queryClient.invalidateQueries({ queryKey: ["tasks"] }); setNewTaskName(""); toast({ title: "Task created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateTask = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => { const { error } = await supabase.from("tasks").update({ name }).eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_tasks"] }); queryClient.invalidateQueries({ queryKey: ["tasks"] }); setEditingTaskId(null); toast({ title: "Task updated" }); },
  });
  const deleteTask = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tasks").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_tasks"] }); queryClient.invalidateQueries({ queryKey: ["tasks"] }); toast({ title: "Task deleted" }); },
  });

  // Screenshot interval — fixed to properly save
  const updateScreenshotInterval = useMutation({
    mutationFn: async ({ userId, interval }: { userId: string; interval: number }) => {
      const { error } = await supabase.from("profiles").update({ screenshot_interval: interval }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_profiles"] }); queryClient.invalidateQueries({ queryKey: ["profile_screenshot_interval"] }); toast({ title: "Screenshot interval saved!" }); },
    onError: (e: any) => toast({ title: "Error saving interval", description: e.message, variant: "destructive" }),
  });

  const updateMemberProfile = useMutation({
    mutationFn: async ({ userId, jobTitle, department }: { userId: string; jobTitle: string; department: string }) => {
      const { error } = await supabase.from("profiles").update({ job_title: jobTitle, department }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_profiles"] }); setEditingMemberId(null); toast({ title: "Profile updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateUserRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("user_roles").upsert({ user_id: userId, role: role as any }, { onConflict: "user_id,role" });
      if (error) throw error;
      // Remove other roles
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId).neq("role", role as "admin" | "user");
      if (delErr) throw delErr;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_roles"] }); setEditingRoleId(null); toast({ title: "Role updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const departments = Array.from(new Set((allProfiles as any[]).map((p) => p.department || "Unassigned"))).sort() as string[];
  const activeTimerMap: Record<string, any> = {};
  for (const t of activeTimers as any[]) activeTimerMap[t.user_id] = t;

  const getRoleForUser = (userId: string) => {
    const r = (allRoles as any[]).find((r) => r.user_id === userId);
    return r?.role || "user";
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" /> Admin Dashboard
      </h2>

      <Tabs defaultValue="members">
        <TabsList className="bg-secondary mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="members" className="gap-1 text-xs"><Users className="h-3 w-3" /> Members</TabsTrigger>
          <TabsTrigger value="live" className="gap-1 text-xs"><Activity className="h-3 w-3" /> Live</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1 text-xs"><Shield className="h-3 w-3" /> Roles</TabsTrigger>
          <TabsTrigger value="projects" className="gap-1 text-xs"><Folder className="h-3 w-3" /> Projects</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1 text-xs"><ListTodo className="h-3 w-3" /> Tasks</TabsTrigger>
          <TabsTrigger value="screenshots" className="gap-1 text-xs"><Camera className="h-3 w-3" /> Screenshots</TabsTrigger>
        </TabsList>

        {/* ── MEMBERS ── */}
        <TabsContent value="members" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total members", value: (allProfiles as any[]).length },
              { label: "Active today", value: Object.values(memberStats as any).filter((s: any) => s.today > 0).length },
              { label: "Departments", value: departments.filter(d => d !== "Unassigned").length },
              { label: "Currently live", value: (activeTimers as any[]).filter(t => t.mode === "work").length },
            ].map(({ label, value }) => (
              <div key={label} className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-bold text-primary">{value}</p>
              </div>
            ))}
          </div>

          {departments.map((dept) => {
            const members = (allProfiles as any[]).filter(p => (p.department || "Unassigned") === dept);
            return (
              <div key={dept} className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{dept}</h3>
                  <span className="text-xs text-muted-foreground">({members.length})</span>
                </div>
                {members.map((p: any) => {
                  const stats = (memberStats as any)[p.user_id] || { total: 0, today: 0, sessions: 0 };
                  const timer = activeTimerMap[p.user_id];
                  const isEditing = editingMemberId === p.user_id;
                  const liveElapsed = timer ? Math.floor((now - new Date(timer.started_at).getTime()) / 1000) : 0;
                  return (
                    <div key={p.id} className={`rounded-lg border p-3 transition-all ${timer ? "border-primary/30 bg-accent/20" : "border-border bg-secondary/40"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${timer ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{p.display_name || "Unnamed"}</p>
                            {isEditing ? (
                              <div className="mt-2 space-y-2">
                                <Input placeholder="Job title" value={editJobTitle} onChange={e => setEditJobTitle(e.target.value)} className="bg-card border-border text-xs h-7" />
                                <Input placeholder="Department" value={editDepartment} onChange={e => setEditDepartment(e.target.value)} className="bg-card border-border text-xs h-7" />
                                <div className="flex gap-1">
                                  <Button size="sm" className="h-6 text-xs gradient-primary px-2"
                                    onClick={() => updateMemberProfile.mutate({ userId: p.user_id, jobTitle: editJobTitle, department: editDepartment })}>
                                    <Save className="h-3 w-3 mr-1" /> Save
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingMemberId(null)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="text-xs text-muted-foreground">{p.job_title || <span className="italic">No title</span>}</p>
                                <p className="text-xs text-muted-foreground">{p.department || <span className="italic">No department</span>}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-2 flex-shrink-0">
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
                            {timer && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono mt-1">● {fmt(liveElapsed)}</span>
                            )}
                          </div>
                          {!isEditing && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingMemberId(p.user_id); setEditJobTitle(p.job_title || ""); setEditDepartment(p.department || ""); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {timer && (
                        <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          <span className="text-xs text-primary">{(timer.tasks as any)?.name || "No task"}{(timer.projects as any)?.name ? ` — ${(timer.projects as any).name}` : ""}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {(allProfiles as any[]).length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No members registered yet</p>}
        </TabsContent>

        {/* ── LIVE ── */}
        <TabsContent value="live" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Live Tracking</h3>
              <span className="text-xs text-muted-foreground">{(activeTimers as any[]).filter(t => t.mode === "work").length} working · {(activeTimers as any[]).filter(t => t.mode === "break").length} on break</span>
            </div>
            {(allProfiles as any[]).map((p: any) => {
              const timer = activeTimerMap[p.user_id];
              const liveElapsed = timer ? Math.floor((now - new Date(timer.started_at).getTime()) / 1000) : 0;
              const isOnBreak = timer?.mode === "break";
              return (
                <div key={p.user_id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${timer ? isOnBreak ? "border-warning/40 bg-warning/5" : "border-primary/30 bg-accent/20" : "border-border bg-secondary/30 opacity-60"}`}>
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${timer ? isOnBreak ? "bg-warning animate-pulse" : "bg-green-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.display_name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.job_title || "—"}{p.department ? ` · ${p.department}` : ""}</p>
                  </div>
                  {timer ? (
                    <div className="text-right flex-shrink-0">
                      <p className={`font-mono text-sm font-medium ${isOnBreak ? "text-warning" : "text-primary"}`}>{fmt(liveElapsed)}</p>
                      <p className="text-xs text-muted-foreground">{isOnBreak ? "☕ Break" : (timer.tasks as any)?.name || "Working"}</p>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">Offline</span>}
                </div>
              );
            })}
          </div>
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Today's Summary</h3>
            <div className="space-y-2">
              {[...(allProfiles as any[])].sort((a, b) => ((memberStats as any)[b.user_id]?.today || 0) - ((memberStats as any)[a.user_id]?.today || 0)).map((p: any) => {
                const stats = (memberStats as any)[p.user_id] || { today: 0 };
                const pct = stats.today > 0 ? Math.min(100, Math.round((stats.today / 28800) * 100)) : 0;
                return (
                  <div key={p.user_id}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-foreground">{p.display_name || "Unnamed"}</span>
                      <span className="text-xs font-mono text-muted-foreground">{fmtHM(stats.today)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "hsl(270, 70%, 60%)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Progress bar = % of 8h workday</p>
          </div>
        </TabsContent>

        {/* ── ROLES ── */}
        <TabsContent value="roles" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> User Roles</h3>
            <p className="text-xs text-muted-foreground">Assign admin or user role to each member. Changes take effect immediately.</p>
            {(allProfiles as any[]).map((p: any) => {
              const currentRole = getRoleForUser(p.user_id);
              const isEditing = editingRoleId === p.user_id;
              return (
                <div key={p.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                      {(p.display_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.display_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.job_title || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEditing ? (
                      <>
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger className="bg-card border-border text-xs h-7 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-7 text-xs gradient-primary px-2"
                          onClick={() => updateUserRole.mutate({ userId: p.user_id, role: editRole })}>
                          <Save className="h-3 w-3 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => setEditingRoleId(null)}><X className="h-3 w-3" /></Button>
                      </>
                    ) : (
                      <>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${currentRole === "admin" ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                          {currentRole}
                        </span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingRoleId(p.user_id); setEditRole(currentRole); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {(allProfiles as any[]).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No users found</p>}
          </div>
        </TabsContent>

        {/* ── PROJECTS ── */}
        <TabsContent value="projects" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add Project</h3>
            <Input placeholder="Project name" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} className="bg-secondary border-border text-sm" />
            <div className="flex gap-2 flex-wrap">
              {PROJECT_COLORS.map(c => (
                <button key={c} onClick={() => setNewProjectColor(c)} className={`h-5 w-5 rounded-full transition-transform ${newProjectColor === c ? "scale-125 ring-2 ring-foreground" : ""}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <Button size="sm" onClick={() => createProject.mutate()} disabled={!newProjectName.trim()} className="gradient-primary text-sm">
              <Plus className="h-3 w-3 mr-1" /> Add Project
            </Button>
          </div>
          <div className="glass-card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">All Projects</h3>
            {(allProjects as any[]).map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-secondary/50 group">
                <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                {editingProjectId === p.id ? (
                  <div className="flex-1 flex gap-2">
                    <Input value={editProjectName} onChange={e => setEditProjectName(e.target.value)} className="bg-card border-border text-sm h-8" />
                    <Button size="sm" onClick={() => updateProject.mutate({ id: p.id, name: editProjectName })}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingProjectId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-foreground">{p.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { setEditingProjectId(p.id); setEditProjectName(p.name); }}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => deleteProject.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
                  </>
                )}
              </div>
            ))}
            {(allProjects as any[]).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No projects</p>}
          </div>
        </TabsContent>

        {/* ── TASKS ── */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add Task</h3>
            <Input placeholder="Task name" value={newTaskName} onChange={e => setNewTaskName(e.target.value)} className="bg-secondary border-border text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newTaskProjectId} onValueChange={setNewTaskProjectId}>
                <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue placeholder="Project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project</SelectItem>
                  {(allProjects as any[]).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => createTask.mutate()} disabled={!newTaskName.trim()} className="gradient-primary text-sm">
              <Plus className="h-3 w-3 mr-1" /> Add Task
            </Button>
          </div>
          <div className="glass-card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">All Tasks</h3>
            {(allTasks as any[]).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-secondary/50 group">
                {editingTaskId === t.id ? (
                  <div className="flex-1 flex gap-2">
                    <Input value={editTaskName} onChange={e => setEditTaskName(e.target.value)} className="bg-card border-border text-sm h-8" />
                    <Button size="sm" onClick={() => updateTask.mutate({ id: t.id, name: editTaskName })}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTaskId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.category} {t.projects?.name ? `• ${t.projects.name}` : ""}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { setEditingTaskId(t.id); setEditTaskName(t.name); }}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => deleteTask.mutate(t.id)}><Trash2 className="h-3 w-3" /></Button>
                  </>
                )}
              </div>
            ))}
            {(allTasks as any[]).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>}
          </div>
        </TabsContent>

        {/* ── SCREENSHOTS ── */}
        <TabsContent value="screenshots" className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Camera className="h-4 w-4 text-primary" /> Screenshot Intervals</h3>
            <p className="text-xs text-muted-foreground">Set how often screenshots are captured per user during work sessions.</p>
            <div className="space-y-3">
              {(allProfiles as any[]).map((p: any) => (
                <ScreenshotRow key={p.user_id} profile={p} onSave={(interval) => updateScreenshotInterval.mutate({ userId: p.user_id, interval })} />
              ))}
              {(allProfiles as any[]).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No users</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Inline row component so each user has its own interval state
const ScreenshotRow = ({ profile, onSave }: { profile: any; onSave: (interval: number) => void }) => {
  const [val, setVal] = useState(String(profile.screenshot_interval ?? 600));
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(parseInt(val));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{profile.display_name || "Unnamed"}</p>
        <p className="text-xs text-muted-foreground truncate">{profile.job_title || "—"}</p>
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
      <Button size="sm" className={`h-7 text-xs px-3 ${saved ? "bg-green-600 hover:bg-green-600" : "gradient-primary"}`} onClick={handleSave}>
        {saved ? "Saved!" : "Save"}
      </Button>
    </div>
  );
};

export default AdminPanel;
