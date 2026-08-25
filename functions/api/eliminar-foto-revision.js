import { onRequestFotosDeleteV3 } from '../_lib/fotos-delete-v3.js';

export async function onRequest(context) {
  return onRequestFotosDeleteV3(context);
}
