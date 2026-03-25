import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { Guide } from '../../core/services/guide';
import { City } from '../../core/models/city.model';

declare const ymaps: any;

type RoutePlace = {
  name: string;
  day: number;
  time: string;
  tip: string;
};

type RouteDay = {
  day: number;
  places: RoutePlace[];
};

type ParsedRoutePlan = {
  days?: Array<{
    day?: number;
    places?: Array<Partial<RoutePlace>>;
  }>;
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
  generatedRoute = '';

  selectedDays = 1;
  selectedStyle = '';
  selectedWith = '';

  days = [1, 2, 3, 4, 5];
  places: RoutePlace[] = [];
  routeDays: RouteDay[] = [];

  styles = [
    { id: 'culture', label: 'Культура' },
    { id: 'food', label: 'Еда' },
    { id: 'active', label: 'Активный' },
    { id: 'relax', label: 'Расслабленный' },
    { id: 'party', label: 'Тусовки' },
    { id: 'budget', label: 'Бюджетно' },
  ];

  withs = [
    { id: 'solo', label: 'Один' },
    { id: 'partner', label: 'С партнёром' },
    { id: 'family', label: 'С семьёй' },
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
      next: (data) => {
        this.city = data;
      }
    });
  }

  selectStyle(id: string) {
    this.selectedStyle = id;
  }

  selectWith(id: string) {
    this.selectedWith = id;
  }

  selectDays(daysCount: number) {
    this.selectedDays = daysCount;
  }

  canProceed(): boolean {
    if (this.step === 1) {
      return this.selectedDays > 0;
    }
    if (this.step === 2) {
      return this.selectedStyle !== '';
    }
    if (this.step === 3) {
      return this.selectedWith !== '';
    }
    return false;
  }

  next() {
    if (this.step < 3) {
      this.step++;
      return;
    }

    this.generate();
  }

  back() {
    if (this.step > 1) {
      this.step--;
      return;
    }

    this.router.navigate(['/cities', this.city?.id]);
  }

  generate() {
    this.step = 4;
    this.isGenerating = true;
    this.places = [];
    this.routeDays = [];

    const styleName = this.getSelectedStyleLabel();
    const withName = this.getSelectedWithLabel();

    const prompt = `Составь маршрут по ${this.city?.name} на ${this.selectedDays} дн. Стиль: ${styleName}. С кем: ${withName}.
Верни ТОЛЬКО JSON без пояснений:
{"days":[{"day":1,"places":[{"name":"место","time":"10:00","tip":"совет"}]}]}
Макс 4 места в день. Реальные места. Русский язык.`;

    this.guide.ask(this.city?.name ?? '', prompt).subscribe({
      next: (response) => {
        console.log('Ответ AI:', response.answer);

        try {
          const parsed = this.parseRoutePlan(response.answer);
          if (parsed) {
            this.setPlaces(this.extractPlaces(parsed));
          }
        } catch (error) {
          console.error('Ошибка парсинга JSON:', error);
        }

        this.generatedRoute = response.answer;
        this.isGenerating = false;
        void this.renderRouteMap();
      },
      error: () => {
        this.generatedRoute = 'Не удалось сгенерировать маршрут. Попробуй ещё раз.';
        this.isGenerating = false;
      }
    });
  }

  private parseRoutePlan(answer: string): ParsedRoutePlan | null {
    const clean = answer
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBraceIndex = clean.indexOf('{');
    if (firstBraceIndex === -1) {
      return null;
    }

    const rawJson = clean.slice(firstBraceIndex);
    const lastBraceIndex = rawJson.lastIndexOf('}');
    const jsonCandidate =
      lastBraceIndex >= 0 ? rawJson.slice(0, lastBraceIndex + 1) : rawJson;

    const parsedFull = this.tryParseRoutePlan(jsonCandidate);
    if (parsedFull) {
      return parsedFull;
    }

    const closingBraceIndexes = Array.from(jsonCandidate.matchAll(/}/g))
      .map(match => match.index ?? -1)
      .filter(index => index >= 0);

    for (let i = closingBraceIndexes.length - 1; i >= 0; i--) {
      const jsonPart = jsonCandidate.slice(0, closingBraceIndexes[i] + 1);
      const parsedPart = this.tryParseRoutePlan(jsonPart);
      if (parsedPart) {
        return parsedPart;
      }
    }

    return this.tryParseRoutePlan(this.repairTruncatedJson(jsonCandidate));
  }

  private tryParseRoutePlan(jsonStr: string): ParsedRoutePlan | null {
    if (!jsonStr.trim()) {
      return null;
    }

    try {
      return JSON.parse(jsonStr) as ParsedRoutePlan;
    } catch {
      try {
        return JSON.parse(this.repairTruncatedJson(jsonStr)) as ParsedRoutePlan;
      } catch {
        return null;
      }
    }
  }

  private repairTruncatedJson(jsonStr: string): string {
    let repaired = jsonStr.trim();

    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));

    return repaired.replace(/,\s*([}\]])/g, '$1');
  }

  private extractPlaces(data: ParsedRoutePlan): RoutePlace[] {
    if (!Array.isArray(data.days)) {
      return [];
    }

    const places: RoutePlace[] = [];

    for (const day of data.days) {
      const dayNumber = Number(day?.day);
      if (!Number.isFinite(dayNumber) || !Array.isArray(day?.places)) {
        continue;
      }

      for (const place of day.places) {
        const name = String(place?.name ?? '').trim();
        if (!name) {
          continue;
        }

        places.push({
          name,
          day: dayNumber,
          time: String(place?.time ?? '').trim(),
          tip: String(place?.tip ?? '').trim()
        });
      }
    }

    return places;
  }

  private setPlaces(places: RoutePlace[]) {
    this.places = places;
    this.routeDays = this.buildRouteDays(places);
  }

  private buildRouteDays(places: RoutePlace[]): RouteDay[] {
    const grouped = new Map<number, RoutePlace[]>();

    for (const place of places) {
      const dayPlaces = grouped.get(place.day) ?? [];
      dayPlaces.push(place);
      grouped.set(place.day, dayPlaces);
    }

    return Array.from(grouped.entries())
      .sort(([dayA], [dayB]) => dayA - dayB)
      .map(([day, dayPlaces]) => ({
        day,
        places: [...dayPlaces].sort((a, b) => a.time.localeCompare(b.time, 'ru'))
      }));
  }

  async initMap() {
    if (!this.places.length) {
      return;
    }

    await ymaps.ready(async () => {
      const mapElement = document.getElementById('route-map');
      if (mapElement) {
        mapElement.innerHTML = '';
      }

      const map = new ymaps.Map('route-map', {
        center: [55.75, 37.62],
        zoom: 12,
        controls: ['zoomControl'],
        behaviors: ['drag', 'scrollZoom']
      });

      const cityResult = await ymaps.geocode(`${this.city!.name}, Россия`, { results: 1 });
      const cityGeo = cityResult.geoObjects.get(0);
      if (!cityGeo) {
        return;
      }

      const cityCoords = cityGeo.geometry.getCoordinates();
      map.setCenter(cityCoords, 12);

      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
      const geocodePromises = this.places.map((place, index) =>
        ymaps.geocode(`${this.city!.name}, ${place.name}`, { results: 1 }).then((result: any) => {
          const coords = result.geoObjects.get(0)?.geometry.getCoordinates();
          if (!coords) {
            return null;
          }

          const distance = ymaps.coordSystem.geo.distance(cityCoords, coords);
          if (distance > 50000) {
            return null;
          }

          const color = colors[(place.day - 1) % colors.length];
          const placemark = new ymaps.Placemark(
            coords,
            {
              balloonContent: `<b>${place.time}</b> - ${place.name}<br>${place.tip}`,
              iconContent: index + 1
            },
            {
              preset: 'islands#circleIcon',
              iconColor: color
            }
          );

          map.geoObjects.add(placemark);
          return coords;
        })
      );

      Promise.all(geocodePromises).then(coordsList => {
        const validCoords = coordsList.filter(coords => coords !== null);
        if (validCoords.length > 1) {
          const multiRoute = new ymaps.multiRouter.MultiRoute(
            {
              referencePoints: validCoords,
              params: { routingMode: 'pedestrian' }
            },
            { boundsAutoApply: true }
          );

          map.geoObjects.add(multiRoute);
        }
      });
    });
  }

  formatRoute(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  goBack() {
    this.router.navigate(['/cities', this.city?.id]);
  }

  getSelectedStyleLabel(): string {
    return this.styles.find(style => style.id === this.selectedStyle)?.label ?? '';
  }

  getSelectedWithLabel(): string {
    return this.withs.find(item => item.id === this.selectedWith)?.label ?? '';
  }

  getPdfDate(): string {
    return new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  private async renderRouteMap() {
    await this.waitForDomUpdate(300);

    const element = document.getElementById('route-map');
    if (element && this.places.length > 0) {
      await this.initMap();
    }
  }

  private waitForDomUpdate(delayMs = 0): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        const finish = () => requestAnimationFrame(() => resolve());

        if (delayMs > 0) {
          setTimeout(finish, delayMs);
          return;
        }

        finish();
      });
    });
  }

  private async waitForImages(element: HTMLElement) {
    const images = Array.from(element.querySelectorAll('img'));
    if (images.length === 0) {
      return;
    }

    await Promise.all(
      images.map(image => {
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise<void>(resolve => {
          const done = () => resolve();
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        });
      })
    );
  }

  private preparePdfElement(element: HTMLElement): () => void {
    const previousStyles = {
      display: element.style.display,
      position: element.style.position,
      left: element.style.left,
      top: element.style.top,
      visibility: element.style.visibility,
      pointerEvents: element.style.pointerEvents,
      zIndex: element.style.zIndex
    };

    // html2canvas does not render nodes with visibility:hidden.
    element.style.display = 'block';
    element.style.position = 'fixed';
    element.style.left = '-10000px';
    element.style.top = '0';
    element.style.visibility = 'visible';
    element.style.pointerEvents = 'none';
    element.style.zIndex = '-1';

    return () => {
      element.style.display = previousStyles.display;
      element.style.position = previousStyles.position;
      element.style.left = previousStyles.left;
      element.style.top = previousStyles.top;
      element.style.visibility = previousStyles.visibility;
      element.style.pointerEvents = previousStyles.pointerEvents;
      element.style.zIndex = previousStyles.zIndex;
    };
  }

  private async waitForPdfLayout(element: HTMLElement) {
    await this.waitForDomUpdate(100);
    await this.waitForDomUpdate(250);
    await this.waitForImages(element);
  }

  private getElementSize(element: HTMLElement, fallbackWidth = 794, fallbackHeight = 1123) {
    return {
      width: Math.max(element.scrollWidth, element.offsetWidth, fallbackWidth),
      height: Math.max(element.scrollHeight, element.offsetHeight, fallbackHeight)
    };
  }

  async downloadPdf() {
    if (this.isPdfGenerating || this.routeDays.length === 0) {
      return;
    }

    const element = document.getElementById('pdf-template');
    if (!element) {
      return;
    }

    this.isPdfGenerating = true;
    const restoreElement = this.preparePdfElement(element);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ]);

      await this.waitForPdfLayout(element);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pages = Array.from(element.querySelectorAll<HTMLElement>('.pdf-page'));

      if (pages.length === 0) {
        throw new Error('PDF pages not found');
      }

      for (let index = 0; index < pages.length; index++) {
        const pageElement = pages[index];
        await this.waitForPdfLayout(pageElement);

        const { width, height } = this.getElementSize(pageElement);
        if (height === 0) {
          throw new Error('PDF page has zero height');
        }

        const canvas = await html2canvas(pageElement, {
          width,
          height,
          windowWidth: width,
          windowHeight: height,
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false
        });

        if (index > 0) {
          pdf.addPage();
        }

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
      }

      pdf.save(`Маршрут_${this.city?.name}.pdf`);
    } catch (error) {
      console.error('Ошибка генерации PDF:', error);
    } finally {
      restoreElement();
      this.isPdfGenerating = false;
    }
  }
}
