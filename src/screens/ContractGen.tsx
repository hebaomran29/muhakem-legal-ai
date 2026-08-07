import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Scale, FileText, Check, Copy, CheckCheck, Download, PenLine,
  ArrowUp, X, GitCompare, AlertCircle, FileDown, MessageCircle, ChevronDown, Send,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useContractChat, type ContractChatMessage } from '../lib/useContractChat';
import {
  type ContractResult, type ContractClause, type ContractChatChangeCard, type SwitchTaskSignal,
  downloadContractDocx,
} from '../lib/api';
import { Badge } from '../components/ui';

/** يزيل تنسيق Markdown من النص */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\d]+[.)]\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** يزيل الإيموجي من النص */
function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

/* ── ChatProps shared type (imported by Memo.tsx) ── */
export type ChatProps = {
  messages: { role: string; text: string }[];
  typing: boolean;
  typingStatus: string;
  onSend: (text: string) => void;
  contextLabel: string | null;
  onClearContext: () => void;
  setContextLabel: (l: string | null) => void;
};

/* ══════════════════════════════════════════════════════════════
   ContractGen — شاشة عرض العقد المُولَّد مع النسخ والتحميل والشات
   ══════════════════════════════════════════════════════════════ */
export function ContractGen({
  contractData,
  jobId,
  initialPrompt,
  embedded = false,
  chatProps,
  onSwitchTask,
}: {
  contractData?: ContractResult | null;
  jobId?: string | null;
  initialPrompt?: string;
  embedded?: boolean;
  chatProps?: ChatProps;
  onSwitchTask?: (signal: SwitchTaskSignal) => void;
}) {
  // sidebarOpen removed — now using floating chat
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeClause, setActiveClause] = useState<number | null>(null);

  /* ── Live clauses: تبتدئ من contractData وبتتحدّت لما الشات يعدّل ── */
  const [liveClauses, setLiveClauses] = useState<ContractClause[]>(contractData?.clauses ?? []);
  const [preamble, setPreamble] = useState(contractData?.preamble ?? '');
  const [closing, setClosing] = useState(contractData?.closing ?? '');
  const [contractTypeAr, setContractTypeAr] = useState(contractData?.contract_type_ar ?? '');

  useEffect(() => {
    if (contractData) {
      setLiveClauses(contractData.clauses ?? []);
      setPreamble(contractData.preamble ?? '');
      setClosing(contractData.closing ?? '');
      setContractTypeAr(contractData.contract_type_ar ?? '');
    }
  }, [contractData]);

  const handleClausesUpdate = useCallback((updated: ContractClause[]) => {
    setLiveClauses(updated);
  }, []);

  const contractChat = useContractChat(jobId ?? null, handleClausesUpdate, onSwitchTask);
  const { context, setContextLabel, clearContext } = contractChat;



  /* ── Copy full contract text ── */
  const fullText = useRef('');
  fullText.current = [
    preamble,
    ...liveClauses.map((c) => `البند ${c.index} — ${c.title}: ${c.body}`),
    closing,
  ].filter(Boolean).join('\n\n');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullText.current);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = fullText.current;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  /* ── Download docx (from backend or fallback) ── */
  const handleDownload = useCallback(() => {
    // لو فيه jobId والباك شغال، نحاول نحمّل من الباك
    if (jobId) {
      setDownloading(true);
      try {
        downloadContractDocx(jobId);
        setTimeout(() => setDownloading(false), 3000);
        return;
      } catch {
        // fallback لتحت
      }
      setDownloading(false);
    }
    // Fallback: نولّد ملف Word من HTML
    const clauseHtml = liveClauses
      .map(
        (c) =>
          `<h2 style="font-family:'Aref Ruqaa Ink','Scheherazade New',serif;font-size:16pt;font-weight:bold;margin-top:20pt;margin-bottom:6pt;color:#1a1a1a;">البند ${c.index} — ${c.title}</h2>
<p style="font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:12pt;line-height:2;text-align:right;color:#2a2a2a;">${cleanMarkdown(c.body).replace(/\n/g, '<br/>')}</p>`,
      )
      .join('\n');

    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'IBM Plex Sans Arabic', 'Cairo', sans-serif; direction: rtl; padding: 40px; }
    h1 { font-family: 'Aref Ruqaa Ink', 'Scheherazade New', serif; text-align: center; font-size: 24pt; }
    .preamble { font-size: 12pt; line-height: 2; text-align: right; margin-bottom: 20pt; }
    .closing { font-size: 11pt; line-height: 2; margin-top: 20pt; }
  </style>
</head>
<body>
  <h1>${contractTypeAr || 'عقد'}</h1>
  ${preamble ? `<div class="preamble">${cleanMarkdown(preamble).replace(/\n/g, '<br/>')}</div>` : ''}
  <hr style="border:none;border-top:1px solid #ddd;margin:16pt 0;"/>
  ${clauseHtml}
  ${closing ? `<div class="closing">${cleanMarkdown(closing).replace(/\n/g, '<br/>')}</div>` : ''}
</body>
</html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contractTypeAr || 'عقد'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [jobId, liveClauses, preamble, closing, contractTypeAr]);

  /* ── Download as text file ── */
  const handleDownloadTxt = useCallback(() => {
    const blob = new Blob([fullText.current], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contractTypeAr || 'عقد'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [contractTypeAr]);

  /* ── Clause validation ── */
  const cv = contractData?.clause_validation;
  const validationComplete = cv?.is_complete ?? false;
  const validationCount = cv ? `${cv.found_count}/${cv.expected_count}` : '';

  return (
    <div className="h-full flex flex-col">
      {/* ═══ Toolbar row ═══ */}
      <div className="no-print flex items-center justify-between px-4 py-2 border-b border-sand-200 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-xl text-[0.76rem] font-600 transition-all duration-200 shadow-soft',
              copied
                ? 'bg-success-50 border border-success-200 text-success-700'
                : 'bg-white border border-sand-200 text-ink hover:bg-sand-50 hover:border-sand-300',
            )}
          >
            {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'تم النسخ' : 'نسخ النص'}
          </button>

          {/* Download DOCX (hidden if no backend) */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-xl text-[0.76rem] font-600 transition-all duration-200 shadow-soft',
              downloading
                ? 'bg-primary-50 border border-primary-200 text-primary-600'
                : 'bg-ink text-white hover:bg-ink/90',
            )}
          >
            {downloading ? (
              <PenLine className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            تحميل Word
          </button>

          {/* Download TXT */}
          <button
            onClick={handleDownloadTxt}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-white border border-sand-200 text-ink text-[0.76rem] font-600 hover:bg-sand-50 hover:border-sand-300 shadow-soft transition-all duration-200"
          >
            <FileDown className="w-3.5 h-3.5" />
            تحميل نصي
          </button>

          {/* Validation badge */}
          {cv && (
            <Badge tone={validationComplete ? 'gold' : 'warning'} size="sm">
              {validationCount} بند
            </Badge>
          )}
        </div>
      </div>

      {/* ═══ Main content ═══ */}
      <div className="flex-1 flex min-h-0">
        {/* Outline sidebar (right) */}
        <div className="no-print w-[220px] shrink-0 border-l border-sand-200 bg-white/60 overflow-y-auto p-3">
          <div className="flex items-center gap-2 px-2 mb-3 text-[0.62rem] font-700 tracking-[0.18em] text-sand-500 uppercase">
            <FileText className="w-3 h-3" /> بنود العقد
          </div>
          <nav className="space-y-1">
            {liveClauses.map((c) => (
              <button
                key={c.index}
                onClick={() => {
                  setActiveClause(c.index);
                  setContextLabel(c.title);
                  document.getElementById(`clause-${c.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-right transition-colors ${
                  activeClause === c.index
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-sand-600 hover:bg-sand-100'
                }`}
              >
                <span
                  className={`grid place-items-center w-5 h-5 rounded-md text-[0.58rem] font-700 shrink-0 ${
                    activeClause === c.index ? 'bg-primary-500 text-white' : 'bg-sand-100 text-sand-500'
                  }`}
                >
                  {c.index}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[0.78rem] font-600 leading-tight truncate">{c.title}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Document (center) */}
        <div className="print-expand flex-1 min-w-0 overflow-y-auto bg-sand-100">
          <div className="max-w-3xl mx-auto px-6 py-6">
            <div className="print-keep rounded-3xl bg-white border border-sand-200 shadow-card card-sheen overflow-hidden animate-fade-up">
              {/* Paper header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-sand-200 bg-gradient-to-l from-sand-50 to-white">
                <div className="flex items-center gap-2.5">
                  <div className="grid place-items-center w-7 h-7 rounded-lg bg-gold-50 text-gold-600">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[0.78rem] font-700 text-ink leading-tight">
                      {contractTypeAr || 'عقد'}
                    </div>
                    <div className="text-[0.62rem] text-sand-400 leading-tight">
                      {liveClauses.length} بند · مسودة قانونية
                    </div>
                  </div>
                </div>
                <Badge tone="gold" size="sm">مسودة</Badge>
              </div>

              <div className="px-8 md:px-14 py-10">
                {/* Contract header */}
                <div className="text-center mb-8 pb-6 border-b border-sand-200">
                  <div className="text-[0.7rem] font-700 tracking-[0.2em] text-accent-600 uppercase mb-2">
                    بسم الله الرحمن الرحيم
                  </div>
                  <h1 className="font-display font-700 text-ink text-2xl">
                    {contractTypeAr || 'عقد'}
                  </h1>
                </div>

                {/* Preamble */}
                {preamble && (
                  <div className="mb-8 text-[0.92rem] leading-[2.1] text-ink whitespace-pre-wrap text-justify">
                    {preamble}
                  </div>
                )}

                {/* Clauses */}
                <div className="space-y-8">
                  {liveClauses.map((c, i) => (
                    <section
                      key={c.index}
                      id={`clause-${c.index}`}
                      className="scroll-mt-6 animate-fade-up"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary-50 text-primary-600 text-[0.7rem] font-700">
                          {c.index}
                        </span>
                        <h2 className="font-display font-700 text-ink text-lg">{c.title}</h2>
                      </div>
                      <p className="text-[0.92rem] leading-[2.1] text-ink whitespace-pre-wrap text-justify">
                        {cleanMarkdown(c.body)}
                      </p>
                    </section>
                  ))}
                </div>

                {/* Closing / Signature */}
                {closing && (
                  <div className="mt-10 pt-6 border-t border-sand-200">
                    <div className="text-[0.84rem] leading-[2] text-ink whitespace-pre-wrap mb-8">
                      {closing}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Floating Chat ═══ */}
        <FloatingContractChat
          contractChat={contractChat}
          context={context}
          onClearContext={clearContext}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FloatingContractChat — شات عائم لتعديل البنود
   ══════════════════════════════════════════════════════════════ */
function FloatingContractChat({
  contractChat,
  context,
  onClearContext,
}: {
  contractChat: {
    messages: ContractChatMessage[];
    typing: boolean;
    typingStatus: string;
    send: (text: string) => void;
  };
  context: string | null;
  onClearContext: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [diffModal, setDiffModal] = useState<ContractChatChangeCard | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { messages, typing, typingStatus, send } = contractChat;

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, typing, open]);



  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    send(text);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const activePlaceholder = context
    ? `عدّل في «${context}»...`
    : 'اسأل عن العقد أو اطلب تعديلًا...';

  const unreadCount = open ? 0 : messages.filter(m => m.role === 'assistant').length;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="no-print fixed bottom-6 left-6 z-50 flex items-center gap-2.5 rounded-2xl bg-ink text-white px-5 py-3 shadow-lift hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <MessageCircle className="w-4.5 h-4.5" />
          <span className="text-[0.82rem] font-600">مساعد مُحَكِّم</span>
          {unreadCount > 0 && (
            <span className="grid place-items-center w-5 h-5 rounded-full bg-primary-500 text-white text-[0.6rem] font-700 -mr-1">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          className="no-print fixed bottom-6 left-6 z-50 w-[400px] max-h-[520px] rounded-3xl bg-white border border-sand-200 shadow-2xl flex flex-col animate-scale-in origin-bottom-left"
          dir="rtl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-sand-100">
            <div className="flex items-center gap-2.5">
              <div className="grid place-items-center w-8 h-8 rounded-xl bg-primary-500 text-white shadow-soft">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="font-display font-700 text-ink text-[0.82rem] leading-tight">مساعد مُحَكِّم</div>
                <div className="text-[0.62rem] text-sand-400">عدّل بنود العقد</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="grid place-items-center w-7 h-7 rounded-lg text-sand-400 hover:bg-sand-100 hover:text-ink transition-colors">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {context && (
            <div className="px-4 pt-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-100 px-2.5 py-1 text-[0.68rem] font-600 text-primary-600">
                {context}
                <span onClick={onClearContext} className="cursor-pointer hover:text-primary-800 mr-0.5">
                  <X className="w-3 h-3" />
                </span>
              </span>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 max-h-[300px] no-scrollbar">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex animate-msg-in', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {m.role === 'assistant' && (
                  <div className="grid place-items-center w-6 h-6 rounded-full bg-sand-100 text-sand-500 shrink-0 mt-0.5 ml-2">
                    <FileText className="w-3 h-3" />
                  </div>
                )}
                <div className="max-w-[88%] space-y-1.5">
                  <div
                    className={cn(
                      'px-3.5 py-2.5 text-[0.82rem] leading-[1.85] rounded-2xl',
                      m.role === 'user'
                        ? 'bg-primary-500 text-white rounded-br-md'
                        : 'bg-sand-50 border border-sand-200 text-ink rounded-bl-md',
                    )}
                  >
                    {stripEmojis(m.text)}
                  </div>
                  {m.changeCard && (
                    <button
                      onClick={() => setDiffModal(m.changeCard!)}
                      className="w-full flex items-center gap-2 rounded-xl bg-success/5 border border-success/20 px-3 py-2 hover:bg-success/10 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5 text-success" strokeWidth={3} />
                      <span className="text-[0.72rem] font-600 text-ink">تم تعديل {m.changeCard.clause_title}</span>
                      <span className="flex items-center gap-0.5 text-[0.64rem] font-600 text-primary-600 mr-auto">
                        <GitCompare className="w-3 h-3" />
                        مقارنة
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start animate-msg-in">
                <div className="grid place-items-center w-6 h-6 rounded-full bg-sand-100 text-sand-500 shrink-0 mt-0.5 ml-2">
                  <FileText className="w-3 h-3" />
                </div>
                <div className="rounded-2xl rounded-bl-md bg-sand-50 border border-sand-200 px-3.5 py-2.5">
                  <span className="text-[0.78rem] text-sand-500 animate-pulse-soft">
                    {stripEmojis(typingStatus) || 'يفكّر...'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 px-3 pb-3 pt-2">
            <div className="flex items-end gap-2 rounded-2xl bg-sand-50 border border-sand-200 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-500/10 transition-all">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder={activePlaceholder}
                className="flex-1 resize-none bg-transparent outline-none text-ink placeholder:text-sand-400 text-[0.82rem] leading-relaxed py-2.5 px-3 max-h-[100px]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  'shrink-0 grid place-items-center rounded-xl transition-all m-1.5 w-8 h-8',
                  input.trim()
                    ? 'bg-primary-500 text-white shadow-soft hover:bg-primary-600 hover:scale-105'
                    : 'bg-sand-200 text-sand-300 cursor-not-allowed',
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {diffModal && <ContractDiffModal change={diffModal} onClose={() => setDiffModal(null)} />}
    </>
  );
}

/* ── Contract Diff Modal ── */
function ContractDiffModal({ change, onClose }: { change: ContractChatChangeCard; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl bg-white border border-sand-200 shadow-lift animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sand-200">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-primary-50 text-primary-600">
              <GitCompare className="w-4 h-4" />
            </span>
            <div>
              <div className="font-display font-700 text-ink text-[0.9rem]">مقارنة التغيير</div>
              <div className="text-[0.62rem] text-sand-400">{change.clause_title}</div>
            </div>
          </div>
          <button onClick={onClose} className="grid place-items-center w-8 h-8 rounded-lg text-sand-400 hover:bg-sand-100 hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2 text-[0.66rem] font-700 tracking-wide uppercase text-danger">
              <span className="w-2 h-2 rounded-full bg-danger" /> النسخة القديمة
            </div>
            <div className="rounded-2xl bg-danger-50/60 border border-danger-200/60 p-4">
              <p className="text-[0.84rem] leading-[1.95] text-sand-700 whitespace-pre-wrap">{change.old_text}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2 text-[0.66rem] font-700 tracking-wide uppercase text-success">
              <span className="w-2 h-2 rounded-full bg-success" /> النسخة الجديدة
            </div>
            <div className="rounded-2xl bg-success-50/60 border border-success-200/60 p-4">
              <p className="text-[0.84rem] leading-[1.95] text-ink whitespace-pre-wrap">{change.new_text}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-sand-200 px-6 py-4">
          <button onClick={onClose} className="w-full h-11 rounded-2xl bg-sand-100 text-ink font-600 text-sm hover:bg-sand-200 transition-colors">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
