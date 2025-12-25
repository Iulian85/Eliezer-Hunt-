
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, X, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { askGeminiProxy } from '../services/firebase';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const AIChat: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Sistemele ELZR active. Hunter, datele tale sunt securizate pe nodul central. Cu ce te pot ajuta?' }
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
      // SECURITY: Nu mai inițializăm SDK-ul aici. Trimitem istoricul la Backend Proxy.
      const result = await askGeminiProxy(updatedMessages);
      setMessages(prev => [...prev, { role: 'model', text: result.text }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'model', text: 'Eroare de criptare terminal. Nodul central este ocupat.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pb-28 pt-4 sm:pb-4">
      <div className="bg-slate-900 border border-cyan-500/30 w-full max-w-md h-[65vh] rounded-3xl flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden">
        <div className="p-4 bg-slate-800/50 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/40">
              <Bot className="text-cyan-400" size={24} />
            </div>
            <div>
              <h3 className="text-white font-bold text-xs uppercase tracking-tight">ELZR SECURE PROXY</h3>
              <span className="text-[8px] text-green-400 font-bold uppercase">Encrypted Session</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400"><X size={20} /></button>
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
                <span className="text-[10px] text-slate-400 font-bold uppercase animate-pulse">Processing...</span>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 bg-slate-800/30 border-t border-white/5">
          <div className="flex gap-2 bg-slate-950 border border-slate-700 rounded-xl p-1.5 focus-within:border-cyan-500">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask Scout..." className="flex-1 bg-transparent border-none outline-none text-white text-xs px-2" />
            <button onClick={handleSend} disabled={isTyping || !input.trim()} className="bg-cyan-600 text-white p-2 rounded-lg"><Send size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
