import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GuideRequest {
  cityName: string;
  question: string;
}

export interface GuideResponse {
  answer: string;
}

@Injectable({
  providedIn: 'root'
})
export class Guide {

  private apiUrl = 'https://localhost:7096/api/guide';

  constructor(private http: HttpClient) {}

  ask(cityName: string, question: string): Observable<GuideResponse> {
    const body: GuideRequest = { cityName, question };
    return this.http.post<GuideResponse>(this.apiUrl, body);
  }
}