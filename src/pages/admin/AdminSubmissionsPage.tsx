/** Danh sách ý kiến: lọc theo trạng thái/nhóm, tìm kiếm, phân trang */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Loader2, ChevronLeft, ChevronRight, Flag, MessageSquare, UserRound } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import SlaBadge from '../../components/admin/SlaBadge';
import { fetchSubmissions, fetchStaffList } from '../../services/adminService';
import { STATUS_META, CATEGORY_LABEL, formatDateTime } from '../../components/admin/statusMeta';

/* ============================================================================
   THẺ LỌC — thêm mục "Quá hạn" đứng riêng

   Vì sao tách riêng: việc quá hạn trộn lẫn trong danh sách chung thì chìm giữa
   hàng chục việc khác, cán bộ phải tự dò từng dòng xem cái nào trễ. Tách thành
   một mục riêng là mở ra thấy ngay đúng những việc phải giải trình.

   ⚠️ "Quá hạn" KHÔNG phải một trạng thái trong database — nó là phép tính giữa
   hạn xử lý và thời điểm hiện tại. Nên dùng tham số lọc riêng (sla) chứ không
   phải status. Máy chủ đã hỗ trợ sẵn tham số này.
   ============================================================================ */
const STATUS_TABS = [
  /* ⚠️ Thẻ này gửi status rỗng, mà máy chủ hiểu rỗng là "CHỈ VIỆC CHƯA XONG"
     (received + processing). Trước đây nó mang nhãn "Tất cả" — sai hẳn nghĩa:
     đơn vị có 70 ý kiến, mở ra đếm được ba chục rồi tưởng mất dữ liệu, đúng
     kiểu nhầm lẫn mà cả trang này đang cố tránh. Nhãn nay nói đúng việc nó làm. */
  { value: '', label: 'Việc chưa xong', sla: '' },
  /* Muốn xem ĐỦ cả 70 — kể cả đã giải quyết, từ chối, chờ kiểm duyệt — thì
     phải gửi status='all'. Máy chủ hỗ trợ sẵn, trước nay giao diện không gọi. */
  { value: 'all', label: 'Tất cả', sla: '' },
  { value: 'received', label: 'Chờ tiếp nhận', sla: '' },
  { value: 'processing', label: 'Đang xử lý', sla: '' },
  { value: 'resolved', label: 'Đã giải quyết', sla: '' },
  { value: 'rejected', label: 'Từ chối', sla: '' },
  /* Mục riêng: lọc theo HẠN XỬ LÝ, không phải theo trạng thái */
  { value: '', label: '⏰ Quá hạn', sla: 'overdue' },
];

