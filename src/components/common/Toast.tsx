/**
 * Cấu hình react-hot-toast dùng chung cho toàn ứng dụng.
 */
import { Toaster } from 'react-hot-toast';

export default function AppToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3500,
        style: {
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: 500,
        },
        success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
        error: { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
      }}
    />
  );
}
