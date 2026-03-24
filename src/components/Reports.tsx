import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { BarChart3, Clock, ListTodo, Search } from "lucide-react";

const fmtDur = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

const Reports = ({ projectId }: { projectId?: string }) => {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [range, setRange] = useState("week");
  const [filterProject, setFilterProject] = useState("all");
  const [filterTask, setFilterTask] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("me");

  const getDateRange = () => {
    const now = new Date();
    switch (range) {
      case "today": return { start: new Date(new Date().setHours(0,0,0,0)).toISOString(), end: new Date().toISOString() };
      case "week": return { start: startOfWeek(now).toISOString(), end: endOfWeek(now).toISOString() };
      case "month": return { start: startOfMonth(now).toISOString(), end: endOfMonth(now).toISOString() };
      case "last30": return { start: subDays(now, 30).toISOString(), end: now.toISOString() };
      default: return { start: startOfWeek(now).toISOString(), end: endOfWeek(now).toISOString() };
    }
  };

  // Admin: fetch all profiles for user search
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["reports_profiles"],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("user_id, display_name"); return data || []; },
    enabled: !!user && isAdmin,
  });

  const filteredProfiles = (allProfiles as any[]).filter(p =>
    !userSearch || (p.display_name || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  const targetUserId = isAdmin && selectedUserId !== "me" ? selectedUserId : user?.id;

  const { data: entries = [] } = useQuery({
    queryKey: ["time_entries_report", range, targetUserId],
    queryFn: async () => {
      const { start, end } = getDateRange();
      let q = supabase.from("time_entries")
        .select("*, projects(name, color), tasks(name, category)")
        .eq("user_id", targetUserId!)
        .gte("start_time", start)
        .lte("start_time", end)
        .order("start_time", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!targetUserId,
  });

  // All projects/tasks from entries for filter dropdowns
  const projectOptions = Array.from(new Set(entries.map(e => (e.projects as any)?.name || "No Project")));
  const taskOptions = Array.from(new Set(entries.map(e => (e.tasks as any)?.name || "No Task")));

  // Apply filters
  const filtered = entries.filter(e => {
    const pName = (e.projects as any)?.name || "No Project";
    const tName = (e.tasks as any)?.name || "No Task";
    if (filterProject !== "all" && pName !== filterProject) return false;
    if (filterTask !== "all" && tName !== filterTask) return false;
    return true;
  });

  const totalSeconds = filtered.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);

  // Daily chart — by task, not project
  const dailyData = filtered.reduce((acc: Record<string, number>, e) => {
    const day = format(new Date(e.start_time), "EEE");
    acc[day] = (acc[day] || 0) + (e.duration_seconds || 0);
    return acc;
  }, {});
  const barData = Object.entries(dailyData).map(([name, s]) => ({ name, hours: Math.round((s/3600)*100)/100 }));

  // Pie — by task
  const taskPieData = filtered.reduce((acc: Record<string, { seconds: number; color: string }>, e) => {
    const name = (e.tasks as any)?.name || "No Task";
    const colors = ["#A855F7","#3B82F6","#10B981","#F97316","#EF4444","#EC4899","#06B6D4","#F59E0B"];
    const color = colors[Object.keys(acc).length % colors.length];
    if (!acc[name]) acc[name] = { seconds: 0, color };
    acc[name].seconds += e.duration_seconds || 0;
    return acc;
  }, {});
  const pieData = Object.entries(taskPieData).map(([name, { seconds, color }]) => ({ name, value: Math.round((seconds/3600)*100)/100, color }));

  // Task breakdown table
  const taskTableData = filtered.reduce((acc: Record<string, { seconds: number; category: string; project: string }>, e) => {
    const name = (e.tasks as any)?.name || "No Task";
    const category = (e.tasks as any)?.category || "—";
    const project = (e.projects as any)?.name || "No Project";
    if (!acc[name]) acc[name] = { seconds: 0, category, project };
    acc[name].seconds += e.duration_seconds || 0;
    return acc;
  }, {});
  const taskRows = Object.entries(taskTableData).sort((a,b) => b[1].seconds - a[1].seconds);

  const viewingUser = isAdmin && selectedUserId !== "me"
    ? (allProfiles as any[]).find(p => p.user_id === selectedUserId)?.display_name || "User"
    : "My";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> {viewingUser} Reports
        </h2>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px] bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="last30">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Admin: user search */}
      {isAdmin && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-2"><Search className="h-3.5 w-3.5 text-primary" /> Search User Reports</p>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="pl-8 bg-secondary border-border text-sm h-8"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedUserId("me")}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${selectedUserId === "me" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
            >
              My Reports
            </button>
            {filteredProfiles.map((p: any) => (
              <button
                key={p.user_id}
                onClick={() => setSelectedUserId(p.user_id)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${selectedUserId === p.user_id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
              >
                {p.display_name || "Unnamed"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters: project + task */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterProject} onValueChange={v => { setFilterProject(v); setFilterTask("all"); }}>
          <SelectTrigger className="w-[160px] bg-secondary border-border text-sm h-8"><SelectValue placeholder="All Projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projectOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTask} onValueChange={setFilterTask}>
          <SelectTrigger className="w-[160px] bg-secondary border-border text-sm h-8"><SelectValue placeholder="All Tasks" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tasks</SelectItem>
            {taskOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterProject !== "all" || filterTask !== "all") && (
          <button onClick={() => { setFilterProject("all"); setFilterTask("all"); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-secondary transition-colors">
            Clear filters
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-muted-foreground text-sm">Total Time</p>
          <p className="text-2xl font-bold text-foreground timer-display">{fmtDur(totalSeconds)}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-muted-foreground text-sm">Sessions</p>
          <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-muted-foreground text-sm">Tasks tracked</p>
          <p className="text-2xl font-bold text-foreground">{taskRows.length}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Daily Hours</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <XAxis dataKey="name" stroke="hsl(240,5%,55%)" fontSize={12} />
              <YAxis stroke="hsl(240,5%,55%)" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(240,5%,10%)", border: "1px solid hsl(240,4%,18%)", borderRadius: "8px" }} labelStyle={{ color: "hsl(0,0%,96%)" }} />
              <Bar dataKey="hours" fill="hsl(270,70%,60%)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">By Task</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}h`}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(240,5%,10%)", border: "1px solid hsl(240,4%,18%)", borderRadius: "8px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Task breakdown table */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" /> Task Breakdown
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Task</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Category</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Project</th>
                <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Time</th>
                <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map(([name, { seconds, category, project }]) => (
                <tr key={name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-2 px-3 text-foreground font-medium">{name}</td>
                  <td className="py-2 px-3 text-muted-foreground">{category}</td>
                  <td className="py-2 px-3 text-muted-foreground">{project}</td>
                  <td className="py-2 px-3 text-right font-mono text-foreground">{fmtDur(seconds)}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${totalSeconds > 0 ? Math.round((seconds/totalSeconds)*100) : 0}%`, background: "hsl(270,70%,60%)" }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">{totalSeconds > 0 ? Math.round((seconds/totalSeconds)*100) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {taskRows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No task data for this period</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Recent Sessions</h3>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filtered.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm text-foreground">{(e.tasks as any)?.name || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">{(e.projects as any)?.name || "No project"} · {format(new Date(e.start_time), "MMM d, h:mm a")}</p>
                </div>
              </div>
              <span className="timer-display text-sm text-foreground">{fmtDur(e.duration_seconds || 0)}</span>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No entries for this period</p>}
        </div>
      </div>
    </div>
  );
};

export default Reports;
