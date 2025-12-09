import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Camera, Play, UploadCloud, Sparkles, 
  Terminal, X, Maximize2, LogOut, User, Square, Loader2, Link as LinkIcon,
  Youtube, Instagram, Facebook, Twitter
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './supabaseClient'
import { useNavigate, useSearchParams } from 'react-router-dom'

function cn(...inputs) { return twMerge(clsx(inputs)) }

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

const PLATFORM_CONFIG = {
    youtube: { label: "YouTube", icon: Youtube, color: "text-red-500", help: "Enable YouTube Data API v3. Add http://localhost:5173/auth/callback to Redirect URIs." },
    instagram: { label: "Instagram", icon: Instagram, color: "text-pink-500", help: "Create Meta App. Add Instagram Basic Display. Add Redirect URI." },
    twitter: { label: "Twitter (X)", icon: Twitter, color: "text-blue-400", help: "Create Project in Developer Portal. Enable OAuth 2.0." },
    tiktok: { label: "TikTok", icon: Play, color: "text-black", help: "Requires manual approval from TikTok. Advanced users only." }
}

export default function Dashboard() {
  // ... existing user/camera state ...
  const [user, setUser] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [logs, setLogs] = useState(["System initialized..."])
  const [gallery, setGallery] = useState([])
  const [cameraReady, setCameraReady] = useState(false)
  const [activeTab, setActiveTab] = useState('gallery') 
  const [selectedClip, setSelectedClip] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  
  // Connection Wizard State
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [activeConnectTab, setActiveConnectTab] = useState('youtube') // youtube, instagram, etc
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  
  // Upload State
  const [isPosting, setIsPosting] = useState(false)
  const [uploadPlatforms, setUploadPlatforms] = useState(['youtube'])

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunkCounter = useRef(0)
  const logsEndRef = useRef(null)
  const userRef = useRef(null)
  
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // --- AUTH HANDLER ---
  useEffect(() => {
    const code = searchParams.get('code')
    // We need to know WHICH platform we just authenticated.
    // In a real app, use the 'state' param. For MVP, we check LocalStorage.
    const pendingPlatform = localStorage.getItem('pending_auth_platform')

    const completeAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (code && session && pendingPlatform) {
            window.history.replaceState({}, document.title, "/dashboard")
            addLog(`🔄 Finalizing ${pendingPlatform} Connection...`)
            try {
                const res = await axios.post(`${API_URL}/auth/callback`, {
                    user_id: session.user.id,
                    code: code,
                    platform: pendingPlatform
                })
                if(res.data.status === 'success') {
                    alert(`${pendingPlatform} Connected!`)
                    addLog(`✅ ${pendingPlatform} Connected`)
                    localStorage.removeItem('pending_auth_platform')
                } else {
                    alert("Connection Failed: " + JSON.stringify(res.data))
                }
            } catch(e) { console.error(e) }
        }
    }
    completeAuth()
  }, [searchParams])

  // ... existing UseEffects for logs/gallery ...
  // (Copy your existing useEffects here)

  // --- FUNCTIONS ---
  const addLog = (msg) => setLogs(prev => [...prev, `[UI] ${msg}`])

  const initConnection = async () => {
      if(!clientId || !clientSecret) return alert("Please enter keys")
      
      // Store platform in localstorage to know who we are connecting when we return
      localStorage.setItem('pending_auth_platform', activeConnectTab)

      try {
          const res = await axios.post(`${API_URL}/auth/init`, {
              user_id: user.id,
              platform: activeConnectTab,
              client_id: clientId,
              client_secret: clientSecret
          })
          if(res.data.url) window.location.href = res.data.url
      } catch(e) { alert("Error initializing auth") }
  }

  const handlePost = async () => {
      if (!selectedClip || !user) return
      setIsPosting(true)
      const formData = new FormData()
      formData.append("user_id", user.id)
      formData.append("video_filename", selectedClip.filename) // Pass URL
      formData.append("caption", selectedClip.description)
      formData.append("platforms", uploadPlatforms.join(','))

      try {
          const res = await axios.post(`${API_URL}/upload`, formData)
          alert(JSON.stringify(res.data, null, 2))
          addLog("✅ Upload process finished")
      } catch(e) {
          alert("Network error")
      }
      setIsPosting(false)
  }

  const toggleUploadPlatform = (p) => {
      setUploadPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  // --- RENDER ---
  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-zinc-300 font-sans overflow-hidden flex flex-col">
      
      {/* CONNECTION WIZARD */}
      <AnimatePresence>
        {showConnectModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-full max-w-2xl relative h-[80vh] flex flex-col">
                    <button onClick={() => setShowConnectModal(false)} className="absolute top-4 right-4"><X className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-white mb-6">Connect Accounts (BYOK)</h2>
                    
                    <div className="flex gap-4 h-full">
                        {/* Sidebar */}
                        <div className="w-1/3 border-r border-zinc-800 pr-4 space-y-2">
                            {Object.entries(PLATFORM_CONFIG).map(([key, conf]) => (
                                <button key={key} onClick={() => { setActiveConnectTab(key); setClientId(''); setClientSecret(''); }} 
                                    className={cn("w-full text-left px-3 py-3 rounded-lg text-sm font-bold flex items-center gap-2", activeConnectTab === key ? "bg-white text-black" : "text-zinc-500 hover:bg-zinc-800")}>
                                    <conf.icon className={cn("w-4 h-4", activeConnectTab !== key && conf.color)} /> {conf.label}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="w-2/3 pl-4 flex flex-col">
                            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 text-xs space-y-2 mb-6 text-zinc-400 leading-relaxed">
                                <p className="font-bold text-white mb-2">Instructions for {PLATFORM_CONFIG[activeConnectTab].label}:</p>
                                <p>{PLATFORM_CONFIG[activeConnectTab].help}</p>
                                <p className="mt-2 text-zinc-600">Redirect URI: <code className="bg-black px-1 rounded text-white select-all">{window.location.origin}/auth/callback</code></p>
                            </div>

                            <div className="space-y-4 mt-auto">
                                <div><label className="text-xs font-bold uppercase text-zinc-500">Client ID</label><input value={clientId} onChange={e => setClientId(e.target.value)} className="w-full bg-black border border-zinc-700 rounded p-3 text-white text-sm" /></div>
                                <div><label className="text-xs font-bold uppercase text-zinc-500">Client Secret</label><input value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="w-full bg-black border border-zinc-700 rounded p-3 text-white text-sm" type="password" /></div>
                                <button onClick={initConnection} className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 transition-colors">Authenticate</button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* UPLOAD MODAL */}
      <AnimatePresence>
        {selectedClip && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={() => setSelectedClip(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden max-h-[90vh] max-w-lg w-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-zinc-800"><h3 className="text-white font-bold">{selectedClip.title}</h3><button onClick={() => setSelectedClip(null)}><X className="w-5 h-5" /></button></div>
              <div className="relative bg-black flex-1 flex items-center justify-center"><video src={selectedClip.filename} className="max-h-[50vh] w-full object-contain" controls autoPlay /></div>
              <div className="p-5 bg-zinc-900 border-t border-zinc-800 space-y-4">
                <div className="flex gap-2">
                    {Object.keys(PLATFORM_CONFIG).map(p => (
                        <button key={p} onClick={() => toggleUploadPlatform(p)} className={cn("px-3 py-1 rounded-full text-xs font-bold border capitalize", uploadPlatforms.includes(p) ? "bg-white text-black border-white" : "bg-zinc-800 text-zinc-500 border-zinc-700")}>{p}</button>
                    ))}
                </div>
                <button onClick={handlePost} disabled={isPosting} className="w-full bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-500 flex justify-center gap-2">{isPosting ? <Loader2 className="animate-spin" /> : <UploadCloud />} Post to Selected</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NAVBAR (Unchanged - just ensure correct onClick for connect) */}
      <nav className="h-14 border-b border-white/10 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 font-bold text-white"><Sparkles className="w-5 h-5 text-rose-500" /> DirectorFlow</div>
        <div className="flex items-center gap-4">
            {user && (
              <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700 hover:border-zinc-500"><User className="w-4 h-4" /></button>
                {showUserMenu && (
                    <div className="absolute right-0 top-10 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
                        <div className="p-3 border-b border-zinc-800 text-xs text-zinc-500">{user.email}</div>
                        <button onClick={() => { setShowConnectModal(true); setShowUserMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Connect Accounts</button>
                        <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-2"><LogOut className="w-4 h-4" /> Sign Out</button>
                    </div>
                )}
              </div>
            )}
        </div>
      </nav>

      {/* MAIN LAYOUT (Camera & Gallery - Unchanged) */}
      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 lg:gap-6 lg:p-6 overflow-hidden">
        {/* ... (Camera Section - Copy from previous) ... */}
        <div className="flex flex-col lg:col-span-7 gap-0 lg:gap-6 shrink-0 lg:shrink">
          <div className="relative bg-black lg:rounded-3xl overflow-hidden border-b lg:border border-white/10 shadow-2xl flex justify-center h-[45vh] lg:h-[65vh]">
            <div className="relative aspect-[9/16] h-full w-auto bg-black lg:rounded-lg overflow-hidden border-x border-white/10">
                {!cameraReady && <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-10"><button onClick={startCamera} className="px-6 py-3 bg-white text-black rounded-full font-bold flex gap-2"><Camera className="w-5 h-5" /> Activate Camera</button></div>}
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20"><button onClick={() => isRecording ? stopRecording() : startRecording()} disabled={!cameraReady} className={cn("h-20 w-20 rounded-full flex items-center justify-center border-4 shadow-xl transition-all", isRecording ? "bg-white border-white/50" : "bg-rose-600 border-white/20")}><div className={cn("transition-all duration-300", isRecording ? "w-8 h-8 bg-red-600 rounded-md" : "w-16 h-16 bg-transparent")} /></button></div>
            </div>
          </div>
          <div className="hidden lg:flex bg-zinc-900/50 border border-white/5 p-6 rounded-2xl items-center justify-between backdrop-blur-md">
            <div><h3 className="text-white font-medium">Neural Command</h3><p className="text-xs text-zinc-500">Auto-Director Mode</p></div>
            <button onClick={() => isRecording ? stopRecording() : startRecording()} disabled={!cameraReady} className={cn("px-8 py-4 rounded-xl font-bold flex gap-3 shadow-lg transition-colors", isRecording ? "bg-zinc-800 text-red-400 border border-red-500/20" : "bg-rose-600 text-white")}>{isRecording ? "STOP RECORDING" : "START RECORDING"}</button>
          </div>
          <div className="hidden lg:flex flex-col bg-black rounded-xl border border-zinc-800 h-full overflow-hidden min-h-[150px]">
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2"><Terminal className="w-4 h-4 text-rose-500" /><span className="text-xs font-mono text-zinc-400">LOGS</span></div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2 text-zinc-400">{logs.map((log, i) => <div key={i}>{log}</div>)}<div ref={logsEndRef} /></div>
          </div>
        </div>

        {/* ... (Gallery Section - Copy from previous) ... */}
        <div className="flex-1 flex flex-col lg:col-span-5 overflow-hidden lg:rounded-2xl lg:bg-zinc-900/30 lg:border border-white/5 bg-zinc-950">
          <div className="flex-1 overflow-y-auto p-4 relative space-y-3 pb-20">
              {gallery.map((clip) => (
                <div key={clip.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex h-24 cursor-pointer hover:border-zinc-600 transition-colors" onClick={() => setSelectedClip(clip)}>
                    <div className="w-24 bg-black relative shrink-0"><video src={clip.filename} className="w-full h-full object-cover opacity-80" /><div className="absolute inset-0 flex items-center justify-center"><Play className="w-4 h-4 text-white" /></div></div>
                    <div className="flex-1 p-3"><h3 className="text-sm font-bold text-white line-clamp-1">{clip.title}</h3><span className="text-[10px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">{clip.score}/10</span></div>
                </div>
              ))}
          </div>
        </div>
      </main>
    </div>
  )
}