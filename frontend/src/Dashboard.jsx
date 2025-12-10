import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Camera, Play, UploadCloud, Sparkles, 
  Terminal, X, Maximize2, LogOut, User, Square, Loader2, Link as LinkIcon,
  Youtube, Instagram, Twitter, Facebook, Calendar, HelpCircle, ExternalLink, Copy, CheckCircle
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './supabaseClient'
import { useNavigate, useSearchParams } from 'react-router-dom'

function cn(...inputs) { return twMerge(clsx(inputs)) }

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || "https://calendly.com/your-username/30min"; 

const PLATFORM_CONFIG = {
    youtube: { 
        label: "YouTube", 
        icon: Youtube, 
        color: "text-red-500",
        portalName: "Google Cloud Console",
        portalUrl: "https://console.cloud.google.com/apis/dashboard",
        steps: [
            "Create a new Project in the console.",
            "In 'APIs & Services' -> 'Library', enable 'YouTube Data API v3'.",
            "Go to 'OAuth Consent Screen' -> Select 'External'.",
            "IMPORTANT: Add your email to 'Test Users' (otherwise you get Error 403).",
            "Go to 'Credentials' -> 'Create Credentials' -> 'OAuth Client ID'.",
            "Select 'Web Application'.",
            "Add the Redirect URI shown below.",
            "Copy the Client ID and Client Secret."
        ]
    },
    instagram: { 
        label: "Instagram", 
        icon: Instagram, 
        color: "text-pink-500", 
        portalName: "Meta for Developers",
        portalUrl: "https://developers.facebook.com/apps/",
        steps: [
            "Go to 'My Apps' -> 'Create App' -> Select 'Business'.",
            "On the Dashboard, scroll to 'Instagram Graph API' and click 'Set Up'.",
            "Go to 'Settings' -> 'Basic'.",
            "Scroll down to 'Add Platform' -> Select 'Website'.",
            "Enter your website URL (or localhost) in Site URL.",
            "Copy App ID (Client ID) and App Secret (Client Secret)."
        ]
    },
    twitter: { 
        label: "Twitter (X)", 
        icon: Twitter, 
        color: "text-blue-400", 
        portalName: "X Developer Portal",
        portalUrl: "https://developer.twitter.com/en/portal/dashboard",
        steps: [
            "Create a 'Free' Project.",
            "Navigate to 'Keys and tokens'.",
            "Click 'Set up' under 'User authentication settings'.",
            "App Permissions: Select 'Read and Write'.",
            "Type of App: Select 'Web App'.",
            "Enter the Redirect URI below in 'Callback URI'.",
            "Enter your website URL.",
            "Save and copy the 'OAuth 2.0 Client ID' and 'Client Secret'."
        ]
    },
    tiktok: { 
        label: "TikTok", 
        icon: Play, 
        color: "text-black", 
        portalName: "TikTok for Developers",
        portalUrl: "https://developers.tiktok.com/",
        steps: [
            "Create a Developer App.",
            "In 'Products', add 'Video Kit' and 'Login Kit'.",
            "Go to 'Manage' -> 'Redirect URIs' and add the URI below.",
            "Note: TikTok requires Manual App Review to allow uploads.",
            "Once approved, copy the Client Key and Client Secret."
        ]
    }
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [logs, setLogs] = useState(["System initialized..."])
  const [gallery, setGallery] = useState([])
  const [cameraReady, setCameraReady] = useState(false)
  const [activeTab, setActiveTab] = useState('gallery') 
  const [selectedClip, setSelectedClip] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  
  // Connection State
  const [connectedPlatforms, setConnectedPlatforms] = useState([]) // List of strings ['youtube', 'twitter']
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showCalendly, setShowCalendly] = useState(false)
  const [activeConnectTab, setActiveConnectTab] = useState('youtube') 
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  
  // Upload State
  const [isPosting, setIsPosting] = useState(false)
  const [uploadPlatforms, setUploadPlatforms] = useState([]) // Selected for upload
  const [postTitle, setPostTitle] = useState("")
  const [postCaption, setPostCaption] = useState("")

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunkCounter = useRef(0)
  const logsEndRef = useRef(null)
  const userRef = useRef(null)
  
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // --- 1. FETCH STATUS ON LOAD ---
  const fetchConnections = async (userId) => {
      if(!userId) return
      try {
          const res = await axios.get(`${API_URL}/auth/status/${userId}`)
          if(res.data.connected) {
              setConnectedPlatforms(res.data.connected)
              setUploadPlatforms(res.data.connected) // Auto-select what's connected
          }
      } catch(e) { console.error("Status check failed", e) }
  }

  // --- 2. AUTH CALLBACK HANDLER ---
  useEffect(() => {
    const code = searchParams.get('code')
    const pendingPlatform = localStorage.getItem('pending_auth_platform')

    const completeAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (code && session && pendingPlatform) {
            // Remove code from URL to clean it up
            window.history.replaceState({}, document.title, "/dashboard")
            
            addLog(`🔄 Finalizing ${pendingPlatform} Connection...`)
            try {
                const res = await axios.post(`${API_URL}/auth/callback`, {
                    user_id: session.user.id,
                    code: code,
                    platform: pendingPlatform
                })
                if(res.data.status === 'success') {
                    alert(`${pendingPlatform} Connected Successfully!`)
                    addLog(`✅ ${pendingPlatform} Connected`)
                    localStorage.removeItem('pending_auth_platform')
                    // Refresh connections list
                    fetchConnections(session.user.id)
                    setShowConnectModal(false) 
                } else {
                    alert("Connection Failed: " + JSON.stringify(res.data))
                }
            } catch(e) { console.error(e) }
        }
    }
    completeAuth()
  }, [searchParams])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        userRef.current = session.user
        fetchConnections(session.user.id)
      }
    })

    const interval = setInterval(async () => {
      try {
        const logRes = await axios.get(`${API_URL}/logs`)
        if (logRes.data.logs) {
          setLogs(prev => [...new Set([...prev, ...logRes.data.logs])].slice(-50))
        }
        const currentUserId = userRef.current ? userRef.current.id : "offline-user"
        const gallRes = await axios.get(`${API_URL}/gallery/${currentUserId}`)
        if (gallRes.data) setGallery(gallRes.data)
      } catch (e) {}
    }, 1000)
    return () => clearInterval(interval)
  }, [navigate])

  useEffect(() => {
    if (window.innerWidth >= 1024 || activeTab === 'logs') {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [logs, activeTab])

  // --- HELPERS ---
  const addLog = (msg) => setLogs(prev => [...prev, `[UI] ${msg}`])
  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/') }

  // --- CONNECT ACCOUNT ---
  const initConnection = async () => {
      if(!clientId || !clientSecret) return alert("Please enter keys")
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

  // --- POST TO SOCIALS ---
  const handlePost = async () => {
      if (!selectedClip || !user) return
      if (uploadPlatforms.length === 0) return alert("Select at least one platform")
      
      setIsPosting(true)
      const formData = new FormData()
      formData.append("user_id", user.id)
      formData.append("video_filename", selectedClip.filename) 
      formData.append("caption", postCaption || selectedClip.description) 
      formData.append("platforms", uploadPlatforms.join(','))

      try {
          const res = await axios.post(`${API_URL}/upload`, formData)
          const summary = Object.entries(res.data).map(([k,v]) => `${k}: ${v.status || v.error}`).join('\n')
          alert("Upload Results:\n" + summary)
          addLog("✅ Upload process finished")
      } catch(e) {
          alert("Network error")
      }
      setIsPosting(false)
  }

  const toggleUploadPlatform = (p) => {
      if (!connectedPlatforms.includes(p)) {
          if(confirm(`${PLATFORM_CONFIG[p].label} is not connected. Connect now?`)) {
              setSelectedClip(null)
              setActiveConnectTab(p)
              setShowConnectModal(true)
          }
          return
      }
      setUploadPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const openClipModal = (clip) => {
      setSelectedClip(clip)
      setPostTitle(clip.title)
      setPostCaption(`${clip.title}\n\n${clip.description}\n\n#viral #fyp`)
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" }, audio: true })
      videoRef.current.srcObject = stream
      streamRef.current = stream
      videoRef.current.play()
      setCameraReady(true)
    } catch (err) { alert("Hardware Error: " + err.message) }
  }

  const toggleRecording = () => { isRecording ? stopRecording() : startRecording() }

  const startRecording = () => {
    if (!streamRef.current) return
    setIsRecording(true)
    chunkCounter.current = 0
    addLog("🔴 Recording Started")
    recordNextChunk()
  }

  const recordNextChunk = () => {
    if (!streamRef.current) return
    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' })
    mediaRecorderRef.current = recorder
    const chunks = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      uploadChunk(blob, chunkCounter.current)
      chunkCounter.current++
      if (mediaRecorderRef.current) recordNextChunk()
    }
    recorder.start()
    setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, 120000) 
  }

  const stopRecording = () => {
    addLog("🛑 Stopping Recording...")
    const rec = mediaRecorderRef.current
    mediaRecorderRef.current = null 
    if (rec && rec.state === 'recording') rec.stop()
    setIsRecording(false)
  }

  const uploadChunk = async (blob, id) => {
    const userId = userRef.current ? userRef.current.id : "offline-user"
    const formData = new FormData()
    formData.append("file", blob, `chunk_${id}.webm`)
    formData.append("user_id", userId) 
    try { 
      await axios.post(`${API_URL}/upload-chunk`, formData)
      addLog(`✅ Chunk_${id} sent`)
    } catch (err) { console.error(err) }
  }

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-zinc-300 font-sans overflow-hidden flex flex-col">
      
      {/* CALENDLY EMBED MODAL */}
      <AnimatePresence>
        {showCalendly && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 p-4">
                <div className="bg-white rounded-xl w-full max-w-4xl h-[85vh] relative overflow-hidden flex flex-col">
                    <div className="bg-zinc-100 p-2 flex justify-between items-center border-b">
                        <span className="text-black font-bold px-4 text-sm">Schedule Setup Call</span>
                        <button onClick={() => setShowCalendly(false)} className="p-2 hover:bg-zinc-200 rounded-full text-black"><X className="w-5 h-5" /></button>
                    </div>
                    <iframe src={CALENDLY_URL} width="100%" height="100%" frameBorder="0" title="Select a Date & Time"></iframe>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* CONNECTION WIZARD */}
      <AnimatePresence>
        {showConnectModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-full max-w-4xl relative h-[85vh] flex flex-col">
                    <button onClick={() => setShowConnectModal(false)} className="absolute top-4 right-4"><X className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-white mb-6">Connect Accounts (BYOK)</h2>
                    
                    <div className="flex gap-6 h-full grow overflow-hidden">
                        {/* Sidebar */}
                        <div className="w-1/3 flex flex-col gap-2 border-r border-zinc-800 pr-6 overflow-y-auto">
                            {Object.entries(PLATFORM_CONFIG).map(([key, conf]) => (
                                <button key={key} onClick={() => { setActiveConnectTab(key); setClientId(''); setClientSecret(''); }} 
                                    className={cn("w-full text-left px-3 py-3 rounded-lg text-sm font-bold flex items-center justify-between transition-colors", 
                                    activeConnectTab === key ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:bg-zinc-800 hover:text-white")}>
                                    <div className="flex items-center gap-2"><conf.icon className={cn("w-4 h-4", activeConnectTab !== key && conf.color)} /> {conf.label}</div>
                                    {connectedPlatforms.includes(key) && <CheckCircle className="w-4 h-4 text-green-500" />}
                                </button>
                            ))}
                            
                            <div className="mt-auto pt-6 border-t border-zinc-800">
                                <p className="text-[10px] text-zinc-500 mb-2 font-medium uppercase tracking-wider">Trouble connecting?</p>
                                <button onClick={() => setShowCalendly(true)} className="w-full bg-green-600/10 border border-green-500/50 text-green-400 hover:bg-green-600 hover:text-white px-3 py-3 rounded-lg text-xs font-bold flex items-center gap-2 transition-all group">
                                    <Calendar className="w-4 h-4 group-hover:scale-110 transition-transform" /> Have us add it free
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="w-2/3 flex flex-col overflow-y-auto pr-2">
                            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 text-sm space-y-4 mb-6 text-zinc-400 leading-relaxed shadow-inner">
                                <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                                    <span className="text-white font-bold flex items-center gap-2">
                                        <HelpCircle className="w-4 h-4 text-rose-500" /> Instructions for {PLATFORM_CONFIG[activeConnectTab].label}
                                    </span>
                                    <a href={PLATFORM_CONFIG[activeConnectTab].portalUrl} target="_blank" rel="noreferrer" className="text-xs text-rose-400 hover:underline flex items-center gap-1">
                                        Open Portal <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                
                                <ul className="list-decimal list-inside space-y-2 text-xs">
                                    {PLATFORM_CONFIG[activeConnectTab].steps.map((step, i) => (
                                        <li key={i} className="pl-1 marker:text-zinc-600">{step}</li>
                                    ))}
                                </ul>

                                <div className="pt-2 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50 mt-4">
                                    <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Redirect URI to Copy:</p>
                                    <div className="flex items-center gap-2">
                                        <code className="bg-black px-2 py-1.5 rounded border border-zinc-800 text-green-400 select-all block w-full text-xs font-mono truncate">
                                            {window.location.origin}/auth/callback
                                        </code>
                                        <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/auth/callback`)} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 transition-colors">
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 mt-auto pb-2">
                                <div><label className="text-xs font-bold uppercase text-zinc-500 mb-1.5 block">Client ID</label><input value={clientId} onChange={e => setClientId(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg p-3 text-white text-sm focus:border-rose-500 outline-none transition-colors" placeholder={`Paste ${PLATFORM_CONFIG[activeConnectTab].label} Client ID`} /></div>
                                <div><label className="text-xs font-bold uppercase text-zinc-500 mb-1.5 block">Client Secret</label><input value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg p-3 text-white text-sm focus:border-rose-500 outline-none transition-colors" type="password" placeholder="Paste Client Secret" /></div>
                                <button onClick={initConnection} className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-zinc-200 transition-colors shadow-lg mt-2">
                                    {connectedPlatforms.includes(activeConnectTab) ? "Reconnect Account" : "Authenticate & Connect"}
                                </button>
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
              <div className="relative bg-black h-64 flex items-center justify-center"><video src={selectedClip.filename} className="h-full w-full object-contain" controls autoPlay /></div>
              
              <div className="p-5 bg-zinc-900 border-t border-zinc-800 flex-1 overflow-y-auto space-y-4">
                {/* Inputs */}
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-1">Title</label>
                    <input className="w-full bg-black border border-zinc-700 rounded p-2 text-white text-sm" value={postTitle} onChange={e => setPostTitle(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-1">Caption / Description</label>
                    <textarea className="w-full bg-black border border-zinc-700 rounded p-2 text-white text-sm h-24 resize-none" value={postCaption} onChange={e => setPostCaption(e.target.value)} />
                </div>

                {/* Platform Selector */}
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Publish To</label>
                    <div className="flex flex-wrap gap-2">
                        {Object.keys(PLATFORM_CONFIG).map(p => {
                            const isConnected = connectedPlatforms.includes(p);
                            const isSelected = uploadPlatforms.includes(p);
                            return (
                                <button key={p} onClick={() => toggleUploadPlatform(p)} 
                                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border capitalize flex items-center gap-2 transition-all", 
                                    !isConnected ? "opacity-50 border-zinc-800 bg-zinc-900 text-zinc-600 grayscale" : 
                                    isSelected ? "bg-white text-black border-white shadow-lg" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500")}>
                                    {/* Icon */}
                                    {p === 'youtube' && <Youtube className="w-3 h-3" />}
                                    {p === 'instagram' && <Instagram className="w-3 h-3" />}
                                    {p === 'twitter' && <Twitter className="w-3 h-3" />}
                                    {p === 'tiktok' && <Play className="w-3 h-3" />}
                                    {p}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <button onClick={handlePost} disabled={isPosting} className="w-full bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-500 flex justify-center gap-2 mt-2">{isPosting ? <Loader2 className="animate-spin" /> : <UploadCloud />} Post to Selected</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NAVBAR */}
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

      {/* MAIN LAYOUT */}
      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 lg:gap-6 lg:p-6 overflow-hidden">
        {/* LEFT: CAMERA */}
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

        {/* RIGHT: GALLERY */}
        <div className="flex-1 flex flex-col lg:col-span-5 overflow-hidden lg:rounded-2xl lg:bg-zinc-900/30 lg:border border-white/5 bg-zinc-950">
          <div className="flex-1 overflow-y-auto p-4 relative space-y-3 pb-20">
              {gallery.map((clip) => (
                <div key={clip.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex h-24 cursor-pointer hover:border-zinc-600 transition-colors" onClick={() => openClipModal(clip)}>
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