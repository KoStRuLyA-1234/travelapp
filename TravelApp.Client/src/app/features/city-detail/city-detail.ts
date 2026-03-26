import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CityService } from '../../core/services/city.service';
import { Guide } from '../../core/services/guide';
import { City } from '../../core/models/city.model';
declare const ymaps: any;

interface ChatMessage {
  text: string;
  isUser: boolean;
}

@Component({
  selector: 'app-city-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './city-detail.html',
  styleUrl: './city-detail.css'
})
export class CityDetail implements OnInit {

  city: City | null = null;
  isLoading = true;

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
    private guide: Guide
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.cityService.getCityById(id).subscribe({
      next: (data) => {
        this.city = data;
        this.isLoading = false;
        this.loadFunFact();
        setTimeout(() => this.initMap(), 1000);
      },
      error: (err) => {
        console.error('Ошибка:', err);
        this.isLoading = false;
      }
    });
  }

  loadFunFact() {
    if (!this.city) return;
    if (!navigator.onLine) return; // gracefully skip — no loading state shown
    this.isLoadingFact = true;
    this.guide.ask(
      this.city.name,
      `Назови один самый интересный и необычный факт о городе ${this.city.name}. Только сам факт, без вступлений, 2-3 предложения максимум.`
    ).subscribe({
      next: (r) => {
        this.funFact = r.answer;
        this.isLoadingFact = false;
      },
      error: () => {
        // Timeout or network error — just hide the loader, leave funFact empty
        this.isLoadingFact = false;
      }
    });
  }

  initMap() {
    const el = document.getElementById('city-map');
    if (!el || !this.city) return;

    el.style.width   = '100%';
    el.style.height  = '300px';
    el.style.display = 'block';

    ymaps.ready(() => {
      const map = new ymaps.Map('city-map', {
        center: [55.75, 37.62],
        zoom: 13,
        controls: ['zoomControl'],
        behaviors: ['drag', 'scrollZoom']
      });

      ymaps.geocode(this.city!.name + ', Россия', { results: 1 }).then((res: any) => {
        const geoObject = res.geoObjects.get(0);
        if (!geoObject) return;
        const coords = geoObject.geometry.getCoordinates();
        map.setCenter(coords, 13);
        const placemark = new ymaps.Placemark(coords, { balloonContent: this.city!.name });
        map.geoObjects.add(placemark);
      });
    });
  }

  goBack()      { this.router.navigate(['/']); }
  openPlanner() { this.router.navigate(['/planner', this.city?.id]); }

  getTags(): string[] {
    if (!this.city?.tags) return [];
    return this.city.tags.toString().split(',');
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
        text: 'Гид недоступен без интернета. Подключитесь к сети и попробуй снова.',
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

  closeChat() { this.showChat = false; }

  // Converts AI markdown response to safe, readable HTML
  formatMessage(text: string): string {
    if (!text) return '';

    let result = text;

    // Fix missing space after sentence-ending punctuation before a capital letter
    result = result.replace(/([.!?])([А-ЯЁA-Z])/g, '$1 $2');

    // Bold: **text**
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* (single asterisk, not touching double)
    result = result.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // Bullet list items: lines starting with "- " or "• "
    result = result.replace(/^[-•]\s+(.+)$/gm, '• $1');

    // Numbered list items: "1. " → keep the number, just clean the format
    result = result.replace(/^(\d+)\.\s+(.+)$/gm, '$1. $2');

    // Multiple blank lines → single blank line (before converting \n)
    result = result.replace(/\n{3,}/g, '\n\n');

    // Double newlines → paragraph break
    result = result.replace(/\n\n/g, '<br><br>');

    // Remaining single newlines → line break
    result = result.replace(/\n/g, '<br>');

    return result.trim();
  }

  getPhotoUrl(city: City): string {
    if (city.imageUrl && city.imageUrl.startsWith('http')) return city.imageUrl;
    return '';
  }
}
