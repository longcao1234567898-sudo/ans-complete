/**
 * Mock data cho toàn bộ hệ thống (AI, tra cứu, tin tức, chat).
 * Khi có backend thật, thay các mock này bằng lời gọi API tương ứng trong src/services/.
 */
import type { FeedbackCategory } from '../types/feedback';
import type { TrackingResult, TrackingStatus, TrackingStep } from '../types/tracking';
import type { NewsArticle } from '../types/news';
import { STATUS_MAP, UNIT } from './constants';

/* ------------------------------------------------------------------ */
/* 1. Từ khoá phân loại (đã bỏ dấu để khớp cả khi người dân viết thiếu dấu) */
/* ------------------------------------------------------------------ */
export const CATEGORY_KEYWORDS: Record<FeedbackCategory, string[]> = {
  to_giac: ['danh nhau', 'trom', 'cuop', 'ma tuy', 'danh bac', 'lua dao', 'hanh hung', 'chem', 'bao hanh', 'to giac'],
  khieu_nai: ['khieu nai', 'to cao', 'can bo', 'sai pham', 'thai do', 'nhung nhieu', 'cham tre ho so'],
  phan_anh: ['phan anh', 'on ao', 'tieng on', 'mat trat tu', 'tu tap', 'lan chiem', 'xa rac', 'dua xe', 'kien nghi'],
  de_xuat: ['de xuat', 'thac mac', 'hoi', 'thu tuc', 'huong dan', 'lam the nao', 'cccd', 'can cuoc', 'tam tru', 'tam vang', 'ho khau'],
};

/** Bản hiển thị có dấu của từ khoá (cho phần "AI nhận diện từ khoá") */
export const KEYWORD_DISPLAY: Record<string, string> = {
  'danh nhau': 'đánh nhau',
  trom: 'trộm',
  cuop: 'cướp',
  'ma tuy': 'ma tuý',
  'danh bac': 'đánh bạc',
  'lua dao': 'lừa đảo',
  'hanh hung': 'hành hung',
  chem: 'chém',
  'bao hanh': 'bạo hành',
  'to giac': 'tố giác',
  'khieu nai': 'khiếu nại',
  'to cao': 'tố cáo',
  'can bo': 'cán bộ',
  'sai pham': 'sai phạm',
  'thai do': 'thái độ',
  'nhung nhieu': 'nhũng nhiễu',
  'cham tre ho so': 'chậm trễ hồ sơ',
  'phan anh': 'phản ánh',
  'on ao': 'ồn ào',
  'tieng on': 'tiếng ồn',
  'mat trat tu': 'mất trật tự',
  'tu tap': 'tụ tập',
  'lan chiem': 'lấn chiếm',
  'xa rac': 'xả rác',
  'dua xe': 'đua xe',
  'kien nghi': 'kiến nghị',
  'de xuat': 'đề xuất',
  'thac mac': 'thắc mắc',
  hoi: 'hỏi',
  'thu tuc': 'thủ tục',
  'huong dan': 'hướng dẫn',
  'lam the nao': 'làm thế nào',
  cccd: 'CCCD',
  'can cuoc': 'căn cước',
  'tam tru': 'tạm trú',
  'tam vang': 'tạm vắng',
  'ho khau': 'hộ khẩu',
};

/* ------------------------------------------------------------------ */
/* 2. Dữ liệu tra cứu mẫu                                              */
/* ------------------------------------------------------------------ */

