import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { City, CityFilters, CitySearchParams, Review } from '../models/city.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CityService {
  private apiUrl = `${environment.apiUrl}/api/cities`;
  private favoritesUrl = `${environment.apiUrl}/api/favorites`;

  constructor(private http: HttpClient) {}

  getCities(filters: CitySearchParams = {}): Observable<City[]> {
    let params = new HttpParams();
    if (filters.q) params = params.set('q', filters.q);
    if (filters.region) params = params.set('region', filters.region);
    if (filters.type) params = params.set('type', filters.type);
    if (filters.favoritesOnly) params = params.set('favoritesOnly', true);

    return this.http.get<City[]>(this.apiUrl, { params });
  }

  getCityById(id: number): Observable<City> {
    return this.http.get<City>(`${this.apiUrl}/${id}`);
  }

  getFilters(): Observable<CityFilters> {
    return this.http.get<CityFilters>(`${this.apiUrl}/filters`);
  }

  getCityPhoto(id: number): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.apiUrl}/${id}/photo`);
  }

  getFavoriteIds(): Observable<number[]> {
    return this.http.get<number[]>(`${this.favoritesUrl}/ids`);
  }

  getFavoriteCities(): Observable<City[]> {
    return this.http.get<City[]>(this.favoritesUrl);
  }

  addFavorite(cityId: number): Observable<{ saved: boolean }> {
    return this.http.post<{ saved: boolean }>(`${this.favoritesUrl}/${cityId}`, {});
  }

  removeFavorite(cityId: number): Observable<void> {
    return this.http.delete<void>(`${this.favoritesUrl}/${cityId}`);
  }

  getReviews(cityId: number): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiUrl}/${cityId}/reviews`);
  }

  createReview(cityId: number, rating: number, text: string, attractionId?: number | null): Observable<Review> {
    return this.http.post<Review>(`${this.apiUrl}/${cityId}/reviews`, { rating, text, attractionId });
  }

  deleteReview(reviewId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/api/reviews/${reviewId}`);
  }
}
