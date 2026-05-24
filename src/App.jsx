import React, { useState, useEffect, useRef } from 'react'

const API_BASE = 'http://127.0.0.1:8000'

export default function App() {
  const [topic, setTopic] = useState('React Hooks and State Management')
  const [sessionId, setSessionId] = useState(null)
  const [session, setSession] = useState(null)
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const chatEndRef = useRef(null)

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.history])

  // Start new session
  const startSession = async (customTopic) => {
    setLoading(true)
    setError(null)
    const targetTopic = customTopic || topic
    try {
      const response = await fetch(`${API_BASE}/api/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: targetTopic }),
      })
      if (!response.ok) throw new Error('Failed to start session. Is the backend server running?')
      const data = await response.json()
      setSession(data)
      setSessionId(data.session_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Send message to session
  const sendMessage = async (messageText) => {
    if (!messageText.trim() || !sessionId) return
    setLoading(true)
    setError(null)
    setInputMessage('')
    try {
      const response = await fetch(`${API_BASE}/api/session/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: messageText }),
      })
      if (!response.ok) throw new Error('Error sending message.')
      const data = await response.json()
      setSession(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Submit quiz choice
  const submitQuizChoice = async (optionId, optionText) => {
    const message = `[Selected Option ${optionId}]: ${optionText}`
    await sendMessage(message)
  }

  // Reset Session
  const resetSession = async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/api/session/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      if (!response.ok) throw new Error('Error resetting session.')
      const data = await response.json()
      setSession(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const masteryScore = session?.profile?.mastery_score || 0
  const paceCoefficient = session?.profile?.pace_coefficient || 1.0
  const exploredConcepts = session?.profile?.explored_concepts || []
  const knowledgeGaps = session?.profile?.knowledge_gaps || []
  const activeQuiz = session?.active_quiz || null

  // Circular progress calculations
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (masteryScore / 100) * circumference

  return (
    <div className="min-h-screen bg-brand-bg text-brand-navy flex flex-col font-sans selection:bg-brand-navy selection:text-brand-bg">
      {/* HEADER SECTION */}
      <header className="border-b border-brand-border px-8 py-5 flex items-center justify-between sticky top-0 bg-brand-bg/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <div className="border-2 border-brand-border px-3 py-1 font-mono text-sm uppercase tracking-wider font-bold bg-brand-navy text-brand-bg">
            Cognitive Tutor
          </div>
          {sessionId && (
            <div className="hidden md:flex items-center gap-2 text-xs font-mono text-brand-slate opacity-70">
              <span>ID: {sessionId.substring(0, 8)}...</span>
            </div>
          )}
        </div>

        {/* ACTIVE AGENT PROCESSING STATUS CHIPS */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="flex items-center gap-2 bg-brand-cream border border-brand-border px-3 py-1 text-xs font-mono rounded">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-gold animate-ping"></span>
              <span className="font-semibold uppercase tracking-wider text-brand-slate">CRITIQUING & ADAPTING</span>
            </div>
          ) : activeQuiz ? (
            <div className="flex items-center gap-2 bg-brand-cream border border-brand-border px-3 py-1 text-xs font-mono rounded">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-crimson animate-pulse"></span>
              <span className="font-semibold uppercase tracking-wider text-brand-slate">EVALUATING: QUIZ ACTIVE</span>
            </div>
          ) : sessionId ? (
            <div className="flex items-center gap-2 bg-brand-cream border border-brand-border px-3 py-1 text-xs font-mono rounded">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-olive"></span>
              <span className="font-semibold uppercase tracking-wider text-brand-slate">IDLE: WAITING</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-brand-cream border border-brand-border px-3 py-1 text-xs font-mono rounded">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-slate opacity-30"></span>
              <span className="font-semibold uppercase tracking-wider text-brand-slate">OFFLINE</span>
            </div>
          )}
        </div>
      </header>

      {/* ERROR ALERT BOX */}
      {error && (
        <div className="bg-red-50 border-b border-brand-border px-8 py-3 text-sm text-brand-crimson font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold">[ERROR]</span>
            <span>{error}</span>
          </div>
          <button 
            onClick={() => setError(null)} 
            className="text-brand-crimson hover:underline text-xs font-bold uppercase"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* DASHBOARD BODY */}
      <div className="flex-1 flex flex-col lg:flex-row">
        
        {/* LEFT PANEL: PROFILE STATE MONITOR */}
        <aside className="w-full lg:w-96 border-r border-brand-border bg-brand-bg flex flex-col p-8 gap-8 overflow-y-auto">
          <div>
            <h2 className="text-xs uppercase font-mono tracking-widest text-brand-slate/60 mb-4 font-bold">
              Learning Focus
            </h2>
            {!sessionId ? (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter a concept to master..."
                  className="w-full bg-brand-cream border border-brand-border px-4 py-3 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-brand-border"
                />
                <button
                  onClick={() => startSession()}
                  disabled={loading}
                  className="w-full bg-brand-navy hover:bg-brand-slate text-brand-bg font-bold py-3 text-sm tracking-wide uppercase transition duration-150 active:scale-[0.98] disabled:opacity-50"
                >
                  Initialize Tutor Engine
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 border border-brand-border p-4 bg-brand-cream">
                <div className="text-xs font-mono uppercase text-brand-slate/60 font-semibold">Active Topic</div>
                <div className="text-lg font-serif font-bold leading-tight">{session.topic}</div>
                <button
                  onClick={resetSession}
                  disabled={loading}
                  className="mt-2 text-left text-xs font-mono uppercase tracking-wider text-brand-crimson hover:underline font-bold"
                >
                  Reset Session State
                </button>
                <button
                  onClick={() => setSessionId(null)}
                  className="text-left text-xs font-mono uppercase tracking-wider text-brand-slate hover:underline font-bold"
                >
                  Choose Different Topic
                </button>
              </div>
            )}
          </div>

          {/* MASTERY METRIC DIALS */}
          {sessionId && (
            <div className="flex flex-col gap-6">
              <h2 className="text-xs uppercase font-mono tracking-widest text-brand-slate/60 font-bold">
                State Variables
              </h2>
              
              {/* mastery score circular progress dial */}
              <div className="flex items-center gap-6 border border-brand-border p-5 bg-brand-cream">
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      stroke="rgba(30, 41, 59, 0.1)"
                      strokeWidth="6"
                      fill="transparent"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      stroke="var(--color-brand-navy)"
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      className="progress-ring__circle"
                    />
                  </svg>
                  <span className="absolute text-lg font-mono font-bold">{masteryScore}%</span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold font-serif uppercase tracking-tight">Comprehension</div>
                  <p className="text-xs text-brand-slate/80 leading-relaxed mt-1">
                    Mastery index dynamically calculated from response correctness and cognitive depth.
                  </p>
                </div>
              </div>

              {/* pace coefficient */}
              <div className="border border-brand-border p-5 bg-brand-cream flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-serif font-bold">Pace Coefficient</span>
                  <span className="font-mono text-sm font-bold bg-brand-navy text-brand-bg px-2.5 py-0.5">{paceCoefficient}x</span>
                </div>
                <div className="h-1.5 w-full bg-brand-navy/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand-navy transition-all duration-300"
                    style={{ width: `${Math.min(100, (paceCoefficient / 2.0) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-brand-slate/80 leading-relaxed">
                  Speed factor. Values below 1.0 indicate analogical breakdown; above 1.0 escalate technical specification complexity.
                </p>
              </div>

              {/* explored concepts */}
              <div className="border border-brand-border p-5 bg-brand-cream flex flex-col gap-3">
                <div className="text-xs font-mono uppercase tracking-wider text-brand-slate/60 font-bold">
                  Explored Concepts ({exploredConcepts.length})
                </div>
                {exploredConcepts.length === 0 ? (
                  <div className="text-xs font-mono text-brand-slate italic opacity-60">No concepts fully explored yet.</div>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {exploredConcepts.map((concept, index) => (
                      <li key={index} className="bg-brand-olive/10 border border-brand-olive text-brand-olive text-xs font-mono px-2 py-1 rounded flex items-center gap-1.5 font-bold">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        {concept}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* knowledge gaps */}
              <div className="border border-brand-border p-5 bg-brand-cream flex flex-col gap-3">
                <div className="text-xs font-mono uppercase tracking-wider text-brand-slate/60 font-bold">
                  Active Knowledge Gaps ({knowledgeGaps.length})
                </div>
                {knowledgeGaps.length === 0 ? (
                  <div className="text-xs font-mono text-brand-slate italic opacity-60">Zero detected gaps. Superb!</div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {knowledgeGaps.map((gap, index) => (
                      <li key={index} className="bg-brand-crimson/10 border border-brand-crimson text-brand-crimson text-xs font-mono px-3 py-1.5 rounded flex items-center gap-2 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-crimson animate-pulse"></span>
                        {gap}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </div>
          )}
        </aside>

        {/* RIGHT MAIN PANEL: INTERACTIVE LEARNING TERMINAL */}
        <main className="flex-1 flex flex-col bg-brand-bg relative min-h-[500px]">
          {!sessionId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-brand-bg">
              <div className="max-w-md flex flex-col items-center gap-6">
                <div className="w-16 h-16 border-2 border-brand-navy rounded-full flex items-center justify-center text-3xl font-serif italic text-brand-navy bg-brand-cream font-bold">
                  Ω
                </div>
                <div className="flex flex-col gap-2">
                  <h1 className="text-2xl font-serif font-bold tracking-tight">Autonomous Cognitive Tutor</h1>
                  <p className="text-sm text-brand-slate/85 leading-relaxed font-sans">
                    An advanced learning framework powered by adaptive agentic cycles. Select a concept, test your understanding, and let the loop customize the complexity dynamically.
                  </p>
                </div>
                <div className="w-full flex flex-col gap-2.5">
                  <label className="text-xs font-mono uppercase tracking-widest text-brand-slate/70 text-left font-semibold">Suggested Masterclass Topics</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'Rust Ownership & Borrowing',
                      'Docker Network Namespace Internals',
                      'Asynchronous Event Loops in JS',
                      'Vector DB & Cosine Similarity'
                    ].map((topicName) => (
                      <button
                        key={topicName}
                        onClick={() => {
                          setTopic(topicName)
                          startSession(topicName)
                        }}
                        className="text-left border border-brand-border px-3.5 py-3 text-xs font-mono bg-brand-cream hover:bg-brand-navy hover:text-brand-bg transition duration-150 font-semibold"
                      >
                        {topicName}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full max-h-[calc(100vh-140px)] overflow-hidden">
              
              {/* CHAT CHRONOLOGY LOG */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {session.history.map((msg, index) => {
                  const isModel = msg.role === 'model'
                  const isUser = msg.role === 'user'

                  if (isUser) {
                    return (
                      <div key={index} className="flex justify-end animate-fade-in">
                        <div className="max-w-[80%] bg-brand-navy text-brand-bg px-5 py-3.5 border border-brand-navy font-mono text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      </div>
                    )
                  }

                  // Customize rendering style of tutor's replies
                  const style = msg.presentation_style || 'STANDARD'
                  
                  return (
                    <div key={index} className="flex justify-start animate-fade-in">
                      <div className={`max-w-[90%] border border-brand-border p-6 flex flex-col gap-3 relative
                        ${style === 'ANALOGY' ? 'bg-brand-cream/60 border-l-4 border-l-brand-gold' : ''}
                        ${style === 'TECHNICAL' ? 'bg-brand-cream/30 border-l-4 border-l-brand-slate font-mono text-sm' : 'font-sans'}
                        ${style === 'STANDARD' ? 'bg-brand-cream/10' : ''}
                      `}>
                        
                        {/* STYLE INDICATOR BADGES */}
                        <div className="absolute -top-2.5 left-4 px-2 py-0.5 border border-brand-border bg-brand-bg text-[10px] font-mono tracking-widest font-bold uppercase rounded text-brand-slate">
                          {style} PRESENTATION
                        </div>

                        {/* MARKDOWN MESSAGE */}
                        <div className="text-sm leading-relaxed whitespace-pre-wrap mt-2 font-serif text-brand-navy">
                          {msg.content}
                        </div>

                        {/* TIMESTAMP */}
                        <div className="text-[10px] font-mono text-brand-slate/60 self-end mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* ACTIVE QUIZ CHALLENGE BOX */}
                {activeQuiz && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="max-w-[90%] border-2 border-brand-border bg-brand-cream/80 p-6 flex flex-col gap-5 w-full">
                      <div className="flex items-center gap-2">
                        <div className="bg-brand-navy text-brand-bg text-[10px] font-mono uppercase px-2 py-0.5 font-bold">
                          Concept Challenge Verification
                        </div>
                      </div>
                      
                      <div className="font-serif text-base font-bold text-brand-navy leading-tight">
                        {activeQuiz.question}
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {activeQuiz.options.map((opt) => (
                          <button
                            key={opt.id}
                            disabled={loading}
                            onClick={() => submitQuizChoice(opt.id, opt.text)}
                            className="text-left border border-brand-border hover:border-brand-navy p-3.5 bg-brand-bg hover:bg-brand-cream transition duration-150 flex items-start gap-3 disabled:opacity-50 group"
                          >
                            <span className="font-mono bg-brand-cream group-hover:bg-brand-navy group-hover:text-brand-bg border border-brand-border w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                              {opt.id}
                            </span>
                            <span className="text-xs font-sans mt-0.5 text-brand-navy/90">{opt.text}</span>
                          </button>
                        ))}
                      </div>
                      
                      <p className="text-[11px] font-mono text-brand-slate/75 italic">
                        Select an option to test your understanding. Immediate feedback will modify your Comprehension Mastery index.
                      </p>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="flex justify-start">
                    <div className="border border-dashed border-brand-border bg-brand-cream/30 p-5 flex items-center gap-3 font-mono text-xs text-brand-slate/80">
                      <span className="w-2 h-2 rounded-full bg-brand-gold animate-ping"></span>
                      <span>Critiquing responses, mutating cognitive profiles, adapting explanation tree...</span>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* INTERACTIVE FORM ACTIONS / SCAFFOLDING */}
              <div className="border-t border-brand-border p-6 bg-brand-bg flex flex-col gap-4">
                
                {/* SCAFFOLD QUICK ACTIONS */}
                {!activeQuiz && !loading && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => sendMessage("Break this down using an analogy")}
                      className="border border-brand-border hover:bg-brand-cream text-brand-navy font-mono text-[11px] px-3 py-1.5 rounded transition duration-150 font-bold"
                    >
                      💡 Request Analogy
                    </button>
                    <button
                      onClick={() => sendMessage("Explain this with technical code specifications and APIs")}
                      className="border border-brand-border hover:bg-brand-cream text-brand-navy font-mono text-[11px] px-3 py-1.5 rounded transition duration-150 font-bold"
                    >
                      ⚙️ Technical Spec Deep-Dive
                    </button>
                    <button
                      onClick={() => sendMessage("Verify my understanding with a quiz challenge")}
                      className="border border-brand-border hover:bg-brand-cream text-brand-navy font-mono text-[11px] px-3 py-1.5 rounded transition duration-150 font-bold"
                    >
                      🎯 Take Verification Challenge
                    </button>
                  </div>
                )}

                {/* TEXT MESSAGE FORM */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    sendMessage(inputMessage)
                  }}
                  className="flex gap-3"
                >
                  <input
                    type="text"
                    disabled={loading || activeQuiz !== null}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={
                      activeQuiz 
                        ? "Please select a quiz option to proceed..." 
                        : "Type your query or demonstrate your understanding here..."
                    }
                    className="flex-1 bg-brand-cream border border-brand-border px-4 py-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-border disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="submit"
                    disabled={loading || activeQuiz !== null || !inputMessage.trim()}
                    className="bg-brand-navy hover:bg-brand-slate text-brand-bg font-bold px-6 py-3.5 text-xs font-mono tracking-widest uppercase transition duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    Submit Response
                  </button>
                </form>
              </div>

            </div>
          )}
        </main>

      </div>
    </div>
  )
}
