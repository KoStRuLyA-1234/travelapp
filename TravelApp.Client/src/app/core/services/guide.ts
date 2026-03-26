import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface GuideRequest {
  cityName: string;
  question: string;
}

export interface GuideResponse {
  answer: string;
}

export interface RouteRequest {
  cityName: string;
  days: number;
  style: string;
  with: string;
}

export interface RoutePlaceData {
  name: string;
  time: string;
  duration: string;
  tip: string;
}

export interface RouteDayData {
  day: number;
  title: string;
  places: RoutePlaceData[];
}

export interface RouteApiResponse {
  success: boolean;
  days?: RouteDayData[];
  error?: string;
}

const GUIDE_TIMEOUT_MS  = 90_000; // 90s — matches backend HttpClient timeout
const ROUTE_TIMEOUT_MS  = 90_000;

@Injectable({ providedIn: 'root' })
export class Guide {

  private guideUrl = `${environment.apiUrl}/api/guide`;
  private routeUrl = `${environment.apiUrl}/api/guide/route`;

  constructor(private http: HttpClient) {}

  ask(cityName: string, question: string): Observable<GuideResponse> {
    const body: GuideRequest = { cityName, question };
    return this.http.post<GuideResponse>(this.guideUrl, body).pipe(
      timeout(GUIDE_TIMEOUT_MS),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(() => ({ type: 'timeout', message: 'Запрос занял слишком много времени' }));
        }
        return throwError(() => err);
      })
    );
  }

  askRoute(req: RouteRequest): Observable<RouteApiResponse> {
    return this.http.post<RouteApiResponse>(this.routeUrl, req).pipe(
      timeout(ROUTE_TIMEOUT_MS),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(() => ({ type: 'timeout', message: 'Генерация маршрута заняла слишком много времени' }));
        }
        return throwError(() => err);
      })
    );
  }
}
