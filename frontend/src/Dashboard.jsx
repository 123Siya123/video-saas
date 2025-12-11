import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Camera, Play, UploadCloud, Sparkles, 
  Terminal, X, Maximize2, LogOut, User, Square, Loader2, Link as LinkIcon,
  Youtube, Instagram, Twitter, Facebook, Calendar, HelpCircle, ExternalLink, Copy, CheckCircle, FileText, Film, Trash2, SwitchCamera, Zap
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './supabaseClient'
import { useNavigate, useSearchParams } from 'react-router-dom'

function cn(...inputs) { return twMerge(clsx(inputs)) }

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || "https://calendly.com/your-username/30min"; 

const PLATFORM_CONFIG = {
    youtube: { label: "YouTube", icon: Youtube, color: "text-red-500", portalName: "Google Cloud Console", portalUrl: "https://console.cloud.google.com/apis/dashboard", steps: ["Create Project", "Enable YouTube Data API v3", "OAuth Consent -> Test Users -> Add Email", "Credentials -> Create OAuth Client ID (Web)", "Add Redirect URI", "Copy Keys"] },
    instagram: { label: "Instagram", icon: Instagram, color: "text-pink-500", portalName: "Meta for Developers", portalUrl: "https://developers.facebook.com/apps/", steps: ["Create Business App", "Add Instagram Graph API", "Settings -> Basic -> Add Website Platform", "Copy App ID & Secret"] },
    twitter: { label: "Twitter (X)", icon: Twitter, color: "text-blue-400", portalName: "X Developer Portal", portalUrl: "https://developer.twitter.com/en/portal/dashboard", steps: ["Create Free Project", "User Auth Settings -> Read/Write", "Type: Web App", "Add Redirect URI", "Copy OAuth 2.0 Keys"] },
    tiktok: { label: "TikTok", icon: Play, color: "text-black", portalName: "TikTok Developers", portalUrl: "https://developers.tiktok.com/", steps: ["Create App", "Add Video Kit & Login Kit", "Add Redirect URI", "Submit for Review (Manual)", "Copy Keys"] }
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [logs, setLogs] = useState(["System initialized..."])
  const [gallery, setGallery] = useState([])
  const [cameraReady, setCameraReady] = useState(false)
  
  // Settings
  const [facingMode, setFacingMode] = useState('user') 
  const [liteMode, setLiteMode] = useState(false) // Default Normal
  const [autoUpload, setAutoUpload] = useState(false)

  const [mobileTab, setMobileTab] = useState('camera') 
  const [selectedClip, setSelectedClip] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  
  // Connection & Upload State
  const [connectedPlatforms, setConnectedPlatforms] = useState([])
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showCalendly, setShowCalendly] = useState(false)
  const [activeConnectTab, setActiveConnectTab] = useState('youtube') 
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  
  const [isPosting, setIsPosting] = useState(false)
  const [uploadPlatforms, setUploadPlatforms] = useState([])
  const [postTitle, setPostTitle] = useState("")
  const [postCaption, setPostCaption] = useState("")
  const [uploadResult, setUploadResult] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunkCounter = useRef(0)
  const logsEndRef = useRef(null)
  const userRef = useRef(null)
  const autoUploadRef = useRef(false)
  const liteModeRef = useRef(false)
  
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => { autoUploadRef.current = autoUpload }, [autoUpload])
  useEffect(() => { liteModeRef.current = liteMode }, [liteMode])

  const fetchConnections = async (userId) => {
      if(!userId) return
      try {
          const res = await axios.get(`${API_URL}/auth/status/${userId}`)
          if(res.data.connected) {
              setConnectedPlatforms(res.data.connected)
              setUploadPlatforms(res.data.connected)
          }
      } catch(e) { console.error(e) }
  }

  const fetchGallery = async (userId) => {
      try {
        const res = await axios.get(`${API_URL}/gallery/${userId}`)
        if (res.data) setGallery(res.data)
      } catch (e) {}
  }

  useEffect(() => {
    const code = searchParams.get('code')
    const pendingPlatform = localStorage.getItem('pending_auth_platform')

    const completeAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (code && session && pendingPlatform) {
            window.history.replaceState({}, document.title, "/dashboard")
            addLog(`🔄 Finalizing ${pendingPlatform}...`)
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
        fetchGallery(session.user.id)
      }
    })

    const interval = setInterval(async () => {
      try {
        const logRes = await axios.get(`${API_URL}/logs`)
        if (logRes.data.logs) {
          setLogs(prev => [...new Set([...prev, ...logRes.data.logs])].slice(-50))
        }
        if(userRef.current) fetchGallery(userRef.current.id)
      } catch (e) {}
    }, 2000)
    return () => clearInterval(interval)
  }, [navigate])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs, mobileTab])

  const addLog = (msg) => setLogs(prev => [...prev, `[UI] ${msg}`])
  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/') }

  // --- CONNECT/DISCONNECT ---
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

  const handleDisconnect = async (platform) => {
      if(!confirm(`Disconnect ${platform}?`)) return
      try {
          const res = await axios.post(`${API_URL}/auth/disconnect`, {
              user_id: user.id,
              platform: platform
          })
          if (res.data.status === 'success') {
              addLog(`Disconnected ${platform}`)
              fetchConnections(user.id)
          } else {
              alert("Failed to disconnect")
          }
      } catch (e) { alert("Error disconnecting") }
  }

  // --- UPLOAD ---
  const handlePost = async () => {
      if (!selectedClip || !user) return
      setIsPosting(true)
      setUploadResult(null)
      const formData = new FormData()
      formData.append("user_id", user.id)
      formData.append("clip_id", selectedClip.id) 
      formData.append("video_filename", selectedClip.filename)
      formData.append("caption", postCaption || selectedClip.description)
      formData.append("platforms", uploadPlatforms.join(','))

      try {
          const res = await axios.post(`${API_URL}/upload`, formData)
          setUploadResult(res.data)
          addLog("✅ Upload finished")
          fetchGallery(user.id)
      } catch(e) { alert("Network error") }
      setIsPosting(false)
  }

  const toggleUploadPlatform = (p) => {
      if (!connectedPlatforms.includes(p)) {
          if(confirm(`${PLATFORM_CONFIG[p].label} disconnected. Connect now?`)) {
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
      setUploadResult(null)
  }

  // --- CAMERA ---
  const startCamera = async (requestedMode = null) => {
    const modeToUse = requestedMode || facingMode;
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());

    const constraints = { 
        video: { 
            width: liteMode ? { ideal: 640 } : { ideal: 1280 }, 
            height: liteMode ? { ideal: 480 } : { ideal: 720 },
            frameRate: { ideal: liteMode ? 24 : 30 },
            facingMode: modeToUse 
        }, 
        audio: true 
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      videoRef.current.srcObject = stream
      streamRef.current = stream
      videoRef.current.play()
      setCameraReady(true)
      addLog(liteMode ? "⚡ Camera: Lite Mode" : "📷 Camera: HD Mode")
    } catch (err) { alert("Camera Error: " + err.message) }
  }

  useEffect(() => {
    if (cameraReady && streamRef.current) startCamera(facingMode)
  }, [liteMode])

  const handleSwitchCamera = () => {
      const nextMode = facingMode === 'user' ? 'environment' : 'user';
      setFacingMode(nextMode);
      startCamera(nextMode);
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
    
    // Normal Mode: High Bitrate. Lite Mode: Low Bitrate
    const options = { mimeType: 'video/webm', videoBitsPerSecond: liteModeRef.current ? 500000 : 2500000 }
    
    // Safety check for browser support
    let recorder;
    try {
        recorder = new MediaRecorder(streamRef.current, options)
    } catch(e) {
        recorder = new MediaRecorder(streamRef.current) // Fallback to default
    }

    mediaRecorderRef.current = recorder
    const chunks = []
    
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      chunks.length = 0 // Clear RAM
      uploadChunk(blob, chunkCounter.current)
      chunkCounter.current++
      if (mediaRecorderRef.current) recordNextChunk()
    }
    
    recorder.start()
    
    // Normal: 120s (2 mins) | Lite: 15s
    const interval = liteModeRef.current ? 15000 : 120000
    
    setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, interval) 
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
    const isAuto = autoUploadRef.current
    const isLite = liteModeRef.current

    const formData = new FormData()
    formData.append("file", blob, `chunk_${id}.webm`)
    formData.append("user_id", userId) 
    formData.append("auto_upload", isAuto ? "true" : "false")
    formData.append("is_lite", isLite ? "true" : "false") // Send Lite Flag

    try { await axios.post(`${API_URL}/upload-chunk`, formData) } catch (err) { console.error(err) }
  }

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-zinc-300 font-sans overflow-hidden flex flex-col">
      
      {/* MODALS */}
      <AnimatePresence>
        {showCalendly && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 p-4">
                <div className="bg-white rounded-xl w-full max-w-4xl h-[85vh] relative overflow-hidden flex flex-col">
                    <div className="bg-zinc-100 p-2 flex justify-between items-center border-b">
                        <span className="text-black font-bold px-4 text-sm">Schedule Setup Call</span>
                        <button onClick={() => setShowCalendly(false)} className="p-2 hover:bg-zinc-200 rounded-full text-black"><X className="w-5 h-5" /></button>
                    </div>
                    <iframe src={CALENDLY_URL} width="100%" height="100%" frameBorder="0"></iframe>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showConnectModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-full max-w-4xl relative h-[85vh] flex flex-col">
                    <button onClick={() => setShowConnectModal(false)} className="absolute top-4 right-4"><X className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-white mb-6">Connect Accounts</h2>
                    <div className="flex gap-6 h-full grow overflow-hidden">
                        <div className="w-1/3 flex flex-col gap-2 border-r border-zinc-800 pr-6 overflow-y-auto">
                            {Object.entries(PLATFORM_CONFIG).map(([key, conf]) => (
                                <div key={key} className="flex items-center gap-2 group">
                                    <button onClick={() => { setActiveConnectTab(key); setClientId(''); setClientSecret(''); }} className={cn("flex-1 text-left px-3 py-3 rounded-lg text-sm font-bold flex items-center justify-between transition-colors", activeConnectTab === key ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:bg-zinc-800 hover:text-white")}>
                                        <div className="flex items-center gap-2"><conf.icon className={cn("w-4 h-4", activeConnectTab !== key && conf.color)} /> {conf.label}</div>
                                        {connectedPlatforms.includes(key) && <CheckCircle className="w-4 h-4 text-green-500" />}
                                    </button>
                                    {connectedPlatforms.includes(key) && (<button onClick={() => handleDisconnect(key)} className="p-2 text-zinc-600 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>)}
                                </div>
                            ))}
                            <div className="mt-auto pt-6 border-t border-zinc-800"><button onClick={() => setShowCalendly(true)} className="w-full bg-green-600/10 border border-green-500/50 text-green-400 hover:bg-green-600 hover:text-white px-3 py-3 rounded-lg text-xs font-bold flex items-center gap-2 transition-all group"><Calendar className="w-4 h-4 group-hover:scale-110 transition-transform" /> Have us add it free</button></div>
                        </div>
                        <div className="w-2/3 flex flex-col overflow-y-auto pr-2">
                            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 text-sm space-y-4 mb-6 text-zinc-400 leading-relaxed shadow-inner">
                                <div className="flex items-center justify-between border-b border-zinc-900 pb-2"><span className="text-white font-bold flex items-center gap-2"><HelpCircle className="w-4 h-4 text-rose-500" /> Instructions</span><a href={PLATFORM_CONFIG[activeConnectTab].portalUrl} target="_blank" rel="noreferrer" className="text-xs text-rose-400 hover:underline flex items-center gap-1">Open Portal <ExternalLink className="w-3 h-3" /></a></div>
                                <ul className="list-decimal list-inside space-y-2 text-xs">{PLATFORM_CONFIG[activeConnectTab].steps.map((step, i) => <li key={i} className="pl-1 marker:text-zinc-600">{step}</li>)}</ul>
                                <div className="pt-2 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50 mt-4"><p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Redirect URI to Copy:</p><div className="flex items-center gap-2"><code className="bg-black px-2 py-1.5 rounded border border-zinc-800 text-green-400 select-all block w-full text-xs font-mono truncate">{window.location.origin}/auth/callback</code><button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/auth/callback`)} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400"><Copy className="w-3.5 h-3.5" /></button></div></div>
                            </div>
                            <div className="space-y-4 mt-auto pb-2">
                                {connectedPlatforms.includes(activeConnectTab) ? (<button onClick={() => handleDisconnect(activeConnectTab)} className="w-full bg-red-900/50 text-red-200 border border-red-800 font-bold py-3.5 rounded-xl hover:bg-red-900 transition-colors shadow-lg mt-2 flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Disconnect {PLATFORM_CONFIG[activeConnectTab].label}</button>) : (
                                    <><div className="space-y-3"><div><label className="text-xs font-bold uppercase text-zinc-500 mb-1">Client ID</label><input value={clientId} onChange={e => setClientId(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg p-3 text-white text-sm outline-none focus:border-rose-500" /></div><div><label className="text-xs font-bold uppercase text-zinc-500 mb-1">Client Secret</label><input value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg p-3 text-white text-sm outline-none focus:border-rose-500" type="password" /></div></div><button onClick={initConnection} className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-zinc-200 transition-colors shadow-lg mt-2">Authenticate & Connect</button></>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedClip && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={() => setSelectedClip(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden max-h-[90vh] max-w-lg w-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-zinc-800"><h3 className="text-white font-bold">{selectedClip.title}</h3><button onClick={() => setSelectedClip(null)}><X className="w-5 h-5" /></button></div>
              <div className="relative bg-black h-64 flex items-center justify-center"><video src={selectedClip.filename} className="h-full w-full object-contain" controls autoPlay /></div>
              <div className="p-5 bg-zinc-900 border-t border-zinc-800 flex-1 overflow-y-auto space-y-4">
                {uploadResult ? (
                    <div className="space-y-4"><div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-center font-bold">Upload Complete!</div>{Object.entries(uploadResult).map(([platform, res]) => (<div key={platform} className="flex items-center justify-between p-3 bg-black rounded-lg border border-zinc-800"><span className="capitalize font-bold text-sm">{platform}</span>{res.status === 'success' ? (<a href={res.link} target="_blank" rel="noreferrer" className="text-xs bg-white text-black px-3 py-1.5 rounded-full font-bold hover:bg-zinc-200 flex items-center gap-1">View Post <ExternalLink className="w-3 h-3"/></a>) : (<span className="text-xs text-red-400 flex items-center gap-1"><X className="w-3 h-3"/> Failed</span>)}</div>))}<button onClick={() => setUploadResult(null)} className="w-full bg-zinc-800 text-white py-3 rounded-xl font-bold mt-2">Upload Again</button></div>
                ) : (
                    <><div><label className="text-xs font-bold text-zinc-500 uppercase block mb-1">Title</label><input className="w-full bg-black border border-zinc-700 rounded p-2 text-white text-sm" value={postTitle} onChange={e => setPostTitle(e.target.value)} /></div><div><label className="text-xs font-bold text-zinc-500 uppercase block mb-1">Caption</label><textarea className="w-full bg-black border border-zinc-700 rounded p-2 text-white text-sm h-24 resize-none" value={postCaption} onChange={e => setPostCaption(e.target.value)} /></div><div><label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Publish To</label><div className="flex flex-wrap gap-2">{Object.keys(PLATFORM_CONFIG).map(p => (<button key={p} onClick={() => toggleUploadPlatform(p)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border capitalize flex items-center gap-2 transition-all", !connectedPlatforms.includes(p) ? "opacity-50 border-zinc-800 bg-zinc-900 text-zinc-600 grayscale" : uploadPlatforms.includes(p) ? "bg-white text-black border-white shadow-lg" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500")}>{p === 'youtube' && <Youtube className="w-3 h-3" />} {p === 'instagram' && <Instagram className="w-3 h-3" />} {p}</button>))}</div></div><button onClick={handlePost} disabled={isPosting} className="w-full bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-500 flex justify-center gap-2 mt-2">{isPosting ? <Loader2 className="animate-spin" /> : <UploadCloud />} Post to Selected</button></>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NAVBAR */}
      <nav className="h-14 border-b border-white/10 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 font-bold text-white"><Sparkles className="w-5 h-5 text-rose-500" /> DirectorFlow</div>
        <div className="flex items-center gap-4">
            
            {/* LITE MODE TOGGLE */}
            <div 
                className="flex items-center gap-2 cursor-pointer group" 
                onClick={() => setLiteMode(!liteMode)}
                title="Use Low Quality for Old Phones"
            >
                <div className={cn("w-8 h-5 rounded-full p-0.5 transition-colors relative border", liteMode ? "bg-yellow-500/20 border-yellow-500/50" : "bg-zinc-800 border-zinc-700")}>
                    <motion.div initial={false} animate={{ x: liteMode ? 14 : 0 }} className={cn("w-3.5 h-3.5 rounded-full shadow-sm", liteMode ? "bg-yellow-400" : "bg-zinc-500")} />
                </div>
                <span className={cn("text-[10px] font-bold uppercase hidden sm:block", liteMode ? "text-yellow-400" : "text-zinc-500")}>Lite</span>
            </div>

            {/* AUTO UPLOAD TOGGLE */}
            <div 
                className="flex items-center gap-2 cursor-pointer group" 
                onClick={() => setAutoUpload(!autoUpload)}
            >
                <span className={cn("text-[10px] font-bold uppercase transition-colors hidden sm:block", autoUpload ? "text-green-400" : "text-zinc-500")}>Auto</span>
                <div className={cn("w-8 h-5 rounded-full p-0.5 transition-colors relative border", autoUpload ? "bg-green-500/20 border-green-500/50" : "bg-zinc-800 border-zinc-700")}>
                    <motion.div initial={false} animate={{ x: autoUpload ? 14 : 0 }} className={cn("w-3.5 h-3.5 rounded-full shadow-sm", autoUpload ? "bg-green-400" : "bg-zinc-500")} />
                </div>
            </div>

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
      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 lg:gap-6 lg:p-6 overflow-hidden relative">
        {/* LEFT: CAMERA & LOGS */}
        <div className={cn("flex-col lg:col-span-7 gap-0 lg:gap-6 lg:flex h-full", mobileTab === 'camera' || mobileTab === 'logs' ? "flex" : "hidden lg:flex")}>
          <div className={cn("relative bg-black lg:rounded-3xl overflow-hidden border-b lg:border border-white/10 shadow-2xl flex justify-center shrink-0 transition-all", mobileTab === 'camera' ? "flex-1 lg:h-[60vh]" : "hidden lg:flex lg:h-[60vh]")}>
            <div className="relative aspect-[9/16] h-full w-auto bg-black lg:rounded-lg overflow-hidden border-x border-white/10">
                {!cameraReady && <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-10"><button onClick={() => startCamera('user')} className="px-6 py-3 bg-white text-black rounded-full font-bold flex gap-2"><Camera className="w-5 h-5" /> Activate Camera</button></div>}
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                
                {/* CAMERA CONTROLS */}
                {cameraReady && (
                    <div className="absolute top-4 right-4 z-20">
                        <button onClick={handleSwitchCamera} className="p-3 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all shadow-lg border border-white/10">
                            <SwitchCamera className="w-5 h-5" />
                        </button>
                    </div>
                )}

                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20"><button onClick={() => isRecording ? stopRecording() : startRecording()} disabled={!cameraReady} className={cn("h-20 w-20 rounded-full flex items-center justify-center border-4 shadow-xl transition-all", isRecording ? "bg-white border-white/50" : "bg-rose-600 border-white/20")}><div className={cn("transition-all duration-300", isRecording ? "w-8 h-8 bg-red-600 rounded-md" : "w-16 h-16 bg-transparent")} /></button></div>
            </div>
          </div>
          <div className={cn("flex-col bg-black rounded-xl border border-zinc-800 overflow-hidden lg:flex lg:flex-1 min-h-0", mobileTab === 'logs' ? "flex flex-1" : "hidden lg:flex")}>
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2 shrink-0"><Terminal className="w-4 h-4 text-rose-500" /><span className="text-xs font-mono text-zinc-400">LOGS</span></div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2 text-zinc-400">{logs.map((log, i) => <div key={i}>{log}</div>)}<div ref={logsEndRef} /></div>
          </div>
        </div>

        {/* RIGHT: GALLERY */}
        <div className={cn("flex-col lg:col-span-5 overflow-hidden lg:rounded-2xl lg:bg-zinc-900/30 lg:border border-white/5 bg-zinc-950 h-full", mobileTab === 'gallery' ? "flex flex-1" : "hidden lg:flex")}>
          <div className="flex-1 overflow-y-auto p-4 relative space-y-3 pb-20 min-h-0">
              {gallery.map((clip) => {
                  const uploadedYoutube = clip.social_refs && clip.social_refs.youtube;
                  const uploadedInsta = clip.social_refs && clip.social_refs.instagram;
                  return (
                    <div key={clip.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex h-24 cursor-pointer hover:border-zinc-600 transition-colors" onClick={() => openClipModal(clip)}>
                        <div className="w-24 bg-black relative shrink-0"><video src={clip.filename} className="w-full h-full object-cover opacity-80" /><div className="absolute inset-0 flex items-center justify-center"><Play className="w-4 h-4 text-white" /></div></div>
                        <div className="flex-1 p-3 flex flex-col justify-between">
                            <h3 className="text-sm font-bold text-white line-clamp-1">{clip.title}</h3>
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">{clip.score}/10</span>
                                <div className="flex gap-1">
                                    {uploadedYoutube && (<a href={clip.social_refs.youtube} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-red-500 hover:scale-110 transition-transform"><Youtube className="w-3.5 h-3.5" /></a>)}
                                    {uploadedInsta && (<a href={clip.social_refs.instagram} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-pink-500 hover:scale-110 transition-transform"><Instagram className="w-3.5 h-3.5" /></a>)}
                                </div>
                            </div>
                        </div>
                    </div>
                  )
              })}
          </div>
        </div>

        {/* MOBILE NAV */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around z-50 pb-safe">
            <button onClick={() => setMobileTab('camera')} className={cn("flex flex-col items-center gap-1", mobileTab === 'camera' ? "text-rose-500" : "text-zinc-500")}><Camera className="w-5 h-5"/><span className="text-[10px] font-bold">Cam</span></button>
            <button onClick={() => setMobileTab('gallery')} className={cn("flex flex-col items-center gap-1", mobileTab === 'gallery' ? "text-rose-500" : "text-zinc-500")}><Film className="w-5 h-5"/><span className="text-[10px] font-bold">Clips</span></button>
            <button onClick={() => setMobileTab('logs')} className={cn("flex flex-col items-center gap-1", mobileTab === 'logs' ? "text-rose-500" : "text-zinc-500")}><FileText className="w-5 h-5"/><span className="text-[10px] font-bold">Logs</span></button>
        </div>
      </main>
    </div>
  )
}