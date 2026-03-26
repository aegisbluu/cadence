import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";

const fmt = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const Members = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());

  // Tick every second for live durations
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // My profile — need department
  const { data: myProfile } = useQuery({
    queryKey: ["my_profile_dept", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, department, display_name, job_title").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  // All teammates in same department
  const { data: teammates = [] } = useQuery({
    queryKey: ["teammates", myProfile?.department],
    queryFn: async () => {
      let q = supabase.from("profiles").select("user_id, display_name, job_title, department").order("display_name");
      if (myProfile?.department) q = q.eq("department", myProfile.department);
      const { data } = await q;
      return data || [];
    },
    enabled: !!user && myProfile !== undefined,
    refetchInterval: 15000,
  });

  // Active timers — all users (RLS allows all authenticated to read)
  const { data: activeTimers = [] } = useQuery({
    queryKey: ["members_timers"],
    queryFn: async () => {
      const { data } = await supabase.from("active_timers").select("user_id, started_at, mode, task_id, tasks(name)");
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 3000,
  });

  // Attendance — all users (RLS allows all authenticated to read)
  const { data: attendances = [] } = useQuery({
    queryKey: ["members_attendance"],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("user_id, time_in_at");
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 3000,
  });

  // Subscribe to realtime changes so status updates instantly
  useEffect(() => {
    const ch = supabase.channel("members-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_timers" }, () => {
        qc.invalidateQueries({ queryKey: ["members_timers"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => {
        qc.invalidateQueries({ queryKey: ["members_attendance"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const timerMap: Record<string, any> = {};
  for (const t of activeTimers as any[]) timerMap[t.user_id] = t;
  const attMap: Record<string, any> = {};
  for (const a of attendances as any[]) attMap[a.user_id] = a;

  const getStatus = (userId: string) => {
    if (!attMap[userId]) return "offline";
    const t = timerMap[userId];
    if (!t) return "idle";
    if (t.mode === "break") return "break";
    return "active";
  };

  const dotClass = (s: string) => ({
    active: "bg-green-500 animate-pulse",
    idle: "bg-yellow-400",
    break: "bg-yellow-500 animate-pulse",
    offline: "bg-muted-foreground/40",
  }[s] || "bg-muted-foreground/40");

  const rowClass = (s: string) => ({
    active: "border-primary/30 bg-accent/20",
    idle: "border-yellow-400/30 bg-yellow-400/5",
    break: "border-yellow-500/30 bg-yellow-500/5",
    offline: "border-border bg-secondary/30 opacity-60",
  }[s] || "border-border bg-secondary/30");

  const statusText = (s: string) => ({
    active: { label: "Tracking", color: "text-green-500" },
    idle: { label: "Online — idle", color: "text-yellow-500" },
    break: { label: "On break", color: "text-yellow-500" },
    offline: { label: "Offline", color: "text-muted-foreground" },
  }[s] || { label: "Offline", color: "text-muted-foreground" });

  const deptLabel = myProfile?.department || "Your Team";
  const online = (teammates as any[]).filter(t => getStatus(t.user_id) !== "offline");
  const tracking = (teammates as any[]).filter(t => getStatus(t.user_id) === "active");
  const offline = (teammates as any[]).filter(t => getStatus(t.user_id) === "offline");

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" /> {deptLabel}
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Online</p><p className="text-2xl font-bold text-green-500">{online.length}</p></div>
        <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Tracking</p><p className="text-2xl font-bold text-primary">{tracking.length}</p></div>
        <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Offline</p><p className="text-2xl font-bold text-muted-foreground">{offline.length}</p></div>
      </div>

      <div className="glass-card p-4 space-y-2">
        {(teammates as any[]).map((p: any) => {
          const status = getStatus(p.user_id);
          const st = statusText(status);
          const timer = timerMap[p.user_id];
          const att = attMap[p.user_id];
          const liveElapsed = timer ? Math.floor((now - new Date(timer.started_at).getTime()) / 1000) : 0;
          const isMe = p.user_id === user?.id;
          const taskName = (timer as any)?.tasks?.name;

          return (
            <div key={p.user_id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${rowClass(status)}`}>
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass(status)}`} />
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                {(p.display_name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {p.display_name || "Unnamed"}
                  {isMe && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">{p.job_title || "—"}</p>
                {/* Current task — visible to all teammates */}
                {timer && taskName && (
                  <p className="text-xs text-primary truncate">↳ {taskName}</p>
                )}
                {timer && !taskName && status === "active" && (
                  <p className="text-xs text-muted-foreground truncate">↳ Working</p>
                )}
              </div>
              <div className="text-right flex-shrink-0 space-y-0.5 min-w-[80px]">
                <p className={`text-xs font-medium ${st.color}`}>{st.label}</p>
                {/* Live timer — updates every second */}
                {status === "active" && (
                  <p className="text-xs font-mono text-primary">{fmt(liveElapsed)}</p>
                )}
                {status === "break" && (
                  <p className="text-xs font-mono text-yellow-500">{fmt(liveElapsed)}</p>
                )}
                {att && (
                  <p className="text-xs text-muted-foreground">
                    In {new Date(att.time_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {(teammates as any[]).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {myProfile?.department
              ? `No teammates found in ${myProfile.department}.`
              : "Department not set — contact your admin."}
          </p>
        )}
      </div>
    </div>
  );
};

export default Members;
