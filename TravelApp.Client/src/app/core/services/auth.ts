import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AuthRequest {
  email: string;
  password: string;
  name?: string;
  homeCity?: string;
}

export interface AuthResponse {
  id: number;
  token: string;
  name: string;
  homeCity: string;
  email: string;
  bio: string;
  avatarUrl: string;
  theme: string;
  animationsEnabled: boolean;
  role?: string;
}

export type CurrentUser = Omit<AuthResponse, 'token'>;

@Injectable({ providedIn: 'root' })
export class Auth {
  private apiUrl = `${environment.apiUrl}/api/auth`;
  private isLoggedInSubject = new BehaviorSubject<boolean>(this.hasToken());

  isLoggedIn$ = this.isLoggedInSubject.asObservable();

  constructor(private http: HttpClient) {}

  register(data: AuthRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data).pipe(
      tap(r => this.saveSession(r))
    );
  }

  login(data: AuthRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, data).pipe(
      tap(r => this.saveSession(r))
    );
  }

  me(): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(`${this.apiUrl}/me`).pipe(
      tap(r => this.saveSession(r))
    );
  }

  updateProfile(data: Partial<CurrentUser & { theme?: string; animationsEnabled?: boolean }>): Observable<AuthResponse> {
    return this.http.put<AuthResponse>(`${this.apiUrl}/me`, data).pipe(
      tap(r => this.saveSession(r))
    );
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password`, { token, newPassword });
  }

  getLikedRoutes(): Observable<number[]> {
    return this.http.get<number[]>(`${this.apiUrl}/liked-routes`);
  }

  likeRoute(routeId: number): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/liked-routes/${routeId}`, {});
  }

  unlikeRoute(routeId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/liked-routes/${routeId}`);
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.isLoggedInSubject.next(false);
  }

  getToken(): string | null { return localStorage.getItem('token'); }

  acceptExternalSession(response: AuthResponse) {
    this.saveSession(response);
  }

  getUser(): CurrentUser | null {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  }

  hasToken(): boolean { return !!localStorage.getItem('token'); }

  isLoggedIn(): boolean { return this.hasToken(); }

  /** True when the cached user is an Admin — used to gate /admin route + UI. */
  isAdmin(): boolean { return this.getUser()?.role === 'Admin'; }

  private saveSession(response: AuthResponse) {
    const { token, ...user } = response;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    this.isLoggedInSubject.next(true);

    // Profile settings are applied globally as soon as the backend session is accepted.
    const isDark = user.theme !== 'light';
    const animationsEnabled = user.animationsEnabled !== false;
    localStorage.setItem('theme', user.theme ?? 'dark');
    localStorage.setItem('animationsEnabled', String(animationsEnabled));
    document.body.classList.toggle('light-theme', !isDark);
    document.body.classList.toggle('animations-off', !animationsEnabled);
  }
}
