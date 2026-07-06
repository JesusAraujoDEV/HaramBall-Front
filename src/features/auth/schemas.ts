import { z } from 'zod';

/** Requirement 1.4 (password >= 12 chars), 1.5 (valid email), 1.6 (confirmation match). */
export const registerSchema = z
  .object({
    email: z.string().min(1, 'Email is required').pipe(z.email('Enter a valid email address')),
    masterPassword: z.string().min(12, 'Master password must be at least 12 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.masterPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').pipe(z.email('Enter a valid email address')),
  masterPassword: z.string().min(1, 'Master password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
