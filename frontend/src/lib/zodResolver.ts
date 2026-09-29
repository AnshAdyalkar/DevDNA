/** Glue between Zod and React Hook Form — avoids adding @hookform/resolvers. */
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * The resolver maps the form's *input* values to the schema's *output* values,
 * mirroring how react-hook-form models transforms.
 */
export function zodResolver<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: ZodType<TOutput, TInput>
): Resolver<TInput, unknown, TOutput> {
  const run = async (values: TInput) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'root';
      if (!errors[key]) errors[key] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors };
  };
  return run as unknown as Resolver<TInput, unknown, TOutput>;
}
