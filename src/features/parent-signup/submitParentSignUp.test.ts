import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parentSignUpDefaults } from './parentSignUpDefaults';
import { emptyParentSignUpFiles } from './parentSignUpFiles';
import { MAX_SIGNUP_DOCUMENTS_BYTES, SIGNUP_IMAGE_TARGET_MB } from './signupFileLimits';
import { submitParentSignUp, type SignupPaymentSelection } from './submitParentSignUp';

const compress = vi.hoisted(() => vi.fn());
vi.mock('@/lib/imageCompression', () => ({ compressImageForUpload: compress }));

const MB = 1024 * 1024;

const payment: SignupPaymentSelection = {
  packageId: 'package',
  billingPeriod: 'monthly',
  extraHoursPackageId: null,
  method: 'vodafone_cash',
  reference: null,
  idempotencyKey: 'key',
  walletReceipt: new File(['original receipt'], 'receipt.png', { type: 'image/png' }),
};

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe('sending the sign-up', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    compress.mockReset();
    compress.mockImplementation(async () => new File(['small'], 'receipt.jpg', { type: 'image/jpeg' }));
    fetchMock = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the files the fields already prepared, without shrinking them again', async () => {
    const photo = new File(['prepared photo'], 'photo.jpg', { type: 'image/jpeg' });
    await submitParentSignUp(parentSignUpDefaults, { ...emptyParentSignUpFiles(), childPhoto: photo });

    expect(compress).not.toHaveBeenCalled();
    const { files } = sentBody(fetchMock);
    expect(files.childPhoto).toEqual({ name: 'photo.jpg', type: 'image/jpeg', base64: btoa('prepared photo') });
    expect(files.birthCertificate).toBeNull();
  });

  it('shrinks the wallet receipt, whose input does not', async () => {
    await submitParentSignUp(parentSignUpDefaults, emptyParentSignUpFiles(), null, {}, payment);

    expect(compress).toHaveBeenCalledWith(payment.walletReceipt, SIGNUP_IMAGE_TARGET_MB);
    expect(sentBody(fetchMock).payment.wallet_receipt).toEqual({ name: 'receipt.jpg', type: 'image/jpeg', base64: btoa('small') });
  });

  it('ignores a receipt left over from a method that does not take one', async () => {
    await submitParentSignUp(parentSignUpDefaults, emptyParentSignUpFiles(), null, {}, { ...payment, method: 'fawry' });

    expect(compress).not.toHaveBeenCalled();
    expect(sentBody(fetchMock).payment.wallet_receipt).toBeNull();
  });

  it('sends nothing when the documents and the receipt do not fit one request', async () => {
    const full = new File([new Uint8Array(MAX_SIGNUP_DOCUMENTS_BYTES)], 'scan.pdf', { type: 'application/pdf' });
    compress.mockImplementation(async () => new File([new Uint8Array(1 * MB)], 'receipt.jpg', { type: 'image/jpeg' }));

    await expect(
      submitParentSignUp(parentSignUpDefaults, { ...emptyParentSignUpFiles(), otherDocument: full }, null, {}, payment),
    ).rejects.toThrow('signupFilesTooLarge');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
