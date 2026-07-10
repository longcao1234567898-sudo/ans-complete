/**
 * Kiểu dữ liệu cho trợ lý AI chat.
 */
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Nội dung dạng Markdown (với tin nhắn của trợ lý) */
  content: string;
  timestamp: string;
}
