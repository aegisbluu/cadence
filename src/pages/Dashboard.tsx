import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Timer from "@/components/Timer";
import Timesheet from "@/components/Timesheet";
import Leaves from "@/components/Leaves";
import Reports from "@/components/Reports";
import AdminPanel from "@/components/AdminPanel";
import Members from "@/components/Members";
import { Button } from "@/components/ui/button";
import {
  Clock, BarChart3, LogOut, LayoutDashboard, Shield, Sun, Moon,
  Settings, X, ChevronDown, Home, Users, FileText, CalendarDays, Eye
} from "lucide-react";

type View = "timer" | "reports" | "admin" | "members" | "timesheet" | "leaves";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("timer");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("cadence-theme") as any) || "dark");
  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Admin: view-as-user mode
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);
  const [showViewAs, setShowViewAs] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("light-mode", theme === "light");
    localStorage.setItem("cadence-theme", theme);
  }, [theme]);

  const { data: profile } = useQuery({
    queryKey: ["my_profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name, job_title, department").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  // All profiles for admin view-as selector
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["admin_profiles_for_viewas"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, display_name, job_title").order("display_name");
      return data || [];
    },
    enabled: !!user && isAdmin,
  });

  const displayName = profile?.display_name || user?.email || "";
  const viewAsProfile = viewAsUserId ? (allProfiles as any[]).find(p => p.user_id === viewAsUserId) : null;
  // The effective user ID used by child components (Reports uses this via prop)
  const effectiveUserId = viewAsUserId || user?.id;

  const navItems: { id: View; label: string; icon: any; adminOnly?: boolean }[] = [
    { id: "timer",     label: "Track",     icon: LayoutDashboard },
    { id: "reports",   label: "Reports",   icon: BarChart3 },
    { id: "members",   label: "Members",   icon: Users },
    { id: "timesheet", label: "Timesheet", icon: FileText },
    { id: "leaves",    label: "Leaves",    icon: CalendarDays },
    { id: "admin",     label: "Admin",     icon: Shield, adminOnly: true },
  ];

  const SidebarNav = () => (
    <div className="glass-card p-4 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pb-3">Navigation</p>
      {navItems.filter(n => !n.adminOnly || isAdmin).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setView(id)}
          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-all ${
            view === id
              ? "bg-primary/15 text-primary border border-primary/25 shadow-sm"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
          }`}
        >
          <Icon className="h-5 w-5 flex-shrink-0" />
          {label}
        </button>
      ))}

      {/* Admin: view as another user */}
      {isAdmin && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pb-2">View As</p>
          <button
            onClick={() => setShowViewAs(v => !v)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
              viewAsUserId
                ? "bg-amber-500/10 text-amber-500 border-amber-500/25"
                : "text-muted-foreground hover:bg-secondary border-transparent"
            }`}
          >
            <Eye className="h-5 w-5 flex-shrink-0" />
            {viewAsProfile?.display_name || "Client / User"}
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showViewAs ? "rotate-180" : ""}`} />
          </button>
          {showViewAs && (
            <div className="mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
              <button
                onClick={() => { setViewAsUserId(null); setShowViewAs(false); }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary transition-colors ${!viewAsUserId ? "text-primary font-medium" : "text-muted-foreground"}`}
              >
                Admin view (me)
              </button>
              {(allProfiles as any[]).filter(p => p.user_id !== user?.id).map((p: any) => (
                <button
                  key={p.user_id}
                  onClick={() => { setViewAsUserId(p.user_id); setShowViewAs(false); setView("reports"); }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary transition-colors ${viewAsUserId === p.user_id ? "text-primary font-medium" : "text-muted-foreground"}`}
                >
                  {p.display_name || "Unnamed"}
                  {p.job_title && <span className="text-xs text-muted-foreground/60 ml-1">· {p.job_title}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={`min-h-screen bg-background ${theme === "light" ? "light-mode" : ""}`}>
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-foreground">Cadence</span>
          </div>
          {/* View-as banner */}
          {viewAsUserId && viewAsProfile && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <Eye className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-amber-500 font-medium">Viewing as {viewAsProfile.display_name}</span>
              <button onClick={() => setViewAsUserId(null)} className="text-amber-500/70 hover:text-amber-500 ml-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="relative">
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowSettings(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-foreground hidden sm:block max-w-[140px] truncate">{displayName}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-11 w-52 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  {profile?.job_title && (
                    <p className="text-xs text-muted-foreground">{profile.job_title}{profile.department ? ` · ${profile.department}` : ""}</p>
                  )}
                </div>
                <button onClick={() => { setShowSettings(true); setShowUserMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-secondary">
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <button onClick={signOut} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-secondary">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" /> Settings
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Account</p>
              <div className="bg-secondary rounded-lg px-3 py-2.5 space-y-0.5">
                <p className="text-sm text-foreground font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                {profile?.job_title && (
                  <p className="text-xs text-muted-foreground">{profile.job_title}{profile.department ? ` · ${profile.department}` : ""}</p>
                )}
                {isAdmin && <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary mt-1">Admin</span>}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Appearance</p>
              <div className="flex gap-2">
                <button onClick={() => setTheme("dark")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-all ${theme === "dark" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                  <Moon className="h-4 w-4" /> Dark
                </button>
                <button onClick={() => setTheme("light")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-all ${theme === "light" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                  <Sun className="h-4 w-4" /> Light
                </button>
              </div>
            </div>
            <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </div>
      )}
      {showUserMenu && <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />}

      {/* Main */}
      <main className="container mx-auto px-4 py-6">
        {view === "admin" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setView("timer")} className="gap-2">
                <Home className="h-4 w-4" /> Home
              </Button>
              <span className="text-sm text-muted-foreground">Admin Dashboard</span>
            </div>
            <AdminPanel />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <SidebarNav />
            </div>
            <div className="min-w-0">
              {view === "timer"     && <Timer onEntryCreated={() => queryClient.invalidateQueries({ queryKey: ["time_entries_report"] })} />}
              {view === "reports"   && <Reports viewAsUserId={viewAsUserId} />}
              {view === "members"   && <Members />}
              {view === "timesheet" && <Timesheet />}
              {view === "leaves"    && <Leaves />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
