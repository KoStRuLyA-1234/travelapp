import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth } from '../services/auth';

/**
 * Functional auth guard for protected routes (everything except /splash, /auth).
 *
 * Order of checks:
 *   1. If user has a valid token in localStorage → allow.
 *   2. Otherwise, send them to /auth (or /splash if they've never seen it).
 *      Use UrlTree (not router.navigate) so Angular handles it as a redirect
 *      and back-button history stays clean.
 */
export const authGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  const splashSeen = typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('splashSeen')
    : '1';

  return router.createUrlTree([splashSeen ? '/auth' : '/splash']);
};

/**
 * Inverse of authGuard — keeps already-logged-in users out of /auth and
 * /splash. Without this, a logged-in user who taps the browser back-button
 * would land on the registration form again.
 */
export const guestGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return true;
  return router.createUrlTree(['/']);
};

/**
 * Admin-only guard. Verifies both:
 *   1. the user is logged in (else send to /auth)
 *   2. the cached profile has Role === "Admin" (else send to /)
 *
 * The role comes from the JWT exchange response (AuthResponse.role) and is
 * cached in localStorage by Auth.saveSession.
 */
export const adminGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return router.createUrlTree(['/auth']);
  if (!auth.isAdmin())    return router.createUrlTree(['/']);
  return true;
};
