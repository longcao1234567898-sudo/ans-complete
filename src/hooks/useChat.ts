/**
 * Hook quản lý hội thoại với trợ lý AI: lưu lịch sử vào localStorage,
 * hiển thị trạng thái "đang soạn trả lời".
 */
import { useCallback, useState } from 'react';
import type { ChatMessage } from '../types/chat';
import { getChatReply } from '../services/aiService';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../utils/constants';
import { randomId } from '../utils/helpers';
import { sanitizeText } from '../utils/security';

export function useChat() {
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(STORAGE_KEYS.chat, []);
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = useCallback(
    async (text: string) => {
      // Làm sạch ký tự điều khiển/tàng hình trước khi gửi cho AI
      const trimmed = sanitizeText(text, 1000);
      if (!trimmed) return;

      const userMsg: ChatMessage = {
        id: randomId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        // Truyền lịch sử hội thoại để ChatGPT (nếu bật) hiểu ngữ cảnh
        const reply = await getChatReply(trimmed, messages);
        const botMsg: ChatMessage = {
          id: randomId(),
          role: 'assistant',
          content: reply,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, setMessages]
  );

  const clearChat = useCallback(() => setMessages([]), [setMessages]);

  return { messages, isTyping, sendMessage, clearChat };
}
