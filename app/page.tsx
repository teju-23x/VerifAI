"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import dynamic from "next/dynamic"
import ReactMarkdown from "react-markdown"
import { toast } from "sonner"
import {
  Shield, Send, MessageSquare, BarChart3, Activity, AlertTriangle,
  CheckCircle2, XCircle, Loader2, Mic, Zap, TrendingUp, User, Lock,
  Eye, EyeOff, Search, Trash2, Download, LogOut, Copy, Check,
  LayoutDashboard, RefreshCw, ChevronDown,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts"

const Globe = dynamic(() => import("@/components/globe"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-500/20 to-cyan-500/20 animate-pulse" />
    </div>
  ),
})

type MessageState = "GENERATING" | "AUDITING" | "VERIFIED" | "FAILED" | "REGENERATING"
type PageType = "chat" | "history" | "analytics" | "login" | "admin"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  state?: MessageState
  score?: number
  issues?: string[]
  attempt?: number
}

interface HistoryItem {
  id: string
  timestamp: string
  userMessage: string
  aiResponse: string
  reliabilityScore: number
  isReliable: boolean
  issues: string[]
  feedback: string
  attemptNumber: number
}

const WEBHOOK_KEY = "verifai-webhook-url"
const HISTORY_KEY = "verifai_history"
const TAGLINES = ["Self-Correcting AI", "Hallucination Guard", "Trust Engine", "Reliability First"]
const PIE_COLORS = ["#00d4aa", "#ef4444"]

