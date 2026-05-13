import { Component, OnInit, NgZone } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, NavigationStart } from '@angular/router';
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
        Нет интернета — AI‑гид и маршруты временно недоступны
      </div>
    }
    <div class="app-container" [class.has-banner]="!isOnline" [class.fade]="isNavigating">
      <router-outlet />
      @if (showNav) {
        <app-bottom-nav />
      }
    </div>
  `,
  styles: [`
    .offline-banner {
      position: fixed; top: 0; left: 0; right: 0;
      z-index: 9999;
      background: #1f2937;
      color: #e5e7eb;
      font-size: 13px;
      font-weight: 500;
      padding: 10px 16px;
      display: flex; align-items: center; gap: 8px;
      justify-content: center; text-align: center;
    }
    .app-container {
      max-width: 480px;
      margin: 0 auto;
      min-height: 100vh;
      position: relative;
      transition: opacity 0.18s ease, transform 0.18s ease;
      transform-origin: 50% 52%;
    }
    .app-container.has-banner { padding-top: 40px; }

    /* Lightweight CSS-only page transition (replaces broken @routeAnimations).
       The banner is a quick flash on navigation start that fades back in. */
    .app-container.fade { opacity: 0.84; transform: scale(0.992); }
  `]
})
export class App implements OnInit {
  showNav = true;
  isNavigating = false;
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
    const splashSeen = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('splashSeen')
      : '1';

    // Initial routing decision
    const currentUrl = this.router.url;
    if (!splashSeen && currentUrl !== '/splash') {
      this.router.navigateByUrl('/splash', { replaceUrl: true });
    } else if (splashSeen && !this.auth.isLoggedIn() && currentUrl !== '/auth') {
      this.router.navigateByUrl('/auth', { replaceUrl: true });
    }

    // Lightweight page transition flash
    this.router.events.subscribe(e => {
      if (e instanceof NavigationStart) {
        this.isNavigating = true;
      }
      if (e instanceof NavigationEnd) {
        // Reset on next frame so the CSS transition triggers
        requestAnimationFrame(() => { this.isNavigating = false; });
        const url = e.url;
        // Hide bottom-nav on full-bleed flow pages so the map / form fills the viewport.
        const fullBleed = ['/auth', '/splash', '/planner', '/routes/', '/admin'];
        this.showNav = !fullBleed.some(p => url.startsWith(p));
      }
    });
  }
}
