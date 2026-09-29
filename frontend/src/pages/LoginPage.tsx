/** /login — email + password sign-in (§7, §20, §21). */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

import { AuthLayout } from '../layouts/AuthLayout';
import { zodResolver } from '../lib/zodResolver';
import { loginSchema, type LoginValues } from '../lib/authSchemas';
import { ApiRequestError } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import {
  buttonClasses,
  Field,
  InlineAlert,
  inputClasses
} from '../components/ui/FormFeedback';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 429) {
        setServerError('Too many attempts — please wait a few minutes and try again.');
      } else {
        setServerError(
          error instanceof Error ? error.message : 'Unable to sign in. Please try again.'
        );
      }
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Continue building your developer DNA."
      footer={
        <>
          New to DevDNA?{' '}
          <Link to="/register" className="font-medium text-cyan-400 hover:text-cyan-300">
            Create an account
          </Link>
        </>
      }
    >
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

        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              className={`${inputClasses} pr-10`}
              {...registerField('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-xs text-slate-400 transition hover:text-cyan-300"
          >
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={isSubmitting} className={buttonClasses}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
