/** /profile — view + edit the user profile (§16, §20, §21). */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import {
  buttonClasses,
  Field,
  InlineAlert,
  inputClasses
} from '../components/ui/FormFeedback';
import { zodResolver } from '../lib/zodResolver';
import { profileSchema, type ProfileValues } from '../lib/authSchemas';
import { ApiRequestError } from '../services/api';
import type { UpdateProfileInput } from '../services/authService';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import { EXPERIENCE_LEVELS, TARGET_ROLES } from '../../../shared/types';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: registerField,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      name: user?.name ?? '',
      username: user?.username ?? '',
      bio: user?.bio ?? '',
      location: user?.location ?? '',
      college: user?.college ?? '',
      degree: user?.degree ?? '',
      graduationYear: user?.graduationYear ?? '',
      targetRole: user?.targetRole ?? '',
      experienceLevel: user?.experienceLevel ?? '',
      avatar: user?.avatar ?? ''
    }
  });

  // Re-sync the form when the profile changes elsewhere (e.g. after save).
  useEffect(() => {
    if (!isDirty && user) {
      reset({
        name: user.name,
        username: user.username,
        bio: user.bio ?? '',
        location: user.location ?? '',
        college: user.college ?? '',
        degree: user.degree ?? '',
        graduationYear: user.graduationYear ?? '',
        targetRole: user.targetRole ?? '',
        experienceLevel: user.experienceLevel ?? '',
        avatar: user.avatar ?? ''
      });
    }
  }, [user, isDirty, reset]);

  const avatarUrl = watch('avatar');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const input: UpdateProfileInput = {
        name: values.name,
        username: values.username,
        bio: values.bio || undefined,
        location: values.location || undefined,
        college: values.college || undefined,
        degree: values.degree || undefined,
        graduationYear:
          values.graduationYear === undefined
            ? undefined
            : Number(values.graduationYear),
        targetRole: values.targetRole === '' ? undefined : values.targetRole,
        experienceLevel: values.experienceLevel === '' ? undefined : values.experienceLevel,
        avatar: values.avatar || undefined
      };
      await updateProfile(input);
      toast.success('Profile updated');
    } catch (error) {
      setServerError(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to save your profile. Please try again.'
      );
    }
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Your profile</h1>
          <p className="mt-1 text-sm text-slate-400">
            This information shapes your DNA analysis and roadmap.
          </p>
        </div>
        <Link to="/settings" className="text-xs text-cyan-400 hover:text-cyan-300">
          Account settings →
        </Link>
      </header>

      <Card>
        <div className="mb-6 flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${user.name} avatar`}
              className="h-14 w-14 rounded-2xl object-cover ring-1 ring-slate-700"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 ring-1 ring-slate-700">
              <UserRound className="h-6 w-6 text-slate-400" aria-hidden />
            </span>
          )}
          <div>
            <p className="text-sm font-semibold text-white">{user.name}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
            <div className="mt-1.5 flex gap-2">
              <Badge tone="slate">@{user.username}</Badge>
              {user.githubConnected ? (
                <Badge tone="green">GitHub connected</Badge>
              ) : (
                <Badge tone="slate">GitHub not connected</Badge>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {serverError && <InlineAlert tone="error">{serverError}</InlineAlert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" error={errors.name?.message}>
              <input id="name" type="text" className={inputClasses} {...registerField('name')} />
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
                className={inputClasses}
                {...registerField('username')}
              />
            </Field>
          </div>

          <Field label="Bio" htmlFor="bio" error={errors.bio?.message}>
            <textarea
              id="bio"
              rows={3}
              placeholder="A sentence or two about you as a developer…"
              className={`${inputClasses} resize-none`}
              {...registerField('bio')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" htmlFor="location" error={errors.location?.message}>
              <input
                id="location"
                type="text"
                placeholder="City, Country"
                className={inputClasses}
                {...registerField('location')}
              />
            </Field>
            <Field label="Avatar URL" htmlFor="avatar" error={errors.avatar?.message}>
              <input
                id="avatar"
                type="url"
                placeholder="https://…"
                className={inputClasses}
                {...registerField('avatar')}
              />
            </Field>
            <Field label="College" htmlFor="college" error={errors.college?.message}>
              <input
                id="college"
                type="text"
                className={inputClasses}
                {...registerField('college')}
              />
            </Field>
            <Field label="Degree" htmlFor="degree" error={errors.degree?.message}>
              <input
                id="degree"
                type="text"
                className={inputClasses}
                {...registerField('degree')}
              />
            </Field>
            <Field
              label="Graduation year"
              htmlFor="graduationYear"
              error={errors.graduationYear?.message}
            >
              <input
                id="graduationYear"
                type="number"
                min={2000}
                max={2035}
                className={inputClasses}
                {...registerField('graduationYear')}
              />
            </Field>
            <Field label="Target role" htmlFor="targetRole" error={errors.targetRole?.message}>
              <select
                id="targetRole"
                className={inputClasses}
                {...registerField('targetRole')}
              >
                <option value="">Not set</option>
                {TARGET_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Experience level"
              htmlFor="experienceLevel"
              error={errors.experienceLevel?.message}
            >
              <select
                id="experienceLevel"
                className={inputClasses}
                {...registerField('experienceLevel')}
              >
                <option value="">Not set</option>
                {EXPERIENCE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l[0].toUpperCase() + l.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className={buttonClasses}
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
