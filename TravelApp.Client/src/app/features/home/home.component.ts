import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { Guide } from '../../core/services/guide';
import { Auth } from '../../core/services/auth';
import { City } from '../../core/models/city.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {

  cities: City[] = [];
  isLoading = true;
  savedIds: number[] = [];
  user: any = null;
  weekendTips = '';
  weekendError = '';
  isLoadingTips = false;
  showWeekend = false;
  isDark = false;

  constructor(
    private cityService: CityService,
    private router: Router,
    private guide: Guide,
    private auth: Auth
  ) {}

  ngOnInit() {
    this.loadSaved();
    this.user = this.auth.getUser();
    this.isDark = localStorage.getItem('theme') !== 'light';
    document.body.classList.toggle('light-theme', !this.isDark);

    this.cityService.getCities().subscribe({
      next: (data) => {
        this.cities = data;
        this.isLoading = false;
        this.loadPhotos();
      },
      error: (err) => {
        console.error('Ошибка загрузки:', err);
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
    if (city.imageUrl && city.imageUrl.startsWith('http')) return city.imageUrl;
    return '';
  }

  toggleWeekend() {
    this.showWeekend = !this.showWeekend;
    if (this.showWeekend && !this.weekendTips && !this.weekendError && this.user?.homeCity) {
      this.loadWeekendTips();
    }
  }

  toggleTheme() {
    this.isDark = !this.isDark;
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
    document.body.classList.toggle('light-theme', !this.isDark);
  }

  loadWeekendTips() {
    if (!navigator.onLine) {
      this.weekendError = 'Рекомендации недоступны без интернета.';
      return;
    }
    this.isLoadingTips = true;
    this.weekendError  = '';
    this.guide.ask(
      this.user.homeCity,
      `Я живу в ${this.user.homeCity}. Предложи 3 места куда съездить на выходных. Для каждого — расстояние и одна причина. Кратко.`
    ).subscribe({
      next: (r) => {
        this.weekendTips   = r.answer;
        this.isLoadingTips = false;
      },
      error: (err) => {
        this.weekendError  = err?.type === 'timeout'
          ? 'Запрос занял слишком много времени. Попробуй ещё раз.'
          : 'Не удалось получить рекомендации. Попробуй позже.';
        this.isLoadingTips = false;
      }
    });
  }

  getTags(city: City): string[] {
    if (!city.tags) return [];
    return city.tags.toString().split(',').slice(0, 3);
  }

  // Converts AI markdown response to readable HTML (same logic as city-detail)
  formatTips(text: string): string {
    if (!text) return '';

    let result = text;

    // Fix missing space after sentence-ending punctuation before a capital letter
    result = result.replace(/([.!?])([А-ЯЁA-Z])/g, '$1 $2');

    // Bold: **text**
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic: *text*
    result = result.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // Bullet list items: "- " or "• "
    result = result.replace(/^[-•]\s+(.+)$/gm, '• $1');

    // Numbered list items: "1. "
    result = result.replace(/^(\d+)\.\s+(.+)$/gm, '$1. $2');

    // Normalize multiple blank lines
    result = result.replace(/\n{3,}/g, '\n\n');

    // Double newline → paragraph break
    result = result.replace(/\n\n/g, '<br><br>');

    // Single newline → line break
    result = result.replace(/\n/g, '<br>');

    return result.trim();
  }

  loadSaved() {
    const saved = localStorage.getItem('savedCities');
    this.savedIds = saved ? JSON.parse(saved) : [];
  }

  isSaved(id: number): boolean {
    return this.savedIds.includes(id);
  }

  toggleSave(event: Event, id: number) {
    event.stopPropagation();
    if (this.isSaved(id)) {
      this.savedIds = this.savedIds.filter(s => s !== id);
    } else {
      this.savedIds.push(id);
    }
    localStorage.setItem('savedCities', JSON.stringify(this.savedIds));
  }

  openCity(id: number) { this.router.navigate(['/cities', id]); }
}
