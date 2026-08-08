/**
 * TRANG CHÍNH SÁCH BẢO MẬT — minh bạch cách hệ thống thu thập, lưu, bảo vệ dữ liệu.
 * Tạo niềm tin: người dân biết rõ thông tin của mình được xử lý ra sao.
 */
import { ShieldCheck, Lock, Eye, Trash2, Server, UserX } from 'lucide-react';
import PageBackground from '../components/common/PageBackground';
import Card from '../components/common/Card';

const SECTIONS = [
  {
    Icon: Server,
    title: 'Thông tin chúng tôi thu thập',
    body: 'Nội dung ý kiến bà con gửi; họ tên, số điện thoại, email (nếu bà con cung cấp); ảnh đính kèm; địa chỉ IP và loại thiết bị (để chống spam). Với ý kiến ẩn danh, chúng tôi KHÔNG thu thập họ tên, số điện thoại hay email.',
  },
  {
    Icon: Lock,
    title: 'Cách chúng tôi bảo vệ',
    body: 'Họ tên và số điện thoại được MÃ HOÁ bằng chuẩn AES-256 trước khi lưu — kể cả khi cơ sở dữ liệu bị xâm nhập cũng không đọc được. Mật khẩu cán bộ được băm một chiều. Ảnh đính kèm được tự động xoá thông tin vị trí (GPS) trước khi lưu.',
  },
  {
    Icon: Eye,
    title: 'Ai được xem thông tin',
    body: 'Chỉ cán bộ Công an có thẩm quyền, sau khi đăng nhập. Danh tính bà con được che sẵn trên màn hình; mỗi lần cán bộ xem đầy đủ đều bị GHI NHẬT KÝ (ai xem, lúc nào). Ý kiến tố giác ẩn danh: cán bộ KHÔNG thể xem danh tính.',
  },
  {
    Icon: UserX,
    title: 'Bảo vệ người tố giác',
    body: 'Nội dung tố giác tội phạm được phân tích NỘI BỘ, KHÔNG gửi sang bất kỳ dịch vụ trí tuệ nhân tạo bên ngoài nào. Bà con có thể gửi hoàn toàn ẩn danh mà vẫn theo dõi được kết quả qua mã tra cứu.',
  },
  {
    Icon: Trash2,
    title: 'Quyền của bà con',
    body: 'Bà con có quyền yêu cầu xem lại hoặc xoá ý kiến đã gửi bằng mã tra cứu, bằng cách liên hệ trực ban đơn vị. Dữ liệu ý kiến đã xử lý xong được lưu trữ theo quy định lưu trữ hồ sơ của ngành.',
  },
  {
    Icon: ShieldCheck,
    title: 'Mục đích sử dụng',
    body: 'Thông tin chỉ dùng để tiếp nhận, phân loại, xử lý và phản hồi ý kiến của bà con, phục vụ công tác bảo đảm an ninh trật tự. Không dùng cho mục đích thương mại, không chia sẻ cho bên thứ ba ngoài quy định pháp luật.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen">
      <PageBackground image="bg-nui-sam.webp" />
      <div className="container-page max-w-3xl py-10 sm:py-14">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-soft">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
            Chính sách bảo mật
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Cam kết bảo vệ thông tin và quyền riêng tư của bà con
          </p>
        </div>

        <div className="space-y-4">
          {SECTIONS.map(({ Icon, title, body }) => (
            <Card key={title} className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h2>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{body}</p>
              </div>
            </Card>
          ))}
        </div>

        <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-center text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Chính sách này có thể được cập nhật để phù hợp quy định pháp luật hiện hành.
          Mọi thắc mắc về quyền riêng tư, bà con vui lòng liên hệ trực ban đơn vị.
        </p>
      </div>
    </div>
  );
}
