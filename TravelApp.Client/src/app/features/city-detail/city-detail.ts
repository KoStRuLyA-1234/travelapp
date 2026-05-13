import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { Guide } from '../../core/services/guide';
import { Auth } from '../../core/services/auth';
import { City, Review } from '../../core/models/city.model';
import { TripDatePickerComponent } from '../../shared/components/trip-date-picker/trip-date-picker.component';

declare const ymaps: any;

interface ChatMessage {
  text: string;
  isUser: boolean;
}

@Component({
  selector: 'app-city-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, TripDatePickerComponent],
  templateUrl: './city-detail.html',
  styleUrl: './city-detail.css'
})
export class CityDetail implements OnInit {
  city: City | null = null;
  reviews: Review[] = [];
  isLoading = true;
  isSavingFavorite = false;
  reviewText = '';
  reviewRating = 5;
  reviewError = '';
  isSubmittingReview = false;
  selectedTripDate = '';
  minTripDate = this.todayIso();
  tripSeason = '';
  seasonRecommendation = '';

  funFact = '';
  isLoadingFact = false;

  showChat = false;
  messages: ChatMessage[] = [];
  userInput = '';
  isAsking = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cityService: CityService,
    private guide: Guide,
    public auth: Auth
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.cityService.getCityById(id).subscribe({
      next: (data) => {
        this.city = data;
        this.isLoading = false;
        this.loadReviews();
        this.loadFunFact();
        this.updateTripRecommendation();
        setTimeout(() => this.initMap(), 500);
      },
      error: (err) => {
        console.error('Ошибка загрузки города:', err);
        this.isLoading = false;
      }
    });
  }

  loadReviews() {
    if (!this.city) return;
    this.cityService.getReviews(this.city.id).subscribe({
      next: reviews => this.reviews = reviews
    });
  }

  submitReview() {
    if (!this.city || this.isSubmittingReview) return;
    if (!this.reviewText.trim()) {
      this.reviewError = 'Напиши пару слов о поездке.';
      return;
    }

    this.isSubmittingReview = true;
    this.reviewError = '';
    this.cityService.createReview(this.city.id, this.reviewRating, this.reviewText.trim()).subscribe({
      next: (review) => {
        this.reviews = [review, ...this.reviews];
        this.city = { ...this.city!, rating: this.averageRating(), reviewsCount: this.reviews.length };
        this.reviewText = '';
        this.reviewRating = 5;
        this.isSubmittingReview = false;
      },
      error: (err) => {
        this.reviewError = err.error?.message ?? 'Не удалось сохранить отзыв.';
        this.isSubmittingReview = false;
      }
    });
  }

  deleteReview(review: Review) {
    this.cityService.deleteReview(review.id).subscribe({
      next: () => {
        this.reviews = this.reviews.filter(r => r.id !== review.id);
        if (this.city) this.city = { ...this.city, rating: this.averageRating(), reviewsCount: this.reviews.length };
      }
    });
  }

  toggleFavorite() {
    if (!this.city || this.isSavingFavorite) return;

    const wasSaved = !!this.city.isFavorite;
    this.isSavingFavorite = true;
    this.city = { ...this.city, isFavorite: !wasSaved };

    const rollback = () => {
      if (this.city) this.city = { ...this.city, isFavorite: wasSaved };
      this.isSavingFavorite = false;
    };

    if (wasSaved) {
      this.cityService.removeFavorite(this.city.id).subscribe({
        next: () => this.isSavingFavorite = false,
        error: rollback
      });
    } else {
      this.cityService.addFavorite(this.city.id).subscribe({
        next: () => this.isSavingFavorite = false,
        error: rollback
      });
    }
  }

  loadFunFact() {
    if (!this.city || !navigator.onLine) return;
    this.isLoadingFact = true;
    this.guide.ask(
      this.city.name,
      `Назови один самый интересный и необычный факт о городе ${this.city.name}. Только сам факт, без вступлений, максимум 2-3 предложения.`
    ).subscribe({
      next: (r) => {
        this.funFact = r.answer;
        this.isLoadingFact = false;
      },
      error: () => this.isLoadingFact = false
    });
  }

  initMap() {
    const el = document.getElementById('city-map');
    if (!el || !this.city || typeof ymaps === 'undefined') return;

    el.style.width = '100%';
    el.style.height = '300px';
    el.style.display = 'block';

    ymaps.ready(() => {
      const center = this.city?.latitude && this.city?.longitude
        ? [this.city.latitude, this.city.longitude]
        : [55.75, 37.62];

      const map = new ymaps.Map('city-map', {
        center,
        zoom: 13,
        controls: ['zoomControl'],
        behaviors: ['drag', 'scrollZoom']
      });

      if (this.city?.latitude && this.city?.longitude) {
        map.geoObjects.add(new ymaps.Placemark(center, { balloonContent: this.city.name }));
        return;
      }

      ymaps.geocode(`${this.city!.name}, Россия`, { results: 1 }).then((res: any) => {
        const geoObject = res.geoObjects.get(0);
        if (!geoObject) return;
        const coords = geoObject.geometry.getCoordinates();
        map.setCenter(coords, 13);
        map.geoObjects.add(new ymaps.Placemark(coords, { balloonContent: this.city!.name }));
      });
    });
  }

  goBack() {
    this.router.navigate(['/']);
  }

  openPlanner() {
    this.router.navigate(['/planner', this.city?.id]);
  }

  getTags(): string[] {
    if (!this.city?.tags) return [];
    return this.city.tags.toString().split(',').map(tag => tag.trim()).filter(Boolean);
  }

  onTripDateChange() {
    this.updateTripRecommendation();
  }

  /**
   * TripDatePickerComponent emits a Date object — convert to ISO yyyy-MM-dd
   * (local, not UTC) so the existing updateTripRecommendation() keeps working.
   */
  onPickerDateChange(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    this.selectedTripDate = `${y}-${m}-${day}`;
    this.updateTripRecommendation();
  }

  /** Map Russian/free-text bestSeason to the picker's enum input. */
  get pickerBestSeason(): 'winter' | 'spring' | 'summer' | 'autumn' | null {
    const raw = (this.city?.bestSeason || '').toLowerCase();
    if (!raw) return null;
    if (/зим|декабр|январ|феврал/.test(raw))      return 'winter';
    if (/весн|март|апрел|май/.test(raw))           return 'spring';
    if (/лет|июн|июл|август/.test(raw))            return 'summer';
    if (/осен|сентябр|октябр|ноябр/.test(raw))     return 'autumn';
    return null;
  }

  openChat() {
    this.showChat = true;
    if (this.messages.length === 0) {
      this.messages.push({
        text: `Привет! Я твой гид по городу ${this.city?.name}. Что хочешь узнать?`,
        isUser: false
      });
    }
  }

  sendMessage() {
    if (!this.userInput.trim() || this.isAsking) return;

    if (!navigator.onLine) {
      this.messages.push({
        text: 'Гид недоступен без интернета. Подключись к сети и попробуй снова.',
        isUser: false
      });
      return;
    }

    const question = this.userInput.trim();
    this.userInput = '';
    this.messages.push({ text: question, isUser: true });
    this.isAsking = true;

    this.guide.ask(this.city?.name ?? '', question).subscribe({
      next: (response) => {
        this.messages.push({ text: response.answer, isUser: false });
        this.isAsking = false;
      },
      error: (err) => {
        const msg = err?.type === 'timeout'
          ? 'Запрос занял слишком много времени. Попробуй ещё раз.'
          : 'Гид временно недоступен. Попробуй позже.';
        this.messages.push({ text: msg, isUser: false });
        this.isAsking = false;
      }
    });
  }

  closeChat() {
    this.showChat = false;
  }

  formatMessage(text: string): string {
    if (!text) return '';

    let result = text;
    result = result.replace(/([.!?])([А-ЯЁA-Z])/g, '$1 $2');
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    result = result.replace(/^[-•]\s+(.+)$/gm, '• $1');
    result = result.replace(/^(\d+)\.\s+(.+)$/gm, '$1. $2');
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.replace(/\n\n/g, '<br><br>');
    result = result.replace(/\n/g, '<br>');
    return result.trim();
  }

  getPhotoUrl(city: City): string {
    if (city.imageUrl && city.imageUrl.startsWith('http')) return city.imageUrl;
    return '';
  }

  private updateTripRecommendation() {
    if (!this.city || !this.selectedTripDate) {
      this.tripSeason = '';
      this.seasonRecommendation = '';
      return;
    }

    const date = new Date(`${this.selectedTripDate}T12:00:00`);
    this.tripSeason = this.getSeason(date.getMonth());
    const bestSeason = (this.city.bestSeason || '').toLowerCase();
    const season = this.tripSeason.toLowerCase();
    const matches = bestSeason.includes('круглый')
      || bestSeason.includes(season)
      || (season === 'весна' && /апрел|май|март/.test(bestSeason))
      || (season === 'лето' && /июн|июл|август/.test(bestSeason))
      || (season === 'осень' && /сент|октябр|ноябр/.test(bestSeason))
      || (season === 'зима' && /декабр|январ|феврал/.test(bestSeason));

    const seasonalTips: Record<string, string> = {
      зима: 'Добавь теплые паузы в кафе и меньше длинных прогулок между точками.',
      весна: 'Хорошо подойдут прогулки по центру и короткие выезды к видовым местам.',
      лето: 'Планируй утренние экскурсии и оставь вечер для набережных или парков.',
      осень: 'Выбирай музеи, смотровые точки и маршруты без поздних длинных переездов.'
    };

    this.seasonRecommendation = matches
      ? `Дата попадает в удачный сезон для ${this.city.name}: ${this.city.bestSeason}. ${seasonalTips[season]}`
      : `На выбранную дату сезон - ${this.tripSeason}. Для города обычно лучше: ${this.city.bestSeason || 'теплые месяцы'}. ${seasonalTips[season]}`;
  }

  private getSeason(month: number): string {
    if (month === 11 || month <= 1) return 'зима';
    if (month >= 2 && month <= 4) return 'весна';
    if (month >= 5 && month <= 7) return 'лето';
    return 'осень';
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private averageRating(): number {
    if (!this.city) return 0;
    if (!this.reviews.length) return this.city.rating;
    const average = this.reviews.reduce((sum, review) => sum + review.rating, 0) / this.reviews.length;
    return Math.round(average * 10) / 10;
  }
}
