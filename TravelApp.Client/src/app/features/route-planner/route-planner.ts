import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { Guide, RouteDayData } from '../../core/services/guide';
import { UserRoutesService } from '../../core/services/user-routes';
import { City } from '../../core/models/city.model';

declare const ymaps: any;

type RoutePlace = {
  name: string;
  day: number;
  time: string;
  duration: string;
  tip: string;
  /** Optional — backend fills this when the AI-name matched a real Attraction. */
  latitude?: number | null;
  longitude?: number | null;
};

type RouteDay = {
  day: number;
  title: string;
  places: RoutePlace[];
};

@Component({
  selector: 'app-route-planner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './route-planner.html',
  styleUrl: './route-planner.css'
})
export class RoutePlanner implements OnInit {
  city: City | null = null;
  step = 1;
  isGenerating = false;
  isPdfGenerating = false;

  // Save-to-DB UI state
  isSavingRoute = false;
  saveError = '';
  savedRouteId: number | null = null;

  // True once step 4 has been entered (controls result block visibility)
  showResult = false;
  routeError = '';

  selectedDays = 1;
  selectedStyle = '';
  selectedWith = '';

  days = [1, 2, 3, 4, 5];
  places: RoutePlace[] = [];
  routeDays: RouteDay[] = [];

  styles = [
    { id: 'culture', label: 'Культура' },
    { id: 'food',    label: 'Еда' },
    { id: 'active',  label: 'Активный' },
    { id: 'relax',   label: 'Расслабленный' },
    { id: 'party',   label: 'Тусовки' },
    { id: 'budget',  label: 'Бюджетно' },
  ];

