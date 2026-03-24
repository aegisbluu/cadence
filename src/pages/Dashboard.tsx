import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Timer from "@/components/Timer";
import ProjectList from "@/components/ProjectList";
import Reports from "@/components/Reports";
import AdminPanel from "@/components/AdminPanel";
import { Button } from "@/components/ui/button";
import { Clock, BarChart3, LogOut, LayoutDashboard, Shield, Sun, Moon, Settings, X, ChevronDown } from "lucide-react";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [view, setView] = useState<"timer" | "reports" | "admin">("timer");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("cadence-theme") as any) || "dark");
  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

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

  const displayName = profile?.display_name || user?.email || "";

  return (
    <div className={`min-h-screen bg-background ${theme === "light" ? "light-mode" : ""}`}>
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-foreground">Cadence</span>
          </div>

          {/* Only Admin tab in top nav — Track/Reports moved to sidebar */}
          <nav className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            <Button variant="ghost" size="sm" onClick={() => setView("timer")} className={view === "timer" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}>
              <LayoutDashboard className="h-4 w-4 mr-1" /> Track
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setView("reports")} className={view === "reports" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}>
              <BarChart3 className="h-4 w-4 mr-1" /> Reports
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setView("admin")} className={view === "admin" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}>
                <Shield className="h-4 w-4 mr-1" /> Admin
              </Button>
            )}
          </nav>

          {/* User menu */}
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowSettings(false); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-foreground hidden sm:block max-w-[120px] truncate">{displayName}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-10 w-48 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  {profile?.job_title && <p className="text-xs text-muted-foreground">{profile.job_title}{profile.department ? ` · ${profile.department}` : ""}</p>}
                </div>
                <button onClick={() => { setShowSettings(true); setShowUserMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors">
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-secondary transition-colors">
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
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Settings</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Account</p>
              <div className="bg-secondary rounded-lg px-3 py-2 space-y-0.5">
                <p className="text-sm text-foreground font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                {profile?.job_title && <p className="text-xs text-muted-foreground">{profile.job_title}{profile.department ? ` · ${profile.department}` : ""}</p>}
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

      <main className="container mx-auto px-4 py-6">
        {view === "admin" ? (
          <AdminPanel />
        ) : view === "reports" ? (
          /* Reports: left col = projects filter, right = reports */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <ProjectList selectedProjectId={selectedProjectId} onSelectProject={setSelectedProjectId} />
            </div>
            <div className="lg:col-span-3">
              <Reports projectId={selectedProjectId} />
            </div>
          </div>
        ) : (
          /* Track: left col = projects + nav links stacked, right = Cadence Clock */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <ProjectList selectedProjectId={selectedProjectId} onSelectProject={setSelectedProjectId} />
              {/* Stacked nav shortcuts */}
              <div className="glass-card p-3 space-y-1">
                <button
                  onClick={() => setView("timer")}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${view === "timer" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <LayoutDashboard className="h-4 w-4" /> Track
                </button>
                <button
                  onClick={() => setView("reports")}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${view === "reports" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <BarChart3 className="h-4 w-4" /> Reports
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setView("admin")}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${view === "admin" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                  >
                    <Shield className="h-4 w-4" /> Admin
                  </button>
                )}
              </div>
            </div>
            <div className="lg:col-span-3">
              <Timer
                projectId={selectedProjectId}
                onEntryCreated={() => queryClient.invalidateQueries({ queryKey: ["time_entries_report"] })}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
