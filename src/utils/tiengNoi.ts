/**
 * ĐỌC TO TIẾNG VIỆT CÓ NHỊP ĐIỆU — tiện ích dùng chung cho mọi nút loa trong hệ thống.
 * ============================================================================
 *
 * Gom về một chỗ cho vòng hướng dẫn, dải 5 bước, nút cảnh giác, đọc tin tức...
 * Vừa xử lý các hạn chế của Web Speech / giọng trên máy, vừa chia nhịp đọc
 * tiếng Việt tự nhiên: nhấn rõ tiêu đề và ý trọng tâm, nghỉ hơi đúng chỗ giữa
 * các vế/câu và hạ giọng nhẹ nhàng ở câu kết (giữ cao độ trong khoảng hẹp
 * [0.95, 1.05] để bảo toàn tuyệt đối 6 thanh điệu tiếng Việt).
 *
 * BỐN NGUYÊN TẮC KỸ THUẬT:
 *
 * 1. GIỌNG VIỆT TẢI TRỄ
 *    getVoices() ở lần gọi đầu thường trả về mảng RỖNG. Hệ thống nạp sẵn từ lúc
 *    mở trang và chờ tối đa 250ms qua `voiceschanged` khi lùi về giọng máy.
 *
 * 2. CÂU DÀI BỊ CẮT NGANG & ĐƠN ĐIỆU
 *    Chrome tự ngắt khi câu dài > 15 giây; đọc liền một hơi thì đều đều, khó
 *    nghe với người lớn tuổi. Nay tách thành các nhịp (tiêu đề -> nghỉ hơi ->
 *    vế mở ý -> vế/câu nhấn -> hạ giọng kết), kèm khoảng nghỉ giữa các nhịp.
 *
 * 3. CHỌN GIỌNG VIỆT TỐT NHẤT (xếp hạng rõ ràng)
 *    Ưu tiên theo thứ tự: giọng Neural / Natural tiếng Việt (HoaiMy, NamMinh...)
 *    -> Google Tiếng Việt -> Apple Linh -> giọng vi-VN khác -> giọng 'vi'.
 *
 * 4. MẠNG CÓ /api/tts -> ƯU TIÊN MÁY CHỦ CHO TIẾNG VIỆT (vẫn giữ nhịp & nạp trước)
 *    Máy người dùng có thể thiếu giọng Việt nên ưu tiên audio /api/tts khi
 *    ma === 'vi' và đã cấu hình VITE_API_URL (áp preservesPitch khi chỉnh nhẹ
 *    tốc độ nhấn-hạ). Khi đọc tiếng Anh (ma === 'en') hoặc máy chủ không sẵn
 *    sàng thì chạy Web Speech với bộ giọng và nhịp tương ứng.
 * ============================================================================
 */

export interface ThongTinGiong {
  name: string;
  lang: string;
  localService?: boolean;
}

export type VaiTroNhip =
  | 'tieuDe'
  | 'tieuDePhu'
  | 'moY'
  | 'than'
  | 'nhanManh'
  | 'haGiong'
  | 'chucMung';

export interface NhipDoc {
  vanBan: string;
  vaiTro: VaiTroNhip;
  nghiSauMs: number;
  tocDo: number;
  caoDo: number;
  amLuong: number;
}

export interface DieuKhienDoc {
  /** Dừng đọc ngay */
  dung: () => void;
}

/** Bộ nhớ đệm danh sách giọng — nạp một lần, dùng lại. */
let cacheGiong: SpeechSynthesisVoice[] = [];

function docDanhSachGiong(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const ds = window.speechSynthesis.getVoices();
  if (ds.length) cacheGiong = ds;
  return cacheGiong;
}

/* Lắng nghe sự kiện giọng sẵn sàng — nạp danh sách vào cache ngay khi trình
   duyệt nạp xong, để lần bấm đầu tiên đã có giọng Việt. */
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  docDanhSachGiong();
  const synth = window.speechSynthesis;
  if (typeof synth.addEventListener === 'function') {
    synth.addEventListener('voiceschanged', docDanhSachGiong);
  } else {
    synth.onvoiceschanged = () => { docDanhSachGiong(); };
  }
}

