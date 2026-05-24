import React, { useState, useEffect } from 'react';

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  
  // New Mode & Input States
  const [sessionMode, setSessionMode] = useState('Structured Journey');
  const [selectedTopic, setSelectedTopic] = useState('Rust Ownership & Borrowing');
  const [unrestrictedQuery, setUnrestrictedQuery] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [quiz, setQuiz] = useState(null);
  
  // New Payload Rendering States
  const [mindMap, setMindMap] = useState(null);
  const [resources, setResources] = useState(null);
  
  // State profile monitoring blocks
  const [mastery, setMastery] = useState(10);
  const [pace, setPace] = useState(1.0);

  // 1. Keep the UI timestamp perfectly accurate on the clock frame
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleQuizAnswerSubmit = (idx, correct_idx, opt) => {
    if(idx === correct_idx) {
      alert("Correct answer! Mastery metrics scaling up.");
      setMastery(prev => Math.min(100, prev + 10));
    } else {
      alert("Incorrect. Initiating micro-concept breakdown sequence.");
      setMastery(prev => Math.max(0, prev - 5));
    }
  };

  const handleInitializeEngine = async () => {
    if (loading) return;

    // Determine exactly what topic string to ship to the backend
    let finalTopicPayload = "";
    let modeMessageContext = "";

    if (sessionMode === 'Exploratory Deep-Dive') {
      if (!unrestrictedQuery.trim()) {
        alert("Please enter an exploratory query in the text box for Mode B!");
        return;
      }
      finalTopicPayload = unrestrictedQuery.trim();
      modeMessageContext = `Exploratory Query: User wants to deep-dive into an unlisted topic. Completely bypass structured curriculum pathways.`;
    } else {
      finalTopicPayload = selectedTopic;
      modeMessageContext = ""; // Regular structured mode handler
    }

    setLoading(true);
    setQuiz(null);
    setMindMap(null);
    setResources(null);

    // Push the user message into the chat array visually
    const currentInput = finalTopicPayload;
    setMessages(prev => [...prev, { sender: 'user', text: currentInput }]);
    
    // Clear input for the next cycle
    if (sessionMode === 'Exploratory Deep-Dive') {
      setUnrestrictedQuery('');
    }

    try {
      const res = await fetch('http://localhost:8000/api/session/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: finalTopicPayload, // 🎯 PURE STREAM: Passes the raw query directly when in Mode B
          user_message: modeMessageContext,
          current_mastery: mastery,
          current_pace: pace
        })
      });
      const data = await res.json();
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Push the AI's response text into the array
      setMessages(prev => [...prev, { sender: 'agent', text: parsed.lesson_content }]);
      
      // Only show the quiz card if we are tracking a preset structured journey track
      if (parsed.quiz && sessionMode === 'Structured Journey') {
        setQuiz(parsed.quiz);
      } else {
        setQuiz(null); 
      }

      if (parsed.mind_map_nodes) setMindMap(parsed.mind_map_nodes);
      if (parsed.curated_resources) setResources(parsed.curated_resources);
      
      setMastery(prev => Math.min(100, prev + (parsed.mastery_delta || 0)));
      setPace(parsed.pace_adjustment || 1.0);
    } catch (err) {
      console.error("Connection block to local backend engine:", err);
      setMessages(prev => [...prev, { sender: 'agent', text: "Error syncing backend routing parameters. Check terminal logs." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen max-h-screen bg-[#FDFBF7] text-[#0A192F] font-sans flex flex-col overflow-hidden">
      
      {/* HEADER SECTION */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-xs bg-slate-100 hover:bg-[#0A192F] hover:text-white px-3 py-1.5 rounded border border-slate-200 transition-all font-mono uppercase tracking-wider"
          >
            {isSidebarOpen ? '← Hide Settings' : '→ Show Panel'}
          </button>
          <h1 className="text-xl font-bold tracking-tight uppercase font-mono">Cognitive Tutor Engine v2.0</h1>
        </div>
        
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className="bg-emerald-500/10 text-emerald-700 px-3 py-1 rounded-full border border-emerald-300 uppercase font-bold tracking-widest animate-pulse">
            ● Active Live Stream
          </span>
          <span className="text-slate-500 bg-slate-100 px-3 py-1 rounded border border-slate-200 font-medium">
            ⏱️ {currentTime || "Syncing..."}
          </span>
        </div>
      </header>

      {/* CORE FRAME CONTAINER */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        
        {/* MOBILE BACKDROP OVERLAY */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* SIDEBAR PANEL */}
        <div className={`
          fixed inset-y-0 left-0 z-50 transform md:relative md:translate-x-0
          ${isSidebarOpen ? 'translate-x-0 w-80 border-r' : '-translate-x-full w-80 md:w-0 overflow-hidden border-r-0'} 
          bg-white border-slate-200 transition-all duration-300 flex flex-col justify-between p-5 overflow-y-auto shrink-0
        `}>
          <div className="space-y-6 min-w-[280px]">
            
            {/* MODE TOGGLE */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Session Mode</label>
              <div className="flex bg-slate-100 rounded p-1 border border-slate-200">
                <button 
                  onClick={() => setSessionMode('Structured Journey')}
                  className={`flex-1 text-[10px] font-bold uppercase py-2 rounded transition-all ${sessionMode === 'Structured Journey' ? 'bg-white shadow text-[#0A192F]' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Mode A
                </button>
                <button 
                  onClick={() => setSessionMode('Exploratory Deep-Dive')}
                  className={`flex-1 text-[10px] font-bold uppercase py-2 rounded transition-all ${sessionMode === 'Exploratory Deep-Dive' ? 'bg-[#0A192F] shadow text-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Mode B
                </button>
              </div>
              <p className="text-[9px] text-slate-400 mt-1 font-mono text-center uppercase">{sessionMode}</p>
            </div>

            {sessionMode === 'Structured Journey' && (
              <div className="animate-fade-in">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Target Topic</label>
                <select 
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="w-full bg-[#FDFBF7] border border-slate-300 rounded p-2.5 text-sm font-medium focus:outline-none focus:border-[#0A192F]"
                >
                  <option value="Rust Ownership & Borrowing">Rust Ownership & Borrowing</option>
                  <option value="Docker Network Namespace Internals">Docker Network Namespace Internals</option>
                  <option value="Asynchronous Event Loops in JS">Asynchronous Event Loops in JS</option>
                  <option value="Vector DB & Cosine Similarity">Vector DB & Cosine Similarity</option>
                </select>
              </div>
            )}

            {/* PERFORMANCE METRICS CONTAINER */}
            <div className="border border-slate-200 rounded-xl p-4 bg-[#FDFBF7] space-y-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-2">Live Session Variables</h3>
              
              {/* Mastery Meter */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span>Comprehension</span>
                  <span className="text-indigo-600">{mastery}%</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#0A192F] h-full transition-all duration-500" style={{ width: `${mastery}%` }}></div>
                </div>
              </div>

              {/* Pace Meter */}
              <div className="pt-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span>Pace Coefficient</span>
                  <span className="text-emerald-600">{pace}x</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight mt-1">Adaptive model scaling speed modifier.</p>
              </div>
            </div>
          </div>

          <button 
            onClick={handleInitializeEngine}
            disabled={loading || (sessionMode === 'Exploratory Deep-Dive' && !unrestrictedQuery.trim())}
            className="w-full bg-[#0A192F] text-white font-bold py-3 px-4 rounded shadow hover:bg-slate-800 active:scale-[0.98] transition-all tracking-wider text-xs uppercase font-mono mt-6 disabled:opacity-50"
          >
            {loading ? 'Processing State...' : 'Initialize Tutor Engine'}
          </button>
        </div>

        {/* COMPLETELY RE-ENGINEERED SCROLLABLE CHAT MESSAGE TERMINAL */}
        <main className="flex-1 bg-[#FDFBF7] flex flex-col overflow-hidden relative w-full">
          
          {/* CHAT BUBBLE STREAM CONTAINER */}
          <div className="flex-1 overflow-y-auto w-full p-4 md:p-6 flex flex-col items-center">
            <div className="max-w-4xl w-full space-y-4 flex flex-col">
            {messages && messages.length > 0 ? (
              messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`max-w-2xl p-4 rounded-xl shadow-sm border transition-all ${
                    msg.sender === 'user' 
                      ? 'bg-slate-100 border-slate-200 ml-auto text-right text-[#0A192F] font-medium' 
                      : 'bg-white border-slate-200 mr-auto text-left text-slate-800'
                  }`}
                >
                  {/* Sender Identity Header */}
                  <span className="block text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">
                    {msg.sender === 'user' ? '// User Query' : '// Cognitive Agent'}
                  </span>
                  
                  {/* Main Content Body */}
                  <div className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.sender === 'agent' ? 'font-serif' : 'font-sans'}`}>
                    {msg.text}
                  </div>

                  {/* Render optional Mind Map and Resources ONLY on the latest agent message if applicable */}
                  {msg.sender === 'agent' && index === messages.length - 1 && (
                    <div className="mt-4 space-y-4">
                      {/* MIND MAP HIERARCHY */}
                      {mindMap && mindMap.length > 0 && (
                        <div className="bg-slate-50 border border-slate-200 rounded p-4 animate-fade-in">
                          <h2 className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest mb-3">Structural Mind-Map Hierarchy</h2>
                          <div className="flex flex-wrap items-center gap-2">
                            {mindMap.map((node, i) => (
                              <React.Fragment key={i}>
                                <div className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded text-xs font-medium">
                                  {node}
                                </div>
                                {i < mindMap.length - 1 && <div className="text-slate-300 font-bold text-xs">→</div>}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CURATED RESOURCES */}
                      {resources && resources.length > 0 && (
                        <div className="bg-slate-50 border border-emerald-100 rounded p-4 animate-fade-in">
                          <h2 className="text-[10px] font-bold font-mono text-emerald-600 uppercase tracking-widest mb-3">Curated Resources & Deep Dives</h2>
                          <div className="flex flex-col gap-2">
                            {resources.map((res, i) => (
                              <a key={i} href={res.url} target="_blank" rel="noreferrer" className="block border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm p-3 rounded transition-all group">
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-xs font-bold text-[#0A192F] group-hover:text-emerald-800">{res.title}</span>
                                  <span className="text-[8px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase font-bold">{res.type}</span>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              /* IDLE BASEBOARD */
              <div className="my-auto text-center max-w-md mx-auto space-y-4 pt-20">
                <div className="w-12 h-12 rounded-full border-2 border-[#0A192F] flex items-center justify-center mx-auto text-xl font-bold font-mono">Ω</div>
                <h2 className="text-xl font-bold font-mono tracking-tight text-[#0A192F]">Awaiting Engine Injection</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Select an optimization vector from the config panel or switch to Mode B to start a dynamic learning thread.
                </p>
              </div>
            )}

            {/* STATICALLY POSITIONED CURATED COMPONENT ROW (Appends under chat context) */}
            {quiz && sessionMode === 'Structured Journey' && (
              <div className="bg-white border-2 border-[#0A192F] rounded-xl p-6 shadow-md max-w-2xl mr-auto w-full animate-fade-in">
                <span className="bg-[#0A192F] text-white text-[10px] font-mono px-2.5 py-1 rounded uppercase tracking-wider font-bold">
                  Concept Challenge Verification
                </span>
                <h3 className="text-lg font-bold mt-4 mb-4 text-[#0A192F]">{quiz.question}</h3>
                <div className="space-y-2.5">
                  {quiz.options.map((opt, idx) => (
                    <button 
                      key={idx}
                      onClick={() => handleQuizAnswerSubmit(idx, quiz.correct_option_index, opt)}
                      className="w-full text-left bg-[#FDFBF7] hover:bg-slate-50 border border-slate-200 hover:border-[#0A192F] p-3.5 rounded text-sm transition-all font-medium flex items-center gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs border font-mono font-bold">{idx + 1}</span>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* SCROLL ANCHOR PADDING */}
            <div className="h-4 shrink-0" />
            </div>
          </div>

          {/* FLOATING OMNI-CONTAINER CHAT STRIP (Now Sticky) */}
          <div className="sticky bottom-0 w-full bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7] to-transparent pt-4 pb-4 px-4 md:px-6 z-30 flex justify-center shrink-0">
            <div className="max-w-4xl w-full bg-white border-2 border-[#0A192F] rounded-xl p-3 shadow-lg flex items-center gap-3">
              <input 
                type="file" 
                id="image-upload" 
                className="hidden" 
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const fileName = e.target.files[0].name;
                    setUnrestrictedQuery(prev => prev + (prev ? " " : "") + `[Attached Image Context: ${fileName}]`);
                    if(sessionMode !== 'Exploratory Deep-Dive') {
                      setSessionMode('Exploratory Deep-Dive');
                    }
                    e.target.value = null;
                  }
                }}
              />
              <button 
                onClick={() => document.getElementById('image-upload').click()}
                title="Attach Image"
                className="w-10 h-10 bg-slate-100 hover:bg-[#0A192F] hover:text-white rounded-lg flex items-center justify-center border border-slate-200 text-lg font-bold transition-all shrink-0"
              >
                +
              </button>
              <input 
                type="text"
                value={unrestrictedQuery}
                onChange={(e) => {
                  setUnrestrictedQuery(e.target.value);
                  // Auto-switch to Mode B if user types here
                  if(sessionMode !== 'Exploratory Deep-Dive') {
                    setSessionMode('Exploratory Deep-Dive');
                  }
                }}
                placeholder="Type an exploratory topic or follow-up query..."
                className="flex-1 text-sm bg-transparent px-2 py-3 focus:outline-none font-medium text-[#0A192F]"
                onKeyDown={(e) => { if(e.key === 'Enter') handleInitializeEngine(); }}
              />
              <button 
                onClick={handleInitializeEngine}
                disabled={loading}
                className="bg-[#0A192F] text-white font-mono text-xs uppercase font-bold tracking-wider px-5 py-3 rounded-lg transition-all disabled:opacity-50 shrink-0"
              >
                Send
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center text-[10px] font-mono text-slate-400 z-10 shrink-0">
        <div>BUILT SOLO BY JAYMIN // APL RAJKOT 2026</div>
        <div>ENGINE FRAME STABLE</div>
      </footer>
    </div>
  );
}

export default App;
