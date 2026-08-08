/** @type {import('tailwindcss').Config} */
// Bảng màu theo yêu cầu: xanh lá đậm (forest/emerald) + navy + vàng nhấn
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ------------------------------------------------------------------
           XANH RÊU — màu quân phục Công an nhân dân. Màu chủ đạo toàn hệ thống.

           Bậc 600 (#1B5E20) GIỮ NGUYÊN như cũ để 108 chỗ đang dùng không đổi.
           Các bậc còn lại đã dựng lại quanh đúng sắc độ 124° của nó.

           LỖI CŨ ĐÃ SỬA: bậc 700 trước đây là #047857 — SÁNG HƠN bậc 600 và
           lệch sắc độ (163° so với 124°). Nên 13 nút dùng
           "primary-600 hover:primary-700" khi rê chuột lại SÁNG LÊN và chuyển
           từ xanh lá sang xanh ngọc — ngược với cảm giác "đang được nhấn".
           ------------------------------------------------------------------ */
        primary: {
          50: '#F2F8F2',
          100: '#DDEEDF',
          200: '#C1E2C3',
          300: '#94D198',
          400: '#5BC263',
          500: '#2E9E36',
          600: '#1B5E20', // ← màu thương hiệu, không đổi
          700: '#0E4F13',
          800: '#0A3D0E',
          900: '#062B09',
        },

        /* NAVY — sắc lễ phục. Bậc 500 (#1E3A5F) giữ nguyên. */
        secondary: {
          50: '#F1F4F9',
          100: '#DCE5F1',
          200: '#BCCEE6',
          300: '#91AED4',
          400: '#4A78B5',
          500: '#1E3A5F', // ← giữ nguyên
          600: '#1A3353',
          700: '#132844',
          800: '#0D1E35',
          900: '#081526',
        },

        /* ------------------------------------------------------------------
           VÀNG ĐỒNG — sắc huy hiệu, dùng để NHẤN, không dùng tràn lan.

           Bậc 500 (#F59E0B) giữ nguyên, nhưng CHỈ dùng làm nền cho chữ ĐẬM
           hoặc làm màu chữ/viền/biểu tượng.
           Chữ TRẮNG trên nền vàng phải dùng bậc 700 trở lên.

           LỖI CŨ ĐÃ SỬA: 5 nút dùng nền accent-500 + chữ trắng chỉ đạt
           tương phản 2,15:1 — chuẩn WCAG AA đòi tối thiểu 4,5:1.
           Đó lại chính là các nút "Gửi ý kiến ngay" quan trọng nhất.
           ------------------------------------------------------------------ */
        accent: {
          50: '#FEF8EE',
          100: '#FDECCE',
          200: '#FAD89E',
          300: '#F5C066',
          400: '#F6AD31',
          500: '#F59E0B', // ← nền badge (chữ đậm) · màu chữ/viền
          600: '#B37205',
          700: '#8E5B03', // ← nền cho chữ TRẮNG (5,76:1 ✅)
          800: '#704703',
          900: '#533603',
        },
      },
      fontFamily: {
        // Be Vietnam Pro: font Việt, dấu 2 tầng (Ố, Ộ, Ế, Ữ) hiển thị đầy đủ.
        // Dùng cho toàn bộ nội dung, nút bấm, biểu mẫu.
        sans: ['"Be Vietnam Pro"', 'Inter', 'Roboto', 'system-ui', '-apple-system', 'sans-serif'],

        // Bitter (slab serif) — dùng cho TIÊU ĐỀ.
        //
        // Vì sao chọn chân chữ (serif): Nghị định 30/2020/NĐ-CP quy định văn bản
        // hành chính dùng phông chữ có chân. Tiêu đề có chân tạo liên tưởng tới
        // công văn, giấy tờ chính thức — đúng chất một trang của cơ quan nhà nước.
        // Bitter là slab serif, nét chân vuông chắc, đọc rõ trên màn hình
        // (khác Times vốn dựng cho in giấy), và có đủ bộ dấu tiếng Việt.
        display: ['Bitter', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 4px 24px -6px rgb(6 78 59 / 0.12)',
        glow: '0 8px 32px -8px rgb(5 150 105 / 0.45)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Icon trôi nổi nhẹ nhàng trong hero
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        // Vòng lan toả chậm rãi, êm dịu cho nút chat
        'ping-slow': {
          '0%': { transform: 'scale(1)', opacity: '0.3' },
          '80%, 100%': { transform: 'scale(1.55)', opacity: '0' },
        },
        // Dấu 3 chấm nhấp nhô kiểu Messenger: biên độ nhỏ, mềm mại, so le
        'typing-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '30%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        // Tay chú công an mini vẫy qua lại
        'wave-hand': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '50%': { transform: 'rotate(-16deg)' },
        },
        // Mắt chớp định kỳ (thi thoảng nháy một cái)
        blink: {
          '0%, 90%, 100%': { transform: 'scaleY(1)' },
          '94%': { transform: 'scaleY(0.12)' },
        },
        // Lá cờ bay lượn trong gió: 2 nhịp phất tự nhiên
        'flag-wave': {
          '0%, 100%': { transform: 'skewY(0deg)' },
          '30%': { transform: 'skewY(-4.5deg)' },
          '60%': { transform: 'skewY(1.8deg)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .5s ease-out both',
        float: 'float 5s ease-in-out infinite',
        'ping-slow': 'ping-slow 3s ease-out infinite',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
        'wave-hand': 'wave-hand 1.6s ease-in-out infinite',
        blink: 'blink 4.5s ease-in-out infinite',
        'flag-wave': 'flag-wave 2.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
