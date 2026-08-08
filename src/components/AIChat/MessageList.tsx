/**
 * Danh sách tin nhắn hội thoại: render Markdown cho tin nhắn trợ lý,
 * hiển thị chỉ báo "đang soạn trả lời", tự động cuộn xuống cuối.
 */
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { User } from 'lucide-react';
import PoliceAvatar from '../common/PoliceAvatar';
import type { ChatMessage } from '../../types/chat';
import { cn } from '../../utils/helpers';

interface MessageListProps {
  messages: ChatMessage[];
  isTyping: boolean;
}

/** Dấu 3 chấm nhấp nhô mềm mại kiểu Messenger */
function TypingDots() {
  return (
    <div className="flex h-5 items-end gap-1 px-1" aria-label="Trợ lý đang soạn trả lời">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-typing-dot rounded-full bg-slate-400 will-change-transform dark:bg-slate-500"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

export default function MessageList({ messages, isTyping }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isTyping]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        return (
          <div key={msg.id} className={cn('flex items-end gap-2', isUser && 'flex-row-reverse')}>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                isUser ? 'bg-secondary-500 text-white' : 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300'
              )}
            >
              {isUser ? <User className="h-3.5 w-3.5" /> : <PoliceAvatar className="h-7 w-7" />}
            </span>
            <div
              className={cn(
                'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm',
                isUser
                  ? 'rounded-br-sm bg-secondary-500 text-white'
                  : 'chat-markdown rounded-bl-sm bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              )}
            >
              {isUser ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
            </div>
          </div>
        );
      })}

      {isTyping && (
        <div className="flex items-end gap-2">
          <PoliceAvatar className="h-7 w-7 shrink-0" />
          <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 dark:bg-slate-800">
            <TypingDots />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
