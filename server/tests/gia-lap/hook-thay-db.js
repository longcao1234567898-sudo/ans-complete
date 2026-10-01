const POOL_GIA = new URL('./pool-gia.js', import.meta.url).href;

export async function resolve(chiDinh, nguCanh, tiepTheo) {
  if (chiDinh === './src/db.js' && nguCanh.parentURL?.endsWith('/scripts-sao-luu.js')) {
    return { url: POOL_GIA, shortCircuit: true };
  }
  return tiepTheo(chiDinh, nguCanh);
}
