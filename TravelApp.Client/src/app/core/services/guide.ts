import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GuideRequest {
  cityName: string;
  question: string;
  history?: ChatTurn[];
}

export interface GuideResponse {
  answer: string;
}

export interface FactRequest {
  cityId?: number;
  cityName?: string;
}

export interface WeekendResponse {
  success: boolean;
  cityId: number;
  cityName: string;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reason: string;
  error?: string;
}

export interface RouteRequest {
  cityName: string;
  cityId?: number;
  days: number;
  style: string;
  with: string;
}

export interface RoutePlaceData {
  name: string;
  time: string;
  duration: string;
  tip: string;
  /** Filled by backend when it can match the AI-produced name to an Attraction row. */
  latitude?: number | null;
  longitude?: number | null;
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
  /** City centre — used as a fallback when a place lacks its own coords. */
  cityLatitude?: number | null;
  cityLongitude?: number | null;
  cityName?: string | null;
}

const GUIDE_TIMEOUT_MS = 90_000;
const ROUTE_TIMEOUT_MS = 90_000;
const FACT_TIMEOUT_MS  = 30_000;
const WEEKEND_TIMEOUT_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class Guide {
  private base = `${environment.apiUrl}/api/guide`;

  constructor(private http: HttpClient) {}

  /** Multi-turn Q&A. Pass `history` to maintain dialogue context. */
  ask(cityName: string, question: string, history: ChatTurn[] = []): Observable<GuideResponse> {
    const body: GuideRequest = { cityName, question, history };
    return this.http.post<GuideResponse>(this.base, body).pipe(
      timeout(GUIDE_TIMEOUT_MS),
      catchError(err => this.timeoutOrPropagate(err, 'Запрос занял слишком много времени'))
    );
  }

  /** Single fun fact about a city, grounded in attractions from our DB. */
  fact(req: FactRequest): Observable<GuideResponse> {
    return this.http.post<GuideResponse>(`${this.base}/fact`, req).pipe(
      timeout(FACT_TIMEOUT_MS),
      catchError(err => this.timeoutOrPropagate(err, 'Не удалось получить факт'))
    );
  }

  /**
   * "Куда съездить на выходные?" — backend picks 5 nearest cities to homeCity
   * via haversine, then asks the AI to recommend one. Returns coords for map.
   */
  weekend(homeCity?: string): Observable<WeekendResponse> {
    return this.http.post<WeekendResponse>(`${this.base}/weekend`, { homeCity }).pipe(
      timeout(WEEKEND_TIMEOUT_MS),
      catchError(err => this.timeoutOrPropagate(err, 'Не удалось получить рекомендацию'))
    );
  }

  askRoute(req: RouteRequest): Observable<RouteApiResponse> {
    return this.http.post<RouteApiResponse>(`${this.base}/route`, req).pipe(
      timeout(ROUTE_TIMEOUT_MS),
      catchError(err => this.timeoutOrPropagate(err, 'Генерация маршрута заняла слишком много времени'))
    );
  }

  private timeoutOrPropagate(err: unknown, msg: string) {
    if (err instanceof TimeoutError) {
      return throwError(() => ({ type: 'timeout', message: msg }));
    }
    return throwError(() => err);
  }
}
