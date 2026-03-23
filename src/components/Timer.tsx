import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Play, Square, Coffee, LogIn, LogOut as LogOutIcon } from "lucide-react";

interface TimerProps {
  taskId?: string;
  projectId?: string;
  onEntryCreated?: () => void;
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const Timer = ({ taskId, projectId, onEntryCreated }: TimerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [mode, setMode] = useState<"work" | "break">("work");
  const [timedIn, setTimedIn] = useState(false);
  const [timeInStamp, setTimeInStamp] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenshotTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get screenshot interval from profile (admin-configured)
  const { data: screenshotInterval = 600 } = useQuery({
    queryKey: ["profile_screenshot_interval", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("screenshot_interval")
        .eq("user_id", user!.id)
        .single();
      if (error) return 600;
      return data.screenshot_interval ?? 600;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const takeScreenshot = useCallback(async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "20px Inter";
        ctx.fillText(`Screenshot taken at ${new Date().toLocaleTimeString()}`, 20, 40);
        ctx.fillText(`Timer: ${formatTime(elapsed)}`, 20, 70);
      }
      toast({ title: "Screenshot captured", description: `Next in ${screenshotInterval / 60} min` });
    } catch {
      toast({ title: "Screenshot failed", variant: "destructive" });
    }
  }, [elapsed, screenshotInterval, toast]);

  useEffect(() => {
    if (isRunning && mode === "work" && screenshotInterval > 0) {
      screenshotTimerRef.current = setInterval(takeScreenshot, screenshotInterval * 1000);
    }
    return () => {
      if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current);
    };
  }, [isRunning, mode, screenshotInterval, takeScreenshot]);

  const handleStart = () => {
    setStartTime(new Date());
    setElapsed(0);
    setIsRunning(true);
  };

  const handleStop = async () => {
    setIsRunning(false);
    if (!startTime || !user) return;

    if (mode === "work") {
      const endTime = new Date();
      const { error } = await supabase.from("time_entries").insert({
        user_id: user.id,
        task_id: taskId || null,
        project_id: projectId || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_seconds: elapsed,
        screenshot_interval: screenshotInterval,
      });

      if (error) {
        toast({ title: "Error saving time entry", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Time entry saved!" });
        onEntryCreated?.();
      }
    } else {
      toast({ title: "Break ended", description: `Break lasted ${formatTime(elapsed)}` });
    }
    setElapsed(0);
    setStartTime(null);
  };

  const handleTimeIn = () => {
    setTimedIn(true);
    setTimeInStamp(new Date());
    toast({ title: "Timed In!", description: `Started at ${new Date().toLocaleTimeString()}` });
  };

  const handleTimeOut = async () => {
    if (!timeInStamp || !user) return;
    setTimedIn(false);
    const endTime = new Date();
    const durationSeconds = Math.floor((endTime.getTime() - timeInStamp.getTime()) / 1000);

    const { error } = await supabase.from("time_entries").insert({
      user_id: user.id,
      task_id: taskId || null,
      project_id: projectId || null,
      start_time: timeInStamp.toISOString(),
      end_time: endTime.toISOString(),
      duration_seconds: durationSeconds,
      description: "Time In / Time Out entry",
    });

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Timed Out!", description: `Total: ${formatTime(durationSeconds)}` });
      onEntryCreated?.();
    }
    setTimeInStamp(null);
  };

  const isBreak = mode === "break";

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Cadence Clock</h3>
        <div className="flex items-center gap-2">
          <Button
            variant={!isBreak ? "default" : "outline"}
            size="sm"
            onClick={() => { if (!isRunning) setMode("work"); }}
            disabled={isRunning}
            className={!isBreak ? "gradient-primary" : ""}
          >
            <Play className="h-3 w-3 mr-1" /> Work
          </Button>
          <Button
            variant={isBreak ? "default" : "outline"}
            size="sm"
            onClick={() => { if (!isRunning) setMode("break"); }}
            disabled={isRunning}
            className={isBreak ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}
          >
            <Coffee className="h-3 w-3 mr-1" /> Break
          </Button>
        </div>
      </div>

      <div className="text-center">
        <div className={`timer-display text-5xl font-bold rounded-lg p-4 ${
          isRunning
            ? isBreak
              ? "text-warning animate-pulse"
              : "text-primary animate-pulse-glow glow-primary"
            : "text-foreground"
        }`}>
          {formatTime(elapsed)}
        </div>
        {isBreak && <p className="text-sm text-warning mt-1">☕ Break Mode</p>}
      </div>

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

      {/* Time In / Time Out */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Attendance</p>
            {timedIn && timeInStamp && (
              <p className="text-xs text-muted-foreground">
                In since {timeInStamp.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleTimeIn}
              disabled={timedIn}
              size="sm"
              className="gap-1 gradient-primary"
            >
              <LogIn className="h-3 w-3" /> Time In
            </Button>
            <Button
              onClick={handleTimeOut}
              disabled={!timedIn}
              size="sm"
              variant="destructive"
              className="gap-1"
            >
              <LogOutIcon className="h-3 w-3" /> Time Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timer;
