import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Camera, Play, UploadCloud, Sparkles, 
  Terminal, X, Maximize2, LogOut, User, Square, Loader2, Link as LinkIcon,
  HelpCircle, ExternalLink, Download
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './supabaseClient'
import { useNavigate, useSearchParams } from 'react-router-dom'

function cn(...inputs) { return twMerge(clsx(inputs)) }

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

export default function Dashboard() {
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
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunkCounter = useRef(0)
  const logsEndRef = useRef(null)
  const userRef = useRef(null)
  
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // --- AUTH HANDLER (Step 2 of Connection) ---
  useEffect(() => {
    // If URL has ?code=..., it means Google redirected back here
    const code = searchParams.get('code')
    
    const completeAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (code && session) {
            // Remove code from URL so we don't loop
            window.history.replaceState({}, document.title, "/dashboard")
            
            addLog("🔄 Finalizing YouTube Connection...")
            try {
                const res = await axios.post(`${API_URL}/auth/callback`, {
                    user_id: session.user.id,
                    code: code
                })
                if(res.data.status === 'success') {
                    alert("YouTube Connected Successfully!")
                    addLog("✅ YouTube Connected")
                } else {
                    alert("Connection Failed: " + res.data.error)
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

  const addLog = (msg) => setLogs(prev => [...prev, `[UI] ${msg}`])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  // --- MANUAL DOWNLOAD ---
  const handleDownload = async () => {
    if (!selectedClip) return;
    try {
        const response = await fetch(selectedClip.filename);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${selectedClip.title.replace(/\s+/g, '_')}_viral.mp4`; 
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        addLog("✅ Download started");
    } catch (e) {
        alert("Download failed");
    }
  };

  // --- CONNECT YOUTUBE (Step 1) ---
  const initConnection = async () => {
      if(!clientId || !clientSecret) return alert("Please enter both keys")
      
      try {
          const res = await axios.post(`${API_URL}/auth/init`, {
              user_id: user.id,
              platform: 'youtube',
              client_id: clientId,
              client_secret: clientSecret
          })
          
          if(res.data.url) {
              // Redirect user to Google
              window.location.href = res.data.url
          }
      } catch(e) {
          alert("Error initializing auth")
      }
  }

  // --- AUTO UPLOAD (Trigger) ---
  const handleAutoUpload = async () => {
      // For MVP, this just triggers the backend upload using stored tokens
      if(!confirm("Upload to YouTube Channel? (Ensure you have connected)")) return;
      
      addLog("🚀 Starting YouTube Upload...")
      const formData = new FormData()
      formData.append("user_id", user.id)
      formData.append("video_filename", selectedClip.filename) // Pass URL/Filename
      
      try {
          // Note: This endpoint needs to handle downloading from URL if file missing
          const res = await axios.post(`${API_URL}/upload/youtube`, formData)
          if(res.data.status === 'success') {
              alert("Video Uploaded! ID: " + res.data.video_id)
          } else {
              alert("Upload failed: " + res.data.error)
          }
      } catch(e) {
          alert("Network error")
      }
  }

  // --- CAMERA LOGIC (Unchanged) ---
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
      
      {/* CONNECTION WIZARD MODAL */}
      <AnimatePresence>
        {showConnectModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-full max-w-lg relative">
                    <button onClick={() => setShowConnectModal(false)} className="absolute top-4 right-4"><X className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><LinkIcon className="w-5 h-5 text-red-500" /> Connect YouTube</h2>
                    
                    <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 text-sm space-y-2 mb-6">
                        <p className="font-bold text-white">How to get keys:</p>
                        <ol className="list-decimal list-inside text-zinc-400 space-y-1">
                            <li>Go to <a href="https://console.cloud.google.com/" target="_blank" className="text-blue-400 hover:underline">Google Cloud Console</a>.</li>
                            <li>Create a Project & Enable "YouTube Data API v3".</li>
                            <li>Go to "Credentials" → "Create Credentials" → "OAuth Client ID".</li>
                            <li>Select "Web Application".</li>
                            <li>Add this Redirect URI: <br/><code className="bg-zinc-800 px-1 rounded text-xs select-all text-white">{window.location.origin}/auth/callback</code></li>
                            <li>Copy the Client ID and Secret below.</li>
                        </ol>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold uppercase text-zinc-500">Client ID</label>
                            <input value={clientId} onChange={e => setClientId(e.target.value)} className="w-full bg-black border border-zinc-700 rounded p-2 text-white text-sm" placeholder="...apps.googleusercontent.com" />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase text-zinc-500">Client Secret</label>
                            <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="w-full bg-black border border-zinc-700 rounded p-2 text-white text-sm" type="password" placeholder="GOCSPX-..." />
                        </div>
                        <button onClick={initConnection} className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-500 transition-colors">Authenticate with Google</button>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* VIDEO PREVIEW MODAL */}
      <AnimatePresence>
        {selectedClip && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={() => setSelectedClip(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden max-h-[90vh] max-w-lg w-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h3 className="text-white font-bold">{selectedClip.title}</h3>
                <button onClick={() => setSelectedClip(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="relative bg-black flex-1 flex items-center justify-center">
                <video src={selectedClip.filename} className="max-h-[50vh] w-full object-contain" controls autoPlay />
              </div>
              <div className="p-5 bg-zinc-900 border-t border-zinc-800 space-y-3">
                <button onClick={handleDownload} className="w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-zinc-200 flex justify-center gap-2"><Download className="w-5 h-5" /> Download (Manual Post)</button>
                <div className="flex items-center gap-3">
                    <div className="h-px bg-zinc-700 flex-1"></div>
                    <span className="text-xs text-zinc-500 uppercase">OR</span>
                    <div className="h-px bg-zinc-700 flex-1"></div>
                </div>
                <button onClick={handleAutoUpload} className="w-full bg-zinc-800 text-zinc-300 py-3 rounded-xl font-bold hover:bg-zinc-700 flex justify-center gap-2 border border-zinc-700"><UploadCloud className="w-5 h-5" /> Auto-Upload (YouTube)</button>
                <p className="text-[10px] text-center text-zinc-600">Auto-upload requires connected account.</p>
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
                        <button onClick={() => { setShowConnectModal(true); setShowUserMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Connect YouTube</button>
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
                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20"><button onClick={toggleRecording} disabled={!cameraReady} className={cn("h-20 w-20 rounded-full flex items-center justify-center border-4 shadow-xl transition-all", isRecording ? "bg-white border-white/50" : "bg-rose-600 border-white/20")}><div className={cn("transition-all duration-300", isRecording ? "w-8 h-8 bg-red-600 rounded-md" : "w-16 h-16 bg-transparent")} /></button></div>
            </div>
          </div>
          <div className="hidden lg:flex bg-zinc-900/50 border border-white/5 p-6 rounded-2xl items-center justify-between backdrop-blur-md">
            <div><h3 className="text-white font-medium">Neural Command</h3><p className="text-xs text-zinc-500">Auto-Director Mode</p></div>
            <button onClick={toggleRecording} disabled={!cameraReady} className={cn("px-8 py-4 rounded-xl font-bold flex gap-3 shadow-lg transition-colors", isRecording ? "bg-zinc-800 text-red-400 border border-red-500/20" : "bg-rose-600 text-white")}>{isRecording ? "STOP RECORDING" : "START RECORDING"}</button>
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