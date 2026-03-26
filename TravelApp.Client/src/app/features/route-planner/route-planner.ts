import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { Guide, RouteDayData } from '../../core/services/guide';
import { City } from '../../core/models/city.model';

declare const ymaps: any;

type RoutePlace = {
  name: string;
  day: number;
  time: string;
  duration: string;
  tip: string;
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
    private guide: Guide
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
        name:     p.name,
        day:      d.day,
        time:     p.time,
        duration: p.duration ?? '',
        tip:      p.tip
      }))
    }));
  }

  async initMap() {
    if (!this.places.length) return;

    await ymaps.ready(async () => {
      const mapElement = document.getElementById('route-map');
      if (mapElement) mapElement.innerHTML = '';

      const map = new ymaps.Map('route-map', {
        center: [55.75, 37.62],
        zoom: 12,
        controls: ['zoomControl'],
        behaviors: ['drag', 'scrollZoom']
      });

      const cityResult = await ymaps.geocode(`${this.city!.name}, Россия`, { results: 1 });
      const cityGeo = cityResult.geoObjects.get(0);
      if (!cityGeo) return;

      const cityCoords = cityGeo.geometry.getCoordinates();
      map.setCenter(cityCoords, 12);

      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];

      const geocodePromises = this.places.map((place, index) =>
        ymaps.geocode(`${this.city!.name}, ${place.name}`, { results: 1 }).then((result: any) => {
          const coords = result.geoObjects.get(0)?.geometry.getCoordinates();
          if (!coords) return null;

          const distance = ymaps.coordSystem.geo.distance(cityCoords, coords);
          if (distance > 50000) return null;

          const color = colors[(place.day - 1) % colors.length];
          const placemark = new ymaps.Placemark(
            coords,
            {
              balloonContent: `<b>${place.time}</b>${place.duration ? ' · ' + place.duration : ''} — ${place.name}<br>${place.tip}`,
              iconContent: index + 1
            },
            { preset: 'islands#circleIcon', iconColor: color }
          );
          map.geoObjects.add(placemark);
          return coords;
        })
      );

      const coordsList = await Promise.all(geocodePromises);
      const validCoords = coordsList.filter(c => c !== null);
      if (validCoords.length > 1) {
        const multiRoute = new ymaps.multiRouter.MultiRoute(
          { referencePoints: validCoords, params: { routingMode: 'pedestrian' } },
          { boundsAutoApply: true }
        );
        map.geoObjects.add(multiRoute);
      }
    });
  }

  goBack() { this.router.navigate(['/cities', this.city?.id]); }

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
          backgroundColor: '#ffffff', logging: false
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
