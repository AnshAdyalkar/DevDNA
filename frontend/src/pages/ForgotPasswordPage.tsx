/** /forgot-password — request a reset link (§20). */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { AuthLayout } from '../layouts/AuthLayout';
import { zodResolver } from '../lib/zodResolver';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../lib/authSchemas';
import { forgotPassword } from '../services/authService';
import { ApiRequestError } from '../services/api';
import {
  buttonClasses,
  Field,
  InlineAlert,
  inputClasses
} from '../components/ui/FormFeedback';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' }
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      setServerError(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to send the reset link. Please try again.'
      );
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to set a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-cyan-400 hover:text-cyan-300">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <InlineAlert tone="info">
          If an account exists for that email, a reset link has been sent. Check your inbox —
          in development the link is printed in the API server console.
        </InlineAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {serverError && <InlineAlert tone="error">{serverError}</InlineAlert>}
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClasses}
              {...registerField('email')}
            />
          </Field>
          <button type="submit" disabled={isSubmitting} className={buttonClasses}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