/**
 * Xếp hạng và chọn giọng đọc tự nhiên nhất từ danh sách giọng hiện có.
 *
 * Ưu tiên tiếng Việt: Natural/Neural/Online (HoaiMy, NamMinh...) > Google >
 * Apple Linh > vi-VN khác > mã bắt đầu bằng 'vi'. Không bao giờ trả về giọng
 * ngoại nếu đang tìm giọng tiếng Việt.
 */
export function xepHangGiong<T extends ThongTinGiong>(
  voices: readonly T[],
  ma: 'vi' | 'en' = 'vi'
): T | undefined {
  const tienTo = `${ma}-`;
  const phuHop = voices.filter((v) => {
    const lang = (v.lang || '').trim().toLowerCase().replace(/_/g, '-');
    return lang === ma || lang.startsWith(tienTo);
  });
  if (phuHop.length === 0) return undefined;

  const chuanLang = ma === 'en' ? 'en-us' : 'vi-vn';
  const diem = (v: T): number => {
    const ten = v.name || '';
    const lang = (v.lang || '').trim().toLowerCase().replace(/_/g, '-');
    let d = 10;

    if (lang === chuanLang) d += 100;
    else if (ma === 'en' && lang.startsWith('en-gb')) d += 50;

    if (ma === 'vi') {
      if (/hoaimy|namminh|natural|neural|wavenet/i.test(ten)) d += 1200;
      else if (/online|premium|enhanced/i.test(ten)) d += 1000;
      else if (/google/i.test(ten)) d += 800;
      else if (/\blinh\b/i.test(ten)) d += 600;
    } else {
      if (/natural|neural|wavenet|premium|enhanced/i.test(ten)) d += 1200;
      else if (/online/i.test(ten)) d += 1000;
      else if (/google/i.test(ten)) d += 800;
    }
    return d;
  };

  let totNhat = phuHop[0];
  let diemCaoNhat = diem(totNhat);
  for (let i = 1; i < phuHop.length; i += 1) {
    const d = diem(phuHop[i]);
    if (d > diemCaoNhat) {
      diemCaoNhat = d;
      totNhat = phuHop[i];
    }
  }
  return totNhat;
}

function chonGiong(ma: 'vi' | 'en' = 'vi'): SpeechSynthesisVoice | undefined {
  return xepHangGiong(docDanhSachGiong(), ma);
}

function choGiongSanSang(toiDaMs = 250): Promise<SpeechSynthesisVoice[]> {
  const san = docDanhSachGiong();
  if (san.length > 0) return Promise.resolve(san);
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }
  const synth = window.speechSynthesis;
  return new Promise((resolve) => {
    let xong = false;
    let hen: ReturnType<typeof setTimeout> | null = null;
    const khiDoi = () => {
      if (docDanhSachGiong().length > 0) ketThuc();
    };
    const ketThuc = () => {
      if (xong) return;
      xong = true;
      if (hen) clearTimeout(hen);
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', khiDoi);
      }
      resolve(docDanhSachGiong());
    };
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', khiDoi);
    }
    hen = setTimeout(ketThuc, toiDaMs);
  });
}

function kep(so: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, so));
}

