import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, ViewChildren, QueryList
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { Guide } from '../../core/services/guide';
import { Auth, CurrentUser } from '../../core/services/auth';
import { City } from '../../core/models/city.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cardsContainer') cardsContainerRef!: ElementRef<HTMLElement>;
  @ViewChildren('citySlide') citySlideRefs!: QueryList<ElementRef<HTMLElement>>;

  cities: City[] = [];
  isLoading = true;
  savedIds = new Set<number>();
  user: CurrentUser | null = null;
  weekendTips = '';
  weekendError = '';
  isLoadingTips = false;
  showWeekend = false;
  isDark = false;

  private observer: IntersectionObserver | null = null;
  private heartAnimating = new Set<number>();

  constructor(
    private cityService: CityService,
    private router: Router,
    private guide: Guide,
    private auth: Auth
  ) {}

  ngOnInit() {
    this.user = this.auth.getUser();
    this.isDark = (this.user?.theme ?? localStorage.getItem('theme') ?? 'dark') !== 'light';
    document.body.classList.toggle('light-theme', !this.isDark);
    document.body.classList.toggle('animations-off', localStorage.getItem('animationsEnabled') === 'false');
    this.loadCities();
  }

  ngAfterViewInit() {
    this.setupIntersectionObserver();
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private setupIntersectionObserver() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.15 }
    );

    // Re-observe whenever slides change
    this.citySlideRefs?.changes.subscribe(() => this.observeSlides());
    this.observeSlides();
  }

  private observeSlides() {
    if (!this.observer) return;
    this.citySlideRefs?.forEach(ref => this.observer!.observe(ref.nativeElement));
  }

  loadCities() {
    this.cityService.getCities().subscribe({
      next: (data) => {
        this.cities = data;
        this.savedIds = new Set(data.filter(c => c.isFavorite).map(c => c.id));
        this.isLoading = false;
        this.loadPhotos();
        // Re-observe after data arrives
        setTimeout(() => this.observeSlides(), 60);
      },
      error: (err) => {
        console.error('Ошибка загрузки городов:', err);
        this.isLoading = false;
      }
    });
  }

  loadPhotos() {
    this.cities.forEach(city => {
      if (!city.imageUrl || !city.imageUrl.startsWith('http')) {
        this.cityService.getCityPhoto(city.id).subscribe({
          next: (r) => { if (r.url) city.imageUrl = r.url; }
        });
      }
    });
  }

  getPhotoUrl(city: City): string {
    return city.imageUrl?.startsWith('http') ? city.imageUrl : '';
  }

  toggleWeekend() {
    this.showWeekend = !this.showWeekend;
    if (this.showWeekend && !this.weekendTips && !this.weekendError && this.user?.homeCity) {
      this.loadWeekendTips();
    }
  }

  // ── "Куда съездить на выходные?" — AI pick from real cities ─────
  weekendPick: import('../../core/services/guide').WeekendResponse | null = null;
  isLoadingWeekendPick = false;
  weekendPickError = '';

  pickWeekendCity() {
    if (this.isLoadingWeekendPick) return;
    if (!navigator.onLine) {
      this.weekendPickError = 'Рекомендация недоступна без интернета.';
      return;
    }
    this.isLoadingWeekendPick = true;
    this.weekendPickError = '';
    this.weekendPick = null;

    this.guide.weekend(this.user?.homeCity).subscribe({
      next: (r) => {
        this.isLoadingWeekendPick = false;
        if (!r.success) {
          this.weekendPickError = r.error ?? 'Не удалось получить рекомендацию.';
          return;
        }
        this.weekendPick = r;
      },
      error: (err) => {
        this.isLoadingWeekendPick = false;
        this.weekendPickError = err?.type === 'timeout'
          ? 'AI отвечал слишком долго. Попробуй ещё раз.'
          : 'Не удалось получить рекомендацию.';
      }
    });
  }

  closeWeekendPick() {
    this.weekendPick = null;
    this.weekendPickError = '';
  }

  goToWeekendCity() {
    if (this.weekendPick?.cityId) {
      const id = this.weekendPick.cityId;
      this.closeWeekendPick();
      this.router.navigate(['/cities', id]);
    }
  }

  toggleTheme() {
    this.isDark = !this.isDark;
    const theme = this.isDark ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    document.body.classList.toggle('light-theme', !this.isDark);
    this.auth.updateProfile({ theme }).subscribe({ error: () => {} });
  }

  loadWeekendTips() {
    if (!navigator.onLine) {
      this.weekendError = 'Рекомендации недоступны без интернета.';
      return;
    }
    this.isLoadingTips = true;
    this.weekendError = '';
    this.guide.ask(
      this.user?.homeCity ?? '',
      `Я живу в городе ${this.user?.homeCity}. Предложи 3 места для поездки на выходные. Для каждого укажи расстояние и одну причину. Кратко.`
    ).subscribe({
      next: (r) => { this.weekendTips = r.answer; this.isLoadingTips = false; },
      error: (err) => {
        this.weekendError = err?.type === 'timeout'
          ? 'Запрос занял слишком много времени. Попробуй ещё раз.'
          : 'Не удалось получить рекомендации. Попробуй позже.';
        this.isLoadingTips = false;
      }
    });
  }

  getTags(city: City): string[] {
    if (!city.tags) return [];
    return city.tags.toString().split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);
  }

  formatTips(text: string): string {
    if (!text) return '';
    let r = text;
    r = r.replace(/([.!?])([А-ЯЁA-Z])/g, '$1 $2');
    r = r.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    r = r.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    r = r.replace(/^[-•]\s+(.+)$/gm, '• $1');
    r = r.replace(/^(\d+)\.\s+(.+)$/gm, '$1. $2');
    r = r.replace(/\n{3,}/g, '\n\n');
    r = r.replace(/\n\n/g, '<br><br>');
    r = r.replace(/\n/g, '<br>');
    return r.trim();
  }

  isSaved(id: number): boolean { return this.savedIds.has(id); }

  isHeartAnimating(id: number): boolean { return this.heartAnimating.has(id); }

  toggleSave(event: Event, id: number) {
    event.stopPropagation();
    const wasSaved = this.isSaved(id);

    // Micro-interaction: heart bounce
    this.heartAnimating.add(id);
    setTimeout(() => this.heartAnimating.delete(id), 400);

    wasSaved ? this.savedIds.delete(id) : this.savedIds.add(id);
    this.cities = this.cities.map(c => c.id === id ? { ...c, isFavorite: !wasSaved } : c);

    const rollback = () => {
      wasSaved ? this.savedIds.add(id) : this.savedIds.delete(id);
      this.cities = this.cities.map(c => c.id === id ? { ...c, isFavorite: wasSaved } : c);
    };

    if (wasSaved) {
      this.cityService.removeFavorite(id).subscribe({ error: rollback });
    } else {
      this.cityService.addFavorite(id).subscribe({ error: rollback });
    }
  }

  openCity(id: number) { this.router.navigate(['/cities', id]); }

  openRoulette() { this.router.navigate(['/roulette']); }
}
