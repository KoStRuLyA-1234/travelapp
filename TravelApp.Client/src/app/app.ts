import { Component, OnInit, NgZone } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { CommonModule } from '@angular/common';
import { Auth } from './core/services/auth';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BottomNavComponent, CommonModule],
  template: `
    @if (!isOnline) {
      <div class="offline-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
        Нет интернета — AI-гид и маршруты недоступны
      </div>
    }
    <div class="app-container" [class.has-banner]="!isOnline">
      <router-outlet />
      @if (showNav) {
        <app-bottom-nav />
      }
    </div>
  `,
  styles: [`
    .offline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      background: #1f2937;
      color: #e5e7eb;
      font-size: 13px;
      font-weight: 500;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
      text-align: center;
      letter-spacing: 0.01em;
    }

    .app-container {
      max-width: 480px;
      margin: 0 auto;
      min-height: 100vh;
      position: relative;
    }

    .app-container.has-banner {
      padding-top: 40px;
    }
  `]
})
export class App implements OnInit {

  showNav = true;
  isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor(
    private auth: Auth,
    private router: Router,
    private ngZone: NgZone
  ) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online',  () => this.ngZone.run(() => this.isOnline = true));
      window.addEventListener('offline', () => this.ngZone.run(() => this.isOnline = false));
    }
  }

  ngOnInit() {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth']);
    }

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.showNav = !e.url.includes('/auth') && !e.url.includes('/planner');
    });
  }
}
