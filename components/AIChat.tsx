
import React, { useState, useRef, useEffect } from 'react';
// Correct import from @google/genai as per guidelines
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Send, Bot, X, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const AIChat: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Salutare, Hunter! Sunt ELZR, ghidul tău cibernetic. Ai nevoie de ponturi despre unde se ascund monedele rare sau vrei să știi cum funcționează multiplicatorii?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsgText = input.trim();
    setInput('');
    
    const updatedMessages: Message[] = [...messages, { role: 'user', text: userMsgText }];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      // The API key must be obtained exclusively from the environment variable process.env.API_KEY.
      // Always use the named parameter during initialization.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // History management: ensures the contents array follows the turn-based format required by the model.
      // We skip the initial model greeting to ensure context starts with the user message or follows an alternating pattern.
      const conversationHistory = updatedMessages.slice(1);

      // Perform the content generation using gemini-3-flash-preview for general chat tasks.
      // System instructions and other model configs are passed in the config object.
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: conversationHistory.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: "Ești ELZR, un asistent AI scout pentru 'ELZR Hunt'. Răspunde în română. Ton cyberpunk, scurt și direct. Ajută-i cu strategii de colectare monede rare (Landmarks) și evenimente (Events).",
          temperature: 0.7,
        },
      });

      // Extract text output from GenerateContentResponse using the .text property (not a method).
      const aiText = response.text || "Sistemele ELZR sunt ocupate. Revin imediat.";
      setMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error: any) {
      console.error("AI Error:", error);
      // Strictly avoid asking for API keys in the UI as per hard requirements.
      let errorMsg = 'Eroare de conexiune la rețeaua ELZR. Revenim imediat!';
      if (error.message?.includes("Requested entity was not found")) {
          errorMsg = "Configurare AI incompletă. Vă rugăm să contactați suportul.";
      }
      setMessages(prev => [...prev, { role: 'model', text: errorMsg }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pb-28 pt-4 sm:pb-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-cyan-500/30 w-full max-w-md h-[65vh] sm:h-[70vh] rounded-3xl flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden">
        <div className="p-4 bg-slate-800/50 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/40">
              <Bot className="text-cyan-400" size={24} />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm tracking-tight uppercase">ELZR AI SCOUT</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-[9px] text-green-400 font-bold uppercase tracking-wider">Online</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.05),transparent)]">
          {messages.map((msg, i) => (
            <div key={i} className={clsx("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={clsx(
                "max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed shadow-sm font-medium",
                msg.role === 'user' ? "bg-cyan-600 text-white rounded-tr-none shadow-cyan-900/20" : "bg-slate-800 text-slate-200 border border-white/5 rounded-tl-none"
              )}>{msg.text}</div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-white/5 flex items-center gap-2">
                <Loader2 className="text-cyan-400 animate-spin" size={12} />
                <span className="text-[10px] text-slate-400 font-bold uppercase animate-pulse">Analizând radarul...</span>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 bg-slate-800/30 border-t border-white/5">
          <div className="flex gap-2 bg-slate-950 border border-slate-700 rounded-xl p-1.5 focus-within:border-cyan-500 transition-all duration-200">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Întreabă AI Scout..." className="flex-1 bg-transparent border-none outline-none text-white text-sm px-2 py-1" />
            <button onClick={handleSend} disabled={isTyping || !input.trim()} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white p-2 rounded-lg transition-all active:scale-95 shadow-lg shadow-cyan-900/40"><Send size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