function chuanHoaVanBan(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\.{3}/g, '…')
    .replace(/[ \t]*([—–])[ \t]*/g, ' $1 ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Tách đoạn quá dài theo dấu phẩy rồi mới tới khoảng trắng để mọi nhịp <= maxKyTu. */
function catDoanNgan(cau: string, maxKyTu: number): string[] {
  const sach = cau.trim();
  if (!sach) return [];
  if (sach.length <= maxKyTu) return [sach];

  const manhPhay = sach.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  const gop: string[] = [];
  let dem = '';
  for (const manh of manhPhay) {
    const ungVien = dem ? `${dem}, ${manh}` : manh;
    if (ungVien.length > maxKyTu) {
      if (dem) gop.push(dem);
      dem = manh;
    } else {
      dem = ungVien;
    }
  }
  if (dem) gop.push(dem);

  const ket: string[] = [];
  for (const doan of gop) {
    if (doan.length <= maxKyTu) {
      ket.push(doan);
      continue;
    }
    let buoc = '';
    for (const tu of doan.split(' ')) {
      const ungVien = buoc ? `${buoc} ${tu}` : tu;
      if (ungVien.length > maxKyTu) {
        if (buoc) ket.push(buoc);
        buoc = tu;
      } else {
        buoc = ungVien;
      }
    }
    if (buoc) ket.push(buoc);
  }
  return ket;
}

function laCauNhanManh(cau: string, ma: 'vi' | 'en'): boolean {
  if (ma === 'en') {
    return /(?:optional|only available|automatically|do not|never|tap this|save it)/i.test(cau);
  }
  return /(?:không bắt buộc|chỉ có ở|nhớ lưu|tự xoá|tự động xoá|không cần|bấm nút này|bấm vào|bấm tiếp tục|bấm lại nút|máy tự chuyển|giữ kín|cảnh giác|không bao giờ|tắt máy|gọi 113)/i.test(cau);
}

/** Chia một câu cân đối tại dấu phẩy gần giữa nhất để tạo nhịp mở ý -> hạ/nhấn. */
function tachMoYCanDoi(cau: string): [string, string] | null {
  if (cau.length < 58) return null;
  const giua = cau.length / 2;
  let viTriTot = -1;
  let lechMin = Infinity;

  for (let i = 0; i < cau.length; i += 1) {
    if (cau[i] !== ',') continue;
    const veTruoc = cau.slice(0, i).trim();
    const veSau = cau.slice(i + 1).trim();
    if (veTruoc.length >= 20 && veSau.length >= 20) {
      const lech = Math.abs(i - giua);
      if (lech < lechMin) {
        lechMin = lech;
        viTriTot = i;
      }
    }
  }

  if (viTriTot < 0) return null;
  return [cau.slice(0, viTriTot + 1).trim(), cau.slice(viTriTot + 1).trim()];
}

const THONG_SO_NHIP: Record<VaiTroNhip, { tocDo: number; caoDo: number; amLuong: number }> = {
  tieuDe: { tocDo: 0.93, caoDo: 1.04, amLuong: 1.0 },
  tieuDePhu: { tocDo: 0.94, caoDo: 1.02, amLuong: 1.0 },
  moY: { tocDo: 0.96, caoDo: 1.02, amLuong: 0.98 },
  than: { tocDo: 0.96, caoDo: 1.0, amLuong: 0.96 },
  nhanManh: { tocDo: 0.91, caoDo: 1.03, amLuong: 1.0 },
  haGiong: { tocDo: 0.91, caoDo: 0.96, amLuong: 0.93 },
  chucMung: { tocDo: 0.95, caoDo: 1.05, amLuong: 1.0 },
};

function taoNhip(
  vanBan: string,
  vaiTro: VaiTroNhip,
  nghiSauMs: number,
  ghiDe?: Partial<Pick<NhipDoc, 'tocDo' | 'caoDo' | 'amLuong'>>
): NhipDoc {
  const goc = THONG_SO_NHIP[vaiTro];
  return {
    vanBan,
    vaiTro,
    nghiSauMs,
    tocDo: ghiDe?.tocDo ?? goc.tocDo,
    caoDo: ghiDe?.caoDo ?? goc.caoDo,
    amLuong: ghiDe?.amLuong ?? goc.amLuong,
  };
}

/**
 * Biến tiêu đề + nội dung thành kịch bản đọc có nhịp: tiêu đề nhấn rõ,
 * nghỉ hơi vừa phải, ngắt nhẹ ở vế mở ý, chậm chắc ở câu lưu ý và hạ giọng
 * ấm áp ở câu kết.
 */
export function taoKichBanNhip(
  dauVao: { tieuDe?: string; noiDung: string },
  ma: 'vi' | 'en' = 'vi',
  cheDo: 'speech' | 'audio' = 'speech'
): NhipDoc[] {
  let tieuDe = chuanHoaVanBan(dauVao.tieuDe ?? '');
  let noiDung = chuanHoaVanBan(dauVao.noiDung ?? '');

  /* Tự tách tiêu đề khi nơi gọi chỉ truyền một chuỗi bắt đầu bằng "Bước X trên 5."
     (ví dụ lời đọc ở dải 5 bước HuongDanBuoc). */
  if (!tieuDe && noiDung) {
    const khop = noiDung.match(/^((?:Bước\s+\d+\s+trên\s+\d+|Step\s+\d+\s+of\s+\d+)\.)\s*([\s\S]*)$/i);
    if (khop) {
      tieuDe = khop[1].trim();
      noiDung = khop[2].trim();
    }
  }

  const maxKyTu = cheDo === 'audio' ? 190 : 180;
  const cacCau: string[] = [];
  if (noiDung) {
    for (const doan of noiDung.split(/\n+/)) {
      for (const cau of doan.split(/(?<=[.!?…])\s+/)) {
        const sach = cau.trim();
        if (sach) cacCau.push(sach);
      }
    }
  }

  const ketQua: NhipDoc[] = [];

  if (tieuDe) {
    const coNoiDung = cacCau.length > 0;
    if (cheDo === 'speech') {
      const khopGach = tieuDe.match(/^(.+?)\s+[—–]\s+(.+)$/);
      if (khopGach) {
        const veTruoc = catDoanNgan(khopGach[1], maxKyTu);
        const veSau = catDoanNgan(khopGach[2], maxKyTu);
        veTruoc.forEach((m, idx) => {
          ketQua.push(
            taoNhip(
              m,
              'tieuDe',
              idx < veTruoc.length - 1 ? 140 : 190,
              { tocDo: 0.92, caoDo: 1.05, amLuong: 1.0 }
            )
          );
        });
        veSau.forEach((m, idx) => {
          ketQua.push(
            taoNhip(
              m,
              'tieuDePhu',
              idx < veSau.length - 1 ? 140 : (coNoiDung ? 380 : 0)
            )
          );
        });
      } else {
        const manhTieuDe = catDoanNgan(tieuDe, maxKyTu);
        manhTieuDe.forEach((m, idx) => {
          ketQua.push(
            taoNhip(
              m,
              'tieuDe',
              idx < manhTieuDe.length - 1 ? 140 : (coNoiDung ? 360 : 0)
            )
          );
        });
      }
    } else {
      const tieuDeAudio = tieuDe.replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,+/g, ',').trim();
      const manhAudio = catDoanNgan(tieuDeAudio, maxKyTu);
      manhAudio.forEach((m, idx) => {
        ketQua.push(
          taoNhip(
            m,
            'tieuDe',
            idx < manhAudio.length - 1 ? 140 : (coNoiDung ? 360 : 0),
            { tocDo: 0.94, caoDo: 1.0, amLuong: 1.0 }
          )
        );
      });
    }
  }

  for (let idxCau = 0; idxCau < cacCau.length; idxCau += 1) {
    const cau = cacCau[idxCau];
    const laCauCuoi = idxCau === cacCau.length - 1;
    const ketBangChamThan = /!\s*$/.test(cau);
    const nhan = laCauNhanManh(cau, ma);

    let vaiTroCuoi: VaiTroNhip;
    let ghiDeCuoi: Partial<Pick<NhipDoc, 'tocDo' | 'caoDo' | 'amLuong'>> | undefined;
    let nghiKetCau: number;

    if (ketBangChamThan) {
      vaiTroCuoi = 'chucMung';
      nghiKetCau = laCauCuoi ? 0 : 320;
    } else if (nhan && laCauCuoi) {
      vaiTroCuoi = 'nhanManh';
      ghiDeCuoi = { tocDo: 0.89, caoDo: 0.97, amLuong: 0.98 };
      nghiKetCau = 0;
    } else if (nhan) {
      vaiTroCuoi = 'nhanManh';
      nghiKetCau = 310;
    } else if (laCauCuoi) {
      vaiTroCuoi = 'haGiong';
      nghiKetCau = 0;
    } else {
      vaiTroCuoi = 'than';
      nghiKetCau = 280;
    }

    if (cau.length > maxKyTu) {
      const manh = catDoanNgan(cau, maxKyTu);
      manh.forEach((m, j) => {
        if (j < manh.length - 1) {
          ketQua.push(taoNhip(m, j === 0 ? 'moY' : 'than', 140));
        } else {
          ketQua.push(taoNhip(m, vaiTroCuoi, nghiKetCau, ghiDeCuoi));
        }
      });
      continue;
    }

    if (cheDo === 'speech') {
      const cap = tachMoYCanDoi(cau);
      if (cap) {
        ketQua.push(taoNhip(cap[0], 'moY', 140));
        ketQua.push(taoNhip(cap[1], vaiTroCuoi, nghiKetCau, ghiDeCuoi));
        continue;
      }
    }

    ketQua.push(taoNhip(cau, vaiTroCuoi, nghiKetCau, ghiDeCuoi));
  }

  if (ketQua.length > 0) {
    ketQua[ketQua.length - 1].nghiSauMs = 0;
  }

  return ketQua;
}

