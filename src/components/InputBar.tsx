import { useState, useRef } from 'react';
import { Paperclip, ArrowUp, Mic } from 'lucide-react';
import { cn } from '../lib/cn';

export function InputBar({
  onSend,
  onUpload,
  size = 'sm',
  autoFocus,
  placeholder = 'اكتب طلبك القانوني...',
  compact = false,
}: {
  onSend: (text: string) => void;
  onUpload?: () => void;
  size?: 'sm' | 'md';
  autoFocus?: boolean;
  placeholder?: string;
  compact?: boolean;
}) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  const send = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
    if (taRef.current) {
      taRef.current.style.height = 'auto';
    }
  };

  return (
    <div
      className={cn(
        'flex items-end gap-2 bg-white border border-sand-200 shadow-card focus-within:border-primary-300 focus-within:shadow-lift transition-all duration-200 ease-out-expo',
        compact ? 'rounded-2xl px-3 py-1.5' : 'rounded-3xl',
        size === 'md' ? 'px-4 py-3' : !compact ? 'px-3 py-2.5' : '',
      )}
    >
      <button
        onClick={onUpload}
        className={cn(
          'grid place-items-center rounded-xl text-sand-500 hover:bg-sand-100 hover:text-ink transition-all duration-200 ease-out-expo shrink-0',
          compact ? 'w-8 h-8' : 'w-9 h-9',
        )}
        title="رفع ملف"
      >
        <Paperclip className="w-4 h-4" />
      </button>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          autoResize(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
            e.preventDefault();
            send();
          }
        }}
        autoFocus={autoFocus}
        rows={1}
        placeholder={placeholder}
        className={cn(
          'flex-1 resize-none bg-transparent outline-none text-ink placeholder:text-sand-400 leading-relaxed',
          size === 'md' ? 'text-[0.88rem] py-2' : compact ? 'text-[0.82rem] py-1' : 'text-[0.82rem] py-1.5',
        )}
      />
      <button
        className={cn(
          'grid place-items-center rounded-xl text-sand-500 hover:bg-sand-100 hover:text-ink transition-all duration-200 ease-out-expo shrink-0',
          compact ? 'w-8 h-8' : 'w-9 h-9',
        )}
        title="إملاء صوتي"
      >
        <Mic className="w-4 h-4" />
      </button>
      <button
        onClick={send}
        disabled={!value.trim()}
        className={cn(
          'shrink-0 grid place-items-center rounded-xl transition-all duration-200 ease-out-expo active:scale-95',
          compact ? 'w-8 h-8' : 'w-9 h-9',
          value.trim()
            ? 'bg-gradient-to-b from-primary-500 to-primary-600 text-white shadow-soft hover:shadow-card hover:scale-105'
            : 'bg-sand-200 text-sand-400 cursor-not-allowed',
        )}
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
}