  withs = [
    { id: 'solo',    label: 'Один' },
    { id: 'partner', label: 'С партнёром' },
    { id: 'family',  label: 'С семьёй' },
    { id: 'friends', label: 'С друзьями' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cityService: CityService,
    private guide: Guide,
    private userRoutes: UserRoutesService
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.cityService.getCityById(id).subscribe({
      next: (data) => { this.city = data; }
    });
  }

  selectStyle(id: string) { this.selectedStyle = id; }
  selectWith(id: string)  { this.selectedWith = id; }
  selectDays(n: number)   { this.selectedDays = n; }

  canProceed(): boolean {
    if (this.step === 1) return this.selectedDays > 0;
    if (this.step === 2) return this.selectedStyle !== '';
    if (this.step === 3) return this.selectedWith !== '';
    return false;
  }

  next() {
    if (this.step < 3) { this.step++; return; }
    this.generate();
  }

  back() {
    if (this.step > 1) { this.step--; return; }
    this.router.navigate(['/cities', this.city?.id]);
  }

  generate() {
    this.step = 4;

    if (!navigator.onLine) {
      this.showResult = true;
      this.isGenerating = false;
      this.routeError = 'Генерация маршрута требует интернет-соединение. Подключитесь к сети и попробуй снова.';
      return;
    }

    this.isGenerating = true;
    this.showResult = false;
    this.routeError = '';
    this.places = [];
    this.routeDays = [];
    this.savedRouteId = null;
    this.saveError = '';

    this.guide.askRoute({
      cityName: this.city?.name ?? '',
      days: this.selectedDays,
      style: this.getSelectedStyleLabel(),
      with: this.getSelectedWithLabel()
    }).subscribe({
      next: (response) => {
        this.showResult = true;
        this.isGenerating = false;

        if (!response.success || !response.days?.length) {
          this.routeError = response.error ?? 'Не удалось сгенерировать маршрут. Попробуй ещё раз.';
          return;
        }

        this.routeDays = this.mapDays(response.days);
        this.places    = this.routeDays.flatMap(d => d.places);
        void this.renderRouteMap();
      },
      error: (err) => {
        this.showResult = true;
        this.isGenerating = false;
        if (err?.type === 'timeout') {
          this.routeError = 'Генерация заняла слишком много времени. Попробуй ещё раз.';
        } else {
          this.routeError = 'Не удалось сгенерировать маршрут. Проверь соединение.';
        }
      }
    });
  }

  private mapDays(days: RouteDayData[]): RouteDay[] {
    return days.map(d => ({
      day: d.day,
      title: d.title ?? '',
      places: d.places.map(p => ({
        name:      p.name,
        day:       d.day,
        time:      p.time,
        duration:  p.duration ?? '',
        tip:       p.tip,
        latitude:  p.latitude,
        longitude: p.longitude
      }))
    }));
  }

  async initMap() {
    if (!this.places.length) return;

    await ymaps.ready(async () => {
      const mapElement = document.getElementById('route-map');
      if (mapElement) mapElement.innerHTML = '';

      // ── 1. Resolve city centre coordinates ────────────────────────────
      // Prefer the city's coordinates that came from our DB (via the City
      // service); fall back to Yandex geocoder if the City row is missing
      // them. This keeps the map working even on flaky internet.
      let cityCoords: [number, number];
      if (this.city?.latitude != null && this.city?.longitude != null) {
        cityCoords = [this.city.latitude, this.city.longitude];
      } else {
        try {
          const cityResult = await ymaps.geocode(`${this.city?.name ?? ''}, Россия`, { results: 1 });
          const cityGeo = cityResult.geoObjects.get(0);
          if (!cityGeo) return;
          cityCoords = cityGeo.geometry.getCoordinates();
        } catch { return; }
      }

      const map = new ymaps.Map('route-map', {
        center: cityCoords,
        zoom: 12,
        controls: ['zoomControl'],
        behaviors: ['drag', 'scrollZoom']
      });

      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];

      // ── 2. Resolve every place's coordinates ──────────────────────────
      // Priority:
      //   (a) backend-provided lat/lng (matched against Attractions table)
      //   (b) Yandex geocoder result that is within 50 km of the city
      //   (c) city centre + tiny deterministic jitter so markers don't pile up
      // This GUARANTEES every place gets a marker — the previous code
      // silently dropped places when the geocoder couldn't resolve the
      // AI-fabricated name.
      const resolved: Array<{ coords: [number, number]; place: RoutePlace; index: number; precise: boolean }> = [];

      await Promise.all(this.places.map(async (place, index) => {
        // (a) Backend coords win — no geocoder round-trip needed.
        if (place.latitude != null && place.longitude != null) {
          resolved.push({ coords: [place.latitude, place.longitude], place, index, precise: true });
          return;
        }
        // (b) Try Yandex geocoder.
        try {
          const result = await ymaps.geocode(`${this.city!.name}, ${place.name}`, { results: 1 });
          const coords = result.geoObjects.get(0)?.geometry.getCoordinates();
          if (coords) {
            const distance = ymaps.coordSystem.geo.distance(cityCoords, coords);
            if (distance <= 50000) {
              resolved.push({ coords, place, index, precise: true });
              return;
            }
          }
        } catch { /* network / quota issue — fall through to jitter */ }

        // (c) City-centre fallback with a deterministic per-index jitter
        //     (~ ±400m) so markers don't stack on top of each other.
        const jitterLat = ((index * 37) % 9 - 4) * 0.0008;
        const jitterLng = ((index * 53) % 11 - 5) * 0.0012;
        resolved.push({
          coords: [cityCoords[0] + jitterLat, cityCoords[1] + jitterLng],
          place, index, precise: false
        });
      }));

      // Preserve the original day/time order on the map.
      resolved.sort((a, b) => a.index - b.index);

      for (const { coords, place, index, precise } of resolved) {
        const color = colors[(place.day - 1) % colors.length];
        const balloonNote = precise ? '' : '<br><small>Приблизительное расположение</small>';
        const placemark = new ymaps.Placemark(
          coords,
          {
            balloonContent: `<b>${place.time}</b>${place.duration ? ' · ' + place.duration : ''} — ${place.name}<br>${place.tip}${balloonNote}`,
            iconContent: index + 1
          },
          { preset: 'islands#circleIcon', iconColor: color }
        );
        map.geoObjects.add(placemark);
      }

      // ── 3. Connect markers with a route line if we have ≥ 2 of them ───
      const validCoords = resolved.filter(r => r.precise).map(r => r.coords);
      if (validCoords.length > 1) {
        try {
          const multiRoute = new ymaps.multiRouter.MultiRoute(
            { referencePoints: validCoords, params: { routingMode: 'pedestrian' } },
            { boundsAutoApply: true }
          );
          map.geoObjects.add(multiRoute);
        } catch { /* MultiRoute is best-effort; markers themselves are enough */ }
      } else {
        // Auto-fit the map to all markers (precise + jittered).
        try {
          const bounds = resolved.map(r => r.coords);
          if (bounds.length > 0) map.setBounds(this.boundsFromPoints(bounds), { checkZoomRange: true });
        } catch { /* leave at default centre */ }
      }
    });
  }

