import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Scale, FileText, Check, Loader2, AlertCircle, X, GitCompare, AlertTriangle, MessageCircle, ChevronDown, Send } from 'lucide-react';
import { DocumentToolbar } from '../components/DocumentToolbar';
import { Badge } from '../components/ui';
import { useMemoChat, type MemoChatMessage } from '../lib/useMemoChat';
import { saveMemo, type MemoResult, type CaseMetadata, type MemoSection, type ChatChangeCard, type SwitchTaskSignal } from '../lib/api';
import { cn } from '../lib/cn';
import type { ChatProps } from './ContractGen';

/** يزيل تنسيق Markdown من النص (نجوم، علامات ترقيم)
 * يحذف أيضاً العنوان المكرر في بداية القسم */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
    .replace(/^#{1,6}\s+/gm, '')         // # heading → remove
    .replace(/^[\d]+[.)]\s*/gm, '')      // 1. or 1) at line start → remove
    .replace(/\n{3,}/g, '\n\n')         // 3+ newlines → 2
    .trim();
}

/** يزيل الإيموجي من النص */
function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

export function Memo({
  initialPrompt,
  memoData,
  jobId,
  embedded = false,
  chatProps,
  onSwitchTask,
}: {
  initialPrompt?: string;
  memoData?: MemoResult | null;
  jobId?: string | null;
  embedded?: boolean;
  chatProps?: ChatProps;
  onSwitchTask?: (signal: SwitchTaskSignal) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState('waqai');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [liveSections, setLiveSections] = useState<MemoSection[]>(memoData?.sections ?? []);

  useEffect(() => {
    if (memoData?.sections) {
      setLiveSections(memoData.sections);
    }
  }, [memoData]);

  const handleSectionsUpdate = useCallback((updated: MemoSection[]) => {
    setLiveSections(updated);
  }, []);

  const sections = liveSections;
  const meta: CaseMetadata | undefined = memoData?.case_metadata;
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defendantName = meta?.defendant_name ?? null;
  const charge = meta?.charge ?? null;
  const caseNumber = meta?.case_number ?? null;
  const court = meta?.court ?? null;
  const crimeType = meta?.crime_type ?? null;
  const legalNature = meta?.legal_nature ?? null;
  const lawyerName = meta?.lawyer_name ?? null;
  const lawyerLicense = meta?.lawyer_license ?? null;

  const memoChat = useMemoChat(jobId ?? null, handleSectionsUpdate, onSwitchTask);
  const { context, setContextLabel, clearContext } = memoChat;

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const handleToggleEdit = async () => {
    if (!editing) {
      setEditing(true);
      return;
    }
    const updatedSections: MemoSection[] = sections.map((s) => ({
      id: s.id,
      title: s.title,
      body: sectionRefs.current[s.id]?.innerText ?? s.body,
    }));
    setEditing(false);
    if (!jobId) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      await saveMemo(jobId, updatedSections);
      setSaveState('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 2500);
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'فشل حفظ التعديلات');
    }
  };

  /* ── نسخ المذكرة كلها */
  const handleCopy = useCallback(() => {
    const lines: string[] = [];
    lines.push('مذكرة دفاع');
    if (court) lines.push(`أمام ${court}`);
    if (caseNumber) lines.push(`الدعوى رقم ${caseNumber}`);
    if (defendantName) lines.push(`المتهم: ${defendantName}`);
    if (charge) lines.push(charge);
    lines.push('');
    sections.forEach((s) => {
      lines.push(s.title);
      lines.push('');
      lines.push(cleanMarkdown(s.body));
      lines.push('');
    });
    if (lawyerName) {
      lines.push(`المحامي: ${lawyerName}`);
      if (lawyerLicense) lines.push(`عضو نقابة المحامين · رقم ${lawyerLicense}`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
  }, [sections, court, caseNumber, defendantName, charge, lawyerName, lawyerLicense]);

  /* ── تصدير Word */
  const handleExport = useCallback(() => {
    const sectionHtml = sections
      .map(
        (s) =>
          `<h2 style="font-family:'Aref Ruqaa Ink','Scheherazade New',serif;font-size:18pt;font-weight:bold;margin-top:24pt;margin-bottom:8pt;color:#1a1a1a;">${s.title}</h2>
<p style="font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:12pt;line-height:2;text-align:right;color:#2a2a2a;">${cleanMarkdown(s.body).replace(/\n/g, '<br/>')}</p>`,
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
    .meta { text-align: center; color: #666; font-size: 11pt; margin-bottom: 20pt; }
  </style>
</head>
<body>
  <h1>مذكرة دفاع</h1>
  <div class="meta">
    ${court ? `أمام ${court}<br/>` : ''}
    ${caseNumber ? `الدعوى رقم ${caseNumber}<br/>` : ''}
    ${defendantName ? `المتهم: ${defendantName}` : ''}
  </div>
  <hr style="border:none;border-top:1px solid #ddd;margin:20pt 0;"/>
  ${sectionHtml}
  <hr style="border:none;border-top:1px solid #ddd;margin:20pt 0;"/>
  <p style="font-size:11pt;color:#666;">${lawyerName ? `المحامي: ${lawyerName}` : ''}</p>
</body>
</html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `مذكرة_دفاع${defendantName ? `_${defendantName}` : ''}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sections, court, caseNumber, defendantName, lawyerName]);

  return (
    <div className="h-full flex flex-col">
      {/* ═══ Toolbar row ═══ */}
      <div className="no-print flex items-center justify-between px-4 py-2 border-b border-sand-200 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <DocumentToolbar editing={editing} onToggleEdit={handleToggleEdit} onCopy={handleCopy} onExport={handleExport} />
          {saveState === 'saving' && (
            <div className="flex items-center gap-1.5 text-[0.72rem] font-600 text-primary-700">
              <Loader2 className="w-3 h-3 animate-spin" /> جارٍ الحفظ...
            </div>
          )}
          {saveState === 'saved' && (
            <div className="flex items-center gap-1.5 text-[0.72rem] font-600 text-success">
              <Check className="w-3 h-3" /> تم الحفظ
            </div>
          )}
          {saveState === 'error' && (
            <div className="flex items-center gap-1.5 text-[0.72rem] font-600 text-error">
              <AlertCircle className="w-3 h-3" /> {saveError}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Main content ═══ */}
      <div className="flex-1 flex min-h-0">
        {/* Outline sidebar (right) */}
        <div className="no-print w-[220px] shrink-0 border-l border-sand-200 bg-white/60 overflow-y-auto p-3">
          <div className="flex items-center gap-2 px-2 mb-3 text-[0.62rem] font-700 tracking-[0.18em] text-sand-500 uppercase">
            <Scale className="w-3 h-3" /> هيكل المذكرة
          </div>
          <nav className="space-y-1">
            {sections.map((s, i) => (
              <button
                key={s.id}
                onClick={() => {
                  setActive(s.id);
                  setContextLabel(s.title);
                  document.getElementById(`memo-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-right transition-colors ${
                  active === s.id ? 'bg-primary-50 text-primary-700' : 'text-sand-600 hover:bg-sand-100'
                }`}
              >
                <span
                  className={`grid place-items-center w-5 h-5 rounded-md text-[0.58rem] font-700 shrink-0 ${
                    active === s.id ? 'bg-primary-500 text-white' : 'bg-sand-100 text-sand-500'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[0.78rem] font-600 leading-tight truncate">{s.title}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Document (center) */}
        <div className="print-expand flex-1 min-w-0 overflow-y-auto bg-sand-100">
          <div className="max-w-3xl mx-auto px-6 py-6">
            <div className="print-keep rounded-3xl bg-white border border-sand-200 shadow-card overflow-hidden animate-fade-up">
              <div className="flex items-center justify-between px-6 py-3 border-b border-sand-200 bg-gradient-to-l from-sand-50 to-white">
                <div className="flex items-center gap-2.5">
                  <div className="grid place-items-center w-7 h-7 rounded-lg bg-gold-50 text-gold-600">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[0.78rem] font-700 text-ink leading-tight">
                      مذكرة دفاع{defendantName ? ` — ${defendantName}` : ''}
                    </div>
                    <div className="text-[0.62rem] text-sand-400 leading-tight">{sections.length} أقسام · مسودة قانونية</div>
                  </div>
                </div>
                <Badge tone="gold" size="sm">مسودة</Badge>
              </div>

              <div className="px-8 md:px-14 py-10">
                {/* Header */}
                <div className="text-center mb-8 pb-6 border-b border-sand-200">
                  <div className="text-[0.7rem] font-700 tracking-[0.2em] text-accent-600 uppercase mb-2">
                    بسم الله الرحمن الرحيم
                  </div>
                  <h1 className="font-display font-700 text-ink text-2xl">مذكرة دفاع</h1>
                  {court && <div className="mt-2 text-[0.78rem] text-sand-500">أمام {court}</div>}
                  {caseNumber && <div className="mt-1 text-[0.72rem] text-sand-400">الدعوى رقم {caseNumber}</div>}
                  {(defendantName || charge) && (
                    <div className="mt-1 text-[0.72rem] text-sand-400">
                      {defendantName && <span>المتهم: {defendantName}</span>}
                      {defendantName && charge && <span> · </span>}
                      {charge && <span>{charge}</span>}
                    </div>
                  )}
                  {(crimeType || legalNature) && (
                    <div className="mt-1 text-[0.66rem] text-sand-400">
                      {crimeType && <span>نوع الجريمة: {crimeType}</span>}
                      {crimeType && legalNature && <span> · </span>}
                      {legalNature && <span>الطبيعة القانونية: {legalNature}</span>}
                    </div>
                  )}
                </div>

                {/* Sections */}
                <div className="space-y-8">
                  {sections.map((s, i) => (
                    <section
                      key={s.id}
                      id={`memo-${s.id}`}
                      className="scroll-mt-6 animate-fade-up"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary-50 text-primary-600 text-[0.7rem] font-700">
                          {i + 1}
                        </span>
                        <h2 className="font-display font-700 text-ink text-lg">{s.title}</h2>
                      </div>
                      <div
                        ref={(el) => { sectionRefs.current[s.id] = el; }}
                        contentEditable={editing}
                        suppressContentEditableWarning
                        className={`text-[0.92rem] leading-[2] text-ink whitespace-pre-wrap outline-none ${
                          editing ? 'ring-2 ring-primary-200 rounded-2xl px-4 py-3 -mx-4' : ''
                        }`}
                      >
                        {cleanMarkdown(s.body)}
                      </div>
                    </section>
                  ))}
                </div>

                {/* Signature */}
                <div className="mt-10 pt-6 border-t border-sand-200 flex items-center justify-between text-[0.78rem] text-sand-500">
                  <div>
                    {lawyerName && <div className="font-600 text-ink">المحامي: {lawyerName}</div>}
                    {lawyerLicense && <div className="text-[0.7rem]">عضو نقابة المحامين · رقم {lawyerLicense}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 text-success">
                    <Check className="w-4 h-4" />
                    <span className="text-[0.72rem] font-600">متوافق قانونيًا</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Floating Chat ═══ */}
      <FloatingMemoChat memoChat={memoChat} context={context} onClearContext={clearContext} />

      {/* Diff Modal */}
      <MemoDiffModalWrapper memoChat={memoChat} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FloatingMemoChat — شات عائم أنيق في أسفل الشاشة
   ══════════════════════════════════════════════════════════════════════════ */
function FloatingMemoChat({
  memoChat,
  context,
  onClearContext,
}: {
  memoChat: {
    messages: MemoChatMessage[];
    typing: boolean;
    typingStatus: string;
    send: (text: string) => void;
    context: string | null;
  };
  context: string | null;
  onClearContext: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { messages, typing, typingStatus, send } = memoChat;

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
    : 'اسأل عن المذكرة أو اطلب تعديلًا...';

  const unreadCount = open ? 0 : messages.filter(m => m.role === 'assistant').length;

  return (
    <>
      {/* Toggle button — الزر اللي بيفتح ويقفل الشات */}
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

      {/* Chat panel */}
      {open && (
        <div
          className="no-print fixed bottom-6 left-6 z-50 w-[400px] max-h-[520px] rounded-3xl bg-white border border-sand-200 shadow-2xl flex flex-col animate-scale-in origin-bottom-left"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-sand-100">
            <div className="flex items-center gap-2.5">
              <div className="grid place-items-center w-8 h-8 rounded-xl bg-primary-500 text-white shadow-soft">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <div className="font-display font-700 text-ink text-[0.82rem] leading-tight">مساعد مُحَكِّم</div>
                <div className="text-[0.62rem] text-sand-400">اسأل أو اطلب تعديلًا</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="grid place-items-center w-7 h-7 rounded-lg text-sand-400 hover:bg-sand-100 hover:text-ink transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Context chip */}
          {context && (
            <div className="px-4 pt-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-100 px-2.5 py-1 text-[0.68rem] font-600 text-primary-600">
                <Scale className="w-3 h-3" />
                {context}
                <span onClick={onClearContext} className="cursor-pointer hover:text-primary-800 mr-0.5">
                  <X className="w-3 h-3" />
                </span>
              </span>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 max-h-[300px] no-scrollbar">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex animate-msg-in', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {m.role === 'assistant' && (
                  <div className="grid place-items-center w-6 h-6 rounded-full bg-sand-100 text-sand-500 shrink-0 mt-0.5 ml-2">
                    <Scale className="w-3 h-3" />
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
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('muhakem-show-diff', { detail: m.changeCard }));
                      }}
                      className="w-full flex items-center gap-2 rounded-xl bg-success/5 border border-success/20 px-3 py-2 hover:bg-success/10 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5 text-success" strokeWidth={3} />
                      <span className="text-[0.72rem] font-600 text-ink">تم تعديل {m.changeCard.section_title}</span>
                      <span className="flex items-center gap-0.5 text-[0.64rem] font-600 text-primary-600 mr-auto">
                        <GitCompare className="w-3 h-3" />
                        مقارنة
                      </span>
                    </button>
                  )}
                  {m.warnings && m.warnings.length > 0 && (
                    <div className="flex items-start gap-1.5 rounded-xl bg-amber-50/60 border border-amber-200/60 px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" strokeWidth={2} />
                      <div className="space-y-0.5">
                        {m.warnings.map((w, wi) => (
                          <div key={wi} className="text-[0.72rem] text-amber-700 leading-snug">{stripEmojis(w)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start animate-msg-in">
                <div className="grid place-items-center w-6 h-6 rounded-full bg-sand-100 text-sand-500 shrink-0 mt-0.5 ml-2">
                  <Scale className="w-3 h-3" />
                </div>
                <div className="rounded-2xl rounded-bl-md bg-sand-50 border border-sand-200 px-3.5 py-2.5">
                  <span className="text-[0.78rem] text-sand-500 animate-pulse-soft">
                    {stripEmojis(typingStatus) || 'يفكّر...'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
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
    </>
  );
}

/* ── Diff Modal (listens to custom event) ── */
function MemoDiffModalWrapper({ memoChat }: { memoChat: { messages: MemoChatMessage[] } }) {
  const [diffModal, setDiffModal] = useState<ChatChangeCard | null>(null);

  useEffect(() => {
    const onShowDiff = (e: Event) => {
      setDiffModal((e as CustomEvent<ChatChangeCard>).detail);
    };
    window.addEventListener('muhakem-show-diff', onShowDiff);
    return () => window.removeEventListener('muhakem-show-diff', onShowDiff);
  }, []);

  if (!diffModal) return null;
  return <SidebarDiffModal change={diffModal} onClose={() => setDiffModal(null)} />;
}

/* ── Diff Modal ── */
function SidebarDiffModal({ change, onClose }: { change: ChatChangeCard; onClose: () => void }) {
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
              <div className="text-[0.62rem] text-sand-400">{change.section_title}</div>
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
