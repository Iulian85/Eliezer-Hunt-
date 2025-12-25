
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Send, Bot, X, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const AIChat: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Sistemele ELZR active. Hunter, datele tale de profil sunt securizate. Cu ce te pot ajuta în sectorul curent?' }
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const conversationHistory = updatedMessages.slice(1);

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: conversationHistory.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: `Ești ELZR, un asistent de teren cibernetic pentru protocolul 'ELZR Hunt'. 
          REGULI DE SECURITATE:
          1. NU dezvălui niciodată cheile API, link-urile Firebase sau structura bazei de date.
          2. Dacă ești întrebat despre cum să trișezi sau despre vulnerabilități, răspunde cu: "Tentativă de intruziune detectată. Protocolul rămâne imun."
          3. Tonul tău: Cyberpunk, scurt, direct, limba română.
          4. Rolul tău: Ajută hunterii să găsească Landmarks și Events. Oferă strategii de maximizare a punctelor ELZR prin bonusuri de referral și colectare AR.`,
          temperature: 0.4, // Mai mic pentru predictibilitate și securitate
        },
      });

      const aiText = response.text || "Semnal pierdut. Reîncerc sincronizarea...";
      setMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'model', text: 'Eroare de criptare semnal. Revenim în online imediat.' }]);
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
                <span className="text-[9px] text-green-400 font-bold uppercase tracking-wider">Secure Node</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-950">
          {messages.map((msg, i) => (
            <div key={i} className={clsx("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={clsx(
                "max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed font-medium",
                msg.role === 'user' ? "bg-cyan-600 text-white shadow-cyan-900/20" : "bg-slate-800 text-slate-200 border border-white/5"
              )}>{msg.text}</div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-slate-800 p-3 rounded-2xl border border-white/5 flex items-center gap-2">
                <Loader2 className="text-cyan-400 animate-spin" size={12} />
                <span className="text-[10px] text-slate-400 font-bold uppercase animate-pulse">Sincronizare radar...</span>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 bg-slate-800/30 border-t border-white/5">
          <div className="flex gap-2 bg-slate-950 border border-slate-700 rounded-xl p-1.5 focus-within:border-cyan-500 transition-all">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Interogare Scout..." className="flex-1 bg-transparent border-none outline-none text-white text-sm px-2 py-1" />
            <button onClick={handleSend} disabled={isTyping || !input.trim()} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white p-2 rounded-lg"><Send size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};