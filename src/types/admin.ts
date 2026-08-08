export interface SubmissionListItem {
  id: number;
  tracking_code: string;
  original_content: string;
  ai_processed_content: string | null;
  category_code: string | null;
  category_name: string | null;
  status: 'received' | 'processing' | 'resolved' | 'rejected';
  sender_name: string;
  is_flagged: boolean;
  created_at: string;
  assigned_name: string | null;
}

export interface SubmissionDetail extends SubmissionListItem {
  sender_phone: string;
  sender_email: string | null;
  rejection_reason: string | null;
  resolution_note: string | null;
  resolved_by_name: string | null;
  images: { image_url: string; mime_type: string; moderation_status: string }[];
  history: {
    old_status: string | null;
    new_status: string;
    note: string | null;
    changed_at: string;
    changed_by_name: string | null;
  }[];
}

export interface DashboardStats {
  overview: {
    total_submissions: number;
    pending_count: number;
    processing_count: number;
    resolved_count: number;
    rejected_count: number;
    today_count: number;
    flagged_count: number;
  };
  byCategory: {
    code: string;
    name: string;
    total_count: number;
    received_count: number;
    processing_count: number;
    resolved_count: number;
    rejected_count: number;
  }[];
  recent: {
    tracking_code: string;
    status: string;
    sender_name: string;
    category_name: string;
    created_at: string;
  }[];
}
