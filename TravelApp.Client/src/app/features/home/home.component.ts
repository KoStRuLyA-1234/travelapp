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
          next: (r) => {
            if (r.url) city.imageUrl = r.url;
          }
        });
      }
    });
  }

  getPhotoUrl(city: City): string {
    if (city.imageUrl && city.imageUrl.startsWith('http')) {
      return city.imageUrl;
    }
    return '';
  }

  toggleWeekend() {
    this.showWeekend = !this.showWeekend;
    if (this.showWeekend && !this.weekendTips && this.user?.homeCity) {
      this.loadWeekendTips();
    }
  }

  toggleTheme() {
    this.isDark = !this.isDark;
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
    document.body.classList.toggle('light-theme', !this.isDark);
  }

  loadWeekendTips() {
    this.isLoadingTips = true;
    this.guide.ask(
      this.user.homeCity,
      `Я живу в ${this.user.homeCity}. Предложи 3 места куда съездить на выходных. Для каждого — расстояние и одна причина. Кратко.`
    ).subscribe({
      next: (r) => { this.weekendTips = r.answer; this.isLoadingTips = false; },
      error: () => { this.isLoadingTips = false; }
    });
  }

  getTags(city: City): string[] {
    if (!city.tags) return [];
    return city.tags.toString().split(',').slice(0, 3);
  }

  formatTips(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
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

  openCity(id: number) {
  this.router.navigate(['/cities', id]);
  }
}