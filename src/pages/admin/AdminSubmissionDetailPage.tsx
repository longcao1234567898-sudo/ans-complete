/** Chi tiết một ý kiến: thông tin đầy đủ, timeline, và bảng điều khiển đổi trạng thái */
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Eye, UserPlus, ArrowLeft, Loader2, Phone, Mail, User, Clock, CheckCircle2, XCircle, PlayCircle, Ban, MapPin } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import KhuTepDinhKem from '../../components/admin/KhuTepDinhKem';
import SlaBadge from '../../components/admin/SlaBadge';
import { fetchSubmissionDetail, updateSubmissionStatus,
  fetchStaffList, assignSubmission, revealIdentity, markSpam,
  chuyenVaoToGiacMat, duaRaToGiacMat, sangLoc, xuLyNgoaiThamQuyen, themGhiChuNoiBo } from '../../services/adminService';
import { laLanhDao } from '../../utils/vaiTro';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import AdminChatPanel from '../../components/admin/AdminChatPanel';
import { STATUS_META, CATEGORY_LABEL, formatDateTime } from '../../components/admin/statusMeta';

export default function AdminSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const submissionId = Number(id);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-submission', submissionId],
    queryFn: () => fetchSubmissionDetail(submissionId),
    enabled: Number.isFinite(submissionId),
  });

  const [note, setNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [feedback, setFeedback] = useState('');

  // --- V2: danh tính đầy đủ (chỉ hiện khi bấm nút, có ghi nhật ký) ---
  const [revealed, setRevealed] = useState<{ sender_name: string; sender_phone: string; sender_email: string | null } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [dangDanhDauRac, setDangDanhDauRac] = useState(false);
  const navigate = useNavigate();

  async function handleReveal() {
    setRevealing(true);
    try {
      const r = await revealIdentity(submissionId);
      setRevealed(r);
      setFeedback(r.warning);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Không xem được danh tính.');
    } finally {
      setRevealing(false);
    }
  }

  // --- V2: phân công cán bộ ---
  const { data: staffList } = useQuery({ queryKey: ['admin-staff'], queryFn: fetchStaffList });
  const { staff } = useAdminAuth();
  const coChiLanhDao = Boolean(data?.to_giac_mat || data?.ngoai_tham_quyen);

  const assignMutation = useMutation({
    mutationFn: (staffId: number | null) => assignSubmission(submissionId, staffId),
    onSuccess: (r) => {
      setFeedback(r.message || 'Đã phân công.');
      qc.invalidateQueries({ queryKey: ['admin-submission', submissionId] });
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
    },
    onError: (e: Error) => setFeedback(e.message),
  });

  const lanhDao = laLanhDao(staff?.role);
  const [ghiChuMoi, setGhiChuMoi] = useState('');
  const [dangGui, setDangGui] = useState(false);

  /** Chạy một thao tác trên hồ sơ rồi làm mới. `diTiep`: hồ sơ rời khỏi tầm
      nhìn của người bấm (cán bộ chuyển sang phần chỉ lãnh đạo) -> về danh sách. */
  async function lamViec(viec: () => Promise<{ message: string }>, diTiep?: string) {
    setDangGui(true);
    try {
      const kq = await viec();
      toast.success(kq.message, { duration: 6000 });
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      if (diTiep) navigate(diTiep);
      else qc.invalidateQueries({ queryKey: ['admin-submission', submissionId] });
    } catch (e) {
      toast.error((e as Error).message || 'Không thực hiện được.');
    } finally {
      setDangGui(false);
    }
  }

  const mutation = useMutation({
    mutationFn: (payload: { status: string; note?: string; rejectionReason?: string }) =>
      updateSubmissionStatus(submissionId, payload),
    onSuccess: (res) => {
      setFeedback(res.message || 'Đã cập nhật.');
      setNote('');
      setRejectionReason('');
      qc.invalidateQueries({ queryKey: ['admin-submission', submissionId] });
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (e) => setFeedback((e as Error).message),
  });

  function changeStatus(status: string) {
    if (status === 'rejected' && !rejectionReason.trim()) {
      setFeedback('Vui lòng nhập lý do từ chối.');
      return;
    }
    mutation.mutate({ status, note: note.trim() || undefined, rejectionReason: rejectionReason.trim() || undefined });
  }

  return (
    <AdminLayout>
      <Link to="/quan-tri/y-kien" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-primary-600">
        <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {isLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải...</div>}
      {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>}

      {data && (
        <>
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Cột trái: nội dung + timeline */}
          <div className="space-y-5 lg:col-span-2">
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-lg font-extrabold text-primary-600 dark:text-primary-300">{data.tracking_code}</span>
                <SlaBadge sla={data.sla} daysLeft={data.daysLeft} />
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_META[data.status]?.badge}`}>{STATUS_META[data.status]?.label}</span>
                {data.urgency === 'urgent' && (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">🔴 KHẨN CẤP</span>
                )}
                {data.urgency === 'important' && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">🟡 Quan trọng</span>
                )}
                {Boolean(data.to_giac_mat) && (
                  <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white">🔒 TỐ GIÁC MẬT · chỉ lãnh đạo</span>
                )}
                {Boolean(data.ngoai_tham_quyen) && (
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">↪ Ngoài thẩm quyền · chỉ lãnh đạo</span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-500">Nhóm: {CATEGORY_LABEL[data.category_code || ''] || data.category_name}</p>
              {Boolean(data.is_flagged) && data.flag_reason && (
                <p className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
                  ⚑ Cờ cảnh báo: {data.flag_reason}
                </p>
              )}
              {data.muc_khan?.lyDo && (
                <p className="mt-1 text-xs text-slate-500">
                  Mức khẩn do hệ thống tự đánh giá: {data.muc_khan.lyDo}
                  {data.muc_khan.tuKhoa.length > 0 && <> (từ khoá: {data.muc_khan.tuKhoa.join(', ')})</>}
                </p>
              )}

              <h3 className="mb-1 mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">Nội dung công dân gửi</h3>
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{data.original_content}</p>

              {data.ai_processed_content && (
                <>
                  <h3 className="mb-1 mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">Nội dung đã chuẩn hoá</h3>
                  <p className="rounded-xl bg-primary-50 p-3 text-sm text-slate-700 dark:bg-primary-900/20 dark:text-slate-200">{data.ai_processed_content}</p>
                </>
              )}

              {data.rejection_reason && (
                <>
                  <h3 className="mb-1 mt-4 text-sm font-bold text-rose-600">Lý do từ chối</h3>
                  <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/20">{data.rejection_reason}</p>
                </>
              )}

              {data.images.length > 0 && (
                <>
                  <h3 className="mb-2 mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">
                    Tệp đính kèm ({data.images.length})
                    <span className="ml-1.5 font-normal text-slate-400">— bấm để xem to</span>
                  </h3>
                  {/* Trước đây mọi tệp đều vẽ bằng thẻ ảnh, nên VIDEO KHÔNG HIỆN
                      RA GÌ — cán bộ chỉ thấy ô trống, tưởng bà con không gửi.
                      Component này phân biệt ảnh với video và cho bấm mở to. */}
                  <KhuTepDinhKem tep={data.images} />
                </>
              )}
            </div>

            {/* Timeline */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">Lịch sử xử lý</h3>
              <div className="space-y-4">
                {data.history.map((h, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`h-3 w-3 rounded-full ${STATUS_META[h.new_status]?.dot || 'bg-slate-400'}`} />
                      {i < data.history.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-slate-200 dark:bg-slate-700" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{STATUS_META[h.new_status]?.label || h.new_status}</p>
                      <p className="text-[11px] text-slate-500">{formatDateTime(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}</p>
                      {h.note && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{h.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* NGƯỜI DÂN BỔ SUNG (ADR-003 việc 21) — lưu riêng, nội dung gốc ở trên không đổi */}
            {(data.bo_sung ?? []).length > 0 && (
              <div className="rounded-2xl border-2 border-rose-200 bg-white p-5 shadow-soft dark:border-rose-900/40 dark:bg-slate-900">
                <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                  Người dân bổ sung ({data.bo_sung!.length})
                </h3>
                <ul className="space-y-3">
                  {data.bo_sung!.map((b) => (
                    <li key={b.id} className="rounded-xl bg-rose-50/50 p-3 text-sm dark:bg-rose-900/10">
                      <p className="mb-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                        Lần {b.thu_tu} · {formatDateTime(b.created_at)}{!b.da_doc_luc && ' · MỚI'}
                      </p>
                      <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{b.noi_dung}</p>
                      {b.anh.length > 0 && <div className="mt-2"><KhuTepDinhKem tep={b.anh} /></div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* GHI CHÚ NỘI BỘ (ADR-003 việc 16) — người dân không thấy. Chỉ thêm
                được, không sửa xoá (máy chủ và CSDL đều chặn) để giữ diễn biến. */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Ghi chú nội bộ</h3>
              {(data.ghi_chu ?? []).length === 0 ? (
                <p className="mb-3 text-xs text-slate-400">Chưa có ghi chú.</p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {data.ghi_chu!.map((g) => (
                    <li key={g.id} className="rounded-xl bg-slate-50 p-2.5 text-sm dark:bg-slate-800">
                      <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{g.noi_dung}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{g.staff_name || 'Không rõ'} · {formatDateTime(g.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                value={ghiChuMoi}
                onChange={(e) => setGhiChuMoi(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder="Thêm ghi chú (người dân không thấy, không sửa xoá được sau khi lưu)"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                type="button"
                disabled={dangGui || !ghiChuMoi.trim()}
                onClick={async () => {
                  await lamViec(() => themGhiChuNoiBo(submissionId, ghiChuMoi.trim()));
                  setGhiChuMoi('');
                }}
                className="mt-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Lưu ghi chú
              </button>
            </div>
          </div>

          {/* Cột phải: thông tin liên hệ + xử lý */}
          <div className="space-y-5">
            {/* SÀNG LỌC (ADR-003 việc 14) — chỉ hiện khi tin đang chờ sàng lọc */}
            {data.dang_cho_sang_loc && (
              <div className="rounded-2xl border-2 border-primary-200 bg-white p-5 shadow-soft dark:border-primary-900/40 dark:bg-slate-900">
                <h3 className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">Sàng lọc tin</h3>
                {data.chua_xac_minh_luc && (
                  <p className="mb-2 text-xs text-sky-700 dark:text-sky-300">Đã gắn nhãn Chưa xác minh lúc {formatDateTime(data.chua_xac_minh_luc)}.</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={dangGui}
                    onClick={() => lamViec(() => sangLoc(submissionId, 'xac_nhan'))}
                    className="rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    Xác nhận tin
                  </button>
                  <button type="button" disabled={dangGui}
                    onClick={() => {
                      const ghi = window.prompt('Gắn nhãn CHƯA XÁC MINH — tin ở lại hàng sàng lọc chờ bổ sung.\n\nGhi chú nội bộ (không bắt buộc):');
                      if (ghi === null) return;
                      lamViec(() => sangLoc(submissionId, 'chua_xac_minh', ghi));
                    }}
                    className="rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">
                    Chưa xác minh
                  </button>
                  <button type="button" disabled={dangGui}
                    onClick={() => {
                      const ly = window.prompt('Đánh dấu TIN GIẢ — tin vào thùng rác, KHÔNG khoá máy người gửi.\n\nLý do (bắt buộc, chỉ cán bộ xem):');
                      if (ly === null) return;
                      if (ly.trim().length < 5) { toast.error('Phải ghi rõ lý do đánh dấu tin giả.'); return; }
                      lamViec(() => sangLoc(submissionId, 'tin_gia', ly), '/quan-tri/sang-loc');
                    }}
                    className="rounded-xl bg-slate-600 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50">
                    Tin giả
                  </button>
                  <button type="button" disabled={dangGui}
                    onClick={() => {
                      const ghi = window.prompt('Chuyển sang NGOÀI THẨM QUYỀN — chỉ lãnh đạo xem.'
                        + (lanhDao ? '' : '\nSau khi chuyển, đồng chí sẽ không mở được tin này nữa.')
                        + '\n\nGhi chú nội bộ (không bắt buộc, ví dụ cơ quan nên chuyển tới):');
                      if (ghi === null) return;
                      lamViec(() => sangLoc(submissionId, 'ngoai_tham_quyen', ghi), lanhDao ? undefined : '/quan-tri/sang-loc');
                    }}
                    className="rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                    Ngoài thẩm quyền
                  </button>
                </div>
              </div>
            )}

            {/* NGOÀI THẨM QUYỀN — nút của lãnh đạo (ADR-003 việc 15) */}
            {lanhDao && Boolean(data.ngoai_tham_quyen) && !data.deleted_at && (
              <div className="rounded-2xl border-2 border-orange-200 bg-white p-5 shadow-soft dark:border-orange-900/40 dark:bg-slate-900">
                <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Tin ngoài thẩm quyền</h3>
                <div className="space-y-2">
                  <button type="button" disabled={dangGui}
                    onClick={() => lamViec(() => xuLyNgoaiThamQuyen(submissionId, 'chuyen_lai'))}
                    className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                    Chuyển lại xử lý
                  </button>
                  <button type="button" disabled={dangGui}
                    onClick={() => {
                      const noi = window.prompt('Ghi nhận ĐÃ CHUYỂN CƠ QUAN CÓ THẨM QUYỀN — người dân tra cứu sẽ thấy.\n\nCơ quan đã chuyển tới:');
                      if (noi === null) return;
                      lamViec(() => xuLyNgoaiThamQuyen(submissionId, 'da_chuyen', noi));
                    }}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    Đã chuyển cơ quan có thẩm quyền
                  </button>
                  <button type="button" disabled={dangGui}
                    onClick={() => {
                      if (!window.confirm('Xoá tin này? Tin vào thùng rác, khôi phục được trong 7 ngày.')) return;
                      lamViec(() => xuLyNgoaiThamQuyen(submissionId, 'xoa'), '/quan-tri/ngoai-tham-quyen');
                    }}
                    className="w-full rounded-xl border-2 border-rose-300 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300">
                    Xoá tin
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Thông tin người gửi</h3>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><User className="h-4 w-4 text-slate-500" /> {revealed?.sender_name ?? data.sender_name}</p>
                <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Phone className="h-4 w-4 text-slate-500" /> {revealed?.sender_phone ?? data.sender_phone}</p>
                {revealed
                  ? revealed.sender_email && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Mail className="h-4 w-4 text-slate-500" /> {revealed.sender_email}</p>
                  : data.co_email && <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Mail className="h-4 w-4 text-slate-500" /> <span className="italic">Có email — bấm “Xem danh tính” để xem</span></p>}
                <p className="flex items-center gap-2 text-slate-500"><Clock className="h-4 w-4" /> {formatDateTime(data.created_at)}</p>
                {data.ward_name && <p className="text-xs text-slate-500">Địa bàn: <span className="font-semibold text-slate-600 dark:text-slate-300">{data.ward_name}</span></p>}
              </div>

              {!revealed && !lanhDao ? (
                /* ADR-003 §3: cán bộ không bao giờ xem được danh tính — máy chủ
                   trả 403; ở đây chỉ để không bày một nút bấm vào là báo lỗi */
                <p className="mt-3 text-[11px] text-slate-500">Chỉ lãnh đạo xem được danh tính người gửi.</p>
              ) : !revealed ? (
                <button
                  onClick={handleReveal}
                  disabled={revealing}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 py-2 text-xs font-bold text-slate-600 transition hover:border-primary-500 hover:text-primary-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                >
                  {revealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                  Xem danh tính đầy đủ
                </button>
              ) : (
                <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  Lượt xem danh tính này đã được ghi vào nhật ký hệ thống.
                </p>
              )}
              {!revealed && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Danh tính người tố giác được mã hoá và che bớt để bảo vệ an toàn cho công dân.
                </p>
              )}
            </div>

            {/* V2: PHÂN CÔNG CÁN BỘ — chỉ lãnh đạo giao việc (ADR-003 §5); cán bộ
                chỉ thấy ai đang phụ trách. Máy chủ chặn /assign với cán bộ. */}
            {!lanhDao ? (
              data.assigned_name && (
                <div className="rounded-2xl bg-white p-5 text-xs text-slate-500 shadow-soft dark:bg-slate-900">
                  Phụ trách: <span className="font-semibold text-primary-600 dark:text-primary-300">{data.assigned_name}</span>
                </div>
              )
            ) : (
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
                <UserPlus className="h-4 w-4 text-primary-600" /> Phân công xử lý
              </h3>
              <select
                value={data.assigned_to ?? ''}
                onChange={(e) => assignMutation.mutate(e.target.value ? Number(e.target.value) : null)}
                disabled={assignMutation.isPending}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">— Chưa phân công —</option>
                {/* Tin tố giác mật / ngoài thẩm quyền chỉ giao được cho lãnh đạo
                    (ADR-003 §4) — máy chủ chặn, ở đây chỉ để khỏi hiện lựa chọn
                    chắc chắn bị từ chối. Người đang phụ trách vẫn hiện. */}
                {staffList
                  ?.filter((st) => !coChiLanhDao || laLanhDao(st.role) || st.id === data.assigned_to)
                  .map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.full_name} ({st.open_count} việc đang mở)
                    </option>
                  ))}
              </select>
              {data.assigned_name && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Phụ trách: <span className="font-semibold text-primary-600 dark:text-primary-300">{data.assigned_name}</span>
                </p>
              )}
            </div>
            )}

            {/* VỊ TRÍ VỤ VIỆC — chỉ hiện khi người dân có gửi toạ độ.

                Người dân mô tả địa điểm bằng lời thường không đủ rõ ("gần cây
                xăng", "đầu ấp"), cán bộ xuống hiện trường phải dò hỏi. Toạ độ
                này cho biết chính xác chỗ nào, mở thẳng được bằng bản đồ để
                xem đường đi. */}
            {data.incident_lat != null && data.incident_lng != null && (
              <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
                  <MapPin className="h-4 w-4 text-rose-600" /> Vị trí vụ việc
                </h3>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  Do người dân tự nguyện gửi khi đang ở hiện trường.
                </p>
                <p className="mb-3 font-mono text-sm text-slate-700 dark:text-slate-200">
                  {Number(data.incident_lat).toFixed(6)}, {Number(data.incident_lng).toFixed(6)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://www.google.com/maps?q=${data.incident_lat},${data.incident_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-primary-700"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Mở bản đồ
                  </a>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${data.incident_lat},${data.incident_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    Chỉ đường tới hiện trường
                  </a>
                </div>
              </div>
            )}

            {/* Bảng điều khiển xử lý */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Xử lý ý kiến</h3>

              <label className="mb-1 block text-xs font-semibold text-slate-500">Ghi chú (tuỳ chọn)</label>

              {/* MẪU CÂU BẤM NHANH — nhiều tình huống lặp lại, soạn sẵn để cán
                  bộ chọn rồi chỉnh, thay vì gõ lại từ đầu mỗi lần. Rút ngắn
                  thời gian phản hồi cho dân. Bấm là ĐIỀN vào ô, vẫn sửa tiếp
                  được — không phải câu chốt cứng. */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[
                  'Đã tiếp nhận, đang xác minh thông tin.',
                  'Đã cử lực lượng xuống hiện trường kiểm tra.',
                  'Vụ việc đã chuyển đơn vị chức năng xử lý theo thẩm quyền.',
                  'Đã liên hệ người phản ánh để làm rõ thêm.',
                  'Đã xử lý xong, thông báo kết quả tới người dân.',
                ].map((mau) => (
                  <button
                    key={mau}
                    type="button"
                    onClick={() => setNote((cu) => (cu.trim() ? cu.trimEnd() + ' ' + mau : mau))}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-primary-100 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-primary-900/30"
                  >
                    + {mau.length > 32 ? mau.slice(0, 30) + '…' : mau}
                  </button>
                ))}
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="VD: Đã cử lực lượng xuống hiện trường..."
                className="mb-3 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-base sm:text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800"
              />

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => changeStatus('processing')} disabled={mutation.isPending} className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                  <PlayCircle className="h-4 w-4" /> Đang xử lý
                </button>
                <button onClick={() => changeStatus('resolved')} disabled={mutation.isPending} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" /> Giải quyết
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-rose-200 p-3 dark:border-rose-900/40">
                <label className="mb-1 block text-xs font-semibold text-rose-600">Lý do từ chối (bắt buộc khi từ chối)</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={2}
                  placeholder="VD: Không thuộc thẩm quyền Công an cấp xã..."
                  className="mb-2 w-full rounded-lg border border-rose-200 bg-white p-2 text-base sm:text-sm outline-none dark:border-rose-900/40 dark:bg-slate-800"
                />
                <button onClick={() => changeStatus('rejected')} disabled={mutation.isPending} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                  <XCircle className="h-4 w-4" /> Từ chối
                </button>

                {/* ================================================================
                    NÚT TIN RÁC — khác nút "Từ chối"

                    Từ chối  = đơn có thật nhưng không thuộc thẩm quyền, hoặc
                               không đủ căn cứ. Người gửi vẫn là người dân bình
                               thường.
                    Tin rác  = đơn bịa đặt, phá hoại. Ngoài việc bỏ hồ sơ, còn
                               KHOÁ THIẾT BỊ đã gửi trong 24 giờ.

                    Việc khoá mới là điểm mấu chốt: đánh dấu mà không khoá thì kẻ
                    phá hoại gửi tiếp ngay, cán bộ đánh dấu mãi không hết.
                    ================================================================ */}
                <button
                  type="button"
                  disabled={dangDanhDauRac}
                  onClick={async () => {
                    /* Tố giác ẩn danh không khoá máy hay mạng của người gửi
                       (BUG-017) — máy chủ đã chặn, ở đây chỉ để không hứa
                       với cán bộ một việc sẽ không xảy ra. Cùng quy ước với
                       laDonAnDanh ở máy chủ: NULL coi là ẩn danh; MySQL trả
                       TINYINT dạng số nên so bằng Number, không so với false. */
                    const anDanh = data?.is_anonymous == null || Number(data.is_anonymous) !== 0;
                    /* Không còn khoá theo địa chỉ mạng (BUG-016): hồ sơ không có
                       mã máy thì không khoá gì — nói trước, không hứa suông. */
                    const ly = window.prompt(
                      (anDanh
                        ? 'Đánh dấu TIN RÁC. Tố giác ẩn danh không khoá máy hay mạng của người gửi.\n\n'
                        : data?.co_ma_thiet_bi
                        ? 'Đánh dấu TIN RÁC và khoá thiết bị này 24 giờ.\n\n'
                        : 'Đánh dấu TIN RÁC. Hồ sơ này không có mã thiết bị nên không khoá.\n\n')
                      + 'Hồ sơ vào thùng rác, giữ 7 ngày, khôi phục được nếu bấm nhầm.\n\n'
                      + 'Lý do (không bắt buộc):'
                    );
                    if (ly === null) return;   // bấm Huỷ
                    setDangDanhDauRac(true);
                    try {
                      const kq = await markSpam(submissionId, ly);
                      toast.success(kq.ghiChu, { duration: 6000 });
                      navigate('/quan-tri/y-kien');
                    } catch (e) {
                      toast.error((e as Error).message || 'Không đánh dấu được.');
                    } finally {
                      setDangDanhDauRac(false);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl border-2 border-slate-400 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Ban className="h-4 w-4" /> Tin rác
                </button>
              </div>

              {/* TIN TỐ GIÁC MẬT (ADR-003 việc 12): cán bộ chuyển vào được, một chiều;
                  chỉ lãnh đạo đưa ra được khi bộ từ khoá bắt dư. */}
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                {!data.to_giac_mat ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const ly = window.prompt(
                        'Chuyển tin này vào phần TIN TỐ GIÁC MẬT (chỉ lãnh đạo xem).\n\n'
                        + (laLanhDao(staff?.role) ? '' : 'Sau khi chuyển, đồng chí sẽ KHÔNG mở được tin này nữa.\n\n')
                        + 'Lý do (không bắt buộc):'
                      );
                      if (ly === null) return;
                      try {
                        const kq = await chuyenVaoToGiacMat(submissionId, ly);
                        toast.success(kq.message, { duration: 6000 });
                        qc.invalidateQueries({ queryKey: ['admin-submissions'] });
                        if (laLanhDao(staff?.role)) qc.invalidateQueries({ queryKey: ['admin-submission', submissionId] });
                        else navigate('/quan-tri/y-kien');
                      } catch (e) {
                        toast.error((e as Error).message || 'Không chuyển được.');
                      }
                    }}
                    className="w-full rounded-xl border-2 border-rose-300 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  >
                    🔒 Chuyển vào Tin tố giác mật
                  </button>
                ) : (
                  laLanhDao(staff?.role) && (
                    <div className="space-y-2">
                      {data.to_giac_mat_nhan_dien && data.to_giac_mat_nhan_dien.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Hệ thống nhận diện theo từ khoá: {data.to_giac_mat_nhan_dien.join('; ')}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Đưa tin ra khỏi phần Tin tố giác mật? Cán bộ sẽ thấy và xử lý tin này như tin thường.')) return;
                          try {
                            const kq = await duaRaToGiacMat(submissionId);
                            toast.success(kq.message);
                            qc.invalidateQueries({ queryKey: ['admin-submission', submissionId] });
                            qc.invalidateQueries({ queryKey: ['admin-submissions'] });
                          } catch (e) {
                            toast.error((e as Error).message || 'Không đưa ra được.');
                          }
                        }}
                        className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                      >
                        Đưa ra khỏi phần tố giác mật
                      </button>
                    </div>
                  )
                )}
              </div>

              {mutation.isPending && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Đang cập nhật...</p>}
              {feedback && !mutation.isPending && <p className="mt-3 text-xs font-semibold text-primary-600 dark:text-primary-300">{feedback}</p>}
            </div>
          </div>
        </div>

          {/* Kênh trao đổi hai chiều với người gửi — hỏi thêm khi thiếu thông tin.
              Đặt TRONG nhánh có dữ liệu: hồ sơ chưa tải xong thì chưa có gì để chat. */}
          <AdminChatPanel submissionId={submissionId} />
        </>
      )}
    </AdminLayout>
  );
}
