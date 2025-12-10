import { BrowserRouter as Router, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Sparkles, Chrome, ArrowLeft, Mail, AlertCircle, Lock, Loader2 } from 'lucide-react'
import Dashboard from './Dashboard'
import ProtectedRoute from './ProtectedRoute'

// --- LANDING PAGE ---
function LandingPage() {
  const navigate = useNavigate()

  // FIX: Auto-redirect if already logged in (handles the OAuth callback)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/dashboard')
    })
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || session) navigate('/dashboard')
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-rose-500/30 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[128px]" />
      </div>
      <nav className="relative z-10 p-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
          DirectorFlow
        </div>
        <button onClick={() => navigate('/login')} className="px-5 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">Log In</button>
      </nav>
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 mb-8 hover:border-zinc-700 transition-colors cursor-default">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          AI CONTENT ENGINE ONLINE
        </div>
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">Dominate the <br />Attention Economy.</h1>
        <p className="text-lg md:text-xl text-zinc-500 max-w-2xl mx-auto mb-10 leading-relaxed">The reason you aren't growing is volume. <br />Our AI Director watches your life, edits the viral moments, and posts them.</p>
        <div className="flex flex-col md:flex-row justify-center gap-4">
          <button onClick={() => navigate('/login')} className="px-8 py-4 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform flex items-center justify-center gap-2 shadow-xl shadow-white/10">Start Filming Now</button>
        </div>
      </div>
    </div>
  )
}

// --- AUTH PAGE ---
function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/dashboard')
    })
    // Also listen here in case they just logged in
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || session) navigate('/dashboard')
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        if (error.message.includes("already registered") || error.status === 400) {
            setErrorMsg("This email is already registered. Please Sign In instead.")
            setIsSignUp(false)
        } else {
            setErrorMsg(error.message)
        }
      } else {
        if (data.user && data.user.identities && data.user.identities.length === 0) {
             setErrorMsg("This email is already taken. Please log in with Google.")
        } else {
             alert("Account created! Please check your email to confirm.")
        }
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
            setErrorMsg("Invalid password. If you signed up with Google, please use that button above.")
        } else {
            setErrorMsg(error.message)
        }
      } else {
        navigate('/dashboard')
      }
    }
    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { 
          // FIX: Redirect to Root (LandingPage handles the session check)
          // This avoids the "ProtectedRoute" race condition
          redirectTo: window.location.origin
      },
    })
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black z-0" />
      <div className="w-full max-w-md relative z-10">
        <button onClick={() => navigate('/')} className="mb-8 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"><ArrowLeft className="w-4 h-4" /> Back to Home</button>
        <div className="bg-zinc-950/50 backdrop-blur-xl border border-zinc-800 p-8 rounded-3xl shadow-2xl">
          <div className="flex justify-center mb-6"><div className="w-12 h-12 bg-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-rose-600/20"><Sparkles className="w-6 h-6 text-white" /></div></div>
          <h2 className="text-2xl font-bold text-white mb-2 text-center">{isSignUp ? "Create your account" : "Welcome back"}</h2>
          <p className="text-zinc-500 mb-8 text-center text-sm">{isSignUp ? "Start automating your content today" : "Enter your details to access the dashboard"}</p>
          <button onClick={handleGoogleLogin} className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors shadow-lg flex items-center justify-center gap-2 mb-4"><Chrome className="w-5 h-5" /> Continue with Google</button>
          <div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800"></div></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-black px-2 text-zinc-600">Or using email</span></div></div>
          {errorMsg && (<div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-3"><AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" /><p className="text-sm text-red-200">{errorMsg}</p></div>)}
          <form className="space-y-4" onSubmit={handleAuth}>
              <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Email</label><div className="relative"><Mail className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" /><input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all placeholder:text-zinc-700" required /></div></div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Password</label><div className="relative"><Lock className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" /><input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all placeholder:text-zinc-700" required /></div></div>
              <button disabled={loading} className="w-full bg-rose-600 text-white font-bold py-3.5 rounded-xl hover:bg-rose-500 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">{loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}</button>
          </form>
          <div className="mt-6 text-center text-sm"><span className="text-zinc-500">{isSignUp ? "Already have an account?" : "Don't have an account?"} </span><button onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(null); }} className="text-rose-500 hover:text-rose-400 font-bold ml-1">{isSignUp ? "Sign In" : "Sign Up"}</button></div>
        </div>
      </div>
    </div>
  )
}

// --- AUTH CALLBACK HANDLER ---
function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state'); 
    
    // We send params to dashboard so our logic in Dashboard.jsx can handle the API keys logic
    if (code) {
        navigate(`/dashboard?code=${code}&state=${state || ''}`, { replace: true });
    } else {
        navigate('/dashboard');
    }
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white space-y-4">
      <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
      <p className="text-zinc-400 font-mono">Verifying Connection...</p>
    </div>
  );
}

// --- MAIN ROUTER ---
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      </Routes>
    </Router>
  )
}