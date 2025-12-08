import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Camera, Play, UploadCloud, Sparkles, 
  LayoutDashboard, Video, Terminal, X, Maximize2,
  LogOut, User, ChevronDown, Settings, Square
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'

function cn(...inputs) { return twMerge(clsx(inputs)) }

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [logs, setLogs] = useState(["System initialized..."])
  const [gallery, setGallery] = useState([])
  const [cameraReady, setCameraReady] = useState(false)
  const [activeTab, setActiveTab] = useState('gallery') 
  const [selectedClip, setSelectedClip] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  
  const [autoUpload, setAutoUpload] = useState(false) 
  
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunkCounter = useRef(0)
  const logsEndRef = useRef(null)
  const userRef = useRef(null)
  const autoUploadRef = useRef(false)
  
  const navigate = useNavigate()

  // --- AUTH & POLLING ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        userRef.current = session.user
        addLog("User authenticated")
      } else {
        addLog("Running in anonymous mode")
      }
    })

    const interval = setInterval(async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
        axios.get(`${API_URL}/logs`)
        if (logRes.data.logs) {
          setLogs(prev => {
             const combined = [...prev, ...logRes.data.logs]
             return [...new Set(combined)].slice(-50)
          })
        }

        const currentUserId = userRef.current ? userRef.current.id : "offline-user"
        const gallRes = await axios.get(`http://127.0.0.1:8000/gallery/${currentUserId}`)
        if (gallRes.data) setGallery(gallRes.data)
      } catch (e) {}
    }, 1000)
    return () => clearInterval(interval)
  }, [navigate])

  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { autoUploadRef.current = autoUpload }, [autoUpload])

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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" }, 
        audio: true 
      })
      videoRef.current.srcObject = stream
      streamRef.current = stream
      videoRef.current.play()
      setCameraReady(true)
      addLog("Camera initialized")
    } catch (err) { alert("Hardware Error: " + err.message) }
  }

  const toggleRecording = () => {
    if (isRecording) {
        stopRecording()
    } else {
        startRecording()
    }
  }

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
    const isAuto = autoUploadRef.current
    
    addLog(`🚀 Uploading chunk_${id} (${isAuto ? 'AUTO' : 'MANUAL'})...`)
    
    const filename = `chunk_${id}.webm`
    const formData = new FormData()
    formData.append("file", blob, filename)
    formData.append("user_id", userId) 
    formData.append("auto_upload", isAuto ? "true" : "false") 

    try { 
      const res = await axios.post("http://127.0.0.1:8000/upload-chunk", formData)
      if (res.status === 200) addLog(`✅ Chunk_${id} sent`)
    } catch (err) {
      console.error(err)
      addLog(`❌ Upload Failed`)
    }
  }

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-zinc-300 font-sans selection:bg-rose-500/30 overflow-hidden flex flex-col">
      
      {/* MODAL PLAYER */}
      <AnimatePresence>
        {selectedClip && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
            onClick={() => setSelectedClip(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden max-h-[90vh] max-w-lg w-full shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex flex-col">
                  <h3 className="text-white font-bold">{selectedClip.title}</h3>
                  <span className="text-[10px] text-zinc-500 font-mono">ID: {selectedClip.id.slice(0,8)}</span>
                </div>
                <button onClick={() => setSelectedClip(null)} className="p-2 hover:bg-zinc-800 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className="relative bg-black flex-1 flex items-center justify-center group">
                <video 
                  src={selectedClip.filename} // Uses Full Cloud URL directly
                  className="max-h-[60vh] w-full object-contain" 
                  controls 
                  autoPlay
                />
              </div>
              <div className="p-5 bg-zinc-900 border-t border-zinc-800">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl font-bold text-white">{selectedClip.score}/10</span>
                    <span className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Viral Score</span>
                </div>
                <p className="text-sm text-zinc-400 mb-4 leading-relaxed">{selectedClip.description}</p>
                <button className="w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-zinc-200 flex justify-center gap-2 transition-colors">
                    <UploadCloud className="w-4 h-4" /> Upload to YouTube
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NAVBAR */}
      <nav className="h-14 border-b border-white/10 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
          <span className="font-bold text-base tracking-tight text-white hidden sm:inline">DirectorFlow</span>
        </div>
        
        <div className="flex items-center gap-4">
            
            {/* AUTO UPLOAD TOGGLE */}
            <div 
                className="flex items-center gap-2 cursor-pointer group" 
                onClick={() => setAutoUpload(!autoUpload)}
            >
                <span className={cn("text-[10px] font-bold uppercase transition-colors hidden sm:block", autoUpload ? "text-green-400" : "text-zinc-500")}>
                    Auto-Post
                </span>
                <div className={cn("w-10 h-5 rounded-full p-0.5 transition-colors relative", autoUpload ? "bg-green-500/20 border border-green-500/50" : "bg-zinc-800 border border-zinc-700")}>
                    <motion.div 
                        initial={false}
                        animate={{ x: autoUpload ? 20 : 0 }}
                        className={cn("w-3.5 h-3.5 rounded-full shadow-sm", autoUpload ? "bg-green-400" : "bg-zinc-500")}
                    />
                </div>
            </div>

            {/* STATUS BADGE */}
            <div className={cn("hidden md:flex items-center gap-2 px-2 py-1 rounded-full text-[10px] font-mono border transition-all", isRecording ? "bg-rose-500/10 border-rose-500/50 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.3)]" : "bg-zinc-900 border-zinc-800 text-zinc-500")}>
                <div className={cn("w-1.5 h-1.5 rounded-full", isRecording ? "bg-rose-500 animate-pulse" : "bg-zinc-600")} />
                {isRecording ? "LIVE" : "IDLE"}
            </div>

            {/* USER PROFILE */}
            {user && (
              <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700 hover:border-zinc-500 transition-colors"><User className="w-4 h-4" /></div>
                </button>
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute right-0 top-10 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
                      <div className="p-3 border-b border-zinc-800"><p className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Account</p><p className="text-sm text-white truncate">{user.email}</p></div>
                      <div className="p-1"><button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors"><LogOut className="w-4 h-4" /> Sign Out</button></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
        </div>
      </nav>

      {/* --- APP LAYOUT --- */}
      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 lg:gap-6 lg:p-6 overflow-hidden">
        
        {/* LEFT COLUMN: CAMERA & CONTROLS */}
        <div className="flex flex-col lg:col-span-7 gap-0 lg:gap-6 shrink-0 lg:shrink">
          
          {/* CAMERA CONTAINER */}
          <div className="relative bg-black lg:rounded-3xl overflow-hidden border-b lg:border border-white/10 shadow-2xl flex justify-center h-[45vh] lg:h-[65vh]">
            <div className="relative aspect-[9/16] h-full w-auto bg-black lg:rounded-lg overflow-hidden border-x border-white/10">
                {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm z-10">
                    <button onClick={startCamera} className="group relative px-6 py-3 bg-zinc-100 text-black rounded-full font-semibold hover:scale-105 transition-transform flex items-center gap-2">
                    <Camera className="w-5 h-5" /> Activate Camera
                    </button>
                </div>
                )}
                
                <video 
                    ref={videoRef} 
                    className="w-full h-full object-cover object-center" 
                    muted 
                    playsInline 
                />
                
                {isRecording && (
                <div className="absolute inset-0 pointer-events-none opacity-20 grid grid-cols-3 grid-rows-3">
                    <div className="border-r border-white/30"></div><div className="border-r border-white/30"></div><div></div>
                    <div className="border-r border-t border-white/30"></div><div className="border-r border-t border-white/30"></div><div className="border-t border-white/30"></div>
                    <div className="border-r border-t border-white/30"></div><div className="border-r border-t border-white/30"></div><div className="border-t border-white/30"></div>
                </div>
                )}
                
                {/* Floating SINGLE BUTTON Control (Mobile) */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 lg:hidden pb-safe z-20">
                    <motion.button 
                        whileTap={{ scale: 0.9 }} 
                        onClick={toggleRecording} 
                        disabled={!cameraReady}
                        className={cn(
                            "h-20 w-20 rounded-full flex items-center justify-center border-4 shadow-xl transition-all",
                            isRecording 
                                ? "bg-white border-white/50" 
                                : "bg-rose-600 border-white/20 shadow-rose-900/50"
                        )}
                    >
                        <motion.div 
                            animate={isRecording ? { borderRadius: "4px", scale: 1 } : { borderRadius: "50%", scale: 1 }}
                            className={cn(
                                "transition-all duration-300", 
                                isRecording ? "w-8 h-8 bg-red-600 rounded-md" : "w-16 h-16 bg-transparent"
                            )}
                        >
                            {!isRecording && <div className="w-full h-full bg-rose-500 rounded-full border-4 border-transparent" />}
                        </motion.div>
                    </motion.button>
                </div>
            </div>
          </div>

          {/* DESKTOP CONTROLS (Hidden on Mobile) */}
          <div className="hidden lg:flex bg-zinc-900/50 border border-white/5 p-6 rounded-2xl items-center justify-between backdrop-blur-md">
            <div><h3 className="text-white font-medium">Neural Command</h3><p className="text-xs text-zinc-500">Auto-Director Mode</p></div>
            <div className="flex justify-center w-full max-w-md">
              <motion.button 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }} 
                onClick={toggleRecording} 
                disabled={!cameraReady}
                className={cn(
                    "h-16 w-full rounded-xl flex items-center justify-center gap-3 transition-all font-bold text-lg shadow-lg",
                    isRecording 
                        ? "bg-zinc-800 text-red-400 border border-red-500/20 hover:bg-zinc-700" 
                        : "bg-rose-600 text-white hover:bg-rose-500 shadow-rose-900/40"
                )}
              >
                {isRecording ? (
                    <> <Square className="w-5 h-5 fill-current" /> STOP RECORDING </>
                ) : (
                    <> <div className="w-4 h-4 rounded-full bg-white animate-pulse" /> START RECORDING </>
                )}
              </motion.button>
            </div>
          </div>

          {/* DESKTOP LOGS */}
          <div className="hidden lg:flex flex-col bg-black rounded-xl border border-zinc-800 h-full overflow-hidden min-h-[150px]">
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2"><Terminal className="w-4 h-4 text-accent" /><span className="text-xs font-mono text-zinc-400">NEURAL_LOGS</span></div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2 text-zinc-400">
              {logs.map((log, i) => (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={i} className="border-l-2 border-zinc-800 pl-2 py-0.5 hover:bg-white/5 hover:border-accent transition-colors">
                  {log}
                </motion.div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (Mobile: Bottom half / Desktop: Right side) */}
        <div className="flex-1 flex flex-col lg:col-span-5 overflow-hidden lg:rounded-2xl lg:bg-zinc-900/30 lg:border border-white/5 bg-zinc-950">
          
          {/* TABS (Mobile Only) */}
          <div className="flex lg:hidden border-b border-white/10 sticky top-0 bg-zinc-950 z-20">
            <button onClick={() => setActiveTab('gallery')} className={cn("flex-1 py-4 text-sm font-medium transition-colors", activeTab === 'gallery' ? "text-white border-b-2 border-rose-500 bg-white/5" : "text-zinc-500")}>
                Gallery ({gallery.length})
            </button>
            <button onClick={() => setActiveTab('logs')} className={cn("flex-1 py-4 text-sm font-medium transition-colors", activeTab === 'logs' ? "text-white border-b-2 border-rose-500 bg-white/5" : "text-zinc-500")}>
                System Logs
            </button>
          </div>

          {/* SCROLLABLE CONTENT */}
          <div className="flex-1 overflow-y-auto p-4 relative">
            
            {/* MOBILE LOGS VIEW */}
            <div className={cn("space-y-2 font-mono text-xs text-zinc-400 pb-20", activeTab === 'logs' && "block lg:hidden", activeTab !== 'logs' && "hidden")}>
               {logs.map((log, i) => <div key={i} className="border-b border-zinc-900 pb-1">{log}</div>)}
               <div ref={logsEndRef} />
            </div>

            {/* GALLERY VIEW */}
            <div className={cn("space-y-3 pb-20", (activeTab === 'gallery' || window.innerWidth >= 1024) ? "block" : "hidden")}>
              
              {/* Desktop Header */}
              <div className="hidden lg:flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold flex items-center gap-2"><LayoutDashboard className="w-4 h-4 text-accent" /> Generated Clips</h2>
                <span className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-400">{gallery.length} items</span>
              </div>

              <AnimatePresence>
                {gallery.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-zinc-600">
                    <Video className="w-12 h-12 mb-4 opacity-20" />
                    <p>No clips yet.</p>
                  </motion.div>
                )}

                {gallery.map((clip) => (
                  <motion.div 
                    layout 
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, scale: 0.95 }} 
                    key={clip.id} 
                    className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer flex h-28 lg:h-32" 
                    onClick={() => setSelectedClip(clip)}
                  >
                      {/* Thumbnail (Video) */}
                      <div className="w-24 lg:w-28 bg-black relative shrink-0">
                        <video 
                            src={clip.filename} // Cloud URL
                            className="w-full h-full object-cover opacity-80" 
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-transparent transition-all">
                            <Play className="w-4 h-4 text-white fill-white opacity-80" />
                        </div>
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 p-3 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <h3 className="text-sm font-semibold text-zinc-200 line-clamp-1 group-hover:text-white">{clip.title}</h3>
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0", clip.score >= 8 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400")}>
                                {clip.score}/10
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">{clip.description}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-auto">
                           <span className="text-[10px] text-zinc-500 flex items-center gap-1 group-hover:text-rose-400 transition-colors">
                             <Maximize2 className="w-3 h-3" /> Watch
                           </span>
                        </div>
                      </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}