'use client';

import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { useToast } from '@xb/ui';
import { describeError, useSession } from '@/lib/session';
import { resendVerification } from '@/lib/api-users';

export function EmailVerificationBanner() {
  const { data: user } = useSession();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerifiedAt) return null;

  async function onResend() {
    setSending(true);
    try {
      const result = await resendVerification();
      if (result.alreadyVerified) {
        toast.push('success', 'Email already verified — refresh the page.');
      } else {
        setSent(true);
        toast.push('success', 'Verification email sent. Check your inbox.');
      }
    } catch (err) {
      toast.push('error', describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
      <div className="flex items-center gap-2">
        <MailWarning className="h-4 w-4 flex-shrink-0" />
        <span>
          Please verify your email address ({user.email}) to secure your account.
        </span>
      </div>
      <button
        type="button"
        onClick={onResend}
        disabled={sending || sent}
        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sent ? 'Sent — check inbox' : sending ? 'Sending…' : 'Resend verification email'}
      </button>
    </div>
  );
}
