import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Camera, Play, UploadCloud, Sparkles, 
  LayoutDashboard, Video, Terminal, X, Maximize2,
  LogOut, User, Square, Loader2, Link as LinkIcon
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'

function cn(...inputs) { return twMerge(clsx(inputs)) }

// Uses environment variable or defaults to local
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
  const [autoUpload, setAutoUpload] = useState(false)
  
  // --- SOCIAL POSTING STATE ---
  const [isPosting, setIsPosting] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState(['youtube', 'tiktok']) 

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunkCounter = useRef(0)
  const logsEndRef = useRef(null)
  const userRef = useRef(null)
  const autoUploadRef = useRef(false)
  
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        userRef.current = session.user
        addLog("User authenticated")
      }
    })

    const interval = setInterval(async () => {
      try {
        const logRes = await axios.get(`${API_URL}/logs`)
        if (logRes.data.logs) {
          setLogs(prev => {
             const combined = [...prev, ...logRes.data.logs]
             return [...new Set(combined)].slice(-50)
          })
        }
        const currentUserId = userRef.current ? userRef.current.id : "offline-user"
        const gallRes = await axios.get(`${API_URL}/gallery/${currentUserId}`)
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

  // --- SOCIAL MEDIA FUNCTIONS ---
  
  // 1. Connect Account (Opens Ayrshare popup)
  const handleConnectSocials = async () => {
    if(!user) return
    try {
        addLog("🔗 Generating connection link...")
        const formData = new FormData()
        formData.append("user_id", user.id)
        
        const res = await axios.post(`${API_URL}/social/connect`, formData)
        
        if (res.data.url) {
            // Open popup for user to login to TikTok/YT
            window.open(res.data.url, '_blank', 'width=600,height=700')
            addLog("✅ Connection window opened")
            setShowUserMenu(false)
        } else {
            alert("Could not generate link.")
        }
    } catch (e) {
        console.error(e)
        alert("Error connecting socials")
    }
  }

  // 2. Post Video
  const handlePost = async () => {
    if (!selectedClip || !user) return
    if (selectedPlatforms.length === 0) {
        alert("Please select at least one platform")
        return
    }

    setIsPosting(true)
    addLog(`📤 Posting to ${selectedPlatforms.join(', ')}...`)

    const formData = new FormData()
    formData.append("user_id", user.id)
    formData.append("video_url", selectedClip.filename)
    formData.append("caption", selectedClip.description + " #viral #fyp")
    formData.append("platforms", selectedPlatforms.join(','))

    try {
        const res = await axios.post(`${API_URL}/social/post`, formData)
        console.log(res.data)
        
        if (res.data.status === "error") {
            // Provide helpful feedback if they haven't connected yet
            if (res.data.message.includes("Profile key not found")) {
                if(confirm("You haven't connected your social accounts yet. Connect now?")) {
                    handleConnectSocials()
                }
            } else {
                addLog(`❌ Post Failed: ${res.data.message}`)
                alert(`Upload failed: ${res.data.message}`)
            }
        } else {
            addLog("✅ Successfully posted to socials!")
            alert("Posted successfully!")
            setSelectedClip(null) // Close modal
        }
    } catch (e) {
        addLog("❌ Network Error during post")
    }
    setIsPosting(false)
  }

  const togglePlatform = (p) => {
    if (selectedPlatforms.includes(p)) {
        setSelectedPlatforms(prev => prev.filter(item => item !== p))
    } else {
        setSelectedPlatforms(prev => [...prev, p])
    }
  }

  // --- CAMERA LOGIC ---
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
    const isAuto = autoUploadRef.current
    addLog(`🚀 Uploading chunk_${id}...`)
    
    const formData = new FormData()
    formData.append("file", blob, `chunk_${id}.webm`)
    formData.append("user_id", userId) 
    
    try { 
      const res = await axios.post(`${API_URL}/upload-chunk`, formData)
      if (res.status === 200) addLog(`✅ Chunk_${id} sent`)
    } catch (err) { console.error(err) }
  }

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-zinc-300 font-sans overflow-hidden flex flex-col">
      
      {/* MODAL PLAYER & UPLOAD */}
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
                <h3 className="text-white font-bold">{selectedClip.title}</h3>
                <button onClick={() => setSelectedClip(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="relative bg-black flex-1 flex items-center justify-center">
                <video src={selectedClip.filename} className="max-h-[50vh] w-full object-contain" controls autoPlay />
              </div>
              
              {/* SOCIAL MEDIA UPLOAD CONTROLS */}
              <div className="p-5 bg-zinc-900 border-t border-zinc-800">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">Select Platforms</label>
                <div className="flex flex-wrap gap-2 mb-4">
                    {['youtube', 'tiktok', 'instagram', 'twitter', 'linkedin'].map(p => (
                        <button 
                            key={p}
                            onClick={() => togglePlatform(p)}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold capitalize border transition-all", 
                                selectedPlatforms.includes(p) 
                                ? "bg-white text-black border-white shadow-lg shadow-white/10" 
                                : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500"
                            )}
                        >
                            {p}
                        </button>
                    ))}
                </div>
                
                <button 
                    onClick={handlePost}
                    disabled={isPosting}
                    className="w-full bg-rose-600 text-white py-3.5 rounded-xl font-bold hover:bg-rose-500 flex justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rose-900/20"
                >
                    {isPosting ? <Loader2 className="w-5 h-5 animate-spin"/> : <UploadCloud className="w-5 h-5" />}
                    {isPosting ? "Distributing..." : "Post Viral Clip"}
                </button>
                <p className="text-center text-[10px] text-zinc-600 mt-3">Powered by DirectorFlow AI Distribution</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NAVBAR */}
      <nav className="h-14 border-b border-white/10 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-rose-500" />
          <span className="font-bold text-base text-white hidden sm:inline">DirectorFlow</span>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-2 py-1 rounded-full text-[10px] font-mono border bg-zinc-900 border-zinc-800 text-zinc-500">
                <div className={cn("w-1.5 h-1.5 rounded-full", isRecording ? "bg-rose-500 animate-pulse" : "bg-zinc-600")} />
                {isRecording ? "LIVE" : "IDLE"}
            </div>

            {user && (
              <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700 hover:border-zinc-500 transition-colors">
                    <User className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute right-0 top-10 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
                      <div className="p-4 border-b border-zinc-800">
                          <p className="text-xs text-zinc-500 uppercase font-bold mb-1">Signed in as</p>
                          <p className="text-sm text-white truncate">{user.email}</p>
                      </div>
                      <div className="p-2 space-y-1">
                          <button onClick={handleConnectSocials} className="w-full text-left px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg flex items-center gap-3 transition-colors">
                              <LinkIcon className="w-4 h-4 text-accent" /> Connect Accounts
                          </button>
                          <button onClick={handleLogout} className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-3 transition-colors">
                              <LogOut className="w-4 h-4" /> Sign Out
                          </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-10">
                    <button onClick={startCamera} className="px-6 py-3 bg-white text-black rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform">
                    <Camera className="w-5 h-5" /> Activate Camera
                    </button>
                </div>
                )}
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 lg:hidden pb-safe z-20">
                    <button onClick={toggleRecording} disabled={!cameraReady} className={cn("h-20 w-20 rounded-full flex items-center justify-center border-4 shadow-xl transition-all", isRecording ? "bg-white border-white/50" : "bg-rose-600 border-white/20")}>
                        <div className={cn("transition-all duration-300", isRecording ? "w-8 h-8 bg-red-600 rounded-md" : "w-16 h-16 bg-transparent")} />
                    </button>
                </div>
            </div>
          </div>

          <div className="hidden lg:flex bg-zinc-900/50 border border-white/5 p-6 rounded-2xl items-center justify-between backdrop-blur-md">
            <div><h3 className="text-white font-medium">Neural Command</h3><p className="text-xs text-zinc-500">Auto-Director Mode</p></div>
            <motion.button whileHover={{ scale: 1.05 }} onClick={toggleRecording} disabled={!cameraReady} className={cn("px-8 py-4 rounded-xl font-bold flex gap-3 shadow-lg transition-colors", isRecording ? "bg-zinc-800 text-red-400 border border-red-500/20" : "bg-rose-600 text-white")}>
                {isRecording ? <><Square className="w-5 h-5" /> STOP RECORDING</> : "START RECORDING"}
            </motion.button>
          </div>

          <div className="hidden lg:flex flex-col bg-black rounded-xl border border-zinc-800 h-full overflow-hidden min-h-[150px]">
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2"><Terminal className="w-4 h-4 text-rose-500" /><span className="text-xs font-mono text-zinc-400">NEURAL_LOGS</span></div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2 text-zinc-400">
              {logs.map((log, i) => <div key={i}>{log}</div>)}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* RIGHT: GALLERY */}
        <div className="flex-1 flex flex-col lg:col-span-5 overflow-hidden lg:rounded-2xl lg:bg-zinc-900/30 lg:border border-white/5 bg-zinc-950">
          <div className="flex lg:hidden border-b border-white/10 sticky top-0 bg-zinc-950 z-20">
            <button onClick={() => setActiveTab('gallery')} className={cn("flex-1 py-4 text-sm font-medium", activeTab === 'gallery' ? "text-white border-b-2 border-rose-500" : "text-zinc-500")}>Gallery ({gallery.length})</button>
            <button onClick={() => setActiveTab('logs')} className={cn("flex-1 py-4 text-sm font-medium", activeTab === 'logs' ? "text-white border-b-2 border-rose-500" : "text-zinc-500")}>Logs</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 relative">
            <div className={cn("space-y-2 font-mono text-xs text-zinc-400 pb-20", activeTab === 'logs' ? "block lg:hidden" : "hidden")}>
               {logs.map((log, i) => <div key={i} className="border-b border-zinc-900 pb-1">{log}</div>)}
               <div ref={logsEndRef} />
            </div>

            <div className={cn("space-y-3 pb-20", (activeTab === 'gallery' || window.innerWidth >= 1024) ? "block" : "hidden")}>
              {gallery.map((clip) => (
                <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={clip.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex h-24 cursor-pointer hover:border-zinc-600 transition-colors shadow-sm" onClick={() => setSelectedClip(clip)}>
                    <div className="w-24 bg-black relative shrink-0">
                      <video src={clip.filename} className="w-full h-full object-cover opacity-80" />
                      <div className="absolute inset-0 flex items-center justify-center"><Play className="w-4 h-4 text-white drop-shadow-md" /></div>
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <h3 className="text-sm font-bold text-white line-clamp-1">{clip.title}</h3>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold", clip.score >= 8 ? "bg-green-900/30 text-green-400" : "bg-yellow-900/30 text-yellow-400")}>{clip.score}/10</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{clip.description}</p>
                      </div>
                    </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}