/** Dựng timeline các bước xử lý theo trạng thái hiện tại */
export function buildSteps(status: TrackingStatus, createdAt: string): TrackingStep[] {
  const base = new Date(createdAt).getTime();
  const at = (hours: number) => new Date(base + hours * 3_600_000).toISOString();

  const steps: TrackingStep[] = [
    {
      status: 'received',
      label: STATUS_MAP.received.label,
      timestamp: at(0),
      done: true,
      note: 'Hệ thống đã ghi nhận ý kiến và cấp mã tra cứu.',
    },
  ];

  if (status === 'received') {
    steps.push({ status: 'processing', label: STATUS_MAP.processing.label, timestamp: '', done: false });
    steps.push({ status: 'resolved', label: STATUS_MAP.resolved.label, timestamp: '', done: false });
    return steps;
  }

  steps.push({
    status: 'processing',
    label: STATUS_MAP.processing.label,
    timestamp: at(4),
    done: true,
    note: 'Cán bộ phụ trách đã tiếp nhận và đang xác minh.',
  });

  if (status === 'processing') {
    steps.push({ status: 'resolved', label: STATUS_MAP.resolved.label, timestamp: '', done: false });
    return steps;
  }

  steps.push({
    status,
    label: STATUS_MAP[status].label,
    timestamp: at(30),
    done: true,
    note:
      status === 'resolved'
        ? 'Vụ việc đã được giải quyết. Kết quả đã gửi đến công dân qua thông tin liên hệ.'
        : undefined,
  });
  return steps;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** Các mã tra cứu demo — dùng để trình diễn 4 trạng thái */
export const MOCK_TRACKING: TrackingResult[] = [
  {
    code: 'DEMO01',
    status: 'received',
    category: 'phan_anh',
    summary: 'Phản ánh về tình hình: "Tụ tập gây ồn ào ban đêm tại khóm Long Thị D, phường Long Thạnh."',
    createdAt: hoursAgo(2),
    steps: buildSteps('received', hoursAgo(2)),
  },
  {
    code: 'DEMO02',
    status: 'processing',
    category: 'to_giac',
    summary: 'Tố giác/tin báo về vụ việc: "Có người đánh nhau gần bến phà Tân Châu."',
    createdAt: hoursAgo(26),
    steps: buildSteps('processing', hoursAgo(26)),
  },
  {
    code: 'DEMO03',
    status: 'resolved',
    category: 'de_xuat',
    summary: 'Đề xuất/thắc mắc về nội dung: "Hỏi thủ tục đăng ký tạm trú cho người thuê trọ."',
    createdAt: hoursAgo(80),
    steps: buildSteps('resolved', hoursAgo(80)),
  },
  {
    code: 'DEMO04',
    status: 'rejected',
    category: 'khieu_nai',
    summary: 'Khiếu nại/tố cáo về nội dung: "Tranh chấp ranh giới đất giữa hai hộ liền kề."',
    createdAt: hoursAgo(100),
    steps: buildSteps('rejected', hoursAgo(100)),
    rejectionReason:
      'Nội dung tranh chấp đất đai không thuộc thẩm quyền giải quyết của Công an cấp xã. Đã hướng dẫn công dân gửi đơn đến UBND xã để được thụ lý theo quy định.',
  },
];

/* ------------------------------------------------------------------ */
/* 3. Kịch bản trả lời của trợ lý AI (mock, cá thể hoá theo địa phương) */
/* ------------------------------------------------------------------ */
export interface ChatRule {
  keywords: string[]; // đã bỏ dấu
  reply: string; // Markdown
}

export const CHAT_RULES: ChatRule[] = [
  {
    keywords: ['cccd', 'can cuoc', 'the can cuoc'],
    reply: `Chào bà con **${UNIT.communeName}**! Về thủ tục **cấp thẻ Căn cước**:\n\n1. Đặt lịch trên Cổng dịch vụ công hoặc đến trực tiếp trụ sở ${UNIT.name}.\n2. Mang theo giấy tờ tuỳ thân hiện có (CMND/CCCD cũ, giấy khai sinh nếu cấp lần đầu).\n3. Cán bộ thu nhận sinh trắc học (ảnh, vân tay, mống mắt) và trả **giấy hẹn**.\n\n⏱️ Thời gian trả kết quả: **tối đa 7 ngày làm việc**.\n\nBà con cần hỗ trợ đặt lịch không ạ?`,
  },
  {
    keywords: ['tam tru', 'tam vang', 'cu tru', 'ho khau', 'thue tro'],
    reply: `Về **đăng ký cư trú (tạm trú/tạm vắng)** tại ${UNIT.communeName}:\n\n- Cách nhanh nhất: khai báo trên ứng dụng **VNeID** hoặc Cổng dịch vụ công Bộ Công an.\n- Hồ sơ gồm: tờ khai thay đổi thông tin cư trú + giấy tờ chứng minh chỗ ở hợp pháp (hợp đồng thuê nhà...).\n- Chủ nhà trọ có trách nhiệm phối hợp khai báo cho người thuê.\n\n📞 Cần hỗ trợ trực tiếp, bà con gọi hotline **${UNIT.hotline}** trong giờ hành chính nhé!`,
  },
  {
    keywords: ['to giac', 'trinh bao', 'bao tin', 'khan cap', 'danh nhau', 'trom', 'cuop'],
    reply: `⚠️ Nếu vụ việc **đang diễn ra hoặc khẩn cấp**, bà con hãy gọi ngay **${UNIT.emergency}** hoặc hotline ${UNIT.name}: **${UNIT.hotline}**.\n\nVới tin báo không khẩn cấp, bà con có thể:\n1. Bấm nút **"Gửi ý kiến ngay"** trên trang chủ, chọn nhóm *Tố giác tin báo*.\n2. Mô tả rõ: thời gian, địa điểm, diễn biến vụ việc.\n3. Lưu lại **mã tra cứu 6 ký tự** để theo dõi tiến độ xử lý.\n\nDanh tính người tố giác được **bảo mật theo quy định pháp luật**.`,
  },
  {
    keywords: ['tra cuu', 'ma tra cuu', 'tien do', 'ket qua'],
    reply: `Để **tra cứu tiến độ xử lý**, bà con vào mục **Tra cứu** trên thanh menu, sau đó:\n\n- Nhập **mã 6 ký tự** in trên phiếu tiếp nhận, *hoặc*\n- Bấm biểu tượng camera để **quét mã QR**.\n\nHệ thống sẽ hiển thị timeline: *Đã tiếp nhận → Đang xử lý → Đã giải quyết*. Bà con thử mã demo \`DEMO02\` để xem trước nhé!`,
  },
  {
    keywords: ['lua dao', 'gia danh', 'chuyen khoan', 'mao danh'],
    reply: `🚨 **Cảnh giác lừa đảo!** Bà con ${UNIT.communeName} lưu ý:\n\n- Công an **không bao giờ** làm việc qua điện thoại rồi yêu cầu chuyển tiền hay đọc mã OTP.\n- Không cài ứng dụng lạ theo hướng dẫn của người tự xưng "cán bộ".\n- Khi nghi ngờ, hãy đến trực tiếp trụ sở ${UNIT.name} hoặc gọi **${UNIT.hotline}** để xác minh.\n\nNếu đã lỡ chuyển tiền, hãy báo ngay cho công an và ngân hàng để kịp thời phong toả.`,
  },
  {
    keywords: ['phap luat', 'van ban', 'nghi dinh', 'luat'],
    reply: `Bà con có thể tra cứu **văn bản pháp luật** chính thống tại:\n\n- Cơ sở dữ liệu quốc gia về pháp luật: *vbpl.vn*\n- Cổng thông tin Bộ Công an: *bocongan.gov.vn*\n\nNgoài ra, mục **Tin tức** của trang này thường xuyên cập nhật văn bản mới liên quan đến an ninh trật tự tại ${UNIT.communeName}. Bà con muốn hỏi về quy định cụ thể nào ạ?`,
  },
];

/** Câu trả lời mặc định khi không khớp kịch bản nào */
export const CHAT_FALLBACK = `Chào bà con **${UNIT.communeName}**! Tôi là trợ lý AI của ${UNIT.name} 🤖\n\nTôi có thể hỗ trợ về:\n- **Thủ tục hành chính**: căn cước, cư trú, xác nhận...\n- **An ninh trật tự**: cách gửi tố giác, tin báo, phản ánh\n- **Pháp luật địa phương**: quy định, văn bản mới\n\nBà con cứ đặt câu hỏi cụ thể, tôi sẽ cố gắng giải đáp. Trường hợp khẩn cấp, vui lòng gọi **${UNIT.emergency}**!`;

/* ------------------------------------------------------------------ */
/* 4. Tin tức & pháp luật (mock)                                       */
/* ------------------------------------------------------------------ */
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const MOCK_NEWS: NewsArticle[] = [
  {
    id: 'n1',
    title: 'Công an thị xã Tân Châu ra quân cao điểm bảo đảm ANTT tuyến biên giới Vĩnh Xương',
    summary:
      'Lực lượng Công an thị xã phối hợp Đồn Biên phòng cửa khẩu quốc tế Vĩnh Xương tuần tra khép kín tuyến biên giới, phòng chống buôn lậu, xuất nhập cảnh trái phép và tội phạm ma tuý.',
    thumbnail: 'https://picsum.photos/seed/htans-bien-gioi/640/400',
    publishedAt: daysAgo(1),
    tag: 'an_ninh',
    externalUrl: 'https://congan.angiang.gov.vn',
    source: 'congan.angiang.gov.vn',
  },
  {
    id: 'n2',
    title: 'Tuần tra đêm khép kín địa bàn các phường Long Thạnh, Long Châu, Long Phú',
    summary:
      'Tổ tuần tra 161 Công an thị xã Tân Châu duy trì tuần tra vũ trang ban đêm, kịp thời phát hiện, ngăn chặn các nhóm thanh thiếu niên tụ tập gây rối trật tự công cộng.',
    thumbnail: 'https://picsum.photos/seed/htans-tuantra/640/400',
    publishedAt: daysAgo(3),
    tag: 'an_ninh',
    externalUrl: UNIT.facebookUrl,
    source: 'Fanpage Công an TX Tân Châu',
  },
  {
    id: 'n3',
    title: 'Cảnh giác chiêu trò "việc nhẹ lương cao" dụ dỗ xuất cảnh trái phép sang Campuchia',
    summary:
      'Địa bàn biên giới Tân Châu là điểm nóng của thủ đoạn lôi kéo lao động vượt biên rồi cưỡng bức làm việc trong các cơ sở lừa đảo trực tuyến. Người dân tuyệt đối không tin lời mời chào trên mạng xã hội.',
    thumbnail: 'https://picsum.photos/seed/htans-canhgiac1/640/400',
    publishedAt: daysAgo(4),
    tag: 'canh_giac',
    externalUrl: 'https://bocongan.gov.vn',
    source: 'bocongan.gov.vn',
  },
  {
    id: 'n4',
    title: 'Giả danh công an gọi điện yêu cầu cài ứng dụng, chuyển tiền — thủ đoạn cũ, nạn nhân mới',
    summary:
      'Đối tượng mạo danh cán bộ điều tra đe doạ nạn nhân liên quan vụ án rồi yêu cầu chuyển tiền vào "tài khoản tạm giữ". Công an không bao giờ làm việc qua điện thoại kèm yêu cầu chuyển tiền, đọc mã OTP.',
    thumbnail: 'https://picsum.photos/seed/htans-canhgiac2/640/400',
    publishedAt: daysAgo(6),
    tag: 'canh_giac',
    externalUrl: 'https://luatvietnam.vn',
    source: 'luatvietnam.vn',
  },
  {
    id: 'n5',
    title: 'Hướng dẫn đăng ký cư trú trực tuyến trên ứng dụng VNeID',
    summary:
      'Từng bước khai báo tạm trú, tạm vắng ngay trên điện thoại: chuẩn bị giấy tờ, điền tờ khai điện tử, theo dõi kết quả — không cần đến trụ sở công an.',
    thumbnail: 'https://picsum.photos/seed/htans-thutuc1/640/400',
    publishedAt: daysAgo(8),
    tag: 'thu_tuc',
    externalUrl: 'https://dichvucong.gov.vn',
    source: 'dichvucong.gov.vn',
  },
  {
    id: 'n6',
    title: 'Công an Tân Châu cấp căn cước lưu động cho người già yếu, bệnh tật tại nhà',
    summary:
      'Tổ công tác mang thiết bị thu nhận sinh trắc học đến tận nhà phục vụ người cao tuổi, người khuyết tật trên địa bàn các phường, xã — bảo đảm không ai bị bỏ lại phía sau trong Đề án 06.',
    thumbnail: 'https://picsum.photos/seed/htans-thutuc2/640/400',
    publishedAt: daysAgo(10),
    tag: 'thu_tuc',
    externalUrl: 'https://congan.angiang.gov.vn',
    source: 'congan.angiang.gov.vn',
  },
  {
    id: 'n7',
    title: 'Nghị quyết 57-NQ/TW: đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia',
    summary:
      'Bộ Chính trị xác định khoa học công nghệ, đổi mới sáng tạo và chuyển đổi số là đột phá quan trọng hàng đầu — nền tảng để hiện đại hoá quản trị quốc gia, trong đó có chuyển đổi số ngành Công an.',
    thumbnail: 'https://picsum.photos/seed/htans-nq57/640/400',
    publishedAt: daysAgo(12),
    tag: 'van_ban',
    externalUrl: 'https://xaydungchinhsach.chinhphu.vn',
    source: 'xaydungchinhsach.chinhphu.vn',
  },
  {
    id: 'n8',
    title: 'Nghị quyết 66-NQ/TW về đổi mới công tác xây dựng và thi hành pháp luật trong kỷ nguyên mới',
    summary:
      'Hoàn thiện thể chế, đưa pháp luật đi vào cuộc sống — cơ sở chính trị quan trọng để các mô hình tiếp nhận ý kiến công dân như Hộp Thư An Ninh Số hoạt động minh bạch, đúng quy định.',
    thumbnail: 'https://picsum.photos/seed/htans-nq66/640/400',
    publishedAt: daysAgo(15),
    tag: 'van_ban',
    externalUrl: 'https://vbpl.vn',
    source: 'vbpl.vn',
  },
];
