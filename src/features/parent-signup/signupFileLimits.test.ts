import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyParentSignUpFiles, type ParentSignUpFileBundle } from './parentSignUpFiles';
import {
  MAX_SIGNUP_DOCUMENTS_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  prepareSignupFile,
  SIGNUP_IMAGE_TARGET_MB,
  signupFreeBytes,
  signupRequestTooLarge,
} from './signupFileLimits';

const compress = vi.hoisted(() => vi.fn());
vi.mock('@/lib/imageCompression', () => ({ compressImageForUpload: compress }));

const MB = 1024 * 1024;

function fakeFile(type: string, bytes: number, name = 'file'): File {
  const file = new File([], name, { type });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

const pdf = (bytes: number) => fakeFile('application/pdf', bytes, 'scan.pdf');
const photo = (bytes: number) => fakeFile('image/png', bytes, 'photo.png');

describe('sign-up file limits', () => {
  beforeEach(() => {
    compress.mockReset();
    compress.mockImplementation(async () => fakeFile('image/jpeg', 0.25 * MB, 'photo.jpg'));
  });

  it('refuses a type it cannot take, without shrinking anything', async () => {
    const result = await prepareSignupFile(fakeFile('text/plain', 100), MAX_SIGNUP_DOCUMENTS_BYTES);
    expect(result.problem).toEqual({ reason: 'invalid_type' });
    expect(compress).not.toHaveBeenCalled();
  });

  it('refuses a photo too large to shrink on a phone', async () => {
    const size = MAX_SOURCE_IMAGE_BYTES + 1;
    const result = await prepareSignupFile(photo(size), MAX_SIGNUP_DOCUMENTS_BYTES);
    expect(result.problem).toEqual({ reason: 'too_large', sizeBytes: size, maxBytes: MAX_SOURCE_IMAGE_BYTES });
    expect(compress).not.toHaveBeenCalled();
  });

  it('shrinks a large photo and keeps the smaller one', async () => {
    const result = await prepareSignupFile(photo(8 * MB), MAX_SIGNUP_DOCUMENTS_BYTES);
    expect(compress).toHaveBeenCalledWith(expect.anything(), SIGNUP_IMAGE_TARGET_MB);
    expect(result.file?.name).toBe('photo.jpg');
    expect(result.file?.size).toBe(0.25 * MB);
  });

  it('checks a photo by its size after shrinking, not before', async () => {
    const result = await prepareSignupFile(photo(8 * MB), 0.3 * MB);
    expect(result.problem).toBeUndefined();
  });

  it('keeps a PDF as it is, since it cannot be shrunk', async () => {
    const file = pdf(2 * MB);
    const result = await prepareSignupFile(file, MAX_SIGNUP_DOCUMENTS_BYTES);
    expect(result.file).toBe(file);
    expect(compress).not.toHaveBeenCalled();
  });

  it('refuses a PDF over the limit for all files', async () => {
    const size = MAX_SIGNUP_DOCUMENTS_BYTES + 1;
    const result = await prepareSignupFile(pdf(size), MAX_SIGNUP_DOCUMENTS_BYTES);
    expect(result.problem).toEqual({ reason: 'too_large', sizeBytes: size, maxBytes: MAX_SIGNUP_DOCUMENTS_BYTES });
  });

  it('refuses a PDF that fits the limit but not the room the other files left', async () => {
    const result = await prepareSignupFile(pdf(2 * MB), 1 * MB);
    expect(result.problem).toEqual({ reason: 'no_room', sizeBytes: 2 * MB, freeBytes: 1 * MB });
  });

  it('takes a file that fills the room exactly', async () => {
    const result = await prepareSignupFile(pdf(1 * MB), 1 * MB);
    expect(result.problem).toBeUndefined();
  });

  describe('the room a field has', () => {
    const withFiles = (patch: Partial<ParentSignUpFileBundle>) => ({ ...emptyParentSignUpFiles(), ...patch });

    it('is the whole share when nothing is chosen', () => {
      expect(signupFreeBytes(emptyParentSignUpFiles(), 'childPhoto')).toBe(MAX_SIGNUP_DOCUMENTS_BYTES);
    });

    it('is reduced by the other fields, across steps', () => {
      const files = withFiles({ childPhoto: pdf(1 * MB), birthCertificate: pdf(0.5 * MB) });
      expect(signupFreeBytes(files, 'vaccinationCard')).toBe(1.5 * MB);
    });

    it('does not count the file the field itself would replace', () => {
      const files = withFiles({ childPhoto: pdf(2 * MB), birthCertificate: pdf(0.5 * MB) });
      expect(signupFreeBytes(files, 'childPhoto')).toBe(2.5 * MB);
    });

    it('is never negative', () => {
      const files = withFiles({ childPhoto: pdf(2 * MB), birthCertificate: pdf(2 * MB) });
      expect(signupFreeBytes(files, 'vaccinationCard')).toBe(0);
    });
  });

  describe('the whole request', () => {
    const allFields = Object.keys(emptyParentSignUpFiles()) as (keyof ParentSignUpFileBundle)[];
    const target = SIGNUP_IMAGE_TARGET_MB * MB;
    const everyFieldWithAPhoto = Object.fromEntries(allFields.map((key) => [key, fakeFile('image/jpeg', target)])) as ParentSignUpFileBundle;

    it('has room for a photo in every field and a wallet receipt', () => {
      expect(allFields).toHaveLength(10);
      expect(signupRequestTooLarge(everyFieldWithAPhoto, fakeFile('image/jpeg', target))).toBe(false);
    });

    it('has room for the receipt when the documents fill their share', () => {
      const full = { ...emptyParentSignUpFiles(), otherDocument: pdf(MAX_SIGNUP_DOCUMENTS_BYTES) };
      expect(signupRequestTooLarge(full, fakeFile('image/jpeg', target))).toBe(false);
    });

    it('is refused when a receipt could not be shrunk enough', () => {
      const full = { ...emptyParentSignUpFiles(), otherDocument: pdf(MAX_SIGNUP_DOCUMENTS_BYTES) };
      expect(signupRequestTooLarge(full, fakeFile('image/jpeg', 1 * MB))).toBe(true);
    });
  });
});