  /** Compute a [[swLat, swLng], [neLat, neLng]] bounding box from points. */
  private boundsFromPoints(points: Array<[number, number]>): [[number, number], [number, number]] {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    // pad ~5%
    const padLat = Math.max(0.005, (maxLat - minLat) * 0.05);
    const padLng = Math.max(0.005, (maxLng - minLng) * 0.05);
    return [[minLat - padLat, minLng - padLng], [maxLat + padLat, maxLng + padLng]];
  }

  goBack() { this.router.navigate(['/cities', this.city?.id]); }

  // ── Save the just-generated route to the user's profile ──────────
  // Idempotent server-side via ContentHash, so re-pressing the button
  // doesn't duplicate the row — it just updates `savedRouteId`.
  saveRoute() {
    if (this.isSavingRoute || !this.places.length || !this.city) return;
    this.isSavingRoute = true;
    this.saveError = '';

    this.userRoutes.save({
      cityId:       this.city.id,
      title:        this.buildRouteTitle(),
      description:  '',
      durationDays: this.selectedDays,
      theme:        this.getSelectedStyleLabel(),
      tags:         this.deriveTags(),
      aiSummary:    this.buildAiSummary(),
      stops: this.places.map(p => ({
        day:       p.day,
        name:      p.name,
        time:      p.time,
        duration:  p.duration,
        tip:       p.tip,
        latitude:  p.latitude,
        longitude: p.longitude
      }))
    }).subscribe({
      next: r => {
        this.isSavingRoute = false;
        this.savedRouteId  = r.id;
      },
      error: () => {
        this.isSavingRoute = false;
        this.saveError = 'Не удалось сохранить маршрут. Попробуй ещё раз.';
      }
    });
  }

  /** Open the saved route page (map + AI text). */
  openSavedRoute() {
    if (this.savedRouteId) this.router.navigate(['/routes', this.savedRouteId]);
  }

  /** "Москва · 2 дня · Культура" — used as the saved route's title. */
  private buildRouteTitle(): string {
    const parts = [this.city?.name, `${this.selectedDays} дн`, this.getSelectedStyleLabel()].filter(Boolean);
    return parts.join(' · ');
  }

  /**
   * Build a human summary the model could have written. We don't want to
   * hit the AI again just for this — instead we stitch together day titles
   * + first place per day + first useful tip.
   */
  private buildAiSummary(): string {
    if (!this.routeDays.length) return '';
    const lines = this.routeDays.map(d => {
      const first = d.places[0];
      const headline = d.title || `День ${d.day}`;
      const start = first ? ` Начнём с «${first.name}» в ${first.time || 'утро'}.` : '';
      const tip = d.places.find(p => p.tip)?.tip ?? '';
      return `День ${d.day}. ${headline}.${start}${tip ? ' ' + tip : ''}`;
    });
    return lines.join('\n\n');
  }

  /**
   * Derive tags from city + style + place hints. The set is intentionally
   * coarse so the admin "filter by tag" feature works on bag-of-keywords.
   */
  private deriveTags(): string {
    const tags = new Set<string>();
    // Base from the user's chosen style
    const style = this.getSelectedStyleLabel().toLowerCase();
    if (style) tags.add(style);
    // City tags ("море,столица,культура") inherited as-is
    if (this.city?.tags) {
      for (const t of this.city.tags.split(',')) {
        const v = t.trim().toLowerCase();
        if (v) tags.add(v);
      }
    }
    // Heuristics from place names — pick a few well-known categories
    const blob = this.places.map(p => `${p.name} ${p.tip}`).join(' ').toLowerCase();
    const hints: Array<[RegExp, string]> = [
      [/музе/, 'музеи'],
      [/набереж|пляж|мор[ея]/, 'море'],
      [/парк|сад|сквер|природ/, 'природа'],
      [/собор|храм|церк|монастыр/, 'религия'],
      [/ресторан|кафе|еда|кухн/, 'гастрономия'],
      [/кремл|столиц/, 'столица'],
      [/бар|клуб|ночн/, 'ночная жизнь']
    ];
    for (const [re, tag] of hints) {
      if (re.test(blob)) tags.add(tag);
    }
    return [...tags].slice(0, 8).join(',');
  }