/* Địa chỉ máy chủ, để gọi route đọc /api/tts. Đọc an toàn với optional chaining
   để test Node có thể import trực tiếp module này mà không lỗi import.meta.env. */
const API_URL =
  ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ?? '')
    .trim()
    .replace(/\/$/, '');

/**
 * Phát tệp âm thanh tiếng Việt theo từng nhịp từ MÁY CHỦ (/api/tts), áp dụng
 * nhịp nghỉ hơi, giữ nguyên thanh điệu (preservesPitch) và nạp trước nhịp kế tiếp.
 *
 * @param onLoi  gọi khi nhịp ĐẦU TIÊN phát lỗi — để nơi gọi lùi về Web Speech.
 */
function docBangAudioTheoNhip(
  cacNhip: NhipDoc[],
  onXong?: () => void,
  onLoi?: () => void
): DieuKhienDoc {
  if (!API_URL || cacNhip.length === 0) {
    onLoi?.();
    return { dung: () => {} };
  }

  let i = 0;
  let daDung = false;
  let daPhatDuocMauNao = false;
  let daKetThuc = false;
  let henNghi: ReturnType<typeof setTimeout> | null = null;
  const audio = new Audio();
  let napTruoc: HTMLAudioElement | null = null;

  const taoUrlTts = (vanBan: string) => `${API_URL}/api/tts?q=${encodeURIComponent(vanBan)}`;

  const xoaNapTruoc = () => {
    if (napTruoc) {
      napTruoc.src = '';
      napTruoc = null;
    }
  };

  const bao = (cb?: () => void) => {
    if (daKetThuc) return;
    daKetThuc = true;
    cb?.();
  };

  const chuanBiNapTruoc = (chiSoKe: number) => {
    xoaNapTruoc();
    if (chiSoKe >= cacNhip.length) return;
    const phanTuNap = new Audio();
    phanTuNap.preload = 'auto';
    phanTuNap.src = taoUrlTts(cacNhip[chiSoKe].vanBan);
    napTruoc = phanTuNap;
  };

  const phatTiep = () => {
    if (daDung || i >= cacNhip.length) {
      xoaNapTruoc();
      bao(onXong);
      return;
    }

    const nhip = cacNhip[i];
    const apThongSoAudio = () => {
      const el = audio as HTMLAudioElement & { preservesPitch?: boolean };
      el.preservesPitch = true;
      el.volume = kep(nhip.amLuong, 0, 1);
      el.playbackRate = kep(nhip.tocDo, 0.75, 1.35);
    };

    audio.src = taoUrlTts(nhip.vanBan);
    apThongSoAudio();
    audio.onloadedmetadata = apThongSoAudio;
    audio.onplaying = () => {
      apThongSoAudio();
      daPhatDuocMauNao = true;
      chuanBiNapTruoc(i + 1);
    };
    audio.onended = () => {
      if (daDung) return;
      const nghi = nhip.nghiSauMs;
      i += 1;
      if (i >= cacNhip.length) {
        xoaNapTruoc();
        bao(onXong);
        return;
      }
      if (nghi > 0) {
        henNghi = setTimeout(() => {
          henNghi = null;
          phatTiep();
        }, nghi);
      } else {
        phatTiep();
      }
    };
    audio.onerror = () => {
      if (daDung) return;
      if (!daPhatDuocMauNao && i === 0) {
        xoaNapTruoc();
        bao(onLoi);
        return;
      }
      i += 1;
      phatTiep();
    };

    audio.play().catch(() => {
      if (daDung) return;
      if (!daPhatDuocMauNao && i === 0) {
        xoaNapTruoc();
        bao(onLoi);
        return;
      }
      xoaNapTruoc();
      bao(onXong);
    });
  };

  phatTiep();

  return {
    dung: () => {
      if (daDung) return;
      daDung = true;
      if (henNghi) {
        clearTimeout(henNghi);
        henNghi = null;
      }
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.onloadedmetadata = null;
      audio.pause();
      audio.src = '';
      xoaNapTruoc();
      bao(onXong);
    },
  };
}

