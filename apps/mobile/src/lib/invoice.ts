import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api } from './api';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the invoice'));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Downloads the GST invoice PDF (authenticated) and opens the system share sheet: save to Files, WhatsApp, print... */
export async function shareInvoice(orderId: string, invoiceNumber?: string | null): Promise<void> {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is not available on this device');
  const base64 = await blobToBase64(await api.orders.invoice(orderId));
  const safeName = (invoiceNumber ?? orderId).replace(/[^A-Za-z0-9._-]/g, '_');
  const uri = `${FileSystem.cacheDirectory}invoice-${safeName}.pdf`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'GST invoice',
  });
}