  getSelectedStyleLabel(): string {
    return this.styles.find(s => s.id === this.selectedStyle)?.label ?? '';
  }

  getSelectedWithLabel(): string {
    return this.withs.find(w => w.id === this.selectedWith)?.label ?? '';
  }

  getPdfDate(): string {
    return new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  private async renderRouteMap() {
    await this.waitForDomUpdate(300);
    const element = document.getElementById('route-map');
    if (element && this.places.length > 0) await this.initMap();
  }

  private waitForDomUpdate(delayMs = 0): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        const finish = () => requestAnimationFrame(() => resolve());
        if (delayMs > 0) { setTimeout(finish, delayMs); return; }
        finish();
      });
    });
  }

  private async waitForImages(element: HTMLElement) {
    const images = Array.from(element.querySelectorAll('img'));
    if (!images.length) return;
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>(resolve => {
        img.addEventListener('load',  () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    }));
  }

  private preparePdfElement(element: HTMLElement): () => void {
    const prev = {
      display: element.style.display, position: element.style.position,
      left: element.style.left, top: element.style.top,
      visibility: element.style.visibility,
      pointerEvents: element.style.pointerEvents, zIndex: element.style.zIndex
    };
    element.style.display      = 'block';
    element.style.position     = 'fixed';
    element.style.left         = '-10000px';
    element.style.top          = '0';
    element.style.visibility   = 'visible';
    element.style.pointerEvents= 'none';
    element.style.zIndex       = '-1';
    return () => {
      element.style.display      = prev.display;
      element.style.position     = prev.position;
      element.style.left         = prev.left;
      element.style.top          = prev.top;
      element.style.visibility   = prev.visibility;
      element.style.pointerEvents= prev.pointerEvents;
      element.style.zIndex       = prev.zIndex;
    };
  }

  private async waitForPdfLayout(element: HTMLElement) {
    await this.waitForDomUpdate(100);
    await this.waitForDomUpdate(250);
    await this.waitForImages(element);
  }

  private getElementSize(element: HTMLElement, fallbackWidth = 794, fallbackHeight = 1123) {
    return {
      width:  Math.max(element.scrollWidth, element.offsetWidth,  fallbackWidth),
      height: Math.max(element.scrollHeight, element.offsetHeight, fallbackHeight)
    };
  }

  async downloadPdf() {
    if (this.isPdfGenerating || this.routeDays.length === 0) return;

    const element = document.getElementById('pdf-template');
    if (!element) return;

    this.isPdfGenerating = true;
    const restore = this.preparePdfElement(element);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'), import('html2canvas')
      ]);

      await this.waitForPdfLayout(element);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pages = Array.from(element.querySelectorAll<HTMLElement>('.pdf-page'));

      if (!pages.length) throw new Error('PDF pages not found');

      for (let i = 0; i < pages.length; i++) {
        await this.waitForPdfLayout(pages[i]);
        const { width, height } = this.getElementSize(pages[i]);
        if (height === 0) throw new Error('PDF page has zero height');

        const canvas = await html2canvas(pages[i], {
          width, height, windowWidth: width, windowHeight: height,
          scale: 2, useCORS: true, allowTaint: true,
          // Match the dark template background so any rounding/anti-alias
          // artifacts blend in instead of producing a 1-2px white border.
          backgroundColor: '#0b0f14', logging: false
        });

        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight);
      }

      pdf.save(`Маршрут_${this.city?.name}.pdf`);
    } catch (error) {
      console.error('Ошибка генерации PDF:', error);
    } finally {
      restore();
      this.isPdfGenerating = false;
    }
  }
}