function chayWebSpeechTheoNhip(
  cacNhip: NhipDoc[],
  giong: SpeechSynthesisVoice | undefined,
  ma: 'vi' | 'en',
  onXong?: () => void
): DieuKhienDoc {
  const synth = window.speechSynthesis;
  let i = 0;
  let daDung = false;
  let daBaoXong = false;
  let henNghi: ReturnType<typeof setTimeout> | null = null;
  /* Giữ tham chiếu utterance đang phát để Chromium không dọn rác làm mất onend. */
  let phatHienTai: SpeechSynthesisUtterance | null = null;

  const baoXong = () => {
    if (daBaoXong) return;
    daBaoXong = true;
    phatHienTai = null;
    onXong?.();
  };

  const docTiep = () => {
    if (daDung || i >= cacNhip.length) {
      baoXong();
      return;
    }
    const nhip = cacNhip[i];
    const u = new SpeechSynthesisUtterance(nhip.vanBan);
    u.lang = ma === 'en' ? 'en-US' : 'vi-VN';
    u.rate = kep(nhip.tocDo, 0.75, 1.35);
    u.pitch = kep(nhip.caoDo, 0.95, 1.05);
    u.volume = kep(nhip.amLuong, 0, 1);
    if (giong) u.voice = giong;

    const chuyenNhipSau = () => {
      if (daDung) return;
      i += 1;
      if (i >= cacNhip.length) {
        baoXong();
        return;
      }
      if (nhip.nghiSauMs > 0) {
        henNghi = setTimeout(() => {
          henNghi = null;
          docTiep();
        }, nhip.nghiSauMs);
      } else {
        docTiep();
      }
    };

    u.onend = chuyenNhipSau;
    u.onerror = () => {
      if (daDung) return;
      i += 1;
      docTiep();
    };

    phatHienTai = u;
    synth.speak(u);
  };

  /* Nếu Web Speech đang phát dở từ lượt cũ, chờ 30ms sau synth.cancel() để
     trình duyệt nhân Chromium không nuốt mất nhịp đầu tiên. */
  if (synth.speaking || synth.pending) {
    synth.cancel();
    henNghi = setTimeout(() => {
      henNghi = null;
      docTiep();
    }, 30);
  } else {
    docTiep();
  }

  return {
    dung: () => {
      if (daDung) return;
      daDung = true;
      if (henNghi) {
        clearTimeout(henNghi);
        henNghi = null;
      }
      if (phatHienTai) {
        phatHienTai.onend = null;
        phatHienTai.onerror = null;
        phatHienTai = null;
      }
      synth.cancel();
      baoXong();
    },
  };
}

