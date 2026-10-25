import { z } from 'zod';

/** Shared field rules so the frontend and backend agree on what "valid" means. */

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Enter your email address.')
  .max(254, 'Email addresses cannot be longer than 254 characters.')
  .email('Enter a valid email address.')
  .transform((v) => v.toLowerCase());

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Usernames must be at least 3 characters.')
  .max(30, 'Usernames cannot be longer than 30 characters.')
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?$/, 'Use letters, numbers, hyphens and underscores only.')
  .transform((v) => v.toLowerCase());

/**
 * Password policy: 10+ characters with at least one lower-case letter, one
 * upper-case letter, one digit. Deliberately checked against a small list of
 * the most common passwords as well.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '1234567890', 'qwertyuiop',
  'letmein123', 'iloveyou123', 'welcome123', 'admin12345', 'skillspring',
]);

export const passwordSchema = z
  .string()
  .min(10, 'Passwords must be at least 10 characters.')
  .max(200, 'Passwords cannot be longer than 200 characters.')
  .refine((v) => /[a-z]/.test(v), 'Include at least one lower-case letter.')
  .refine((v) => /[A-Z]/.test(v), 'Include at least one upper-case letter.')
  .refine((v) => /[0-9]/.test(v), 'Include at least one number.')
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), 'That password is too common. Choose another.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Display names must be at least 2 characters.')
  .max(60, 'Display names cannot be longer than 60 characters.');

export const bioSchema = z.string().trim().max(2000, 'Biographies are limited to 2000 characters.');
export const shortText = (max: number) => z.string().trim().max(max, `Limited to ${max} characters.`);
export const longText = (max: number) => z.string().trim().max(max, `Limited to ${max} characters.`);

export const urlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v),
    'Enter a full URL starting with http:// or https://',
  )
  .optional()
  .or(z.literal(''));

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_+\-/]+$/, 'Enter a valid IANA timezone, e.g. Europe/London.');

export const languageSchema = z
  .array(z.string().trim().min(2).max(40))
  .max(12, 'Select up to 12 languages.')
  .default([]);

export const uuidSchema = z.string().uuid('Expected a valid identifier.');

export const idParam = z.object({ id: uuidSchema });

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');
