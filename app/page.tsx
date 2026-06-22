"use client";

import { useState, useEffect, useRef } from "react";

interface Habit {
  id: string;
  name: string;
  durationMin: number;
  perWeek: number;
  timeOfDay: string;
  priority: number;
  fixedDays: string; // JSON string array
  type: string;
}

interface Goal {
  id: string;
  name: string;
  totalEffortMin: number;
  completedMin: number;
  deadline: string;
  earliestStart: string;
  sessionMinMin: number;
  sessionMaxMin: number;
  timeOfDay: string;
  priority: number;
}

interface Block {
  id: string;
  start: string;
  end: string;
  status: "planned" | "done" | "partial" | "skipped";
  googleEventId?: string;
  name: string;
  type: "habit" | "goal" | "sleep";
  habitId?: string;
  goalId?: string;
}

interface Settings {
  timeZone: string;
  dayWindows: string; // JSON string
  blackoutDays: string; // JSON string
  agentReviewMin: number;
  agentProvider: string;
  email: string | null;
  connected: boolean;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"calendar" | "habits" | "goals" | "settings">("calendar");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const mon = new Date(today.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    return mon;
  });

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Modals ref
  const habitModalRef = useRef<HTMLDialogElement>(null);
  const goalModalRef = useRef<HTMLDialogElement>(null);
  const blockModalRef = useRef<HTMLDialogElement>(null);

  // Form states
  const [editingHabit, setEditingHabit] = useState<Partial<Habit> | null>(null);
  const [editingGoal, setEditingGoal] = useState<Partial<Goal> | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);

  // Load initial settings, habits, goals
  useEffect(() => {
    fetchSettings();
    fetchHabits();
    fetchGoals();
  }, []);

  // Fetch blocks when week changes
  useEffect(() => {
    fetchBlocks();
  }, [currentWeekStart]);

  const showStatus = (text: string, type: "success" | "error" = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) setSettings(await res.json());
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const fetchHabits = async () => {
    try {
      const res = await fetch("/api/habits");
      if (res.ok) setHabits(await res.json());
    } catch (err) {
      console.error("Error fetching habits:", err);
    }
  };

  const fetchGoals = async () => {
    try {
      const res = await fetch("/api/goals");
      if (res.ok) setGoals(await res.json());
    } catch (err) {
      console.error("Error fetching goals:", err);
    }
  };

  const fetchBlocks = async () => {
    setLoading(true);
    try {
      const start = currentWeekStart.toISOString();
      const end = new Date(currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`/api/blocks?start=${start}&end=${end}`);
      if (res.ok) setBlocks(await res.json());
    } catch (err) {
      console.error("Error fetching blocks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualReplan = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/schedule", { method: "POST" });
      if (res.ok) {
        showStatus("Schedule successfully generated and synced with Google Calendar!");
        fetchBlocks();
      } else {
        const data = await res.json();
        showStatus(data.error || "Failed to sync schedule", "error");
      }
    } catch (err) {
      showStatus("Error triggering schedule build", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Habit CRUD
  const saveHabit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const durationMin = parseInt(formData.get("durationMin") as string, 10);
    const perWeek = parseInt(formData.get("perWeek") as string, 10);
    const timeOfDay = formData.get("timeOfDay") as string;
    const priority = parseInt(formData.get("priority") as string, 10);
    const type = formData.get("type") as string;

    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const fixedDays: string[] = [];
    days.forEach(d => {
      if (formData.get(`day-${d}`)) {
        fixedDays.push(d);
      }
    });

    const payload = { name, durationMin, perWeek, timeOfDay, priority, fixedDays, type };

    try {
      let res;
      if (editingHabit?.id) {
        res = await fetch(`/api/habits/${editingHabit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/habits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        showStatus(`Habit successfully ${editingHabit?.id ? "updated" : "created"}!`);
        habitModalRef.current?.close();
        fetchHabits();
        fetchBlocks();
      } else {
        const errData = await res.json();
        showStatus(errData.error || "Failed to save habit", "error");
      }
    } catch (err) {
      showStatus("Error saving habit", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const deleteHabit = async (id: string) => {
    if (!confirm("Are you sure you want to delete this habit? All scheduled slots will be removed.")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/habits/${id}`, { method: "DELETE" });
      if (res.ok) {
        showStatus("Habit deleted.");
        fetchHabits();
        fetchBlocks();
      } else {
        showStatus("Failed to delete habit", "error");
      }
    } catch (err) {
      showStatus("Error deleting habit", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Goal CRUD
  const saveGoal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const totalEffortHours = parseFloat(formData.get("totalEffortHours") as string);
    const completedHours = parseFloat(formData.get("completedHours") as string) || 0;
    const deadline = new Date(formData.get("deadline") as string).toISOString();
    const earliestStart = new Date(formData.get("earliestStart") as string).toISOString();
    const sessionMinMin = parseInt(formData.get("sessionMinMin") as string, 10);
    const sessionMaxMin = parseInt(formData.get("sessionMaxMin") as string, 10);
    const timeOfDay = formData.get("timeOfDay") as string;
    const priority = parseInt(formData.get("priority") as string, 10);

    const payload = {
      name,
      totalEffortMin: Math.round(totalEffortHours * 60),
      completedMin: Math.round(completedHours * 60),
      deadline,
      earliestStart,
      sessionMinMin,
      sessionMaxMin,
      timeOfDay,
      priority,
    };

    try {
      let res;
      if (editingGoal?.id) {
        res = await fetch(`/api/goals/${editingGoal.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        showStatus(`Goal successfully ${editingGoal?.id ? "updated" : "created"}!`);
        goalModalRef.current?.close();
        fetchGoals();
        fetchBlocks();
      } else {
        const errData = await res.json();
        showStatus(errData.error || "Failed to save goal", "error");
      }
    } catch (err) {
      showStatus("Error saving goal", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const deleteGoal = async (id: string) => {
    if (!confirm("Are you sure you want to delete this goal? All scheduled slots will be removed.")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (res.ok) {
        showStatus("Goal deleted.");
        fetchGoals();
        fetchBlocks();
      } else {
        showStatus("Failed to delete goal", "error");
      }
    } catch (err) {
      showStatus("Error deleting goal", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Block Status Update
  const updateBlockStatus = async (status: "planned" | "done" | "partial" | "skipped") => {
    if (!selectedBlock) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/blocks/${selectedBlock.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showStatus("Block status updated.");
        blockModalRef.current?.close();
        fetchBlocks();
      } else {
        showStatus("Failed to update status", "error");
      }
    } catch (err) {
      showStatus("Error updating block status", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Settings Save
  const saveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionLoading(true);
    const formData = new FormData(e.currentTarget);
    const timeZone = formData.get("timeZone") as string;
    const email = formData.get("email") as string || null;
    const agentReviewMin = parseInt(formData.get("agentReviewMin") as string, 10);
    const agentProvider = formData.get("agentProvider") as string;

    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const dayWindows: Record<string, any> = {};
    days.forEach(d => {
      dayWindows[d] = {
        wakeMin: parseInt(formData.get(`${d}-wakeMin`) as string, 10),
        sleepMin: parseInt(formData.get(`${d}-sleepMin`) as string, 10),
        workStartMin: parseInt(formData.get(`${d}-workStartMin`) as string, 10),
        workEndMin: parseInt(formData.get(`${d}-workEndMin`) as string, 10),
      };
    });

    const payload = {
      timeZone,
      email,
      agentReviewMin,
      agentProvider,
      dayWindows,
    };

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showStatus("Settings saved successfully! Replanning triggered.");
        fetchSettings();
        fetchBlocks();
      } else {
        const errData = await res.json();
        showStatus(errData.error || "Failed to save settings", "error");
      }
    } catch (err) {
      showStatus("Error saving settings", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Date Nav Helpers
  const nextWeek = () => {
    setCurrentWeekStart(new Date(currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000));
  };
  const prevWeek = () => {
    setCurrentWeekStart(new Date(currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000));
  };
  const goToday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(today.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    setCurrentWeekStart(mon);
  };

  // Helper to render days of week header
  const getWeekDays = () => {
    const days = [];
    const mapping = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart.getTime() + i * 24 * 60 * 60 * 1000);
      days.push({
        name: mapping[i],
        dateStr: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
        isoStr: d.toISOString().split("T")[0],
      });
    }
    return days;
  };

  const weekDays = getWeekDays();

  // Helper to place blocks inside column
  const getBlocksForDay = (dateStr: string) => {
    return blocks.filter(b => {
      const bDate = b.start.split("T")[0];
      return bDate === dateStr;
    });
  };

  const getPriorityBadge = (p: number) => {
    const labels = ["High", "Medium-High", "Medium", "Medium-Low", "Low"];
    const colors = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#10b981"];
    return (
      <span style={{ background: colors[p - 1] + "20", color: colors[p - 1], border: `1px solid ${colors[p - 1]}40` }} className="badge">
        P{p}: {labels[p - 1]}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: "2.25rem", color: "#fff", background: "linear-gradient(to right, #a78bfa, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Beni&apos;s Weekly Planner
          </h1>
          <p style={{ color: "var(--foreground-secondary)", fontSize: "0.95rem", marginTop: 4 }}>
            Deterministic Calendar Scheduling & LLM Coaching
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {settings?.connected ? (
            <span className="badge badge-connected">Google Calendar Connected</span>
          ) : (
            <a href="/api/auth/google" className="badge badge-disconnected">Connect Google Calendar</a>
          )}

          <button
            onClick={handleManualReplan}
            disabled={actionLoading || !settings?.connected}
            className="btn btn-primary"
            style={{ padding: "8px 16px" }}
          >
            {actionLoading ? "Syncing..." : "Sync Schedule"}
          </button>
        </div>
      </header>

      {/* Navigation & Tab selectors */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div className="tab-container">
          <button onClick={() => setActiveTab("calendar")} className={`tab-btn ${activeTab === "calendar" ? "active" : ""}`}>
            Weekly Calendar
          </button>
          <button onClick={() => setActiveTab("habits")} className={`tab-btn ${activeTab === "habits" ? "active" : ""}`}>
            Habits
          </button>
          <button onClick={() => setActiveTab("goals")} className={`tab-btn ${activeTab === "goals" ? "active" : ""}`}>
            Goals
          </button>
          <button onClick={() => setActiveTab("settings")} className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}>
            Settings
          </button>
        </div>

        {activeTab === "calendar" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={prevWeek} className="btn btn-secondary" style={{ padding: "8px 12px" }}>&larr; Prev</button>
            <button onClick={goToday} className="btn btn-secondary" style={{ padding: "8px 16px" }}>Today</button>
            <button onClick={nextWeek} className="btn btn-secondary" style={{ padding: "8px 12px" }}>Next &rarr;</button>
            <span style={{ marginLeft: 8, fontWeight: 500 }}>
              Week of {currentWeekStart.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        )}
      </div>

      {/* Notifications */}
      {statusMessage && (
        <div style={{
          padding: "12px 20px",
          borderRadius: 8,
          marginBottom: 24,
          background: statusMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
          border: `1px solid ${statusMessage.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
          color: statusMessage.type === "success" ? "var(--accent-green)" : "var(--accent-red)",
          fontSize: "0.95rem",
          display: "flex",
          justifyContent: "space-between"
        }}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>&times;</button>
        </div>
      )}

      {/* Dashboard Screens */}
      {activeTab === "calendar" && (
        <div className="glass-panel" style={{ padding: "16px 0 0 0", overflow: "hidden" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 400, color: "var(--foreground-secondary)" }}>
              Loading calendar blocks...
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 900 }}>
                {/* Grid header */}
                <div className="calendar-grid">
                  <div className="calendar-header-cell" style={{ background: "rgba(0,0,0,0.3)" }}>UTC Time</div>
                  {weekDays.map(d => (
                    <div key={d.name} className="calendar-header-cell">
                      <div style={{ fontWeight: 600 }}>{d.name}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--foreground-secondary)" }}>{d.dateStr}</div>
                    </div>
                  ))}

                  {/* 24-hour rows */}
                  {Array.from({ length: 24 }).map((_, hourIndex) => {
                    const hourLabel = `${hourIndex.toString().padStart(2, "0")}:00`;
                    return (
                      <div key={hourIndex} style={{ display: "contents" }}>
                        {/* Time cell */}
                        <div className="calendar-time-cell" style={{ height: 60 }}>
                          {hourLabel}
                        </div>

                        {/* Col cells */}
                        {weekDays.map(day => {
                          const dayBlocks = getBlocksForDay(day.isoStr);
                          return (
                            <div key={day.isoStr} className="calendar-day-column" style={{ height: 60 }}>
                              {/* Draw hour lines */}
                              <div className="calendar-hour-slot" />

                              {/* Absolute elements */}
                              {dayBlocks.map(block => {
                                const bStart = new Date(block.start);
                                const bEnd = new Date(block.end);
                                const startMin = bStart.getUTCHours() * 60 + bStart.getUTCMinutes();
                                const duration = (bEnd.getTime() - bStart.getTime()) / (60 * 1000);

                                // Compute styles
                                const top = (startMin / 60) * 60; // 60px per hour
                                const height = (duration / 60) * 60;

                                // Colors based on type
                                let accentColor = "var(--accent-purple)";
                                let bgColor = "var(--accent-purple-glow)";
                                if (block.type === "goal") {
                                  accentColor = "var(--accent-blue)";
                                  bgColor = "var(--accent-blue-glow)";
                                } else if (block.type === "sleep") {
                                  accentColor = "var(--accent-sleep)";
                                  bgColor = "var(--accent-sleep-glow)";
                                }

                                // Status modifiers
                                let statusBorder = "solid";
                                let opacity = 1;
                                if (block.status === "done") {
                                  accentColor = "var(--accent-green)";
                                  bgColor = "var(--accent-green-glow)";
                                } else if (block.status === "skipped") {
                                  accentColor = "rgba(255,255,255,0.15)";
                                  bgColor = "rgba(0,0,0,0.3)";
                                  opacity = 0.4;
                                }

                                return (
                                  <div
                                    key={block.id}
                                    className="calendar-block"
                                    onClick={() => {
                                      setSelectedBlock(block);
                                      blockModalRef.current?.showModal();
                                    }}
                                    style={{
                                      top: `${top}px`,
                                      height: `${height}px`,
                                      background: bgColor,
                                      borderColor: accentColor,
                                      borderStyle: statusBorder,
                                      opacity: opacity,
                                    }}
                                  >
                                    <div style={{ fontWeight: 600, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                      {block.name}
                                    </div>
                                    <div style={{ fontSize: "0.65rem", opacity: 0.8 }}>
                                      {bStart.getUTCHours().toString().padStart(2, "0")}:{bStart.getUTCMinutes().toString().padStart(2, "0")} - {bEnd.getUTCHours().toString().padStart(2, "0")}:{bEnd.getUTCMinutes().toString().padStart(2, "0")}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "habits" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: "1.5rem" }}>My Habits</h2>
            <button
              onClick={() => {
                setEditingHabit({});
                habitModalRef.current?.showModal();
              }}
              className="btn btn-primary"
            >
              Add New Habit
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {habits.length === 0 ? (
              <div style={{ gridColumn: "1/-1", padding: 48, textAlign: "center", color: "var(--foreground-secondary)" }}>
                No habits configured yet. Add your first habit!
              </div>
            ) : (
              habits.map(h => (
                <div key={h.id} className="glass-panel glass-panel-hover" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <h3 style={{ fontSize: "1.2rem", fontWeight: 600 }}>{h.name}</h3>
                      <span className={`badge`} style={{
                        background: h.type === "sleep" ? "var(--accent-sleep-glow)" : "var(--accent-purple-glow)",
                        color: h.type === "sleep" ? "var(--accent-sleep)" : "var(--accent-purple)",
                        border: `1px solid ${h.type === "sleep" ? "var(--accent-sleep)30" : "var(--accent-purple)30"}`
                      }}>
                        {h.type}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.9rem", color: "var(--foreground-secondary)", marginBottom: 16 }}>
                      <div>Duration: <strong style={{ color: "#fff" }}>{h.durationMin} mins</strong></div>
                      <div>Frequency: <strong style={{ color: "#fff" }}>{h.perWeek}x / week</strong></div>
                      <div>Prefer: <strong style={{ color: "#fff" }}>{h.timeOfDay}</strong></div>
                      {h.fixedDays && JSON.parse(h.fixedDays).length > 0 && (
                        <div>Fixed Days: <strong style={{ color: "#fff" }}>{JSON.parse(h.fixedDays).join(", ").toUpperCase()}</strong></div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                    {getPriorityBadge(h.priority)}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          setEditingHabit(h);
                          habitModalRef.current?.showModal();
                        }}
                        className="btn btn-secondary"
                        style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteHabit(h.id)}
                        className="btn btn-danger"
                        style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "goals" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: "1.5rem" }}>Deadline-driven Goals</h2>
            <button
              onClick={() => {
                setEditingGoal({});
                goalModalRef.current?.showModal();
              }}
              className="btn btn-primary"
            >
              Add New Goal
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
            {goals.length === 0 ? (
              <div style={{ gridColumn: "1/-1", padding: 48, textAlign: "center", color: "var(--foreground-secondary)" }}>
                No goals configured yet. Add your first goal project!
              </div>
            ) : (
              goals.map(g => {
                const percent = Math.min(100, Math.round((g.completedMin / g.totalEffortMin) * 100));
                return (
                  <div key={g.id} className="glass-panel glass-panel-hover" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <h3 style={{ fontSize: "1.25rem", marginBottom: 12 }}>{g.name}</h3>

                      {/* Progress bar */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--foreground-secondary)", marginBottom: 4 }}>
                          <span>Progress ({percent}%)</span>
                          <span>{Math.round(g.completedMin / 60)}h / {Math.round(g.totalEffortMin / 60)}h</span>
                        </div>
                        <div style={{ height: 6, background: "rgba(0,0,0,0.3)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${percent}%`, height: "100%", background: "var(--accent-blue)", borderRadius: 3 }} />
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.9rem", color: "var(--foreground-secondary)", marginBottom: 16 }}>
                        <div>Deadline: <strong style={{ color: "#fff" }}>{new Date(g.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong></div>
                        <div>Session duration: <strong style={{ color: "#fff" }}>{g.sessionMinMin} - {g.sessionMaxMin} mins</strong></div>
                        <div>Prefer: <strong style={{ color: "#fff" }}>{g.timeOfDay}</strong></div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                      {getPriorityBadge(g.priority)}

                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => {
                            setEditingGoal(g);
                            goalModalRef.current?.showModal();
                          }}
                          className="btn btn-secondary"
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteGoal(g.id)}
                          className="btn btn-danger"
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === "settings" && settings && (
        <form onSubmit={saveSettings} className="glass-panel" style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: 20 }}>System Settings</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div>
              <label htmlFor="timeZone">Timezone</label>
              <select name="timeZone" id="timeZone" defaultValue={settings.timeZone}>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div>
              <label htmlFor="email">Notifications Email</label>
              <input type="email" name="email" id="email" defaultValue={settings.email || ""} placeholder="owner@example.com" />
            </div>

            <div>
              <label htmlFor="agentReviewMin">Agent Review Time (Minutes past Midnight)</label>
              <input type="number" name="agentReviewMin" id="agentReviewMin" defaultValue={settings.agentReviewMin} min={0} max={1440} />
            </div>

            <div>
              <label htmlFor="agentProvider">AI Agent Provider</label>
              <select name="agentProvider" id="agentProvider" defaultValue={settings.agentProvider}>
                <option value="openrouter">OpenRouter</option>
                <option value="agy">Antigravity CLI (agy)</option>
                <option value="fake">Fake (Mock tests)</option>
              </select>
            </div>
          </div>

          <h3 style={{ fontSize: "1.15rem", marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 6 }}>
            Awake & Working Hour Windows
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(day => {
              const windows = JSON.parse(settings.dayWindows || "{}");
              const currentWindow = windows[day] || { wakeMin: 420, sleepMin: 1380, workStartMin: 540, workEndMin: 1020 };

              return (
                <div key={day} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr 1fr", gap: 12, alignItems: "center" }}>
                  <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{day}</div>

                  <div>
                    <label style={{ fontSize: "0.7rem", marginBottom: 2 }}>Wake (Min)</label>
                    <input type="number" name={`${day}-wakeMin`} defaultValue={currentWindow.wakeMin} min={0} max={1440} />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.7rem", marginBottom: 2 }}>Sleep (Min)</label>
                    <input type="number" name={`${day}-sleepMin`} defaultValue={currentWindow.sleepMin} min={0} max={1440} />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.7rem", marginBottom: 2 }}>Work Start (Min)</label>
                    <input type="number" name={`${day}-workStartMin`} defaultValue={currentWindow.workStartMin} min={0} max={1440} />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.7rem", marginBottom: 2 }}>Work End (Min)</label>
                    <input type="number" name={`${day}-workEndMin`} defaultValue={currentWindow.workEndMin} min={0} max={1440} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button type="submit" disabled={actionLoading} className="btn btn-primary">
              {actionLoading ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      )}

      {/* Habit modal dialog */}
      <dialog ref={habitModalRef} closedby="any" style={{ width: "90%", maxWidth: 500 }} className="glass-panel" aria-labelledby="habitModalTitle">
        {editingHabit && (
          <form onSubmit={saveHabit} method="dialog">
            <h2 id="habitModalTitle" style={{ fontSize: "1.35rem", marginBottom: 16 }}>
              {editingHabit.id ? "Edit Habit" : "Create Habit"}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              <div>
                <label htmlFor="h-name">Name</label>
                <input id="h-name" type="text" name="name" required defaultValue={editingHabit.name || ""} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="h-duration">Duration (Minutes)</label>
                  <input id="h-duration" type="number" name="durationMin" required defaultValue={editingHabit.durationMin || 45} min={5} />
                </div>
                <div>
                  <label htmlFor="h-perweek">Frequency (per week)</label>
                  <input id="h-perweek" type="number" name="perWeek" required defaultValue={editingHabit.perWeek || 3} min={1} max={7} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="h-timeofday">Preferred Time</label>
                  <select id="h-timeofday" name="timeOfDay" defaultValue={editingHabit.timeOfDay || "any"}>
                    <option value="any">Any Time</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="h-priority">Priority</label>
                  <select id="h-priority" name="priority" defaultValue={editingHabit.priority || 3}>
                    <option value="1">1 (Highest)</option>
                    <option value="2">2 (Medium-High)</option>
                    <option value="3">3 (Medium)</option>
                    <option value="4">4 (Medium-Low)</option>
                    <option value="5">5 (Lowest)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="h-type">Habit Type</label>
                <select id="h-type" name="type" defaultValue={editingHabit.type || "normal"}>
                  <option value="normal">Normal Habit</option>
                  <option value="sleep">Sleep (Fixed blocks)</option>
                </select>
              </div>

              <div>
                <label>Fixed Scheduled Days (Optional)</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(day => {
                    const parsed = editingHabit.fixedDays ? JSON.parse(editingHabit.fixedDays) : [];
                    const checked = parsed.includes(day);
                    return (
                      <label key={day} style={{ display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", fontSize: "0.75rem", cursor: "pointer" }}>
                        <input type="checkbox" name={`day-${day}`} defaultChecked={checked} style={{ width: "auto" }} />
                        {day}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => habitModalRef.current?.close()} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={actionLoading} className="btn btn-primary">
                {actionLoading ? "Saving..." : "Save Habit"}
              </button>
            </div>
          </form>
        )}
      </dialog>

      {/* Goal modal dialog */}
      <dialog ref={goalModalRef} closedby="any" style={{ width: "90%", maxWidth: 500 }} className="glass-panel" aria-labelledby="goalModalTitle">
        {editingGoal && (
          <form onSubmit={saveGoal} method="dialog">
            <h2 id="goalModalTitle" style={{ fontSize: "1.35rem", marginBottom: 16 }}>
              {editingGoal.id ? "Edit Goal Project" : "Create Goal Project"}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              <div>
                <label htmlFor="g-name">Goal Name</label>
                <input id="g-name" type="text" name="name" required defaultValue={editingGoal.name || ""} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="g-effort">Total Effort (Hours)</label>
                  <input id="g-effort" type="number" step="0.5" name="totalEffortHours" required defaultValue={editingGoal.totalEffortMin ? editingGoal.totalEffortMin / 60 : 10} min={0.5} />
                </div>
                <div>
                  <label htmlFor="g-completed">Completed (Hours)</label>
                  <input id="g-completed" type="number" step="0.5" name="completedHours" defaultValue={editingGoal.completedMin ? editingGoal.completedMin / 60 : 0} min={0} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="g-deadline">Deadline Date</label>
                  <input
                    id="g-deadline"
                    type="date"
                    name="deadline"
                    required
                    defaultValue={editingGoal.deadline ? new Date(editingGoal.deadline).toISOString().split("T")[0] : ""}
                  />
                </div>
                <div>
                  <label htmlFor="g-start">Earliest Start</label>
                  <input
                    id="g-start"
                    type="date"
                    name="earliestStart"
                    defaultValue={editingGoal.earliestStart ? new Date(editingGoal.earliestStart).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="g-session-min">Min Session (Mins)</label>
                  <input id="g-session-min" type="number" name="sessionMinMin" defaultValue={editingGoal.sessionMinMin || 30} step={15} min={15} />
                </div>
                <div>
                  <label htmlFor="g-session-max">Max Session (Mins)</label>
                  <input id="g-session-max" type="number" name="sessionMaxMin" defaultValue={editingGoal.sessionMaxMin || 120} step={15} min={15} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="g-timeofday">Preferred Time</label>
                  <select id="g-timeofday" name="timeOfDay" defaultValue={editingGoal.timeOfDay || "any"}>
                    <option value="any">Any Time</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="g-priority">Priority</label>
                  <select id="g-priority" name="priority" defaultValue={editingGoal.priority || 3}>
                    <option value="1">1 (Highest)</option>
                    <option value="2">2 (Medium-High)</option>
                    <option value="3">3 (Medium)</option>
                    <option value="4">4 (Medium-Low)</option>
                    <option value="5">5 (Lowest)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => goalModalRef.current?.close()} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={actionLoading} className="btn btn-primary">
                {actionLoading ? "Saving..." : "Save Goal"}
              </button>
            </div>
          </form>
        )}
      </dialog>

      {/* Block Details/Edit modal dialog */}
      <dialog ref={blockModalRef} closedby="any" style={{ width: "90%", maxWidth: 400 }} className="glass-panel" aria-labelledby="blockModalTitle">
        {selectedBlock && (
          <div>
            <h2 id="blockModalTitle" style={{ fontSize: "1.35rem", marginBottom: 12 }}>{selectedBlock.name}</h2>
            <div style={{ color: "var(--foreground-secondary)", fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              <div>Type: <strong style={{ color: "#fff", textTransform: "capitalize" }}>{selectedBlock.type}</strong></div>
              <div>Start: <strong style={{ color: "#fff" }}>{new Date(selectedBlock.start).toLocaleString()}</strong></div>
              <div>End: <strong style={{ color: "#fff" }}>{new Date(selectedBlock.end).toLocaleString()}</strong></div>
              <div>Status: <strong style={{ color: "#fff", textTransform: "capitalize" }}>{selectedBlock.status}</strong></div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label>Update Status</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => updateBlockStatus("done")}
                  className="btn btn-primary"
                  style={{ background: "var(--accent-green)", boxShadow: "none", fontSize: "0.85rem" }}
                >
                  Mark Done
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => updateBlockStatus("skipped")}
                  className="btn btn-danger"
                  style={{ background: "rgba(239, 68, 68, 0.2)", color: "var(--accent-red)", border: "1px solid rgba(239, 68, 68, 0.4)", boxShadow: "none", fontSize: "0.85rem" }}
                >
                  Mark Skipped
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => updateBlockStatus("partial")}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.85rem" }}
                >
                  Mark Partial
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => updateBlockStatus("planned")}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.85rem" }}
                >
                  Reset Planned
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" onClick={() => blockModalRef.current?.close()} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
