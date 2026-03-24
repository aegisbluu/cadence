import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { BarChart3, Clock, ListTodo } from "lucide-react";

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const Reports = ({ projectId }: { projectId?: string }) => {
  const { user } = useAuth();
  const [range, setRange] = useState("week");

  const getDateRange = () => {
    const now = new Date();
    switch (range) {
      case "today": return { start: new Date(now.setHours(0,0,0,0)).toISOString(), end: new Date().toISOString() };
      case "week": return { start: startOfWeek(now).toISOString(), end: endOfWeek(now).toISOString() };
      case "month": return { start: startOfMonth(now).toISOString(), end: endOfMonth(now).toISOString() };
      case "last30": return { start: subDays(now, 30).toISOString(), end: now.toISOString() };
      default: return { start: startOfWeek(now).toISOString(), end: endOfWeek(now).toISOString() };
    }
  };

  const { data: entries = [] } = useQuery({
    queryKey: ["time_entries_report", range],
    queryFn: async () => {
      const { start, end } = getDateRange();
      const { data, error } = await supabase
        .from("time_entries")
        .select("*, projects(name, color), tasks(name, category)")
        .gte("start_time", start)
        .lte("start_time", end)
        .order("start_time", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const totalSeconds = entries.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);

  const dailyData = entries.reduce((acc: Record<string, number>, e) => {
    const day = format(new Date(e.start_time), "EEE");
    acc[day] = (acc[day] || 0) + (e.duration_seconds || 0);
    return acc;
  }, {});
  const barData = Object.entries(dailyData).map(([name, seconds]) => ({ name, hours: Math.round((seconds / 3600) * 100) / 100 }));

  const projectData = entries.reduce((acc: Record<string, { seconds: number; color: string }>, e) => {
    const name = (e.projects as any)?.name || "No Project";
    const color = (e.projects as any)?.color || "#A855F7";
    if (!acc[name]) acc[name] = { seconds: 0, color };
    acc[name].seconds += e.duration_seconds || 0;
    return acc;
  }, {});
  const pieData = Object.entries(projectData).map(([name, { seconds, color }]) => ({ name, value: Math.round((seconds / 3600) * 100) / 100, color }));

  // Task breakdown
  const taskData = entries.reduce((acc: Record<string, { seconds: number; category: string; project: string }>, e) => {
    const name = (e.tasks as any)?.name || "No Task";
    const category = (e.tasks as any)?.category || "—";
    const project = (e.projects as any)?.name || "No Project";
    if (!acc[name]) acc[name] = { seconds: 0, category, project };
    acc[name].seconds += e.duration_seconds || 0;
    return acc;
  }, {});
  const taskRows = Object.entries(taskData).sort((a, b) => b[1].seconds - a[1].seconds);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Reports
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-muted-foreground text-sm">Total Time</p>
          <p className="text-2xl font-bold text-foreground timer-display">{formatDuration(totalSeconds)}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-muted-foreground text-sm">Sessions</p>
          <p className="text-2xl font-bold text-foreground">{entries.length}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-muted-foreground text-sm">Avg / Session</p>
          <p className="text-2xl font-bold text-foreground timer-display">
            {entries.length > 0 ? formatDuration(Math.round(totalSeconds / entries.length)) : "0m"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Daily Hours</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <XAxis dataKey="name" stroke="hsl(240, 5%, 55%)" fontSize={12} />
              <YAxis stroke="hsl(240, 5%, 55%)" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(240, 5%, 10%)", border: "1px solid hsl(240, 4%, 18%)", borderRadius: "8px" }} labelStyle={{ color: "hsl(0, 0%, 96%)" }} />
              <Bar dataKey="hours" fill="hsl(270, 70%, 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">By Project</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}h`}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(240, 5%, 10%)", border: "1px solid hsl(240, 4%, 18%)", borderRadius: "8px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Task Breakdown */}
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
                  <td className="py-2 px-3 text-right font-mono text-foreground">{formatDuration(seconds)}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0}%`, background: "hsl(270, 70%, 60%)" }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">{totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {taskRows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No task data for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Entries */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Recent Sessions</h3>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm text-foreground">{(e.tasks as any)?.name || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">
                    {(e.projects as any)?.name || "No project"} • {format(new Date(e.start_time), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
              <span className="timer-display text-sm text-foreground">{formatDuration(e.duration_seconds || 0)}</span>
            </div>
          ))}
          {entries.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No entries for this period</p>}
        </div>
      </div>
    </div>
  );
};

export default Reports;
