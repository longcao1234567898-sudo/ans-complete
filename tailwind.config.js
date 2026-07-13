/** @type {import('tailwindcss').Config} */
// Bảng màu theo yêu cầu: xanh lá đậm (forest/emerald) + navy + vàng nhấn
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#059669',
          600: '#1B5E20',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        secondary: {
          50: '#eff6ff',
          100: '#dbeafe',
          400: '#60a5fa',
          500: '#1E3A5F',
          600: '#1e40af',
          700: '#1e3a8a',
        },
        accent: {
          100: '#fef3c7',
          500: '#F59E0B',
          600: '#d97706',
        },
      },
      fontFamily: {
        // Be Vietnam Pro: font Việt, dấu 2 tầng (Ố, Ộ, Ế, Ữ) hiển thị đầy đủ
        sans: ['"Be Vietnam Pro"', 'Inter', 'Roboto', 'system-ui', '-apple-system', 'sans-serif'],
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
        // Nền/chữ gradient chuyển động
        'gradient-x': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
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
        // Phà trôi qua lại chầm chậm trên sông
        'boat-drift': {
          '0%, 100%': { transform: 'translate(-70px, 0)' },
          '50%': { transform: 'translate(70px, -2px)' },
        },
        // Nhân vật nhún nhảy kiểu hoạt hình (nhấc lên + nghiêng nhẹ)
        'mascot-bob': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-9px) rotate(-2.5deg)' },
        },
        // Cây thốt nốt đung đưa trong gió
        'tree-sway': {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2.5deg)' },
        },
        // Mây trôi chậm rãi
        'cloud-drift': {
          '0%, 100%': { transform: 'translateX(-20px)' },
          '50%': { transform: 'translateX(20px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .5s ease-out both',
        float: 'float 5s ease-in-out infinite',
        'gradient-x': 'gradient-x 6s ease infinite',
        'ping-slow': 'ping-slow 3s ease-out infinite',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
        'wave-hand': 'wave-hand 1.6s ease-in-out infinite',
        blink: 'blink 4.5s ease-in-out infinite',
        'flag-wave': 'flag-wave 2.6s ease-in-out infinite',
        'boat-drift': 'boat-drift 14s ease-in-out infinite',
        'mascot-bob': 'mascot-bob 3.2s ease-in-out infinite',
        'tree-sway': 'tree-sway 5.5s ease-in-out infinite',
        'cloud-drift': 'cloud-drift 16s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
