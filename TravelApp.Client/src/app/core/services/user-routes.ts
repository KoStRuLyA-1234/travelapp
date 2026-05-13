import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SavedRouteStop {
  day: number;
  order: number;
  name: string;
  time: string;
  duration: string;
  tip: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SavedRouteSummary {
  id: number;
  title: string;
  cityId: number;
  cityName: string;
  durationDays: number;
  theme: string;
  tags: string;
  aiSummary: string;
  createdAt: string;
  stopCount: number;
}

export interface SavedRoute extends SavedRouteSummary {
  stops: SavedRouteStop[];
}

export interface SaveRouteRequest {
  cityId: number;
  title: string;
  description?: string;
  durationDays: number;
  theme?: string;
  tags?: string;
  aiSummary?: string;
  stops: Array<{
    day: number;
    name: string;
    time?: string;
    duration?: string;
    tip?: string;
    latitude?: number | null;
    longitude?: number | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class UserRoutesService {
  private base = `${environment.apiUrl}/api/user-routes`;

  constructor(private http: HttpClient) {}

  list(): Observable<SavedRouteSummary[]> {
    return this.http.get<SavedRouteSummary[]>(this.base);
  }

  get(id: number): Observable<SavedRoute> {
    return this.http.get<SavedRoute>(`${this.base}/${id}`);
  }

  /** Idempotent on the backend — returns existing row if same ContentHash. */
  save(req: SaveRouteRequest): Observable<SavedRoute> {
    return this.http.post<SavedRoute>(this.base, req);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
