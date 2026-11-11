/**
 * Hook nạp module: mọi `import ... from '<...>/db.js'` mà TRỎ ĐÚNG `server/src/db.js` được đổi
 * sang CSDL giả. So theo URL đã phân giải (không theo chuỗi import) nên `./db.js`, `../db.js`,
 * `../../db.js` đều trúng, và một tệp `db.js` khác trong node_modules thì không.
 */
const DB_THAT = new URL('../../src/db.js', import.meta.url).href.toLowerCase();
const DB_GIA = new URL('./csdl-ma-tran.js', import.meta.url).href;

export async function resolve(chiDinh, nguCanh, tiepTheo) {
  const kq = await tiepTheo(chiDinh, nguCanh);
  if (kq.url && kq.url.toLowerCase() === DB_THAT) return { url: DB_GIA, shortCircuit: true };
  return kq;
}
