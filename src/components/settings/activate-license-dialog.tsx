/**
 * <ActivateLicenseDialog> — paste a license token to activate this device.
 *
 * Thin Dialog wrapper around <LicenseTokenPasteForm>. Opened from the
 * Subscription tab's primary CTA ("Activate existing license"). On
 * successful activation the form fires `onSuccess`; we close the dialog
 * and let the parent re-render against the now-paid tier.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LicenseTokenPasteForm } from "@/components/settings/license-token-paste-form";

interface ActivateLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivateLicenseDialog({
  open,
  onOpenChange,
}: ActivateLicenseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Activate existing license</DialogTitle>
          <DialogDescription>
            Paste your <code className="font-mono">fz_…</code> license token to
            unlock paid features on this device. You can find it in the
            welcome email or in Subscription on another device.
          </DialogDescription>
        </DialogHeader>

        <LicenseTokenPasteForm
          inputId="activate-license-token"
          submitLabel="Activate"
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
