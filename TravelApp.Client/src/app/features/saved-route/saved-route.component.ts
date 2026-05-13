import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { UserRoutesService, SavedRoute, SavedRouteStop } from '../../core/services/user-routes';
import { AdminService, AdminRouteDetails } from '../../core/services/admin';
import { CityService } from '../../core/services/city.service';
import { City } from '../../core/models/city.model';

declare const ymaps: any;

/**
 * Display a previously-saved AI route:
 *   - Yandex Map with numbered markers + a polyline that connects them
 *   - Below the map — full AI-generated text description
 *   - Tag chips, day-by-day stop list with time/duration/tip
 *
 * Markers always come from the DB row (no geocoder round-trip on the
 * happy path — we already have lat/lng for every stop).  Stops missing
 * coords get a deterministic jitter around the city centre so they
 * still show up on the map.
 */
@Component({
  selector: 'app-saved-route',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './saved-route.component.html',
  styleUrl: './saved-route.component.css'
})
export class SavedRouteComponent implements OnInit {
  route$: SavedRoute | null = null;
  city: City | null = null;
  isLoading = true;
  errorMsg = '';

  /** Set when ?admin=1 is in the URL. We then show owner info above the map. */
  isAdminView = false;
  ownerLabel = '';

  constructor(
    private routeParams: ActivatedRoute,
    private router: Router,
    private routes: UserRoutesService,
    private admin: AdminService,
    private cities: CityService
  ) {}

  ngOnInit() {
    const id = Number(this.routeParams.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id)) {
      this.errorMsg = 'Маршрут не найден.';
      this.isLoading = false;
      return;
    }

    // ?admin=1 → fetch via admin endpoint so admins can view ANY user's route.
    this.isAdminView = this.routeParams.snapshot.queryParamMap.get('admin') === '1';

