/** Official incoming receipt-number presentation only. Raw Firestore values stay unchanged. */
export const INCOMING_RECEIPT_PREFIX = "ศธ 04295.047/";

/** Accept the full printed form in pasted input, but retain only the original raw number. */
export function rawIncomingReceiptNumber(value) {
  const raw=String(value??"").trim();
  return raw.replace(/^ศธ\s*04295\.047\s*\/\s*/iu,"").trim();
}

/** The prefix belongs only to incoming letters, never orders or outgoing numbers. */
export function formatIncomingReceiptNumber(value,fallback="-") {
  const raw=rawIncomingReceiptNumber(value);
  return raw ? INCOMING_RECEIPT_PREFIX+raw : fallback;
}

export function formatDocumentNumber(record,fallback="-") {
  const raw=record?.docNumber??record?.orderNumber??record?.outgoingNumber;
  if(record?.type==="หนังสือเข้า") return formatIncomingReceiptNumber(raw,fallback);
  return String(raw??"").trim() || fallback;
}
