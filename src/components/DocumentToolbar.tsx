import {
  FileDown,
  FileType2,
  Copy,
  Pencil,
  ShieldCheck,
  History,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';

export function DocumentToolbar({
  editing,
  onToggleEdit,
  onValidate,
  onReport,
  showReport,
  onCopy,
  onExport,
}: {
  editing: boolean;
  onToggleEdit: () => void;
  onValidate?: () => void;
  onReport?: () => void;
  showReport?: boolean;
  onCopy?: () => void;
  onExport?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (onCopy) {
      onCopy();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-white border border-sand-200 shadow-soft px-3 py-2">
      <div className="flex items-center gap-1">
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-xl px-3 h-9 text-[0.78rem] font-600 text-sand-600 hover:bg-sand-100 hover:text-ink transition-colors duration-200"
          title="تصدير Word"
        >
          <FileType2 className="w-4 h-4" />
          <span className="hidden sm:inline">تصدير Word</span>
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-xl px-3 h-9 text-[0.78rem] font-600 text-sand-600 hover:bg-sand-100 hover:text-ink transition-colors duration-200"
          title="نسخ"
        >
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          <span className="hidden sm:inline">{copied ? 'تم النسخ' : 'نسخ'}</span>
        </button>
        <div className="w-px h-6 bg-sand-200 mx-1" />
        <button
          onClick={onToggleEdit}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3 h-9 text-[0.78rem] font-600 transition-colors duration-200',
            editing
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'text-sand-600 hover:bg-sand-100 hover:text-ink',
          )}
          title="تحرير"
        >
          {editing ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          <span className="hidden sm:inline">{editing ? 'تم' : 'تحرير'}</span>
        </button>
        <button
          onClick={onValidate}
          className="flex items-center gap-1.5 rounded-xl px-3 h-9 text-[0.78rem] font-600 text-sand-600 hover:bg-sand-100 hover:text-ink transition-colors duration-200"
          title="تحقق قانوني"
        >
          <ShieldCheck className="w-4 h-4" />
          <span className="hidden sm:inline">تحقق</span>
        </button>
        <button
          className="flex items-center gap-1.5 rounded-xl px-3 h-9 text-[0.78rem] font-600 text-sand-600 hover:bg-sand-100 hover:text-ink transition-colors duration-200"
          title="سجل النسخ"
        >
          <History className="w-4 h-4" />
          <span className="hidden md:inline">النسخ</span>
        </button>
      </div>
      {showReport && (
        <button
          onClick={onReport}
          className="flex items-center gap-1.5 rounded-xl bg-accent-500 text-white px-3.5 h-9 text-[0.78rem] font-600 hover:bg-accent-600 transition-colors shadow-soft"
        >
          <FileDown className="w-4 h-4" />
          <span>تقرير شامل</span>
        </button>
      )}
    </div>
  );
}