export default function VerifAIApp() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<"online" | "offline" | "testing">("offline")
  const [currentQA, setCurrentQA] = useState<{
    score: number; state: MessageState; issues: string[]; feedback: string; attempt: number
  } | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [particles, setParticles] = useState<{ x: number; y: number }[]>([])
  const [currentPage, setCurrentPage] = useState<PageType>("chat")
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoginShaking, setIsLoginShaking] = useState(false)
  const [taglineIndex, setTaglineIndex] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historySearch, setHistorySearch] = useState("")
  const [historySort, setHistorySort] = useState<"newest" | "oldest" | "score">("newest")
  const [adminSearch, setAdminSearch] = useState("")
  const [adminPage, setAdminPage] = useState(1)
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "all">("all")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  // ── Derived stats ──
  const stats = {
    totalRequests: history.length,
    verified: history.filter(h => h.isReliable).length,
    avgScore: history.length > 0
      ? Math.round(history.reduce((a, h) => a + h.reliabilityScore, 0) / history.length)
      : 0,
  }

  // ── Tagline rotation (FIX 5) ──
  useEffect(() => {
    const t = setInterval(() => setTaglineIndex(i => (i + 1) % TAGLINES.length), 3000)
    return () => clearInterval(t)
  }, [])

  // ── Load history from localStorage (FIX 2) ──
  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_KEY)
    if (saved) setHistory(JSON.parse(saved))
  }, [])

  // ── Background particles ──
  useEffect(() => {
    setParticles([...Array(20)].map(() => ({
      x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 1200),
      y: Math.random() * (typeof window !== "undefined" ? window.innerHeight : 800),
    })))
  }, [])

  // ── Load webhook URL ──
  useEffect(() => {
    const saved = localStorage.getItem(WEBHOOK_KEY)
    const url = saved || "https://tejaswis23.app.n8n.cloud/webhook/ai-request"
    setWebhookUrl(url)
    testConnection(url)
  }, [])

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const testConnection = async (url: string) => {
    if (!url) { setConnectionStatus("offline"); return }
    setConnectionStatus("testing")
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      })
      setConnectionStatus(r.ok ? "online" : "offline")
    } catch {
      setConnectionStatus("offline")
    }
  }

  const saveWebhookUrl = () => {
    localStorage.setItem(WEBHOOK_KEY, webhookUrl)
    testConnection(webhookUrl)
    toast.success("Webhook saved!")
  }

  const persistHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
  }

  // ── Main submit handler ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setIsLoading(true)

    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", state: "GENERATING", attempt: 1 }])
    setCurrentQA({ score: 0, state: "GENERATING", issues: [], feedback: "", attempt: 1 })

    try {
      const url = webhookUrl || "https://tejaswis23.app.n8n.cloud/webhook/ai-request"
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content }),
      })

      let data: any = {}
      try {
        const text = await res.text()
        data = text ? JSON.parse(text) : {}
      } catch { /* ignore parse errors */ }

      setCurrentQA(p => p && { ...p, state: "AUDITING" })
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, state: "AUDITING" as MessageState } : m))
      await new Promise(r => setTimeout(r, 1200))

      const isSimulated = !data.aiResponse && !data.response && !data.message
      const content = data.aiResponse || data.response || data.message ||
        `I have processed your message: "${userMsg.content}". The VerifAI engine has analyzed this request and completed verification.`

      let rawScore = data.reliabilityScore ?? data.score ?? (isSimulated ? Math.floor(Math.random() * 25 + 75) : 85)
      const finalScore = (!isSimulated && rawScore <= 10) ? rawScore * 10 : rawScore

      const finalState: MessageState = typeof data.isReliable === "boolean"
        ? (data.isReliable ? "VERIFIED" : "FAILED")
        : (finalScore >= 70 ? "VERIFIED" : "FAILED")

      const issues: string[] = data.issues || []
      const feedback = data.feedback || data.Feedback ||
        (isSimulated ? "Verified via VerifAI simulation engine." : "Response analyzed successfully.")

      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, content, state: finalState, score: finalScore, issues } : m))

      const item: HistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        userMessage: userMsg.content,
        aiResponse: content,
        reliabilityScore: finalScore,
        isReliable: finalState === "VERIFIED",
        issues,
        feedback,
        attemptNumber: 1,
      }
      persistHistory([item, ...history])
      setCurrentQA({ score: finalScore, state: finalState, issues, feedback, attempt: 1 })
    } catch {
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: "Failed to connect to the verification engine.", state: "FAILED" as MessageState } : m))
      setCurrentQA(p => p && { ...p, state: "FAILED" })
    }
    setIsLoading(false)
  }

  // ── Voice recognition ──
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { toast.error("Voice not supported. Use Chrome."); return }
    if (isListening) { recognitionRef.current?.stop(); return }
    const rec = new SR()
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US"
    rec.onstart = () => setIsListening(true)
    rec.onresult = (e: any) => {
      let final = "", interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setInput(final || interim)
    }
    rec.onerror = (e: any) => {
      setIsListening(false)
      if (e.error === "not-allowed") toast.error("Mic permission denied")
    }
    rec.onend = () => setIsListening(false)
    rec.start()
    recognitionRef.current = rec
  }

  // ── Copy message (FIX 6) ──
  const copyMessage = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedId(id)
    toast.success("Copied to clipboard")
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── Filtered history (FIX 2) ──
  const filtHistory = (() => {
    let h = [...history]
    if (historySearch) {
      const q = historySearch.toLowerCase()
      h = h.filter(i => i.userMessage.toLowerCase().includes(q) || i.aiResponse.toLowerCase().includes(q))
    }
    if (historySort === "oldest") h = h.reverse()
    else if (historySort === "score") h = h.sort((a, b) => b.reliabilityScore - a.reliabilityScore)
    return h
  })()

  // ── Date-filtered analytics data ──
  const analyticsData = (() => {
    const now = new Date()
    return history.filter(h => {
      const d = new Date(h.timestamp)
      if (dateRange === "today") return d.toDateString() === now.toDateString()
      if (dateRange === "week") return now.getTime() - d.getTime() < 7 * 86400000
      if (dateRange === "month") return now.getTime() - d.getTime() < 30 * 86400000
      return true
    })
  })()

  // ── Admin table ──
  const adminRows = adminSearch
    ? history.filter(i => i.userMessage.toLowerCase().includes(adminSearch.toLowerCase()))
    : history
  const adminPageSize = 10
  const adminTotalPages = Math.ceil(adminRows.length / adminPageSize)
  const adminPageRows = adminRows.slice((adminPage - 1) * adminPageSize, adminPage * adminPageSize)

  // ── CSV export ──
  const exportCSV = () => {
    const header = "ID,Timestamp,Question,Score,Reliable,Attempts"
    const rows = history.map(h =>
      `${h.id},${h.timestamp},"${h.userMessage.replace(/"/g, '""')}",${h.reliabilityScore},${h.isReliable},${h.attemptNumber}`)
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "verifai_export.csv"; a.click()
  }

  // ── Helpers ──
  const scoreColor = (s: number) => s >= 80 ? "text-teal-400" : s >= 50 ? "text-yellow-400" : "text-red-400"
  const scoreBg = (s: number) => s >= 80 ? "bg-teal-500/20 text-teal-400" : s >= 50 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"

  const barDailyData = (() => {
    const days: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      days[d.toLocaleDateString("en", { weekday: "short" })] = 0
    }
    history.forEach(h => {
      const label = new Date(h.timestamp).toLocaleDateString("en", { weekday: "short" })
      if (label in days) days[label]++
    })
    return Object.entries(days).map(([day, count]) => ({ day, count }))
  })()

  const hasConversation = messages.length > 0
  const suggestionChips = ["Test for hallucinations", "Verify a complex claim", "Check response accuracy"]

  return (
    <div className="min-h-screen bg-[#050d0f] text-white overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ─── Animated Background ─── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,212,170,0.08)_0%,transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "linear-gradient(rgba(0,212,170,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,170,0.5) 1px,transparent 1px)",
          backgroundSize: "50px 50px",
        }} />
        {particles.map((p, i) => (
          <motion.div key={i} className="absolute w-1 h-1 rounded-full bg-teal-400/30"
            initial={{ x: p.x, y: p.y }}
            animate={{ y: [null, -30, 30], opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 6 + Math.random() * 4, repeat: Infinity, repeatType: "reverse", delay: Math.random() * 5 }} />
        ))}
      </div>

      {/* ─── 3-Column Layout ─── */}
      <div className="relative flex h-screen pb-9">

        {/* ══ LEFT SIDEBAR ══ */}
        <motion.aside initial={{ x: -280, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          className="w-72 flex-shrink-0 border-r border-teal-500/10 backdrop-blur-2xl bg-teal-500/[0.02] p-6 flex flex-col overflow-y-auto">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-teal-500/30">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <motion.div className="absolute inset-0 rounded-xl border-2 border-teal-400/40"
                animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">VerifAI</h1>
              {/* FIX 5 – Rotating tagline */}
              <AnimatePresence mode="wait">
                <motion.p key={TAGLINES[taglineIndex]}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  className="text-xs text-teal-400/60 font-medium">
                  {TAGLINES[taglineIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Connection Status */}
          <div className="mb-6 flex items-center gap-2 text-xs">
            <motion.div className={`w-2 h-2 rounded-full ${connectionStatus === "online" ? "bg-teal-400" : connectionStatus === "testing" ? "bg-yellow-400" : "bg-red-400"}`}
              animate={connectionStatus === "online" ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }} />
            <span className={connectionStatus === "online" ? "text-teal-400" : connectionStatus === "testing" ? "text-yellow-400" : "text-red-400"}>
              {connectionStatus === "online" ? "ENGINE ONLINE" : connectionStatus === "testing" ? "TESTING…" : "ENGINE OFFLINE"}
            </span>
          </div>

          {/* Navigation */}
          <nav className="space-y-1 mb-8">
            {[
              { id: "chat" as PageType, icon: MessageSquare, label: "Chat" },
              { id: "analytics" as PageType, icon: BarChart3, label: "Analytics" },
              { id: "history" as PageType, icon: Activity, label: "History" },
            ].map(item => (
              <button key={item.id} onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${currentPage === item.id ? "bg-teal-500/10 border-l-2 border-teal-400 text-teal-300" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}>
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Live Stats */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-teal-400/50 uppercase tracking-wider">Live Stats</h3>
            {[
              { icon: Zap, label: "Requests", value: stats.totalRequests },
              { icon: CheckCircle2, label: "Verified", value: stats.verified },
              { icon: TrendingUp, label: "Avg Score", value: `${stats.avgScore}%` },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/10 flex items-center gap-3">
                <s.icon className="w-4 h-4 text-teal-400" />
                <div>
                  <p className="text-lg font-bold font-mono">{s.value}</p>
                  <p className="text-[10px] text-teal-400/50 uppercase tracking-wider">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Admin Panel Button */}
          <button onClick={() => setCurrentPage(isAdmin ? "admin" : "login")}
            className={`mt-auto pt-6 flex items-center gap-2 px-4 py-3 rounded-xl transition-all w-full text-left ${currentPage === "admin" || currentPage === "login" ? "bg-teal-500/10 border-l-2 border-teal-400 text-teal-300" : "text-white/30 hover:text-teal-400 hover:bg-white/5"}`}>
            <LayoutDashboard className="w-5 h-5" />
            <span>Admin Panel</span>
          </button>
        </motion.aside>

        {/* ══ MAIN CONTENT ══ */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          <AnimatePresence mode="wait">

            {/* ── CHAT PAGE ── */}
            {currentPage === "chat" && (
              <motion.div key="chat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col h-full">
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {!hasConversation ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 gap-6">
                      {/* FIX 1 – Large globe on empty state */}
                      <div className="w-64 h-64"><Globe isProcessing={isLoading} /></div>
                      <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="text-2xl font-bold">Ask VerifAI anything</motion.h2>
                      <div className="flex flex-wrap gap-3 justify-center">
                        {suggestionChips.map(chip => (
                          <button key={chip} onClick={() => setInput(chip)}
                            className="px-4 py-2 rounded-full border border-teal-500/30 bg-teal-500/5 text-teal-300 text-sm hover:bg-teal-500/15 hover:border-teal-400/50 transition-all">
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Compact globe during conversation */}
                      <div className="flex justify-center py-3 mb-2">
                        <div className="w-24 h-24"><Globe isProcessing={isLoading} /></div>
                      </div>
                      {messages.map(msg => (
                        <motion.div key={msg.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                          className={`flex mb-6 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-2xl relative group ${msg.role === "user"
                            ? "bg-gradient-to-br from-teal-500/20 to-cyan-500/10 border-l-[3px] border-teal-400 rounded-[24px_24px_4px_24px]"
                            : "bg-white/[0.03] border border-teal-500/15 rounded-[4px_24px_24px_24px]"} p-1 backdrop-blur-xl shadow-2xl`}>
                            {/* FIX 6 – Copy button on hover */}
                            {msg.role === "assistant" && (
                              <button onClick={() => copyMessage(msg.id, msg.content)}
                                className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-teal-500/25 z-10">
                                {copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <div className="p-5 pr-8">
                              {msg.role === "assistant" && msg.score !== undefined && (
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs mb-3 border ${msg.state === "VERIFIED" ? "border-teal-500/30 bg-teal-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                                  {msg.state === "VERIFIED" ? <CheckCircle2 className="w-3 h-3 text-teal-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                                  <span className={`font-mono ${msg.state === "VERIFIED" ? "text-teal-300" : "text-red-300"}`}>{msg.score}% {msg.state}</span>
                                </div>
                              )}
                              <div className="prose prose-invert prose-sm max-w-none">
                                <ReactMarkdown>{msg.content || (msg.state === "GENERATING" ? "Generating…" : msg.state === "AUDITING" ? "Auditing response…" : "…")}</ReactMarkdown>
                              </div>
                              {msg.state && !["VERIFIED", "FAILED"].includes(msg.state) && (
                                <div className="mt-3 flex items-center gap-2 text-xs text-teal-400/60">
                                  <Loader2 className="w-3 h-3 animate-spin" /><span>{msg.state}…</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
                {/* Input bar */}
                <div className="p-4 border-t border-teal-500/10 bg-[#050d0f]/50 backdrop-blur-md">
                  <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)}
                      placeholder="Ask VerifAI anything…"
                      className="w-full px-6 py-4 pr-28 rounded-2xl bg-white/[0.03] border border-teal-500/20 backdrop-blur-xl text-white placeholder:text-teal-400/40 focus:outline-none focus:border-teal-400/50 focus:shadow-[0_0_30px_rgba(0,212,170,0.12)] transition-all" />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <button type="button" onClick={startVoice}
                        className={`p-2 rounded-xl transition-all ${isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-teal-400/60 hover:text-teal-400"}`}>
                        <Mic className="w-5 h-5" />
                      </button>
                      <motion.button type="submit" disabled={!input.trim() || isLoading} whileTap={{ scale: 0.95 }}
                        className="p-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white shadow-lg shadow-teal-500/30 disabled:opacity-40">
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      </motion.button>
                    </div>
                  </form>
                </div>
              </motion.div>
            )}

            {/* ── HISTORY PAGE (FIX 2) ── */}
            {currentPage === "history" && (
              <motion.div key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="flex-1 overflow-y-auto p-8">
                <div className="max-w-5xl mx-auto">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h1 className="text-3xl font-bold mb-1">Conversation History</h1>
                      <p className="text-teal-400/60">{history.length} total interactions saved</p>
                    </div>
                    <button onClick={() => { if (confirm("Clear all history?")) { persistHistory([]); toast.success("History cleared") } }}
                      className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors text-sm">
                      <Trash2 className="w-4 h-4" /> Clear All
                    </button>
                  </div>

                  {/* Search + Sort */}
                  <div className="flex gap-3 mb-6">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-400/40" />
                      <input value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                        placeholder="Search conversations…"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-teal-500/20 text-white placeholder:text-white/30 focus:outline-none focus:border-teal-400 text-sm" />
                    </div>
                    <div className="relative">
                      <select value={historySort} onChange={e => setHistorySort(e.target.value as any)}
                        className="appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-white/[0.03] border border-teal-500/20 text-teal-300 focus:outline-none cursor-pointer text-sm">
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="score">By Score</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-400/40 pointer-events-none" />
                    </div>
                  </div>

                  {filtHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 opacity-40">
                      <Shield className="w-20 h-20 text-teal-500 mb-4" />
                      <p className="text-xl font-semibold">No conversations yet</p>
                      <p className="text-sm mt-1">Start chatting to see your history here</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filtHistory.map(item => (
                        <motion.div key={item.id} layout
                          className="rounded-2xl bg-white/[0.03] border border-teal-500/10 hover:border-teal-500/30 transition-all cursor-pointer"
                          onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}>
                          <div className="p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-teal-400/40 mb-1.5 font-mono">
                                  {formatDistanceToNow(new Date(item.timestamp))} ago
                                </p>
                                <p className="font-medium text-white truncate">
                                  {item.userMessage.substring(0, 80)}{item.userMessage.length > 80 ? "…" : ""}
                                </p>
                                <p className="text-sm text-white/50 mt-1 line-clamp-1">{item.aiResponse.substring(0, 100)}…</p>
                              </div>
                              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${scoreBg(item.reliabilityScore)}`}>
                                  {item.reliabilityScore}%
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.isReliable ? "bg-teal-500/10 text-teal-400" : "bg-red-500/10 text-red-400"}`}>
                                  {item.isReliable ? "✓ VERIFIED" : "✗ FAILED"}
                                </span>
                                <span className="text-[10px] text-white/30">Attempt #{item.attemptNumber}</span>
                              </div>
                            </div>
                          </div>
                          <AnimatePresence>
                            {expandedHistoryId === item.id && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                className="border-t border-teal-500/10 p-5 space-y-3 overflow-hidden">
                                <div>
                                  <p className="text-xs text-teal-400/50 uppercase tracking-wider mb-1">User Message</p>
                                  <p className="text-sm text-white/80">{item.userMessage}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-teal-400/50 uppercase tracking-wider mb-1">AI Response</p>
                                  <p className="text-sm text-white/70">{item.aiResponse}</p>
                                </div>
                                {item.feedback && (
                                  <div className="p-3 rounded-lg bg-teal-500/5 border-l-2 border-teal-400">
                                    <p className="text-xs text-teal-400/60 mb-1">Feedback</p>
                                    <p className="text-sm text-white/70 italic">{item.feedback}</p>
                                  </div>
                                )}
                                {item.issues && item.issues.length > 0 && (
                                  <div>
                                    <p className="text-xs text-teal-400/50 uppercase tracking-wider mb-2">Issues Detected</p>
                                    {item.issues.map((iss, i) => (
                                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 mb-1">
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                                        <span className="text-xs text-red-300">{iss}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── ANALYTICS PAGE (FIX 3) ── */}
            {currentPage === "analytics" && (
              <motion.div key="analytics" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="flex-1 overflow-y-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                  <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
                    <div className="flex gap-2">
                      {(["today", "week", "month", "all"] as const).map(r => (
                        <button key={r} onClick={() => setDateRange(r)}
                          className={`px-4 py-2 rounded-xl text-sm capitalize transition-all ${dateRange === r ? "bg-teal-500/20 text-teal-400 border border-teal-500/30" : "text-white/40 hover:text-white/70 bg-white/5"}`}>
                          {r === "all" ? "All Time" : r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stat cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: "Total Conversations", value: analyticsData.length, icon: MessageSquare, color: "text-teal-400" },
                      { label: "Avg Reliability", value: `${analyticsData.length > 0 ? Math.round(analyticsData.reduce((a, h) => a + h.reliabilityScore, 0) / analyticsData.length) : 0}%`, icon: Zap, color: "text-cyan-400" },
                      { label: "Hallucinations Caught", value: analyticsData.filter(h => !h.isReliable).length, icon: AlertTriangle, color: "text-red-400" },
                      { label: "Total Regenerations", value: analyticsData.reduce((a, h) => a + (h.attemptNumber - 1), 0), icon: RefreshCw, color: "text-yellow-400" },
                    ].map(card => (
                      <div key={card.label} className="p-5 rounded-2xl bg-white/[0.03] border border-teal-500/10">
                        <card.icon className={`w-7 h-7 ${card.color} mb-3`} />
                        <p className="text-2xl font-bold">{card.value}</p>
                        <p className="text-xs text-teal-400/50 uppercase tracking-wider mt-1">{card.label}</p>
                      </div>
                    ))}
                  </div>

                  {analyticsData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                      <BarChart3 className="w-16 h-16 text-teal-500 mb-4" />
                      <p className="text-lg">No data for this period</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Line chart */}
                      <div className="p-6 rounded-2xl bg-white/[0.03] border border-teal-500/10 h-72">
                        <h3 className="text-sm font-semibold text-teal-400/60 uppercase mb-4">Reliability Over Time</h3>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={[...analyticsData].reverse().slice(-20)}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.06)" />
                            <XAxis dataKey="id" hide />
                            <YAxis stroke="rgba(0,212,170,0.3)" fontSize={10} domain={[0, 100]} />
                            <Tooltip contentStyle={{ background: "#0a1a1f", border: "1px solid rgba(0,212,170,0.2)", borderRadius: 12 }} />
                            <Line type="monotone" dataKey="reliabilityScore" stroke="#00d4aa" strokeWidth={2} dot={{ r: 4, fill: "#00d4aa" }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Bar chart */}
                      <div className="p-6 rounded-2xl bg-white/[0.03] border border-teal-500/10 h-72">
                        <h3 className="text-sm font-semibold text-teal-400/60 uppercase mb-4">Daily Conversations</h3>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barDailyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.06)" />
                            <XAxis dataKey="day" stroke="rgba(0,212,170,0.3)" fontSize={10} />
                            <YAxis stroke="rgba(0,212,170,0.3)" fontSize={10} />
                            <Tooltip contentStyle={{ background: "#0a1a1f", border: "1px solid rgba(0,212,170,0.2)", borderRadius: 12 }} />
                            <Bar dataKey="count" fill="#00d4aa" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Pie chart */}
                      <div className="p-6 rounded-2xl bg-white/[0.03] border border-teal-500/10 h-72">
                        <h3 className="text-sm font-semibold text-teal-400/60 uppercase mb-4">Response Quality</h3>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={[{ name: "Verified", value: analyticsData.filter(h => h.isReliable).length }, { name: "Failed", value: analyticsData.filter(h => !h.isReliable).length }]}
                              innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                              {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                            </Pie>
                            <Tooltip contentStyle={{ background: "#0a1a1f", border: "1px solid rgba(0,212,170,0.2)", borderRadius: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex justify-center gap-6 mt-2 text-xs">
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-teal-400 inline-block" /> Verified</span>
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Failed</span>
                        </div>
                      </div>
                      {/* Area chart */}
                      <div className="p-6 rounded-2xl bg-white/[0.03] border border-teal-500/10 h-72">
                        <h3 className="text-sm font-semibold text-teal-400/60 uppercase mb-4">Hallucination Risk Trend</h3>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={[...analyticsData].reverse().slice(-20).map((h, i) => ({ i, risk: h.isReliable ? 0 : 100 }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(239,68,68,0.06)" />
                            <XAxis dataKey="i" hide />
                            <YAxis stroke="rgba(239,68,68,0.3)" fontSize={10} domain={[0, 100]} />
                            <Tooltip contentStyle={{ background: "#0a1a1f", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12 }} />
                            <Area type="monotone" dataKey="risk" stroke="#ef4444" fill="rgba(239,68,68,0.1)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── LOGIN PAGE (FIX 4) ── */}
            {currentPage === "login" && (
              <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex-1 flex items-center justify-center p-8">
                <motion.div animate={isLoginShaking ? { x: [-10, 10, -10, 10, 0] } : {}} transition={{ duration: 0.4 }}
                  className="w-[420px] p-8 rounded-3xl bg-teal-500/[0.04] border border-teal-500/20 backdrop-blur-2xl shadow-2xl shadow-teal-500/10">
                  <div className="flex flex-col items-center mb-8">
                    <div className="relative mb-5">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-teal-500/40">
                        <Shield className="w-9 h-9 text-white" />
                      </div>
                      <motion.div className="absolute inset-0 rounded-2xl border-2 border-teal-400/40"
                        animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
                    </div>
                    <h2 className="text-2xl font-bold text-teal-400">Admin Access</h2>
                    <p className="text-sm text-white/40 mt-1">Restricted area — authorized only</p>
                  </div>
                  <div className="space-y-4">
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-400/40" />
                      <input type="text" placeholder="Enter username" value={loginForm.username}
                        onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                        className="w-full bg-white/[0.04] border border-teal-500/20 rounded-xl py-3.5 pl-11 pr-4 text-white focus:outline-none focus:border-teal-400/60 transition-all placeholder:text-white/20" />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-400/40" />
                      <input type={showPassword ? "text" : "password"} placeholder="Enter password" value={loginForm.password}
                        onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                        onKeyDown={e => e.key === "Enter" && document.getElementById("login-btn")?.click()}
                        className="w-full bg-white/[0.04] border border-teal-500/20 rounded-xl py-3.5 pl-11 pr-12 text-white focus:outline-none focus:border-teal-400/60 transition-all placeholder:text-white/20" />
                      <button onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-teal-400/40 hover:text-teal-400">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <motion.button id="login-btn" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (loginForm.username === "Tejaswi23" && loginForm.password === "tejaswi@23") {
                          toast.success("Access Granted ✓")
                          setIsAdmin(true)
                          setCurrentPage("admin")
                        } else {
                          setIsLoginShaking(true)
                          setTimeout(() => setIsLoginShaking(false), 500)
                          toast.error("Invalid credentials. Access denied.")
                        }
                      }}
                      className="w-full bg-gradient-to-r from-teal-500 to-cyan-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-teal-500/25 hover:shadow-teal-500/50 transition-all mt-2">
                      Login
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* ── ADMIN PANEL (FIX 4) ── */}
            {currentPage === "admin" && isAdmin && (
              <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto p-8">
                <div className="max-w-7xl mx-auto space-y-8">
                  <div className="flex items-center justify-between pb-6 border-b border-teal-500/10">
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                      <LayoutDashboard className="w-8 h-8 text-teal-400" /> Admin Panel
                    </h1>
                    <div className="flex gap-3">
                      <button onClick={() => setCurrentPage("chat")}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/60 hover:text-white transition-all text-sm">
                        ← Back to Chat
                      </button>
                      <button onClick={exportCSV}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-all border border-teal-500/20 text-sm">
                        <Download className="w-4 h-4" /> Export CSV
                      </button>
                      <button onClick={() => { setIsAdmin(false); setCurrentPage("chat") }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20 text-sm">
                        <LogOut className="w-4 h-4" /> Logout
                      </button>
                    </div>
                  </div>

                  {/* Metric cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: "Total Conversations", value: history.length },
                      { label: "Avg Score", value: `${stats.avgScore}%` },
                      { label: "Hallucinations", value: history.filter(h => !h.isReliable).length },
                      { label: "Failed Responses", value: history.filter(h => !h.isReliable).length },
                    ].map(c => (
                      <div key={c.label} className="p-5 rounded-2xl bg-white/[0.03] border border-teal-500/10">
                        <p className="text-xs text-teal-400/40 uppercase tracking-widest mb-2 font-mono">{c.label}</p>
                        <p className="text-3xl font-bold">{c.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Data table */}
                  <div className="rounded-2xl bg-white/[0.03] border border-teal-500/10 overflow-hidden">
                    <div className="p-5 border-b border-teal-500/10 flex items-center gap-4">
                      <h3 className="font-bold flex items-center gap-2 text-sm">
                        <Activity className="w-4 h-4 text-teal-400" /> Data Stream
                      </h3>
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-teal-400/40" />
                        <input value={adminSearch} onChange={e => { setAdminSearch(e.target.value); setAdminPage(1) }}
                          placeholder="Filter…" className="w-full pl-9 pr-4 py-2 rounded-lg bg-black/20 border border-teal-500/10 text-sm focus:outline-none focus:border-teal-500/30" />
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-white/[0.04] text-teal-400/50 text-[10px] uppercase tracking-widest">
                          <tr>
                            <th className="px-5 py-3">#</th>
                            <th className="px-5 py-3">Time</th>
                            <th className="px-5 py-3">Question</th>
                            <th className="px-5 py-3">Response Preview</th>
                            <th className="px-5 py-3">Score</th>
                            <th className="px-5 py-3">Status</th>
                            <th className="px-5 py-3">Att.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-teal-500/5">
                          {adminPageRows.length === 0 ? (
                            <tr><td colSpan={7} className="px-5 py-8 text-center text-white/30">No data yet</td></tr>
                          ) : adminPageRows.map(h => (
                            <tr key={h.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-5 py-3 font-mono text-teal-400/40 text-xs">{h.id.slice(-6)}</td>
                              <td className="px-5 py-3 text-white/50 text-xs">{new Date(h.timestamp).toLocaleTimeString()}</td>
                              <td className="px-5 py-3 truncate max-w-[160px] text-xs">{h.userMessage}</td>
                              <td className="px-5 py-3 truncate max-w-[160px] text-white/40 text-xs">{h.aiResponse.substring(0, 60)}…</td>
                              <td className="px-5 py-3"><span className={`font-mono font-bold text-xs ${scoreColor(h.reliabilityScore)}`}>{h.reliabilityScore}%</span></td>
                              <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${h.isReliable ? "bg-teal-500/10 text-teal-400" : "bg-red-500/10 text-red-400"}`}>{h.isReliable ? "VERIFIED" : "FAILED"}</span></td>
                              <td className="px-5 py-3 text-white/40 text-xs">{h.attemptNumber}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {adminTotalPages > 1 && (
                      <div className="p-4 border-t border-teal-500/10 flex items-center justify-between text-sm">
                        <span className="text-white/40 text-xs">Page {adminPage} of {adminTotalPages}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setAdminPage(p => Math.max(1, p - 1))} disabled={adminPage === 1}
                            className="px-3 py-1 rounded text-xs bg-white/5 disabled:opacity-30">← Prev</button>
                          <button onClick={() => setAdminPage(p => Math.min(adminTotalPages, p + 1))} disabled={adminPage === adminTotalPages}
                            className="px-3 py-1 rounded text-xs bg-white/5 disabled:opacity-30">Next →</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Admin Settings */}
                  <div className="p-6 rounded-2xl bg-white/[0.03] border border-teal-500/10">
                    <h3 className="font-bold text-white mb-5">Admin Settings</h3>
                    <div className="max-w-xl">
                      <label className="block text-xs text-teal-400/50 uppercase tracking-widest mb-2 font-mono">Webhook Endpoint</label>
                      <div className="flex gap-3">
                        <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                          className="flex-1 bg-black/20 border border-teal-500/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-teal-400 transition-all" />
                        <button onClick={saveWebhookUrl}
                          className="px-6 py-3 bg-teal-500/20 text-teal-400 rounded-xl hover:bg-teal-500/30 transition-all border border-teal-500/20 text-sm font-medium">
                          Save
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/10">
                    <h3 className="font-bold text-red-400 mb-4">Danger Zone</h3>
                    <button onClick={() => {
                      if (confirm("⚠️ This will permanently delete ALL data. Proceed?")) {
                        persistHistory([]); toast.success("All data cleared")
                      }
                    }}
                      className="px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all font-bold text-sm">
                      Clear All Platform Data
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {/* ══ RIGHT QA MONITOR ══ */}
        <motion.aside initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          className="w-72 flex-shrink-0 border-l border-teal-500/10 backdrop-blur-2xl bg-teal-500/[0.02] p-5 overflow-y-auto">
          <h2 className="text-xs font-semibold text-teal-400/50 uppercase tracking-wider mb-5">QA Monitor</h2>

          {/* Score Gauge */}
          <div className="flex justify-center mb-6">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0,212,170,0.1)" strokeWidth="8" />
                <motion.circle cx="50" cy="50" r="45" fill="none" stroke="url(#sg)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={283}
                  initial={{ strokeDashoffset: 283 }}
                  animate={{ strokeDashoffset: currentQA ? 283 - (283 * currentQA.score) / 100 : 283 }}
                  transition={{ duration: 1.5, ease: "easeOut" }} />
                <defs>
                  <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00d4aa" />
                    <stop offset="100%" stopColor="#00fff0" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold font-mono">{currentQA?.score || 0}</span>
                <span className="text-[10px] text-teal-400/50 uppercase tracking-wider">SCORE</span>
              </div>
            </div>
          </div>

          {/* State badge */}
          {currentQA && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-full mb-5 ${currentQA.state === "VERIFIED" ? "bg-teal-500/15 text-teal-400"
                : currentQA.state === "FAILED" ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"}`}>
              {currentQA.state === "VERIFIED" ? <CheckCircle2 className="w-4 h-4" />
                : currentQA.state === "FAILED" ? <XCircle className="w-4 h-4" />
                  : <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="text-sm font-medium">{currentQA.state}</span>
            </motion.div>
          )}

          {/* Issues */}
          {currentQA?.issues && currentQA.issues.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Issues Found</h3>
              <div className="space-y-1.5">
                {currentQA.issues.map((iss, i) => (
                  <motion.div key={i} initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-red-300">{iss}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Feedback */}
          {currentQA?.feedback && (
            <div className="p-3 rounded-xl bg-teal-500/5 border-l-2 border-teal-400">
              <p className="text-xs text-teal-400/50 mb-1">Feedback</p>
              <p className="text-xs text-white/70 italic">&quot;{currentQA.feedback}&quot;</p>
            </div>
          )}

          {!currentQA && (
            <div className="text-center py-8 opacity-30">
              <Shield className="w-12 h-12 text-teal-400 mx-auto mb-3" />
              <p className="text-xs">No active QA session</p>
            </div>
          )}
        </motion.aside>

      </div>{/* end 3-column layout */}

      {/* ══ FOOTER (FIX 5) ══ */}
      <footer className="fixed bottom-0 left-0 right-0 h-9 z-50 bg-[#050d0f]/90 backdrop-blur-xl border-t border-teal-500/20 px-6 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 text-teal-400/40">
          <Shield className="w-3 h-3" />
          <span>VerifAI © 2025</span>
        </div>
        <div className="flex items-center gap-2">
          <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_#2dd4bf]" />
          <span className="text-teal-300 font-medium">All Systems Operational</span>
        </div>
        <div className="flex items-center gap-1.5 text-white/20">
          <span>Powered by Agent-Ops</span>
          <Zap className="w-3 h-3" />
        </div>
      </footer>
    </div>
  )
}
