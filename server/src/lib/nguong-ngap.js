/**
 * NGƯỠNG MƯA THEO TỪNG TUYẾN HAY NGẬP (P53, nang_cap_v34.sql) — trả ND-051
 * ============================================================================
 *
 * Ngưỡng của ngành khí tượng (lib/du-bao-mua.js) là ngưỡng cả nước. Mỗi tuyến
 * ngập ở một mức mưa khác (cống, độ trũng, triều), và không có nguồn công khai
 * nào cho số đó ở từng tuyến của địa bàn. Nên hệ thống HỌC từ chính địa bàn:
 *
 *   1. Mỗi lần cán bộ bấm "Đang ngập", ghi lượng mưa lúc đó vào ngap_theo_mua:
 *      mưa dồn 3 giờ lớn nhất trong 12 giờ trước (trận mưa gây ngập thường đã
 *      qua lúc cán bộ ra tới nơi) và tổng 12 giờ — số của mô hình thời tiết.
 *   2. Từ 3 lần có số mưa trở lên -> GỢI Ý ngưỡng = hạng thấp của tứ phân vị
 *      dưới, làm tròn XUỐNG 5 mm. Chọn phía thấp: thà báo sớm còn hơn báo muộn.
 *   3. LÃNH ĐẠO quyết định đặt ngưỡng (nguong_ngap_duong). Máy chỉ gợi ý.
 *   4. Dự báo báo "Nguy cơ ngập" cho TỪNG TUYẾN:
 *        tuyến có ngưỡng riêng  -> mưa dồn 3 giờ dự báo ≥ ngưỡng
 *        tuyến chưa có ngưỡng   -> theo mức chung (Cảnh báo trở lên)
 *        mức Nguy hiểm          -> MỌI tuyến (lưới an toàn: đặt nhầm ngưỡng
 *                                  cao không được làm im cảnh báo mưa rất to)
 *
 * Chưa chạy nang_cap_v34.sql: không có ngưỡng riêng, mọi tuyến theo mức chung,
 * không ghi lịch sử — không lỗi.
 */
export const NGUONG_TOI_THIEU = 5;
export const NGUONG_TOI_DA = 300;
const SO_LAN_TOI_THIEU = 3;
const SO_LAN_GAN_DAY = 5;

const thieuBang = (e) => e?.code === 'ER_NO_SUCH_TABLE' || /doesn't exist|no such table/i.test(String(e?.message));

/** Gợi ý ngưỡng (mm mưa dồn 3 giờ) từ các lần đã ngập */
export function goiYNguong(cacLan) {
  const so = cacLan.filter((x) => x !== null && x !== undefined && Number.isFinite(Number(x))).map(Number).sort((a, b) => a - b);
  const kq = { soLan: so.length, thapNhat: so[0] ?? null, caoNhat: so[so.length - 1] ?? null, goiY: null };
  if (so.length < SO_LAN_TOI_THIEU) return kq;
  const q1 = so[Math.floor((so.length - 1) * 0.25)];
  kq.goiY = Math.min(NGUONG_TOI_DA, Math.max(NGUONG_TOI_THIEU, Math.floor(q1 / 5) * 5));
  return kq;
}

/** Ngưỡng hợp lệ: số nguyên 5–300, hoặc null (bỏ ngưỡng riêng) */
export const nguongHopLe = (v) => v === null || (Number.isInteger(v) && v >= NGUONG_TOI_THIEU && v <= NGUONG_TOI_DA);

/** Map hotspot_id -> ngưỡng. null = chưa chạy v34. */
export async function docNguong(pool) {
  try {
    const [r] = await pool.query('SELECT hotspot_id, nguong_mua_3h FROM nguong_ngap_duong');
    return new Map(r.map((x) => [Number(x.hotspot_id), Number(x.nguong_mua_3h)]));
  } catch (e) {
    if (thieuBang(e)) return null;
    throw e;
  }
}

/** Lịch sử ngập theo mưa của các tuyến: Map id -> { soLan, goiY, thapNhat, caoNhat, ganDay[] } */
export async function docLichSu(pool, ids) {
  const ra = new Map();
  if (ids.length === 0) return ra;
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT hotspot_id, xac_nhan_luc, mua_3h_lon_nhat, mua_12h FROM ngap_theo_mua
        WHERE hotspot_id IN (?) ORDER BY xac_nhan_luc DESC, id DESC`,
      [ids]
    );
  } catch (e) {
    if (thieuBang(e)) return ra;
    throw e;
  }
  for (const id of ids) {
    const cua = rows.filter((r) => Number(r.hotspot_id) === Number(id));
    if (cua.length === 0) continue;
    ra.set(Number(id), {
      ...goiYNguong(cua.map((r) => r.mua_3h_lon_nhat)),
      tongLanNgap: cua.length,
      ganDay: cua.slice(0, SO_LAN_GAN_DAY).map((r) => ({
        luc: r.xac_nhan_luc,
        mua3h: r.mua_3h_lon_nhat == null ? null : Number(r.mua_3h_lon_nhat),
        mua12h: r.mua_12h == null ? null : Number(r.mua_12h),
      })),
    });
  }
  return ra;
}

/**
 * Tuyến hay ngập ĐANG CÔNG KHAI có nguy cơ theo dự báo `kq` (kết quả duBaoMua.lay()).
 * Trả [{ id, ten, nguong }] — nguong null = tuyến theo mức chung.
 */
export async function duongNguyCo(pool, kq) {
  if (kq?.trangThai !== 'co_du_lieu') return [];
  let duong;
  try {
    [duong] = await pool.query(
      "SELECT id, ten FROM traffic_hotspots WHERE is_published = 1 AND loai = 'ngap' ORDER BY id"
    );
  } catch {
    return []; // chưa có bảng / chưa chạy v31: không có tuyến hay ngập nào
  }
  const nguong = (await docNguong(pool)) ?? new Map();
  return duong
    .map((d) => ({ id: Number(d.id), ten: d.ten, nguong: nguong.get(Number(d.id)) ?? null }))
    .filter((d) => {
      if (kq.muc >= 3) return true;
      if (d.nguong !== null) return Number(kq.mua3hLonNhat) >= d.nguong;
      return kq.muc >= 2;
    });
}

/* Ghi lịch sử chạy SAU khi đã trả lời cán bộ — không bắt cán bộ chờ dự báo */
const dangGhi = new Set();
/** Chỉ cho kiểm thử: chờ các lượt ghi lịch sử đang chạy xong */
export const choGhiXong = () => Promise.allSettled([...dangGhi]);

/** Ghi một lần ngập kèm lượng mưa lúc đó. `layDuBao` trả kết quả duBaoMua.lay(). */
export function ghiMuaKhiNgap(pool, { hotspotId, staffId, layDuBao }) {
  const viec = (async () => {
    let kq = null;
    try { kq = await layDuBao(); } catch { kq = null; }
    const co = kq?.trangThai === 'co_du_lieu';
    try {
      await pool.query(
        'INSERT INTO ngap_theo_mua (hotspot_id, mua_3h_lon_nhat, mua_12h, staff_id) VALUES (?,?,?,?)',
        [hotspotId, co ? kq.mua3hLonNhat12hQua ?? null : null, co ? kq.mua12hVuaQua ?? null : null, staffId]
      );
    } catch (e) {
      if (!thieuBang(e)) console.warn('[ngưỡng ngập] không ghi được lịch sử:', e.message);
    }
  })();
  dangGhi.add(viec);
  viec.finally(() => dangGhi.delete(viec));
  return viec;
}
