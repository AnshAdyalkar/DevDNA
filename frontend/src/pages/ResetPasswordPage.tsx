/** /reset-password — consume the emailed token and set a new password (§20). */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthLayout } from '../layouts/AuthLayout';
import { zodResolver } from '../lib/zodResolver';
import { resetPasswordSchema, type ResetPasswordValues } from '../lib/authSchemas';
import { ApiRequestError } from '../services/api';
import { resetPassword } from '../services/authService';
import { toast } from '../store/toastStore';
import {
  buttonClasses,
  Field,
  InlineAlert,
  inputClasses
} from '../components/ui/FormFeedback';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' }
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (!token) {
      setServerError('This reset link is missing its token. Request a new one.');
      return;
    }
    try {
      await resetPassword(token, values.newPassword);
      toast.success('Password updated — you can sign in now');
      navigate('/login', { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to reset your password. Please try again.'
      );
    }
  });

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something strong — you'll use it to sign in."
      footer={
        <>
          Link expired?{' '}
          <Link to="/forgot-password" className="font-medium text-cyan-400 hover:text-cyan-300">
            Request a new one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && <InlineAlert tone="error">{serverError}</InlineAlert>}
        {!token && (
          <InlineAlert tone="info">
            No token found in the URL — open the reset link from your email, or request a new
            one.
          </InlineAlert>
        )}

        <Field
          label="New password"
          htmlFor="newPassword"
          error={errors.newPassword?.message}
        >
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            className={inputClasses}
            {...registerField('newPassword')}
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat the new password"
            className={inputClasses}
            {...registerField('confirmPassword')}
          />
        </Field>

        <button type="submit" disabled={isSubmitting} className={buttonClasses}>
          {isSubmitting ? 'Updating…' : 'Reset password'}
        </button>
      </form>
    </AuthLayout>
  );
}
