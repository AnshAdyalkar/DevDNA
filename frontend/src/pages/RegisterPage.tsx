/** /register — account creation (§6, §20, §21). */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

import { AuthLayout } from '../layouts/AuthLayout';
import { zodResolver } from '../lib/zodResolver';
import { registerSchema, type RegisterValues } from '../lib/authSchemas';
import { ApiRequestError } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import {
  buttonClasses,
  Field,
  InlineAlert,
  inputClasses
} from '../components/ui/FormFeedback';

export function RegisterPage() {
  const navigate = useNavigate();
  const registerUser = useAuthStore((s) => s.register);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', username: '', email: '', password: '' }
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const user = await registerUser(values);
      toast.success(`Welcome to DevDNA, ${user.name.split(' ')[0]}!`);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.status === 409) {
          setServerError(error.message);
        } else if (error.status === 429) {
          setServerError('Too many attempts — please wait a few minutes and try again.');
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError('Unable to create your account. Please try again.');
      }
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start mapping your developer DNA."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-cyan-400 hover:text-cyan-300">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && <InlineAlert tone="error">{serverError}</InlineAlert>}

        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            className={inputClasses}
            {...registerField('name')}
          />
        </Field>

        <Field
          label="Username"
          htmlFor="username"
          error={errors.username?.message}
          hint="Lowercase letters, numbers, hyphens and underscores."
        >
          <input
            id="username"
            type="text"
            autoComplete="username"
            placeholder="ada-dev"
            className={inputClasses}
            {...registerField('username')}
          />
        </Field>

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

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
        >
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a strong password"
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

        <button type="submit" disabled={isSubmitting} className={buttonClasses}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
