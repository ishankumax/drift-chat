import React, { useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Plus, Minus, Sparkles, Send } from "lucide-react"
import MascotCharacter from "./MascotCharacter"
import { useIdentity } from "../hooks/useIdentity"

// Color scheme for Tailwind arbitrary values
const COLORS = {
  orange: "#F4600C",
  cream: "#F5F0E8",
  dark: "#1A1A0F",
  yellow: "#F5D000"
}

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A9D08E',
  '#FFC0CB', '#87CEEB', '#DDA0DD', '#FFB347', '#90EE90',
  '#FF69B4', '#20B2AA', '#FFD700', '#FF7F50', '#6495ED'
];

// ─────────────────────────────────────────────────────────────
// Navbar Component
// ─────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const { ghostName, avatarId } = useIdentity()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const getAvatarColor = (id) => {
    return AVATAR_COLORS[(id - 1) % AVATAR_COLORS.length];
  };

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? "backdrop-blur-md bg-black/80 shadow-lg" : "bg-transparent py-4"
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="font-['Anton'] text-[24px] uppercase tracking-wide text-[#F5F0E8]">
          drift
        </div>

        {/* Links */}
        <nav className="hidden md:flex items-center gap-8">
          {["Start", "Features", "How It Works", "Community", "Pricing"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-[#F5F0E8] text-sm uppercase tracking-widest font-semibold hover:text-[#F4600C] transition-colors relative group"
            >
              <span className="relative z-10">{item}</span>
              <span className="absolute left-0 bottom-0 w-0 h-[2px] bg-[#F4600C] transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
          <a
            href="/map"
            className="text-[#F5F0E8] text-sm uppercase tracking-widest font-semibold hover:text-[#F4600C] transition-colors relative group"
          >
            <span className="relative z-10">Map</span>
            <span className="absolute left-0 bottom-0 w-0 h-[2px] bg-[#F4600C] transition-all duration-300 group-hover:w-full" />
          </a>
        </nav>

        {/* Profile Badge */}
        {ghostName && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10">
            <div
              className="w-6 h-6 rounded-full flex-shrink-0"
              style={{ backgroundColor: getAvatarColor(avatarId) }}
            />
            <span className="text-sm font-medium text-[#F5F0E8] truncate max-w-[120px]">
              {ghostName}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────
// Hero Section
// ─────────────────────────────────────────────────────────────
function Hero({ onStartDrifting, onCreateRoom, onViewMap, isLoading }) {

  return (
    <section 
      className="relative w-full min-h-[100svh] flex flex-col justify-between overflow-hidden"
      style={{
        backgroundColor: COLORS.orange,
        backgroundImage: `repeating-conic-gradient(from 0deg, rgba(255,255,255,0.05) 0deg 10deg, transparent 10deg 20deg)`
      }}
    >
      {/* ── Top spacer for navbar ── */}
      <div className="h-20 shrink-0" />

      {/* ── Badge pill ── */}
      <div className="relative z-10 flex justify-center mt-8 px-4">
        <span className="text-[#F5F0E8] font-bold tracking-[0.3em] uppercase text-xs md:text-sm bg-[#1A1A0F] px-6 py-2 rounded-full">
          Step into the future of chat
        </span>
      </div>

      {/* ── Main headline ── */}
      <div className="relative z-10 w-full px-4 md:px-8 mt-6 text-center">
        <h1 className="font-['Anton'] uppercase w-full leading-[1] text-[clamp(56px,12vw,170px)]">
          <motion.span
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="block text-[#F5F0E8]"
          >
            ANONYMOUS
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="block text-[#1A1A0F] mt-2 md:mt-4"
          >
            VIDEO CHAT
          </motion.span>
        </h1>
      </div>

      {/* ── Bottom row: CTA Buttons | Mascot | 2024 badge ── */}
      <div className="relative z-10 flex items-end justify-between w-full px-6 md:px-10 pb-10 mt-auto gap-8">

        {/* Left: CTA Buttons — positioned to the left of mascot */}
        <div className="flex flex-col gap-3 shrink-0 z-30">
          <button 
            onClick={onStartDrifting}
            disabled={isLoading}
            className="px-6 py-3 bg-[#1A1A0F] hover:bg-[#333] disabled:opacity-50 text-[#F5F0E8] font-bold uppercase tracking-wider rounded-full transition-all text-sm md:text-base whitespace-nowrap"
          >
            {isLoading ? 'Connecting...' : 'Start Drifting'}
          </button>
          <button 
            onClick={onCreateRoom}
            disabled={isLoading}
            className="px-6 py-3 bg-transparent border-2 border-[#1A1A0F] hover:bg-[#1A1A0F]/10 disabled:opacity-50 text-[#1A1A0F] font-bold uppercase tracking-wider rounded-full transition-all text-sm md:text-base whitespace-nowrap"
          >
            {isLoading ? 'Creating...' : 'Create Room'}
          </button>
          <button 
            onClick={onViewMap}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-[#F5F0E8] font-bold uppercase tracking-wider rounded-full transition-all text-sm md:text-base whitespace-nowrap"
          >
            View Map
          </button>
        </div>

        {/* Center: Mascot Character */}
        <MascotCharacter 
          className="absolute left-1/2 -translate-x-1/2 bottom-0 z-20 w-[280px] md:w-[340px] lg:w-[400px] pointer-events-none"
        />

        {/* Right: 2026 badge ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="font-['Anton'] text-[#F5F0E8] text-[8vw] leading-none select-none shrink-0"
        >
          2026
        </motion.div>

      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Why Section
// ─────────────────────────────────────────────────────────────
function WhySection() {
  const [expanded, setExpanded] = useState(1);
  
  const features = [
    { id: 0, title: "REAL-TIME MATCHING", desc: "Instantly connect with people worldwide with zero latency WebRTC technology." },
    { id: 1, title: "END-TO-END ENCRYPTION", desc: "Your video and audio streams are P2P encrypted. We can't see or hear your calls, and nothing is ever recorded." },
    { id: 2, title: "GLOBAL COMMUNITY", desc: "Meet fascinating individuals from entirely different cultures, simply with the click of a button." }
  ];

  return (
    <section id="how-it-works" className="relative w-full py-24 px-6 md:px-10 overflow-hidden" style={{ backgroundColor: COLORS.cream }}>
      {/* Background Watermark */}
      <div className="absolute top-[10%] left-0 w-full text-center font-['Anton'] text-[25vw] text-[#1A1A0F]/[0.03] select-none pointer-events-none leading-none z-0">
        DRIFT
      </div>

      <div className="max-w-[1400px] mx-auto relative z-10 flex flex-col xl:flex-row gap-16 xl:gap-8 items-start justify-between">
        
        {/* Left Side: Headline & Accordion */}
        <div className="w-full xl:w-[60%] flex flex-col">
          <h2 className="font-['Anton'] text-[clamp(60px,8vw,120px)] text-[#1A1A0F] uppercase leading-[1.1] tracking-tight mb-16 relative z-10">
            Why the future of <br/>
            <span style={{ color: COLORS.orange }}>anonymous chat</span> <br/>
            matters!
          </h2>

          <div className="flex flex-col gap-4 w-full max-w-2xl">
            {features.map((item) => (
              <div 
                key={item.id} 
                className={`overflow-hidden transition-all duration-500 rounded-3xl border border-[#1A1A0F]/20 ${expanded === item.id ? "bg-[#1A1A0F] text-[#F5F0E8]" : "bg-transparent text-[#1A1A0F]"}`}
              >
                <button 
                  onClick={() => setExpanded(expanded === item.id ? -1 : item.id)}
                  className="w-full px-6 py-5 flex items-center justify-start gap-4 font-bold text-lg md:text-xl uppercase tracking-wider"
                >
                  {expanded === item.id ? <Minus className="w-6 h-6 shrink-0" /> : <Plus className="w-6 h-6 shrink-0" />}
                  {item.title}
                </button>
                <AnimatePresence>
                  {expanded === item.id && (
                    <motion.div 
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="px-6 pb-6 pl-[3.5rem] font-medium text-sm md:text-base leading-relaxed opacity-80"
                    >
                      {item.desc}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Floating Widget */}
        <div className="w-full xl:w-[35%] flex justify-center xl:justify-end xl:mt-24">
          <motion.div 
            initial={{ rotate: -5, y: 50 }}
            whileInView={{ rotate: -2, y: 0 }}
            viewport={{ once: true }}
            className="bg-[#F4600C] text-[#F5F0E8] p-8 md:p-10 rounded-3xl shadow-[20px_20px_0px_#1A1A0F] w-full max-w-md flex flex-col gap-8"
          >
            <div className="flex justify-between items-start border-b border-[#F5F0E8]/30 pb-6">
              <span className="text-sm font-bold uppercase tracking-widest">Anonymous<br/>Connections</span>
              <span className="font-['Anton'] text-5xl">100%</span>
            </div>
            
            <div className="flex justify-between items-end pt-2">
              <div className="flex border border-[#F5F0E8]/30 rounded-full px-4 py-2">
                <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse mr-2 mt-1"></span>
                <span className="text-xs font-bold uppercase tracking-widest leading-none mt-0.5">Live Now</span>
              </div>
              <div className="text-right">
                <span className="block text-xs uppercase tracking-widest mb-1 opacity-80">Daily Active Users</span>
                <span className="font-['Anton'] text-6xl leading-none">24.5K</span>
              </div>
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Stats Section
// ─────────────────────────────────────────────────────────────
function StatsSection() {
  return (
    <section id="community" className="w-full py-24 px-6 md:px-10 overflow-hidden" style={{ backgroundColor: COLORS.dark }}>
      <div className="max-w-[1400px] mx-auto">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-6">
          <div className="bg-[#F5F0E8]/10 text-[#F5F0E8] px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-[0.2em]">
            PLATFORM STATS
          </div>
          <p className="text-[#F5F0E8]/70 text-right max-w-sm font-medium leading-relaxed text-sm">
            We're building a network where anonymity breeds authentic interaction. No filters, no algorithms, just people.
          </p>
        </div>

        {/* Big Headline */}
        <h2 className="font-['Anton'] text-[clamp(50px,8vw,120px)] text-[#F5F0E8] uppercase leading-[1.1] tracking-tight mb-20 relative z-10">
          FUTURE OF ANONYMOUS CHAT <br/>
          <span style={{ color: COLORS.orange }}>BY THE NUMBERS</span>
        </h2>

        {/* Floating Cards Area */}
        <div className="relative w-full h-[400px] md:h-[500px] flex items-center justify-center">
          
          <motion.div 
            animate={{ y: [-15, 15, -15] }} 
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-[5%] md:left-[15%] top-10 bg-white text-[#1A1A0F] p-8 md:p-12 rounded-[2rem] shadow-2xl z-20 w-[240px] md:w-[320px] -rotate-3 border border-black/5"
          >
            <h3 className="font-['Anton'] text-7xl md:text-8xl mb-2">1M+</h3>
            <p className="font-bold uppercase tracking-widest text-sm text-[#1A1A0F]/60">Active Users</p>
          </motion.div>

          <motion.div 
            animate={{ y: [15, -15, 15] }} 
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute right-[5%] md:right-[20%] bottom-10 bg-[#F5D000] text-[#1A1A0F] p-8 md:p-12 rounded-[2rem] shadow-2xl z-10 w-[220px] md:w-[280px] rotate-6 border border-black/5"
          >
            <div className="flex items-start">
              <h3 className="font-['Anton'] text-7xl md:text-8xl mb-2">99</h3>
              <span className="font-bold text-2xl mt-4 ml-1">%</span>
            </div>
            <p className="font-bold uppercase tracking-widest text-sm text-[#1A1A0F]/60">SLA Uptime</p>
          </motion.div>

        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Features Minimal Section
// ─────────────────────────────────────────────────────────────
function FeaturesSection() {
  return (
    <section className="w-full py-24 px-6 md:px-10" style={{ backgroundColor: COLORS.cream }}>
      <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row gap-12">
        
        <div className="w-full md:w-[55%] flex flex-col pr-0 md:pr-10">
          <div className="flex items-center gap-4 mb-8">
            <Sparkles className="w-10 h-10" style={{ color: COLORS.orange }} />
            <span className="font-bold uppercase tracking-widest text-sm text-[#1A1A0F]">Experience</span>
          </div>
          
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#1A1A0F] leading-[1.1] mb-8 tracking-tight">
            Connecting People with Cutting-Edge Technology
          </h2>
          
          <p className="text-lg md:text-xl text-[#1A1A0F]/70 leading-relaxed font-medium">
            Drift utilizes WebRTC for unbeatably low latency peer-to-peer connections. There is no middleman servers storing your video or audio, resulting in a perfectly private, seamless matching experience.
          </p>
        </div>

        <div className="w-full md:w-[45%]">
          {/* Empty space for design balance as per reference */}
        </div>
        
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Highlights Rows Section
// ─────────────────────────────────────────────────────────────
function HighlightsSection() {
  const rows = [
    { title: "PRIVACY FIRST", desc: "No data logging policy", actionText: "Secure →" },
    { title: "LIVE EVENTS", desc: "Join global anonymous rooms", actionText: "Explore →" },
    { title: "NEWSLETTER", desc: "Get updates on new features", isInput: true }
  ];

  return (
    <section id="features" className="w-full py-24 px-6 md:px-10" style={{ backgroundColor: COLORS.dark }}>
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col">
          {rows.map((row, idx) => (
            <div 
              key={idx} 
              className="group flex flex-col md:flex-row items-start md:items-center justify-between py-10 border-b border-white/10 hover:bg-white/[0.02] hover:border-l-4 hover:border-l-[#F4600C] transition-all px-0 hover:px-6 cursor-pointer"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-16 w-full md:w-auto mb-6 md:mb-0">
                <h3 className="font-['Anton'] text-4xl md:text-6xl text-[#F5F0E8] uppercase tracking-wide group-hover:text-[#F4600C] transition-colors">{row.title}</h3>
                <span className="text-[#F5F0E8]/50 text-lg font-medium">{row.desc}</span>
              </div>
              
              {row.isInput ? (
                <div className="relative w-full md:w-[320px]">
                  <input 
                    type="email" 
                    placeholder="Enter email..." 
                    className="w-full bg-transparent border border-white/20 rounded-full py-4 pl-6 pr-14 text-[#F5F0E8] placeholder:text-white/30 outline-none focus:border-[#F4600C] transition-colors"
                  />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#F5F0E8] rounded-full flex items-center justify-center hover:bg-[#F4600C] transition-colors group/btn">
                    <Send className="w-4 h-4 text-[#1A1A0F] group-hover/btn:text-white" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[#F4600C] font-bold uppercase tracking-widest text-sm opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300">
                  {row.actionText}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="w-full py-12 px-6 md:px-10 border-t border-white/5" style={{ backgroundColor: COLORS.dark }}>
      <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="font-['Anton'] text-[24px] uppercase tracking-wide text-[#F5F0E8]">
          drift
        </div>
        
        <nav className="flex items-center gap-6">
          {["Terms", "Privacy", "Contact", "Twitter"].map((link) => (
            <a key={link} href="#" className="text-white/40 hover:text-[#F4600C] text-xs font-bold uppercase tracking-widest transition-colors">
              {link}
            </a>
          ))}
        </nav>
        
        <div className="text-white/20 text-xs font-medium">
          © 2024 DRIFT INC. ALL RIGHTS RESERVED.
        </div>
      </div>
    </footer>
  )
}

// ─────────────────────────────────────────────────────────────
// Main LandingPage Component
// ─────────────────────────────────────────────────────────────
export default function LandingPage({ onStartDrifting, onCreateRoom, onViewMap, isLoading }) {
  // We apply global typography via container class text styling
  return (
    <div className="w-full min-h-screen font-sans selection:bg-[#F4600C] selection:text-[#F5F0E8] scroll-smooth origin-top">
      <Navbar />
      <Hero onStartDrifting={onStartDrifting} onCreateRoom={onCreateRoom} onViewMap={onViewMap} isLoading={isLoading} />
      <WhySection />
      <StatsSection />
      <FeaturesSection />
      <HighlightsSection />
      <Footer />
    </div>
  )
}