/* ============================================================================
   CHỈ MỘT LUỒNG ĐỌC TẠI MỘT THỜI ĐIỂM

   Mỗi nút đọc (đọc từng bài, nghe toàn bộ tin, hướng dẫn bước) trước đây tự
   quản luồng của mình, không biết nút khác. Bấm nghe bài B trong khi bài A
   đang đọc thì cả hai đọc chồng lên nhau, chói tai.

   Giữ tham chiếu tới luồng đang chạy ở cấp module. Mỗi lần bắt đầu đọc mới thì
   dừng luồng cũ trước. Nút nào bị dừng sẽ nhận onXong (qua dung()) nên tự cập
   nhật lại nhãn về "Nghe".
   ============================================================================ */
let dangChay: DieuKhienDoc | null = null;

function dungLuongCu() {
  if (dangChay) {
    const cu = dangChay;
    dangChay = null;
    cu.dung();
  }
}

function docVoiNhip(
  dauVao: { tieuDe?: string; noiDung: string },
  onXong?: () => void,
  ma: 'vi' | 'en' = 'vi'
): DieuKhienDoc {
  dungLuongCu();

  let daHuy = false;
  let daKetThuc = false;
  let dkCon: DieuKhienDoc = { dung: () => {} };

  const dieuKhien: DieuKhienDoc = {
    dung: () => {
      daHuy = true;
      if (dangChay === dieuKhien) dangChay = null;
      dkCon.dung();
      baoXong();
    },
  };

  const baoXong = () => {
    if (daKetThuc) return;
    daKetThuc = true;
    if (dangChay === dieuKhien) dangChay = null;
    onXong?.();
  };

  dangChay = dieuKhien;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined' && ma === 'vi') {
      const nhipAudio = taoKichBanNhip(dauVao, 'vi', 'audio');
      if (nhipAudio.length === 0) {
        baoXong();
        return dieuKhien;
      }
      dkCon = docBangAudioTheoNhip(nhipAudio, baoXong, baoXong);
      return dieuKhien;
    }
    baoXong();
    return dieuKhien;
  }

  const batDauWebSpeech = () => {
    if (daHuy) return;
    const nhipSpeech = taoKichBanNhip(dauVao, ma, 'speech');
    if (nhipSpeech.length === 0) {
      baoXong();
      return;
    }
    const khoiChay = (giong?: SpeechSynthesisVoice) => {
      if (daHuy) return;
      if (!giong && ma === 'vi') {
        console.warn(
          '[đọc tiếng Việt] Máy này KHÔNG có giọng tiếng Việt nào -> sẽ đọc bằng ' +
          'giọng mặc định (thường là tiếng Anh). Cần /api/tts hoạt động để đọc đúng.'
        );
      }
      dkCon = chayWebSpeechTheoNhip(nhipSpeech, giong, ma, baoXong);
    };

    const giongSan = chonGiong(ma);
    if (giongSan) {
      khoiChay(giongSan);
    } else {
      void choGiongSanSang(250).then(() => {
        khoiChay(chonGiong(ma));
      });
    }
  };

  /* Chỉ dùng /api/tts khi đã cấu hình máy chủ VÀ đang đọc tiếng Việt; tiếng Anh
     chuyển thẳng sang Web Speech với giọng en-US/Natural thay vì đọc qua tl=vi. */
  if (API_URL && ma === 'vi' && typeof Audio !== 'undefined') {
    const nhipAudio = taoKichBanNhip(dauVao, 'vi', 'audio');
    if (nhipAudio.length === 0) {
      baoXong();
      return dieuKhien;
    }
    dkCon = docBangAudioTheoNhip(nhipAudio, baoXong, () => {
      if (daHuy) return;
      console.warn(
        '[đọc tiếng Việt] Máy chủ /api/tts không phản hồi — lùi về giọng trên máy. ' +
        'API_URL hiện tại:', API_URL || '(TRỐNG — chưa cấu hình VITE_API_URL)'
      );
      batDauWebSpeech();
    });
  } else {
    batDauWebSpeech();
  }

  return dieuKhien;
}

/**
 * Đọc một bước hướng dẫn gồm tiêu đề + nội dung bằng nhịp điệu nhấn-hạ rõ ràng.
 */
export function docHuongDan(
  tieuDe: string,
  noiDung: string,
  onXong?: () => void,
  ma: 'vi' | 'en' = 'vi'
): DieuKhienDoc {
  return docVoiNhip({ tieuDe, noiDung }, onXong, ma);
}

/**
 * Đọc to một đoạn văn bản bằng tiếng Việt (hoặc tiếng Anh khi ma === 'en').
 *
 * Tự chọn cách đọc và tự chia nhịp ngắt hơi, nhấn ý trọng tâm và hạ giọng
 * cuối đoạn để dễ nghe đối với người lớn tuổi.
 */
export function docTiengViet(
  text: string,
  onXong?: () => void,
  ma: 'vi' | 'en' = 'vi'
): DieuKhienDoc {
  return docVoiNhip({ noiDung: text }, onXong, ma);
}
