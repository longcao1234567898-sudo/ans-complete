/**
 * Hai cấp vai trò ở giao diện (ADR-003 §1). Chỉ để ẩn hiện nút cho dễ dùng —
 * quyền thật kiểm ở máy chủ (server/src/lib/vai-tro.js). Hai danh sách phải khớp,
 * lệch thì cán bộ bấm vào nút hiện ra sẽ nhận 403.
 */
export const LANH_DAO = ['admin', 'manager'] as const;

export function laLanhDao(role: string | null | undefined): boolean {
  return (LANH_DAO as readonly string[]).includes(role ?? '');
}

export function tenVaiTro(role: string | null | undefined): string {
  return laLanhDao(role) ? 'Lãnh đạo' : 'Cán bộ';
}
