import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";

const fmt = (s: number) => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

const Members = () => {
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Get current user's department
  const { data: myProfile } = useQuery({
    queryKey: ["my_profile", user?.id],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("department").eq("user_id", user!.id).single(); return data; },
    enabled: !!user,
  });

  // Get all profiles in same department
  const { data: teammates = [] } = useQuery({
    queryKey: ["teammates", myProfile?.department],
    queryFn: async () => {
      let q = supabase.from("profiles").select("*").order("display_name");
      if (myProfile?.department) q = q.eq("department", myProfile.department);
      const { data } = await q; return data || [];
    },
    enabled: !!user && myProfile !== undefined,
    refetchInterval: 10000,
  });

  const { data: activeTimers = [] } = useQuery({
    queryKey: ["members_active_timers"],
    queryFn: async () => { const { data } = await supabase.from("active_timers").select("*, tasks(name)"); return data || []; },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: attendances = [] } = useQuery({
    queryKey: ["members_attendance"],
    queryFn: async () => { const { data } = await supabase.from("attendance").select("*"); return data || []; },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const timerMap: Record<string,any> = {};
  for (const t of activeTimers as any[]) timerMap[t.user_id] = t;
  const attMap: Record<string,any> = {};
  for (const a of attendances as any[]) attMap[a.user_id] = a;

  const getStatus = (userId: string) => {
    if (!attMap[userId]) return "offline";
    if (timerMap[userId]) return timerMap[userId].mode === "break" ? "break" : "active";
    return "idle";
  };

  const statusDot = (status: string) => {
    if (status === "active") return "bg-green-500 animate-pulse";
    if (status === "idle") return "bg-yellow-400";
    if (status === "break") return "bg-warning animate-pulse";
    return "bg-muted-foreground/40";
  };

  const statusLabel = (status: string) => {
    if (status === "active") return { text: "Tracking", color: "text-green-500" };
    if (status === "idle") return { text: "Online — idle", color: "text-yellow-500" };
    if (status === "break") return { text: "On break", color: "text-warning" };
    return { text: "Offline", color: "text-muted-foreground" };
  };

  const deptLabel = myProfile?.department || "Your Team";

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" /> {deptLabel}
      </h2>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Online", value: (teammates as any[]).filter(t => getStatus(t.user_id) !== "offline").length, color: "text-green-500" },
          { label: "Tracking", value: (teammates as any[]).filter(t => getStatus(t.user_id) === "active").length, color: "text-primary" },
          { label: "Offline", value: (teammates as any[]).filter(t => getStatus(t.user_id) === "offline").length, color: "text-muted-foreground" },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Member list */}
      <div className="glass-card p-4 space-y-2">
        {(teammates as any[]).map((p: any) => {
          const status = getStatus(p.user_id);
          const sl = statusLabel(status);
          const timer = timerMap[p.user_id];
          const att = attMap[p.user_id];
          const liveElapsed = timer ? Math.floor((now - new Date(timer.started_at).getTime()) / 1000) : 0;
          const timeInElapsed = att ? Math.floor((now - new Date(att.time_in_at).getTime()) / 1000) : 0;
          const isMe = p.user_id === user?.id;

          return (
            <div key={p.user_id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${status === "active" ? "border-primary/30 bg-accent/20" : status === "idle" ? "border-yellow-400/30 bg-yellow-400/5" : status === "break" ? "border-warning/30 bg-warning/5" : "border-border bg-secondary/30 opacity-60"}`}>
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(status)}`} />
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                {(p.display_name||"?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-foreground truncate">{p.display_name || "Unnamed"}{isMe && <span className="text-xs text-muted-foreground ml-1">(you)</span>}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate">{p.job_title||"—"}</p>
                {timer && status === "break" && (
                  <p className="text-xs text-warning font-medium">☕ On Break</p>
                )}
                {timer && status === "active" && (
                  <p className="text-xs text-muted-foreground truncate">🔧 {timer.tasks?.name || "Working"}</p>
                )}
                {timer && status === "break" && timer.tasks?.name && (
                  <p className="text-xs text-muted-foreground truncate">Task: {timer.tasks.name}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0 space-y-0.5">
                <p className={`text-xs font-medium ${sl.color}`}>{sl.text}</p>
                {timer && <p className="text-xs font-mono text-primary">{fmt(liveElapsed)}</p>}
                {att && <p className="text-xs text-muted-foreground">In: {new Date(att.time_in_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>}
              </div>
            </div>
          );
        })}
        {(teammates as any[]).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No teammates found{myProfile?.department ? ` in ${myProfile.department}` : " — department not set"}.</p>
        )}
      </div>
    </div>
  );
};

export default Members;
