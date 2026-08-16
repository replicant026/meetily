'use client';

import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MessageSquare, Send, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ meetingId: string; meetingTitle: string; snippet: string }>;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('chat');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    const userMessage: Message = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await invoke<{
        answer: string;
        sources: Array<{ meetingId: string; meetingTitle: string; snippet: string }>;
      }>('chat_about_meetings', {
        question,
        history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.answer,
          sources: response.sources,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${e}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex h-[70vh] w-full max-w-2xl flex-col rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgb(var(--app-border))] px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[rgb(var(--app-muted-fg))]" />
            <span className="text-sm font-medium text-[rgb(var(--app-fg))]">{t('title')}</span>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[rgb(var(--app-muted))]">
            <X className="h-4 w-4 text-[rgb(var(--app-muted-fg))]" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-[rgb(var(--app-muted-fg))]">
              {t('empty')}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-[rgb(var(--app-accent))] text-[rgb(var(--app-accent-fg))]'
                    : 'bg-[rgb(var(--app-muted))]'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 border-t border-[rgb(var(--app-border))] pt-2 text-xs opacity-70">
                    {t('sources')}: {msg.sources.map((s) => s.meetingTitle).join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[rgb(var(--app-border))] p-4 flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder={t('placeholder')}
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={isLoading || !input.trim()} size="sm">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