    if (this.isAdminView) {
      this.admin.getRoute(id).subscribe({
        next: r => this.applyRoute(this.adminToSaved(r), r),
        error: () => this.failWith('Не удалось загрузить маршрут (админ-доступ).')
      });
    } else {
      this.routes.get(id).subscribe({
        next: r => this.applyRoute(r),
        error: () => this.failWith('Не удалось загрузить маршрут.')
      });
    }
  }

  /** Common post-fetch path — assign route, load city, render map. */
  private applyRoute(r: SavedRoute, adminMeta?: AdminRouteDetails) {
    this.route$ = r;
    this.isLoading = false;

    if (adminMeta) {
      const who = adminMeta.ownerName?.trim() || adminMeta.ownerEmail || 'неизвестный пользователь';
      this.ownerLabel = `Маршрут пользователя: ${who}`;
    }

    if (r.cityId) {
      this.cities.getCityById(r.cityId).subscribe({ next: c => { this.city = c; } });
    }
    setTimeout(() => this.renderMap(), 80);
  }

  private failWith(msg: string) {
    this.errorMsg = msg;
    this.isLoading = false;
  }

  /** Map AdminRouteDetails → SavedRoute so the rest of the component is identical. */
  private adminToSaved(a: AdminRouteDetails): SavedRoute {
    return {
      id: a.id,
      title: a.title,
      cityId: a.cityId,
      cityName: a.cityName,
      durationDays: a.durationDays,
      theme: a.theme,
      tags: a.tags,
      aiSummary: a.aiSummary,
      createdAt: a.createdAt,
      stopCount: a.stops.length,
      stops: a.stops
    };
  }

  // ── helpers ───────────────────────────────────────────────────────
  tagList(): string[] {
    return (this.route$?.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  }

  /** Group stops by day for the day-by-day list under the summary. */
  stopsByDay(): Array<{ day: number; stops: SavedRouteStop[] }> {
    if (!this.route$) return [];
    const map = new Map<number, SavedRouteStop[]>();
    for (const s of this.route$.stops) {
      const arr = map.get(s.day) ?? [];
      arr.push(s);
      map.set(s.day, arr);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, stops]) => ({ day, stops: stops.sort((a, b) => a.order - b.order) }));
  }

  /** Convert "\n\n" paragraphs into visual paragraphs. */
  summaryParagraphs(): string[] {
    return (this.route$?.aiSummary || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  }

  goBack() { this.router.navigate(['/profile']); }

  // ── Yandex map rendering ──────────────────────────────────────────
  private async renderMap() {
    if (!this.route$ || typeof ymaps === 'undefined') return;
    const stops = this.route$.stops;
    if (stops.length === 0) return;

    await ymaps.ready(async () => {
      const mapElement = document.getElementById('saved-route-map');
      if (!mapElement) return;
      mapElement.innerHTML = '';

      // Centre = city coords if known, else first stop with coords.
      let cityCoords: [number, number] = [55.75, 37.62];
      if (this.city?.latitude != null && this.city?.longitude != null) {
        cityCoords = [this.city.latitude, this.city.longitude];
      } else {
        const first = stops.find(s => s.latitude != null && s.longitude != null);
        if (first) cityCoords = [first.latitude!, first.longitude!];
      }

      const map = new ymaps.Map('saved-route-map', {
        center: cityCoords,
        zoom: 12,
        controls: ['zoomControl'],
        behaviors: ['drag', 'scrollZoom']
      });

      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
      const allCoords: Array<[number, number]> = [];
      const preciseCoords: Array<[number, number]> = [];

      stops.forEach((stop, i) => {
        const isPrecise = stop.latitude != null && stop.longitude != null;
        let coords: [number, number];
        if (isPrecise) {
          coords = [stop.latitude!, stop.longitude!];
          preciseCoords.push(coords);
        } else {
          // Deterministic jitter so markers don't pile up at city centre.
          const jLat = ((i * 37) % 9 - 4) * 0.0008;
          const jLng = ((i * 53) % 11 - 5) * 0.0012;
          coords = [cityCoords[0] + jLat, cityCoords[1] + jLng];
        }
        allCoords.push(coords);

        const color = colors[(stop.day - 1) % colors.length];
        const balloon = `<b>#${i + 1} · ${stop.time || '—'}</b>${stop.duration ? ' · ' + stop.duration : ''}<br>` +
                        `<b>${stop.name}</b>${stop.tip ? '<br>' + stop.tip : ''}` +
                        (isPrecise ? '' : '<br><small>Приблизительное расположение</small>');

        const placemark = new ymaps.Placemark(
          coords,
          {
            balloonContent: balloon,
            iconContent: i + 1,
            hintContent: `${i + 1}. ${stop.name}`
          },
          { preset: 'islands#circleIcon', iconColor: color }
        );
        map.geoObjects.add(placemark);
      });

      // Connect with a pedestrian multi-route only if we have ≥ 2 precise
      // points (otherwise the route line would distort wildly through jitter).
      if (preciseCoords.length > 1) {
        try {
          const multi = new ymaps.multiRouter.MultiRoute(
            { referencePoints: preciseCoords, params: { routingMode: 'pedestrian' } },
            { boundsAutoApply: true }
          );
          map.geoObjects.add(multi);
        } catch { /* best effort */ }
      } else if (allCoords.length > 0) {
        try {
          const minLat = Math.min(...allCoords.map(c => c[0]));
          const maxLat = Math.max(...allCoords.map(c => c[0]));
          const minLng = Math.min(...allCoords.map(c => c[1]));
          const maxLng = Math.max(...allCoords.map(c => c[1]));
          const padLat = Math.max(0.005, (maxLat - minLat) * 0.05);
          const padLng = Math.max(0.005, (maxLng - minLng) * 0.05);
          map.setBounds([[minLat - padLat, minLng - padLng], [maxLat + padLat, maxLng + padLng]],
            { checkZoomRange: true });
        } catch { /* leave default */ }
      }
    });
  }
}
