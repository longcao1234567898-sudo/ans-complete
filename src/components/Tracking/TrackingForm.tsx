/**
 * Ô nhập mã tra cứu 6 ký tự + nút mở quét mã QR.
 */
import { FormEvent, useState } from 'react';
import { QrCode, Search } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';

interface TrackingFormProps {
  initialCode?: string;
  onSubmit: (code: string) => void;
  onOpenScanner: () => void;
  isLoading?: boolean;
}

export default function TrackingForm({ initialCode = '', onSubmit, onOpenScanner, isLoading }: TrackingFormProps) {
  const [code, setCode] = useState(initialCode);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length >= 6) onSubmit(code.trim().toUpperCase());
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="Nhập mã 6 ký tự, ví dụ: DEMO01"
          maxLength={6}
          aria-label="Mã tra cứu"
          className="text-center font-mono text-lg tracking-[0.3em]"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={isLoading} disabled={code.trim().length < 6} className="shrink-0">
          <Search className="h-4 w-4" /> Tra cứu
        </Button>
        <Button type="button" variant="outline" onClick={onOpenScanner} className="shrink-0" aria-label="Quét mã QR">
          <QrCode className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