export default function AdminSubmissionsPage() {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [urgency, setUrgency] = useState('');
  const [sla, setSla] = useState('');
  const [sort, setSort] = useState('mac_dinh');
  const [assigned, setAssigned] = useState('');

  /* ------------------------------------------------------------------------
     NHẬN BỘ LỌC TỪ ĐƯỜNG DẪN

     Ba thẻ "Đã quá hạn / Sắp hết hạn / Chưa phân công" trên trang Tổng quan
     dẫn sang đây kèm tham số. Không đọc tham số thì bấm vào chỉ mở danh sách
     đầy đủ — cán bộ lại phải tự tìm, mất luôn ý nghĩa của việc bấm.
     ------------------------------------------------------------------------ */
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const s2 = searchParams.get('sla') || '';
    const a2 = searchParams.get('assigned') || '';
    const u2 = searchParams.get('urgency') || '';
    if (s2) setSla(s2);
    if (a2) setAssigned(a2);
    if (u2) setUrgency(u2);
    if (s2 || a2 || u2) setPage(1);
  }, [searchParams]);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  /* Danh sách cán bộ cho ô lọc theo tên. Ít thay đổi nên giữ lâu trong bộ nhớ
     đệm — mỗi lần đổi bộ lọc mà gọi lại là thừa. */
  const { data: danhSachCanBo } = useQuery({
    queryKey: ['admin-staff-options'],
    queryFn: fetchStaffList,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['admin-submissions', status, category, urgency, sla, assigned, sort, q, page],
    queryFn: () => fetchSubmissions({
      /* ⚠️ PHẢI truyền `sort`. Trước đây sort nằm trong queryKey nhưng không
         nằm trong lời gọi — đổi ô sắp xếp thì react-query nạp lại đúng một
         lần rồi trả về y hệt thứ tự cũ, ô chọn nhìn như bị hỏng. */
      sort,
      status, category, urgency, assigned, q, page, limit: 15,
      /* Không ở mục "Quá hạn" thì ẨN việc quá hạn khỏi danh sách — chúng đã
         có mục riêng, để lẫn vào đây là đọc trùng và chiếm chỗ việc trong hạn. */
      /* ⚠️ ĐÃ BỎ 'an_qua_han' MẶC ĐỊNH.

         Trước đây mọi mục đều tự gửi sla=an_qua_han để ẩn việc quá hạn. Hậu
         quả thật: đơn vị có 70 ý kiến mà danh sách chỉ hiện 6 — 64 việc quá
         hạn bị giấu sạch, cán bộ tưởng mất dữ liệu.

         Giấu việc quá hạn là sai hướng ngay từ đầu: đó đúng là những việc cần
         thấy nhất. Mục "⏰ Quá hạn" vẫn còn để xem riêng khi cần. */
      sla,
    }),
    placeholderData: keepPreviousData,
  });

  function applySearch() {
    setQ(searchInput.trim());
    setPage(1);
  }

  return (
    <AdminLayout>
      <h1 className="mb-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">Danh sách ý kiến</h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Tiếp nhận và xử lý ý kiến công dân gửi đến.</p>

      {/* Tab trạng thái */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => { setStatus(t.value); setSla(t.sla); setPage(1); }}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              status === t.value && sla === t.sla
                ? 'bg-primary-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ⚠️ ĐÃ XOÁ DẢI BÁO "danh sách này không hiện việc đã quá hạn".

          Dải đó ra đời cùng cách lọc sla=an_qua_han. Bản vá 64 việc bị giấu đã
          bỏ hẳn cách lọc ấy, nhưng dải chữ ở lại — thành ra danh sách hiện đủ
          việc quá hạn mà vẫn khẳng định là đang giấu chúng. Cán bộ đọc dải này
          rồi bấm sang mục riêng để tìm việc vốn đã nằm ngay trước mắt.

          Một dòng thông báo sai còn tai hại hơn không có dòng nào: nó dạy người
          dùng ngờ vực đúng cái danh sách vừa được sửa cho đáng tin.

          Nút tắt sang mục "⏰ Quá hạn" vẫn còn nguyên trên hàng thẻ phía trên. */}

      {/* ====================================================================
          DẢI BÁO ĐANG LỌC

          ⚠️ Vì sao PHẢI có dải này: bộ lọc đến từ đường dẫn (bấm thẻ ở trang
          Tổng quan) nên cán bộ không tự tay bật — mở ra thấy danh sách ngắn
          hơn thường ngày là dễ tưởng hệ thống mất dữ liệu.

          Nguyên tắc: KHÔNG BAO GIỜ giấu việc mà không nói. Lọc thì phải hiện
          rõ đang lọc gì và bỏ lọc ở đâu.
          ==================================================================== */}
      {(sla || assigned) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border-2 border-primary-300 bg-primary-50 px-3 py-2 dark:border-primary-700 dark:bg-primary-900/20">
          <span className="text-xs font-bold text-primary-800 dark:text-primary-200">
            Đang lọc:
          </span>
          {sla === 'overdue' && <span className="rounded-lg bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">Đã quá hạn</span>}
          {sla === 'near' && <span className="rounded-lg bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">Sắp hết hạn</span>}
          {sla === 'soon' && <span className="rounded-lg bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">Sắp hết hạn</span>}
          {assigned === 'none' && <span className="rounded-lg bg-slate-600 px-2 py-0.5 text-xs font-bold text-white">Chưa phân công</span>}
          {assigned === 'me' && <span className="rounded-lg bg-slate-600 px-2 py-0.5 text-xs font-bold text-white">Việc của tôi</span>}
          {/* Lọc theo một cán bộ cụ thể: hiện TÊN chứ không hiện mã số. Mã số
              chẳng nói lên điều gì, mà dải này sinh ra chính là để nói rõ đang
              lọc gì. Chưa tải xong danh sách thì lùi về chữ chung, không để
              trống — trống thì dải hiện ra mà không giải thích được gì. */}
          {/^[0-9]+$/.test(assigned) && (
            <span className="rounded-lg bg-slate-600 px-2 py-0.5 text-xs font-bold text-white">
              Phụ trách: {(danhSachCanBo ?? []).find((cb) => String(cb.id) === assigned)?.full_name ?? 'một cán bộ'}
            </span>
          )}
          <button
            type="button"
            onClick={() => { setSla(''); setAssigned(''); setPage(1); }}
            className="ml-auto rounded-lg border border-primary-300 bg-white px-2.5 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 dark:border-primary-700 dark:bg-slate-900 dark:text-primary-300"
          >
            Bỏ lọc, xem tất cả
          </button>
        </div>
      )}

      {/* ====================================================================
          SẮP XẾP

          Mặc định là thứ tự nghiệp vụ (khẩn cấp -> quá hạn -> mới nhất) — thứ
          tự đúng cho việc xử lý hằng ngày. Nhưng có lúc cán bộ cần rà lại đơn
          cũ tồn đọng, hoặc xem riêng nhóm ít khẩn cấp hay bị bỏ quên.
          ==================================================================== */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Sắp xếp:
        </span>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="mac_dinh">Ưu tiên xử lý (mặc định)</option>
          <option value="moi_nhat">Mới nhất trước</option>
          <option value="cu_nhat">Cũ nhất trước</option>
          <option value="muc_cao">Mức khẩn cấp: cao đến thấp</option>
          <option value="muc_thap">Mức khẩn cấp: thấp đến cao</option>
          {/* Máy chủ hỗ trợ sẵn kiểu này, trước nay ô chọn không liệt kê ra */}
          <option value="theo_can_bo">Gom theo cán bộ phụ trách</option>
        </select>

        {/* ================================================================
            LỌC THEO CÁN BỘ PHỤ TRÁCH

            Đặt ngay cạnh ô sắp xếp vì hai thứ hay dùng chung một lượt: trưởng
            phòng gom theo cán bộ để nhìn tổng thể, rồi chọn đúng một người để
            xem kỹ. Tách xa nhau thì mắt phải nhảy qua lại giữa hai đầu trang.

            Số trong ngoặc là số việc CHƯA XONG của cán bộ đó — chọn ai để giao
            thêm thì nhìn ngay ra, không phải mở từng người ra đếm.
            ================================================================ */}
        <span className="ml-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <UserRound className="h-3.5 w-3.5" />
          Cán bộ:
        </span>
        <select
          value={assigned}
          onChange={(e) => { setAssigned(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="">Tất cả cán bộ</option>
          <option value="me">Việc của tôi</option>
          <option value="none">Chưa phân công</option>
          {(danhSachCanBo ?? []).map((cb) => (
            <option key={cb.id} value={String(cb.id)}>
              {cb.full_name} ({cb.open_count})
            </option>
          ))}
        </select>

        {sort !== 'mac_dinh' && (
          /* Nhắc rõ đang không ở thứ tự mặc định — cán bộ hay quên rồi tưởng
             hệ thống sắp sai */
          <button
            type="button"
            onClick={() => { setSort('mac_dinh'); setPage(1); }}
            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Về mặc định
          </button>
        )}
      </div>

      {/* ====================================================================
          LỌC THEO 3 MỨC KHẨN CẤP

          Vì sao tách riêng thành thanh nút thay vì nhét vào ô chọn: mức khẩn
          cấp là thứ cán bộ nhìn ĐẦU TIÊN mỗi buổi sáng — "hôm nay có việc gì
          gấp không". Giấu trong ô chọn thì phải bấm hai lần mới thấy.

          Màu theo đúng mức nghiêm trọng: đỏ cho khẩn cấp, hổ phách cho quan
          trọng — trùng với màu nhãn hiển thị trên từng thẻ bên dưới, để mắt
          nối được ngay bộ lọc với kết quả.
          ==================================================================== */}
      <div className="mb-3 flex flex-wrap gap-2">
        {[
          { value: '',          nhan: 'Tất cả mức',  chon: 'bg-slate-700 text-white',
            thuong: 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800' },
          { value: 'urgent',    nhan: '🔴 Khẩn cấp',  chon: 'bg-rose-600 text-white',
            thuong: 'bg-white text-rose-700 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-900/30' },
          { value: 'important', nhan: '🟠 Quan trọng', chon: 'bg-amber-600 text-white',
            thuong: 'bg-white text-amber-700 hover:bg-amber-50 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-900/30' },
          { value: 'normal',    nhan: '⚪ Bình thường', chon: 'bg-slate-600 text-white',
            thuong: 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800' },
        ].map((m) => (
          <button
            key={m.value || 'all'}
            type="button"
            onClick={() => { setUrgency(m.value); setPage(1); }}
            className={
              'rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold transition dark:border-slate-700 '
              + (urgency === m.value ? m.chon : m.thuong)
            }
          >
            {m.nhan}
          </button>
        ))}
      </div>

      {/* Lọc nhóm + tìm kiếm */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Tất cả nhóm</option>
          <option value="to_giac">Tố giác tin báo</option>
          <option value="khieu_nai">Khiếu nại, tố cáo</option>
          <option value="phan_anh">Phản ánh, kiến nghị</option>
          <option value="de_xuat">Đề xuất, thắc mắc</option>
        </select>
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            className="w-full bg-transparent py-2 text-sm outline-none"
            placeholder="Tìm theo nội dung hoặc mã tra cứu..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
          />
          <button onClick={applySearch} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white">Tìm</button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải...</div>
      ) : data && data.data.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
            {data.data.map((s, i) => {
              const meta = STATUS_META[s.status];
              return (
                <Link
                  key={s.id}
                  to={`/quan-tri/y-kien/${s.id}`}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary-600 dark:text-primary-300">{s.tracking_code}
                      {/* CHẤM ĐỎ BÁO TIN NHẮN CHƯA ĐỌC.
                          Đặt ngay cạnh mã tra cứu — chỗ mắt cán bộ nhìn đầu
                          tiên khi lướt danh sách. Có số cụ thể để biết nhiều
                          hay ít, không chỉ là một dấu chấm mơ hồ. */}
                      {(s.tin_chua_doc ?? 0) > 0 && (
                        <span
                          className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-rose-600 px-1.5 py-0.5 align-middle text-[10px] font-bold text-white"
                          title={`${s.tin_chua_doc} tin nhắn mới từ người gửi`}
                        >
                          <MessageSquare className="h-2.5 w-2.5" />
                          {s.tin_chua_doc}
                        </span>
                      )}</span>
                      {s.urgency === 'urgent' && (
                        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          🔴 KHẨN CẤP
                        </span>
                      )}
                      {s.urgency === 'important' && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          🟡 Quan trọng
                        </span>
                      )}
                      {s.is_flagged ? <Flag className="h-3.5 w-3.5 text-rose-500" /> : null}
                  <SlaBadge sla={s.sla} daysLeft={s.daysLeft} compact />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-700 dark:text-slate-200">{s.ai_processed_content || s.original_content}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {s.sender_name} · {CATEGORY_LABEL[s.category_code || ''] || s.category_name} · {formatDateTime(s.created_at)}
                      {s.assigned_name ? ` · phụ trách: ${s.assigned_name}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta?.badge}`}>{meta?.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Phân trang */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Trang {data.page}/{data.totalPages} · Tổng {data.total} ý kiến
              {urgency && (
                /* Nhắc rõ đang lọc mức nào — cán bộ hay quên là mình đang bật
                   bộ lọc rồi tưởng hệ thống mất dữ liệu. */
                <span className="ml-1 font-semibold">
                  {urgency === 'urgent' ? '(mức Khẩn cấp)'
                    : urgency === 'important' ? '(mức Quan trọng)'
                    : '(mức Bình thường)'}
                </span>
              )}
              {isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-soft disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300"
              >
                <ChevronLeft className="h-4 w-4" /> Trước
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-soft disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300"
              >
                Sau <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 shadow-soft dark:bg-slate-900">
          Không có ý kiến nào phù hợp.
        </div>
      )}
    </AdminLayout>
  );
}
