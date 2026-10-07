import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button, type ButtonProps } from '@/components/ui/button';

type Props = {
  /** The link inside the QR code (`/qr/verify?token=…`). */
  url: string;
  size?: ButtonProps['size'];
  className?: string;
};

/**
 * Copies the link inside a QR code. Staff who open it are taken to the scanner, which
 * checks the code exactly as if it had been scanned (see QrVerifyLinkPage).
 */
export function CopyQrLinkButton({ url, size, className }: Props) {
  const { t } = useTranslation();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('qr.linkCopied'));
    } catch {
      // No clipboard access (old browser, or not https): show the link so it can be copied by hand.
      toast.error(t('qr.copyLinkFailed'), { description: url, duration: 15000 });
    }
  };

  return (
    <Button type="button" variant="outline" size={size} className={className} disabled={!url} onClick={() => void copy()}>
      <span className="material-symbols-outlined me-1 text-base" aria-hidden>
        link
      </span>
      {t('qr.copyLink')}
    </Button>
  );
}
