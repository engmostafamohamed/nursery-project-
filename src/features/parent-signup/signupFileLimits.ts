import { compressImageForUpload } from '@/lib/imageCompression';

import type { ParentSignUpFileBundle } from './parentSignUpFiles';

const MB = 1024 * 1024;

/**
 * A sign-up's files all travel in one request, which has room for 3.3 MB of them. Ten photos at this
 * size fill the documents' share exactly and the wallet receipt takes the rest, so photos alone
 * never run out of room: only PDFs, which cannot be shrunk, can.
 */
export const SIGNUP_IMAGE_TARGET_MB = 0.3;
export const MAX_SIGNUP_DOCUMENTS_BYTES = 3 * MB;
const MAX_SIGNUP_REQUEST_FILES_BYTES = 3.3 * MB;

/** A photo larger than this is too slow to shrink on a phone. */
export const MAX_SOURCE_IMAGE_BYTES = 10 * MB;

export const SIGNUP_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export type SignupFileProblem =
  | { reason: 'invalid_type' }
  | { reason: 'too_large'; sizeBytes: number; maxBytes: number }
  | { reason: 'no_room'; sizeBytes: number; freeBytes: number };

export type PreparedSignupFile = { file: File; problem?: never } | { file?: never; problem: SignupFileProblem };

function bundleBytes(files: ParentSignUpFileBundle): number {
  return Object.values(files).reduce((total, file) => total + (file?.size ?? 0), 0);
}

/** What one field may still take: the documents' share less the other fields' files. */
export function signupFreeBytes(files: ParentSignUpFileBundle, field: keyof ParentSignUpFileBundle): number {
  return Math.max(0, MAX_SIGNUP_DOCUMENTS_BYTES - bundleBytes({ ...files, [field]: null }));
}

/** Shrinks a chosen photo and checks that the result fits, so a problem shows when it is chosen. */
export async function prepareSignupFile(file: File, freeBytes: number): Promise<PreparedSignupFile> {
  if (!SIGNUP_FILE_TYPES.includes(file.type)) return { problem: { reason: 'invalid_type' } };
  const isImage = file.type.startsWith('image/');
  if (isImage && file.size > MAX_SOURCE_IMAGE_BYTES) {
    return { problem: { reason: 'too_large', sizeBytes: file.size, maxBytes: MAX_SOURCE_IMAGE_BYTES } };
  }

  const prepared = isImage ? await compressImageForUpload(file, SIGNUP_IMAGE_TARGET_MB) : file;
  if (prepared.size > MAX_SIGNUP_DOCUMENTS_BYTES) {
    return { problem: { reason: 'too_large', sizeBytes: prepared.size, maxBytes: MAX_SIGNUP_DOCUMENTS_BYTES } };
  }
  if (prepared.size > freeBytes) {
    return { problem: { reason: 'no_room', sizeBytes: prepared.size, freeBytes } };
  }
  return { file: prepared };
}

/** The last check before sending, for what the fields cannot see: the receipt chosen on the payment step. */
export function signupRequestTooLarge(files: ParentSignUpFileBundle, walletReceipt: File | null): boolean {
  return bundleBytes(files) + (walletReceipt?.size ?? 0) > MAX_SIGNUP_REQUEST_FILES_BYTES;
}
