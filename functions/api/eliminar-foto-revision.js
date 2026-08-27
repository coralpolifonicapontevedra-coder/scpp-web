import { onRequestFotosDeleteV4 } from '../_lib/fotos-delete-v4.js';

export async function onRequest(context) {
  return onRequestFotosDeleteV4(context);
}
