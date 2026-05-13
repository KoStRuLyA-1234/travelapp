import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  homeCity: string;
  role: string;
  createdAt: string;
  routeCount: number;
}

export interface AdminRoute {
  id: number;
  title: string;
  cityName: string;
  userId: number | null;
  userEmail: string;
  tags: string;
  durationDays: number;
  createdAt: string;
  stopCount: number;
}

export interface AdminRouteFilters {
  userId?: number;
  tag?: string;
  from?: string;   // yyyy-MM-dd
  to?: string;     // yyyy-MM-dd
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private base = `${environment.apiUrl}/api/admin`;

  constructor(private http: HttpClient) {}

  listUsers(emailFilter?: string): Observable<AdminUser[]> {
    let params = new HttpParams();
    if (emailFilter?.trim()) params = params.set('email', emailFilter.trim());
    return this.http.get<AdminUser[]>(`${this.base}/users`, { params });
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/users/${id}`);
  }

  listRoutes(filters: AdminRouteFilters = {}): Observable<AdminRoute[]> {
    let params = new HttpParams();
    if (filters.userId != null) params = params.set('userId', filters.userId);
    if (filters.tag?.trim())   params = params.set('tag',  filters.tag.trim());
    if (filters.from)          params = params.set('from', filters.from);
    if (filters.to)            params = params.set('to',   filters.to);
    return this.http.get<AdminRoute[]>(`${this.base}/routes`, { params });
  }

  deleteRoute(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/routes/${id}`);
  }

  /** Admin-only — fetch any user's full route (same shape as user-routes/:id + owner info). */
  getRoute(id: number): Observable<AdminRouteDetails> {
    return this.http.get<AdminRouteDetails>(`${this.base}/routes/${id}`);
  }
}

export interface AdminRouteStop {
  day: number;
  order: number;
  name: string;
  time: string;
  duration: string;
  tip: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AdminRouteDetails {
  id: number;
  title: string;
  cityId: number;
  cityName: string;
  durationDays: number;
  theme: string;
  tags: string;
  aiSummary: string;
  createdAt: string;
  ownerId: number | null;
  ownerEmail: string;
  ownerName: string;
  stops: AdminRouteStop[];
}
